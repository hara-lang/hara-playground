import { renderTankActiveLoop } from "./active-loop-view.js";
import { renderConveyorActiveLoop } from "./active-conveyor-view.js";
import {
  boundedInteger,
  boundedNumber,
  clamp,
  cloneActiveValue,
  normalizeKeyword,
  round,
  toPlainActiveValue,
} from "./active-values.js";

const LOOP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_./-]*$/;
const ROUTES = new Set(["green", "inspect", "reject"]);

const DEFAULT_TANK = Object.freeze({
  id: "tank/controller",
  kind: "tank",
  rateHz: 8,
  initialLevel: 78,
  target: 68,
  leakRate: 1.6,
  fillRate: 10,
});

const DEFAULT_CONVEYOR = Object.freeze({
  id: "conveyor/cell-a",
  kind: "conveyor",
  rateHz: 6,
  initialPackages: 4,
  spawnEveryTicks: 8,
  beltSpeed: 4.5,
  sensorPosition: 44,
  routePosition: 72,
  maxPackages: 16,
});

function loopId(spec, fallback) {
  const id = String(spec.loopId || spec.id || spec.activeId || fallback);
  if (!LOOP_ID_PATTERN.test(id)) throw new Error(`active/id-invalid:${id}`);
  return id;
}

function memoryFrom(result, previousMemory) {
  const memory = result.memory === undefined
    ? cloneActiveValue(previousMemory)
    : cloneActiveValue(result.memory);
  if (!memory || typeof memory !== "object" || Array.isArray(memory)) {
    throw new Error("active/controller-memory-invalid");
  }
  return memory;
}

export function normalizeTankResult(value, previousMemory = {}) {
  const result = toPlainActiveValue(value);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("active/controller-result-invalid");
  }
  const command = result.command && typeof result.command === "object"
    ? result.command
    : result;
  const pump = Number(command.pump);
  if (!Number.isFinite(pump)) throw new Error("active/controller-pump-required");
  return Object.freeze({
    command: Object.freeze({ pump: clamp(0, 1, pump) }),
    memory: memoryFrom(result, previousMemory),
  });
}

export function normalizeConveyorResult(value, previousMemory = {}) {
  const result = toPlainActiveValue(value);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("active/routing-result-invalid");
  }
  const command = result.command && typeof result.command === "object"
    ? result.command
    : result;
  const route = normalizeKeyword(command.route);
  if (!ROUTES.has(route)) throw new Error(`active/routing-route-invalid:${route || "missing"}`);
  return Object.freeze({
    command: Object.freeze({ route }),
    memory: memoryFrom(result, previousMemory),
  });
}

function normalizeTankSpec(spec = {}) {
  const kind = normalizeKeyword(spec.kind || spec.activeKind || DEFAULT_TANK.kind);
  if (kind !== "tank") throw new Error(`active/kind-unsupported:${kind}`);
  return Object.freeze({
    id: loopId(spec, DEFAULT_TANK.id),
    kind,
    rateHz: boundedNumber(spec.rateHz, DEFAULT_TANK.rateHz, 1, 60),
    initialLevel: boundedNumber(spec.initialLevel, DEFAULT_TANK.initialLevel, 0, 100),
    target: boundedNumber(spec.target, DEFAULT_TANK.target, 0, 100),
    leakRate: boundedNumber(spec.leakRate, DEFAULT_TANK.leakRate, 0, 100),
    fillRate: boundedNumber(spec.fillRate, DEFAULT_TANK.fillRate, 0, 100),
  });
}

function tankObservation(loop) {
  return {
    level: loop.world.level,
    target: loop.world.target,
    pump: loop.world.pump,
    tick: loop.tick,
  };
}

const tankKind = Object.freeze({
  kind: "tank",
  activityLabel: "Living Tank",
  behaviorLabel: "controller",
  interventionLabel: "Disturb tank",
  interventionCommand: "disturb",
  interventionOptions: Object.freeze({ amount: 18 }),
  normalizeSpec: normalizeTankSpec,
  createWorld(spec) {
    return { level: spec.initialLevel, target: spec.target, pump: 0 };
  },
  validationObservation: tankObservation,
  normalizeResult: normalizeTankResult,
  defaultCommand() {
    return { pump: 0 };
  },
  async advance(loop, decide) {
    const command = await decide(tankObservation(loop));
    const deltaSeconds = 1 / loop.spec.rateHz;
    const inflow = command.pump * loop.spec.fillRate * deltaSeconds;
    const leak = loop.spec.leakRate * deltaSeconds;
    loop.world.pump = command.pump;
    loop.world.level = clamp(0, 100, loop.world.level + inflow - leak);
  },
  snapshotWorld(loop) {
    return {
      level: round(loop.world.level),
      target: round(loop.world.target),
      pump: round(loop.world.pump, 3),
      leakRate: loop.spec.leakRate,
      fillRate: loop.spec.fillRate,
    };
  },
  historyPoint(loop) {
    return { tick: loop.tick, level: loop.world.level, target: loop.world.target };
  },
  render: renderTankActiveLoop,
  command(loop, commandName, options, helpers) {
    switch (commandName) {
      case "disturb": {
        const amount = boundedNumber(options.amount, 18, 1, 80);
        loop.world.level = clamp(0, 100, loop.world.level - amount);
        loop.world.pump = 0;
        helpers.event("world-disturbed", `Removed ${round(amount, 1)}% of the tank to test the live controller.`);
        return true;
      }
      case "set-target": {
        const target = boundedNumber(options.target, loop.world.target, 0, 100);
        loop.world.target = target;
        helpers.event("target-updated", `Target changed to ${round(target, 1)}%.`);
        return true;
      }
      default:
        return false;
    }
  },
});

