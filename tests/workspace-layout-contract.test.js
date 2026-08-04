import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the application installs the workspace layout controller", async () => {
  const main = await read("src/main.js");
  assert.match(main, /installWorkspaceLayout/);
  assert.match(main, /workspace-layout\.js/);
});

test("mobile exposes files, code, canvas, repl and learning surfaces", async () => {
  const controller = await read("src/app/workspace-layout.js");
  for (const marker of ["Files", "Code", "Canvas", "REPL", "Learn"]) {
    assert.ok(controller.includes(marker), `missing mobile surface ${marker}`);
  }
  assert.match(controller, /mobile-instarepl/);
  assert.match(controller, /setOutputMode/);
  assert.match(controller, /hara-host-resize/);
});

test("desktop workbench has accessible persistent splitters", async () => {
  const controller = await read("src/app/workspace-layout.js");
  const styles = await read("src/styles/workspace-layout.css");
  assert.match(controller, /role", "separator"/);
  assert.match(controller, /ArrowLeft/);
  assert.match(controller, /dblclick/);
  assert.match(styles, /--project-panel-width/);
  assert.match(styles, /--output-panel-width/);
  assert.match(styles, /cursor: col-resize/);
});

test("the final CSS layer overrides the old mobile panel hiding rules", async () => {
  const imports = await read("src/styles.css");
  const styles = await read("src/styles/workspace-layout.css");
  assert.match(imports, /workspace-layout\.css/);
  assert.match(styles, /data-mobile-surface="preview"/);
  assert.match(styles, /data-mobile-surface="repl"/);
  assert.match(styles, /\.output-panel/);
  assert.match(styles, /\.instarepl-rail \{ display: none !important; \}/);
});
