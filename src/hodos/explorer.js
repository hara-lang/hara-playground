import { createHodosComponentRegistry } from "@greenways/hodos-web";
import { createWorkspaceAreaHost } from "@greenways/hodos-workspace-ui";
import { createExplorerArea } from "@greenways/hodos-dev";
import { registerHodosExplorerUi } from "@greenways/hodos-dev-ui";
import {
  projectExplorerEntries,
  visibleExplorerExpandedPaths,
} from "./explorer-state.js";

const registry = createHodosComponentRegistry();
registerHodosExplorerUi(registry, { createExplorerHost: createPlayExplorerHost });

let areaHost = null;

function send(dispatch, event) {
  void Promise.resolve(dispatch(event)).catch((error) => {
    console.error("[hara playground hodos explorer]", error);
  });
}

function parentPath(path) {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function visiblePathSet(model) {
  const query = String(model.filter?.query ?? "").trim().toLowerCase();
  if (!query) return new Set(model.entries.map((entry) => entry.path));
  const visible = new Set();
  for (const entry of model.entries) {
    if (!`${entry.name} ${entry.path}`.toLowerCase().includes(query)) continue;
    visible.add(entry.path);
    let parent = parentPath(entry.path);
    while (parent) {
      visible.add(parent);
      parent = parentPath(parent);
    }
  }
  return visible;
}

function childMap(model) {
  const visible = visiblePathSet(model);
  const children = new Map();
  for (const entry of model.entries) {
    if (!visible.has(entry.path)) continue;
    const parent = parentPath(entry.path);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(entry);
  }
  for (const entries of children.values()) {
    entries.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
  }
  return children;
}

function directoryNode(document, entry, depth, model, children, expanded, dispatch, signal) {
  const wrapper = document.createElement("div");
  wrapper.className = "tree-folder";
  wrapper.style.setProperty("--depth", depth);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "tree-folder-label explorer-folder-button";
  button.dataset.path = entry.path;
  button.setAttribute("aria-expanded", String(expanded.has(entry.path)));
  const marker = document.createElement("span");
  marker.className = "explorer-entry-marker";
  marker.textContent = expanded.has(entry.path) ? "▾" : "▸";
  const name = document.createElement("span");
  name.textContent = entry.name;
  button.append(marker, name);
  button.addEventListener("click", () => send(dispatch, {
    "event/type": "explorer/toggle",
    path: entry.path,
  }), { signal });
  wrapper.append(button);

  if (expanded.has(entry.path)) {
    const branch = document.createElement("div");
    branch.className = "explorer-branch";
    for (const child of children.get(entry.path) || []) {
      branch.append(entryNode(document, child, depth + 1, model, children, expanded, dispatch, signal));
    }
    wrapper.append(branch);
  }
  return wrapper;
}

function fileNode(document, entry, depth, model, dispatch, signal) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `tree-file${entry.path === model.selection.path ? " selected" : ""}`;
  button.dataset.path = entry.path;
  button.style.setProperty("--depth", depth);
  button.title = entry.path;
  const marker = document.createElement("span");
  marker.className = `explorer-entry-marker ${entry.status}`;
  marker.textContent = entry.status === "modified" ? "●" : "·";
  const name = document.createElement("span");
  name.textContent = entry.name;
  button.append(marker, name);
  button.addEventListener("click", () => send(dispatch, {
    "event/type": "explorer/select",
    path: entry.path,
  }), { signal });
  return button;
}

function entryNode(document, entry, depth, model, children, expanded, dispatch, signal) {
  return entry.kind === "directory"
    ? directoryNode(document, entry, depth, model, children, expanded, dispatch, signal)
    : fileNode(document, entry, depth, model, dispatch, signal);
}

export function createPlayExplorerHost({ container, dispatch }) {
  const tree = container?.querySelector?.(".file-tree");
  const createFile = container?.querySelector?.("#new-file-button");
  const deleteFile = container?.querySelector?.("#delete-file-button");
  if (!tree || !createFile || !deleteFile) {
    throw new Error("Hodos Explorer requires the Play project controls");
  }

  const document = container.ownerDocument || globalThis.document;
  const abort = new AbortController();
  const signal = abort.signal;
  let model = null;

  createFile.addEventListener("click", () => send(dispatch, {
    "event/type": "explorer/create",
    kind: "file",
  }), { signal });
  deleteFile.addEventListener("click", () => {
    if (!model?.selection?.path) return;
    send(dispatch, {
      "event/type": "explorer/delete",
      path: model.selection.path,
    });
  }, { signal });

  return {
    update(nextModel) {
      model = nextModel && typeof nextModel === "object" ? nextModel : {};
      createFile.disabled = !model.capabilities?.createFile;
      const selected = model.entries?.find((entry) => entry.path === model.selection?.path) || null;
      deleteFile.disabled = !model.capabilities?.delete || !selected || selected.readOnly;
      tree.replaceChildren();

      const children = childMap(model);
      const expanded = new Set(model.expanded || []);
      const roots = children.get("") || [];
      if (!roots.length) {
        const empty = document.createElement("div");
        empty.className = "explorer-empty";
        empty.textContent = model.entries?.length
          ? "No files match the current filter."
          : "This workspace has no files.";
        tree.append(empty);
      } else {
        for (const entry of roots) {
          tree.append(entryNode(document, entry, 0, model, children, expanded, dispatch, signal));
        }
      }
      container.dataset.explorerWorkspace = model.workspace?.id || "";
      container.dataset.explorerCount = String(model.counts?.total ?? 0);
    },
    dispose() {
      abort.abort();
      delete container.dataset.explorerWorkspace;
      delete container.dataset.explorerCount;
    },
  };
}

export function explorerAreaFromPlay(state) {
  const entries = projectExplorerEntries(state.files, {
    selectedPath: state.selectedPath,
    dirty: state.dirty,
  });
  return createExplorerArea({
    id: "explorer/main",
    workspaceId: state.workspace ? `workspace:${state.workspace}` : null,
    workspaceTitle: state.metadata?.title
      || state.metadata?.repository
      || state.workspace
      || "Workspace",
    root: "",
    source: state.metadata?.source || null,
    revision: state.metadata?.commit || state.metadata?.branch || null,
    entries,
    selectedPath: state.selectedPath && state.files.includes(state.selectedPath)
      ? state.selectedPath
      : null,
    expandedPaths: visibleExplorerExpandedPaths(state.explorer, entries),
    query: state.explorer?.query || "",
    capabilities: {
      createFile: true,
      createDirectory: false,
      rename: false,
      delete: Boolean(state.selectedPath),
      refresh: true,
    },
    metadata: {
      owner: state.metadata?.owner || null,
      repository: state.metadata?.repository || null,
      branch: state.metadata?.branch || null,
      projectPath: state.metadata?.path || null,
    },
  });
}

export function disposeHodosExplorer() {
  areaHost?.destroy();
  areaHost = null;
}

export function mountHodosExplorer(state) {
  disposeHodosExplorer();
  const root = globalThis.document?.querySelector(".project-panel");
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
  areaHost.open(explorerAreaFromPlay(state));
  return true;
}

export function updateHodosExplorer(state) {
  if (!areaHost) return false;
  areaHost.update(explorerAreaFromPlay(state));
  return true;
}
