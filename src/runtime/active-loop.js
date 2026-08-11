import { renderTankActiveLoop } from "./active-loop-view.js";

const ACTIVE_LOOP_SCHEMA = "playground.active-loop/v1";
const DEFAULT_TANK = Object.freeze({
  id: "tank/controller",
  kind: "tank",
  rateHz: 8,
  initialLevel: 78,
  target: 68,
  leakRate: 1.6,
  fillRate: 10,
});

const NAMESPACE_PATTERN = /\(ns\s+([A-Za-z][A-Za-z0-9_.-]*)/;
const SYMBOL_PATTERN = /^[A-Za-z][A-Za-z0-9_.?*!+\-]*$/;
const LOOP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_./-]*$/;

function clamp(minimum, maximum, value) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boundedNumber(value, fallback, minimum, maximum) {
  return clamp(minimum, maximum, finiteNumber(value, fallback));
}

function normalizeKeyword(value) {
  const text = String(value ?? "");
  return text.startsWith(":") ? text.slice(1) : text;
}

function plainKey(value) {
  if (typeof value === "string") return normalizeKeyword(value);
  if (value?.constructor?.name === "HtaKeyword" && typeof value.name === "string") return value.name;
  return normalizeKeyword(value);
}

export function toPlainActiveValue(value, seen = new WeakSet()) {
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value)) throw new Error("active/value-cycle");
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => toPlainActiveValue(item, seen));
    if (value instanceof Map) {
      return Object.fromEntries(
        [...value.entries()].map(([key, entry]) => [plainKey(key), toPlainActiveValue(entry, seen)])
      );
    }
    if (value?.constructor?.name === "HtaKeyword" && typeof value.name === "string") {
      return `:${value.name}`;
    }
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      output[plainKey(key)] = toPlainActiveValue(entry, seen);
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

function cloneActiveValue(value) {
  return toPlainActiveValue(value);
}

function keywordLiteral(key) {
  const normalized = normalizeKeyword(key);
  if (!SYMBOL_PATTERN.test(normalized)) {
    throw new Error(`active/map-key-invalid:${normalized}`);
  }
  return `:${normalized}`;
}

export function toHaraLiteral(value, seen = new WeakSet()) {
  if (value == null) return "nil";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("active/number-invalid");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value !== "object") throw new Error(`active/value-unsupported:${typeof value}`);
  if (seen.has(value)) throw new Error("active/value-cycle");
  seen.add(value);
  try {
    if (Array.isArray(value)) return `[${value.map((item) => toHaraLiteral(item, seen)).join(" ")}]`;
    const plain = toPlainActiveValue(value);
    return `{${Object.entries(plain)
      .map(([key, entry]) => `${keywordLiteral(key)} ${toHaraLiteral(entry, seen)}`)
      .join(" ")}}`;
  } finally {
    seen.delete(value);
  }
}

function safeNamespace(value, fallback = "active.loop") {
  const namespace = String(value || fallback).replace(/[^A-Za-z0-9_.-]/g, "-");
  return /^[A-Za-z]/.test(namespace) ? namespace : `active.${namespace}`;
}

export function stageActiveSource(source, {
  namespace = "active.loop",
  entry = "controller",
  attempt = 1,
} = {}) {
  const text = String(source || "").trim();
  if (!text) throw new Error("active/source-required");
  const entryName = String(entry || "controller");
  if (!SYMBOL_PATTERN.test(entryName)) throw new Error(`active/entry-invalid:${entryName}`);
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new Error("active/attempt-invalid");

  const declared = text.match(NAMESPACE_PATTERN)?.[1] || null;
  const base = safeNamespace(declared || namespace);
  const stagingNamespace = `${base}.active.v${attempt}`;
  const stagedSource = declared
    ? text.replace(NAMESPACE_PATTERN, `(ns ${stagingNamespace}`)
    : `(ns ${stagingNamespace})\n\n${text}`;

  return Object.freeze({
    source: stagedSource,
    namespace: stagingNamespace,
    entry: entryName,
    qualifiedEntry: `${stagingNamespace}/${entryName}`,
  });
}

