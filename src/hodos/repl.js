import { createHodosComponentRegistry } from "@greenways/hodos-web";
import { createWorkspaceAreaHost } from "@greenways/hodos-workspace-ui";
import { createReplArea } from "@greenways/hodos-dev";
import { registerHodosReplUi } from "@greenways/hodos-dev-ui";

const registry = createHodosComponentRegistry();
registerHodosReplUi(registry, { createReplHost: createPlaygroundReplHost });

let areaHost = null;

const MARKERS = Object.freeze({
  input: null,
  result: "→",
  stdout: "│",
  error: "!",
  diagnostic: "·",
});

function statusValue(value) {
  if (value === "ready") return "ready";
  if (value === "booting" || value === "evaluating") return "busy";
  if (value === "error") return "error";
  if (value === "closed") return "closed";
  return "idle";
}

function entryNode(entry, namespace) {
  const line = document.createElement("div");
  line.className = `repl-line ${entry.kind}`;
  if (entry.kind === "input") {
    const prompt = document.createElement("span");
    prompt.className = "prompt";
    prompt.textContent = `${entry.namespace || namespace}=>`;
    const text = document.createElement("span");
    text.textContent = entry.text;
    line.append(prompt, text);
    return line;
  }
  const marker = document.createElement("span");
  marker.className = "output-marker";
  marker.textContent = MARKERS[entry.kind] ?? "→";
  const text = document.createElement("span");
  text.textContent = entry.text;
  line.append(marker, text);
  return line;
}

function send(dispatch, event) {
  void Promise.resolve(dispatch(event)).catch((error) => {
    console.error("[hara playground hodos repl]", error);
  });
}

export function createPlaygroundReplHost({ container, dispatch }) {
  const output = container?.querySelector?.("#repl-output");
  const form = container?.querySelector?.("#repl-form");
  const input = container?.querySelector?.("#repl-input");
  const clear = container?.querySelector?.("#clear-repl-button");
  const toolbarNamespace = container?.querySelector?.(".repl-toolbar span");
  const prompt = container?.querySelector?.(".repl-form > span");
  if (!output || !form || !input || !clear) {
    throw new Error("Hodos REPL requires the Playground REPL controls");
  }

  const abort = new AbortController();
  const signal = abort.signal;

  input.addEventListener("input", () => send(dispatch, {
    "event/type": "repl/input",
    source: input.value,
  }), { signal });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    send(dispatch, {
      "event/type": "repl/submit",
      source: input.value,
    });
  }, { signal });
  clear.addEventListener("click", () => send(dispatch, {
    "event/type": "repl/clear",
  }), { signal });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      send(dispatch, {
        "event/type": "repl/history",
        direction: event.key === "ArrowUp" ? -1 : 1,
      });
      return;
    }
    if (event.key === "Escape") {
      send(dispatch, { "event/type": "repl/cancel" });
    }
  }, { signal });

  return {
    update(model) {
      output.replaceChildren(...model.entries.map((entry) => entryNode(entry, model.namespace)));
      output.scrollTop = output.scrollHeight;
      if (toolbarNamespace) toolbarNamespace.textContent = `${model.namespace} namespace`;
      if (prompt) prompt.textContent = `${model.namespace}=>`;
      if (input.value !== model.input) input.value = model.input;
      input.disabled = !model.canSubmit;
      container.dataset.replSession = model.session.id || "";
      container.dataset.replStatus = model.session.status;
    },
    dispose() {
      abort.abort();
      delete container.dataset.replSession;
      delete container.dataset.replStatus;
    },
  };
}

export function replAreaFromPlayground(state) {
  return createReplArea({
    id: "repl/main",
    sessionId: state.workspace ? `workspace:${state.workspace}` : null,
    namespace: state.namespace,
    status: statusValue(state.runtimeStatus),
    entries: state.repl.map((entry) => ({
      kind: entry.kind === "diagnostic" ? "diagnostic" : entry.kind,
      text: String(entry.text ?? ""),
      namespace: entry.namespace || null,
    })),
    input: state.replInput || "",
    history: state.history,
    historyIndex: state.historyIndex,
    canSubmit: state.runtimeStatus === "ready",
  });
}

export function disposeHodosRepl() {
  areaHost?.destroy();
  areaHost = null;
}

export function mountHodosRepl(state) {
  disposeHodosRepl();
  const root = globalThis.document?.querySelector(".repl-view");
  if (!root) return false;
  areaHost = createWorkspaceAreaHost({
    root,
    registry,
    dispatch(event) {
      globalThis.document?.dispatchEvent(new CustomEvent("hodos:workspace-event", {
        detail: event,
      }));
    },
  });
  areaHost.open(replAreaFromPlayground(state));
  return true;
}

export function updateHodosRepl(state) {
  if (!areaHost) return false;
  areaHost.update(replAreaFromPlayground(state));
  return true;
}
