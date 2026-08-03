import {
  STUDIO_SETTING_KEYS,
  getInstantTimer,
  getSaveTimer,
  renderNow as render,
  runtime,
  setInstantTimer,
  setSaveTimer,
  state,
  store
} from "./context.js";
import { isHaraSource } from "../workspace/project.js";
import { previewDocument } from "../ui/hta.js";
import { instantCandidateChanged, instantFormAtCursor } from "../editor/instarepl.js";
import { toolById } from "../studio/catalog.js";
import { updateEditorOnly, updateInstaReplOnly, updateReplOnly } from "./view.js";
import {
  appendRepl,
  bootRuntime,
  checkActivity,
  evaluate,
  evaluateEditorForm,
  importRepository,
  openActivity,
  openExample,
  openLocalWorkspace,
  refreshFiles,
  resetInstantEvaluation,
  runCurrentFile,
  saveCurrentFile,
  selectActivity,
  selectFile,
  selectToolset
} from "./actions.js";

const INSTANT_EVALUATION_DELAY = 420;

function writeSetting(key, value) {
  try {
    globalThis.localStorage?.setItem(key, String(value));
  } catch {
    // Browser preferences are optional.
  }
}

function syncEditorScroll(editor) {
  const rail = document.querySelector("#line-rail");
  if (rail) rail.scrollTop = editor.scrollTop;
  const instantRail = document.querySelector("#instarepl-rail");
  if (instantRail) instantRail.scrollTop = editor.scrollTop;
}

async function evaluateInstantCandidate(candidate, request) {
  if (request !== state.instarepl.request) return;
  state.instarepl.status = "evaluating";
  updateInstaReplOnly();

  try {
    const result = await runtime.eval(candidate.source, state.namespace);
    if (request !== state.instarepl.request) return;
    state.namespace = result.namespace;
    state.instarepl.status = "ok";
    state.instarepl.display = result.display;
    state.instarepl.error = "";
    state.instarepl.evaluatedKey = candidate.key;
  } catch (error) {
    if (request !== state.instarepl.request) return;
    state.instarepl.status = "error";
    state.instarepl.display = "";
    state.instarepl.error = error.message;
    state.instarepl.evaluatedKey = candidate.key;
  }
  updateInstaReplOnly();
}

function scheduleInstantEvaluation(editor, { delay = INSTANT_EVALUATION_DELAY, force = false } = {}) {
  clearTimeout(getInstantTimer());
  setInstantTimer(null);

  if (!editor || !state.instarepl.enabled || state.runtimeStatus !== "ready" || !state.selectedPath || !isHaraSource(state.selectedPath)) {
    if (state.instarepl.candidate || state.instarepl.status !== "idle") {
      resetInstantEvaluation();
      updateInstaReplOnly();
    }
    return;
  }

  const candidate = instantFormAtCursor(editor.value, {
    cursor: editor.selectionEnd,
    selectionStart: editor.selectionStart,
    selectionEnd: editor.selectionEnd
  });

  if (!candidate) {
    state.instarepl.request += 1;
    state.instarepl.status = "idle";
    state.instarepl.candidate = null;
    state.instarepl.display = "";
    state.instarepl.error = "";
    state.instarepl.evaluatedKey = null;
    updateInstaReplOnly();
    return;
  }

  const changed = instantCandidateChanged(state.instarepl.candidate, candidate);
  state.instarepl.candidate = candidate;
  if (!force && !changed && state.instarepl.evaluatedKey === candidate.key) {
    updateInstaReplOnly();
    return;
  }

  const request = state.instarepl.request + 1;
  state.instarepl.request = request;
  state.instarepl.status = "queued";
  state.instarepl.display = "";
  state.instarepl.error = "";
  updateInstaReplOnly();
  setInstantTimer(setTimeout(() => evaluateInstantCandidate(candidate, request), delay));
}

function toggleInstantEvaluation(editor) {
  state.instarepl.enabled = !state.instarepl.enabled;
  writeSetting(STUDIO_SETTING_KEYS.instaRepl, state.instarepl.enabled);
  resetInstantEvaluation();
  render();
  if (state.instarepl.enabled) {
    queueMicrotask(() => scheduleInstantEvaluation(document.querySelector("#editor") || editor, { delay: 0, force: true }));
  }
}

