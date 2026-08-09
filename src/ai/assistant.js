import { state } from "../app/context.js";
import { buildPlaygroundMessages } from "./context.js";
import { GREENWAYS_AI_ORIGIN, GreenwaysAiClient } from "./greenways-client.js";

const client = new GreenwaysAiClient();
const MODEL_STORAGE_PREFIX = "hara-playground-greenways-model:";

const assistant = {
  open: false,
  probed: false,
  status: "idle",
  connection: null,
  error: "",
  notice: "",
  profileId: "",
  model: "",
  prompt: "",
  includeBuffer: true,
  generation: "idle",
  pendingRequestId: null,
  output: "",
  outputMeta: "",
  contextTruncated: false,
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function storageGet(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function storageSet(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // A model id is a convenience setting, not required state.
  }
}

function publicProfiles() {
  const profiles = assistant.connection?.ai?.providerProfiles;
  return Array.isArray(profiles) ? profiles : [];
}

function profileAccess(profile) {
  return Boolean(assistant.connection?.ai?.providerAccess?.[profile?.provider]);
}

function selectAvailableProfile() {
  const profiles = publicProfiles();
  const selected = profiles.find(({ id }) => id === assistant.profileId);
  const next = selected ?? profiles.find(profileAccess) ?? profiles[0] ?? null;
  assistant.profileId = next?.id ?? "";
  if (next) assistant.model = storageGet(`${MODEL_STORAGE_PREFIX}${next.id}`);
  return next;
}

function selectedProfile() {
  return publicProfiles().find(({ id }) => id === assistant.profileId) ?? selectAvailableProfile();
}

function connectionView() {
  if (!client.supportedOrigin) {
    return {
      tone: "quiet",
      label: "Production origin required",
      detail: `Greenways OS connects at ${GREENWAYS_AI_ORIGIN}.`,
      action: "none",
    };
  }
  if (assistant.status === "checking" || (!assistant.probed && assistant.status === "idle")) {
    return { tone: "checking", label: "Looking for Greenways OS", detail: "Checking the local extension bridge…", action: "none" };
  }
  if (assistant.status === "unavailable") {
    return { tone: "error", label: "Greenways OS not detected", detail: assistant.error || "Enable the Greenways OS extension for this site.", action: "retry" };
  }
  const capability = assistant.connection?.capability;
  if (!capability?.allowed) {
    return {
      tone: "warn",
      label: "AI access needs approval",
      detail: "Open Greenways OS to approve Hara Playground and model/generate.",
      action: "connect",
    };
  }
  const profiles = publicProfiles();
  if (!profiles.length) {
    return {
      tone: "warn",
      label: "Add an AI provider key",
      detail: "Provider keys are installed in Greenways OS and never copied into Playground.",
      action: "connect",
    };
  }
  if (!profiles.some(profileAccess)) {
    return {
      tone: "warn",
      label: "Provider network approval required",
      detail: "Open Greenways OS and approve the exact network origin for a provider.",
      action: "connect",
    };
  }
  return {
    tone: "good",
    label: "Connected through Greenways OS",
    detail: `${profiles.length} session provider profile${profiles.length === 1 ? "" : "s"} available.`,
    action: "refresh",
  };
}

function ensurePanel() {
  let panel = document.querySelector("[data-greenways-ai-panel]");
  if (panel) return panel;
  panel = document.createElement("aside");
  panel.className = "greenways-ai-panel";
  panel.dataset.greenwaysAiPanel = "";
  panel.id = "greenways-ai-panel";
  panel.setAttribute("aria-label", "Hara AI assistant through Greenways OS");
  panel.setAttribute("aria-hidden", "true");
  document.body.append(panel);
  return panel;
}

function ensureTrigger() {
  const host = document.querySelector(".editor-actions") || document.querySelector(".lobby-nav");
  if (!host) return null;
  let trigger = host.querySelector("[data-greenways-ai-trigger]");
  if (trigger) return trigger;
  trigger = document.createElement("button");
  trigger.type = "button";
  trigger.dataset.greenwaysAiTrigger = "";
  trigger.className = host.classList.contains("editor-actions")
    ? "quiet-action greenways-ai-trigger"
    : "greenways-ai-lobby-trigger";
  trigger.setAttribute("aria-controls", "greenways-ai-panel");
  trigger.innerHTML = '<span aria-hidden="true">✦</span><span>AI</span>';
  trigger.addEventListener("click", () => {
    assistant.open = !assistant.open;
    renderPanel();
    syncTrigger();
    if (assistant.open) refreshStatus({ quiet: true });
  });
  host.append(trigger);
  return trigger;
}

function syncTrigger() {
  const trigger = document.querySelector("[data-greenways-ai-trigger]");
  if (!trigger) return;
  trigger.setAttribute("aria-expanded", String(assistant.open));
  trigger.classList.toggle("active", assistant.open);
}

function statusAction(view) {
  if (view.action === "connect") {
    return '<button type="button" class="greenways-ai-secondary" data-greenways-connect>Open Greenways OS</button>';
  }
  if (view.action === "retry" || view.action === "refresh") {
    return `<button type="button" class="greenways-ai-icon" data-greenways-refresh title="Refresh connection" aria-label="Refresh connection">↻</button>`;
  }
  return "";
}

function renderProfileOptions(profiles) {
  if (!profiles.length) return '<option value="">No provider profiles</option>';
  return profiles.map((profile) => {
    const access = profileAccess(profile) ? "" : " · approval required";
    return `<option value="${escapeHtml(profile.id)}" ${profile.id === assistant.profileId ? "selected" : ""}>${escapeHtml(profile.label)} · ${escapeHtml(profile.provider)}${access}</option>`;
  }).join("");
}

function renderPanel() {
  const panel = ensurePanel();
  const view = connectionView();
  const profiles = publicProfiles();
  const profile = selectedProfile();
  const ready = view.tone === "good" && profile && profileAccess(profile);
  const generating = assistant.generation === "generating";
  const hasBuffer = Boolean(state.selectedPath);

  panel.classList.toggle("is-open", assistant.open);
  panel.setAttribute("aria-hidden", String(!assistant.open));
  panel.innerHTML = `
    <header class="greenways-ai-header">
      <div class="greenways-ai-mark">✦</div>
      <div><strong>Hara AI</strong><small>via Greenways OS</small></div>
      <button type="button" class="greenways-ai-icon" data-greenways-close aria-label="Close AI assistant">×</button>
    </header>

    <div class="greenways-ai-connection" data-tone="${escapeHtml(view.tone)}">
      <i></i>
      <div><strong>${escapeHtml(view.label)}</strong><span>${escapeHtml(view.detail)}</span></div>
      ${statusAction(view)}
    </div>

    <form class="greenways-ai-form" data-greenways-ai-form>
      <div class="greenways-ai-fields">
        <label><span>Provider profile</span><select data-greenways-profile ${ready && !generating ? "" : "disabled"}>${renderProfileOptions(profiles)}</select></label>
        <label><span>Model ID</span><input data-greenways-model value="${escapeHtml(assistant.model)}" placeholder="Enter a model ID" maxlength="160" autocomplete="off" spellcheck="false" ${ready && !generating ? "" : "disabled"}></label>
      </div>
      <label class="greenways-ai-prompt"><span>Ask about the project</span><textarea data-greenways-prompt rows="5" maxlength="12000" placeholder="Explain this form, find a bug, or propose a change…" ${ready && !generating ? "" : "disabled"}>${escapeHtml(assistant.prompt)}</textarea></label>
      <label class="greenways-ai-context"><input type="checkbox" data-greenways-buffer ${assistant.includeBuffer ? "checked" : ""} ${hasBuffer && ready && !generating ? "" : "disabled"}><span>Include current buffer</span><small>${hasBuffer ? escapeHtml(state.selectedPath) : "No file selected"}</small></label>
      ${assistant.contextTruncated ? '<p class="greenways-ai-note">The current buffer was truncated to fit the bounded Greenways request.</p>' : ""}
      ${assistant.notice ? `<p class="greenways-ai-note">${escapeHtml(assistant.notice)}</p>` : ""}
      ${assistant.error && assistant.status !== "unavailable" ? `<p class="greenways-ai-error" role="alert">${escapeHtml(assistant.error)}</p>` : ""}
      <div class="greenways-ai-actions">
        ${generating
          ? '<button type="button" class="greenways-ai-secondary" data-greenways-cancel>Cancel</button><span>Asking provider…</span>'
          : `<button type="submit" class="greenways-ai-primary" ${ready ? "" : "disabled"}>Ask AI</button><span>Keys remain in Greenways OS.</span>`}
      </div>
    </form>

    <section class="greenways-ai-result ${assistant.output ? "has-output" : ""}" aria-live="polite">
      <header><span>Response</span>${assistant.output ? '<button type="button" class="greenways-ai-copy" data-greenways-copy>Copy</button>' : ""}</header>
      <pre data-greenways-output></pre>
      ${assistant.outputMeta ? `<small>${escapeHtml(assistant.outputMeta)}</small>` : ""}
    </section>`;

  const output = panel.querySelector("[data-greenways-output]");
  if (output) output.textContent = assistant.output || "Responses from the selected provider will appear here.";
  bindPanelEvents(panel);
  syncTrigger();
}

function bindPanelEvents(panel) {
  panel.querySelector("[data-greenways-close]")?.addEventListener("click", () => {
    assistant.open = false;
    renderPanel();
  });
  panel.querySelector("[data-greenways-refresh]")?.addEventListener("click", () => refreshStatus());
  panel.querySelector("[data-greenways-connect]")?.addEventListener("click", openGreenwaysOs);
  panel.querySelector("[data-greenways-profile]")?.addEventListener("change", (event) => {
    assistant.profileId = event.currentTarget.value;
    assistant.model = storageGet(`${MODEL_STORAGE_PREFIX}${assistant.profileId}`);
    assistant.error = "";
    renderPanel();
  });
  panel.querySelector("[data-greenways-model]")?.addEventListener("input", (event) => {
    assistant.model = event.currentTarget.value;
    if (assistant.profileId) storageSet(`${MODEL_STORAGE_PREFIX}${assistant.profileId}`, assistant.model);
  });
  panel.querySelector("[data-greenways-prompt]")?.addEventListener("input", (event) => {
    assistant.prompt = event.currentTarget.value;
  });
  panel.querySelector("[data-greenways-buffer]")?.addEventListener("change", (event) => {
    assistant.includeBuffer = event.currentTarget.checked;
  });
  panel.querySelector("[data-greenways-ai-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    generate();
  });
  panel.querySelector("[data-greenways-cancel]")?.addEventListener("click", cancelGeneration);
  panel.querySelector("[data-greenways-copy]")?.addEventListener("click", copyOutput);
}

