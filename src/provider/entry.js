import {
  PublicGitHubClient,
  createWorldProviderLaunchIntent,
  requestGitHubAccess,
  resolveWorldGraph,
} from "@greenways/hodos-source-github";
import {
  createWorldProviderHost,
  createWorldProviderRegistry,
} from "@greenways/hodos-viewer/providers";
import {
  ALUMBRA_PROVIDER_ID,
  PEACOCK_BALLROOM_DEFAULT_STATE,
  PEACOCK_BALLROOM_STATES,
  createAlumbraWorldProviderRegistration,
} from "./alumbra.js";

const root = document.querySelector("#app");
const query = new URL(location.href).searchParams;
const requestedProvider = query.get("provider") ?? "";
const requestedWorld = query.get("world") ?? "";
const requestedRef = query.get("ref") ?? "";
const requestedState = query.get("state") ?? PEACOCK_BALLROOM_DEFAULT_STATE;
let activeHost = null;
let disposed = false;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function playgroundHomeUrl() {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  return url.href;
}

function providerHref(state = PEACOCK_BALLROOM_DEFAULT_STATE) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("provider", ALUMBRA_PROVIDER_ID);
  url.searchParams.set("world", "https://github.com/greenways-ai/alumbra");
  url.searchParams.set(
    "state",
    PEACOCK_BALLROOM_STATES.includes(state) ? state : PEACOCK_BALLROOM_DEFAULT_STATE,
  );
  return url.href;
}

function renderProviderShell() {
  if (!root) throw new Error("Hara Playground is missing its application root");
  root.innerHTML = `<main class="playground-provider-page">
    <nav class="playground-provider-toolbar" aria-label="Peacock Ballroom controls">
      <a href="${playgroundHomeUrl()}">← Playground</a>
      <strong>Peacock Ballroom</strong>
      <span data-provider-world-status>Resolving the repository provider manifest…</span>
      ${PEACOCK_BALLROOM_STATES.map((state) => `<button type="button" data-provider-state="${state}" aria-pressed="${state === requestedState}">${state.split("/").at(-1).replaceAll("-", " ")}</button>`).join("")}
    </nav>
    <section class="playground-provider-mount" data-provider-world-mount aria-label="Installed Alumbra world provider"></section>
  </main>`;
  root.querySelectorAll("[data-provider-state]").forEach((button) => {
    button.addEventListener("click", () => location.assign(providerHref(button.dataset.providerState)));
  });
  return {
    mount: root.querySelector("[data-provider-world-mount]"),
    status: root.querySelector("[data-provider-world-status]"),
  };
}

async function waitForProviderReady(host) {
  for (let attempt = 0; attempt < 800; attempt += 1) {
    const snapshot = host.snapshot();
    if (snapshot.provider?.status === "ready") return snapshot;
    if (snapshot.status === "failed" || snapshot.provider?.status === "failed") {
      throw new Error("Installed provider failed before its surface became ready");
    }
    await sleep(25);
  }
  throw new Error("Installed provider surface did not become ready");
}

async function openProviderWorld() {
  if (requestedProvider !== ALUMBRA_PROVIDER_ID) {
    throw new Error(`Provider is not installed in Playground: ${requestedProvider}`);
  }
  if (requestedWorld !== "https://github.com/greenways-ai/alumbra") {
    throw new Error("Peacock Ballroom must resolve from the installed greenways-ai/alumbra repository identity");
  }
  const surface = renderProviderShell();
  await requestGitHubAccess();
  const client = new PublicGitHubClient({
    request: (...args) => globalThis.fetch(...args),
    activatePackages: async () => Object.freeze({status: "provider-owned"}),
  });
  const graph = await resolveWorldGraph({
    repository: requestedWorld,
    ref: requestedRef,
    mode: "dev",
    client,
  });
  if (!graph.complete) {
    throw new Error(
      graph.diagnostics.map((diagnostic) => diagnostic.message).join("\n")
        || "Provider world graph is incomplete",
    );
  }
  if (!graph.project.provider) throw new Error("Repository world does not declare an installed provider");
  if (graph.project.provider.id !== requestedProvider) {
    throw new Error(`Repository requested provider ${graph.project.provider.id}, not ${requestedProvider}`);
  }

  const launch = createWorldProviderLaunchIntent(graph.project.provider, {state: requestedState});
  const registry = createWorldProviderRegistry([
    createAlumbraWorldProviderRegistration(),
  ]);
  activeHost = createWorldProviderHost({root: surface.mount, registry});
  await activeHost.open(launch, {
    repository: graph.repository.url,
    commit: graph.commit,
    projectId: graph.project.id,
    projectVersion: graph.project.version,
    consumer: "hara-playground",
  });
  const ready = await waitForProviderReady(activeHost);
  surface.status.textContent = `${launch.activityId} · ${launch.state} · ${graph.commit.slice(0, 8)}`;

  const data = document.documentElement.dataset;
  data.playgroundProviderReady = "true";
  data.playgroundProviderId = launch.providerId;
  data.playgroundProviderActivity = launch.activityId;
  data.playgroundProviderState = launch.state;
  data.playgroundProviderAllocations = String(ready.allocations);
  window.__HARA_PLAYGROUND_PROVIDER_WORLD__ = Object.freeze({
    graph: Object.freeze({
      repository: graph.repository.url,
      commit: graph.commit,
      projectId: graph.project.id,
      projectVersion: graph.project.version,
    }),
    launch,
    host: ready,
  });
}

function renderFailure(error) {
  if (!root) return;
  root.innerHTML = `<main class="playground-provider-page"><section class="playground-provider-error"><p class="hara-kicker">PLAYGROUND / PROVIDER WORLD</p><h1>Unable to open the installed world.</h1><code>${escapeHtml(error?.message ?? error)}</code><p><a class="primary-action" href="${playgroundHomeUrl()}">Return to Playground</a></p></section></main>`;
  document.documentElement.dataset.playgroundProviderReady = "false";
  console.error("Hara Playground provider-backed world failed", error);
}

void openProviderWorld().catch(renderFailure);

async function destroy() {
  if (disposed) return;
  disposed = true;
  await activeHost?.destroy();
}
window.addEventListener("pagehide", () => { void destroy(); }, {once: true});
