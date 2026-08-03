#!/usr/bin/env node
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const source = process.argv[2] ? resolve(process.argv[2]) : null;
const destination = resolve(process.argv[3] || "runtime");
const required = [
  "rust/hara.wasm",
  "rust/hta.js",
  "rust/hta-worker.js",
  "rust/hta-shared-worker.js",
  "rust/host/broker.js",
  "rust/host/services.js"
];

if (!source) {
  console.error("usage: npm run runtime:install -- <extracted-hara-studio-runtime> [destination]");
  process.exit(2);
}

for (const path of required) {
  try {
    await access(join(source, path));
  } catch {
    throw new Error(`${basename(source)} is not a Hara Studio runtime archive: missing ${path}`);
  }
}

const readme = await readFile(join(destination, "README.md"), "utf8").catch(() => null);
await mkdir(destination, { recursive: true });
for (const directory of ["rust", "examples", "assets"]) {
  await rm(join(destination, directory), { recursive: true, force: true });
  await cp(join(source, directory), join(destination, directory), { recursive: true, force: true });
}
if (readme) await writeFile(join(destination, "README.md"), readme);

console.log(`Installed Hara Studio runtime from ${source}`);
console.log(`WASM: ${join(destination, "rust/hara.wasm")}`);
