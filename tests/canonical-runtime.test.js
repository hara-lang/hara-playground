import test from "node:test";
import assert from "node:assert/strict";
import { CanonicalHaraRuntime, detectNamespace } from "../src/runtime/canonical.js";

function fakeBroker() {
  const calls = [];
  return {
    calls,
    async create(name) { calls.push(["create", name]); },
    async close(name) { calls.push(["close", name]); },
    async eval(name, source) { calls.push(["eval", name, source]); return 42; }
  };
}

test("canonical adapter owns a persistent browser kernel", async () => {
  const broker = fakeBroker();
  const runtime = new CanonicalHaraRuntime({ broker });
  await runtime.initialise();
  assert.equal(await runtime.evaluateSource("(+ 40 2)", "app.core"), 42);
  assert.deepEqual(broker.calls, [
    ["create", "STUDIO"],
    ["eval", "STUDIO", "(ns app.core)\n(+ 40 2)"]
  ]);
  assert.equal(runtime.currentNamespace, "app.core");
});

test("canonical adapter respects namespace declarations and resets kernels", async () => {
  const broker = fakeBroker();
  const runtime = new CanonicalHaraRuntime({ broker });
  await runtime.initialise();
  await runtime.evaluateSource("(ns app.math)\n(def x 1)", "user");
  assert.equal(runtime.currentNamespace, "app.math");
  await runtime.reset();
  assert.equal(runtime.currentNamespace, "user");
  assert.deepEqual(broker.calls.slice(-2), [["close", "STUDIO"], ["create", "STUDIO"]]);
});

test("detectNamespace reads HAL namespace forms", () => {
  assert.equal(detectNamespace("; comment\n(ns hara.demo)"), "hara.demo");
  assert.equal(detectNamespace("(+ 1 2)"), null);
});
