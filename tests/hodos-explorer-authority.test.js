import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Playground mounts the merged Hodos Explorer component", async () => {
  const [integration, main, view] = await Promise.all([
    text("src/hodos/explorer.js"),
    text("src/main.js"),
    text("src/app/view.js"),
  ]);
  assert.match(integration, /createExplorerArea/);
  assert.match(integration, /registerHodosExplorerUi/);
  assert.match(integration, /createWorkspaceAreaHost/);
  assert.match(main, /mountHodosExplorer\(state\)/);
  assert.match(main, /disposeHodosExplorer\(\)/);
  assert.match(view, /<nav class="file-tree" aria-label="Workspace files"><\/nav>/);
  assert.doesNotMatch(view, /renderTree\(groupFiles\(state\.files\)\)/);
});

test("file selection and mutations enter Playground only through Explorer events", async () => {
  const [events, integration] = await Promise.all([
    text("src/app/events.js"),
    text("src/hodos/explorer.js"),
  ]);
  assert.match(events, /explorerWorkspacePatch\(event\.detail\)/);
  assert.match(events, /applyExplorerWorkspacePatch\(explorerPatch\)/);
  assert.doesNotMatch(events, /querySelectorAll\("\.tree-file"\)/);
  assert.doesNotMatch(events, /querySelector\("#new-file-button"\)\?\.addEventListener/);
  assert.doesNotMatch(events, /querySelector\("#delete-file-button"\)\?\.addEventListener/);
  assert.match(events, /prompt\("New workspace file"/);
  assert.match(events, /confirm\(`Delete \$\{patch\.path\}/);
  assert.match(events, /store\.write\(path/);
  assert.match(events, /store\.remove\(patch\.path\)/);
  for (const type of ["explorer/select", "explorer/toggle", "explorer/create", "explorer/delete"]) {
    assert.match(integration, new RegExp(`event/type\\\": \\\"${type.replace("/", "\\/")}`));
  }
  assert.match(integration, /replaceChildren/);
  assert.match(integration, /abort\.abort\(\)/);
  assert.doesNotMatch(integration, /innerHTML/);
});

test("Explorer projects explicit directories while storage remains Playground-owned", async () => {
  const [state, integration, events] = await Promise.all([
    text("src/hodos/explorer-state.js"),
    text("src/hodos/explorer.js"),
    text("src/app/events.js"),
  ]);
  assert.match(state, /kind: "directory"/);
  assert.match(state, /kind: "file"/);
  assert.match(integration, /projectExplorerEntries\(state\.files/);
  assert.doesNotMatch(integration, /store\.|WorkspaceStore|importRepository/);
  assert.match(events, /await store\.write/);
  assert.match(events, /await store\.remove/);
});
