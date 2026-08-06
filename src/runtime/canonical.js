import { completionItems, collectSourceSymbols } from "../language/completion.js";

const DEFAULT_RUNTIME_ROOT = new URL("../../runtime/", import.meta.url);
const KERNEL_NAME = "STUDIO";

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
  let supersonicSource = resources["gw.audio.supersonic"] || "";
  if (!supersonicSource) {
    supersonicSource = await loadSupersonicResource(root, options);
    if (supersonicSource) resources["gw.audio.supersonic"] = supersonicSource;
  }

  const hostCalls = servicesModule.createHostServices({
    capabilities: options.capabilities || ["studio/eval", "audio/playback"],
    grantedCapabilities: options.grantedCapabilities || ["studio/eval"],
    grantsForSession: options.grantsForSession,
    supersonic: options.supersonic
  });
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
  const bootstrapSources = supersonicSource
    ? [{ namespace: "gw.audio.supersonic", source: supersonicSource }]
    : [];
  const runtime = new CanonicalHaraRuntime({ broker, options, bootstrapSources });
  await runtime.initialise();
  return runtime;
}

async function loadSupersonicResource(root, options) {
  const candidates = [
    new URL("rust/studio/hal/supersonic.hal", root),
    new URL("../audio/gw.audio.supersonic.hal", import.meta.url)
  ];
  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.text();
    } catch {
      // Try the next source. The Playground ships a local compatibility copy.
    }
  }
  options.onDiagnostic?.("Supersonic HAL resource is unavailable; audio projects cannot load");
  return "";
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

export function detectNamespace(source) {
  return String(source).match(/\(ns\s+([A-Za-z][A-Za-z0-9_.-]*)/)?.[1] || null;
}
