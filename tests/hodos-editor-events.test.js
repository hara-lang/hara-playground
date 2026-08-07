import assert from "node:assert/strict";
import test from "node:test";
import {
  HODOS_EDITOR_AREA_ID,
  HODOS_EDITOR_COMPONENT_ID,
  editorWorkspacePatch,
} from "../src/hodos/editor-events.js";

const base = {
  "component/id": HODOS_EDITOR_COMPONENT_ID,
  "area/id": HODOS_EDITOR_AREA_ID,
};

test("Hodos Editor change events project authoritative source and selection", () => {
  assert.deepEqual(editorWorkspacePatch({
    ...base,
    "event/type": "editor/change",
    source: "(+ 2 2)",
    selection: { start: 3, end: 4 },
  }, "(+ 1 2)"), {
    kind: "change",
    source: "(+ 2 2)",
    selection: { start: 3, end: 4 },
  });
});

test("Hodos Editor selection events clamp to the current source", () => {
  assert.deepEqual(editorWorkspacePatch({
    ...base,
    "event/type": "editor/selection",
    selection: { start: 2, end: 200 },
  }, "abcd"), {
    kind: "selection",
    selection: { start: 2, end: 4 },
  });
});

test("unrelated components, areas, and events are ignored", () => {
  assert.equal(editorWorkspacePatch({ ...base, "component/id": "hodos.dev/preview", "event/type": "editor/change" }), null);
  assert.equal(editorWorkspacePatch({ ...base, "area/id": "editor/other", "event/type": "editor/change" }), null);
  assert.equal(editorWorkspacePatch({ ...base, "event/type": "editor/command" }), null);
  assert.equal(editorWorkspacePatch(null), null);
});

test("malformed authoritative events fail closed", () => {
  assert.throws(() => editorWorkspacePatch({
    ...base,
    "event/type": "editor/change",
    source: null,
  }), /require string source/);
  assert.throws(() => editorWorkspacePatch({
    ...base,
    "event/type": "editor/selection",
    selection: { start: 1.5, end: 2 },
  }, "abc"), /offsets must be integers/);
});
