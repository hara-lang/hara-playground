import test from "node:test";
import assert from "node:assert/strict";
import { detectProjectConfiguration, isHaraSource, isProjectSource } from "../src/workspace/project.js";

test("detects canonical Hara project descriptors", () => {
  const project = detectProjectConfiguration([
    {
      path: "project.edn",
      content: `{:hara/type :project
 :project/source-paths ["src" "shared"]
 :project/main hara.example.main}`
    },
    { path: "src/main.hal", content: "(ns ignored.source)" }
  ]);
  assert.deepEqual(project, {
    projectPath: "project.edn",
    mainNamespace: "hara.example.main",
    sourcePaths: ["src", "shared"],
    canonical: true
  });
});

test("falls back to the first HAL namespace", () => {
  const project = detectProjectConfiguration([
    { path: "src/app/core.hal", content: "(ns app.core)\n(+ 1 2)" }
  ]);
  assert.equal(project.mainNamespace, "app.core");
  assert.equal(project.projectPath, null);
});

test("recognises canonical and legacy Hara source extensions", () => {
  assert.equal(isHaraSource("src/main.hal"), true);
  assert.equal(isHaraSource("src/main.hara"), true);
  assert.equal(isHaraSource("src/main.edn"), false);
});


test("limits boot files to declared project source paths", () => {
  assert.equal(isProjectSource("src/app/core.hal", ["src"]), true);
  assert.equal(isProjectSource("test/app/core_test.hal", ["src"]), false);
  assert.equal(isProjectSource("shared/lib.hal", ["src", "shared"]), true);
  assert.equal(isProjectSource("src/data.edn", ["src"]), false);
});
