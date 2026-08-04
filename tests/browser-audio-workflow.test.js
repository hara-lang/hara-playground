import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("browser audio CI is path-scoped, read-only and manually runnable", async () => {
  const workflow = await read(".github/workflows/browser-audio-ci.yml");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /src\/audio\/\*\*/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /contents: write/);
});

test("the browser toolchain is pinned and does not alter package metadata", async () => {
  const workflow = await read(".github/workflows/browser-audio-ci.yml");
  assert.match(workflow, /playwright@1\.53\.2/);
  assert.match(workflow, /--no-save/);
  assert.match(workflow, /--package-lock=false/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /verify-browser-audio\.mjs/);
  assert.doesNotMatch(workflow, /run-browser-audio-test\.mjs/);
});

test("the browser runner name does not match Node's default test patterns", async () => {
  const workflow = await read(".github/workflows/browser-audio-ci.yml");
  const path = workflow.match(/node (scripts\/[A-Za-z0-9_.-]+\.mjs)/)?.[1];
  assert.equal(path, "scripts/verify-browser-audio.mjs");
  assert.doesNotMatch(path, /(?:^|[\/_-])test(?:[._-]|$)|\.test\./i);
});

test("the fixture prepares silently and unlocks audio only from a click", async () => {
  const fixture = await read("tests/browser/supersonic-audio.html");
  assert.match(fixture, /await provider\.start\(graph\)/);
  assert.match(fixture, /preparedSilently: engine\.context === null/);
  assert.match(fixture, /#authorize/);
  assert.match(fixture, /addEventListener\("click"/);
  assert.match(fixture, /await engine\.authorize\(\)/);
  assert.match(fixture, /provider\.update\(graphId, "transport", "playing", true\)/);
});

test("the real-browser result covers clock continuity and authority revocation", async () => {
  const fixture = await read("tests/browser/supersonic-audio.html");
  const runner = await read("scripts/verify-browser-audio.mjs");
  for (const marker of [
    "timerPreserved",
    "phasePreserved",
    "clockAdvanced",
    "revisionAdvanced",
    "paused",
    "contextRevoked"
  ]) {
    assert.ok(fixture.includes(marker), `fixture does not report ${marker}`);
    assert.ok(runner.includes(marker), `runner does not require ${marker}`);
  }
  assert.match(runner, /--autoplay-policy=user-gesture-required/);
  assert.match(runner, /contextRunning/);
  assert.match(runner, /pageErrors/);
  assert.match(runner, /consoleErrors/);
});

test("the browser runner serves only normalized repository paths", async () => {
  const runner = await read("scripts/verify-browser-audio.mjs");
  assert.match(runner, /decodeURIComponent/);
  assert.match(runner, /unsafe request path/);
  assert.match(runner, /request escaped repository root/);
  assert.match(runner, /x-content-type-options/);
});
