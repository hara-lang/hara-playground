import assert from "node:assert/strict";
import test from "node:test";
import { graphWorkspacePatch } from "../src/hodos/graph-events.js";

const base = { "component/id": "hodos.2d/graph", "area/id": "area/graph", graphId: "graph/flow" };

test("Graph events validate bounded selection and node movement", () => {
  assert.deepEqual(graphWorkspacePatch({
    ...base,
    "event/type": "graph/select",
    nodeIds: ["node/source"],
    connectionIds: [],
  }), {
    kind: "select",
    areaId: "area/graph",
    graphId: "graph/flow",
    nodeIds: ["node/source"],
    connectionIds: [],
  });
  assert.deepEqual(graphWorkspacePatch({
    ...base,
    "event/type": "graph/move-node",
    nodeId: "node/source",
    x: 120,
    y: 80,
  }), {
    kind: "move-node",
    areaId: "area/graph",
    graphId: "graph/flow",
    nodeId: "node/source",
    x: 120,
    y: 80,
  });
});

test("Graph events fail closed for unsupported commands and malformed identities", () => {
  assert.equal(graphWorkspacePatch({ "event/type": "editor/change" }), null);
  assert.throws(() => graphWorkspacePatch({ ...base, "event/type": "graph/connect", from: {}, to: {} }), /Unsupported Hodos Graph event/);
  assert.throws(() => graphWorkspacePatch({ ...base, "component/id": "hodos.2d/document", "event/type": "graph/select" }), /Unexpected Hodos Graph component/);
  assert.throws(() => graphWorkspacePatch({ ...base, "event/type": "graph/move-node", nodeId: "node/source", x: Infinity, y: 0 }), /finite bounded number/);
  assert.throws(() => graphWorkspacePatch({ ...base, "event/type": "graph/select", nodeIds: ["node/source", "node/source"] }), /must not contain duplicates/);
});
