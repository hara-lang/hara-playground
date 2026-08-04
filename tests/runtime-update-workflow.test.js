import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/prepare-runtime-update.yml", import.meta.url),
  "utf8"
);
const ci = await readFile(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8"
);

test("runtime updates are manual and receive only the required write permissions", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /pull-requests: write/);
  assert.doesNotMatch(workflow, /schedule:/);
});

test("the workflow verifies the immutable release before writing the lock", () => {
  assert.match(workflow, /releases\/download\/v\$VERSION/);
  assert.match(workflow, /runtime-lock\.mjs checksum/);
  assert.match(workflow, /sha256sum/);
  assert.match(workflow, /runtime-lock\.mjs create/);
  assert.match(workflow, /--supersonic/);
});

test("the generated pin is installed and fully validated before publication", () => {
  assert.match(workflow, /npm run runtime:download/);
  assert.match(workflow, /rust\/studio\/supersonic\.js/);
  assert.match(workflow, /rust\/studio\/hal\/supersonic\.hal/);
  assert.match(workflow, /npm run validate/);
  assert.match(workflow, /runtime\.lock\.json.*only tracked change|CHANGED\[0\].*runtime\.lock\.json/s);
});

test("automation opens a draft PR rather than updating main directly", () => {
  assert.match(workflow, /git switch -c/);
  assert.match(workflow, /git push -u origin/);
  assert.match(workflow, /gh pr create/);
  assert.match(workflow, /--draft/);
  assert.match(workflow, /--base main/);
});

test("generated branches explicitly dispatch and pass ordinary CI", () => {
  assert.match(ci, /workflow_dispatch:/);
  assert.match(workflow, /gh workflow run ci\.yml/);
  assert.match(workflow, /--event workflow_dispatch/);
  assert.match(workflow, /gh run watch/);
  assert.match(workflow, /--exit-status/);
});
