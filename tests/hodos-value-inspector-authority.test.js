import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Play mounts the merged Hodos Value Inspector component", async () => {
  const [integration, main, view] = await Promise.all([
    text("src/hodos/value-inspector.js"),
    text("src/main.js"),
    text("src/app/view.js"),
  ]);
  assert.match(integration, /createValueInspectorArea/);
  assert.match(integration, /registerHodosValueInspectorUi/);
  assert.match(integration, /createWorkspaceAreaHost/);
  assert.match(main, /mountHodosValueInspector\(state\)/);
  assert.match(main, /disposeHodosValueInspector\(\)/);
  assert.match(view, /data-output-tab="value"/);
  assert.match(view, /class="value-view/);
});

test("retained REPL values enter the inspector through semantic events", async () => {
  const [repl, replEvents, events, actions] = await Promise.all([
    text("src/hodos/repl.js"),
    text("src/hodos/repl-events.js"),
    text("src/app/events.js"),
    text("src/app/actions.js"),
  ]);
  assert.match(repl, /"event\/type": "repl\/inspect"/);
  assert.match(repl, /valueId: entry\.valueId/);
  assert.match(replEvents, /kind: "inspect"/);
  assert.match(events, /runtime\.inspect\(valueId\)/);
  assert.match(events, /projectInspectableValue\(inspected\.value\)/);
  assert.match(actions, /valueId: result\.valueId/);
});

test("Value Inspector interactions remain application policy", async () => {
  const [events, integration] = await Promise.all([
    text("src/app/events.js"),
    text("src/hodos/value-inspector.js"),
  ]);
  assert.match(events, /valueInspectorWorkspacePatch\(event\.detail\)/);
  assert.match(events, /navigator\?\.clipboard\?\.writeText/);
  assert.match(integration, /"event\/type": "value\/toggle"/);
  assert.match(integration, /"event\/type": "value\/copy"/);
  assert.match(integration, /abort\.abort\(\)/);
});
