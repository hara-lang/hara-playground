import { STUDIO_SETTING_KEYS, state } from "./context.js";
import { icon } from "./view-helpers.js";
import {
  DEFAULT_DESKTOP_LAYOUT,
  normaliseDesktopLayout,
  normaliseMobileSurface,
  resizeDesktopLayout
} from "./layout-model.js";

const LAYOUT_KEY = "hara-playground-desktop-layout";
const MOBILE_SURFACE_KEY = "hara-playground-mobile-surface";
const MOBILE_QUERY = "(max-width: 1000px)";

let applicationRoot = null;
let observer = null;
let scheduled = false;
let mobileSurface = readSetting(MOBILE_SURFACE_KEY, "code");

function readSetting(key, fallback) {
  try {
    return globalThis.localStorage?.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSetting(key, value) {
  try {
    globalThis.localStorage?.setItem(key, String(value));
  } catch {
    // Layout preferences are optional.
  }
}

function readDesktopLayout() {
  try {
    return JSON.parse(readSetting(LAYOUT_KEY, "{}"));
  } catch {
    return { ...DEFAULT_DESKTOP_LAYOUT };
  }
}

function writeDesktopLayout(layout) {
  writeSetting(LAYOUT_KEY, JSON.stringify(layout));
}

function isMobileLayout() {
  return Boolean(globalThis.matchMedia?.(MOBILE_QUERY).matches);
}

function createDivider(side, label) {
  const divider = document.createElement("div");
  divider.className = `panel-resizer panel-resizer--${side}`;
  divider.dataset.resizeSide = side;
  divider.tabIndex = 0;
  divider.setAttribute("role", "separator");
  divider.setAttribute("aria-orientation", "vertical");
  divider.setAttribute("aria-label", label);
  divider.innerHTML = '<span aria-hidden="true"></span>';
  return divider;
}

function applyDesktopLayout(grid, layout = readDesktopLayout()) {
  if (!grid) return null;
  const normalised = normaliseDesktopLayout(layout, grid.clientWidth || globalThis.innerWidth || 1280);
  grid.style.setProperty("--project-panel-width", `${Math.round(normalised.projectWidth)}px`);
  grid.style.setProperty("--output-panel-width", `${Math.round(normalised.outputWidth)}px`);
  grid.querySelector('[data-resize-side="project"]')?.setAttribute("aria-valuenow", String(Math.round(normalised.projectWidth)));
  grid.querySelector('[data-resize-side="output"]')?.setAttribute("aria-valuenow", String(Math.round(normalised.outputWidth)));
  return normalised;
}

function bindDivider(grid, divider, side) {
  const update = (layout, persist = false) => {
    const applied = applyDesktopLayout(grid, layout);
    if (persist && applied) writeDesktopLayout(applied);
  };

  divider.addEventListener("pointerdown", (event) => {
    if (isMobileLayout() || event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startLayout = applyDesktopLayout(grid) || { ...DEFAULT_DESKTOP_LAYOUT };
    divider.setPointerCapture?.(event.pointerId);
    divider.classList.add("dragging");
    document.documentElement.classList.add("resizing-workbench");

    const move = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      update(resizeDesktopLayout(startLayout, side, delta, grid.clientWidth || globalThis.innerWidth));
    };
    const finish = (finishEvent) => {
      divider.releasePointerCapture?.(finishEvent.pointerId);
      divider.classList.remove("dragging");
      document.documentElement.classList.remove("resizing-workbench");
      update(readLayoutFromGrid(grid), true);
      divider.removeEventListener("pointermove", move);
      divider.removeEventListener("pointerup", finish);
      divider.removeEventListener("pointercancel", finish);
    };

    divider.addEventListener("pointermove", move);
    divider.addEventListener("pointerup", finish);
    divider.addEventListener("pointercancel", finish);
  });

  divider.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") {
      const reset = side === "project"
        ? { ...readLayoutFromGrid(grid), projectWidth: DEFAULT_DESKTOP_LAYOUT.projectWidth }
        : { ...readLayoutFromGrid(grid), outputWidth: DEFAULT_DESKTOP_LAYOUT.outputWidth };
      update(reset, true);
      return;
    }
    const delta = event.key === "ArrowRight" ? 16 : -16;
    update(resizeDesktopLayout(readLayoutFromGrid(grid), side, delta, grid.clientWidth || globalThis.innerWidth), true);
  });

  divider.addEventListener("dblclick", () => {
    const current = readLayoutFromGrid(grid);
    update(side === "project"
      ? { ...current, projectWidth: DEFAULT_DESKTOP_LAYOUT.projectWidth }
      : { ...current, outputWidth: DEFAULT_DESKTOP_LAYOUT.outputWidth }, true);
  });
}

