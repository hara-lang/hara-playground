import {
  ALUMBRA_PROVIDER_ID,
  PEACOCK_BALLROOM_DEFAULT_STATE,
} from "./alumbra.js";

export function peacockBallroomPlaygroundUrl(location = globalThis.location) {
  if (!location?.href) throw new TypeError("Peacock Ballroom project link requires a location");
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("provider", ALUMBRA_PROVIDER_ID);
  url.searchParams.set("world", "https://github.com/greenways-ai/alumbra");
  url.searchParams.set("state", PEACOCK_BALLROOM_DEFAULT_STATE);
  return url.href;
}

function createCard(document = globalThis.document, location = globalThis.location) {
  const article = document.createElement("article");
  article.className = "project-card project-card--provider";
  article.dataset.field = "worlds";
  article.dataset.providerProject = "alumbra-hara/peacock-ballroom";
  article.innerHTML = `
    <div class="project-card__signal"><span></span><span></span><span></span></div>
    <p class="hara-kicker">HARA ARCHITECTURAL WORLD</p>
    <h3>Peacock Ballroom</h3>
    <p>Enter an ivory, teal-glass and gold world generated in Hara and projected by the installed Alumbra provider.</p>
    <ul><li>48 canonical chunks</li><li>Sunlight and chandelier emission</li><li>Playable editing and undo</li></ul>
    <div class="project-card__actions">
      <a class="primary-action" href="${peacockBallroomPlaygroundUrl(location)}">Open world <span aria-hidden="true">▶</span></a>
      <a class="source-action" href="https://github.com/greenways-ai/alumbra" target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a>
    </div>`;
  return article;
}

export function installPeacockBallroomProjectCard({
  document = globalThis.document,
  location = globalThis.location,
  root = document?.querySelector?.("#app"),
} = {}) {
  if (!document || typeof document.createElement !== "function" || !root) {
    throw new TypeError("Peacock Ballroom project card requires the Playground document and application root");
  }

  const install = () => {
    const grid = root.querySelector?.(".project-grid");
    if (!grid) return false;
    if (!grid.querySelector?.("[data-provider-project='alumbra-hara/peacock-ballroom']")) {
      grid.prepend(createCard(document, location));
    }
    return true;
  };

  install();
  const Observer = document.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  if (typeof Observer !== "function") return Object.freeze({install, disconnect() {}});
  const observer = new Observer(install);
  observer.observe(root, {childList: true, subtree: true});
  return Object.freeze({install, disconnect: () => observer.disconnect()});
}

if (globalThis.document?.querySelector && globalThis.window?.addEventListener) {
  const installation = installPeacockBallroomProjectCard();
  window.addEventListener("pagehide", () => installation.disconnect(), {once: true});
}
