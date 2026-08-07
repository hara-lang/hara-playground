#!/usr/bin/env python3
from pathlib import Path
from textwrap import dedent

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(dedent(content).lstrip("\n"), encoding="utf-8")


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return source.replace(old, new, 1)


def replace_region(source: str, start: str, end: str, replacement: str, label: str) -> str:
    start_index = source.find(start)
    if start_index < 0:
        raise SystemExit(f"{label}: start anchor not found")
    end_index = source.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"{label}: end anchor not found")
    return source[:start_index] + dedent(replacement).lstrip("\n") + source[end_index:]


def update_context() -> None:
    path = "src/app/context.js"
    source = read(path)
    source = replace_once(
        source,
        'import { previewDocument } from "../ui/hta.js";',
        'import { previewDocument } from "../ui/hta.js";\nimport { createProblemsState } from "../hodos/problems-state.js";',
        "Problems state import",
    )
    source = replace_once(
        source,
        '  importBusy: false, importProgress: "", examples: [], exampleBusy: false,',
        '  problems: createProblemsState(),\n  importBusy: false, importProgress: "", examples: [], exampleBusy: false,',
        "Problems state",
    )
    source = replace_once(
        source,
        '  outputTab: ["preview", "repl", "value"].includes(initialOutput) ? initialOutput : "preview",',
        '  outputTab: ["preview", "repl", "value", "problems"].includes(initialOutput) ? initialOutput : "preview",',
        "Problems output tab",
    )
    write(path, source)


def update_actions() -> None:
    path = "src/app/actions.js"
    source = read(path)
    source = replace_once(
        source,
        'import { featuredProject } from "../studio/projects.js";',
        dedent('''
        import { featuredProject } from "../studio/projects.js";
        import {
          appendProblemState,
          problemFromError,
          resetProblemsState,
          setProblemsStatus,
        } from "../hodos/problems-state.js";
        ''').strip(),
        "Problems action imports",
    )
    source = replace_once(
        source,
        'function writeSetting(key, value) {',
        dedent('''
        function recordActionProblem(error, context = {}) {
          state.problems = appendProblemState(state.problems, problemFromError(error, {
            ...context,
            namespace: context.namespace ?? state.namespace,
            runtimeKind: state.runtimeKind,
          }));
        }

        function writeSetting(key, value) {
        ''').strip(),
        "Problems action recorder",
    )
    source = replace_once(
        source,
        '''  resetInstantEvaluation();
  resetValueInspector();
  render();''',
        '''  resetInstantEvaluation();
  resetValueInspector();
  state.problems = resetProblemsState(state.problems, { status: "collecting" });
  render();''',
        "Problems boot reset",
    )
    source = replace_once(
        source,
        '''    state.runtimeStatus = "ready";
    appendRepl("result", `Hara kernel ready · ${sourceFiles.length} source files loaded · ${files.length} workspace files`);''',
        '''    state.runtimeStatus = "ready";
    state.problems = setProblemsStatus(
      state.problems,
      state.problems.entries.length ? "ready" : "idle",
    );
    appendRepl("result", `Hara kernel ready · ${sourceFiles.length} source files loaded · ${files.length} workspace files`);''',
        "Problems boot completion",
    )
    source = replace_once(
        source,
        '''  } catch (error) {
    state.runtimeStatus = "error";
    appendRepl("error", error.message);
  }
  render();
}

export function appendRepl''',
        '''  } catch (error) {
    state.runtimeStatus = "error";
    recordActionProblem(error, { source: "runtime", phase: "boot" });
    appendRepl("error", error.message);
  }
  render();
}

export function appendRepl''',
        "Problems boot failure",
    )
    source = replace_once(
        source,
        '''  } catch (error) {
    if (echo) {
      appendRepl("error", error.message);
      render();
    }
    return null;
  }
}

export async function evaluateEditorForm''',
        '''  } catch (error) {
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

export async function evaluateEditorForm''',
        "Problems evaluation failure",
    )
    source = replace_once(
        source,
        '  if (!["preview", "repl", "value"].includes(tab)) return false;',
        '  if (!["preview", "repl", "value", "problems"].includes(tab)) return false;',
        "Problems output selection",
    )
    source = replace_once(
        source,
        '''  } catch (error) {
    appendRepl("error", error.message);
  }
  render();
}''',
        '''  } catch (error) {
    recordActionProblem(error, {
      source: "runtime",
      phase: "load-file",
      path: state.selectedPath,
      sourceText: state.content,
    });
    appendRepl("error", error.message);
  }
  render();
}''',
        "Problems file-load failure",
    )
    write(path, source)


