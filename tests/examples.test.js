import assert from "node:assert/strict";
import test from "node:test";
import { loadExampleCatalog, loadExampleProject } from "../src/examples/catalog.js";

test("loads and normalises a runtime example catalog", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://playground.example/examples/index.json");
    return new Response(JSON.stringify({ projects: [{ id: "starter", title: "Starter", files: [] }] }));
  };
  try {
    const projects = await loadExampleCatalog("https://playground.example/examples/index.json");
    assert.equal(projects[0].id, "starter");
    assert.equal(projects[0].catalogUrl, "https://playground.example/examples/index.json");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loads example files relative to the project root", async () => {
  const originalFetch = globalThis.fetch;
  const bodies = new Map([
    ["https://playground.example/examples/starter/project.edn", "{:project/main starter.main}"],
    ["https://playground.example/examples/starter/src/main.hal", "(ns starter.main)\n(+ 1 2)"]
  ]);
  globalThis.fetch = async (url) => new Response(bodies.get(String(url)), { status: bodies.has(String(url)) ? 200 : 404 });
  try {
    const loaded = await loadExampleProject({
      id: "starter",
      title: "Starter",
      category: "learn",
      project: "examples/starter/project.edn",
      files: ["examples/starter/project.edn", "examples/starter/src/main.hal"],
      capabilities: ["studio/eval"],
      catalogUrl: "https://playground.example/examples/index.json"
    });
    assert.deepEqual(loaded.files.map((file) => file.path), ["project.edn", "src/main.hal"]);
    assert.equal(loaded.metadata.source, "example");
    assert.equal(loaded.workspace, "examples/starter");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
