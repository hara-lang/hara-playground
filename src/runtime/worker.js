import { formatValue } from "./evaluator.js";
import { createRuntimeHost } from "./host.js";
import { isHaraSource } from "../workspace/project.js";
import { isHtaTree, toPlainHta } from "./hta-value.js";

let activeRequestId = null;
let values = new Map();
let valueSequence = 0;

const host = await createRuntimeHost({
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

async function handle(request) {
  activeRequestId = request.id || null;
  switch (request.type) {
    case "boot": {
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
      return { type: "ready", id: request.id, namespace: runtime.currentNamespace, runtimeKind: host.kind };
    }
    case "eval": {
      const result = await runtime.evaluateSource(request.source, request.namespace || runtime.currentNamespace);
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
      const result = await runtime.evaluateSource(request.source, request.namespace || runtime.currentNamespace);
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
        ? await runtime.complete(request.prefix || "", request.namespace || runtime.currentNamespace, request.source || "")
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
    case "reset":
      await runtime.reset();
      values = new Map();
      return { type: "ready", id: request.id, namespace: runtime.currentNamespace, runtimeKind: host.kind };
    default:
      throw new Error(`Unknown runtime request: ${request.type}`);
  }
}

self.addEventListener("message", async (event) => {
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
