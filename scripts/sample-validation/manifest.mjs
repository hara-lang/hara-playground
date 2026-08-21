import { readAll } from "../../src/runtime/reader.js";
import {
  assertString,
  equalStrings,
  fail,
  keywordMap,
  keywordName,
  keywordSet,
  stringValue,
  stringVector,
  symbolName,
} from "./common.mjs";

const semverPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const requiredProjectKeys = new Set([
  "hara/type",
  "hara/version",
  "project/id",
  "project/version",
  "project/source-paths",
  "project/test-paths",
  "project/extension-paths",
  "project/capabilities",
]);
export const packageProjectKeys = new Set([
  ...requiredProjectKeys,
  "project/main",
  "project/default-profile",
  "project/profiles",
  "project/runtime-profiles",
  "project/artifact-paths",
  "project/archive-root",
  "project/dependencies",
  "project/package",
  "project/build",
  "project/extensions",
  "project/remote-artifacts",
]);
const retiredRuntimeKeys = new Set([
  "jvm/source-paths",
  "jvm/dependencies",
  "jvm/target-path",
  "rust/source-paths",
  "rust/dependencies",
  "rust/target-path",
]);

export function parseProjectManifest(source, label = "project.edn") {
  const forms = readAll(source);
  if (forms.length !== 1) fail(label, `must contain exactly one EDN form, received ${forms.length}`);
  const manifest = keywordMap(label, forms[0]);

  for (const key of requiredProjectKeys) {
    if (!manifest.has(key)) fail(label, `is missing required :${key}`);
  }
  for (const key of retiredRuntimeKeys) {
    if (manifest.has(key)) fail(label, `uses retired top-level :${key}; move runtime intent below :project/runtime-profiles`);
  }

  if (keywordName(`${label} :hara/type`, manifest.get("hara/type")) !== "project") {
    fail(label, ":hara/type must be :project");
  }
  const haraVersion = stringValue(`${label} :hara/version`, manifest.get("hara/version"));
  const projectVersion = stringValue(`${label} :project/version`, manifest.get("project/version"));
  if (!semverPattern.test(haraVersion)) fail(label, ":hara/version must be semantic version text");
  if (!semverPattern.test(projectVersion)) fail(label, ":project/version must be semantic version text");

  const projectId = symbolName(`${label} :project/id`, manifest.get("project/id"));
  const mainNamespace = manifest.has("project/main")
    ? symbolName(`${label} :project/main`, manifest.get("project/main"))
    : null;

  return {
    manifest,
    haraVersion,
    projectId,
    projectVersion,
    mainNamespace,
    sourcePaths: stringVector(`${label} :project/source-paths`, manifest.get("project/source-paths")),
    testPaths: stringVector(`${label} :project/test-paths`, manifest.get("project/test-paths")),
    extensionPaths: stringVector(`${label} :project/extension-paths`, manifest.get("project/extension-paths")),
    capabilities: keywordSet(`${label} :project/capabilities`, manifest.get("project/capabilities")),
  };
}

export function validateManifestExtensions(sample, parsed, label) {
  const extensions = sample.manifestExtensions ?? [];
  if (!Array.isArray(extensions)) fail(`${label}.manifestExtensions`, "must be an array");
  const declared = extensions.map((extension, index) => {
    const extensionLabel = `${label}.manifestExtensions[${index}]`;
    if (!extension || typeof extension !== "object" || Array.isArray(extension)) fail(extensionLabel, "must be an object");
    const key = assertString(`${extensionLabel}.key`, extension.key);
    if (packageProjectKeys.has(key)) fail(extensionLabel, `:${key} is already part of the package contract`);
    assertString(`${extensionLabel}.reason`, extension.reason);
    const issue = assertString(`${extensionLabel}.issue`, extension.issue);
    if (!/^https:\/\/github\.com\/hara-lang\/hara-playground\/issues\/\d+$/.test(issue)) {
      fail(`${extensionLabel}.issue`, "must link to a hara-playground issue");
    }
    return key;
  });
  if (new Set(declared).size !== declared.length) fail(`${label}.manifestExtensions`, "contains duplicate keys");

  const unknown = [...parsed.manifest.keys()].filter((key) => !packageProjectKeys.has(key)).sort();
  equalStrings(`${label} manifest extension keys`, unknown, [...declared].sort());
}
