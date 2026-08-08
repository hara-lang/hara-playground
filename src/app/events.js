import {
  STUDIO_SETTING_KEYS,
  getCompletionTimer,
  getInstantTimer,
  getSaveTimer,
  renderNow as render,
  runtime,
  setCompletionTimer,
  setInstantTimer,
  setSaveTimer,
  state,
  store
} from "./context.js";
import { isHaraSource } from "../workspace/project.js";
import { catalogWorkspacePatch } from "../hodos/catalog-events.js";
import { documentWorkspacePatch } from "../hodos/document-events.js";
import {
  editWorkspaceDocumentText,
  selectWorkspaceDocumentNode,
} from "../hodos/document-state.js";
import { workspaceShellPatch } from "../hodos/workspace-shell-events.js";
import {
  currentHodosWorkspaceDescriptor,
  updateHodosWorkspaceShell,
} from "../hodos/workspace-shell.js";
import { editorWorkspacePatch } from "../hodos/editor-events.js";
import { explorerWorkspacePatch } from "../hodos/explorer-events.js";
import {
  filterExplorerState,
  normalizeExplorerPath,
  projectExplorerEntries,
  toggleExplorerDirectory,
} from "../hodos/explorer-state.js";
import { updateHodosExplorer } from "../hodos/explorer.js";
import { replWorkspacePatch } from "../hodos/repl-events.js";
import { problemsWorkspacePatch } from "../hodos/problems-events.js";
import {
  appendProblemState,
  clearProblemsState,
  filterProblemsState,
  formatProblemForClipboard,
  problemById,
  problemFromDiagnostic,
  problemFromError,
  problemSelectionOffsets,
  selectProblemState,
} from "../hodos/problems-state.js";
import { updateHodosProblems } from "../hodos/problems.js";
import { valueInspectorWorkspacePatch } from "../hodos/value-inspector-events.js";
import {
  formatInspectableValue,
  inspectableType,
  projectInspectableValue,
  valueAtPath,
} from "../hodos/value-projector.js";
import { updateHodosValueInspector } from "../hodos/value-inspector.js";
import { updateHodosPreview } from "../hodos/preview.js";
import { previewDocument } from "../ui/hta.js";
import { instantCandidateChanged, instantFormAtCursor } from "../editor/instarepl.js";
import {
  backspaceBalanced,
  completionPrefixAt,
  contextAt,
  expandStructuralSelection,
  formatHara,
  forwardBarf,
  forwardSlurp,
  insertBalanced,
  skipClosing,
  smartNewline,
  wrapStructural
} from "../editor/lisp.js";
import { toolById } from "../studio/catalog.js";
import {
  updateCompletionOnly,
  updateEditorHighlight,
  updateEditorOnly,
  updateInstaReplOnly,
  updateReplOnly
} from "./view.js";
import {
  appendRepl,
  bootRuntime,
  checkActivity,
  evaluate,
  evaluateEditorForm,
  importRepository,
  openActivity,
  openFeaturedProject,
  openLocalWorkspace,
  refreshFiles,
  resetCompletion,
  resetInstantEvaluation,
  resetValueInspector,
  resumeWorkspace,
  runCurrentFile,
  saveCurrentFile,
  selectActivity,
  selectFile,
  selectWorkspaceShellArea,
  selectOutputTab,
  selectToolset,
  showProjectHome
} from "./actions.js";

const INSTANT_EVALUATION_DELAY = 420;
const COMPLETION_DELAY = 140;
const AUTO_COMPLETION_MINIMUM = 2;
const EDITOR_LINE_HEIGHT = 22;
const EDITOR_CHARACTER_WIDTH = 7.25;

let suppressCompletionOnce = false;

function writeSetting(key, value) {
  try {
    globalThis.localStorage?.setItem(key, String(value));
  } catch {
    // Editor preferences are optional.
  }
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  writeSetting(STUDIO_SETTING_KEYS.theme, state.theme);
  render();
}

function syncEditorScroll(editor) {
  const rail = document.querySelector("#line-rail");
  if (rail) rail.scrollTop = editor.scrollTop;
  const highlight = document.querySelector("#editor-highlight");
  if (highlight) {
    highlight.scrollTop = editor.scrollTop;
    highlight.scrollLeft = editor.scrollLeft;
  }
  const instantRail = document.querySelector("#instarepl-rail");
  if (instantRail) instantRail.scrollTop = editor.scrollTop;
}

