import { app, state } from "./context.js";
import { isHaraSource } from "../workspace/project.js";
import {
  ACTIVITIES,
  TOOLSETS,
  activitiesForToolset,
  activityById,
  toolsetById
} from "../studio/catalog.js";
import { icon, escapeHtml, fileName, fileLanguage, groupFiles, renderTree, renderRepl } from "./view-helpers.js";

function renderToolsetOptions() {
  return TOOLSETS.map((toolset) => `<option value="${escapeHtml(toolset.id)}" ${toolset.id === state.toolsetId ? "selected" : ""}>${escapeHtml(toolset.title)}</option>`).join("");
}

function renderActivityOptions() {
  const activities = activitiesForToolset(state.toolsetId);
  return activities.map((activity) => `<option value="${escapeHtml(activity.id)}" ${activity.id === state.activityId ? "selected" : ""}>${escapeHtml(activity.title)}</option>`).join("");
}

function renderTools(toolset) {
  if (!toolset) return "";
  return toolset.tools.map((tool) => `
    <button class="tool-chip" data-tool-id="${escapeHtml(tool.id)}" title="${escapeHtml(tool.description)}" ${state.selectedPath && isHaraSource(state.selectedPath) ? "" : "disabled"}>
      <strong>${escapeHtml(tool.label)}</strong><span>${escapeHtml(tool.description)}</span>
    </button>`).join("");
}

function renderActivityChecks() {
  if (!state.activityRun.checks.length) return "";
  return `<div class="activity-checks">${state.activityRun.checks.map((check) => `
    <div class="activity-check ${check.passed ? "passed" : "failed"}">
      <span class="activity-check-mark">${check.passed ? "✓" : "×"}</span>
      <span>${escapeHtml(check.label)}</span>
      ${check.passed ? "" : `<code>${escapeHtml(check.error || check.actual || `expected ${check.expected}`)}</code>`}
    </div>`).join("")}</div>`;
}

function renderActivityPanel(activity) {
  if (!activity) return "";
  const busy = state.activityRun.status === "opening" || state.activityRun.status === "running";
  return `<section class="activity-panel">
    <div class="activity-kicker"><span>${escapeHtml(activity.level)}</span><span>${escapeHtml(activity.toolsetId)}</span></div>
    <h2>${escapeHtml(activity.title)}</h2>
    <p>${escapeHtml(activity.summary)}</p>
    <ol>${activity.instructions.map((instruction) => `<li>${escapeHtml(instruction)}</li>`).join("")}</ol>
    ${renderActivityChecks()}
    ${state.activityRun.message ? `<div class="activity-message ${escapeHtml(state.activityRun.status)}">${escapeHtml(state.activityRun.message)}</div>` : ""}
    <div class="activity-actions">
      <button id="activity-open-button" class="secondary-button" ${busy ? "disabled" : ""}>Open</button>
      <button id="activity-check-button" class="primary-button" ${busy || state.runtimeStatus !== "ready" ? "disabled" : ""}>Check</button>
      <button id="activity-reset-button" class="text-button" ${busy ? "disabled" : ""}>Reset</button>
    </div>
  </section>`;
}

function instantSummary() {
  if (!state.instarepl.enabled) return "InstaREPL off";
  if (!state.instarepl.candidate) return "InstaREPL ready";
  return `Line ${state.instarepl.candidate.endLine} · ${state.instarepl.status}`;
}

function renderInstaReplRailContents() {
  const lineCount = Math.max(1, state.content.split("\n").length);
  const height = Math.ceil(lineCount * 18.15 + 96);
  let body = '<div class="instarepl-empty">Place the cursor in a complete form.</div>';

  if (!state.instarepl.enabled) {
    body = '<div class="instarepl-empty">Live evaluation is off.</div>';
  } else if (state.instarepl.candidate) {
    const candidate = state.instarepl.candidate;
    const top = Math.max(10, 14 + (candidate.endLine - 1) * 18.15);
    const status = state.instarepl.status;
    const text = status === "ok"
      ? state.instarepl.display
      : status === "error"
        ? state.instarepl.error
        : status === "evaluating"
          ? "evaluating…"
          : "queued…";
    body = `<div class="instarepl-result ${escapeHtml(status)}" style="top:${top}px" title="${escapeHtml(text)}">
      <span class="instarepl-marker">${status === "ok" ? "→" : status === "error" ? "!" : "·"}</span>
      <code>${escapeHtml(text)}</code>
      <small>${escapeHtml(candidate.kind)} · ${candidate.startLine === candidate.endLine ? `line ${candidate.endLine}` : `lines ${candidate.startLine}–${candidate.endLine}`}</small>
    </div>`;
  }

  return `<div class="instarepl-canvas" style="height:${height}px">${body}</div>`;
}

