import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKSPACE_MANIFEST_PATH,
  evaluateWorkspaceManifest,
  loadWorkspaceManifest,
  plainWorkspaceValue,
  selectWorkspaceArea,
  workspaceViewFromManifest,
} from "../src/workspace/manifest.js";

const keyword = (name, namespace = null) => namespace ? { name, namespace } : { name };

function manifestValue() {
  return new Map([
    [keyword("type", "hara"), keyword("workspace")],
    [keyword("id", "workspace"), keyword("manifest-test")],
    [keyword("areas", "workspace"), [
      new Map([
        [keyword("id", "area"), "area/editor"],
        [keyword("type", "area"), keyword("code-editor")],
        [keyword("title", "area"), "Code"],
      ]),
      new Map([
        [keyword("id", "area"), "area/output"],
        [keyword("type", "area"), keyword("output")],
        [keyword("title", "area"), "Output"],
      ]),
    ]],
    [keyword("documents", "workspace"), new Set(["document/main"])],
  ]);
}

test("Workspace manifests are evaluated by Hara and inspected as retained values", async () => {
  const calls = [];
  const runtime = {
    async eval(source, namespace) {
      calls.push(["eval", source, namespace]);
      return { valueId: "value/workspace", namespace: "user", display: "{:hara/type :workspace}" };
    },
    async inspect(valueId) {
      calls.push(["inspect", valueId]);
      return { value: manifestValue() };
    },
  };

  const result = await evaluateWorkspaceManifest({
    runtime,
    source: "{:hara/type :workspace}",
    namespace: "user",
  });
  assert.deepEqual(calls, [
    ["eval", "{:hara/type :workspace}", "user"],
    ["inspect", "value/workspace"],
  ]);
  assert.equal(result.view["workspace/id"], "manifest-test");
  assert.equal(result.view["workspace/areas"].length, 2);
  assert.deepEqual(result.view["workspace/documents"], ["document/main"]);
  assert.equal(result.view["workspace/layout"]["layout/type"], "empty");
  assert.equal(result.view["workspace/selection"]["area/id"], "area/editor");
});

test("Workspace manifest loading distinguishes missing files from evaluated files", async () => {
  const missing = await loadWorkspaceManifest({
    store: { async read(path) { assert.equal(path, WORKSPACE_MANIFEST_PATH); return null; } },
    runtime: {},
  });
  assert.equal(missing.status, "missing");
  assert.equal(missing.view, null);

  const ready = await loadWorkspaceManifest({
    store: { async read(path) { assert.equal(path, WORKSPACE_MANIFEST_PATH); return "{:hara/type :workspace}"; } },
    runtime: {
      async eval() { return { valueId: "value/1", namespace: "user" }; },
      async inspect() { return { value: manifestValue() }; },
    },
  });
  assert.equal(ready.status, "ready");
  assert.equal(ready.view["workspace/id"], "manifest-test");
});

test("Workspace manifest projection validates identity and selection revisions", () => {
  const plain = plainWorkspaceValue(manifestValue());
  const view = workspaceViewFromManifest(plain);
  const selected = selectWorkspaceArea(view, "area/output", "preview");
  assert.equal(selected["workspace/revision"], 1);
  assert.deepEqual(selected["workspace/selection"], {
    "area/id": "area/output",
    "surface/id": "preview",
  });
  assert.throws(() => selectWorkspaceArea(view, "area/missing"), /missing area/);
  assert.throws(() => workspaceViewFromManifest({ "hara/type": "application", "workspace/id": "x" }), /Expected.*workspace/);
});
