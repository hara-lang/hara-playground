import {
  DEFAULT_WORKSPACE,
  STUDIO_SETTING_KEYS,
  getCompletionTimer,
  getSaveTimer,
  renderNow as render,
  runtime,
  state,
  store
} from "./context.js";
import { defaultProject } from "../workspace/default-project.js";
import { importGitHubRepository, parseGitHubRepository } from "../github/importer.js";
import { detectProjectConfiguration, isHaraSource, isProjectSource } from "../workspace/project.js";
import { formAtCursor } from "../editor/forms.js";
import { loadExampleCatalog, loadExampleProject } from "../examples/catalog.js";
import {
  activitiesForToolset,
  activityById,
  activityCheckPassed,
  toolsetById
} from "../studio/catalog.js";
import { featuredProject } from "../studio/projects.js";
import {
  appendProblemState,
  problemFromError,
  resetProblemsState,
  setProblemsStatus,
} from "../hodos/problems-state.js";
import {
  WORKSPACE_MANIFEST_PATH,
  keyName,
  loadWorkspaceManifest,
  selectWorkspaceArea as selectWorkspaceAreaView,
} from "../workspace/manifest.js";

function recordActionProblem(error, context = {}) {
  state.problems = appendProblemState(state.problems, problemFromError(error, {
    ...context,
    namespace: context.namespace ?? state.namespace,
    runtimeKind: state.runtimeKind,
  }));
}

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

function loadingWorkspaceShell() {
  state.workspaceShell = {
    workspaceId: state.workspace,
    status: "loading",
    source: "fallback",
    view: null,
    error: "",
    surfaceId: state.workspaceShell?.surfaceId ?? null,
  };
}

export async function reloadWorkspaceManifest({ shouldRender = false } = {}) {
  const workspaceId = state.workspace;
  loadingWorkspaceShell();
  try {
    const result = await loadWorkspaceManifest({
      store,
      runtime,
      namespace: state.namespace,
    });
    if (state.workspace !== workspaceId) return false;
    if (result.status === "missing") {
      state.workspaceShell = {
        ...state.workspaceShell,
        workspaceId,
        status: "fallback",
        source: "fallback",
        view: null,
        error: "",
      };
    } else {
      state.namespace = result.namespace || state.namespace;
      state.workspaceShell = {
        ...state.workspaceShell,
        workspaceId,
        status: "ready",
        source: WORKSPACE_MANIFEST_PATH,
        view: result.view,
        error: "",
      };
    }
    if (shouldRender) render();
    return true;
  } catch (error) {
    if (state.workspace !== workspaceId) return false;
    state.workspaceShell = {
      ...state.workspaceShell,
      workspaceId,
      status: "error",
      source: WORKSPACE_MANIFEST_PATH,
      view: null,
      error: error.message,
    };
    recordActionProblem(error, {
      source: "workspace",
      phase: "manifest",
      path: WORKSPACE_MANIFEST_PATH,
    });
    appendRepl("error", `Workspace manifest fallback · ${error.message}`);
    if (shouldRender) render();
    return false;
  }
}

export function selectWorkspaceShellArea(areaId, surfaceId = null) {
  state.workspaceShell.surfaceId = surfaceId || state.workspaceShell.surfaceId;
  const view = state.workspaceShell.view;
  const hasArea = Array.isArray(view?.["workspace/areas"])
    && view["workspace/areas"].some((area) => keyName(area?.["area/id"] ?? area?.id) === areaId);
  if (hasArea) state.workspaceShell.view = selectWorkspaceAreaView(view, areaId, surfaceId);
  return true;
}

export function resetCompletion() {
  clearTimeout(getCompletionTimer());
  state.editor.completion = {
    ...state.editor.completion,
    open: false,
    items: [],
    selected: 0,
    prefix: "",
    start: 0,
    end: 0,
    request: state.editor.completion.request + 1,
    line: 0,
    column: 0
  };
}

