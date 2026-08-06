import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pages = await readFile(
  new URL("../.github/workflows/pages.yml", import.meta.url),
  "utf8"
);
const runtimeCi = await readFile(
  new URL("../.github/workflows/pages-runtime-ci.yml", import.meta.url),
  "utf8"
);

const pinnedRef = (workflow, name) =>
  workflow.match(new RegExp(`${name}:\\s*([0-9a-f]{40})`))?.[1] ?? null;

function assertVerifiedSourceBuild(workflow) {
  assert.match(workflow, /repository:\s*hara-lang\/hara/);
  assert.match(workflow, /ref:\s*\$\{\{\s*env\.HARA_RUNTIME_SOURCE_REF\s*\}\}/);
  assert.match(workflow, /path:\s*\.hara-runtime-source/);
  assert.match(workflow, /repository:\s*hara-lang\/hara-ui/);
  assert.match(workflow, /ref:\s*\$\{\{\s*env\.HARA_UI_SOURCE_REF\s*\}\}/);
  assert.match(workflow, /path:\s*\.hara-runtime-source\/website\/vendor\/hara-ui/);
  assert.doesNotMatch(workflow, /submodules:\s*true/);
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.match(workflow, /ACTUAL_UI_REF=/);
  assert.match(workflow, /targets:\s*wasm32-unknown-unknown/);
  assert.match(workflow, /scripts\/build-studio-runtime ci/);
  assert.match(workflow, /PIPESTATUS\[0\]/);
  assert.match(workflow, /Hara Studio runtime build failed/);
  assert.match(workflow, /sha256sum -c/);
  assert.match(workflow, /hara-studio-runtime-\*\.tar\.gz\.sha256/);
  assert.match(workflow, /rust\/hta-shared-worker\.js/);
  assert.match(workflow, /rust\/host\/broker\.js/);
  assert.doesNotMatch(workflow, /rust\/host\/client\.js/);
  assert.match(workflow, /rust\/host\/services\.js/);
  assert.match(workflow, /rust\/studio\/supersonic\.js/);
  assert.match(workflow, /rust\/studio\/hal\/supersonic\.hal/);
}

test("Pages uses exact verified Hara and Hara UI source revisions", () => {
  const hara = "5a81f6bb2146cc1f32baf1ab45370913d960d3c2";
  const haraUi = "145a9acc728f71f9aa215868a22774ea07d466d4";

  assert.equal(pinnedRef(pages, "HARA_RUNTIME_SOURCE_REF"), hara);
  assert.equal(pinnedRef(runtimeCi, "HARA_RUNTIME_SOURCE_REF"), hara);
  assert.equal(pinnedRef(pages, "HARA_UI_SOURCE_REF"), haraUi);
  assert.equal(pinnedRef(runtimeCi, "HARA_UI_SOURCE_REF"), haraUi);
  assertVerifiedSourceBuild(pages);
  assertVerifiedSourceBuild(runtimeCi);
  assert.doesNotMatch(pages, /npm run runtime:download/);
});

test("the source-built runtime path is exercised with read-only pull-request permissions", () => {
  assert.match(runtimeCi, /pull_request:/);
  assert.match(runtimeCi, /permissions:\s*\n\s*contents:\s*read/);
  assert.doesNotMatch(runtimeCi, /pages:\s*write/);
  assert.doesNotMatch(runtimeCi, /id-token:\s*write/);
  assert.match(runtimeCi, /npm run build/);
  assert.match(runtimeCi, /dist\/runtime\/rust\/host\/broker\.js/);
  assert.match(runtimeCi, /node --check dist\/runtime\/rust\/host\/services\.js/);
  assert.match(runtimeCi, /node --check dist\/runtime\/rust\/studio\/supersonic\.js/);
  assert.match(runtimeCi, /gw\.audio\.supersonic\/start/);
  assert.match(runtimeCi, /\(ns gw\.audio\.supersonic/);
  assert.match(runtimeCi, /cmp src\/audio\/integration\.js dist\/src\/audio\/integration\.js/);
});

test("the production workflow publishes only after installing the complete runtime", () => {
  assert.match(pages, /npm run build/);
  assert.match(pages, /actions\/upload-pages-artifact@v3/);
  assert.match(pages, /actions\/deploy-pages@v4/);
  assert.match(pages, /Verify public Supersonic deployment/);
});