function cursorCoordinates(source, offset) {
  const before = String(source).slice(0, offset);
  const lines = before.split("\n");
  return {
    line: Math.max(0, lines.length - 1),
    column: Math.max(0, lines.at(-1)?.length || 0)
  };
}

function setStructuralMessage(message) {
  state.editor.structuralMessage = message;
  const target = document.querySelector("#structural-message");
  if (target) target.textContent = message || "Balanced editing ready";
}

function applyEditorEdit(editor, edit, message, { completion = true } = {}) {
  if (!editor || !edit) {
    setStructuralMessage(message || "No structural form found at the cursor");
    return false;
  }
  const changed = edit.source !== editor.value;
  editor.value = edit.source;
  editor.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  if (changed) {
    suppressCompletionOnce = !completion;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    editor.dispatchEvent(new Event("select", { bubbles: true }));
    resetCompletion();
    updateCompletionOnly();
  }
  editor.focus();
  setStructuralMessage(message || "Structure updated");
  return true;
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

function completionCandidate(editor, force) {
  const current = contextAt(editor.value, editor.selectionEnd);
  if (current?.type === "comment" || current?.type === "string") return null;
  const candidate = completionPrefixAt(editor.value, editor.selectionEnd);
  if (candidate) return candidate;
  return force
    ? { prefix: "", start: editor.selectionEnd, end: editor.selectionEnd }
    : null;
}

async function loadCompletions(editor, candidate, request, force, sourceSnapshot) {
  try {
    const result = await runtime.complete(candidate.prefix, state.namespace, sourceSnapshot);
    if (request !== state.editor.completion.request || editor.value !== sourceSnapshot) return;
    const items = (result.items || [])
      .filter((item) => force || item.label !== candidate.prefix)
      .slice(0, 12);
    state.editor.completion.items = items;
    state.editor.completion.selected = 0;
    state.editor.completion.open = items.length > 0;
  } catch {
    if (request !== state.editor.completion.request) return;
    state.editor.completion.items = [];
    state.editor.completion.open = false;
  }
  updateCompletionOnly();
}

function scheduleCompletion(editor, { delay = COMPLETION_DELAY, force = false } = {}) {
  clearTimeout(getCompletionTimer());
  setCompletionTimer(null);

  if (suppressCompletionOnce) {
    suppressCompletionOnce = false;
    resetCompletion();
    updateCompletionOnly();
    return;
  }

  if (!editor || state.runtimeStatus !== "ready" || !state.selectedPath || !isHaraSource(state.selectedPath)) {
    resetCompletion();
    updateCompletionOnly();
    return;
  }

  const candidate = completionCandidate(editor, force);
  if (!candidate || (!force && candidate.prefix.length < AUTO_COMPLETION_MINIMUM)) {
    resetCompletion();
    updateCompletionOnly();
    return;
  }

  const coordinates = cursorCoordinates(editor.value, candidate.start);
  const request = state.editor.completion.request + 1;
  state.editor.completion = {
    ...state.editor.completion,
    open: false,
    items: [],
    selected: 0,
    prefix: candidate.prefix,
    start: candidate.start,
    end: candidate.end,
    request,
    line: coordinates.line,
    column: coordinates.column
  };
  const sourceSnapshot = editor.value;
  setCompletionTimer(setTimeout(() => loadCompletions(editor, candidate, request, force, sourceSnapshot), delay));
}

function moveCompletion(direction) {
  const completion = state.editor.completion;
  if (!completion.open || !completion.items.length) return false;
  completion.selected = (completion.selected + direction + completion.items.length) % completion.items.length;
  updateCompletionOnly();
  return true;
}

function acceptCompletion(editor, index = state.editor.completion.selected) {
  const completion = state.editor.completion;
  const item = completion.items[index];
  if (!editor || !completion.open || !item) return false;
  const source = `${editor.value.slice(0, completion.start)}${item.label}${editor.value.slice(completion.end)}`;
  const cursor = completion.start + item.label.length;
  suppressCompletionOnce = true;
  applyEditorEdit(editor, {
    source,
    selectionStart: cursor,
    selectionEnd: cursor
  }, `Completed ${item.label} · ${item.detail || item.kind || "kernel symbol"}`, { completion: false });
  resetCompletion();
  updateCompletionOnly();
  return true;
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
  const source = `${editor.value.slice(0, start)}${insertion}${editor.value.slice(end)}`;
  const cursor = start + insertion.length;
  applyEditorEdit(editor, { source, selectionStart: cursor, selectionEnd: cursor }, "Inserted tool template");
}

function runStructuralAction(action, editor) {
  if (!editor || editor.disabled || !state.selectedPath || !isHaraSource(state.selectedPath)) return false;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  let edit = null;
  let message = "";

  if (action === "expand") {
    edit = expandStructuralSelection(editor.value, start, end);
    message = edit ? "Expanded to the enclosing structural form" : "No larger enclosing form";
  } else if (action === "wrap") {
    edit = wrapStructural(editor.value, start, end, "(");
    message = "Wrapped form in parentheses";
  } else if (action === "slurp") {
    edit = forwardSlurp(editor.value, end);
    message = edit ? "Slurped the next form into this collection" : "No following form to slurp";
  } else if (action === "barf") {
    edit = forwardBarf(editor.value, end);
    message = edit ? "Barfed the final form out of this collection" : "No child form to barf";
  } else if (action === "format") {
    const source = formatHara(editor.value);
    const cursor = Math.min(end, source.length);
    edit = { source, selectionStart: cursor, selectionEnd: cursor };
    message = "Formatted the Hara buffer";
  }
  return applyEditorEdit(editor, edit, message, { completion: false });
}

function handlePareditKey(event, editor) {
  if (!state.editor.paredit || event.ctrlKey || event.metaKey || event.altKey) return false;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const source = editor.value;

  if (["(", "[", "{"].includes(event.key)) {
    event.preventDefault();
    return applyEditorEdit(editor, insertBalanced(source, start, end, event.key), `Inserted balanced ${event.key}${({ "(": ")", "[": "]", "{": "}" })[event.key]}`);
  }

  if ([")", "]", "}"].includes(event.key)) {
    const edit = skipClosing(source, start, end, event.key);
    if (edit) {
      event.preventDefault();
      return applyEditorEdit(editor, edit, "Moved over the matching delimiter", { completion: false });
    }
  }

  if (event.key === '"') {
    const skip = skipClosing(source, start, end, '"');
    if (skip) {
      event.preventDefault();
      return applyEditorEdit(editor, skip, "Moved over the closing quote", { completion: false });
    }
    const context = contextAt(source, start);
    if (start !== end || context?.type !== "string") {
      event.preventDefault();
      return applyEditorEdit(editor, insertBalanced(source, start, end, '"'), "Inserted balanced quotes");
    }
  }

  if (event.key === "Backspace") {
    const edit = backspaceBalanced(source, start, end);
    if (edit) {
      event.preventDefault();
      return applyEditorEdit(editor, edit, "Removed an empty delimiter pair", { completion: false });
    }
  }

  if (event.key === "Enter") {
    event.preventDefault();
    return applyEditorEdit(editor, smartNewline(source, start, end), "Inserted a structurally indented line", { completion: false });
  }

  return false;
}

function applyEditorWorkspaceSelection(selection, { highlight = true } = {}) {
  state.editor.selectionStart = selection.start;
  state.editor.selectionEnd = selection.end;
  state.editor.cursor = selection.end;
  if (highlight) updateEditorHighlight();
}

function applyEditorWorkspacePatch(patch) {
  const editor = document.querySelector("#editor");
  if (patch.kind === "change") {
    state.content = patch.source;
    state.dirty = true;
    applyEditorWorkspaceSelection(patch.selection, { highlight: false });
    updateEditorOnly();
    clearTimeout(getSaveTimer());
    setSaveTimer(setTimeout(() => saveCurrentFile(false), 900));
    scheduleInstantEvaluation(editor);
    scheduleCompletion(editor);
    return;
  }

  applyEditorWorkspaceSelection(patch.selection);
  scheduleInstantEvaluation(editor, { delay: 160 });
  if (!state.editor.completion.open) scheduleCompletion(editor, { delay: 100 });
}


async function applyWorkspaceShellPatch(patch) {
  selectWorkspaceShellArea(patch.areaId, patch.surfaceId);
  updateHodosWorkspaceShell(state);
}

async function applyDocumentWorkspacePatch(patch) {
  const view = state.workspaceShell?.view;
  if (!view) throw new Error("The current Workspace has no document model");
  const next = patch.kind === "select"
    ? selectWorkspaceDocumentNode(view, patch)
    : editWorkspaceDocumentText(view, patch);
  if (next === view) return;
  state.workspaceShell.view = next;
  updateHodosWorkspaceShell(state);
}

async function applyCatalogWorkspacePatch(patch) {
  if (patch.kind === "select-toolset") {
    if (!selectToolset(patch.toolsetId)) {
      throw new Error(`Catalog toolset is unavailable: ${patch.toolsetId}`);
    }
    return;
  }
  if (patch.kind === "select-activity") {
    if (!selectActivity(patch.activityId)) {
      throw new Error(`Catalog activity is unavailable: ${patch.activityId}`);
    }
    return;
  }
  if (patch.kind === "insert-tool") {
    const tool = toolById(patch.toolsetId, patch.toolId);
    if (!tool) throw new Error(`Catalog tool is unavailable: ${patch.toolsetId}/${patch.toolId}`);
    const editor = document.querySelector("#editor");
    if (!editor || editor.disabled || !state.selectedPath || !isHaraSource(state.selectedPath)) {
      throw new Error("Select a Hara source file before inserting a tool template");
    }
    insertToolSnippet(editor, tool.snippet);
    return;
  }

  if (patch.activityId !== state.activityId) {
    throw new Error(`Catalog activity is no longer selected: ${patch.activityId}`);
  }
  if (patch.kind === "open-activity") {
    await openActivity();
    return;
  }
  if (patch.kind === "check-activity") {
    await checkActivity();
    return;
  }
  if (patch.kind === "reset-activity") {
    if (confirm("Restore the starter source for this activity? Your edits in its activity file will be replaced.")) {
      await openActivity({ reset: true });
    }
  }
}


    async function applyExplorerWorkspacePatch(patch) {
      if (patch.kind === "select") {
        await selectFile(patch.path);
        return;
      }
      if (patch.kind === "toggle") {
        const entries = projectExplorerEntries(state.files, {
          selectedPath: state.selectedPath,
          dirty: state.dirty,
        });
        state.explorer = toggleExplorerDirectory(state.explorer, patch.path, entries);
        updateHodosExplorer(state);
        return;
      }
      if (patch.kind === "filter") {
        state.explorer = filterExplorerState(state.explorer, patch.query);
        updateHodosExplorer(state);
        return;
      }
      if (patch.kind === "refresh") {
        await refreshFiles(state.selectedPath);
        return;
      }
      if (patch.kind === "create") {
        if (patch.entryKind !== "file") {
          throw new Error("Empty directories are not represented by the current Workspace store");
        }
        const requested = patch.path ?? prompt("New workspace file", "src/app/new-file.hal");
        if (!requested) return;
        const path = normalizeExplorerPath(requested, "New workspace file");
        if (state.files.includes(path)) throw new Error(`${path} already exists`);
        await store.write(path, isHaraSource(path) ? `(ns app.new-file)\n\n` : "");
        await refreshFiles(path);
        return;
      }
      if (patch.kind === "delete") {
        if (!state.files.includes(patch.path)) throw new Error(`Workspace file is not present: ${patch.path}`);
        if (!confirm(`Delete ${patch.path} from this browser workspace?`)) return;
        await store.remove(patch.path);
        if (state.selectedPath === patch.path) state.selectedPath = null;
        await refreshFiles();
        return;
      }
      if (patch.kind === "rename") {
        if (!state.files.includes(patch.path)) throw new Error(`Workspace file is not present: ${patch.path}`);
        if (state.files.includes(patch.newPath)) throw new Error(`${patch.newPath} already exists`);
        const content = state.selectedPath === patch.path && state.dirty
          ? state.content
          : await store.read(patch.path);
        if (content == null) throw new Error(`Unable to read ${patch.path}`);
        await store.write(patch.newPath, content);
        await store.remove(patch.path);
        if (state.selectedPath === patch.path) state.selectedPath = patch.newPath;
        await refreshFiles(patch.newPath);
      }
    }

    function inspectorEntry(valueId) {
  return [...state.repl].reverse().find((entry) => entry.valueId === valueId) || null;
}

async function inspectRetainedValue(valueId) {
  const entry = inspectorEntry(valueId);
  const request = Number(state.valueInspector?.request || 0) + 1;
  const sameValue = state.valueInspector?.valueId === valueId;
  state.valueInspector = {
    request,
    valueId,
    requestId: entry?.requestId || null,
    status: "loading",
    display: entry?.text || "",
    value: sameValue ? state.valueInspector.value : null,
    valueType: sameValue ? state.valueInspector.valueType : null,
    namespace: entry?.namespace || state.namespace,
    source: entry?.source || null,
    path: sameValue ? state.valueInspector.path : [],
    expanded: sameValue ? state.valueInspector.expanded : [[]],
    metadata: { origin: "repl", retained: true },
    error: ""
  };
  state.outputTab = "value";
  writeSetting(STUDIO_SETTING_KEYS.output, "value");
  render();

  try {
    const inspected = await runtime.inspect(valueId);
    if (request !== state.valueInspector.request) return;
    state.valueInspector = {
      ...state.valueInspector,
      valueId: inspected.valueId || valueId,
      status: "ready",
      display: String(inspected.display ?? entry?.text ?? ""),
      value: projectInspectableValue(inspected.value),
      valueType: inspectableType(inspected.value),
      error: ""
    };
  } catch (error) {
    if (request !== state.valueInspector.request) return;
    state.valueInspector = {
      ...state.valueInspector,
      status: "error",
      error: error.message,
    };
  }
  updateHodosValueInspector(state);
}

async function applyReplWorkspacePatch(patch) {
  if (patch.kind === "input") {
    state.replInput = patch.source;
    return;
  }
  if (patch.kind === "clear") {
    state.repl = [];
    updateReplOnly();
    return;
  }
  if (patch.kind === "history") {
    state.historyIndex = Math.max(0, Math.min(
      state.history.length,
      state.historyIndex + patch.direction,
    ));
    state.replInput = state.history[state.historyIndex] || "";
    updateReplOnly();
    queueMicrotask(() => document.querySelector("#repl-input")?.focus());
    return;
  }
  if (patch.kind === "cancel") {
    runtime.cancel?.();
    return;
  }
  if (patch.kind === "inspect") {
    await inspectRetainedValue(patch.valueId);
    return;
  }
  if (patch.kind !== "submit" || !patch.source.trim()) return;

  state.replInput = "";
  state.history.push(patch.source);
  state.historyIndex = state.history.length;
  updateReplOnly();
  await evaluate(patch.source);
}

async function applyValueInspectorWorkspacePatch(patch) {
  if (patch.kind === "close") {
    resetValueInspector();
    render();
    return;
  }
  if (patch.kind === "refresh") {
    if (state.valueInspector.valueId) await inspectRetainedValue(state.valueInspector.valueId);
    return;
  }
  if (patch.kind === "select") {
    state.valueInspector.path = patch.path;
    updateHodosValueInspector(state);
    return;
  }
  if (patch.kind === "toggle") {
    const key = JSON.stringify(patch.path);
    const expanded = state.valueInspector.expanded || [];
    state.valueInspector.expanded = expanded.some((path) => JSON.stringify(path) === key)
      ? expanded.filter((path) => JSON.stringify(path) !== key)
      : [...expanded, patch.path];
    updateHodosValueInspector(state);
    return;
  }
  if (patch.kind === "copy") {
    const selected = valueAtPath(state.valueInspector.value, patch.path);
    const text = formatInspectableValue(selected);
    if (!globalThis.navigator?.clipboard?.writeText) {
      throw new Error("Clipboard access is unavailable in this browser context");
    }
    await globalThis.navigator.clipboard.writeText(text);
    state.valueInspector.metadata = {
      ...state.valueInspector.metadata,
      copied: true,
    };
    updateHodosValueInspector(state);
  }
}


    function recordRuntimeProblem(problem) {
      state.problems = appendProblemState(state.problems, problem);
      updateHodosProblems(state);
    }

    async function applyProblemsWorkspacePatch(patch) {
      if (patch.kind === "close") {
        state.outputTab = "repl";
        writeSetting(STUDIO_SETTING_KEYS.output, "repl");
        render();
        return;
      }
      if (patch.kind === "clear") {
        state.problems = clearProblemsState(state.problems);
        updateHodosProblems(state);
        return;
      }
      if (patch.kind === "filter") {
        state.problems = filterProblemsState(state.problems, patch);
        updateHodosProblems(state);
        return;
      }
      if (patch.kind === "select") {
        state.problems = selectProblemState(state.problems, patch.problemId);
        updateHodosProblems(state);
        return;
      }

      const problem = problemById(state.problems, patch.problemId);
      if (!problem) throw new Error(`Problem is no longer available: ${patch.problemId}`);
      state.problems = selectProblemState(state.problems, patch.problemId);

      if (patch.kind === "copy") {
        if (!globalThis.navigator?.clipboard?.writeText) {
          throw new Error("Clipboard access is unavailable in this browser context");
        }
        await globalThis.navigator.clipboard.writeText(formatProblemForClipboard(problem));
        updateHodosProblems(state);
        return;
      }

      if (patch.kind === "open-source") {
        if (!problem.path) throw new Error("This problem has no source path");
        if (!state.files.includes(problem.path)) {
          throw new Error(`Problem source is outside the current workspace: ${problem.path}`);
        }
        await selectFile(problem.path, false);
        const selection = problemSelectionOffsets(problem, state.content);
        if (selection) {
          state.editor.selectionStart = selection.start;
          state.editor.selectionEnd = selection.end;
          state.editor.cursor = selection.end;
        }
        render();
        queueMicrotask(() => document.querySelector("#editor")?.focus());
      }
    }

    function reportWorkspaceEventError(error) {
  appendRepl("error", `Workspace event rejected: ${error.message}`);
  updateReplOnly();
}

function handleHodosWorkspaceEvent(event) {
  try {
    const shellPatch = workspaceShellPatch(event.detail, currentHodosWorkspaceDescriptor());
    if (shellPatch) {
      void applyWorkspaceShellPatch(shellPatch).catch(reportWorkspaceEventError);
      return;
    }
    const documentPatch = documentWorkspacePatch(event.detail);
    if (documentPatch) {
      void applyDocumentWorkspacePatch(documentPatch).catch(reportWorkspaceEventError);
      return;
    }
    const catalogPatch = catalogWorkspacePatch(event.detail);
    if (catalogPatch) {
      void applyCatalogWorkspacePatch(catalogPatch).catch(reportWorkspaceEventError);
      return;
    }
    const editorPatch = editorWorkspacePatch(event.detail, state.content);
    if (editorPatch) {
      applyEditorWorkspacePatch(editorPatch);
      return;
    }
    const explorerPatch = explorerWorkspacePatch(event.detail);
    if (explorerPatch) {
      void applyExplorerWorkspacePatch(explorerPatch).catch(reportWorkspaceEventError);
      return;
    }
    const replPatch = replWorkspacePatch(event.detail);
    if (replPatch) {
      void applyReplWorkspacePatch(replPatch).catch(reportWorkspaceEventError);
      return;
    }
    const valuePatch = valueInspectorWorkspacePatch(event.detail);
    if (valuePatch) {
      void applyValueInspectorWorkspacePatch(valuePatch).catch(reportWorkspaceEventError);
      return;
    }
    const problemsPatch = problemsWorkspacePatch(event.detail);
    if (problemsPatch) {
      void applyProblemsWorkspacePatch(problemsPatch).catch(reportWorkspaceEventError);
    }
  } catch (error) {
    reportWorkspaceEventError(error);
  }
}

function bindProjectLobbyEvents() {
  document.querySelector("#home-theme-button")?.addEventListener("click", toggleTheme);
  document.querySelector("#home-repo-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    importRepository(new FormData(event.currentTarget).get("repository"));
  });
  document.querySelectorAll("[data-project-id]").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    openFeaturedProject(link.dataset.projectId);
  }));
  document.querySelector("#resume-workspace-button")?.addEventListener("click", resumeWorkspace);
  document.querySelector("#local-workspace-button")?.addEventListener("click", openLocalWorkspace);
}

