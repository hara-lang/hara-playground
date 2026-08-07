#!/usr/bin/env python3
from pathlib import Path
from textwrap import dedent

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(dedent(content).lstrip("\n"), encoding="utf-8")


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return source.replace(old, new, 1)


def update_context() -> None:
    path = "src/app/context.js"
    source = read(path)
    source = replace_once(
        source,
        'import { createProblemsState } from "../hodos/problems-state.js";',
        'import { createProblemsState } from "../hodos/problems-state.js";\nimport { createExplorerState } from "../hodos/explorer-state.js";',
        "Explorer state import",
    )
    source = replace_once(
        source,
        '  problems: createProblemsState(),',
        '  problems: createProblemsState(),\n  explorer: createExplorerState(),',
        "Explorer state",
    )
    write(path, source)


def write_explorer_state() -> None:
    write("src/hodos/explorer-state.js", r'''
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
    ''')


def write_explorer_events() -> None:
    write("src/hodos/explorer-events.js", r'''
    import { normalizeExplorerPath } from "./explorer-state.js";

    export const HODOS_EXPLORER_COMPONENT_ID = "hodos.dev/explorer";
    export const HODOS_EXPLORER_AREA_ID = "explorer/main";

    function eventType(value) {
      return value?.["event/type"] ?? value?.type ?? null;
    }

    function optionalPath(value, label) {
      if (value == null) return null;
      return normalizeExplorerPath(value, label);
    }

    export function explorerWorkspacePatch(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      if (value["component/id"] !== HODOS_EXPLORER_COMPONENT_ID) return null;
      if (value["area/id"] !== HODOS_EXPLORER_AREA_ID) return null;

      const type = eventType(value);
      if (type === "explorer/select") {
        return Object.freeze({ kind: "select", path: normalizeExplorerPath(value.path, "Hodos Explorer select path") });
      }
      if (type === "explorer/toggle") {
        return Object.freeze({ kind: "toggle", path: normalizeExplorerPath(value.path, "Hodos Explorer toggle path") });
      }
      if (type === "explorer/create") {
        const entryKind = String(value.kind ?? "file");
        if (entryKind !== "file" && entryKind !== "directory") {
          throw new TypeError("Hodos Explorer create kind must be file or directory");
        }
        return Object.freeze({
          kind: "create",
          entryKind,
          path: optionalPath(value.path, "Hodos Explorer create path"),
        });
      }
      if (type === "explorer/rename") {
        return Object.freeze({
          kind: "rename",
          path: normalizeExplorerPath(value.path, "Hodos Explorer rename path"),
          newPath: normalizeExplorerPath(value.newPath, "Hodos Explorer new path"),
        });
      }
      if (type === "explorer/delete") {
        return Object.freeze({ kind: "delete", path: normalizeExplorerPath(value.path, "Hodos Explorer delete path") });
      }
      if (type === "explorer/refresh") return Object.freeze({ kind: "refresh" });
      if (type === "explorer/filter") {
        if (typeof (value.query ?? "") !== "string") {
          throw new TypeError("Hodos Explorer filter query must be a string");
        }
        return Object.freeze({ kind: "filter", query: value.query ?? "" });
      }
      return null;
    }
    ''')


