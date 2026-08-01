import { app, state } from "./context.js";
import { isHaraSource } from "../workspace/project.js";
import { icon, escapeHtml, fileName, fileLanguage, groupFiles, renderTree, renderRepl } from "./view-helpers.js";

export function render(bindEvents) {
  document.documentElement.dataset.theme = state.theme;
  const sourceLabel = state.metadata.source === "github"
    ? `${state.metadata.owner}/${state.metadata.repository}`
    : state.metadata.source === "example"
      ? `Example · ${state.metadata.title || state.metadata.example}`
      : "Local workspace";
  app.innerHTML = `
    <div class="studio-shell">
      <header class="topbar">
        <div class="brand"><div class="brand-mark">H</div><div><strong>Hara Studio</strong><span>Browser development environment</span></div></div>
        <div class="repo-loader">
          ${icon("github")}
          <select id="example-select" aria-label="Open Hara example" ${state.exampleBusy ? "disabled" : ""}>
            <option value="">${state.exampleBusy ? "Opening example…" : "Examples"}</option>
            ${state.examples.map((example) => `<option value="${escapeHtml(example.id)}">${escapeHtml(example.title)}</option>`).join("")}
          </select>
          <input id="repo-input" aria-label="GitHub repository" placeholder="github.com/owner/hara-project" ${state.importBusy ? "disabled" : ""}>
          <button id="import-button" class="quiet-button" ${state.importBusy ? "disabled" : ""}>${state.importBusy ? "Importing…" : "Open"}</button>
        </div>
        <div class="toolbar-actions">
          <button id="save-button" class="icon-button" title="Save file (Ctrl/Cmd+S)">${icon("save")}</button>
          <button id="eval-form-button" class="secondary-button" title="Evaluate selection or enclosing form (Alt+Enter)" ${state.selectedPath && isHaraSource(state.selectedPath) ? "" : "disabled"}>${icon("terminal")} Eval form</button>
          <button id="run-button" class="primary-button" title="Evaluate file (Ctrl/Cmd+Enter)" ${state.selectedPath && isHaraSource(state.selectedPath) ? "" : "disabled"}>${icon("play")} Run file</button>
          <button id="reset-button" class="icon-button" title="Reset runtime">${icon("refresh")}</button>
          <button id="theme-button" class="icon-button" title="Toggle theme">${icon(state.theme === "dark" ? "sun" : "moon")}</button>
        </div>
      </header>

      <div class="workspace-strip">
        <span class="workspace-source">${icon("github")} ${escapeHtml(sourceLabel)}</span>
        <span>${icon("branch")} ${escapeHtml(state.metadata.branch || "main")}</span>
        ${state.metadata.source !== "local" ? '<button id="local-workspace-button" class="strip-button">Open local workspace</button>' : ""}
        <span class="runtime-pill ${state.runtimeStatus}"><i></i>${escapeHtml(state.runtimeStatus)}</span>
        ${state.importProgress ? `<span class="import-progress">${escapeHtml(state.importProgress)}</span>` : ""}
      </div>

      <main class="workbench">
        <aside class="explorer panel">
          <div class="panel-heading"><span>EXPLORER</span><div><button id="new-file-button" class="mini-button" title="New file">${icon("plus")}</button><button id="delete-file-button" class="mini-button" title="Delete selected file">${icon("trash")}</button></div></div>
          <div class="project-title">${escapeHtml(state.workspace)}</div>
          <nav class="file-tree">${renderTree(groupFiles(state.files))}</nav>
        </aside>

        <section class="editor-panel panel">
          <div class="editor-tabs"><div class="editor-tab active">${icon("file")}<span>${escapeHtml(state.selectedPath ? fileName(state.selectedPath) : "No file")}</span>${state.dirty ? '<i class="dirty-dot"></i>' : ""}</div></div>
          <div class="editor-meta"><span>${escapeHtml(state.selectedPath || "Select a file")}</span><span>${state.selectedPath ? fileLanguage(state.selectedPath) : ""}</span></div>
          <div class="editor-wrap"><div class="line-rail" id="line-rail">${state.content.split("\n").map((_, index) => `<span>${index + 1}</span>`).join("")}</div><textarea id="editor" spellcheck="false" autocomplete="off" autocapitalize="off" ${state.selectedPath ? "" : "disabled"}>${escapeHtml(state.content)}</textarea></div>
        </section>

        <section class="preview-panel panel">
          <div class="panel-heading"><span>PREVIEW</span><span class="preview-mode">sandboxed HTA</span></div>
          <iframe id="preview" title="Hara preview" sandbox="" referrerpolicy="no-referrer"></iframe>
        </section>

        <section class="repl-panel panel">
          <div class="panel-heading"><span>${icon("terminal")} REPL</span><button id="clear-repl-button" class="text-button">Clear</button></div>
          <div id="repl-output" class="repl-output">${renderRepl()}</div>
          <form id="repl-form" class="repl-form"><span>${escapeHtml(state.namespace)}=&gt;</span><input id="repl-input" aria-label="REPL input" autocomplete="off" spellcheck="false" placeholder="(+ 1 2)" ${state.runtimeStatus !== "ready" ? "disabled" : ""}></form>
        </section>
      </main>

      <footer class="statusbar">
        <span>${state.dirty ? "Unsaved changes" : "Workspace saved"}</span>
        <span>Namespace: ${escapeHtml(state.namespace)}</span>
        <span>${state.files.length} files</span>
        <span>Hara ${escapeHtml(state.runtimeKind)} runtime · Web Worker</span>
      </footer>
    </div>`;
  bindEvents();
  const preview = document.querySelector("#preview");
  preview.srcdoc = state.preview;
  const output = document.querySelector("#repl-output");
  output.scrollTop = output.scrollHeight;
}

export function updateEditorOnly() {
  const rail = document.querySelector("#line-rail");
  if (rail) rail.innerHTML = state.content.split("\n").map((_, index) => `<span>${index + 1}</span>`).join("");
}

