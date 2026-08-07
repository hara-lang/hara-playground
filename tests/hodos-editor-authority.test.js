import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Playground editor state is driven by Hodos Workspace events", async () => {
  const events = await text("src/app/events.js");
  assert.match(events, /document\.addEventListener\("hodos:workspace-event", handleHodosWorkspaceEvent\)/);
  assert.match(events, /editorWorkspacePatch\(event\.detail, state\.content\)/);
  assert.match(events, /state\.content = patch\.source/);
  assert.match(events, /applyEditorWorkspaceSelection\(patch\.selection/);
  assert.doesNotMatch(events, /function syncEditorState\(/);
  assert.doesNotMatch(events, /editor\.addEventListener\("input", \(\) => \{\n\s*state\.content/);
});

test("structural edits re-enter the authoritative semantic stream", async () => {
  const events = await text("src/app/events.js");
  assert.match(events, /editor\.dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\)/);
  assert.match(events, /editor\.dispatchEvent\(new Event\("select", \{ bubbles: true \}\)\)/);
});

test("runtime effects update the mounted Hodos Preview instead of the removed compatibility iframe", async () => {
  const [events, preview] = await Promise.all([
    text("src/app/events.js"),
    text("src/hodos/preview.js"),
  ]);
  assert.match(events, /updateHodosPreview\(\{ document: state\.preview, theme: state\.theme \}\)/);
  assert.doesNotMatch(events, /preview\.srcdoc = state\.preview/);
  assert.match(preview, /export function updateHodosPreview/);
  assert.match(preview, /areaHost\.update\(previewArea\(sourceDocument, theme\)\)/);
});
