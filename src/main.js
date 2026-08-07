import { repositoryFromStudioLocation } from "./github/importer.js";
import { setRenderer, state } from "./app/context.js";
import { importRepository, loadExamples, prepareProjectHome } from "./app/actions.js";
import { bindEvents, setupRuntimeEvents } from "./app/events.js";
import { render } from "./app/view.js";
import { installWorkspaceLayout } from "./app/workspace-layout.js";
import { installAudioOutput } from "./audio/integration.js";
import { disposeHodosPreview, mountHodosPreview } from "./hodos/preview.js";

function renderPlayground() {
  disposeHodosPreview();
  render(bindEvents);
  mountHodosPreview({ document: state.preview, theme: state.theme });

  const footer = document.querySelector(".lobby-footer");
  if (!footer || footer.querySelector("[data-greenways-open-source]")) return;

  const stewardship = document.createElement("span");
  stewardship.dataset.greenwaysOpenSource = "";
  stewardship.innerHTML = '<a href="https://opensource.greenways.ai/open-source/">A Greenways Open Source Project</a> · <a href="https://github.com/hara-lang/hara-playground/blob/main/LICENSE">EPL-2.0</a>';
  footer.append(stewardship);
}

setRenderer(renderPlayground);
setupRuntimeEvents();
installWorkspaceLayout();
installAudioOutput();

async function start() {
  await loadExamples();
  const requestedRepository = repositoryFromStudioLocation(globalThis.location);
  if (requestedRepository && await importRepository(requestedRepository)) return;
  await prepareProjectHome();
}

renderPlayground();
start();
