const DEFAULT_MODEL = Object.freeze({
  tempo: 112,
  stepsPerBeat: 2,
  steps: Object.freeze([0, 7, 12, 7]),
  root: 48,
  gate: 0.72,
  waveform: "sine",
  volume: 0.7
});

const LOOKAHEAD_SECONDS = 0.12;
const SCHEDULER_INTERVAL_MS = 25;
const MAX_STEPS_PER_TICK = 64;
const CLOCK_RESUME_LEAD_SECONDS = 0.01;

function defaultModel() {
  return { ...DEFAULT_MODEL, steps: [...DEFAULT_MODEL.steps], playing: false };
}

export function midiToFrequency(note) {
  return 440 * (2 ** ((Number(note) - 69) / 12));
}

export function normalizeWaveform(value) {
  const waveform = String(value || "sine").toLowerCase();
  if (waveform === "saw") return "sawtooth";
  return ["sine", "square", "sawtooth", "triangle"].includes(waveform)
    ? waveform
    : "sine";
}

export function readPlaybackModel(graph, override = null) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const find = (id, fragment) => nodes.find((node) => node.id === id)
    || nodes.find((node) => String(node.type || "").includes(fragment));
  const params = (id, fragment) => ({ ...(find(id, fragment)?.params || {}) });
  const transport = params("transport", "transport");
  const sequence = params("sequence", "sequence");
  const source = params("source", "oscillator");
  const mixer = params("mixer", "mixer");

  if (override) {
    const targets = { transport, sequence, source, mixer };
    if (targets[override.nodeId]) targets[override.nodeId][override.parameter] = override.value;
    else {
      const target = nodes.find((node) => node.id === override.nodeId);
      if (target?.type?.includes("transport")) transport[override.parameter] = override.value;
      if (target?.type?.includes("sequence")) sequence[override.parameter] = override.value;
      if (target?.type?.includes("oscillator")) source[override.parameter] = override.value;
      if (target?.type?.includes("mixer")) mixer[override.parameter] = override.value;
    }
  }

  const tempo = boundedNumber(transport.tempo, 20, 400, DEFAULT_MODEL.tempo);
  const stepsPerBeat = boundedNumber(
    transport["steps-per-beat"], 1, 16, DEFAULT_MODEL.stepsPerBeat
  );
  const steps = Array.isArray(sequence.steps) && sequence.steps.length
    ? sequence.steps.map((step) => step == null ? null : Number(step))
    : [...DEFAULT_MODEL.steps];
  return {
    tempo,
    stepsPerBeat,
    steps,
    root: boundedNumber(source.root, 0, 127, DEFAULT_MODEL.root),
    gate: boundedNumber(source.gate, 0.02, 1, DEFAULT_MODEL.gate),
    waveform: normalizeWaveform(source.waveform),
    volume: boundedNumber(mixer.volume, 0, 1, DEFAULT_MODEL.volume),
    playing: Boolean(transport.playing)
  };
}

/**
 * Recover a musical clock after the browser throttles timers in a hidden tab.
 * The stale beats are skipped rather than scheduled in a burst on return.
 */
export function recoverSequencerClock({
  nextStepTime,
  stepIndex,
  stepCount,
  now,
  stepDuration
}) {
  const duration = Number(stepDuration);
  const count = Math.max(1, Math.trunc(Number(stepCount)) || 1);
  const index = modulo(Math.trunc(Number(stepIndex)) || 0, count);
  const currentTime = Number(now);
  const nextTime = Number(nextStepTime);
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) {
    return { nextStepTime: nextTime, stepIndex: index, skipped: 0 };
  }
  if (!Number.isFinite(nextTime) || nextTime <= 0) {
    return {
      nextStepTime: currentTime + CLOCK_RESUME_LEAD_SECONDS,
      stepIndex: index,
      skipped: 0
    };
  }

  const lateBy = currentTime - nextTime;
  const recoveryThreshold = Math.max(LOOKAHEAD_SECONDS, duration * 2);
  if (lateBy <= recoveryThreshold) {
    return { nextStepTime: nextTime, stepIndex: index, skipped: 0 };
  }

  const skipped = Math.max(1, Math.ceil(lateBy / duration));
  return {
    nextStepTime: currentTime + CLOCK_RESUME_LEAD_SECONDS,
    stepIndex: (index + skipped) % count,
    skipped
  };
}

/**
 * Small, deterministic Web Audio renderer for Supersonic sequence graphs.
 * AudioContext is never created until authorize() is called by a page gesture.
 */
export class SupersonicWebAudioEngine {
  constructor({ contextFactory = null } = {}) {
    this.contextFactory = contextFactory || (() => new AudioContext({ latencyHint: "interactive" }));
    this.context = null;
    this.master = null;
    this.graph = null;
    this.model = defaultModel();
    this.authorized = false;
    this.playing = false;
    this.stepIndex = 0;
    this.nextStepTime = 0;
    this.timer = null;
    this.voices = new Set();
  }

