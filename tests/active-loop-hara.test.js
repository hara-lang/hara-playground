import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HaraRuntime } from "../src/runtime/evaluator.js";
import { createActiveLoopController } from "../src/runtime/active-loop.js";

test("the Living Tank controller runs through the embedded Hara evaluator", async () => {
  const runtime = new HaraRuntime();
  const source = await readFile(new URL("../samples/active-loop-tank/src/main.hal", import.meta.url), "utf8");
  const active = createActiveLoopController({
    evaluate: (form, namespace) => runtime.evaluateSource(form, namespace),
    autoSchedule: false,
  });

  active.create({ loopId: "tank/controller", initialLevel: 78, target: 68, rateHz: 8 });
  const installed = await active.install({
    loopId: "tank/controller",
    source,
    namespace: "samples.active-loop-tank",
    entry: "controller",
  });
  assert.equal(installed.version, 1);
  assert.equal(installed.controller.namespace, "samples.active-loop-tank.active.v1");

  active.command("tank/controller", "disturb", { amount: 20 });
  const before = active.inspect().world.level;
  await active.tick();
  const after = active.inspect();
  assert.equal(after.world.pump, 1);
  assert.ok(after.world.level > before, "the Hara controller responds to the disturbed world");
  assert.equal(typeof after.memory["previous-error"], "number");
});
