import { normalizeExplorerPath } from "./explorer-state.js";

export const HODOS_EXPLORER_COMPONENT_ID = "hodos.dev/explorer";
export const HODOS_EXPLORER_AREA_ID = "explorer/main";

function eventType(value) {
  return value?.["event/type"] ?? value?.type ?? null;
}

function optionalPath(value, label) {
  if (value == null) return null;
  return normalizeExplorerPath(value, label);
}

export function explorerWorkspacePatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value["component/id"] !== HODOS_EXPLORER_COMPONENT_ID) return null;
  if (value["area/id"] !== HODOS_EXPLORER_AREA_ID) return null;

  const type = eventType(value);
  if (type === "explorer/select") {
    return Object.freeze({ kind: "select", path: normalizeExplorerPath(value.path, "Hodos Explorer select path") });
  }
  if (type === "explorer/toggle") {
    return Object.freeze({ kind: "toggle", path: normalizeExplorerPath(value.path, "Hodos Explorer toggle path") });
  }
  if (type === "explorer/create") {
    const entryKind = String(value.kind ?? "file");
    if (entryKind !== "file" && entryKind !== "directory") {
      throw new TypeError("Hodos Explorer create kind must be file or directory");
    }
    return Object.freeze({
      kind: "create",
      entryKind,
      path: optionalPath(value.path, "Hodos Explorer create path"),
    });
  }
  if (type === "explorer/rename") {
    return Object.freeze({
      kind: "rename",
      path: normalizeExplorerPath(value.path, "Hodos Explorer rename path"),
      newPath: normalizeExplorerPath(value.newPath, "Hodos Explorer new path"),
    });
  }
  if (type === "explorer/delete") {
    return Object.freeze({ kind: "delete", path: normalizeExplorerPath(value.path, "Hodos Explorer delete path") });
  }
  if (type === "explorer/refresh") return Object.freeze({ kind: "refresh" });
  if (type === "explorer/filter") {
    if (typeof (value.query ?? "") !== "string") {
      throw new TypeError("Hodos Explorer filter query must be a string");
    }
    return Object.freeze({ kind: "filter", query: value.query ?? "" });
  }
  return null;
}
