import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertRuntimeExpectation,
  buildRuntimeReport,
  validateRuntimeValidation,
} from "../scripts/sample-validation/runtime.mjs";

const catalog = JSON.parse(await readFile(new URL("../samples/catalog.json", import.meta.url), "utf8"));

test("every catalog sample declares a bounded runtime load and smoke plan", () => {
  for (const [index, sample] of catalog.samples.entries()) {
    const plan = validateRuntimeValidation(sample, `samples[${index}] (${sample.id})`);
    assert.equal(plan.load, "full-source");
    assert.ok(plan.smokeForm.length > 0);
  }
});

test("capability samples defer only their declared effect", () => {
  const capabilitySamples = catalog.samples.filter(({ validation }) =>
    validation.mode === "host-capability" || validation.mode === "browser-capability");
  assert.deepEqual(capabilitySamples.map(({ id }) => id), ["greenways-ai", "supersonic-live"]);
  for (const sample of capabilitySamples) {
    assert.equal(sample.runtimeValidation.effect.status, "deferred");
    assert.equal(
      sample.runtimeValidation.effect.capability,
      sample.validation.hostCapability,
    );
  }
  assert.ok(catalog.samples
    .filter((sample) => !capabilitySamples.includes(sample))
    .every((sample) => sample.runtimeValidation.effect.status === "not-required"));
});

test("deferred effects cannot be smuggled into deterministic smoke forms", () => {
  const sample = structuredClone(catalog.samples.find(({ id }) => id === "greenways-ai"));
  sample.runtimeValidation.smokeForm = "(ai/generate request)";
  assert.throws(
    () => validateRuntimeValidation(sample, "greenways-ai"),
    /must not execute the deferred host\/browser effect/,
  );
});

test("runtime expectations are scalar and exact", () => {
  assert.doesNotThrow(() =>
    assertRuntimeExpectation({ type: "number", value: 42 }, 42, "answer"));
  assert.throws(() =>
    assertRuntimeExpectation({ type: "number", value: 42 }, "42", "answer"), /expected number/);
  assert.throws(() =>
    assertRuntimeExpectation({ type: "number", value: 42 }, 41, "answer"), /expected 42/);
});

test("runtime reports preserve catalog order and exact provenance", () => {
  const results = catalog.samples.map((sample) => ({
    id: sample.id,
    actual: sample.runtimeValidation.expected.value,
  }));
  const first = buildRuntimeReport(catalog, results);
  const second = buildRuntimeReport(catalog, [...results].reverse());
  assert.deepEqual(first, second);
  assert.equal(first.runtime.lockGitBlobSha, catalog.runtime.lockGitBlobSha);
  assert.equal(first.authority.commit, catalog.authority.commit);
  assert.deepEqual(first.samples.map(({ id }) => id), catalog.samples.map(({ id }) => id));
});
