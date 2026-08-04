import { SupersonicProvider } from "./supersonic-provider.js";
import { SupersonicWebAudioEngine } from "./web-audio-engine.js";

const AUDIO_CAPABILITY = "audio/playback";
const NOOP = () => {};

export class PlaygroundAudioHost {
  constructor({ runtime, storage = null, onChange = NOOP } = {}) {
    if (!runtime) throw new Error("audio/runtime-required");
    this.runtime = runtime;
    this.onChange = onChange;
    this.engine = new SupersonicWebAudioEngine();
    this.state = {
      requested: false,
      status: "idle",
      snapshot: null,
      error: ""
    };
    this.provider = new SupersonicProvider({
      engine: this.engine,
      storage,
      onSnapshot: (snapshot) => {
        this.state.snapshot = snapshot;
        this.state.status = this.engine.playing ? "playing" : "ready";
        this.state.error = "";
        this.publish();
      }
    });
    this.unregister = [
      runtime.registerHost("gw.audio.supersonic/start", (graph) => this.provider.start(graph)),
      runtime.registerHost("gw.audio.supersonic/update", (graphId, nodeId, parameter, value) =>
        this.provider.update(graphId, nodeId, parameter, value)),
      runtime.registerHost("gw.audio.supersonic/status", (graphId) => this.provider.status(graphId)),
      runtime.registerHost("gw.audio.supersonic/stop", (graphId) => this.provider.stop(graphId))
    ];
  }

  async configure(capabilities = []) {
    const requested = new Set(capabilities).has(AUDIO_CAPABILITY);
    if (!requested && (this.state.snapshot || this.engine.playing)) {
      await this.provider.reset();
      this.state.snapshot = null;
    }
    this.state.requested = requested;
    this.state.status = requested ? (this.state.snapshot ? "ready" : "waiting") : "idle";
    this.state.error = "";
    this.publish();
    return requested;
  }

  async play() {
    return this.perform(async () => {
      this.requireGraph();
      await this.engine.authorize();
      const transport = transportControl(this.state.snapshot);
      if (transport) {
        await this.provider.update(
          this.state.snapshot["graph/id"], transport.node.id, transport.control.parameter, true
        );
      } else {
        await this.engine.play();
        this.state.status = "playing";
        this.publish();
      }
      return true;
    });
  }

  async pause() {
    return this.perform(async () => {
      this.requireGraph();
      const transport = transportControl(this.state.snapshot);
      if (transport) {
        await this.provider.update(
          this.state.snapshot["graph/id"], transport.node.id, transport.control.parameter, false
        );
      } else {
        this.engine.pause();
        this.state.status = "paused";
        this.publish();
      }
      return true;
    });
  }

  async stop() {
    return this.perform(async () => {
      if (!this.state.snapshot) {
        this.engine.stop();
        return true;
      }
      this.engine.stop();
      const transport = transportControl(this.state.snapshot);
      if (transport && transport.node.params[transport.control.parameter] !== false) {
        await this.provider.update(
          this.state.snapshot["graph/id"], transport.node.id, transport.control.parameter, false
        );
      } else {
        this.state.status = "stopped";
        this.publish();
      }
      return true;
    });
  }

  async updateControl(nodeId, parameter, value) {
    return this.perform(async () => {
      this.requireGraph();
      if (parameter === "playing" && value === true) await this.engine.authorize();
      return this.provider.update(this.state.snapshot["graph/id"], nodeId, parameter, value);
    });
  }

  async dispose() {
    for (const unregister of this.unregister.splice(0)) unregister?.();
    await this.engine.dispose();
  }

  requireGraph() {
    if (!this.state.requested) throw new Error("audio/capability-not-requested");
    if (!this.state.snapshot) throw new Error("audio/graph-not-started");
  }

  async perform(action) {
    try {
      const value = await action();
      this.state.error = "";
      if (this.engine.playing) this.state.status = "playing";
      this.publish();
      return value;
    } catch (error) {
      this.state.error = error?.message || String(error);
      this.state.status = "error";
      this.publish();
      throw error;
    }
  }

  publish() {
    this.onChange({ ...this.state });
  }
}

export function coerceControlValue(control, element) {
  if (control.type === "boolean") return Boolean(element.checked);
  if (control.type === "steps") {
    return String(element.value)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((value) => value === "_" || value.toLowerCase() === "rest" ? null : Number(value));
  }
  if (control.type === "number") return Number(element.value);
  return element.value;
}

function transportControl(snapshot) {
  for (const node of snapshot?.nodes || []) {
    const control = (node.controls || []).find((candidate) => candidate.parameter === "playing");
    if (control) return { node, control };
  }
  return null;
}
