import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CanonicalHaraRuntime,
  CanonicalRuntimeUnavailableError,
  detectNamespace,
  hasCanonicalSupersonicHostContract
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
  (:config {:blank true}))
(defn status [graph-id]
  @(Host/call "gw.audio.supersonic" "status" [graph-id]))
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
  const source = "(ns gw.audio.supersonic\n  (:config {:blank true}))\n(def ready true)";
  const runtime = new CanonicalHaraRuntime({
    broker,
    bootstrapSources: [source]
  });

  await runtime.initialise();
  await runtime.reset();

  const bootstraps = broker.calls.filter((call) =>
    call[0] === "eval" && call[2].includes("(ns gw.audio.supersonic"));
  assert.equal(bootstraps.length, 2);
  assert.equal(runtime.currentNamespace, "user");
});

test("a failed canonical bootstrap closes the incomplete kernel", async () => {
  const broker = fakeBroker({ failSource: "gw.audio.supersonic" });
  const runtime = new CanonicalHaraRuntime({
    broker,
    bootstrapSources: ["(ns gw.audio.supersonic\n  (:config {:blank true}))"]
  });

  await assert.rejects(
    runtime.initialise(),
    (error) => error instanceof CanonicalRuntimeUnavailableError
      && error.message === "Unable to preload canonical Hara browser resources"
  );
  assert.deepEqual(broker.calls, [
    ["create", "STUDIO"],
    ["eval", "STUDIO", "(ns gw.audio.supersonic\n  (:config {:blank true}))\n\n(ns user)"],
    ["close", "STUDIO"]
  ]);
  assert.equal(runtime.started, false);
});

test("the local Supersonic HAL is bootstrap-safe and uses the v1 host contract", async () => {
  const source = await readFile(
    new URL("../src/audio/gw.audio.supersonic.hal", import.meta.url),
    "utf8"
  );
  assert.equal(hasCanonicalSupersonicHostContract(source), true);
  assert.match(source, /\(:config\s+\{[^}]*:blank\s+true[^}]*\}\)/s);
  assert.doesNotMatch(source, /\(:require|\[std\.foundation\.host/);
  for (const method of ["start", "update", "status", "stop"]) {
    assert.ok(
      source.includes(`Host/call "gw.audio.supersonic" "${method}"`),
      `missing direct Host/call for ${method}`
    );
  }
});

test("Foundation-dependent, non-blank and one-string Supersonic resources are rejected", () => {
  const foundationDependent = `(ns gw.audio.supersonic
  (:require [std.foundation.host :as host]))
(defn start [graph]
  @(host/call "gw.audio.supersonic" "start" graph))`;
  const nonBlank = `(ns gw.audio.supersonic)
(defn start [graph]
  @(Host/call "gw.audio.supersonic" "start" [graph]))
(defn update [graph-id node parameter value]
  @(Host/call "gw.audio.supersonic" "update" [graph-id node parameter value]))
(defn status [graph-id]
  @(Host/call "gw.audio.supersonic" "status" [graph-id]))
(defn stop [graph-id]
  @(Host/call "gw.audio.supersonic" "stop" [graph-id]))`;
  const legacy = `(ns gw.audio.supersonic
  (:config {:blank true}))
(defn start [graph]
  @(Host/call "gw.audio.supersonic/start" [graph]))`;
  assert.equal(hasCanonicalSupersonicHostContract(foundationDependent), false);
  assert.equal(hasCanonicalSupersonicHostContract(nonBlank), false);
  assert.equal(hasCanonicalSupersonicHostContract(legacy), false);
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
