import test from "node:test";
import assert from "node:assert/strict";
import { PlayAudioHost } from "../src/audio/host.js";

class FakeRuntime {
  constructor() {
    this.handlers = new Map();
  }

  registerHost(operation, handler) {
    this.handlers.set(operation, handler);
    return () => this.handlers.delete(operation);
  }

  invoke(operation, ...args) {
    return this.handlers.get(operation)(...args);
  }
}

class DelayedEngine {
  constructor() {
    this.graph = null;
    this.playing = false;
    this.prepareStarted = null;
    this.releasePrepare = null;
    this.resetCalls = 0;
  }

  prepare(graph) {
    const previous = this.graph;
    this.prepareStarted?.();
    return new Promise((resolve) => {
      this.releasePrepare = () => resolve({
        commit: async () => { this.graph = graph; },
        discard: async () => { this.graph = previous; }
      });
    });
  }

  async reset() {
    this.graph = null;
    this.playing = false;
    this.resetCalls += 1;
  }

  stop() {
    this.playing = false;
  }
}

function graph() {
  return {
    "graph/id": "transition/graph",
    nodes: [
      {
        id: "transport",
        type: "control/transport",
        params: { playing: false, tempo: 112 },
        controls: [
          { parameter: "playing", type: "boolean" },
          { parameter: "tempo", type: "number", min: 40, max: 240 }
        ]
      },
      {
        id: "sequence",
        type: "data/sequence",
        params: { steps: [0, 7] },
        controls: [{ parameter: "steps", type: "steps" }]
      },
      {
        id: "source",
        type: "audio/oscillator",
        params: { root: 48, gate: 0.7, waveform: "sine" },
        controls: [
          { parameter: "root", type: "number", min: 24, max: 84, integer: true },
          { parameter: "gate", type: "number", min: 0.05, max: 1 },
          { parameter: "waveform", type: "choice", choices: ["sine", "saw"] }
        ]
      },
      {
        id: "mixer",
        type: "audio/mixer",
        params: { volume: 0.5 },
        controls: [{ parameter: "volume", type: "number", min: 0, max: 1 }]
      },
      { id: "output", type: "audio/output" }
    ],
    connections: [
      { from: ["transport", "tick"], to: ["sequence", "tick"] },
      { from: ["sequence", "note"], to: ["source", "note"] },
      { from: ["source", "audio"], to: ["mixer", "audio"] },
      { from: ["mixer", "audio"], to: ["output", "audio"] }
    ]
  };
}

test("an aborted old graph cannot commit after the next project configures", async () => {
  const runtime = new FakeRuntime();
  const engine = new DelayedEngine();
  let preparationStarted;
  const started = new Promise((resolve) => { preparationStarted = resolve; });
  engine.prepareStarted = preparationStarted;
  const host = new PlayAudioHost({ runtime, engine });

  await host.configure(["audio/playback"], "workspace/old", { generation: 1 });
  const controller = new AbortController();
  const oldStart = runtime.invoke(
    "gw.audio.supersonic/start",
    graph(),
    { generation: 1, signal: controller.signal }
  );
  await started;

  const error = new Error("host/call-cancelled:boot");
  error.name = "AbortError";
  controller.abort(error);
  const nextConfiguration = host.configure(
    ["audio/playback"],
    "workspace/new",
    { generation: 2 }
  );
  engine.releasePrepare();

  await assert.rejects(oldStart, (failure) =>
    failure.name === "AbortError" && failure.message === "host/call-cancelled:boot");
  await nextConfiguration;

  assert.equal(host.scope, "workspace/new");
  assert.equal(host.state.snapshot, null);
  assert.equal(host.state.status, "waiting");
  assert.equal(host.state.error, "");
  assert.equal(engine.graph, null);
  assert.equal(host.provider.graphs.size, 0);
  assert.ok(engine.resetCalls >= 2);

  await host.dispose();
});