def write_problem_state() -> None:
    write("src/hodos/problems-state.js", r'''
    const MAX_PROBLEMS = 300;
    const SEVERITIES = new Set(["error", "warning", "info", "hint"]);
    const STATUSES = new Set(["idle", "collecting", "ready", "error"]);

    function optionalString(value) {
      if (value == null) return null;
      if (typeof value !== "string" || !value.trim()) return null;
      return value.trim();
    }

    function severityValue(value, fallback = "error") {
      const normalized = String(value ?? fallback).trim().toLowerCase();
      if (normalized === "warn") return "warning";
      if (normalized === "information") return "info";
      return SEVERITIES.has(normalized) ? normalized : fallback;
    }

    function pointValue(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const line = Number(value.line ?? value.row ?? 0);
      const column = Number(value.column ?? value.col ?? 0);
      const offset = value.offset == null ? null : Number(value.offset);
      if (!Number.isSafeInteger(line) || line < 0 || !Number.isSafeInteger(column) || column < 0) return null;
      if (offset != null && (!Number.isSafeInteger(offset) || offset < 0)) return null;
      return Object.freeze({ line, column, offset });
    }

    function rangeValue(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const start = pointValue(value.start ?? value);
      const end = pointValue(value.end ?? value.start ?? value);
      if (!start || !end) return null;
      const before = end.line < start.line
        || (end.line === start.line && end.column < start.column)
        || (start.offset != null && end.offset != null && end.offset < start.offset);
      return before ? null : Object.freeze({ start, end });
    }

    function tagsValue(value = []) {
      if (!Array.isArray(value)) return Object.freeze([]);
      return Object.freeze([
        ...new Set(value.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim())),
      ]);
    }

    function metadataValue(value = {}) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
      const output = {};
      for (const [key, entry] of Object.entries(value)) {
        if (entry == null || ["string", "number", "boolean"].includes(typeof entry)) output[key] = entry;
      }
      return Object.freeze(output);
    }

    function normalizedProblem(value, id) {
      const message = optionalString(value?.message ?? value?.text) || "Unknown problem";
      return Object.freeze({
        id,
        severity: severityValue(value?.severity, "error"),
        message,
        code: optionalString(value?.code),
        source: optionalString(value?.source),
        path: optionalString(value?.path),
        namespace: optionalString(value?.namespace),
        requestId: optionalString(value?.requestId),
        range: rangeValue(value?.range),
        tags: tagsValue(value?.tags),
        metadata: metadataValue(value?.metadata),
      });
    }

    export function createProblemsState({
      sequence = 0,
      status = "idle",
      entries = [],
      selectedId = null,
      severity = "all",
      query = "",
    } = {}) {
      status = STATUSES.has(status) ? status : "idle";
      severity = severity === "all" || SEVERITIES.has(severity) ? severity : "all";
      query = typeof query === "string" ? query : "";
      const projected = Object.freeze(Array.isArray(entries) ? [...entries] : []);
      const selected = projected.some((entry) => entry.id === selectedId) ? selectedId : null;
      return Object.freeze({
        sequence: Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0,
        status,
        entries: projected,
        selectedId: selected,
        severity,
        query,
      });
    }

    export function resetProblemsState(current, { status = "idle" } = {}) {
      return createProblemsState({
        sequence: current?.sequence ?? 0,
        status,
        severity: current?.severity ?? "all",
        query: current?.query ?? "",
      });
    }

    export function setProblemsStatus(current, status) {
      return createProblemsState({ ...current, status });
    }

    export function appendProblemState(current, problem) {
      const sequence = Number(current?.sequence ?? 0) + 1;
      const id = optionalString(problem?.id) || `problem/${sequence}`;
      const entry = normalizedProblem(problem, id);
      const entries = [...(current?.entries ?? []), entry].slice(-MAX_PROBLEMS);
      return createProblemsState({
        ...current,
        sequence,
        status: "ready",
        entries,
        selectedId: entries.some((candidate) => candidate.id === current?.selectedId)
          ? current.selectedId
          : null,
      });
    }

    export function clearProblemsState(current) {
      return resetProblemsState(current, { status: "idle" });
    }

    export function filterProblemsState(current, { severity, query }) {
      return createProblemsState({
        ...current,
        severity: severity ?? current?.severity,
        query: query ?? current?.query,
      });
    }

    export function selectProblemState(current, problemId) {
      return createProblemsState({ ...current, selectedId: problemId });
    }

    export function problemById(current, problemId) {
      return current?.entries?.find((problem) => problem.id === problemId) || null;
    }

    function diagnosticValue(detail) {
      if (detail && typeof detail === "object" && !Array.isArray(detail)) {
        return detail.diagnostic && typeof detail.diagnostic === "object" ? detail.diagnostic : detail;
      }
      return { text: detail };
    }

    export function problemFromDiagnostic(detail, context = {}) {
      const value = diagnosticValue(detail);
      const candidateRange = value.range
        ?? ((value.start || value.end) ? { start: value.start, end: value.end } : null);
      return Object.freeze({
        severity: severityValue(value.severity ?? value.level, "warning"),
        message: optionalString(value.message ?? value.text) || "Runtime diagnostic",
        code: optionalString(value.code),
        source: optionalString(context.source ?? value.source) || "runtime",
        path: optionalString(context.path ?? value.path),
        namespace: optionalString(context.namespace ?? value.namespace),
        requestId: optionalString(context.requestId ?? value.requestId ?? value.id),
        range: rangeValue(candidateRange),
        tags: tagsValue(value.tags ?? context.tags),
        metadata: metadataValue({
          phase: context.phase ?? null,
          runtimeKind: context.runtimeKind ?? null,
        }),
      });
    }

    export function problemFromError(error, context = {}) {
      const data = error?.data && typeof error.data === "object" ? error.data : {};
      return Object.freeze({
        severity: "error",
        message: optionalString(error?.message) || String(error || "Runtime error"),
        code: optionalString(context.code ?? data.code ?? error?.code ?? error?.name),
        source: optionalString(context.source ?? data.source) || "runtime",
        path: optionalString(context.path ?? data.path),
        namespace: optionalString(context.namespace ?? data.namespace),
        requestId: optionalString(context.requestId ?? data.requestId ?? data.id),
        range: rangeValue(context.range ?? data.range),
        tags: tagsValue(context.tags),
        metadata: metadataValue({
          phase: context.phase ?? null,
          runtimeKind: context.runtimeKind ?? null,
          errorName: optionalString(error?.name),
        }),
      });
    }

    function offsetAt(source, position) {
      const text = String(source ?? "");
      if (Number.isSafeInteger(position?.offset)) {
        return Math.max(0, Math.min(position.offset, text.length));
      }
      const lines = text.split("\n");
      const line = Math.max(0, Math.min(Number(position?.line ?? 0), lines.length - 1));
      let offset = 0;
      for (let index = 0; index < line; index += 1) offset += lines[index].length + 1;
      const column = Math.max(0, Math.min(Number(position?.column ?? 0), lines[line]?.length ?? 0));
      return Math.min(text.length, offset + column);
    }

    export function problemSelectionOffsets(problem, source) {
      if (!problem?.range) return null;
      const start = offsetAt(source, problem.range.start);
      const end = Math.max(start, offsetAt(source, problem.range.end));
      return Object.freeze({ start, end });
    }

    export function formatProblemForClipboard(problem) {
      if (!problem) return "";
      const location = problem.path
        ? `${problem.path}${problem.range ? `:${problem.range.start.line + 1}:${problem.range.start.column + 1}` : ""}`
        : null;
      return [
        `${problem.severity.toUpperCase()}${problem.code ? ` ${problem.code}` : ""}`,
        problem.message,
        location,
      ].filter(Boolean).join("\n");
    }
    ''')


