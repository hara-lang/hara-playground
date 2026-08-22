import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register("./support/hodos-import-loader.mjs", import.meta.url);

const {
  applyExecutionControllerUpdate,
  createPlayExecutionState,
  executionAreaFromPlay,
  executionStateIsSerializable,
  markPlayExecutionStale,
  selectPlayExecution,
  withExecutionEnvironment,
} = await import("../src/hodos/execution-state.js");

const metrics = (traceId, sequence = 1, status = "running") => ({
  schema: "hal.bytecode-metrics/v1",
  sessionId: "session/1",
  traceId,
  sourceId: "main.hal",
  sequence,
  status,
  instructions: sequence,
  opcodeCounts: { Constant: sequence },
});

const events = (traceId, sequence = 1, status = "running") => ({
  schema: "hal.bytecode-events/v1",
  sessionId: "session/1",
  traceId,
  sourceId: "main.hal",
  sequence,
  status,
  dropped: 0,
  events: [{
    id: `${traceId}/event/${sequence}`,
    sequence,
    kind: status === "returned" ? "terminal" : "instruction",
    ...(status === "returned"
      ? { terminal: "machine/return", function: 0, ip: sequence, stackDepth: 1, callDepth: 0 }
      : { function: 0, ip: sequence, opcode: "Constant", stackDepth: 1, callDepth: 0 }),
  }],
});

const trace = (traceId, sequence = 1, status = "running") => ({
  schema: "hal.bytecode-trace/v1",
  id: traceId,
  traceId,
  sessionId: "session/1",
  sourceId: "main.hal",
  sequence,
  status,
  dropped: 0,
  steps: [{
    id: `${traceId}/step/${sequence}`,
    sequence,
    kind: status === "returned" ? "machine/return" : "instruction",
    status,
    before: { status: "running", function: 0, ip: sequence - 1, stack: [] },
    after: {
      status,
      function: 0,
      ip: sequence,
      stack: [],
      ...(status === "returned" ? { result: { display: "7" } } : {}),
    },
    instruction: { opcode: "Constant" },
    source: { sourceId: "main.hal", offset: sequence, line: 0, column: sequence },
    error: null,
  }],
});

test("Play Execution state is serializable and delegates evidence to Hodos", () => {
  let state = createPlayExecutionState();
  state = withExecutionEnvironment(state, {
    currentSourceId: "main.hal",
    currentSourceVersion: "v1",
    workspaceId: "workspace/test",
    sourceAvailable: true,
  });
  assert.equal(state.model.capabilities.start, true);

  state = applyExecutionControllerUpdate(state, {
    kind: "started",
    generation: 1,
    runtimeLoaded: true,
    stale: false,
    sourceVersion: "v1",
    workspaceId: "workspace/test",
    session: {
      sessionId: "session/1",
      traceId: "trace/1",
      sourceId: "main.hal",
      sequence: 0,
      status: "connected",
    },
    evidence: [metrics("trace/1", 0, "ready"), events("trace/1", 0, "ready")],
    result: null,
  });
  state = applyExecutionControllerUpdate(state, {
    kind: "step",
    generation: 1,
    runtimeLoaded: true,
    stale: false,
    sourceVersion: "v1",
    workspaceId: "workspace/test",
    session: {
      sessionId: "session/1",
      traceId: "trace/1",
      sourceId: "main.hal",
      sequence: 1,
      status: "running",
    },
    evidence: [metrics("trace/1"), events("trace/1"), trace("trace/1")],
    result: null,
  });

  assert.equal(state.model.session.id, "session/1");
  assert.equal(state.model.session.traceId, "trace/1");
  assert.equal(state.model.evidence.events.length, 2);
  assert.deepEqual(
    state.model.evidence.events.map((event) => event.id),
    ["trace/1/event/0", "trace/1/event/1"],
  );
  assert.equal(state.model.evidence.trace.length, 1);
  assert.equal(state.model.capabilities.step, true);
  assert.equal(executionStateIsSerializable(state), true);
  assert.doesNotMatch(JSON.stringify(state), /handle|WebAssembly|Promise/);

  const area = executionAreaFromPlay(state);
  assert.equal(area["area/id"], "execution/main");
  assert.equal(area["area/component"]["component/id"], "hodos.dev/execution");
});

test("staleness retains evidence while disabling bytecode control", () => {
  let state = createPlayExecutionState({
    currentSourceId: "main.hal",
    currentSourceVersion: "v1",
    workspaceId: "workspace/test",
    sourceAvailable: true,
  });
  state = applyExecutionControllerUpdate(state, {
    kind: "started",
    generation: 1,
    runtimeLoaded: true,
    stale: false,
    sourceVersion: "v1",
    workspaceId: "workspace/test",
    session: {
      sessionId: "session/1",
      traceId: "trace/1",
      sourceId: "main.hal",
      status: "connected",
    },
    evidence: [metrics("trace/1"), events("trace/1"), trace("trace/1")],
  });
  state = markPlayExecutionStale(state, "v2");
  assert.equal(state.stale, true);
  assert.equal(state.model.session.status, "connected");
  assert.equal(state.model.evidence.trace.length, 1);
  assert.equal(state.model.capabilities.step, false);
  assert.equal(state.model.capabilities.run, false);
  assert.equal(state.model.capabilities.requestTrace, true);
  assert.equal(state.model.capabilities.start, true);
});

test("a reset trace identity cannot retain the previous trace", () => {
  let state = createPlayExecutionState({ sourceAvailable: true });
  state = applyExecutionControllerUpdate(state, {
    kind: "started",
    generation: 1,
    runtimeLoaded: true,
    stale: false,
    sourceVersion: "v1",
    session: { sessionId: "session/1", traceId: "trace/1", sourceId: "main.hal", status: "connected" },
    evidence: [metrics("trace/1"), trace("trace/1")],
  });
  state = applyExecutionControllerUpdate(state, {
    kind: "reset",
    generation: 1,
    runtimeLoaded: true,
    stale: false,
    sourceVersion: "v1",
    session: { sessionId: "session/1", traceId: "trace/2", sourceId: "main.hal", status: "connected" },
    evidence: [metrics("trace/2", 2, "ready"), events("trace/2", 2, "ready")],
    result: null,
  });
  assert.equal(state.model.session.traceId, "trace/2");
  assert.equal(state.model.evidence.trace.length, 0);
  assert.equal(state.model.evidence.events.every((event) => event.id.startsWith("trace/2")), true);
});

test("selection remains data-only", () => {
  let state = createPlayExecutionState();
  state = selectPlayExecution(state, {
    function: 0,
    ip: 2,
    eventIndex: 1,
    traceIndex: 1,
    source: { sourceId: "main.hal", offset: 4, line: 0, column: 4 },
  });
  assert.equal(state.model.selection.source.sourceId, "main.hal");
  assert.equal(executionStateIsSerializable(state), true);
});