function normalizeConveyorSpec(spec = {}) {
  const kind = normalizeKeyword(spec.kind || spec.activeKind || DEFAULT_CONVEYOR.kind);
  if (kind !== "conveyor") throw new Error(`active/kind-unsupported:${kind}`);
  const sensorPosition = boundedNumber(
    spec.sensorPosition,
    DEFAULT_CONVEYOR.sensorPosition,
    20,
    70,
  );
  const routePosition = boundedNumber(
    spec.routePosition,
    DEFAULT_CONVEYOR.routePosition,
    sensorPosition + 8,
    92,
  );
  const maxPackages = boundedInteger(spec.maxPackages, DEFAULT_CONVEYOR.maxPackages, 4, 30);
  return Object.freeze({
    id: loopId(spec, DEFAULT_CONVEYOR.id),
    kind,
    rateHz: boundedNumber(spec.rateHz, DEFAULT_CONVEYOR.rateHz, 1, 30),
    initialPackages: boundedInteger(spec.initialPackages, DEFAULT_CONVEYOR.initialPackages, 1, Math.min(8, maxPackages)),
    spawnEveryTicks: boundedInteger(spec.spawnEveryTicks, DEFAULT_CONVEYOR.spawnEveryTicks, 3, 40),
    beltSpeed: boundedNumber(spec.beltSpeed, DEFAULT_CONVEYOR.beltSpeed, 0.5, 12),
    sensorPosition,
    routePosition,
    maxPackages,
  });
}

function packageProfile(sequence) {
  const colours = ["green", "blue", "amber", "red", "green", "green"];
  return {
    colour: colours[(sequence - 1) % colours.length],
    weight: round(2.5 + ((sequence * 17) % 72) / 10, 1),
    confidence: round(0.66 + ((sequence * 13) % 30) / 100, 2),
  };
}

function spawnPackage(world, spec, { position = 2 } = {}) {
  if (world.packages.length >= spec.maxPackages) return null;
  const sequence = world.nextPackageId++;
  const profile = packageProfile(sequence);
  const item = {
    id: `PKG-${String(sequence).padStart(3, "0")}`,
    position: clamp(0, 99, position),
    colour: profile.colour,
    weight: profile.weight,
    confidence: profile.confidence,
    anomaly: false,
    observed: false,
    route: null,
    decisionTick: null,
  };
  world.packages.push(item);
  return item;
}

function createConveyorWorld(spec) {
  const world = {
    beltPosition: 0,
    sensorSequence: 0,
    nextPackageId: 1,
    jammed: false,
    anomalyArmed: false,
    packages: [],
    counts: { green: 0, inspect: 0, reject: 0, completed: 0 },
    lastObservation: null,
    lastDecision: null,
  };
  const spacing = Math.min(12, Math.max(7, (spec.sensorPosition - 12) / Math.max(1, spec.initialPackages)));
  for (let index = 0; index < spec.initialPackages; index += 1) {
    spawnPackage(world, spec, { position: 5 + index * spacing });
  }
  return world;
}

function observationForPackage(loop, item, anomaly) {
  return {
    "package-id": item.id,
    "sensor-sequence": loop.world.sensorSequence,
    tick: loop.tick,
    colour: item.colour,
    weight: item.weight,
    confidence: anomaly ? 0.39 : item.confidence,
    anomaly,
    "barcode-read": !anomaly,
    cell: "A",
  };
}

function validationConveyorObservation(loop) {
  const item = loop.world.packages[0] || {
    id: "PKG-VALIDATE",
    colour: "green",
    weight: 4.8,
    confidence: 0.91,
  };
  return {
    "package-id": item.id,
    "sensor-sequence": loop.world.sensorSequence + 1,
    tick: loop.tick,
    colour: item.colour,
    weight: item.weight,
    confidence: item.confidence,
    anomaly: false,
    "barcode-read": true,
    cell: "A",
  };
}

