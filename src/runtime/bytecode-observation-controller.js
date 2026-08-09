const DEFAULT_HOST_URL = new URL(
  "../../runtime/rust/host/bytecode-observation.js",
  import.meta.url,
);

export const BYTECODE_OBSERVATION_LIMITS = Object.freeze({
  stack: 32,
  locals: 32,
  calls: 32,
  handlers: 16,
  displayChars: 512,
});

export const BYTECODE_RETENTION_LIMITS = Object.freeze({
  events: 512,
  trace: 128,
});

export const BYTECODE_RUN_BATCH_SIZE = 1_000;

const STATUS_MAP = Object.freeze({
  ready: "connected",
  running: "running",
  paused: "paused",
  suspended: "suspended",
  returned: "returned",
  failed: "failed",
  disposed: "idle",
});

const TERMINAL_STATUSES = new Set(["returned", "failed", "suspended", "paused", "disposed"]);

const nonEmptyString = (value, label) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
};

const sourceText = (value, label) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
};

const positiveInteger = (value, label, fallback) => {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return resolved;
};

const jsonValue = (value, label = "value") => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new TypeError(`${label} must be JSON serializable: ${error.message}`);
  }
};

const defaultYieldControl = () => new Promise((resolve) => {
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => resolve());
    return;
  }
  globalThis.setTimeout(resolve, 0);
});

async function defaultLoadRuntime() {
  const module = await import(DEFAULT_HOST_URL.href);
  if (typeof module.loadBytecodeObservationRuntime !== "function") {
    throw new Error("The Hara observation host does not export loadBytecodeObservationRuntime");
  }
  return module.loadBytecodeObservationRuntime();
}

