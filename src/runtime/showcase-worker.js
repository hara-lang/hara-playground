const nativePostMessage = globalThis.postMessage.bind(globalThis);
const nativeWorker = globalThis.Worker;
const nativeSharedWorker = globalThis.SharedWorker;

function describeUrl(value) {
  try {
    const url = new URL(String(value), globalThis.location.href);
    return `${url.pathname}${url.search}`;
  } catch {
    return String(value).slice(0, 200);
  }
}

function messageType(value) {
  if (!value || typeof value !== "object") return typeof value;
  const type = typeof value.type === "string" ? value.type : "object";
  const id = value.id == null ? "" : `:${String(value.id).slice(0, 80)}`;
  return `${type}${id}`;
}

function diagnostic(phase, detail = "") {
  nativePostMessage({
    type: "diagnostic",
    id: null,
    text: `showcase-runtime/${phase}${detail ? ` ${detail}` : ""}`,
  });
}

diagnostic(
  "outer-start",
  `worker=${typeof nativeWorker} shared-worker=${typeof nativeSharedWorker} isolated=${globalThis.crossOriginIsolated}`,
);

globalThis.addEventListener("message", (event) => {
  diagnostic("outer-request", messageType(event.data));
});

if (typeof nativeWorker === "function") {
  globalThis.Worker = function DiagnosticWorker(url, options) {
    diagnostic("kernel-create", describeUrl(url));
    const worker = new nativeWorker(url, options);
    worker.addEventListener("message", (event) => {
      diagnostic("kernel-message", messageType(event.data));
    });
    worker.addEventListener("error", (event) => {
      diagnostic("kernel-error", event.message || "unknown");
    });
    worker.addEventListener("messageerror", () => {
      diagnostic("kernel-message-error");
    });
    return worker;
  };
  globalThis.Worker.prototype = nativeWorker.prototype;
}

if (typeof nativeSharedWorker === "function") {
  globalThis.SharedWorker = function DiagnosticSharedWorker(url, options) {
    diagnostic("shared-kernel-create", describeUrl(url));
    const worker = new nativeSharedWorker(url, options);
    worker.port.addEventListener("message", (event) => {
      diagnostic("shared-kernel-message", messageType(event.data));
    });
    worker.port.addEventListener("messageerror", () => {
      diagnostic("shared-kernel-message-error");
    });
    return worker;
  };
  globalThis.SharedWorker.prototype = nativeSharedWorker.prototype;
}

try {
  await import("./worker.js");
  diagnostic("outer-ready");
} catch (error) {
  diagnostic("outer-error", error?.message || String(error));
  throw error;
}
