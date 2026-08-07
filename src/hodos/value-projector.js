const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_ENTRIES = 200;

export function inspectableType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (value instanceof Map) return "map";
  if (value instanceof Set) return "set";
  return typeof value;
}

export function projectInspectableValue(
  value,
  { maxDepth = DEFAULT_MAX_DEPTH, maxEntries = DEFAULT_MAX_ENTRIES } = {},
  depth = 0,
  ancestors = new WeakSet(),
) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "undefined") return "<undefined>";
  if (typeof value === "symbol" || typeof value === "function") return String(value);
  if (depth >= maxDepth) return "[Maximum inspection depth]";
  if (ancestors.has(value)) return "[Circular]";

  ancestors.add(value);
  try {
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Map) {
      return projectInspectableValue(
        Object.fromEntries([...value.entries()].map(([key, entry]) => [String(key), entry])),
        { maxDepth, maxEntries },
        depth + 1,
        ancestors,
      );
    }
    if (value instanceof Set) {
      return projectInspectableValue(
        [...value.values()],
        { maxDepth, maxEntries },
        depth + 1,
        ancestors,
      );
    }
    if (Array.isArray(value)) {
      const selected = value.slice(0, maxEntries).map((entry) =>
        projectInspectableValue(entry, { maxDepth, maxEntries }, depth + 1, ancestors));
      if (value.length > maxEntries) selected.push(`[${value.length - maxEntries} more values]`);
      return selected;
    }

    const output = {};
    const entries = Object.entries(value).slice(0, maxEntries);
    for (const [key, entry] of entries) {
      output[key] = projectInspectableValue(
        entry,
        { maxDepth, maxEntries },
        depth + 1,
        ancestors,
      );
    }
    const total = Object.keys(value).length;
    if (total > maxEntries) output["…"] = `[${total - maxEntries} more entries]`;
    return output;
  } finally {
    ancestors.delete(value);
  }
}

export function valueAtPath(value, path = []) {
  let current = value;
  for (const segment of path) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[segment];
  }
  return current;
}

export function formatInspectableValue(value) {
  if (typeof value === "string") return value;
  if (value === undefined) return "<undefined>";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
