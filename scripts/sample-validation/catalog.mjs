import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertRelativePath,
  assertSha,
  assertString,
  equalStrings,
  fail,
  readVerifiedFile,
} from "./common.mjs";
import { parseProjectManifest, validateManifestExtensions } from "./manifest.mjs";
import { validateRuntimeValidation } from "./runtime.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const validationModes = new Set(["active-policy", "browser-capability", "host-capability", "static-view"]);

function validateCatalogShape(catalog) {
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) fail("samples/catalog.json", "must be an object");
  if (catalog.schemaVersion !== 1) fail("samples/catalog.json", "schemaVersion must be 1");
  if (catalog.authority?.repository !== "hara-lang/hara-specs-registry") {
    fail("samples/catalog.json authority", "repository must be hara-lang/hara-specs-registry");
  }
  assertSha("samples/catalog.json authority.commit", catalog.authority?.commit);
  if (catalog.authority?.status !== "draft") fail("samples/catalog.json authority.status", "must be draft");
  assertRelativePath("samples/catalog.json authority.packageSpec", catalog.authority?.packageSpec);

  if (catalog.runtime?.lockPath !== "runtime.lock.json") fail("samples/catalog.json runtime.lockPath", "must be runtime.lock.json");
  assertSha("samples/catalog.json runtime.lockGitBlobSha", catalog.runtime?.lockGitBlobSha);
  assertString("samples/catalog.json runtime.version", catalog.runtime?.version);
  if (!/^[0-9a-f]{64}$/.test(catalog.runtime?.sha256 ?? "")) fail("samples/catalog.json runtime.sha256", "must be a lowercase SHA-256");

  if (!Array.isArray(catalog.samples) || catalog.samples.length === 0) fail("samples/catalog.json", "samples must be a non-empty array");
  const ids = catalog.samples.map((sample, index) => assertString(`samples[${index}].id`, sample?.id));
  if (new Set(ids).size !== ids.length) fail("samples/catalog.json", "sample IDs must be unique");
  return catalog;
}

function namespaceFromSource(source, label) {
  const match = source.match(/^\s*\(ns\s+([A-Za-z][A-Za-z0-9_.-]*)/);
  if (!match) fail(label, "must begin with an ns form");
  return match[1];
}

function validateSourceShape(sample, source, label) {
  if (!validationModes.has(sample.validation?.mode)) {
    fail(`${label}.validation.mode`, `must be one of ${[...validationModes].join(", ")}`);
  }
  const mode = sample.validation.mode;
  if (mode === "active-policy") {
    const entry = assertString(`${label}.validation.entrySymbol`, sample.validation.entrySymbol);
    const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`\\(defn\\s+${escaped}\\s+\\[`).test(source)) fail(label, `source does not define active entry ${entry}`);
    if (!(sample.manifestExtensions ?? []).some(({ key }) => key === "playground/active-loop")) {
      fail(label, "active-policy samples must declare the :playground/active-loop manifest gap");
    }
  } else if (!/\(view\)\s*$/.test(source)) {
    fail(label, `${mode} source must end by evaluating (view)`);
  }

  if (mode === "host-capability" || mode === "browser-capability") {
    const capability = assertString(`${label}.validation.hostCapability`, sample.validation.hostCapability);
    if (!sample.capabilities.includes(capability)) fail(label, `host capability ${capability} is not declared in sample capabilities`);
  }
}

