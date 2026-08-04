export const MOBILE_SURFACES = Object.freeze(["files", "code", "preview", "repl", "learn"]);

export const DEFAULT_DESKTOP_LAYOUT = Object.freeze({
  projectWidth: 226,
  outputWidth: 360
});

export function clamp(value, minimum, maximum) {
  const number = Number(value);
  return Math.max(minimum, Math.min(Number.isFinite(number) ? number : minimum, maximum));
}

export function normaliseMobileSurface(value, fallback = "code") {
  return MOBILE_SURFACES.includes(value) ? value : fallback;
}

export function normaliseDesktopLayout(layout = {}, availableWidth = 1280) {
  const width = Math.max(760, Number(availableWidth) || 1280);
  const dividerSpace = 16;
  const minimumEditorWidth = 420;
  const projectMaximum = Math.min(420, width - minimumEditorWidth - 280 - dividerSpace);
  const projectWidth = clamp(
    layout.projectWidth ?? DEFAULT_DESKTOP_LAYOUT.projectWidth,
    170,
    Math.max(170, projectMaximum)
  );
  const outputMaximum = Math.min(620, width - minimumEditorWidth - projectWidth - dividerSpace);
  const outputWidth = clamp(
    layout.outputWidth ?? DEFAULT_DESKTOP_LAYOUT.outputWidth,
    260,
    Math.max(260, outputMaximum)
  );
  return { projectWidth, outputWidth };
}

export function resizeDesktopLayout(layout, side, delta, availableWidth) {
  const current = normaliseDesktopLayout(layout, availableWidth);
  if (side === "project") {
    return normaliseDesktopLayout({ ...current, projectWidth: current.projectWidth + delta }, availableWidth);
  }
  if (side === "output") {
    return normaliseDesktopLayout({ ...current, outputWidth: current.outputWidth - delta }, availableWidth);
  }
  return current;
}
