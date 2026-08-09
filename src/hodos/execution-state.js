import {
  createExecutionArea,
  createExecutionState,
  ingestExecutionEvidence,
  selectExecutionState,
} from "@greenways/hodos-dev";

export const PLAYGROUND_EXECUTION_AREA_ID = "execution/main";
export const PLAYGROUND_EXECUTION_LIMITS = Object.freeze({
  events: 512,
  trace: 128,
  diagnostics: 64,
});

const objectValue = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
};

const optionalString = (value, label) => {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
};

const diagnosticValue = (value) => {
  const diagnostic = objectValue(value, "Playground Execution diagnostic");
  return Object.freeze({
    code: optionalString(diagnostic.code, "Playground Execution diagnostic code"),
    message: optionalString(diagnostic.message, "Playground Execution diagnostic message")
      ?? "Execution failed",
    severity: optionalString(diagnostic.severity, "Playground Execution diagnostic severity")
      ?? "error",
    evidence: diagnostic.evidence ?? null,
  });
};

const metadataValue = (state, overrides = {}) => Object.freeze({
  sourceId: state.sourceId,
  sourceVersion: state.sourceVersion,
  currentSourceId: state.currentSourceId,
  currentSourceVersion: state.currentSourceVersion,
  workspaceId: state.workspaceId,
  stale: state.stale,
  runtimeLoaded: state.runtimeLoaded,
  result: state.result,
  generation: state.generation,
  ...overrides,
});

const capabilitiesFor = (state, status = state.model.session.status) => {
  const hasSession = state.model.session.id != null;
  const runnable = hasSession
    && !state.stale
    && !state.busy
    && new Set(["connected", "running"]).has(status);
  return Object.freeze({
    start: state.sourceAvailable && !state.busy,
    step: runnable,
    run: runnable,
    pause: hasSession && !state.stale && status === "running",
    resume: hasSession && !state.stale && !state.busy && status === "paused",
    reset: hasSession && !state.stale && !state.busy,
    requestTrace: hasSession && !state.busy,
  });
};

const rebuildModel = (state, {
  model = state.model,
  status = model.session.status,
  diagnostics = state.diagnostics,
  metadata = metadataValue(state),
} = {}) => createExecutionState({
  sessionId: model.session.id,
  traceId: model.session.traceId,
  sourceId: model.session.sourceId,
  documentSequence: model.session.sequence,
  status,
  metrics: model.evidence.metrics,
  compactEvents: model.evidence.events,
  traceSteps: model.evidence.trace,
  eventsOmitted: model.retention.eventsOmitted,
  traceOmitted: model.retention.traceOmitted,
  droppedEvents: model.retention.droppedEvents,
  droppedTrace: model.retention.droppedTrace,
  selection: model.selection,
  capabilities: capabilitiesFor({ ...state, model }, status),
  limits: model.retention.limits,
  diagnostics,
  metadata,
});

const freezeState = (state) => Object.freeze({
  ...state,
  diagnostics: Object.freeze([...state.diagnostics]),
});

export function createPlaygroundExecutionState({
  currentSourceId = null,
  currentSourceVersion = null,
  workspaceId = null,
  sourceAvailable = false,
} = {}) {
  const initial = {
    model: createExecutionState({ limits: PLAYGROUND_EXECUTION_LIMITS }),
    sourceId: null,
    sourceVersion: null,
    currentSourceId: optionalString(currentSourceId, "Playground Execution current source id"),
    currentSourceVersion: optionalString(
      currentSourceVersion,
      "Playground Execution current source version",
    ),
    workspaceId: optionalString(workspaceId, "Playground Execution workspace id"),
    sourceAvailable: Boolean(sourceAvailable),
    stale: false,
    runtimeLoaded: false,
    busy: false,
    result: null,
    generation: 0,
    diagnostics: [],
  };
  initial.model = rebuildModel(initial);
  return freezeState(initial);
}

export function withExecutionEnvironment(state, {
  currentSourceId = null,
  currentSourceVersion = null,
  workspaceId = null,
  sourceAvailable = false,
} = {}) {
  const current = objectValue(state, "Playground Execution state");
  const next = {
    ...current,
    currentSourceId: optionalString(currentSourceId, "Playground Execution current source id"),
    currentSourceVersion: optionalString(
      currentSourceVersion,
      "Playground Execution current source version",
    ),
    workspaceId: optionalString(workspaceId, "Playground Execution workspace id"),
    sourceAvailable: Boolean(sourceAvailable),
  };
  next.model = rebuildModel(next, { metadata: metadataValue(next) });
  return freezeState(next);
}

