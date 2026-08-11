const query = new URL(globalThis.location?.href ?? "http://localhost/").searchParams;

async function start() {
  if (query.get("provider")) {
    await import("./provider/entry.js");
    return;
  }
  await import("./main.js");
  await import("./provider/card.js");
}

void start().catch((error) => {
  console.error("Hara Playground bootstrap failed", error);
  const root = globalThis.document?.querySelector?.("#app");
  if (root) {
    root.innerHTML = `<main class="playground-provider-page"><section class="playground-provider-error"><p class="hara-kicker">HARA / PLAYGROUND</p><h1>Unable to start the selected application.</h1><code>${String(error?.message ?? error).replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</code></section></main>`;
  }
});
