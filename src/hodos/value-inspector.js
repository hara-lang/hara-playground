import { createHodosComponentRegistry } from "@greenways/hodos-web";
import { createWorkspaceAreaHost } from "@greenways/hodos-workspace-ui";
import { createValueInspectorArea } from "@greenways/hodos-dev";
import { registerHodosValueInspectorUi } from "@greenways/hodos-dev-ui";
import { formatInspectableValue } from "./value-projector.js";

const registry = createHodosComponentRegistry();
registerHodosValueInspectorUi(registry, {
  createValueInspectorHost: createPlaygroundValueInspectorHost,
});

let areaHost = null;

function send(dispatch, event) {
  void Promise.resolve(dispatch(event)).catch((error) => {
    console.error("[hara playground hodos value inspector]", error);
  });
}

function expandable(value) {
  return value != null && typeof value === "object" && Object.keys(value).length > 0;
}

function summary(value) {
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (value != null && typeof value === "object") return `{${Object.keys(value).length}}`;
  return formatInspectableValue(value);
}

function treeNode(document, value, label, path, expanded, dispatch, signal) {
  const node = document.createElement("div");
  node.className = "value-tree-node";
  const row = document.createElement("div");
  row.className = "value-tree-row";

  const canExpand = expandable(value);
  const key = JSON.stringify(path);
  const isExpanded = expanded.has(key);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "value-tree-toggle";
  toggle.textContent = canExpand ? (isExpanded ? "▾" : "▸") : "·";
  toggle.disabled = !canExpand;
  toggle.setAttribute("aria-expanded", String(canExpand && isExpanded));
  if (canExpand) {
    toggle.addEventListener("click", () => send(dispatch, {
      "event/type": "value/toggle",
      path,
    }), { signal });
  }

  const select = document.createElement("button");
  select.type = "button";
  select.className = "value-tree-select";
  const name = document.createElement("span");
  name.className = "value-tree-key";
  name.textContent = label;
  const preview = document.createElement("code");
  preview.className = "value-tree-preview";
  preview.textContent = summary(value);
  select.append(name, preview);
  select.addEventListener("click", () => send(dispatch, {
    "event/type": "value/select",
    path,
  }), { signal });
  row.append(toggle, select);
  node.append(row);

  if (canExpand && isExpanded) {
    const children = document.createElement("div");
    children.className = "value-tree-children";
    const entries = Array.isArray(value)
      ? value.map((entry, index) => [index, entry])
      : Object.entries(value);
    for (const [childLabel, child] of entries) {
      children.append(treeNode(
        document,
        child,
        String(childLabel),
        [...path, childLabel],
        expanded,
        dispatch,
        signal,
      ));
    }
    node.append(children);
  }
  return node;
}

export function createPlaygroundValueInspectorHost({ container, dispatch }) {
  if (!container) throw new Error("Hodos Value Inspector requires a container");
  const document = container.ownerDocument || globalThis.document;
  const abort = new AbortController();
  const signal = abort.signal;
  let model = null;

  const shell = document.createElement("div");
  shell.className = "value-inspector-shell";
  const toolbar = document.createElement("header");
  toolbar.className = "value-inspector-toolbar";
  const identity = document.createElement("div");
  identity.className = "value-inspector-identity";
  const type = document.createElement("strong");
  const id = document.createElement("code");
  identity.append(type, id);
  const actions = document.createElement("div");
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "text-button";
  refresh.textContent = "Refresh";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "text-button";
  copy.textContent = "Copy";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "text-button";
  close.textContent = "Close";
  actions.append(refresh, copy, close);
  toolbar.append(identity, actions);

  const display = document.createElement("pre");
  display.className = "value-inspector-display";
  const body = document.createElement("div");
  body.className = "value-inspector-body";
  shell.append(toolbar, display, body);
  container.replaceChildren(shell);

  refresh.addEventListener("click", () => send(dispatch, {
    "event/type": "value/refresh",
  }), { signal });
  close.addEventListener("click", () => send(dispatch, {
    "event/type": "value/close",
  }), { signal });
  copy.addEventListener("click", () => send(dispatch, {
    "event/type": "value/copy",
    path: model?.path || [],
  }), { signal });

  return {
    update(nextModel) {
      model = nextModel && typeof nextModel === "object" ? nextModel : {};
      const value = model.value || {};
      type.textContent = value.type || "value";
      id.textContent = value.id || "no retained value";
      display.textContent = value.display || "";
      container.dataset.valueStatus = model.status || "idle";
      container.dataset.valueId = value.id || "";
      body.replaceChildren();

      if (model.status === "loading") {
        const loading = document.createElement("div");
        loading.className = "value-inspector-state";
        loading.textContent = "Inspecting retained kernel value…";
        body.append(loading);
        return;
      }
      if (model.status === "error") {
        const error = document.createElement("div");
        error.className = "value-inspector-state error";
        error.textContent = model.error || "Unable to inspect the retained value";
        body.append(error);
        return;
      }
      if (model.status !== "ready") {
        const idle = document.createElement("div");
        idle.className = "value-inspector-state";
        idle.textContent = "Choose Inspect beside a retained REPL result.";
        body.append(idle);
        return;
      }

      const expanded = new Set((model.expanded || []).map((path) => JSON.stringify(path)));
      body.append(treeNode(
        document,
        value.data,
        "value",
        [],
        expanded,
        dispatch,
        signal,
      ));
    },
    dispose() {
      abort.abort();
      delete container.dataset.valueStatus;
      delete container.dataset.valueId;
    },
  };
}

export function valueInspectorAreaFromPlayground(state) {
  const inspector = state.valueInspector || {};
  return createValueInspectorArea({
    id: "value/main",
    valueId: inspector.valueId || null,
    requestId: inspector.requestId || null,
    status: inspector.status || "idle",
    display: inspector.display || "",
    value: inspector.value ?? null,
    valueType: inspector.valueType || null,
    namespace: inspector.namespace || null,
    source: inspector.source || null,
    path: inspector.path || [],
    expanded: inspector.expanded || [[]],
    metadata: inspector.metadata || {},
    error: inspector.error || null,
  });
}

export function disposeHodosValueInspector() {
  areaHost?.destroy();
  areaHost = null;
}

export function mountHodosValueInspector(state) {
  disposeHodosValueInspector();
  const root = globalThis.document?.querySelector(".value-view");
  if (!root) return false;
  areaHost = createWorkspaceAreaHost({
    root,
    registry,
    dispatch(event) {
      globalThis.document?.dispatchEvent(new CustomEvent("hodos:workspace-event", {
        detail: event,
      }));
    },
  });
  areaHost.open(valueInspectorAreaFromPlayground(state));
  return true;
}

export function updateHodosValueInspector(state) {
  if (!areaHost) return false;
  areaHost.update(valueInspectorAreaFromPlayground(state));
  return true;
}
