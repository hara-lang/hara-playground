import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FEATURED_PROJECTS } from "../src/studio/projects.js";
import { scanHara } from "../src/editor/lisp.js";
import { validateSampleCatalog } from "../scripts/validate-samples.mjs";

const root = new URL("..", import.meta.url).pathname;
const catalog = JSON.parse(await readFile(new URL("../samples/catalog.json", import.meta.url), "utf8"));

test("every sample directory has one package-authoritative catalog entry", async () => {
  const report = await validateSampleCatalog(root);
  assert.equal(report.samples.length, catalog.samples.length);
  assert.equal(report.authorityCommit, catalog.authority.commit);
  assert.equal(report.runtimeVersion, catalog.runtime.version);
});

test("featured repository projects resolve to catalogued samples", () => {
  const catalogPaths = new Set(catalog.samples.map((sample) => sample.path));
  const projects = FEATURED_PROJECTS.filter((project) => project.repository);
  assert.ok(projects.length > 0);
  for (const project of projects) {
    assert.ok(catalogPaths.has(project.repository.path), `${project.id} is not represented in samples/catalog.json`);
  }
});

test("catalogued source and optional workspace surfaces retain their bounded smoke contracts", async () => {
  for (const sample of catalog.samples) {
    const directory = join(root, sample.path);
    const source = await readFile(join(directory, sample.source), "utf8");
    assert.match(source, new RegExp(`^\\(ns\\s+${sample.mainNamespace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.equal(scanHara(source).unmatched.size, 0, `${sample.id} contains unbalanced syntax`);

    if (sample.workspace) {
      const workspace = await readFile(join(directory, sample.workspace), "utf8");
      assert.match(workspace, /:hara\/type\s+:workspace/);
      assert.match(workspace, /:workspace\/layout/);
      assert.ok(workspace.includes(sample.source), `${sample.id} workspace does not name ${sample.source}`);
    }

    if (sample.validation.mode === "active-policy") {
      const behavior = sample.validation.entrySymbol;
      assert.match(source, new RegExp(`\\(defn\\s+${behavior.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+\\[`));
    } else {
      assert.match(source, /\(view\)\s*$/);
    }
  }
});
