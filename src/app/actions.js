import {
  DEFAULT_WORKSPACE,
  STUDIO_SETTING_KEYS,
  getSaveTimer,
  renderNow as render,
  runtime,
  state,
  store
} from "./context.js";
import { defaultProject } from "../workspace/default-project.js";
import { importGitHubRepository } from "../github/importer.js";
import { detectProjectConfiguration, isHaraSource, isProjectSource } from "../workspace/project.js";
import { formAtCursor } from "../editor/forms.js";
import { loadExampleCatalog, loadExampleProject } from "../examples/catalog.js";
import {
  activitiesForToolset,
  activityById,
  activityCheckPassed,
  toolsetById
} from "../studio/catalog.js";

function writeSetting(key, value) {
  try {
    globalThis.localStorage?.setItem(key, String(value));
  } catch {
    // Preferences are optional; workspace functionality must continue without storage.
  }
}

function resetActivityRun() {
  state.activityRun = { status: "idle", checks: [], message: "" };
}

export function resetInstantEvaluation() {
  state.instarepl = {
    ...state.instarepl,
    status: "idle",
    candidate: null,
    display: "",
    error: "",
    request: state.instarepl.request + 1,
    evaluatedKey: null
  };
}

export async function refreshFiles(selectPath = state.selectedPath) {
  state.files = await store.list();
  if (selectPath && state.files.includes(selectPath)) await selectFile(selectPath, false);
  else if (state.files.length) await selectFile(state.files.find((path) => path.endsWith(".hal")) || state.files.find((path) => path.endsWith(".hara")) || state.files[0], false);
  else {
    state.selectedPath = null;
    state.content = "";
    resetInstantEvaluation();
  }
  render();
}

export async function selectFile(path, shouldRender = true) {
  if (state.dirty) await saveCurrentFile(false);
  state.selectedPath = path;
  state.content = (await store.read(path)) ?? "";
  state.dirty = false;
  resetInstantEvaluation();
  if (shouldRender) render();
}

export async function saveCurrentFile(showMessage = true) {
  if (!state.selectedPath) return;
  clearTimeout(getSaveTimer());
  await store.write(state.selectedPath, state.content);
  state.dirty = false;
  const saveStatus = document.querySelector(".statusbar span:first-child");
  if (saveStatus) saveStatus.textContent = "Workspace saved";
  document.querySelector(".dirty-dot")?.remove();
  if (showMessage) {
    appendRepl("result", `Saved ${state.selectedPath}`);
    render();
  }
}

export async function bootRuntime() {
  state.runtimeStatus = "booting";
  resetInstantEvaluation();
  render();
  try {
    const files = await store.files();
    const project = detectProjectConfiguration(files);
    const sourceFiles = files.filter((file) => file.content != null && isProjectSource(file.path, project.sourcePaths));
    const result = await runtime.boot(sourceFiles, project.mainNamespace);
    state.namespace = result.namespace;
    state.runtimeKind = result.runtimeKind || state.runtimeKind;
    state.runtimeStatus = "ready";
    appendRepl("result", `Hara runtime ready · ${sourceFiles.length} source files loaded · ${files.length} workspace files`);
  } catch (error) {
    state.runtimeStatus = "error";
    appendRepl("error", error.message);
  }
  render();
}

export function appendRepl(kind, text, namespace = state.namespace) {
  state.repl.push({ kind, text: String(text).replace(/\n$/, ""), namespace });
  if (state.repl.length > 300) state.repl.splice(0, state.repl.length - 300);
}

export async function evaluate(source, { echo = true } = {}) {
  if (!source.trim()) return null;
  const namespace = state.namespace;
  if (echo) appendRepl("input", source, namespace);
  if (echo) render();
  try {
    const result = await runtime.eval(source, namespace);
    state.namespace = result.namespace;
    if (echo) {
      appendRepl("result", result.display);
      render();
    }
    return result;
  } catch (error) {
    if (echo) {
      appendRepl("error", error.message);
      render();
    }
    return null;
  }
}

