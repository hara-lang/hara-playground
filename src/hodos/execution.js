import { createHodosComponentRegistry } from "@greenways/hodos-web";
import { createWorkspaceAreaHost } from "@greenways/hodos-workspace-ui";
import { registerHodosExecutionDomUi } from "@greenways/hodos-dev-ui";
import { isHaraSource } from "../workspace/project.js";
import {
  createBytecodeObservationController,
  executionSourceVersion,
} from "../runtime/bytecode-observation-controller.js";
import {
  appendProblemState,
  problemFromDiagnostic,
  problemFromError,
} from "./problems-state.js";
import { updateHodosProblems } from "./problems.js";
import {
  HODOS_EXECUTION_COMPONENT_ID,
  editorSelectionEventFromExecution,
  executionWorkspacePatch,
} from "./execution-events.js";
import {
  applyExecutionControllerUpdate,
  appendExecutionDiagnostic,
  createPlaygroundExecutionState,
  executionAreaFromPlayground,
  markPlaygroundExecutionStale,
  selectPlaygroundExecution,
  setExecutionBusy,
  withExecutionEnvironment,
} from "./execution-state.js";

const registry = createHodosComponentRegistry();
registerHodosExecutionDomUi(registry);

let areaHost = null;
let installed = false;
let stateRef = null;
let renderApplication = () => {};
let controller = null;
let workspaceListener = null;
let unloadListener = null;

const eventType = (value) => value?.["event/type"] ?? value?.type ?? null;

function writeOutputSetting(value) {
  try {
    globalThis.localStorage?.setItem("hara-playground-output", value);
  } catch {
    // Output selection remains functional when storage is unavailable.
  }
}

function sourceEnvironment(state) {
  const haraSelected = state?.screen === "workspace"
    && typeof state.selectedPath === "string"
    && isHaraSource(state.selectedPath)
    && typeof state.content === "string";
  const sourceAvailable = haraSelected && state.content.trim().length > 0;
  return Object.freeze({
    currentSourceId: haraSelected ? state.selectedPath : null,
    currentSourceVersion: haraSelected ? executionSourceVersion(state.content) : null,
    workspaceId: state?.workspace == null ? null : String(state.workspace),
    sourceAvailable,
  });
}

function updateTabPresentation() {
  if (!stateRef) return;
  const tab = globalThis.document?.querySelector('[data-output-tab="execution"]');
  const view = globalThis.document?.querySelector(".execution-view");
  const active = stateRef.outputTab === "execution";
  tab?.classList.toggle("active", active);
  view?.classList.toggle("active", active);
  if (tab) {
    tab.dataset.executionStatus = stateRef.execution.model.session.status;
    tab.setAttribute(
      "aria-label",
      `Execution ${stateRef.execution.model.session.status}${stateRef.execution.stale ? ", stale" : ""}`,
    );
  }
  if (active) {
    const mode = globalThis.document?.querySelector(".preview-mode");
    if (mode) mode.textContent = stateRef.execution.stale
      ? "stale bytecode evidence"
      : "live bytecode evidence";
  }
}

function updateExecutionHost() {
  if (!stateRef) return false;
  updateTabPresentation();
  if (!areaHost) return false;
  areaHost.update(executionAreaFromPlayground(stateRef.execution));
  return true;
}

function appendProblem(problem) {
  if (!stateRef) return;
  stateRef.problems = appendProblemState(stateRef.problems, problem);
  updateHodosProblems(stateRef);
}

function reportControllerDiagnostic(diagnostic) {
  appendProblem(problemFromDiagnostic(diagnostic, {
    source: "execution",
    phase: diagnostic.phase,
    path: diagnostic.sourceId ?? stateRef?.selectedPath,
    namespace: stateRef?.namespace,
    runtimeKind: stateRef?.runtimeKind,
    tags: ["execution", "bytecode-observation"],
  }));
}

function reportExecutionError(error, phase = "event") {
  if (!error?.executionDiagnosticReported) {
    appendProblem(problemFromError(error, {
      source: "execution",
      phase,
      path: stateRef?.selectedPath,
      namespace: stateRef?.namespace,
      runtimeKind: stateRef?.runtimeKind,
      tags: ["execution", "bytecode-observation"],
    }));
    if (stateRef?.execution) {
      stateRef.execution = appendExecutionDiagnostic(stateRef.execution, {
        code: error?.code || `playground-execution/${phase}`,
        message: error?.message || String(error),
        severity: "error",
      });
      updateExecutionHost();
    }
  }
  console.error("[hara playground execution]", error);
}

