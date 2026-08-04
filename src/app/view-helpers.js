import { state } from "./context.js";

export function icon(name) {
  const paths = {
    play: '<path d="M8 5v14l11-7z"/>',
    save: '<path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/>',
    refresh: '<path d="M20 6v5h-5M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 7M5.5 15A7 7 0 0 0 18 17"/>',
    github: '<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.82a9.5 9.5 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85V21c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
    terminal: '<path d="M4 5h16v14H4zM7 9l3 3-3 3M12 15h5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/>',
    moon: '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5z"/>',
    file: '<path d="M6 2h8l4 4v16H6zM14 2v6h6"/>',
    folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
    branch: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M8 7c4 0 3-1 8-1M16 8c0 6-3 6-8 6"/>',
    home: '<path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6"/>',
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16"/>',
    sparkles: '<path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2zM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6H5V6h6"/>',
    command: '<path d="M9 6V5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
    wrap: '<path d="M4 7h10a4 4 0 0 1 0 8H8M8 12l-3 3 3 3"/>',
    slurp: '<path d="M5 5h4v14H5M19 5h-4v14h4M10 12h4M12 10l2 2-2 2"/>',
    barf: '<path d="M5 5h4v14H5M19 5h-4v14h4M14 12h-4M12 10l-2 2 2 2"/>',
    format: '<path d="M4 6h16M4 10h10M4 14h16M4 18h7"/>',
    kernel: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 9h8M8 13h5M8 17h8"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ""}</svg>`;
}

export function haraMark(title = "Hara") {
  return `<svg class="hara-mark" viewBox="0 0 64 64" role="img" aria-label="${escapeHtml(title)}"><path fill="currentColor" stroke="none" d="M10 8h13v18h18V8h13v48H41V38H23v18H10z"/><path class="hara-mark-signal" fill="currentColor" stroke="none" d="M27 8h10v10H27z"/></svg>`;
}

export function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function fileName(path) {
  return path.split("/").pop();
}

export function fileLanguage(path) {
  const extension = path.split(".").pop();
  return extension === "hal" ? "HAL" : extension === "hara" ? "Hara (legacy)" : extension === "edn" ? "EDN" : extension?.toUpperCase() || "TEXT";
}

export function groupFiles(paths) {
  const root = {};
  for (const path of paths) {
    const parts = path.split("/");
    let cursor = root;
    parts.forEach((part, index) => {
      cursor[part] ||= index === parts.length - 1 ? null : {};
      if (cursor[part]) cursor = cursor[part];
    });
  }
  return root;
}

export function renderTree(tree, prefix = "", depth = 0) {
  return Object.entries(tree).sort(([a, av], [b, bv]) => {
    if (av === null && bv !== null) return 1;
    if (av !== null && bv === null) return -1;
    return a.localeCompare(b);
  }).map(([name, children]) => {
    const path = prefix ? `${prefix}/${name}` : name;
    if (children !== null) {
      return `<div class="tree-folder" style="--depth:${depth}"><div class="tree-folder-label">${icon("folder")}<span>${escapeHtml(name)}</span></div>${renderTree(children, path, depth + 1)}</div>`;
    }
    return `<button class="tree-file ${path === state.selectedPath ? "selected" : ""}" data-path="${escapeHtml(path)}" style="--depth:${depth}" title="${escapeHtml(path)}">${icon("file")}<span>${escapeHtml(name)}</span></button>`;
  }).join("");
}

export function renderRepl() {
  return state.repl.map((entry) => {
    if (entry.kind === "input") return `<div class="repl-line input"><span class="prompt">${escapeHtml(entry.namespace)}=&gt;</span><span>${escapeHtml(entry.text)}</span></div>`;
    if (entry.kind === "error") return `<div class="repl-line error"><span class="output-marker">!</span><span>${escapeHtml(entry.text)}</span></div>`;
    if (entry.kind === "stdout") return `<div class="repl-line stdout"><span class="output-marker">│</span><span>${escapeHtml(entry.text)}</span></div>`;
    return `<div class="repl-line result"><span class="output-marker">→</span><span>${escapeHtml(entry.text)}</span></div>`;
  }).join("");
}
