import assert from "node:assert/strict";
import test from "node:test";
import {
  BYTECODE_OBSERVATION_LIMITS,
  BYTECODE_RETENTION_LIMITS,
  createBytecodeObservationController,
  executionSourceVersion,
} from "../src/runtime/bytecode-observation-controller.js";

function evidence(schema, session, values = {}) {
  return {
    schema,
    sessionId: session.sessionId,
    traceId: session.traceId,
    sourceId: session.sourceId,
    sequence: session.sequence,
    status: session.status,
    ...values,
  };
}

class FakeSession {
  constructor(sessionId, sourceId, source) {
    this.sessionId = sessionId;
    this.sourceId = sourceId;
    this.source = source;
    this.traceId = `${sessionId}/trace-0`;
    this.status = "ready";
    this.sequence = 0;
    this.handle = 9182;
    this.runCalls = [];
    this.stepCalls = 0;
    this.disposed = false;
  }

  setObservationLimits(value) { this.observationLimits = value; }
  setRetentionLimits(value) { this.retentionLimits = value; }
  snapshot() { return { status: this.status, function: 0, ip: 0 }; }
  metrics() {
    return evidence("hal.bytecode-metrics/v1", this, {
      instructions: this.sequence,
      opcodeCounts: { Constant: this.sequence },
    });
  }
  events() {
    return evidence("hal.bytecode-events/v1", this, {
      events: this.sequence ? [{ id: `${this.traceId}/event/${this.sequence}`, sequence: this.sequence }] : [],
      dropped: 0,
    });
  }
  trace() {
    return evidence("hal.bytecode-trace/v1", this, {
      id: this.traceId,
      steps: [{ id: `${this.traceId}/step/${this.sequence}`, sequence: this.sequence }],
      dropped: 0,
    });
  }
  step() {
    this.stepCalls += 1;
    this.sequence += 1;
    this.status = "running";
    return evidence("hal.bytecode-trace/v1", this, {
      id: this.traceId,
      steps: [{ id: `${this.traceId}/step/${this.sequence}`, sequence: this.sequence }],
      dropped: 0,
    });
  }
  run(limit) {
    this.runCalls.push(limit);
    this.sequence += 1;
    this.status = this.runCalls.length >= 3 ? "returned" : "running";
    return evidence("hal.bytecode-trace/v1", this, {
      id: this.traceId,
      steps: [{ id: `${this.traceId}/step/${this.sequence}`, sequence: this.sequence }],
      dropped: 0,
    });
  }
  pause() { this.status = "paused"; return true; }
  resume() { this.sequence += 1; this.status = "running"; return this.trace(); }
  reset() {
    this.sequence += 1;
    this.traceId = `${this.sessionId}/trace-1`;
    this.status = "ready";
    this.runCalls = [];
    return this.snapshot();
  }
  resultDisplay() { return this.status === "returned" ? "7" : null; }
  errorMessage() { return this.status === "failed" ? "failure" : null; }
  dispose() { this.disposed = true; this.status = "disposed"; return true; }
}

class FakeRuntime {
  constructor() {
    this.sessions = [];
    this.disposed = false;
  }
  compileNamed(sessionId, sourceId, source) {
    const session = new FakeSession(sessionId, sourceId, source);
    this.sessions.push(session);
    return session;
  }
  dispose() { this.disposed = true; }
}

test("the observation runtime remains lazy and private", async () => {
  const runtime = new FakeRuntime();
  const updates = [];
  let loads = 0;
  const controller = createBytecodeObservationController({
    async loadRuntime() { loads += 1; return runtime; },
    publish(update) { updates.push(update); },
  });

  assert.equal(loads, 0);
  assert.deepEqual(controller.inspect(), {
    generation: 0,
    runtimeLoaded: false,
    sessionActive: false,
    running: false,
    stale: false,
    sourceIdentity: null,
    session: null,
  });

  const source = "  (+ 1 (* 2 3))\n";
  await controller.startExecution({
    source,
    sourceId: "example/core.hal",
    sourceVersion: executionSourceVersion(source),
    workspaceId: "workspace/test",
  });

  assert.equal(loads, 1);
  assert.equal(runtime.sessions[0].source, source, "source offsets must not be changed by trimming");
  assert.deepEqual(runtime.sessions[0].observationLimits, BYTECODE_OBSERVATION_LIMITS);
  assert.deepEqual(runtime.sessions[0].retentionLimits, BYTECODE_RETENTION_LIMITS);
  assert.equal(controller.inspect().runtimeLoaded, true);
  assert.equal(controller.inspect().sessionActive, true);
  assert.equal("handle" in controller.inspect().session, false);
  assert.doesNotMatch(JSON.stringify(updates), /9182|"handle"/);

  await controller.startExecution({
    source: "(+ 20 22)",
    sourceId: "example/core.hal",
    workspaceId: "workspace/test",
  });
  assert.equal(loads, 1, "replacing a session must reuse the loaded observation runtime");
  assert.equal(runtime.sessions[0].disposed, true);
});

test("a failed replacement Start clears obsolete session authority", async () => {
  const runtime = new FakeRuntime();
  const compile = runtime.compileNamed.bind(runtime);
  let failCompile = false;
  runtime.compileNamed = (...args) => {
    if (failCompile) throw new Error("compile failed");
    return compile(...args);
  };
  const updates = [];
  const diagnostics = [];
  const controller = createBytecodeObservationController({
    loadRuntime: async () => runtime,
    publish: (update) => updates.push(update),
    reportDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });

  await controller.startExecution({ source: "(+ 20 22)", sourceId: "main.hal" });
  failCompile = true;
  await assert.rejects(
    controller.startExecution({ source: "(+ 1", sourceId: "main.hal" }),
    /compile failed/,
  );

  assert.equal(runtime.sessions[0].disposed, true);
  assert.equal(controller.inspect().sessionActive, false);
  assert.equal(controller.inspect().sourceIdentity, null);
  assert.equal(controller.inspect().runtimeLoaded, true);
  assert.deepEqual(updates.slice(-2).map((update) => update.kind), ["diagnostic", "session-disposed"]);
  assert.equal(diagnostics.at(-1).sourceId, "main.hal");
});