  async prepare(graph) {
    const previousGraph = this.graph;
    const previousModel = this.model;
    const nextModel = readPlaybackModel(graph);
    return {
      commit: async () => {
        this.graph = graph;
        this.model = nextModel;
        this.applyVolume();
      },
      discard: async () => {
        this.graph = previousGraph;
        this.model = previousModel;
      }
    };
  }

  async update(graph, node, control, value) {
    const next = readPlaybackModel(graph, {
      nodeId: node.id,
      parameter: control.parameter,
      value
    });
    this.graph = graph;
    this.model = next;
    this.applyVolume();

    if (control.parameter === "playing") {
      if (value) await this.play();
      else this.pause();
      return { pending: false };
    }

    // The active clock and step index are deliberately left intact. Notes
    // already inside the short look-ahead window finish naturally; subsequent
    // notes use the new tempo, sequence, root, gate, waveform, and volume.
    return { pending: false };
  }

  async authorize() {
    await this.ensureContext();
    await this.context.resume?.();
    this.authorized = true;
    return true;
  }

  async play() {
    if (!this.authorized) throw new Error("audio/user-gesture-required");
    await this.ensureContext();
    await this.context.resume?.();
    if (this.playing) return true;
    this.playing = true;
    this.stepIndex = 0;
    this.nextStepTime = this.context.currentTime + 0.035;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), SCHEDULER_INTERVAL_MS);
    return true;
  }

  pause() {
    this.stopScheduler({ reset: false });
    return true;
  }

  stop() {
    this.stopScheduler({ reset: true });
    return true;
  }

  async reset({ revoke = false } = {}) {
    this.stop();
    this.graph = null;
    this.model = defaultModel();
    if (revoke) {
      await this.context?.close?.();
      this.context = null;
      this.master = null;
      this.authorized = false;
    } else {
      this.applyVolume();
    }
    return true;
  }

  async dispose() {
    await this.reset({ revoke: true });
  }

  async ensureContext() {
    if (this.context) return this.context;
    this.context = this.contextFactory();
    this.master = this.context.createGain();
    this.master.gain.value = this.model.volume;
    this.master.connect(this.context.destination);
    return this.context;
  }

  applyVolume() {
    if (!this.master || !this.context) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues?.(now);
    this.master.gain.setTargetAtTime?.(this.model.volume, now, 0.015);
    if (!this.master.gain.setTargetAtTime) this.master.gain.value = this.model.volume;
  }

  stopScheduler({ reset }) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
    if (reset) this.stepIndex = 0;
    for (const voice of this.voices) {
      try { voice.stop(); } catch {}
    }
    this.voices.clear();
  }

  schedule() {
    if (!this.playing || !this.context || !this.model.steps.length) return;
    const stepDuration = 60 / this.model.tempo / this.model.stepsPerBeat;
    const now = this.context.currentTime;
    const recovered = recoverSequencerClock({
      nextStepTime: this.nextStepTime,
      stepIndex: this.stepIndex,
      stepCount: this.model.steps.length,
      now,
      stepDuration
    });
    this.nextStepTime = recovered.nextStepTime;
    this.stepIndex = recovered.stepIndex;

    const horizon = now + LOOKAHEAD_SECONDS;
    let scheduled = 0;
    while (this.nextStepTime < horizon && scheduled < MAX_STEPS_PER_TICK) {
      const step = this.model.steps[this.stepIndex % this.model.steps.length];
      if (step != null && Number.isFinite(step)) {
        this.scheduleNote(
          this.model.root + Number(step),
          this.nextStepTime,
          Math.max(0.015, stepDuration * this.model.gate)
        );
      }
      this.stepIndex = (this.stepIndex + 1) % this.model.steps.length;
      this.nextStepTime += stepDuration;
      scheduled += 1;
    }

    // Defensive cap: malformed clocks must never monopolize the page thread.
    if (this.nextStepTime < horizon) {
      const remaining = Math.ceil((horizon - this.nextStepTime) / stepDuration);
      this.stepIndex = (this.stepIndex + remaining) % this.model.steps.length;
      this.nextStepTime += remaining * stepDuration;
    }
  }

  scheduleNote(note, startsAt, duration) {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const endsAt = startsAt + duration;
    oscillator.type = this.model.waveform;
    oscillator.frequency.setValueAtTime(midiToFrequency(note), startsAt);
    envelope.gain.setValueAtTime(0.0001, startsAt);
    envelope.gain.exponentialRampToValueAtTime(0.22, startsAt + 0.008);
    envelope.gain.setValueAtTime(0.22, Math.max(startsAt + 0.009, endsAt - 0.035));
    envelope.gain.exponentialRampToValueAtTime(0.0001, endsAt);
    oscillator.connect(envelope).connect(this.master);
    oscillator.start(startsAt);
    oscillator.stop(endsAt + 0.01);
    this.voices.add(oscillator);
    oscillator.addEventListener?.("ended", () => this.voices.delete(oscillator), { once: true });
  }
}

function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}