def write_explorer_host() -> None:
    write("src/hodos/explorer.js", r'''
    import { createHodosComponentRegistry } from "@greenways/hodos-web";
    import { createWorkspaceAreaHost } from "@greenways/hodos-workspace-ui";
    import { createExplorerArea } from "@greenways/hodos-dev";
    import { registerHodosExplorerUi } from "@greenways/hodos-dev-ui";
    import {
      projectExplorerEntries,
      visibleExplorerExpandedPaths,
    } from "./explorer-state.js";

    const registry = createHodosComponentRegistry();
    registerHodosExplorerUi(registry, { createExplorerHost: createPlaygroundExplorerHost });

    let areaHost = null;

    function send(dispatch, event) {
      void Promise.resolve(dispatch(event)).catch((error) => {
        console.error("[hara playground hodos explorer]", error);
      });
    }

    function parentPath(path) {
      const index = path.lastIndexOf("/");
      return index < 0 ? "" : path.slice(0, index);
    }

    function visiblePathSet(model) {
      const query = String(model.filter?.query ?? "").trim().toLowerCase();
      if (!query) return new Set(model.entries.map((entry) => entry.path));
      const visible = new Set();
      for (const entry of model.entries) {
        if (!`${entry.name} ${entry.path}`.toLowerCase().includes(query)) continue;
        visible.add(entry.path);
        let parent = parentPath(entry.path);
        while (parent) {
          visible.add(parent);
          parent = parentPath(parent);
        }
      }
      return visible;
    }

    function childMap(model) {
      const visible = visiblePathSet(model);
      const children = new Map();
      for (const entry of model.entries) {
        if (!visible.has(entry.path)) continue;
        const parent = parentPath(entry.path);
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(entry);
      }
      for (const entries of children.values()) {
        entries.sort((left, right) => {
          if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
          return left.name.localeCompare(right.name);
        });
      }
      return children;
    }

    function directoryNode(document, entry, depth, model, children, expanded, dispatch, signal) {
      const wrapper = document.createElement("div");
      wrapper.className = "tree-folder";
      wrapper.style.setProperty("--depth", depth);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "tree-folder-label explorer-folder-button";
      button.dataset.path = entry.path;
      button.setAttribute("aria-expanded", String(expanded.has(entry.path)));
      const marker = document.createElement("span");
      marker.className = "explorer-entry-marker";
      marker.textContent = expanded.has(entry.path) ? "▾" : "▸";
      const name = document.createElement("span");
      name.textContent = entry.name;
      button.append(marker, name);
      button.addEventListener("click", () => send(dispatch, {
        "event/type": "explorer/toggle",
        path: entry.path,
      }), { signal });
      wrapper.append(button);

      if (expanded.has(entry.path)) {
        const branch = document.createElement("div");
        branch.className = "explorer-branch";
        for (const child of children.get(entry.path) || []) {
          branch.append(entryNode(document, child, depth + 1, model, children, expanded, dispatch, signal));
        }
        wrapper.append(branch);
      }
      return wrapper;
    }

    function fileNode(document, entry, depth, model, dispatch, signal) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tree-file${entry.path === model.selection.path ? " selected" : ""}`;
      button.dataset.path = entry.path;
      button.style.setProperty("--depth", depth);
      button.title = entry.path;
      const marker = document.createElement("span");
      marker.className = `explorer-entry-marker ${entry.status}`;
      marker.textContent = entry.status === "modified" ? "●" : "·";
      const name = document.createElement("span");
      name.textContent = entry.name;
      button.append(marker, name);
      button.addEventListener("click", () => send(dispatch, {
        "event/type": "explorer/select",
        path: entry.path,
      }), { signal });
      return button;
    }

    function entryNode(document, entry, depth, model, children, expanded, dispatch, signal) {
      return entry.kind === "directory"
        ? directoryNode(document, entry, depth, model, children, expanded, dispatch, signal)
        : fileNode(document, entry, depth, model, dispatch, signal);
    }

    export function createPlaygroundExplorerHost({ container, dispatch }) {
      const tree = container?.querySelector?.(".file-tree");
      const createFile = container?.querySelector?.("#new-file-button");
      const deleteFile = container?.querySelector?.("#delete-file-button");
      if (!tree || !createFile || !deleteFile) {
        throw new Error("Hodos Explorer requires the Playground project controls");
      }

      const document = container.ownerDocument || globalThis.document;
      const abort = new AbortController();
      const signal = abort.signal;
      let model = null;

      createFile.addEventListener("click", () => send(dispatch, {
        "event/type": "explorer/create",
        kind: "file",
      }), { signal });
      deleteFile.addEventListener("click", () => {
        if (!model?.selection?.path) return;
        send(dispatch, {
          "event/type": "explorer/delete",
          path: model.selection.path,
        });
      }, { signal });

      return {
        update(nextModel) {
          model = nextModel && typeof nextModel === "object" ? nextModel : {};
          createFile.disabled = !model.capabilities?.createFile;
          const selected = model.entries?.find((entry) => entry.path === model.selection?.path) || null;
          deleteFile.disabled = !model.capabilities?.delete || !selected || selected.readOnly;
          tree.replaceChildren();

          const children = childMap(model);
          const expanded = new Set(model.expanded || []);
          const roots = children.get("") || [];
          if (!roots.length) {
            const empty = document.createElement("div");
            empty.className = "explorer-empty";
            empty.textContent = model.entries?.length
              ? "No files match the current filter."
              : "This workspace has no files.";
            tree.append(empty);
          } else {
            for (const entry of roots) {
              tree.append(entryNode(document, entry, 0, model, children, expanded, dispatch, signal));
            }
          }
          container.dataset.explorerWorkspace = model.workspace?.id || "";
          container.dataset.explorerCount = String(model.counts?.total ?? 0);
        },
        dispose() {
          abort.abort();
          delete container.dataset.explorerWorkspace;
          delete container.dataset.explorerCount;
        },
      };
    }

    export function explorerAreaFromPlayground(state) {
      const entries = projectExplorerEntries(state.files, {
        selectedPath: state.selectedPath,
        dirty: state.dirty,
      });
      return createExplorerArea({
        id: "explorer/main",
        workspaceId: state.workspace ? `workspace:${state.workspace}` : null,
        workspaceTitle: state.metadata?.title
          || state.metadata?.repository
          || state.workspace
          || "Workspace",
        root: "",
        source: state.metadata?.source || null,
        revision: state.metadata?.commit || state.metadata?.branch || null,
        entries,
        selectedPath: state.selectedPath && state.files.includes(state.selectedPath)
          ? state.selectedPath
          : null,
        expandedPaths: visibleExplorerExpandedPaths(state.explorer, entries),
        query: state.explorer?.query || "",
        capabilities: {
          createFile: true,
          createDirectory: false,
          rename: false,
          delete: Boolean(state.selectedPath),
          refresh: true,
        },
        metadata: {
          owner: state.metadata?.owner || null,
          repository: state.metadata?.repository || null,
          branch: state.metadata?.branch || null,
          projectPath: state.metadata?.path || null,
        },
      });
    }

    export function disposeHodosExplorer() {
      areaHost?.destroy();
      areaHost = null;
    }

    export function mountHodosExplorer(state) {
      disposeHodosExplorer();
      const root = globalThis.document?.querySelector(".project-panel");
      if (!root) return false;
      areaHost = createWorkspaceAreaHost({
        root,
        registry,
        dispatch(event) {
          globalThis.document?.dispatchEvent(new CustomEvent("hodos:workspace-event", {
            detail: event,
          }));
        },
      });
      areaHost.open(explorerAreaFromPlayground(state));
      return true;
    }

    export function updateHodosExplorer(state) {
      if (!areaHost) return false;
      areaHost.update(explorerAreaFromPlayground(state));
      return true;
    }
    ''')


