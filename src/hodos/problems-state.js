const MAX_PROBLEMS = 300;
const SEVERITIES = new Set(["error", "warning", "info", "hint"]);
const STATUSES = new Set(["idle", "collecting", "ready", "error"]);

function optionalString(value) {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

function severityValue(value, fallback = "error") {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (normalized === "warn") return "warning";
  if (normalized === "information") return "info";
  return SEVERITIES.has(normalized) ? normalized : fallback;
}

function pointValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const line = Number(value.line ?? value.row ?? 0);
  const column = Number(value.column ?? value.col ?? 0);
  const offset = value.offset == null ? null : Number(value.offset);
  if (!Number.isSafeInteger(line) || line < 0 || !Number.isSafeInteger(column) || column < 0) return null;
  if (offset != null && (!Number.isSafeInteger(offset) || offset < 0)) return null;
  return Object.freeze({ line, column, offset });
}

function rangeValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const start = pointValue(value.start ?? value);
  const end = pointValue(value.end ?? value.start ?? value);
  if (!start || !end) return null;
  const before = end.line < start.line
    || (end.line === start.line && end.column < start.column)
    || (start.offset != null && end.offset != null && end.offset < start.offset);
  return before ? null : Object.freeze({ start, end });
}

function tagsValue(value = []) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze([
    ...new Set(value.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim())),
  ]);
}

function metadataValue(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry == null || ["string", "number", "boolean"].includes(typeof entry)) output[key] = entry;
  }
  return Object.freeze(output);
}

function normalizedProblem(value, id) {
  const message = optionalString(value?.message ?? value?.text) || "Unknown problem";
  return Object.freeze({
    id,
    severity: severityValue(value?.severity, "error"),
    message,
    code: optionalString(value?.code),
    source: optionalString(value?.source),
    path: optionalString(value?.path),
    namespace: optionalString(value?.namespace),
    requestId: optionalString(value?.requestId),
    range: rangeValue(value?.range),
    tags: tagsValue(value?.tags),
    metadata: metadataValue(value?.metadata),
  });
}

export function createProblemsState({
  sequence = 0,
  status = "idle",
  entries = [],
  selectedId = null,
  severity = "all",
  query = "",
} = {}) {
  status = STATUSES.has(status) ? status : "idle";
  severity = severity === "all" || SEVERITIES.has(severity) ? severity : "all";
  query = typeof query === "string" ? query : "";
  const projected = Object.freeze(Array.isArray(entries) ? [...entries] : []);
  const selected = projected.some((entry) => entry.id === selectedId) ? selectedId : null;
  return Object.freeze({
    sequence: Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0,
    status,
    entries: projected,
    selectedId: selected,
    severity,
    query,
  });
}

export function resetProblemsState(current, { status = "idle" } = {}) {
  return createProblemsState({
    sequence: current?.sequence ?? 0,
    status,
    severity: current?.severity ?? "all",
    query: current?.query ?? "",
  });
}

export function setProblemsStatus(current, status) {
  return createProblemsState({ ...current, status });
}

export function appendProblemState(current, problem) {
  const sequence = Number(current?.sequence ?? 0) + 1;
  const id = optionalString(problem?.id) || `problem/${sequence}`;
  const entry = normalizedProblem(problem, id);
  const entries = [...(current?.entries ?? []), entry].slice(-MAX_PROBLEMS);
  return createProblemsState({
    ...current,
    sequence,
    status: "ready",
    entries,
    selectedId: entries.some((candidate) => candidate.id === current?.selectedId)
      ? current.selectedId
      : null,
  });
}

export function clearProblemsState(current) {
  return resetProblemsState(current, { status: "idle" });
}

export function filterProblemsState(current, { severity, query }) {
  return createProblemsState({
    ...current,
    severity: severity ?? current?.severity,
    query: query ?? current?.query,
  });
}

export function selectProblemState(current, problemId) {
  return createProblemsState({ ...current, selectedId: problemId });
}

export function problemById(current, problemId) {
  return current?.entries?.find((problem) => problem.id === problemId) || null;
}

function diagnosticValue(detail) {
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    return detail.diagnostic && typeof detail.diagnostic === "object" ? detail.diagnostic : detail;
  }
  return { text: detail };
}

export function problemFromDiagnostic(detail, context = {}) {
  const value = diagnosticValue(detail);
  const candidateRange = value.range
    ?? ((value.start || value.end) ? { start: value.start, end: value.end } : null);
  return Object.freeze({
    severity: severityValue(value.severity ?? value.level, "warning"),
    message: optionalString(value.message ?? value.text) || "Runtime diagnostic",
    code: optionalString(value.code),
    source: optionalString(context.source ?? value.source) || "runtime",
    path: optionalString(context.path ?? value.path),
    namespace: optionalString(context.namespace ?? value.namespace),
    requestId: optionalString(context.requestId ?? value.requestId ?? value.id),
    range: rangeValue(candidateRange),
    tags: tagsValue(value.tags ?? context.tags),
    metadata: metadataValue({
      phase: context.phase ?? null,
      runtimeKind: context.runtimeKind ?? null,
    }),
  });
}

export function problemFromError(error, context = {}) {
  const data = error?.data && typeof error.data === "object" ? error.data : {};
  return Object.freeze({
    severity: "error",
    message: optionalString(error?.message) || String(error || "Runtime error"),
    code: optionalString(context.code ?? data.code ?? error?.code ?? error?.name),
    source: optionalString(context.source ?? data.source) || "runtime",
    path: optionalString(context.path ?? data.path),
    namespace: optionalString(context.namespace ?? data.namespace),
    requestId: optionalString(context.requestId ?? data.requestId ?? data.id),
    range: rangeValue(context.range ?? data.range),
    tags: tagsValue(context.tags),
    metadata: metadataValue({
      phase: context.phase ?? null,
      runtimeKind: context.runtimeKind ?? null,
      errorName: optionalString(error?.name),
    }),
  });
}

function offsetAt(source, position) {
  const text = String(source ?? "");
  if (Number.isSafeInteger(position?.offset)) {
    return Math.max(0, Math.min(position.offset, text.length));
  }
  const lines = text.split("\n");
  const line = Math.max(0, Math.min(Number(position?.line ?? 0), lines.length - 1));
  let offset = 0;
  for (let index = 0; index < line; index += 1) offset += lines[index].length + 1;
  const column = Math.max(0, Math.min(Number(position?.column ?? 0), lines[line]?.length ?? 0));
  return Math.min(text.length, offset + column);
}

export function problemSelectionOffsets(problem, source) {
  if (!problem?.range) return null;
  const start = offsetAt(source, problem.range.start);
  const end = Math.max(start, offsetAt(source, problem.range.end));
  return Object.freeze({ start, end });
}

export function formatProblemForClipboard(problem) {
  if (!problem) return "";
  const location = problem.path
    ? `${problem.path}${problem.range ? `:${problem.range.start.line + 1}:${problem.range.start.column + 1}` : ""}`
    : null;
  return [
    `${problem.severity.toUpperCase()}${problem.code ? ` ${problem.code}` : ""}`,
    problem.message,
    location,
  ].filter(Boolean).join("\n");
}