function bindEditorEvents(editor) {
  if (!editor) return;

  editor.addEventListener("scroll", () => syncEditorScroll(editor));

  editor.addEventListener("keydown", (event) => {
    if (state.editor.completion.open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveCompletion(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveCompletion(-1);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        acceptCompletion(editor);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        resetCompletion();
        updateCompletionOnly();
        return;
      }
    }

    if ((event.ctrlKey || event.metaKey) && event.code === "Space") {
      event.preventDefault();
      scheduleCompletion(editor, { delay: 0, force: true });
      return;
    }
    if (event.altKey && event.key === "ArrowUp") {
      event.preventDefault();
      runStructuralAction("expand", editor);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === "(" || event.key === "9")) {
      event.preventDefault();
      runStructuralAction("wrap", editor);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      runStructuralAction("slurp", editor);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      runStructuralAction("barf", editor);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      runStructuralAction("format", editor);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "Enter") {
      event.preventDefault();
      toggleInstantEvaluation(editor);
      return;
    }
    if (event.altKey && event.key === "Enter") {
      event.preventDefault();
      evaluateEditorForm();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      runCurrentFile();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveCurrentFile();
      return;
    }

    if (handlePareditKey(event, editor)) return;

    if (event.key === "Tab") {
      event.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const source = `${editor.value.slice(0, start)}  ${editor.value.slice(end)}`;
      applyEditorEdit(editor, { source, selectionStart: start + 2, selectionEnd: start + 2 }, "Indented two spaces", { completion: false });
    }
  });

  const layer = document.querySelector("#editor-code-layer");
  layer?.addEventListener("mousedown", (event) => {
    const item = event.target.closest("[data-completion-index]");
    if (item) event.preventDefault();
  });
  layer?.addEventListener("click", (event) => {
    const item = event.target.closest("[data-completion-index]");
    if (item) acceptCompletion(editor, Number(item.dataset.completionIndex));
  });

  syncEditorScroll(editor);
}

