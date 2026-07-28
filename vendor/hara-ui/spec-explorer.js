const escapeHtml = (value) => value.replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
const fileName = (path) => path.split("/").at(-1);

export function highlightSource(source, kind) {
  if (kind === "edn" || kind === "json") {
    const token = /(;[^\n]*|"(?:\\.|[^"\\])*"|:[A-Za-z0-9_.*+!$%&=<>?/-]+|\b(?:true|false|null|nil)\b|[-+]?\d+(?:\.\d+)?(?:[NM])?)/g;
    const output = [];
    let cursor = 0, match;
    while ((match = token.exec(source))) {
      const value = match[0];
      output.push(escapeHtml(source.slice(cursor, match.index)));
      cursor = match.index + value.length;
      const type = value.startsWith(";") ? "comment" : value.startsWith('"') ? "string" : value.startsWith(":") ? "keyword" : /^[+-]?\d/.test(value) ? "number" : "atom";
      output.push(`<span class="hara-tok-${type}">${escapeHtml(value)}</span>`);
    }
    output.push(escapeHtml(source.slice(cursor)));
    return output.join("");
  }
  return source.split("\n").map((line) => escapeHtml(line)
    .replace(/^(#{1,6})(\s+.*)$/, '<span class="hara-tok-heading">$1$2</span>')
    .replace(/^(\s*(?:[-*+] |\d+\. ))/, '<span class="hara-tok-mark">$1</span>')
    .replace(/(`[^`]+`)/g, '<span class="hara-tok-keyword">$1</span>')
    .replace(/(\[[^\]]+\]\([^\)]+\))/g, '<span class="hara-tok-link">$1</span>')).join("\n");
}

function inlineMarkdown(value) {
  return escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, '<a href="$2">$1</a>');
}

export function renderMarkdown(source) {
  const output = []; let inCode = false; let list = false;
  for (const line of source.split("\n")) {
    if (line.startsWith("```")) { if (list) { output.push("</ul>"); list = false; } output.push(inCode ? "</code></pre>" : "<pre><code>"); inCode = !inCode; continue; }
    if (inCode) { output.push(`${escapeHtml(line)}\n`); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/); const item = line.match(/^[-*+]\s+(.+)$/);
    if (heading) { if (list) { output.push("</ul>"); list = false; } const level = heading[1].length; output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); }
    else if (item) { if (!list) { output.push("<ul>"); list = true; } output.push(`<li>${inlineMarkdown(item[1])}</li>`); }
    else if (line.startsWith("> ")) { if (list) { output.push("</ul>"); list = false; } output.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`); }
    else if (!line.trim()) { if (list) { output.push("</ul>"); list = false; } }
    else { if (list) { output.push("</ul>"); list = false; } output.push(`<p>${inlineMarkdown(line)}</p>`); }
  }
  if (list) output.push("</ul>"); if (inCode) output.push("</code></pre>"); return output.join("\n");
}

function treeFrom(files, directories = []) {
  const root = { directories: new Map(), files: [] };
  const ensureDirectory = (path) => { let node = root; for (const part of path.split("/").filter(Boolean)) { if (!node.directories.has(part)) node.directories.set(part, { directories: new Map(), files: [] }); node = node.directories.get(part); } return node; };
  for (const directory of directories) ensureDirectory(directory);
  for (const file of files) { const parts = file.path.split("/"); const node = ensureDirectory(parts.slice(0, -1).join("/")); node.files.push(file); }
  return root;
}

/** Mount a manifest-backed EDN/Markdown specification explorer. */
export function createSpecExplorer(root, { manifestUrl = "spec-manifest.json", fileUrl = (path) => path, repositoryUrl } = {}) {
  const state = { files: [], directories: [], collapsedDirectories: new Set(), expandedDirectories: new Set(), active: null, mode: "preview" };
  root.classList.add("hara-spec-explorer");
  root.innerHTML = `<aside class="hara-explorer-sidebar"><a class="hara-spec-brand" href="./" aria-label="Hara specifications home"><img src="vendor/hara-ui/logo-white.svg" alt=""><span><b>HARA</b><small>SPECIFICATIONS</small></span></a><div class="hara-explorer-sidebar-header"><h1 class="hara-explorer-sidebar-title">FILES</h1><span class="hara-explorer-count" data-count></span></div><input class="hara-input" data-search type="search" placeholder="filter files" aria-label="Filter specification files"><nav class="hara-explorer-tree" data-tree aria-label="Specification files"></nav></aside><main class="hara-explorer-viewer"><header class="hara-explorer-header"><div class="hara-explorer-crumb" data-crumb>select a file</div><div class="hara-explorer-file-row"><h2 class="hara-explorer-file-title" data-title>Specification explorer</h2><div class="hara-explorer-actions"><button class="hara-button" data-source type="button">source</button><button class="hara-button" data-preview type="button">preview</button><a class="hara-icon-button hara-explorer-icon-link" data-raw download title="Download file" aria-label="Download file">⇩</a><button class="hara-icon-button" data-repository type="button" title="Open on GitHub" aria-label="Open on GitHub">↗</button></div></div><span class="hara-badge" data-badge hidden></span></header><section class="hara-explorer-document" data-document><div class="hara-explorer-welcome"><img class="hara-explorer-welcome-mark" src="vendor/hara-ui/logo-white.svg" alt=""><h2>Specification explorer</h2><p>Loading the manifest…</p></div></section></main>`;
  const $ = (selector) => root.querySelector(selector);
  const elements = { tree: $("[data-tree]"), search: $("[data-search]"), count: $("[data-count]"), crumb: $("[data-crumb]"), title: $("[data-title]"), badge: $("[data-badge]"), document: $("[data-document]"), raw: $("[data-raw]"), source: $("[data-source]"), preview: $("[data-preview]"), repository: $("[data-repository]") };
  function renderTree(files, directories) {
    const fragment = document.createDocumentFragment();
    const visit = (node, parent, depth, parentPath) => { [...node.directories.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([name, child]) => { const path = parentPath ? `${parentPath}/${name}` : name; const details = document.createElement("details"); const empty = child.directories.size === 0 && child.files.length === 0; details.className = "hara-tree-directory"; details.open = !empty && (depth < 1 || state.expandedDirectories.has(path)) && !state.collapsedDirectories.has(path); details.setAttribute("aria-disabled", String(empty)); const summary = document.createElement("summary"); summary.textContent = name; if (empty) summary.addEventListener("click", (event) => event.preventDefault()); else details.addEventListener("toggle", (event) => { if (event.target !== details) return; if (details.open) { state.collapsedDirectories.delete(path); state.expandedDirectories.add(path); } else { state.expandedDirectories.delete(path); state.collapsedDirectories.add(path); } }); details.append(summary); visit(child, details, depth + 1, path); parent.append(details); }); node.files.sort((a, b) => a.path.localeCompare(b.path)).forEach((file) => { const button = document.createElement("button"); button.type = "button"; button.className = "hara-tree-file"; button.setAttribute("aria-current", String(state.active?.path === file.path)); button.innerHTML = `<i class="hara-file-dot ${file.kind}"></i><span>${fileName(file.path)}</span>`; button.addEventListener("click", () => activate(file)); parent.append(button); }); };
    visit(treeFrom(files, directories), fragment, 0, ""); elements.tree.replaceChildren(fragment);
  }
  function updateTree() { const query = elements.search.value.trim().toLowerCase(); const files = query ? state.files.filter((file) => file.path.toLowerCase().includes(query)) : state.files; const directories = query ? [] : state.directories; elements.count.textContent = `${files.length} FILES`; if (!files.length) { elements.tree.innerHTML = '<p class="hara-explorer-empty">No matching files.</p>'; return; } renderTree(files, directories); }
  async function activate(file, requestedMode) {
    state.active = file; state.mode = requestedMode || (file.kind === "markdown" ? "preview" : "source"); history.replaceState(null, "", `#/${encodeURIComponent(file.path)}`); elements.crumb.textContent = file.path; elements.title.textContent = fileName(file.path); elements.badge.hidden = false; elements.badge.textContent = file.kind; elements.raw.href = fileUrl(file.path); elements.raw.download = fileName(file.path); elements.repository.dataset.url = repositoryUrl ? `${repositoryUrl.replace(/\/$/, "")}/${file.path}` : fileUrl(file.path); elements.source.setAttribute("aria-pressed", String(state.mode === "source")); elements.preview.hidden = file.kind !== "markdown"; elements.preview.setAttribute("aria-pressed", String(state.mode === "preview")); elements.document.innerHTML = '<div class="hara-explorer-welcome"><p>Loading file…</p></div>'; updateTree();
    try { const response = await fetch(fileUrl(file.path)); if (!response.ok) throw new Error(`HTTP ${response.status}`); const source = await response.text(); elements.document.innerHTML = state.mode === "preview" && file.kind === "markdown" ? `<article class="hara-markdown">${renderMarkdown(source)}</article>` : `<pre class="hara-source"><code>${highlightSource(source, file.kind)}</code></pre>`; } catch (error) { elements.document.innerHTML = `<div class="hara-explorer-welcome hara-explorer-error"><h2>Could not load this file</h2><p>${escapeHtml(String(error.message || error))}</p></div>`; }
  }
  const hashPath = () => decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  elements.search.addEventListener("input", updateTree); elements.source.addEventListener("click", () => state.active && activate(state.active, "source")); elements.preview.addEventListener("click", () => state.active && activate(state.active, "preview")); elements.repository.addEventListener("click", () => { const url = elements.repository.dataset.url; if (url && window.confirm(`Open ${state.active?.path || "this file"} on GitHub?`)) window.open(url, "_blank", "noopener"); }); window.addEventListener("hashchange", () => { const file = state.files.find((candidate) => candidate.path === hashPath()); if (file && file.path !== state.active?.path) activate(file); });
  fetch(manifestUrl).then((response) => { if (!response.ok) throw new Error(`Manifest request failed with ${response.status}`); return response.json(); }).then((manifest) => { state.files = manifest.files || []; state.directories = manifest.directories || []; updateTree(); const file = state.files.find((candidate) => candidate.path === hashPath()) || state.files.find((candidate) => candidate.path === "README.md") || state.files[0]; if (file) return activate(file); }).catch((error) => { elements.document.innerHTML = `<div class="hara-explorer-welcome hara-explorer-error"><h2>Explorer unavailable</h2><p>${escapeHtml(String(error.message || error))}</p></div>`; });
  return { activate: (path) => { const file = state.files.find((candidate) => candidate.path === path); return file && activate(file); }, destroy: () => root.replaceChildren() };
}