def write_problem_events() -> None:
    write("src/hodos/problems-events.js", r'''
    export const HODOS_PROBLEMS_COMPONENT_ID = "hodos.dev/problems";
    export const HODOS_PROBLEMS_AREA_ID = "problems/main";

    const SEVERITIES = new Set(["all", "error", "warning", "info", "hint"]);

    function eventType(value) {
      return value?.["event/type"] ?? value?.type ?? null;
    }

    function problemIdValue(value, label) {
      if (typeof value !== "string" || !value.trim()) {
        throw new TypeError(`${label} requires a non-empty problem id`);
      }
      return value.trim();
    }

    export function problemsWorkspacePatch(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      if (value["component/id"] !== HODOS_PROBLEMS_COMPONENT_ID) return null;
      if (value["area/id"] !== HODOS_PROBLEMS_AREA_ID) return null;

      const type = eventType(value);
      if (type === "problems/select") {
        return Object.freeze({ kind: "select", problemId: problemIdValue(value.problemId, "Hodos Problems select") });
      }
      if (type === "problems/open-source") {
        return Object.freeze({ kind: "open-source", problemId: problemIdValue(value.problemId, "Hodos Problems open-source") });
      }
      if (type === "problems/copy") {
        return Object.freeze({ kind: "copy", problemId: problemIdValue(value.problemId, "Hodos Problems copy") });
      }
      if (type === "problems/filter") {
        const severity = String(value.severity ?? "all");
        if (!SEVERITIES.has(severity)) throw new TypeError("Hodos Problems filter severity is invalid");
        if (typeof (value.query ?? "") !== "string") throw new TypeError("Hodos Problems filter query must be a string");
        return Object.freeze({ kind: "filter", severity, query: value.query ?? "" });
      }
      if (type === "problems/clear") return Object.freeze({ kind: "clear" });
      if (type === "problems/close") return Object.freeze({ kind: "close" });
      return null;
    }
    ''')


