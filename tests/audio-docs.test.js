import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the README exposes the featured Supersonic project and authoring guide", async () => {
  const readme = await read("README.md");
  assert.match(readme, /samples\/supersonic-live/);
  assert.match(readme, /docs\/audio-live-coding\.md/);
  assert.match(readme, /:audio\/playback/);
  assert.match(readme, /sonic\/update/);
});

test("the audio guide covers declaration, graph, gesture and lifecycle boundaries", async () => {
  const guide = await read("docs/audio-live-coding.md");
  for (const marker of [
    ":audio/playback",
    "gw.audio.supersonic/start",
    "(sonic/update graph-id node-id parameter value)",
    "AudioContext",
    "explicit user gesture",
    "Every kernel boot is a new audio authority boundary",
    "rust/studio/supersonic.js",
    "rust/studio/hal/supersonic.hal"
  ]) {
    assert.ok(guide.includes(marker), `missing audio guide contract: ${marker}`);
  }
});

test("runtime and worker docs describe the correlated page host bridge", async () => {
  const runtime = await read("docs/runtime-adapter.md");
  const protocol = await read("docs/worker-protocol.md");
  assert.match(runtime, /plain-message Supersonic proxy/);
  assert.match(runtime, /audio\/playback/);
  assert.match(protocol, /"type": "host-call"/);
  assert.match(protocol, /"type": "host-result"/);
  assert.match(protocol, /"type": "host-exception"/);
  assert.match(protocol, /requestId/);
});

test("the security model keeps browser audio resources outside the worker", async () => {
  const security = await read("docs/security.md");
  assert.match(security, /AudioNode/);
  assert.match(security, /presses Play/);
  assert.match(security, /cannot inherit the\s+first project's Play gesture/);
});
