import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Play registers and installs the bounded Hodos Graph consumer", async () => {
  const [shell, main, styles, consumer, manifest] = await Promise.all([
    read("../src/hodos/workspace-shell.js"),
    read("../src/main.js"),
    read("../src/styles.css"),
    read("../src/hodos/graph-consumer.js"),
    read("../samples/hodos-graph/workspace.edn"),
  ]);
  assert.match(shell, /registerHodosGraphDomUi/);
  assert.match(shell, /hodos\.2d\/graph/);
  assert.match(main, /installHodosGraphConsumer/);
  assert.match(styles, /2d-ui\/src\/graph\.css/);
  assert.match(consumer, /graphWorkspacePatch/);
  assert.match(consumer, /selectWorkspaceGraph/);
  assert.match(consumer, /moveWorkspaceGraphNode/);
  assert.match(manifest, /hodos\.2d\/graph/);
  assert.match(manifest, /graph\/move-node/);
  assert.equal(manifest.includes("javascript"), false);
  assert.equal(manifest.includes("callback"), false);
});
