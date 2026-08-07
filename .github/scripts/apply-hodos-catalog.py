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


CATALOG_EVENTS = r'''import {
  activityById,
  toolById,
  toolsetById,
} from "../studio/catalog.js";

export const HODOS_CATALOG_COMPONENT_ID = "hodos.dev/catalog";
export const HODOS_CATALOG_TOOLS_AREA_ID = "catalog/tools";
export const HODOS_CATALOG_ACTIVITY_AREA_ID = "catalog/activity";

function eventType(value) {
  return value?.["event/type"] ?? value?.type ?? null;
}

function identity(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function expectedArea(value, areaId) {
  return value?.["area/id"] === areaId;
}

export function catalogWorkspacePatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value["component/id"] !== HODOS_CATALOG_COMPONENT_ID) return null;

  const type = eventType(value);
  if (type === "catalog/select-toolset") {
    if (!expectedArea(value, HODOS_CATALOG_TOOLS_AREA_ID)) return null;
    const toolsetId = identity(value.toolsetId, "Hodos Catalog toolset id");
    if (!toolsetById(toolsetId)) throw new Error(`Unknown Hodos Catalog toolset: ${toolsetId}`);
    return Object.freeze({ kind: "select-toolset", toolsetId });
  }

  if (type === "catalog/select-activity") {
    if (!expectedArea(value, HODOS_CATALOG_ACTIVITY_AREA_ID)) return null;
    const activityId = identity(value.activityId, "Hodos Catalog activity id");
    if (!activityById(activityId)) throw new Error(`Unknown Hodos Catalog activity: ${activityId}`);
    return Object.freeze({ kind: "select-activity", activityId });
  }

  if (type === "catalog/insert-tool") {
    if (!expectedArea(value, HODOS_CATALOG_TOOLS_AREA_ID)) return null;
    const toolsetId = identity(value.toolsetId, "Hodos Catalog toolset id");
    const toolId = identity(value.toolId, "Hodos Catalog tool id");
    if (!toolById(toolsetId, toolId)) {
      throw new Error(`Unknown Hodos Catalog tool: ${toolsetId}/${toolId}`);
    }
    return Object.freeze({ kind: "insert-tool", toolsetId, toolId });
  }

  if (
    type === "catalog/open-activity"
    || type === "catalog/check-activity"
    || type === "catalog/reset-activity"
  ) {
    if (!expectedArea(value, HODOS_CATALOG_ACTIVITY_AREA_ID)) return null;
    const activityId = identity(value.activityId, "Hodos Catalog activity id");
    if (!activityById(activityId)) throw new Error(`Unknown Hodos Catalog activity: ${activityId}`);
    return Object.freeze({
      kind: type.slice("catalog/".length),
      activityId,
    });
  }

  return null;
}
'''


