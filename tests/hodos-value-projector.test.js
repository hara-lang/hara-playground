import assert from "node:assert/strict";
import test from "node:test";
import {
  formatInspectableValue,
  inspectableType,
  projectInspectableValue,
  valueAtPath,
} from "../src/hodos/value-projector.js";

test("runtime values project to bounded serializable data", () => {
  const value = { answer: 42, nested: [true, null], large: 4n };
  assert.deepEqual(projectInspectableValue(value), {
    answer: 42,
    nested: [true, null],
    large: "4n",
  });
  assert.equal(inspectableType(value), "object");
  assert.equal(inspectableType([1, 2]), "array");
});

test("projection handles cycles, depth and path lookup", () => {
  const value = { nested: { answer: 42 } };
  value.self = value;
  const projected = projectInspectableValue(value, { maxDepth: 3 });
  assert.equal(projected.self, "[Circular]");
  assert.equal(valueAtPath(projected, ["nested", "answer"]), 42);
  assert.equal(formatInspectableValue(projected.nested), '{\n  "answer": 42\n}');
});
