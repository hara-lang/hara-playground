import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

const shaPattern = /^[0-9a-f]{40}$/;

export function gitBlobSha(content) {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

export function fail(label, message) {
  throw new Error(`${label}: ${message}`);
}

export function assertString(label, value) {
  if (typeof value !== "string" || value.length === 0) fail(label, "must be a non-empty string");
  return value;
}

export function assertSha(label, value) {
  if (!shaPattern.test(value)) fail(label, "must be a lowercase 40-character Git blob SHA");
  return value;
}

export function assertRelativePath(label, value) {
  assertString(label, value);
  if (value.startsWith("/") || value.split(/[\\/]/).includes("..")) {
    fail(label, "must be a safe repository-relative path");
  }
  return value;
}

export function pathInside(root, relative, label) {
  assertRelativePath(label, relative);
  const canonicalRoot = resolve(root);
  const absolute = resolve(canonicalRoot, relative);
  if (absolute !== canonicalRoot && !absolute.startsWith(`${canonicalRoot}${sep}`)) {
    fail(label, "escapes the repository root");
  }
  return absolute;
}

export async function regularFile(path, label) {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) fail(label, "does not exist as a regular file");
}

export function nodeType(label, value, type) {
  if (!value || value.type !== type) fail(label, `must be a ${type}`);
  return value;
}

export function keywordName(label, value) {
  return nodeType(label, value, "keyword").name;
}

export function symbolName(label, value) {
  return nodeType(label, value, "symbol").name;
}

export function stringValue(label, value) {
  if (typeof value !== "string") fail(label, "must be a string");
  return value;
}

export function keywordMap(label, value) {
  const source = nodeType(label, value, "map");
  const output = new Map();
  for (const [key, entry] of source.entries) {
    const name = keywordName(`${label} key`, key);
    if (output.has(name)) fail(label, `contains duplicate key :${name}`);
    output.set(name, entry);
  }
  return output;
}

export function stringVector(label, value) {
  const source = nodeType(label, value, "vector");
  return source.items.map((entry, index) => assertRelativePath(`${label}[${index}]`, stringValue(`${label}[${index}]`, entry)));
}

export function keywordSet(label, value) {
  const source = nodeType(label, value, "set");
  const names = source.items.map((entry, index) => keywordName(`${label}[${index}]`, entry));
  if (new Set(names).size !== names.length) fail(label, "must not contain duplicate capabilities");
  return names.sort();
}

export function equalStrings(label, left, right) {
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) {
    fail(label, `expected ${JSON.stringify(right)}, received ${JSON.stringify(left)}`);
  }
}

export async function readVerifiedFile(root, relative, expectedSha, label) {
  const path = pathInside(root, relative, label);
  await regularFile(path, label);
  const content = await readFile(path, "utf8");
  const actualSha = gitBlobSha(content);
  if (actualSha !== expectedSha) fail(label, `Git blob mismatch; expected ${expectedSha}, received ${actualSha}`);
  return content;
}
