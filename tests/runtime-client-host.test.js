import test from "node:test";
import assert from "node:assert/strict";
import { RuntimeClient } from "../src/runtime/client.js";

class FakeWorker {
  constructor() {
    this.listeners = new Map();
    this.messages = [];
    this.terminated = false;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  postMessage(message) {
    this.messages.push(message);
    if (message.type === "boot" || message.type === "reset") {
      queueMicrotask(() => this.emit("message", {
        type: "ready",
        id: message.id,
        namespace: message.namespace || "user",
        runtimeKind: "fake",
        capabilities: message.capabilities || ["studio/eval"]
      }));
    }
  }

  emit(type, data) {
    for (const listener of this.listeners.get(type) || []) listener({ data, message: data?.message });
  }

  terminate() {
    this.terminated = true;
  }
}

function createClient(options = {}) {
  const worker = new FakeWorker();
  const client = new RuntimeClient(new URL("file:///hara-runtime-worker.js"), {
    workerFactory: () => worker,
    hostCallTimeout: 100,
    ...options
  });
  return { client, worker };
}

function hostResponses(worker, id) {
  return worker.messages.filter((message) =>
    message.id === id && (message.type === "host-result" || message.type === "host-exception"));
}

async function waitFor(predicate, timeout = 250) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("condition was not reached before timeout");
}

test("page host handlers receive correlated lifecycle context", async () => {
  const { client, worker } = createClient();
  let context;
  client.registerHost("demo/add", (left, right, hostContext) => {
    context = hostContext;
    return left + right;
  });

  worker.emit("message", {
    type: "host-call",
    id: "host-1",
    requestId: "request-9",
    operation: "demo/add",
    args: [20, 22]
  });

  const response = await waitFor(() => hostResponses(worker, "host-1")[0]);
  assert.deepEqual(response, { type: "host-result", id: "host-1", value: 42 });
  assert.equal(context.requestId, "request-9");
  assert.equal(context.hostCallId, "host-1");
  assert.equal(context.operation, "demo/add");
  assert.equal(context.generation, 0);
  assert.equal(context.signal.aborted, false);
  client.dispose();
});

test("a host call times out once and ignores its late completion", async () => {
  const { client, worker } = createClient({ hostCallTimeout: 12 });
  let complete;
  client.registerHost("demo/hang", () => new Promise((resolve) => { complete = resolve; }));

  worker.emit("message", {
    type: "host-call",
    id: "host-timeout",
    requestId: "request-1",
    operation: "demo/hang",
    args: []
  });

  const response = await waitFor(() => hostResponses(worker, "host-timeout")[0]);
  assert.equal(response.type, "host-exception");
  assert.equal(response.error.name, "TimeoutError");
  assert.equal(response.error.message, "host/call-timeout:demo/hang");

  complete("too late");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(hostResponses(worker, "host-timeout").length, 1);
  client.dispose();
});

test("boot aborts an old host call before installing the next project", async () => {
  const { client, worker } = createClient();
  let observedSignal;
  client.registerHost("demo/wait", (_value, context) => new Promise((resolve, reject) => {
    observedSignal = context.signal;
    context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true });
  }));

  worker.emit("message", {
    type: "host-call",
    id: "host-old-project",
    requestId: "request-old",
    operation: "demo/wait",
    args: [true]
  });
  await waitFor(() => observedSignal);

  const ready = await client.boot([], "next.project");
  assert.equal(ready.type, "ready");
  assert.equal(observedSignal.aborted, true);

  const response = hostResponses(worker, "host-old-project")[0];
  assert.equal(response.type, "host-exception");
  assert.equal(response.error.name, "AbortError");
  assert.equal(response.error.message, "host/call-cancelled:boot");
  assert.equal(hostResponses(worker, "host-old-project").length, 1);
  client.dispose();
});

test("a superseded boot context is aborted before it can post a boot request", async () => {
  const { client, worker } = createClient();
  const contexts = [];
  client.setBootContextProvider(({ generation, signal }) => new Promise((resolve, reject) => {
    contexts.push({ generation, signal, resolve });
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    if (generation === 2) resolve({ capabilities: ["studio/eval"] });
  }));

  const first = client.boot([], "first.project");
  await waitFor(() => contexts.length === 1);
  const second = client.boot([], "second.project");

  await assert.rejects(first, /runtime\/boot-context-cancelled:boot/);
  const ready = await second;
  assert.equal(ready.namespace, "second.project");
  assert.equal(contexts[0].signal.aborted, true);
  assert.equal(worker.messages.filter((message) => message.type === "boot").length, 1);
  client.dispose();
});

test("dispose aborts handlers without posting to a terminated worker", async () => {
  const { client, worker } = createClient();
  let signal;
  client.registerHost("demo/dispose", (_value, context) => new Promise((resolve, reject) => {
    signal = context.signal;
    context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true });
  }));

  worker.emit("message", {
    type: "host-call",
    id: "host-dispose",
    requestId: "request-1",
    operation: "demo/dispose",
    args: [true]
  });
  await waitFor(() => signal);
  client.dispose();
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(signal.aborted, true);
  assert.equal(worker.terminated, true);
  assert.equal(hostResponses(worker, "host-dispose").length, 0);
});
