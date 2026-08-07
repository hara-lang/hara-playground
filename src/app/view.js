import { app, state } from "./context.js";
import { isHaraSource } from "../workspace/project.js";
import { highlightHara } from "../editor/lisp.js";
import { updateHodosRepl } from "../hodos/repl.js";
import {
  ACTIVITIES,
  TOOLSETS,
  activitiesForToolset,
  activityById,
  toolsetById
} from "../studio/catalog.js";
import { FEATURED_PROJECTS, PLAYGROUND_NICETIES, projectDeepLink, repositoryLabel } from "../studio/projects.js";
import { icon, haraMark, escapeHtml, fileName, fileLanguage, groupFiles, renderTree, renderRepl } from "./view-helpers.js";

const EDITOR_LINE_HEIGHT = 22;
const EDITOR_PADDING_TOP = 18;

function renderThemeButton(id = "theme-button") {
  return `<button id="${id}" class="icon-button" type="button" title="Use ${state.theme === "dark" ? "light" : "dark"} appearance">${icon(state.theme === "dark" ? "sun" : "moon")}</button>`;
}

function renderProjectCards() {
  return FEATURED_PROJECTS.map((project) => `
    <article class="project-card ${project.primary ? "project-card--primary" : ""}" data-field="${escapeHtml(project.field)}">
      <div class="project-card__signal"><span></span><span></span><span></span></div>
      <p class="hara-kicker">${escapeHtml(project.eyebrow)}</p>
      <h3>${escapeHtml(project.title)}</h3>
      <p>${escapeHtml(project.description)}</p>
      <ul>${project.capabilities.map((capability) => `<li>${escapeHtml(capability)}</li>`).join("")}</ul>
      <div class="project-card__actions">
        <a class="primary-action" href="${escapeHtml(projectDeepLink(project, globalThis.location?.pathname || "./"))}" data-project-id="${escapeHtml(project.id)}">${escapeHtml(project.action)} ${icon("play")}</a>
        <a class="source-action" href="${escapeHtml(project.sourceUrl)}" target="_blank" rel="noreferrer">GitHub ${icon("external")}</a>
      </div>
    </article>`).join("");
}

function renderResumeCard() {
  const resume = state.home.resume;
  if (!resume) return "";
  const label = resume.metadata?.source === "github"
    ? `${resume.metadata.owner}/${resume.metadata.repository}${resume.metadata.path ? `/${resume.metadata.path}` : ""}`
    : "Local scratch project";
  return `<article class="resume-card hara-surface">
    <div class="resume-card__mark">${icon("code")}</div>
    <div><p class="hara-kicker">CONTINUE</p><h3>${escapeHtml(label)}</h3><p>${resume.fileCount} browser-persisted files · ${escapeHtml(resume.workspace)}</p></div>
    <button id="resume-workspace-button" class="secondary-action" type="button">Resume project</button>
  </article>`;
}

