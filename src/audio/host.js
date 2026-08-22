import { SupersonicProvider } from "./supersonic-provider.js";
import { SupersonicWebAudioEngine } from "./web-audio-engine.js";

const AUDIO_CAPABILITY = "audio/playback";
const NOOP = () => {};

export class PlayAudioHost {
  constructor({ runtime, storage = null, onChange = NOOP, engine = null } = {}) {
    if (!runtime) throw new Error("audio/runtime-required");
    this.runtime = runtime;
    this.onChange = onChange;
    this.engine = engine || new SupersonicWebAudioEngine();
    this.scope = "default";
    this.authorityGeneration = 0;
    this.operationTail = Promise.resolve();
    this.state = {
      requested: false,
      status: "idle",
      snapshot: null,
      error: ""
    };
    this.provider = new SupersonicProvider({
      engine: this.engine,
      storage,
      scope: this.scope,
      onSnapshot: (snapshot) => {
        this.state.snapshot = snapshot;
        this.state.status = snapshot
          ? this.engine.playing
            ? "playing"
            : snapshot.status === "stopped" ? "stopped" : "ready"
          : this.state.requested ? "waiting" : "idle";
        this.state.error = "";
        this.publish();
      }
    });
    this.unregister = [
      runtime.registerHost("gw.audio.supersonic/start", (graph, context) =>
        this.hostCall((signal) => this.provider.start(graph, { signal }), context)),
      runtime.registerHost("gw.audio.supersonic/update", (graphId, nodeId, parameter, value, context) =>
        this.hostCall((signal) =>
          this.provider.update(graphId, nodeId, parameter, value, { signal }), context)),
      runtime.registerHost("gw.audio.supersonic/status", (graphId, context) =>
        this.hostCall(() => this.provider.status(graphId), context)),
      runtime.registerHost("gw.audio.supersonic/stop", (graphId, context) =>
        this.hostCall((signal) => this.provider.stop(graphId, { signal }), context))
    ];
  }

  async configure(capabilities = [], scope = "default", context = {}) {
    const generation = Number.isSafeInteger(context?.generation)
      ? context.generation
      : this.authorityGeneration + 1;

    // Invalidate active and queued work immediately. The reset itself remains
    // serialized behind any operation already unwinding from its abort signal.
    this.authorityGeneration = generation;
    return this.enqueue(async () => {
      assertActiveAuthority(generation, this.authorityGeneration, context?.signal);
      const requested = new Set(capabilities).has(AUDIO_CAPABILITY);
      this.state.requested = requested;
      this.state.error = "";

      // Each runtime boot is a new authority boundary. Stop the previous graph,
      // close its AudioContext, and require a fresh user gesture before this
      // project may produce sound, even when both projects request audio.
      await this.provider.reset({ revoke: true });
      assertActiveAuthority(generation, this.authorityGeneration, context?.signal);
      this.scope = normalizeScope(scope);
      this.provider.setScope(this.scope);
      this.state.snapshot = null;
      this.state.status = requested ? "waiting" : "idle";
      this.publish();
      return requested;
    });
  }

  async play() {
    return this.currentAction(async () => {
      this.requireGraph();
      await this.engine.authorize();
      const transport = transportControl(this.state.snapshot);
      if (transport) {
        await this.provider.update(
          this.state.snapshot["graph/id"], transport.node.id, transport.control.parameter, true
        );
      } else {
        await this.engine.play();
      }
      this.state.status = "playing";
      this.publish();
      return true;
    });
  }

  async pause() {
    return this.currentAction(async () => {
      this.requireGraph();
      const transport = transportControl(this.state.snapshot);
      if (transport) {
        await this.provider.update(
          this.state.snapshot["graph/id"], transport.node.id, transport.control.parameter, false
        );
      } else {
        this.engine.pause();
      }
      this.state.status = "paused";
      this.publish();
      return true;
    });
  }

  async stop() {
    return this.currentAction(async () => {
      if (!this.state.snapshot) {
        this.engine.stop();
        this.state.status = this.state.requested ? "waiting" : "idle";
        this.publish();
        return true;
      }
      this.engine.stop();
      const transport = transportControl(this.state.snapshot);
      if (transport && transport.node.params[transport.control.parameter] !== false) {
        await this.provider.update(
          this.state.snapshot["graph/id"], transport.node.id, transport.control.parameter, false
        );
      }
      this.state.status = "stopped";
      this.publish();
      return true;
    });
  }

  async updateControl(nodeId, parameter, value) {
    return this.currentAction(async () => {
      this.requireGraph();
      if (parameter === "playing" && value === true) await this.engine.authorize();
      const snapshot = await this.provider.update(
        this.state.snapshot["graph/id"], nodeId, parameter, value
      );
      if (parameter === "playing") {
        this.state.status = value ? "playing" : "paused";
        this.publish();
      }
      return snapshot;
    });
  }

  async dispose() {
    for (const unregister of this.unregister.splice(0)) unregister?.();
    this.authorityGeneration += 1;
    await this.enqueue(() => this.provider.reset({ revoke: true }));
  }

  requireCapability() {
    if (!this.state.requested) throw new Error("audio/capability-not-requested");
  }

  requireGraph() {
    this.requireCapability();
    if (!this.state.snapshot) throw new Error("audio/graph-not-started");
  }

  hostCall(action, context = {}) {
    const generation = Number.isSafeInteger(context?.generation)
      ? context.generation
      : this.authorityGeneration;
    return this.enqueue(() => this.perform(async () => {
      assertActiveAuthority(generation, this.authorityGeneration, context?.signal);
      this.requireCapability();
      const value = await action(context?.signal);
      assertActiveAuthority(generation, this.authorityGeneration, context?.signal);
      return value;
    }));
  }

  currentAction(action) {
    const generation = this.authorityGeneration;
    return this.enqueue(() => this.perform(async () => {
      assertActiveAuthority(generation, this.authorityGeneration);
      const value = await action();
      assertActiveAuthority(generation, this.authorityGeneration);
      return value;
    }));
  }

  enqueue(action) {
    const operation = this.operationTail.then(action, action);
    this.operationTail = operation.catch(() => {});
    return operation;
  }

  async perform(action) {
    try {
      const value = await action();
      this.state.error = "";
      if (this.engine.playing) this.state.status = "playing";
      this.publish();
      return value;
    } catch (error) {
      if (!isLifecycleCancellation(error)) {
        this.state.error = error?.message || String(error);
        this.state.status = "error";
        this.publish();
      }
      throw error;
    }
  }

  publish() {
    this.onChange({ ...this.state, scope: this.scope });
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

function assertActiveAuthority(expected, actual, signal = null) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : lifecycleError("audio/host-call-aborted");
  }
  if (expected !== actual) throw lifecycleError("audio/host-call-stale");
}

function lifecycleError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function isLifecycleCancellation(error) {
  return error?.name === "AbortError" || String(error?.message || "").startsWith("audio/host-call-stale");
}

function normalizeScope(value) {
  const scope = String(value ?? "").trim();
  return scope || "default";
}