def write_problems_host() -> None:
    write("src/hodos/problems.js", r'''
    import { createHodosComponentRegistry } from "@greenways/hodos-web";
    import { createWorkspaceAreaHost } from "@greenways/hodos-workspace-ui";
    import { createProblemsArea } from "@greenways/hodos-dev";
    import { registerHodosProblemsUi } from "@greenways/hodos-dev-ui";

    const registry = createHodosComponentRegistry();
    registerHodosProblemsUi(registry, { createProblemsHost: createPlaygroundProblemsHost });

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

    export function createPlaygroundProblemsHost({ container, dispatch }) {
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

    export function problemsAreaFromPlayground(state) {
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
      areaHost.open(problemsAreaFromPlayground(state));
      return true;
    }

    export function updateHodosProblems(state) {
      if (!areaHost) return false;
      areaHost.update(problemsAreaFromPlayground(state));
      return true;
    }
    ''')


def update_main() -> None:
    path = "src/main.js"
    source = read(path)
    source = replace_once(
        source,
        'import { disposeHodosPreview, mountHodosPreview } from "./hodos/preview.js";',
        'import { disposeHodosPreview, mountHodosPreview } from "./hodos/preview.js";\nimport { disposeHodosProblems, mountHodosProblems } from "./hodos/problems.js";',
        "Problems main import",
    )
    source = replace_once(
        source,
        '''  disposeHodosEditor();
  disposeHodosPreview();
  disposeHodosRepl();''',
        '''  disposeHodosEditor();
  disposeHodosPreview();
  disposeHodosProblems();
  disposeHodosRepl();''',
        "Problems disposal",
    )
    source = replace_once(
        source,
        '''  mountHodosPreview({ document: state.preview, theme: state.theme });
  mountHodosRepl(state);''',
        '''  mountHodosPreview({ document: state.preview, theme: state.theme });
  mountHodosProblems(state);
  mountHodosRepl(state);''',
        "Problems mount",
    )
    write(path, source)


def update_view() -> None:
    path = "src/app/view.js"
    source = read(path)
    source = replace_region(
        source,
        "function renderOutputPanel() {",
        "function renderWorkbench() {",
        r'''
        function renderOutputPanel() {
          const valueAvailable = Boolean(state.valueInspector?.valueId);
          const problemCount = state.problems?.entries?.length || 0;
          const mode = state.outputTab === "value"
            ? "retained kernel value"
            : state.outputTab === "problems"
              ? "runtime and source diagnostics"
              : "kernel effects";
          return `<aside class="output-panel hara-surface">
            <header class="output-tabs">
              <button class="output-tab ${state.outputTab === "preview" ? "active" : ""}" data-output-tab="preview">${icon("eye")} Preview</button>
              <button class="output-tab ${state.outputTab === "repl" ? "active" : ""}" data-output-tab="repl">${icon("terminal")} REPL</button>
              <button class="output-tab ${state.outputTab === "value" ? "active" : ""}" data-output-tab="value" ${valueAvailable ? "" : "disabled"}>${icon("list")} Value</button>
              <button class="output-tab ${state.outputTab === "problems" ? "active" : ""}" data-output-tab="problems">${icon("check")} Problems${problemCount ? ` <span class="output-tab-count">${problemCount}</span>` : ""}</button>
              <span class="preview-mode">${mode}</span>
            </header>
            <section class="preview-view ${state.outputTab === "preview" ? "active" : ""}"><iframe id="preview" title="Hara preview" sandbox="" referrerpolicy="no-referrer"></iframe></section>
            <section class="repl-view ${state.outputTab === "repl" ? "active" : ""}">
              <div class="repl-toolbar"><span>${escapeHtml(state.namespace)} namespace</span><button id="clear-repl-button" class="text-button">Clear</button></div>
              <div id="repl-output" class="repl-output">${renderRepl()}</div>
              <form id="repl-form" class="repl-form"><span>${escapeHtml(state.namespace)}=&gt;</span><input id="repl-input" aria-label="REPL input" autocomplete="off" spellcheck="false" placeholder="(+ 1 2)" ${state.runtimeStatus !== "ready" ? "disabled" : ""}></form>
            </section>
            <section class="value-view ${state.outputTab === "value" ? "active" : ""}" aria-label="Retained value inspector">
              <div class="value-inspector-placeholder">Select <strong>Inspect</strong> beside a retained REPL result.</div>
            </section>
            <section class="problems-view ${state.outputTab === "problems" ? "active" : ""}" aria-label="Runtime and source problems">
              <div class="problems-placeholder">Runtime and source diagnostics appear here.</div>
            </section>
          </aside>`;
        }

        ''',
        "Problems output panel",
    )
    write(path, source)