function renderProjectLobby() {
  return `<div class="project-lobby">
    <header class="lobby-header">
      <a class="lobby-brand" href="./" aria-label="Hara Playground home">${haraMark("Hara Playground")}<span><strong>Hara</strong><em>Playground</em></span></a>
      <nav class="lobby-nav" aria-label="Hara links">
        <a href="https://www.hara-lang.org" target="_blank" rel="noreferrer">Hara</a>
        <a href="https://docs.hara-lang.org" target="_blank" rel="noreferrer">Docs</a>
        <a href="https://github.com/hara-lang/hara-playground" target="_blank" rel="noreferrer">Source</a>
        ${renderThemeButton("home-theme-button")}
      </nav>
    </header>

    <main class="lobby-main">
      <section class="lobby-hero">
        <div class="lobby-hero__copy">
          <p class="hara-kicker">BROWSER KERNEL · LIVE LISP</p>
          <h1>Open a project.<br><i>Shape it live.</i></h1>
          <p class="lobby-lede">Load a public GitHub project into a persistent Hara kernel, edit structural forms, and watch values and interfaces change without leaving the browser.</p>
          <form id="home-repo-form" class="repository-open-form">
            <label><span>${icon("github")} GitHub project</span><input id="home-repo-input" name="repository" autocomplete="off" spellcheck="false" placeholder="owner/repository or a GitHub URL" ${state.importBusy ? "disabled" : ""}></label>
            <button class="primary-action" type="submit" ${state.importBusy ? "disabled" : ""}>${state.importBusy ? "Opening…" : `Open in kernel ${icon("play")}`}</button>
          </form>
          ${state.importProgress ? `<div class="import-progress-card"><i></i><span>${escapeHtml(state.importProgress)}</span></div>` : ""}
          ${state.home.error ? `<p class="home-error" role="alert">${escapeHtml(state.home.error)}</p>` : ""}
          <div class="kernel-promise"><span class="kernel-promise__dot"></span><strong>Browser-owned session</strong><span>Repository files, evaluation state and preview effects stay inside the Playground origin.</span></div>
        </div>
        <div class="lobby-hero__artifact hara-surface" aria-label="Hara kernel editor preview">
          <div class="artifact-header"><span><i></i> kernel / ready</span><span>app.core</span></div>
          <pre><code><span class="demo-p0">(</span><span class="demo-special">defn</span> card <span class="demo-p1">[</span>title body<span class="demo-p1">]</span>
  <span class="demo-p1">[</span><span class="demo-keyword">:article</span> <span class="demo-p2">{</span><span class="demo-keyword">:class</span> <span class="demo-string">"card"</span><span class="demo-p2">}</span>
   <span class="demo-p2">[</span><span class="demo-keyword">:h1</span> title<span class="demo-p2">]</span>
   <span class="demo-p2">[</span><span class="demo-keyword">:p</span> body<span class="demo-p2">]</span><span class="demo-p1">]</span><span class="demo-p0">)</span>

<span class="demo-p0">(</span>card <span class="demo-string">"Inspectable computation"</span>
      <span class="demo-string">"Every form stays live."</span><span class="demo-p0">)</span></code></pre>
          <div class="artifact-result"><span>→</span><code>[:article {:class "card"} …]</code><em>kernel value</em></div>
        </div>
      </section>

      ${renderResumeCard()}

      <section class="project-collection" id="projects">
        <header class="section-heading"><div><p class="hara-kicker">TRY A REAL REPOSITORY</p><h2>Sample GitHub projects</h2></div><p>These cards open complete project directories from <code>hara-lang/hara-playground</code>. The browser imports only that subproject and boots every source file in the kernel.</p></header>
        <div class="project-grid">${renderProjectCards()}</div>
      </section>

      <section class="lisp-niceties hara-surface">
        <header><p class="hara-kicker">LISP, NOT A GENERIC TEXT BOX</p><h2>Structural editing is part of the Playground.</h2></header>
        <div class="nicety-grid">${PLAYGROUND_NICETIES.map((feature, index) => `<article><span>0${index + 1}</span><h3>${escapeHtml(feature.title)}</h3><p>${escapeHtml(feature.description)}</p></article>`).join("")}</div>
      </section>

      <section class="local-project-cta">
        <div><p class="hara-kicker">NO REPOSITORY YET?</p><h2>Start with a local browser project.</h2><p>It is persisted in OPFS when available and uses the same kernel, editor and project model as imported GitHub work.</p></div>
        <button id="local-workspace-button" class="secondary-action" type="button">Open local scratch</button>
      </section>
    </main>

    <footer class="lobby-footer"><span>HARA / PLAYGROUND</span><span>Persistent kernel · structural editor · GitHub projects</span></footer>
  </div>`;
}

function renderToolsetOptions() {
  return TOOLSETS.map((toolset) => `<option value="${escapeHtml(toolset.id)}" ${toolset.id === state.toolsetId ? "selected" : ""}>${escapeHtml(toolset.title)}</option>`).join("");
}

function renderActivityOptions() {
  return activitiesForToolset(state.toolsetId).map((activity) => `<option value="${escapeHtml(activity.id)}" ${activity.id === state.activityId ? "selected" : ""}>${escapeHtml(activity.title)}</option>`).join("");
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
      <button id="activity-open-button" class="quiet-action" ${busy ? "disabled" : ""}>Open</button>
      <button id="activity-check-button" class="primary-mini" ${busy || state.runtimeStatus !== "ready" ? "disabled" : ""}>Check</button>
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
  const height = Math.ceil(lineCount * EDITOR_LINE_HEIGHT + 120);
  let body = '<div class="instarepl-empty">Place the cursor in a complete form.</div>';

  if (!state.instarepl.enabled) {
    body = '<div class="instarepl-empty">Live evaluation is off.</div>';
  } else if (state.instarepl.candidate) {
    const candidate = state.instarepl.candidate;
    const top = Math.max(10, EDITOR_PADDING_TOP + (candidate.endLine - 1) * EDITOR_LINE_HEIGHT);
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

function renderCompletionPopup() {
  const completion = state.editor.completion;
  const hidden = !completion.open || !completion.items.length;
  return `<div id="completion-popup" class="completion-popup ${hidden ? "hidden" : ""}" role="listbox" style="--completion-line:${completion.line};--completion-column:${completion.column}">
    ${hidden ? "" : completion.items.map((item, index) => `<button type="button" role="option" aria-selected="${index === completion.selected}" class="completion-item ${index === completion.selected ? "selected" : ""}" data-completion-index="${index}"><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.detail || item.kind || "symbol")}</small></button>`).join("")}
  </div>`;
}

