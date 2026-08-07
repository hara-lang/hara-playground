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
  assert.match(workflow, /samples\/supersonic-live\/\*\*/);
  assert.match(workflow, /scripts\/verify-supersonic-project-open\.mjs/);
  assert.match(workflow, /runtime\.lock\.json/);
  assert.match(workflow, /scripts\/install-pinned-runtime/);
  assert.doesNotMatch(workflow, /scripts\/verify-live-supersonic\.mjs/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /contents: write/);
});

test("the browser toolchain and Hara runtime are pinned without altering package metadata", async () => {
  const workflow = await read(".github/workflows/browser-audio-ci.yml");
  assert.match(workflow, /playwright@1\.53\.2/);
  assert.match(workflow, /--no-save/);
  assert.match(workflow, /--package-lock=false/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /npm run runtime:download/);
  assert.match(workflow, /checksum-verified Hara Studio runtime/i);
  assert.match(workflow, /verify-browser-audio\.mjs/);
  assert.match(workflow, /verify-supersonic-project-open\.mjs/);
  assert.doesNotMatch(workflow, /verify-live-supersonic\.mjs/);
  assert.doesNotMatch(workflow, /run-browser-audio-test\.mjs/);
});

test("browser runner names do not match Node's default test patterns", async () => {
  const workflow = await read(".github/workflows/browser-audio-ci.yml");
  const paths = [...workflow.matchAll(/node (scripts\/[A-Za-z0-9_.-]+\.mjs)/g)]
    .map((match) => match[1]);
  assert.deepEqual(paths, [
    "scripts/verify-browser-audio.mjs",
    "scripts/verify-supersonic-project-open.mjs"
  ]);
  for (const path of paths) {
    assert.doesNotMatch(path, /(?:^|[\/_-])test(?:[._-]|$)|\.test\./i);
  }
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

test("the isolated browser runner serves only normalized repository paths", async () => {
  const runner = await read("scripts/verify-browser-audio.mjs");
  assert.match(runner, /decodeURIComponent/);
  assert.match(runner, /unsafe request path/);
  assert.match(runner, /request escaped repository root/);
  assert.match(runner, /x-content-type-options/);
});

test("the full Playground check opens the real sample and detects render-loop starvation", async () => {
  const runner = await read("scripts/verify-supersonic-project-open.mjs");
  for (const marker of [
    "samples/supersonic-live",
    "api.github.com",
    "raw.githubusercontent.com",
    "page.route",
    "__haraQueuedMicrotasks",
    "requestAnimationFrame",
    "page.on(\"crash\"",
    "#editor",
    "[data-output-tab=\"audio\"]",
    "audio/playback",
    "workspaceManifestStatus",
    "workspace.edn"
  ]) {
    assert.ok(runner.includes(marker), `full project runner is missing ${marker}`);
  }
  assert.match(runner, /url\.searchParams\.set\("path", sampleRoot\)/);
  assert.match(runner, /heartbeat\.after - heartbeat\.before < 10/);
  assert.match(runner, /finalMicrotasks - audioSurface\.queuedMicrotasks < 10/);
  assert.match(runner, /Supersonic Workspace shell diagnostic/);
});

test("the production smoke requires graph publication, Play, live update and Stop", async () => {
  const pages = await read(".github/workflows/pages.yml");
  const runner = await read("scripts/verify-live-supersonic.mjs");
  assert.match(pages, /node scripts\/verify-live-supersonic\.mjs/);
  assert.match(pages, /HARA_PLAYGROUND_URL:\s*\$\{\{ needs\.deploy\.outputs\.page_url \}\}/);
  for (const marker of [
    "samples/supersonic-live",
    "#audio-play-button",
    "Glass Signal",
    "#audio-stop-button",
    "data-audio-parameter=\"tempo\"",
    "requestAnimationFrame",
    "page.on(\"crash\"",
    "pageerror",
    "requestfailed"
  ]) {
    assert.ok(runner.includes(marker), `public smoke is missing ${marker}`);
  }
  assert.match(runner, /element\.value = "138"/);
  assert.match(runner, /live tempo edit stopped playback/);
  assert.match(runner, /Verified the public Supersonic project/);
});
