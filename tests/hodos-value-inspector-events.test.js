import assert from "node:assert/strict";
import test from "node:test";
import {
  HODOS_VALUE_INSPECTOR_AREA_ID,
  HODOS_VALUE_INSPECTOR_COMPONENT_ID,
  valueInspectorWorkspacePatch,
} from "../src/hodos/value-inspector-events.js";

const base = {
  "component/id": HODOS_VALUE_INSPECTOR_COMPONENT_ID,
  "area/id": HODOS_VALUE_INSPECTOR_AREA_ID,
};

test("Value Inspector projects select, toggle and copy paths", () => {
  assert.deepEqual(valueInspectorWorkspacePatch({
    ...base,
    "event/type": "value/select",
    path: ["answer", 0],
  }), { kind: "select", path: ["answer", 0] });
  assert.deepEqual(valueInspectorWorkspacePatch({
    ...base,
    "event/type": "value/toggle",
    path: ["nested"],
  }), { kind: "toggle", path: ["nested"] });
  assert.deepEqual(valueInspectorWorkspacePatch({
    ...base,
    "event/type": "value/copy",
    path: [],
  }), { kind: "copy", path: [] });
});

test("Value Inspector projects refresh and close commands", () => {
  assert.deepEqual(valueInspectorWorkspacePatch({ ...base, "event/type": "value/refresh" }), { kind: "refresh" });
  assert.deepEqual(valueInspectorWorkspacePatch({ ...base, "event/type": "value/close" }), { kind: "close" });
});

test("Value Inspector ignores unrelated events and rejects malformed paths", () => {
  assert.equal(valueInspectorWorkspacePatch({ ...base, "component/id": "hodos.dev/repl", "event/type": "value/close" }), null);
  assert.equal(valueInspectorWorkspacePatch({ ...base, "area/id": "value/other", "event/type": "value/close" }), null);
  assert.equal(valueInspectorWorkspacePatch({ ...base, "event/type": "value/unknown" }), null);
  assert.throws(() => valueInspectorWorkspacePatch({
    ...base,
    "event/type": "value/select",
    path: [1.5],
  }), /segment 0 is invalid/);
});
