import { formatValue } from "./evaluator.js";
import { createRuntimeHost } from "./host.js";
import { isHaraSource } from "../workspace/project.js";
import { isHtaTree, toPlainHta } from "./hta-value.js";
import { createActiveLoopController } from "./active-loop.js";

const AVAILABLE_CAPABILITIES = new Set(["studio/eval", "audio/playback", "model/generate"]);

let activeRequestId = null;
let values = new Map();
let valueSequence = 0;
let hostSequence = 0;
let grantedCapabilities = new Set(["studio/eval"]);
let runtimeQueue = Promise.resolve();
const pendingHostCalls = new Map();

function callPageHost(operation, args) {
  const id = `host-${++hostSequence}`;
  return new Promise((resolve, reject) => {
    pendingHostCalls.set(id, { resolve, reject });
    postMessage({ type: "host-call", id, requestId: activeRequestId, operation, args });
  });
}

const supersonic = {
  start: (graph) => callPageHost("gw.audio.supersonic/start", [graph]),
  update: (graphId, nodeId, parameter, value) =>
    callPageHost("gw.audio.supersonic/update", [graphId, nodeId, parameter, value]),
  status: (graphId) => callPageHost("gw.audio.supersonic/status", [graphId]),
  stop: (graphId) => callPageHost("gw.audio.supersonic/stop", [graphId])
};

const ai = {
  status: () => callPageHost("gw.ai/status", []),
  generate: (request) => callPageHost("gw.ai/generate", [request])
};

const host = await createRuntimeHost({
  capabilities: [...AVAILABLE_CAPABILITIES],
  grantedCapabilities: ["studio/eval"],
  grantsForSession: () => [...grantedCapabilities],
  supersonic,
  ai,
  onStdout(text) {
    postMessage({ type: "stdout", id: activeRequestId, text });
  },
  onEffect(effect) {
    postMessage({ type: "effect", id: activeRequestId, effect });
  },
  onDiagnostic(text) {
    postMessage({ type: "diagnostic", id: activeRequestId, text });
  }
});
const runtime = host.runtime;
const startupDiagnostics = Array.isArray(host.startupDiagnostics)
  ? host.startupDiagnostics
  : [];

function enqueueRuntime(operation) {
  const result = runtimeQueue.then(operation, operation);
  runtimeQueue = result.catch(() => {});
  return result;
}

const activeLoop = createActiveLoopController({
  evaluate(source, namespace) {
    return enqueueRuntime(() => runtime.evaluateSource(source, namespace));
  },
  publish(effect) {
    postMessage({ type: "effect", id: null, effect });
  }
});

function maybeEmitPreview(value) {
  if (!isHtaTree(value)) return false;
  postMessage({ type: "effect", id: activeRequestId, effect: { type: "render", tree: toPlainHta(value) } });
  return true;
}

function retain(value) {
  const valueId = `value-${++valueSequence}`;
  values.set(valueId, value);
  if (values.size > 200) values.delete(values.keys().next().value);
  return valueId;
}

function installGrants(capabilities = []) {
  const requested = new Set(
    (Array.isArray(capabilities) ? capabilities : [])
      .map((capability) => String(capability?.name ?? capability).replace(/^:/, ""))
  );
  requested.add("studio/eval");
  grantedCapabilities = new Set(
    [...requested].filter((capability) => AVAILABLE_CAPABILITIES.has(capability))
  );
}

function replayStartupDiagnostics() {
  for (const text of startupDiagnostics) {
    postMessage({ type: "diagnostic", id: activeRequestId, text });
  }
}

