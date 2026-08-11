function clamp(minimum, maximum, value) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function graphPoints(history) {
  if (!history.length) return "";
  const width = 360;
  const height = 86;
  const denominator = Math.max(1, history.length - 1);
  return history.map((point, index) => {
    const x = (index / denominator) * width;
    const y = height - (clamp(0, 100, point.level) / 100) * height;
    return `${round(x, 1)},${round(y, 1)}`;
  }).join(" ");
}

function renderEvent(event) {
  const marker = event.kind === "activation-rejected" ? "!" : event.kind === "activation-installed" ? "↻" : "·";
  return `<li><span>${marker}</span><strong>tick ${event.tick}</strong><em>${escapeHtml(event.message)}</em></li>`;
}

export function renderTankActiveLoop(snapshot) {
  if (!snapshot) return "";
  const level = clamp(0, 100, finiteNumber(snapshot.world?.level, 0));
  const target = clamp(0, 100, finiteNumber(snapshot.world?.target, 0));
  const pump = clamp(0, 1, finiteNumber(snapshot.world?.pump, 0));
  const version = snapshot.version || 0;
  const activeLabel = version ? `controller v${version}` : "no controller installed";
  const stateLabel = snapshot.paused ? "paused with state retained" : "runtime-owned loop active";
  const error = snapshot.lastError
    ? `<div class="activation-error"><strong>Replacement rejected.</strong><span>${escapeHtml(snapshot.lastError)}</span><small>Controller v${version} remains active.</small></div>`
    : "";
  const events = (snapshot.events || []).slice(-5).reverse().map(renderEvent).join("");
  const points = graphPoints(snapshot.history || []);

  return `<main class="living-tank">
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: #ece8dc; color: #163128; }
      .living-tank { min-height: 100vh; padding: clamp(24px, 5vw, 58px); background: radial-gradient(circle at 88% 5%, rgba(20, 118, 88, .15), transparent 32%), #ece8dc; }
      .tank-grid { width: min(940px, 100%); margin: 0 auto; display: grid; grid-template-columns: minmax(280px, .88fr) minmax(300px, 1.12fr); gap: 28px; align-items: stretch; }
      .surface { border: 1px solid rgba(22, 49, 40, .15); border-radius: 24px; background: rgba(255, 253, 247, .9); box-shadow: 0 22px 70px rgba(22, 49, 40, .10); }
      .tank-card { padding: 30px; display: grid; align-content: space-between; gap: 28px; }
      .eyebrow { margin: 0 0 8px; color: #0c7455; font-size: 11px; font-weight: 850; letter-spacing: .15em; }
      h1 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: clamp(38px, 6vw, 62px); font-weight: 500; letter-spacing: -.045em; line-height: .95; }
      .tank { position: relative; width: min(270px, 80vw); height: 310px; margin: 4px auto; overflow: hidden; border: 10px solid #274d41; border-top-width: 5px; border-radius: 22px 22px 42px 42px; background: #faf8f1; box-shadow: inset 0 0 0 2px rgba(255,255,255,.75), 0 18px 40px rgba(26,65,52,.14); }
      .water { position: absolute; inset: auto 0 0; height: ${level}%; background: linear-gradient(180deg, #6bc3bd, #237f78); transition: height 110ms linear; }
      .water::before { content: ""; position: absolute; inset: -8px -20px auto; height: 18px; border-radius: 50%; background: rgba(164, 230, 218, .82); }
      .target { position: absolute; z-index: 2; left: 0; right: 0; bottom: ${target}%; border-top: 2px dashed rgba(179, 113, 31, .9); }
      .target span { position: absolute; right: 9px; top: -22px; padding: 2px 7px; border-radius: 999px; background: #fffaf0; color: #9a5a17; font-size: 10px; font-weight: 800; letter-spacing: .08em; }
      .pump { position: absolute; z-index: 3; top: 13px; left: 13px; display: flex; align-items: center; gap: 7px; padding: 7px 10px; border-radius: 999px; background: rgba(255,255,255,.82); color: #244d40; font-size: 11px; font-weight: 800; backdrop-filter: blur(8px); }
      .pump i { width: 8px; height: 8px; border-radius: 50%; background: ${pump > .02 ? "#13a26f" : "#9ca9a2"}; box-shadow: 0 0 0 5px rgba(19, 162, 111, ${pump > .02 ? ".13" : "0"}); }
      .measurement { display: flex; align-items: end; justify-content: space-between; gap: 16px; }
      .measurement strong { font-size: 42px; letter-spacing: -.055em; }
      .measurement span { padding-bottom: 6px; color: #607168; font-size: 13px; text-align: right; }
      .runtime-card { padding: 30px; display: grid; gap: 22px; }
      .runtime-head { display: flex; align-items: start; justify-content: space-between; gap: 18px; }
      .runtime-head h2 { margin: 5px 0 0; font-family: Georgia, "Times New Roman", serif; font-size: 30px; font-weight: 500; }
      .runtime-pill { display: inline-flex; align-items: center; gap: 8px; padding: 8px 11px; border: 1px solid rgba(17, 121, 84, .18); border-radius: 999px; background: rgba(17, 121, 84, .08); color: #0b6f4e; font-size: 11px; font-weight: 850; white-space: nowrap; }
      .runtime-pill i { width: 7px; height: 7px; border-radius: 50%; background: ${snapshot.paused ? "#d39334" : "#13a26f"}; }
      .proof-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .proof-grid div { min-height: 90px; padding: 15px; border: 1px solid rgba(22,49,40,.11); border-radius: 15px; background: #f7f4eb; }
      .proof-grid span { display: block; margin-bottom: 10px; color: #708078; font-size: 10px; font-weight: 800; letter-spacing: .1em; }
      .proof-grid strong { display: block; font-size: 18px; letter-spacing: -.025em; }
      .graph { position: relative; height: 120px; padding: 17px 16px; border: 1px solid rgba(22,49,40,.11); border-radius: 16px; background: linear-gradient(to bottom, rgba(22,49,40,.04) 1px, transparent 1px) 0 0/100% 25%; }
      .graph svg { width: 100%; height: 86px; overflow: visible; }
      .graph polyline { fill: none; stroke: #167b68; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
      .graph .target-line { stroke: #b16d1f; stroke-width: 1.5; stroke-dasharray: 5 5; opacity: .7; }
      .events { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
      .events li { display: grid; grid-template-columns: 24px 62px 1fr; gap: 8px; align-items: center; color: #52665d; font-size: 12px; }
      .events li span { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #e7eee9; color: #0e7454; font-weight: 900; }
      .events li strong { color: #395348; font-size: 11px; }
      .events li em { overflow: hidden; text-overflow: ellipsis; font-style: normal; white-space: nowrap; }
      .activation-error { display: grid; gap: 5px; padding: 14px 16px; border: 1px solid rgba(171,67,46,.2); border-radius: 14px; background: #fff0e9; color: #873723; }
      .activation-error span { overflow: hidden; text-overflow: ellipsis; font-size: 12px; white-space: nowrap; }
      .activation-error small { color: #a3543e; }
      .footnote { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 15px 19px; color: #55685f; font-size: 12px; }
      .footnote strong { color: #244a3d; }
      @media (max-width: 760px) { .tank-grid { grid-template-columns: 1fr; } .proof-grid { grid-template-columns: 1fr 1fr; } .footnote { grid-column: auto; flex-direction: column; align-items: flex-start; } }
    </style>
    <div class="tank-grid">
      <section class="tank-card surface">
        <header><p class="eyebrow">THE LIVING TANK</p><h1>Activity before application.</h1></header>
        <div class="tank" aria-label="Tank level ${round(level, 1)} percent">
          <div class="water"></div>
          <div class="target"><span>TARGET ${round(target, 1)}</span></div>
          <div class="pump"><i></i>PUMP ${Math.round(pump * 100)}%</div>
        </div>
        <div class="measurement"><strong>${round(level, 1)}%</strong><span>world state<br>owned by the worker</span></div>
      </section>
      <section class="runtime-card surface">
        <header class="runtime-head"><div><p class="eyebrow">RESIDENT HARA RUNTIME</p><h2>${escapeHtml(activeLabel)}</h2></div><span class="runtime-pill"><i></i>${escapeHtml(stateLabel)}</span></header>
        ${error}
        <div class="proof-grid">
          <div><span>LOOP IDENTITY</span><strong>${escapeHtml(snapshot.id)}</strong></div>
          <div><span>MONOTONIC TICK</span><strong>${snapshot.tick}</strong></div>
          <div><span>CODE ATTEMPT</span><strong>${snapshot.attempt || 0}</strong></div>
          <div><span>ACTIVE VERSION</span><strong>v${version}</strong></div>
          <div><span>INSTALLED AT</span><strong>${snapshot.installedAtTick == null ? "—" : `tick ${snapshot.installedAtTick}`}</strong></div>
          <div><span>STATE POLICY</span><strong>retain</strong></div>
        </div>
        <div class="graph" aria-label="Recent tank level history"><svg viewBox="0 0 360 86" preserveAspectRatio="none"><line class="target-line" x1="0" x2="360" y1="${round(86 - target * .86, 1)}" y2="${round(86 - target * .86, 1)}"></line><polyline points="${points}"></polyline></svg></div>
        <ul class="events">${events || '<li><span>·</span><strong>tick 0</strong><em>The runtime created the loop before a controller existed.</em></li>'}</ul>
      </section>
      <footer class="footnote surface"><span><strong>No external build step:</strong> source is staged, evaluated, validated and installed inside the running worker.</span><span>Bad replacements leave the accepted controller and world state untouched.</span></footer>
    </div>
  </main>`;
}
