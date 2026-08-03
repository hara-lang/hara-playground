export function toPlainHta(value, depth = 0) {
  if (depth > 64) throw new Error("HTA value exceeds the preview depth limit");
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value?.constructor?.name === "HtaKeyword") return `:${value.name}`;
  if (value?.constructor?.name === "HtaSymbol") return value.name;
  if (Array.isArray(value)) return value.map((item) => toPlainHta(item, depth + 1));
  if (value instanceof Map) {
    const output = {};
    for (const [key, item] of value) {
      const normalized = key?.constructor?.name === "HtaKeyword" ? key.name : String(key).replace(/^:/, "");
      output[normalized] = toPlainHta(item, depth + 1);
    }
    return output;
  }
  if (typeof value === "object" && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/^:/, ""), toPlainHta(item, depth + 1)]));
  }
  return String(value);
}

export function isHtaTree(value) {
  const first = Array.isArray(value) ? value[0] : null;
  return typeof first === "string"
    ? first.startsWith(":")
    : first?.constructor?.name === "HtaKeyword";
}
