from pathlib import Path
import re
import textwrap

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(textwrap.dedent(content).lstrip("\n"), encoding="utf-8")


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return source.replace(old, new, 1)


def replace_regex(source: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return updated


def update_import_map() -> None:
    path = "index.html"
    source = read(path)
    source = replace_once(
        source,
        '          "@greenways/hodos-workspace-ui": "./vendor/hodos/packages/workspace-ui/src/index.js",\n          "@greenways/hodos-dev":',
        '          "@greenways/hodos-workspace-ui": "./vendor/hodos/packages/workspace-ui/src/index.js",\n          "@greenways/hodos-2d": "./vendor/hodos/packages/2d/src/index.js",\n          "@greenways/hodos-2d-ui": "./vendor/hodos/packages/2d-ui/src/index.js",\n          "@greenways/hodos-dev":',
        "Hodos 2D import map entries",
    )
    write(path, source)


def update_package_preparation() -> None:
    path = "scripts/prepare-web-packages.mjs"
    source = read(path)
    source = replace_once(
        source,
        '    marker: "vendor/hodos/packages/dev-ui/src/index.js",',
        '    marker: "vendor/hodos/packages/2d-ui/src/document-dom-host.js",',
        "Hodos 2D package marker",
    )
    write(path, source)


def update_styles() -> None:
    path = "src/styles.css"
    source = read(path)
    source = replace_once(
        source,
        '@import url("../vendor/hodos/packages/workspace-ui/src/shell.css");\n',
        '@import url("../vendor/hodos/packages/workspace-ui/src/shell.css");\n@import url("../vendor/hodos/packages/2d-ui/src/document.css");\n',
        "Hodos 2D document stylesheet",
    )
    source += '@import url("./styles/hodos-document.css");\n'
    write(path, source)
    write("src/styles/hodos-document.css", r'''
    .workspace-component-area {
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    .workspace-component-area[data-workspace-area-type="hodos.2d/document"] {
      --hodos-2d-document-border: var(--hara-border);
      --hodos-2d-document-control: var(--hara-surface-raised);
      --hodos-2d-document-control-hover: var(--hara-surface-hover);
      --hodos-2d-document-code-background: var(--hara-surface-raised);
      --hodos-2d-document-artefact-background: var(--hara-surface-muted);
      --hodos-2d-document-input-background: var(--hara-surface);
      --hodos-2d-document-selection: var(--hara-spectrum-violet);
      --hodos-2d-document-mono: var(--hara-font-mono);
    }

    .workspace-component-area .hodos-2d-document-host {
      min-height: 240px;
    }

    .workspace-component-area .hodos-2d-document-page {
      background:
        radial-gradient(circle at 20% 10%, color-mix(in srgb, var(--hara-spectrum-violet) 7%, transparent), transparent 38%),
        var(--hara-surface);
    }

    .workspace-component-area .hodos-2d-document-block {
      line-height: 1.65;
    }

    .workspace-component-area .hodos-2d-document-heading {
      letter-spacing: -0.025em;
    }
    ''')


def update_workspace_shell() -> None:
    path = "src/hodos/workspace-shell.js"
    source = read(path)
    source = replace_once(
        source,
        'import { createWorkspaceShellHost } from "@greenways/hodos-workspace-ui";\n',
        'import { createWorkspaceShellHost } from "@greenways/hodos-workspace-ui";\nimport { registerHodosDocumentDomUi } from "@greenways/hodos-2d-ui";\n',
        "Document DOM UI import",
    )
    source = replace_once(
        source,
        'const registry = createHodosComponentRegistry();\n',
        '''const registry = createHodosComponentRegistry();
registerHodosDocumentDomUi(registry, {
  documentDom: {
    reportError(error) {
      console.error("[hara playground hodos document]", error);
    },
  },
});
''',
        "Document DOM UI registration",
    )
    source = replace_once(
        source,
        '  learn: "?",\n',
        '  learn: "?",\n  document: "▤",\n',
        "Document surface glyph",
    )
    source = replace_once(
        source,
        '  if (mode === "learn") return globalThis.document?.querySelector(".activity-panel button") ?? null;\n  return null;\n',
        '  if (mode === "learn") return globalThis.document?.querySelector(".activity-panel button") ?? null;\n  if (mode === "document") return globalThis.document?.querySelector(\'[data-hodos-component="hodos.2d/document"] [contenteditable="plaintext-only"], [data-hodos-component="hodos.2d/document"] textarea\') ?? null;\n  return null;\n',
        "Document focus target",
    )
    source = replace_once(
        source,
        '''  const root = document.createElement("section");
  root.className = "workspace-unsupported-area hara-surface";
  const title = document.createElement("h2");
''',
        '''  const root = document.createElement("section");
  if (area?.component) {
    root.className = "workspace-component-area hara-surface";
    return root;
  }
  root.className = "workspace-unsupported-area hara-surface";
  const title = document.createElement("h2");
''',
        "Manifest component area root",
    )
    write(path, source)


def update_workspace_projection() -> None:
    path = "src/hodos/workspace-shell-state.js"
    source = read(path)
    replacement = '''function withPresentation(area, role, id, title) {
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

function syntheticArea'''
    source = replace_regex(
        source,
        r'function withPresentation\(area, role, id, title\) \{.*?\n\}\n\nfunction syntheticArea',
        replacement,
        "Workspace presentation compatibility",
    )

    start = source.index('  let surfaceId = tokenName(state?.workspaceShell?.surfaceId) || selectedSurfaceId(view);')
    end = source.index('  return {\n    ...view,', start)
    surface_projection = '''  const fixedSurfaces = PLAYGROUND_WORKSPACE_SURFACES.map((surface) => ({
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

  let surfaceId = tokenName(state?.workspaceShell?.surfaceId) || selectedSurfaceId(view);
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
  const selectedAreaId = selectedSurface?.["surface/area"] || ids.editor;
  const baseCustomizations = view["workspace/customizations"];
  const customizations = baseCustomizations && typeof baseCustomizations === "object" && !Array.isArray(baseCustomizations)
    ? baseCustomizations
    : {};
'''
    source = source[:start] + surface_projection + source[end:]
    source = replace_once(
        source,
        '      "area/id": areaByRole,\n',
        '      "area/id": selectedAreaId,\n',
        "Workspace selected extension area",
    )
    write(path, source)


def write_document_state() -> None:
    write("src/hodos/document-events.js", r'''
    const COMPONENT_ID = "hodos.2d/document";
    const MAX_TEXT_LENGTH = 1_000_000;

    const nonEmptyString = (value, label) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new TypeError(`${label} must be a non-empty string`);
      }
      return value.trim();
    };

    const identity = (event) => {
      const componentId = nonEmptyString(event["component/id"], "Hodos Document component id");
      if (componentId !== COMPONENT_ID) {
        throw new Error(`Unexpected Hodos Document component: ${componentId}`);
      }
      return {
        areaId: nonEmptyString(event["area/id"], "Hodos Document area id"),
        documentId: nonEmptyString(event.documentId, "Hodos Document document id"),
      };
    };

    export function documentWorkspacePatch(event) {
      if (!event || typeof event !== "object" || Array.isArray(event)) return null;
      const type = typeof event["event/type"] === "string" ? event["event/type"] : "";
      if (!type.startsWith("document/")) return null;
      const base = identity(event);

      if (type === "document/select") {
        return Object.freeze({
          kind: "select",
          ...base,
          nodeId: nonEmptyString(event.nodeId, "Hodos Document selected node id"),
        });
      }

      if (type === "document/edit-text") {
        if (typeof event.previous !== "string" || typeof event.text !== "string") {
          throw new TypeError("Hodos Document text edits require previous and text strings");
        }
        if (event.text.length > MAX_TEXT_LENGTH) {
          throw new RangeError("Hodos Document text exceeds the application limit");
        }
        return Object.freeze({
          kind: "edit-text",
          ...base,
          blockId: nonEmptyString(event.blockId, "Hodos Document block id"),
          textId: nonEmptyString(event.textId, "Hodos Document text id"),
          previous: event.previous,
          text: event.text,
        });
      }

      throw new Error(`Unsupported Hodos Document event: ${type}`);
    }
    ''')

    write("src/hodos/document-state.js", r'''
    const objectValue = (value, label) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError(`${label} must be an object`);
      }
      return value;
    };

    const nonEmptyString = (value, label) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new TypeError(`${label} must be a non-empty string`);
      }
      return value.trim();
    };

    const areaId = (area) => String(area?.["area/id"] ?? area?.id ?? "").replace(/^:/, "");

    function documentArea(view, areaIdValue) {
      const input = objectValue(view, "Workspace document view");
      const areas = input["workspace/areas"];
      if (!Array.isArray(areas)) throw new TypeError("Workspace document areas must be an array");
      const requested = nonEmptyString(areaIdValue, "Workspace document area id");
      const index = areas.findIndex((area) => areaId(area) === requested);
      if (index < 0) throw new Error(`Workspace document area is missing: ${requested}`);
      const area = objectValue(areas[index], "Workspace document area");
      const component = objectValue(
        area["area/component"] ?? area.component,
        "Workspace document component",
      );
      if (component["component/id"] !== "hodos.2d/document") {
        throw new Error(`Workspace area is not a Hodos Document: ${requested}`);
      }
      const model = objectValue(component["component/model"], "Workspace document model");
      const document = objectValue(model.document, "Workspace document value");
      return { input, areas, requested, index, area, component, model, document };
    }

    const nextRevision = (value) => {
      const revision = Number(value ?? 0);
      return Number.isSafeInteger(revision) && revision >= 0 ? revision + 1 : 1;
    };

    function replaceArea(record, nextModel) {
      const nextComponent = {
        ...record.component,
        "component/model": nextModel,
      };
      const nextArea = {
        ...record.area,
        "area/component": nextComponent,
      };
      delete nextArea.component;
      const nextAreas = [...record.areas];
      nextAreas[record.index] = nextArea;
      return {
        ...record.input,
        "workspace/revision": nextRevision(record.input["workspace/revision"]),
        "workspace/areas": nextAreas,
        "workspace/selection": {
          ...(record.input["workspace/selection"] ?? {}),
          "area/id": record.requested,
        },
      };
    }

    function containsNode(children, nodeId) {
      for (const node of children ?? []) {
        if (node?.id === nodeId) return true;
        if (containsNode(node?.children, nodeId)) return true;
      }
      return false;
    }

    function replaceText(children, patch, parentBlockId = null) {
      let changed = false;
      const next = (children ?? []).map((node) => {
        if (!node || typeof node !== "object") return node;
        if (node.type === "text") {
          if (parentBlockId !== patch.blockId || node.id !== patch.textId) return node;
          if (node.text !== patch.previous) {
            throw new Error(`Stale Hodos Document text edit for ${patch.textId}`);
          }
          changed = true;
          return { ...node, text: patch.text };
        }
        const result = replaceText(node.children, patch, node.id);
        if (!result.changed) return node;
        changed = true;
        return { ...node, children: result.children };
      });
      return { children: next, changed };
    }

    export function selectWorkspaceDocumentNode(view, patch) {
      const record = documentArea(view, patch.areaId);
      const documentId = nonEmptyString(patch.documentId, "Workspace document id");
      if (record.document.id !== documentId) {
        throw new Error(`Workspace document identity changed: ${documentId}`);
      }
      const nodeId = nonEmptyString(patch.nodeId, "Workspace document selected node id");
      if (!containsNode(record.document.children, nodeId)) {
        throw new Error(`Workspace document node is missing: ${nodeId}`);
      }
      return replaceArea(record, {
        ...record.model,
        selection: {
          ...(record.model.selection ?? {}),
          nodeId,
        },
      });
    }

    export function editWorkspaceDocumentText(view, patch) {
      const record = documentArea(view, patch.areaId);
      const documentId = nonEmptyString(patch.documentId, "Workspace document id");
      if (record.document.id !== documentId) {
        throw new Error(`Workspace document identity changed: ${documentId}`);
      }
      const result = replaceText(record.document.children, patch);
      if (!result.changed) {
        throw new Error(`Workspace document text is missing: ${patch.blockId}/${patch.textId}`);
      }
      return replaceArea(record, {
        ...record.model,
        document: {
          ...record.document,
          revision: nextRevision(record.document.revision),
          children: result.children,
        },
        status: "ready",
        error: null,
      });
    }

    export function workspaceDocumentModel(view, areaIdValue) {
      return documentArea(view, areaIdValue).model;
    }
    ''')


def update_events() -> None:
    path = "src/app/events.js"
    source = read(path)
    source = replace_once(
        source,
        'import { catalogWorkspacePatch } from "../hodos/catalog-events.js";\n',
        '''import { catalogWorkspacePatch } from "../hodos/catalog-events.js";
import { documentWorkspacePatch } from "../hodos/document-events.js";
import {
  editWorkspaceDocumentText,
  selectWorkspaceDocumentNode,
} from "../hodos/document-state.js";
''',
        "Document event imports",
    )
    source = replace_once(
        source,
        'async function applyCatalogWorkspacePatch(patch) {\n',
        '''async function applyDocumentWorkspacePatch(patch) {
  const view = state.workspaceShell?.view;
  if (!view) throw new Error("The current Workspace has no document model");
  state.workspaceShell.view = patch.kind === "select"
    ? selectWorkspaceDocumentNode(view, patch)
    : editWorkspaceDocumentText(view, patch);
  updateHodosWorkspaceShell(state);
}

async function applyCatalogWorkspacePatch(patch) {
''',
        "Document event application",
    )
    source = replace_once(
        source,
        '''    const catalogPatch = catalogWorkspacePatch(event.detail);
    if (catalogPatch) {
''',
        '''    const documentPatch = documentWorkspacePatch(event.detail);
    if (documentPatch) {
      void applyDocumentWorkspacePatch(documentPatch).catch(reportWorkspaceEventError);
      return;
    }
    const catalogPatch = catalogWorkspacePatch(event.detail);
    if (catalogPatch) {
''',
        "Document event routing",
    )
    write(path, source)


def add_featured_project() -> None:
    path = "src/studio/projects.js"
    source = read(path)
    project = r'''  Object.freeze({
    id: "hodos-document",
    title: "Hodos document",
    eyebrow: "2D · RICH DOCUMENT",
    description: "Open a manifest-native Hodos document, edit stable text nodes and inspect a committed Hara artefact snapshot.",
    repository: Object.freeze({
      owner: "hara-lang",
      repo: "hara-playground",
      branch: "main",
      path: "samples/hodos-document"
    }),
    sourceUrl: "https://github.com/hara-lang/hara-playground/tree/main/samples/hodos-document",
    entry: "src/main.hal",
    capabilities: Object.freeze(["Hodos 2D", "Stable node IDs", "Artefact snapshots"]),
    action: "Open Document",
    field: "document"
  }),
'''
    source = replace_once(
        source,
        '  Object.freeze({\n    id: "decision",',
        project + '  Object.freeze({\n    id: "decision",',
        "Hodos Document featured project",
    )
    write(path, source)


def write_sample() -> None:
    write("samples/hodos-document/README.md", r'''
    # Hodos document

    A complete Hara Playground project whose `workspace.edn` declares a
    `hodos.2d/document` area directly.

    The document uses stable block and text identities, an editable prose node
    and a committed Hara artefact snapshot. Selection and text edits travel
    through `document/*` semantic events and are applied by Playground policy.

    This first consumer does not persist document edits, evaluate artefacts or
    submit collaboration batches. Those remain later application-service slices.
    ''')
    write("samples/hodos-document/project.edn", r'''
    {:hara/type :project
     :hara/version "1.0.0"
     :project/id :playground/hodos-document
     :project/title "Hodos document"
     :project/source-paths ["src"]
     :project/main "playground.hodos-document"}
    ''')
    write("samples/hodos-document/src/main.hal", r'''
    (ns playground.hodos-document)

    (def answer
      (* 6 7))

    answer
    ''')
    write("samples/hodos-document/workspace.edn", r'''
    {:hara/type :workspace
     :hara/version "1.0.0"
     :workspace/id :playground-hodos-document
     :workspace/revision 0
     :workspace/layout
     {:layout/type :split
      :layout/id :layout/document-workbench
      :layout/direction :horizontal
      :layout/ratio 0.5
      :layout/first {:layout/type :area :layout/area "area/editor"}
      :layout/second
      {:layout/type :split
       :layout/id :layout/document-output
       :layout/direction :vertical
       :layout/ratio 0.72
       :layout/first {:layout/type :area :layout/area "area/document"}
       :layout/second {:layout/type :area :layout/area "area/output"}}}
     :workspace/documents
     [{:document/id "document/source"
       :document/path "src/main.hal"
       :document/language :hal}
      {:document/id "document/review"
       :document/profile "hodos.rich-text/2"}]
     :workspace/areas
     [{:area/id "area/editor"
       :area/type :code-editor
       :area/title "main.hal"}
      {:area/id "area/output"
       :area/type :output
       :area/title "Output"}
      {:area/id "area/document"
       :area/type "hodos.2d/document"
       :area/title "Inspectable document"
       :area/presentation
       {:presentation/label "Document"
        :presentation/icon :document
        :presentation/surface :document
        :presentation/mode :document
        :presentation/order 2
        :presentation/compact true
        :presentation/auto-focus true}
       :area/component
       {:component/id "hodos.2d/document"
        :component/contract "workspace.component/1"
        :component/model
        {:document
         {:profile "hodos.rich-text/2"
          :id "document/review"
          :title "Inspectable documents"
          :revision 0
          :metadata {:source "workspace.edn" :authority "playground"}
          :children
          [{:id "block/title"
            :type "heading"
            :attrs {:level 1}
            :children [{:id "text/title" :type "text" :text "Inspectable documents"}]}
           {:id "block/intro"
            :type "paragraph"
            :attrs {}
            :children [{:id "text/intro" :type "text" :text "Edit this sentence. The stable text identity survives each Hodos update."}]}
           {:id "block/artefact"
            :type "hara-artefact"
            :attrs
            {:artefactId "artefact/answer"
             :kind "value"
             :title "Committed Hara value"
             :mode "snapshot"
             :entry "playground.hodos-document/answer"
             :capabilities []
             :snapshotRoot "sha256:answer-42"
             :snapshotDisplay "42"
             :snapshotMediaType "application/edn"
             :snapshotSourceRoot "sha256:source-answer"
             :metadata {:committed true}}
            :children [{:id "text/artefact-source" :type "text" :text "answer"}]}]}
         :selection {:nodeId "block/intro" :anchor nil :focus nil}
         :status "ready"
         :readOnly false
         :capabilities
         {:select true
          :editText true
          :insertBlock false
          :deleteBlock false
          :activateArtefact false
          :commitArtefact false
          :command false}
         :error nil}
        :component/events
        ["document/select"
         "document/edit-text"
         "document/insert-block"
         "document/delete-block"
         "document/activate-artefact"
         "document/commit-artefact"
         "document/command"]}}]
     :workspace/nodes []
     :workspace/connections []
     :workspace/links
     [{:link/id "link/source-editor"
       :link/document "document/source"
       :link/area "area/editor"}
      {:link/id "link/review-document"
       :link/document "document/review"
       :link/area "area/document"}]
     :workspace/selection
     {:area/id "area/document"
      :surface/id "document"}
     :workspace/customizations
     {:responsive/breakpoint 1000
      :responsive/default-surface "document"
      :recovery/journal true}}
    ''')


def write_tests() -> None:
    write("tests/hodos-document-events.test.js", r'''
    import assert from "node:assert/strict";
    import test from "node:test";
    import { documentWorkspacePatch } from "../src/hodos/document-events.js";

    const base = {
      "component/id": "hodos.2d/document",
      "area/id": "area/document",
      documentId: "document/review",
    };

    test("Document events validate semantic selection and text edits", () => {
      assert.deepEqual(documentWorkspacePatch({
        ...base,
        "event/type": "document/select",
        nodeId: "block/intro",
      }), {
        kind: "select",
        areaId: "area/document",
        documentId: "document/review",
        nodeId: "block/intro",
      });

      assert.deepEqual(documentWorkspacePatch({
        ...base,
        "event/type": "document/edit-text",
        blockId: "block/intro",
        textId: "text/intro",
        previous: "before",
        text: "after",
      }), {
        kind: "edit-text",
        areaId: "area/document",
        documentId: "document/review",
        blockId: "block/intro",
        textId: "text/intro",
        previous: "before",
        text: "after",
      });
    });

    test("Document events fail closed across identity and command boundaries", () => {
      assert.equal(documentWorkspacePatch({ "event/type": "editor/change" }), null);
      assert.throws(() => documentWorkspacePatch({
        ...base,
        "component/id": "hodos.dev/editor",
        "event/type": "document/select",
        nodeId: "block/intro",
      }), /Unexpected Hodos Document component/);
      assert.throws(() => documentWorkspacePatch({
        ...base,
        "event/type": "document/delete-block",
        blockId: "block/intro",
      }), /Unsupported Hodos Document event/);
      assert.throws(() => documentWorkspacePatch({
        ...base,
        "event/type": "document/edit-text",
        blockId: "block/intro",
        textId: "text/intro",
        previous: "before",
        text: "x".repeat(1_000_001),
      }), /exceeds the application limit/);
    });
    ''')

    write("tests/hodos-document-state.test.js", r'''
    import assert from "node:assert/strict";
    import test from "node:test";
    import {
      editWorkspaceDocumentText,
      selectWorkspaceDocumentNode,
      workspaceDocumentModel,
    } from "../src/hodos/document-state.js";

    const view = () => ({
      "workspace/id": "workspace/test",
      "workspace/revision": 2,
      "workspace/selection": { "area/id": "area/editor" },
      "workspace/areas": [{
        "area/id": "area/document",
        "area/type": "hodos.2d/document",
        "area/component": {
          "component/id": "hodos.2d/document",
          "component/contract": "workspace.component/1",
          "component/model": {
            document: {
              profile: "hodos.rich-text/2",
              id: "document/review",
              revision: 4,
              children: [{
                id: "block/intro",
                type: "paragraph",
                attrs: {},
                children: [{ id: "text/intro", type: "text", text: "before" }],
              }],
            },
            selection: { nodeId: null, anchor: null, focus: null },
            status: "ready",
            readOnly: false,
            capabilities: { select: true, editText: true },
            error: null,
          },
          "component/events": ["document/select", "document/edit-text"],
        },
      }],
    });

    test("Document selection remains an application-owned Workspace revision", () => {
      const original = view();
      const next = selectWorkspaceDocumentNode(original, {
        areaId: "area/document",
        documentId: "document/review",
        nodeId: "block/intro",
      });
      assert.equal(next["workspace/revision"], 3);
      assert.equal(next["workspace/selection"]["area/id"], "area/document");
      assert.equal(workspaceDocumentModel(next, "area/document").selection.nodeId, "block/intro");
      assert.equal(workspaceDocumentModel(original, "area/document").selection.nodeId, null);
    });

    test("Document text edits preserve IDs and reject stale events", () => {
      const original = view();
      const next = editWorkspaceDocumentText(original, {
        areaId: "area/document",
        documentId: "document/review",
        blockId: "block/intro",
        textId: "text/intro",
        previous: "before",
        text: "after",
      });
      const model = workspaceDocumentModel(next, "area/document");
      assert.equal(model.document.revision, 5);
      assert.equal(model.document.children[0].id, "block/intro");
      assert.equal(model.document.children[0].children[0].id, "text/intro");
      assert.equal(model.document.children[0].children[0].text, "after");
      assert.equal(workspaceDocumentModel(original, "area/document").document.children[0].children[0].text, "before");
      assert.throws(() => editWorkspaceDocumentText(next, {
        areaId: "area/document",
        documentId: "document/review",
        blockId: "block/intro",
        textId: "text/intro",
        previous: "before",
        text: "again",
      }), /Stale Hodos Document text edit/);
    });

    test("Document policy rejects missing identities", () => {
      assert.throws(() => selectWorkspaceDocumentNode(view(), {
        areaId: "area/document",
        documentId: "document/review",
        nodeId: "block/missing",
      }), /node is missing/);
      assert.throws(() => editWorkspaceDocumentText(view(), {
        areaId: "area/document",
        documentId: "document/other",
        blockId: "block/intro",
        textId: "text/intro",
        previous: "before",
        text: "after",
      }), /identity changed/);
    });
    ''')

    write("tests/hodos-document-consumer.test.js", r'''
    import assert from "node:assert/strict";
    import { readFile } from "node:fs/promises";
    import test from "node:test";
    import {
      playgroundAreaIds,
      projectPlaygroundWorkspace,
    } from "../src/hodos/workspace-shell-state.js";

    const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

    const documentArea = {
      "area/id": "area/document",
      "area/type": "hodos.2d/document",
      "area/title": "Document",
      "area/presentation": {
        "presentation/label": "Document",
        "presentation/surface": "document",
        "presentation/mode": "document",
        "presentation/compact": true,
      },
      "area/component": {
        "component/id": "hodos.2d/document",
        "component/contract": "workspace.component/1",
        "component/model": {
          document: {
            profile: "hodos.rich-text/2",
            id: "document/review",
            revision: 0,
            children: [],
          },
          selection: { nodeId: null, anchor: null, focus: null },
          status: "ready",
          readOnly: true,
          capabilities: {},
          error: null,
        },
        "component/events": ["document/select"],
      },
    };

    test("Playground preserves manifest components and exposes responsive document surfaces", () => {
      const descriptor = projectPlaygroundWorkspace({
        workspace: "workspace/test",
        workspaceShell: {
          workspaceId: "workspace/test",
          surfaceId: "document",
          view: {
            "workspace/id": "workspace/test",
            "workspace/revision": 0,
            "workspace/layout": {
              "layout/type": "area",
              "layout/area": "area/document",
            },
            "workspace/areas": [documentArea],
            "workspace/selection": {
              "area/id": "area/document",
              "surface/id": "document",
            },
            "workspace/customizations": {},
          },
        },
      });
      const projected = descriptor["workspace/areas"].find((area) => area["area/id"] === "area/document");
      const surface = descriptor["workspace/customizations"]["responsive/surfaces"].find((entry) => entry["surface/id"] === "document");
      assert.equal(projected["area/component"]["component/id"], "hodos.2d/document");
      assert.equal(surface["surface/area"], "area/document");
      assert.equal(descriptor["workspace/selection"]["area/id"], "area/document");
      assert.equal(playgroundAreaIds(descriptor).has("area/document"), true);
    });

    test("Playground pins and registers the Hodos 2D document packages", async () => {
      const [html, shell, styles, prepare, manifest] = await Promise.all([
        read("../index.html"),
        read("../src/hodos/workspace-shell.js"),
        read("../src/styles.css"),
        read("../scripts/prepare-web-packages.mjs"),
        read("../samples/hodos-document/workspace.edn"),
      ]);
      assert.match(html, /@greenways\/hodos-2d/);
      assert.match(html, /@greenways\/hodos-2d-ui/);
      assert.match(shell, /registerHodosDocumentDomUi/);
      assert.match(styles, /2d-ui\/src\/document\.css/);
      assert.match(prepare, /2d-ui\/src\/document-dom-host\.js/);
      assert.match(manifest, /hodos\.2d\/document/);
      assert.match(manifest, /hodos\.rich-text\/2/);
      assert.equal(manifest.includes("javascript"), false);
      assert.equal(manifest.includes("callback"), false);
    });
    ''')


def update_browser_workflow() -> None:
    path = ".github/workflows/browser-audio-ci.yml"
    source = read(path)
    for label in ("pull", "push"):
      source = replace_once(
          source,
          '      - scripts/verify-supersonic-project-open.mjs\n',
          '      - scripts/verify-supersonic-project-open.mjs\n      - scripts/verify-hodos-document-project-open.mjs\n',
          f"Hodos Document browser script path ({label})",
      )
      source = replace_once(
          source,
          '      - samples/supersonic-live/**\n',
          '      - samples/supersonic-live/**\n      - samples/hodos-document/**\n',
          f"Hodos Document sample path ({label})",
      )
    source = replace_once(
        source,
        '      - name: Open the complete Supersonic project\n        run: node scripts/verify-supersonic-project-open.mjs\n',
        '      - name: Open the complete Supersonic project\n        run: node scripts/verify-supersonic-project-open.mjs\n\n      - name: Open the Hodos 2D document project\n        run: node scripts/verify-hodos-document-project-open.mjs\n',
        "Hodos Document browser workflow step",
    )
    write(path, source)


def write_browser_verifier() -> None:
    write("scripts/verify-hodos-document-project-open.mjs", r'''
    #!/usr/bin/env node
    import assert from "node:assert/strict";
    import { createServer } from "node:http";
    import { readFile, stat } from "node:fs/promises";
    import { extname, resolve, sep } from "node:path";
    import { fileURLToPath } from "node:url";
    import { chromium } from "playwright";

    const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
    const sampleRoot = "samples/hodos-document";
    const samplePaths = [
      `${sampleRoot}/README.md`,
      `${sampleRoot}/project.edn`,
      `${sampleRoot}/workspace.edn`,
      `${sampleRoot}/src/main.hal`,
    ];
    const commit = "d".repeat(40);
    const sampleFiles = new Map(await Promise.all(samplePaths.map(async (path) => [
      path,
      await readFile(resolve(root, path), "utf8"),
    ])));

    let browser = null;
    let server = null;

    try {
      server = createServer(async (request, response) => {
        try {
          const url = new URL(request.url || "/", "http://127.0.0.1");
          const target = safeTarget(url.pathname === "/" ? "/index.html" : url.pathname);
          const metadata = await stat(target);
          if (!metadata.isFile()) throw Object.assign(new Error("not a file"), { code: "ENOENT" });
          response.writeHead(200, {
            "content-type": contentType(target),
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          });
          response.end(await readFile(target));
        } catch (error) {
          response.writeHead(error?.code === "ENOENT" ? 404 : 400, {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
          });
          response.end(error?.message || String(error));
        }
      });
      await new Promise((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen(0, "127.0.0.1", resolveListen);
      });
      const address = server.address();
      assert.ok(address && typeof address === "object", "test server did not expose an address");

      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ viewport: { width: 820, height: 900 } });
      const page = await context.newPage();
      const pageErrors = [];
      const pageConsole = [];
      page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
      page.on("console", (message) => pageConsole.push(`${message.type()}: ${message.text()}`));

      await installGitHubFixtureRoutes(page);
      const url = new URL(`http://127.0.0.1:${address.port}/`);
      url.searchParams.set("repo", "hara-lang/hara-playground");
      url.searchParams.set("branch", "main");
      url.searchParams.set("path", sampleRoot);
      await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 15_000 });

      await page.waitForSelector('.hodos-2d-document-host[data-hodos-component="hodos.2d/document"]', {
        state: "visible",
        timeout: 15_000,
      });
      await page.waitForFunction(() => {
        const shell = document.querySelector(".workbench-grid");
        const host = document.querySelector('.hodos-2d-document-host[data-hodos-component="hodos.2d/document"]');
        return shell?.dataset.workspaceId === "playground-hodos-document"
          && shell?.dataset.workspaceManifestStatus === "ready"
          && host?.textContent.includes("Inspectable documents")
          && host?.textContent.includes("42");
      }, null, { timeout: 15_000 });

      const initial = await page.evaluate(() => ({
        workspaceId: document.querySelector(".workbench-grid")?.dataset.workspaceId || "",
        mode: document.querySelector(".workbench-grid")?.dataset.workspaceMode || "",
        status: document.querySelector(".workbench-grid")?.dataset.workspaceManifestStatus || "",
        source: document.querySelector(".workbench-grid")?.dataset.workspaceManifestSource || "",
        hasDocumentDock: Boolean(document.querySelector('[data-workspace-surface-id="document"]')),
        snapshot: document.querySelector('[data-artefact-output="artefact/answer"]')?.textContent || "",
      }));
      assert.equal(initial.workspaceId, "playground-hodos-document");
      assert.equal(initial.mode, "compact");
      assert.equal(initial.status, "ready");
      assert.equal(initial.source, "workspace.edn");
      assert.equal(initial.hasDocumentDock, true);
      assert.match(initial.snapshot, /42/);

      await page.click('[data-node-id="block/title"]');
      await page.waitForFunction(() =>
        document.querySelector('[data-node-id="block/title"]')?.classList.contains("selected"),
      null,
      { timeout: 5_000 });

      await page.evaluate(() => {
        const text = document.querySelector('[data-text-id="text/intro"]');
        text.focus();
        text.textContent = "Edited through the authoritative Hodos document event stream.";
        text.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: null,
        }));
      });
      await page.waitForFunction(() => {
        const text = document.querySelector('[data-text-id="text/intro"]')?.textContent || "";
        const revision = document.querySelector(".hodos-2d-document-toolbar span")?.textContent || "";
        return text === "Edited through the authoritative Hodos document event stream."
          && revision.includes("revision 1");
      }, null, { timeout: 5_000 });

      assert.deepEqual(pageErrors, [], `Hodos Document page errors:\n${pageErrors.join("\n")}`);
      const errorConsole = pageConsole.filter((entry) => entry.startsWith("error:"));
      assert.deepEqual(errorConsole, [], `Hodos Document console errors:\n${errorConsole.join("\n")}`);
      console.log("Verified manifest-native Hodos 2D document mounting, selection and text editing in Chromium.");
    } finally {
      await browser?.close().catch(() => {});
      if (server) await new Promise((resolveClose) => server.close(resolveClose));
    }

    async function installGitHubFixtureRoutes(page) {
      const cors = {
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      };
      await page.route("https://api.github.com/**", async (route) => {
        const url = new URL(route.request().url());
        let body = null;
        if (url.pathname === "/repos/hara-lang/hara-playground") {
          body = { default_branch: "main", html_url: "https://github.com/hara-lang/hara-playground" };
        } else if (url.pathname === "/repos/hara-lang/hara-playground/branches/main") {
          body = { commit: { sha: commit } };
        } else if (url.pathname === `/repos/hara-lang/hara-playground/git/trees/${commit}`) {
          body = {
            truncated: false,
            tree: [...sampleFiles].map(([path, content]) => ({
              path,
              type: "blob",
              size: Buffer.byteLength(content),
            })),
          };
        }
        if (!body) {
          await route.fulfill({ status: 404, headers: cors, body: "not found" });
          return;
        }
        await route.fulfill({
          status: 200,
          headers: { ...cors, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      });

      await page.route("https://raw.githubusercontent.com/**", async (route) => {
        const url = new URL(route.request().url());
        const prefix = `/hara-lang/hara-playground/${commit}/`;
        if (!url.pathname.startsWith(prefix)) {
          await route.fulfill({ status: 404, headers: cors, body: "not found" });
          return;
        }
        const path = url.pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
        const content = sampleFiles.get(path);
        if (content == null) {
          await route.fulfill({ status: 404, headers: cors, body: "not found" });
          return;
        }
        await route.fulfill({
          status: 200,
          headers: { ...cors, "content-type": "text/plain; charset=utf-8" },
          body: content,
        });
      });
    }

    function safeTarget(pathname) {
      const decoded = decodeURIComponent(pathname);
      const parts = decoded.split("/").filter(Boolean);
      if (parts.some((part) => part === "." || part === ".." || part.includes("\\") || part.includes("\0"))) {
        throw new Error("unsafe request path");
      }
      const target = resolve(root, ...parts);
      if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("request escaped repository root");
      return target;
    }

    function contentType(path) {
      return ({
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".hal": "text/plain; charset=utf-8",
        ".edn": "text/plain; charset=utf-8",
        ".md": "text/markdown; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".wasm": "application/wasm",
      })[extname(path)] || "application/octet-stream";
    }
    ''')


def update_docs() -> None:
    path = "docs/workspace-manifest.md"
    source = read(path)
    section = r'''

    ## Manifest-native Hodos components

    A Workspace area may carry a complete serializable `:area/component`
    descriptor. Playground preserves unknown component areas instead of
    flattening them into the fixed Project, Editor or Output roles. Registered
    Hodos component packages then mount those areas directly.

    ```clojure
    {:area/id "area/document"
     :area/type "hodos.2d/document"
     :area/presentation
     {:presentation/surface :document
      :presentation/mode :document
      :presentation/compact true}
     :area/component
     {:component/id "hodos.2d/document"
      :component/contract "workspace.component/1"
      :component/model {...}
      :component/events ["document/select" "document/edit-text"]}}
    ```

    The manifest owns serializable component state only. Playground applies
    semantic events to its application state and supplies a new canonical model
    to Hodos. Runtime evaluation, persistence, collaboration, signatures and
    privileged capabilities are not embedded in `workspace.edn`.
    '''
    if "## Manifest-native Hodos components" not in source:
        source += textwrap.dedent(section)
    write(path, source)


def clean_staging_files() -> None:
    for relative in (
        ".github/scripts/apply-hodos-document-consumer.py",
        ".github/workflows/apply-hodos-document-consumer.yml",
    ):
        target = ROOT / relative
        if target.exists():
            target.unlink()


def main() -> None:
    update_import_map()
    update_package_preparation()
    update_styles()
    update_workspace_shell()
    update_workspace_projection()
    write_document_state()
    update_events()
    add_featured_project()
    write_sample()
    write_tests()
    update_browser_workflow()
    write_browser_verifier()
    update_docs()
    clean_staging_files()


if __name__ == "__main__":
    main()