function bindWorkbenchEvents() {
  const editor = document.querySelector("#editor");
  bindEditorEvents(editor);

  document.querySelector("#projects-home-button")?.addEventListener("click", () => showProjectHome());
  document.querySelector("#open-projects-button")?.addEventListener("click", () => showProjectHome());
  document.querySelector("#theme-button")?.addEventListener("click", toggleTheme);
  document.querySelector("#save-button")?.addEventListener("click", () => saveCurrentFile());
  document.querySelector("#eval-form-button")?.addEventListener("click", evaluateEditorForm);
  document.querySelector("#run-button")?.addEventListener("click", runCurrentFile);
  document.querySelector("#instarepl-toggle")?.addEventListener("click", () => toggleInstantEvaluation(editor));
  document.querySelector("#rainbow-toggle")?.addEventListener("click", () => {
    state.editor.rainbow = !state.editor.rainbow;
    writeSetting(STUDIO_SETTING_KEYS.rainbow, state.editor.rainbow);
    render();
  });
  document.querySelector("#paredit-toggle")?.addEventListener("click", () => {
    state.editor.paredit = !state.editor.paredit;
    writeSetting(STUDIO_SETTING_KEYS.paredit, state.editor.paredit);
    setStructuralMessage(state.editor.paredit ? "Paredit enabled" : "Paredit disabled; structural commands remain available");
    render();
  });
  document.querySelectorAll("[data-structural-action]").forEach((button) => button.addEventListener("click", () => runStructuralAction(button.dataset.structuralAction, editor)));
  document.querySelectorAll("[data-output-tab]").forEach((button) => button.addEventListener("click", () => selectOutputTab(button.dataset.outputTab)));

  document.querySelector("#reset-button")?.addEventListener("click", async () => {
    resetCompletion();
    await runtime.reset();
    await bootRuntime();
  });
}

