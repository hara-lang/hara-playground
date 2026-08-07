import { createPreviewHost } from "../../vendor/hara-ui/packages/web-preview/src/frame.js";
import { createHodosComponentRegistry } from "@greenways/hodos-web";
import { createWorkspaceAreaHost } from "@greenways/hodos-workspace-ui";
import { createPreviewArea } from "@greenways/hodos-dev";
import { registerHodosDevUi } from "@greenways/hodos-dev-ui";

const registry = createHodosComponentRegistry();
registerHodosDevUi(registry, { createPreviewHost });

let areaHost = null;

function previewArea(sourceDocument, theme) {
  return createPreviewArea({
    id: "preview/main",
    document: sourceDocument ?? "",
    theme,
  });
}

function previewContainer() {
  const frame = globalThis.document?.querySelector("iframe#preview");
  if (!frame) return null;
  const container = globalThis.document.createElement("div");
  container.id = "preview";
  container.className = "hodos-preview-root";
  container.setAttribute("role", "region");
  container.setAttribute("aria-label", "Hara preview");
  frame.replaceWith(container);
  return container;
}

export function disposeHodosPreview() {
  areaHost?.destroy();
  areaHost = null;
}

export function mountHodosPreview({ document: sourceDocument, theme = "system" } = {}) {
  disposeHodosPreview();
  const root = previewContainer();
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
  areaHost.open(previewArea(sourceDocument, theme));
  return true;
}

export function updateHodosPreview({ document: sourceDocument, theme = "system" } = {}) {
  if (!areaHost) return mountHodosPreview({ document: sourceDocument, theme });
  areaHost.update(previewArea(sourceDocument, theme));
  return true;
}
