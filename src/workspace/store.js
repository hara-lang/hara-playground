const DEFAULT_WORKSPACE = "local/hara-studio-demo";
const ACTIVE_WORKSPACE_KEY = "hara-studio:settings:active-workspace";
const METADATA_KEY_PREFIX = "hara-studio:settings:metadata:";
const DEFAULT_METADATA = Object.freeze({ source: "local", branch: null, commit: null });

function normalizePath(path) {
  return String(path).replace(/^\/+/, "").replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

export class MemoryBackend {
  constructor() {
    this.workspaces = new Map();
  }

  async list(workspace) {
    return [...(this.workspaces.get(workspace)?.keys() || [])].sort();
  }

  async read(workspace, path) {
    return this.workspaces.get(workspace)?.get(normalizePath(path)) ?? null;
  }

  async write(workspace, path, content) {
    if (!this.workspaces.has(workspace)) this.workspaces.set(workspace, new Map());
    this.workspaces.get(workspace).set(normalizePath(path), String(content));
  }

  async remove(workspace, path) {
    this.workspaces.get(workspace)?.delete(normalizePath(path));
  }

  async clear(workspace) {
    this.workspaces.delete(workspace);
  }
}

export class LocalStorageBackend {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.prefix = "hara-studio:";
  }

  key(workspace) {
    return `${this.prefix}${workspace}`;
  }

  load(workspace) {
    try {
      return JSON.parse(this.storage.getItem(this.key(workspace)) || "{}");
    } catch {
      return {};
    }
  }

  save(workspace, value) {
    this.storage.setItem(this.key(workspace), JSON.stringify(value));
  }

  async list(workspace) {
    return Object.keys(this.load(workspace)).sort();
  }

  async read(workspace, path) {
    return this.load(workspace)[normalizePath(path)] ?? null;
  }

  async write(workspace, path, content) {
    const files = this.load(workspace);
    files[normalizePath(path)] = String(content);
    this.save(workspace, files);
  }

  async remove(workspace, path) {
    const files = this.load(workspace);
    delete files[normalizePath(path)];
    this.save(workspace, files);
  }

  async clear(workspace) {
    this.storage.removeItem(this.key(workspace));
  }
}

export class OpfsBackend {
  async root() {
    return navigator.storage.getDirectory();
  }

  async workspaceDirectory(workspace, create = true) {
    let directory = await this.root();
    directory = await directory.getDirectoryHandle("hara-studio", { create });
    for (const part of workspace.split("/").filter(Boolean)) {
      directory = await directory.getDirectoryHandle(part, { create });
    }
    return directory;
  }

  async fileHandle(workspace, path, create = true) {
    const parts = normalizePath(path).split("/").filter(Boolean);
    const filename = parts.pop();
    if (!filename) throw new Error("A file path is required");
    let directory = await this.workspaceDirectory(workspace, create);
    for (const part of parts) directory = await directory.getDirectoryHandle(part, { create });
    return directory.getFileHandle(filename, { create });
  }

  async list(workspace) {
    const output = [];
    let root;
    try {
      root = await this.workspaceDirectory(workspace, false);
    } catch {
      return output;
    }
    async function walk(directory, prefix = "") {
      for await (const [name, handle] of directory.entries()) {
        const path = prefix ? `${prefix}/${name}` : name;
        if (handle.kind === "directory") await walk(handle, path);
        else output.push(path);
      }
    }
    await walk(root);
    return output.sort();
  }

  async read(workspace, path) {
    try {
      const handle = await this.fileHandle(workspace, path, false);
      return (await handle.getFile()).text();
    } catch {
      return null;
    }
  }

  async write(workspace, path, content) {
    const handle = await this.fileHandle(workspace, path, true);
    const writer = await handle.createWritable();
    await writer.write(String(content));
    await writer.close();
  }

  async remove(workspace, path) {
    const parts = normalizePath(path).split("/").filter(Boolean);
    const filename = parts.pop();
    let directory = await this.workspaceDirectory(workspace, false);
    for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: false });
    await directory.removeEntry(filename);
  }

  async clear(workspace) {
    const parts = workspace.split("/").filter(Boolean);
    const leaf = parts.pop();
    let directory = await this.root();
    directory = await directory.getDirectoryHandle("hara-studio", { create: true });
    for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: false });
    if (leaf) await directory.removeEntry(leaf, { recursive: true });
  }
}

export function detectBackend() {
  if (globalThis.navigator?.storage?.getDirectory) return new OpfsBackend();
  if (globalThis.localStorage) return new LocalStorageBackend();
  return new MemoryBackend();
}

export class WorkspaceStore extends EventTarget {
  constructor({ backend = detectBackend(), workspace = null, settingsStorage = globalThis.localStorage ?? null } = {}) {
    super();
    this.backend = backend;
    this.settingsStorage = settingsStorage;
    this.workspace = workspace || this.settingsStorage?.getItem(ACTIVE_WORKSPACE_KEY) || DEFAULT_WORKSPACE;
    this.metadata = this.readMetadata(this.workspace);
  }

  readMetadata(workspace) {
    try {
      return { ...DEFAULT_METADATA, ...JSON.parse(this.settingsStorage?.getItem(`${METADATA_KEY_PREFIX}${workspace}`) || "{}") };
    } catch {
      return { ...DEFAULT_METADATA };
    }
  }

  persistSelection() {
    if (!this.settingsStorage) return;
    this.settingsStorage.setItem(ACTIVE_WORKSPACE_KEY, this.workspace);
    this.settingsStorage.setItem(`${METADATA_KEY_PREFIX}${this.workspace}`, JSON.stringify(this.metadata));
  }

  use(workspace, metadata = null) {
    this.workspace = workspace;
    this.metadata = metadata == null ? this.readMetadata(workspace) : { ...DEFAULT_METADATA, ...metadata };
    this.persistSelection();
    this.dispatchEvent(new CustomEvent("workspace-changed", { detail: this.snapshot() }));
  }

  snapshot() {
    return { workspace: this.workspace, metadata: { ...this.metadata } };
  }

  list() {
    return this.backend.list(this.workspace);
  }

  read(path) {
    return this.backend.read(this.workspace, path);
  }

  async write(path, content) {
    const normalized = normalizePath(path);
    await this.backend.write(this.workspace, normalized, content);
    this.dispatchEvent(new CustomEvent("file-changed", { detail: { path: normalized, content } }));
  }

  async remove(path) {
    const normalized = normalizePath(path);
    await this.backend.remove(this.workspace, normalized);
    this.dispatchEvent(new CustomEvent("file-removed", { detail: { path: normalized } }));
  }

  async replace(files, metadata = {}) {
    await this.backend.clear(this.workspace).catch(() => {});
    await Promise.all(files.map((file) => this.backend.write(this.workspace, file.path, file.content)));
    this.metadata = { ...this.metadata, ...metadata };
    this.persistSelection();
    this.dispatchEvent(new CustomEvent("workspace-replaced", { detail: this.snapshot() }));
  }

  async seed(files) {
    if ((await this.list()).length > 0) return false;
    await Promise.all(files.map((file) => this.write(file.path, file.content)));
    return true;
  }

  async files() {
    const paths = await this.list();
    return Promise.all(paths.map(async (path) => ({ path, content: await this.read(path) })));
  }
}

export { ACTIVE_WORKSPACE_KEY, DEFAULT_METADATA, DEFAULT_WORKSPACE, METADATA_KEY_PREFIX, normalizePath };