export function render(bindEvents) {
  document.documentElement.dataset.theme = state.theme;
  const sourceLabel = state.metadata.source === "github"
    ? `${state.metadata.owner}/${state.metadata.repository}`
    : state.metadata.source === "example"
      ? `Example · ${state.metadata.title || state.metadata.example}`
      : "Local workspace";
  const toolset = toolsetById(state.toolsetId) || TOOLSETS[0];
  const activity = activityById(state.activityId) || ACTIVITIES[0];
  const haraSourceSelected = Boolean(state.selectedPath && isHaraSource(state.selectedPath));

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
          <button id="instarepl-toggle" class="live-button ${state.instarepl.enabled ? "active" : ""}" aria-pressed="${state.instarepl.enabled}" title="Toggle InstaREPL (Ctrl/Cmd+Shift+Enter)" ${haraSourceSelected ? "" : "disabled"}><i></i><span>InstaREPL</span></button>
          <button id="save-button" class="icon-button" title="Save file (Ctrl/Cmd+S)">${icon("save")}</button>
          <button id="eval-form-button" class="secondary-button" title="Evaluate selection or enclosing form (Alt+Enter)" ${haraSourceSelected ? "" : "disabled"}>${icon("terminal")} Eval form</button>
          <button id="run-button" class="primary-button" title="Evaluate file (Ctrl/Cmd+Enter)" ${haraSourceSelected ? "" : "disabled"}>${icon("play")} Run file</button>
          <button id="reset-button" class="icon-button" title="Reset runtime">${icon("refresh")}</button>
          <button id="theme-button" class="icon-button" title="Toggle theme">${icon(state.theme === "dark" ? "sun" : "moon")}</button>
        </div>
      </header>

      <div class="workspace-strip">
        <span class="workspace-source">${icon("github")} ${escapeHtml(sourceLabel)}</span>
        <span>${icon("branch")} ${escapeHtml(state.metadata.branch || "main")}</span>
        ${state.metadata.source !== "local" ? '<button id="local-workspace-button" class="strip-button">Open local workspace</button>' : ""}
        <label class="strip-select"><span>Toolset</span><select id="toolset-select">${renderToolsetOptions()}</select></label>
        <label class="strip-select"><span>Activity</span><select id="activity-select">${renderActivityOptions()}</select></label>
        <span class="runtime-pill ${state.runtimeStatus}"><i></i>${escapeHtml(state.runtimeStatus)}</span>
        ${state.importProgress ? `<span class="import-progress">${escapeHtml(state.importProgress)}</span>` : ""}
      </div>

      <main class="workbench">
        <aside class="explorer panel">
          <div class="panel-heading"><span>EXPLORER</span><div><button id="new-file-button" class="mini-button" title="New file">${icon("plus")}</button><button id="delete-file-button" class="mini-button" title="Delete selected file">${icon("trash")}</button></div></div>
          <div class="project-title">${escapeHtml(state.workspace)}</div>
          <nav class="file-tree">${renderTree(groupFiles(state.files))}</nav>
          ${renderActivityPanel(activity)}
        </aside>

        <section class="editor-panel panel">
          <div class="editor-tabs"><div class="editor-tab active">${icon("file")}<span>${escapeHtml(state.selectedPath ? fileName(state.selectedPath) : "No file")}</span>${state.dirty ? '<i class="dirty-dot"></i>' : ""}</div></div>
          <div class="editor-meta"><span>${escapeHtml(state.selectedPath || "Select a file")}</span><span id="instarepl-summary">${escapeHtml(haraSourceSelected ? instantSummary() : (state.selectedPath ? fileLanguage(state.selectedPath) : ""))}</span></div>
          <div class="editor-tools"><div class="toolset-copy"><strong>${escapeHtml(toolset.title)}</strong><span>${escapeHtml(toolset.description)}</span></div><div class="tool-chips">${renderTools(toolset)}</div></div>
          <div class="editor-wrap ${haraSourceSelected ? "with-instarepl" : ""}">
            <div class="line-rail" id="line-rail">${state.content.split("\n").map((_, index) => `<span>${index + 1}</span>`).join("")}</div>
            <textarea id="editor" spellcheck="false" autocomplete="off" autocapitalize="off" ${state.selectedPath ? "" : "disabled"}>${escapeHtml(state.content)}</textarea>
            ${haraSourceSelected ? `<aside id="instarepl-rail" class="instarepl-rail ${state.instarepl.enabled ? "enabled" : "disabled"}" aria-live="polite">${renderInstaReplRailContents()}</aside>` : ""}
          </div>
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
        <span id="status-namespace">Namespace: ${escapeHtml(state.namespace)}</span>
        <span>${state.files.length} files</span>
        <span>${escapeHtml(toolset.shortTitle)} toolset · ${escapeHtml(activity.title)}</span>
        <span>Hara ${escapeHtml(state.runtimeKind)} runtime · Web Worker</span>
      </footer>
    </div>`;
  bindEvents();
  const preview = document.querySelector("#preview");
  preview.srcdoc = state.preview;
  updateReplOnly();
  const editor = document.querySelector("#editor");
  const instantRail = document.querySelector("#instarepl-rail");
  if (editor && instantRail) instantRail.scrollTop = editor.scrollTop;
}

export function updateEditorOnly() {
  const rail = document.querySelector("#line-rail");
  if (rail) rail.innerHTML = state.content.split("\n").map((_, index) => `<span>${index + 1}</span>`).join("");
  const tab = document.querySelector(".editor-tab");
  if (tab && state.dirty && !tab.querySelector(".dirty-dot")) tab.insertAdjacentHTML("beforeend", '<i class="dirty-dot"></i>');
  const saveStatus = document.querySelector(".statusbar span:first-child");
  if (saveStatus) saveStatus.textContent = state.dirty ? "Unsaved changes" : "Workspace saved";
  updateInstaReplOnly();
}

export function updateInstaReplOnly() {
  const rail = document.querySelector("#instarepl-rail");
  if (rail) {
    rail.classList.toggle("enabled", state.instarepl.enabled);
    rail.classList.toggle("disabled", !state.instarepl.enabled);
    rail.innerHTML = renderInstaReplRailContents();
    const editor = document.querySelector("#editor");
    if (editor) rail.scrollTop = editor.scrollTop;
  }
  const summary = document.querySelector("#instarepl-summary");
  if (summary && state.selectedPath && isHaraSource(state.selectedPath)) summary.textContent = instantSummary();
  const namespace = document.querySelector("#status-namespace");
  if (namespace) namespace.textContent = `Namespace: ${state.namespace}`;
}

export function updateReplOnly() {
  const output = document.querySelector("#repl-output");
  if (!output) return;
  output.innerHTML = renderRepl();
  output.scrollTop = output.scrollHeight;
}
