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
      return g ? { ...f, no: String(g.no || ""), dep: String(g.dep || ""), dur: Math.max(10, +g.dur || f.dur), seat: String(g.seat || ""), gate: String(g.gate || ""), torn: !!g.torn, tornAt: +g.tornAt || 0, tear: g.tear && typeof g.tear.p === "number" ? { p: Math.max(0, Math.min(0.97, g.tear.p)), dir: g.tear.dir === "bottom" ? "bottom" : "top" } : null } : f;
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
  function seeded(str) {
    let h = 2166136261;
    for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
  }
  function barcode(seed) {
    const rnd = seeded(seed);
    let x = 0, r = "";
    while (x < 82) { const w = 1 + Math.floor(rnd() * 3); r += '<rect x="' + x + '" y="0" width="' + w + '" height="28"/>'; x += w + 1 + Math.floor(rnd() * 2.2); }
    return '<svg class="barcode" viewBox="0 0 84 28" preserveAspectRatio="none" aria-hidden="true">' + r + "</svg>";
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
    if (!m) return '<p class="fine">Add your seat (like 23A) with Edit flights below and you\'ll see where you\'re sitting.</p>';
    const row = +m[1], L = m[2].toUpperCase();
    const groups = "ABCDEF".includes(L) ? [["A", "B", "C"], ["D", "E", "F"]] : [["A", "B", "C"], ["D", "E", "F", "G"], ["H", "J", "K"]];
    let html = '<div class="seatmap"><div class="sm-win">WINDOW</div><div class="sm-rows">';
    for (let r = Math.max(1, row - 2); r <= row + 2; r++) {
      html += '<div class="sm-row"><span class="sm-n">' + r + "</span>" + groups.map(g => '<span class="sm-g">' + g.map(c => '<i class="' + (r === row && c === L ? "me" : "") + '">' + (r === row && c === L ? c : "") + "</i>").join("") + "</span>").join("") + "</div>";
    }
    return html + '</div><div class="sm-win">WINDOW</div></div>';
  }
  const fld = (label, val) => '<div class="fld"><small>' + label + "</small><b>" + esc(val) + "</b></div>";
  const fmtDate = (f) => { const t = legTimes(f); if (!t) return "TBC"; const d = zoned(t.dep, AIRPORTS[f.from].zone); return d.getUTCDate() + " " + MONS[d.getUTCMonth()]; };
  function stubInner(f) {
    const st = flightStatus(f, Date.now()), side = seatSide(f.seat);
    return fld("GATE", f.gate ? f.gate.toUpperCase() : "—") + fld("SEAT", f.seat ? f.seat.toUpperCase() : "—") +
      (side === "left" || side === "right" ? '<span class="side">WINDOW · ' + side.toUpperCase() + "</span>" : "") +
      '<div class="stamp ' + st.cls + '">' + st.txt + "</div>" + barcode(f.from + f.to + (f.no || "") + (f.dep || "")) +
      '<span class="tear-hint">PULL TO TEAR ›</span>';
  }
  const stampSeen = new Map();
  let passesAnimated = false, landId = null, boardedThunk = null;
  function renderPasses() {
    const now = Date.now();
    let html = "", i = 0;
    const t1 = legTimes(state.flights[0]), t2 = legTimes(state.flights[1]);
    state.flights.forEach((f, idx) => {
      const A = AIRPORTS[f.from], B = AIRPORTS[f.to], t = legTimes(f), st = flightStatus(f, now);
      const side = seatSide(f.seat);
      html += '<div class="ticket' + (st.past ? " past" : "") + (f.torn ? " torn" : "") + '" data-id="' + f.id + '" style="--i:' + (i++) + (passesAnimated ? ";animation:none" : "") + '">' +
        '<div class="flipper">' +
        '<div class="front">' +
          '<div class="main" tabindex="0" role="button" aria-label="Flip pass to see your seat">' +
            '<div class="tk-top"><span>BOARDING PASS</span><span class="red">LEG ' + (idx + 1) + " OF " + state.flights.length + "</span></div>" +
            '<div class="route"><div><span class="code">' + f.from + '</span><span class="city">' + A.city + "</span></div>" +
            '<div class="path"><svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="' + PLANE_PATH + '"/></svg></div>' +
            '<div class="end"><span class="code">' + f.to + '</span><span class="city">' + B.city + "</span></div></div>" +
            '<div class="fields">' + fld("DATE", fmtDate(f)) + fld("DEPARTS", t ? hhmm(t.dep, A.zone) : "--:--") + fld("LANDS", t ? hhmm(t.arr, B.zone) : "--:--") +
            fld("FLIGHT", f.no ? f.no.toUpperCase() : "—") + fld("LENGTH", durWords(f.dur)) + fld("KM", fmtInt(legLen(f))) + "</div>" +
            (f.torn ? '<div class="boarded' + (boardedThunk === f.id ? " thunk" : "") + '">BOARDED</div>' : "") +
          "</div>" +
          '<div class="stub" aria-label="Boarding pass stub. Drag right to tear it off.">' + stubInner(f) + "</div>" +
        "</div>" +
        '<div class="back" tabindex="0" role="button" aria-label="Flip pass back">' +
          '<div class="tk-top"><span>SEAT MAP · TYPICAL LAYOUT</span><span class="red">' + f.from + " → " + f.to + "</span></div>" +
          seatMap(f.seat) +
          '<p class="fine">' + (side === "left" || side === "right" ? "Window on your " + side + ". " : "") + "Layouts differ between planes, so check when you board. Tap to flip back.</p>" +
          '<p class="fine tiny" style="margin-top:auto">NOT VALID FOR TRAVEL · FLIGHT DECK AIR</p>' +
        "</div>" +
        "</div></div>";
      if (idx === 0 && t1 && t2 && t2.dep > t1.arr) html += '<div class="layover"' + (passesAnimated ? ' style="animation:none"' : "") + ">LAYOVER · <b>" + durWords((t2.dep - t1.arr) / 60000) + "</b> IN KOLKATA</div>";
    });
    $("passes").innerHTML = html;
    renderPocket();
    passesAnimated = true; boardedThunk = null;
    requestAnimationFrame(applyStaticTears);
  }

  // live status updates without rebuilding the passes (keeps flips and tears intact)
  function refreshStamps() {
    const now = Date.now();
    document.querySelectorAll("#passes .ticket").forEach(tk => {
      const f = state.flights.find(x => x.id === tk.dataset.id); if (!f) return;
      const st = flightStatus(f, now);
      tk.classList.toggle("past", !!st.past);
      tk.querySelectorAll(".stub .stamp").forEach(el => { if (el.textContent !== st.txt) { el.textContent = st.txt; el.className = "stamp " + st.cls + " thunk"; } });
    });
  }

  // ---------- stub pocket ----------
  function jagPct(seed) {
    const rnd = seeded(seed), pts = ["100% 0%"];
    for (let y = 0; y <= 100; y += 2.5) pts.push((rnd() * 7 + (y % 5 === 0 ? 5 : 1)).toFixed(1) + "% " + y + "%");
    pts.push("100% 100%");
    return "polygon(" + pts.join(",") + ")";
  }
  let armedMini = null;
  function renderPocket() {
    const torn = state.flights.filter(f => f.torn).sort((a, b) => (a.tornAt || 0) - (b.tornAt || 0));
    const left = state.flights.length - torn.length;
    $("pocketCount").textContent = torn.length ? torn.length + " COLLECTED" : "EMPTY";
    $("pocketRow").innerHTML = torn.map((f, k) =>
      '<div class="mini-wrap"><button class="mini' + (landId === f.id ? " land" : "") + (armedMini === f.id ? " armed" : "") + '" data-mini="' + f.id + '" style="--r:' + (k % 2 ? 4 : -5) + "deg;clip-path:" + jagPct(f.id + "mini") + '" aria-label="Stub ' + f.from + " to " + f.to + '. Tap twice to tape it back.">' +
        '<span class="m-k">' + f.from + "→" + f.to + '</span><span class="code">' + (f.seat ? esc(f.seat.toUpperCase()) : "—") + '</span><span class="m-k">SEAT</span>' +
        '<span class="m-fl">' + esc(f.no ? f.no.toUpperCase() : "") + '</span><span class="m-k">' + fmtDate(f) + "</span>" + barcode(f.id + (f.no || "")) + "</button>" +
        "<small>" + (armedMini === f.id ? "Tap again to tape it back" : "") + "</small></div>").join("") +
      (left ? '<div class="mini-wrap"><div class="slot" id="pocketSlot">TEAR A STUB, IT LANDS HERE</div><small></small></div>' : "");
    $("pocketNote").textContent = torn.length ? "Souvenirs from your trip. Tap a stub twice to tape it back onto its pass." : "When you board, tear the stub off your pass and keep it here.";
    landId = null;
  }
  $("pocketRow").addEventListener("click", e => {
    const m = e.target.closest("[data-mini]"); if (!m) return;
    const id = m.dataset.mini;
    if (armedMini !== id) { armedMini = id; renderPocket(); clearTimeout(renderPocket.t); renderPocket.t = setTimeout(() => { armedMini = null; renderPocket(); }, 3000); return; }
    armedMini = null; tapeBack(id, m);
  });

  // ---------- torn-edge geometry ----------
  // Perforation holes every 7px; tearing through them leaves little scallops plus loose fibres.
  const HOLE = 7;
  const profiles = new Map();
  function profile(id, H) {
    const key = id + ":" + Math.round(H);
    if (profiles.has(key)) return profiles.get(key);
    const rnd = seeded(key), a = [], b = [];
    for (let y = 0; y <= H; y += 1.5) {
      const ph = (y % HOLE) / HOLE;
      const scallop = Math.max(0, Math.sin(ph * Math.PI)) * 2.1;
      const fibre = rnd() < 0.12 ? rnd() * 2.6 : rnd() * 0.8;
      a.push([y, 0.6 + scallop * (rnd() < 0.5 ? 1 : 0.4) + fibre]);
      b.push([y, 0.6 + scallop * (rnd() < 0.5 ? 0.4 : 1) + (rnd() < 0.12 ? rnd() * 2.6 : rnd() * 0.8)]);
    }
    const p = { main: a, stub: b };
    profiles.set(key, p);
    return p;
  }
  const P = (x, y) => x.toFixed(1) + "px " + y.toFixed(1) + "px";
  function edgeIn(prof, y0, y1) { return prof.filter(([y]) => y >= y0 && y <= y1); }
  function mainClip(W, H, seg, prof) {
    if (!seg) return "none";
    const [y0, y1] = seg, pts = [P(0, 0)];
    if (y0 > 0) pts.push(P(W + 2, 0), P(W + 2, y0));
    edgeIn(prof, y0, y1).forEach(([y, d]) => pts.push(P(W - d, y)));
    if (y1 < H) pts.push(P(W + 2, y1), P(W + 2, H)); else pts.push(P(W - 1, H));
    pts.push(P(0, H));
    return "polygon(" + pts.join(",") + ")";
  }
  // stub outline between rows ya..yb, torn (jagged) on its left side where it overlaps seg
  function stubClip(w, H, seg, prof, ya, yb) {
    const pts = [P(w + 2, ya)];
    const s0 = seg ? Math.max(ya, seg[0]) : 0, s1 = seg ? Math.min(yb, seg[1]) : 0;
    if (!seg || s1 <= s0) pts.push(P(-2, ya), P(-2, yb));
    else {
      if (s0 > ya) pts.push(P(-2, ya), P(-2, s0)); else pts.push(P(2, ya));
      edgeIn(prof, s0, s1).forEach(([y, d]) => pts.push(P(d, y)));
      if (s1 < yb) pts.push(P(-2, s1), P(-2, yb)); else pts.push(P(2, yb));
    }
    pts.push(P(w + 2, yb));
    return "polygon(" + pts.join(",") + ")";
  }
  function tearSeg(tear, H) {
    if (!tear || !(tear.p > 0)) return null;
    const e = Math.min(1, tear.p) * H;
    return tear.dir === "bottom" ? [H - e, H] : [0, e];
  }
  function applyStaticTears() {
    document.querySelectorAll("#passes .ticket").forEach(tk => {
      const f = state.flights.find(x => x.id === tk.dataset.id); if (!f || tk.classList.contains("flipped")) return;
      const main = tk.querySelector(".main"), stub = tk.querySelector(".front > .stub");
      const W = main.offsetWidth, H = main.offsetHeight, w = stub.offsetWidth;
      const prof = profile(f.id, H);
      const seg = f.torn ? [0, H] : tearSeg(f.tear, H);
      main.style.clipPath = main.style.webkitClipPath = mainClip(W, H, seg, prof.main);
      stub.style.clipPath = stub.style.webkitClipPath = seg && !f.torn ? stubClip(w, H, seg, prof.stub, 0, H) : "";
    });
  }
  window.addEventListener("resize", () => requestAnimationFrame(applyStaticTears));

  // ---------- sound (synthesised, no files) ----------
  let actx = null, noiseBuf = null, tearSnd = null;
  function audio() {
    try {
      if (!actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (actx.state === "suspended") actx.resume();
      return actx;
    } catch (e) { return null; }
  }
  function burst(dur, freq, q, vol, type) {
    const a = audio(); if (!a) return;
    const t = a.currentTime, s = a.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.6;
    const f = a.createBiquadFilter(); f.type = type || "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }
  function tearStart() {
    const a = audio(); if (!a || tearSnd) return;
    const s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const hp = a.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1400;
    const bp = a.createBiquadFilter(); bp.type = "peaking"; bp.frequency.value = 3200; bp.gain.value = 6;
    const g = a.createGain(); g.gain.value = 0;
    s.connect(hp); hp.connect(bp); bp.connect(g); g.connect(a.destination); s.start();
    tearSnd = { s, g };
  }
  function tearLevel(v) { if (tearSnd && actx) tearSnd.g.gain.setTargetAtTime(Math.min(0.55, v), actx.currentTime, 0.025); }
  function tearStop() { if (!tearSnd || !actx) return; const t = tearSnd; tearSnd = null; t.g.gain.setTargetAtTime(0, actx.currentTime, 0.03); setTimeout(() => { try { t.s.stop(); } catch (e) {} }, 200); }
  const perfTick = () => burst(0.018 + Math.random() * 0.02, 2200 + Math.random() * 2500, 1.2, 0.55);
  function snapSound() {
    burst(0.07, 2600, 0.7, 0.9);
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.08);
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.12);
  }
  const flapSound = () => burst(0.11, 700, 0.6, 0.5, "lowpass");
  function stampSound() {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.18);
    burst(0.05, 900, 0.8, 0.35, "lowpass");
  }
  function tapeSound() {
    const a = audio(); if (!a) return;
    const t = a.currentTime, s = a.createBufferSource(); s.buffer = noiseBuf;
    const f = a.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 2; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(4200, t + 0.32);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t); s.stop(t + 0.4);
  }

  // ---------- the tear ----------
  // Grab the stub and pull right. The tear runs along the perforation from the end nearest your finger;
  // the torn part hinges at the tear tip while the rest stays attached. Let go early and the tear stays.
  const TEAR_LEN = 118;           // px of pull to tear all the way through
  let T = null, quietUntil = 0;
  const passesEl = $("passes");
  passesEl.addEventListener("pointerdown", e => {
    const stub = e.target.closest(".front > .stub"); if (!stub || T) return;
    const tk = stub.closest(".ticket"); if (tk.classList.contains("torn")) return;
    const f = state.flights.find(x => x.id === tk.dataset.id); if (!f) return;
    audio();
    const r = stub.getBoundingClientRect();
    const dir = f.tear && f.tear.p > 0 ? f.tear.dir : (e.clientY - r.top < r.height / 2 ? "top" : "bottom");
    T = { f, tk, stub, main: tk.querySelector(".main"), front: tk.querySelector(".front"), id: e.pointerId, x0: e.clientX, y0: e.clientY,
      dir, live: false, H: stub.offsetHeight, w: stub.offsetWidth, W: tk.querySelector(".main").offsetWidth,
      e: (f.tear && f.tear.p > 0 ? f.tear.p : 0) * stub.offsetHeight, ang: 0, lastE: 0, lastT: performance.now(), piece: null, raf: 0 };
    T.lastE = T.e;
  });
  passesEl.addEventListener("pointermove", e => {
    if (!T || e.pointerId !== T.id) return;
    const dx = e.clientX - T.x0, dy = e.clientY - T.y0;
    if (!T.live) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { T = null; return; }   // it's a scroll
      if (dx < 7) return;
      T.live = true;
      try { T.stub.setPointerCapture(e.pointerId); } catch (err) {}
      beginTear();
    }
    e.preventDefault();
    // pulling slightly toward the attached end makes the tear go faster, like real paper
    const assist = T.dir === "top" ? dy : -dy;
    const pull = Math.max(0, dx + Math.max(0, assist) * 0.35);
    T.ang = Math.min(34, pull * 0.24);
    const target = Math.max(0, Math.min(1, (pull - 10) / TEAR_LEN)) * T.H;
    if (target > T.e) T.e = target;          // paper never heals
    if (!T.raf) T.raf = requestAnimationFrame(drawTear);
  });
  function beginTear() {
    T.tk.classList.add("tearing");
    T.stub.classList.remove("nudge");
    const piece = T.stub.cloneNode(true);
    piece.classList.add("piece");
    piece.style.left = T.W + "px"; piece.style.width = T.w + "px"; piece.style.height = T.H + "px";
    T.front.appendChild(piece);
    T.piece = piece;
    tearStart();
    drawTear();
  }
  function drawTear() {
    if (!T) return;
    T.raf = 0;
    const { H, w, W } = T;
    const prof = profile(T.f.id, H);
    const seg = T.dir === "top" ? [0, T.e] : [H - T.e, H];
    const tip = T.dir === "top" ? T.e : H - T.e;
    T.main.style.clipPath = T.main.style.webkitClipPath = mainClip(W, H, T.e > 0.5 ? seg : null, prof.main);
    // attached part (no tear) and torn flap
    const att = T.dir === "top" ? [tip, H] : [0, tip];
    const flap = T.dir === "top" ? [0, tip] : [tip, H];
    T.stub.style.clipPath = T.stub.style.webkitClipPath = att[1] - att[0] > 0.5 ? stubClip(w, H, null, prof.stub, att[0], att[1]) : "polygon(0 0,0 0,0 0)";
    T.piece.style.clipPath = T.piece.style.webkitClipPath = flap[1] - flap[0] > 0.5 ? stubClip(w, H, seg, prof.stub, flap[0], flap[1]) : "polygon(0 0,0 0,0 0)";
    // the torn flap shears away from the tip (paper bends there, it doesn't cut), plus a slight lift
    const lift = Math.min(1, T.ang / 20);
    T.piece.style.transformOrigin = "0px " + tip.toFixed(1) + "px";
    T.piece.style.transform = flapTransform(T.dir, T.ang, lift);
    T.piece.style.filter = "drop-shadow(" + (2 + lift * 4).toFixed(1) + "px " + (3 + lift * 7).toFixed(1) + "px " + (3 + lift * 6).toFixed(1) + "px rgba(30,35,49," + (0.12 + lift * 0.2).toFixed(2) + "))";
    // sound follows how fast the tear moves; a snap for each perforation hole it passes
    const now = performance.now(), dt = Math.max(8, now - T.lastT), dE = T.e - T.lastE;
    const holesBefore = Math.floor(T.lastE / HOLE), holesNow = Math.floor(T.e / HOLE);
    for (let k = 0; k < Math.min(3, holesNow - holesBefore); k++) setTimeout(perfTick, k * 9);
    tearLevel(dE > 0 ? Math.min(1, dE / dt * 0.9) : 0);
    T.lastE = T.e; T.lastT = now;
    if (T.e >= H - 0.5) detach();
  }
  function flapTransform(dir, ang, lift) {
    const sk = (dir === "top" ? -1 : 1) * ang * 0.9, rot = (dir === "top" ? 1 : -1) * ang * 0.12;
    return "skewX(" + sk.toFixed(2) + "deg) rotate(" + rot.toFixed(2) + "deg) translateX(" + (lift * 2).toFixed(2) + "px) scale(" + (1 + lift * 0.012).toFixed(3) + ")";
  }
  function endTear(e) {
    if (!T || (e && e.pointerId !== T.id)) return;
    if (!T.live) { T = null; return; }
    quietUntil = performance.now() + 450;
    if (T.done) return;
    tearStop();
    const t = T; T = null;
    // keep the partial tear, let the flap settle back down with a springy wobble
    t.f.tear = t.e > 1.5 ? { p: Math.min(0.97, t.e / t.H), dir: t.dir } : t.f.tear;
    commit({ quiet: true });
    const a0 = t.ang, start = performance.now();
    (function settle(now) {
      const k = (now - start) / 420;
      const a = a0 * Math.exp(-5 * k) * Math.cos(9 * k);
      t.piece.style.transform = flapTransform(t.dir, a, 0);
      if (k < 1) requestAnimationFrame(settle);
      else { t.piece.remove(); t.tk.classList.remove("tearing"); t.stub.style.clipPath = t.stub.style.webkitClipPath = ""; applyStaticTears(); }
    })(start);
  }
  passesEl.addEventListener("pointerup", endTear);
  passesEl.addEventListener("pointercancel", endTear);
  function detach() {
    const t = T; t.done = true; T = null; quietUntil = performance.now() + 1500;
    tearStop(); snapSound();
    const H = t.H, w = t.w, prof = profile(t.f.id, H);
    t.stub.style.visibility = "hidden";
    t.main.style.clipPath = t.main.style.webkitClipPath = mainClip(t.W, H, [0, H], prof.main);
    // fly the whole torn stub into the pocket
    const piece = t.piece;
    piece.style.clipPath = piece.style.webkitClipPath = stubClip(w, H, [0, H], prof.stub, 0, H);
    const r0 = t.stub.getBoundingClientRect();
    const sign = t.dir === "top" ? 1 : -1;
    // the flap is sheared around the far end; as it comes free it springs flat and starts flying from there
    const startT = t.piece.style.transform;
    piece.style.transformOrigin = "0px " + (t.dir === "top" ? H : 0) + "px";
    const Tx = 0, Ty = 0;
    const slot = $("pocketSlot"), mainBox = $("main").getBoundingClientRect();
    let target, scale = 0.6, endRot = -5;
    if (slot) {
      const s = slot.getBoundingClientRect();
      scale = s.width / w;
      target = { x: s.left + s.width / 2, y: s.top + s.height / 2 };
      if (target.y > mainBox.bottom - 20) target = null;
    }
    const c0 = { x: r0.left + w / 2, y: r0.top + H / 2 };
    const end = target || { x: c0.x + 40, y: mainBox.bottom + H };
    const ctrl = { x: Math.max(c0.x, end.x) + 70, y: Math.min(c0.y, end.y) - 30 };
    const frames = [];
    for (let k = 0; k <= 16; k++) {
      const u = k / 16, iu = 1 - u;
      const x = iu * iu * c0.x + 2 * iu * u * ctrl.x + u * u * end.x - c0.x;
      const y = iu * iu * c0.y + 2 * iu * u * ctrl.y + u * u * end.y - c0.y;
      const rot = sign * t.ang * iu + endRot * u + Math.sin(u * Math.PI * 2.2) * 16 * iu;
      const sc = 1 + (scale - 1) * u;
      const ry = Math.sin(u * Math.PI) * 35;  // paper flutter
      frames.push({ transform: "translate(" + (Tx * iu + x).toFixed(1) + "px," + (Ty * iu + y).toFixed(1) + "px) rotate(" + rot.toFixed(1) + "deg) rotateY(" + ry.toFixed(1) + "deg) scale(" + sc.toFixed(3) + ")", opacity: target || u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3 });
    }
    // first spring the sheared flap straight (fast), then fly from its centre
    frames.unshift({ transform: startT, offset: 0 });
    frames[1].offset = 0.12;
    piece.style.transformOrigin = "50% 50%";
    const fixOrigin = frames.map((fr, k) => k === 0 ? Object.assign({}, fr, { transformOrigin: "0px " + (t.dir === "top" ? H : 0) + "px" }) : Object.assign({}, fr, { transformOrigin: "50% 50%" }));
    const anim = piece.animate(fixOrigin, { duration: 900, easing: "cubic-bezier(.35,.1,.25,1)", fill: "forwards" });
    anim.onfinish = () => {
      t.f.torn = true; t.f.tear = null; t.f.tornAt = Date.now();
      landId = t.f.id; boardedThunk = t.f.id;
      commit({ quiet: true });
      renderPasses();
      if (target) flapSound(); else toast("Stub saved in your pocket ↓");
      setTimeout(stampSound, 160);
    };
  }

  function tapeBack(id, miniEl) {
    const f = state.flights.find(x => x.id === id); if (!f) return;
    const tk = document.querySelector('#passes .ticket[data-id="' + id + '"]');
    const stub = tk && tk.querySelector(".front > .stub");
    const finish = () => { f.torn = false; f.tear = null; commit({ quiet: true }); renderPasses(); tapeSound(); };
    if (!stub || !miniEl.animate) { finish(); return; }
    const a = miniEl.getBoundingClientRect(), b = stub.getBoundingClientRect();
    const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    const sc = b.width / a.width, r0 = parseFloat(miniEl.style.getPropertyValue("--r")) || 0;
    miniEl.style.zIndex = 50;
    miniEl.animate([{ transform: "rotate(" + r0 + "deg)" }, { transform: "translate(" + dx * 0.5 + "px," + (dy * 0.5 - 40) + "px) rotate(10deg) scale(" + (1 + (sc - 1) * 0.5) + ")" }, { transform: "translate(" + dx + "px," + dy + "px) rotate(0deg) scale(" + sc + ")", opacity: 0.4 }],
      { duration: 520, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" }).onfinish = finish;
  }

  // ---------- flip ----------
  function flipPass(tk) {
    if (tk.dataset.busy) return;
    const fl = tk.querySelector(".flipper"), h = fl.offsetHeight;
    tk.dataset.busy = "1";
    const back = tk.querySelector(".back");
    if (!fl.animate) { tk.classList.toggle("flipped"); back.style.minHeight = h + "px"; delete tk.dataset.busy; return; }
    fl.animate([{ transform: "perspective(900px) rotateY(0deg)" }, { transform: "perspective(900px) rotateY(90deg)" }], { duration: 160, easing: "ease-in" }).onfinish = () => {
      tk.classList.toggle("flipped");
      back.style.minHeight = h + "px";
      if (!tk.classList.contains("flipped")) applyStaticTears();
      fl.animate([{ transform: "perspective(900px) rotateY(-90deg)" }, { transform: "perspective(900px) rotateY(0deg)" }], { duration: 260, easing: "cubic-bezier(.2,1.25,.4,1)" }).onfinish = () => { delete tk.dataset.busy; };
    };
  }
  passesEl.addEventListener("click", e => {
    if (performance.now() < quietUntil) return;
    const stub = e.target.closest(".front > .stub");
    if (stub) {
      stub.classList.remove("nudge"); void stub.offsetWidth; stub.classList.add("nudge");
      toast("Pull the stub to the right to tear it off");
      return;
    }
    const tk = e.target.closest(".ticket");
    if (tk && (e.target.closest(".main") || e.target.closest(".back"))) flipPass(tk);
  });
  passesEl.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const tk = e.target.closest(".ticket"); if (!tk) return;
    e.preventDefault(); flipPass(tk);
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
      side === "aisle" ? "Seat " + P.leg.seat.toUpperCase() + " looks like a middle or aisle seat. Lean over!" : "Add your seat with Edit flights on the Passes tab and your window side gets highlighted.";
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
    if (name === "passes") { passesAnimated = false; stampSeen.clear(); renderPasses(); hintTear(); }
    if (name === "flight") { drawNext = true; lastWindowKey = ""; resumeGPS(); renderFlight(); } else pauseGPS();
    if (name === "checklist") renderChecklist();
  }
  document.querySelector("nav.tabs").addEventListener("click", e => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    if (location.hash !== "#" + b.dataset.tab) location.hash = b.dataset.tab; else showTab(b.dataset.tab);
  });
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));

  // first visit: the first untorn stub gives a little wiggle so you know it moves
  let hinted = false;
  function hintTear() {
    if (hinted) return; hinted = true;
    setTimeout(() => { const st = document.querySelector("#passes .ticket:not(.torn) .front > .stub"); if (st) { st.classList.add("nudge"); } }, 1100);
  }

  // ================= loop =================
  function tickClocks() { const now = Date.now(); $("clkS").textContent = hhmm(now, "SGT"); $("clkI").textContent = hhmm(now, "IST"); }
  function renderAll() { renderPasses(); renderFlight(); renderChecklist(); }
  tickClocks();
  setInterval(tickClocks, 1000);
  setInterval(() => { if (curTab === "flight") { renderGPS(); if (!gps.last || Date.now() - gps.last.t > 5000) renderFlight(); } if (curTab === "passes") refreshStamps(); }, 5000);

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
