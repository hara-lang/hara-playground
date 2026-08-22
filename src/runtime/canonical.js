import { completionItems, collectSourceSymbols } from "../language/completion.js";

const DEFAULT_RUNTIME_ROOT = new URL("../../runtime/", import.meta.url);
const KERNEL_NAME = "STUDIO";
const SUPERSONIC_NAMESPACE = "gw.audio.supersonic";
const SUPERSONIC_METHODS = Object.freeze(["start", "update", "status", "stop"]);
const BLANK_NAMESPACE_CONFIG = /\(:config\s+\{[^}]*:blank\s+true[^}]*\}\)/s;
const SUPERSONIC_UPDATE_OMISSION = /\(:refer-clojure\s+:exclude\s+\[[^\]]*\bupdate\b[^\]]*\]\)/s;
const AI_NAMESPACE = "gw.ai";
const AI_METHODS = Object.freeze(["status", "generate"]);

export class CanonicalRuntimeUnavailableError extends Error {
  constructor(message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "CanonicalRuntimeUnavailableError";
  }
}

/**
 * Adapter for the runtime archive produced by hara-lang/hara's
 * scripts/build-studio-runtime target.
 */
export async function createCanonicalRuntime(options = {}) {
  const root = options.runtimeRoot
    ? new URL(options.runtimeRoot, import.meta.url)
    : DEFAULT_RUNTIME_ROOT;
  const wasmUrl = new URL("rust/hara.wasm", root);
  const workerUrl = new URL("rust/hta-worker.js", root);
  const sharedWorkerUrl = new URL("rust/hta-shared-worker.js", root);

  let moduleBytes;
  try {
    const response = await fetch(wasmUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    moduleBytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    throw new CanonicalRuntimeUnavailableError(`Hara runtime bundle not found at ${wasmUrl}`, error);
  }

  let brokerModule;
  let servicesModule;
  try {
    [brokerModule, servicesModule] = await Promise.all([
      import(new URL("rust/host/broker.js", root).href),
      import(new URL("rust/host/services.js", root).href)
    ]);
  } catch (error) {
    throw new CanonicalRuntimeUnavailableError("Hara Studio host modules are incomplete", error);
  }

  if (typeof brokerModule.createBrowserBroker !== "function") {
    throw new CanonicalRuntimeUnavailableError("rust/host/broker.js does not export createBrowserBroker");
  }
  if (typeof servicesModule.createHostServices !== "function") {
    throw new CanonicalRuntimeUnavailableError("rust/host/services.js does not export createHostServices");
  }

  const resources = { ...(options.resources || {}) };
  let supersonicSource = resources[SUPERSONIC_NAMESPACE] || "";
  if (supersonicSource && !hasCanonicalSupersonicHostContract(supersonicSource)) {
    options.onDiagnostic?.("Ignoring a Supersonic HAL resource that is not safe for the minimal browser bootstrap");
    supersonicSource = "";
  }
  if (!supersonicSource) {
    supersonicSource = await loadSupersonicResource(root, options);
  }
  if (supersonicSource) resources[SUPERSONIC_NAMESPACE] = supersonicSource;
  else delete resources[SUPERSONIC_NAMESPACE];

  const hostCalls = servicesModule.createHostServices({
    capabilities: options.capabilities || ["studio/eval", "audio/playback"],
    grantedCapabilities: options.grantedCapabilities || ["studio/eval"],
    grantsForSession: options.grantsForSession,
    supersonic: options.supersonic
  });
  Object.assign(hostCalls, createAiHostServices(options.ai));
  const broker = brokerModule.createBrowserBroker({
    workerUrl,
    sharedWorkerUrl,
    moduleBytes,
    hostCalls,
    resources
  });

  // BrowserBroker registers resources on the root runtime before it creates
  // STUDIO. The current raw runtime does not yet make that deferred resource
  // visible to every child kernel's first ns/require evaluation. Preloading the
  // exact same source into STUDIO gives project code a concrete namespace while
  // retaining the broker resource for future runtime implementations/sessions.
  const aiSource = await loadAiResource(root, options);
  const bootstrapSources = [
    supersonicSource ? { namespace: SUPERSONIC_NAMESPACE, source: supersonicSource } : null,
    aiSource ? { namespace: AI_NAMESPACE, source: aiSource } : null
  ].filter(Boolean);
  const runtime = new CanonicalHaraRuntime({ broker, options, bootstrapSources });
  await runtime.initialise();
  return runtime;
}

async function loadAiResource(root, options) {
  const candidates = [
    new URL("../ai/gw.ai.hal", import.meta.url),
    new URL("rust/studio/hal/ai.hal", root)
  ];
  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const source = await response.text();
      if (hasCanonicalAiHostContract(source)) return source;
      options.onDiagnostic?.(`Ignoring non-bootstrap-safe AI HAL resource at ${url}`);
    } catch {
      // Try the next source. The Play ships a local compatibility copy.
    }
  }
  options.onDiagnostic?.("gw.ai HAL resource is unavailable; AI projects cannot load");
  return "";
}

