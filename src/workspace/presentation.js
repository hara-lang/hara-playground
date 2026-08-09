import { detectProjectConfiguration, isHaraSource } from "./project.js";

const PREVIEW_CAPABILITIES = new Set([
  "preview/hta",
  "studio/preview",
  "visual/output",
  "canvas/2d",
  "ui/hta",
  "web/preview",
]);

const AUDIO_CAPABILITY = "audio/playback";

const looksLikeHtaOutput = (source) =>
  /(?:^|[\s(])\[:(?:main|article|section|div|header|footer|nav|aside|span|h[1-6]|p|svg|canvas)\b/m.test(source);

const looksLikeCanvasOutput = (source) =>
  /(?:draw\/render|studio\.draw|:canvas-2d|canvas\/2d)/.test(source);

export function projectPresentation(files = []) {
  const project = detectProjectConfiguration(files);
  const capabilities = new Set(project.capabilities || []);
  const sources = (files || [])
    .filter((file) => file && isHaraSource(file.path) && typeof file.content === "string")
    .map((file) => file.content);

  const preview = [...capabilities].some((capability) => PREVIEW_CAPABILITIES.has(capability))
    || sources.some((source) => looksLikeHtaOutput(source) || looksLikeCanvasOutput(source));
  const audio = capabilities.has(AUDIO_CAPABILITY);

  return Object.freeze({
    preview,
    audio,
    learn: false,
    defaultOutput: audio ? "audio" : preview ? "preview" : "repl",
    capabilities: Object.freeze([...capabilities]),
  });
}

export function outputSurfaceAvailable(presentation, surface) {
  if (surface === "preview") return Boolean(presentation?.preview);
  if (surface === "audio") return Boolean(presentation?.audio);
  if (surface === "learn") return Boolean(presentation?.learn);
  return true;
}
