import test from "node:test";
import assert from "node:assert/strict";
import {
  SupersonicWebAudioEngine,
  midiToFrequency,
  normalizeWaveform,
  readPlaybackModel
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
  const graph = {
    nodes: [
      { id: "transport", type: "control/transport", params: { tempo: 96, "steps-per-beat": 4, playing: false } },
      { id: "sequence", type: "data/sequence", params: { steps: [0, 3, null, 7] } },
      { id: "source", type: "audio/oscillator", params: { root: 52, gate: 0.5, waveform: "saw" } },
      { id: "mixer", type: "audio/mixer", params: { volume: 0.4 } }
    ]
  };
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