CATALOG_HOST = r'''import { createHodosComponentRegistry } from "@greenways/hodos-web";
import { createWorkspaceAreaHost } from "@greenways/hodos-workspace-ui";
import { createCatalogArea } from "@greenways/hodos-dev";
import { registerHodosCatalogUi } from "@greenways/hodos-dev-ui";
import { isHaraSource } from "../workspace/project.js";
import { ACTIVITIES, TOOLSETS } from "../studio/catalog.js";

const registry = createHodosComponentRegistry();
registerHodosCatalogUi(registry, { createCatalogHost: createPlaygroundCatalogHost });

const projectedToolsets = Object.freeze(TOOLSETS.map((toolset) => Object.freeze({
  id: toolset.id,
  title: toolset.title,
  shortTitle: toolset.shortTitle,
  description: toolset.description,
  tools: Object.freeze((toolset.tools || []).map((tool) => Object.freeze({
    id: tool.id,
    label: tool.label,
    description: tool.description,
    detail: tool.detail ?? null,
  }))),
})));

const projectedActivities = Object.freeze(ACTIVITIES.map((activity) => Object.freeze({
  id: activity.id,
  toolsetId: activity.toolsetId,
  title: activity.title,
  level: activity.level,
  summary: activity.summary,
  instructions: Object.freeze([...(activity.instructions || [])]),
  path: activity.path,
  checkCount: activity.checks?.length || 0,
})));

let toolsAreaHost = null;
let activityAreaHost = null;

function send(dispatch, event) {
  void Promise.resolve(dispatch(event)).catch((error) => {
    console.error("[hara playground hodos catalog]", error);
  });
}

function element(document, tag, className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function appendText(parent, document, value) {
  parent.append(document.createTextNode(String(value ?? "")));
}

function option(document, value, label, selected) {
  const node = element(document, "option");
  node.value = value;
  node.textContent = label;
  node.selected = selected;
  return node;
}

function evidenceText(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function selectedToolset(model) {
  return model.toolsets?.find((toolset) => toolset.id === model.selection?.toolsetId)
    || model.toolsets?.[0]
    || null;
}

function selectedActivity(model) {
  return model.activities?.find((activity) => activity.id === model.selection?.activityId)
    || model.activities?.find((activity) => activity.toolsetId === model.selection?.toolsetId)
    || model.activities?.[0]
    || null;
}

function renderToolsSurface(container, model, dispatch, document, signal) {
  const toolset = selectedToolset(model);
  const selector = element(document, "div");
  const label = element(document, "label");
  appendText(label, document, "Toolset");

  const select = element(document, "select", "catalog-toolset-select");
  select.setAttribute("aria-label", "Developer toolset");
  for (const entry of model.toolsets || []) {
    select.append(option(
      document,
      entry.id,
      entry.title,
      entry.id === toolset?.id,
    ));
  }
  select.disabled = !model.capabilities?.selectToolset || !(model.toolsets?.length);
  select.addEventListener("change", () => send(dispatch, {
    "event/type": "catalog/select-toolset",
    toolsetId: select.value,
  }), { signal });
  label.append(select);

  const description = element(document, "span");
  description.textContent = toolset?.description || "Choose a toolset.";
  selector.append(label, description);

  const chips = element(document, "div", "tool-chips");
  for (const tool of toolset?.tools || []) {
    const button = element(document, "button", "tool-chip");
    button.type = "button";
    button.dataset.toolId = tool.id;
    button.title = tool.description;
    button.disabled = !model.capabilities?.insertTool;

    const name = element(document, "strong");
    name.textContent = tool.label;
    const detail = element(document, "span");
    detail.textContent = tool.description;
    button.append(name, detail);
    button.addEventListener("click", () => send(dispatch, {
      "event/type": "catalog/insert-tool",
      toolsetId: toolset.id,
      toolId: tool.id,
    }), { signal });
    chips.append(button);
  }

  container.append(selector, chips);
}

function renderActivityChecks(panel, model, document) {
  const checks = model.run?.checks || [];
  if (!checks.length) return;

  const list = element(document, "div", "activity-checks");
  for (const check of checks) {
    const row = element(document, "div", `activity-check ${check.status}`);
    const mark = element(document, "span", "activity-check-mark");
    mark.textContent = check.status === "passed" ? "✓" : check.status === "failed" ? "×" : "·";
    const label = element(document, "span");
    label.textContent = check.label;
    row.append(mark, label);

    if (check.status === "failed") {
      const evidence = element(document, "code");
      evidence.textContent = check.error
        || evidenceText(check.actual)
        || `expected ${evidenceText(check.expected)}`;
      row.append(evidence);
    }
    list.append(row);
  }
  panel.append(list);
}

function activityButton(document, label, className, disabled, action, activityId, dispatch, signal) {
  const button = element(document, "button", className);
  button.type = "button";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", () => send(dispatch, {
    "event/type": action,
    activityId,
  }), { signal });
  return button;
}

function renderActivitySurface(container, model, dispatch, document, signal) {
  const activity = selectedActivity(model);
  const activities = (model.activities || []).filter((entry) =>
    !model.selection?.toolsetId || entry.toolsetId === model.selection.toolsetId);

  const selector = element(document, "div", "activity-selector");
  const label = element(document, "label");
  appendText(label, document, "Activity");
  const select = element(document, "select", "catalog-activity-select");
  select.setAttribute("aria-label", "Guided activity");
  for (const entry of activities) {
    select.append(option(document, entry.id, entry.title, entry.id === activity?.id));
  }
  select.disabled = !model.capabilities?.selectActivity || !activities.length;
  select.addEventListener("change", () => send(dispatch, {
    "event/type": "catalog/select-activity",
    activityId: select.value,
  }), { signal });
  label.append(select);
  selector.append(label);
  container.append(selector);

  if (!activity) {
    const empty = element(document, "div", "catalog-empty");
    empty.textContent = "No activity is available for this toolset.";
    container.append(empty);
    return;
  }

  const panel = element(document, "section", "activity-panel");
  const kicker = element(document, "div", "activity-kicker");
  const level = element(document, "span");
  level.textContent = activity.level;
  const toolset = element(document, "span");
  toolset.textContent = activity.toolsetId;
  kicker.append(level, toolset);

  const title = element(document, "h2");
  title.textContent = activity.title;
  const summary = element(document, "p");
  summary.textContent = activity.summary;
  const instructions = element(document, "ol");
  for (const instruction of activity.instructions || []) {
    const item = element(document, "li");
    item.textContent = instruction;
    instructions.append(item);
  }
  panel.append(kicker, title, summary, instructions);
  renderActivityChecks(panel, model, document);

  if (model.run?.message) {
    const message = element(document, "div", `activity-message ${model.run.status}`);
    message.textContent = model.run.message;
    panel.append(message);
  }

  const busy = model.run?.status === "opening" || model.run?.status === "running";
  const actions = element(document, "div", "activity-actions");
  actions.append(
    activityButton(
      document,
      "Open",
      "quiet-action",
      busy || !model.capabilities?.openActivity,
      "catalog/open-activity",
      activity.id,
      dispatch,
      signal,
    ),
    activityButton(
      document,
      "Check",
      "primary-mini",
      busy || !model.capabilities?.checkActivity,
      "catalog/check-activity",
      activity.id,
      dispatch,
      signal,
    ),
    activityButton(
      document,
      "Reset",
      "text-button",
      busy || !model.capabilities?.resetActivity,
      "catalog/reset-activity",
      activity.id,
      dispatch,
      signal,
    ),
  );
  panel.append(actions);
  container.append(panel);
}

export function createPlaygroundCatalogHost({ container, dispatch }) {
  if (!container) throw new Error("Hodos Catalog requires a Playground container");
  const document = container.ownerDocument || globalThis.document;
  let renderAbort = null;

  return {
    update(model) {
      renderAbort?.abort();
      renderAbort = new AbortController();
      const signal = renderAbort.signal;
      container.replaceChildren();

      const next = model && typeof model === "object" ? model : {};
      if (next.surface === "tools") {
        renderToolsSurface(container, next, dispatch, document, signal);
      } else if (next.surface === "activity") {
        renderActivitySurface(container, next, dispatch, document, signal);
      } else {
        throw new Error(`Unsupported Playground Catalog surface: ${next.surface}`);
      }
      container.dataset.catalogSurface = next.surface || "";
      container.dataset.catalogId = next.catalog?.id || "";
    },
    dispose() {
      renderAbort?.abort();
      container.replaceChildren();
      delete container.dataset.catalogSurface;
      delete container.dataset.catalogId;
    },
  };
}

function catalogRunFromPlayground(state) {
  const status = state.activityRun?.status === "ready"
    ? "idle"
    : ["idle", "opening", "running", "passed", "failed"].includes(state.activityRun?.status)
      ? state.activityRun.status
      : "idle";
  return {
    status,
    message: state.activityRun?.message || "",
    checks: (state.activityRun?.checks || []).map((check, index) => ({
      id: check.id || `check/${index + 1}`,
      label: check.label,
      status: check.passed ? "passed" : "failed",
      actual: check.actual ?? null,
      expected: check.expected ?? null,
      error: check.error || null,
    })),
  };
}

export function catalogAreaFromPlayground(state, surface) {
  const haraFileSelected = Boolean(
    state.selectedPath && isHaraSource(state.selectedPath),
  );
  return createCatalogArea({
    id: surface === "tools" ? "catalog/tools" : "catalog/activity",
    title: surface === "tools" ? "Developer tools" : "Guided activity",
    catalogId: "hara-playground/catalog",
    catalogTitle: "Hara Playground Catalog",
    version: "1",
    source: "hara-playground",
    surface,
    toolsets: projectedToolsets,
    activities: projectedActivities,
    selectedToolsetId: state.toolsetId,
    selectedActivityId: state.activityId,
    run: catalogRunFromPlayground(state),
    capabilities: {
      selectToolset: surface === "tools",
      selectActivity: surface === "activity",
      insertTool: surface === "tools" && haraFileSelected,
      openActivity: surface === "activity",
      checkActivity: surface === "activity" && state.runtimeStatus === "ready",
      resetActivity: surface === "activity",
    },
    metadata: {
      runtimeStatus: state.runtimeStatus,
      selectedPath: state.selectedPath,
    },
  });
}

function createAreaHost(root) {
  return createWorkspaceAreaHost({
    root,
    registry,
    dispatch(event) {
      globalThis.document?.dispatchEvent(new CustomEvent("hodos:workspace-event", {
        detail: event,
      }));
    },
  });
}

export function disposeHodosCatalog() {
  toolsAreaHost?.destroy();
  activityAreaHost?.destroy();
  toolsAreaHost = null;
  activityAreaHost = null;
}

export function mountHodosCatalog(state) {
  disposeHodosCatalog();
  const toolsRoot = globalThis.document?.querySelector("[data-hodos-catalog-tools]");
  const activityRoot = globalThis.document?.querySelector("[data-hodos-catalog-activity]");

  if (toolsRoot) {
    toolsAreaHost = createAreaHost(toolsRoot);
    toolsAreaHost.open(catalogAreaFromPlayground(state, "tools"));
  }
  if (activityRoot) {
    activityAreaHost = createAreaHost(activityRoot);
    activityAreaHost.open(catalogAreaFromPlayground(state, "activity"));
  }
  return Boolean(toolsAreaHost || activityAreaHost);
}

export function updateHodosCatalog(state) {
  let updated = false;
  if (toolsAreaHost) {
    toolsAreaHost.update(catalogAreaFromPlayground(state, "tools"));
    updated = true;
  }
  if (activityAreaHost) {
    activityAreaHost.update(catalogAreaFromPlayground(state, "activity"));
    updated = true;
  }
  return updated;
}
'''