async function refreshStatus({ quiet = false } = {}) {
  if (!client.supportedOrigin) {
    assistant.probed = true;
    assistant.status = "unsupported";
    renderPanel();
    return;
  }
  assistant.probed = true;
  assistant.status = "checking";
  if (!quiet) assistant.notice = "Refreshing Greenways OS connection…";
  assistant.error = "";
  renderPanel();
  try {
    assistant.connection = await client.status();
    assistant.status = "ready";
    assistant.notice = "";
    selectAvailableProfile();
  } catch (error) {
    assistant.connection = null;
    assistant.status = "unavailable";
    assistant.error = error?.message || "Greenways OS was not detected";
    assistant.notice = "";
  }
  renderPanel();
}

async function openGreenwaysOs() {
  assistant.notice = "Opening the Greenways OS approval screen…";
  assistant.error = "";
  renderPanel();
  try {
    await client.open();
    assistant.notice = "Approve Playground and add a provider key in Greenways OS, then return here and refresh.";
  } catch (error) {
    assistant.notice = "";
    assistant.error = error?.message || "Greenways OS could not be opened";
  }
  renderPanel();
}

async function generate() {
  if (assistant.generation === "generating") return;
  const profile = selectedProfile();
  const model = assistant.model.trim();
  assistant.error = "";
  assistant.notice = "";
  assistant.contextTruncated = false;
  if (!profile || !profileAccess(profile)) {
    assistant.error = "Select a provider profile with network approval";
    renderPanel();
    return;
  }
  if (!model) {
    assistant.error = "Enter the model ID supplied by your provider";
    renderPanel();
    return;
  }

  let context;
  try {
    context = buildPlaygroundMessages({
      prompt: assistant.prompt,
      selectedPath: state.selectedPath,
      content: state.content,
      namespace: state.namespace,
      includeBuffer: assistant.includeBuffer,
    });
  } catch (error) {
    assistant.error = error?.message || "The AI request is invalid";
    renderPanel();
    return;
  }

  assistant.contextTruncated = context.truncated;
  assistant.generation = "generating";
  assistant.output = "";
  assistant.outputMeta = "";
  renderPanel();

  const operation = client.generate({
    profileId: profile.id,
    model,
    messages: context.messages,
    maxOutputTokens: 2048,
    timeoutMs: 120000,
  });
  assistant.pendingRequestId = operation.requestId;
  try {
    const response = await operation.promise;
    const result = response.result;
    assistant.output = result?.output || "The provider returned no text.";
    const usage = result?.usage?.totalTokens;
    assistant.outputMeta = [
      result?.provider,
      result?.model,
      Number.isFinite(usage) ? `${usage} tokens` : null,
    ].filter(Boolean).join(" · ");
  } catch (error) {
    if (error?.code !== "REQUEST_CANCELLED") {
      assistant.error = error?.message || "The AI request failed";
    } else {
      assistant.notice = "The AI request was cancelled.";
    }
  } finally {
    assistant.generation = "idle";
    assistant.pendingRequestId = null;
    renderPanel();
  }
}

async function cancelGeneration() {
  if (!assistant.pendingRequestId) return;
  assistant.notice = "Cancelling the provider request…";
  renderPanel();
  try {
    await client.cancel(assistant.pendingRequestId);
  } catch (error) {
    assistant.error = error?.message || "The AI request could not be cancelled";
  }
  renderPanel();
}

async function copyOutput() {
  if (!assistant.output) return;
  try {
    if (typeof globalThis.navigator?.clipboard?.writeText !== "function") {
      throw new Error("Clipboard access is unavailable");
    }
    await globalThis.navigator.clipboard.writeText(assistant.output);
    assistant.notice = "Response copied.";
  } catch {
    assistant.error = "The response could not be copied automatically";
  }
  renderPanel();
}

export function mountGreenwaysAiAssistant() {
  ensurePanel();
  ensureTrigger();
  renderPanel();
  if (!assistant.probed) refreshStatus({ quiet: true });
}