export function hasCanonicalAiHostContract(source) {
  const text = String(source || "");
  return text.includes(`(ns ${AI_NAMESPACE}`)
    && BLANK_NAMESPACE_CONFIG.test(text)
    && AI_METHODS.every((method) => text.includes(`Host/call "${AI_NAMESPACE}" "${method}"`));
}

export function createAiHostServices(ai) {
  if (!ai) return {};
  return {
    "gw.ai/status": async () => toHta(await ai.status()),
    "gw.ai/generate": async (request) => toHta(await ai.generate(toPlain(request)))
  };
}

async function loadSupersonicResource(root, options) {
  // The Play copy is intentionally first. It calls the built-in Host
  // boundary directly and therefore does not require Foundation namespaces to
  // exist before the first browser project is evaluated.
  const candidates = [
    new URL("../audio/gw.audio.supersonic.hal", import.meta.url),
    new URL("rust/studio/hal/supersonic.hal", root)
  ];
  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const source = await response.text();
      if (hasCanonicalSupersonicHostContract(source)) return source;
      options.onDiagnostic?.(`Ignoring non-bootstrap-safe Supersonic HAL resource at ${url}`);
    } catch {
      // Try the next source. The Play ships a local compatibility copy.
    }
  }
  options.onDiagnostic?.("Supersonic HAL resource is unavailable; audio projects cannot load");
  return "";
}

export function hasCanonicalSupersonicHostContract(source) {
  const text = String(source || "");
  return text.includes(`(ns ${SUPERSONIC_NAMESPACE}`)
    && BLANK_NAMESPACE_CONFIG.test(text)
    && SUPERSONIC_UPDATE_OMISSION.test(text)
    && SUPERSONIC_METHODS.every((method) =>
      text.includes(`Host/call "${SUPERSONIC_NAMESPACE}" "${method}"`));
}

export class CanonicalHaraRuntime {
  constructor({
    broker,
    options = {},
    kernelName = KERNEL_NAME,
    bootstrapSources = []
  }) {
    this.broker = broker;
    this.options = options;
    this.kernelName = kernelName;
    this.bootstrapSources = normalizeBootstrapSources(bootstrapSources);
    this.currentNamespace = "user";
    this.started = false;
    this.knownSymbols = new Set();
  }

  async initialise() {
    if (this.started) return this;
    await this.broker.create(this.kernelName);
    try {
      for (const resource of this.bootstrapSources) {
        await this.broker.eval(
          this.kernelName,
          `${resource.source.trim()}\n\n(ns user)`
        );
      }
    } catch (error) {
      await this.broker.close(this.kernelName).catch(() => {});
      throw new CanonicalRuntimeUnavailableError(
        "Unable to preload canonical Hara browser resources",
        error
      );
    }
    this.started = true;
    this.options.onDiagnostic?.("Connected to the canonical Hara WASM kernel");
    return this;
  }

  async reset() {
    if (this.started) await this.broker.close(this.kernelName).catch(() => {});
    this.started = false;
    this.currentNamespace = "user";
    this.knownSymbols.clear();
    await this.initialise();
  }

  setNamespace(namespace) {
    this.currentNamespace = namespace || "user";
    return this.currentNamespace;
  }

  complete(prefix = "", _namespace = this.currentNamespace, source = "") {
    return completionItems({
      prefix,
      namespaceSymbols: [...this.knownSymbols],
      source
    });
  }

  async evaluateSource(source, namespace = this.currentNamespace) {
    await this.initialise();
    const requestedNamespace = namespace || this.currentNamespace || "user";
    const declaredNamespace = detectNamespace(source);
    const scopedSource = declaredNamespace || requestedNamespace === "user"
      ? source
      : `(ns ${requestedNamespace})\n${source}`;
    for (const symbol of collectSourceSymbols(source)) this.knownSymbols.add(symbol);
    const result = await this.broker.eval(this.kernelName, scopedSource);
    this.currentNamespace = declaredNamespace || requestedNamespace;
    return result;
  }

  async dispose() {
    if (!this.started) return;
    await this.broker.close(this.kernelName).catch(() => {});
    this.started = false;
  }
}

function normalizeBootstrapSources(resources) {
  return [...resources]
    .map((resource) => typeof resource === "string"
      ? { namespace: detectNamespace(resource) || "resource", source: resource }
      : resource)
    .filter((resource) => resource
      && typeof resource.source === "string"
      && resource.source.trim());
}

function toPlain(value) {
  if (value instanceof Map) {
    return Object.fromEntries([...value].map(([key, entry]) => [
      key?.constructor?.name === "HtaKeyword" ? key.name : String(key),
      toPlain(entry)
    ]));
  }
  if (Array.isArray(value)) return value.map(toPlain);
  return value;
}

function toHta(value) {
  if (Array.isArray(value)) return value.map(toHta);
  if (value instanceof Map) return value;
  if (value !== null && typeof value === "object") {
    return new Map(Object.entries(value).map(([key, entry]) => [key, toHta(entry)]));
  }
  return value;
}

export function detectNamespace(source) {
  return String(source).match(/\(ns\s+([A-Za-z][A-Za-z0-9_.-]*)/)?.[1] || null;
}