CATALOG_CSS = r'''[data-hodos-catalog-tools],
[data-hodos-catalog-activity] {
  min-width: 0;
}

[data-hodos-catalog-tools][data-area-type="hodos.dev/catalog"] {
  display: grid;
}

.catalog-toolset-select,
.catalog-activity-select {
  min-width: 0;
}

.catalog-activity-slot {
  display: grid;
  gap: 10px;
}

.catalog-empty {
  padding: 14px 12px;
  color: var(--hara-faint);
  font-family: var(--hara-font-mono);
  font-size: .58rem;
  line-height: 1.5;
  text-align: center;
}
'''


CATALOG_EVENTS_TEST = r'''import assert from "node:assert/strict";
import test from "node:test";
import {
  HODOS_CATALOG_ACTIVITY_AREA_ID,
  HODOS_CATALOG_COMPONENT_ID,
  HODOS_CATALOG_TOOLS_AREA_ID,
  catalogWorkspacePatch,
} from "../src/hodos/catalog-events.js";

function event(areaId, type, payload = {}) {
  return {
    "component/id": HODOS_CATALOG_COMPONENT_ID,
    "area/id": areaId,
    "event/type": type,
    ...payload,
  };
}

test("Catalog semantic events project bounded application patches", () => {
  assert.deepEqual(
    catalogWorkspacePatch(event(
      HODOS_CATALOG_TOOLS_AREA_ID,
      "catalog/select-toolset",
      { toolsetId: "core" },
    )),
    { kind: "select-toolset", toolsetId: "core" },
  );
  assert.deepEqual(
    catalogWorkspacePatch(event(
      HODOS_CATALOG_TOOLS_AREA_ID,
      "catalog/insert-tool",
      { toolsetId: "core", toolId: "function" },
    )),
    { kind: "insert-tool", toolsetId: "core", toolId: "function" },
  );
  assert.deepEqual(
    catalogWorkspacePatch(event(
      HODOS_CATALOG_ACTIVITY_AREA_ID,
      "catalog/check-activity",
      { activityId: "live-value" },
    )),
    { kind: "check-activity", activityId: "live-value" },
  );
});

test("Catalog rejects cross-surface, unknown and executable event payloads", () => {
  assert.equal(catalogWorkspacePatch({
    "component/id": "other/catalog",
    "area/id": HODOS_CATALOG_TOOLS_AREA_ID,
    "event/type": "catalog/select-toolset",
    toolsetId: "core",
  }), null);
  assert.equal(catalogWorkspacePatch(event(
    HODOS_CATALOG_ACTIVITY_AREA_ID,
    "catalog/insert-tool",
    { toolsetId: "core", toolId: "function" },
  )), null);
  assert.throws(() => catalogWorkspacePatch(event(
    HODOS_CATALOG_TOOLS_AREA_ID,
    "catalog/insert-tool",
    { toolsetId: "core", toolId: "missing", snippet: "(delete-everything)" },
  )), /Unknown Hodos Catalog tool/);
  assert.throws(() => catalogWorkspacePatch(event(
    HODOS_CATALOG_ACTIVITY_AREA_ID,
    "catalog/open-activity",
    { activityId: "missing", source: "(malicious)" },
  )), /Unknown Hodos Catalog activity/);
});
'''