def update_main() -> None:
    path = "src/main.js"
    source = read(path)
    source = replace_once(
        source,
        'import { disposeHodosEditor, mountHodosEditor } from "./hodos/editor.js";',
        'import { disposeHodosEditor, mountHodosEditor } from "./hodos/editor.js";\nimport { disposeHodosExplorer, mountHodosExplorer } from "./hodos/explorer.js";',
        "Explorer main import",
    )
    source = replace_once(
        source,
        '''  disposeHodosEditor();
  disposeHodosPreview();''',
        '''  disposeHodosEditor();
  disposeHodosExplorer();
  disposeHodosPreview();''',
        "Explorer disposal",
    )
    source = replace_once(
        source,
        '''  mountHodosEditor({
    selectedPath: state.selectedPath,''',
        '''  mountHodosExplorer(state);
  mountHodosEditor({
    selectedPath: state.selectedPath,''',
        "Explorer mount",
    )
    write(path, source)


def update_view() -> None:
    path = "src/app/view.js"
    source = read(path)
    source = replace_once(
        source,
        'import { icon, haraMark, escapeHtml, fileName, fileLanguage, groupFiles, renderTree, renderRepl } from "./view-helpers.js";',
        'import { icon, haraMark, escapeHtml, fileName, fileLanguage, renderRepl } from "./view-helpers.js";',
        "fixed Explorer renderer imports",
    )
    source = replace_once(
        source,
        '<nav class="file-tree">${renderTree(groupFiles(state.files))}</nav>',
        '<nav class="file-tree" aria-label="Workspace files"></nav>',
        "Hodos Explorer host container",
    )
    write(path, source)