function sourceLabel() {
  if (state.metadata.source === "github") {
    return `${state.metadata.owner}/${state.metadata.repository}${state.metadata.path ? `/${state.metadata.path}` : ""}`;
  }
  if (state.metadata.source === "example") return `Example · ${state.metadata.title || state.metadata.example}`;
  return "Local browser project";
}

function renderEditor(toolset) {
  const haraSourceSelected = Boolean(state.selectedPath && isHaraSource(state.selectedPath));
  const language = state.selectedPath ? fileLanguage(state.selectedPath) : "";
  const highlighted = haraSourceSelected && state.editor.rainbow
    ? highlightHara(state.content, state.editor.cursor)
    : `${escapeHtml(state.content)}${state.content.endsWith("\n") ? " " : ""}`;
  return `<section class="editor-panel hara-surface">
    <header class="editor-header">
      <div class="editor-tab">${icon("file")}<span>${escapeHtml(state.selectedPath ? fileName(state.selectedPath) : "No file selected")}</span>${state.dirty ? '<i class="dirty-dot"></i>' : ""}</div>
      <div class="editor-actions">
        <button id="save-button" class="icon-button" title="Save file (Ctrl/Cmd+S)">${icon("save")}</button>
        <button id="eval-form-button" class="quiet-action" title="Evaluate selection or enclosing form (Alt+Enter)" ${haraSourceSelected ? "" : "disabled"}>${icon("terminal")} Eval form</button>
        <button id="run-button" class="primary-mini" title="Load file into kernel (Ctrl/Cmd+Enter)" ${haraSourceSelected ? "" : "disabled"}>${icon("play")} Run file</button>
      </div>
    </header>
    <div class="editor-meta"><span>${escapeHtml(state.selectedPath || "Select a project file")}</span><span id="instarepl-summary">${escapeHtml(haraSourceSelected ? instantSummary() : language)}</span></div>
    <div class="lisp-toolbar">
      <div class="editor-modes">
        <button id="rainbow-toggle" class="mode-chip ${state.editor.rainbow ? "active" : ""}" aria-pressed="${state.editor.rainbow}" ${haraSourceSelected ? "" : "disabled"}><i></i>Rainbow</button>
        <button id="paredit-toggle" class="mode-chip ${state.editor.paredit ? "active" : ""}" aria-pressed="${state.editor.paredit}" ${haraSourceSelected ? "" : "disabled"}>${icon("command")} Paredit</button>
        <button id="instarepl-toggle" class="mode-chip ${state.instarepl.enabled ? "active" : ""}" aria-pressed="${state.instarepl.enabled}" ${haraSourceSelected ? "" : "disabled"}><i></i>InstaREPL</button>
        <span class="mode-chip passive">${icon("kernel")} Kernel completion</span>
      </div>
      <div class="structural-actions" aria-label="Structural editing commands">
        <button data-structural-action="expand" title="Expand structural selection (Alt+ArrowUp)">Select</button>
        <button data-structural-action="wrap" title="Wrap form in parentheses (Ctrl/Cmd+Shift+9)">${icon("wrap")} Wrap</button>
        <button data-structural-action="slurp" title="Forward slurp (Ctrl/Cmd+Alt+Right)">${icon("slurp")} Slurp</button>
        <button data-structural-action="barf" title="Forward barf (Ctrl/Cmd+Alt+Left)">${icon("barf")} Barf</button>
        <button data-structural-action="format" title="Format buffer (Ctrl/Cmd+Shift+F)">${icon("format")} Format</button>
      </div>
    </div>
    <div class="toolset-strip"><div><label>Toolset<select id="toolset-select">${renderToolsetOptions()}</select></label><span>${escapeHtml(toolset.description)}</span></div><div class="tool-chips">${renderTools(toolset)}</div></div>
    <div class="editor-wrap ${haraSourceSelected ? "with-instarepl" : ""}">
      <div class="line-rail" id="line-rail">${state.content.split("\n").map((_, index) => `<span>${index + 1}</span>`).join("")}</div>
      <div id="editor-code-layer" class="editor-code-layer ${haraSourceSelected && state.editor.rainbow ? "syntax-enabled" : ""}">
        <pre id="editor-highlight" class="editor-highlight" aria-hidden="true">${highlighted}</pre>
        <textarea id="editor" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Hara source editor" ${state.selectedPath ? "" : "disabled"}>${escapeHtml(state.content)}</textarea>
        ${renderCompletionPopup()}
      </div>
      ${haraSourceSelected ? `<aside id="instarepl-rail" class="instarepl-rail ${state.instarepl.enabled ? "enabled" : "disabled"}" aria-live="polite">${renderInstaReplRailContents()}</aside>` : ""}
    </div>
    <footer class="editor-status"><span id="structural-message">${escapeHtml(state.editor.structuralMessage || "Balanced editing ready")}</span><span>${haraSourceSelected ? "Ctrl+Space complete · Alt+Enter eval · Ctrl+Enter run" : language}</span></footer>
  </section>`;
}

