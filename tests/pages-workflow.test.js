import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/pages.yml", import.meta.url),
  "utf8"
);

test("Pages uses an exact verified Hara source revision while the release archive is incomplete", () => {
  const sourceRef = workflow.match(/HARA_RUNTIME_SOURCE_REF:\s*([0-9a-f]{40})/)?.[1];

  assert.equal(sourceRef, "5a81f6bb2146cc1f32baf1ab45370913d960d3c2");
  assert.match(workflow, /repository:\s*hara-lang\/hara/);
  assert.match(workflow, /ref:\s*\$\{\{\s*env\.HARA_RUNTIME_SOURCE_REF\s*\}\}/);
  assert.match(workflow, /path:\s*\.hara-runtime-source/);
  assert.match(workflow, /submodules:\s*true/);
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.doesNotMatch(workflow, /npm run runtime:download/);
});

test("Pages builds and validates the complete browser and Supersonic runtime before publishing", () => {
  assert.match(workflow, /targets:\s*wasm32-unknown-unknown/);
  assert.match(workflow, /scripts\/build-studio-runtime ci/);
  assert.match(workflow, /sha256sum -c/);
  assert.match(workflow, /rust\/hta-shared-worker\.js/);
  assert.match(workflow, /rust\/host\/services\.js/);
  assert.match(workflow, /rust\/studio\/supersonic\.js/);
  assert.match(workflow, /rust\/studio\/hal\/supersonic\.hal/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
