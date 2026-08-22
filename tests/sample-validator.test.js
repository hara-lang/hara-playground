import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  gitBlobSha,
  parseProjectManifest,
  validateSampleCatalog,
} from "../scripts/validate-samples.mjs";

const manifest = `{:hara/type :project
 :hara/version "1.0.0"
 :project/id playground.fixture
 :project/version "0.1.0"
 :project/source-paths ["src"]
 :project/test-paths ["test"]
 :project/extension-paths ["extensions"]
 :project/main samples.fixture
 :project/capabilities #{:studio/eval :preview/hta}}
`;

const source = `(ns samples.fixture)\n\n(defn view [] [:main "fixture"])\n\n(view)\n`;
const runtimeLock = `${JSON.stringify({
  version: "0.1.4",
  url: "https://example.invalid/runtime.tar.gz",
  sha256: "a".repeat(64),
  required: [],
}, null, 2)}\n`;

test("project manifests are parsed as data and expose normalized package fields", () => {
  const parsed = parseProjectManifest(manifest, "fixture/project.edn");
  assert.equal(parsed.projectId, "playground.fixture");
  assert.equal(parsed.mainNamespace, "samples.fixture");
  assert.deepEqual(parsed.sourcePaths, ["src"]);
  assert.deepEqual(parsed.capabilities, ["preview/hta", "studio/eval"]);
});

test("project manifest validation rejects retired runtime keys", () => {
  assert.throws(
    () => parseProjectManifest(manifest.replace(":project/main", ":jvm/source-paths [\"src-jvm\"]\n :project/main")),
    /retired top-level :jvm\/source-paths/,
  );
});

test("catalog validation treats workspace metadata as optional and rejects orphan sample directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "hara-samples-"));
  try {
    await mkdir(join(root, "samples", "fixture", "src"), { recursive: true });
    await writeFile(join(root, "runtime.lock.json"), runtimeLock);
    await writeFile(join(root, "samples", "fixture", "project.edn"), manifest);
    await writeFile(join(root, "samples", "fixture", "src", "main.hal"), source);

    const catalog = {
      schemaVersion: 1,
      authority: {
        repository: "hara-lang/hara-specs-registry",
        commit: "1".repeat(40),
        status: "draft",
        packageSpec: "02-platform/000006-package/draft/hara-package.edn",
      },
      runtime: {
        lockPath: "runtime.lock.json",
        lockGitBlobSha: gitBlobSha(runtimeLock),
        version: "0.1.4",
        sha256: "a".repeat(64),
      },
      samples: [{
        id: "fixture",
        path: "samples/fixture",
        manifest: "project.edn",
        manifestGitBlobSha: gitBlobSha(manifest),
        projectId: "playground.fixture",
        mainNamespace: "samples.fixture",
        source: "src/main.hal",
        sourceGitBlobSha: gitBlobSha(source),
        capabilities: ["preview/hta", "studio/eval"],
        validation: { mode: "static-view" },
        runtimeValidation: {
          load: "full-source",
          smokeForm: "(count (view))",
          expected: { type: "number", value: 2 },
          effect: { status: "not-required" },
        },
        manifestExtensions: [],
      }],
    };
    await writeFile(join(root, "samples", "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);

    const report = await validateSampleCatalog(root);
    assert.deepEqual(report.samples.map(({ id }) => id), ["fixture"]);

    const trailingSlashReport = await validateSampleCatalog(`${root}/`);
    assert.deepEqual(trailingSlashReport.samples.map(({ id }) => id), ["fixture"]);

    await mkdir(join(root, "samples", "orphan"));
    await assert.rejects(() => validateSampleCatalog(root), /sample directory inventory/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the committed catalog remains valid JSON with one entry per current sample", async () => {
  const catalog = JSON.parse(await readFile(new URL("../samples/catalog.json", import.meta.url), "utf8"));
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.samples.length, 9);
  assert.deepEqual(catalog.samples.map(({ id }) => id), [...catalog.samples.map(({ id }) => id)].sort());
});
