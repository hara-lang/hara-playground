import test from "node:test";
import assert from "node:assert/strict";
import {
  SupersonicWebAudioEngine,
  midiToFrequency,
  normalizeWaveform,
  readPlaybackModel,
  recoverSequencerClock
} from "../src/audio/web-audio-engine.js";

test("MIDI notes map to concert pitch", () => {
  assert.equal(midiToFrequency(69), 440);
  assert.ok(Math.abs(midiToFrequency(60) - 261.625565) < 0.00001);
});

test("Supersonic waveform names map to Web Audio oscillator types", () => {
  assert.equal(normalizeWaveform("saw"), "sawtooth");
  assert.equal(normalizeWaveform("triangle"), "triangle");
  assert.equal(normalizeWaveform("unknown"), "sine");
});

test("playback model is derived from graph parameters and one pending update", () => {
  const graph = audioGraph();
  const model = readPlaybackModel(graph, { nodeId: "transport", parameter: "tempo", value: 132 });
  assert.deepEqual(model, {
    tempo: 132,
    stepsPerBeat: 4,
    steps: [0, 3, null, 7],
    root: 52,
    gate: 0.5,
    waveform: "sawtooth",
    volume: 0.4,
    playing: false
  });
});

test("a project reset closes the AudioContext and revokes playback authorization", async () => {
  let closed = 0;
  const gain = {
    value: 0,
    cancelScheduledValues() {},
    setTargetAtTime() {}
  };
  const context = {
    currentTime: 0,
    destination: {},
    createGain() {
      return { gain, connect() { return this; } };
    },
    async resume() {},
    async close() { closed += 1; }
  };
  const engine = new SupersonicWebAudioEngine({ contextFactory: () => context });

  await engine.authorize();
  assert.equal(engine.authorized, true);
  assert.equal(engine.context, context);

  await engine.reset({ revoke: true });
  assert.equal(closed, 1);
  assert.equal(engine.authorized, false);
  assert.equal(engine.context, null);
  assert.equal(engine.graph, null);
  assert.equal(engine.playing, false);
});

test("live parameter updates preserve the current step and clock", async () => {
  const graph = audioGraph();
  const transport = graph.nodes.find((node) => node.id === "transport");
  const tempo = transport.controls.find((control) => control.parameter === "tempo");
  const engine = new SupersonicWebAudioEngine();
  const timer = { id: "active-clock" };
  let stopped = 0;

  engine.graph = graph;
  engine.model = readPlaybackModel(graph);
  engine.playing = true;
  engine.stepIndex = 3;
  engine.nextStepTime = 12.75;
  engine.timer = timer;
  engine.voices.add({ stop() { stopped += 1; } });

  await engine.update(graph, transport, tempo, 148);

  assert.equal(engine.model.tempo, 148);
  assert.equal(engine.stepIndex, 3);
  assert.equal(engine.nextStepTime, 12.75);
  assert.equal(engine.timer, timer);
  assert.equal(stopped, 0, "a live edit must not kill already scheduled notes");
});

test("graph replacement preserves sequencer phase while playing", async () => {
  const engine = new SupersonicWebAudioEngine();
  engine.graph = audioGraph();
  engine.model = readPlaybackModel(engine.graph);
  engine.playing = true;
  engine.stepIndex = 2;
  engine.nextStepTime = 7.5;
  engine.timer = { id: "same-interval" };

  const replacement = audioGraph();
  replacement.nodes.find((node) => node.id === "sequence").params.steps = [0, 5, 9, 12, null];
  const prepared = await engine.prepare(replacement);
  await prepared.commit();

  assert.deepEqual(engine.model.steps, [0, 5, 9, 12, null]);
  assert.equal(engine.stepIndex, 2);
  assert.equal(engine.nextStepTime, 7.5);
  assert.deepEqual(engine.timer, { id: "same-interval" });
});

test("a throttled tab skips stale beats instead of catching up in a burst", () => {
  const recovered = recoverSequencerClock({
    nextStepTime: 1,
    stepIndex: 3,
    stepCount: 8,
    now: 5.6,
    stepDuration: 0.25
  });

  assert.equal(recovered.skipped, 19);
  assert.equal(recovered.stepIndex, 6);
  assert.ok(Math.abs(recovered.nextStepTime - 5.61) < 1e-9);
});

test("ordinary timer jitter does not move the musical clock", () => {
  assert.deepEqual(recoverSequencerClock({
    nextStepTime: 5,
    stepIndex: 4,
    stepCount: 8,
    now: 5.15,
    stepDuration: 0.25
  }), {
    nextStepTime: 5,
    stepIndex: 4,
    skipped: 0
  });
});

function audioGraph() {
  return {
    nodes: [
      {
        id: "transport",
        type: "control/transport",
        params: { tempo: 96, "steps-per-beat": 4, playing: false },
        controls: [
          { parameter: "playing", type: "boolean" },
          { parameter: "tempo", type: "number" }
        ]
      },
      {
        id: "sequence",
        type: "data/sequence",
        params: { steps: [0, 3, null, 7] },
        controls: [{ parameter: "steps", type: "steps" }]
      },
      {
        id: "source",
        type: "audio/oscillator",
        params: { root: 52, gate: 0.5, waveform: "saw" },
        controls: [
          { parameter: "root", type: "number" },
          { parameter: "gate", type: "number" },
          { parameter: "waveform", type: "choice" }
        ]
      },
      {
        id: "mixer",
        type: "audio/mixer",
        params: { volume: 0.4 },
        controls: [{ parameter: "volume", type: "number" }]
      }
    ]
  };
}