def update_events() -> None:
    path = "src/app/events.js"
    source = read(path)
    source = replace_once(
        source,
        'import { editorWorkspacePatch } from "../hodos/editor-events.js";',
        dedent('''
        import { editorWorkspacePatch } from "../hodos/editor-events.js";
        import { explorerWorkspacePatch } from "../hodos/explorer-events.js";
        import {
          filterExplorerState,
          normalizeExplorerPath,
          projectExplorerEntries,
          toggleExplorerDirectory,
        } from "../hodos/explorer-state.js";
        import { updateHodosExplorer } from "../hodos/explorer.js";
        ''').strip(),
        "Explorer event imports",
    )

    anchor = "function inspectorEntry(valueId) {"
    policy = r'''
    async function applyExplorerWorkspacePatch(patch) {
      if (patch.kind === "select") {
        await selectFile(patch.path);
        return;
      }
      if (patch.kind === "toggle") {
        const entries = projectExplorerEntries(state.files, {
          selectedPath: state.selectedPath,
          dirty: state.dirty,
        });
        state.explorer = toggleExplorerDirectory(state.explorer, patch.path, entries);
        updateHodosExplorer(state);
        return;
      }
      if (patch.kind === "filter") {
        state.explorer = filterExplorerState(state.explorer, patch.query);
        updateHodosExplorer(state);
        return;
      }
      if (patch.kind === "refresh") {
        await refreshFiles(state.selectedPath);
        return;
      }
      if (patch.kind === "create") {
        if (patch.entryKind !== "file") {
          throw new Error("Empty directories are not represented by the current Workspace store");
        }
        const requested = patch.path ?? prompt("New workspace file", "src/app/new-file.hal");
        if (!requested) return;
        const path = normalizeExplorerPath(requested, "New workspace file");
        if (state.files.includes(path)) throw new Error(`${path} already exists`);
        await store.write(path, isHaraSource(path) ? `(ns app.new-file)\n\n` : "");
        await refreshFiles(path);
        return;
      }
      if (patch.kind === "delete") {
        if (!state.files.includes(patch.path)) throw new Error(`Workspace file is not present: ${patch.path}`);
        if (!confirm(`Delete ${patch.path} from this browser workspace?`)) return;
        await store.remove(patch.path);
        if (state.selectedPath === patch.path) state.selectedPath = null;
        await refreshFiles();
        return;
      }
      if (patch.kind === "rename") {
        if (!state.files.includes(patch.path)) throw new Error(`Workspace file is not present: ${patch.path}`);
        if (state.files.includes(patch.newPath)) throw new Error(`${patch.newPath} already exists`);
        const content = state.selectedPath === patch.path && state.dirty
          ? state.content
          : await store.read(patch.path);
        if (content == null) throw new Error(`Unable to read ${patch.path}`);
        await store.write(patch.newPath, content);
        await store.remove(patch.path);
        if (state.selectedPath === patch.path) state.selectedPath = patch.newPath;
        await refreshFiles(patch.newPath);
      }
    }

    '''
    source = replace_once(source, anchor, policy + anchor, "Explorer application policy")

    source = replace_once(
        source,
        '''    const replPatch = replWorkspacePatch(event.detail);
    if (replPatch) {''',
        '''    const explorerPatch = explorerWorkspacePatch(event.detail);
    if (explorerPatch) {
      void applyExplorerWorkspacePatch(explorerPatch).catch(reportWorkspaceEventError);
      return;
    }
    const replPatch = replWorkspacePatch(event.detail);
    if (replPatch) {''',
        "Explorer Workspace event routing",
    )

    source = replace_once(
        source,
        '  document.querySelectorAll(".tree-file").forEach((button) => button.addEventListener("click", () => selectFile(button.dataset.path)));\n',
        "",
        "direct tree-file selection handler",
    )

    direct = '''  document.querySelector("#new-file-button")?.addEventListener("click", async () => {
    const path = prompt("New workspace file", "src/app/new-file.hal");
    if (!path) return;
    if (state.files.includes(path)) {
      appendRepl("error", `${path} already exists`);
      render();
      return;
    }
    await store.write(path, isHaraSource(path) ? `(ns app.new-file)\n\n` : "");
    await refreshFiles(path);
  });
  document.querySelector("#delete-file-button")?.addEventListener("click", async () => {
    if (!state.selectedPath || !confirm(`Delete ${state.selectedPath} from this browser workspace?`)) return;
    await store.remove(state.selectedPath);
    state.selectedPath = null;
    await refreshFiles();
  });

'''
    source = replace_once(source, direct, "", "direct Explorer mutation handlers")
    write(path, source)


