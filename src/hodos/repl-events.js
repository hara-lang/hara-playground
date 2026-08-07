export const HODOS_REPL_COMPONENT_ID = "hodos.dev/repl";
export const HODOS_REPL_AREA_ID = "repl/main";

function eventType(value) {
  return value?.["event/type"] ?? value?.type ?? null;
}

function sourceValue(value, label) {
  if (typeof value !== "string") throw new TypeError(`${label} requires string source`);
  return value;
}

function identifierValue(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} requires a non-empty string`);
  }
  return value.trim();
}

export function replWorkspacePatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value["component/id"] !== HODOS_REPL_COMPONENT_ID) return null;
  if (value["area/id"] !== HODOS_REPL_AREA_ID) return null;

  const type = eventType(value);
  if (type === "repl/input") {
    return Object.freeze({ kind: "input", source: sourceValue(value.source, "Hodos REPL input") });
  }
  if (type === "repl/submit") {
    return Object.freeze({ kind: "submit", source: sourceValue(value.source, "Hodos REPL submit") });
  }
  if (type === "repl/inspect") {
    return Object.freeze({
      kind: "inspect",
      valueId: identifierValue(value.valueId, "Hodos REPL inspect"),
    });
  }
  if (type === "repl/clear") return Object.freeze({ kind: "clear" });
  if (type === "repl/cancel") return Object.freeze({ kind: "cancel" });
  if (type === "repl/history") {
    const direction = Number(value.direction);
    if (direction !== -1 && direction !== 1) {
      throw new TypeError("Hodos REPL history direction must be -1 or 1");
    }
    return Object.freeze({ kind: "history", direction });
  }
  return null;
}
