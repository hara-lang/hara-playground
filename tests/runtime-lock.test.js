import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_RUNTIME_REQUIRED,
  SUPERSONIC_RUNTIME_REQUIRED,
  formatRuntimeLock,
  normalizeRuntimeLock,
  parseChecksum
} from "../scripts/runtime-lock.mjs";

const checksum = "a".repeat(64);
const repository = fileURLToPath(new URL("..", import.meta.url));
const runtimeLockScript = join(repository, "scripts/runtime-lock.mjs");

function lock(overrides = {}) {
  return {
    version: "0.1.2",
    url: "https://github.com/hara-lang/hara/releases/download/v0.1.2/hara-studio-runtime-0.1.2.tar.gz",
    sha256: checksum,
    ...overrides
  };
}

test("runtime locks default to the canonical adapter payload", () => {
  const normalized = normalizeRuntimeLock(lock());
  assert.equal(normalized.version, "0.1.2");
  assert.equal(normalized.sha256, checksum);
  assert.deepEqual(normalized.required, DEFAULT_RUNTIME_REQUIRED);
});

test("Supersonic-complete locks can require the packaged provider and namespace", () => {
  const required = [...DEFAULT_RUNTIME_REQUIRED, ...SUPERSONIC_RUNTIME_REQUIRED];
  const normalized = normalizeRuntimeLock(lock({ required }));
  assert.deepEqual(normalized.required, required);
  assert.match(formatRuntimeLock(normalized), /rust\/studio\/supersonic\.js/);
});

test("runtime locks reject unsafe, duplicate and non-string payload paths", () => {
  for (const required of [
    ["../secret"],
    ["rust/../secret"],
    ["/absolute/path"],
    ["rust\\windows"],
    ["rust/hara.wasm", "./rust/hara.wasm"],
    [42]
  ]) {
    assert.throws(() => normalizeRuntimeLock(lock({ required })), /runtime lock required/);
  }
});

test("runtime locks require HTTPS, semantic versions and SHA-256 digests", () => {
  assert.throws(() => normalizeRuntimeLock(lock({ version: "latest" })), /version is invalid/);
  assert.throws(() => normalizeRuntimeLock(lock({ url: "http://example.com/runtime.tar.gz" })), /must use https/);
  assert.throws(() => normalizeRuntimeLock(lock({ sha256: "abc" })), /64 hexadecimal/);
});

test("checksum files accept GNU and BSD-style first lines", () => {
  assert.equal(parseChecksum(`${checksum}  runtime.tar.gz\n`), checksum);
  assert.equal(parseChecksum(`${checksum} *runtime.tar.gz\n`), checksum);
  assert.equal(parseChecksum(`\\${checksum}  runtime.tar.gz\n`), checksum);
  assert.throws(() => parseChecksum("not-a-checksum runtime.tar.gz"), /does not begin/);
});

test("the CLI creates a Supersonic-complete lock from an official checksum file", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hara-runtime-lock-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const checksumFile = join(directory, "runtime.tar.gz.sha256");
  const output = join(directory, "runtime.lock.json");
  await writeFile(checksumFile, `${checksum}  /release/hara-studio-runtime-0.1.2.tar.gz\n`);

  const result = spawnSync(process.execPath, [
    runtimeLockScript,
    "create",
    "0.1.2",
    lock().url,
    checksumFile,
    output,
    "--supersonic"
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const generated = normalizeRuntimeLock(JSON.parse(await readFile(output, "utf8")));
  assert.equal(generated.sha256, checksum);
  assert.deepEqual(generated.required, [
    ...DEFAULT_RUNTIME_REQUIRED,
    ...SUPERSONIC_RUNTIME_REQUIRED
  ]);
});