export function normalizeControllerResult(value, previousMemory = {}) {
  const result = toPlainActiveValue(value);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("active/controller-result-invalid");
  }
  const command = result.command && typeof result.command === "object"
    ? result.command
    : result;
  const pump = Number(command.pump);
  if (!Number.isFinite(pump)) throw new Error("active/controller-pump-required");
  const memory = result.memory === undefined ? cloneActiveValue(previousMemory) : cloneActiveValue(result.memory);
  if (!memory || typeof memory !== "object" || Array.isArray(memory)) {
    throw new Error("active/controller-memory-invalid");
  }
  return Object.freeze({ pump: clamp(0, 1, pump), memory });
}

function normalizeTankSpec(spec = {}) {
  const id = String(spec.loopId || spec.id || spec.activeId || DEFAULT_TANK.id);
  if (!LOOP_ID_PATTERN.test(id)) throw new Error(`active/id-invalid:${id}`);
  const kind = normalizeKeyword(spec.kind || spec.activeKind || DEFAULT_TANK.kind);
  if (kind !== "tank") throw new Error(`active/kind-unsupported:${kind}`);
  return Object.freeze({
    id,
    kind,
    rateHz: boundedNumber(spec.rateHz, DEFAULT_TANK.rateHz, 1, 60),
    initialLevel: boundedNumber(spec.initialLevel, DEFAULT_TANK.initialLevel, 0, 100),
    target: boundedNumber(spec.target, DEFAULT_TANK.target, 0, 100),
    leakRate: boundedNumber(spec.leakRate, DEFAULT_TANK.leakRate, 0, 100),
    fillRate: boundedNumber(spec.fillRate, DEFAULT_TANK.fillRate, 0, 100),
  });
}

function eventRecord(loop, kind, message, values = {}) {
  loop.events.push({
    sequence: ++loop.eventSequence,
    tick: loop.tick,
    kind,
    message,
    ...values,
  });
  if (loop.events.length > 8) loop.events.splice(0, loop.events.length - 8);
}

function observationFor(loop) {
  return {
    level: loop.world.level,
    target: loop.world.target,
    pump: loop.world.pump,
    tick: loop.tick,
  };
}

function controllerCall(controller, observation, memory) {
  return `(${controller.qualifiedEntry} ${toHaraLiteral(observation)} ${toHaraLiteral(memory)})`;
}

function appendHistory(loop) {
  loop.history.push({ tick: loop.tick, level: loop.world.level, target: loop.world.target });
  if (loop.history.length > 48) loop.history.splice(0, loop.history.length - 48);
}

