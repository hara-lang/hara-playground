import {
  activityKindFor,
  normalizeConveyorResult,
  normalizeTankResult,
} from "./active-activity-kinds.js";
import {
  cloneActiveValue,
  normalizeKeyword,
  stageActiveSource,
  toHaraLiteral,
} from "./active-values.js";

const ACTIVE_LOOP_SCHEMA = "playground.active-loop/v1";

function eventRecord(loop, kind, message, values = {}) {
  loop.events.push({
    sequence: ++loop.eventSequence,
    tick: loop.tick,
    kind,
    message,
    ...values,
  });
  if (loop.events.length > 12) loop.events.splice(0, loop.events.length - 12);
}

function controllerCall(controller, observation, memory) {
  return `(${controller.qualifiedEntry} ${toHaraLiteral(observation)} ${toHaraLiteral(memory)})`;
}

function appendHistory(loop) {
  const point = loop.definition.historyPoint(loop);
  loop.history.push(cloneActiveValue(point));
  if (loop.history.length > 64) loop.history.splice(0, loop.history.length - 64);
}

function snapshotOf(loop) {
  if (!loop) return null;
  const controller = loop.controller
    ? {
      version: loop.controller.version,
      attempt: loop.controller.attempt,
      namespace: loop.controller.namespace,
      entry: loop.controller.entry,
      installedAtTick: loop.controller.installedAtTick,
    }
    : null;
  return {
    schema: ACTIVE_LOOP_SCHEMA,
    id: loop.spec.id,
    kind: loop.spec.kind,
    activityLabel: loop.definition.activityLabel,
    behaviorLabel: loop.definition.behaviorLabel,
    interventionLabel: loop.definition.interventionLabel,
    status: loop.installing ? "activating" : loop.paused ? "paused" : "running",
    paused: loop.paused,
    tick: loop.tick,
    attempt: loop.attempt,
    version: controller?.version || 0,
    installedAtTick: controller?.installedAtTick ?? null,
    createdAt: loop.createdAt,
    updatedAt: loop.updatedAt,
    controller,
    world: loop.definition.snapshotWorld(loop),
    memory: cloneActiveValue(loop.memory),
    lastError: loop.lastError,
    runtimeError: loop.runtimeError,
    continuity: {
      loopIdentityRetained: true,
      tickMonotonic: true,
      worldStateRetained: true,
      controllerMemoryRetained: true,
    },
    events: loop.events.map((event) => ({ ...event })),
    history: loop.history.map((point) => cloneActiveValue(point)),
  };
}

