import { state } from "../app/context.js";
import { graphWorkspacePatch } from "./graph-events.js";
import {
  moveWorkspaceGraphNode,
  selectWorkspaceGraph,
} from "./graph-state.js";
import { updateHodosWorkspaceShell } from "./workspace-shell.js";

let installed = false;

function report(error) {
  console.error("[hara playground hodos graph]", error);
}

function handleGraphWorkspaceEvent(event) {
  try {
    const patch = graphWorkspacePatch(event.detail);
    if (!patch) return;
    const view = state.workspaceShell?.view;
    if (!view) throw new Error("The current Workspace has no graph model");
    const next = patch.kind === "select"
      ? selectWorkspaceGraph(view, patch)
      : moveWorkspaceGraphNode(view, patch);
    if (next === view) return;
    state.workspaceShell.view = next;
    updateHodosWorkspaceShell(state);
  } catch (error) {
    report(error);
  }
}

export function installHodosGraphConsumer() {
  if (installed) return false;
  document.addEventListener("hodos:workspace-event", handleGraphWorkspaceEvent);
  installed = true;
  return true;
}