function applyTankDynamics(loop, pump) {
  const deltaSeconds = 1 / loop.spec.rateHz;
  const inflow = pump * loop.spec.fillRate * deltaSeconds;
  const leak = loop.spec.leakRate * deltaSeconds;
  loop.world.pump = pump;
  loop.world.level = clamp(0, 100, loop.world.level + inflow - leak);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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
    status: loop.installing ? "activating" : loop.paused ? "paused" : "running",
    paused: loop.paused,
    tick: loop.tick,
    attempt: loop.attempt,
    version: controller?.version || 0,
    installedAtTick: controller?.installedAtTick ?? null,
    createdAt: loop.createdAt,
    updatedAt: loop.updatedAt,
    controller,
    world: {
      level: round(loop.world.level),
      target: round(loop.world.target),
      pump: round(loop.world.pump, 3),
      leakRate: loop.spec.leakRate,
      fillRate: loop.spec.fillRate,
    },
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
    history: loop.history.map((point) => ({ ...point })),
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
      publish({ type: "html", html: renderTankActiveLoop(snapshot), activeLoop: snapshot });
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
    const normalized = normalizeTankSpec(spec);
    if (loop?.spec.id === normalized.id && loop?.spec.kind === normalized.kind) return inspect();
    stopTimer();
    const createdAt = now();
    loop = {
      spec: normalized,
      createdAt,
      updatedAt: createdAt,
      tick: 0,
      attempt: 0,
      paused: false,
      installing: false,
      controller: null,
      memory: {},
      world: { level: normalized.initialLevel, target: normalized.target, pump: 0 },
      events: [],
      eventSequence: 0,
      history: [],
      lastError: null,
      runtimeError: null,
    };
    appendHistory(loop);
    eventRecord(loop, "loop-created", "Runtime created the active loop before controller code was installed.");
    publishSnapshot();
    scheduleNext(0);
    return inspect();
  }

  function requireLoop(id = null) {
    if (!loop) throw new Error("active/loop-not-created");
    if (id && id !== loop.spec.id) throw new Error(`active/loop-not-found:${id}`);
    return loop;
  }

  async function evaluateController(controller, memory = loop?.memory || {}) {
    const current = requireLoop();
    const result = await evaluate(
      controllerCall(controller, observationFor(current), memory),
      controller.namespace,
    );
    return normalizeControllerResult(result, memory);
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
      // Dry-run against copies. Neither world nor controller memory can change
      // until the candidate has compiled and produced a valid command shape.
      await evaluateController(candidate, cloneActiveValue(current.memory));
    } catch (cause) {
      current.installing = false;
      const message = cause?.message || String(cause);
      current.lastError = message;
      current.updatedAt = now();
      eventRecord(current, "activation-rejected", `Attempt ${attempt} rejected; v${current.controller?.version || 0} remains active.`, { attempt });
      const activeLoop = publishSnapshot();
      const error = new Error(`active/activation-rejected:${message}`, { cause });
      error.data = { attempt, activeLoop };
      throw error;
    }

    const retainedTick = current.tick;
    const retainedLevel = current.world.level;
    const retainedMemory = cloneActiveValue(current.memory);
    current.controller = candidate;
    current.memory = retainedMemory;
    current.world.level = retainedLevel;
    current.installing = false;
    current.lastError = null;
    current.runtimeError = null;
    current.updatedAt = now();
    eventRecord(current, "activation-installed", `Controller v${attempt} installed at a safe tick boundary.`, {
      attempt,
      installedAtTick: retainedTick,
    });
    return publishSnapshot();
  }

  async function tick() {
    const current = requireLoop();
    if (current.paused || current.installing) return inspect();

    let pump = 0;
    if (current.controller) {
      try {
        const result = await evaluateController(current.controller, current.memory);
        pump = result.pump;
        current.memory = result.memory;
        current.runtimeError = null;
      } catch (cause) {
        pump = 0;
        const message = cause?.message || String(cause);
        if (message !== current.runtimeError) {
          eventRecord(current, "controller-failed", `Controller v${current.controller.version} failed for this tick; pump set to zero.`);
        }
        current.runtimeError = message;
      }
    }

    applyTankDynamics(current, pump);
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
        current.world.pump = 0;
        eventRecord(current, "loop-paused", "The runtime paused progression without discarding state.");
        break;
      case "resume":
        current.paused = false;
        eventRecord(current, "loop-resumed", "The runtime resumed the same loop identity and state.");
        break;
      case "toggle":
        return command(loopId, current.paused ? "resume" : "pause", options);
      case "disturb": {
        const amount = boundedNumber(options.amount, 18, 1, 80);
        current.world.level = clamp(0, 100, current.world.level - amount);
        current.world.pump = 0;
        appendHistory(current);
        eventRecord(current, "world-disturbed", `Removed ${round(amount, 1)}% of the tank to test the live controller.`);
        break;
      }
      case "set-target": {
        const target = boundedNumber(options.target, current.world.target, 0, 100);
        current.world.target = target;
        eventRecord(current, "target-updated", `Target changed to ${round(target, 1)}%.`);
        break;
      }
      case "status":
        return inspect();
      default:
        throw new Error(`active/command-unsupported:${command}`);
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

export { ACTIVE_LOOP_SCHEMA };
