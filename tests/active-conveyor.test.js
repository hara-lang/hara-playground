import assert from "node:assert/strict";
import test from "node:test";
import { createActiveLoopController, normalizeRoutingResult } from "../src/runtime/active-loop.js";

function routingEvaluator() {
  return async (source, namespace) => {
    if (source.includes("BROKEN-POLICY")) throw new Error("Unable to resolve symbol 'BROKEN-POLICY'");
    if (source.startsWith("(ns ")) return { type: "var", name: `${namespace}/route-package` };
    const seen = Number(source.match(/:seen\s+([\d.-]+)/)?.[1] || 0);
    const anomaly = /:anomaly\s+true/.test(source);
    const colour = source.match(/:colour\s+"([^"]+)"/)?.[1];
    const route = anomaly ? ":inspect" : colour === "red" ? ":reject" : ":green";
    return { command: { route }, memory: { seen: seen + 1, "last-route": route } };
  };
}

test("routing results admit only the three bounded conveyor routes", () => {
  assert.deepEqual(normalizeRoutingResult({ command: { route: ":green" }, memory: { seen: 2 } }), { route: "green", memory: { seen: 2 } });
  assert.throws(() => normalizeRoutingResult({ command: { route: ":side-door" } }), /active\/routing-route-invalid/);
});

test("a conveyor activity progresses before policy code exists", async () => {
  const active = createActiveLoopController({ evaluate: routingEvaluator(), autoSchedule: false });
  const created = active.create({
    loopId: "conveyor/cell-a",
    kind: "conveyor",
    rateHz: 6,
    initialPackages: 2,
    beltSpeed: 10,
    sensorPosition: 30,
    spawnEveryTicks: 8,
  });
  assert.equal(created.version, 0);
  const positions = created.world.packages.map((item) => item.position);
  await active.tick();
  assert.equal(active.inspect().tick, 1);
  assert.ok(active.inspect().world.packages[0].position > positions[0]);
});

test("conveyor snapshots remain bounded and serializable", async () => {
  const active = createActiveLoopController({ evaluate: routingEvaluator(), autoSchedule: false });
  active.create({
    loopId: "conveyor/cell-a",
    kind: "conveyor",
    initialPackages: 4,
    maxPackages: 6,
    beltSpeed: 12,
    sensorPosition: 20,
    spawnEveryTicks: 3,
  });
  for (let index = 0; index < 40; index += 1) await active.tick();
  const snapshot = active.inspect();
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  assert.ok(snapshot.world.packages.length <= 6);
  assert.ok(snapshot.events.length <= 12);
  assert.ok(snapshot.history.length <= 64);
});

test("routing policy replacement retains packages, sensor sequence and counts", async () => {
  const effects = [];
  const active = createActiveLoopController({ evaluate: routingEvaluator(), publish: (effect) => effects.push(effect), autoSchedule: false });
  active.create({
    loopId: "conveyor/cell-a",
    kind: "conveyor",
    rateHz: 6,
    initialPackages: 3,
    beltSpeed: 9,
    sensorPosition: 24,
    spawnEveryTicks: 6,
  });
  await active.install({
    loopId: "conveyor/cell-a",
    namespace: "samples.active-conveyor-twin",
    entry: "route-package",
    source: "(ns samples.active-conveyor-twin)\n(defn route-package [observation memory] nil)",
  });
  await active.tick();
  await active.tick();
  const before = active.inspect();
  assert.ok(before.world.sensorSequence > 0);

  const replaced = await active.install({
    loopId: "conveyor/cell-a",
    namespace: "samples.active-conveyor-twin",
    entry: "route-package",
    source: "(ns samples.active-conveyor-twin)\n(defn route-package [observation memory] :changed)",
  });
  assert.equal(replaced.version, 2);
  assert.equal(replaced.id, before.id);
  assert.equal(replaced.tick, before.tick);
  assert.equal(replaced.world.sensorSequence, before.world.sensorSequence);
  assert.deepEqual(replaced.world.packages, before.world.packages);
  assert.deepEqual(replaced.world.counts, before.world.counts);
  assert.deepEqual(replaced.memory, before.memory);
  assert.match(effects.at(-1).html, /The line continues while its judgement changes/);
});

test("sensor anomalies and rejected policies do not replace the conveyor activity", async () => {
  const active = createActiveLoopController({ evaluate: routingEvaluator(), autoSchedule: false });
  active.create({ loopId: "conveyor/cell-a", kind: "conveyor", initialPackages: 1, beltSpeed: 12, sensorPosition: 22 });
  await active.install({ loopId: "conveyor/cell-a", entry: "route-package", source: "(ns demo.route)\n(defn route-package [observation memory] nil)" });
  active.command("conveyor/cell-a", "inject-anomaly");
  await active.tick();
  await active.tick();
  const accepted = active.inspect();
  assert.equal(accepted.world.lastObservation.anomaly, true);
  assert.equal(accepted.world.lastDecision.route, "inspect");

  await assert.rejects(active.install({ loopId: "conveyor/cell-a", entry: "route-package", source: "(ns demo.route)\n(defn route-package [observation memory] (BROKEN-POLICY observation))" }), /active\/activation-rejected/);
  const rejected = active.inspect();
  assert.equal(rejected.version, 1);
  assert.equal(rejected.tick, accepted.tick);
  assert.deepEqual(rejected.world, accepted.world);
});
