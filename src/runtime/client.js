export class RuntimeClient extends EventTarget {
  constructor(workerUrl = new URL("./worker.js", import.meta.url)) {
    super();
    this.worker = new Worker(workerUrl, { type: "module", name: "hara-runtime" });
    this.pending = new Map();
    this.hostHandlers = new Map();
    this.bootContextProvider = null;
    this.sequence = 0;
    this.worker.addEventListener("message", (event) => this.handleMessage(event.data));
    this.worker.addEventListener("error", (event) => {
      this.dispatchEvent(new CustomEvent("runtime-error", { detail: event.error || event.message }));
    });
  }

  handleMessage(message) {
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
    if (message.type === "exception") pending.reject(Object.assign(new Error(message.error.message), message.error));
    else pending.resolve(message);
  }

  async handleHostCall(message) {
    const handler = this.hostHandlers.get(message.operation);
    if (!handler) {
      this.worker.postMessage({
        type: "host-exception",
        id: message.id,
        error: { name: "Error", message: `host/operation-unavailable:${message.operation}` }
      });
      return;
    }
    try {
      const value = await handler(...(message.args || []));
      this.worker.postMessage({ type: "host-result", id: message.id, value });
    } catch (error) {
      this.worker.postMessage({
        type: "host-exception",
        id: message.id,
        error: {
          name: error?.name || "Error",
          message: error?.message || String(error),
          data: error?.data || null,
          stack: error?.stack || null
        }
      });
    }
  }

  registerHost(operation, handler) {
    if (typeof operation !== "string" || typeof handler !== "function") {
      throw new TypeError("registerHost requires an operation and handler");
    }
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
    const id = `request-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type, id, ...payload });
    });
  }

  async boot(files, namespace = "user") {
    const context = await this.bootContextProvider?.({ files, namespace }) || {};
    return this.request("boot", { files, namespace, ...context });
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
    return this.request("reset");
  }

  dispose() {
    this.worker.terminate();
    for (const pending of this.pending.values()) pending.reject(new Error("Runtime disposed"));
    this.pending.clear();
    this.hostHandlers.clear();
  }
}
