const FILE_STATUSES = new Set(["clean", "modified"]);

export function normalizeExplorerPath(value, label = "Explorer path") {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  const path = value.trim();
  if (path.startsWith("/") || path.includes("\\") || path.includes("\0")) {
    throw new TypeError(`${label} must be a canonical relative workspace path`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new TypeError(`${label} must not contain empty, current or parent segments`);
  }
  return segments.join("/");
}

function languageForPath(path) {
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (extension === "hal" || extension === "hara") return "hara";
  if (extension === "edn") return "edn";
  if (extension === "json") return "json";
  if (extension === "md") return "markdown";
  if (extension === "js" || extension === "mjs") return "javascript";
  if (extension === "css") return "css";
  if (extension === "html" || extension === "hta") return "html";
  return extension || "text";
}

export function createExplorerState({ expanded = null, query = "" } = {}) {
  if (expanded !== null && !Array.isArray(expanded)) {
    throw new TypeError("Explorer expanded state must be null or an array");
  }
  if (typeof query !== "string") throw new TypeError("Explorer query must be a string");
  const projected = expanded === null
    ? null
    : Object.freeze([...new Set(expanded.map((path, index) =>
      normalizeExplorerPath(path, `Explorer expanded path ${index}`)))].sort());
  return Object.freeze({ expanded: projected, query });
}

export function explorerDirectoryPaths(paths = []) {
  if (!Array.isArray(paths)) throw new TypeError("Explorer paths must be an array");
  const directories = new Set();
  for (const candidate of paths) {
    const path = normalizeExplorerPath(candidate);
    const segments = path.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join("/"));
    }
  }
  return [...directories].sort();
}

export function projectExplorerEntries(paths = [], { selectedPath = null, dirty = false } = {}) {
  if (!Array.isArray(paths)) throw new TypeError("Explorer paths must be an array");
  const files = [...new Set(paths.map((path) => normalizeExplorerPath(path)))].sort();
  const selected = selectedPath == null ? null : normalizeExplorerPath(selectedPath, "Explorer selected path");
  const directories = explorerDirectoryPaths(files);
  const entries = [
    ...directories.map((path) => Object.freeze({
      id: `directory:${path}`,
      path,
      name: path.split("/").at(-1),
      kind: "directory",
      language: null,
      status: "clean",
      readOnly: false,
      size: null,
      metadata: Object.freeze({}),
    })),
    ...files.map((path) => {
      const status = selected === path && dirty ? "modified" : "clean";
      if (!FILE_STATUSES.has(status)) throw new Error(`Unsupported Explorer file status: ${status}`);
      return Object.freeze({
        id: `file:${path}`,
        path,
        name: path.split("/").at(-1),
        kind: "file",
        language: languageForPath(path),
        status,
        readOnly: false,
        size: null,
        metadata: Object.freeze({}),
      });
    }),
  ];
  return Object.freeze(entries);
}

export function visibleExplorerExpandedPaths(explorer, entries) {
  const directories = new Set(
    entries.filter((entry) => entry.kind === "directory").map((entry) => entry.path),
  );
  if (explorer?.expanded === null || explorer?.expanded === undefined) {
    return Object.freeze([...directories].sort());
  }
  return Object.freeze(explorer.expanded.filter((path) => directories.has(path)).sort());
}

export function toggleExplorerDirectory(explorer, path, entries) {
  path = normalizeExplorerPath(path, "Explorer directory path");
  if (!entries.some((entry) => entry.kind === "directory" && entry.path === path)) {
    throw new Error(`Explorer directory is not present: ${path}`);
  }
  const expanded = new Set(visibleExplorerExpandedPaths(explorer, entries));
  if (expanded.has(path)) expanded.delete(path);
  else expanded.add(path);
  return createExplorerState({ expanded: [...expanded].sort(), query: explorer?.query ?? "" });
}

export function filterExplorerState(explorer, query) {
  if (typeof query !== "string") throw new TypeError("Explorer query must be a string");
  return createExplorerState({ expanded: explorer?.expanded ?? null, query });
}
