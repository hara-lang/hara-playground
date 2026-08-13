import { runtime, state, store } from "../app/context.js";
import { appendRepl, saveCurrentFile } from "../app/actions.js";
import { updateReplOnly } from "../app/view.js";
import { detectActiveLoopConfiguration } from "../runtime/active-project.js";

const ACTIVITY_UI = Object.freeze({
  tank: Object.freeze({
    activity: "Living Tank",
    behavior: "controller",
    activate: "Activate controller",
    intervention: "Disturb tank",
    interventionTitle: "Remove water without restarting the active loop",
    command: "disturb",
    options: Object.freeze({ amount: 18 }),
  }),
  conveyor: Object.freeze({
    activity: "Conveyor Cell A",
    behavior: "routing policy",
    activate: "Activate policy",
    intervention: "Inject anomaly",
    interventionTitle: "Mark the next sensor observation anomalous without restarting the conveyor",
    command: "inject-anomaly",
    options: Object.freeze({}),
  }),
});

let installed = false;
let workspaceKey = null;
let configuration = null;
let configurationLoaded = false;
let configurationRequest = 0;
let snapshot = null;
let busy = false;
let lastRuntimeStatus = state.runtimeStatus;
let readyGeneration = 0;
let automaticActivationKey = null;

function currentWorkspaceKey() {
  return `${state.workspace || "workspace"}:${state.metadata?.commit || state.metadata?.branch || "browser"}`;
}

function setWorkspace(key) {
  if (workspaceKey === key) return;
  workspaceKey = key;
  configuration = null;
  configurationLoaded = false;
  snapshot = null;
  automaticActivationKey = null;
  configurationRequest += 1;
}

function observeRuntimeTransition() {
  if (state.runtimeStatus === lastRuntimeStatus) return;
  if (state.runtimeStatus === "booting") snapshot = null;
  if (state.runtimeStatus === "ready") {
    readyGeneration += 1;
    automaticActivationKey = null;
  }
  lastRuntimeStatus = state.runtimeStatus;
}

function uiForActivity() {
  return ACTIVITY_UI[configuration?.kind] || ACTIVITY_UI.tank;
}

function activeFileSelected() {
  return Boolean(configuration && state.selectedPath === configuration.path);
}

function controlLabel() {
  const ui = uiForActivity();
  if (busy) return "Activating…";
  if (!snapshot?.version) return ui.activate;
  return `${ui.activate} v${Number(snapshot.attempt || snapshot.version) + 1}`;
}

function statusLabel() {
  if (!snapshot) return "activity awaiting activation";
  const ui = uiForActivity();
  const version = snapshot.version ? `${ui.behavior} v${snapshot.version}` : `no ${ui.behavior}`;
  return `${snapshot.status} · tick ${snapshot.tick} · ${version}`;
}

function removeControls() {
  document.querySelector("[data-active-loop-controls]")?.remove();
  document.querySelector("[data-active-loop-status]")?.remove();
}

function renderControls() {
  if (!globalThis.document) return;
  if (!activeFileSelected()) {
    removeControls();
    return;
  }

  const ui = uiForActivity();
  const actions = document.querySelector(".editor-actions");
  if (!actions) return;
  let group = actions.querySelector("[data-active-loop-controls]");
  if (!group) {
    group = document.createElement("span");
    group.dataset.activeLoopControls = "";
    group.style.display = "contents";
    const run = actions.querySelector("#run-button");
    if (run) actions.insertBefore(group, run);
    else actions.append(group);
  }

  group.innerHTML = `
    <button id="active-loop-activate" class="primary-mini" type="button" title="Stage, validate and install this ${ui.behavior} inside the running worker">${controlLabel()}</button>
    <button id="active-loop-intervention" class="quiet-action" type="button" title="${ui.interventionTitle}">${ui.intervention}</button>
    <button id="active-loop-toggle" class="quiet-action" type="button" title="Pause or resume the runtime-owned activity">${snapshot?.paused ? "Resume activity" : "Pause activity"}</button>`;

  const available = state.runtimeStatus === "ready" && !busy;
  group.querySelector("#active-loop-activate").disabled = !available;
  group.querySelector("#active-loop-intervention").disabled = !available || !snapshot;
  group.querySelector("#active-loop-toggle").disabled = !available || !snapshot;
  group.querySelector("#active-loop-activate").addEventListener("click", () => {
    void activateBehavior({ announce: true });
  });
  group.querySelector("#active-loop-intervention").addEventListener("click", () => {
    void sendCommand(ui.command, ui.options, `${ui.intervention} applied without restarting ${configuration.id}.`);
  });
  group.querySelector("#active-loop-toggle").addEventListener("click", () => {
    const command = snapshot?.paused ? "resume" : "pause";
    void sendCommand(command, {}, `${command === "pause" ? "Paused" : "Resumed"} the same activity identity and state.`);
  });

  const meta = document.querySelector(".editor-meta");
  if (!meta) return;
  let status = meta.querySelector("[data-active-loop-status]");
  if (!status) {
    status = document.createElement("span");
    status.dataset.activeLoopStatus = "";
    status.style.color = "var(--accent, #0b7a57)";
    status.style.fontWeight = "700";
    meta.append(status);
  }
  status.textContent = statusLabel();
  status.title = snapshot?.lastError
    ? `Last replacement rejected: ${snapshot.lastError}`
    : `The runtime owns ${ui.activity}'s clock and retains state across ${ui.behavior} replacement.`;
}