test("editing during a lazy load cancels the pending compile", async () => {
  const runtime = new FakeRuntime();
  let resolveRuntime;
  const loading = new Promise((resolve) => { resolveRuntime = resolve; });
  const updates = [];
  const controller = createBytecodeObservationController({
    loadRuntime: () => loading,
    publish: (update) => updates.push(update),
  });
  const source = "(+ 1 (* 2 3))";
  const starting = controller.startExecution({ source, sourceId: "main.hal" });
  await Promise.resolve();
  assert.equal(controller.inspect().sourceIdentity.sourceId, "main.hal");
  assert.equal(controller.markExecutionStale({
    sourceId: "main.hal",
    sourceVersion: executionSourceVersion(`${source} `),
  }), true);
  resolveRuntime(runtime);
  assert.equal(await starting, null);
  assert.equal(runtime.sessions.length, 0);
  assert.equal(controller.inspect().stale, true);
  assert.equal(updates.at(-1).pending, true);
});

test("disposing during a lazy load disposes the late runtime", async () => {
  const runtime = new FakeRuntime();
  let resolveRuntime;
  const loading = new Promise((resolve) => { resolveRuntime = resolve; });
  const controller = createBytecodeObservationController({ loadRuntime: () => loading });
  const starting = controller.startExecution({ source: "(+ 20 22)", sourceId: "main.hal" });
  await Promise.resolve();
  assert.equal(controller.disposeExecution("leave-workspace"), true);
  resolveRuntime(runtime);
  assert.equal(await starting, null);
  assert.equal(runtime.disposed, true);
  assert.equal(controller.inspect().runtimeLoaded, false);
});

test("Step publishes one delta while Run stays bounded and yields", async () => {
  const runtime = new FakeRuntime();
  const updates = [];
  let yields = 0;
  const controller = createBytecodeObservationController({
    loadRuntime: async () => runtime,
    publish: (update) => updates.push(update),
    yieldControl: async () => { yields += 1; },
    runBatchSize: 1_000,
  });
  await controller.startExecution({ source: "(+ 1 (* 2 3))", sourceId: "main.hal" });
  await controller.stepExecution();
  assert.equal(runtime.sessions[0].stepCalls, 1);
  assert.equal(updates.at(-1).kind, "step");
  assert.equal(updates.at(-1).evidence.filter((entry) => entry.schema === "hal.bytecode-trace/v1").length, 1);

  await controller.runExecution();
  assert.deepEqual(runtime.sessions[0].runCalls, [1_000, 1_000, 1_000]);
  assert.equal(yields, 2);
  assert.equal(controller.inspect().session.status, "returned");
  assert.equal(updates.at(-1).result, "7");
});

test("Pause interrupts between Run batches", async () => {
  const runtime = new FakeRuntime();
  let releaseYield;
  let yielded;
  const atYield = new Promise((resolve) => { yielded = resolve; });
  const controller = createBytecodeObservationController({
    loadRuntime: async () => runtime,
    yieldControl: () => new Promise((resolve) => {
      releaseYield = resolve;
      yielded();
    }),
  });
  await controller.startExecution({ source: "(+ 1 (* 2 3))", sourceId: "main.hal" });
  const running = controller.runExecution();
  await atYield;
  await controller.pauseExecution();
  releaseYield();
  await running;
  assert.deepEqual(runtime.sessions[0].runCalls, [1_000]);
  assert.equal(controller.inspect().session.status, "paused");
});

test("source changes retain evidence but fence execution until Start", async () => {
  const runtime = new FakeRuntime();
  const diagnostics = [];
  const controller = createBytecodeObservationController({
    loadRuntime: async () => runtime,
    reportDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });
  const source = "(+ 1 (* 2 3))";
  await controller.startExecution({ source, sourceId: "main.hal" });
  await controller.stepExecution();

  assert.equal(controller.markExecutionStale({
    sourceId: "main.hal",
    sourceVersion: executionSourceVersion(`${source} `),
  }), true);
  const staleGeneration = controller.inspect().generation;
  assert.equal(controller.markExecutionStale({
    sourceId: "main.hal",
    sourceVersion: executionSourceVersion(`${source}  `),
  }), false);
  assert.equal(controller.inspect().generation, staleGeneration);
  assert.equal(controller.inspect().stale, true);
  await assert.rejects(controller.stepExecution(), /stale/);
  await controller.requestExecutionTrace();
  assert.equal(diagnostics.length, 1, "a rejected stale operation should be reported once");
});

test("Reset changes trace identity and disposal releases both ownership layers", async () => {
  const runtime = new FakeRuntime();
  const controller = createBytecodeObservationController({ loadRuntime: async () => runtime });
  await controller.startExecution({ source: "(+ 20 22)", sourceId: "main.hal" });
  const before = controller.inspect().session.traceId;
  await controller.resetExecution();
  assert.notEqual(controller.inspect().session.traceId, before);
  assert.equal(controller.disposeSession("file-changed"), true);
  assert.equal(runtime.sessions[0].disposed, true);
  assert.equal(controller.inspect().runtimeLoaded, true);
  assert.equal(controller.disposeExecution("page-unload"), true);
  assert.equal(runtime.disposed, true);
  assert.equal(controller.inspect().runtimeLoaded, false);
});
