export const AUDIO_OBSERVER_OPTIONS = Object.freeze({
  childList: true,
  subtree: false
});

/**
 * Audio only needs to observe replacement of the application shell itself.
 * Playground renders the shell by replacing #app children; runtime/audio state
 * changes call the audio reconciler directly. Observing the full subtree would
 * also see Preview, REPL, editor and Hodos component writes and schedule an
 * unnecessary reconciliation microtask for each of them.
 */

/**
 * Run one synchronous Audio-output reconciliation without observing the DOM
 * writes performed by that reconciliation. This also keeps the helper safe if
 * a host later chooses a broader observation target.
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