def update_styles() -> None:
    path = "src/styles.css"
    source = read(path)
    source = replace_once(
        source,
        '@import url("./styles/hodos-preview.css");\n',
        '@import url("./styles/hodos-preview.css");\n@import url("./styles/hodos-explorer.css");\n',
        "Explorer styles import",
    )
    write(path, source)
    write("src/styles/hodos-explorer.css", r'''
    button.tree-folder-label.explorer-folder-button {
      width: 100%;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    button.tree-folder-label.explorer-folder-button:hover {
      color: var(--hara-text);
      background: var(--hara-surface-raised);
    }
    .explorer-branch { min-width: 0; }
    .explorer-entry-marker {
      width: 14px;
      flex: 0 0 14px;
      display: inline-grid;
      place-items: center;
      color: var(--hara-faint);
      font-family: var(--hara-font-mono);
      font-size: .55rem;
    }
    .explorer-entry-marker.modified { color: var(--hara-spectrum-violet); }
    .explorer-empty {
      padding: 18px 12px;
      color: var(--hara-faint);
      font-family: var(--hara-font-mono);
      font-size: .56rem;
      line-height: 1.5;
      text-align: center;
    }
    .project-panel[data-area-type="hodos.dev/explorer"] .file-tree {
      min-height: 88px;
    }
    ''')