CATALOG_PROJECTION_TEST = r'''import assert from "node:assert/strict";
import test from "node:test";
import { catalogAreaFromPlayground } from "../src/hodos/catalog.js";

const state = {
  selectedPath: "src/main.hal",
  toolsetId: "core",
  activityId: "live-value",
  runtimeStatus: "ready",
  activityRun: {
    status: "failed",
    message: "One check needs attention",
    checks: [{
      id: "answer",
      label: "answer is 42",
      passed: false,
      actual: "0",
      expected: "true",
      error: "",
      expression: "(= answer 42)",
    }],
  },
};

test("Catalog projects descriptive tools and activities without executable content", () => {
  const tools = catalogAreaFromPlayground(state, "tools");
  const activity = catalogAreaFromPlayground(state, "activity");
  const toolsModel = tools["area/component"]["component/model"];
  const activityModel = activity["area/component"]["component/model"];

  assert.equal(tools["area/id"], "catalog/tools");
  assert.equal(activity["area/id"], "catalog/activity");
  assert.equal(toolsModel.capabilities.insertTool, true);
  assert.equal(activityModel.capabilities.checkActivity, true);
  assert.equal(activityModel.run.status, "failed");
  assert.equal(activityModel.run.checks[0].status, "failed");

  for (const toolset of toolsModel.toolsets) {
    for (const tool of toolset.tools) {
      assert.equal(Object.hasOwn(tool, "snippet"), false);
    }
  }
  for (const entry of activityModel.activities) {
    assert.equal(Object.hasOwn(entry, "source"), false);
    assert.equal(Object.hasOwn(entry, "checks"), false);
  }
  assert.equal(Object.hasOwn(activityModel.run.checks[0], "expression"), false);
  assert.equal(Object.hasOwn(activityModel.run.checks[0], "expr"), false);
});

test("Catalog insertion capability follows current Hara editor policy", () => {
  const noFile = catalogAreaFromPlayground({ ...state, selectedPath: null }, "tools");
  const textFile = catalogAreaFromPlayground({ ...state, selectedPath: "README.md" }, "tools");
  assert.equal(noFile["area/component"]["component/model"].capabilities.insertTool, false);
  assert.equal(textFile["area/component"]["component/model"].capabilities.insertTool, false);
});
'''


