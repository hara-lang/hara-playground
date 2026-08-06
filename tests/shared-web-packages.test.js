import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const adapters = Object.freeze({
  "src/runtime/client.js": "packages/web-runtime/src/client.js",
  "src/runtime/capabilities.js": "packages/web-capabilities/src/index.js",
  "src/editor/lisp.js": "packages/web-editor/src/lisp.js",
  "src/editor/forms.js": "packages/web-editor/src/forms.js",
  "src/editor/instarepl.js": "packages/web-editor/src/instarepl.js",
  "src/language/completion.js": "packages/web-editor/src/completion.js",
  "src/workspace/store.js": "packages/web-workspace/src/store.js",
  "src/workspace/project.js": "packages/web-workspace/src/project.js",
  "src/workspace/default-project.js": "packages/web-workspace/src/default-project.js",
  "src/ui/hta.js": "packages/web-preview/src/hta.js"
});

test("Playground pins hara-ui and routes stable adapters through web packages", async () => {
  const modules = await read(".gitmodules");
  assert.match(modules, /path = vendor\/hara-ui/);
  assert.match(modules, /github\.com\/hara-lang\/hara-ui\.git/);

  for (const [path, target] of Object.entries(adapters)) {
    assert.match(await read(path), new RegExp(target.replaceAll("/", "\\/")));
  }

  await access(new URL("../vendor/hara-ui/packages/web-runtime/src/client.js", import.meta.url));
});

test("repository commands prepare and publish the pinned package tree", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  assert.equal(packageJson.scripts["web:prepare"], "node scripts/prepare-web-packages.mjs");
  for (const lifecycle of ["predev", "pretest", "precheck", "prebuild"]) {
    assert.equal(packageJson.scripts[lifecycle], "npm run web:prepare");
  }
  assert.equal(
    packageJson.scripts.test,
    "node --test tests/*.test.js",
    "the Playground suite must not recursively discover tests inside vendor/hara-ui"
  );
  assert.match(await read("scripts/build-site.mjs"), /vendor\/hara-ui\/packages/);
});
