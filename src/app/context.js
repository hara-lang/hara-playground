import { RuntimeClient } from "../runtime/client.js";
import { DEFAULT_WORKSPACE, WorkspaceStore } from "../workspace/store.js";
import { previewDocument } from "../ui/hta.js";

export const app = document.querySelector("#app");
export const store = new WorkspaceStore();
export const runtime = new RuntimeClient();

export const state = {
  files: [], selectedPath: null, content: "", dirty: false, namespace: "user",
  runtimeStatus: "booting", runtimeKind: "detecting", workspace: store.workspace,
  metadata: store.metadata, repl: [], history: [], historyIndex: 0,
  preview: previewDocument({ type: "html", html: '<main class="preview-shell"><article class="card"><span class="eyebrow">HARA STUDIO</span><h1>Booting runtime…</h1><p>The browser worker is loading your project.</p></article></main>' }),
  importBusy: false, importProgress: "", examples: [], exampleBusy: false,
  theme: localStorage.getItem("hara-studio-theme") || "dark"
};

let saveTimer = null;
let renderer = () => {};
export const getSaveTimer = () => saveTimer;
export const setSaveTimer = (value) => { saveTimer = value; };
export const setRenderer = (value) => { renderer = value; };
export const renderNow = () => renderer();
export { DEFAULT_WORKSPACE };
