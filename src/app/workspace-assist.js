import { state } from "./context.js";

function resultText() {
  if (!state.instarepl.enabled) return "Live evaluation is off.";
  if (!state.instarepl.candidate) return "Place the cursor in a complete form.";
  if (state.instarepl.status === "ok") return state.instarepl.display || "Evaluation complete.";
  if (state.instarepl.status === "error") return state.instarepl.error || "Evaluation failed.";
  if (state.instarepl.status === "evaluating") return "evaluating…";
  return "queued…";
}

function ensurePanel() {
  const editorPanel = globalThis.document?.querySelector(".editor-panel");
  if (!editorPanel) return null;
  let panel = editorPanel.querySelector(".mobile-instarepl");
  if (panel) return panel;

  panel = editorPanel.ownerDocument.createElement("aside");
  panel.className = "mobile-instarepl";
  panel.innerHTML = `
    <button class="mobile-instarepl-button" type="button" aria-expanded="false">
      <span><strong>InstaREPL</strong><small class="mobile-instarepl-summary">Ready</small></span><i>⌃</i>
    </button>
    <div class="mobile-instarepl-body"><code></code></div>`;
  panel.querySelector(".mobile-instarepl-button")?.addEventListener("click", () => {
    const expanded = !panel.classList.contains("expanded");
    panel.classList.toggle("expanded", expanded);
    panel.querySelector(".mobile-instarepl-button")?.setAttribute("aria-expanded", String(expanded));
  });
  editorPanel.append(panel);
  return panel;
}

export function syncWorkspaceAssist() {
  const panel = ensurePanel();
  if (!panel) return false;
  const summary = panel.querySelector(".mobile-instarepl-summary");
  const code = panel.querySelector("code");
  if (summary) {
    summary.textContent = state.instarepl.candidate
      ? `${state.instarepl.status} · line ${state.instarepl.candidate.endLine}`
      : state.instarepl.enabled ? "Ready" : "Off";
  }
  if (code) code.textContent = resultText();
  panel.classList.toggle("error", state.instarepl.status === "error");
  panel.classList.toggle("ok", state.instarepl.status === "ok");
  return true;
}

export function mountWorkspaceAssist() {
  return syncWorkspaceAssist();
}
