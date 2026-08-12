function clamp(minimum, maximum, value) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function routeLabel(value) {
  const route = String(value || "awaiting").replace(/^:/, "");
  return route === "green" ? "green lane" : route === "reject" ? "reject lane" : route === "inspect" ? "inspection" : "awaiting policy";
}

function packageMarkup(item) {
  const position = clamp(2, 96, item.position);
  const route = String(item.route || "pending").replace(/^:/, "");
  const anomaly = item.anomaly ? " anomaly" : "";
  return `<span class="package route-${escapeHtml(route)}${anomaly}" style="left:${position}%" title="${escapeHtml(item.id)} · ${escapeHtml(routeLabel(route))}"><i></i><small>${escapeHtml(item.id.replace(/^PKG-/, ""))}</small></span>`;
}

function eventMarkup(event) {
  const marker = event.kind === "activation-rejected" ? "!"
    : event.kind === "activation-installed" ? "↻"
      : event.kind === "package-routed" ? "→"
        : event.kind === "sensor-anomaly-armed" ? "△"
          : "·";
  return `<li><span>${marker}</span><strong>tick ${event.tick}</strong><em>${escapeHtml(event.message)}</em></li>`;
}

function observationMarkup(observation) {
  if (!observation) {
    return '<div class="empty-state">The sensor is waiting for the next package.</div>';
  }
  return `<dl>
    <div><dt>Package</dt><dd>${escapeHtml(observation["package-id"])}</dd></div>
    <div><dt>Colour</dt><dd>${escapeHtml(observation.colour)}</dd></div>
    <div><dt>Weight</dt><dd>${escapeHtml(observation.weight)} kg</dd></div>
    <div><dt>Confidence</dt><dd>${Math.round(clamp(0, 1, observation.confidence) * 100)}%</dd></div>
    <div><dt>Sensor seq.</dt><dd>${escapeHtml(observation["sensor-sequence"])}</dd></div>
    <div><dt>Anomaly</dt><dd>${observation.anomaly ? "detected" : "none"}</dd></div>
  </dl>`;
}