function insertToolSnippet(editor, snippet) {
  if (!editor || editor.disabled) return;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const before = editor.value[start - 1] || "";
  const after = editor.value[end] || "";
  const prefix = start > 0 && before !== "\n" ? "\n" : "";
  const suffix = end < editor.value.length && after !== "\n" ? "\n" : "";
  const insertion = `${prefix}${snippet}${suffix}`;
  editor.setRangeText(insertion, start, end, "end");
  editor.focus();
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

export function bindEvents() {
  document.querySelectorAll(".tree-file").forEach((button) => button.addEventListener("click", () => selectFile(button.dataset.path)));
  const editor = document.querySelector("#editor");
  editor?.addEventListener("input", () => {
    state.content = editor.value;
    state.dirty = true;
    updateEditorOnly();
    clearTimeout(getSaveTimer());
    setSaveTimer(setTimeout(() => saveCurrentFile(false), 900));
    scheduleInstantEvaluation(editor);
  });
  editor?.addEventListener("scroll", () => syncEditorScroll(editor));
  editor?.addEventListener("click", () => scheduleInstantEvaluation(editor, { delay: 160 }));
  editor?.addEventListener("select", () => scheduleInstantEvaluation(editor, { delay: 160 }));
  editor?.addEventListener("keyup", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
      scheduleInstantEvaluation(editor, { delay: 160 });
    }
  });
  editor?.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.setRangeText("  ", start, end, "end");
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "Enter") {
      event.preventDefault();
      toggleInstantEvaluation(editor);
    } else if (event.altKey && event.key === "Enter") {
      event.preventDefault();
      evaluateEditorForm();
    } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      runCurrentFile();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveCurrentFile();
    }
  });

  document.querySelector("#save-button")?.addEventListener("click", () => saveCurrentFile());
  document.querySelector("#eval-form-button")?.addEventListener("click", evaluateEditorForm);
  document.querySelector("#run-button")?.addEventListener("click", runCurrentFile);
  document.querySelector("#instarepl-toggle")?.addEventListener("click", () => toggleInstantEvaluation(editor));
  document.querySelector("#toolset-select")?.addEventListener("change", (event) => selectToolset(event.currentTarget.value));
  document.querySelector("#activity-select")?.addEventListener("change", (event) => selectActivity(event.currentTarget.value));
  document.querySelectorAll(".tool-chip").forEach((button) => button.addEventListener("click", () => {
    const tool = toolById(state.toolsetId, button.dataset.toolId);
    if (tool) insertToolSnippet(editor, tool.snippet);
  }));
  document.querySelector("#activity-open-button")?.addEventListener("click", () => openActivity());
  document.querySelector("#activity-check-button")?.addEventListener("click", checkActivity);
  document.querySelector("#activity-reset-button")?.addEventListener("click", () => {
    if (confirm("Restore the starter source for this activity? Your edits in its activity file will be replaced.")) openActivity({ reset: true });
  });

  document.querySelector("#local-workspace-button")?.addEventListener("click", openLocalWorkspace);
  document.querySelector("#reset-button")?.addEventListener("click", async () => {
    await runtime.reset();
    await bootRuntime();
  });
  document.querySelector("#theme-button")?.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    writeSetting(STUDIO_SETTING_KEYS.theme, state.theme);
    render();
  });
  document.querySelector("#example-select")?.addEventListener("change", (event) => {
    if (event.currentTarget.value) openExample(event.currentTarget.value);
  });
  document.querySelector("#import-button")?.addEventListener("click", () => importRepository(document.querySelector("#repo-input").value));
  document.querySelector("#repo-input")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") importRepository(event.currentTarget.value);
  });
  document.querySelector("#new-file-button")?.addEventListener("click", async () => {
    const path = prompt("New workspace file", "src/app/new-file.hal");
    if (!path) return;
    if (state.files.includes(path)) {
      appendRepl("error", `${path} already exists`);
      render();
      return;
    }
    await store.write(path, isHaraSource(path) ? `(ns app.new-file)\n\n` : "");
    await refreshFiles(path);
  });
  document.querySelector("#delete-file-button")?.addEventListener("click", async () => {
    if (!state.selectedPath || !confirm(`Delete ${state.selectedPath} from this browser workspace?`)) return;
    await store.remove(state.selectedPath);
    state.selectedPath = null;
    await refreshFiles();
  });
  document.querySelector("#clear-repl-button")?.addEventListener("click", () => {
    state.repl = [];
    render();
  });
  const replForm = document.querySelector("#repl-form");
  const replInput = document.querySelector("#repl-input");
  replForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const source = replInput.value;
    if (!source.trim()) return;
    state.history.push(source);
    state.historyIndex = state.history.length;
    replInput.value = "";
    evaluate(source);
  });
  replInput?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      state.historyIndex = Math.max(0, state.historyIndex - 1);
      replInput.value = state.history[state.historyIndex] || "";
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      state.historyIndex = Math.min(state.history.length, state.historyIndex + 1);
      replInput.value = state.history[state.historyIndex] || "";
    }
  });
  if (editor) syncEditorScroll(editor);
}

export function setupRuntimeEvents() {
  runtime.addEventListener("stdout", (event) => {
    appendRepl("stdout", event.detail.text);
    updateReplOnly();
  });
  runtime.addEventListener("effect", (event) => {
    state.preview = previewDocument(event.detail.effect);
    const preview = document.querySelector("#preview");
    if (preview) preview.srcdoc = state.preview;
  });
  runtime.addEventListener("diagnostic", (event) => {
    appendRepl("stdout", event.detail.text);
    updateReplOnly();
  });
  runtime.addEventListener("runtime-error", (event) => {
    state.runtimeStatus = "error";
    appendRepl("error", event.detail?.message || String(event.detail));
    render();
  });
}
