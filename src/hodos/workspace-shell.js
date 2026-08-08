import { createHodosComponentRegistry } from "@greenways/hodos-web";
import { createWorkspaceShellHost } from "@greenways/hodos-workspace-ui";
import { registerHodosDocumentDomUi } from "@greenways/hodos-2d-ui";
import {
  playgroundSurfaceById,
  projectPlaygroundWorkspace,
  workspaceTokenName,
} from "./workspace-shell-state.js";

const registry = createHodosComponentRegistry();
registerHodosDocumentDomUi(registry, {
  documentDom: {
    reportError(error) {
      console.error("[hara playground hodos document]", error);
    },
  },
});
const SURFACE_GLYPHS = Object.freeze({
  files: "≡",
  code: "⌘",
  preview: "◉",
  audio: "♪",
  repl: ">_",
  learn: "?",
  document: "▤",
});

let shellHost = null;
let descriptor = null;
let stateRef = null;

const preferenceKey = (workspaceId, suffix) =>
  `hara-playground/workspace-shell/${encodeURIComponent(workspaceId || "workspace")}/${suffix}`;

function readPreference(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writePreference(key, value) {
  try {
    globalThis.localStorage?.setItem(key, String(value));
  } catch {
    // Workspace shell preferences are optional.
  }
}

function surfaceMode(surface) {
  return workspaceTokenName(surface?.mode ?? surface?.["surface/mode"] ?? surface?.id);
}

function outputTab(mode) {
  if (!new Set(["preview", "audio", "repl", "value", "problems"]).has(mode)) return null;
  return globalThis.document?.querySelector(`[data-output-tab="${mode}"]`) ?? null;
}

function activateOutputMode(mode, attempt = 0) {
  const tab = outputTab(mode);
  if (tab) {
    if (!tab.classList.contains("active")) tab.click();
    return true;
  }
  if (attempt < 3) {
    const schedule = globalThis.requestAnimationFrame
      ? globalThis.requestAnimationFrame.bind(globalThis)
      : (callback) => globalThis.setTimeout(callback, 16);
    schedule(() => activateOutputMode(mode, attempt + 1));
  }
  return false;
}

function applySurface(surface) {
  if (!surface) return;
  const mode = surfaceMode(surface);
  if (stateRef?.workspaceShell) stateRef.workspaceShell.surfaceId = surface.id;

  const shell = globalThis.document?.querySelector(".playground-shell");
  if (shell?.dataset) shell.dataset.mobileSurface = surface.id;
  const project = globalThis.document?.querySelector(".project-panel");
  if (project?.dataset) project.dataset.mobileMode = mode === "learn" ? "learn" : "files";

  if (new Set(["preview", "audio", "repl", "value", "problems"]).has(mode)) {
    queueMicrotask(() => activateOutputMode(mode));
  }
  if (mode === "preview") {
    queueMicrotask(() => globalThis.dispatchEvent?.(new Event("hara-host-resize")));
  }
}

function decorateDock(root) {
  root.querySelectorAll?.(".hodos-workspace-dock-item").forEach((button) => {
    if (button.dataset.haraDockDecorated === "true") return;
    const surfaceId = button.dataset.workspaceSurfaceId || "";
    const labelText = button.textContent || surfaceId;
    const glyph = button.ownerDocument.createElement("span");
    glyph.className = "mobile-dock-icon";
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = SURFACE_GLYPHS[surfaceId] || "·";
    const label = button.ownerDocument.createElement("span");
    label.className = "mobile-dock-label";
    label.textContent = labelText;
    button.replaceChildren(glyph, label);
    button.dataset.haraDockDecorated = "true";
  });
}

function focusTarget(surface) {
  const mode = surfaceMode(surface);
  if (mode === "code") return globalThis.document?.querySelector("#editor") ?? null;
  if (mode === "repl") return globalThis.document?.querySelector("#repl-input") ?? null;
  if (mode === "files") {
    return globalThis.document?.querySelector(".tree-file.active, .tree-file") ?? null;
  }
  if (mode === "audio") {
    return globalThis.document?.querySelector("#audio-play-button, [data-audio-control]") ?? null;
  }
  if (mode === "learn") return globalThis.document?.querySelector(".activity-panel button") ?? null;
  if (mode === "document") return globalThis.document?.querySelector('[data-hodos-component="hodos.2d/document"] [contenteditable="plaintext-only"], [data-hodos-component="hodos.2d/document"] textarea') ?? null;
  return null;
}

function resolveAreaRoot(area) {
  const role = workspaceTokenName(area?.presentation?.role);
  if (role === "project") return globalThis.document?.querySelector(".project-panel") ?? null;
  if (role === "editor") return globalThis.document?.querySelector(".editor-panel") ?? null;
  if (role === "output") return globalThis.document?.querySelector(".output-panel") ?? null;
  return null;
}

function createAreaRoot(area) {
  const document = globalThis.document;
  if (!document) return null;
  const root = document.createElement("section");
  if (area?.component) {
    root.className = "workspace-component-area hara-surface";
    return root;
  }
  root.className = "workspace-unsupported-area hara-surface";
  const title = document.createElement("h2");
  title.textContent = area?.title || area?.id || "Workspace area";
  const note = document.createElement("p");
  note.textContent = `This Workspace area type is not mounted by the Playground: ${area?.type || "unknown"}`;
  root.append(title, note);
  return root;
}

function services() {
  return {
    workspaceShell: {
      readSurface({ workspaceId }) {
        return readPreference(preferenceKey(workspaceId, "surface"));
      },
      writeSurface({ workspaceId, surfaceId }) {
        writePreference(preferenceKey(workspaceId, "surface"), surfaceId);
      },
      readSplitRatio({ workspaceId, layoutId }) {
        const value = Number(readPreference(preferenceKey(workspaceId, `split/${layoutId}`)));
        return Number.isFinite(value) ? value : null;
      },
      writeSplitRatio({ workspaceId, layoutId, ratio }) {
        writePreference(preferenceKey(workspaceId, `split/${layoutId}`), ratio);
      },
      activateSurface({ surface }) {
        applySurface(surface);
      },
      focusSurface({ surface }) {
        return focusTarget(surface);
      },
      afterRender({ root, surface }) {
        root.dataset.workspaceManifestStatus = stateRef?.workspaceShell?.status || "fallback";
        root.dataset.workspaceManifestSource = stateRef?.workspaceShell?.source || "fallback";
        decorateDock(root);
        applySurface(surface);
      },
      reportError(error) {
        console.error("[hara playground workspace shell]", error);
      },
    },
  };
}

export function currentHodosWorkspaceDescriptor() {
  return descriptor;
}

export function disposeHodosWorkspaceShell() {
  shellHost?.destroy();
  shellHost = null;
  descriptor = null;
  stateRef = null;
}

export function mountHodosWorkspaceShell(state) {
  disposeHodosWorkspaceShell();
  const root = globalThis.document?.querySelector(".workbench-grid");
  if (!root) return false;
  stateRef = state;
  descriptor = projectPlaygroundWorkspace(state);
  shellHost = createWorkspaceShellHost({
    root,
    registry,
    services: services(),
    resolveAreaRoot,
    createAreaRoot,
    dispatch(event) {
      globalThis.document?.dispatchEvent(new CustomEvent("hodos:workspace-event", {
        detail: event,
      }));
    },
  });
  shellHost.mount(descriptor, { state });
  const surface = playgroundSurfaceById(descriptor, state.workspaceShell?.surfaceId);
  if (surface) applySurface({
    id: workspaceTokenName(surface["surface/id"]),
    mode: workspaceTokenName(surface["surface/mode"]),
  });
  return true;
}

export function updateHodosWorkspaceShell(state) {
  if (!shellHost) return false;
  stateRef = state;
  descriptor = projectPlaygroundWorkspace(state);
  shellHost.update(descriptor, { state });
  return true;
}