function renderOutputPanel() {
  const valueAvailable = Boolean(state.valueInspector?.valueId);
  const mode = state.outputTab === "value" ? "retained kernel value" : "kernel effects";
  return `<aside class="output-panel hara-surface">
    <header class="output-tabs">
      <button class="output-tab ${state.outputTab === "preview" ? "active" : ""}" data-output-tab="preview">${icon("eye")} Preview</button>
      <button class="output-tab ${state.outputTab === "repl" ? "active" : ""}" data-output-tab="repl">${icon("terminal")} REPL</button>
      <button class="output-tab ${state.outputTab === "value" ? "active" : ""}" data-output-tab="value" ${valueAvailable ? "" : "disabled"}>${icon("list")} Value</button>
      <span class="preview-mode">${mode}</span>
    </header>
    <section class="preview-view ${state.outputTab === "preview" ? "active" : ""}"><iframe id="preview" title="Hara preview" sandbox="" referrerpolicy="no-referrer"></iframe></section>
    <section class="repl-view ${state.outputTab === "repl" ? "active" : ""}">
      <div class="repl-toolbar"><span>${escapeHtml(state.namespace)} namespace</span><button id="clear-repl-button" class="text-button">Clear</button></div>
      <div id="repl-output" class="repl-output">${renderRepl()}</div>
      <form id="repl-form" class="repl-form"><span>${escapeHtml(state.namespace)}=&gt;</span><input id="repl-input" aria-label="REPL input" autocomplete="off" spellcheck="false" placeholder="(+ 1 2)" ${state.runtimeStatus !== "ready" ? "disabled" : ""}></form>
    </section>
    <section class="value-view ${state.outputTab === "value" ? "active" : ""}" aria-label="Retained value inspector">
      <div class="value-inspector-placeholder">Select <strong>Inspect</strong> beside a retained REPL result.</div>
    </section>
  </aside>`;
}

function renderWorkbench() {
  const toolset = toolsetById(state.toolsetId) || TOOLSETS[0];
  const activity = activityById(state.activityId) || ACTIVITIES[0];
  const repositoryUrl = state.metadata.url || (state.metadata.source === "github" ? `https://github.com/${state.metadata.owner}/${state.metadata.repository}` : null);
  return `<div class="playground-shell">
    <header class="workbench-header hara-surface">
      <button id="projects-home-button" class="brand-button" type="button" title="Open project browser">${haraMark("Hara Playground")}<span><strong>Hara</strong><em>Playground</em></span></button>
      <div class="project-identity"><span>${icon(state.metadata.source === "github" ? "github" : "code")}</span><div><strong>${escapeHtml(sourceLabel())}</strong><small>${escapeHtml(state.metadata.branch || "browser")}${state.metadata.commit ? ` · ${escapeHtml(state.metadata.commit.slice(0, 8))}` : ""}</small></div>${repositoryUrl ? `<a href="${escapeHtml(repositoryUrl)}" target="_blank" rel="noreferrer" title="Open source repository">${icon("external")}</a>` : ""}</div>
      <div class="workbench-actions">
        <button id="open-projects-button" class="quiet-action">${icon("folder")} Projects</button>
        <button id="reset-button" class="icon-button" title="Reset kernel">${icon("refresh")}</button>
        ${renderThemeButton()}
      </div>
    </header>

    <div class="kernel-ribbon">
      <span class="runtime-pill ${state.runtimeStatus}"><i></i><strong>Kernel</strong> ${escapeHtml(state.runtimeStatus)}</span>
      <span>${escapeHtml(state.runtimeKind)}</span>
      <span>${escapeHtml(state.namespace)}</span>
      <span>${state.files.length} files</span>
      ${state.importProgress ? `<span class="import-progress">${escapeHtml(state.importProgress)}</span>` : ""}
    </div>

    <main class="workbench-grid">
      <aside class="project-panel hara-surface">
        <header class="panel-heading"><span>${icon("folder")} Project</span><div><button id="new-file-button" class="mini-button" title="New file">${icon("plus")}</button><button id="delete-file-button" class="mini-button" title="Delete selected file">${icon("trash")}</button></div></header>
        <div class="project-path"><strong>${escapeHtml(state.workspace)}</strong><span>${escapeHtml(state.metadata.path || "project root")}</span></div>
        <nav class="file-tree">${renderTree(groupFiles(state.files))}</nav>
        <div class="activity-selector"><label>Activity<select id="activity-select">${renderActivityOptions()}</select></label></div>
        ${renderActivityPanel(activity)}
      </aside>
      ${renderEditor(toolset)}
      ${renderOutputPanel()}
    </main>

    <footer class="statusbar">
      <span>${state.dirty ? "Unsaved changes" : "Workspace saved"}</span>
      <span id="status-namespace">${escapeHtml(state.namespace)}</span>
      <span>${state.editor.paredit ? "Paredit on" : "Plain editing"}</span>
      <span>${state.editor.rainbow ? "Rainbow parens" : "Syntax plain"}</span>
      <span>Hara ${escapeHtml(state.runtimeKind)} · Web Worker</span>
    </footer>
  </div>`;
}

