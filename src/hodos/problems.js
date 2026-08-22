import { createHodosComponentRegistry } from "@greenways/hodos-web";
import { createWorkspaceAreaHost } from "@greenways/hodos-workspace-ui";
import { createProblemsArea } from "@greenways/hodos-dev";
import { registerHodosProblemsUi } from "@greenways/hodos-dev-ui";

const registry = createHodosComponentRegistry();
registerHodosProblemsUi(registry, { createProblemsHost: createPlayProblemsHost });

let areaHost = null;

function send(dispatch, event) {
  void Promise.resolve(dispatch(event)).catch((error) => {
    console.error("[hara playground hodos problems]", error);
  });
}

function visibleProblems(model) {
  const severity = model.filter?.severity ?? "all";
  const query = String(model.filter?.query ?? "").trim().toLowerCase();
  return model.problems.filter((problem) => {
    if (severity !== "all" && problem.severity !== severity) return false;
    if (!query) return true;
    return [problem.message, problem.code, problem.path, problem.namespace, problem.source]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function locationLabel(problem) {
  if (!problem.path) return problem.source || "runtime";
  if (!problem.range) return problem.path;
  return `${problem.path}:${problem.range.start.line + 1}:${problem.range.start.column + 1}`;
}

function problemRow(document, problem, selectedId, dispatch, signal) {
  const row = document.createElement("article");
  row.className = `problem-row ${problem.severity}${problem.id === selectedId ? " selected" : ""}`;
  row.dataset.problemId = problem.id;

  const select = document.createElement("button");
  select.type = "button";
  select.className = "problem-select";
  const severity = document.createElement("span");
  severity.className = "problem-severity";
  severity.textContent = problem.severity;
  const content = document.createElement("span");
  content.className = "problem-content";
  const message = document.createElement("strong");
  message.textContent = problem.message;
  const meta = document.createElement("small");
  meta.textContent = [problem.code, locationLabel(problem)].filter(Boolean).join(" · ");
  content.append(message, meta);
  select.append(severity, content);
  select.addEventListener("click", () => send(dispatch, {
    "event/type": "problems/select",
    problemId: problem.id,
  }), { signal });

  const actions = document.createElement("div");
  actions.className = "problem-actions";
  if (problem.path) {
    const open = document.createElement("button");
    open.type = "button";
    open.className = "text-button";
    open.textContent = "Open";
    open.addEventListener("click", () => send(dispatch, {
      "event/type": "problems/open-source",
      problemId: problem.id,
    }), { signal });
    actions.append(open);
  }
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "text-button";
  copy.textContent = "Copy";
  copy.addEventListener("click", () => send(dispatch, {
    "event/type": "problems/copy",
    problemId: problem.id,
  }), { signal });
  actions.append(copy);
  row.append(select, actions);
  return row;
}

export function createPlayProblemsHost({ container, dispatch }) {
  if (!container) throw new Error("Hodos Problems requires a container");
  const document = container.ownerDocument || globalThis.document;
  const abort = new AbortController();
  const signal = abort.signal;

  const shell = document.createElement("div");
  shell.className = "problems-shell";
  const toolbar = document.createElement("header");
  toolbar.className = "problems-toolbar";
  const severity = document.createElement("select");
  severity.setAttribute("aria-label", "Problem severity filter");
  for (const [value, label] of [
    ["all", "All"],
    ["error", "Errors"],
    ["warning", "Warnings"],
    ["info", "Info"],
    ["hint", "Hints"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    severity.append(option);
  }
  const query = document.createElement("input");
  query.type = "search";
  query.placeholder = "Filter problems";
  query.setAttribute("aria-label", "Filter problems");
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "text-button";
  clear.textContent = "Clear";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "text-button";
  close.textContent = "Close";
  toolbar.append(severity, query, clear, close);

  const counts = document.createElement("div");
  counts.className = "problems-counts";
  const list = document.createElement("div");
  list.className = "problems-list";
  shell.append(toolbar, counts, list);
  container.replaceChildren(shell);

  const emitFilter = () => send(dispatch, {
    "event/type": "problems/filter",
    severity: severity.value,
    query: query.value,
  });
  severity.addEventListener("change", emitFilter, { signal });
  query.addEventListener("input", emitFilter, { signal });
  clear.addEventListener("click", () => send(dispatch, {
    "event/type": "problems/clear",
  }), { signal });
  close.addEventListener("click", () => send(dispatch, {
    "event/type": "problems/close",
  }), { signal });

  return {
    update(model) {
      if (severity.value !== model.filter.severity) severity.value = model.filter.severity;
      if (query.value !== model.filter.query) query.value = model.filter.query;
      clear.disabled = !model.canClear;
      counts.textContent = [
        `${model.counts.total} total`,
        `${model.counts.error} errors`,
        `${model.counts.warning} warnings`,
        `${model.counts.info} info`,
        `${model.counts.hint} hints`,
      ].join(" · ");
      container.dataset.problemsStatus = model.status;
      container.dataset.problemsCount = String(model.counts.total);
      list.replaceChildren();
      const visible = visibleProblems(model);
      if (!visible.length) {
        const empty = document.createElement("div");
        empty.className = "problems-empty";
        empty.textContent = model.counts.total
          ? "No problems match the current filter."
          : "No runtime or source problems recorded.";
        list.append(empty);
        return;
      }
      for (const problem of visible) {
        list.append(problemRow(document, problem, model.selection.id, dispatch, signal));
      }
    },
    dispose() {
      abort.abort();
      delete container.dataset.problemsStatus;
      delete container.dataset.problemsCount;
    },
  };
}

export function problemsAreaFromPlay(state) {
  const problems = state.problems;
  return createProblemsArea({
    id: "problems/main",
    status: problems.status,
    problems: problems.entries,
    selectedId: problems.selectedId,
    filter: { severity: problems.severity, query: problems.query },
    canClear: problems.entries.length > 0,
    metadata: {
      workspace: state.workspace || null,
      runtimeKind: state.runtimeKind || null,
    },
  });
}

export function disposeHodosProblems() {
  areaHost?.destroy();
  areaHost = null;
}

export function mountHodosProblems(state) {
  disposeHodosProblems();
  const root = globalThis.document?.querySelector(".problems-view");
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
  areaHost.open(problemsAreaFromPlay(state));
  return true;
}

export function updateHodosProblems(state) {
  if (!areaHost) return false;
  areaHost.update(problemsAreaFromPlay(state));
  return true;
}
