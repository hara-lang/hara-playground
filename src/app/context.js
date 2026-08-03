import { RuntimeClient } from "../runtime/client.js";
import { DEFAULT_WORKSPACE, WorkspaceStore } from "../workspace/store.js";
import { previewDocument } from "../ui/hta.js";
import {
  DEFAULT_ACTIVITY_ID,
  DEFAULT_TOOLSET_ID,
  activitiesForToolset,
  activityById,
  toolsetById
} from "../studio/catalog.js";

export const STUDIO_SETTING_KEYS = Object.freeze({
  theme: "hara-studio-theme",
  instaRepl: "hara-studio-instarepl",
  toolset: "hara-studio-toolset",
  activity: "hara-studio-activity"
});

function readSetting(key, fallback) {
  try {
    return globalThis.localStorage?.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

const storedActivity = activityById(readSetting(STUDIO_SETTING_KEYS.activity, DEFAULT_ACTIVITY_ID));
const storedToolset = toolsetById(readSetting(STUDIO_SETTING_KEYS.toolset, DEFAULT_TOOLSET_ID));
const initialToolsetId = storedToolset?.id || storedActivity?.toolsetId || DEFAULT_TOOLSET_ID;
const initialActivity = storedActivity?.toolsetId === initialToolsetId
  ? storedActivity
  : activitiesForToolset(initialToolsetId)[0] || activityById(DEFAULT_ACTIVITY_ID);

export const app = document.querySelector("#app");
export const store = new WorkspaceStore();
export const runtime = new RuntimeClient();

export const state = {
  files: [], selectedPath: null, content: "", dirty: false, namespace: "user",
  runtimeStatus: "booting", runtimeKind: "detecting", workspace: store.workspace,
  metadata: store.metadata, repl: [], history: [], historyIndex: 0,
  preview: previewDocument({ type: "html", html: '<main class="preview-shell"><article class="card"><span class="eyebrow">HARA STUDIO</span><h1>Booting runtime…</h1><p>The browser worker is loading your project.</p></article></main>' }),
  importBusy: false, importProgress: "", examples: [], exampleBusy: false,
  theme: readSetting(STUDIO_SETTING_KEYS.theme, "dark"),
  toolsetId: initialToolsetId,
  activityId: initialActivity?.id || DEFAULT_ACTIVITY_ID,
  activityRun: { status: "idle", checks: [], message: "" },
  instarepl: {
    enabled: readSetting(STUDIO_SETTING_KEYS.instaRepl, "true") !== "false",
    status: "idle",
    candidate: null,
    display: "",
    error: "",
    request: 0,
    evaluatedKey: null
  }
};

let saveTimer = null;
let instantTimer = null;
let renderer = () => {};
export const getSaveTimer = () => saveTimer;
export const setSaveTimer = (value) => { saveTimer = value; };
export const getInstantTimer = () => instantTimer;
export const setInstantTimer = (value) => { instantTimer = value; };
export const setRenderer = (value) => { renderer = value; };
export const renderNow = () => renderer();
export { DEFAULT_WORKSPACE };
