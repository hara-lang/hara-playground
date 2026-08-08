const tokenName = (value) => {
  if (typeof value === "string") return value.trim().replace(/^:/, "");
  if (value && typeof value === "object" && typeof value.name === "string") {
    const name = value.name.trim().replace(/^:/, "");
    const namespace = typeof value.namespace === "string"
      ? value.namespace.trim().replace(/^:/, "")
      : typeof value.ns === "string"
        ? value.ns.trim().replace(/^:/, "")
        : "";
    return namespace && !name.includes("/") ? `${namespace}/${name}` : name;
  }
  return String(value ?? "").trim().replace(/^:/, "");
};

const field = (value, names) => {
  if (!value || typeof value !== "object") return undefined;
  for (const name of names) if (Object.hasOwn(value, name)) return value[name];
  return undefined;
};

const areaId = (area) => tokenName(field(area, ["area/id", "id"]));
const areaType = (area) => tokenName(field(area, ["area/type", "type"]));
const layoutType = (layout) => tokenName(field(layout, ["layout/type", "type"]));
const layoutAreaId = (layout) => tokenName(field(layout, ["layout/area", "areaId", "area"]));

const PROJECT_TYPES = new Set(["project", "explorer", "files", "hodos.dev/explorer"]);
const EDITOR_TYPES = new Set(["code-editor", "editor", "hodos.dev/editor"]);
const OUTPUT_TYPES = new Set([
  "output",
  "preview",
  "repl",
  "problems",
  "value-inspector",
  "audio",
  "hodos.dev/preview",
  "hodos.dev/repl",
  "hodos.dev/problems",
  "hodos.dev/value-inspector",
]);

export const PLAYGROUND_WORKSPACE_AREAS = Object.freeze({
  project: "area/playground-project",
  editor: "area/playground-editor",
  output: "area/playground-output",
});

export const PLAYGROUND_WORKSPACE_SURFACES = Object.freeze([
  Object.freeze({ id: "files", role: "project", label: "Files", icon: "folder", mode: "files", order: 0 }),
  Object.freeze({ id: "code", role: "editor", label: "Code", icon: "code", mode: "code", order: 1 }),
  Object.freeze({ id: "preview", role: "output", label: "Canvas", icon: "eye", mode: "preview", order: 2 }),
  Object.freeze({ id: "audio", role: "output", label: "Audio", icon: "play", mode: "audio", order: 3 }),
  Object.freeze({ id: "repl", role: "output", label: "REPL", icon: "terminal", mode: "repl", order: 4, autoFocus: true }),
  Object.freeze({ id: "learn", role: "project", label: "Learn", icon: "command", mode: "learn", order: 5 }),
]);

export function workspaceAreaRole(area) {
  const presentationRole = tokenName(field(
    field(area, ["area/presentation", "presentation"]),
    ["presentation/role", "role"],
  ));
  if (new Set(["project", "editor", "output", "unsupported"]).has(presentationRole)) {
    return presentationRole;
  }
  const type = areaType(area);
  if (PROJECT_TYPES.has(type)) return "project";
  if (EDITOR_TYPES.has(type)) return "editor";
  if (OUTPUT_TYPES.has(type)) return "output";
  return "unsupported";
}

const emptyLayout = () => ({ "layout/type": "empty" });
const areaLayout = (id) => ({ "layout/type": "area", "layout/area": id });
const splitLayout = (id, direction, ratio, first, second) => ({
  "layout/type": "split",
  "layout/id": id,
  "layout/direction": direction,
  "layout/ratio": ratio,
  "layout/first": first,
  "layout/second": second,
});

const isEmptyLayout = (layout) => layoutType(layout) === "empty";

function compactSplit(layout) {
  if (layoutType(layout) !== "split") return layout;
  const first = field(layout, ["layout/first", "first"]);
  const second = field(layout, ["layout/second", "second"]);
  if (isEmptyLayout(first) && isEmptyLayout(second)) return emptyLayout();
  if (isEmptyLayout(first)) return second;
  if (isEmptyLayout(second)) return first;
  return layout;
}

function rewriteLayout(layout, aliases, path = "manifest", seen = new Set()) {
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) return emptyLayout();
  const type = layoutType(layout);
  if (!type || type === "empty") return emptyLayout();
  if (type === "area") {
    const original = layoutAreaId(layout);
    const mapped = aliases.get(original) || original;
    if (!mapped || seen.has(mapped)) return emptyLayout();
    seen.add(mapped);
    return areaLayout(mapped);
  }
  if (type !== "split") return { ...layout };
  const first = rewriteLayout(field(layout, ["layout/first", "first"]), aliases, `${path}/first`, seen);
  const second = rewriteLayout(field(layout, ["layout/second", "second"]), aliases, `${path}/second`, seen);
  return compactSplit({
    "layout/type": "split",
    "layout/id": tokenName(field(layout, ["layout/id", "id"])) || `layout/${path}`,
    "layout/direction": tokenName(field(layout, ["layout/direction", "direction"])) || "horizontal",
    "layout/ratio": field(layout, ["layout/ratio", "ratio"]) ?? 0.5,
    "layout/first": first,
    "layout/second": second,
  });
}

