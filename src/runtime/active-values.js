const NAMESPACE_PATTERN = /\(ns\s+([A-Za-z][A-Za-z0-9_.-]*)/;
const SYMBOL_PATTERN = /^[A-Za-z][A-Za-z0-9_.?*!+\-]*$/;
const KEYWORD_PATTERN = /^:[A-Za-z][A-Za-z0-9_.?*!+\/-]*$/;

export function clamp(minimum, maximum, value) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function boundedNumber(value, fallback, minimum, maximum) {
  return clamp(minimum, maximum, finiteNumber(value, fallback));
}

export function boundedInteger(value, fallback, minimum, maximum) {
  return Math.round(boundedNumber(value, fallback, minimum, maximum));
}

export function normalizeKeyword(value) {
  const text = String(value ?? "");
  return text.startsWith(":") ? text.slice(1) : text;
}

function plainKey(value) {
  if (typeof value === "string") return normalizeKeyword(value);
  if (value?.constructor?.name === "HtaKeyword" && typeof value.name === "string") return value.name;
  return normalizeKeyword(value);
}

export function toPlainActiveValue(value, seen = new WeakSet()) {
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value)) throw new Error("active/value-cycle");
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => toPlainActiveValue(item, seen));
    if (value instanceof Map) {
      return Object.fromEntries(
        [...value.entries()].map(([key, entry]) => [plainKey(key), toPlainActiveValue(entry, seen)])
      );
    }
    if (value?.constructor?.name === "HtaKeyword" && typeof value.name === "string") {
      return `:${value.name}`;
    }
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      output[plainKey(key)] = toPlainActiveValue(entry, seen);
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

export function cloneActiveValue(value) {
  return toPlainActiveValue(value);
}

function keywordLiteral(key) {
  const normalized = normalizeKeyword(key);
  if (!SYMBOL_PATTERN.test(normalized)) {
    throw new Error(`active/map-key-invalid:${normalized}`);
  }
  return `:${normalized}`;
}

export function toHaraLiteral(value, seen = new WeakSet()) {
  if (value == null) return "nil";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("active/number-invalid");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "string") {
    return KEYWORD_PATTERN.test(value) ? value : JSON.stringify(value);
  }
  if (typeof value !== "object") throw new Error(`active/value-unsupported:${typeof value}`);
  if (seen.has(value)) throw new Error("active/value-cycle");
  seen.add(value);
  try {
    if (Array.isArray(value)) return `[${value.map((item) => toHaraLiteral(item, seen)).join(" ")}]`;
    const plain = toPlainActiveValue(value);
    if (plain == null || typeof plain !== "object") return toHaraLiteral(plain, seen);
    return `{${Object.entries(plain)
      .map(([key, entry]) => `${keywordLiteral(key)} ${toHaraLiteral(entry, seen)}`)
      .join(" ")}}`;
  } finally {
    seen.delete(value);
  }
}

function safeNamespace(value, fallback = "active.loop") {
  const namespace = String(value || fallback).replace(/[^A-Za-z0-9_.-]/g, "-");
  return /^[A-Za-z]/.test(namespace) ? namespace : `active.${namespace}`;
}

export function stageActiveSource(source, {
  namespace = "active.loop",
  entry = "controller",
  attempt = 1,
} = {}) {
  const text = String(source || "").trim();
  if (!text) throw new Error("active/source-required");
  const entryName = String(entry || "controller");
  if (!SYMBOL_PATTERN.test(entryName)) throw new Error(`active/entry-invalid:${entryName}`);
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new Error("active/attempt-invalid");

  const declared = text.match(NAMESPACE_PATTERN)?.[1] || null;
  const base = safeNamespace(declared || namespace);
  const stagingNamespace = `${base}.active.v${attempt}`;
  const stagedSource = declared
    ? text.replace(NAMESPACE_PATTERN, `(ns ${stagingNamespace}`)
    : `(ns ${stagingNamespace})\n\n${text}`;

  return Object.freeze({
    source: stagedSource,
    namespace: stagingNamespace,
    entry: entryName,
    qualifiedEntry: `${stagingNamespace}/${entryName}`,
  });
}

export function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export { SYMBOL_PATTERN };