function record(kind, message) {
  appendRepl(kind, message);
  updateReplOnly();
}

async function activeSource() {
  if (!configuration) throw new Error("active/project-not-configured");
  if (state.selectedPath === configuration.path) {
    if (state.dirty) await saveCurrentFile(false);
    return state.content;
  }
  const source = await store.read(configuration.path);
  if (typeof source !== "string") throw new Error(`active/source-not-found:${configuration.path}`);
  return source;
}

async function ensureLoop() {
  const {
    id,
    kind,
    path: _path,
    entry: _entry,
    autoStart: _autoStart,
    ...settings
  } = configuration;
  const result = await runtime.request("active-create", {
    loopId: id,
    kind,
    ...settings,
  });
  snapshot = result.activeLoop || snapshot;
  return snapshot;
}

async function activateBehavior({ announce = false } = {}) {
  if (!configuration || busy || state.runtimeStatus !== "ready") return false;
  const ui = uiForActivity();
  busy = true;
  renderControls();
  try {
    await ensureLoop();
    const source = await activeSource();
    const result = await runtime.request("active-install", {
      loopId: configuration.id,
      source,
      namespace: state.namespace,
      entry: configuration.entry,
    });
    snapshot = result.activeLoop || snapshot;
    if (announce) {
      record("result", `Activated ${configuration.id} ${ui.behavior} v${snapshot?.version || "?"} at tick ${snapshot?.installedAtTick ?? snapshot?.tick ?? "?"}; activity state retained.`);
    } else {
      record("result", `${ui.activity} active · ${configuration.id} · ${ui.behavior} v${snapshot?.version || "?"}`);
    }
    return true;
  } catch (error) {
    snapshot = error?.data?.activeLoop || snapshot;
    const retained = snapshot?.version ? ` ${ui.behavior} v${snapshot.version} remains active.` : " The safe default remains active.";
    record("error", `${error?.message || error}.${retained}`);
    return false;
  } finally {
    busy = false;
    renderControls();
  }
}

async function sendCommand(command, values, message) {
  if (!configuration || busy || state.runtimeStatus !== "ready") return false;
  try {
    const result = await runtime.request("active-command", {
      loopId: configuration.id,
      command,
      ...values,
    });
    snapshot = result.activeLoop || snapshot;
    record("result", message);
    renderControls();
    return true;
  } catch (error) {
    record("error", error?.message || String(error));
    return false;
  }
}

async function maybeActivateAutomatically() {
  if (!configuration?.autoStart || state.runtimeStatus !== "ready") return;
  const key = `${workspaceKey}:${readyGeneration}`;
  if (automaticActivationKey === key) return;
  automaticActivationKey = key;
  await activateBehavior({ announce: false });
}

async function refreshConfiguration() {
  const request = ++configurationRequest;
  const files = await store.files();
  if (request !== configurationRequest || workspaceKey !== currentWorkspaceKey()) return;
  configuration = detectActiveLoopConfiguration(files);
  configurationLoaded = true;
  renderControls();
  await maybeActivateAutomatically();
}

export function syncActiveLoopDemo() {
  if (!globalThis.document) return;
  setWorkspace(currentWorkspaceKey());
  observeRuntimeTransition();
  renderControls();
  if (state.runtimeStatus !== "ready") return;
  if (!configurationLoaded) {
    void refreshConfiguration().catch((error) => {
      configurationLoaded = true;
      configuration = null;
      record("error", `Active project extension rejected: ${error?.message || error}`);
      removeControls();
    });
    return;
  }
  void maybeActivateAutomatically();
}

export function installActiveLoopDemo() {
  if (installed) return;
  installed = true;
  runtime.addEventListener("effect", (event) => {
    const activeLoop = event.detail?.effect?.activeLoop;
    if (!activeLoop) return;
    snapshot = activeLoop;
    renderControls();
  });
}