def update_events() -> None:
    path = "src/app/events.js"
    source = read(path)
    source = replace_once(
        source,
        'import { replWorkspacePatch } from "../hodos/repl-events.js";',
        dedent('''
        import { replWorkspacePatch } from "../hodos/repl-events.js";
        import { problemsWorkspacePatch } from "../hodos/problems-events.js";
        import {
          appendProblemState,
          clearProblemsState,
          filterProblemsState,
          formatProblemForClipboard,
          problemById,
          problemFromDiagnostic,
          problemFromError,
          problemSelectionOffsets,
          selectProblemState,
        } from "../hodos/problems-state.js";
        import { updateHodosProblems } from "../hodos/problems.js";
        ''').strip(),
        "Problems event imports",
    )

    insertion_anchor = "function reportWorkspaceEventError(error) {"
    problems_policy = r'''
    function recordRuntimeProblem(problem) {
      state.problems = appendProblemState(state.problems, problem);
      updateHodosProblems(state);
    }

    async function applyProblemsWorkspacePatch(patch) {
      if (patch.kind === "close") {
        state.outputTab = "repl";
        writeSetting(STUDIO_SETTING_KEYS.output, "repl");
        render();
        return;
      }
      if (patch.kind === "clear") {
        state.problems = clearProblemsState(state.problems);
        updateHodosProblems(state);
        return;
      }
      if (patch.kind === "filter") {
        state.problems = filterProblemsState(state.problems, patch);
        updateHodosProblems(state);
        return;
      }
      if (patch.kind === "select") {
        state.problems = selectProblemState(state.problems, patch.problemId);
        updateHodosProblems(state);
        return;
      }

      const problem = problemById(state.problems, patch.problemId);
      if (!problem) throw new Error(`Problem is no longer available: ${patch.problemId}`);
      state.problems = selectProblemState(state.problems, patch.problemId);

      if (patch.kind === "copy") {
        if (!globalThis.navigator?.clipboard?.writeText) {
          throw new Error("Clipboard access is unavailable in this browser context");
        }
        await globalThis.navigator.clipboard.writeText(formatProblemForClipboard(problem));
        updateHodosProblems(state);
        return;
      }

      if (patch.kind === "open-source") {
        if (!problem.path) throw new Error("This problem has no source path");
        if (!state.files.includes(problem.path)) {
          throw new Error(`Problem source is outside the current workspace: ${problem.path}`);
        }
        await selectFile(problem.path, false);
        const selection = problemSelectionOffsets(problem, state.content);
        if (selection) {
          state.editor.selectionStart = selection.start;
          state.editor.selectionEnd = selection.end;
          state.editor.cursor = selection.end;
        }
        render();
        queueMicrotask(() => document.querySelector("#editor")?.focus());
      }
    }

    ''']
    source = replace_once(source, insertion_anchor, problems_policy + insertion_anchor, "Problems application policy")

    source = replace_once(
        source,
        '''    const valuePatch = valueInspectorWorkspacePatch(event.detail);
    if (valuePatch) {
      void applyValueInspectorWorkspacePatch(valuePatch).catch(reportWorkspaceEventError);
    }''',
        '''    const valuePatch = valueInspectorWorkspacePatch(event.detail);
    if (valuePatch) {
      void applyValueInspectorWorkspacePatch(valuePatch).catch(reportWorkspaceEventError);
      return;
    }
    const problemsPatch = problemsWorkspacePatch(event.detail);
    if (problemsPatch) {
      void applyProblemsWorkspacePatch(problemsPatch).catch(reportWorkspaceEventError);
    }''',
        "Problems Workspace event routing",
    )

    source = replace_once(
        source,
        '''  runtime.addEventListener("diagnostic", (event) => {
    appendRepl("stdout", event.detail.text);
    updateReplOnly();
  });
  runtime.addEventListener("runtime-error", (event) => {
    state.runtimeStatus = "error";
    appendRepl("error", event.detail?.message || String(event.detail));
    render();
  });''',
        '''  runtime.addEventListener("diagnostic", (event) => {
    const problem = problemFromDiagnostic(event.detail, {
      source: "runtime",
      namespace: state.namespace,
      requestId: event.detail?.id,
      runtimeKind: state.runtimeKind,
    });
    recordRuntimeProblem(problem);
    appendRepl("diagnostic", problem.message, state.namespace, {
      requestId: problem.requestId,
    });
    updateReplOnly();
  });
  runtime.addEventListener("runtime-error", (event) => {
    state.runtimeStatus = "error";
    recordRuntimeProblem(problemFromError(event.detail, {
      source: "runtime",
      phase: "worker",
      namespace: state.namespace,
      runtimeKind: state.runtimeKind,
    }));
    appendRepl("error", event.detail?.message || String(event.detail));
    render();
  });''',
        "Runtime Problems capture",
    )
    write(path, source)


