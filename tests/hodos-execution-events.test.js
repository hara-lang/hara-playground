import assert from "node:assert/strict";
import test from "node:test";
import {
  HODOS_EDITOR_AREA_ID,
  HODOS_EDITOR_COMPONENT_ID,
  HODOS_EXECUTION_AREA_ID,
  HODOS_EXECUTION_COMPONENT_ID,
  editorSelectionEventFromExecution,
  executionWorkspacePatch,
} from "../src/hodos/execution-events.js";

const authorized = (type, detail = {}) => ({
  "event/type": type,
  "component/id": HODOS_EXECUTION_COMPONENT_ID,
  "area/id": HODOS_EXECUTION_AREA_ID,
  ...detail,
});

test("Execution events require the authoritative component and area", () => {
  assert.equal(executionWorkspacePatch({ "event/type": "execution/start" }), null);
  assert.equal(executionWorkspacePatch({
    "event/type": "execution/start",
    "component/id": "playground/execution",
    "area/id": HODOS_EXECUTION_AREA_ID,
  }), null);
  assert.equal(executionWorkspacePatch({
    "event/type": "execution/start",
    "component/id": HODOS_EXECUTION_COMPONENT_ID,
    "area/id": "preview/main",
  }), null);
});

test("Start may replace the current session but other controls are fenced by identity", () => {
  assert.deepEqual(
    executionWorkspacePatch(authorized("execution/start", { sessionId: null }), {
      sessionId: null,
      generation: 3,
    }),
    { kind: "start", sessionId: null, generation: 3 },
  );
  assert.deepEqual(
    executionWorkspacePatch(authorized("execution/start", { sessionId: "session/1" }), {
      sessionId: "session/1",
      generation: 3,
      stale: true,
    }),
    { kind: "start", sessionId: "session/1", generation: 3 },
  );
  assert.throws(() => executionWorkspacePatch(
    authorized("execution/step", { sessionId: "session/old" }),
    { sessionId: "session/current", generation: 3 },
  ), /stale Execution session/);
  assert.throws(() => executionWorkspacePatch(
    authorized("execution/run", { sessionId: "session/current" }),
    { sessionId: "session/current", generation: 3, stale: true },
  ), /Execution is stale/);
});

test("selection requests validate bounded integer coordinates", () => {
  assert.deepEqual(
    executionWorkspacePatch(authorized("execution/select", {
      sessionId: "session/1",
      function: 2,
      ip: 7,
      eventIndex: 4,
      traceIndex: 3,
      source: { sourceId: "main.hal", offset: 9, line: 1, column: 2 },
    }), {
      sessionId: "session/1",
      generation: 5,
      stale: true,
    }),
    {
      kind: "select",
      sessionId: "session/1",
      generation: 5,
      function: 2,
      ip: 7,
      eventIndex: 4,
      traceIndex: 3,
      source: { sourceId: "main.hal", offset: 9, line: 1, column: 2 },
    },
  );
  assert.throws(() => executionWorkspacePatch(authorized("execution/select", {
    sessionId: "session/1",
    ip: -1,
  }), {
    sessionId: "session/1",
    generation: 5,
  }), /non-negative integer/);
});

test("source selection routes through the canonical Hodos Editor authority", () => {
  const event = editorSelectionEventFromExecution({
    sourceId: "main.hal",
    start: 6,
    end: 9,
    source: { sourceId: "main.hal", offset: 6 },
    boundary: { function: 0, ip: 2 },
  }, {
    sourceId: "main.hal",
    sourceLength: 20,
  });
  assert.equal(event["event/type"], "editor/selection");
  assert.equal(event["component/id"], HODOS_EDITOR_COMPONENT_ID);
  assert.equal(event["area/id"], HODOS_EDITOR_AREA_ID);
  assert.deepEqual(event.selection, { start: 6, end: 9 });
  assert.throws(() => editorSelectionEventFromExecution({
    sourceId: "old.hal",
    start: 0,
  }, {
    sourceId: "main.hal",
    sourceLength: 20,
  }), /currently compiled source/);
  assert.throws(() => editorSelectionEventFromExecution({
    sourceId: "main.hal",
    start: 21,
  }, {
    sourceId: "main.hal",
    sourceLength: 20,
  }), /outside the current editor source/);
});