CATALOG_AUTHORITY_TEST = r'''import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const view = fs.readFileSync(new URL("../src/app/view.js", import.meta.url), "utf8");
const events = fs.readFileSync(new URL("../src/app/events.js", import.meta.url), "utf8");
const host = fs.readFileSync(new URL("../src/hodos/catalog.js", import.meta.url), "utf8");

test("Catalog visible mechanics route through Hodos areas", () => {
  assert.match(view, /data-hodos-catalog-tools/);
  assert.match(view, /data-hodos-catalog-activity/);
  assert.doesNotMatch(view, /function renderToolsetOptions/);
  assert.doesNotMatch(view, /function renderActivityPanel/);
  assert.doesNotMatch(events, /querySelector\("#toolset-select"\)/);
  assert.doesNotMatch(events, /querySelector\("#activity-select"\)/);
  assert.doesNotMatch(events, /querySelectorAll\("\.tool-chip"\)/);
  assert.match(events, /catalogWorkspacePatch/);
});

test("Catalog host renders safe descriptive projections only", () => {
  assert.match(host, /createCatalogArea/);
  assert.match(host, /registerHodosCatalogUi/);
  assert.match(host, /textContent/);
  assert.match(host, /replaceChildren/);
  assert.doesNotMatch(host, /innerHTML/);
  assert.doesNotMatch(host, /\.snippet/);
  assert.doesNotMatch(host, /activity\.source/);
  assert.doesNotMatch(host, /check\.expression/);
});
'''


