import test from "node:test";
import assert from "node:assert/strict";
import { HaraRuntime } from "../src/runtime/evaluator.js";
import {
  ACTIVITIES,
  TOOLSETS,
  activitiesForToolset,
  activityCheckPassed,
  toolById,
  validateStudioCatalog
} from "../src/studio/catalog.js";

test("built-in toolsets and activities form a valid catalog", () => {
  assert.deepEqual(validateStudioCatalog(), []);
  assert.ok(TOOLSETS.length >= 4);
  assert.ok(ACTIVITIES.length >= 5);
});

test("activities are grouped by toolset and tools can be resolved", () => {
  assert.ok(activitiesForToolset("core").every((activity) => activity.toolsetId === "core"));
  assert.match(toolById("interface", "component").snippet, /defn card/);
  assert.equal(toolById("missing", "component"), null);
});

test("activity result matching is explicit and whitespace tolerant", () => {
  assert.equal(activityCheckPassed(" true\n", "true"), true);
  assert.equal(activityCheckPassed(":ready", [":ready", "ready"]), true);
  assert.equal(activityCheckPassed("false", "true"), false);
});

test("catalog validation reports broken references", () => {
  const errors = validateStudioCatalog(
    [{ id: "core", tools: [{ id: "value", snippet: "42" }] }],
    [{ id: "broken", toolsetId: "missing", path: "activity.txt", source: "", checks: [] }]
  );
  assert.ok(errors.some((error) => error.includes("unknown toolset")));
  assert.ok(errors.some((error) => error.includes(".hal")));
  assert.ok(errors.some((error) => error.includes("starter source")));
  assert.ok(errors.some((error) => error.includes("no checks")));
});


test("every tool snippet evaluates in the embedded runtime", async () => {
  for (const toolset of TOOLSETS) {
    for (const tool of toolset.tools) {
      const runtime = new HaraRuntime();
      await assert.doesNotReject(() => runtime.evaluateSource(tool.snippet), `${toolset.id}/${tool.id}`);
    }
  }
});
