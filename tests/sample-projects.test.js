import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FEATURED_PROJECTS } from "../src/studio/projects.js";
import { scanHara } from "../src/editor/lisp.js";

const root = new URL("..", import.meta.url).pathname;

test("every featured GitHub sample is a complete workspace.edn-first Hara project", async () => {
  for (const project of FEATURED_PROJECTS) {
    const relative = project.repository.path;
    const directory = join(root, relative);
    const [descriptor, workspace, source] = await Promise.all([
      readFile(join(directory, "project.edn"), "utf8"),
      readFile(join(directory, "workspace.edn"), "utf8"),
      readFile(join(directory, project.entry), "utf8")
    ]);
    assert.match(descriptor, /:hara\/type\s+:project/);
    assert.match(descriptor, /:studio\/eval/);
    if (project.id === "greenways-ai") assert.match(descriptor, /:model\/generate/);
    assert.match(workspace, /:hara\/type\s+:workspace/);
    assert.match(workspace, /:workspace\/layout/);
    assert.match(workspace, /:layout\/type\s+:split/);
    assert.match(workspace, /:workspace\/areas/);
    assert.match(workspace, /:area\/id\s+"area\/project"/);
    assert.match(workspace, /:area\/id\s+"area\/editor"/);
    assert.match(workspace, /:workspace\/selection/);
    assert.match(workspace, /:responsive\/breakpoint/);
    assert.ok(workspace.includes(project.entry), `${project.id} workspace.edn does not name ${project.entry}`);
    assert.match(source, /\(ns\s+[A-Za-z]/);
    assert.match(source, /\(view\)\s*$/);
    assert.equal(scanHara(source).unmatched.size, 0, `${project.id} contains unbalanced syntax`);
  }
});
