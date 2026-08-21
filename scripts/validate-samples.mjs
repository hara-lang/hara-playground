#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSampleCatalog } from "./sample-validation/catalog.mjs";

export { gitBlobSha } from "./sample-validation/common.mjs";
export { parseProjectManifest } from "./sample-validation/manifest.mjs";
export { validateSampleCatalog } from "./sample-validation/catalog.mjs";

async function main() {
  const report = await validateSampleCatalog();
  console.log(`validated ${report.samples.length} samples against runtime ${report.runtimeVersion} and specs ${report.authorityCommit}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