export async function validateSampleCatalog(root = repositoryRoot) {
  const catalogPath = resolve(root, "samples/catalog.json");
  const catalog = validateCatalogShape(JSON.parse(await readFile(catalogPath, "utf8")));

  const runtimeContent = await readVerifiedFile(
    root,
    catalog.runtime.lockPath,
    catalog.runtime.lockGitBlobSha,
    "runtime.lock.json",
  );
  const runtime = JSON.parse(runtimeContent);
  if (runtime.version !== catalog.runtime.version || runtime.sha256 !== catalog.runtime.sha256) {
    fail("runtime.lock.json", "version or archive digest differs from samples/catalog.json");
  }

  const directoryEntries = await readdir(resolve(root, "samples"), { withFileTypes: true });
  const actualDirectories = directoryEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const catalogDirectories = catalog.samples.map((sample) => sample.id).sort();
  equalStrings("sample directory inventory", actualDirectories, catalogDirectories);

  const results = [];
  for (const [index, sample] of catalog.samples.entries()) {
    const label = `samples[${index}] (${sample.id})`;
    const expectedPath = `samples/${sample.id}`;
    if (sample.path !== expectedPath) fail(`${label}.path`, `must be ${expectedPath}`);
    assertSha(`${label}.manifestGitBlobSha`, sample.manifestGitBlobSha);
    assertSha(`${label}.sourceGitBlobSha`, sample.sourceGitBlobSha);
    assertString(`${label}.projectId`, sample.projectId);
    assertString(`${label}.mainNamespace`, sample.mainNamespace);
    if (!Array.isArray(sample.capabilities)) fail(`${label}.capabilities`, "must be an array");
    const capabilities = sample.capabilities.map((value, capabilityIndex) => assertString(`${label}.capabilities[${capabilityIndex}]`, value)).sort();
    if (new Set(capabilities).size !== capabilities.length) fail(`${label}.capabilities`, "must be unique");

    const manifestRelative = `${sample.path}/${assertRelativePath(`${label}.manifest`, sample.manifest)}`;
    const sourceRelative = `${sample.path}/${assertRelativePath(`${label}.source`, sample.source)}`;
    const manifestSource = await readVerifiedFile(root, manifestRelative, sample.manifestGitBlobSha, manifestRelative);
    const source = await readVerifiedFile(root, sourceRelative, sample.sourceGitBlobSha, sourceRelative);
    const parsed = parseProjectManifest(manifestSource, manifestRelative);

    if (parsed.projectId !== sample.projectId) fail(label, `project ID mismatch: ${parsed.projectId}`);
    if (parsed.mainNamespace !== sample.mainNamespace) fail(label, `main namespace mismatch: ${parsed.mainNamespace}`);
    equalStrings(`${label} capabilities`, parsed.capabilities, capabilities);
    validateManifestExtensions(sample, parsed, label);

    const sourceNamespace = namespaceFromSource(source, sourceRelative);
    if (sourceNamespace !== sample.mainNamespace) fail(label, `source namespace ${sourceNamespace} differs from :project/main ${sample.mainNamespace}`);
    validateSourceShape(sample, source, label);
    const runtimeValidation = validateRuntimeValidation(sample, label);

    if (sample.workspace !== undefined || sample.workspaceGitBlobSha !== undefined) {
      const workspace = assertRelativePath(`${label}.workspace`, sample.workspace);
      assertSha(`${label}.workspaceGitBlobSha`, sample.workspaceGitBlobSha);
      const workspaceRelative = `${sample.path}/${workspace}`;
      const workspaceSource = await readVerifiedFile(root, workspaceRelative, sample.workspaceGitBlobSha, workspaceRelative);
      if (!/:hara\/type\s+:workspace/.test(workspaceSource)) fail(workspaceRelative, "must declare :hara/type :workspace");
      if (!workspaceSource.includes(sample.source)) fail(workspaceRelative, `does not name ${sample.source}`);
    }

    results.push(Object.freeze({
      id: sample.id,
      mode: sample.validation.mode,
      mainNamespace: sample.mainNamespace,
      runtimeValidation,
    }));
  }

  return Object.freeze({
    authorityCommit: catalog.authority.commit,
    runtimeVersion: catalog.runtime.version,
    runtimeLockGitBlobSha: catalog.runtime.lockGitBlobSha,
    runtimeSha256: catalog.runtime.sha256,
    samples: Object.freeze(results),
  });
}
