/**
 * Add desktop menu-bar behavior to a `.hara-menu-bar` element.
 * An open menu remains open while its items are hovered. Moving to a different
 * top-level menu switches the open disclosure; Escape and outside clicks close
 * all disclosures.
 */
export function bindMenuBar(menuBar) {
  const menus = [...menuBar.querySelectorAll(":scope > .hara-menu")];
  const closeAll = (except) => menus.forEach((menu) => { if (menu !== except) menu.open = false; });

  menus.forEach((menu) => {
    const summary = menu.querySelector("summary");
    menu.addEventListener("toggle", () => { if (menu.open) closeAll(menu); });
    summary.addEventListener("pointerenter", () => {
      if (menus.some((candidate) => candidate.open && candidate !== menu)) {
        closeAll(menu);
        menu.open = true;
      }
    });
  });

  document.addEventListener("pointerdown", (event) => {
    if (!menuBar.contains(event.target)) closeAll();
  });
  menuBar.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const active = menus.find((menu) => menu.open);
      closeAll();
      active?.querySelector("summary")?.focus();
    }
  });

  return { close: () => closeAll() };
}
