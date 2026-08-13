const ACTIVE_LOOP_KEY = ":playground/active-loop";
const ACTIVE_KINDS = new Set(["tank", "conveyor"]);

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

function requireRange(value, minimum, maximum, code, { integer = false } = {}) {
  if (!Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new Error(code);
  }
  return value;
}

function baseConfig(body) {
  const kind = keywordField(body, ":active/kind", "tank");
  if (!ACTIVE_KINDS.has(kind)) throw new Error(`active/project-kind-unsupported:${kind}`);
  const config = {
    id: stringField(body, ":active/id", kind === "conveyor" ? "conveyor/cell-a" : "tank/controller"),
    kind,
    path: stringField(body, ":active/path", "src/main.hal"),
    entry: symbolField(body, ":active/entry", kind === "conveyor" ? "route-package" : "controller"),
    rateHz: numberField(body, ":active/rate-hz", kind === "conveyor" ? 6 : 8),
    autoStart: booleanField(body, ":active/auto-start", true),
  };
  if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(config.id)) throw new Error(`active/project-id-invalid:${config.id}`);
  if (!/\.(?:hal|hara)$/i.test(config.path)) throw new Error(`active/project-path-invalid:${config.path}`);
  if (!/^[A-Za-z][A-Za-z0-9_.?*!+\-]*$/.test(config.entry)) throw new Error(`active/project-entry-invalid:${config.entry}`);
  requireRange(config.rateHz, 1, kind === "conveyor" ? 30 : 60, "active/project-rate-invalid");
  return config;
}

function tankConfig(body, base) {
  const config = {
    ...base,
    initialLevel: numberField(body, ":active/initial-level", 78),
    target: numberField(body, ":active/target", 68),
    leakRate: numberField(body, ":active/leak-rate", 1.6),
    fillRate: numberField(body, ":active/fill-rate", 10),
  };
  requireRange(config.initialLevel, 0, 100, "active/project-initial-level-invalid");
  requireRange(config.target, 0, 100, "active/project-target-invalid");
  requireRange(config.leakRate, 0, 100, "active/project-leak-rate-invalid");
  requireRange(config.fillRate, 0, 100, "active/project-fill-rate-invalid");
  return Object.freeze(config);
}

function conveyorConfig(body, base) {
  const sensorPosition = numberField(body, ":active/sensor-position", 44);
  const config = {
    ...base,
    initialPackages: numberField(body, ":active/initial-packages", 4),
    spawnEveryTicks: numberField(body, ":active/spawn-every-ticks", 8),
    beltSpeed: numberField(body, ":active/belt-speed", 4.5),
    sensorPosition,
    routePosition: numberField(body, ":active/route-position", Math.max(72, sensorPosition + 8)),
    maxPackages: numberField(body, ":active/max-packages", 16),
  };
  requireRange(config.initialPackages, 1, 8, "active/project-initial-packages-invalid", { integer: true });
  requireRange(config.spawnEveryTicks, 3, 40, "active/project-spawn-rate-invalid", { integer: true });
  requireRange(config.beltSpeed, 0.5, 12, "active/project-belt-speed-invalid");
  requireRange(config.sensorPosition, 20, 70, "active/project-sensor-position-invalid");
  requireRange(config.routePosition, config.sensorPosition + 8, 92, "active/project-route-position-invalid");
  requireRange(config.maxPackages, 4, 30, "active/project-max-packages-invalid", { integer: true });
  if (config.initialPackages > config.maxPackages) throw new Error("active/project-initial-packages-invalid");
  return Object.freeze(config);
}

/**
 * Reads the private Playground activity extension. The project descriptor stays
 * ordinary EDN; this bounded parser only decides which worker-owned activity to
 * create and which Hara behaviour may be installed into it.
 */
export function detectActiveLoopConfiguration(files) {
  const source = projectSource(files);
  if (!source) return null;
  const body = activeLoopMap(source);
  if (!body) return null;
  const base = baseConfig(body);
  return base.kind === "conveyor" ? conveyorConfig(body, base) : tankConfig(body, base);
}

export { ACTIVE_LOOP_KEY, ACTIVE_KINDS };
