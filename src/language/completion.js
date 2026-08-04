export const HARA_SPECIAL_FORMS = Object.freeze([
  "and", "case", "cond", "def", "defn", "do", "fn", "if", "let", "loop", "ns", "or", "quote", "recur", "when"
]);

export const HARA_CORE_COMPLETIONS = Object.freeze([
  ...HARA_SPECIAL_FORMS,
  "+", "-", "*", "/", "=", "not=", "<", "<=", ">", ">=",
  "apply", "assoc", "conj", "count", "dec", "first", "get", "hash-map",
  "identity", "inc", "keyword", "list", "name", "not", "nth", "println",
  "prn", "rest", "str", "type", "vector", "hta/render", "preview/html"
]);

export function collectSourceSymbols(source) {
  const text = String(source || "");
  const values = new Set();
  const definition = /\((?:def|defn|defmacro|ns)\s+([^\s()\[\]{}]+)/g;
  for (const match of text.matchAll(definition)) values.add(match[1]);
  for (const match of text.matchAll(/:[A-Za-z][A-Za-z0-9_.\/-]*/g)) values.add(match[0]);
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function completionItems({
  prefix = "",
  builtins = [],
  namespaceSymbols = [],
  namespaces = [],
  source = "",
  limit = 80
} = {}) {
  const special = new Set(HARA_SPECIAL_FORMS);
  const builtin = new Set(builtins);
  const local = new Set(namespaceSymbols);
  const namespaceSet = new Set(namespaces);
  const sourceSet = new Set(collectSourceSymbols(source));
  const labels = new Set([...HARA_CORE_COMPLETIONS, ...builtin, ...local, ...namespaceSet, ...sourceSet]);
  const query = String(prefix || "");

  return [...labels]
    .filter((label) => !query || label.startsWith(query))
    .sort((left, right) => {
      const leftExact = left === query ? -1 : 0;
      const rightExact = right === query ? -1 : 0;
      return leftExact - rightExact || left.length - right.length || left.localeCompare(right);
    })
    .slice(0, limit)
    .map((label) => ({
      label,
      kind: special.has(label)
        ? "special"
        : local.has(label)
          ? "var"
          : namespaceSet.has(label)
            ? "namespace"
            : sourceSet.has(label)
              ? "project"
              : builtin.has(label)
                ? "function"
                : "core",
      detail: special.has(label)
        ? "special form"
        : local.has(label)
          ? "current namespace"
          : namespaceSet.has(label)
            ? "namespace"
            : sourceSet.has(label)
              ? "project symbol"
              : "Hara core"
    }));
}
