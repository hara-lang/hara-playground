import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Play pins the merged Hodos Editor boundary", async () => {
  const [modules, integration, main] = await Promise.all([
    text(".gitmodules"),
    text("src/hodos/editor.js"),
    text("src/main.js"),
  ]);
  assert.match(modules, /vendor\/hodos/);
  assert.match(integration, /createEditorArea/);
  assert.match(integration, /registerHodosEditorUi/);
  assert.match(integration, /createWorkspaceAreaHost/);
  assert.match(main, /mountHodosEditor/);
  assert.match(main, /disposeHodosEditor/);
});

test("Hodos Editor projects source and emits semantic change and selection events", async () => {
  const integration = await text("src/hodos/editor.js");
  assert.match(integration, /"event\/type": "editor\/change"/);
  assert.match(integration, /"event\/type": "editor\/selection"/);
  assert.match(integration, /source: editor\.value/);
  assert.match(integration, /selection: editorSelection\(editor\)/);
  assert.match(integration, /new CustomEvent\("hodos:workspace-event"/);
});

test("Hodos Editor retains Play behavior as a bounded compatibility host", async () => {
  const integration = await text("src/hodos/editor.js");
  assert.match(integration, /querySelector\?\.\("#editor"\)/);
  assert.match(integration, /editor\.readOnly = Boolean\(next\.readOnly\)/);
  assert.match(integration, /editor\.setSelectionRange/);
  assert.match(integration, /abort\.abort\(\)/);
});