async function handle(request) {
  activeRequestId = request.id || null;
  switch (request.type) {
    case "boot": {
      activeLoop.reset();
      installGrants(request.capabilities);
      replayStartupDiagnostics();
      if (grantedCapabilities.has("audio/playback") && host.kind !== "canonical-wasm") {
        const reason = startupDiagnostics[0] || "The canonical Hara runtime is unavailable";
        throw new Error(`audio/playback requires canonical-wasm. ${reason}`);
      }
      if (grantedCapabilities.has("model/generate") && host.kind !== "canonical-wasm") {
        const reason = startupDiagnostics[0] || "The canonical Hara runtime is unavailable";
        throw new Error(`model/generate requires canonical-wasm. ${reason}`);
      }
      await enqueueRuntime(async () => {
        await runtime.reset();
        for (const file of request.files || []) {
          if (isHaraSource(file.path)) {
            const value = await runtime.evaluateSource(file.content, request.namespace || "user");
            maybeEmitPreview(value);
          }
        }
        if (request.namespace) {
          if (typeof runtime.setNamespace === "function") runtime.setNamespace(request.namespace);
          else await runtime.evaluateSource(`(ns ${request.namespace})`, request.namespace);
        }
      });
      return {
        type: "ready",
        id: request.id,
        namespace: runtime.currentNamespace,
        runtimeKind: host.kind,
        capabilities: [...grantedCapabilities]
      };
    }
    case "eval": {
      const result = await enqueueRuntime(() =>
        runtime.evaluateSource(request.source, request.namespace || runtime.currentNamespace));
      maybeEmitPreview(result);
      return {
        type: "result",
        id: request.id,
        valueId: retain(result),
        display: formatValue(result),
        namespace: runtime.currentNamespace
      };
    }
    case "load-file": {
      const result = await enqueueRuntime(() =>
        runtime.evaluateSource(request.source, request.namespace || runtime.currentNamespace));
      maybeEmitPreview(result);
      return {
        type: "file-loaded",
        id: request.id,
        path: request.path,
        valueId: retain(result),
        display: formatValue(result),
        namespace: runtime.currentNamespace
      };
    }
    case "complete": {
      const items = typeof runtime.complete === "function"
        ? await enqueueRuntime(() => runtime.complete(
          request.prefix || "",
          request.namespace || runtime.currentNamespace,
          request.source || ""
        ))
        : [];
      return {
        type: "completions",
        id: request.id,
        prefix: request.prefix || "",
        namespace: runtime.currentNamespace,
        items: Array.isArray(items) ? items : []
      };
    }
    case "inspect": {
      const value = values.get(request.valueId);
      return { type: "inspection", id: request.id, valueId: request.valueId, display: formatValue(value), value };
    }
    case "active-create": {
      const state = activeLoop.create(request);
      return { type: "active-loop-state", id: request.id, activeLoop: state };
    }
    case "active-install": {
      const state = await activeLoop.install(request);
      return { type: "active-loop-state", id: request.id, activeLoop: state };
    }
    case "active-command": {
      const { loopId, command, ...options } = request;
      const state = activeLoop.command(loopId, command, options);
      return { type: "active-loop-state", id: request.id, activeLoop: state };
    }
    case "active-status":
      return { type: "active-loop-state", id: request.id, activeLoop: activeLoop.inspect() };
    case "reset":
      activeLoop.reset();
      await enqueueRuntime(() => runtime.reset());
      values = new Map();
      return {
        type: "ready",
        id: request.id,
        namespace: runtime.currentNamespace,
        runtimeKind: host.kind,
        capabilities: [...grantedCapabilities]
      };
    default:
      throw new Error(`Unknown runtime request: ${request.type}`);
  }
}

function handleHostResponse(message) {
  const pending = pendingHostCalls.get(message.id);
  if (!pending) return false;
  pendingHostCalls.delete(message.id);
  if (message.type === "host-exception") {
    pending.reject(Object.assign(new Error(message.error?.message || "Host call failed"), message.error));
  } else {
    pending.resolve(message.value);
  }
  return true;
}

self.addEventListener("message", async (event) => {
  if (event.data?.type === "host-result" || event.data?.type === "host-exception") {
    handleHostResponse(event.data);
    return;
  }
  try {
    const response = await handle(event.data);
    postMessage(response);
  } catch (error) {
    postMessage({
      type: "exception",
      id: event.data?.id || null,
      error: {
        name: error?.name || "Error",
        message: error?.message || String(error),
        data: error?.data || null,
        stack: error?.stack || null
      }
    });
  } finally {
    activeRequestId = null;
  }
});
