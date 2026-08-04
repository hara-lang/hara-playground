import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIO_PLAYBACK_CAPABILITY,
  addProjectCapability,
  projectRequestsCapability
} from "../src/workspace/capabilities.js";
import { detectProjectConfiguration } from "../src/workspace/project.js";

function configuration(source) {
  return detectProjectConfiguration([{ path: "project.edn", content: source }]);
}

test("adds audio playback to an existing canonical capability set", () => {
  const source = `{:hara/type :project
 :project/id example.app
 :project/main app.core
 :project/source-paths ["src"]
 :project/capabilities
 #{:studio/eval}}
`;
  const result = addProjectCapability(source);
  assert.equal(result.changed, true);
  assert.match(result.source, /#\{:studio\/eval :audio\/playback\}/);
  assert.deepEqual(configuration(result.source).capabilities, ["studio/eval", "audio/playback"]);
  assert.equal(projectRequestsCapability(result.source), true);
});

test("the edit is idempotent", () => {
  const source = `{:hara/type :project
 :project/main app.core
 :project/capabilities #{:studio/eval :audio/playback}}
`;
  const result = addProjectCapability(source);
  assert.equal(result.changed, false);
  assert.equal(result.source, source);
  assert.deepEqual(result.capabilities, ["studio/eval", "audio/playback"]);
});

test("preserves a multiline set, comments and closing indentation", () => {
  const source = `; browser project
{:hara/type :project
 :project/main app.core
 :project/capabilities
 #{:studio/eval ; evaluation remains explicit
   :network/http
   }
 :project/source-paths ["src"]}
`;
  const result = addProjectCapability(source);
  assert.equal(result.changed, true);
  assert.ok(result.source.includes("; evaluation remains explicit"));
  assert.match(result.source, /   :network\/http\n   :audio\/playback\n   \}/);
  assert.equal(projectRequestsCapability(result.source), true);
});

test("supports a capability vector without rewriting it as a set", () => {
  const source = `{:hara/type :project
 :project/main app.core
 :project/capabilities [:studio/eval]}
`;
  const result = addProjectCapability(source);
  assert.match(result.source, /\[:studio\/eval :audio\/playback\]/);
  assert.deepEqual(configuration(result.source).capabilities, ["studio/eval", "audio/playback"]);
});

test("inserts an explicit capability entry when the key is absent", () => {
  const source = `{:hara/type :project
 :project/id example.app
 :project/main app.core
 :project/source-paths ["src"]}
`;
  const result = addProjectCapability(source);
  assert.match(result.source, /:project\/source-paths \["src"\]\n :project\/capabilities/);
  assert.match(result.source, /#\{:studio\/eval\n   :audio\/playback\}\}/);
  assert.deepEqual(configuration(result.source).capabilities, ["studio/eval", "audio/playback"]);
});

test("ignores capability-like text inside comments and strings", () => {
  const source = `; :project/capabilities #{:audio/playback}
{:hara/type :project
 :project/id example.app
 :project/main app.core
 :project/description ":project/capabilities #{:audio/playback}"}
`;
  assert.equal(projectRequestsCapability(source), false);
  const result = addProjectCapability(source);
  assert.equal((result.source.match(/:project\/capabilities/g) || []).length, 3);
  assert.deepEqual(configuration(result.source).capabilities, ["studio/eval", "audio/playback"]);
});

test("rejects non-project documents, malformed collections and invalid capabilities", () => {
  assert.throws(
    () => addProjectCapability("{:hara/type :workspace}"),
    /canonical-descriptor-required/
  );
  assert.throws(
    () => addProjectCapability("{:hara/type :project :project/capabilities :all}"),
    /capabilities-collection-required/
  );
  assert.throws(
    () => addProjectCapability("{:hara/type :project}", "audio"),
    /capability-invalid/
  );
});

test("exports the canonical audio capability identifier", () => {
  assert.equal(AUDIO_PLAYBACK_CAPABILITY, "audio/playback");
});
