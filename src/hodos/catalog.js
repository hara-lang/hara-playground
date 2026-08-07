import { createHodosComponentRegistry } from "@greenways/hodos-web";
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
