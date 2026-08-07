(() => {
  "use strict";

  const app = document.querySelector("#app");
  if (!app || document.querySelector("script[data-hara-identity-client]")) return;

  const testing = location.hostname === "playground.testing.hara-lang.org"
    || location.hostname.endsWith(".testing.hara-lang.org");
  const identityOrigin = testing
    ? "https://id.testing.hara-lang.org"
    : "https://id.hara-lang.org";
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

  const observer = new MutationObserver(() => queueMicrotask(mountIdentity));
  observer.observe(app, { childList: true });

  const client = document.createElement("script");
  client.src = `${identityOrigin}/v1/identity-client.js`;
  client.defer = true;
  client.dataset.haraIdentityClient = "";
  client.addEventListener("load", mountIdentity, { once: true });
  document.head.append(client);

  mountIdentity();
})();
