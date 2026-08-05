import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIO_OBSERVER_OPTIONS,
  reconcileWithoutObservation,
  setTextContentIfChanged
} from "../src/audio/dom-sync.js";

test("Audio reconciliation disconnects before writing and reconnects afterward", () => {
  const calls = [];
  const observer = {
    disconnect() { calls.push("disconnect"); },
    observe(target, options) { calls.push(["observe", target, options]); }
  };
  const target = { id: "app" };

  const value = reconcileWithoutObservation(observer, target, () => {
    calls.push("reconcile");
    return 42;
  });

  assert.equal(value, 42);
  assert.deepEqual(calls, [
    "disconnect",
    "reconcile",
    ["observe", target, AUDIO_OBSERVER_OPTIONS]
  ]);
});

test("Audio reconciliation restores observation after a rendering exception", () => {
  const calls = [];
  const observer = {
    disconnect() { calls.push("disconnect"); },
    observe(target, options) { calls.push(["observe", target, options]); }
  };
  const target = { id: "app" };

  assert.throws(
    () => reconcileWithoutObservation(observer, target, () => {
      calls.push("reconcile");
      throw new Error("render failed");
    }),
    /render failed/
  );
  assert.deepEqual(calls, [
    "disconnect",
    "reconcile",
    ["observe", target, AUDIO_OBSERVER_OPTIONS]
  ]);
});

test("preview mode text is not replaced when it is already current", () => {
  let writes = 0;
  let value = "kernel effects";
  const element = {
    get textContent() { return value; },
    set textContent(next) {
      writes += 1;
      value = next;
    }
  };

  assert.equal(setTextContentIfChanged(element, "kernel effects"), false);
  assert.equal(writes, 0);
  assert.equal(setTextContentIfChanged(element, "audio/playback"), true);
  assert.equal(writes, 1);
  assert.equal(value, "audio/playback");
  assert.equal(setTextContentIfChanged(element, "audio/playback"), false);
  assert.equal(writes, 1);
});
