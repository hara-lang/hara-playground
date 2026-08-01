import test from "node:test";
import assert from "node:assert/strict";
import { HaraRuntime, formatValue } from "../src/runtime/evaluator.js";

test("runtime evaluates arithmetic and preserves definitions", async () => {
  const runtime = new HaraRuntime();
  assert.equal(await runtime.evaluateSource("(+ 1 2 3)"), 6);
  await runtime.evaluateSource("(def answer 42)");
  assert.equal(await runtime.evaluateSource("answer"), 42);
});

test("runtime defines closures and variadic functions", async () => {
  const runtime = new HaraRuntime();
  await runtime.evaluateSource("(defn add [a b] (+ a b))");
  assert.equal(await runtime.evaluateSource("(add 8 5)"), 13);
  await runtime.evaluateSource("(defn total [& xs] (apply + xs))");
  assert.equal(await runtime.evaluateSource("(total 1 2 3 4)"), 10);
});

test("runtime tracks namespaces", async () => {
  const runtime = new HaraRuntime();
  await runtime.evaluateSource("(ns alpha) (def value 9)");
  await runtime.evaluateSource("(ns beta)");
  assert.equal(await runtime.evaluateSource("alpha/value"), 9);
  assert.throws(() => runtime.resolveSymbol("value"), /Unable to resolve/);
});

test("runtime emits HTA render effects", async () => {
  const effects = [];
  const runtime = new HaraRuntime({ onEffect: (effect) => effects.push(effect) });
  const result = await runtime.evaluateSource('(hta/render [:h1 {:class "hero"} "Hello"])');
  assert.equal(result.type, "render");
  assert.deepEqual(effects[0].tree, [":h1", { class: "hero" }, "Hello"]);
  assert.equal(formatValue(result), "#<effect render>");
});

test("let and conditionals work", async () => {
  const runtime = new HaraRuntime();
  const result = await runtime.evaluateSource("(let [x 4 y 5] (if (< x y) (+ x y) 0))");
  assert.equal(result, 9);
});

test("runtime can restore the configured REPL namespace after project loading", async () => {
  const runtime = new HaraRuntime();
  await runtime.evaluateSource("(ns app.core) (def x 1)");
  await runtime.evaluateSource("(ns app.math) (def y 2)");
  assert.equal(runtime.setNamespace("app.core"), "app.core");
  assert.equal(await runtime.evaluateSource("x", runtime.currentNamespace), 1);
});