def update_view() -> None:
    path = "src/app/view.js"
    source = read(path)
    source = replace_once(
        source,
        '''import {
  ACTIVITIES,
  TOOLSETS,
  activitiesForToolset,
  activityById,
  toolsetById
} from "../studio/catalog.js";
''',
        "",
        "Catalog view imports",
    )

    start = source.find("function renderToolsetOptions() {")
    end = source.find("function instantSummary() {")
    if start < 0 or end < 0 or end <= start:
        raise SystemExit("Catalog fixed renderer boundaries were not found")
    source = source[:start] + source[end:]

    source = replace_once(
        source,
        "function renderEditor(toolset) {",
        "function renderEditor() {",
        "Catalog editor signature",
    )
    source = replace_once(
        source,
        '''    <div class="toolset-strip"><div><label>Toolset<select id="toolset-select">${renderToolsetOptions()}</select></label><span>${escapeHtml(toolset.description)}</span></div><div class="tool-chips">${renderTools(toolset)}</div></div>''',
        '''    <div class="toolset-strip" data-hodos-catalog-tools aria-label="Developer tools"></div>''',
        "Catalog tools host",
    )
    source = replace_once(
        source,
        '''  const toolset = toolsetById(state.toolsetId) || TOOLSETS[0];
  const activity = activityById(state.activityId) || ACTIVITIES[0];
''',
        "",
        "Catalog workbench lookups",
    )
    source = replace_once(
        source,
        '''        <div class="activity-selector"><label>Activity<select id="activity-select">${renderActivityOptions()}</select></label></div>
        ${renderActivityPanel(activity)}''',
        '''        <section class="catalog-activity-slot" data-hodos-catalog-activity aria-label="Guided activity"></section>''',
        "Catalog activity host",
    )
    source = replace_once(
        source,
        "${renderEditor(toolset)}",
        "${renderEditor()}",
        "Catalog editor invocation",
    )
    write(path, source)


