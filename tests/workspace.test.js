import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVE_WORKSPACE_KEY, MemoryBackend, WorkspaceStore, normalizePath } from "../src/workspace/store.js";

test("workspace stores, lists and removes files", async () => {
  const store = new WorkspaceStore({ backend: new MemoryBackend(), workspace: "test/project" });
  await store.write("/src\\app/core.hal", "(ns app.core)");
  assert.deepEqual(await store.list(), ["src/app/core.hal"]);
  assert.equal(await store.read("src/app/core.hal"), "(ns app.core)");
  await store.remove("src/app/core.hal");
  assert.deepEqual(await store.list(), []);
});

test("replace switches the full workspace contents", async () => {
  const store = new WorkspaceStore({ backend: new MemoryBackend(), workspace: "test/project" });
  await store.write("old.txt", "old");
  await store.replace([{ path: "new.txt", content: "new" }], { source: "github" });
  assert.deepEqual(await store.list(), ["new.txt"]);
  assert.equal(store.metadata.source, "github");
});

test("path normalization removes leading and duplicate separators", () => {
  assert.equal(normalizePath("//src///app\\core.hal"), "src/app/core.hal");
});


class SettingsStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test("active workspaces and metadata survive a reload", () => {
  const settingsStorage = new SettingsStorage();
  const backend = new MemoryBackend();
  const first = new WorkspaceStore({ backend, settingsStorage });
  first.use("github.com/hara-lang/example/main", {
    source: "github", owner: "hara-lang", repository: "example", branch: "main"
  });
  assert.equal(settingsStorage.getItem(ACTIVE_WORKSPACE_KEY), "github.com/hara-lang/example/main");

  const reloaded = new WorkspaceStore({ backend, settingsStorage });
  assert.equal(reloaded.workspace, "github.com/hara-lang/example/main");
  assert.equal(reloaded.metadata.repository, "example");
  assert.equal(reloaded.metadata.source, "github");
});
