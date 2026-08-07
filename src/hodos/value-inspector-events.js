export const HODOS_VALUE_INSPECTOR_COMPONENT_ID = "hodos.dev/value-inspector";
export const HODOS_VALUE_INSPECTOR_AREA_ID = "value/main";

function eventType(value) {
  return value?.["event/type"] ?? value?.type ?? null;
}

function pathValue(value = []) {
  if (!Array.isArray(value)) throw new TypeError("Hodos Value Inspector path must be an array");
  return Object.freeze(value.map((segment, index) => {
    if (typeof segment === "string") return segment;
    if (Number.isSafeInteger(segment) && segment >= 0) return segment;
    throw new TypeError(`Hodos Value Inspector path segment ${index} is invalid`);
  }));
}

export function valueInspectorWorkspacePatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value["component/id"] !== HODOS_VALUE_INSPECTOR_COMPONENT_ID) return null;
  if (value["area/id"] !== HODOS_VALUE_INSPECTOR_AREA_ID) return null;

  const type = eventType(value);
  if (type === "value/select") return Object.freeze({ kind: "select", path: pathValue(value.path) });
  if (type === "value/toggle") return Object.freeze({ kind: "toggle", path: pathValue(value.path) });
  if (type === "value/copy") return Object.freeze({ kind: "copy", path: pathValue(value.path) });
  if (type === "value/refresh") return Object.freeze({ kind: "refresh" });
  if (type === "value/close") return Object.freeze({ kind: "close" });
  return null;
}
