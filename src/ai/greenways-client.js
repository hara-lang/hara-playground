export const GREENWAYS_AI_PROTOCOL = "greenways-playground-ai/1";
export const GREENWAYS_AI_ORIGIN = "https://play.hara-lang.org";
export const GREENWAYS_PAGE_SOURCE = "hara-play";
export const GREENWAYS_OS_SOURCE = "greenways-os";
export const GREENWAYS_REQUEST_DIRECTION = "request";
export const GREENWAYS_RESPONSE_DIRECTION = "response";

const OPERATIONS = new Set(["status", "open", "generate", "cancel"]);
const DEFAULT_TIMEOUT_MS = 5000;
const GENERATION_TIMEOUT_MS = 125000;

function bridgeError(message, code = "GREENWAYS_AI_FAILURE", options) {
  const error = new Error(message, options);
  error.name = "GreenwaysAiBridgeError";
  error.code = code;
  return error;
}

function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw bridgeError(`${label} must be an object`, "INVALID_REQUEST");
  }
  return value;
}

function requestId(random = globalThis.crypto) {
  if (typeof random?.randomUUID === "function") {
    return `playground/${random.randomUUID().replaceAll("-", "")}`;
  }
  if (!random?.getRandomValues) throw bridgeError("Secure randomness is unavailable", "BRIDGE_UNAVAILABLE");
  const bytes = random.getRandomValues(new Uint8Array(16));
  return `playground/${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export class GreenwaysAiClient {
  constructor({
    windowRef = globalThis,
    origin = windowRef.location?.origin,
    random = windowRef.crypto ?? globalThis.crypto,
    setTimeoutImpl = windowRef.setTimeout?.bind(windowRef) ?? globalThis.setTimeout,
    clearTimeoutImpl = windowRef.clearTimeout?.bind(windowRef) ?? globalThis.clearTimeout,
  } = {}) {
    if (!windowRef || typeof windowRef.addEventListener !== "function" || typeof windowRef.postMessage !== "function") {
      throw new TypeError("Greenways AI client requires a browser window");
    }
    if (typeof origin !== "string" || !origin) throw new TypeError("Greenways AI client requires an origin");
    if (typeof setTimeoutImpl !== "function" || typeof clearTimeoutImpl !== "function") {
      throw new TypeError("Greenways AI client requires timeout functions");
    }
    this.windowRef = windowRef;
    this.origin = origin;
    this.random = random;
    this.setTimeoutImpl = setTimeoutImpl;
    this.clearTimeoutImpl = clearTimeoutImpl;
    this.pending = new Map();
    this.handleMessage = this.handleMessage.bind(this);
    this.windowRef.addEventListener("message", this.handleMessage);
  }

  get supportedOrigin() {
    return this.origin === GREENWAYS_AI_ORIGIN;
  }

  destroy() {
    this.windowRef.removeEventListener?.("message", this.handleMessage);
    for (const pending of this.pending.values()) {
      this.clearTimeoutImpl(pending.timer);
      pending.reject(bridgeError("Greenways AI client was closed", "BRIDGE_CLOSED"));
    }
    this.pending.clear();
  }

  handleMessage(event) {
    if (event?.source !== this.windowRef || event?.origin !== this.origin) return;
    const response = event.data;
    if (!response
        || typeof response !== "object"
        || Array.isArray(response)
        || response.source !== GREENWAYS_OS_SOURCE
        || response.direction !== GREENWAYS_RESPONSE_DIRECTION
        || response.protocol !== GREENWAYS_AI_PROTOCOL
        || typeof response.requestId !== "string") {
      return;
    }
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    this.pending.delete(response.requestId);
    this.clearTimeoutImpl(pending.timer);
    if (response.ok === false) {
      pending.reject(bridgeError(
        typeof response.error === "string" ? response.error : "Greenways OS rejected the request",
        typeof response.code === "string" ? response.code : "GREENWAYS_AI_FAILURE",
      ));
      return;
    }
    pending.resolve(response);
  }

  requestWithId(operation, payload = {}, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (!this.supportedOrigin) {
      const error = bridgeError(
        "Greenways OS AI is available on https://play.hara-lang.org",
        "BRIDGE_UNAVAILABLE",
      );
      return { requestId: null, promise: Promise.reject(error) };
    }
    if (!OPERATIONS.has(operation)) {
      const error = bridgeError(`Unsupported Greenways AI operation: ${operation}`, "INVALID_REQUEST");
      return { requestId: null, promise: Promise.reject(error) };
    }
    plainObject(payload, "Greenways AI payload");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 130000) {
      const error = bridgeError("Greenways AI timeout is invalid", "INVALID_REQUEST");
      return { requestId: null, promise: Promise.reject(error) };
    }

    const id = requestId(this.random);
    const message = Object.freeze({
      source: GREENWAYS_PAGE_SOURCE,
      direction: GREENWAYS_REQUEST_DIRECTION,
      protocol: GREENWAYS_AI_PROTOCOL,
      requestId: id,
      operation,
      payload,
    });
    const promise = new Promise((resolve, reject) => {
      const timer = this.setTimeoutImpl(() => {
        this.pending.delete(id);
        reject(bridgeError(
          operation === "status"
            ? "Greenways OS was not detected on this page"
            : `Greenways OS did not answer the ${operation} request`,
          "BRIDGE_TIMEOUT",
        ));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, operation });
      try {
        this.windowRef.postMessage(message, this.origin);
      } catch (error) {
        this.pending.delete(id);
        this.clearTimeoutImpl(timer);
        reject(bridgeError("The Greenways OS bridge could not be reached", "BRIDGE_UNAVAILABLE", { cause: error }));
      }
    });
    return Object.freeze({ requestId: id, promise });
  }

  request(operation, payload = {}, options) {
    return this.requestWithId(operation, payload, options).promise;
  }

  status(options = {}) {
    return this.request("status", {}, { timeoutMs: options.timeoutMs ?? 1600 });
  }

  open() {
    return this.request("open", {}, { timeoutMs: 5000 });
  }

  generate(payload) {
    return this.requestWithId("generate", payload, { timeoutMs: GENERATION_TIMEOUT_MS });
  }

  cancel(targetRequestId) {
    return this.request("cancel", { requestId: targetRequestId }, { timeoutMs: 5000 });
  }
}