function snapshotConveyorWorld(loop) {
  return {
    beltPosition: round(loop.world.beltPosition, 1),
    sensorSequence: loop.world.sensorSequence,
    jammed: loop.world.jammed,
    anomalyArmed: loop.world.anomalyArmed,
    beltSpeed: loop.spec.beltSpeed,
    sensorPosition: loop.spec.sensorPosition,
    routePosition: loop.spec.routePosition,
    packages: loop.world.packages.slice(0, loop.spec.maxPackages).map((item) => ({
      ...item,
      position: round(item.position, 1),
    })),
    counts: { ...loop.world.counts },
    lastObservation: cloneActiveValue(loop.world.lastObservation),
    lastDecision: cloneActiveValue(loop.world.lastDecision),
  };
}

const conveyorKind = Object.freeze({
  kind: "conveyor",
  activityLabel: "Conveyor Cell A",
  behaviorLabel: "routing policy",
  interventionLabel: "Inject anomaly",
  interventionCommand: "inject-anomaly",
  interventionOptions: Object.freeze({}),
  normalizeSpec: normalizeConveyorSpec,
  createWorld: createConveyorWorld,
  validationObservation: validationConveyorObservation,
  normalizeResult: normalizeConveyorResult,
  defaultCommand() {
    return { route: "inspect" };
  },
  async advance(loop, decide, helpers) {
    const world = loop.world;
    if (!world.jammed) {
      world.beltPosition = (world.beltPosition + loop.spec.beltSpeed) % 100;
      for (const item of world.packages) item.position += loop.spec.beltSpeed;
      if (loop.tick > 0 && loop.tick % loop.spec.spawnEveryTicks === 0) {
        const spawned = spawnPackage(world, loop.spec);
        if (spawned) helpers.event("package-entered", `${spawned.id} entered Conveyor Cell A.`, { packageId: spawned.id });
      }
    }

    const sensed = world.packages
      .filter((item) => !item.observed && item.position >= loop.spec.sensorPosition)
      .sort((left, right) => left.position - right.position);

    for (const item of sensed) {
      item.observed = true;
      world.sensorSequence += 1;
      const anomaly = Boolean(item.anomaly || world.anomalyArmed);
      world.anomalyArmed = false;
      item.anomaly = anomaly;
      const observation = observationForPackage(loop, item, anomaly);
      world.lastObservation = observation;
      const command = await decide(observation);
      item.route = command.route;
      item.decisionTick = loop.tick;
      world.lastDecision = {
        packageId: item.id,
        route: command.route,
        tick: loop.tick,
        policyVersion: loop.controller?.version || 0,
      };
      helpers.event(
        "package-routed",
        `${item.id} routed to ${command.route} by ${loop.controller ? `policy v${loop.controller.version}` : "the safe default"}.`,
        { packageId: item.id, route: command.route },
      );
    }

    const completed = world.packages.filter((item) => item.position >= 100);
    for (const item of completed) {
      const route = ROUTES.has(item.route) ? item.route : "inspect";
      world.counts[route] += 1;
      world.counts.completed += 1;
    }
    if (completed.length) {
      const completedIds = new Set(completed.map((item) => item.id));
      world.packages = world.packages.filter((item) => !completedIds.has(item.id));
    }
  },
  snapshotWorld: snapshotConveyorWorld,
  historyPoint(loop) {
    return {
      tick: loop.tick,
      inFlight: loop.world.packages.length,
      sensorSequence: loop.world.sensorSequence,
      green: loop.world.counts.green,
      inspect: loop.world.counts.inspect,
      reject: loop.world.counts.reject,
    };
  },
  render: renderConveyorActiveLoop,
  command(loop, commandName, _options, helpers) {
    switch (commandName) {
      case "inject-anomaly":
        loop.world.anomalyArmed = true;
        helpers.event("sensor-anomaly-armed", "The next package observation will contain a simulated sensor anomaly.");
        return true;
      case "toggle-jam":
        loop.world.jammed = !loop.world.jammed;
        helpers.event(loop.world.jammed ? "belt-jammed" : "belt-cleared", loop.world.jammed
          ? "The physical-style belt is jammed while twin state remains available."
          : "The same conveyor activity resumed after the jam cleared.");
        return true;
      case "jam":
        loop.world.jammed = true;
        helpers.event("belt-jammed", "The physical-style belt is jammed while twin state remains available.");
        return true;
      case "clear-jam":
        loop.world.jammed = false;
        helpers.event("belt-cleared", "The same conveyor activity resumed after the jam cleared.");
        return true;
      default:
        return false;
    }
  },
});

const ACTIVE_KINDS = new Map([
  [tankKind.kind, tankKind],
  [conveyorKind.kind, conveyorKind],
]);

export function activityKindFor(value) {
  const kind = normalizeKeyword(value || "tank");
  const definition = ACTIVE_KINDS.get(kind);
  if (!definition) throw new Error(`active/kind-unsupported:${kind}`);
  return definition;
}

export const SUPPORTED_ACTIVE_KINDS = Object.freeze([...ACTIVE_KINDS.keys()]);
