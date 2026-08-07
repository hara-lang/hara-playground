import assert from "node:assert/strict";
import test from "node:test";
import {
  createExplorerState,
  explorerDirectoryPaths,
  filterExplorerState,
  normalizeExplorerPath,
  projectExplorerEntries,
  toggleExplorerDirectory,
  visibleExplorerExpandedPaths,
} from "../src/hodos/explorer-state.js";

test("Explorer projects explicit directory and file entries", () => {
  const entries = projectExplorerEntries([
    "project.edn",
    "src/app/main.hal",
    "src/lib.hal",
  ], { selectedPath: "src/app/main.hal", dirty: true });
  assert.deepEqual(entries.map(({ path, kind, status }) => ({ path, kind, status })), [
    { path: "src", kind: "directory", status: "clean" },
    { path: "src/app", kind: "directory", status: "clean" },
    { path: "project.edn", kind: "file", status: "clean" },
    { path: "src/app/main.hal", kind: "file", status: "modified" },
    { path: "src/lib.hal", kind: "file", status: "clean" },
  ]);
  assert.deepEqual(explorerDirectoryPaths(["src/app/main.hal", "project.edn"]), ["src", "src/app"]);
});

test("Explorer expansion defaults open and toggles deterministically", () => {
  const entries = projectExplorerEntries(["src/app/main.hal", "src/lib.hal"]);
  const initial = createExplorerState();
  assert.deepEqual(visibleExplorerExpandedPaths(initial, entries), ["src", "src/app"]);
  const toggled = toggleExplorerDirectory(initial, "src/app", entries);
  assert.deepEqual(toggled.expanded, ["src"]);
  const filtered = filterExplorerState(toggled, "main");
  assert.equal(filtered.query, "main");
  assert.deepEqual(filtered.expanded, ["src"]);
});

test("Explorer rejects non-canonical paths and missing directories", () => {
  assert.throws(() => normalizeExplorerPath("/src/main.hal"), /canonical relative/);
  assert.throws(() => normalizeExplorerPath("src/../main.hal"), /parent segments/);
  assert.throws(() => normalizeExplorerPath("src\\main.hal"), /canonical relative/);
  assert.throws(() => createExplorerState({ expanded: "src" }), /null or an array/);
  const entries = projectExplorerEntries(["src/main.hal"]);
  assert.throws(() => toggleExplorerDirectory(createExplorerState(), "missing", entries), /not present/);
});
