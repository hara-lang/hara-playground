import { runtime, state, store } from "../app/context.js";
import { detectProjectConfiguration } from "../workspace/project.js";
import {
  AUDIO_OBSERVER_OPTIONS,
  reconcileWithoutObservation,
  setTextContentIfChanged
} from "./dom-sync.js";
import { PlaygroundAudioHost, coerceControlValue } from "./host.js";

const OUTPUT_KEY = "hara-playground-output";
const AUDIO_TAB = "audio";

let root = null;
let observer = null;
let scheduled = false;
let workspaceMounted = false;
let active = readSetting(OUTPUT_KEY, "preview") === AUDIO_TAB;

const audio = new PlaygroundAudioHost({
  runtime,
  storage: globalThis.localStorage,
  onChange: scheduleMount
});

function readSetting(key, fallback) {
  try {
    return globalThis.localStorage?.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSetting(key, value) {
  try {
    globalThis.localStorage?.setItem(key, String(value));
  } catch {
    // Output preferences are optional.
  }
}

function scheduleMount() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(mount);
}

function mount() {
  scheduled = false;
  if (!root || !observer) return;

  reconcileWithoutObservation(observer, root, () => {
    const panel = root.querySelector(".output-panel");
    if (!panel) {
      if (workspaceMounted) void audio.pause().catch(() => {});
      workspaceMounted = false;
      return;
    }
    workspaceMounted = true;

    const tabs = panel.querySelector(".output-tabs");
    if (!tabs) return;
    let button = tabs.querySelector('[data-output-tab="audio"]');
    if (!button) {
      button = document.createElement("button");
      button.className = "output-tab audio-output-tab";
      button.type = "button";
      button.dataset.outputTab = AUDIO_TAB;
      button.innerHTML = '<span aria-hidden="true">♪</span> Audio';
      tabs.querySelector(".preview-mode")?.before(button);
    }

    let view = panel.querySelector(".audio-view");
    if (!view) {
      view = document.createElement("section");
      view.className = "audio-view";
      view.setAttribute("aria-live", "polite");
      panel.append(view);
    }
    renderAudioView(view);
    applyOutputMode(panel);
  });
}

function applyOutputMode(panel) {
  const audioButton = panel.querySelector('[data-output-tab="audio"]');
  const audioView = panel.querySelector(".audio-view");
  audioButton?.classList.toggle("active", active);
  audioView?.classList.toggle("active", active);
  if (active) {
    panel.querySelectorAll('.output-tab:not([data-output-tab="audio"])')
      .forEach((button) => button.classList.remove("active"));
    panel.querySelector(".preview-view")?.classList.remove("active");
    panel.querySelector(".repl-view")?.classList.remove("active");
  }
  setTextContentIfChanged(
    panel.querySelector(".preview-mode"),
    active ? "audio/playback" : "kernel effects"
  );
}

function renderAudioView(view) {
  const snapshot = audio.state.snapshot;
  const key = JSON.stringify({
    requested: audio.state.requested,
    status: audio.state.status,
    error: audio.state.error,
    runtime: state.runtimeKind,
    snapshot
  });
  if (view.dataset.renderKey === key) return;
  view.dataset.renderKey = key;

  if (!audio.state.requested) {
    view.innerHTML = `
      <div class="audio-empty-state">
        <span class="audio-empty-state__mark">♪</span>
        <p class="hara-kicker">CAPABILITY-GATED OUTPUT</p>
        <h2>Audio is available to declared projects.</h2>
        <p>Add <code>:audio/playback</code> to <code>:project/capabilities</code>, then start a graph with <code>gw.audio.supersonic/start</code>.</p>
      </div>`;
    return;
  }

  if (!snapshot) {
    view.innerHTML = `
      <div class="audio-empty-state">
        <span class="audio-empty-state__mark is-ready">♪</span>
        <p class="hara-kicker">AUDIO / PLAYBACK GRANTED</p>
        <h2>Waiting for a Supersonic graph.</h2>
        <p>Run the project or evaluate <code>(sonic/start graph)</code>. The browser will prepare the graph silently; sound begins only after Play is pressed.</p>
        ${state.runtimeKind === "embedded" ? '<p class="audio-warning">The embedded evaluator does not provide host calls. Install the canonical WASM runtime to run this graph.</p>' : ""}
      </div>`;
    return;
  }

  const controls = snapshot.nodes.flatMap((node) =>
    (node.controls || []).map((control) => renderControl(node, control))).join("");
  const pending = snapshot.pending?.length || 0;
  view.innerHTML = `
    <div class="audio-console">
      <header class="audio-console__header">
        <div>
          <p class="hara-kicker">SUPERSONIC / LIVE GRAPH</p>
          <h2>${escapeHtml(snapshot.title || snapshot["graph/id"])}</h2>
          <p>${escapeHtml(snapshot["graph/id"])} · generation ${escapeHtml(snapshot.generation)} · revision ${escapeHtml(snapshot["active/revision"])}</p>
        </div>
        <span class="audio-status audio-status--${escapeHtml(audio.state.status)}"><i></i>${escapeHtml(audio.state.status)}</span>
      </header>
      <div class="audio-transport" role="group" aria-label="Audio transport">
        <button id="audio-play-button" class="primary-mini" type="button">▶ Play</button>
        <button id="audio-pause-button" class="quiet-action" type="button">Ⅱ Pause</button>
        <button id="audio-stop-button" class="quiet-action" type="button">■ Stop</button>
        <span>Web Audio unlocks on Play · ${snapshot.nodes.length} nodes · ${snapshot.connections.length} connections${pending ? ` · ${pending} pending` : ""}</span>
      </div>
      ${audio.state.error ? `<p class="audio-error" role="alert">${escapeHtml(audio.state.error)}</p>` : ""}
      <div class="audio-controls">${controls || '<p class="audio-no-controls">This graph exposes no editable controls.</p>'}</div>
      <details class="audio-live-coding">
        <summary>Live coding forms</summary>
        <pre><code>(sonic/update "${escapeHtml(snapshot["graph/id"])}" "transport" "tempo" 138)
(sonic/update "${escapeHtml(snapshot["graph/id"])}" "source" "waveform" "saw")
(sonic/status "${escapeHtml(snapshot["graph/id"])}")</code></pre>
      </details>
    </div>`;
}

function renderControl(node, control) {
  const value = node.params?.[control.parameter];
  const attributes = `data-audio-control data-audio-node="${escapeHtml(node.id)}" data-audio-parameter="${escapeHtml(control.parameter)}"`;
  let input;
  if (control.type === "boolean") {
    input = `<input ${attributes} type="checkbox" ${value ? "checked" : ""}>`;
  } else if (control.type === "choice") {
    input = `<select ${attributes}>${(control.choices || []).map((choice) => {
      const choiceValue = typeof choice === "object" ? choice.value : choice;
      const choiceLabel = typeof choice === "object" ? choice.label ?? choice.value : choice;
      return `<option value="${escapeHtml(choiceValue)}" ${choiceValue === value ? "selected" : ""}>${escapeHtml(choiceLabel)}</option>`;
    }).join("")}</select>`;
  } else if (control.type === "steps") {
    const steps = (Array.isArray(value) ? value : []).map((step) => step == null ? "_" : step).join(" ");
    input = `<input ${attributes} class="audio-steps-input" type="text" value="${escapeHtml(steps)}" spellcheck="false" aria-label="${escapeHtml(control.label)} note offsets">`;
  } else {
    const min = control.min ?? 0;
    const max = control.max ?? 1;
    const step = control.step ?? (control.integer ? 1 : 0.01);
    input = `<div class="audio-range"><input ${attributes} type="range" min="${escapeHtml(min)}" max="${escapeHtml(max)}" step="${escapeHtml(step)}" value="${escapeHtml(value ?? min)}"><output>${escapeHtml(value ?? min)}</output></div>`;
  }
  return `<label class="audio-control">
    <span><strong>${escapeHtml(control.label)}</strong><small>${escapeHtml(node.label)}</small></span>
    ${input}
  </label>`;
}

async function handleClick(event) {
  const outputTab = event.target.closest(".output-tab[data-output-tab]");
  if (outputTab) {
    if (outputTab.dataset.outputTab === AUDIO_TAB) {
      event.preventDefault();
      active = true;
      writeSetting(OUTPUT_KEY, AUDIO_TAB);
      applyOutputMode(outputTab.closest(".output-panel"));
    } else {
      active = false;
    }
    return;
  }

  const action = event.target.closest("#audio-play-button, #audio-pause-button, #audio-stop-button");
  if (!action) return;
  event.preventDefault();
  try {
    if (action.id === "audio-play-button") await audio.play();
    else if (action.id === "audio-pause-button") await audio.pause();
    else await audio.stop();
  } catch (error) {
    console.error("[hara playground audio]", error);
  }
}

async function handleChange(event) {
  const element = event.target.closest("[data-audio-control]");
  if (!element || !audio.state.snapshot) return;
  const node = audio.state.snapshot.nodes.find((candidate) => candidate.id === element.dataset.audioNode);
  const control = node?.controls?.find((candidate) => candidate.parameter === element.dataset.audioParameter);
  if (!control) return;
  try {
    await audio.updateControl(node.id, control.parameter, coerceControlValue(control, element));
  } catch (error) {
    console.error("[hara playground audio]", error);
  }
}

function handleInput(event) {
  const element = event.target.closest('input[type="range"][data-audio-control]');
  if (element) element.parentElement?.querySelector("output")?.replaceChildren(element.value);
}

export function installAudioOutput(applicationRoot = document.querySelector("#app")) {
  if (!applicationRoot || observer) return () => {};
  root = applicationRoot;
  runtime.setBootContextProvider(async ({ generation, signal } = {}) => {
    const project = detectProjectConfiguration(await store.files());
    await audio.configure(project.capabilities, store.workspace, { generation, signal });
    return { capabilities: project.capabilities };
  });
  observer = new MutationObserver(scheduleMount);
  observer.observe(root, AUDIO_OBSERVER_OPTIONS);
  root.addEventListener("click", handleClick, true);
  root.addEventListener("change", handleChange);
  root.addEventListener("input", handleInput);
  scheduleMount();
  return () => {
    observer?.disconnect();
    observer = null;
    root?.removeEventListener("click", handleClick, true);
    root?.removeEventListener("change", handleChange);
    root?.removeEventListener("input", handleInput);
    root = null;
    scheduled = false;
    workspaceMounted = false;
    void audio.dispose();
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
  );
}