export function setExecutionBusy(state, busy) {
  const current = objectValue(state, "Playground Execution state");
  const next = { ...current, busy: Boolean(busy) };
  next.model = rebuildModel(next, { metadata: metadataValue(next) });
  return freezeState(next);
}

export function appendExecutionDiagnostic(state, diagnostic) {
  const current = objectValue(state, "Playground Execution state");
  const nextDiagnostics = [...current.diagnostics, diagnosticValue(diagnostic)]
    .slice(-PLAYGROUND_EXECUTION_LIMITS.diagnostics);
  const next = { ...current, diagnostics: nextDiagnostics };
  next.model = rebuildModel(next, {
    diagnostics: nextDiagnostics,
    metadata: metadataValue(next),
  });
  return freezeState(next);
}

const freshSessionModel = (state, update) => createExecutionState({
  sessionId: update.session?.sessionId ?? null,
  traceId: update.session?.traceId ?? null,
  sourceId: update.session?.sourceId ?? null,
  status: update.session?.status ?? "idle",
  limits: state.model.retention.limits,
  diagnostics: state.diagnostics,
  metadata: metadataValue(state),
});

export function applyExecutionControllerUpdate(state, update) {
  const current = objectValue(state, "Playground Execution state");
  const value = objectValue(update, "Playground Execution controller update");

  if (value.kind === "diagnostic") {
    return appendExecutionDiagnostic(current, value.diagnostic);
  }

  if (value.kind === "session-disposed" || value.kind === "disposed") {
    const cleared = {
      ...current,
      model: createExecutionState({
        limits: current.model.retention.limits,
        diagnostics: current.diagnostics,
      }),
      sourceId: null,
      sourceVersion: null,
      stale: false,
      runtimeLoaded: Boolean(value.runtimeLoaded),
      busy: false,
      result: null,
      generation: Number.isSafeInteger(value.generation) ? value.generation : current.generation,
    };
    cleared.model = rebuildModel(cleared, { metadata: metadataValue(cleared) });
    return freezeState(cleared);
  }

  const startsTrace = value.kind === "started" || value.kind === "reset";
  const hasNewSession = value.session?.sessionId != null
    && value.session.sessionId !== current.model.session.id;
  let model = startsTrace || hasNewSession
    ? freshSessionModel(current, value)
    : current.model;

  for (const evidence of Array.isArray(value.evidence) ? value.evidence : []) {
    model = ingestExecutionEvidence(model, evidence);
  }

  const next = {
    ...current,
    model,
    sourceId: value.session?.sourceId ?? current.sourceId,
    sourceVersion: value.sourceVersion ?? current.sourceVersion,
    workspaceId: value.workspaceId ?? current.workspaceId,
    stale: Boolean(value.stale),
    runtimeLoaded: Boolean(value.runtimeLoaded),
    result: value.result ?? (startsTrace ? null : current.result),
    generation: Number.isSafeInteger(value.generation) ? value.generation : current.generation,
  };
  const status = value.kind === "stale"
    ? "connected"
    : value.session?.status ?? model.session.status;
  next.model = rebuildModel(next, {
    model,
    status,
    metadata: metadataValue(next),
  });
  return freezeState(next);
}

export function markPlaygroundExecutionStale(state, currentSourceVersion = null) {
  const current = objectValue(state, "Playground Execution state");
  if (current.model.session.id == null || current.stale) return current;
  const next = {
    ...current,
    stale: true,
    currentSourceVersion: optionalString(
      currentSourceVersion ?? current.currentSourceVersion,
      "Playground Execution current source version",
    ),
  };
  next.model = rebuildModel(next, {
    status: "connected",
    metadata: metadataValue(next),
  });
  return freezeState(next);
}

export function selectPlaygroundExecution(state, selection) {
  const current = objectValue(state, "Playground Execution state");
  const next = {
    ...current,
    model: selectExecutionState(current.model, selection),
  };
  next.model = rebuildModel(next, { metadata: metadataValue(next) });
  return freezeState(next);
}

export function executionAreaFromPlayground(state) {
  const current = objectValue(state, "Playground Execution state");
  return createExecutionArea({
    id: PLAYGROUND_EXECUTION_AREA_ID,
    title: "Execution",
    state: current.model,
  });
}

export function executionStateIsSerializable(state) {
  try {
    JSON.stringify(state);
    const visit = (value) => {
      if (value == null || ["string", "number", "boolean"].includes(typeof value)) return true;
      if (typeof value !== "object") return false;
      if (Array.isArray(value)) return value.every(visit);
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return false;
      return Object.values(value).every(visit);
    };
    return visit(state);
  } catch {
    return false;
  }
}
