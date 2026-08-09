import { disposeHodosPreview, mountHodosPreview } from "../hodos/preview.js";
import { outputSurfaceAvailable, projectPresentation } from "../workspace/presentation.js";

const OUTPUT_SETTING = "hara-playground-output";

let generation = 0;
let observedRoot = null;
let observer = null;
let currentPresentation = null;
let currentState = null;

function writeSetting(key, value) {
  try {
    globalThis.localStorage?.setItem(key, String(value));
  } catch {
    // Output preferences are optional.
  }
}

function setHidden(element, hidden) {
  if (!element || element.hidden === hidden) return;
  element.hidden = hidden;
}

function activateOutput(state, output) {
  if (!state || !output) return;
  state.outputTab = output;
  writeSetting(OUTPUT_SETTING, output);

  globalThis.document?.querySelectorAll("[data-output-tab]").forEach((button) => {
    const active = button.dataset.outputTab === output;
    button.classList.toggle("active", active);
  });
  globalThis.document?.querySelector(".preview-view")?.classList.toggle("active", output === "preview");
  globalThis.document?.querySelector(".repl-view")?.classList.toggle("active", output === "repl");
  globalThis.document?.querySelector(".value-view")?.classList.toggle("active", output === "value");
  globalThis.document?.querySelector(".problems-view")?.classList.toggle("active", output === "problems");
}

function fallbackToRepl(state) {
  const replButton = globalThis.document?.querySelector('[data-output-tab="repl"]');
  if (replButton && !replButton.classList.contains("active")) {
    replButton.click();
    return;
  }
  activateOutput(state, "repl");
}

function applyDockAvailability(state, presentation) {
  const document = globalThis.document;
  if (!document) return;

  for (const surface of ["preview", "audio", "learn"]) {
    const available = outputSurfaceAvailable(presentation, surface);
    document.querySelectorAll(`[data-workspace-surface-id="${surface}"]`).forEach((button) => {
      setHidden(button, !available);
      button.setAttribute("aria-hidden", String(!available));
    });
  }

  const selected = state?.workspaceShell?.surfaceId;
  if (selected && !outputSurfaceAvailable(presentation, selected)) {
    state.workspaceShell.surfaceId = "repl";
    const replDock = document.querySelector('[data-workspace-surface-id="repl"]');
    if (replDock && !replDock.classList.contains("active")) replDock.click();
  }
}

function applyOutputAvailability(state, presentation) {
  const document = globalThis.document;
  if (!document) return;
  const root = document.documentElement;
  root.dataset.projectPreview = String(Boolean(presentation.preview));
  root.dataset.projectAudio = String(Boolean(presentation.audio));
  root.dataset.projectLearn = String(Boolean(presentation.learn));

  const previewAvailable = Boolean(presentation.preview);
  setHidden(document.querySelector('[data-output-tab="preview"]'), !previewAvailable);
  setHidden(document.querySelector(".preview-view"), !previewAvailable);

  const audioAvailable = Boolean(presentation.audio);
  document.querySelectorAll('[data-output-tab="audio"], .audio-view').forEach((element) => {
    setHidden(element, !audioAvailable);
  });

  const audioActive = Boolean(document.querySelector('[data-output-tab="audio"].active, .audio-view.active'));
  if ((!previewAvailable && state.outputTab === "preview") || (!audioAvailable && audioActive)) {
    fallbackToRepl(state);
  }

  applyDockAvailability(state, presentation);
}

function observeLateOutputMounts() {
  const root = globalThis.document?.querySelector("#app");
  if (!root || root === observedRoot) return;
  observer?.disconnect();
  observedRoot = root;
  observer = new MutationObserver(() => {
    if (!currentPresentation || !currentState) return;
    queueMicrotask(() => applyOutputAvailability(currentState, currentPresentation));
  });
  observer.observe(root, { childList: true, subtree: true });
}

export async function syncProjectPresentation({ state, store } = {}) {
  if (!state || !store || typeof store.files !== "function") return null;
  const request = ++generation;
  const files = await store.files();
  if (request !== generation) return null;

  const presentation = projectPresentation(files);
  state.projectPresentation = presentation;
  currentPresentation = presentation;
  currentState = state;
  applyOutputAvailability(state, presentation);
  observeLateOutputMounts();

  if (state.screen === "workspace" && presentation.preview) {
    mountHodosPreview({ document: state.preview, theme: state.theme });
  } else {
    disposeHodosPreview();
  }
  return presentation;
}
