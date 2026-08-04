import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_RUNTIME_REQUIRED,
  SUPERSONIC_RUNTIME_REQUIRED
} from "../scripts/runtime-lock.mjs";

const repository = fileURLToPath(new URL("..", import.meta.url));
const installer = join(repository, "scripts/install-pinned-runtime");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "hara-runtime-install-test-"));
  return {
    root,
    source: join(root, "source"),
    archive: join(root, "runtime.tar.gz"),
    lock: join(root, "runtime.lock.json"),
    destination: join(root, "runtime")
  };
}

async function writeTree(root, { supersonic = true, link = false } = {}) {
  const files = [
    ...DEFAULT_RUNTIME_REQUIRED,
    ...(supersonic ? SUPERSONIC_RUNTIME_REQUIRED : [])
  ];
  for (const path of files) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `payload:${path}\n`);
  }
  if (link) await symlink("hara.wasm", join(root, "rust/hara-link.wasm"));
}

function createArchive(source, archive) {
  const result = spawnSync("tar", ["-czf", archive, "-C", source, "."], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function writeLock(path, archive, required) {
  await writeFile(path, `${JSON.stringify({
    version: "0.1.2",
    url: "https://example.invalid/hara-studio-runtime-0.1.2.tar.gz",
    sha256: await sha256(archive),
    required
  }, null, 2)}\n`);
}

function install(paths) {
  return spawnSync("bash", [installer], {
    encoding: "utf8",
    env: {
      ...process.env,
      HARA_RUNTIME_LOCK: paths.lock,
      HARA_RUNTIME_DEST: paths.destination,
      HARA_STUDIO_RUNTIME_ARCHIVE: paths.archive,
      TMPDIR: paths.root
    }
  });
}

async function seedExistingRuntime(destination) {
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "README.md"), "Preserved runtime notes\n");
  await writeFile(join(destination, "old-marker.txt"), "old runtime\n");
}

async function assertNoInstallerScratch(root) {
  const names = await readdir(root);
  assert.equal(names.some((name) => name.startsWith(".hara-runtime-install.")), false);
  assert.equal(names.some((name) => name.startsWith(".hara-runtime-backup.")), false);
}

test("the pinned installer validates then atomically replaces the runtime", async (t) => {
  const paths = await fixture();
  t.after(() => rm(paths.root, { recursive: true, force: true }));
  await writeTree(paths.source);
  createArchive(paths.source, paths.archive);
  await writeLock(paths.lock, paths.archive, [
    ...DEFAULT_RUNTIME_REQUIRED,
    ...SUPERSONIC_RUNTIME_REQUIRED
  ]);
  await seedExistingRuntime(paths.destination);

  const result = install(paths);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Installed Hara Studio runtime 0\.1\.2/);
  assert.equal(
    await readFile(join(paths.destination, "rust/studio/supersonic.js"), "utf8"),
    "payload:rust/studio/supersonic.js\n"
  );
  assert.equal(await readFile(join(paths.destination, "README.md"), "utf8"), "Preserved runtime notes\n");
  await assert.rejects(access(join(paths.destination, "old-marker.txt")));
  await assertNoInstallerScratch(paths.root);
});

test("a valid checksum cannot replace the working runtime when payload is missing", async (t) => {
  const paths = await fixture();
  t.after(() => rm(paths.root, { recursive: true, force: true }));
  await writeTree(paths.source, { supersonic: false });
  createArchive(paths.source, paths.archive);
  await writeLock(paths.lock, paths.archive, [
    ...DEFAULT_RUNTIME_REQUIRED,
    ...SUPERSONIC_RUNTIME_REQUIRED
  ]);
  await seedExistingRuntime(paths.destination);

  const result = install(paths);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing required payload: rust\/studio\/supersonic\.js/);
  assert.equal(await readFile(join(paths.destination, "old-marker.txt"), "utf8"), "old runtime\n");
  await assertNoInstallerScratch(paths.root);
});

test("a checksum mismatch leaves the working runtime untouched", async (t) => {
  const paths = await fixture();
  t.after(() => rm(paths.root, { recursive: true, force: true }));
  await writeTree(paths.source);
  createArchive(paths.source, paths.archive);
  await writeLock(paths.lock, paths.archive, DEFAULT_RUNTIME_REQUIRED);
  const lock = JSON.parse(await readFile(paths.lock, "utf8"));
  lock.sha256 = "0".repeat(64);
  await writeFile(paths.lock, `${JSON.stringify(lock, null, 2)}\n`);
  await seedExistingRuntime(paths.destination);

  const result = install(paths);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /runtime checksum mismatch/);
  assert.equal(await readFile(join(paths.destination, "old-marker.txt"), "utf8"), "old runtime\n");
  await assertNoInstallerScratch(paths.root);
});

test("archives containing symbolic links are rejected before activation", { skip: process.platform === "win32" }, async (t) => {
  const paths = await fixture();
  t.after(() => rm(paths.root, { recursive: true, force: true }));
  await writeTree(paths.source, { link: true });
  createArchive(paths.source, paths.archive);
  await writeLock(paths.lock, paths.archive, DEFAULT_RUNTIME_REQUIRED);
  await seedExistingRuntime(paths.destination);

  const result = install(paths);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsupported filesystem entry: rust\/hara-link\.wasm/);
  assert.equal(await readFile(join(paths.destination, "old-marker.txt"), "utf8"), "old runtime\n");
  await assertNoInstallerScratch(paths.root);
});
