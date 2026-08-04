import test from "node:test";
import assert from "node:assert/strict";
import { detectProjectConfiguration } from "../src/workspace/project.js";

test("project capabilities are read from a canonical EDN set", () => {
  const configuration = detectProjectConfiguration([
    {
      path: "project.edn",
      content: `{:hara/type :project
                 :project/main samples.audio
                 :project/source-paths ["src" "shared"]
                 :project/capabilities #{:studio/eval :audio/playback}}`
    },
    { path: "src/main.hal", content: "(ns samples.audio)" }
  ]);
  assert.deepEqual(configuration.capabilities, ["studio/eval", "audio/playback"]);
  assert.deepEqual(configuration.sourcePaths, ["src", "shared"]);
  assert.equal(configuration.mainNamespace, "samples.audio");
});

test("projects without a declaration keep the evaluation-only grant", () => {
  const configuration = detectProjectConfiguration([
    { path: "src/main.hal", content: "(ns samples.safe)" }
  ]);
  assert.deepEqual(configuration.capabilities, ["studio/eval"]);
});
