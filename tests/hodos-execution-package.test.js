import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const MODEL_EXPORTS = Object.freeze([
  "createExecutionArea",
  "createExecutionState",
  "ingestExecutionEvidence",
  "selectExecutionState",
  "resetExecutionState",
]);

const UI_EXPORTS = Object.freeze([
  "registerHodosExecutionDomUi",
  "createExecutionDomHost",
]);

test("the pinned Hodos graph exposes the merged Execution model and DOM host", async () => {
  const [modules, modelIndex, uiIndex] = await Promise.all([
    read(".gitmodules"),
    read("vendor/hodos/packages/dev/src/index.js"),
    read("vendor/hodos/packages/dev-ui/src/index.js"),
  ]);

  assert.match(modules, /path = vendor\/hodos/);
  assert.match(modules, /github\.com\/greenways-ai\/hodos\.git/);

  for (const name of MODEL_EXPORTS) {
    assert.match(modelIndex, new RegExp(`\\b${name}\\b`), `missing Hodos Dev export ${name}`);
  }
  for (const name of UI_EXPORTS) {
    assert.match(uiIndex, new RegExp(`\\b${name}\\b`), `missing Hodos Dev UI export ${name}`);
  }

  await access(new URL("../vendor/hodos/packages/dev/src/execution.js", import.meta.url));
  await access(new URL("../vendor/hodos/packages/dev-ui/src/execution-dom-host.js", import.meta.url));
  await access(new URL("../vendor/hodos/packages/dev-ui/src/execution.css", import.meta.url));
});

test("the browser import map reuses the existing Hodos aliases", async () => {
  const html = await read("index.html");
  const importMapSource = html.match(/<script type="importmap">\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(importMapSource, "Play must expose a browser import map");
  const importMap = JSON.parse(importMapSource);

  assert.equal(
    importMap.imports["@greenways/hodos-dev"],
    "./vendor/hodos/packages/dev/src/index.js",
  );
  assert.equal(
    importMap.imports["@greenways/hodos-dev-ui"],
    "./vendor/hodos/packages/dev-ui/src/index.js",
  );
  assert.equal((html.match(/"@greenways\/hodos-dev"/g) ?? []).length, 1);
  assert.equal((html.match(/"@greenways\/hodos-dev-ui"/g) ?? []).length, 1);
});

test("package preparation and static publication require the Execution stylesheet", async () => {
  const [prepare, build] = await Promise.all([
    read("scripts/prepare-web-packages.mjs"),
    read("scripts/build-site.mjs"),
  ]);

  assert.match(prepare, /vendor\/hodos\/packages\/dev\/src\/index\.js/);
  assert.match(prepare, /vendor\/hodos\/packages\/dev-ui\/src\/index\.js/);
  assert.match(prepare, /vendor\/hodos\/packages\/dev-ui\/src\/execution\.css/);
  assert.match(build, /vendor\/hodos\/packages/);
  assert.match(build, /packages\/dev-ui\/src\/execution\.css/);
  assert.match(build, /missing packages\/dev-ui\/src\/execution\.css/);
});
