import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Play pins and publishes the Hodos Workspace packages", async () => {
  const [modules, prepare, build, page] = await Promise.all([
    text(".gitmodules"),
    text("scripts/prepare-web-packages.mjs"),
    text("scripts/build-site.mjs"),
    text("index.html"),
  ]);
  assert.match(modules, /vendor\/hodos/);
  assert.match(prepare, /vendor\/hodos\/packages\/dev-ui/);
  assert.match(build, /vendor\/hodos\/packages/);
  for (const packageName of [
    "@greenways/hodos-web",
    "@greenways/hodos-workspace-ui",
    "@greenways/hodos-dev",
    "@greenways/hodos-dev-ui",
  ]) assert.match(page, new RegExp(packageName.replace("/", "\\/")));
});

test("Preview is mounted as a capability-gated HAL-shaped Hodos Workspace area", async () => {
  const [integration, presentation, main] = await Promise.all([
    text("src/hodos/preview.js"),
    text("src/app/project-presentation.js"),
    text("src/main.js"),
  ]);
  assert.match(integration, /createWorkspaceAreaHost/);
  assert.match(integration, /createPreviewArea/);
  assert.match(integration, /registerHodosDevUi/);
  assert.match(integration, /createPreviewHost/);
  assert.match(integration, /document: sourceDocument/);
  assert.match(integration, /previewEnabled\(\)/);
  assert.match(main, /disposeHodosPreview\(\)/);
  assert.match(main, /syncProjectPresentation\(\{ state, store \}\)/);
  assert.match(presentation, /mountHodosPreview\(\{ document: state\.preview, theme: state\.theme \}\)/);
});
