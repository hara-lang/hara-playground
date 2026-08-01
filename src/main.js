import { repositoryFromStudioLocation } from "./github/importer.js";
import { defaultProject } from "./workspace/default-project.js";
import { setRenderer, state, store } from "./app/context.js";
import { importRepository, bootRuntime, loadExamples, refreshFiles } from "./app/actions.js";
import { bindEvents, setupRuntimeEvents } from "./app/events.js";
import { render } from "./app/view.js";

setRenderer(() => render(bindEvents));
setupRuntimeEvents();

async function start() {
  await loadExamples();
  const requestedRepository = repositoryFromStudioLocation(globalThis.location);
  if (requestedRepository && await importRepository(requestedRepository)) return;
  await store.seed(defaultProject);
  state.workspace = store.workspace;
  state.metadata = store.metadata;
  await refreshFiles("src/app/core.hal");
  await bootRuntime();
}

render(bindEvents);
start();
