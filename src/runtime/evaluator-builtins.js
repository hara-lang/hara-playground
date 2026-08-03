import { equals, formatValue, isTruthy, keywordKey, HaraRuntimeError } from "./evaluator-core.js";

export function createBuiltins(runtime) {
  const numeric = (name, reducer, identity) => (...args) => {
    if (!args.every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new HaraRuntimeError(`${name} expects finite numbers`);
    }
    if (args.length === 0 && identity !== undefined) return identity;
    if (args.length === 1 && name === "-") return -args[0];
    if (args.length === 1 && name === "/") return 1 / args[0];
    return args.slice(1).reduce(reducer, args[0]);
  };

  return new Map([
    ["+", numeric("+", (a, b) => a + b, 0)],
    ["-", numeric("-", (a, b) => a - b)],
    ["*", numeric("*", (a, b) => a * b, 1)],
    ["/", numeric("/", (a, b) => a / b)],
    ["=", (...args) => args.length < 2 || args.every((value) => equals(args[0], value))],
    ["not=", (...args) => !(args.length < 2 || args.every((value) => equals(args[0], value)))],
    ["<", (...args) => args.every((value, index) => index === 0 || args[index - 1] < value)],
    ["<=", (...args) => args.every((value, index) => index === 0 || args[index - 1] <= value)],
    [">", (...args) => args.every((value, index) => index === 0 || args[index - 1] > value)],
    [">=", (...args) => args.every((value, index) => index === 0 || args[index - 1] >= value)],
    ["str", (...args) => args.map((value) => (value === null ? "" : typeof value === "string" ? value : formatValue(value))).join("")],
    ["println", (...args) => runtime.writeStdout(`${args.map(formatValue).join(" ")}\n`)],
    ["prn", (...args) => runtime.writeStdout(`${args.map(formatValue).join(" ")}\n`)],
    ["not", (value) => !isTruthy(value)],
    ["identity", (value) => value],
    ["inc", (value) => value + 1],
    ["dec", (value) => value - 1],
    ["count", (value) => (value == null ? 0 : Array.isArray(value) || typeof value === "string" ? value.length : Object.keys(value).length)],
    ["first", (value) => (value?.length ? value[0] : null)],
    ["rest", (value) => (value?.length ? value.slice(1) : [])],
    ["nth", (value, index, fallback = null) => value?.[index] ?? fallback],
    ["get", (value, key, fallback = null) => value?.[keywordKey(key)] ?? fallback],
    ["assoc", (value, ...pairs) => {
      const output = Array.isArray(value) ? [...value] : { ...(value || {}) };
      for (let index = 0; index < pairs.length; index += 2) output[keywordKey(pairs[index])] = pairs[index + 1];
      return output;
    }],
    ["conj", (value, ...items) => Array.isArray(value) ? [...value, ...items] : { ...(value || {}), ...Object.fromEntries(items.map((item, index) => [index, item])) }],
    ["vector", (...items) => items],
    ["list", (...items) => items],
    ["hash-map", (...items) => {
      const output = {};
      for (let index = 0; index < items.length; index += 2) output[keywordKey(items[index])] = items[index + 1];
      return output;
    }],
    ["keyword", (value) => `:${String(value).replace(/^:/, "")}`],
    ["name", (value) => String(value).replace(/^:/, "")],
    ["type", (value) => value === null ? ":nil" : Array.isArray(value) ? ":vector" : `:${typeof value}`],
    ["apply", (callable, args) => runtime.applyCallable(callable, Array.from(args || []))],
    ["hta/render", (tree) => runtime.emitEffect({ type: "render", tree })],
    ["preview/html", (html) => runtime.emitEffect({ type: "html", html: String(html) })],
    ["js/console.log", (...args) => runtime.writeStdout(`${args.map(formatValue).join(" ")}\n`)]
  ]);
}

