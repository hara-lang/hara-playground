export class RuntimeClient extends EventTarget {
  constructor(workerUrl = new URL("./worker.js", import.meta.url)) {
    super();
    this.worker = new Worker(workerUrl, { type: "module", name: "hara-runtime" });
    this.pending = new Map();
    this.sequence = 0;
    this.worker.addEventListener("message", (event) => this.handleMessage(event.data));
    this.worker.addEventListener("error", (event) => {
      this.dispatchEvent(new CustomEvent("runtime-error", { detail: event.error || event.message }));
    });
  }

  handleMessage(message) {
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

  request(type, payload = {}) {
    const id = `request-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type, id, ...payload });
    });
  }

  boot(files, namespace = "user") {
    return this.request("boot", { files, namespace });
  }

  eval(source, namespace) {
    return this.request("eval", { source, namespace });
  }

  loadFile(path, source, namespace) {
    return this.request("load-file", { path, source, namespace });
  }

  reset() {
    return this.request("reset");
  }

  dispose() {
    this.worker.terminate();
    for (const pending of this.pending.values()) pending.reject(new Error("Runtime disposed"));
    this.pending.clear();
  }
}
