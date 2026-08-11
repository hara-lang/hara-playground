const ACTIVE_LOOP_KEY = ":playground/active-loop";

function sourceFiles(files) {
  if (Array.isArray(files)) return files;
  if (files instanceof Map) return [...files.entries()].map(([path, content]) => ({ path, content }));
  return [];
}

function projectSource(files) {
  const candidates = sourceFiles(files);
  return candidates.find((file) => file.path === "project.edn")?.content
    || candidates.find((file) => file.path === "hara.project.edn")?.content
    || "";
}

function balancedMap(source, start) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let comment = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (comment) {
      if (character === "\n") comment = false;
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === ";") {
      comment = true;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error("active/project-map-unclosed");
}

function activeLoopMap(source) {
  const key = source.indexOf(ACTIVE_LOOP_KEY);
  if (key < 0) return null;
  const start = source.indexOf("{", key + ACTIVE_LOOP_KEY.length);
  if (start < 0) throw new Error("active/project-map-required");
  return balancedMap(source, start);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stringField(source, key, fallback = null) {
  const match = source.match(new RegExp(`${escapeRegExp(key)}\\s+"((?:\\\\.|[^"\\\\])*)"`));
  if (!match) return fallback;
  return match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function keywordField(source, key, fallback = null) {
  return source.match(new RegExp(`${escapeRegExp(key)}\\s+:([A-Za-z][A-Za-z0-9_.?*!+\\/-]*)`))?.[1] || fallback;
}

function symbolField(source, key, fallback = null) {
  return source.match(new RegExp(`${escapeRegExp(key)}\\s+([A-Za-z][A-Za-z0-9_.?*!+\\/-]*)`))?.[1] || fallback;
}

function numberField(source, key, fallback) {
  const match = source.match(new RegExp(`${escapeRegExp(key)}\\s+(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+))`));
  if (!match) return fallback;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) throw new Error(`active/project-number-invalid:${key}`);
  return value;
}

function booleanField(source, key, fallback) {
  const match = source.match(new RegExp(`${escapeRegExp(key)}\\s+(true|false)`));
  return match ? match[1] === "true" : fallback;
}

function validate(config) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(config.id)) throw new Error(`active/project-id-invalid:${config.id}`);
  if (config.kind !== "tank") throw new Error(`active/project-kind-unsupported:${config.kind}`);
  if (!/\.(?:hal|hara)$/i.test(config.path)) throw new Error(`active/project-path-invalid:${config.path}`);
  if (!/^[A-Za-z][A-Za-z0-9_.?*!+\-]*$/.test(config.entry)) throw new Error(`active/project-entry-invalid:${config.entry}`);
  if (!Number.isFinite(config.rateHz) || config.rateHz < 1 || config.rateHz > 60) throw new Error("active/project-rate-invalid");
  return Object.freeze(config);
}

/**
 * Reads the small project extension used by the Living Tank proof. The project
 * descriptor remains ordinary EDN; this parser intentionally understands only
 * the fields needed to decide whether the Playground should create an active
 * runtime loop after the kernel boots.
 */
export function detectActiveLoopConfiguration(files) {
  const source = projectSource(files);
  if (!source) return null;
  const body = activeLoopMap(source);
  if (!body) return null;
  return validate({
    id: stringField(body, ":active/id", "tank/controller"),
    kind: keywordField(body, ":active/kind", "tank"),
    path: stringField(body, ":active/path", "src/main.hal"),
    entry: symbolField(body, ":active/entry", "controller"),
    rateHz: numberField(body, ":active/rate-hz", 8),
    initialLevel: numberField(body, ":active/initial-level", 78),
    target: numberField(body, ":active/target", 68),
    leakRate: numberField(body, ":active/leak-rate", 1.6),
    fillRate: numberField(body, ":active/fill-rate", 10),
    autoStart: booleanField(body, ":active/auto-start", true),
  });
}

export { ACTIVE_LOOP_KEY };
