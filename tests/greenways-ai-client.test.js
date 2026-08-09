import assert from "node:assert/strict";
import test from "node:test";
import {
  GREENWAYS_AI_ORIGIN,
  GREENWAYS_AI_PROTOCOL,
  GreenwaysAiClient,
} from "../src/ai/greenways-client.js";

class FakeWindow extends EventTarget {
  constructor(origin = GREENWAYS_AI_ORIGIN) {
    super();
    this.location = { origin };
    this.sent = [];
    this.crypto = {
      randomUUID: () => "01234567-89ab-cdef-0123-456789abcdef",
    };
  }

  postMessage(message, targetOrigin) {
    this.sent.push({ message, targetOrigin });
  }
}

function responseFor(request, overrides = {}) {
  return {
    source: "greenways-os",
    direction: "response",
    protocol: GREENWAYS_AI_PROTOCOL,
    requestId: request.requestId,
    operation: request.operation,
    ok: true,
    ...overrides,
  };
}

test("sends a typed request only to the production Playground origin", async () => {
  const windowRef = new FakeWindow();
  const client = new GreenwaysAiClient({ windowRef });
  const pending = client.status({ timeoutMs: 1000 });
  assert.equal(windowRef.sent.length, 1);
  const { message, targetOrigin } = windowRef.sent[0];
  assert.equal(targetOrigin, GREENWAYS_AI_ORIGIN);
  assert.deepEqual(message, {
    source: "hara-playground",
    direction: "request",
    protocol: GREENWAYS_AI_PROTOCOL,
    requestId: "playground/0123456789abcdef0123456789abcdef",
    operation: "status",
    payload: {},
  });
  client.handleMessage({
    source: windowRef,
    origin: GREENWAYS_AI_ORIGIN,
    data: responseFor(message, { capability: { allowed: true } }),
  });
  assert.equal((await pending).capability.allowed, true);
  client.destroy();
});

test("ignores unrelated page messages and maps Greenways errors", async () => {
  const windowRef = new FakeWindow();
  const client = new GreenwaysAiClient({ windowRef });
  const operation = client.generate({
    profileId: "openai.primary.abc123",
    model: "gpt-5",
    messages: [{ role: "user", content: "Explain this form" }],
  });
  const request = windowRef.sent[0].message;
  client.handleMessage({
    source: windowRef,
    origin: "https://attacker.example",
    data: responseFor(request),
  });
  assert.equal(client.pending.has(request.requestId), true);
  client.handleMessage({
    source: windowRef,
    origin: GREENWAYS_AI_ORIGIN,
    data: responseFor(request, {
      ok: false,
      code: "CAPABILITY_DENIED",
      error: "AI access needs approval",
    }),
  });
  await assert.rejects(operation.promise, (error) => (
    error.code === "CAPABILITY_DENIED" && error.message === "AI access needs approval"
  ));
  client.destroy();
});

test("fails locally rather than posting credentials or requests to another origin", async () => {
  const windowRef = new FakeWindow("http://localhost:4173");
  const client = new GreenwaysAiClient({ windowRef });
  await assert.rejects(
    () => client.status(),
    (error) => error.code === "BRIDGE_UNAVAILABLE",
  );
  assert.equal(windowRef.sent.length, 0);
  client.destroy();
});

test("rejects the .io origin and production lookalikes without posting", async () => {
  for (const origin of [
    "https://playground.hara-lang.io",
    "https://playground.hara-lang.org.attacker.example",
    "https://hara-lang.org",
    "http://playground.hara-lang.org",
  ]) {
    const windowRef = new FakeWindow(origin);
    const client = new GreenwaysAiClient({ windowRef });
    await assert.rejects(() => client.status(), (error) => error.code === "BRIDGE_UNAVAILABLE");
    assert.equal(windowRef.sent.length, 0, origin);
    client.destroy();
  }
});
