import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { detectActiveLoopConfiguration } from "../src/runtime/active-project.js";

const descriptor = `
{:hara/type :project
 :project/main samples.active-loop-tank
 :playground/active-loop
 {:active/id "tank/controller"
  :active/kind :tank
  :active/path "src/main.hal"
  :active/entry controller
  :active/rate-hz 12
  :active/initial-level 75
  :active/target 64
  :active/leak-rate 1.25
  :active/fill-rate 9.5
  :active/auto-start false}}
`;

test("active project extension is absent from ordinary projects", () => {
  assert.equal(detectActiveLoopConfiguration([
    { path: "project.edn", content: "{:hara/type :project :project/main demo}" },
  ]), null);
});

test("active project extension produces a bounded runtime descriptor", () => {
  assert.deepEqual(detectActiveLoopConfiguration([
    { path: "project.edn", content: descriptor },
  ]), {
    id: "tank/controller",
    kind: "tank",
    path: "src/main.hal",
    entry: "controller",
    rateHz: 12,
    initialLevel: 75,
    target: 64,
    leakRate: 1.25,
    fillRate: 9.5,
    autoStart: false,
  });
});

test("unsupported active loop kinds are rejected explicitly", () => {
  assert.throws(() => detectActiveLoopConfiguration([
    { path: "project.edn", content: descriptor.replace(":active/kind :tank", ":active/kind :camera") },
  ]), /active\/project-kind-unsupported:camera/);
});

test("the committed Living Tank descriptor selects its Hara controller", async () => {
  const content = await readFile(new URL("../samples/active-loop-tank/project.edn", import.meta.url), "utf8");
  const config = detectActiveLoopConfiguration([{ path: "project.edn", content }]);
  assert.equal(config.id, "tank/controller");
  assert.equal(config.path, "src/main.hal");
  assert.equal(config.entry, "controller");
  assert.equal(config.autoStart, true);
});
