import { createHodosComponentRegistry } from "@greenways/hodos-web";
import { createWorkspaceAreaHost } from "@greenways/hodos-workspace-ui";
import { createEditorArea } from "@greenways/hodos-dev";
import { registerHodosEditorUi } from "@greenways/hodos-dev-ui";

const registry = createHodosComponentRegistry();
registerHodosEditorUi(registry, { createEditorHost: createPlayEditorHost });

const NAVIGATION_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

let areaHost = null;

function editorSelection(editor) {
  return {
    start: editor.selectionStart,
    end: editor.selectionEnd,
  };
}

function send(dispatch, event) {
  void Promise.resolve(dispatch(event)).catch((error) => {
    console.error("[hara playground hodos editor]", error);
  });
}

export function createPlayEditorHost({ container, dispatch }) {
  const editor = container?.querySelector?.("#editor");
  if (!editor) throw new Error("Hodos Editor requires the Play #editor element");

  const abort = new AbortController();
  const signal = abort.signal;
  const emitSelection = () => send(dispatch, {
    "event/type": "editor/selection",
    selection: editorSelection(editor),
  });

  editor.addEventListener("input", () => send(dispatch, {
    "event/type": "editor/change",
    source: editor.value,
    selection: editorSelection(editor),
  }), { signal });
  editor.addEventListener("click", emitSelection, { signal });
  editor.addEventListener("select", emitSelection, { signal });
  editor.addEventListener("keyup", (event) => {
    if (NAVIGATION_KEYS.has(event.key)) emitSelection();
  }, { signal });

  return {
    update(model) {
      const next = model && typeof model === "object" ? model : {};
      if (typeof next.source === "string" && editor.value !== next.source) {
        editor.value = next.source;
      }
      editor.readOnly = Boolean(next.readOnly);
      editor.disabled = !next.document?.path;
      const start = Math.min(Number(next.selection?.start ?? 0), editor.value.length);
      const end = Math.min(Math.max(start, Number(next.selection?.end ?? start)), editor.value.length);
      if (editor.selectionStart !== start || editor.selectionEnd !== end) {
        editor.setSelectionRange(start, end);
      }
      editor.dataset.workspaceDocument = next.document?.id ?? "";
      editor.dataset.workspaceVersion = String(next.document?.version ?? 0);
    },
    dispose() {
      abort.abort();
      delete editor.dataset.workspaceDocument;
      delete editor.dataset.workspaceVersion;
    },
  };
}

export function disposeHodosEditor() {
  areaHost?.destroy();
  areaHost = null;
}

export function mountHodosEditor({
  selectedPath = null,
  source = "",
  namespace = "user",
  selectionStart = 0,
  selectionEnd = selectionStart,
  completion = null,
  paredit = true,
  rainbow = true,
  instaRepl = true,
} = {}) {
  disposeHodosEditor();
  const root = globalThis.document?.querySelector(".editor-panel");
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
  areaHost.open(createEditorArea({
    id: "editor/main",
    documentId: selectedPath ? `workspace:${selectedPath}` : null,
    path: selectedPath,
    source,
    language: selectedPath?.split(".").at(-1) || "text",
    namespace,
    readOnly: !selectedPath,
    selection: { start: selectionStart, end: selectionEnd },
    completion,
    settings: { paredit, rainbow, instaRepl },
  }));
  return true;
}
