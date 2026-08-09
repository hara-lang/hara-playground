import assert from "node:assert/strict";
import test from "node:test";
import { WebCapabilityRegistry } from "../src/runtime/capabilities.js";
import {
  MODEL_GENERATE_CAPABILITY,
  PlaygroundAiHost,
  normalizeGenerationRequest,
} from "../src/ai/host.js";

class FakeRuntime {
  constructor(registry) {
    this.registry = registry;
  }

  registerHost(operation, handler, options) {
    return this.registry.registerHost(operation, handler, options);
  }

  invoke(operation, ...args) {
    return this.registry.invoke(operation, args, {
      signal: new AbortController().signal,
      hostCallId: "host-test",
    });
  }
}

class FakeClient {
  constructor() {
    this.generated = [];
    this.cancelled = [];
    this.statusResponse = {
      capability: { allowed: true, grant: { secret: "not-public" } },
      ai: {
        providerProfiles: [{
          id: "openai.primary.abc123",
          label: "Primary",
          provider: "openai",
          credential: "sk-private",
        }],
        providerAccess: { openai: true },
        credentialRecords: [{ secret: "sk-private" }],
      },
    };
    this.generation = {
      result: {
        output: "Use mapv here.",
        provider: "openai",
        model: "gpt-5",
        finishReason: "stop",
        usage: { inputTokens: 11, outputTokens: 4, totalTokens: 15 },
        authorization: "Bearer private",
        raw: { apiKey: "sk-private" },
      },
    };
  }

  status() {
    return Promise.resolve(this.statusResponse);
  }

  generate(payload) {
    this.generated.push(payload);
    return { requestId: "playground/request-1", promise: Promise.resolve(this.generation) };
  }

  cancel(requestId) {
    this.cancelled.push(requestId);
    return Promise.resolve({ ok: true });
  }
}

function fixture({ grants = [] } = {}) {
  const registry = new WebCapabilityRegistry({ grants });
  const runtime = new FakeRuntime(registry);
  const client = new FakeClient();
  const host = new PlaygroundAiHost({ runtime, client });
  return { registry, runtime, client, host };
}

function request(overrides = {}) {
  return {
    "profile-id": "openai.primary.abc123",
    model: "gpt-5",
    messages: [{ role: "user", content: "Explain this form" }],
    "max-output-tokens": 1024,
    ...overrides,
  };
}

test("a declared project invokes the typed AI host capability", async () => {
  const { runtime, client, host } = fixture({ grants: [MODEL_GENERATE_CAPABILITY] });
  const result = await runtime.invoke("gw.ai/generate", request());
  assert.deepEqual(client.generated, [{
    profileId: "openai.primary.abc123",
    model: "gpt-5",
    messages: [{ role: "user", content: "Explain this form" }],
    maxOutputTokens: 1024,
  }]);
  assert.deepEqual(result, {
    output: "Use mapv here.",
    provider: "openai",
    model: "gpt-5",
    finishReason: "stop",
    usage: { inputTokens: 11, outputTokens: 4, totalTokens: 15 },
  });
  host.destroy();
});

test("an undeclared project is denied before Greenways OS is contacted", async () => {
  const { runtime, client, host } = fixture();
  await assert.rejects(runtime.invoke("gw.ai/generate", request()), /capability\/not-granted:model\/generate/);
  assert.equal(client.generated.length, 0);
  host.destroy();
});

test("Greenways OS and provider failures propagate without API-key language", async () => {
  for (const [code, message] of [
    ["BRIDGE_UNAVAILABLE", "Greenways OS AI is unavailable on this origin"],
    ["NETWORK_PERMISSION_REQUIRED", "Provider network access needs approval"],
    ["PROVIDER_FAILURE", "The provider rejected the request"],
  ]) {
    const { runtime, client, host } = fixture({ grants: [MODEL_GENERATE_CAPABILITY] });
    client.generate = () => ({
      requestId: "playground/failure",
      promise: Promise.reject(Object.assign(new Error(message), { code })),
    });
    await assert.rejects(runtime.invoke("gw.ai/generate", request()), (error) => (
      error.code === code
      && error.data?.["ai/code"] === code
      && error.message === message
      && !/api key missing/i.test(error.message)
    ));
    host.destroy();
  }
});

test("status and generation results project only public normalized fields", async () => {
  const { runtime, host } = fixture({ grants: [MODEL_GENERATE_CAPABILITY] });
  const status = await runtime.invoke("gw.ai/status");
  assert.deepEqual(status, {
    available: true,
    capability: { allowed: true },
    ai: {
      providerProfiles: [{ id: "openai.primary.abc123", label: "Primary", provider: "openai" }],
      providerAccess: { openai: true },
    },
  });
  assert.doesNotMatch(JSON.stringify(status), /credential|secret|authorization/i);
  const result = await runtime.invoke("gw.ai/generate", request());
  assert.doesNotMatch(JSON.stringify(result), /apiKey|authorization|Bearer|private/i);
  host.destroy();
});

test("credential, authorization, URL, method, and raw body fields are denied", () => {
  for (const field of ["api-key", "authorization", "url", "method", "body", "headers"]) {
    assert.throws(() => normalizeGenerationRequest(request({ [field]: "denied" })), new RegExp(`ai/request-field-denied:${field}`));
  }
  assert.throws(
    () => normalizeGenerationRequest(request({ messages: [{ role: "user", content: "Hi", authorization: "denied" }] })),
    /ai\/message-field-denied:0:authorization/
  );
});

test("runtime cancellation cancels the active Greenways request", async () => {
  const { registry, client, host } = fixture({ grants: [MODEL_GENERATE_CAPABILITY] });
  let settle;
  client.generate = (payload) => {
    client.generated.push(payload);
    return { requestId: "playground/slow", promise: new Promise((resolve) => { settle = resolve; }) };
  };
  const controller = new AbortController();
  const pending = registry.invoke("gw.ai/generate", [request()], {
    signal: controller.signal,
    hostCallId: "host-slow",
  });
  controller.abort(Object.assign(new Error("host/call-cancelled:boot"), { name: "AbortError" }));
  await assert.rejects(pending, /host\/call-cancelled:boot/);
  assert.deepEqual(client.cancelled, ["playground/slow"]);
  settle(client.generation);
  host.destroy();
});
