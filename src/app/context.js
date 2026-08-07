import { WebCapabilityRegistry } from "../runtime/capabilities.js";
import { RuntimeClient } from "../runtime/client.js";
import { DEFAULT_WORKSPACE, WorkspaceStore } from "../workspace/store.js";
import { previewDocument } from "../ui/hta.js";
import { createProblemsState } from "../hodos/problems-state.js";
import { createExplorerState } from "../hodos/explorer-state.js";
import {
  DEFAULT_ACTIVITY_ID,
  DEFAULT_TOOLSET_ID,
  activitiesForToolset,
  activityById,
  toolsetById
} from "../studio/catalog.js";

export const STUDIO_SETTING_KEYS = Object.freeze({
  theme: "hara-theme",
  instaRepl: "hara-studio-instarepl",
  toolset: "hara-studio-toolset",
  activity: "hara-studio-activity",
  rainbow: "hara-playground-rainbow-parens",
  paredit: "hara-playground-paredit",
  output: "hara-playground-output"
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
const initialTheme = readSetting(STUDIO_SETTING_KEYS.theme, readSetting("hara-studio-theme", "dark"));
const initialOutput = readSetting(STUDIO_SETTING_KEYS.output, "preview");

export const app = document.querySelector("#app");
export const store = new WorkspaceStore();
export const capabilities = new WebCapabilityRegistry({ grants: ["studio/eval"] });
export const runtime = new RuntimeClient(
  new URL("../runtime/worker.js", import.meta.url),
  { hostRegistry: capabilities }
);

export const state = {
  screen: "projects",
  files: [], selectedPath: null, content: "", dirty: false, namespace: "user",
  runtimeStatus: "idle", runtimeKind: "detecting", workspace: store.workspace,
  metadata: store.metadata, repl: [], replInput: "", history: [], historyIndex: 0,
  preview: previewDocument({ type: "html", html: '<main class="preview-shell"><article class="card"><span class="eyebrow">HARA KERNEL</span><h1>Open a project</h1><p>The preview is produced by values and effects from the browser kernel.</p></article></main>' }),

valueInspector: {
  request: 0,
  valueId: null,
  requestId: null,
  status: "idle",
  display: "",
  value: null,
  valueType: null,
  namespace: null,
  source: null,
  path: [],
  expanded: [[]],
  metadata: {},
  error: ""
},
  problems: createProblemsState(),
  explorer: createExplorerState(),
  importBusy: false, importProgress: "", examples: [], exampleBusy: false,
  theme: initialTheme === "light" ? "light" : "dark",
  home: { error: "", resume: null },
  outputTab: ["preview", "repl", "value", "problems"].includes(initialOutput) ? initialOutput : "preview",
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
  },
  editor: {
    cursor: 0,
    selectionStart: 0,
    selectionEnd: 0,
    rainbow: readSetting(STUDIO_SETTING_KEYS.rainbow, "true") !== "false",
    paredit: readSetting(STUDIO_SETTING_KEYS.paredit, "true") !== "false",
    structuralMessage: "",
    completion: {
      open: false,
      items: [],
      selected: 0,
      prefix: "",
      start: 0,
      end: 0,
      request: 0,
      line: 0,
      column: 0
    }
  }
};

let saveTimer = null;
let instantTimer = null;
let completionTimer = null;
let renderer = () => {};
export const getSaveTimer = () => saveTimer;
export const setSaveTimer = (value) => { saveTimer = value; };
export const getInstantTimer = () => instantTimer;
export const setInstantTimer = (value) => { instantTimer = value; };
export const getCompletionTimer = () => completionTimer;
export const setCompletionTimer = (value) => { completionTimer = value; };
export const setRenderer = (value) => { renderer = value; };
export const renderNow = () => renderer();
export { DEFAULT_WORKSPACE };
