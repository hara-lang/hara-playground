const CAPABILITY = /^[A-Za-z][A-Za-z0-9_.-]*\/[A-Za-z][A-Za-z0-9_.?*-]*$/;
const KEYWORD_CHARACTER = /[A-Za-z0-9_.?*+!\/-]/;
const CLOSING = Object.freeze({ "{": "}", "[": "]", "(": ")", "#{": "}" });

export const AUDIO_PLAYBACK_CAPABILITY = "audio/playback";

/**
 * Adds one project capability while preserving the rest of project.edn byte for
 * byte. This is intentionally a narrow structural editor, not a general EDN
 * formatter or parser.
 */
export function addProjectCapability(source, capability = AUDIO_PLAYBACK_CAPABILITY) {
  const input = String(source ?? "");
  const normalizedCapability = normalizeCapability(capability);
  const document = scanProjectDescriptor(input);
  requireCanonicalProject(document);

  const capabilityKey = document.keywords.find((token) =>
    token.depth === 1 && token.value === "project/capabilities");

  if (!capabilityKey) {
    const insertion = insertCapabilityEntry(input, document, normalizedCapability);
    return Object.freeze({
      source: insertion,
      changed: insertion !== input,
      capability: normalizedCapability,
      capabilities: Object.freeze(["studio/eval", normalizedCapability])
    });
  }

  const collection = capabilityCollectionAfter(input, document, capabilityKey);
  const capabilities = directKeywords(document, collection)
    .map((token) => token.value);
  if (capabilities.includes(normalizedCapability)) {
    return Object.freeze({
      source: input,
      changed: false,
      capability: normalizedCapability,
      capabilities: Object.freeze([...new Set(capabilities)])
    });
  }

  const insertion = insertIntoCapabilityCollection(
    input,
    collection,
    directKeywords(document, collection),
    normalizedCapability
  );
  return Object.freeze({
    source: insertion,
    changed: true,
    capability: normalizedCapability,
    capabilities: Object.freeze([...new Set([...capabilities, normalizedCapability])])
  });
}

export function projectRequestsCapability(source, capability = AUDIO_PLAYBACK_CAPABILITY) {
  try {
    const normalizedCapability = normalizeCapability(capability);
    const document = scanProjectDescriptor(String(source ?? ""));
    requireCanonicalProject(document);
    const capabilityKey = document.keywords.find((token) =>
      token.depth === 1 && token.value === "project/capabilities");
    if (!capabilityKey) return false;
    const collection = capabilityCollectionAfter(String(source), document, capabilityKey);
    return directKeywords(document, collection)
      .some((token) => token.value === normalizedCapability);
  } catch {
    return false;
  }
}

function normalizeCapability(value) {
  const capability = String(value ?? "").trim().replace(/^:/, "");
  if (!CAPABILITY.test(capability)) {
    throw new Error(`project/capability-invalid:${capability || "missing"}`);
  }
  return capability;
}

function requireCanonicalProject(document) {
  const type = document.keywords.findIndex((token) =>
    token.depth === 1 && token.value === "hara/type");
  if (type < 0 || document.keywords[type + 1]?.depth !== 1
      || document.keywords[type + 1]?.value !== "project") {
    throw new Error("project/canonical-descriptor-required");
  }
}

function capabilityCollectionAfter(source, document, key) {
  const start = skipTrivia(source, key.end);
  const open = source.startsWith("#{", start) ? "#{"
    : source[start] === "[" ? "[" : null;
  if (!open) throw new Error("project/capabilities-collection-required");
  const collection = document.collections.get(start);
  if (!collection || collection.open !== open) {
    throw new Error("project/capabilities-collection-unbalanced");
  }
  return collection;
}

function directKeywords(document, collection) {
  return document.keywords.filter((token) =>
    token.depth === collection.depth + 1 && token.parent === collection.start);
}

function insertIntoCapabilityCollection(source, collection, keywords, capability) {
  const bodyStart = collection.start + collection.open.length;
  const body = source.slice(bodyStart, collection.end);
  if (!body.trim()) {
    return splice(source, collection.end, `:${capability}`);
  }
  if (!body.includes("\n")) {
    return splice(source, collection.end, ` :${capability}`);
  }

  const indent = keywords.length
    ? columnIndent(source, keywords.at(-1).start)
    : `${lineIndent(source, collection.start)}  `;
  const closingLine = lineStart(source, collection.end);
  const closeIsAlone = source.slice(closingLine, collection.end).trim() === "";
  if (closeIsAlone) {
    return splice(source, closingLine, `${indent}:${capability}\n`);
  }
  return splice(source, collection.end, `\n${indent}:${capability}`);
}

