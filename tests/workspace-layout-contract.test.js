import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the application mounts the recursive Hodos Workspace shell", async () => {
  const main = await read("src/main.js");
  const shell = await read("src/hodos/workspace-shell.js");
  assert.match(main, /mountHodosWorkspaceShell/);
  assert.match(main, /disposeHodosWorkspaceShell/);
  assert.doesNotMatch(main, /installWorkspaceLayout/);
  assert.match(shell, /createWorkspaceShellHost/);
  assert.match(shell, /workspace\/area-select|hodos:workspace-event/);
});

test("compact mode exposes files, code, canvas, audio, repl and learning surfaces", async () => {
  const state = await read("src/hodos/workspace-shell-state.js");
  const assist = await read("src/app/workspace-assist.js");
  for (const marker of ["Files", "Code", "Canvas", "Audio", "REPL", "Learn"]) {
    assert.ok(state.includes(marker), `missing responsive surface ${marker}`);
  }
  assert.match(assist, /mobile-instarepl/);
  assert.match(state, /responsive\/surfaces/);
});

test("the Hodos package owns accessible recursive splitters", async () => {
  const shell = await read("vendor/hodos/packages/workspace-ui/src/shell.js");
  const styles = await read("vendor/hodos/packages/workspace-ui/src/shell.css");
  assert.match(shell, /role", "separator"/);
  assert.match(shell, /ArrowLeft/);
  assert.match(shell, /pointerdown/);
  assert.match(styles, /cursor: col-resize/);
  assert.match(styles, /cursor: row-resize/);
});

test("the final CSS layers adapt Hodos compact surfaces and dynamic Audio", async () => {
  const imports = await read("src/styles.css");
  const workspaceStyles = await read("src/styles/workspace-layout.css");
  const audioStyles = await read("src/styles/mobile-audio.css");
  assert.match(imports, /workspace-ui\/src\/shell\.css/);
  assert.match(imports, /workspace-layout\.css[\s\S]*mobile-audio\.css/);
  assert.match(workspaceStyles, /hodos-workspace-dock/);
  assert.match(workspaceStyles, /data-mobile-mode="learn"/);
  assert.match(audioStyles, /data-mobile-surface="audio"/);
  assert.match(audioStyles, /repeat\(6/);
  assert.match(workspaceStyles, /\.output-panel/);
  assert.match(workspaceStyles, /\.instarepl-rail \{ display: none !important; \}/);
});
