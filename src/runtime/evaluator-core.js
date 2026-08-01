export class HaraRuntimeError extends Error {
  constructor(message, data = {}) {
    super(message);
    this.name = "HaraRuntimeError";
    this.data = data;
  }
}

export class Environment {
  constructor(parent = null) {
    this.parent = parent;
    this.values = new Map();
  }

  has(name) {
    return this.values.has(name) || Boolean(this.parent?.has(name));
  }

  get(name) {
    if (this.values.has(name)) return this.values.get(name);
    if (this.parent) return this.parent.get(name);
    throw new HaraRuntimeError(`Unable to resolve symbol '${name}'`, { symbol: name });
  }

  set(name, value) {
    this.values.set(name, value);
    return value;
  }
}

export const isNode = (value, type) => Boolean(value && typeof value === "object" && value.type === type);
export const isTruthy = (value) => value !== false && value !== null;
export const asName = (form, label = "name") => {
  if (!isNode(form, "symbol")) throw new HaraRuntimeError(`Expected symbol for ${label}`);
  return form.name;
};

export function keywordKey(value) {
  if (isNode(value, "keyword")) return value.name;
  if (typeof value === "string") return value.replace(/^:/, "");
  return formatValue(value);
}

export function equals(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => equals(item, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length && leftKeys.every((key) => equals(left[key], right[key]));
  }
  return false;
}

export function formatValue(value, depth = 0) {
  if (depth > 6) return "…";
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return value.startsWith(":") ? value : JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "function") return "#<native-function>";
  if (value instanceof Uint8Array) return `#bytes[${value.length}]`;
  if (Array.isArray(value)) return `[${value.map((item) => formatValue(item, depth + 1)).join(" ")}]`;
  if (value instanceof Map) return `{${[...value].map(([key, item]) => `${formatValue(key, depth + 1)} ${formatValue(item, depth + 1)}`).join(" ")}}`;
  if (value instanceof Set) return `#{${[...value].map((item) => formatValue(item, depth + 1)).join(" ")}}`;
  if (value?.constructor?.name === "HtaKeyword") return `:${value.name}`;
  if (value?.constructor?.name === "HtaSymbol") return value.name;
  if (value?.constructor?.name?.startsWith("Hta") && value.toString !== Object.prototype.toString) return String(value);
  if (value.type === "closure") return `#<fn${value.name ? ` ${value.name}` : ""}>`;
  if (value.type === "var") return `#'${value.name}`;
  if (value.type === "render" || value.type === "html") return `#<effect ${value.type}>`;
  if (typeof value === "object") {
    return `{${Object.entries(value).map(([key, item]) => `:${key} ${formatValue(item, depth + 1)}`).join(" ")}}`;
  }
  return String(value);
}
