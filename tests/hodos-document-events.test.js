import assert from "node:assert/strict";
import test from "node:test";
import { documentWorkspacePatch } from "../src/hodos/document-events.js";

const base = {
  "component/id": "hodos.2d/document",
  "area/id": "area/document",
  documentId: "document/review",
};

test("Document events validate semantic selection and text edits", () => {
  assert.deepEqual(documentWorkspacePatch({
    ...base,
    "event/type": "document/select",
    nodeId: "block/intro",
  }), {
    kind: "select",
    areaId: "area/document",
    documentId: "document/review",
    nodeId: "block/intro",
  });

  assert.deepEqual(documentWorkspacePatch({
    ...base,
    "event/type": "document/edit-text",
    blockId: "block/intro",
    textId: "text/intro",
    previous: "before",
    text: "after",
  }), {
    kind: "edit-text",
    areaId: "area/document",
    documentId: "document/review",
    blockId: "block/intro",
    textId: "text/intro",
    previous: "before",
    text: "after",
  });
});

test("Document events fail closed across identity and command boundaries", () => {
  assert.equal(documentWorkspacePatch({ "event/type": "editor/change" }), null);
  assert.throws(() => documentWorkspacePatch({
    ...base,
    "component/id": "hodos.dev/editor",
    "event/type": "document/select",
    nodeId: "block/intro",
  }), /Unexpected Hodos Document component/);
  assert.throws(() => documentWorkspacePatch({
    ...base,
    "event/type": "document/delete-block",
    blockId: "block/intro",
  }), /Unsupported Hodos Document event/);
  assert.throws(() => documentWorkspacePatch({
    ...base,
    "event/type": "document/edit-text",
    blockId: "block/intro",
    textId: "text/intro",
    previous: "before",
    text: "x".repeat(1_000_001),
  }), /exceeds the application limit/);
});