def write_tests() -> None:
    write("tests/hodos-explorer-state.test.js", r'''
    import assert from "node:assert/strict";
    import test from "node:test";
    import {
      createExplorerState,
      explorerDirectoryPaths,
      filterExplorerState,
      normalizeExplorerPath,
      projectExplorerEntries,
      toggleExplorerDirectory,
      visibleExplorerExpandedPaths,
    } from "../src/hodos/explorer-state.js";

    test("Explorer projects explicit directory and file entries", () => {
      const entries = projectExplorerEntries([
        "project.edn",
        "src/app/main.hal",
        "src/lib.hal",
      ], { selectedPath: "src/app/main.hal", dirty: true });
      assert.deepEqual(entries.map(({ path, kind, status }) => ({ path, kind, status })), [
        { path: "src", kind: "directory", status: "clean" },
        { path: "src/app", kind: "directory", status: "clean" },
        { path: "project.edn", kind: "file", status: "clean" },
        { path: "src/app/main.hal", kind: "file", status: "modified" },
        { path: "src/lib.hal", kind: "file", status: "clean" },
      ]);
      assert.deepEqual(explorerDirectoryPaths(["src/app/main.hal", "project.edn"]), ["src", "src/app"]);
    });

    test("Explorer expansion defaults open and toggles deterministically", () => {
      const entries = projectExplorerEntries(["src/app/main.hal", "src/lib.hal"]);
      const initial = createExplorerState();
      assert.deepEqual(visibleExplorerExpandedPaths(initial, entries), ["src", "src/app"]);
      const toggled = toggleExplorerDirectory(initial, "src/app", entries);
      assert.deepEqual(toggled.expanded, ["src"]);
      const filtered = filterExplorerState(toggled, "main");
      assert.equal(filtered.query, "main");
      assert.deepEqual(filtered.expanded, ["src"]);
    });

    test("Explorer rejects non-canonical paths and missing directories", () => {
      assert.throws(() => normalizeExplorerPath("/src/main.hal"), /canonical relative/);
      assert.throws(() => normalizeExplorerPath("src/../main.hal"), /parent segments/);
      assert.throws(() => normalizeExplorerPath("src\\main.hal"), /canonical relative/);
      assert.throws(() => createExplorerState({ expanded: "src" }), /null or an array/);
      const entries = projectExplorerEntries(["src/main.hal"]);
      assert.throws(() => toggleExplorerDirectory(createExplorerState(), "missing", entries), /not present/);
    });
    ''')

    write("tests/hodos-explorer-events.test.js", r'''
    import assert from "node:assert/strict";
    import test from "node:test";
    import {
      HODOS_EXPLORER_AREA_ID,
      HODOS_EXPLORER_COMPONENT_ID,
      explorerWorkspacePatch,
    } from "../src/hodos/explorer-events.js";

    const base = {
      "component/id": HODOS_EXPLORER_COMPONENT_ID,
      "area/id": HODOS_EXPLORER_AREA_ID,
    };

    test("Explorer projects selection, expansion and mutation commands", () => {
      assert.deepEqual(explorerWorkspacePatch({ ...base, "event/type": "explorer/select", path: "src/main.hal" }), {
        kind: "select",
        path: "src/main.hal",
      });
      assert.deepEqual(explorerWorkspacePatch({ ...base, "event/type": "explorer/toggle", path: "src" }), {
        kind: "toggle",
        path: "src",
      });
      assert.deepEqual(explorerWorkspacePatch({ ...base, "event/type": "explorer/create", kind: "file" }), {
        kind: "create",
        entryKind: "file",
        path: null,
      });
      assert.deepEqual(explorerWorkspacePatch({ ...base, "event/type": "explorer/delete", path: "src/main.hal" }), {
        kind: "delete",
        path: "src/main.hal",
      });
      assert.deepEqual(explorerWorkspacePatch({
        ...base,
        "event/type": "explorer/rename",
        path: "src/main.hal",
        newPath: "src/app.hal",
      }), {
        kind: "rename",
        path: "src/main.hal",
        newPath: "src/app.hal",
      });
    });

    test("Explorer projects refresh/filter and rejects malformed events", () => {
      assert.deepEqual(explorerWorkspacePatch({ ...base, "event/type": "explorer/refresh" }), { kind: "refresh" });
      assert.deepEqual(explorerWorkspacePatch({ ...base, "event/type": "explorer/filter", query: "main" }), {
        kind: "filter",
        query: "main",
      });
      assert.equal(explorerWorkspacePatch({ ...base, "component/id": "hodos.dev/editor", "event/type": "explorer/refresh" }), null);
      assert.throws(() => explorerWorkspacePatch({ ...base, "event/type": "explorer/select", path: "../main.hal" }), /parent segments/);
      assert.throws(() => explorerWorkspacePatch({ ...base, "event/type": "explorer/create", kind: "device" }), /file or directory/);
      assert.throws(() => explorerWorkspacePatch({ ...base, "event/type": "explorer/filter", query: 7 }), /query must be a string/);
    });
    ''')

    write("tests/hodos-explorer-authority.test.js", r'''
    import assert from "node:assert/strict";
    import { readFile } from "node:fs/promises";
    import test from "node:test";

    const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

    test("Playground mounts the merged Hodos Explorer component", async () => {
      const [integration, main, view] = await Promise.all([
        text("src/hodos/explorer.js"),
        text("src/main.js"),
        text("src/app/view.js"),
      ]);
      assert.match(integration, /createExplorerArea/);
      assert.match(integration, /registerHodosExplorerUi/);
      assert.match(integration, /createWorkspaceAreaHost/);
      assert.match(main, /mountHodosExplorer\(state\)/);
      assert.match(main, /disposeHodosExplorer\(\)/);
      assert.match(view, /<nav class="file-tree" aria-label="Workspace files"><\/nav>/);
      assert.doesNotMatch(view, /renderTree\(groupFiles\(state\.files\)\)/);
    });

    test("file selection and mutations enter Playground only through Explorer events", async () => {
      const [events, integration] = await Promise.all([
        text("src/app/events.js"),
        text("src/hodos/explorer.js"),
      ]);
      assert.match(events, /explorerWorkspacePatch\(event\.detail\)/);
      assert.match(events, /applyExplorerWorkspacePatch\(explorerPatch\)/);
      assert.doesNotMatch(events, /querySelectorAll\("\.tree-file"\)/);
      assert.doesNotMatch(events, /querySelector\("#new-file-button"\)\?\.addEventListener/);
      assert.doesNotMatch(events, /querySelector\("#delete-file-button"\)\?\.addEventListener/);
      assert.match(events, /prompt\("New workspace file"/);
      assert.match(events, /confirm\(`Delete \$\{patch\.path\}/);
      assert.match(events, /store\.write\(path/);
      assert.match(events, /store\.remove\(patch\.path\)/);
      for (const type of ["explorer/select", "explorer/toggle", "explorer/create", "explorer/delete"]) {
        assert.match(integration, new RegExp(`event/type\\\": \\\"${type.replace("/", "\\/")}`));
      }
      assert.match(integration, /replaceChildren/);
      assert.match(integration, /abort\.abort\(\)/);
      assert.doesNotMatch(integration, /innerHTML/);
    });

    test("Explorer projects explicit directories while storage remains Playground-owned", async () => {
      const [state, integration, events] = await Promise.all([
        text("src/hodos/explorer-state.js"),
        text("src/hodos/explorer.js"),
        text("src/app/events.js"),
      ]);
      assert.match(state, /kind: "directory"/);
      assert.match(state, /kind: "file"/);
      assert.match(integration, /projectExplorerEntries\(state\.files/);
      assert.doesNotMatch(integration, /store\.|WorkspaceStore|importRepository/);
      assert.match(events, /await store\.write/);
      assert.match(events, /await store\.remove/);
    });
    ''')


def clean_staging_files() -> None:
    for relative in (
        ".github/scripts/apply-hodos-explorer.py",
        ".github/workflows/apply-hodos-explorer.yml",
    ):
        target = ROOT / relative
        if target.exists():
            target.unlink()


def main() -> None:
    update_context()
    write_explorer_state()
    write_explorer_events()
    write_explorer_host()
    update_main()
    update_view()
    update_events()
    update_styles()
    write_tests()
    clean_staging_files()


if __name__ == "__main__":
    main()