def update_repl_fallback() -> None:
    path = "src/app/view-helpers.js"
    source = read(path)
    source = replace_once(
        source,
        '''    if (entry.kind === "stdout") return `<div class="repl-line stdout"><span class="output-marker">│</span><span>${escapeHtml(entry.text)}</span></div>`;
    return `<div class="repl-line result"><span class="output-marker">→</span><span>${escapeHtml(entry.text)}</span></div>`;''',
        '''    if (entry.kind === "stdout") return `<div class="repl-line stdout"><span class="output-marker">│</span><span>${escapeHtml(entry.text)}</span></div>`;
    if (entry.kind === "diagnostic") return `<div class="repl-line diagnostic"><span class="output-marker">·</span><span>${escapeHtml(entry.text)}</span></div>`;
    return `<div class="repl-line result"><span class="output-marker">→</span><span>${escapeHtml(entry.text)}</span></div>`;''',
        "Diagnostic REPL fallback",
    )
    write(path, source)


def update_styles() -> None:
    path = "src/styles.css"
    source = read(path)
    source = replace_once(
        source,
        '@import url("./styles/hodos-preview.css");\n',
        '@import url("./styles/hodos-preview.css");\n@import url("./styles/hodos-problems.css");\n',
        "Problems styles import",
    )
    write(path, source)
    write("src/styles/hodos-problems.css", r'''
    .problems-view {
      min-height: 0;
      display: none;
    }
    .problems-view.active { display: grid; }
    .problems-placeholder,
    .problems-empty {
      min-height: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      color: var(--hara-faint);
      font-family: var(--hara-font-mono);
      font-size: .62rem;
      text-align: center;
    }
    .problems-shell {
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: 42px auto minmax(0, 1fr);
      background: var(--hara-repl-ground);
    }
    .problems-toolbar {
      min-width: 0;
      display: grid;
      grid-template-columns: minmax(82px, .32fr) minmax(100px, 1fr) auto auto;
      align-items: center;
      gap: 6px;
      padding: 0 9px;
      border-bottom: 1px solid var(--hara-line);
      background: var(--hara-surface-solid);
    }
    .problems-toolbar select,
    .problems-toolbar input {
      min-width: 0;
      height: 28px;
      border: 1px solid var(--hara-line);
      border-radius: 6px;
      background: var(--hara-ground);
      color: var(--hara-text);
      font-family: var(--hara-font-mono);
      font-size: .55rem;
    }
    .problems-toolbar input { padding: 0 8px; }
    .problems-counts {
      padding: 7px 11px;
      border-bottom: 1px solid var(--hara-line);
      color: var(--hara-faint);
      font-family: var(--hara-font-mono);
      font-size: .52rem;
    }
    .problems-list {
      min-height: 0;
      padding: 7px 6px 18px;
      overflow: auto;
    }
    .problem-row {
      min-width: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: 6px;
      border-bottom: 1px solid color-mix(in srgb, var(--hara-line) 72%, transparent);
    }
    .problem-row.selected {
      background: color-mix(in srgb, var(--hara-spectrum-cyan) 7%, transparent);
    }
    .problem-select {
      min-width: 0;
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr);
      gap: 8px;
      padding: 9px 7px;
      border: 0;
      background: transparent;
      color: var(--hara-text);
      text-align: left;
    }
    .problem-select:hover { background: var(--hara-surface-raised); }
    .problem-severity {
      padding-top: 1px;
      font-family: var(--hara-font-mono);
      font-size: .48rem;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .problem-row.error .problem-severity { color: var(--hara-danger); }
    .problem-row.warning .problem-severity { color: var(--hara-spectrum-violet); }
    .problem-row.info .problem-severity { color: var(--hara-spectrum-cyan); }
    .problem-row.hint .problem-severity { color: var(--hara-muted); }
    .problem-content {
      min-width: 0;
      display: grid;
      gap: 4px;
    }
    .problem-content strong {
      overflow: hidden;
      font-size: .63rem;
      line-height: 1.35;
      text-overflow: ellipsis;
    }
    .problem-content small {
      overflow: hidden;
      color: var(--hara-faint);
      font-family: var(--hara-font-mono);
      font-size: .5rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .problem-actions {
      display: flex;
      gap: 3px;
      padding: 6px 4px 0 0;
    }
    .problem-actions .text-button { font-size: .48rem; }
    .output-tab-count {
      min-width: 16px;
      display: inline-grid;
      place-items: center;
      margin-left: 2px;
      padding: 0 4px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--hara-spectrum-violet) 18%, transparent);
      color: var(--hara-spectrum-violet);
      font-family: var(--hara-font-mono);
      font-size: .47rem;
    }
    ''')


