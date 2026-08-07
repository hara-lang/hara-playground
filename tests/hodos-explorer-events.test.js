import assert from "node:assert/strict";
import test from "node:test";
import {
  HODOS_EXPLORER_AREA_ID,
  HODOS_EXPLORER_COMPONENT_ID,
  explorerWorkspacePatch,
} from "../src/hodos/explorer-events.js";

const base = {
  "component/id": HODOS_EXPLORER_COMPONENT_ID,
  "area/id": HODOS_EXPLORER_AREA_ID,
};

test("Explorer projects selection, expansion and mutation commands", () => {
  assert.deepEqual(explorerWorkspacePatch({ ...base, "event/type": "explorer/select", path: "src/main.hal" }), {
    kind: "select",
    path: "src/main.hal",
  });
  assert.deepEqual(explorerWorkspacePatch({ ...base, "event/type": "explorer/toggle", path: "src" }), {
    kind: "toggle",
    path: "src",
  });
  assert.deepEqual(explorerWorkspacePatch({ ...base, "event/type": "explorer/create", kind: "file" }), {
    kind: "create",
    entryKind: "file",
    path: null,
  });
  assert.deepEqual(explorerWorkspacePatch({ ...base, "event/type": "explorer/delete", path: "src/main.hal" }), {
    kind: "delete",
    path: "src/main.hal",
  });
  assert.deepEqual(explorerWorkspacePatch({
    ...base,
    "event/type": "explorer/rename",
    path: "src/main.hal",
    newPath: "src/app.hal",
  }), {
    kind: "rename",
    path: "src/main.hal",
    newPath: "src/app.hal",
  });
});

test("Explorer projects refresh/filter and rejects malformed events", () => {
  assert.deepEqual(explorerWorkspacePatch({ ...base, "event/type": "explorer/refresh" }), { kind: "refresh" });
  assert.deepEqual(explorerWorkspacePatch({ ...base, "event/type": "explorer/filter", query: "main" }), {
    kind: "filter",
    query: "main",
  });
  assert.equal(explorerWorkspacePatch({ ...base, "component/id": "hodos.dev/editor", "event/type": "explorer/refresh" }), null);
  assert.throws(() => explorerWorkspacePatch({ ...base, "event/type": "explorer/select", path: "../main.hal" }), /parent segments/);
  assert.throws(() => explorerWorkspacePatch({ ...base, "event/type": "explorer/create", kind: "device" }), /file or directory/);
  assert.throws(() => explorerWorkspacePatch({ ...base, "event/type": "explorer/filter", query: 7 }), /query must be a string/);
});
