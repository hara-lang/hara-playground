function createEditorOptions(document, actions) {
  const details = document.createElement("details");
  details.className = "editor-options";

  const summary = document.createElement("summary");
  summary.textContent = "Editor";
  summary.setAttribute("aria-label", "Editor options");

  const menu = document.createElement("div");
  menu.className = "editor-options-menu";
  menu.setAttribute("role", "group");
  menu.setAttribute("aria-label", "Editor options");

  for (const id of ["rainbow-toggle", "paredit-toggle", "instarepl-toggle"]) {
    const control = document.getElementById(id);
    if (control) menu.append(control);
  }

  const hint = document.createElement("small");
  hint.textContent = "Ctrl/⌘+Space completes · structural commands remain available from the keyboard.";
  menu.append(hint);
  details.append(summary, menu);
  actions.prepend(details);
  return details;
}

export function applyStudioChrome() {
  const document = globalThis.document;
  if (!document) return false;
  const editor = document.querySelector(".editor-panel");
  if (!editor) return false;

  const actions = editor.querySelector(".editor-actions");
  if (actions && !actions.querySelector(".editor-options")) {
    createEditorOptions(document, actions);
  }

  editor.querySelector(".lisp-toolbar")?.remove();
  editor.querySelector(".toolset-strip")?.remove();
  document.querySelector(".catalog-activity-slot")?.remove();
  return true;
}

export function syncPublicLobby() {
  const document = globalThis.document;
  const navigation = document?.querySelector(".lobby-nav");
  if (!navigation) return false;

  const themeButton = navigation.querySelector("#home-theme-button");
  const links = [
    ["https://www.hara-lang.org/", "Hara"],
    ["https://www.hara-lang.org/benchmarks/", "Benchmarks"],
    ["https://www.hara-lang.org/docs/start/orientation/", "Docs"],
    ["https://specs.hara-lang.org/", "Specs"],
  ];

  navigation.querySelectorAll("a").forEach((link) => link.remove());
  for (const [href, label] of links) {
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = label;
    navigation.insertBefore(link, themeButton || null);
  }
  return true;
}
