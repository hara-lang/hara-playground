const objectValue = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
};

const nonEmptyString = (value, label) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
};

const areaId = (area) => String(area?.["area/id"] ?? area?.id ?? "").replace(/^:/, "");

function documentArea(view, areaIdValue) {
  const input = objectValue(view, "Workspace document view");
  const areas = input["workspace/areas"];
  if (!Array.isArray(areas)) throw new TypeError("Workspace document areas must be an array");
  const requested = nonEmptyString(areaIdValue, "Workspace document area id");
  const index = areas.findIndex((area) => areaId(area) === requested);
  if (index < 0) throw new Error(`Workspace document area is missing: ${requested}`);
  const area = objectValue(areas[index], "Workspace document area");
  const component = objectValue(
    area["area/component"] ?? area.component,
    "Workspace document component",
  );
  if (component["component/id"] !== "hodos.2d/document") {
    throw new Error(`Workspace area is not a Hodos Document: ${requested}`);
  }
  const model = objectValue(component["component/model"], "Workspace document model");
  const document = objectValue(model.document, "Workspace document value");
  return { input, areas, requested, index, area, component, model, document };
}

const nextRevision = (value) => {
  const revision = Number(value ?? 0);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision + 1 : 1;
};

function replaceArea(record, nextModel) {
  const nextComponent = {
    ...record.component,
    "component/model": nextModel,
  };
  const nextArea = {
    ...record.area,
    "area/component": nextComponent,
  };
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

function containsNode(children, nodeId) {
  for (const node of children ?? []) {
    if (node?.id === nodeId) return true;
    if (containsNode(node?.children, nodeId)) return true;
  }
  return false;
}

function replaceText(children, patch, parentBlockId = null) {
  let changed = false;
  const next = (children ?? []).map((node) => {
    if (!node || typeof node !== "object") return node;
    if (node.type === "text") {
      if (parentBlockId !== patch.blockId || node.id !== patch.textId) return node;
      if (node.text !== patch.previous) {
        throw new Error(`Stale Hodos Document text edit for ${patch.textId}`);
      }
      changed = true;
      return { ...node, text: patch.text };
    }
    const result = replaceText(node.children, patch, node.id);
    if (!result.changed) return node;
    changed = true;
    return { ...node, children: result.children };
  });
  return { children: next, changed };
}

export function selectWorkspaceDocumentNode(view, patch) {
  const record = documentArea(view, patch.areaId);
  const documentId = nonEmptyString(patch.documentId, "Workspace document id");
  if (record.document.id !== documentId) {
    throw new Error(`Workspace document identity changed: ${documentId}`);
  }
  const nodeId = nonEmptyString(patch.nodeId, "Workspace document selected node id");
  if (!containsNode(record.document.children, nodeId)) {
    throw new Error(`Workspace document node is missing: ${nodeId}`);
  }
  const currentNodeId = record.model.selection?.nodeId ?? null;
  const selectedAreaId = record.input["workspace/selection"]?.["area/id"] ?? null;
  if (currentNodeId === nodeId && selectedAreaId === record.requested) {
    return view;
  }
  return replaceArea(record, {
    ...record.model,
    selection: {
      ...(record.model.selection ?? {}),
      nodeId,
    },
  });
}

export function editWorkspaceDocumentText(view, patch) {
  const record = documentArea(view, patch.areaId);
  const documentId = nonEmptyString(patch.documentId, "Workspace document id");
  if (record.document.id !== documentId) {
    throw new Error(`Workspace document identity changed: ${documentId}`);
  }
  const result = replaceText(record.document.children, patch);
  if (!result.changed) {
    throw new Error(`Workspace document text is missing: ${patch.blockId}/${patch.textId}`);
  }
  return replaceArea(record, {
    ...record.model,
    document: {
      ...record.document,
      revision: nextRevision(record.document.revision),
      children: result.children,
    },
    status: "ready",
    error: null,
  });
}

export function workspaceDocumentModel(view, areaIdValue) {
  return documentArea(view, areaIdValue).model;
}
