const allowedTags = new Set([
  "a", "article", "aside", "blockquote", "button", "code", "div", "em", "footer", "form", "h1", "h2", "h3", "h4",
  "header", "hr", "img", "input", "label", "li", "main", "nav", "ol", "p", "pre", "section", "small", "span", "strong",
  "table", "tbody", "td", "textarea", "th", "thead", "tr", "ul", "svg", "path", "circle", "rect", "line", "polyline", "polygon"
]);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderStyle(value) {
  if (!value || typeof value !== "object") return "";
  return Object.entries(value)
    .filter(([key]) => !key.toLowerCase().includes("expression"))
    .map(([key, item]) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${String(item)}`)
    .join(";");
}

function renderAttributes(attributes) {
  if (!attributes || Array.isArray(attributes) || typeof attributes !== "object") return "";
  const output = [];
  for (const [rawName, rawValue] of Object.entries(attributes)) {
    const name = rawName === "className" ? "class" : rawName;
    if (/^on/i.test(name) || name === "srcdoc" || rawValue === false || rawValue == null) continue;
    if (name === "style") {
      const style = renderStyle(rawValue);
      if (style) output.push(`style="${escapeHtml(style)}"`);
      continue;
    }
    if (!/^[a-zA-Z_:][\w:.-]*$/.test(name)) continue;
    if (rawValue === true) output.push(name);
    else output.push(`${name}="${escapeHtml(rawValue)}"`);
  }
  return output.length ? ` ${output.join(" ")}` : "";
}

export function renderHtaNode(node) {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") return escapeHtml(node);
  if (!Array.isArray(node)) return `<pre>${escapeHtml(JSON.stringify(node, null, 2))}</pre>`;
  if (node.length === 0) return "";

  const rawTag = String(node[0]).replace(/^:/, "");
  const tag = allowedTags.has(rawTag) ? rawTag : "div";
  const hasAttributes = node[1] && !Array.isArray(node[1]) && typeof node[1] === "object";
  const attributes = hasAttributes ? node[1] : null;
  const children = node.slice(hasAttributes ? 2 : 1).map(renderHtaNode).join("");
  const voidTags = new Set(["hr", "img", "input"]);
  if (voidTags.has(tag)) return `<${tag}${renderAttributes(attributes)}>`;
  return `<${tag}${renderAttributes(attributes)}>${children}</${tag}>`;
}

export function previewDocument(effect) {
  const body = effect?.type === "html" ? String(effect.html) : renderHtaNode(effect?.tree);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:;">
<style>
:root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: #f4f1e8; color: #152019; }
.preview-shell { min-height: 100vh; display: grid; place-items: center; padding: 42px; background: radial-gradient(circle at 80% 10%, rgba(16,185,129,.16), transparent 35%), #f4f1e8; }
.card { width: min(600px, 100%); padding: 42px; border: 1px solid rgba(21,32,25,.14); border-radius: 22px; background: rgba(255,255,255,.82); box-shadow: 0 24px 80px rgba(21,32,25,.11); backdrop-filter: blur(14px); }
.eyebrow { display: block; margin-bottom: 18px; color: #087a56; font-size: 11px; font-weight: 800; letter-spacing: .14em; }
h1 { margin: 0 0 14px; font-size: clamp(36px, 8vw, 62px); letter-spacing: -.055em; line-height: .96; }
p { color: #536159; font-size: 17px; line-height: 1.65; }
.status-row { display: flex; align-items: center; gap: 9px; margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(21,32,25,.10); color: #426052; font-size: 13px; }
.status-dot { width: 8px; height: 8px; border-radius: 999px; background: #10b981; box-shadow: 0 0 0 5px rgba(16,185,129,.13); }
pre { white-space: pre-wrap; padding: 24px; }
@media (prefers-color-scheme: dark) {
  body { background: #0d1310; color: #eef7f1; }
  .preview-shell { background: radial-gradient(circle at 80% 10%, rgba(16,185,129,.14), transparent 35%), #0d1310; }
  .card { background: rgba(21,31,26,.88); border-color: rgba(255,255,255,.1); box-shadow: 0 24px 80px rgba(0,0,0,.35); }
  p { color: #aabbb0; }
  .status-row { color: #9ab7a6; border-color: rgba(255,255,255,.08); }
}
</style>
</head>
<body>${body}</body>
</html>`;
}