export function executionSourceVersion(source) {
  const input = String(source ?? "");
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${input.length}-${hash.toString(16).padStart(8, "0")}`;
}

export function mapBytecodeObservationStatus(status) {
  return STATUS_MAP[String(status ?? "")] ?? "failed";
}

export function createBytecodeObservationController({
  loadRuntime = defaultLoadRuntime,
  publish = () => {},
  reportDiagnostic = () => {},
  yieldControl = defaultYieldControl,
  runBatchSize = BYTECODE_RUN_BATCH_SIZE,
  observationLimits = BYTECODE_OBSERVATION_LIMITS,
  retentionLimits = BYTECODE_RETENTION_LIMITS,
} = {}) {
  if (typeof loadRuntime !== "function") throw new TypeError("loadRuntime must be a function");
  if (typeof publish !== "function") throw new TypeError("publish must be a function");
  if (typeof reportDiagnostic !== "function") throw new TypeError("reportDiagnostic must be a function");
  if (typeof yieldControl !== "function") throw new TypeError("yieldControl must be a function");

  const batchSize = positiveInteger(runBatchSize, "runBatchSize", BYTECODE_RUN_BATCH_SIZE);
  const normalizedObservationLimits = Object.freeze({ ...observationLimits });
  const normalizedRetentionLimits = Object.freeze({ ...retentionLimits });

  let runtime = null;
  let runtimePromise = null;
  let runtimeEpoch = 0;
  let session = null;
  let sourceIdentity = null;
  let generation = 0;
  let runToken = null;
  let stale = false;

  const safeSession = () => session == null ? null : Object.freeze({
    sessionId: session.sessionId,
    traceId: session.traceId,
    sourceId: session.sourceId,
    sequence: session.sequence,
    status: mapBytecodeObservationStatus(session.status),
  });

  const emit = (update) => {
    const payload = jsonValue({
      generation,
      runtimeLoaded: runtime != null,
      stale,
      sourceVersion: sourceIdentity?.sourceVersion ?? null,
      workspaceId: sourceIdentity?.workspaceId ?? null,
      session: safeSession(),
      ...update,
    }, "bytecode observation update");
    publish(Object.freeze(payload));
    return payload;
  };

  const diagnostic = (error, phase) => {
    const value = Object.freeze({
      code: typeof error?.code === "string" && error.code
        ? error.code
        : `bytecode-observation/${phase}`,
      message: error?.message || String(error),
      severity: "error",
      phase,
      sourceId: sourceIdentity?.sourceId ?? null,
      sessionId: session?.sessionId ?? null,
    });
    reportDiagnostic(value);
    emit({ kind: "diagnostic", diagnostic: value });
    try { error.executionDiagnosticReported = true; } catch { /* non-extensible errors remain safe */ }
    return error;
  };

  const cancelRun = () => {
    if (runToken) runToken.cancelled = true;
    runToken = null;
  };

  const requireSession = (phase, { allowStale = false } = {}) => {
    if (!session) throw diagnostic(new Error("Start an Execution session first"), phase);
    if (stale && !allowStale) {
      throw diagnostic(new Error("Execution is stale; press Start to compile the current source"), phase);
    }
    return session;
  };

  const ensureRuntime = async () => {
    if (runtime) return runtime;
    if (!runtimePromise) {
      const epoch = runtimeEpoch;
      const loading = Promise.resolve()
        .then(() => loadRuntime())
        .then((loaded) => {
          if (!loaded || typeof loaded.compileNamed !== "function" || typeof loaded.dispose !== "function") {
            throw new TypeError("The Hara observation loader returned an invalid runtime");
          }
          if (epoch !== runtimeEpoch) {
            loaded.dispose();
            return null;
          }
          runtime = loaded;
          return runtime;
        })
        .finally(() => {
          if (runtimePromise === loading) runtimePromise = null;
        });
      runtimePromise = loading;
    }
    return runtimePromise;
  };

  const terminalResult = () => {
    if (!session) return null;
    if (session.status === "returned") return session.resultDisplay();
    if (session.status === "failed") return session.errorMessage();
    return null;
  };

  const retainedEvidence = ({ trace = null, fullTrace = false, allowStale = false } = {}) => {
    const active = requireSession("evidence", { allowStale });
    const evidence = [active.metrics(), active.events()];
    if (trace != null) evidence.push(trace);
    if (fullTrace) evidence.push(active.trace());
    return evidence.map((value) => jsonValue(value, "bytecode observation evidence"));
  };

  const publishEvidence = (kind, options = {}) => emit({
    kind,
    evidence: retainedEvidence(options),
    result: terminalResult(),
  });

  const disposeCurrentSession = ({ reason = "replaced", emitUpdate = true } = {}) => {
    cancelRun();
    generation += 1;
    const previous = safeSession();
    if (session) {
      try {
        session.dispose();
      } catch (error) {
        reportDiagnostic(Object.freeze({
          code: error?.code || "bytecode-observation/dispose-session",
          message: error?.message || String(error),
          severity: "warning",
          phase: "dispose-session",
          sourceId: sourceIdentity?.sourceId ?? null,
          sessionId: session?.sessionId ?? null,
        }));
      }
    }
    session = null;
    sourceIdentity = null;
    stale = false;
    if (emitUpdate) emit({ kind: "session-disposed", reason, previousSession: previous });
    return previous != null;
  };

  async function startExecution({
    source,
    sourceId,
    sourceVersion = executionSourceVersion(source),
    workspaceId = null,
  } = {}) {
    const normalizedSource = sourceText(source, "Execution source");
    const normalizedSourceId = nonEmptyString(sourceId, "Execution source id");
    const normalizedVersion = nonEmptyString(sourceVersion, "Execution source version");
    const normalizedWorkspace = workspaceId == null ? null : nonEmptyString(workspaceId, "Execution workspace id");

    disposeCurrentSession({ reason: "start-replaced", emitUpdate: false });
    stale = false;
    sourceIdentity = Object.freeze({
      sourceId: normalizedSourceId,
      sourceVersion: normalizedVersion,
      workspaceId: normalizedWorkspace,
    });
    const startGeneration = generation;

    try {
      const activeRuntime = await ensureRuntime();
      if (startGeneration !== generation || sourceIdentity?.sourceVersion !== normalizedVersion) {
        return null;
      }
      const sessionId = `playground/execution-${generation}`;
      session = activeRuntime.compileNamed(sessionId, normalizedSourceId, normalizedSource);
      session.setObservationLimits(normalizedObservationLimits);
      session.setRetentionLimits(normalizedRetentionLimits);
      const snapshot = jsonValue(session.snapshot(), "bytecode observation snapshot");
      return emit({
        kind: "started",
        snapshot,
        evidence: retainedEvidence(),
        result: terminalResult(),
      });
    } catch (error) {
      if (session) {
        try { session.dispose(); } catch { /* best effort after failed start */ }
      }
      session = null;
      if (startGeneration !== generation) return null;
      throw diagnostic(error, "start");
    }
  }

  async function stepExecution() {
    try {
      const active = requireSession("step");
      const trace = active.step();
      return publishEvidence("step", { trace });
    } catch (error) {
      if (error?.executionDiagnosticReported || error?.code?.startsWith?.("bytecode-observation/") || error?.message?.includes("stale")) throw error;
      throw diagnostic(error, "step");
    }
  }

  async function runExecution() {
    try {
      const active = requireSession("run");
      if (runToken) return null;
      const token = { generation, cancelled: false, paused: false };
      runToken = token;
      let latest = null;

      while (!token.cancelled && !token.paused && token.generation === generation) {
        const trace = active.run(batchSize);
        latest = publishEvidence("run-batch", { trace });
        if (TERMINAL_STATUSES.has(active.status) || token.paused) break;
        await yieldControl();
      }

      if (runToken === token) runToken = null;
      return latest;
    } catch (error) {
      cancelRun();
      if (error?.executionDiagnosticReported || error?.code?.startsWith?.("bytecode-observation/") || error?.message?.includes("stale")) throw error;
      throw diagnostic(error, "run");
    }
  }

  async function pauseExecution() {
    try {
      const active = requireSession("pause");
      if (runToken) runToken.paused = true;
      active.pause();
      return publishEvidence("paused");
    } catch (error) {
      if (error?.executionDiagnosticReported || error?.code?.startsWith?.("bytecode-observation/") || error?.message?.includes("stale")) throw error;
      throw diagnostic(error, "pause");
    }
  }

  async function resumeExecution(settlement = null) {
    try {
      const active = requireSession("resume");
      if (active.status === "suspended" && settlement == null) {
        throw new Error("Suspended Hara execution requires an explicit application settlement");
      }
      const trace = active.resume(settlement);
      return publishEvidence("resumed", { trace });
    } catch (error) {
      if (error?.executionDiagnosticReported || error?.code?.startsWith?.("bytecode-observation/") || error?.message?.includes("stale")) throw error;
      throw diagnostic(error, "resume");
    }
  }

  async function resetExecution() {
    try {
      const active = requireSession("reset");
      cancelRun();
      const snapshot = jsonValue(active.reset(), "bytecode observation reset snapshot");
      return emit({
        kind: "reset",
        snapshot,
        evidence: retainedEvidence(),
        result: null,
      });
    } catch (error) {
      if (error?.executionDiagnosticReported || error?.code?.startsWith?.("bytecode-observation/") || error?.message?.includes("stale")) throw error;
      throw diagnostic(error, "reset");
    }
  }

  async function requestExecutionTrace() {
    try {
      requireSession("request-trace", { allowStale: true });
      return publishEvidence("full-trace", { fullTrace: true, allowStale: true });
    } catch (error) {
      if (error?.executionDiagnosticReported || error?.code?.startsWith?.("bytecode-observation/") || error?.message?.includes("stale")) throw error;
      throw diagnostic(error, "request-trace");
    }
  }

  function markExecutionStale({ sourceId, sourceVersion } = {}) {
    if (!sourceIdentity) return false;
    const nextSourceId = sourceId == null ? sourceIdentity.sourceId : String(sourceId);
    const nextVersion = sourceVersion == null ? sourceIdentity.sourceVersion : String(sourceVersion);
    if (nextSourceId !== sourceIdentity.sourceId || nextVersion === sourceIdentity.sourceVersion) return false;
    stale = true;
    cancelRun();
    generation += 1;
    if (session?.status === "running") {
      try { session.pause(); } catch { /* staleness still wins */ }
    }
    emit({ kind: "stale", currentSourceVersion: nextVersion, pending: session == null });
    return true;
  }

  function disposeSession(reason = "application-teardown") {
    return disposeCurrentSession({ reason, emitUpdate: true });
  }

  function disposeExecution(reason = "application-teardown") {
    const hadSession = disposeCurrentSession({ reason, emitUpdate: false });
    const hadRuntime = runtime != null || runtimePromise != null;
    runtimeEpoch += 1;
    if (runtime) {
      try {
        runtime.dispose();
      } catch (error) {
        reportDiagnostic(Object.freeze({
          code: error?.code || "bytecode-observation/dispose-runtime",
          message: error?.message || String(error),
          severity: "warning",
          phase: "dispose-runtime",
          sourceId: null,
          sessionId: null,
        }));
      }
    }
    runtime = null;
    runtimePromise = null;
    emit({ kind: "disposed", reason });
    return hadSession || hadRuntime;
  }

  function inspect() {
    return Object.freeze({
      generation,
      runtimeLoaded: runtime != null,
      sessionActive: session != null,
      running: runToken != null,
      stale,
      sourceIdentity: sourceIdentity == null ? null : { ...sourceIdentity },
      session: safeSession(),
    });
  }

  return Object.freeze({
    startExecution,
    stepExecution,
    runExecution,
    pauseExecution,
    resumeExecution,
    resetExecution,
    requestExecutionTrace,
    markExecutionStale,
    disposeSession,
    disposeExecution,
    inspect,
  });
}
