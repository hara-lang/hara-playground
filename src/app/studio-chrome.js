const STUDIO_SECTION_STORAGE = "hara-playground-studio-section";

export const STUDIO_SECTIONS = Object.freeze([
  Object.freeze({ id: "nav", label: "Nav", panel: ".project-panel" }),
  Object.freeze({ id: "frontmatter", label: "Frontmatter", panel: ".studio-frontmatter-panel" }),
  Object.freeze({ id: "graphics", label: "Graphics", panel: ".output-panel" }),
  Object.freeze({ id: "code", label: "Code", panel: ".editor-panel" })
]);

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

const value = (document, selector, fallback = "—") =>
  document.querySelector(selector)?.textContent?.trim() || fallback;

function createFrontmatterPanel(document, grid) {
  const panel = document.createElement("section");
  panel.className = "studio-frontmatter-panel hara-surface";
  panel.setAttribute("aria-label", "Project frontmatter");
  const ribbon = [...document.querySelectorAll(".kernel-ribbon > span")]
    .map((item) => item.textContent?.trim())
    .filter(Boolean);
  const entries = [
    ["Source", value(document, ".project-identity strong")],
    ["Revision", value(document, ".project-identity small")],
    ["Workspace", value(document, ".project-path strong")],
    ["Project root", value(document, ".project-path span")],
    ["Kernel", ribbon[0] || "Kernel idle"],
    ["Runtime", ribbon[1] || "Browser"],
    ["Namespace", ribbon[2] || "user"],
    ["Files", ribbon[3] || "0 files"]
  ];
  panel.innerHTML = `
    <header class="studio-frontmatter-header">
      <div><small>Project context</small><h2>Frontmatter</h2></div>
      <p>Repository, runtime, namespace, and workspace facts remain visible without crowding the editor.</p>
    </header>
    <dl class="studio-frontmatter-grid">
      ${entries.map(([label, entryValue]) => `<div><dt>${label}</dt><dd>${entryValue}</dd></div>`).join("")}
    </dl>`;
  grid.insertBefore(panel, grid.querySelector(".editor-panel"));
  return panel;
}

function storedSection(document) {
  try {
    const requested = document.defaultView?.sessionStorage?.getItem(STUDIO_SECTION_STORAGE);
    if (STUDIO_SECTIONS.some(({ id }) => id === requested)) return requested;
  } catch (_) {
    // Storage is optional in sandboxed and private browsing contexts.
  }
  return "code";
}

function createSectionNavigation(document, shell, grid) {
  const navigation = document.createElement("nav");
  navigation.className = "studio-section-nav";
  navigation.setAttribute("role", "tablist");
  navigation.setAttribute("aria-label", "Studio sections");

  const frontmatter = createFrontmatterPanel(document, grid);
  const panels = new Map();
  for (const section of STUDIO_SECTIONS) {
    const panel = section.id === "frontmatter" ? frontmatter : grid.querySelector(section.panel);
    if (!panel) continue;
    panel.id = `studio-section-${section.id}`;
    panel.dataset.studioPanel = section.id;
    panel.setAttribute("role", "tabpanel");
    panels.set(section.id, panel);

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.studioSection = section.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", panel.id);
    button.textContent = section.label;
    navigation.append(button);
  }

  const buttons = () => [...navigation.querySelectorAll("[data-studio-section]")];
  const select = (id, { focus = false } = {}) => {
    if (!panels.has(id)) return false;
    shell.dataset.studioSection = id;
    for (const button of buttons()) {
      const active = button.dataset.studioSection === id;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    }
    for (const [panelId, panel] of panels) {
      const active = panelId === id;
      panel.hidden = !active;
      panel.setAttribute("aria-labelledby", navigation.querySelector(`[data-studio-section="${panelId}"]`)?.id || "");
    }
    if (id === "graphics") {
      document.querySelector('[data-output-tab="preview"]')?.click();
    }
    if (id === "code") {
      document.querySelector("#editor")?.focus({ preventScroll: true });
    }
    try { document.defaultView?.sessionStorage?.setItem(STUDIO_SECTION_STORAGE, id); } catch (_) {}
    shell.dispatchEvent(new CustomEvent("hara:studio-section-change", {
      bubbles: true,
      detail: { id }
    }));
    return true;
  };

  buttons().forEach((button, index) => {
    button.id = `studio-section-tab-${button.dataset.studioSection}`;
    button.addEventListener("click", () => select(button.dataset.studioSection));
    button.tabIndex = index === buttons().length - 1 ? 0 : -1;
  });

  navigation.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = buttons();
    if (!tabs.length) return;
    event.preventDefault();
    const current = Math.max(0, tabs.indexOf(document.activeElement));
    const next = event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    select(tabs[next].dataset.studioSection, { focus: true });
  });

  grid.before(navigation);
  select(storedSection(document));
  return { navigation, select };
}

export function applyStudioChrome() {
  const document = globalThis.document;
  if (!document) return false;
  const editor = document.querySelector(".editor-panel");
  const shell = document.querySelector(".playground-shell");
  const grid = document.querySelector(".workbench-grid");
  if (!editor || !shell || !grid) return false;

  const actions = editor.querySelector(".editor-actions");
  if (actions && !actions.querySelector(".editor-options")) {
    createEditorOptions(document, actions);
  }

  editor.querySelector(".lisp-toolbar")?.remove();
  editor.querySelector(".toolset-strip")?.remove();
  document.querySelector(".catalog-activity-slot")?.remove();
  if (!document.querySelector(".studio-section-nav")) {
    createSectionNavigation(document, shell, grid);
  }
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
