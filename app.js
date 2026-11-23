(function () {
  "use strict";
  // ================= constants =================
  const ZONES = { SGT: 480, IST: 330 };
  const AIRPORTS = {
    SIN: { city: "SINGAPORE", name: "Singapore", lon: 103.9915, lat: 1.3644, zone: "SGT" },
    CCU: { city: "KOLKATA", name: "Kolkata", lon: 88.4467, lat: 22.6547, zone: "IST" },
    PAT: { city: "PATNA", name: "Patna", lon: 85.0880, lat: 25.5913, zone: "IST" }
  };
  const LS_KEY = "flightdeck.v1", LS_GPS = "flightdeck.gpsOn";
  const PLANE_PATH = "M0,-10 L1.6,-3 L9,2 L9,4 L1.6,1.5 L1.2,7 L3.5,9 L3.5,10.5 L0,9.5 L-3.5,10.5 L-3.5,9 L-1.2,7 L-1.6,1.5 L-9,4 L-9,2 L-1.6,-3 Z";
  const CHECK_SVG = '<svg viewBox="0 0 12 12"><path d="M2 6.5 5 9.2 10 3"/></svg>';
  const uid = () => Math.random().toString(36).slice(2, 9);
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function defaultChecklist() {
    const S = {
      "DOCUMENTS": ["Passport (6+ months valid)", "Visa / e-Visa / OCI sorted", "Boarding passes", "Travel insurance details", "Address of where you're staying"],
      "MONEY": ["Some rupees in cash", "Card that works overseas"],
      "ELECTRONICS": ["Phone", "Charger + cable", "Power bank (carry-on only)", "Plug adapter for India", "Earphones", "Roaming / eSIM / data plan"],
      "CARRY-ON": ["Hoodie for the plane", "Empty water bottle", "Snacks", "Pen"],
      "CLOTHES": ["Tops", "Pants / shorts", "Underwear + socks", "Sleepwear", "Jacket for cold nights", "Slippers"],
      "TOILETRIES": ["Toothbrush + toothpaste", "Deodorant", "Sunscreen", "Mosquito repellent", "Any meds you take", "Tissues + hand sanitiser"],
      "BEFORE THE FLIGHT": ["Open Flight Deck once with internet", "Test GPS in airplane mode", "Download offline maps (backup)"]
    };
    const out = [];
    for (const sec in S) for (const label of S[sec]) out.push({ id: uid(), sec, label, done: false });
    return out;
  }
  function defaults() {
    return {
      v: 2, updatedAt: 0,
      flights: [
        { id: "L1", from: "SIN", to: "CCU", no: "", dep: "", dur: 235, seat: "", gate: "" },
        { id: "L2", from: "CCU", to: "PAT", no: "", dep: "", dur: 65, seat: "", gate: "" }
      ],
      checklist: defaultChecklist()
    };
  }
  function sanitize(s) {
    const d = defaults();
    if (!s || typeof s !== "object") return d;
    const out = { v: 2, updatedAt: +s.updatedAt || 0 };
    out.flights = d.flights.map(f => {
      const g = Array.isArray(s.flights) ? s.flights.find(x => x && x.id === f.id) : null;
      return g ? { ...f, no: String(g.no || ""), dep: String(g.dep || ""), dur: Math.max(10, +g.dur || f.dur), seat: String(g.seat || ""), gate: String(g.gate || ""), torn: !!g.torn } : f;
    });
    out.checklist = Array.isArray(s.checklist) ? s.checklist.filter(c => c && c.id).map(c => ({ id: String(c.id), sec: String(c.sec || "OTHER"), label: String(c.label || ""), done: !!c.done })) : d.checklist;
    return out;
  }

  // ================= state + saving =================
  let state = defaults();
  try { const raw = localStorage.getItem(LS_KEY); if (raw) state = sanitize(JSON.parse(raw)); } catch (e) {}
  try { localStorage.removeItem("flightdeck.tracks"); } catch (e) {}

  let dbRef = null, writing = false, again = false, saveTimer = null, offlineReady = false, cloud = false;
  function setSync() {
    const parts = [cloud ? "Saved to your account" : "Saved on this phone"];
    if (offlineReady) parts.push("works offline");
    $("syncTxt").textContent = parts.join(" · ");
  }
  function commit(opts) {
    state.updatedAt = Date.now();
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
    clearTimeout(saveTimer); saveTimer = setTimeout(flush, 1200);
    if (!opts || !opts.quiet) renderAll();
  }
  async function flush(retried) {
    if (!dbRef) return;
    if (writing) { again = true; return; }
    writing = true;
    try { await dbRef.set(JSON.parse(JSON.stringify(state))); cloud = true; setSync(); }
    catch (e) { if (e && e.code === "unavailable" && !retried) { writing = false; setTimeout(() => flush(true), 1800); return; } }
    writing = false;
    if (again) { again = false; flush(); }
  }
  async function pull() {
    if (!dbRef) return;
    try {
      const snap = await dbRef.get();
      const remote = snap.exists ? sanitize(snap.data()) : null;
      cloud = true; setSync();
      if (remote && remote.updatedAt > state.updatedAt) {
        state = remote;
        try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
        renderAll();
      } else if (state.updatedAt > 0 && (!remote || state.updatedAt > remote.updatedAt)) flush();
    } catch (e) {}
  }
  (async function connect() {
    try {
      if (!window.claude || !window.claude.use) return;
      const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
      if (!db || !user) return;
      const id = await user.id(); if (!id) return;
      dbRef = db.doc("data/users/" + id + "/flightdeck");
      await pull();
    } catch (e) {}
  })();

  // ================= time =================
  function localToUTC(str, zone) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(str || "");
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - ZONES[zone] * 60000;
  }
  const zoned = (utc, zone) => new Date(utc + ZONES[zone] * 60000);
  const pad = n => String(n).padStart(2, "0");
  const hhmm = (utc, zone) => { const d = zoned(utc, zone); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); };
  const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const MONS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const dayKey = (utc, zone) => { const d = zoned(utc, zone); return DAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONS[d.getUTCMonth()]; };
  const dur = min => { min = Math.max(0, Math.round(min)); return Math.floor(min / 60) + ":" + pad(min % 60); };
  const durWords = min => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return (h ? h + "H " : "") + pad(m) + "M"; };
  const fmtInt = n => Math.round(n).toLocaleString("en-SG");
  function legTimes(f) {
    const dep = localToUTC(f.dep, AIRPORTS[f.from].zone);
    return dep == null ? null : { dep, arr: dep + f.dur * 60000 };
  }

  // ================= geo =================
  const R = 6371, toRad = d => d * Math.PI / 180, toDeg = r => r * 180 / Math.PI;
  function dist(a, b) {
    const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {
    const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
    const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }
  function vec(p) { const l = toRad(p.lon), q = toRad(p.lat); return [Math.cos(q) * Math.cos(l), Math.cos(q) * Math.sin(l), Math.sin(q)]; }
  function interp(a, b, t) {
    const A = vec(a), B = vec(b);
    const d = Math.acos(Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
    const s1 = Math.sin((1 - t) * d) / Math.sin(d), s2 = Math.sin(t * d) / Math.sin(d);
    const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
    return { lon: toDeg(Math.atan2(y, x)), lat: toDeg(Math.atan2(z, Math.hypot(x, y))) };
  }
  const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const compass = deg => COMPASS[Math.round(deg / 22.5) % 16];
  const legLen = f => dist(AIRPORTS[f.from], AIRPORTS[f.to]);

  // ================= map data =================
  let MAP = null;
  function proj(lon, lat) { return [MAP.k * toRad(lon) + MAP.t[0], MAP.t[1] - MAP.k * Math.log(Math.tan(Math.PI / 4 + toRad(lat) / 2))]; }
  function inRing(ring, x, y) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function whereLabel(lat, lon) {
    if (!MAP) return "…";
    const hit = MAP.regions.find(r => r.r.some(ring => inRing(ring, lon, lat)));
    if (hit) {
      const n = hit.n;
      if (n === "India") { if (lat < 15) return "the Andaman & Nicobar Islands"; if (lon >= 87.3) return "West Bengal"; if (lat >= 24.7) return "Bihar"; if (lat < 22) return "Odisha"; return "Jharkhand"; }
      if (n === "Thailand") return lat < 11 ? "southern Thailand" : "Thailand";
      if (n === "Malaysia") return "Peninsular Malaysia";
      if (n === "Indonesia") return lon < 106 ? "Sumatra, Indonesia" : "Indonesia";
      return n;
    }
    if (lat < 1.6 && lon > 103.4) return "the Singapore Strait";
    if (lat < 6.3 && lon > 95) return "the Strait of Malacca";
    if (lon > 99.6 && lat > 6 && lat < 13.6) return "the Gulf of Thailand";
    if (lon > 92.6 && lat < 16.5) return "the Andaman Sea";
    if (lat < 5) return "the Indian Ocean";
    return "the Bay of Bengal";
  }

  // ================= GPS =================
  const gps = { on: false, watch: null, last: null, prev: null, status: "off", err: "", airborne: false, slowCount: 0 };
  function startGPS() {
    if (!("geolocation" in navigator)) { gps.status = "denied"; gps.err = "This browser has no location support."; renderGPS(); return; }
    gps.on = true; gps.status = "searching"; gps.err = "";
    try { localStorage.setItem(LS_GPS, "1"); } catch (e) {}
    try {
      gps.watch = navigator.geolocation.watchPosition(onFix, onGpsErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 120000 });
    } catch (e) { gps.status = "denied"; gps.err = "Location is blocked here. Open your own hosted version in Safari."; }
    renderGPS(); renderFlight();
  }
  function pauseGPS() {
    if (gps.watch != null) { try { navigator.geolocation.clearWatch(gps.watch); } catch (e) {} }
    gps.watch = null;
  }
  function resumeGPS() {
    if (!gps.on || gps.watch != null || !("geolocation" in navigator)) return;
    gps.status = gps.last ? "lost" : "searching";
    try { gps.watch = navigator.geolocation.watchPosition(onFix, onGpsErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 120000 }); } catch (e) {}
  }
  function stopGPS() {
    if (gps.watch != null) { try { navigator.geolocation.clearWatch(gps.watch); } catch (e) {} }
    gps.on = false; gps.watch = null; gps.status = "off";
    try { localStorage.removeItem(LS_GPS); } catch (e) {}
    renderGPS(); renderFlight();
  }
  function onGpsErr(e) {
    if (e && e.code === 1) { gps.status = "denied"; gps.err = "Location permission was refused. In Settings › Privacy › Location Services, allow Safari Websites, then try again."; stopGPS(); gps.status = "denied"; }
    else { gps.status = gps.last ? "lost" : "searching"; }
    renderGPS(); renderFlight();
  }
  function onFix(pos) {
    const c = pos.coords, t = pos.timestamp || Date.now();
    const fix = { t, lat: c.latitude, lon: c.longitude, acc: c.accuracy, alt: (c.altitude == null || isNaN(c.altitude)) ? null : c.altitude, spd: null, hdg: null };
    const prev = gps.last;
    if (c.speed != null && !isNaN(c.speed) && c.speed >= 0) fix.spd = c.speed;
    else if (prev && t - prev.t > 1500) fix.spd = dist(prev, fix) * 1000 / ((t - prev.t) / 1000);
    if (c.heading != null && !isNaN(c.heading) && (fix.spd || 0) > 5) fix.hdg = c.heading;
    else if (prev && dist(prev, fix) > 0.3) fix.hdg = bearing(prev, fix);
    else if (prev) fix.hdg = prev.hdg;
    gps.prev = prev; gps.last = fix; gps.status = "locked";
    // takeoff / landing detection
    const spd = fix.spd || 0;
    if (!gps.airborne && spd > 60) { gps.airborne = true; gps.slowCount = 0; toast("Wheels up ✈  Enjoy the flight"); }
    else if (gps.airborne && spd < 25) { if (++gps.slowCount >= 3) { gps.airborne = false; const near = nearestAirport(fix); toast(near ? "Touchdown in " + near.name : "Touchdown"); } }
    else gps.slowCount = 0;
    renderGPS(); renderFlight();
  }
  function nearestAirport(p) {
    let best = null, bd = 40;
    for (const k in AIRPORTS) { const d = dist(AIRPORTS[k], p); if (d < bd) { bd = d; best = AIRPORTS[k]; } }
    return best;
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { if (curTab === "flight") resumeGPS(); pull(); renderAll(); }
    else pauseGPS();
  });

  // ================= leg + position resolution =================
  let selLeg = "L1", userPickedLeg = false;
  function pickLeg(p) {
    let best = state.flights[0], bs = Infinity;
    for (const f of state.flights) {
      const A = AIRPORTS[f.from], B = AIRPORTS[f.to];
      const s = dist(A, p) + dist(p, B) - dist(A, B);
      if (s < bs) { bs = s; best = f; }
    }
    return best;
  }
  function liveLegBySchedule(now) {
    for (const f of state.flights) { const t = legTimes(f); if (t && now >= t.dep && now < t.arr) return f; }
    return null;
  }
  function currentPos(now) {
    const fresh = gps.last && now - gps.last.t < 120000;
    if (fresh) {
      const leg = userPickedLeg ? state.flights.find(f => f.id === selLeg) : pickLeg(gps.last);
      const A = AIRPORTS[leg.from], B = AIRPORTS[leg.to];
      const da = dist(A, gps.last), db = dist(gps.last, B);
      const hdg = gps.last.hdg != null ? gps.last.hdg : bearing(gps.last, B);
      return { src: "gps", leg, lat: gps.last.lat, lon: gps.last.lon, hdg, spd: gps.last.spd, alt: gps.last.alt, prog: Math.min(1, da / (da + db)), toGo: db, acc: gps.last.acc };
    }
    const live = !userPickedLeg ? liveLegBySchedule(now) : null;
    const leg = live || state.flights.find(f => f.id === selLeg);
    const A = AIRPORTS[leg.from], B = AIRPORTS[leg.to], t = legTimes(leg);
    let prog, src;
    if (t && now >= t.dep && now < t.arr) { prog = (now - t.dep) / (t.arr - t.dep); src = "est"; }
    else if (t && now >= t.arr && !userPickedLeg) { prog = 1; src = "landed"; }
    else { prog = $("prev").value / 100; src = "preview"; }
    const p = interp(A, B, prog), q = interp(A, B, Math.min(0.999, prog + 0.005)), p0 = interp(A, B, Math.max(0, prog - 0.005));
    const hdg = prog >= 0.995 ? bearing(p0, p) : bearing(p, q);
    const L = legLen(leg);
    return { src, leg, lat: p.lat, lon: p.lon, hdg, spd: L * 1000 / (leg.dur * 60), alt: null, prog, toGo: L * (1 - prog) };
  }

  // ================= PASSES =================
  function flightStatus(f, now) {
    const t = legTimes(f);
    if (!t) return { txt: "NOT BOOKED", cls: "" };
    if (now < t.dep - 30 * 60000) return { txt: "ON TIME", cls: "ok" };
    if (now < t.dep) return { txt: "BOARDING", cls: "red" };
    if (now < t.arr) return { txt: "IN THE AIR", cls: "blue" };
    return { txt: "LANDED", cls: "ok", past: true };
  }
  function barcode(seed) {
    let h = 2166136261;
    for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
    let x = 0, r = "";
    while (x < 82) { const w = 1 + Math.floor(rnd() * 3); r += '<rect x="' + x + '" y="0" width="' + w + '" height="28"/>'; x += w + 1 + Math.floor(rnd() * 2.2); }
    return '<svg class="barcode" viewBox="0 0 84 28" aria-hidden="true">' + r + "</svg>";
  }
  function seatSide(seat) {
    const m = /([A-Za-z])\s*$/.exec(seat || ""); if (!m) return null;
    const L = m[1].toUpperCase();
    if (L === "A") return "left";
    if ("FHJKL".includes(L)) return "right";
    return "aisle";
  }
  function seatMap(seat) {
    const m = /^\s*(\d{1,3})\s*([A-Za-z])\s*$/.exec(seat || "");
    if (!m) return '<p class="fine">Add your seat (like 23A) in Edit flight and you\'ll see where you\'re sitting.</p>';
    const row = +m[1], L = m[2].toUpperCase();
    const groups = "ABCDEF".includes(L) ? [["A", "B", "C"], ["D", "E", "F"]] : [["A", "B", "C"], ["D", "E", "F", "G"], ["H", "J", "K"]];
    let html = '<div class="seatmap"><div class="sm-win">WINDOW</div><div class="sm-rows">';
    for (let r = Math.max(1, row - 2); r <= row + 2; r++) {
      html += '<div class="sm-row"><span class="sm-n">' + r + "</span>" + groups.map(g => '<span class="sm-g">' + g.map(c => '<i class="' + (r === row && c === L ? "me" : "") + '">' + (r === row && c === L ? c : "") + "</i>").join("") + "</span>").join("") + "</div>";
    }
    return html + '</div><div class="sm-win">WINDOW</div></div>';
  }
  const fld = (label, val) => '<div class="fld"><small>' + label + "</small><b>" + esc(val) + "</b></div>";
  const stampSeen = new Map();
  let passesAnimated = false;
  function renderPasses() {
    const now = Date.now();
    let html = "", i = 0;
    const t1 = legTimes(state.flights[0]), t2 = legTimes(state.flights[1]);
    state.flights.forEach((f, idx) => {
      const A = AIRPORTS[f.from], B = AIRPORTS[f.to], t = legTimes(f), st = flightStatus(f, now);
      const date = t ? (() => { const d = zoned(t.dep, A.zone); return d.getUTCDate() + " " + MONS[d.getUTCMonth()]; })() : "TBC";
      const side = seatSide(f.seat);
      const key = f.id + (f.torn ? "t" : "") + st.txt;
      const thunk = stampSeen.get(f.id) !== key;
      stampSeen.set(f.id, key);
      html += '<div class="ticket' + (st.past ? " past" : "") + (f.torn ? " torn" : "") + '" data-id="' + f.id + '" style="--i:' + (i++) + (passesAnimated ? ";animation:none" : "") + '">' +
        '<div class="flipper">' +
        '<div class="face front">' +
          '<div class="main" tabindex="0" role="button" aria-label="Flip pass">' +
            '<div class="tk-top"><span>BOARDING PASS</span><span class="red">LEG ' + (idx + 1) + " OF " + state.flights.length + "</span></div>" +
            '<div class="route"><div><span class="code">' + f.from + '</span><span class="city">' + A.city + "</span></div>" +
            '<div class="path"><svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="' + PLANE_PATH + '"/></svg></div>' +
            '<div class="end"><span class="code">' + f.to + '</span><span class="city">' + B.city + "</span></div></div>" +
            '<div class="fields">' + fld("DATE", date) + fld("DEPARTS", t ? hhmm(t.dep, A.zone) : "--:--") + fld("LANDS", t ? hhmm(t.arr, B.zone) : "--:--") +
            fld("FLIGHT", f.no ? f.no.toUpperCase() : "—") + fld("LENGTH", durWords(f.dur)) + fld("KM", fmtInt(legLen(f))) + "</div>" +
            (f.torn ? '<div class="boarded' + (thunk ? " thunk" : "") + '">BOARDED</div>' : "") +
          "</div>" +
          '<div class="stub" title="Drag right to tear">' + fld("GATE", f.gate ? f.gate.toUpperCase() : "—") + fld("SEAT", f.seat ? f.seat.toUpperCase() : "—") +
            (side === "left" || side === "right" ? '<span class="side">WINDOW · ' + side.toUpperCase() + "</span>" : "") +
            '<div class="stamp ' + st.cls + (thunk && !f.torn ? " thunk" : "") + '">' + st.txt + "</div>" + barcode(f.from + f.to + (f.no || "") + (f.dep || "")) +
            '<span class="tear-hint">PULL TO TEAR ›</span>' +
          "</div>" +
          (f.torn ? '<button class="tape" data-tape="' + f.id + '">Tape it back</button>' : "") +
        "</div>" +
        '<div class="face back" tabindex="0" role="button" aria-label="Flip pass back">' +
          '<div class="tk-top"><span>SEAT MAP · TYPICAL LAYOUT</span><span class="red">' + f.from + " → " + f.to + "</span></div>" +
          seatMap(f.seat) +
          '<p class="fine">' + (side === "left" || side === "right" ? "Window on your " + side + ". " : "") + "Layouts differ between planes, so check when you board.</p>" +
          '<div class="back-row"><button class="btn sm" data-edit="1">Edit flight</button><span class="fine tiny">Not valid for travel · Flight Deck Air</span></div>' +
        "</div>" +
        "</div></div>";
      if (idx === 0 && t1 && t2 && t2.dep > t1.arr) html += '<div class="layover"' + (passesAnimated ? ' style="animation:none"' : "") + ">LAYOVER · <b>" + durWords((t2.dep - t1.arr) / 60000) + "</b> IN KOLKATA</div>";
    });
    $("passes").innerHTML = html;
    passesAnimated = true;
  }

  // ---- sounds (made in code, no files) ----
  let actx = null;
  function audio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); return actx; } catch (e) { return null; } }
  function ripSound() {
    const a = audio(); if (!a) return;
    const dur = 0.34, n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) { const t = i / n; const crack = Math.random() < 0.09 ? 1 : 0.22; d[i] = (Math.random() * 2 - 1) * crack * Math.pow(1 - t, 1.4) * Math.min(1, t * 25); }
    const src = a.createBufferSource(); src.buffer = buf;
    const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = 0.6;
    const g = a.createGain(); g.gain.value = 0.7;
    src.connect(bp); bp.connect(g); g.connect(a.destination); src.start();
  }
  function thunkSound() {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.18);
  }

  // ---- tear the stub, flip the pass ----
  let drag = null;
  const passesEl = $("passes");
  passesEl.addEventListener("pointerdown", e => {
    const stub = e.target.closest(".stub"); if (!stub) return;
    const tk = stub.closest(".ticket"); if (tk.classList.contains("flipped") || tk.classList.contains("torn")) return;
    drag = { stub, tk, x: e.clientX, y: e.clientY, dx: 0, live: false, id: e.pointerId };
    audio();
  });
  passesEl.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.live) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      if (dx > 8) { drag.live = true; try { drag.stub.setPointerCapture(e.pointerId); } catch (err) {} drag.stub.classList.add("dragging"); }
      else return;
    }
    drag.dx = Math.max(0, dx);
    drag.stub.style.transform = "translateX(" + drag.dx + "px) rotate(" + (drag.dx * 0.12).toFixed(1) + "deg)";
    e.preventDefault();
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag; drag = null;
    d.stub.classList.remove("dragging");
    if (!d.live) return;
    d.stub.dataset.dragged = "1";
    if (d.dx > 64) tearStub(d.tk, d.stub);
    else { d.stub.style.transition = "transform .35s cubic-bezier(.2,1.4,.4,1)"; d.stub.style.transform = ""; setTimeout(() => { d.stub.style.transition = ""; }, 400); }
  }
  passesEl.addEventListener("pointerup", endDrag);
  passesEl.addEventListener("pointercancel", endDrag);
  function tearStub(tk, stub) {
    const f = state.flights.find(x => x.id === tk.dataset.id); if (!f) return;
    ripSound();
    stub.classList.add("fly");
    setTimeout(() => { f.torn = true; commit({ quiet: true }); renderPasses(); setTimeout(thunkSound, 330); }, 380);
  }
  passesEl.addEventListener("click", e => {
    if (e.target.closest("[data-edit]")) { openFlights(); return; }
    const tape = e.target.closest("[data-tape]");
    if (tape) { const f = state.flights.find(x => x.id === tape.dataset.tape); if (f) { f.torn = false; commit({ quiet: true }); renderPasses(); } return; }
    const stub = e.target.closest(".stub");
    if (stub) {
      if (stub.dataset.dragged) { delete stub.dataset.dragged; return; }
      stub.classList.remove("nudge"); void stub.offsetWidth; stub.classList.add("nudge");
      toast("Drag the stub to the right to tear it off");
      return;
    }
    const tk = e.target.closest(".ticket");
    if (tk && (e.target.closest(".main") || e.target.closest(".back"))) tk.classList.toggle("flipped");
  });
  passesEl.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const tk = e.target.closest(".ticket"); if (!tk || e.target.tagName === "BUTTON") return;
    e.preventDefault(); tk.classList.toggle("flipped");
  });

  // ================= FLIGHT MAP =================
  const planeAnim = { x: null, y: null, a: 0, tx: 0, ty: 0, ta: 0, raf: 0 };
  function buildMapBase() {
    let s = "";
    MAP.lands.forEach(l => { s += '<path class="land' + (l.n === "India" ? " home" : "") + '" d="' + l.d + '"/>'; });
    MAP.seas.forEach(([n, x, y]) => { s += '<text class="lbl-sea" x="' + x + '" y="' + y + '" text-anchor="middle">' + n + "</text>"; });
    MAP.countryLabels.forEach(([n, x, y]) => { s += '<text class="lbl-country" x="' + x + '" y="' + y + '" text-anchor="middle">' + n + "</text>"; });
    MAP.labels.forEach(([n, x, y]) => {
      if (n === "Singapore" || n === "Kolkata" || n === "Patna") return;
      s += '<circle class="city-dot" cx="' + x + '" cy="' + y + '" r="1.6"/><text class="lbl-city" x="' + (x + 4) + '" y="' + (y + 3) + '">' + n + "</text>";
    });
    s += '<g id="routes"></g>';
    Object.entries(AIRPORTS).forEach(([code, a]) => {
      const [x, y] = proj(a.lon, a.lat);
      const dx = code === "CCU" ? 8 : -8, anchor = dx < 0 ? "end" : "start";
      s += '<circle class="ap-dot" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.2"/><text class="ap-lbl" x="' + (x + dx).toFixed(1) + '" y="' + (y + (code === "PAT" ? -4 : 4)).toFixed(1) + '" text-anchor="' + anchor + '">' + code + "</text>";
    });
    s += '<g id="planeG"><circle class="plane-halo" r="10" opacity=".18">' + (reduceMotion ? "" : '<animate attributeName="r" values="8;16;8" dur="2.4s" repeatCount="5"/><animate attributeName="opacity" values=".25;0;.25" dur="2.4s" repeatCount="5"/>') + '</circle><path class="plane" d="' + PLANE_PATH + '"/></g>';
    $("mapSvg").innerHTML = s;
  }
  function polyPts(a, b, t0, t1, n) {
    const out = [];
    for (let i = 0; i <= n; i++) { const p = interp(a, b, t0 + (t1 - t0) * i / n); out.push(proj(p.lon, p.lat).map(v => v.toFixed(1)).join(",")); }
    return out.join(" ");
  }
  function movePlane(x, y, a) {
    planeAnim.tx = x; planeAnim.ty = y; planeAnim.ta = a;
    if (planeAnim.x == null || reduceMotion) { planeAnim.x = x; planeAnim.y = y; planeAnim.a = a; applyPlane(); return; }
    if (!planeAnim.raf) planeAnim.raf = requestAnimationFrame(stepPlane);
  }
  function stepPlane() {
    const p = planeAnim, k = 0.12;
    p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k;
    let da = ((p.ta - p.a + 540) % 360) - 180; p.a += da * k;
    applyPlane();
    if (Math.abs(p.tx - p.x) + Math.abs(p.ty - p.y) + Math.abs(da) > 0.05) p.raf = requestAnimationFrame(stepPlane); else p.raf = 0;
  }
  function applyPlane() {
    const g = $("planeG"); if (g) g.setAttribute("transform", "translate(" + planeAnim.x.toFixed(2) + "," + planeAnim.y.toFixed(2) + ") rotate(" + planeAnim.a.toFixed(1) + ") scale(1.2)");
  }
  let drawNext = true, lastOver = "";
  function renderFlight() {
    if (!MAP) return;
    const now = Date.now();
    const P = currentPos(now);
    const f = P.leg, A = AIRPORTS[f.from], B = AIRPORTS[f.to], t = legTimes(f);
    if (!userPickedLeg) selLeg = f.id;
    $("legChips").innerHTML = state.flights.map(x => '<button class="chip" data-leg="' + x.id + '" aria-pressed="' + (x.id === f.id) + '">' + x.from + " → " + x.to + "</button>").join("") +
      (userPickedLeg ? '<button class="chip" data-leg="auto" aria-pressed="false">Auto</button>' : "");
    // routes + track
    let r = state.flights.map(x => '<polyline class="route-all" points="' + polyPts(AIRPORTS[x.from], AIRPORTS[x.to], 0, 1, 48) + '"/>').join("");
    if (P.prog > 0.002) r += '<polyline class="route-done' + (drawNext ? " draw" : "") + '" pathLength="1" points="' + polyPts(A, B, 0, P.prog, 48) + '"/>';
    $("routes").innerHTML = r;
    drawNext = false;
    const [px, py] = proj(P.lon, P.lat);
    movePlane(px, py, P.hdg || 0);
    // tag + over
    const tag = $("modeTag");
    const onGround = P.src === "gps" && (P.spd || 0) < 15;
    tag.className = "mode-tag " + (P.src === "gps" ? "gps" : P.src === "est" ? "est" : "");
    tag.textContent = P.src === "gps" ? (onGround ? "GPS · ON THE GROUND" : "LIVE GPS") : P.src === "est" ? "ESTIMATE" : P.src === "landed" ? "LANDED" : "PREVIEW";
    let overLbl, overTxt;
    if (P.src === "gps") { overLbl = onGround ? "YOU'RE IN" : "NOW FLYING OVER"; overTxt = cap(whereLabel(P.lat, P.lon)); }
    else if (P.prog <= 0.003) { overLbl = "STARTING IN"; overTxt = A.name; }
    else if (P.prog >= 0.997) { overLbl = "ARRIVED IN"; overTxt = B.name; }
    else { overLbl = P.src === "est" ? "PROBABLY OVER" : "AT THIS POINT YOU'D BE OVER"; overTxt = cap(whereLabel(P.lat, P.lon)); }
    $("overLbl").textContent = overLbl;
    const ot = $("overTxt");
    if (overTxt !== lastOver) { ot.textContent = overTxt; ot.classList.remove("swap"); void ot.offsetWidth; ot.classList.add("swap"); lastOver = overTxt; }
    $("progBar").style.width = (P.prog * 100).toFixed(1) + "%";
    $("progFrom").textContent = f.from; $("progTo").textContent = f.to;
    $("progPct").textContent = Math.round(P.prog * 100) + "%";
    // stats
    let left;
    if (P.src === "gps") left = (P.spd || 0) > 40 ? P.toGo * 1000 / P.spd / 60 : (t && now < t.arr ? (t.arr - Math.max(now, t.dep)) / 60000 : null);
    else left = (1 - P.prog) * f.dur;
    $("sAlt").innerHTML = P.alt != null ? fmtInt(P.alt * 3.28084) + "<em>ft</em>" : "—";
    $("sSpd").innerHTML = P.src === "gps" ? (P.spd != null ? fmtInt(P.spd * 3.6) + "<em>km/h</em>" : "—") : "~" + fmtInt(P.spd * 3.6) + "<em>km/h</em>";
    $("sHdg").textContent = P.hdg != null ? Math.round(P.hdg) + "° " + compass(P.hdg) : "—";
    $("sDist").innerHTML = fmtInt(P.toGo) + "<em>km</em>";
    $("sLeft").textContent = left != null ? dur(left) : "—";
    $("sLands").textContent = left != null ? hhmm(now + left * 60000, B.zone) : (t ? hhmm(t.arr, B.zone) : "--:--");
    $("sLandsLbl").textContent = "LANDS (" + (B.zone === "IST" ? "INDIA" : "SG") + ")";
    $("sliderBox").style.display = P.src === "preview" ? "" : "none";
    $("prevVal").textContent = $("prev").value + "%";
    renderWindow(P, now);
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  $("legChips").addEventListener("click", e => {
    const b = e.target.closest("[data-leg]"); if (!b) return;
    if (b.dataset.leg === "auto") userPickedLeg = false; else { selLeg = b.dataset.leg; userPickedLeg = true; }
    drawNext = true; renderFlight();
  });
  $("prev").addEventListener("input", renderFlight);

  // ================= SUN + PORTHOLE =================
  function sunPos(ms, lat, lon) {
    const d = ms / 86400000 - 10957.5;
    const g = toRad((357.529 + 0.98560028 * d) % 360), q = (280.459 + 0.98564736 * d) % 360;
    const L = toRad(q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)), e = toRad(23.439 - 0.00000036 * d);
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
    const ha = toRad(gmst * 15 + lon) - ra, la = toRad(lat);
    const elev = toDeg(Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)));
    const az = (toDeg(Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha))) + 360) % 360;
    return { elev, az };
  }
  function nextCross(ms, lat, lon, up) {
    let prev = sunPos(ms, lat, lon).elev;
    for (let k = 1; k <= 168; k++) { const e = sunPos(ms + k * 300000, lat, lon).elev; if (up ? (prev < -0.83 && e >= -0.83) : (prev >= -0.83 && e < -0.83)) return k * 5; prev = e; }
    return null;
  }
  const inWords = m => m < 60 ? m + " min" : Math.floor(m / 60) + "h " + pad(m % 60) + "m";
  function renderPorthole(P, when) {
    const s = sunPos(when, P.lat, P.lon);
    const sky = s.elev < -8 ? "night" : s.elev < 0 ? "dusk" : s.elev < 10 ? "golden" : "day";
    $("porthole").className = "porthole " + sky;
    const rel = ((s.az - (P.hdg || 0) + 540) % 360) - 180;
    const where = rel <= -25 && rel >= -155 ? "on your <b>left</b>" : rel >= 25 && rel <= 155 ? "on your <b>right</b>" : Math.abs(rel) < 25 ? "<b>ahead</b> of the plane" : "<b>behind</b> the plane";
    let txt;
    if (s.elev >= -0.83) {
      const set = nextCross(when, P.lat, P.lon, false);
      txt = "The sun is " + where + (set != null && set <= 180 ? ". It sets in about <b>" + inWords(set) + "</b>" + (set <= 60 ? ", so look out for the sunset!" : ".") : ".");
    } else {
      const rise = nextCross(when, P.lat, P.lon, true);
      txt = "It's dark out" + (rise != null && rise <= 180 ? ", and sunrise is in about <b>" + inWords(rise) + "</b>, " + where + "." : ". Look down for city lights.");
    }
    $("sunLine").innerHTML = txt;
  }

  // ================= OUT YOUR WINDOW =================
  let lastWindowKey = "";
  function renderWindow(P, now) {
    const here = { lat: P.lat, lon: P.lon };
    const left = [], right = [], ahead = [];
    for (const [n, lat, lon, rng] of MAP.pois) {
      const d = dist(here, { lat, lon });
      if (d < 4) continue;
      const rel = ((bearing(here, { lat, lon }) - (P.hdg || 0) + 540) % 360) - 180;
      const item = { n, d };
      if (d <= (rng || 230)) {
        if (rel <= -20 && rel >= -160) left.push(item);
        else if (rel >= 20 && rel <= 160) right.push(item);
      }
      if (Math.abs(rel) < 25 && d < 700) ahead.push(item);
    }
    left.sort((a, b) => a.d - b.d); right.sort((a, b) => a.d - b.d); ahead.sort((a, b) => a.d - b.d);
    const side = seatSide(P.leg.seat);
    const sea = /the (Bay|Andaman|Strait|Gulf|Indian|Singapore)/.test(whereLabel(P.lat, P.lon));
    const list = arr => arr.length ? arr.slice(0, 3).map(x => '<div class="poi"><b>' + esc(x.n) + "</b><span>" + fmtInt(x.d) + " km away</span></div>").join("")
      : '<div class="poi none"><b>' + (sea ? "Open sea" : "Nothing big nearby") + "</b></div>";
    const key = left.slice(0, 3).map(x => x.n).join() + "|" + right.slice(0, 3).map(x => x.n).join() + "|" + side;
    const col = (name, arr, mine) => '<div class="side-col' + (mine ? " mine" : "") + '"><h4>' + name + (mine ? "<span>YOUR WINDOW</span>" : "") + "</h4>" + list(arr) + "</div>";
    if (key !== lastWindowKey) {
      $("windowSides").innerHTML = col("LEFT", left, side === "left") + col("RIGHT", right, side === "right");
      lastWindowKey = key;
    } else {
      // refresh distances without re-animating
      const cols = $("windowSides").querySelectorAll(".side-col");
      [left, right].forEach((arr, i) => cols[i] && cols[i].querySelectorAll(".poi span").forEach((s, j) => { if (arr[j]) s.textContent = fmtInt(arr[j].d) + " km away"; }));
    }
    const a = ahead[0];
    let aheadTxt;
    if (a) {
      const mins = P.spd > 40 ? a.d * 1000 / P.spd / 60 : null;
      aheadTxt = "Coming up ahead: <b>" + esc(a.n) + "</b> · " + fmtInt(a.d) + " km" + (mins != null && P.src !== "preview" ? " (~" + Math.round(mins) + " min)" : "");
    } else aheadTxt = "Nothing big straight ahead for a while.";
    $("ahead").innerHTML = aheadTxt;
    { const t = legTimes(P.leg); renderPorthole(P, P.src === "preview" && t ? t.dep + P.prog * P.leg.dur * 60000 : now); }
    $("seatHint").textContent = side === "left" || side === "right" ? "Based on seat " + P.leg.seat.toUpperCase() + ". Check it once you're on board, since plane layouts differ." :
      side === "aisle" ? "Seat " + P.leg.seat.toUpperCase() + " looks like a middle or aisle seat. Lean over!" : "Add your seat in Edit flights and your window side gets highlighted.";
  }

  // ================= GPS card =================
  function renderGPS() {
    const dot = $("gpsDot"), title = $("gpsTitle"), sub = $("gpsSub"), btn = $("gpsBtn");
    dot.className = "gps-dot " + (gps.status === "off" ? "" : gps.status);
    btn.textContent = gps.on ? "Stop GPS" : "Start GPS";
    btn.className = gps.on ? "btn" : "btn red";
    const ago = gps.last ? Math.round((Date.now() - gps.last.t) / 1000) : null;
    if (gps.status === "off") { title.textContent = "GPS is off"; sub.textContent = "Turn it on once. After that it only runs while you're looking at this tab, then switches off to save battery."; }
    else if (gps.status === "searching") { title.textContent = "Searching for satellites…"; sub.textContent = "Hold the phone near the window. The first lock can take a minute or two."; }
    else if (gps.status === "locked" && ago != null && ago > 120) { dot.className = "gps-dot lost"; title.textContent = "Signal lost " + Math.round(ago / 60) + " min ago"; sub.textContent = "Showing an estimate until it locks again. Move closer to the window."; }
    else if (gps.status === "locked") { title.textContent = "Locked on" + (gps.last.acc ? " · ±" + fmtInt(gps.last.acc) + " m" : ""); sub.textContent = "Updated " + (ago < 3 ? "just now" : ago + "s ago") + ". GPS only runs while this tab is open, so lock your phone between check-ins."; }
    else if (gps.status === "lost") { title.textContent = "Lost the signal"; sub.textContent = "Showing an estimate until it locks again. Move closer to the window."; }
    else if (gps.status === "denied") { title.textContent = "Can't use location"; sub.textContent = gps.err; }
  }
  $("gpsBtn").addEventListener("click", () => gps.on ? stopGPS() : startGPS());

  // ================= CHECKLIST =================
  let ckEditing = false;
  function flip(container, fn) {
    const first = new Map();
    container.querySelectorAll("[data-fid]").forEach(el => first.set(el.dataset.fid, el.getBoundingClientRect().top));
    fn();
    if (reduceMotion || !Element.prototype.animate) return;
    container.querySelectorAll("[data-fid]").forEach(el => {
      const f = first.get(el.dataset.fid);
      if (f == null) { if (first.size) el.animate([{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "ease-out" }); return; }
      const d = f - el.getBoundingClientRect().top;
      if (Math.abs(d) > 1) el.animate([{ transform: "translateY(" + d + "px)" }, { transform: "none" }], { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
  }
  function sections() { const s = []; state.checklist.forEach(c => { if (!s.includes(c.sec)) s.push(c.sec); }); return s; }
  function renderChecklist(popId) {
    const list = state.checklist, doneN = list.filter(c => c.done).length;
    $("ckCount").textContent = doneN + " of " + list.length + " packed";
    $("ckBar").style.width = (list.length ? doneN / list.length * 100 : 0) + "%";
    $("ckEditBtn").textContent = ckEditing ? "Done" : "Edit";
    const cl = $("cleared");
    if (!ckEditing && list.length && doneN === list.length) { if (!cl.firstChild) cl.innerHTML = '<div class="cleared"><div class="big">CLEARED FOR<br>DEPARTURE</div><p>Everything\'s packed. Have a good flight.</p></div>'; }
    else cl.innerHTML = "";
    const box = $("ckSections");
    const secs = sections();
    if (!ckEditing) {
      flip(box, () => {
        box.innerHTML = secs.map(sec => {
          const items = list.filter(c => c.sec === sec).slice().sort((a, b) => a.done - b.done);
          const d = items.filter(c => c.done).length;
          return '<div class="section"><h3>' + esc(sec) + "<span>" + d + "/" + items.length + "</span></h3>" +
            items.map(c => '<div class="item' + (c.done ? " done" : "") + (c.id === popId ? " pop" : "") + '" data-fid="' + esc(c.id) + '"><button class="tog" data-ck="' + esc(c.id) + '" aria-pressed="' + c.done + '"><span class="box">' + CHECK_SVG + '</span><span class="lab">' + esc(c.label) + "</span></button></div>").join("") + "</div>";
        }).join("");
      });
    } else {
      box.innerHTML = secs.map((sec, si) => {
        const items = list.filter(c => c.sec === sec);
        return '<div class="section"><h3><input class="sec-name" value="' + esc(sec) + '" data-sec="' + esc(sec) + '" aria-label="Section name"><button class="linkbtn" data-delsec="' + esc(sec) + '">Delete</button></h3>' +
          items.map(c => '<div class="erow"><button class="minus" data-del="' + esc(c.id) + '" aria-label="Delete ' + esc(c.label) + '">−</button><input type="text" value="' + esc(c.label) + '" data-ren="' + esc(c.id) + '" aria-label="Item name"></div>').join("") +
          '<form class="erow" data-add="' + esc(sec) + '"><span class="plus">+</span><input type="text" id="add-' + si + '" placeholder="Add item" aria-label="Add item to ' + esc(sec) + '" enterkeyhint="done"></form></div>';
      }).join("") +
        '<form class="section erow" data-newsec="1" style="padding:8px 12px"><span class="plus">+</span><input type="text" id="newSec" placeholder="New section" aria-label="New section name"></form>' +
        '<div class="toolbar"><button class="btn danger sm" id="untick">Untick everything</button></div>';
    }
  }
  const box = $("ckSections");
  box.addEventListener("click", e => {
    const t = e.target.closest("[data-ck]");
    if (t) { const c = state.checklist.find(x => x.id === t.dataset.ck); if (c) { c.done = !c.done; commit({ quiet: true }); renderChecklist(c.done ? c.id : null); if (c.done && navigator.vibrate) navigator.vibrate(10); } return; }
    const d = e.target.closest("[data-del]");
    if (d) { const row = d.closest(".erow"); const go = () => { state.checklist = state.checklist.filter(x => x.id !== d.dataset.del); commit(); };
      if (row && row.animate && !reduceMotion) row.animate([{ opacity: 1 }, { opacity: 0, transform: "translateX(-30px)" }], { duration: 180 }).onfinish = go; else go(); return; }
    const ds = e.target.closest("[data-delsec]");
    if (ds) { state.checklist = state.checklist.filter(x => x.sec !== ds.dataset.delsec); commit(); return; }
    if (e.target.id === "untick") { const b = e.target; if (b.dataset.armed) { state.checklist.forEach(c => c.done = false); commit(); } else { b.dataset.armed = "1"; b.textContent = "Tap again to untick all"; } }
  });
  box.addEventListener("change", e => {
    const r = e.target.dataset.ren;
    if (r) { const c = state.checklist.find(x => x.id === r); const v = e.target.value.trim(); if (c && v && v !== c.label) { c.label = v; commit({ quiet: true }); } return; }
    const s = e.target.dataset.sec;
    if (s) { const v = e.target.value.trim().toUpperCase(); if (v && v !== s) { state.checklist.forEach(c => { if (c.sec === s) c.sec = v; }); commit(); } }
  });
  box.addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target, inp = f.querySelector("input"), v = inp.value.trim();
    if (!v) return;
    const fid = inp.id;
    if (f.dataset.newsec) state.checklist.push({ id: uid(), sec: v.toUpperCase(), label: "New item", done: false });
    else state.checklist.push({ id: uid(), sec: f.dataset.add, label: v, done: false });
    commit();
    const again = $(fid); if (again && !f.dataset.newsec) again.focus();
  });
  $("ckEditBtn").addEventListener("click", () => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    ckEditing = !ckEditing; renderChecklist();
  });

  // ================= sheet: edit flights =================
  const scrim = $("scrim"), sheet = $("sheet");
  function closeSheet() { scrim.classList.remove("on"); sheet.innerHTML = ""; }
  scrim.addEventListener("click", e => { if (e.target === scrim) closeSheet(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && scrim.classList.contains("on")) closeSheet(); });
  function openFlights() {
    const legHTML = state.flights.map(f => {
      const A = AIRPORTS[f.from];
      return "<h4>" + f.from + " → " + f.to + " · " + A.name + " to " + AIRPORTS[f.to].name + "</h4>" +
        '<div class="grid2"><div class="field"><label for="no-' + f.id + '">Flight number</label><input type="text" id="no-' + f.id + '" name="no-' + f.id + '" value="' + esc(f.no) + '" placeholder="SQ 516" autocomplete="off"></div>' +
        '<div class="field"><label for="dep-' + f.id + '">Departs (' + (A.zone === "SGT" ? "SG" : "India") + ' time)</label><input type="datetime-local" id="dep-' + f.id + '" name="dep-' + f.id + '" value="' + esc(f.dep) + '"></div></div>' +
        '<div class="grid2"><div class="field"><label for="seat-' + f.id + '">Seat</label><input type="text" id="seat-' + f.id + '" name="seat-' + f.id + '" value="' + esc(f.seat) + '" placeholder="23A" autocomplete="off"></div>' +
        '<div class="field"><label for="gate-' + f.id + '">Gate</label><input type="text" id="gate-' + f.id + '" name="gate-' + f.id + '" value="' + esc(f.gate) + '" placeholder="B4" autocomplete="off"></div></div>' +
        '<div class="grid2"><div class="field"><label for="h-' + f.id + '">Flight length: hours</label><input type="number" min="0" max="20" id="h-' + f.id + '" name="h-' + f.id + '" value="' + Math.floor(f.dur / 60) + '"></div>' +
        '<div class="field"><label for="m-' + f.id + '">Minutes</label><input type="number" min="0" max="59" id="m-' + f.id + '" name="m-' + f.id + '" value="' + (f.dur % 60) + '"></div></div>';
    }).join("");
    sheet.innerHTML = '<form id="flightForm" style="display:flex;flex-direction:column;gap:14px"><h2>Edit flights</h2>' + legHTML +
      '<p class="note">The flight lengths filled in are rough guesses. Copy the real ones from your booking. Seat letter A means a left window; the last letter in a row (like F or K) is usually the right window.</p>' +
      '<div class="actions"><button type="button" class="btn ghost" id="cancelSheet">Cancel</button><button type="submit" class="btn primary">Save</button></div></form>';
    scrim.classList.add("on");
    $("cancelSheet").onclick = closeSheet;
    $("flightForm").onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      state.flights.forEach(f => {
        f.no = String(fd.get("no-" + f.id) || "").trim();
        f.dep = String(fd.get("dep-" + f.id) || "");
        f.seat = String(fd.get("seat-" + f.id) || "").trim();
        f.gate = String(fd.get("gate-" + f.id) || "").trim();
        f.dur = Math.max(10, (parseInt(fd.get("h-" + f.id), 10) || 0) * 60 + (parseInt(fd.get("m-" + f.id), 10) || 0));
      });
      closeSheet(); passesAnimated = true; commit(); toast("Flights saved");
    };
  }
  $("editFlights").onclick = openFlights;
  $("editFlights2").onclick = openFlights;

  // ================= toast =================
  let toastTimer = null;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
  }

  // ================= tabs =================
  const TABS = { passes: "v-passes", flight: "v-flight", checklist: "v-check" };
  let curTab = "passes";
  function showTab(name) {
    if (!TABS[name]) name = "passes";
    curTab = name;
    Object.entries(TABS).forEach(([k, v]) => $(v).classList.toggle("on", k === name));
    document.querySelectorAll("nav.tabs button").forEach(b => { if (b.dataset.tab === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    $("main").scrollTop = 0;
    if (name === "passes") { passesAnimated = false; stampSeen.clear(); renderPasses(); }
    if (name === "flight") { drawNext = true; lastWindowKey = ""; resumeGPS(); renderFlight(); } else pauseGPS();
    if (name === "checklist") renderChecklist();
  }
  document.querySelector("nav.tabs").addEventListener("click", e => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    if (location.hash !== "#" + b.dataset.tab) location.hash = b.dataset.tab; else showTab(b.dataset.tab);
  });
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));

  // ================= loop =================
  function tickClocks() { const now = Date.now(); $("clkS").textContent = hhmm(now, "SGT"); $("clkI").textContent = hhmm(now, "IST"); }
  function renderAll() { renderPasses(); renderFlight(); renderChecklist(); }
  tickClocks();
  setInterval(tickClocks, 1000);
  setInterval(() => { if (curTab === "flight") { renderGPS(); if (!gps.last || Date.now() - gps.last.t > 5000) renderFlight(); } if (curTab === "passes") renderPasses(); }, 5000);

  renderGPS(); renderChecklist();
  try { if (localStorage.getItem(LS_GPS) === "1") { gps.on = true; gps.status = "searching"; } } catch (e) {}
  showTab(location.hash.slice(1) || "passes");
  fetch("map.json").then(r => r.json()).then(m => { MAP = m; buildMapBase(); renderFlight(); })
    .catch(() => { $("overTxt").textContent = "Map couldn't load. Open the app once with internet."; });

  // offline support (only works on your own hosted copy)
  if ("serviceWorker" in navigator && !window.claude) {
    navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then(() => { offlineReady = true; setSync(); }).catch(() => {});
  }
  setSync();
  // test hook for simulated fixes
  window.__fdFix = onFix;
})();
