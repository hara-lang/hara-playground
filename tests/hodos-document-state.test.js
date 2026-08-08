import assert from "node:assert/strict";
import test from "node:test";
import {
  editWorkspaceDocumentText,
  selectWorkspaceDocumentNode,
  workspaceDocumentModel,
} from "../src/hodos/document-state.js";

const view = () => ({
  "workspace/id": "workspace/test",
  "workspace/revision": 2,
  "workspace/selection": { "area/id": "area/editor" },
  "workspace/areas": [{
    "area/id": "area/document",
    "area/type": "hodos.2d/document",
    "area/component": {
      "component/id": "hodos.2d/document",
      "component/contract": "workspace.component/1",
      "component/model": {
        document: {
          profile: "hodos.rich-text/2",
          id: "document/review",
          revision: 4,
          children: [{
            id: "block/intro",
            type: "paragraph",
            attrs: {},
            children: [{ id: "text/intro", type: "text", text: "before" }],
          }],
        },
        selection: { nodeId: null, anchor: null, focus: null },
        status: "ready",
        readOnly: false,
        capabilities: { select: true, editText: true },
        error: null,
      },
      "component/events": ["document/select", "document/edit-text"],
    },
  }],
});

test("Document selection remains an application-owned Workspace revision", () => {
  const original = view();
  const next = selectWorkspaceDocumentNode(original, {
    areaId: "area/document",
    documentId: "document/review",
    nodeId: "block/intro",
  });
  assert.equal(next["workspace/revision"], 3);
  assert.equal(next["workspace/selection"]["area/id"], "area/document");
  assert.equal(workspaceDocumentModel(next, "area/document").selection.nodeId, "block/intro");
  assert.equal(workspaceDocumentModel(original, "area/document").selection.nodeId, null);
});

test("Document text edits preserve IDs and reject stale events", () => {
  const original = view();
  const next = editWorkspaceDocumentText(original, {
    areaId: "area/document",
    documentId: "document/review",
    blockId: "block/intro",
    textId: "text/intro",
    previous: "before",
    text: "after",
  });
  const model = workspaceDocumentModel(next, "area/document");
  assert.equal(model.document.revision, 5);
  assert.equal(model.document.children[0].id, "block/intro");
  assert.equal(model.document.children[0].children[0].id, "text/intro");
  assert.equal(model.document.children[0].children[0].text, "after");
  assert.equal(workspaceDocumentModel(original, "area/document").document.children[0].children[0].text, "before");
  assert.throws(() => editWorkspaceDocumentText(next, {
    areaId: "area/document",
    documentId: "document/review",
    blockId: "block/intro",
    textId: "text/intro",
    previous: "before",
    text: "again",
  }), /Stale Hodos Document text edit/);
});

test("Document policy rejects missing identities", () => {
  assert.throws(() => selectWorkspaceDocumentNode(view(), {
    areaId: "area/document",
    documentId: "document/review",
    nodeId: "block/missing",
  }), /node is missing/);
  assert.throws(() => editWorkspaceDocumentText(view(), {
    areaId: "area/document",
    documentId: "document/other",
    blockId: "block/intro",
    textId: "text/intro",
    previous: "before",
    text: "after",
  }), /identity changed/);
});