function applyControllerUpdate(update) {
  if (!stateRef) return;
  stateRef.execution = applyExecutionControllerUpdate(stateRef.execution, update);
  updateExecutionHost();
}

function setBusy(value) {
  if (!stateRef) return;
  stateRef.execution = setExecutionBusy(stateRef.execution, value);
  updateExecutionHost();
}

function currentController() {
  if (!controller) {
    controller = createBytecodeObservationController({
      publish: applyControllerUpdate,
      reportDiagnostic: reportControllerDiagnostic,
    });
  }
  return controller;
}

function synchronizeExecutionEnvironment(state) {
  state.execution ??= createPlaygroundExecutionState();
  const environment = sourceEnvironment(state);
  const live = currentController().inspect();

  if (live.sessionActive && live.sourceIdentity) {
    const leavesWorkspace = state.screen !== "workspace";
    const workspaceChanged = environment.workspaceId !== live.sourceIdentity.workspaceId;
    const sourceChanged = environment.currentSourceId !== live.sourceIdentity.sourceId;
    const kernelReset = state.runtimeStatus === "booting";

    if (leavesWorkspace) currentController().disposeExecution("leave-workspace");
    else if (workspaceChanged) currentController().disposeSession("workspace-changed");
    else if (sourceChanged) currentController().disposeSession("source-changed");
    else if (kernelReset) currentController().disposeSession("kernel-reset");
    else if (environment.currentSourceVersion !== live.sourceIdentity.sourceVersion) {
      currentController().markExecutionStale({
        sourceId: environment.currentSourceId,
        sourceVersion: environment.currentSourceVersion,
      });
      state.execution = markPlaygroundExecutionStale(
        state.execution,
        environment.currentSourceVersion,
      );
    }
  }

  state.execution = withExecutionEnvironment(state.execution, environment);
  return environment;
}

function selectExecutionOutput() {
  if (!stateRef || stateRef.screen !== "workspace") return;
  stateRef.outputTab = "execution";
  writeOutputSetting("execution");
  renderApplication();
}

function ensureExecutionSurface() {
  const document = globalThis.document;
  const panel = document?.querySelector(".output-panel");
  const tabs = panel?.querySelector(".output-tabs");
  if (!panel || !tabs) return null;

  let tab = tabs.querySelector('[data-output-tab="execution"]');
  if (!tab) {
    tab = document.createElement("button");
    tab.type = "button";
    tab.className = "output-tab execution-output-tab";
    tab.dataset.outputTab = "execution";
    tab.innerHTML = '<span aria-hidden="true">⌁</span> Execution';
    tab.addEventListener("click", selectExecutionOutput);
    tabs.insertBefore(tab, tabs.querySelector(".preview-mode"));
  }

  let view = panel.querySelector(".execution-view");
  if (!view) {
    view = document.createElement("section");
    view.className = "execution-view";
    view.setAttribute("aria-label", "Live Hara bytecode execution");
    panel.append(view);
  }
  updateTabPresentation();
  return view;
}

function dispatchEditorSelection(value) {
  try {
    if (!stateRef?.execution?.sourceId || stateRef.execution.sourceId !== stateRef.selectedPath) {
      throw new Error("Execution evidence no longer matches the selected editor source");
    }
    const event = editorSelectionEventFromExecution(value, {
      sourceId: stateRef.selectedPath,
      sourceLength: stateRef.content.length,
    });
    globalThis.document?.dispatchEvent(new CustomEvent("hodos:workspace-event", {
      detail: event,
    }));
  } catch (error) {
    reportExecutionError(error, "source-selection");
  }
}