function readLayoutFromGrid(grid) {
  const styles = getComputedStyle(grid);
  return {
    projectWidth: Number.parseFloat(styles.getPropertyValue("--project-panel-width")) || DEFAULT_DESKTOP_LAYOUT.projectWidth,
    outputWidth: Number.parseFloat(styles.getPropertyValue("--output-panel-width")) || DEFAULT_DESKTOP_LAYOUT.outputWidth
  };
}

function mountDesktopResizers(shell) {
  const grid = shell.querySelector(".workbench-grid");
  if (!grid || grid.dataset.resizable === "true") return;
  const project = grid.querySelector(".project-panel");
  const editor = grid.querySelector(".editor-panel");
  const output = grid.querySelector(".output-panel");
  if (!project || !editor || !output) return;

  grid.dataset.resizable = "true";
  grid.classList.add("workbench-grid--resizable");
  const projectDivider = createDivider("project", "Resize project panel");
  const outputDivider = createDivider("output", "Resize output panel");
  project.after(projectDivider);
  editor.after(outputDivider);
  bindDivider(grid, projectDivider, "project");
  bindDivider(grid, outputDivider, "output");
  applyDesktopLayout(grid);
}

const DOCK_ITEMS = Object.freeze([
  { id: "files", label: "Files", icon: "folder" },
  { id: "code", label: "Code", icon: "code" },
  { id: "preview", label: "Canvas", icon: "eye" },
  { id: "audio", label: "Audio", icon: "play" },
  { id: "repl", label: "REPL", icon: "terminal" },
  { id: "learn", label: "Learn", icon: "command" }
]);
const OUTPUT_SURFACES = new Set(["preview", "audio", "repl"]);

function mountMobileDock(shell) {
  if (shell.querySelector(".mobile-workspace-dock")) return;
  const dock = document.createElement("nav");
  dock.className = "mobile-workspace-dock";
  dock.setAttribute("aria-label", "Workspace panels");
  dock.innerHTML = DOCK_ITEMS.map((item) => `<button type="button" data-mobile-surface="${item.id}" aria-label="Open ${item.label} panel">${icon(item.icon)}<span>${item.label}</span></button>`).join("");
  dock.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mobile-surface]");
    if (button) activateMobileSurface(shell, button.dataset.mobileSurface, { focus: true });
  });
  shell.querySelector(".statusbar")?.before(dock);
}

function setOutputMode(shell, mode) {
  if (!OUTPUT_SURFACES.has(mode)) return false;
  const button = shell.querySelector(`.output-tab[data-output-tab="${mode}"]`);
  if (!button) return false;
  if (!button.classList.contains("active")) button.click();
  return true;
}

function requestPreviewResize(shell) {
  globalThis.dispatchEvent?.(new Event("resize"));
  const frame = shell.querySelector("#preview");
  frame?.contentWindow?.postMessage({ type: "hara-host-resize" }, "*");
}

