import { GreenwaysAiClient } from "./greenways-client.js";

export const MODEL_GENERATE_CAPABILITY = "model/generate";

const STATUS_OPERATION = "gw.ai/status";
const GENERATE_OPERATION = "gw.ai/generate";
const REQUEST_KEYS = new Set([
  "profile-id",
  "profileId",
  "model",
  "messages",
  "max-output-tokens",
  "maxOutputTokens",
  "timeout-ms",
  "timeoutMs",
]);
const MESSAGE_KEYS = new Set(["role", "content"]);
const MESSAGE_ROLES = new Set(["system", "user", "assistant"]);

export class PlaygroundAiHost {
  constructor({ runtime, client = null } = {}) {
    if (!runtime) throw new Error("ai/runtime-required");
    this.client = client || new GreenwaysAiClient();
    this.unregister = [
      runtime.registerHost(STATUS_OPERATION, (_context) => this.status(), {
        capability: MODEL_GENERATE_CAPABILITY,
      }),
      runtime.registerHost(GENERATE_OPERATION, (request, context) => this.generate(request, context), {
        capability: MODEL_GENERATE_CAPABILITY,
      }),
    ];
  }

  async status() {
    try {
      return publicStatus(await this.client.status());
    } catch (error) {
      throw publicAiError(error);
    }
  }

  async generate(request, context = {}) {
    const operation = this.client.generate(normalizeGenerationRequest(request));
    const signal = context?.signal;
    if (!signal) return publicResult((await operation.promise).result);
    if (signal.aborted) {
      void cancelQuietly(this.client, operation.requestId);
      throw abortReason(signal);
    }

    let rejectAbort;
    const aborted = new Promise((_resolve, reject) => { rejectAbort = reject; });
    const onAbort = () => {
      void cancelQuietly(this.client, operation.requestId);
      rejectAbort(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await Promise.race([operation.promise, aborted]).catch((error) => {
        throw publicAiError(error);
      });
      return publicResult(response.result);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  destroy() {
    for (const unregister of this.unregister.splice(0)) unregister?.();
    this.client.destroy?.();
  }
}

export function normalizeGenerationRequest(value) {
  const request = plainObject(value, "ai/request-invalid");
  rejectUnknownKeys(request, REQUEST_KEYS, "ai/request-field-denied");
  const profileId = requiredText(request["profile-id"] ?? request.profileId, "ai/profile-id-required");
  const model = requiredText(request.model, "ai/model-required");
  const messages = requiredArray(request.messages, "ai/messages-required").map((entry, index) => {
    const message = plainObject(entry, `ai/message-invalid:${index}`);
    rejectUnknownKeys(message, MESSAGE_KEYS, `ai/message-field-denied:${index}`);
    const role = requiredText(message.role, `ai/message-role-required:${index}`);
    if (!MESSAGE_ROLES.has(role)) throw new Error(`ai/message-role-invalid:${index}`);
    return { role, content: requiredText(message.content, `ai/message-content-required:${index}`) };
  });
  if (messages.length < 1) throw new Error("ai/messages-required");

  const output = { profileId, model, messages };
  const maxOutputTokens = request["max-output-tokens"] ?? request.maxOutputTokens;
  const timeoutMs = request["timeout-ms"] ?? request.timeoutMs;
  if (maxOutputTokens != null) output.maxOutputTokens = positiveInteger(maxOutputTokens, "ai/max-output-tokens-invalid");
  if (timeoutMs != null) output.timeoutMs = positiveInteger(timeoutMs, "ai/timeout-ms-invalid");
  return output;
}

export function publicStatus(response) {
  const capability = response?.capability;
  const ai = response?.ai;
  const profiles = Array.isArray(ai?.providerProfiles)
    ? ai.providerProfiles.map((profile) => ({
      id: String(profile?.id ?? ""),
      label: String(profile?.label ?? ""),
      provider: String(profile?.provider ?? ""),
    })).filter((profile) => profile.id && profile.provider)
    : [];
  const access = {};
  for (const profile of profiles) access[profile.provider] = Boolean(ai?.providerAccess?.[profile.provider]);
  return {
    available: true,
    capability: { allowed: Boolean(capability?.allowed) },
    ai: { providerProfiles: profiles, providerAccess: access },
  };
}

export function publicResult(result) {
  const usage = result?.usage;
  return {
    output: String(result?.output ?? ""),
    provider: String(result?.provider ?? ""),
    model: String(result?.model ?? ""),
    finishReason: result?.finishReason == null ? null : String(result.finishReason),
    usage: {
      inputTokens: finiteNumber(usage?.inputTokens),
      outputTokens: finiteNumber(usage?.outputTokens),
      totalTokens: finiteNumber(usage?.totalTokens),
    },
  };
}

function plainObject(value, error) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(error);
  return value;
}

function requiredArray(value, error) {
  if (!Array.isArray(value)) throw new Error(error);
  return value;
}

function requiredText(value, error) {
  if (typeof value !== "string" || !value.trim()) throw new Error(error);
  return value.trim();
}

function positiveInteger(value, error) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(error);
  return value;
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function rejectUnknownKeys(value, allowed, error) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${error}:${key}`);
  }
}

function abortReason(signal) {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error("ai/request-cancelled");
  error.name = "AbortError";
  return error;
}

function publicAiError(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") return error;
  const failure = error instanceof Error ? error : new Error(String(error));
  failure.data = { "ai/code": String(error?.code || "AI_FAILURE") };
  return failure;
}

async function cancelQuietly(client, requestId) {
  if (!requestId) return;
  await client.cancel(requestId).catch(() => {});
}