export function bindEvents() {
  if (state.screen === "projects") bindProjectLobbyEvents();
  else bindWorkbenchEvents();
}

export function setupRuntimeEvents() {
  document.addEventListener("hodos:workspace-event", handleHodosWorkspaceEvent);
  runtime.addEventListener("stdout", (event) => {
    appendRepl("stdout", event.detail.text);
    updateReplOnly();
  });
  runtime.addEventListener("effect", (event) => {
    state.preview = previewDocument(event.detail.effect);
    updateHodosPreview({ document: state.preview, theme: state.theme });
  });
  runtime.addEventListener("diagnostic", (event) => {
    const problem = problemFromDiagnostic(event.detail, {
      source: "runtime",
      namespace: state.namespace,
      requestId: event.detail?.id,
      runtimeKind: state.runtimeKind,
    });
    recordRuntimeProblem(problem);
    appendRepl("diagnostic", problem.message, state.namespace, {
      requestId: problem.requestId,
    });
    updateReplOnly();
  });
  runtime.addEventListener("runtime-error", (event) => {
    state.runtimeStatus = "error";
    recordRuntimeProblem(problemFromError(event.detail, {
      source: "runtime",
      phase: "worker",
      namespace: state.namespace,
      runtimeKind: state.runtimeKind,
    }));
    appendRepl("error", event.detail?.message || String(event.detail));
    render();
  });
}

export const EDITOR_METRICS = Object.freeze({
  lineHeight: EDITOR_LINE_HEIGHT,
  characterWidth: EDITOR_CHARACTER_WIDTH
});