export async function evaluateEditorForm() {
  const editor = document.querySelector("#editor");
  if (!editor || !state.selectedPath || !isHaraSource(state.selectedPath)) {
    appendRepl("error", "Select a HAL source file before evaluating a form");
    render();
    return;
  }
  const selection = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim();
  const source = selection || formAtCursor(editor.value, editor.selectionStart);
  if (!source) {
    appendRepl("error", "No complete form found at the cursor");
    render();
    return;
  }
  await evaluate(source);
}

export function selectToolset(toolsetId) {
  const toolset = toolsetById(toolsetId);
  if (!toolset) return false;
  state.toolsetId = toolset.id;
  const matchingActivities = activitiesForToolset(toolset.id);
  if (!matchingActivities.some((activity) => activity.id === state.activityId)) {
    state.activityId = matchingActivities[0]?.id || state.activityId;
  }
  resetActivityRun();
  writeSetting(STUDIO_SETTING_KEYS.toolset, state.toolsetId);
  writeSetting(STUDIO_SETTING_KEYS.activity, state.activityId);
  render();
  return true;
}

export function selectActivity(activityId) {
  const activity = activityById(activityId);
  if (!activity) return false;
  state.activityId = activity.id;
  state.toolsetId = activity.toolsetId;
  resetActivityRun();
  writeSetting(STUDIO_SETTING_KEYS.toolset, state.toolsetId);
  writeSetting(STUDIO_SETTING_KEYS.activity, state.activityId);
  render();
  return true;
}

export async function openActivity({ reset = false } = {}) {
  const activity = activityById(state.activityId);
  if (!activity) return false;
  state.activityRun = { status: "opening", checks: [], message: reset ? "Resetting starter…" : "Opening starter…" };
  render();

  try {
    if (state.dirty) {
      if (reset && state.selectedPath === activity.path) {
        clearTimeout(getSaveTimer());
        state.dirty = false;
      } else {
        await saveCurrentFile(false);
      }
    }
    const existing = await store.read(activity.path);
    if (reset || existing == null) await store.write(activity.path, activity.source);
    await refreshFiles(activity.path);
    const source = (await store.read(activity.path)) ?? activity.source;

    if (state.runtimeStatus !== "ready") await bootRuntime();
    if (state.runtimeStatus !== "ready") throw new Error("The Hara runtime is not ready");
    const result = await runtime.loadFile(activity.path, source, state.namespace);
    state.namespace = result.namespace;

    state.activityRun = {
      status: "ready",
      checks: [],
      message: reset ? "Starter restored. Edit the file, then run the checks." : "Activity file is open."
    };
    appendRepl("result", `${reset ? "Reset" : "Opened"} activity · ${activity.title}`);
    render();
    return true;
  } catch (error) {
    state.activityRun = { status: "failed", checks: [], message: error.message };
    appendRepl("error", `Unable to open activity: ${error.message}`);
    render();
    return false;
  }
}

export async function checkActivity() {
  const activity = activityById(state.activityId);
  if (!activity) return false;
  state.activityRun = { status: "running", checks: [], message: "Running activity checks…" };
  render();

  try {
    if (state.runtimeStatus !== "ready") await bootRuntime();
    if (state.runtimeStatus !== "ready") throw new Error("The Hara runtime is not ready");
    if (state.selectedPath === activity.path && state.dirty) await saveCurrentFile(false);
    let source = await store.read(activity.path);
    if (source == null) {
      await store.write(activity.path, activity.source);
      source = activity.source;
      await refreshFiles(activity.path);
    }

    const loaded = await runtime.loadFile(activity.path, source, state.namespace);
    state.namespace = loaded.namespace;
    const checks = [];

    for (const check of activity.checks) {
      try {
        const result = await runtime.eval(check.expression, state.namespace);
        state.namespace = result.namespace;
        checks.push({
          id: check.id,
          label: check.label,
          passed: activityCheckPassed(result.display, check.expected),
          actual: result.display,
          expected: check.expected
        });
      } catch (error) {
        checks.push({ id: check.id, label: check.label, passed: false, error: error.message, expected: check.expected });
      }
    }

    const passed = checks.filter((check) => check.passed).length;
    const complete = passed === checks.length;
    state.activityRun = {
      status: complete ? "passed" : "failed",
      checks,
      message: complete ? `All ${checks.length} checks passed.` : `${passed}/${checks.length} checks passed.`
    };
    appendRepl(complete ? "result" : "error", `${activity.title} · ${state.activityRun.message}`);
    render();
    return complete;
  } catch (error) {
    state.activityRun = { status: "failed", checks: [], message: error.message };
    appendRepl("error", `Activity check failed: ${error.message}`);
    render();
    return false;
  }
}

