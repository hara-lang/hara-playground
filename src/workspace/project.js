import { readProjectCapabilities } from "./capabilities.js";

const SYMBOL = "[A-Za-z][A-Za-z0-9_.-]*";

function matchSymbol(source, pattern) {
  return source.match(new RegExp(pattern))?.[1] || null;
}

/**
 * Reads the small portion of the canonical Hara project descriptor needed to
 * boot a browser workspace. This deliberately does not pretend to be a full
 * EDN parser; the Hara runtime remains the authority for descriptor validity.
 */
export function detectProjectConfiguration(files) {
  const byPath = new Map((files || []).map((file) => [file.path, file.content || ""]));
  const projectPath = byPath.has("project.edn")
    ? "project.edn"
    : byPath.has("hara.project.edn") ? "hara.project.edn" : null;
  const source = projectPath ? byPath.get(projectPath) : "";

  const main = matchSymbol(source, `:project/main\\s+(${SYMBOL})`)
    || matchSymbol(source, `:initial-namespace\\s+(${SYMBOL})`)
    || matchSymbol(source, `:entry\\s*\\{[\\s\\S]*?:namespace\\s+(${SYMBOL})`)
    || detectNamespaceFromSources(files)
    || "user";

  const sourcePaths = parseStringVector(source, ":project/source-paths")
    || parseStringVector(source, ":source-paths")
    || ["src"];
  const declaredCapabilities = projectPath ? readProjectCapabilities(source) : null;
  const capabilities = declaredCapabilities ?? ["studio/eval"];

  return Object.freeze({
    projectPath,
    mainNamespace: main,
    sourcePaths: Object.freeze(sourcePaths),
    capabilities: Object.freeze([...capabilities]),
    canonical: projectPath === "project.edn" && /:hara\/type\s+:project\b/.test(source)
  });
}

export function isHaraSource(path) {
  return /\.(?:hal|hara)$/i.test(String(path));
}

export function isProjectSource(path, sourcePaths = ["src"]) {
  const normalized = String(path).replace(/^\/+/, "").replace(/\\/g, "/");
  if (!isHaraSource(normalized)) return false;
  return (sourcePaths?.length ? sourcePaths : ["src"]).some((sourcePath) => {
    const base = String(sourcePath).replace(/^\/+|\/+$/g, "");
    return base === "" || normalized.startsWith(`${base}/`);
  });
}

function detectNamespaceFromSources(files) {
  for (const file of files || []) {
    if (!isHaraSource(file.path)) continue;
    const namespace = matchSymbol(file.content || "", `\\(ns\\s+(${SYMBOL})`);
    if (namespace) return namespace;
  }
  return null;
}

function parseStringVector(source, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = source.match(new RegExp(`${escaped}\\s*\\[([^\\]]*)\\]`))?.[1];
  if (body == null) return null;
  const values = [...body.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((match) =>
    match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
  return values.length ? values : null;
}
