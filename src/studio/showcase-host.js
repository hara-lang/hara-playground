import { state } from "../app/context.js";
import {
  currentHodosWorkspaceDescriptor,
  updateHodosWorkspaceShell,
} from "../hodos/workspace-shell.js";
import {
  playgroundSurfaceById,
  workspaceTokenName,
} from "../hodos/workspace-shell-state.js";
import {
  SHOWCASE_PRESENTATION,
  showcaseErrorMessage,
  showcaseReadyMessage,
  showcaseSelectionMessage,
  showcaseSurfaceSelectionFromMessage,
  syncShowcaseLocation,
  trustedShowcaseParentOrigin,
} from "./showcase.js";

let installed = false;
let readySignature = "";
let errorSignature = "";

function active() {
  return state.presentation?.mode === SHOWCASE_PRESENTATION;
}

function parentWindow() {
  return globalThis.parent && globalThis.parent !== globalThis
    ? globalThis.parent
    : null;
}

function post(target, message, origin = "*") {
  try {
    target?.postMessage?.(message, origin);
    return true;
  } catch {
    return false;
  }
}

function statusElement() {
  const document = globalThis.document;
  if (!document) return null;
  let element = document.querySelector("[data-hara-showcase-status]");
  if (element) return element;
  element = document.createElement("aside");
  element.className = "showcase-status";
  element.dataset.haraShowcaseStatus = "";
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  const signal = document.createElement("i");
  signal.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  element.append(signal, label);
  document.body.append(element);
  return element;
}

function projectStatusEvidence() {
  const root = globalThis.document?.documentElement;
  if (!root?.dataset) return;
  root.dataset.showcaseRuntimeStatus = state.runtimeStatus || "idle";
  root.dataset.showcaseWorkspaceStatus = state.workspaceShell?.status || "idle";
  root.dataset.showcaseWorkspaceSource = state.workspaceShell?.source || "fallback";
  root.dataset.showcaseCommit = state.metadata?.commit || "";
  if (state.workspaceShell?.error) root.dataset.showcaseWorkspaceError = state.workspaceShell.error;
  else delete root.dataset.showcaseWorkspaceError;
}

function showStatus(kind, message) {
  projectStatusEvidence();
  const element = statusElement();
  if (!element) return;
  element.hidden = false;
  element.dataset.status = kind;
  element.querySelector("span").textContent = message;
  globalThis.document.documentElement.dataset.showcaseStatus = kind;
}

function hideStatus() {
  projectStatusEvidence();
  const element = globalThis.document?.querySelector("[data-hara-showcase-status]");
  if (element) element.hidden = true;
  if (globalThis.document?.documentElement?.dataset) {
    globalThis.document.documentElement.dataset.showcaseStatus = "ready";
  }
}

function descriptorSurfaceIds(descriptor) {
  return (descriptor?.["workspace/customizations"]?.["responsive/surfaces"] || [])
    .map((surface) => workspaceTokenName(surface?.["surface/id"]))
    .filter(Boolean);
}

function requestedSurface(descriptor) {
  const requested = state.presentation?.surfaceId;
  if (!requested) return null;
  return playgroundSurfaceById(descriptor, requested);
}

function publishError(message) {
  showStatus("error", message);
  if (message === errorSignature) return;
  errorSignature = message;
  post(parentWindow(), showcaseErrorMessage(message));
}

export function selectShowcaseSurface(surfaceId) {
  if (!active()) throw new Error("The Playground is not in Showcase presentation");
  const descriptor = currentHodosWorkspaceDescriptor();
  if (!descriptor) throw new Error("The Showcase Workspace is not ready");
  const surface = playgroundSurfaceById(descriptor, surfaceId);
  if (!surface) throw new Error(`Showcase surface is not declared: ${surfaceId}`);

  const selected = workspaceTokenName(surface["surface/id"]);
  state.presentation = {
    ...state.presentation,
    surfaceId: selected,
    error: "",
  };
  state.workspaceShell.surfaceId = selected;
  if (!updateHodosWorkspaceShell(state)) {
    throw new Error("The Showcase Workspace host is not mounted");
  }
  syncShowcaseLocation(state.metadata, state.presentation);
  return selected;
}

function onMessage(event) {
  if (!active() || event.source !== parentWindow()) return;
  if (!trustedShowcaseParentOrigin(event.origin, globalThis.location)) return;

  let command;
  try {
    command = showcaseSurfaceSelectionFromMessage(event.data);
    if (!command) return;
    const selected = selectShowcaseSurface(command.surfaceId);
    post(event.source, showcaseSelectionMessage(selected), event.origin);
    syncShowcaseHost();
  } catch (error) {
    const requested = command?.surfaceId || null;
    post(
      event.source,
      showcaseSelectionMessage(requested, { ok: false, message: error.message }),
      event.origin,
    );
  }
}

export function installShowcaseHost() {
  if (installed) return;
  installed = true;
  globalThis.addEventListener?.("message", onMessage);
}

export function syncShowcaseHost() {
  if (!active()) {
    globalThis.document?.querySelector("[data-hara-showcase-status]")?.remove();
    return false;
  }

  const document = globalThis.document;
  if (document?.documentElement?.dataset) {
    document.documentElement.dataset.presentation = SHOWCASE_PRESENTATION;
  }

  // The immutable Showcase URL is part of the host contract, not ordinary
  // Studio navigation. Repository import briefly projects a branch-oriented
  // location; restore the commit, presentation and selected surface as soon as
  // metadata exists, including while the runtime and manifest are still loading.
  if (state.metadata?.source === "github") {
    syncShowcaseLocation(state.metadata, state.presentation);
  }
  projectStatusEvidence();

  if (state.presentation.error) {
    publishError(state.presentation.error);
    return false;
  }

  const descriptor = currentHodosWorkspaceDescriptor();
  const immutableProjectReady = state.metadata?.source === "github"
    && /^[0-9a-f]{40}$/.test(state.metadata?.commit || "")
    && state.runtimeStatus === "ready"
    && state.workspaceShell?.status !== "loading";

  if (!descriptor || !immutableProjectReady) {
    showStatus("loading", "Opening immutable Hara package demo…");
    return false;
  }

  const requested = requestedSurface(descriptor);
  if (state.presentation.surfaceId && !requested) {
    state.presentation.error = `Showcase surface is not declared: ${state.presentation.surfaceId}`;
    publishError(state.presentation.error);
    return false;
  }

  hideStatus();
  errorSignature = "";
  const surfaces = descriptorSurfaceIds(descriptor);
  const selected = workspaceTokenName(
    descriptor?.["workspace/selection"]?.["surface/id"]
      || state.presentation.surfaceId,
  ) || null;
  const message = showcaseReadyMessage({
    workspaceId: descriptor?.["workspace/id"] || state.workspace,
    commit: state.metadata.commit,
    surfaceId: selected,
    surfaces,
  });
  const signature = JSON.stringify(message);
  if (signature !== readySignature) {
    readySignature = signature;
    post(parentWindow(), message);
  }
  syncShowcaseLocation(state.metadata, {
    ...state.presentation,
    surfaceId: selected,
  });
  return true;
}
