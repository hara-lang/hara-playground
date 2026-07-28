/** Bind ARIA tabs without imposing a framework or persistence model. */
export function bindTabs(root) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    tabs.forEach((candidate) => {
      const selected = candidate === tab;
      candidate.setAttribute("aria-selected", String(selected));
      const panel = root.querySelector(`#${candidate.getAttribute("aria-controls")}`);
      if (panel) panel.hidden = !selected;
    });
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
      tabs[next].focus(); select(tabs[next]);
    });
  });
  return { select };
}

/** Emit a host-handled action for code ↔ visual buttons. */
export function bindCodeVisualActions(root) {
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-code-visual-action]");
    if (!button || !root.contains(button)) return;
    root.dispatchEvent(new CustomEvent("hara:code-visual-action", {
      bubbles: true,
      detail: { action: button.dataset.codeVisualAction, button }
    }));
  });
}