def update_events() -> None:
    path = "src/app/events.js"
    source = read(path)
    source = replace_once(
        source,
        'import { editorWorkspacePatch } from "../hodos/editor-events.js";\n',
        'import { catalogWorkspacePatch } from "../hodos/catalog-events.js";\n'
        'import { editorWorkspacePatch } from "../hodos/editor-events.js";\n',
        "Catalog event adapter import",
    )

    anchor = "\n\n    async function applyExplorerWorkspacePatch(patch) {"
    policy = r'''

async function applyCatalogWorkspacePatch(patch) {
  if (patch.kind === "select-toolset") {
    if (!selectToolset(patch.toolsetId)) {
      throw new Error(`Catalog toolset is unavailable: ${patch.toolsetId}`);
    }
    return;
  }
  if (patch.kind === "select-activity") {
    if (!selectActivity(patch.activityId)) {
      throw new Error(`Catalog activity is unavailable: ${patch.activityId}`);
    }
    return;
  }
  if (patch.kind === "insert-tool") {
    const tool = toolById(patch.toolsetId, patch.toolId);
    if (!tool) throw new Error(`Catalog tool is unavailable: ${patch.toolsetId}/${patch.toolId}`);
    const editor = document.querySelector("#editor");
    if (!editor || editor.disabled || !state.selectedPath || !isHaraSource(state.selectedPath)) {
      throw new Error("Select a Hara source file before inserting a tool template");
    }
    insertToolSnippet(editor, tool.snippet);
    return;
  }

  if (patch.activityId !== state.activityId) {
    throw new Error(`Catalog activity is no longer selected: ${patch.activityId}`);
  }
  if (patch.kind === "open-activity") {
    await openActivity();
    return;
  }
  if (patch.kind === "check-activity") {
    await checkActivity();
    return;
  }
  if (patch.kind === "reset-activity") {
    if (confirm("Restore the starter source for this activity? Your edits in its activity file will be replaced.")) {
      await openActivity({ reset: true });
    }
  }
}
'''
    if source.count(anchor) != 1:
        raise SystemExit(f"Catalog application policy anchor: expected one match, found {source.count(anchor)}")
    source = source.replace(anchor, policy + anchor, 1)

    source = replace_once(
        source,
        '''function handleHodosWorkspaceEvent(event) {
  try {
    const editorPatch = editorWorkspacePatch(event.detail, state.content);''',
        '''function handleHodosWorkspaceEvent(event) {
  try {
    const catalogPatch = catalogWorkspacePatch(event.detail);
    if (catalogPatch) {
      void applyCatalogWorkspacePatch(catalogPatch).catch(reportWorkspaceEventError);
      return;
    }
    const editorPatch = editorWorkspacePatch(event.detail, state.content);''',
        "Catalog Workspace event routing",
    )

    direct = r'''  document.querySelector("#toolset-select")?.addEventListener("change", (event) => selectToolset(event.currentTarget.value));
  document.querySelector("#activity-select")?.addEventListener("change", (event) => selectActivity(event.currentTarget.value));
  document.querySelectorAll(".tool-chip").forEach((button) => button.addEventListener("click", () => {
    const tool = toolById(state.toolsetId, button.dataset.toolId);
    if (tool) insertToolSnippet(editor, tool.snippet);
  }));
  document.querySelector("#activity-open-button")?.addEventListener("click", () => openActivity());
  document.querySelector("#activity-check-button")?.addEventListener("click", checkActivity);
  document.querySelector("#activity-reset-button")?.addEventListener("click", () => {
    if (confirm("Restore the starter source for this activity? Your edits in its activity file will be replaced.")) openActivity({ reset: true });
  });
'''
    source = replace_once(source, direct, "", "Direct Catalog listeners")
    write(path, source)


def update_main() -> None:
    path = "src/main.js"
    source = read(path)
    source = replace_once(
        source,
        'import { disposeHodosEditor, mountHodosEditor } from "./hodos/editor.js";\n',
        'import { disposeHodosCatalog, mountHodosCatalog } from "./hodos/catalog.js";\n'
        'import { disposeHodosEditor, mountHodosEditor } from "./hodos/editor.js";\n',
        "Catalog main import",
    )
    source = replace_once(
        source,
        '''function renderPlayground() {
  disposeHodosEditor();''',
        '''function renderPlayground() {
  disposeHodosCatalog();
  disposeHodosEditor();''',
        "Catalog disposal",
    )
    source = replace_once(
        source,
        '''  render(bindEvents);
  mountHodosExplorer(state);''',
        '''  render(bindEvents);
  mountHodosCatalog(state);
  mountHodosExplorer(state);''',
        "Catalog mount",
    )
    write(path, source)


def update_styles() -> None:
    path = "src/styles.css"
    source = read(path)
    source = replace_once(
        source,
        '@import url("./styles/hodos-explorer.css");\n',
        '@import url("./styles/hodos-explorer.css");\n'
        '@import url("./styles/hodos-catalog.css");\n',
        "Catalog styles import",
    )
    write(path, source)


def clean_staging_files() -> None:
    for relative in (
        ".github/scripts/apply-hodos-catalog.py",
        ".github/workflows/apply-hodos-catalog.yml",
    ):
        target = ROOT / relative
        if target.exists():
            target.unlink()


def main() -> None:
    write("src/hodos/catalog-events.js", CATALOG_EVENTS)
    write("src/hodos/catalog.js", CATALOG_HOST)
    write("src/styles/hodos-catalog.css", CATALOG_CSS)
    write("tests/hodos-catalog-events.test.js", CATALOG_EVENTS_TEST)
    write("tests/hodos-catalog-projection.test.js", CATALOG_PROJECTION_TEST)
    write("tests/hodos-catalog-authority.test.js", CATALOG_AUTHORITY_TEST)
    update_view()
    update_events()
    update_main()
    update_styles()
    clean_staging_files()


if __name__ == "__main__":
    main()