export function resetEditorAssist() {
  state.editor.cursor = 0;
  state.editor.selectionStart = 0;
  state.editor.selectionEnd = 0;
  state.editor.structuralMessage = "";
  resetCompletion();
  resetInstantEvaluation();
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


export function resetValueInspector() {
  const request = Number(state.valueInspector?.request || 0) + 1;
  state.valueInspector = {
    request,
    valueId: null,
    requestId: null,
    status: "idle",
    display: "",
    value: null,
    valueType: null,
    namespace: null,
    source: null,
    path: [],
    expanded: [[]],
    metadata: {},
    error: ""
  };
  if (state.outputTab === "value") {
    state.outputTab = "repl";
    writeSetting(STUDIO_SETTING_KEYS.output, "repl");
  }
}

export async function prepareProjectHome() {
  let paths = await store.list();
  if (!paths.length) {
    store.use(DEFAULT_WORKSPACE, { source: "local", branch: null, commit: null });
    await store.seed(defaultProject);
    paths = await store.list();
  }
  state.workspace = store.workspace;
  state.metadata = store.metadata;
  state.home.resume = paths.length ? {
    workspace: store.workspace,
    metadata: { ...store.metadata },
    fileCount: paths.length
  } : null;
  state.home.error = "";
  state.screen = "projects";
  render();
}

export async function showProjectHome({ updateLocation = true } = {}) {
  if (state.dirty) await saveCurrentFile(false);
  const paths = await store.list();
  state.home.resume = paths.length ? {
    workspace: store.workspace,
    metadata: { ...store.metadata },
    fileCount: paths.length
  } : null;
  state.screen = "projects";
  state.home.error = "";
  resetCompletion();
  if (updateLocation && globalThis.history?.replaceState) {
    globalThis.history.replaceState({}, "", globalThis.location?.pathname || "./");
  }
  render();
}

export async function resumeWorkspace() {
  state.screen = "workspace";
  state.workspace = store.workspace;
  state.metadata = store.metadata;
  resetEditorAssist();
  await refreshFiles(state.selectedPath);
  await bootRuntime();
  return true;
}

export async function refreshFiles(selectPath = state.selectedPath) {
  state.files = await store.list();
  if (selectPath && state.files.includes(selectPath)) await selectFile(selectPath, false);
  else if (state.files.length) await selectFile(state.files.find((path) => path.endsWith(".hal")) || state.files.find((path) => path.endsWith(".hara")) || state.files[0], false);
  else {
    state.selectedPath = null;
    state.content = "";
    resetEditorAssist();
  }
  render();
}

export async function selectFile(path, shouldRender = true) {
  if (state.dirty) await saveCurrentFile(false);
  state.selectedPath = path;
  state.content = (await store.read(path)) ?? "";
  state.dirty = false;
  resetEditorAssist();
  if (shouldRender) render();
}

export async function saveCurrentFile(showMessage = true) {
  if (!state.selectedPath) return;
  clearTimeout(getSaveTimer());
  await store.write(state.selectedPath, state.content);
  state.dirty = false;
  if (state.selectedPath === WORKSPACE_MANIFEST_PATH && state.runtimeStatus === "ready") {
    await reloadWorkspaceManifest({ shouldRender: false });
  }
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
  loadingWorkspaceShell();
  resetInstantEvaluation();
  resetValueInspector();
  state.problems = resetProblemsState(state.problems, { status: "collecting" });
  render();
  try {
    const files = await store.files();
    const project = detectProjectConfiguration(files);
    const sourceFiles = files.filter((file) => file.content != null && isProjectSource(file.path, project.sourcePaths));
    const result = await runtime.boot(sourceFiles, project.mainNamespace);
    state.namespace = result.namespace;
    state.runtimeKind = result.runtimeKind || state.runtimeKind;
    state.runtimeStatus = "ready";
    await reloadWorkspaceManifest({ shouldRender: false });
    state.problems = setProblemsStatus(
      state.problems,
      state.problems.entries.length ? "ready" : "idle",
    );
    appendRepl("result", `Hara kernel ready · ${sourceFiles.length} source files loaded · ${files.length} workspace files`);
  } catch (error) {
    state.runtimeStatus = "error";
    state.workspaceShell = {
      ...state.workspaceShell,
      workspaceId: state.workspace,
      status: "error",
      source: "fallback",
      view: null,
      error: error.message,
    };
    recordActionProblem(error, { source: "runtime", phase: "boot" });
    appendRepl("error", error.message);
  }
  render();
}

export function appendRepl(kind, text, namespace = state.namespace, metadata = {}) {
  const entry = { kind, text: String(text).replace(/\n$/, ""), namespace };
  for (const key of ["valueId", "requestId", "source"]) {
    if (typeof metadata?.[key] === "string" && metadata[key]) entry[key] = metadata[key];
  }
  state.repl.push(entry);
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
      appendRepl("result", result.display, result.namespace || state.namespace, {
        valueId: result.valueId,
        requestId: result.requestId,
        source
      });
      render();
    }
    return result;
  } catch (error) {
    recordActionProblem(error, {
      source: "runtime",
      phase: "eval",
      namespace,
      path: state.selectedPath,
      sourceText: source,
    });
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

export function selectOutputTab(tab) {
  if (!["preview", "repl", "value", "problems"].includes(tab)) return false;
  state.outputTab = tab;
  writeSetting(STUDIO_SETTING_KEYS.output, tab);
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
    if (state.runtimeStatus !== "ready") throw new Error("The Hara kernel is not ready");
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
    if (state.runtimeStatus !== "ready") throw new Error("The Hara kernel is not ready");
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
  state.screen = "workspace";
  state.workspace = store.workspace;
  state.metadata = store.metadata;
  state.selectedPath = null;
  state.content = "";
  state.dirty = false;
  state.repl = [];
  resetActivityRun();
  resetEditorAssist();
  if (globalThis.history?.replaceState) globalThis.history.replaceState({}, "", globalThis.location?.pathname || "./");
  await refreshFiles("src/app/core.hal");
  await bootRuntime();
}

export async function runCurrentFile() {
  if (!state.selectedPath || !isHaraSource(state.selectedPath)) {
    appendRepl("error", "Select a HAL source file before loading it into the kernel");
    render();
    return;
  }
  await saveCurrentFile(false);
  appendRepl("input", `;; loading ${state.selectedPath}`);
  render();
  try {
    const result = await runtime.loadFile(state.selectedPath, state.content, state.namespace);
    state.namespace = result.namespace;
    appendRepl("result", `${result.display} · loaded ${state.selectedPath}`, result.namespace || state.namespace, {
      valueId: result.valueId,
      requestId: result.requestId,
      source: state.content
    });
  } catch (error) {
    recordActionProblem(error, {
      source: "runtime",
      phase: "load-file",
      path: state.selectedPath,
      sourceText: state.content,
    });
    appendRepl("error", error.message);
  }
  render();
}

function updateImportProgress(progress) {
  state.importProgress = progress.phase === "files"
    ? `Loading files ${progress.completed}/${progress.total}${progress.path ? ` · ${progress.path}` : ""}`
    : "Resolving repository and commit…";
  const target = document.querySelector(".import-progress-card span, .import-progress");
  if (target) target.textContent = state.importProgress;
}

function updateRepositoryLocation(metadata) {
  if (!globalThis.history?.replaceState || !metadata?.owner || !metadata?.repository) return;
  const query = new URLSearchParams({
    repo: `${metadata.owner}/${metadata.repository}`,
    branch: metadata.branch || "main"
  });
  if (metadata.path) query.set("path", metadata.path);
  globalThis.history.replaceState({}, "", `${globalThis.location?.pathname || "./"}?${query}`);
}

export async function importRepository(value) {
  if (!value || (typeof value === "string" && !value.trim())) return false;
  let importedSuccessfully = false;
  state.importBusy = true;
  state.home.error = "";
  state.importProgress = "Connecting to GitHub…";
  render();
  try {
    const imported = await importGitHubRepository(value, { onProgress: updateImportProgress });
    store.use(imported.workspace, imported.metadata);
    await store.replace(imported.files, imported.metadata);
    state.screen = "workspace";
    state.workspace = imported.workspace;
    state.metadata = imported.metadata;
    state.selectedPath = null;
    state.content = "";
    state.dirty = false;
    state.repl = [];
    resetActivityRun();
    resetEditorAssist();
    updateRepositoryLocation(imported.metadata);
    await refreshFiles();
    await bootRuntime();
    appendRepl("result", `Imported ${imported.files.length} files from ${imported.metadata.owner}/${imported.metadata.repository}@${imported.metadata.branch}${imported.metadata.path ? `/${imported.metadata.path}` : ""}`);
    importedSuccessfully = true;
  } catch (error) {
    state.home.error = error.message;
    if (state.screen === "workspace") appendRepl("error", error.message);
  } finally {
    state.importBusy = false;
    state.importProgress = "";
    render();
  }
  return importedSuccessfully;
}

export async function openFeaturedProject(projectId) {
  const project = featuredProject(projectId);
  if (!project) return false;
  return importRepository(project.repository);
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
        const target = document.querySelector(".import-progress-card span, .import-progress");
        if (target) target.textContent = state.importProgress;
      }
    });
    store.use(loaded.workspace, loaded.metadata);
    await store.replace(loaded.files, loaded.metadata);
    state.screen = "workspace";
    state.workspace = loaded.workspace;
    state.metadata = loaded.metadata;
    state.selectedPath = null;
    state.content = "";
    state.dirty = false;
    state.repl = [];
    resetActivityRun();
    resetEditorAssist();
    await refreshFiles();
    await bootRuntime();
    appendRepl("result", `Opened ${example.title} with ${loaded.files.length} files`);
    return true;
  } catch (error) {
    state.home.error = error.message;
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
}

export function describeRepositoryInput(value) {
  try {
    const parsed = parseGitHubRepository(value);
    return `${parsed.owner}/${parsed.repo}${parsed.path ? `/${parsed.path}` : ""}`;
  } catch {
    return String(value || "");
  }
}
