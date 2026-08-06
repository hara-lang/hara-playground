import test from "node:test";
import assert from "node:assert/strict";
import {
  CanonicalHaraRuntime,
  CanonicalRuntimeUnavailableError,
  detectNamespace
} from "../src/runtime/canonical.js";

function fakeBroker({ failSource = null } = {}) {
  const calls = [];
  return {
    calls,
    async create(name) { calls.push(["create", name]); },
    async close(name) { calls.push(["close", name]); },
    async eval(name, source) {
      calls.push(["eval", name, source]);
      if (failSource && source.includes(failSource)) throw new Error(`failed:${failSource}`);
      return 42;
    }
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

test("canonical adapter preloads browser HAL namespaces before project code", async () => {
  const broker = fakeBroker();
  const supersonic = `(ns gw.audio.supersonic
  (:require [std.foundation.host :as host]))
(defn status [graph-id] graph-id)
`;
  const runtime = new CanonicalHaraRuntime({
    broker,
    bootstrapSources: [{ namespace: "gw.audio.supersonic", source: supersonic }]
  });

  await runtime.initialise();
  await runtime.evaluateSource(
    `(ns app.audio
  (:require [gw.audio.supersonic :as sonic]))
(sonic/status "graph")`,
    "user"
  );

  assert.deepEqual(broker.calls, [
    ["create", "STUDIO"],
    ["eval", "STUDIO", `${supersonic.trim()}\n\n(ns user)`],
    [
      "eval",
      "STUDIO",
      `(ns app.audio
  (:require [gw.audio.supersonic :as sonic]))
(sonic/status "graph")`
    ]
  ]);
  assert.equal(runtime.currentNamespace, "app.audio");
});

test("canonical resource bootstrap repeats after a kernel reset", async () => {
  const broker = fakeBroker();
  const source = "(ns gw.audio.supersonic)\n(def ready true)";
  const runtime = new CanonicalHaraRuntime({
    broker,
    bootstrapSources: [source]
  });

  await runtime.initialise();
  await runtime.reset();

  const bootstraps = broker.calls.filter((call) =>
    call[0] === "eval" && call[2].includes("(ns gw.audio.supersonic)"));
  assert.equal(bootstraps.length, 2);
  assert.equal(runtime.currentNamespace, "user");
});

test("a failed canonical bootstrap closes the incomplete kernel", async () => {
  const broker = fakeBroker({ failSource: "gw.audio.supersonic" });
  const runtime = new CanonicalHaraRuntime({
    broker,
    bootstrapSources: ["(ns gw.audio.supersonic)"]
  });

  await assert.rejects(
    runtime.initialise(),
    (error) => error instanceof CanonicalRuntimeUnavailableError
      && error.message === "Unable to preload canonical Hara browser resources"
  );
  assert.deepEqual(broker.calls, [
    ["create", "STUDIO"],
    ["eval", "STUDIO", "(ns gw.audio.supersonic)\n\n(ns user)"],
    ["close", "STUDIO"]
  ]);
  assert.equal(runtime.started, false);
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