export function createActiveLoopController({
  evaluate,
  publish = () => {},
  schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
  cancel = (handle) => globalThis.clearTimeout(handle),
  now = () => Date.now(),
  autoSchedule = true,
} = {}) {
  if (typeof evaluate !== "function") throw new TypeError("active/evaluate-required");
  if (typeof publish !== "function") throw new TypeError("active/publish-required");

  let loop = null;
  let timer = null;
  let generation = 0;

  function inspect() {
    return snapshotOf(loop);
  }

  function publishSnapshot({ force = true } = {}) {
    const snapshot = inspect();
    if (!snapshot) return null;
    const publishEvery = Math.max(1, Math.round(loop.spec.rateHz / 4));
    if (force || loop.tick % publishEvery === 0) {
      publish({
        type: "html",
        html: loop.definition.render(snapshot),
        activeLoop: snapshot,
      });
    }
    return snapshot;
  }

  function stopTimer() {
    if (timer != null) cancel(timer);
    timer = null;
    generation += 1;
  }

  function scheduleNext(delay = null) {
    if (!autoSchedule || !loop) return;
    const expectedGeneration = generation;
    const interval = delay == null ? 1000 / loop.spec.rateHz : delay;
    timer = schedule(async () => {
      timer = null;
      if (!loop || generation !== expectedGeneration) return;
      try {
        await tick();
      } finally {
        if (loop && generation === expectedGeneration) scheduleNext();
      }
    }, interval);
  }

  function create(spec = {}) {
    const definition = activityKindFor(spec.kind || spec.activeKind || "tank");
    const normalized = definition.normalizeSpec(spec);
    if (loop?.spec.id === normalized.id && loop?.spec.kind === normalized.kind) return inspect();
    stopTimer();
    const createdAt = now();
    loop = {
      spec: normalized,
      definition,
      createdAt,
      updatedAt: createdAt,
      tick: 0,
      attempt: 0,
      paused: false,
      installing: false,
      controller: null,
      memory: {},
      world: definition.createWorld(normalized),
      events: [],
      eventSequence: 0,
      history: [],
      lastError: null,
      runtimeError: null,
    };
    appendHistory(loop);
    eventRecord(
      loop,
      "loop-created",
      `Runtime created ${definition.activityLabel} before ${definition.behaviorLabel} code was installed.`,
    );
    publishSnapshot();
    scheduleNext(0);
    return inspect();
  }

  function requireLoop(id = null) {
    if (!loop) throw new Error("active/loop-not-created");
    if (id && id !== loop.spec.id) throw new Error(`active/loop-not-found:${id}`);
    return loop;
  }

  async function evaluateController(controller, observation, memory = loop?.memory || {}) {
    const current = requireLoop();
    const result = await evaluate(
      controllerCall(controller, observation, memory),
      controller.namespace,
    );
    return current.definition.normalizeResult(result, memory);
  }

  async function install({
    loopId = null,
    source,
    namespace = "active.loop",
    entry = "controller",
  } = {}) {
    const current = requireLoop(loopId);
    if (current.installing) throw new Error("active/activation-in-progress");
    const attempt = ++current.attempt;
    current.installing = true;
    let candidate = null;

    try {
      const staged = stageActiveSource(source, { namespace, entry, attempt });
      candidate = {
        attempt,
        version: attempt,
        namespace: staged.namespace,
        entry: staged.entry,
        qualifiedEntry: staged.qualifiedEntry,
        installedAtTick: current.tick,
      };
      await evaluate(staged.source, staged.namespace);
      // Validate the candidate against a representative observation and copied
      // memory. The continuing activity is not mutated until installation.
      await evaluateController(
        candidate,
        current.definition.validationObservation(current),
        cloneActiveValue(current.memory),
      );
    } catch (cause) {
      current.installing = false;
      const message = cause?.message || String(cause);
      current.lastError = message;
      current.updatedAt = now();
      eventRecord(
        current,
        "activation-rejected",
        `Attempt ${attempt} rejected; ${current.controller ? `${current.definition.behaviorLabel} v${current.controller.version}` : "the safe default"} remains active.`,
        { attempt },
      );
      const activeLoop = publishSnapshot();
      const error = new Error(`active/activation-rejected:${message}`, { cause });
      error.data = { attempt, activeLoop };
      throw error;
    }

    const retainedWorld = cloneActiveValue(current.world);
    const retainedMemory = cloneActiveValue(current.memory);
    const retainedTick = current.tick;
    current.controller = candidate;
    current.world = retainedWorld;
    current.memory = retainedMemory;
    current.installing = false;
    current.lastError = null;
    current.runtimeError = null;
    current.updatedAt = now();
    eventRecord(
      current,
      "activation-installed",
      `${current.definition.behaviorLabel} v${attempt} installed at a safe tick boundary.`,
      { attempt, installedAtTick: retainedTick },
    );
    return publishSnapshot();
  }

  async function tick() {
    const current = requireLoop();
    if (current.paused || current.installing) return inspect();

    const decide = async (observation) => {
      if (!current.controller) return current.definition.defaultCommand(current, observation);
      try {
        const result = await evaluateController(current.controller, observation, current.memory);
        current.memory = result.memory;
        current.runtimeError = null;
        return result.command;
      } catch (cause) {
        const message = cause?.message || String(cause);
        if (message !== current.runtimeError) {
          eventRecord(
            current,
            "controller-failed",
            `${current.definition.behaviorLabel} v${current.controller.version} failed for this decision; the safe default was used.`,
          );
        }
        current.runtimeError = message;
        return current.definition.defaultCommand(current, observation);
      }
    };

    try {
      await current.definition.advance(current, decide, {
        event(kind, message, values = {}) {
          eventRecord(current, kind, message, values);
        },
      });
    } catch (cause) {
      const message = cause?.message || String(cause);
      current.runtimeError = message;
      eventRecord(current, "activity-failed", `${current.definition.activityLabel} could not advance this tick.`);
    }

    current.tick += 1;
    current.updatedAt = now();
    appendHistory(current);
    return publishSnapshot({ force: false });
  }

  function command(loopId, commandName, options = {}) {
    const current = requireLoop(loopId);
    const command = normalizeKeyword(commandName);
    switch (command) {
      case "pause":
        current.paused = true;
        if (Object.hasOwn(current.world, "pump")) current.world.pump = 0;
        eventRecord(current, "loop-paused", "The runtime paused progression without discarding state.");
        break;
      case "resume":
        current.paused = false;
        eventRecord(current, "loop-resumed", "The runtime resumed the same activity identity and state.");
        break;
      case "toggle":
        return command(loopId, current.paused ? "resume" : "pause", options);
      case "status":
        return inspect();
      default: {
        const handled = current.definition.command(current, command, options, {
          event(kind, message, values = {}) {
            eventRecord(current, kind, message, values);
          },
        });
        if (!handled) throw new Error(`active/command-unsupported:${command}`);
        appendHistory(current);
        break;
      }
    }
    current.updatedAt = now();
    return publishSnapshot();
  }

  function reset() {
    stopTimer();
    loop = null;
    return true;
  }

  return Object.freeze({ create, install, tick, command, inspect, reset });
}

export function normalizeControllerResult(value, previousMemory = {}) {
  const normalized = normalizeTankResult(value, previousMemory);
  return Object.freeze({ pump: normalized.command.pump, memory: normalized.memory });
}

export function normalizeRoutingResult(value, previousMemory = {}) {
  const normalized = normalizeConveyorResult(value, previousMemory);
  return Object.freeze({ route: normalized.command.route, memory: normalized.memory });
}

export {
  cloneActiveValue,
  stageActiveSource,
  toHaraLiteral,
  toPlainActiveValue,
} from "./active-values.js";
export { ACTIVE_LOOP_SCHEMA };
