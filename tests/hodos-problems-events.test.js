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
