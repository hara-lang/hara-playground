import assert from "node:assert/strict";
import test from "node:test";
import { defaultProject } from "../src/workspace/default-project.js";

const entry = Array.isArray(defaultProject)
  ? defaultProject.find((file) => file.path === "workspace.edn")
  : null;
const manifest = entry?.content;

test("the local scratch project carries the neutral Hara Workspace manifest", () => {
  assert.equal(typeof manifest, "string");
  assert.match(manifest, /:hara\/type\s+:workspace/);
  assert.match(manifest, /:workspace\/id\s+:hara-studio-hello/);
  assert.match(manifest, /:workspace\/layout/);
  assert.match(manifest, /:layout\/type\s+:split/);
  assert.match(manifest, /:workspace\/areas/);
  assert.match(manifest, /:area\/id\s+"area\/editor"/);
  assert.match(manifest, /:area\/id\s+"area\/output"/);
  assert.match(manifest, /:document\/path\s+"src\/app\/core\.hal"/);
});

test("the neutral default leaves the Playground project host to product projection", () => {
  assert.doesNotMatch(manifest, /:area\/id\s+(?::area\/project|"area\/project")/);
});
