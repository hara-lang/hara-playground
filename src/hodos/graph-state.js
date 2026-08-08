const objectValue = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
};

const nonEmptyString = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
};

const areaId = (area) => String(area?.["area/id"] ?? area?.id ?? "").replace(/^:/, "");
const nextRevision = (value) => {
  const revision = Number(value ?? 0);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision + 1 : 1;
};

function graphArea(view, areaIdValue) {
  const input = objectValue(view, "Workspace graph view");
  const areas = input["workspace/areas"];
  if (!Array.isArray(areas)) throw new TypeError("Workspace graph areas must be an array");
  const requested = nonEmptyString(areaIdValue, "Workspace graph area id");
  const index = areas.findIndex((area) => areaId(area) === requested);
  if (index < 0) throw new Error(`Workspace graph area is missing: ${requested}`);
  const area = objectValue(areas[index], "Workspace graph area");
  const component = objectValue(area["area/component"] ?? area.component, "Workspace graph component");
  if (component["component/id"] !== "hodos.2d/graph") {
    throw new Error(`Workspace area is not a Hodos Graph: ${requested}`);
  }
  const model = objectValue(component["component/model"], "Workspace graph model");
  const graph = objectValue(model.graph, "Workspace graph value");
  return { input, areas, requested, index, area, component, model, graph };
}

function sameArray(left = [], right = []) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function replaceArea(record, nextModel) {
  const nextComponent = { ...record.component, "component/model": nextModel };
  const nextArea = { ...record.area, "area/component": nextComponent };
  delete nextArea.component;
  const nextAreas = [...record.areas];
  nextAreas[record.index] = nextArea;
  return {
    ...record.input,
    "workspace/revision": nextRevision(record.input["workspace/revision"]),
    "workspace/areas": nextAreas,
    "workspace/selection": {
      ...(record.input["workspace/selection"] ?? {}),
      "area/id": record.requested,
    },
  };
}

function assertGraphIdentity(record, graphId) {
  const requested = nonEmptyString(graphId, "Workspace graph id");
  if (record.graph.id !== requested) throw new Error(`Workspace graph identity changed: ${requested}`);
}

export function selectWorkspaceGraph(view, patch) {
  const record = graphArea(view, patch.areaId);
  assertGraphIdentity(record, patch.graphId);
  const nodeIds = [...patch.nodeIds];
  const connectionIds = [...patch.connectionIds];
  const nodes = new Set((record.graph.nodes ?? []).map((node) => node.id));
  const connections = new Set((record.graph.connections ?? []).map((connection) => connection.id));
  for (const id of nodeIds) if (!nodes.has(id)) throw new Error(`Workspace graph node is missing: ${id}`);
  for (const id of connectionIds) if (!connections.has(id)) throw new Error(`Workspace graph connection is missing: ${id}`);
  const current = record.model.selection ?? { nodeIds: [], connectionIds: [] };
  const selectedArea = record.input["workspace/selection"]?.["area/id"];
  if (sameArray(current.nodeIds ?? [], nodeIds)
      && sameArray(current.connectionIds ?? [], connectionIds)
      && selectedArea === record.requested) {
    return view;
  }
  return replaceArea(record, {
    ...record.model,
    selection: { nodeIds, connectionIds },
  });
}

export function moveWorkspaceGraphNode(view, patch) {
  const record = graphArea(view, patch.areaId);
  assertGraphIdentity(record, patch.graphId);
  if (record.model.readOnly || !record.model.capabilities?.moveNode) {
    throw new Error("Workspace graph node movement is not allowed");
  }
  const nodeId = nonEmptyString(patch.nodeId, "Workspace graph moved node id");
  const index = (record.graph.nodes ?? []).findIndex((node) => node.id === nodeId);
  if (index < 0) throw new Error(`Workspace graph node is missing: ${nodeId}`);
  const node = record.graph.nodes[index];
  if (node.readOnly) throw new Error(`Workspace graph node is read only: ${nodeId}`);
  if (node.x === patch.x && node.y === patch.y) return view;
  const nodes = [...record.graph.nodes];
  nodes[index] = { ...node, x: patch.x, y: patch.y };
  return replaceArea(record, {
    ...record.model,
    graph: {
      ...record.graph,
      revision: nextRevision(record.graph.revision),
      nodes,
    },
    status: "ready",
    error: null,
  });
}

export function workspaceGraphModel(view, areaIdValue) {
  return graphArea(view, areaIdValue).model;
}