function insertCapabilityEntry(source, document, capability) {
  const root = document.root;
  const body = source.slice(root.start + 1, root.end);
  if (!body.includes("\n")) {
    const separator = body.trim() ? " " : "";
    return splice(
      source,
      root.end,
      `${separator}:project/capabilities #{:studio/eval :${capability}}`
    );
  }

  const firstRootKeyword = document.keywords.find((token) => token.depth === 1);
  const keyIndent = firstRootKeyword
    ? columnIndent(source, firstRootKeyword.start)
    : `${lineIndent(source, root.start)} `;
  const valueIndent = keyIndent;
  const memberIndent = `${keyIndent}  `;
  const entry = [
    `${keyIndent}:project/capabilities`,
    `${valueIndent}#{:studio/eval`,
    `${memberIndent}:${capability}}`
  ].join("\n");
  const closingLine = lineStart(source, root.end);
  const closeIsAlone = source.slice(closingLine, root.end).trim() === "";
  if (closeIsAlone) return splice(source, closingLine, `${entry}\n`);
  return splice(source, root.end, `\n${entry}`);
}

function scanProjectDescriptor(source) {
  const stack = [];
  const collections = new Map();
  const keywords = [];
  let root = null;

  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (character === ";") {
      index = skipComment(source, index);
      continue;
    }
    if (character === '"') {
      index = skipString(source, index);
      continue;
    }

    const open = source.startsWith("#{", index) ? "#{"
      : CLOSING[character] ? character : null;
    if (open) {
      const collection = {
        open,
        close: CLOSING[open],
        start: index,
        end: null,
        depth: stack.length,
        parent: stack.at(-1)?.start ?? null
      };
      if (stack.length === 0) {
        if (open !== "{" || root) throw new Error("project/top-level-map-required");
        root = collection;
      }
      stack.push(collection);
      collections.set(index, collection);
      index += open.length;
      continue;
    }

    if (character === "}" || character === "]" || character === ")") {
      const collection = stack.pop();
      if (!collection || collection.close !== character) {
        throw new Error(`project/descriptor-unbalanced:${index}`);
      }
      collection.end = index;
      index += 1;
      continue;
    }

    if (character === ":") {
      const start = index;
      index += 1;
      while (index < source.length && KEYWORD_CHARACTER.test(source[index])) index += 1;
      if (index > start + 1) {
        keywords.push({
          value: source.slice(start + 1, index),
          start,
          end: index,
          depth: stack.length,
          parent: stack.at(-1)?.start ?? null
        });
      }
      continue;
    }
    index += 1;
  }

  if (stack.length) throw new Error("project/descriptor-unbalanced:eof");
  if (!root || root.end == null) throw new Error("project/top-level-map-required");
  const before = source.slice(0, root.start);
  const after = source.slice(root.end + 1);
  if (!triviaOnly(before) || !triviaOnly(after)) {
    throw new Error("project/single-top-level-map-required");
  }
  return { root, collections, keywords };
}

function skipTrivia(source, offset) {
  let index = offset;
  while (index < source.length) {
    if (/\s|,/.test(source[index])) {
      index += 1;
      continue;
    }
    if (source[index] === ";") {
      index = skipComment(source, index);
      continue;
    }
    break;
  }
  return index;
}

function triviaOnly(source) {
  return skipTrivia(source, 0) === source.length;
}

function skipComment(source, offset) {
  const newline = source.indexOf("\n", offset);
  return newline < 0 ? source.length : newline + 1;
}

function skipString(source, offset) {
  let index = offset + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === '"') return index + 1;
    index += 1;
  }
  throw new Error("project/descriptor-string-unclosed");
}

function lineStart(source, offset) {
  return source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
}

function lineIndent(source, offset) {
  const start = lineStart(source, offset);
  return source.slice(start, offset).match(/^\s*/)?.[0] ?? "";
}

function columnIndent(source, offset) {
  return " ".repeat(offset - lineStart(source, offset));
}

function splice(source, offset, insertion) {
  return `${source.slice(0, offset)}${insertion}${source.slice(offset)}`;
}
