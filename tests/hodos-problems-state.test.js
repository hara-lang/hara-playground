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
