const IDENTITY_ORIGINS = Object.freeze([
  "https://id.hara-lang.org",
  "https://id.testing.hara-lang.org",
]);

const anonymousIdentityClient = `(() => {
  const anonymous = Object.freeze({ authenticated: false, session: null, user: null });
  globalThis.HaraIdentity = Object.freeze({
    refresh: async () => anonymous,
    session: async () => anonymous,
    getSession: async () => anonymous,
  });
})();`;

export async function installAnonymousIdentityFixture(page) {
  const cors = {
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
  };

  for (const origin of IDENTITY_ORIGINS) {
    await page.route(`${origin}/v1/identity-client.js`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { ...cors, "content-type": "text/javascript; charset=utf-8" },
        body: anonymousIdentityClient,
      });
    });

    await page.route(`${origin}/session`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { ...cors, "content-type": "application/json" },
        body: JSON.stringify({ authenticated: false, session: null, user: null }),
      });
    });
  }
}
