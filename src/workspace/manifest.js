export const WORKSPACE_MANIFEST_PATH = "workspace.edn";

const MAX_MANIFEST_DEPTH = 32;
const MAX_MANIFEST_ENTRIES = 10_000;
const MAX_MANIFEST_SOURCE_LENGTH = 1_000_000;

const objectValue = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Map || value instanceof Set) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
};

export function keyName(value) {
  if (typeof value === "string") return value.trim().replace(/^:/, "");
  if (value && typeof value === "object") {
    const name = typeof value.name === "string" ? value.name.trim().replace(/^:/, "") : "";
    const namespace = typeof value.namespace === "string"
      ? value.namespace.trim().replace(/^:/, "")
      : typeof value.ns === "string"
        ? value.ns.trim().replace(/^:/, "")
        : "";
    if (name) return namespace && !name.includes("/") ? `${namespace}/${name}` : name;
    if (typeof value.fqn === "string" && value.fqn.trim()) return value.fqn.trim().replace(/^:/, "");
  }
  return String(value ?? "").trim().replace(/^:/, "");
}

function entryBudget(value, label) {
  const count = value instanceof Map || value instanceof Set
    ? value.size
    : Array.isArray(value)
      ? value.length
      : Object.keys(value).length;
  if (count > MAX_MANIFEST_ENTRIES) {
    throw new RangeError(`${label} exceeds the Workspace manifest entry limit`);
  }
}

