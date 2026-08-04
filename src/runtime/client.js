const DEFAULT_HOST_CALL_TIMEOUT = 15_000;

export class RuntimeClient extends EventTarget {
  constructor(
    workerUrl = new URL("./worker.js", import.meta.url),
    { workerFactory = null, hostCallTimeout = DEFAULT_HOST_CALL_TIMEOUT } = {}
  ) {
    super();
    const createWorker = workerFactory || ((url, options) => new Worker(url, options));
    this.worker = createWorker(workerUrl, { type: "module", name: "hara-runtime" });
    this.pending = new Map();
    this.hostHandlers = new Map();
    this.activeHostCalls = new Map();
    this.bootContextProvider = null;
    this.bootContext = null;
    this.sequence = 0;
    this.hostGeneration = 0;
    this.hostCallTimeout = normalizeTimeout(hostCallTimeout);
    this.disposed = false;
    this.worker.addEventListener("message", (event) => this.handleMessage(event.data));
    this.worker.addEventListener("error", (event) => {
      const error = event.error instanceof Error
        ? event.error
        : new Error(event.message || "Runtime worker failed");
      this.abortBootContext(abortError("runtime/boot-context-cancelled:worker-error"));
      this.cancelHostCalls(abortError("host/call-cancelled:worker-error"), { notify: false });
      this.rejectPending(error);
      this.dispatchEvent(new CustomEvent("runtime-error", { detail: error }));
    });
  }

  handleMessage(message) {
    if (this.disposed || !message) return;
    if (message.type === "host-call") {
      void this.handleHostCall(message);
      return;
    }
    if (message.type === "stdout" || message.type === "effect" || message.type === "diagnostic") {
      this.dispatchEvent(new CustomEvent(message.type, { detail: message }));
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.type === "exception") {
      pending.reject(Object.assign(new Error(message.error.message), message.error));
    } else {
      pending.resolve(message);
    }
  }

  async handleHostCall(message) {
    const id = String(message.id || "");
    const operation = String(message.operation || "");
    if (!id || this.activeHostCalls.has(id)) {
      this.postHostException(id, new Error(`host/call-id-invalid:${id || "missing"}`));
      return;
    }

    const handler = this.hostHandlers.get(operation);
    if (!handler) {
      this.postHostException(id, new Error(`host/operation-unavailable:${operation}`));
      return;
    }

    const controller = new AbortController();
    const generation = this.hostGeneration;
    const call = {
      id,
      operation,
      generation,
      controller,
      timer: null,
      finish: null
    };
    call.finish = (response = null) => {
      if (this.activeHostCalls.get(id) !== call) return false;
      this.activeHostCalls.delete(id);
      if (call.timer) clearTimeout(call.timer);
      call.timer = null;
      if (response && !this.disposed) this.worker.postMessage(response);
      return true;
    };
    this.activeHostCalls.set(id, call);

    if (this.hostCallTimeout > 0) {
      call.timer = setTimeout(() => {
        const error = timeoutError(`host/call-timeout:${operation}`);
        controller.abort(error);
        call.finish(hostException(id, error));
      }, this.hostCallTimeout);
    }

    const context = Object.freeze({
      signal: controller.signal,
      generation,
      requestId: message.requestId || null,
      hostCallId: id,
      operation
    });

    try {
      const value = await handler(...(Array.isArray(message.args) ? message.args : []), context);
      if (controller.signal.aborted || generation !== this.hostGeneration) {
        const error = controller.signal.reason instanceof Error
          ? controller.signal.reason
          : abortError(`host/call-cancelled:${operation}`);
        call.finish(hostException(id, error));
        return;
      }
      call.finish({ type: "host-result", id, value });
    } catch (error) {
      const failure = controller.signal.aborted && controller.signal.reason instanceof Error
        ? controller.signal.reason
        : normalizeError(error);
      call.finish(hostException(id, failure));
    }
  }

  registerHost(operation, handler) {
    if (typeof operation !== "string" || typeof handler !== "function") {
      throw new TypeError("registerHost requires an operation and handler");
    }
    if (this.disposed) throw new Error("Runtime disposed");
    this.hostHandlers.set(operation, handler);
    return () => {
      if (this.hostHandlers.get(operation) === handler) this.hostHandlers.delete(operation);
    };
  }

  setBootContextProvider(provider) {
    if (provider != null && typeof provider !== "function") {
      throw new TypeError("boot context provider must be a function");
    }
    this.bootContextProvider = provider;
  }

  request(type, payload = {}) {
    if (this.disposed) return Promise.reject(new Error("Runtime disposed"));
    const id = `request-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type, id, ...payload });
    });
  }

  async boot(files, namespace = "user") {
    const generation = this.advanceHostGeneration("host/call-cancelled:boot");
    const controller = new AbortController();
    const bootContext = { generation, controller };
    this.bootContext = bootContext;
    try {
      const context = await this.bootContextProvider?.({
        files,
        namespace,
        generation,
        signal: controller.signal
      }) || {};
      if (controller.signal.aborted || generation !== this.hostGeneration) {
        throw controller.signal.reason instanceof Error
          ? controller.signal.reason
          : abortError("runtime/boot-context-cancelled:boot-superseded");
      }
      return this.request("boot", { files, namespace, ...context });
    } finally {
      if (this.bootContext === bootContext) this.bootContext = null;
    }
  }

  eval(source, namespace) {
    return this.request("eval", { source, namespace });
  }

  loadFile(path, source, namespace) {
    return this.request("load-file", { path, source, namespace });
  }

  complete(prefix, namespace, source = "") {
    return this.request("complete", { prefix, namespace, source });
  }

  inspect(valueId) {
    return this.request("inspect", { valueId });
  }

  reset() {
    this.advanceHostGeneration("host/call-cancelled:reset");
    return this.request("reset");
  }

  advanceHostGeneration(reason) {
    this.hostGeneration += 1;
    const error = abortError(reason);
    this.abortBootContext(error);
    this.cancelHostCalls(error);
    return this.hostGeneration;
  }

  abortBootContext(error) {
    const context = this.bootContext;
    if (!context || context.controller.signal.aborted) return;
    context.controller.abort(error);
    this.bootContext = null;
  }

  cancelHostCalls(error, { notify = true } = {}) {
    for (const call of [...this.activeHostCalls.values()]) {
      if (!call.controller.signal.aborted) call.controller.abort(error);
      call.finish(notify ? hostException(call.id, error) : null);
    }
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  postHostException(id, error) {
    if (this.disposed) return;
    this.worker.postMessage(hostException(id, error));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.hostGeneration += 1;
    const error = abortError("host/call-cancelled:dispose");
    this.abortBootContext(error);
    this.cancelHostCalls(error, { notify: false });
    this.worker.terminate();
    this.rejectPending(new Error("Runtime disposed"));
    this.hostHandlers.clear();
  }
}

function hostException(id, error) {
  const failure = normalizeError(error);
  return {
    type: "host-exception",
    id,
    error: {
      name: failure.name || "Error",
      message: failure.message || String(failure),
      data: failure.data || null,
      stack: failure.stack || null
    }
  };
}

function normalizeError(error) {
  return error instanceof Error ? error : new Error(String(error));
}

function abortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function timeoutError(message) {
  const error = new Error(message);
  error.name = "TimeoutError";
  return error;
}

function normalizeTimeout(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : DEFAULT_HOST_CALL_TIMEOUT;
}
