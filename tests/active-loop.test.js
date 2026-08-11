import assert from "node:assert/strict";
import test from "node:test";
import {
  createActiveLoopController,
  normalizeControllerResult,
  stageActiveSource,
  toHaraLiteral,
} from "../src/runtime/active-loop.js";

function fakeEvaluator() {
  const sources = new Map();
  const calls = [];
  return {
    calls,
    async evaluate(source, namespace) {
      calls.push({ source, namespace });
      if (source.includes("BROKEN-CONTROLLER")) throw new Error("Unable to resolve symbol 'BROKEN-CONTROLLER'");
      if (source.startsWith("(ns ")) {
        sources.set(namespace, source);
        return { type: "var", name: `${namespace}/controller` };
      }
      const cycles = Number(source.match(/:cycles\s+([\d.-]+)/)?.[1] || 0);
      const gain = namespace.endsWith(".v1") ? 0.25 : 0.65;
      return {
        command: { pump: gain },
        memory: { cycles: cycles + 1 },
      };
    },
  };
}

test("active source is staged in an isolated version namespace", () => {
  const staged = stageActiveSource("(ns demo.controller)\n(defn controller [observation memory] nil)", {
    attempt: 3,
    entry: "controller",
  });
  assert.equal(staged.namespace, "demo.controller.active.v3");
  assert.equal(staged.qualifiedEntry, "demo.controller.active.v3/controller");
  assert.match(staged.source, /^\(ns demo\.controller\.active\.v3\)/);
});

test("Hara values and controller results are validated at the runtime boundary", () => {
  assert.equal(
    toHaraLiteral({ level: 68.5, memory: { "previous-error": -1 }, enabled: true }),
    "{:level 68.5 :memory {:previous-error -1} :enabled true}",
  );
  assert.deepEqual(
    normalizeControllerResult({ command: { pump: 1.4 }, memory: { cycle: 2 } }),
    { pump: 1, memory: { cycle: 2 } },
  );
  assert.throws(() => normalizeControllerResult({ command: {} }), /active\/controller-pump-required/);
});

test("the runtime schedules progression before controller code exists", async () => {
  const callbacks = [];
  const active = createActiveLoopController({
    evaluate: async () => ({ command: { pump: 0 }, memory: {} }),
    schedule(callback) { callbacks.push(callback); return callbacks.length; },
    cancel() {},
  });

  active.create({ loopId: "tank/controller", rateHz: 8 });
  assert.equal(active.inspect().version, 0);
  assert.equal(callbacks.length, 1, "creating the runtime-owned activity schedules its first tick");
  await callbacks.shift()();
  assert.equal(active.inspect().tick, 1);
  assert.equal(callbacks.length, 1, "the active runtime schedules the next tick itself");
  active.reset();
});

test("controller replacement retains the active loop, tick, world and memory", async () => {
  const evaluator = fakeEvaluator();
  const effects = [];
  let clock = 1000;
  const active = createActiveLoopController({
    evaluate: evaluator.evaluate,
    publish(effect) { effects.push(effect); },
    now: () => ++clock,
    autoSchedule: false,
  });

  const created = active.create({
    loopId: "tank/controller",
    kind: "tank",
    rateHz: 8,
    initialLevel: 78,
    target: 68,
  });
  assert.equal(created.version, 0);
  assert.equal(created.tick, 0);

  await active.tick();
  assert.equal(active.inspect().tick, 1);
  assert.ok(active.inspect().world.level < 78, "the runtime-owned tank leaks before code is installed");

  const first = await active.install({
    loopId: "tank/controller",
    source: "(ns demo.tank)\n(defn controller [observation memory] 0.25)",
    entry: "controller",
  });
  assert.equal(first.version, 1);
  assert.equal(first.installedAtTick, 1);

  await active.tick();
  const beforeReplacement = active.inspect();
  assert.deepEqual(beforeReplacement.memory, { cycles: 1 });

  const second = await active.install({
    loopId: "tank/controller",
    source: "(ns demo.tank)\n(defn controller [observation memory] 0.65)",
    entry: "controller",
  });
  assert.equal(second.version, 2);
  assert.equal(second.id, beforeReplacement.id);
  assert.equal(second.tick, beforeReplacement.tick);
  assert.deepEqual(second.world, beforeReplacement.world);
  assert.deepEqual(second.memory, beforeReplacement.memory);
  assert.equal(second.controller.namespace, "demo.tank.active.v2");
  assert.match(effects.at(-1).html, /Activity before application/);
  assert.match(effects.at(-1).html, /controller v2/);
});

test("a rejected activation leaves the accepted controller running", async () => {
  const evaluator = fakeEvaluator();
  const effects = [];
  const active = createActiveLoopController({
    evaluate: evaluator.evaluate,
    publish(effect) { effects.push(effect); },
    autoSchedule: false,
  });

  active.create({ loopId: "tank/controller" });
  await active.install({
    loopId: "tank/controller",
    source: "(ns demo.tank)\n(defn controller [observation memory] 0.25)",
  });
  await active.tick();
  const accepted = active.inspect();

  await assert.rejects(
    active.install({
      loopId: "tank/controller",
      source: "(ns demo.tank)\n(defn controller [observation memory] (BROKEN-CONTROLLER observation))",
    }),
    /active\/activation-rejected/,
  );

  const rejected = active.inspect();
  assert.equal(rejected.attempt, 2);
  assert.equal(rejected.version, 1);
  assert.equal(rejected.controller.namespace, accepted.controller.namespace);
  assert.equal(rejected.tick, accepted.tick);
  assert.deepEqual(rejected.world, accepted.world);
  assert.deepEqual(rejected.memory, accepted.memory);
  assert.match(rejected.lastError, /BROKEN-CONTROLLER/);
  assert.match(effects.at(-1).html, /Replacement rejected/);
  assert.match(effects.at(-1).html, /Controller v1 remains active/);

  await active.tick();
  assert.equal(active.inspect().tick, accepted.tick + 1);
  assert.equal(active.inspect().version, 1);
});

test("pause and disturbances act on the runtime-owned world without replacing it", async () => {
  const evaluator = fakeEvaluator();
  const active = createActiveLoopController({
    evaluate: evaluator.evaluate,
    autoSchedule: false,
  });
  active.create({ loopId: "tank/controller", initialLevel: 80 });
  await active.install({
    loopId: "tank/controller",
    source: "(ns demo.tank)\n(defn controller [observation memory] 0.25)",
  });

  const disturbed = active.command("tank/controller", "disturb", { amount: 20 });
  assert.equal(disturbed.id, "tank/controller");
  assert.ok(disturbed.world.level <= 60);

  const paused = active.command("tank/controller", "pause");
  const pausedTick = paused.tick;
  await active.tick();
  assert.equal(active.inspect().tick, pausedTick);
  assert.equal(active.inspect().status, "paused");

  active.command("tank/controller", "resume");
  await active.tick();
  assert.equal(active.inspect().tick, pausedTick + 1);
  assert.equal(active.inspect().id, "tank/controller");
});
