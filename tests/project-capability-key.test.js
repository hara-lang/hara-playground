import test from "node:test";
import assert from "node:assert/strict";
import { addProjectCapability, projectRequestsCapability } from "../src/workspace/capabilities.js";
import { detectProjectConfiguration } from "../src/workspace/project.js";

test("a keyword value named project/capabilities is not treated as the map key", () => {
  const source = `{:hara/type :project
 :project/main app.core
 :project/example-key :project/capabilities
 :project/source-paths ["src"]}
`;

  assert.equal(projectRequestsCapability(source), false);
  const result = addProjectCapability(source);
  assert.match(result.source, /:project\/example-key :project\/capabilities/);
  assert.equal((result.source.match(/:project\/capabilities/g) || []).length, 2);
  assert.deepEqual(
    detectProjectConfiguration([{ path: "project.edn", content: result.source }]).capabilities,
    ["studio/eval", "audio/playback"]
  );
});
