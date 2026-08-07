export const HODOS_PROBLEMS_COMPONENT_ID = "hodos.dev/problems";
export const HODOS_PROBLEMS_AREA_ID = "problems/main";

const SEVERITIES = new Set(["all", "error", "warning", "info", "hint"]);

function eventType(value) {
  return value?.["event/type"] ?? value?.type ?? null;
}

function problemIdValue(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} requires a non-empty problem id`);
  }
  return value.trim();
}

export function problemsWorkspacePatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value["component/id"] !== HODOS_PROBLEMS_COMPONENT_ID) return null;
  if (value["area/id"] !== HODOS_PROBLEMS_AREA_ID) return null;

  const type = eventType(value);
  if (type === "problems/select") {
    return Object.freeze({ kind: "select", problemId: problemIdValue(value.problemId, "Hodos Problems select") });
  }
  if (type === "problems/open-source") {
    return Object.freeze({ kind: "open-source", problemId: problemIdValue(value.problemId, "Hodos Problems open-source") });
  }
  if (type === "problems/copy") {
    return Object.freeze({ kind: "copy", problemId: problemIdValue(value.problemId, "Hodos Problems copy") });
  }
  if (type === "problems/filter") {
    const severity = String(value.severity ?? "all");
    if (!SEVERITIES.has(severity)) throw new TypeError("Hodos Problems filter severity is invalid");
    if (typeof (value.query ?? "") !== "string") throw new TypeError("Hodos Problems filter query must be a string");
    return Object.freeze({ kind: "filter", severity, query: value.query ?? "" });
  }
  if (type === "problems/clear") return Object.freeze({ kind: "clear" });
  if (type === "problems/close") return Object.freeze({ kind: "close" });
  return null;
}
