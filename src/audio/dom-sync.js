export const AUDIO_OBSERVER_OPTIONS = Object.freeze({
  childList: true,
  subtree: true
});

/**
 * Run one synchronous Audio-output reconciliation without observing the DOM
 * writes performed by that reconciliation. Otherwise the Audio integration can
 * observe its own innerHTML/text updates and queue an unbounded microtask loop.
 */
export function reconcileWithoutObservation(
  observer,
  target,
  reconcile,
  options = AUDIO_OBSERVER_OPTIONS
) {
  if (!observer || !target || typeof reconcile !== "function") return undefined;
  observer.disconnect();
  try {
    return reconcile();
  } finally {
    observer.observe(target, options);
  }
}

/**
 * Element.textContent replaces child nodes. Avoid doing that when the visible
 * value is already correct, particularly inside a childList observer.
 */
export function setTextContentIfChanged(element, value) {
  if (!element) return false;
  const next = String(value ?? "");
  if (element.textContent === next) return false;
  element.textContent = next;
  return true;
}
