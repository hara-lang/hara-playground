import { getSaveTimer, renderNow as render, runtime, setSaveTimer, state, store } from "./context.js";
import { isHaraSource } from "../workspace/project.js";
import { previewDocument } from "../ui/hta.js";
import { updateEditorOnly } from "./view.js";
import { appendRepl, bootRuntime, evaluate, evaluateEditorForm, importRepository, openExample, openLocalWorkspace, refreshFiles, runCurrentFile, saveCurrentFile, selectFile } from "./actions.js";

export function bindEvents() {
  document.querySelectorAll(".tree-file").forEach((button) => button.addEventListener("click", () => selectFile(button.dataset.path)));
  const editor = document.querySelector("#editor");
  editor?.addEventListener("input", () => {
    state.content = editor.value;
    state.dirty = true;
    updateEditorOnly();
    clearTimeout(getSaveTimer());
    setSaveTimer(setTimeout(() => saveCurrentFile(false), 900));
  });
  editor?.addEventListener("scroll", () => {
    const rail = document.querySelector("#line-rail");
    if (rail) rail.scrollTop = editor.scrollTop;
  });
  editor?.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.setRangeText("  ", start, end, "end");
      editor.dispatchEvent(new Event("input"));
    }
    if (event.altKey && event.key === "Enter") {
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
  document.querySelector("#local-workspace-button")?.addEventListener("click", openLocalWorkspace);
  document.querySelector("#reset-button")?.addEventListener("click", async () => {
    await runtime.reset();
    await bootRuntime();
  });
  document.querySelector("#theme-button")?.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("hara-studio-theme", state.theme);
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
}

export function setupRuntimeEvents() {
  runtime.addEventListener("stdout", (event) => {
    appendRepl("stdout", event.detail.text);
    render();
  });
  runtime.addEventListener("effect", (event) => {
    state.preview = previewDocument(event.detail.effect);
    const preview = document.querySelector("#preview");
    if (preview) preview.srcdoc = state.preview;
  });
  runtime.addEventListener("diagnostic", (event) => {
    appendRepl("stdout", event.detail.text);
    render();
  });
  runtime.addEventListener("runtime-error", (event) => {
    state.runtimeStatus = "error";
    appendRepl("error", event.detail?.message || String(event.detail));
    render();
  });

}