export function render(bindEvents) {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.screen = state.screen;
  app.innerHTML = state.screen === "projects" ? renderProjectLobby() : renderWorkbench();
  bindEvents();
  if (state.screen !== "workspace") return;
  const preview = document.querySelector("#preview");
  if (preview) preview.srcdoc = state.preview;
  updateReplOnly();
  const editor = document.querySelector("#editor");
  if (editor) {
    const start = Math.min(state.editor.selectionStart, editor.value.length);
    const end = Math.min(Math.max(start, state.editor.selectionEnd), editor.value.length);
    editor.setSelectionRange(start, end);
    const instantRail = document.querySelector("#instarepl-rail");
    if (instantRail) instantRail.scrollTop = editor.scrollTop;
    const highlight = document.querySelector("#editor-highlight");
    if (highlight) {
      highlight.scrollTop = editor.scrollTop;
      highlight.scrollLeft = editor.scrollLeft;
    }
  }
}

export function updateEditorHighlight() {
  const highlight = document.querySelector("#editor-highlight");
  if (!highlight) return;
  const haraSourceSelected = Boolean(state.selectedPath && isHaraSource(state.selectedPath));
  highlight.innerHTML = haraSourceSelected && state.editor.rainbow
    ? highlightHara(state.content, state.editor.cursor)
    : `${escapeHtml(state.content)}${state.content.endsWith("\n") ? " " : ""}`;
  document.querySelector("#editor-code-layer")?.classList.toggle("syntax-enabled", haraSourceSelected && state.editor.rainbow);
}

export function updateEditorOnly() {
  const rail = document.querySelector("#line-rail");
  if (rail) rail.innerHTML = state.content.split("\n").map((_, index) => `<span>${index + 1}</span>`).join("");
  updateEditorHighlight();
  const tab = document.querySelector(".editor-tab");
  if (tab && state.dirty && !tab.querySelector(".dirty-dot")) tab.insertAdjacentHTML("beforeend", '<i class="dirty-dot"></i>');
  const saveStatus = document.querySelector(".statusbar span:first-child");
  if (saveStatus) saveStatus.textContent = state.dirty ? "Unsaved changes" : "Workspace saved";
  updateInstaReplOnly();
  updateCompletionOnly();
}

export function updateCompletionOnly() {
  const popup = document.querySelector("#completion-popup");
  if (!popup) return;
  const completion = state.editor.completion;
  const hidden = !completion.open || !completion.items.length;
  popup.classList.toggle("hidden", hidden);
  popup.style.setProperty("--completion-line", completion.line);
  popup.style.setProperty("--completion-column", completion.column);
  popup.innerHTML = hidden ? "" : completion.items.map((item, index) => `<button type="button" role="option" aria-selected="${index === completion.selected}" class="completion-item ${index === completion.selected ? "selected" : ""}" data-completion-index="${index}"><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.detail || item.kind || "symbol")}</small></button>`).join("");
  popup.querySelector(".completion-item.selected")?.scrollIntoView({ block: "nearest" });
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
  if (namespace) namespace.textContent = state.namespace;
}

export function updateReplOnly() {
  if (updateHodosRepl(state)) return;
  const output = document.querySelector("#repl-output");
  if (!output) return;
  output.innerHTML = renderRepl();
  output.scrollTop = output.scrollHeight;
}
