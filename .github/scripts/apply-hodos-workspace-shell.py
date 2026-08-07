from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write(relative: str, content: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return source.replace(old, new, 1)


WORKSPACE_LAYOUT_CSS = r'''/* Playground-specific projection of @greenways/hodos-workspace-ui. */
.workbench-grid.hodos-workspace-shell {
  min-width: 0;
  min-height: 710px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 0;
  padding: 0;
  overflow: hidden;
}

.workbench-grid .hodos-workspace-layout,
.workbench-grid .hodos-workspace-split,
.workbench-grid .hodos-workspace-pane {
  min-width: 0;
  min-height: 0;
}

.workbench-grid .hodos-workspace-pane {
  padding: 0 3px;
}

.workbench-grid .hodos-workspace-divider {
  color: var(--hara-border-strong);
  outline: none;
}

.workbench-grid .hodos-workspace-divider:hover,
.workbench-grid .hodos-workspace-divider:focus-visible {
  color: var(--hara-spectrum-green);
}

.workbench-grid .hodos-workspace-area {
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
}

.workspace-unsupported-area {
  min-width: 0;
  min-height: 0;
  display: grid;
  align-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
  overflow: auto;
}

.workspace-unsupported-area h2,
.workspace-unsupported-area p {
  margin: 0;
}

.workspace-unsupported-area p {
  color: var(--hara-muted);
  font-family: var(--hara-font-mono);
  font-size: .68rem;
  line-height: 1.6;
}

.mobile-instarepl { display: none; }

@media (max-width: 1000px) {
  html,
  body,
  #app {
    width: 100%;
    min-height: 100%;
  }

  body {
    overflow: hidden;
    overscroll-behavior: none;
  }

  .playground-shell {
    height: 100dvh;
    min-height: 100dvh;
    grid-template-rows: auto 30px minmax(0, 1fr);
    overflow: hidden;
  }

  .workbench-header {
    min-height: 54px;
    padding: 8px 12px;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
  }

  .brand-button span,
  .project-identity strong,
  .project-identity small,
  #open-projects-button {
    display: none;
  }

  .project-identity {
    justify-self: center;
    width: min(44vw, 260px);
  }

  .project-identity > span { display: none; }
  .project-identity > div {
    min-width: 0;
    display: block;
    text-align: center;
  }
  .project-identity > div::before {
    content: "Hara Studio";
    display: block;
    color: var(--hara-text);
    font-family: var(--hara-font-display);
    font-size: .88rem;
    font-weight: 760;
    letter-spacing: -.02em;
  }

  .workbench-actions { gap: 4px; }
  .workbench-actions .icon-button {
    width: 34px;
    height: 34px;
  }

  .kernel-ribbon {
    min-height: 30px;
    height: 30px;
    padding: 0 12px;
    overflow: hidden;
  }

  .kernel-ribbon > span:not(.runtime-pill):not(.import-progress) { display: none; }
  .kernel-ribbon .import-progress {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workbench-grid.hodos-workspace-shell {
    min-height: 0;
    padding: 6px 6px 0;
    grid-template-rows: minmax(0, 1fr) calc(58px + env(safe-area-inset-bottom, 0px));
    overflow: hidden;
  }

  .workbench-grid .hodos-workspace-compact-viewport {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .workbench-grid .hodos-workspace-compact-viewport > .hodos-workspace-area {
    min-width: 0;
    min-height: 0;
    display: grid;
  }

  .project-panel,
  .editor-panel,
  .output-panel {
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  .project-panel[data-mobile-mode="files"] .activity-selector,
  .project-panel[data-mobile-mode="files"] .activity-panel,
  .project-panel[data-mobile-mode="files"] .catalog-activity-slot {
    display: none !important;
  }

  .project-panel[data-mobile-mode="learn"] .project-path,
  .project-panel[data-mobile-mode="learn"] .file-tree,
  .project-panel[data-mobile-mode="learn"] .panel-heading > div {
    display: none !important;
  }

  .project-panel[data-mobile-mode="learn"] {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .project-panel[data-mobile-mode="learn"] .catalog-activity-slot {
    display: grid;
    min-height: 0;
    overflow: auto;
  }

  .editor-panel { grid-template-rows: auto auto auto auto minmax(0, 1fr) auto; }
  .editor-header { padding: 7px 10px; }
  .editor-meta,
  .toolset-strip,
  .lisp-toolbar,
  .editor-status {
    max-width: 100%;
  }

  .toolset-strip { overflow-x: auto; }
  .toolset-strip .tool-chips { display: flex; min-width: max-content; }
  .tool-chip { min-width: 118px; }

  .editor-wrap { grid-template-columns: 32px minmax(0, 1fr) !important; }
  .editor-wrap.with-instarepl { grid-template-columns: 32px minmax(0, 1fr) !important; }
  .instarepl-rail { display: none !important; }

  .playground-shell[data-mobile-surface="code"] .editor-panel {
    grid-template-rows: auto auto auto auto minmax(0, 1fr) auto auto;
  }

  .playground-shell[data-mobile-surface="code"] .mobile-instarepl {
    display: grid;
    border-top: 1px solid var(--hara-border);
    background: var(--hara-surface-2);
  }

  .mobile-instarepl-button {
    min-height: 38px;
    border: 0;
    background: transparent;
    color: var(--hara-text);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    cursor: pointer;
  }

  .mobile-instarepl-button span {
    min-width: 0;
    display: flex;
    gap: 8px;
    align-items: baseline;
  }

  .mobile-instarepl-button strong {
    font-size: .68rem;
    letter-spacing: .04em;
  }

  .mobile-instarepl-button small {
    color: var(--hara-muted);
    font-family: var(--hara-font-mono);
    font-size: .54rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-instarepl-button i {
    font-style: normal;
    transition: transform 140ms ease;
  }

  .mobile-instarepl.expanded .mobile-instarepl-button i { transform: rotate(180deg); }

  .mobile-instarepl-body {
    display: none;
    max-height: 112px;
    padding: 0 10px 10px;
    overflow: auto;
  }

  .mobile-instarepl.expanded .mobile-instarepl-body { display: block; }
  .mobile-instarepl-body code {
    color: var(--hara-spectrum-green);
    font-family: var(--hara-font-mono);
    font-size: .62rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .mobile-instarepl.error .mobile-instarepl-body code { color: var(--hara-danger); }

  .hodos-workspace-dock {
    position: relative;
    z-index: 40;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    grid-auto-flow: initial;
    grid-auto-columns: initial;
    min-height: 58px;
    padding: 4px 4px calc(4px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid var(--hara-border-strong);
    background: color-mix(in srgb, var(--hara-surface) 96%, transparent);
    box-shadow: 0 -12px 28px rgba(0, 0, 0, .2);
    backdrop-filter: blur(18px);
    overflow: visible;
  }

  .hodos-workspace-dock-item {
    min-width: 0;
    min-height: 48px;
    border-radius: 9px;
    color: var(--hara-muted);
    display: grid;
    place-items: center;
    align-content: center;
    gap: 2px;
    padding: 3px 2px;
  }

  .hodos-workspace-dock-item:hover,
  .hodos-workspace-dock-item.active,
  .hodos-workspace-dock-item[aria-pressed="true"] {
    color: var(--hara-text);
    background: var(--hara-surface-3);
  }

  .hodos-workspace-dock-item.active,
  .hodos-workspace-dock-item[aria-pressed="true"] {
    color: var(--hara-spectrum-green);
    box-shadow: inset 0 -2px 0 var(--hara-spectrum-green);
  }

  .mobile-dock-icon {
    display: block;
    font-family: var(--hara-font-mono);
    font-size: 1rem;
    font-weight: 760;
    line-height: 1;
  }

  .mobile-dock-label {
    display: block;
    font-size: .49rem;
    font-weight: 760;
    line-height: 1;
    letter-spacing: .035em;
    text-transform: uppercase;
  }

  .output-panel {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .output-tabs {
    overflow-x: auto;
    scrollbar-width: none;
  }
  .output-tabs::-webkit-scrollbar { display: none; }
  .output-tabs .preview-mode { display: none; }
  .output-tab { flex: 0 0 auto; }

  .statusbar { display: none; }
}

@media (max-width: 520px) {
  .project-identity { width: min(38vw, 190px); }
  .workbench-header { padding-inline: 8px; }
  .editor-actions .quiet-action { display: none; }
  .lisp-toolbar { overflow-x: auto; }
  .editor-modes,
  .structural-actions { flex: 0 0 auto; }
  .tool-chip { min-width: 104px; }
  .mobile-dock-label { font-size: .46rem; }
}
'''


WORKSPACE_LAYOUT_CONTRACT_TEST = r'''import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the application mounts the recursive Hodos Workspace shell", async () => {
  const main = await read("src/main.js");
  const shell = await read("src/hodos/workspace-shell.js");
  assert.match(main, /mountHodosWorkspaceShell/);
  assert.match(main, /disposeHodosWorkspaceShell/);
  assert.doesNotMatch(main, /installWorkspaceLayout/);
  assert.match(shell, /createWorkspaceShellHost/);
  assert.match(shell, /workspace\/area-select|hodos:workspace-event/);
});

test("compact mode exposes files, code, canvas, audio, repl and learning surfaces", async () => {
  const state = await read("src/hodos/workspace-shell-state.js");
  const assist = await read("src/app/workspace-assist.js");
  for (const marker of ["Files", "Code", "Canvas", "Audio", "REPL", "Learn"]) {
    assert.ok(state.includes(marker), `missing responsive surface ${marker}`);
  }
  assert.match(assist, /mobile-instarepl/);
  assert.match(state, /responsive\/surfaces/);
});

test("the Hodos package owns accessible recursive splitters", async () => {
  const shell = await read("vendor/hodos/packages/workspace-ui/src/shell.js");
  const styles = await read("vendor/hodos/packages/workspace-ui/src/shell.css");
  assert.match(shell, /role", "separator"/);
  assert.match(shell, /ArrowLeft/);
  assert.match(shell, /pointerdown/);
  assert.match(styles, /cursor: col-resize/);
  assert.match(styles, /cursor: row-resize/);
});

test("the final CSS layers adapt Hodos compact surfaces and dynamic Audio", async () => {
  const imports = await read("src/styles.css");
  const workspaceStyles = await read("src/styles/workspace-layout.css");
  const audioStyles = await read("src/styles/mobile-audio.css");
  assert.match(imports, /workspace-ui\/src\/shell\.css/);
  assert.match(imports, /workspace-layout\.css[\s\S]*mobile-audio\.css/);
  assert.match(workspaceStyles, /hodos-workspace-dock/);
  assert.match(workspaceStyles, /data-mobile-mode="learn"/);
  assert.match(audioStyles, /data-mobile-surface="audio"/);
  assert.match(audioStyles, /repeat\(6/);
  assert.match(workspaceStyles, /\.output-panel/);
  assert.match(workspaceStyles, /\.instarepl-rail \{ display: none !important; \}/);
});
'''


def update_context() -> None:
    path = "src/app/context.js"
    source = read(path)
    source = replace_once(
        source,
        "  problems: createProblemsState(),\n",
        '''  problems: createProblemsState(),
  workspaceShell: {
    workspaceId: null,
    status: "idle",
    source: "fallback",
    view: null,
    error: "",
    surfaceId: null
  },
''',
        "Workspace shell context",
    )
    write(path, source)


def update_actions() -> None:
    path = "src/app/actions.js"
    source = read(path)
    source = replace_once(
        source,
        '''import {
  appendProblemState,
  problemFromError,
  resetProblemsState,
  setProblemsStatus,
} from "../hodos/problems-state.js";
''',
        '''import {
  appendProblemState,
  problemFromError,
  resetProblemsState,
  setProblemsStatus,
} from "../hodos/problems-state.js";
import {
  WORKSPACE_MANIFEST_PATH,
  keyName,
  loadWorkspaceManifest,
  selectWorkspaceArea as selectWorkspaceAreaView,
} from "../workspace/manifest.js";
''',
        "Workspace manifest action imports",
    )

    source = replace_once(
        source,
        '''function resetActivityRun() {
  state.activityRun = { status: "idle", checks: [], message: "" };
}
''',
        '''function resetActivityRun() {
  state.activityRun = { status: "idle", checks: [], message: "" };
}

function loadingWorkspaceShell() {
  state.workspaceShell = {
    workspaceId: state.workspace,
    status: "loading",
    source: "fallback",
    view: null,
    error: "",
    surfaceId: state.workspaceShell?.surfaceId ?? null,
  };
}

export async function reloadWorkspaceManifest({ shouldRender = false } = {}) {
  const workspaceId = state.workspace;
  loadingWorkspaceShell();
  try {
    const result = await loadWorkspaceManifest({
      store,
      runtime,
      namespace: state.namespace,
    });
    if (state.workspace !== workspaceId) return false;
    if (result.status === "missing") {
      state.workspaceShell = {
        ...state.workspaceShell,
        workspaceId,
        status: "fallback",
        source: "fallback",
        view: null,
        error: "",
      };
    } else {
      state.namespace = result.namespace || state.namespace;
      state.workspaceShell = {
        ...state.workspaceShell,
        workspaceId,
        status: "ready",
        source: WORKSPACE_MANIFEST_PATH,
        view: result.view,
        error: "",
      };
    }
    if (shouldRender) render();
    return true;
  } catch (error) {
    if (state.workspace !== workspaceId) return false;
    state.workspaceShell = {
      ...state.workspaceShell,
      workspaceId,
      status: "error",
      source: WORKSPACE_MANIFEST_PATH,
      view: null,
      error: error.message,
    };
    recordActionProblem(error, {
      source: "workspace",
      phase: "manifest",
      path: WORKSPACE_MANIFEST_PATH,
    });
    appendRepl("error", `Workspace manifest fallback · ${error.message}`);
    if (shouldRender) render();
    return false;
  }
}

export function selectWorkspaceShellArea(areaId, surfaceId = null) {
  state.workspaceShell.surfaceId = surfaceId || state.workspaceShell.surfaceId;
  const view = state.workspaceShell.view;
  const hasArea = Array.isArray(view?.["workspace/areas"])
    && view["workspace/areas"].some((area) => keyName(area?.["area/id"] ?? area?.id) === areaId);
  if (hasArea) state.workspaceShell.view = selectWorkspaceAreaView(view, areaId, surfaceId);
  return true;
}
''',
        "Workspace manifest action policy",
    )

    source = replace_once(
        source,
        '''  await store.write(state.selectedPath, state.content);
  state.dirty = false;
''',
        '''  await store.write(state.selectedPath, state.content);
  state.dirty = false;
  if (state.selectedPath === WORKSPACE_MANIFEST_PATH && state.runtimeStatus === "ready") {
    await reloadWorkspaceManifest({ shouldRender: false });
  }
''',
        "Workspace manifest save reload",
    )

    source = replace_once(
        source,
        '''export async function bootRuntime() {
  state.runtimeStatus = "booting";
  resetInstantEvaluation();
''',
        '''export async function bootRuntime() {
  state.runtimeStatus = "booting";
  loadingWorkspaceShell();
  resetInstantEvaluation();
''',
        "Workspace manifest boot loading",
    )

    source = replace_once(
        source,
        '''    state.runtimeKind = result.runtimeKind || state.runtimeKind;
    state.runtimeStatus = "ready";
    state.problems = setProblemsStatus(
      state.problems,
      state.problems.entries.length ? "ready" : "idle",
    );
    appendRepl("result", `Hara kernel ready · ${sourceFiles.length} source files loaded · ${files.length} workspace files`);
''',
        '''    state.runtimeKind = result.runtimeKind || state.runtimeKind;
    state.runtimeStatus = "ready";
    await reloadWorkspaceManifest({ shouldRender: false });
    state.problems = setProblemsStatus(
      state.problems,
      state.problems.entries.length ? "ready" : "idle",
    );
    appendRepl("result", `Hara kernel ready · ${sourceFiles.length} source files loaded · ${files.length} workspace files`);
''',
        "Workspace manifest boot evaluation",
    )

    source = replace_once(
        source,
        '''  } catch (error) {
    state.runtimeStatus = "error";
    recordActionProblem(error, { source: "runtime", phase: "boot" });
''',
        '''  } catch (error) {
    state.runtimeStatus = "error";
    state.workspaceShell = {
      ...state.workspaceShell,
      workspaceId: state.workspace,
      status: "error",
      source: "fallback",
      view: null,
      error: error.message,
    };
    recordActionProblem(error, { source: "runtime", phase: "boot" });
''',
        "Workspace manifest boot failure",
    )
    write(path, source)


def update_events() -> None:
    path = "src/app/events.js"
    source = read(path)
    source = replace_once(
        source,
        'import { catalogWorkspacePatch } from "../hodos/catalog-events.js";\n',
        'import { catalogWorkspacePatch } from "../hodos/catalog-events.js";\n'
        'import { workspaceShellPatch } from "../hodos/workspace-shell-events.js";\n'
        'import {\n'
        '  currentHodosWorkspaceDescriptor,\n'
        '  updateHodosWorkspaceShell,\n'
        '} from "../hodos/workspace-shell.js";\n',
        "Workspace shell event imports",
    )
    source = replace_once(
        source,
        '''  saveCurrentFile,
  selectActivity,
  selectFile,
''',
        '''  saveCurrentFile,
  selectActivity,
  selectFile,
  selectWorkspaceShellArea,
''',
        "Workspace shell action import",
    )

    source = replace_once(
        source,
        '''

async function applyCatalogWorkspacePatch(patch) {
''',
        '''

async function applyWorkspaceShellPatch(patch) {
  selectWorkspaceShellArea(patch.areaId, patch.surfaceId);
  updateHodosWorkspaceShell(state);
}

async function applyCatalogWorkspacePatch(patch) {
''',
        "Workspace shell application policy",
    )

    source = replace_once(
        source,
        '''function handleHodosWorkspaceEvent(event) {
  try {
    const catalogPatch = catalogWorkspacePatch(event.detail);
''',
        '''function handleHodosWorkspaceEvent(event) {
  try {
    const shellPatch = workspaceShellPatch(event.detail, currentHodosWorkspaceDescriptor());
    if (shellPatch) {
      void applyWorkspaceShellPatch(shellPatch).catch(reportWorkspaceEventError);
      return;
    }
    const catalogPatch = catalogWorkspacePatch(event.detail);
''',
        "Workspace shell event routing",
    )
    write(path, source)


def update_view() -> None:
    path = "src/app/view.js"
    source = read(path)
    source = replace_once(
        source,
        'import { updateHodosRepl } from "../hodos/repl.js";\n',
        'import { updateHodosRepl } from "../hodos/repl.js";\n'
        'import { syncWorkspaceAssist } from "./workspace-assist.js";\n',
        "Workspace assistant import",
    )
    source = replace_once(
        source,
        '''export function updateInstaReplOnly() {
  const rail = document.querySelector("#instarepl-rail");
''',
        '''export function updateInstaReplOnly() {
  queueMicrotask(syncWorkspaceAssist);
  const rail = document.querySelector("#instarepl-rail");
''',
        "Workspace assistant synchronization",
    )
    write(path, source)


def update_main() -> None:
    path = "src/main.js"
    source = read(path)
    source = replace_once(
        source,
        'import { installWorkspaceLayout } from "./app/workspace-layout.js";\n',
        'import { mountWorkspaceAssist } from "./app/workspace-assist.js";\n'
        'import {\n'
        '  disposeHodosWorkspaceShell,\n'
        '  mountHodosWorkspaceShell,\n'
        '} from "./hodos/workspace-shell.js";\n',
        "Workspace shell main imports",
    )
    source = replace_once(
        source,
        '''function renderPlayground() {
  disposeHodosCatalog();
''',
        '''function renderPlayground() {
  disposeHodosWorkspaceShell();
  disposeHodosCatalog();
''',
        "Workspace shell disposal order",
    )
    source = replace_once(
        source,
        '''  mountHodosValueInspector(state);

  const footer = document.querySelector(".lobby-footer");
''',
        '''  mountHodosValueInspector(state);
  mountHodosWorkspaceShell(state);
  mountWorkspaceAssist();

  const footer = document.querySelector(".lobby-footer");
''',
        "Workspace shell mount order",
    )
    source = replace_once(source, "installWorkspaceLayout();\n", "", "Fixed Workspace controller removal")
    write(path, source)


def update_styles() -> None:
    path = "src/styles.css"
    source = read(path)
    source = replace_once(
        source,
        '@import url("./styles/responsive.css");\n@import url("./styles/workspace-layout.css");\n',
        '@import url("./styles/responsive.css");\n'
        '@import url("../vendor/hodos/packages/workspace-ui/src/shell.css");\n'
        '@import url("./styles/workspace-layout.css");\n',
        "Hodos Workspace shell stylesheet import",
    )
    write(path, source)
    write("src/styles/workspace-layout.css", WORKSPACE_LAYOUT_CSS)

    audio_path = "src/styles/mobile-audio.css"
    audio = read(audio_path)
    audio = audio.replace(".mobile-workspace-dock", ".hodos-workspace-dock")
    audio = audio.replace(".hodos-workspace-dock span", ".hodos-workspace-dock .mobile-dock-label")
    write(audio_path, audio)


def update_browser_smoke() -> None:
    path = "scripts/verify-supersonic-project-open.mjs"
    source = read(path)
    source = replace_once(
        source,
        '''  await page.waitForFunction(() =>
    document.querySelector("#editor")?.value.includes("playground/supersonic-live"),
  null,
  { timeout: 15_000 });

  const mounted = await page.evaluate(() => ({
''',
        '''  await page.waitForFunction(() =>
    document.querySelector("#editor")?.value.includes("playground/supersonic-live"),
  null,
  { timeout: 15_000 });
  await page.waitForFunction(() => {
    const shell = document.querySelector(".workbench-grid");
    return shell?.dataset.workspaceId === "playground-supersonic-live"
      && shell?.dataset.workspaceManifestStatus === "ready";
  }, null, { timeout: 15_000 });

  const mounted = await page.evaluate(() => ({
''',
        "Supersonic Workspace shell readiness",
    )
    source = replace_once(
        source,
        '''    queuedMicrotasks: globalThis.__haraQueuedMicrotasks,
    runtimeStatus: document.querySelector(".kernel-state")?.textContent || ""
  }));
  assert.ok(mounted.editorLength > 2_000, "the complete Supersonic source did not open");
  assert.equal(mounted.hasAudioTab, true, "the Audio output was not mounted");
''',
        '''    queuedMicrotasks: globalThis.__haraQueuedMicrotasks,
    runtimeStatus: document.querySelector(".kernel-state")?.textContent || "",
    workspaceId: document.querySelector(".workbench-grid")?.dataset.workspaceId || "",
    workspaceMode: document.querySelector(".workbench-grid")?.dataset.workspaceMode || "",
    manifestStatus: document.querySelector(".workbench-grid")?.dataset.workspaceManifestStatus || "",
    manifestSource: document.querySelector(".workbench-grid")?.dataset.workspaceManifestSource || ""
  }));
  assert.ok(mounted.editorLength > 2_000, "the complete Supersonic source did not open");
  assert.equal(mounted.hasAudioTab, true, "the Audio output was not mounted");
  assert.equal(mounted.workspaceId, "playground-supersonic-live");
  assert.ok(["desktop", "compact"].includes(mounted.workspaceMode));
  assert.equal(mounted.manifestStatus, "ready");
  assert.equal(mounted.manifestSource, "workspace.edn");
''',
        "Supersonic Workspace shell assertions",
    )
    write(path, source)


def update_contract_test() -> None:
    write("tests/workspace-layout-contract.test.js", WORKSPACE_LAYOUT_CONTRACT_TEST)


def clean_staging_files() -> None:
    for relative in (
        ".github/scripts/apply-hodos-workspace-shell.py",
        ".github/workflows/apply-hodos-workspace-shell.yml",
    ):
        target = ROOT / relative
        if target.exists():
            target.unlink()


def main() -> None:
    update_context()
    update_actions()
    update_events()
    update_view()
    update_main()
    update_styles()
    update_browser_smoke()
    update_contract_test()
    clean_staging_files()


if __name__ == "__main__":
    main()
