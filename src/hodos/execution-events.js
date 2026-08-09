export const HODOS_EXECUTION_COMPONENT_ID = "hodos.dev/execution";
export const HODOS_EXECUTION_AREA_ID = "execution/main";
export const HODOS_EDITOR_COMPONENT_ID = "hodos.dev/editor";
export const HODOS_EDITOR_AREA_ID = "editor/main";

const EXECUTION_EVENTS = new Set([
  "execution/start",
  "execution/step",
  "execution/run",
  "execution/pause",
  "execution/resume",
  "execution/reset",
  "execution/request-trace",
  "execution/select",
]);

const eventType = (value) => value?.["event/type"] ?? value?.type ?? null;

const optionalString = (value, label) => {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
};

const optionalInteger = (value, label) => {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
  return number;
};

const sourcePosition = (value) => {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Hodos Execution source position must be an object");
  }
  return Object.freeze({
    sourceId: optionalString(value.sourceId ?? value.source_id, "Hodos Execution source id"),
    offset: optionalInteger(value.offset, "Hodos Execution source offset"),
    line: optionalInteger(value.line, "Hodos Execution source line"),
    column: optionalInteger(value.column, "Hodos Execution source column"),
  });
};

export function executionWorkspacePatch(value, {
  sessionId = null,
  generation = 0,
  stale = false,
} = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value["component/id"] !== HODOS_EXECUTION_COMPONENT_ID) return null;
  if (value["area/id"] !== HODOS_EXECUTION_AREA_ID) return null;

  const type = eventType(value);
  if (!EXECUTION_EVENTS.has(type)) return null;

  const currentSessionId = optionalString(sessionId, "current Execution session id");
  const requestedSessionId = optionalString(value.sessionId, "Hodos Execution event session id");
  if (type === "execution/start") {
    if (
      currentSessionId != null
      && requestedSessionId != null
      && requestedSessionId !== currentSessionId
    ) {
      throw new Error("Hodos Execution Start targets a stale session identity");
    }
  } else {
    if (currentSessionId == null) {
      throw new Error(`${type} requires an active Execution session`);
    }
    if (requestedSessionId !== currentSessionId) {
      throw new Error(`${type} targets a stale Execution session`);
    }
    if (stale && !new Set(["execution/select", "execution/request-trace"]).has(type)) {
      throw new Error("Execution is stale; press Start before controlling it again");
    }
  }

  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new TypeError("Playground Execution generation must be a non-negative integer");
  }

  const patch = {
    kind: type.slice("execution/".length),
    sessionId: requestedSessionId,
    generation,
  };

  if (type === "execution/select" || type === "execution/request-trace") {
    patch.function = optionalInteger(value.function, "Hodos Execution function");
    patch.ip = optionalInteger(value.ip, "Hodos Execution instruction");
  }
  if (type === "execution/select") {
    patch.eventIndex = optionalInteger(value.eventIndex, "Hodos Execution event index");
    patch.traceIndex = optionalInteger(value.traceIndex, "Hodos Execution trace index");
    patch.source = sourcePosition(value.source);
  }

  return Object.freeze(patch);
}

export function editorSelectionEventFromExecution(value, {
  sourceId,
  sourceLength,
} = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Execution source selection must be an object");
  }
  const currentSourceId = optionalString(sourceId, "current editor source id");
  const requestedSourceId = optionalString(value.sourceId, "Execution selection source id");
  if (currentSourceId == null || requestedSourceId !== currentSourceId) {
    throw new Error("Execution selection does not target the currently compiled source");
  }

  const maximum = Number(sourceLength ?? 0);
  if (!Number.isSafeInteger(maximum) || maximum < 0) {
    throw new TypeError("current editor source length must be a non-negative integer");
  }
  const start = optionalInteger(value.start, "Execution selection start");
  const end = optionalInteger(value.end ?? start, "Execution selection end");
  if (start == null || end == null || start > end || end > maximum) {
    throw new RangeError("Execution selection is outside the current editor source");
  }

  return Object.freeze({
    "event/type": "editor/selection",
    "component/id": HODOS_EDITOR_COMPONENT_ID,
    "area/id": HODOS_EDITOR_AREA_ID,
    selection: Object.freeze({ start, end }),
    sourceId: requestedSourceId,
    source: value.source ?? null,
    boundary: value.boundary ?? null,
  });
}
