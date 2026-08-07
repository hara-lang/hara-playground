import {
  activityById,
  toolById,
  toolsetById,
} from "../studio/catalog.js";

export const HODOS_CATALOG_COMPONENT_ID = "hodos.dev/catalog";
export const HODOS_CATALOG_TOOLS_AREA_ID = "catalog/tools";
export const HODOS_CATALOG_ACTIVITY_AREA_ID = "catalog/activity";

function eventType(value) {
  return value?.["event/type"] ?? value?.type ?? null;
}

function identity(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function expectedArea(value, areaId) {
  return value?.["area/id"] === areaId;
}

export function catalogWorkspacePatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value["component/id"] !== HODOS_CATALOG_COMPONENT_ID) return null;

  const type = eventType(value);
  if (type === "catalog/select-toolset") {
    if (!expectedArea(value, HODOS_CATALOG_TOOLS_AREA_ID)) return null;
    const toolsetId = identity(value.toolsetId, "Hodos Catalog toolset id");
    if (!toolsetById(toolsetId)) throw new Error(`Unknown Hodos Catalog toolset: ${toolsetId}`);
    return Object.freeze({ kind: "select-toolset", toolsetId });
  }

  if (type === "catalog/select-activity") {
    if (!expectedArea(value, HODOS_CATALOG_ACTIVITY_AREA_ID)) return null;
    const activityId = identity(value.activityId, "Hodos Catalog activity id");
    if (!activityById(activityId)) throw new Error(`Unknown Hodos Catalog activity: ${activityId}`);
    return Object.freeze({ kind: "select-activity", activityId });
  }

  if (type === "catalog/insert-tool") {
    if (!expectedArea(value, HODOS_CATALOG_TOOLS_AREA_ID)) return null;
    const toolsetId = identity(value.toolsetId, "Hodos Catalog toolset id");
    const toolId = identity(value.toolId, "Hodos Catalog tool id");
    if (!toolById(toolsetId, toolId)) {
      throw new Error(`Unknown Hodos Catalog tool: ${toolsetId}/${toolId}`);
    }
    return Object.freeze({ kind: "insert-tool", toolsetId, toolId });
  }

  if (
    type === "catalog/open-activity"
    || type === "catalog/check-activity"
    || type === "catalog/reset-activity"
  ) {
    if (!expectedArea(value, HODOS_CATALOG_ACTIVITY_AREA_ID)) return null;
    const activityId = identity(value.activityId, "Hodos Catalog activity id");
    if (!activityById(activityId)) throw new Error(`Unknown Hodos Catalog activity: ${activityId}`);
    return Object.freeze({
      kind: type.slice("catalog/".length),
      activityId,
    });
  }

  return null;
}
