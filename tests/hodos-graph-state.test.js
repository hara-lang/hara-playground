import assert from "node:assert/strict";
import test from "node:test";
import {
  moveWorkspaceGraphNode,
  selectWorkspaceGraph,
  workspaceGraphModel,
} from "../src/hodos/graph-state.js";

const view = () => ({
  "workspace/id": "workspace/graph",
  "workspace/revision": 2,
  "workspace/selection": { "area/id": "area/graph" },
  "workspace/areas": [{
    "area/id": "area/graph",
    "area/type": "hodos.2d/graph",
    "area/component": {
      "component/id": "hodos.2d/graph",
      "component/contract": "workspace.component/1",
      "component/model": {
        graph: {
          id: "graph/flow",
          revision: 4,
          nodes: [{ id: "node/source", x: 20, y: 40, readOnly: false, ports: [] }, { id: "node/result", x: 300, y: 120, readOnly: false, ports: [] }],
          connections: [{ id: "connection/main", from: { nodeId: "node/source", portId: "out" }, to: { nodeId: "node/result", portId: "in" } }],
        },
        selection: { nodeIds: ["node/source"], connectionIds: [] },
        viewport: { x: 0, y: 0, zoom: 1 },
        status: "ready",
        readOnly: false,
        capabilities: { select: true, moveNode: true },
        error: null,
      },
      "component/events": ["graph/select", "graph/move-node"],
    },
  }],
});

test("Graph selection is immutable and redundant selections do not rerender", () => {
  const original = view();
  const redundant = selectWorkspaceGraph(original, {
    areaId: "area/graph", graphId: "graph/flow", nodeIds: ["node/source"], connectionIds: [],
  });
  assert.equal(redundant, original);
  const next = selectWorkspaceGraph(original, {
    areaId: "area/graph", graphId: "graph/flow", nodeIds: ["node/result"], connectionIds: [],
  });
  assert.equal(next["workspace/revision"], 3);
  assert.deepEqual(workspaceGraphModel(next, "area/graph").selection.nodeIds, ["node/result"]);
  assert.deepEqual(workspaceGraphModel(original, "area/graph").selection.nodeIds, ["node/source"]);
});

test("Graph node movement advances graph and Workspace revisions", () => {
  const original = view();
  const next = moveWorkspaceGraphNode(original, {
    areaId: "area/graph", graphId: "graph/flow", nodeId: "node/source", x: 90, y: 75,
  });
  const model = workspaceGraphModel(next, "area/graph");
  assert.equal(next["workspace/revision"], 3);
  assert.equal(model.graph.revision, 5);
  assert.deepEqual(model.graph.nodes[0], { id: "node/source", x: 90, y: 75, readOnly: false, ports: [] });
  assert.equal(workspaceGraphModel(original, "area/graph").graph.nodes[0].x, 20);
});

test("Graph policy rejects missing, read-only and disabled moves", () => {
  assert.throws(() => selectWorkspaceGraph(view(), { areaId: "area/graph", graphId: "graph/flow", nodeIds: ["node/missing"], connectionIds: [] }), /node is missing/);
  assert.throws(() => moveWorkspaceGraphNode(view(), { areaId: "area/graph", graphId: "graph/other", nodeId: "node/source", x: 0, y: 0 }), /identity changed/);
  const disabled = view();
  disabled["workspace/areas"][0]["area/component"]["component/model"].capabilities.moveNode = false;
  assert.throws(() => moveWorkspaceGraphNode(disabled, { areaId: "area/graph", graphId: "graph/flow", nodeId: "node/source", x: 0, y: 0 }), /not allowed/);
});