export function renderConveyorActiveLoop(snapshot) {
  if (!snapshot) return "";
  const world = snapshot.world || {};
  const packages = Array.isArray(world.packages) ? world.packages : [];
  const counts = world.counts || {};
  const lastDecision = world.lastDecision || null;
  const version = Number(snapshot.version || 0);
  const behavior = version ? `routing policy v${version}` : "safe inspection default";
  const status = snapshot.paused ? "paused with twin state retained" : world.jammed ? "physical belt jammed" : "worker-owned cell active";
  const error = snapshot.lastError
    ? `<div class="activation-error"><strong>Replacement rejected.</strong><span>${escapeHtml(snapshot.lastError)}</span><small>${version ? `Policy v${version} continues routing packages.` : "The safe inspection default remains active."}</small></div>`
    : "";
  const events = (snapshot.events || []).slice(-6).reverse().map(eventMarkup).join("");
  const packageNodes = packages.map(packageMarkup).join("");
  const sensorPosition = clamp(12, 88, world.sensorPosition ?? 44);
  const routePosition = clamp(sensorPosition + 6, 94, world.routePosition ?? 72);
  const twinConfidence = world.lastObservation ? Math.round(clamp(0, 1, world.lastObservation.confidence) * 100) : 100;

  return `<main class="conveyor-twin">
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: #ebe7dc; color: #17322a; }
      .conveyor-twin { min-height: 100vh; padding: clamp(20px, 4.6vw, 54px); background: radial-gradient(circle at 90% 2%, rgba(18,118,89,.15), transparent 31%), #ebe7dc; }
      .shell { width: min(1100px, 100%); margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, .65fr); gap: 24px; }
      .surface { border: 1px solid rgba(23,50,42,.14); border-radius: 23px; background: rgba(255,253,247,.91); box-shadow: 0 22px 70px rgba(23,50,42,.09); }
      .cell { padding: clamp(22px, 3.4vw, 34px); display: grid; gap: 25px; }
      .eyebrow { margin: 0 0 8px; color: #0b7454; font-size: 10px; font-weight: 850; letter-spacing: .15em; }
      h1, h2 { font-family: Georgia, "Times New Roman", serif; font-weight: 500; letter-spacing: -.04em; }
      h1 { max-width: 760px; margin: 0; font-size: clamp(38px, 6vw, 66px); line-height: .94; }
      h2 { margin: 4px 0 0; font-size: 28px; }
      .cell-head { display: flex; justify-content: space-between; gap: 20px; align-items: start; }
      .runtime-pill { display: inline-flex; align-items: center; gap: 8px; padding: 8px 11px; border: 1px solid rgba(17,121,84,.18); border-radius: 999px; background: rgba(17,121,84,.08); color: #0b6f4e; font-size: 10px; font-weight: 850; white-space: nowrap; }
      .runtime-pill i { width: 7px; height: 7px; border-radius: 50%; background: ${snapshot.paused || world.jammed ? "#c98a2e" : "#13a26f"}; }
      .factory { position: relative; padding: 32px 24px 26px; border: 1px solid rgba(23,50,42,.12); border-radius: 20px; overflow: hidden; background: linear-gradient(180deg, #f7f3e8, #efe9da); }
      .factory::before { content: "CELL A · PHYSICAL-STYLE SIMULATION"; position: absolute; top: 12px; left: 17px; color: #74847c; font-size: 9px; font-weight: 850; letter-spacing: .13em; }
      .belt { position: relative; height: 104px; margin-top: 12px; border: 8px solid #294d41; border-radius: 17px; background: repeating-linear-gradient(90deg, #526d63 0 26px, #60786f 26px 52px); box-shadow: inset 0 0 0 2px rgba(255,255,255,.18), 0 13px 28px rgba(25,55,45,.14); overflow: hidden; }
      .belt::after { content: ""; position: absolute; inset: 8px; border-top: 1px dashed rgba(255,255,255,.35); border-bottom: 1px dashed rgba(255,255,255,.35); }
      .sensor { position: absolute; z-index: 4; top: 23px; bottom: 17px; width: 3px; left: ${sensorPosition}%; background: #e6ad45; box-shadow: 0 0 0 5px rgba(230,173,69,.17); }
      .sensor::before { content: "SENSOR"; position: absolute; left: 8px; top: -18px; color: #7b5520; font-size: 9px; font-weight: 900; letter-spacing: .1em; }
      .router { position: absolute; z-index: 4; top: 23px; bottom: 17px; width: 3px; left: ${routePosition}%; background: #7bc0b5; box-shadow: 0 0 0 5px rgba(123,192,181,.15); }
      .router::before { content: "ROUTER"; position: absolute; left: 8px; bottom: -18px; color: #356e65; font-size: 9px; font-weight: 900; letter-spacing: .1em; }
      .package { position: absolute; z-index: 3; top: 29px; width: 43px; height: 43px; transform: translateX(-50%); display: grid; place-items: center; border: 2px solid rgba(255,255,255,.7); border-radius: 9px; background: #d4c6a8; box-shadow: 0 7px 15px rgba(0,0,0,.22); transition: left 150ms linear; }
      .package i { width: 18px; height: 14px; border: 2px solid rgba(65,56,39,.42); border-top: none; }
      .package small { position: absolute; bottom: -19px; color: #eaf2ed; font-size: 8px; font-weight: 850; }
      .route-green { background: #6cb98c; }
      .route-inspect { background: #e1b75e; }
      .route-reject { background: #ce7668; }
      .route-pending { background: #cfc5ae; }
      .package.anomaly { outline: 4px solid rgba(201,74,49,.32); }
      .lanes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; margin-top: 16px; }
      .lane { padding: 12px; border-radius: 13px; color: #fff; }
      .lane span { display: block; font-size: 9px; font-weight: 850; letter-spacing: .11em; }
      .lane strong { display: block; margin-top: 4px; font-size: 24px; }
      .lane-green { background: #287b58; } .lane-inspect { background: #a66e1e; } .lane-reject { background: #9c493c; }
      .continuity { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; }
      .continuity div { min-height: 82px; padding: 13px; border: 1px solid rgba(23,50,42,.1); border-radius: 14px; background: #f7f4eb; }
      .continuity span { display: block; margin-bottom: 9px; color: #728078; font-size: 9px; font-weight: 850; letter-spacing: .1em; }
      .continuity strong { display: block; overflow-wrap: anywhere; font-size: 16px; letter-spacing: -.02em; }
      .side { display: grid; align-content: start; gap: 16px; }
      .panel { padding: 21px; }
      .panel-head { display: flex; justify-content: space-between; align-items: start; gap: 14px; margin-bottom: 14px; }
      .panel-head small { color: #74847c; font-size: 10px; }
      dl { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      dl div { padding: 10px; border-radius: 11px; background: #f4f0e6; }
      dt { color: #748179; font-size: 8px; font-weight: 850; letter-spacing: .09em; text-transform: uppercase; }
      dd { margin: 4px 0 0; color: #28483d; font-size: 13px; font-weight: 750; }
      .empty-state { padding: 16px; border-radius: 12px; background: #f4f0e6; color: #6d7d75; font-size: 12px; line-height: 1.55; }
      .belief { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .belief div { padding: 12px; border: 1px solid rgba(23,50,42,.09); border-radius: 12px; }
      .belief span { display: block; color: #748179; font-size: 8px; font-weight: 850; letter-spacing: .09em; text-transform: uppercase; }
      .belief strong { display: block; margin-top: 5px; font-size: 18px; }
      .decision { margin-top: 12px; padding: 14px; border-radius: 13px; background: #143d31; color: #eef8f2; }
      .decision span { color: #a7c7b8; font-size: 9px; font-weight: 850; letter-spacing: .1em; }
      .decision strong { display: block; margin-top: 6px; font-size: 19px; }
      .decision small { display: block; margin-top: 5px; color: #bad0c5; }
      .events { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
      .events li { display: grid; grid-template-columns: 22px 58px minmax(0,1fr); gap: 7px; align-items: center; color: #52665d; font-size: 11px; }
      .events li > span { display: grid; place-items: center; width: 21px; height: 21px; border-radius: 50%; background: #e6eee9; color: #0e7454; font-weight: 900; }
      .events strong { color: #395348; font-size: 10px; }
      .events em { overflow: hidden; text-overflow: ellipsis; font-style: normal; white-space: nowrap; }
      .activation-error { display: grid; gap: 5px; padding: 13px 15px; border: 1px solid rgba(171,67,46,.2); border-radius: 13px; background: #fff0e9; color: #873723; }
      .activation-error span { overflow: hidden; text-overflow: ellipsis; font-size: 11px; white-space: nowrap; }
      .activation-error small { color: #a3543e; }
      .proof { grid-column: 1 / -1; display: flex; justify-content: space-between; gap: 22px; padding: 15px 18px; color: #55685f; font-size: 11px; line-height: 1.5; }
      .proof strong { color: #244a3d; }
      @media (max-width: 820px) { .shell { grid-template-columns: 1fr; } .proof { grid-column: auto; } }
      @media (max-width: 560px) { .conveyor-twin { padding: 14px; } .cell-head, .proof { flex-direction: column; } .continuity { grid-template-columns: 1fr 1fr; } .lanes { grid-template-columns: 1fr; } .belt { height: 94px; } .package { top: 25px; width: 38px; height: 38px; } }
    </style>
    <div class="shell">
      <section class="cell surface">
        <header class="cell-head"><div><p class="eyebrow">CONVEYOR CELL DIGITAL TWIN</p><h1>The line continues while its judgement changes.</h1></div><span class="runtime-pill"><i></i>${escapeHtml(status)}</span></header>
        ${error}
        <div class="factory">
          <div class="belt"><span class="sensor"></span><span class="router"></span>${packageNodes}</div>
          <div class="lanes">
            <div class="lane lane-green"><span>GREEN LANE</span><strong>${Number(counts.green || 0)}</strong></div>
            <div class="lane lane-inspect"><span>INSPECTION</span><strong>${Number(counts.inspect || 0)}</strong></div>
            <div class="lane lane-reject"><span>REJECT LANE</span><strong>${Number(counts.reject || 0)}</strong></div>
          </div>
        </div>
        <div class="continuity">
          <div><span>ACTIVITY ID</span><strong>${escapeHtml(snapshot.id)}</strong></div>
          <div><span>MONOTONIC TICK</span><strong>${Number(snapshot.tick || 0)}</strong></div>
          <div><span>SENSOR SEQUENCE</span><strong>${Number(world.sensorSequence || 0)}</strong></div>
          <div><span>PACKAGES IN FLIGHT</span><strong>${packages.length}</strong></div>
        </div>
      </section>
      <aside class="side">
        <section class="panel surface">
          <header class="panel-head"><div><p class="eyebrow">PHYSICAL OBSERVATION</p><h2>Sensor report</h2></div><small>seq ${Number(world.sensorSequence || 0)}</small></header>
          ${observationMarkup(world.lastObservation)}
        </section>
        <section class="panel surface">
          <header class="panel-head"><div><p class="eyebrow">DIGITAL TWIN</p><h2>Current belief</h2></div><small>${twinConfidence}% confidence</small></header>
          <div class="belief"><div><span>Belt</span><strong>${world.jammed ? "jammed" : snapshot.paused ? "paused" : "moving"}</strong></div><div><span>In flight</span><strong>${packages.length}</strong></div><div><span>Observed</span><strong>${Number(world.sensorSequence || 0)}</strong></div><div><span>Anomaly armed</span><strong>${world.anomalyArmed ? "yes" : "no"}</strong></div></div>
          <div class="decision"><span>REPLACEABLE HARA BEHAVIOUR</span><strong>${escapeHtml(behavior)}</strong><small>${lastDecision ? `${escapeHtml(lastDecision.packageId)} → ${escapeHtml(routeLabel(lastDecision.route))}` : "The runtime owns movement; policy supplies only routing decisions."}</small></div>
        </section>
        <section class="panel surface"><header class="panel-head"><div><p class="eyebrow">ACTIVITY HISTORY</p><h2>Safe boundaries</h2></div><small>attempt ${Number(snapshot.attempt || 0)}</small></header><ul class="events">${events || '<li><span>·</span><strong>tick 0</strong><em>The worker created the cell before a policy was installed.</em></li>'}</ul></section>
      </aside>
      <footer class="proof surface"><span><strong>No external application loop:</strong> the worker advances packages, sensors and twin state.</span><span>Hara source is staged and installed as a replaceable routing policy; bad versions leave the accepted policy running.</span></footer>
    </div>
  </main>`;
}