function removeLayoutArea(layout, id) {
  const type = layoutType(layout);
  if (type === "area") return layoutAreaId(layout) === id ? emptyLayout() : layout;
  if (type !== "split") return layout;
  return compactSplit({
    ...layout,
    "layout/first": removeLayoutArea(field(layout, ["layout/first", "first"]), id),
    "layout/second": removeLayoutArea(field(layout, ["layout/second", "second"]), id),
  });
}

function layoutContains(layout, id) {
  const type = layoutType(layout);
  if (type === "area") return layoutAreaId(layout) === id;
  if (type !== "split") return false;
  return layoutContains(field(layout, ["layout/first", "first"]), id)
    || layoutContains(field(layout, ["layout/second", "second"]), id);
}

function ensureContentLayout(layout, editorId, outputId) {
  let content = layout;
  if (!layoutContains(content, editorId)) {
    content = isEmptyLayout(content)
      ? areaLayout(editorId)
      : splitLayout("layout/playground-editor", "horizontal", 0.62, areaLayout(editorId), content);
  }
  if (!layoutContains(content, outputId)) {
    content = splitLayout("layout/playground-output", "horizontal", 0.68, content, areaLayout(outputId));
  }
  return content;
}

function withPresentation(area, role, id, title) {
  const presentation = field(area, ["area/presentation", "presentation"]);
  const next = { ...area };
  const retainsComponent = role === "unsupported"
    && Boolean(field(area, ["area/component", "component"]));
  if (!retainsComponent) {
    delete next["area/component"];
    delete next.component;
  }
  const explicitCompact = field(presentation, ["presentation/compact", "compact"]);
  next["area/id"] = id;
  next["area/title"] = field(area, ["area/title", "title"]) || title;
  next["area/presentation"] = {
    ...(presentation && typeof presentation === "object" && !Array.isArray(presentation) ? presentation : {}),
    "presentation/label": field(presentation, ["presentation/label", "label"]) || next["area/title"],
    "presentation/role": role,
    "presentation/compact": explicitCompact == null ? role !== "unsupported" : Boolean(explicitCompact),
  };
  return next;
}

function syntheticArea(id, type, title, role) {
  return withPresentation({
    "area/id": id,
    "area/type": type,
    "area/title": title,
  }, role, id, title);
}

const fallbackView = (state) => ({
  "workspace/id": tokenName(state.workspace) || "workspace/playground",
  "workspace/revision": 0,
  "workspace/layout": emptyLayout(),
  "workspace/areas": [],
  "workspace/selection": {},
  "workspace/customizations": {},
});

const selectedAreaId = (view) => tokenName(field(
  field(view, ["workspace/selection", "selection"]),
  ["area/id", "areaId"],
));

const selectedSurfaceId = (view) => tokenName(field(
  field(view, ["workspace/selection", "selection"]),
  ["surface/id", "surfaceId"],
));