function activateMobileSurface(shell, value, { focus = false, syncOutput = true } = {}) {
  mobileSurface = normaliseMobileSurface(value, mobileSurface);
  writeSetting(MOBILE_SURFACE_KEY, mobileSurface);
  shell.dataset.mobileSurface = mobileSurface;
  shell.querySelectorAll(".mobile-workspace-dock [data-mobile-surface]").forEach((button) => {
    const active = button.dataset.mobileSurface === mobileSurface;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (syncOutput && OUTPUT_SURFACES.has(mobileSurface)) setOutputMode(shell, mobileSurface);
  if (focus) {
    const target = mobileSurface === "code" ? shell.querySelector("#editor")
      : mobileSurface === "repl" ? shell.querySelector("#repl-input")
        : mobileSurface === "audio" ? shell.querySelector("#audio-play-button, [data-audio-control]")
          : mobileSurface === "files" ? shell.querySelector(".tree-file.selected, .tree-file")
            : null;
    target?.focus({ preventScroll: true });
  }
  if (mobileSurface === "preview") requestAnimationFrame(() => requestPreviewResize(shell));
}

function mountMobileInstaRepl(shell) {
  const editorPanel = shell.querySelector(".editor-panel");
  if (!editorPanel || editorPanel.querySelector(".mobile-instarepl")) return;
  const panel = document.createElement("section");
  panel.className = "mobile-instarepl";
  panel.setAttribute("aria-live", "polite");
  panel.innerHTML = `
    <button class="mobile-instarepl__summary" type="button" aria-expanded="false">
      <span class="mobile-instarepl__marker">·</span>
      <code>InstaREPL ready</code>
      <small></small>
      <span class="mobile-instarepl__chevron" aria-hidden="true">⌃</span>
    </button>
    <div class="mobile-instarepl__detail"></div>`;
  panel.querySelector("button").addEventListener("click", () => {
    const expanded = panel.classList.toggle("expanded");
    panel.querySelector("button").setAttribute("aria-expanded", String(expanded));
  });
  editorPanel.append(panel);
}

function instantText() {
  if (!state.instarepl.enabled) return { status: "disabled", marker: "○", text: "InstaREPL off", location: "", detail: "Enable InstaREPL from the Lisp toolbar to evaluate the active form after a pause." };
  const candidate = state.instarepl.candidate;
  if (!candidate) return { status: "idle", marker: "·", text: "Place the cursor in a complete form", location: "", detail: "The current selection, enclosing form, or atom line will evaluate in the persistent kernel." };
  const status = state.instarepl.status;
  const text = status === "ok" ? state.instarepl.display
    : status === "error" ? state.instarepl.error
      : status === "evaluating" ? "Evaluating…" : "Queued…";
  const location = candidate.startLine === candidate.endLine ? `line ${candidate.endLine}` : `lines ${candidate.startLine}–${candidate.endLine}`;
  return {
    status,
    marker: status === "ok" ? "→" : status === "error" ? "!" : "·",
    text,
    location,
    detail: text
  };
}

function setText(target, value) {
  if (target && target.textContent !== value) target.textContent = value;
}

function syncMobileInstaRepl(shell) {
  const panel = shell.querySelector(".mobile-instarepl");
  if (!panel) return;
  const result = instantText();
  panel.dataset.status = result.status;
  setText(panel.querySelector(".mobile-instarepl__marker"), result.marker);
  setText(panel.querySelector("code"), result.text);
  setText(panel.querySelector("small"), result.location);
  setText(panel.querySelector(".mobile-instarepl__detail"), result.detail);
}

function enhanceWorkspace() {
  scheduled = false;
  const shell = applicationRoot?.querySelector(".playground-shell");
  if (!shell) return;
  mountDesktopResizers(shell);
  mountMobileDock(shell);
  mountMobileInstaRepl(shell);
  activateMobileSurface(shell, mobileSurface);
  syncMobileInstaRepl(shell);
}

function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(enhanceWorkspace);
}

export function installWorkspaceLayout(root = document.querySelector("#app")) {
  if (!root || observer) return () => {};
  applicationRoot = root;
  mobileSurface = normaliseMobileSurface(readSetting(MOBILE_SURFACE_KEY, "code"));
  observer = new MutationObserver(scheduleEnhancement);
  observer.observe(root, { childList: true, subtree: true });
  root.addEventListener("click", (event) => {
    const outputTab = event.target.closest(".output-tab[data-output-tab]");
    const shell = root.querySelector(".playground-shell");
    if (outputTab && shell && isMobileLayout()) {
      activateMobileSurface(shell, outputTab.dataset.outputTab, { syncOutput: false });
    }
  }, true);
  globalThis.addEventListener?.("resize", scheduleEnhancement);
  scheduleEnhancement();
  return () => {
    observer?.disconnect();
    observer = null;
    globalThis.removeEventListener?.("resize", scheduleEnhancement);
  };
}