def write_tests() -> None:
    write("tests/hodos-problems-state.test.js", r'''
    import assert from "node:assert/strict";
    import test from "node:test";
    import {
      appendProblemState,
      clearProblemsState,
      createProblemsState,
      filterProblemsState,
      formatProblemForClipboard,
      problemFromDiagnostic,
      problemFromError,
      problemSelectionOffsets,
      selectProblemState,
    } from "../src/hodos/problems-state.js";

    test("plain runtime diagnostics become structured warning problems", () => {
      const problem = problemFromDiagnostic({ id: "request-4", text: "Fallback runtime active" }, {
        namespace: "app.core",
        runtimeKind: "embedded",
      });
      assert.deepEqual(problem, {
        severity: "warning",
        message: "Fallback runtime active",
        code: null,
        source: "runtime",
        path: null,
        namespace: "app.core",
        requestId: "request-4",
        range: null,
        tags: [],
        metadata: { phase: null, runtimeKind: "embedded" },
      });
    });

    test("problem state assigns stable bounded identities and preserves filters", () => {
      let state = createProblemsState({ severity: "warning", query: "runtime" });
      state = appendProblemState(state, { severity: "warning", message: "One" });
      state = appendProblemState(state, { severity: "error", message: "Two" });
      assert.deepEqual(state.entries.map((entry) => entry.id), ["problem/1", "problem/2"]);
      state = selectProblemState(state, "problem/2");
      assert.equal(state.selectedId, "problem/2");
      state = filterProblemsState(state, { severity: "error", query: "two" });
      assert.equal(state.severity, "error");
      assert.equal(state.query, "two");
      state = clearProblemsState(state);
      assert.equal(state.entries.length, 0);
      assert.equal(state.sequence, 2);
      assert.equal(state.severity, "error");
    });

    test("runtime errors carry location metadata and source selections", () => {
      const problem = problemFromError(Object.assign(new Error("Unbound symbol"), {
        data: {
          code: "resolver/unbound",
          path: "src/main.hal",
          range: {
            start: { line: 1, column: 2 },
            end: { line: 1, column: 6 },
          },
        },
      }), { phase: "eval" });
      const source = "(ns app.core)\n  card\n";
      assert.equal(problem.code, "resolver/unbound");
      assert.equal(problem.path, "src/main.hal");
      assert.deepEqual(problemSelectionOffsets(problem, source), { start: 16, end: 20 });
      assert.match(formatProblemForClipboard({ id: "p", ...problem }), /ERROR resolver\/unbound/);
    });
    ''')

    write("tests/hodos-problems-events.test.js", r'''
    import assert from "node:assert/strict";
    import test from "node:test";
    import {
      HODOS_PROBLEMS_AREA_ID,
      HODOS_PROBLEMS_COMPONENT_ID,
      problemsWorkspacePatch,
    } from "../src/hodos/problems-events.js";

    const base = {
      "component/id": HODOS_PROBLEMS_COMPONENT_ID,
      "area/id": HODOS_PROBLEMS_AREA_ID,
    };

    test("Problems projects selection, source, copy and filter commands", () => {
      assert.deepEqual(problemsWorkspacePatch({
        ...base,
        "event/type": "problems/select",
        problemId: "problem/1",
      }), { kind: "select", problemId: "problem/1" });
      assert.deepEqual(problemsWorkspacePatch({
        ...base,
        "event/type": "problems/open-source",
        problemId: "problem/1",
      }), { kind: "open-source", problemId: "problem/1" });
      assert.deepEqual(problemsWorkspacePatch({
        ...base,
        "event/type": "problems/copy",
        problemId: "problem/1",
      }), { kind: "copy", problemId: "problem/1" });
      assert.deepEqual(problemsWorkspacePatch({
        ...base,
        "event/type": "problems/filter",
        severity: "warning",
        query: "runtime",
      }), { kind: "filter", severity: "warning", query: "runtime" });
    });

    test("Problems projects clear and close and rejects malformed events", () => {
      assert.deepEqual(problemsWorkspacePatch({ ...base, "event/type": "problems/clear" }), { kind: "clear" });
      assert.deepEqual(problemsWorkspacePatch({ ...base, "event/type": "problems/close" }), { kind: "close" });
      assert.equal(problemsWorkspacePatch({ ...base, "component/id": "hodos.dev/repl", "event/type": "problems/clear" }), null);
      assert.throws(() => problemsWorkspacePatch({
        ...base,
        "event/type": "problems/select",
        problemId: "",
      }), /non-empty problem id/);
      assert.throws(() => problemsWorkspacePatch({
        ...base,
        "event/type": "problems/filter",
        severity: "fatal",
      }), /severity is invalid/);
    });
    ''')

    write("tests/hodos-problems-authority.test.js", r'''
    import assert from "node:assert/strict";
    import { readFile } from "node:fs/promises";
    import test from "node:test";

    const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

    test("Playground mounts the merged Hodos Problems component", async () => {
      const [integration, main, view] = await Promise.all([
        text("src/hodos/problems.js"),
        text("src/main.js"),
        text("src/app/view.js"),
      ]);
      assert.match(integration, /createProblemsArea/);
      assert.match(integration, /registerHodosProblemsUi/);
      assert.match(integration, /createWorkspaceAreaHost/);
      assert.match(main, /mountHodosProblems\(state\)/);
      assert.match(main, /disposeHodosProblems\(\)/);
      assert.match(view, /data-output-tab="problems"/);
      assert.match(view, /class="problems-view/);
    });

    test("runtime diagnostics remain in the REPL and also enter Problems state", async () => {
      const events = await text("src/app/events.js");
      assert.match(events, /problemFromDiagnostic\(event\.detail/);
      assert.match(events, /recordRuntimeProblem\(problem\)/);
      assert.match(events, /appendRepl\("diagnostic", problem\.message/);
      assert.doesNotMatch(events, /appendRepl\("stdout", event\.detail\.text\)/);
      assert.match(events, /problemFromError\(event\.detail/);
    });

    test("Problems source, clipboard, filter and clear behavior remains Playground policy", async () => {
      const [events, integration, actions] = await Promise.all([
        text("src/app/events.js"),
        text("src/hodos/problems.js"),
        text("src/app/actions.js"),
      ]);
      assert.match(events, /problemsWorkspacePatch\(event\.detail\)/);
      assert.match(events, /selectFile\(problem\.path, false\)/);
      assert.match(events, /navigator\?\.clipboard\?\.writeText/);
      assert.match(events, /clearProblemsState\(state\.problems\)/);
      assert.match(integration, /"event\/type": "problems\/filter"/);
      assert.match(integration, /textContent = problem\.message/);
      assert.doesNotMatch(integration, /innerHTML/);
      assert.match(actions, /recordActionProblem\(error/);
      assert.match(actions, /phase: "load-file"/);
    });
    ''')


def clean_staging_files() -> None:
    for relative in (
        ".github/scripts/apply-hodos-problems.py",
        ".github/workflows/apply-hodos-problems.yml",
    ):
        target = ROOT / relative
        if target.exists():
            target.unlink()


def main() -> None:
    update_context()
    update_actions()
    write_problem_state()
    write_problem_events()
    write_problems_host()
    update_main()
    update_view()
    update_events()
    update_repl_fallback()
    update_styles()
    write_tests()
    clean_staging_files()


if __name__ == "__main__":
    main()