export function projectPlaygroundWorkspace(state) {
  const loaded = state?.workspaceShell?.workspaceId === state?.workspace
    ? state.workspaceShell.view
    : null;
  const view = loaded && typeof loaded === "object" ? loaded : fallbackView(state || {});
  const originalAreas = Array.isArray(view["workspace/areas"]) ? view["workspace/areas"] : [];
  const canonical = { project: null, editor: null, output: null };
  for (const area of originalAreas) {
    const role = workspaceAreaRole(area);
    if (role !== "unsupported" && !canonical[role]) canonical[role] = area;
  }

  const ids = {
    project: canonical.project ? areaId(canonical.project) : PLAYGROUND_WORKSPACE_AREAS.project,
    editor: canonical.editor ? areaId(canonical.editor) : PLAYGROUND_WORKSPACE_AREAS.editor,
    output: canonical.output ? areaId(canonical.output) : PLAYGROUND_WORKSPACE_AREAS.output,
  };
  const aliases = new Map();
  const unsupported = [];
  for (const area of originalAreas) {
    const id = areaId(area);
    if (!id) continue;
    const role = workspaceAreaRole(area);
    if (role === "unsupported") {
      aliases.set(id, id);
      unsupported.push(withPresentation(area, "unsupported", id, field(area, ["area/title", "title"]) || id));
    } else aliases.set(id, ids[role]);
  }

  const areas = [
    canonical.project
      ? withPresentation(canonical.project, "project", ids.project, "Project")
      : syntheticArea(ids.project, "project", "Project", "project"),
    canonical.editor
      ? withPresentation(canonical.editor, "editor", ids.editor, "Code")
      : syntheticArea(ids.editor, "code-editor", "Code", "editor"),
    canonical.output
      ? withPresentation(canonical.output, "output", ids.output, "Output")
      : syntheticArea(ids.output, "output", "Output", "output"),
    ...unsupported,
  ];

  const rewritten = rewriteLayout(view["workspace/layout"], aliases);
  const withoutProject = removeLayoutArea(rewritten, ids.project);
  const content = ensureContentLayout(withoutProject, ids.editor, ids.output);
  const layout = splitLayout(
    "layout/playground-root",
    "horizontal",
    0.18,
    areaLayout(ids.project),
    content,
  );

  const fixedSurfaces = PLAYGROUND_WORKSPACE_SURFACES.map((surface) => ({
    "surface/id": surface.id,
    "surface/area": ids[surface.role],
    "surface/label": surface.label,
    "surface/icon": surface.icon,
    "surface/mode": surface.mode,
    "surface/order": surface.order,
    "surface/auto-focus": Boolean(surface.autoFocus),
  }));
  const extensionSurfaces = unsupported
    .filter((area) => Boolean(field(area, ["area/component", "component"])))
    .map((area, index) => {
      const presentation = field(area, ["area/presentation", "presentation"]) || {};
      const id = tokenName(field(presentation, ["presentation/surface", "surfaceId"])) || areaId(area);
      const order = Number(field(presentation, ["presentation/order", "order"]));
      return {
        "surface/id": id,
        "surface/area": areaId(area),
        "surface/label": field(presentation, ["presentation/label", "label"])
          || field(area, ["area/title", "title"])
          || areaId(area),
        "surface/icon": tokenName(field(presentation, ["presentation/icon", "icon"])) || "document",
        "surface/mode": tokenName(field(presentation, ["presentation/mode", "mode"])) || "document",
        "surface/order": Number.isFinite(order) ? order : 100 + index,
        "surface/auto-focus": Boolean(field(presentation, ["presentation/auto-focus", "autoFocus"])),
      };
    });
  const surfaces = [...fixedSurfaces, ...extensionSurfaces];

  const manifestSurfaceId = selectedSurfaceId(view);
  const manifestSelectedAreaId = aliases.get(selectedAreaId(view)) || selectedAreaId(view);
  const manifestSurface = surfaces.find((surface) =>
    tokenName(surface["surface/id"]) === manifestSurfaceId
      && surface["surface/area"] === manifestSelectedAreaId);
  const showcase = state?.presentation?.mode === "showcase";
  const requestedSurfaceId = showcase
    ? tokenName(state?.presentation?.surfaceId)
    : "";
  let surfaceId = requestedSurfaceId
    || manifestSurface?.["surface/id"]
    || tokenName(state?.workspaceShell?.surfaceId)
    || manifestSurfaceId;
  if (!surfaces.some((surface) => tokenName(surface["surface/id"]) === surfaceId)) {
    const mappedSelection = aliases.get(selectedAreaId(view)) || selectedAreaId(view);
    const extension = extensionSurfaces.find((surface) => surface["surface/area"] === mappedSelection);
    surfaceId = mappedSelection === ids.project ? "files"
      : mappedSelection === ids.output ? "preview"
        : mappedSelection === ids.editor ? "code"
          : extension?.["surface/id"] || "code";
  }
  const selectedSurface = surfaces.find((surface) =>
    tokenName(surface["surface/id"]) === surfaceId) || fixedSurfaces[1];
  const selectedProjectedAreaId = selectedSurface?.["surface/area"] || ids.editor;
  const baseCustomizations = view["workspace/customizations"];
  const customizations = baseCustomizations && typeof baseCustomizations === "object" && !Array.isArray(baseCustomizations)
    ? baseCustomizations
    : {};
  return {
    ...view,
    "workspace/id": tokenName(view["workspace/id"]) || tokenName(state?.workspace) || "workspace/playground",
    "workspace/layout": showcase ? areaLayout(selectedProjectedAreaId) : layout,
    "workspace/areas": areas,
    "workspace/selection": {
      "area/id": selectedProjectedAreaId,
      "surface/id": surfaceId,
    },
    "workspace/customizations": {
      ...customizations,
      "presentation/mode": showcase ? "showcase" : "studio",
      "responsive/breakpoint": Number(customizations["responsive/breakpoint"] ?? 1000),
      "responsive/default-surface": surfaceId,
      "responsive/surfaces": surfaces,
    },
  };
}

export function playgroundSurfaceById(descriptor, surfaceIdValue) {
  const surfaceId = tokenName(surfaceIdValue);
  return descriptor?.["workspace/customizations"]?.["responsive/surfaces"]?.find((surface) =>
    tokenName(surface["surface/id"]) === surfaceId) || null;
}

export function playgroundAreaIds(descriptor) {
  return new Set((descriptor?.["workspace/areas"] || []).map(areaId).filter(Boolean));
}

export { tokenName as workspaceTokenName };
