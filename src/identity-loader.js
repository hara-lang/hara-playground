(() => {
  "use strict";

  const app = document.querySelector("#app");
  if (!app || document.querySelector("script[data-hara-identity-client]")) return;

  const productionOrigin = "https://id.hara-lang.org";
  const testingOrigin = "https://id.testing.hara-lang.org";
  const allowedOrigins = new Set([productionOrigin, testingOrigin]);
  const configuredOrigin = document
    .querySelector('meta[name="hara-identity-origin"]')
    ?.getAttribute("content")
    ?.trim();
  const identityOrigin = configuredOrigin
    ? (allowedOrigins.has(configuredOrigin) ? configuredOrigin : null)
    : location.hostname === "play.hara-lang.org"
      ? productionOrigin
      : location.hostname === "play.testing.hara-lang.org"
        || location.hostname.endsWith(".testing.hara-lang.org")
        ? testingOrigin
        : null;

  // Local and unknown hosts stay self-contained unless a test explicitly
  // supplies one of the two trusted Identity origins above.
  if (!identityOrigin) return;
  let mountedRoot = null;

  function mountIdentity() {
    const target = document.querySelector(".lobby-nav")
      || document.querySelector(".workbench-actions");
    if (!target) return;

    let root = target.querySelector(":scope > [data-hara-identity]");
    if (!root) {
      root = document.createElement("div");
      root.dataset.haraIdentity = "";
      root.className = "playground-identity";
      const theme = target.querySelector("#home-theme-button, #theme-button");
      target.insertBefore(root, theme || null);
    }

    if (root === mountedRoot) return;
    mountedRoot = root;
    globalThis.HaraIdentity?.refresh?.().catch?.(() => {});
  }

  // Keep shell remounting synchronous with MutationObserver delivery. The
  // Play audio engine uses microtasks for reconciliation and must not be
  // perturbed by unrelated account-shell scheduling.
  const observer = new MutationObserver(mountIdentity);
  observer.observe(app, { childList: true });

  const client = document.createElement("script");
  client.src = `${identityOrigin}/v1/identity-client.js`;
  client.defer = true;
  client.dataset.haraIdentityClient = "";
  client.addEventListener("load", mountIdentity, { once: true });
  document.head.append(client);

  mountIdentity();
})();