export function plainWorkspaceValue(value, depth = 0, ancestors = new WeakSet(), label = "Workspace manifest") {
  if (value == null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label} numbers must be finite`);
    return value;
  }
  if (typeof value === "bigint") return Number(value);
  if (typeof value !== "object") throw new TypeError(`${label} contains an unsupported value`);
  if (depth >= MAX_MANIFEST_DEPTH) throw new RangeError(`${label} exceeds the Workspace manifest depth limit`);
  if (ancestors.has(value)) throw new TypeError(`${label} must not contain cycles`);

  ancestors.add(value);
  try {
    if (value instanceof Date) return value.toISOString();
    entryBudget(value, label);

    if (value instanceof Map) {
      const output = {};
      for (const [key, entry] of value.entries()) {
        const name = keyName(key);
        if (!name) throw new TypeError(`${label} contains an empty map key`);
        if (Object.hasOwn(output, name)) throw new Error(`${label} contains a duplicate key: ${name}`);
        output[name] = plainWorkspaceValue(entry, depth + 1, ancestors, `${label}.${name}`);
      }
      return output;
    }

    if (value instanceof Set) {
      return [...value.values()].map((entry, index) =>
        plainWorkspaceValue(entry, depth + 1, ancestors, `${label}[${index}]`));
    }

    if (Array.isArray(value)) {
      return value.map((entry, index) =>
        plainWorkspaceValue(entry, depth + 1, ancestors, `${label}[${index}]`));
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      const token = keyName(value);
      if (token) return token;
      throw new TypeError(`${label} objects must be plain or keyword-like`);
    }

    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      const name = keyName(key);
      if (!name) throw new TypeError(`${label} contains an empty object key`);
      if (Object.hasOwn(output, name)) throw new Error(`${label} contains a duplicate key: ${name}`);
      output[name] = plainWorkspaceValue(entry, depth + 1, ancestors, `${label}.${name}`);
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

const arrayValue = (value, label) => {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
};

const workspaceId = (value) => {
  const id = keyName(value);
  if (!id) throw new TypeError("Workspace manifest requires :workspace/id");
  return id;
};

const areaId = (area, index) => {
  const value = keyName(area?.["area/id"] ?? area?.id);
  if (!value) throw new TypeError(`Workspace manifest area ${index} requires :area/id`);
  return value;
};

export function workspaceViewFromManifest(value) {
  const manifest = objectValue(value, "Workspace manifest");
  const type = keyName(manifest["hara/type"] ?? manifest.type);
  if (type !== "workspace") throw new Error(`Expected :hara/type :workspace, received ${type || "<missing>"}`);

  const areas = arrayValue(manifest["workspace/areas"] ?? [], "Workspace manifest areas");
  const areaIds = new Set();
  for (let index = 0; index < areas.length; index += 1) {
    const id = areaId(areas[index], index);
    if (areaIds.has(id)) throw new Error(`Duplicate Workspace manifest area id: ${id}`);
    areaIds.add(id);
  }

  const rawRevision = Number(manifest["workspace/revision"] ?? 0);
  const revision = Number.isSafeInteger(rawRevision) && rawRevision >= 0 ? rawRevision : 0;
  const rawSelection = manifest["workspace/selection"];
  const selection = rawSelection && typeof rawSelection === "object" && !Array.isArray(rawSelection)
    ? { ...rawSelection }
    : areas.length
      ? { "area/id": areaId(areas[0], 0) }
      : {};

  return {
    "workspace/id": workspaceId(manifest["workspace/id"]),
    "workspace/revision": revision,
    "workspace/layout": manifest["workspace/layout"] ?? { "layout/type": "empty" },
    "workspace/areas": areas,
    "workspace/documents": arrayValue(manifest["workspace/documents"] ?? [], "Workspace manifest documents"),
    "workspace/nodes": arrayValue(manifest["workspace/nodes"] ?? [], "Workspace manifest nodes"),
    "workspace/connections": arrayValue(
      manifest["workspace/connections"] ?? [],
      "Workspace manifest connections",
    ),
    "workspace/links": arrayValue(manifest["workspace/links"] ?? [], "Workspace manifest links"),
    "workspace/selection": selection,
    "workspace/customizations": manifest["workspace/customizations"] ?? {},
    "workspace/extensions": arrayValue(manifest["workspace/extensions"] ?? [], "Workspace manifest extensions"),
    "workspace/pending": arrayValue(manifest["workspace/pending"] ?? [], "Workspace manifest pending events"),
    "workspace/audit": arrayValue(manifest["workspace/audit"] ?? [], "Workspace manifest audit"),
  };
}

export async function evaluateWorkspaceManifest({ runtime, source, namespace = "user" } = {}) {
  if (!runtime || typeof runtime.eval !== "function" || typeof runtime.inspect !== "function") {
    throw new TypeError("Workspace manifest evaluation requires a Hara runtime with eval and inspect");
  }
  if (typeof source !== "string" || !source.trim()) {
    throw new TypeError("Workspace manifest source must be a non-empty string");
  }
  if (source.length > MAX_MANIFEST_SOURCE_LENGTH) {
    throw new RangeError("Workspace manifest source exceeds the size limit");
  }

  const evaluated = await runtime.eval(source, namespace);
  if (!evaluated?.valueId) throw new Error("Hara did not retain the evaluated Workspace manifest value");
  const inspected = await runtime.inspect(evaluated.valueId);
  const manifest = plainWorkspaceValue(inspected?.value);
  return {
    status: "ready",
    source,
    namespace: evaluated.namespace || namespace,
    valueId: evaluated.valueId,
    display: evaluated.display || inspected?.display || "",
    manifest,
    view: workspaceViewFromManifest(manifest),
  };
}

export async function loadWorkspaceManifest({ store, runtime, namespace = "user" } = {}) {
  if (!store || typeof store.read !== "function") {
    throw new TypeError("Workspace manifest loading requires a Workspace store");
  }
  const source = await store.read(WORKSPACE_MANIFEST_PATH);
  if (source == null) return { status: "missing", source: null, namespace, view: null };
  return evaluateWorkspaceManifest({ runtime, source, namespace });
}

export function selectWorkspaceArea(view, areaIdValue, surfaceIdValue = null) {
  const input = objectValue(view, "Workspace view");
  const areas = arrayValue(input["workspace/areas"] ?? [], "Workspace view areas");
  const selectedAreaId = keyName(areaIdValue);
  if (!areas.some((area, index) => areaId(area, index) === selectedAreaId)) {
    throw new Error(`Workspace selection references missing area: ${selectedAreaId}`);
  }
  const revision = Number(input["workspace/revision"] ?? 0);
  const selection = { "area/id": selectedAreaId };
  const surfaceId = keyName(surfaceIdValue);
  if (surfaceId) selection["surface/id"] = surfaceId;
  return {
    ...input,
    "workspace/revision": Number.isSafeInteger(revision) && revision >= 0 ? revision + 1 : 1,
    "workspace/selection": selection,
  };
}
