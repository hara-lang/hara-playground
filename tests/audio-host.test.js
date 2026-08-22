import test from "node:test";
import assert from "node:assert/strict";
import { PlayAudioHost } from "../src/audio/host.js";

class FakeRuntime {
  constructor() {
    this.handlers = new Map();
  }

  registerHost(operation, handler) {
    this.handlers.set(operation, handler);
    return () => {
      if (this.handlers.get(operation) === handler) this.handlers.delete(operation);
    };
  }

  invoke(operation, ...args) {
    const handler = this.handlers.get(operation);
    if (!handler) throw new Error(`missing host operation: ${operation}`);
    return handler(...args);
  }
}

class FakeAudioEngine {
  constructor() {
    this.authorized = false;
    this.playing = false;
    this.graph = null;
    this.resetCalls = [];
  }

  async prepare(graph) {
    const previous = this.graph;
    return {
      commit: async () => { this.graph = graph; },
      discard: async () => { this.graph = previous; }
    };
  }

  async update(graph, _node, control, value) {
    this.graph = graph;
    if (control.parameter === "playing") {
      if (value && !this.authorized) throw new Error("audio/user-gesture-required");
      this.playing = Boolean(value);
    }
    return { pending: false };
  }

  async authorize() {
    this.authorized = true;
    return true;
  }

  async play() {
    if (!this.authorized) throw new Error("audio/user-gesture-required");
    this.playing = true;
    return true;
  }

  pause() {
    this.playing = false;
    return true;
  }

  stop() {
    this.playing = false;
    return true;
  }

  async reset({ revoke = false } = {}) {
    this.stop();
    this.graph = null;
    if (revoke) this.authorized = false;
    this.resetCalls.push({ revoke });
    return true;
  }
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

function graph() {
  return {
    "graph/id": "shared-id",
    title: "Session graph",
    nodes: [
      {
        id: "transport",
        type: "control/transport",
        params: { playing: false, tempo: 112, "steps-per-beat": 2 },
        controls: [
          { parameter: "playing", type: "boolean", label: "Playing" },
          { parameter: "tempo", type: "number", label: "Tempo", min: 40, max: 240, step: 1 }
        ]
      },
      {
        id: "sequence",
        type: "data/sequence",
        params: { steps: [0, 7, 12, 7] },
        controls: [{ parameter: "steps", type: "steps", label: "Steps" }]
      },
      {
        id: "source",
        type: "audio/oscillator",
        params: { root: 48, gate: 0.72, waveform: "sine" },
        controls: [
          { parameter: "root", type: "number", label: "Root", min: 24, max: 84, integer: true },
          { parameter: "gate", type: "number", label: "Gate", min: 0.05, max: 1 },
          { parameter: "waveform", type: "choice", label: "Waveform", choices: ["sine", "saw"] }
        ]
      },
      {
        id: "mixer",
        type: "audio/mixer",
        params: { volume: 0.68 },
        controls: [{ parameter: "volume", type: "number", label: "Volume", min: 0, max: 1 }]
      },
      { id: "output", type: "audio/output", params: {}, controls: [] }
    ],
    connections: [
      { from: ["transport", "tick"], to: ["sequence", "tick"], kind: "control" },
      { from: ["sequence", "note"], to: ["source", "note"], kind: "control" },
      { from: ["source", "audio"], to: ["mixer", "audio"], kind: "audio" },
      { from: ["mixer", "audio"], to: ["output", "audio"], kind: "audio" }
    ]
  };
}

function volume(snapshot) {
  return snapshot.nodes.find((node) => node.id === "mixer").params.volume;
}

test("page-side Supersonic operations enforce the project capability", async () => {
  const runtime = new FakeRuntime();
  const host = new PlayAudioHost({ runtime, engine: new FakeAudioEngine() });

  await assert.rejects(
    runtime.invoke("gw.audio.supersonic/start", graph()),
    /audio\/capability-not-requested/
  );

  await host.configure(["studio/eval", "audio/playback"], "workspace/a");
  const snapshot = await runtime.invoke("gw.audio.supersonic/start", graph());
  assert.equal(snapshot["graph/id"], "shared-id");
  assert.equal(host.state.status, "ready");

  await host.dispose();
});

test("kernel boots revoke authorization and isolate overlays by workspace", async () => {
  const runtime = new FakeRuntime();
  const engine = new FakeAudioEngine();
  const storage = new MemoryStorage();
  const host = new PlayAudioHost({ runtime, engine, storage });

  await host.configure(["audio/playback"], "workspace/a");
  await runtime.invoke("gw.audio.supersonic/start", graph());
  await host.updateControl("mixer", "volume", 0.25);
  await host.play();
  assert.equal(engine.authorized, true);
  assert.equal(engine.playing, true);

  await host.configure(["audio/playback"], "workspace/b");
  assert.equal(engine.authorized, false);
  assert.equal(engine.playing, false);
  assert.equal(host.state.snapshot, null);
  assert.equal(host.state.status, "waiting");
  assert.deepEqual(engine.resetCalls.at(-1), { revoke: true });

  const workspaceB = await runtime.invoke("gw.audio.supersonic/start", graph());
  assert.equal(volume(workspaceB), 0.68, "workspace B must not inherit workspace A controls");
  await host.updateControl("mixer", "volume", 0.9);

  await host.configure(["audio/playback"], "workspace/a");
  const restoredA = await runtime.invoke("gw.audio.supersonic/start", graph());
  assert.equal(volume(restoredA), 0.25, "workspace A restores only its own overlay");

  await host.dispose();
});

test("transport actions expose stable playing, paused and stopped states", async () => {
  const runtime = new FakeRuntime();
  const host = new PlayAudioHost({ runtime, engine: new FakeAudioEngine() });

  await host.configure(["audio/playback"], "workspace/status");
  await runtime.invoke("gw.audio.supersonic/start", graph());
  await host.play();
  assert.equal(host.state.status, "playing");

  await host.pause();
  assert.equal(host.state.status, "paused");

  await host.play();
  await host.stop();
  assert.equal(host.state.status, "stopped");

  await host.dispose();
});
