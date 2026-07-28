import { bindTabs } from "./workspace.js";

const NS = "http://www.w3.org/2000/svg";
const CORE = {
  input: { label: "input", in: [], out: ["signal"] },
  transform: { label: "transform", in: ["signal"], out: ["signal"] },
  state: { label: "state", in: ["control"], out: ["state"] },
  event: { label: "event", in: [], out: ["event"] },
  output: { label: "output", in: ["signal", "event"], out: [] },
  comment: { label: "comment", in: [], out: [] }
};

export const coreFlowModel = () => ({
  nodes: [
    { id: "node/input", type: "input", x: 54, y: 95 },
    { id: "node/transform", type: "transform", x: 278, y: 142 },
    { id: "node/output", type: "output", x: 520, y: 208 }
  ],
  connections: [
    { id: "c/1", from: "node/input:out:0", to: "node/transform:in:0" },
    { id: "c/2", from: "node/transform:out:0", to: "node/output:in:0" }
  ]
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const portId = (node, direction, index) => `${node.id}:${direction}:${index}`;
const nodeById = (model, id) => model.nodes.find((node) => node.id === id);
const endpoint = (model, id) => {
  const [nodeId, direction, rawIndex] = id.split(":");
  const node = nodeById(model, nodeId);
  const index = Number(rawIndex);
  return node && { node, direction, index, type: CORE[node.type][direction][index] };
};
const compatible = (model, from, to) => {
  const a = endpoint(model, from), b = endpoint(model, to);
  return a && b && a.direction === "out" && b.direction === "in" && a.type === b.type;
};

/** Mount a dock-first DOM/SVG workbench over a small structured program model. */
export function createWorkbench(root, { model = coreFlowModel() } = {}) {
  const state = { model: clone(model), selected: null, armed: null, draft: null, dragNode: null, next: model.nodes.length + 1 };
  root.classList.add("hara-workbench");
  root.innerHTML = `<nav class="hara-activity-rail" aria-label="Workbench views"><button data-view="files" class="hara-icon-button" aria-pressed="true" title="Files">▤</button><button data-view="palette" class="hara-icon-button" title="Node palette">⊞</button><button data-view="search" class="hara-icon-button" title="Search">⌕</button></nav><aside class="hara-dock hara-dock-left"><header class="hara-dock-header"><b data-dock-title>FILES</b><button data-palette class="hara-icon-button" title="Add node" aria-label="Open node palette">＋</button></header><div class="hara-dock-body" data-left-dock></div></aside><main class="hara-workbench-main"><div class="hara-tabs" role="tablist"><button class="hara-tab" role="tab" aria-selected="true" aria-controls="workbench-canvas">patch</button><button class="hara-tab" role="tab" aria-selected="false" aria-controls="workbench-source">source</button></div><section id="workbench-canvas" class="hara-patch-canvas" role="tabpanel" data-canvas><svg class="hara-cable-layer" data-cables aria-hidden="true"></svg><div class="hara-node-layer" data-nodes></div><div class="hara-palette-popout" data-palette-popout hidden><input class="hara-input" data-palette-search placeholder="filter nodes" aria-label="Filter node palette"><div data-palette-list></div></div></section><section id="workbench-source" class="hara-source hara-workbench-source" role="tabpanel" hidden data-source></section></main><aside class="hara-dock hara-dock-right"><header class="hara-dock-header"><b>INSPECTOR</b><span class="hara-link-status" data-status data-state="current">READY</span></header><div class="hara-dock-body" data-inspector></div></aside>`;
  const $ = (s) => root.querySelector(s);
  bindTabs(root.querySelector(".hara-workbench-main"));
  const el = { left: $("[data-left-dock]"), canvas: $("[data-canvas]"), nodes: $("[data-nodes]"), cables: $("[data-cables]"), source: $("[data-source]"), inspector: $("[data-inspector]"), status: $("[data-status]"), palette: $("[data-palette-popout]"), paletteList: $("[data-palette-list]"), paletteSearch: $("[data-palette-search]") };
  const emit = (type, detail) => root.dispatchEvent(new CustomEvent(`hara:workbench-${type}`, { bubbles: true, detail }));
  const setStatus = (text, kind = "current") => { el.status.textContent = text; el.status.dataset.state = kind; };
  const sourceText = () => state.model.nodes.map((node) => `(${node.type} :id "${node.id}")`).join("\n") + (state.model.connections.length ? `\n\n;; ${state.model.connections.length} connection(s)` : "");
  const point = (id) => { const port = el.nodes.querySelector(`[data-port-id="${CSS.escape(id)}"]`); if (!port) return null; const a = port.getBoundingClientRect(), b = el.canvas.getBoundingClientRect(); return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 }; };
  const cable = (from, to, cls = "") => { const a = point(from), b = point(to); if (!a || !b) return; const path = document.createElementNS(NS, "path"); const dx = Math.max(42, Math.abs(b.x - a.x) / 2); path.setAttribute("d", `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`); path.setAttribute("class", `hara-cable ${cls}`); el.cables.append(path); };
  const select = (node) => { state.selected = node?.id || null; render(); emit("selection", { node }); };
  const renderPalette = () => { const query = el.paletteSearch.value.toLowerCase(); el.paletteList.replaceChildren(...Object.entries(CORE).filter(([id, spec]) => id.includes(query) || spec.label.includes(query)).map(([id, spec]) => { const b = document.createElement("button"); b.className = "hara-palette-item"; b.type = "button"; b.textContent = spec.label; b.addEventListener("click", () => { state.armed = id; el.palette.hidden = true; setStatus(`PLACE ${id.toUpperCase()}`); }); return b; })); };
  const render = () => {
    el.left.innerHTML = state.model.nodes.map((n) => `<button class="hara-tree-file ${n.id === state.selected ? "is-selected" : ""}" data-file-node="${n.id}"><i class="hara-file-dot"></i>${n.type}</button>`).join("");
    el.left.querySelectorAll("[data-file-node]").forEach((b) => b.addEventListener("click", () => select(nodeById(state.model, b.dataset.fileNode))));
    el.nodes.replaceChildren(); el.cables.replaceChildren();
    state.model.nodes.forEach((node) => { const spec = CORE[node.type]; const card = document.createElement("article"); card.className = `hara-patch-node${node.id === state.selected ? " is-selected" : ""}`; card.style.left = `${node.x}px`; card.style.top = `${node.y}px`; card.dataset.nodeId = node.id; card.innerHTML = `<header>${spec.label}<small>${node.id.split("/")[1]}</small></header><div class="hara-node-ports in"></div><div class="hara-node-ports out"></div>`; const add = (direction, types) => types.forEach((type, i) => { const p = document.createElement("button"); p.className = `hara-port ${direction} ${type}`; p.dataset.portId = portId(node, direction, i); p.dataset.portType = type; p.type = "button"; p.title = `${direction} ${type}`; p.setAttribute("aria-label", `${direction} ${type} port`); p.addEventListener("pointerdown", (event) => { if (direction !== "out") return; event.stopPropagation(); state.draft = { from: p.dataset.portId, x: event.clientX, y: event.clientY }; el.canvas.setPointerCapture?.(event.pointerId); }); card.querySelector(`.hara-node-ports.${direction}`).append(p); }); add("in", spec.in); add("out", spec.out); card.querySelector("header").addEventListener("pointerdown", (event) => { event.preventDefault(); const box = card.getBoundingClientRect(); state.dragNode = { id: node.id, offsetX: event.clientX - box.left, offsetY: event.clientY - box.top }; el.canvas.setPointerCapture?.(event.pointerId); select(node); }); card.addEventListener("click", (event) => { if (!event.target.closest(".hara-port")) select(node); }); el.nodes.append(card); });
    requestAnimationFrame(() => { state.model.connections.forEach((c) => cable(c.from, c.to)); if (state.draft) { const a = point(state.draft.from), b = { x: state.draft.x, y: state.draft.y }; if (a) { const path = document.createElementNS(NS, "path"); path.setAttribute("d", `M ${a.x} ${a.y} L ${b.x} ${b.y}`); path.setAttribute("class", "hara-cable provisional"); el.cables.append(path); } } });
    el.source.textContent = sourceText(); const selected = nodeById(state.model, state.selected); el.inspector.innerHTML = selected ? `<details class="hara-section" open><summary>${selected.type}</summary><div class="hara-section-body">${selected.id}<br>position ${selected.x}, ${selected.y}</div></details><details class="hara-section" open><summary>provenance</summary><div class="hara-section-body">structured program · source projection · patch graph</div></details>` : `<p class="hara-explorer-empty">Select a node to inspect it.</p>`;
  };
  const place = (event) => { if (!state.armed) return; const box = el.canvas.getBoundingClientRect(), type = state.armed; const node = { id: `node/${type}-${state.next++}`, type, x: Math.round(event.clientX - box.left - 70), y: Math.round(event.clientY - box.top - 28) }; state.model.nodes.push(node); state.armed = null; setStatus("MODEL // STALE", "stale"); select(node); emit("structural-edit", { kind: "create-node", node, model: clone(state.model) }); };
  root.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => { root.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b === button))); if (button.dataset.view === "palette") { el.palette.hidden = false; el.paletteSearch.focus(); } }));
  root.querySelector("[data-palette]").addEventListener("click", () => { el.palette.hidden = false; el.paletteSearch.focus(); }); el.paletteSearch.addEventListener("input", renderPalette);
  el.canvas.addEventListener("click", (event) => { if (event.target === el.canvas || event.target === el.nodes || event.target === el.cables) place(event); });
  el.canvas.addEventListener("pointermove", (event) => { const box = el.canvas.getBoundingClientRect(); if (state.dragNode) { const node = nodeById(state.model, state.dragNode.id); node.x = Math.max(8, Math.min(box.width - 153, Math.round(event.clientX - box.left - state.dragNode.offsetX))); node.y = Math.max(8, Math.min(box.height - 74, Math.round(event.clientY - box.top - state.dragNode.offsetY))); render(); } else if (state.draft) { state.draft.x = event.clientX - box.left; state.draft.y = event.clientY - box.top; render(); } });
  el.canvas.addEventListener("pointerup", (event) => { if (state.dragNode) { const node = nodeById(state.model, state.dragNode.id); state.dragNode = null; setStatus("LAYOUT // UPDATED"); emit("layout-change", { node, model: clone(state.model) }); render(); return; } if (!state.draft) return; const target = event.target.closest(".hara-port.in"); const from = state.draft.from; state.draft = null; if (target && compatible(state.model, from, target.dataset.portId)) { const connection = { id: `c/${state.model.connections.length + 1}`, from, to: target.dataset.portId }; state.model.connections.push(connection); setStatus("MODEL // STALE", "stale"); emit("structural-edit", { kind: "connect", connection, model: clone(state.model) }); } else if (target) { setStatus("INCOMPATIBLE PORTS", "error"); emit("rejected-edit", { kind: "connect", from, to: target.dataset.portId }); } render(); });
  el.canvas.addEventListener("pointercancel", () => { state.dragNode = null; state.draft = null; render(); });
  renderPalette(); render();
  return { model: () => clone(state.model), replaceModel: (next) => { state.model = clone(next); render(); }, select: (id) => select(nodeById(state.model, id)) };
}
