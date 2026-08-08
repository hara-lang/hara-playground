export const SHOWCASE_PRESENTATION = "showcase";
export const SHOWCASE_PROTOCOL_VERSION = 1;
export const SHOWCASE_SELECT_SURFACE = "hara.showcase/select-surface";
export const SHOWCASE_READY = "hara.showcase/ready";
export const SHOWCASE_ERROR = "hara.showcase/error";
export const SHOWCASE_SELECTION = "hara.showcase/selection";

const SELECTOR_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._/-]{0,126}[A-Za-z0-9])?$/;
const MESSAGE_KEYS = new Set(["type", "version", "surfaceId"]);
const TRUSTED_PACKAGE_ORIGINS = new Set([
  "https://packages.hara-lang.org",
  "https://packages.testing.hara-lang.org",
]);

function plainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function normalizeShowcaseSelector(value, label = "showcase selector") {
  if (value == null || String(value).trim() === "") return null;
  const selector = String(value).trim().replace(/^:/, "");
  const segments = selector.split("/");
  if (
    !SELECTOR_PATTERN.test(selector)
    || selector.includes("//")
    || segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`${label} must be a bounded package selector`);
  }
  return selector;
}

export function showcasePresentationFromLocation(location) {
  const search = new URLSearchParams(location?.search || "");
  if (search.get("presentation") !== SHOWCASE_PRESENTATION) {
    return {
      mode: "studio",
      surfaceId: null,
      theme: null,
      error: "",
    };
  }

  try {
    const theme = search.get("theme");
    if (theme && theme !== "light" && theme !== "dark") {
      throw new Error("Showcase theme must be light or dark");
    }
    return {
      mode: SHOWCASE_PRESENTATION,
      surfaceId: normalizeShowcaseSelector(search.get("surface"), "Showcase surface"),
      theme: theme || null,
      error: "",
    };
  } catch (error) {
    return {
      mode: SHOWCASE_PRESENTATION,
      surfaceId: null,
      theme: null,
      error: error.message,
    };
  }
}

export function showcaseSurfaceSelectionFromMessage(value) {
  if (!plainRecord(value) || value.type !== SHOWCASE_SELECT_SURFACE) return null;
  if (Object.keys(value).some((key) => !MESSAGE_KEYS.has(key))) {
    throw new Error("Showcase surface messages may contain selectors only");
  }
  if (value.version !== SHOWCASE_PROTOCOL_VERSION) {
    throw new Error(`Unsupported Showcase protocol version: ${value.version}`);
  }
  const surfaceId = normalizeShowcaseSelector(value.surfaceId, "Showcase surface");
  if (!surfaceId) throw new Error("Showcase surface is required");
  return { surfaceId };
}

export function trustedShowcaseParentOrigin(origin, location = globalThis.location) {
  if (TRUSTED_PACKAGE_ORIGINS.has(origin)) return true;
  if (origin && origin === location?.origin) return true;
  try {
    const current = new URL(location?.href || `${location?.origin || "http://localhost"}/`);
    const candidate = new URL(origin);
    const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
    return localHosts.has(current.hostname)
      && localHosts.has(candidate.hostname)
      && candidate.protocol === current.protocol;
  } catch {
    return false;
  }
}

export function showcaseLocationFor(metadata, presentation, pathname = "/") {
  if (presentation?.mode !== SHOWCASE_PRESENTATION) return pathname || "/";
  if (!metadata?.owner || !metadata?.repository) return pathname || "/";

  const query = new URLSearchParams({
    repo: `${metadata.owner}/${metadata.repository}`,
    presentation: SHOWCASE_PRESENTATION,
  });
  if (metadata.branch) query.set("branch", metadata.branch);
  if (/^[0-9a-f]{40}$/.test(metadata.commit || "")) query.set("commit", metadata.commit);
  if (metadata.path) query.set("path", metadata.path);
  if (presentation.surfaceId) query.set("surface", presentation.surfaceId);
  if (presentation.theme) query.set("theme", presentation.theme);
  return `${pathname || "/"}?${query}`;
}

export function syncShowcaseLocation(metadata, presentation, {
  history = globalThis.history,
  location = globalThis.location,
} = {}) {
  if (presentation?.mode !== SHOWCASE_PRESENTATION || !history?.replaceState) return false;
  history.replaceState(
    {},
    "",
    showcaseLocationFor(metadata, presentation, location?.pathname || "/"),
  );
  return true;
}

function boundedText(value, maximum = 256) {
  return typeof value === "string" ? value.slice(0, maximum) : null;
}

export function showcaseReadyMessage({
  workspaceId,
  commit,
  surfaceId,
  surfaces = [],
} = {}) {
  const normalizedSurfaces = [];
  for (const value of surfaces) {
    const selector = normalizeShowcaseSelector(value, "Showcase surface");
    if (selector && !normalizedSurfaces.includes(selector)) normalizedSurfaces.push(selector);
  }
  return {
    type: SHOWCASE_READY,
    version: SHOWCASE_PROTOCOL_VERSION,
    workspaceId: boundedText(workspaceId),
    commit: /^[0-9a-f]{40}$/.test(commit || "") ? commit : null,
    surfaceId: normalizeShowcaseSelector(surfaceId, "Showcase surface"),
    surfaces: normalizedSurfaces,
  };
}

export function showcaseErrorMessage(message) {
  return {
    type: SHOWCASE_ERROR,
    version: SHOWCASE_PROTOCOL_VERSION,
    message: boundedText(message, 512) || "Showcase host error",
  };
}

export function showcaseSelectionMessage(surfaceId, {
  ok = true,
  message = "",
} = {}) {
  return {
    type: SHOWCASE_SELECTION,
    version: SHOWCASE_PROTOCOL_VERSION,
    ok: Boolean(ok),
    surfaceId: normalizeShowcaseSelector(surfaceId, "Showcase surface"),
    ...(message ? { message: boundedText(message, 512) } : {}),
  };
}
