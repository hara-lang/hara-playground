export const HODOS_EDITOR_COMPONENT_ID = "hodos.dev/editor";
export const HODOS_EDITOR_AREA_ID = "editor/main";

function eventType(value) {
  return value?.["event/type"] ?? value?.type ?? null;
}

function normalizeSelection(value, sourceLength) {
  const maximum = Math.max(0, Number(sourceLength) || 0);
  const rawStart = Number(value?.start ?? 0);
  const rawEnd = Number(value?.end ?? rawStart);
  if (!Number.isSafeInteger(rawStart) || !Number.isSafeInteger(rawEnd)) {
    throw new TypeError("Hodos Editor selection offsets must be integers");
  }
  const start = Math.max(0, Math.min(rawStart, maximum));
  const end = Math.max(start, Math.min(rawEnd, maximum));
  return Object.freeze({ start, end });
}

/**
 * Validate and normalize the Hodos Editor event projected into Play.
 *
 * The function is deliberately pure: Hodos supplies semantic component events,
 * while the Play controller decides how those events affect application
 * state, persistence, completion, and InstaREPL scheduling.
 */
export function editorWorkspacePatch(value, currentSource = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value["component/id"] !== HODOS_EDITOR_COMPONENT_ID) return null;
  if (value["area/id"] !== HODOS_EDITOR_AREA_ID) return null;

  const type = eventType(value);
  if (type === "editor/change") {
    if (typeof value.source !== "string") {
      throw new TypeError("Hodos Editor change events require string source");
    }
    return Object.freeze({
      kind: "change",
      source: value.source,
      selection: normalizeSelection(value.selection, value.source.length),
    });
  }
  if (type === "editor/selection") {
    return Object.freeze({
      kind: "selection",
      selection: normalizeSelection(value.selection, String(currentSource).length),
    });
  }
  return null;
}
