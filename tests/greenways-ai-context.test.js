import assert from "node:assert/strict";
import test from "node:test";
import { buildPlaygroundMessages } from "../src/ai/context.js";

test("builds a Hara-aware request with the current buffer", () => {
  const result = buildPlaygroundMessages({
    prompt: "Explain the transformation",
    selectedPath: "src/app/core.hal",
    content: "(defn answer [] 42)",
    namespace: "app.core",
    includeBuffer: true,
  });
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].role, "system");
  assert.match(result.messages[0].content, /balanced forms/);
  assert.match(result.messages[1].content, /src\/app\/core\.hal/);
  assert.match(result.messages[1].content, /\(defn answer \[\] 42\)/);
  assert.equal(result.truncated, false);
});

test("keeps context bounded and reports truncation", () => {
  const result = buildPlaygroundMessages({
    prompt: "Review this buffer",
    selectedPath: "src/app/core.hal",
    content: "x".repeat(3000),
    includeBuffer: true,
    maxContextChars: 1024,
  });
  assert.equal(result.truncated, true);
  assert.match(result.messages[1].content, /context truncated/);
  assert.ok(result.messages[1].content.length < 1600);
});

test("rejects empty or unbounded prompts", () => {
  assert.throws(() => buildPlaygroundMessages({ prompt: "   " }), /Write a request/);
  assert.throws(() => buildPlaygroundMessages({ prompt: "x".repeat(12001) }), /cannot exceed/);
});
