import { repositoryFromStudioLocation } from "./github/importer.js";
import { setRenderer } from "./app/context.js";
import { importRepository, loadExamples, prepareProjectHome } from "./app/actions.js";
import { bindEvents, setupRuntimeEvents } from "./app/events.js";
import { render } from "./app/view.js";
import { installWorkspaceLayout } from "./app/workspace-layout.js";
import { installAudioOutput } from "./audio/integration.js";

setRenderer(() => render(bindEvents));
setupRuntimeEvents();
installWorkspaceLayout();
installAudioOutput();

async function start() {
  await loadExamples();
  const requestedRepository = repositoryFromStudioLocation(globalThis.location);
  if (requestedRepository && await importRepository(requestedRepository)) return;
  await prepareProjectHome();
}

render(bindEvents);
start();
