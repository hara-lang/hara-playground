import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  DEPLOYMENT_PROBES,
  EXACT_DEPLOYMENT_PATHS,
  verifyPagesDeployment
} from "../scripts/verify-pages-deployment.mjs";

function response(body, status = 200) {
  const bytes = body instanceof Uint8Array ? body : new TextEncoder().encode(String(body));
  return {
    ok: status >= 200 && status < 300,
    status,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  };
}

async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), "hara-pages-deployment-test-"));
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

test("the deployment contract covers the Audio bridge, mobile output and featured project catalog", () => {
  for (const path of [
    "src/main.js",
    "src/audio/integration.js",
    "src/audio/host.js",
    "src/audio/supersonic-provider.js",
    "src/audio/web-audio-engine.js",
    "src/audio/gw.audio.supersonic.hal",
    "src/app/workspace-layout.js",
    "src/styles/mobile-audio.css",
    "src/studio/projects.js"
  ]) {
    assert.ok(EXACT_DEPLOYMENT_PATHS.includes(path), `missing exact deployment asset ${path}`);
  }
  assert.ok(DEPLOYMENT_PROBES.some((probe) => probe.path === "runtime/rust/hara.wasm"));
  assert.ok(DEPLOYMENT_PROBES.some((probe) => probe.path === "runtime/rust/host/services.js"));
});

test("exact public assets are compared with the repository and carry a commit cache buster", async (t) => {
  const root = await fixture({ "src/main.js": "installAudioOutput();\n" });
  t.after(() => rm(root, { recursive: true, force: true }));
  const requested = [];

  const report = await verifyPagesDeployment({
    baseUrl: "https://example.test/hara-playground",
    commit: "abc123",
    repositoryRoot: root,
    exactPaths: ["src/main.js"],
    probes: [],
    attempts: 1,
    fetchImpl: async (url) => {
      requested.push(String(url));
      return response("installAudioOutput();\n");
    }
  });

  assert.equal(report.attempts, 1);
  assert.deepEqual(requested, [
    "https://example.test/hara-playground/src/main.js?hara-deployment=abc123"
  ]);
});

test("the verifier retries stale CDN content until the deployed digest converges", async (t) => {
  const root = await fixture({ "src/main.js": "current\n" });
  t.after(() => rm(root, { recursive: true, force: true }));
  let requests = 0;
  let sleeps = 0;

  const report = await verifyPagesDeployment({
    baseUrl: "https://example.test/",
    commit: "next",
    repositoryRoot: root,
    exactPaths: ["src/main.js"],
    probes: [],
    attempts: 3,
    delayMs: 1,
    sleep: async () => { sleeps += 1; },
    fetchImpl: async () => response(++requests === 1 ? "stale\n" : "current\n")
  });

  assert.equal(report.attempts, 2);
  assert.equal(sleeps, 1);
  assert.equal(requests, 2);
});

test("a runtime probe failure reports the deployed path and validation reason", async () => {
  const wasmProbe = DEPLOYMENT_PROBES.find((probe) => probe.path === "runtime/rust/hara.wasm");

  await assert.rejects(
    verifyPagesDeployment({
      baseUrl: "https://example.test/",
      commit: "bad-runtime",
      repositoryRoot: ".",
      exactPaths: [],
      probes: [wasmProbe],
      attempts: 1,
      fetchImpl: async () => response(new Uint8Array([0, 1, 2, 3]))
    }),
    /runtime\/rust\/hara\.wasm: WASM payload is unexpectedly small/
  );
});

test("the runtime host-service probe requires the Supersonic operation", async () => {
  const servicesProbe = DEPLOYMENT_PROBES.find(
    (probe) => probe.path === "runtime/rust/host/services.js"
  );

  await assert.rejects(
    verifyPagesDeployment({
      baseUrl: "https://example.test/",
      commit: "missing-audio-host",
      repositoryRoot: ".",
      exactPaths: [],
      probes: [servicesProbe],
      attempts: 1,
      fetchImpl: async () => response("export function createHostServices() {}\n")
    }),
    /do not expose gw\.audio\.supersonic\/start/
  );
});
