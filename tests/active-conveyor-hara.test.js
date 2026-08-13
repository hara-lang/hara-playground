import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HaraRuntime } from "../src/runtime/evaluator.js";
import { createActiveLoopController } from "../src/runtime/active-loop.js";

test("the Conveyor Twin routing policy runs through the embedded Hara evaluator", async () => {
  const runtime = new HaraRuntime();
  const source = await readFile(new URL("../samples/active-conveyor-twin/src/main.hal", import.meta.url), "utf8");
  const active = createActiveLoopController({
    evaluate: (form, namespace) => runtime.evaluateSource(form, namespace),
    autoSchedule: false,
  });

  active.create({
    loopId: "conveyor/cell-a",
    kind: "conveyor",
    rateHz: 6,
    initialPackages: 1,
    beltSpeed: 12,
    sensorPosition: 20,
    spawnEveryTicks: 8,
  });
  const installed = await active.install({
    loopId: "conveyor/cell-a",
    source,
    namespace: "samples.active-conveyor-twin",
    entry: "route-package",
  });
  assert.equal(installed.version, 1);
  assert.equal(installed.controller.namespace, "samples.active-conveyor-twin.active.v1");

  active.command("conveyor/cell-a", "inject-anomaly");
  await active.tick();
  await active.tick();
  const observed = active.inspect();
  assert.equal(observed.world.lastObservation.anomaly, true);
  assert.equal(observed.world.lastDecision.route, "inspect");
  assert.equal(typeof observed.memory.seen, "number");
  assert.equal(observed.id, "conveyor/cell-a");
});
