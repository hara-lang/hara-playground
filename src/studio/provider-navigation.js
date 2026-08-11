const PROVIDER_DOCUMENT = "./provider.html";

function linkHref(link) {
  if (typeof link?.href === "string" && link.href) return link.href;
  return link?.getAttribute?.("href") || "";
}

export function isProviderProjectLink(link, location = globalThis.location) {
  if (!link || !location?.href) return false;
  const href = linkHref(link);
  if (!href) return false;

  let target;
  let providerDocument;
  try {
    target = new URL(href, location.href);
    providerDocument = new URL(PROVIDER_DOCUMENT, location.href);
  } catch {
    return false;
  }

  return target.origin === providerDocument.origin
    && target.pathname === providerDocument.pathname
    && target.searchParams.has("provider")
    && target.searchParams.has("world")
    && target.searchParams.has("state");
}

export function installProviderProjectNavigation({
  document = globalThis.document,
  location = globalThis.location,
  window = globalThis.window,
} = {}) {
  if (!document?.addEventListener || !document?.removeEventListener || !location?.assign) {
    throw new TypeError("Provider project navigation requires a browser document and location");
  }

  const onClick = (event) => {
    const link = event.target?.closest?.("a[data-project-id][href]");
    if (!isProviderProjectLink(link, location)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(new URL(linkHref(link), location.href).href);
  };

  document.addEventListener("click", onClick, true);
  let disposed = false;
  const controller = Object.freeze({
    dispose() {
      if (disposed) return;
      disposed = true;
      document.removeEventListener("click", onClick, true);
    },
  });
  window?.addEventListener?.("pagehide", () => controller.dispose(), {once: true});
  return controller;
}

if (globalThis.document?.addEventListener && globalThis.location?.assign) {
  installProviderProjectNavigation();
}