async function executePatch(patch) {
  const activeController = currentController();
  if (patch.generation !== activeController.inspect().generation) {
    throw new Error("Execution request belongs to a stale controller generation");
  }

  if (patch.kind === "select") {
    stateRef.execution = selectPlaygroundExecution(stateRef.execution, {
      function: patch.function,
      ip: patch.ip,
      eventIndex: patch.eventIndex,
      traceIndex: patch.traceIndex,
      source: patch.source,
    });
    updateExecutionHost();
    return true;
  }

  if (patch.kind === "start") {
    const environment = synchronizeExecutionEnvironment(stateRef);
    if (!environment.sourceAvailable) {
      throw new Error("Select a non-empty Hara source file before starting Execution");
    }
    setBusy(true);
    try {
      await activeController.startExecution({
        source: stateRef.content,
        sourceId: stateRef.selectedPath,
        sourceVersion: environment.currentSourceVersion,
        workspaceId: environment.workspaceId,
      });
    } finally {
      setBusy(false);
    }
    return true;
  }

  if (patch.kind === "pause") {
    await activeController.pauseExecution();
    return true;
  }

  const operation = {
    step: () => activeController.stepExecution(),
    run: () => activeController.runExecution(),
    resume: () => activeController.resumeExecution(),
    reset: () => activeController.resetExecution(),
    "request-trace": () => activeController.requestExecutionTrace(),
  }[patch.kind];
  if (!operation) return false;

  setBusy(true);
  try {
    await operation();
  } finally {
    setBusy(false);
  }
  return true;
}

function handleWorkspaceEvent(event) {
  const value = event?.detail;
  try {
    if (
      value?.["component/id"] === "hodos.dev/editor"
      && eventType(value) === "editor/change"
      && stateRef?.execution?.model?.session?.id
    ) {
      const environment = sourceEnvironment(stateRef);
      if (
        environment.currentSourceId === stateRef.execution.sourceId
        && environment.currentSourceVersion !== stateRef.execution.sourceVersion
      ) {
        currentController().markExecutionStale({
          sourceId: environment.currentSourceId,
          sourceVersion: environment.currentSourceVersion,
        });
        stateRef.execution = markPlaygroundExecutionStale(
          stateRef.execution,
          environment.currentSourceVersion,
        );
        stateRef.execution = withExecutionEnvironment(stateRef.execution, environment);
        updateExecutionHost();
      }
      return;
    }

    const patch = executionWorkspacePatch(value, {
      sessionId: stateRef?.execution?.model?.session?.id ?? null,
      generation: currentController().inspect().generation,
      stale: stateRef?.execution?.stale ?? false,
    });
    if (!patch) return;
    void executePatch(patch).catch((error) => reportExecutionError(error, patch.kind));
  } catch (error) {
    reportExecutionError(error, "event-validation");
  }
}

export function installHodosExecution({ state, render } = {}) {
  if (state) stateRef = state;
  if (typeof render === "function") renderApplication = render;
  if (installed) return false;
  installed = true;
  currentController();
  workspaceListener = handleWorkspaceEvent;
  globalThis.document?.addEventListener("hodos:workspace-event", workspaceListener);
  unloadListener = () => currentController().disposeExecution("page-unload");
  globalThis.addEventListener?.("pagehide", unloadListener, { once: true });
  globalThis.addEventListener?.("beforeunload", unloadListener, { once: true });
  return true;
}

export function disposeHodosExecutionHost() {
  areaHost?.destroy();
  areaHost = null;
}

export function mountHodosExecution(state) {
  stateRef = state;
  synchronizeExecutionEnvironment(state);
  disposeHodosExecutionHost();
  const root = ensureExecutionSurface();
  if (!root) return false;
  areaHost = createWorkspaceAreaHost({
    root,
    registry,
    services: {
      execution: {
        dispatchSourceSelection: dispatchEditorSelection,
        reportError: (error) => reportExecutionError(error, "dom-host"),
      },
    },
    dispatch(event) {
      globalThis.document?.dispatchEvent(new CustomEvent("hodos:workspace-event", {
        detail: {
          ...event,
          "component/id": event["component/id"] ?? HODOS_EXECUTION_COMPONENT_ID,
        },
      }));
    },
  });
  areaHost.open(executionAreaFromPlayground(state.execution));
  updateTabPresentation();
  return true;
}

export function disposeLiveHaraExecution(reason = "application-teardown") {
  disposeHodosExecutionHost();
  return currentController().disposeExecution(reason);
}

export function executionControllerSnapshot() {
  return currentController().inspect();
}