export async function openLocalWorkspace() {
  if (state.dirty) await saveCurrentFile(false);
  store.use(DEFAULT_WORKSPACE, { source: "local", branch: null, commit: null });
  await store.seed(defaultProject);
  state.workspace = store.workspace;
  state.metadata = store.metadata;
  state.selectedPath = null;
  state.content = "";
  state.dirty = false;
  state.repl = [];
  resetActivityRun();
  resetInstantEvaluation();
  await refreshFiles("src/app/core.hal");
  await bootRuntime();
}

export async function runCurrentFile() {
  if (!state.selectedPath || !isHaraSource(state.selectedPath)) {
    appendRepl("error", "Select a HAL source file before loading it into the runtime");
    render();
    return;
  }
  await saveCurrentFile(false);
  appendRepl("input", `;; loading ${state.selectedPath}`);
  render();
  try {
    const result = await runtime.loadFile(state.selectedPath, state.content);
    state.namespace = result.namespace;
    appendRepl("result", `${result.display} · loaded ${state.selectedPath}`);
  } catch (error) {
    appendRepl("error", error.message);
  }
  render();
}

export async function importRepository(value) {
  if (!value.trim()) return false;
  let importedSuccessfully = false;
  state.importBusy = true;
  state.importProgress = "Connecting to GitHub…";
  render();
  try {
    const imported = await importGitHubRepository(value, {
      onProgress(progress) {
        state.importProgress = progress.phase === "files"
          ? `Loading files ${progress.completed}/${progress.total}${progress.path ? ` · ${progress.path}` : ""}`
          : "Reading repository metadata…";
        const target = document.querySelector(".import-progress");
        if (target) target.textContent = state.importProgress;
      }
    });
    store.use(imported.workspace, imported.metadata);
    await store.replace(imported.files, imported.metadata);
    state.workspace = imported.workspace;
    state.metadata = imported.metadata;
    state.selectedPath = null;
    state.content = "";
    state.dirty = false;
    state.repl = [];
    resetActivityRun();
    resetInstantEvaluation();
    await refreshFiles();
    await bootRuntime();
    appendRepl("result", `Imported ${imported.files.length} files from ${imported.metadata.owner}/${imported.metadata.repository}@${imported.metadata.branch}`);
    importedSuccessfully = true;
  } catch (error) {
    appendRepl("error", error.message);
  } finally {
    state.importBusy = false;
    state.importProgress = "";
    render();
  }
  return importedSuccessfully;
}

export async function openExample(exampleId) {
  const example = state.examples.find((candidate) => candidate.id === exampleId);
  if (!example) return false;
  state.exampleBusy = true;
  state.importProgress = `Opening ${example.title}…`;
  render();
  try {
    const loaded = await loadExampleProject(example, {
      onProgress(progress) {
        state.importProgress = `Loading example ${progress.completed}/${progress.total} · ${progress.path}`;
        const target = document.querySelector(".import-progress");
        if (target) target.textContent = state.importProgress;
      }
    });
    store.use(loaded.workspace, loaded.metadata);
    await store.replace(loaded.files, loaded.metadata);
    state.workspace = loaded.workspace;
    state.metadata = loaded.metadata;
    state.selectedPath = null;
    state.content = "";
    state.dirty = false;
    state.repl = [];
    resetActivityRun();
    resetInstantEvaluation();
    await refreshFiles();
    await bootRuntime();
    appendRepl("result", `Opened ${example.title} with ${loaded.files.length} files`);
    return true;
  } catch (error) {
    appendRepl("error", error.message);
    return false;
  } finally {
    state.exampleBusy = false;
    state.importProgress = "";
    render();
  }
}

export async function loadExamples() {
  try {
    state.examples = await loadExampleCatalog();
  } catch (error) {
    state.examples = [];
    appendRepl("error", `Examples unavailable: ${error.message}`);
  }
  render();
}
