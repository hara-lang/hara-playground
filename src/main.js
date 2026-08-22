import { repositoryFromStudioLocation } from "./github/importer.js";
import { runtime, setRenderer, state, store } from "./app/context.js";
import { importRepository, loadExamples, prepareProjectHome } from "./app/actions.js";
import { bindEvents, setupRuntimeEvents } from "./app/events.js";
import { syncProjectPresentation } from "./app/project-presentation.js";
import { applyStudioChrome, syncPublicLobby } from "./app/studio-chrome.js";
import { render } from "./app/view.js";
import { mountWorkspaceAssist } from "./app/workspace-assist.js";
import { mountGreenwaysAiAssistant } from "./ai/assistant.js";
import { PlayAiHost } from "./ai/host.js";
import { installHodosGraphConsumer } from "./hodos/graph-consumer.js";
import {
  disposeHodosWorkspaceShell,
  mountHodosWorkspaceShell,
} from "./hodos/workspace-shell.js";
import { installAudioOutput } from "./audio/integration.js";
import { disposeHodosCatalog } from "./hodos/catalog.js";
import { disposeHodosEditor, mountHodosEditor } from "./hodos/editor.js";
import {
  disposeHodosExecutionHost,
  installHodosExecution,
  mountHodosExecution,
} from "./hodos/execution.js";
import { disposeHodosExplorer, mountHodosExplorer } from "./hodos/explorer.js";
import { disposeHodosPreview } from "./hodos/preview.js";
import { disposeHodosProblems, mountHodosProblems } from "./hodos/problems.js";
import { disposeHodosRepl, mountHodosRepl } from "./hodos/repl.js";
import { disposeHodosValueInspector, mountHodosValueInspector } from "./hodos/value-inspector.js";
import {
  installShowcaseHost,
  syncShowcaseHost,
} from "./studio/showcase-host.js";
import {
  installActiveLoopDemo,
  syncActiveLoopDemo,
} from "./active/integration.js";

function renderPlay() {
  document.documentElement.dataset.presentation = state.presentation?.mode || "studio";
  disposeHodosWorkspaceShell();
  disposeHodosCatalog();
  disposeHodosEditor();
  disposeHodosExecutionHost();
  disposeHodosExplorer();
  disposeHodosPreview();
  disposeHodosProblems();
  disposeHodosRepl();
  disposeHodosValueInspector();
  render(bindEvents);
  mountHodosExplorer(state);
  mountHodosEditor({
    selectedPath: state.selectedPath,
    source: state.content,
    namespace: state.namespace,
    selectionStart: state.editor.selectionStart,
    selectionEnd: state.editor.selectionEnd,
    completion: state.editor.completion,
    paredit: state.editor.paredit,
    rainbow: state.editor.rainbow,
    instaRepl: state.instarepl.enabled,
  });
  mountHodosProblems(state);
  mountHodosRepl(state);
  mountHodosValueInspector(state);
  mountHodosExecution(state);
  mountHodosWorkspaceShell(state);
  mountWorkspaceAssist();
  applyStudioChrome();
  syncPublicLobby();
  syncActiveLoopDemo();
  void syncProjectPresentation({ state, store }).catch((error) => {
    console.error("[hara playground presentation]", error);
  });
  if (state.presentation?.mode !== "showcase") mountGreenwaysAiAssistant();
  syncShowcaseHost();

  const footer = document.querySelector(".lobby-footer");
  if (!footer || footer.querySelector("[data-greenways-open-source]")) return;
  const stewardship = document.createElement("span");
  stewardship.dataset.greenwaysOpenSource = "";
  stewardship.innerHTML = '<a href="https://opensource.greenways.ai/open-source/">A Greenways Open Source Project</a> · <a href="https://github.com/hara-lang/hara-play/blob/main/LICENSE">EPL-2.0</a>';
  footer.append(stewardship);
}

setRenderer(renderPlay);
setupRuntimeEvents();
installActiveLoopDemo();
installHodosExecution({ state, render: renderPlay });
installHodosGraphConsumer();
installAudioOutput();
new PlayAiHost({ runtime });
installShowcaseHost();

function failShowcase(error) {
  state.presentation = {
    ...state.presentation,
    error: error?.message || String(error),
  };
  renderPlay();
}

async function start() {
  const showcase = state.presentation?.mode === "showcase";
  if (!showcase) await loadExamples();

  let requestedRepository = null;
  try {
    requestedRepository = repositoryFromStudioLocation(globalThis.location);
  } catch (error) {
    if (showcase) {
      failShowcase(error);
      return;
    }
    state.home.error = error.message;
  }

  if (showcase) {
    if (!requestedRepository || typeof requestedRepository !== "object" || !requestedRepository.commit) {
      failShowcase(new Error("Showcase links require repo and a 40-character immutable commit"));
      return;
    }
    if (await importRepository(requestedRepository)) {
      syncShowcaseHost();
      return;
    }
    failShowcase(new Error(state.home.error || "Unable to open the immutable Showcase project"));
    return;
  }

  if (requestedRepository && await importRepository(requestedRepository)) return;
  await prepareProjectHome();
}

renderPlay();
start();
