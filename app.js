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
      stamps: [],
      checklist: defaultChecklist()
    };
  }
  function sanitize(s) {
    const d = defaults();
    if (!s || typeof s !== "object") return d;
    const out = { v: 2, updatedAt: +s.updatedAt || 0 };
    out.flights = d.flights.map(f => {
      const g = Array.isArray(s.flights) ? s.flights.find(x => x && x.id === f.id) : null;
      return g ? { ...f, no: String(g.no || ""), dep: String(g.dep || ""), dur: Math.max(10, +g.dur || f.dur), seat: String(g.seat || ""), gate: String(g.gate || ""), torn: !!g.torn, tornAt: +g.tornAt || 0, tear: g.tear && typeof g.tear.p === "number" ? { p: Math.max(0, Math.min(0.97, g.tear.p)), dir: g.tear.dir === "bottom" ? "bottom" : "top" } : null,
        stickers: Array.isArray(g.stickers) ? g.stickers.filter(k => k && typeof k.t === "string").slice(-14).map(k => ({ t: String(k.t), x: Math.max(0, Math.min(100, +k.x || 0)), y: Math.max(0, Math.min(100, +k.y || 0)), r: +k.r || 0, s: Math.max(0.6, Math.min(1.6, +k.s || 1)) })) : [] } : f;
    });
    out.stamps = Array.isArray(s.stamps) ? s.stamps.filter(x => x && typeof x.id === "string").map(x => ({ id: x.id, at: +x.at || Date.now(), r: +x.r || 0, dx: +x.dx || 0 })) : [];
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
    else if (gps.airborne && spd < 25) { if (++gps.slowCount >= 3) { gps.airborne = false; const near = nearestAirport(fix); toast(near ? "Touchdown in " + near.name + ". Passport stamped!" : "Touchdown"); if (near) { const code = Object.keys(AIRPORTS).find(k => AIRPORTS[k] === near); if (code !== "SIN") addStamp("arr-" + code); } } }
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
      '<span class="tear-hint">PULL TO TEAR ↘</span>';
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
            stickersHTML(f) +
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
    autoStamps();
    renderPassport();
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
  function audio(create) {
    try {
      if (!actx && !create) return null;
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

  // sound can only start after a tap, so unlock it on the first touch anywhere
  document.addEventListener("pointerdown", () => audio(true), true);

  // ---------- the tear ----------
  // Grab the stub and pull right. The tear runs along the perforation from the end nearest your finger;
  // the torn part hinges at the tear tip while the rest stays attached. Let go early and the tear stays.
  const TEAR_LEN = 92;            // px of pull to tear all the way through
  let T = null, quietUntil = 0;
  const passesEl = $("passes");
  // works the same for a finger (touch events, which iPhone Safari handles most reliably) and a mouse (pointer events)
  function tearDown(x, y, target, id) {
    if (stickerMode || T) return false;
    const stub = target && target.closest && target.closest(".front > .stub"); if (!stub) return false;
    const tk = stub.closest(".ticket"); if (tk.classList.contains("torn") || tk.classList.contains("flipped")) return false;
    const f = state.flights.find(z => z.id === tk.dataset.id); if (!f) return false;
    const partial = f.tear && f.tear.p > 0;
    T = { f, tk, stub, main: tk.querySelector(".main"), front: tk.querySelector(".front"), id, x0: x, y0: y,
      dir: partial ? f.tear.dir : null, live: false, H: stub.offsetHeight, w: stub.offsetWidth, W: tk.querySelector(".main").offsetWidth,
      e: (partial ? f.tear.p : 0) * stub.offsetHeight, ang: 0, lastE: 0, lastT: performance.now(), piece: null, raf: 0 };
    T.lastE = T.e;
    return true;
  }
  function tearMove(x, y, id) {
    if (!T || id !== T.id) return false;
    const dx = x - T.x0, dy = y - T.y0;
    if (!T.live) {
      if (Math.hypot(dx, dy) < 6) return true;
      if (dx < -8 && Math.abs(dy) < Math.abs(dx)) { T = null; return false; }   // dragging left, back into the pass: not a tear
      // which end rips first depends on how you pull: drag down and the top gives way, drag up and the bottom does
      if (!T.dir) T.dir = dy < -3 ? "bottom" : "top";
      T.live = true;
      beginTear();
    }
    const along = T.dir === "top" ? dy : -dy;
    const pull = Math.max(0, dx) * 1.1 + Math.max(0, along);
    T.ang = Math.min(34, pull * 0.26);
    const target = Math.max(0, Math.min(1, (pull - 8) / TEAR_LEN)) * T.H;
    if (target > T.e) T.e = target;          // paper never heals
    if (!T.raf) T.raf = requestAnimationFrame(drawTear);
    return true;
  }
  // mouse / pen
  passesEl.addEventListener("pointerdown", e => { if (e.pointerType === "touch") return; if (tearDown(e.clientX, e.clientY, e.target, "p" + e.pointerId)) { try { e.target.closest(".stub").setPointerCapture(e.pointerId); } catch (err) {} } });
  passesEl.addEventListener("pointermove", e => { if (e.pointerType === "touch") return; if (tearMove(e.clientX, e.clientY, "p" + e.pointerId) && T && T.live) e.preventDefault(); });
  // finger
  passesEl.addEventListener("touchstart", e => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (tearDown(t.clientX, t.clientY, e.target, "t" + t.identifier)) e.preventDefault();   // stops iOS from scrolling or selecting
  }, { passive: false });
  passesEl.addEventListener("touchmove", e => {
    if (!T) return;
    const t = Array.from(e.changedTouches).find(z => "t" + z.identifier === T.id); if (!t) return;
    e.preventDefault();
    tearMove(t.clientX, t.clientY, T.id);
  }, { passive: false });
  passesEl.addEventListener("touchend", e => {
    if (!T) return;
    const t = Array.from(e.changedTouches).find(z => "t" + z.identifier === T.id); if (!t) return;
    const wasLive = T.live;
    endTear({ pointerId: T.id });
    if (!wasLive) {                         // a simple tap on the stub: show how
      const stub = e.target.closest && e.target.closest(".front > .stub");
      if (stub) { stub.classList.remove("nudge"); void stub.offsetWidth; stub.classList.add("nudge"); toast("Hold the stub and drag it down and to the right"); }
    }
  });
  passesEl.addEventListener("touchcancel", () => { if (T) endTear({ pointerId: T.id }); });
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
  passesEl.addEventListener("pointerup", e => { if (e.pointerType !== "touch") endTear({ pointerId: "p" + e.pointerId }); });
  passesEl.addEventListener("pointercancel", e => { if (e.pointerType !== "touch") endTear({ pointerId: "p" + e.pointerId }); });
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
    if (performance.now() < quietUntil || stickerMode) return;
    const stub = e.target.closest(".front > .stub");
    if (stub) {
      stub.classList.remove("nudge"); void stub.offsetWidth; stub.classList.add("nudge");
      toast("Hold the stub and drag it down and to the right");
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
    $("windowSides").dataset.sky = sky;
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
    const col = (name, arr, mine) => '<div class="side-col' + (mine ? " mine" : "") + '"><h4><i class="wicon" aria-hidden="true"></i>' + name + (mine ? "<span>YOUR SIDE</span>" : "") + "</h4>" + list(arr) + "</div>";
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
    if (stickerMode && name !== "passes") setStickerMode(false);
    Object.entries(TABS).forEach(([k, v]) => $(v).classList.toggle("on", k === name));
    document.querySelectorAll("nav.tabs button").forEach(b => { if (b.dataset.tab === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    document.querySelector("nav.tabs").style.setProperty("--idx", Object.keys(TABS).indexOf(name));
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

  // ================= STICKERS =================
  const INDIA_D = "M2.0 43.2 L3.1 42.8 L3.9 41.8 L4.9 41.8 L6.2 41.8 L7.1 42.2 L8.3 41.9 L9.0 41.5 L10.0 41.8 L11.0 41.6 L11.3 40.6 L10.9 39.2 L10.4 38.4 L10.2 37.4 L9.1 37.2 L8.4 36.4 L8.5 35.0 L7.8 34.2 L6.7 33.8 L6.4 33.0 L6.8 32.1 L7.7 31.3 L8.2 30.6 L8.7 29.9 L9.7 29.5 L10.2 30.1 L10.9 30.5 L12.0 30.1 L13.1 30.0 L14.2 29.7 L15.1 28.4 L15.6 27.3 L16.7 26.6 L17.6 26.2 L18.4 25.1 L18.8 24.3 L19.2 23.2 L20.1 22.9 L20.9 22.5 L21.2 21.3 L21.9 20.5 L22.9 19.8 L23.2 18.2 L23.0 17.2 L23.6 16.6 L24.7 16.1 L25.6 15.7 L24.9 15.0 L23.8 14.9 L23.4 13.9 L22.2 13.7 L21.6 12.9 L21.7 11.6 L21.1 10.9 L21.9 10.2 L21.0 9.8 L20.6 8.8 L21.1 7.7 L22.2 7.3 L23.2 7.5 L24.3 7.7 L25.4 7.9 L26.5 8.2 L27.6 7.8 L29.3 7.3 L30.3 7.0 L31.1 6.6 L31.6 6.0 L32.5 5.6 L33.4 5.1 L34.4 4.9 L34.6 6.1 L35.2 7.3 L36.1 8.0 L36.9 8.3 L37.6 8.8 L36.8 9.5 L37.0 11.0 L37.4 11.8 L38.0 12.4 L38.3 13.3 L38.4 14.6 L37.7 15.2 L36.9 14.9 L36.1 14.5 L35.9 15.4 L36.6 16.3 L36.8 17.5 L36.8 18.6 L37.7 18.4 L38.4 18.9 L38.9 19.5 L39.8 19.8 L40.7 20.1 L41.6 20.5 L42.3 21.3 L43.2 21.6 L44.2 22.2 L43.2 23.0 L42.3 23.9 L41.8 24.9 L41.5 25.9 L41.1 26.7 L42.0 27.4 L43.2 27.6 L43.9 28.0 L44.8 28.5 L45.9 29.4 L46.7 29.9 L47.9 30.0 L49.0 30.7 L49.9 31.1 L51.1 31.4 L52.0 31.5 L53.3 31.5 L54.4 31.2 L55.7 31.7 L56.3 32.6 L57.2 33.1 L58.0 33.6 L59.3 33.4 L59.8 34.0 L61.1 34.1 L62.5 34.5 L64.0 34.3 L64.9 35.0 L66.1 34.8 L67.2 34.9 L67.8 33.8 L67.2 32.6 L67.3 31.5 L67.8 30.4 L68.2 29.7 L69.0 29.4 L70.0 29.9 L69.7 31.1 L70.2 31.8 L70.1 33.0 L71.1 33.5 L72.1 33.5 L73.1 33.8 L74.2 33.7 L75.0 33.2 L75.9 33.6 L77.6 33.5 L78.6 33.3 L79.6 33.4 L80.6 33.3 L80.5 32.2 L79.9 31.4 L79.1 31.0 L79.8 30.4 L80.8 30.2 L82.0 30.1 L82.7 29.6 L83.3 28.8 L84.1 28.3 L84.5 27.5 L85.9 27.3 L86.7 26.9 L87.4 26.3 L88.0 25.8 L89.1 25.3 L90.2 25.8 L91.2 26.1 L92.0 25.6 L93.2 25.0 L94.2 25.4 L94.1 26.4 L95.0 26.1 L95.5 27.1 L94.7 27.9 L95.7 28.1 L96.8 28.5 L97.8 28.8 L98.0 29.8 L97.0 30.4 L96.5 30.9 L97.2 32.3 L96.2 31.9 L94.5 31.9 L93.5 32.4 L92.7 33.0 L91.8 33.6 L91.0 34.0 L90.5 35.0 L90.7 36.0 L90.3 36.9 L89.6 37.7 L88.9 38.4 L89.3 39.1 L89.0 40.2 L88.3 41.1 L87.7 42.4 L87.0 43.1 L86.0 42.7 L84.9 42.5 L85.1 43.8 L85.0 44.9 L84.7 45.9 L84.1 46.6 L84.2 48.1 L83.8 48.8 L82.6 48.9 L82.2 48.0 L82.0 46.9 L81.6 45.8 L81.4 44.4 L80.9 43.7 L80.2 44.0 L79.7 44.8 L79.6 45.9 L78.7 45.6 L78.0 44.8 L77.7 43.8 L78.2 42.7 L79.1 42.2 L80.1 41.9 L80.8 41.4 L81.1 40.5 L81.7 39.9 L81.1 39.1 L79.6 38.9 L78.5 38.9 L77.3 38.9 L75.9 38.9 L74.7 38.8 L73.4 38.5 L73.2 36.7 L72.9 35.6 L72.1 36.2 L71.2 35.8 L70.8 34.9 L70.0 35.3 L69.3 34.7 L68.7 34.3 L68.4 35.3 L67.8 35.9 L68.1 36.8 L68.8 37.6 L69.8 37.8 L70.4 38.5 L69.5 38.8 L68.5 39.6 L67.4 40.4 L68.0 41.2 L68.9 41.6 L69.7 42.1 L69.3 43.3 L69.6 44.4 L69.9 45.3 L70.1 46.2 L70.5 47.6 L70.8 48.7 L70.4 49.5 L70.7 50.5 L69.7 50.7 L69.7 49.3 L69.1 49.9 L68.8 50.6 L67.7 50.5 L67.9 49.2 L67.2 48.5 L67.1 49.9 L66.2 50.5 L64.6 50.8 L63.8 51.4 L63.5 52.2 L63.8 53.4 L63.2 54.5 L62.3 55.3 L61.7 55.9 L60.2 56.6 L59.3 56.9 L58.2 56.7 L56.6 58.8 L56.1 59.6 L55.6 60.2 L54.7 61.2 L53.0 62.2 L52.1 63.2 L51.5 63.8 L50.8 64.2 L49.5 64.9 L48.7 65.4 L48.7 66.7 L48.0 67.4 L46.7 68.0 L45.6 67.8 L44.7 69.2 L44.2 69.8 L43.3 69.4 L42.2 69.7 L41.3 71.3 L41.3 73.0 L41.5 74.0 L41.3 74.9 L41.7 76.1 L42.0 77.3 L41.5 76.6 L41.9 77.5 L41.7 79.9 L41.1 81.2 L40.5 82.2 L40.2 83.2 L40.1 84.3 L40.5 86.3 L40.4 87.7 L38.9 87.8 L38.5 88.7 L37.7 89.8 L37.5 90.8 L38.6 91.2 L35.8 91.7 L35.0 92.4 L34.8 93.7 L33.6 94.7 L32.8 95.1 L31.3 94.3 L29.8 92.6 L29.4 91.8 L28.9 90.6 L28.6 89.0 L29.0 89.7 L28.6 88.7 L28.2 87.7 L27.5 86.2 L27.3 85.3 L26.9 84.3 L26.2 83.2 L25.5 82.3 L24.3 80.4 L24.1 79.4 L23.5 77.2 L23.2 76.1 L22.7 75.1 L22.5 74.0 L21.9 73.3 L21.3 72.5 L20.9 71.3 L20.5 70.5 L19.9 69.5 L19.4 68.6 L19.0 67.5 L18.7 65.1 L18.4 64.0 L18.1 62.8 L17.8 61.6 L17.7 60.6 L17.9 59.4 L17.3 58.5 L17.0 57.3 L17.0 55.6 L17.5 54.0 L17.4 52.8 L16.9 52.0 L17.0 50.8 L18.0 50.3 L16.4 50.3 L16.7 49.5 L17.0 48.6 L15.7 48.4 L15.2 49.3 L15.5 50.4 L14.9 51.9 L13.2 52.7 L11.4 53.5 L9.6 53.1 L8.5 52.3 L7.2 50.9 L6.5 50.4 L5.4 49.3 L4.8 48.7 L5.2 47.9 L6.6 48.0 L8.1 47.5 L9.1 46.6 L9.7 46.0 L8.7 46.1 L7.6 46.5 L5.6 46.5 L4.2 45.9 L3.2 44.8 L3.0 43.9 L4.0 43.2 L3.1 43.6 L2.2 44.0Z";
  const ST = {
    plane: '<path transform="translate(50 50) rotate(45) scale(3.7)" fill="#c8362d" d="' + PLANE_PATH + '"/>',
    chai: '<path d="M22 34 L78 34 L68 86 Q50 92 32 86 Z" fill="#c4683b"/><path d="M22 34 L78 34 L76 44 L24 44 Z" fill="#9c4a26"/><ellipse cx="50" cy="35" rx="28" ry="6" fill="#d9a066"/><path d="M34 60 Q50 66 66 60" stroke="#9c4a26" stroke-width="3" fill="none"/><path d="M42 26 q-6 -8 0 -14 q6 -6 0 -12" stroke="#a79f92" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M58 26 q-6 -8 0 -14 q6 -6 0 -12" stroke="#a79f92" stroke-width="4" fill="none" stroke-linecap="round"/>',
    sun: '<g fill="#f59e2b">' + Array.from({ length: 12 }, (_, k) => '<path transform="rotate(' + k * 30 + ' 50 50)" d="M50 6 L56 22 L44 22 Z"/>').join("") + '</g><circle cx="50" cy="50" r="24" fill="#ffc93c"/><circle cx="42" cy="47" r="2.6" fill="#7a4a12"/><circle cx="58" cy="47" r="2.6" fill="#7a4a12"/><path d="M41 56 Q50 64 59 56" stroke="#7a4a12" stroke-width="3" fill="none" stroke-linecap="round"/>',
    palm: '<path d="M52 92 Q46 64 54 40" stroke="#8a5a2b" stroke-width="9" fill="none" stroke-linecap="round"/><g fill="#2f9a52"><path d="M54 40 Q30 22 8 34 Q32 30 54 44Z"/><path d="M54 40 Q78 20 94 34 Q72 30 54 44Z"/><path d="M54 40 Q42 14 26 8 Q44 22 52 42Z"/><path d="M54 40 Q68 12 84 10 Q66 24 56 42Z"/><path d="M54 40 Q40 46 30 64 Q46 48 56 44Z"/></g><circle cx="50" cy="45" r="4.5" fill="#6b4220"/><circle cx="58" cy="46" r="4.5" fill="#6b4220"/>',
    suitcase: '<rect x="38" y="12" width="24" height="16" rx="5" fill="none" stroke="#1e2331" stroke-width="6"/><rect x="16" y="26" width="68" height="56" rx="9" fill="#2a6fb5"/><rect x="30" y="26" width="7" height="56" fill="#4f8fd0"/><rect x="63" y="26" width="7" height="56" fill="#4f8fd0"/><rect x="42" y="44" width="16" height="12" rx="2" fill="#ffc93c" transform="rotate(-8 50 50)"/><circle cx="28" cy="87" r="5" fill="#1e2331"/><circle cx="72" cy="87" r="5" fill="#1e2331"/>',
    camera: '<rect x="10" y="30" width="80" height="54" rx="10" fill="#2b2f3a"/><path d="M34 30 L40 20 L60 20 L66 30 Z" fill="#2b2f3a"/><circle cx="50" cy="57" r="19" fill="#5c6b80"/><circle cx="50" cy="57" r="12" fill="#151922"/><circle cx="45" cy="52" r="4" fill="#9fb3cc"/><rect x="70" y="36" width="12" height="7" rx="2" fill="#ffc93c"/><circle cx="20" cy="38" r="3.5" fill="#e8425a"/>',
    star: '<path d="M50 6 L62 36 L94 38 L69 58 L78 90 L50 72 L22 90 L31 58 L6 38 L38 36 Z" fill="#ffc93c"/><path d="M50 22 L57 40 L76 41 L61 53 L66 72 L50 61 Z" fill="#ffe08a"/>',
    heart: '<path d="M50 88 C18 66 6 48 8 32 C10 16 26 8 38 12 C44 14 48 18 50 24 C52 18 56 14 62 12 C74 8 90 16 92 32 C94 48 82 66 50 88Z" fill="#e8425a"/><path d="M26 26 Q20 32 22 40" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".6"/>',
    cloud: '<path d="M22 74 Q6 72 8 58 Q10 44 26 46 Q28 26 48 26 Q66 26 70 42 Q90 40 92 58 Q92 74 76 74 Z" fill="#dff0fb" stroke="#7fb3dc" stroke-width="4"/>',
    india: '<defs><linearGradient id="tri" x1="0" y1="0" x2="0" y2="1"><stop offset=".33" stop-color="#f59a3a"/><stop offset=".33" stop-color="#ffffff"/><stop offset=".66" stop-color="#ffffff"/><stop offset=".66" stop-color="#2e8b47"/></linearGradient></defs><path d="' + INDIA_D + '" fill="url(#tri)" stroke="#1e2331" stroke-width="1.6" stroke-linejoin="round"/><circle cx="44" cy="46" r="4.5" fill="none" stroke="#2a3f8f" stroke-width="1.6"/>',
    badge: '<circle cx="50" cy="50" r="44" fill="#c8362d"/><circle cx="50" cy="50" r="37" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="3 3"/><text x="50" y="44" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="700" font-size="22" fill="#fff">SIN</text><path transform="translate(50 52) rotate(180) scale(.9)" fill="#fff" d="' + PLANE_PATH + '"/><text x="50" y="80" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="700" font-size="22" fill="#fff">PAT</text>',
    voyage: '<path d="M4 38 L18 34 L18 66 L4 62 L10 50 Z" fill="#1c3f78"/><path d="M96 38 L82 34 L82 66 L96 62 L90 50 Z" fill="#1c3f78"/><rect x="14" y="30" width="72" height="40" rx="3" fill="#2a559c"/><text x="50" y="56" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="700" font-size="17" fill="#fff" letter-spacing="1">BON VOYAGE</text>'
  };
  const ST_KEYS = Object.keys(ST);
  function stickerSVG(t) {
    const art = ST[t] || ST.star;
    return '<svg viewBox="-9 -9 118 118" aria-hidden="true"><g class="cut">' + art.replace(/<defs>.*?<\/defs>/, "") + "</g>" + art + "</svg>";
  }
  function stickersHTML(f) {
    return (f.stickers || []).map((s, k) => '<span class="stk" data-sk="' + k + '" style="left:' + s.x + "%;top:" + s.y + "%;--r:" + s.r + "deg;--s:" + s.s + '">' + stickerSVG(s.t) + "</span>").join("");
  }
  let stickerMode = false;
  function setStickerMode(on) {
    stickerMode = on;
    document.body.classList.toggle("sticker-mode", on);
    $("stickerBtn").textContent = on ? "Done" : "Stickers";
    $("stickerBtn").className = on ? "btn red" : "btn";
    $("tray").classList.toggle("on", on);
    if (on) { const m = $("main"); if (m.scrollTo) m.scrollTo({ top: 0, behavior: "smooth" }); else m.scrollTop = 0; }
    if (on && !$("trayRow").firstChild) $("trayRow").innerHTML = ST_KEYS.map(k => '<button class="tray-stk" data-st="' + k + '" aria-label="' + k + ' sticker">' + stickerSVG(k) + "</button>").join("");
  }
  $("stickerBtn").addEventListener("click", () => setStickerMode(!stickerMode));
  $("trayDone").addEventListener("click", () => setStickerMode(false));
  function slapSound() { burst(0.05, 1200, 0.7, 0.55, "lowpass"); burst(0.03, 3000, 1, 0.25); }
  function peelSound() {
    const a = audio(); if (!a) return;
    const t = a.currentTime, s = a.createBufferSource(); s.buffer = noiseBuf;
    const f = a.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 3; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(1500, t + 0.22);
    const g = a.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t); s.stop(t + 0.3);
  }
  // drag a sticker from the tray or move one already on a pass
  let SD = null;
  function mainUnder(x, y) {
    const el = document.elementFromPoint(x, y);
    const main = el && el.closest && el.closest("#passes .main");
    return main && !main.closest(".ticket").classList.contains("flipped") ? main : null;
  }
  function startStickerDrag(e, t, fromEl, existing) {
    audio();
    const r = fromEl.getBoundingClientRect();
    const fl = document.createElement("div");
    fl.className = "stk-float"; fl.innerHTML = stickerSVG(t);
    fl.style.setProperty("--r", (existing ? existing.s.r : (Math.random() * 24 - 12).toFixed(0)) + "deg");
    document.body.appendChild(fl);
    document.body.classList.add("stk-dragging");
    SD = { t, fl, id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, existing, size: 52 * (existing ? existing.s.s : 1), from: r };
    moveFloat(e.clientX, e.clientY);
  }
  function moveFloat(x, y) {
    if (!SD) return;
    SD.fl.style.left = (x - SD.size / 2) + "px"; SD.fl.style.top = (y - SD.size / 2) + "px";
    SD.fl.style.width = SD.fl.style.height = SD.size + "px";
    document.querySelectorAll("#passes .main.drop").forEach(m => m.classList.remove("drop"));
    const m = mainUnder(x, y); if (m) m.classList.add("drop");
  }
  $("trayRow").addEventListener("pointerdown", e => {
    const b = e.target.closest("[data-st]"); if (!b) return;
    e.preventDefault();
    startStickerDrag(e, b.dataset.st, b, null);
  });
  $("passes").addEventListener("pointerdown", e => {
    if (!stickerMode) return;
    const s = e.target.closest(".stk"); if (!s) return;
    e.preventDefault(); e.stopPropagation();
    const tk = s.closest(".ticket"), f = state.flights.find(x => x.id === tk.dataset.id), k = +s.dataset.sk;
    startStickerDrag(e, f.stickers[k].t, s, { f, k, s: f.stickers[k], el: s });
    s.style.visibility = "hidden";
  }, true);
  window.addEventListener("pointermove", e => {
    if (!SD || e.pointerId !== SD.id) return;
    if (Math.abs(e.clientX - SD.x0) + Math.abs(e.clientY - SD.y0) > 6) SD.moved = true;
    moveFloat(e.clientX, e.clientY);
  });
  function dropSticker(e) {
    if (!SD || (e && e.pointerId !== SD.id)) return;
    const d = SD; SD = null;
    document.body.classList.remove("stk-dragging");
    try { const sel = window.getSelection(); if (sel) sel.removeAllRanges(); } catch (err) {}
    document.querySelectorAll("#passes .main.drop").forEach(m => m.classList.remove("drop"));
    let main = d.moved ? mainUnder(e.clientX, e.clientY) : null;
    let x = e.clientX, y = e.clientY;
    if (!d.moved && !d.existing) {           // a tap on the tray: stick it somewhere on the first pass you can see
      main = Array.from(document.querySelectorAll("#passes .ticket:not(.flipped) .main")).find(m => { const r = m.getBoundingClientRect(); return r.bottom > 80 && r.top < innerHeight - 200; });
      if (main) { const r = main.getBoundingClientRect(); x = r.left + r.width * (0.2 + Math.random() * 0.6); y = r.top + r.height * (0.25 + Math.random() * 0.5); }
    }
    if (!d.moved && d.existing) { d.existing.el.style.visibility = ""; d.fl.remove(); return; }
    if (main) {
      const r = main.getBoundingClientRect();
      const f = state.flights.find(z => z.id === main.closest(".ticket").dataset.id);
      const rec = { t: d.t, x: +(((x - r.left) / r.width) * 100).toFixed(1), y: +(((y - r.top) / r.height) * 100).toFixed(1), r: parseFloat(d.fl.style.getPropertyValue("--r")) || 0, s: d.existing ? d.existing.s.s : 1 };
      if (d.existing) d.existing.f.stickers.splice(d.existing.k, 1);
      (f.stickers = f.stickers || []).push(rec);
      if ((f.stickers || []).length > 14) f.stickers.shift();
      d.fl.remove(); slapSound();
      commit({ quiet: true }); renderPasses();
      const els = main.closest("#passes") && document.querySelectorAll('#passes .ticket[data-id="' + f.id + '"] .stk');
      const last = els && els[els.length - 1]; if (last) { last.classList.add("slap"); }
    } else if (d.existing) {                 // dragged off the pass: peel it away
      d.existing.f.stickers.splice(d.existing.k, 1);
      peelSound();
      d.fl.classList.add("peel"); setTimeout(() => d.fl.remove(), 420);
      commit({ quiet: true }); renderPasses();
    } else {
      d.fl.style.transition = "left .3s, top .3s, opacity .3s, transform .3s";
      d.fl.style.left = d.from.left + "px"; d.fl.style.top = d.from.top + "px"; d.fl.style.opacity = "0";
      setTimeout(() => d.fl.remove(), 320);
    }
  }
  window.addEventListener("pointerup", dropSticker);
  window.addEventListener("pointercancel", dropSticker);

  // ================= PASSPORT =================
  const STAMP_DEFS = [
    { id: "dep-SIN", code: "SIN", kind: "dep", page: 0, label: "SINGAPORE" },
    { id: "arr-CCU", code: "CCU", kind: "arr", page: 1, label: "KOLKATA" },
    { id: "arr-PAT", code: "PAT", kind: "arr", page: 1, label: "PATNA" }
  ];
  let freshStamp = null;
  function stampDate(ms, zone) { const d = zoned(ms, zone); return pad(d.getUTCDate()) + " " + MONS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function stampArt(def, at) {
    const zone = AIRPORTS[def.code].zone, date = stampDate(at, zone);
    const plane = (rot, x, y, sc) => '<path transform="translate(' + x + " " + y + ") rotate(" + rot + ") scale(" + sc + ')" d="' + PLANE_PATH + '" fill="currentColor"/>';
    if (def.id === "dep-SIN") return '<svg viewBox="0 0 150 96" class="ink" style="color:#3b47a8"><rect x="4" y="4" width="142" height="88" rx="6" fill="none" stroke="currentColor" stroke-width="3.5"/><rect x="10" y="10" width="130" height="76" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<text x="75" y="30" text-anchor="middle" class="st-s">DEPARTED</text><text x="75" y="56" text-anchor="middle" class="st-b">SINGAPORE</text>' + plane(45, 22, 70, 0.9) + '<text x="80" y="76" text-anchor="middle" class="st-d">' + date + '</text><text x="128" y="76" text-anchor="middle" class="st-s">SIN</text></svg>';
    if (def.id === "arr-CCU") return '<svg viewBox="0 0 120 120" class="ink" style="color:#b0294a"><circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="3.5"/><circle cx="60" cy="60" r="40" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<defs><path id="ringA" d="M60 60 m-47 0 a47 47 0 1 1 94 0 a47 47 0 1 1 -94 0"/></defs><text class="st-s"><textPath href="#ringA" startOffset="2%">ARRIVED · KOLKATA · ARRIVED · KOLKATA ·</textPath></text>' +
      '<text x="60" y="58" text-anchor="middle" class="st-b">CCU</text><text x="60" y="76" text-anchor="middle" class="st-d">' + date + "</text>" + plane(135, 60, 32, 0.7) + "</svg>";
    return '<svg viewBox="0 0 150 100" class="ink" style="color:#2d7a4c"><path d="M30 6 H120 L146 50 L120 94 H30 L4 50 Z" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M34 13 H116 L138 50 L116 87 H34 L12 50 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<text x="75" y="34" text-anchor="middle" class="st-s">ARRIVAL · BIHAR</text><text x="75" y="60" text-anchor="middle" class="st-b">PATNA</text><text x="75" y="78" text-anchor="middle" class="st-d">' + date + '</text>' + plane(135, 28, 50, 0.65) + plane(135, 122, 50, 0.65) + "</svg>";
  }
  function addStamp(id, at) {
    state.stamps = state.stamps || [];
    if (state.stamps.some(s => s.id === id)) return false;
    state.stamps.push({ id, at: at || Date.now(), r: +(Math.random() * 16 - 8).toFixed(1), dx: +(Math.random() * 10 - 5).toFixed(1) });
    freshStamp = id;
    commit({ quiet: true });
    return true;
  }
  function autoStamps() {
    const now = Date.now();
    let added = false;
    const L1 = state.flights[0], L2 = state.flights[1], t1 = legTimes(L1), t2 = legTimes(L2);
    if (L1.torn) added = addStamp("dep-SIN", L1.tornAt || now) || added;
    else if (t1 && now > t1.dep) added = addStamp("dep-SIN", t1.dep) || added;
    if (t1 && now > t1.arr) added = addStamp("arr-CCU", t1.arr) || added;
    if (t2 && now > t2.arr) added = addStamp("arr-PAT", t2.arr) || added;
    return added;
  }
  function renderPassport() {
    const stamps = state.stamps || [];
    const page = p => STAMP_DEFS.filter(d => d.page === p).map(def => {
      const s = stamps.find(x => x.id === def.id);
      if (!s) return '<button class="st-slot" data-stamp="' + def.id + '"><span>' + def.label + "</span><small>" + (def.kind === "dep" ? "Tear your stub, or tap to stamp" : "Stamps itself when you land, or tap") + "</small></button>";
      return '<div class="st-wrap' + (freshStamp === def.id ? " fresh" : "") + '" style="--r:' + s.r + "deg;--dx:" + s.dx + 'px"><span class="rubber" aria-hidden="true"></span>' + stampArt(def, s.at) + "</div>";
    }).join("");
    $("ppLeft").innerHTML = page(0);
    $("ppRight").innerHTML = page(1);
    $("ppCount").textContent = stamps.length + " OF " + STAMP_DEFS.length + " STAMPS";
    if (freshStamp) { setTimeout(stampSound, 330); freshStamp = null; }
  }
  $("passport").addEventListener("click", e => {
    const b = e.target.closest("[data-stamp]"); if (!b) return;
    audio(); addStamp(b.dataset.stamp); renderPassport();
  });

  // ================= SEATBACK SCREEN =================
  let ifeIdx = 0, ifeTimer = null, ifeTick = null;
  const IFE_PANES = ["map", "data", "times", "window"];
  function openIFE() {
    $("ife").classList.add("on"); document.body.classList.add("overlay-open");
    ifeIdx = 0; renderIFE(true);
    clearInterval(ifeTimer); ifeTimer = setInterval(() => { ifeIdx = (ifeIdx + 1) % IFE_PANES.length; renderIFE(true); }, 9000);
    clearInterval(ifeTick); ifeTick = setInterval(() => renderIFE(false), 3000);
    if (curTab === "flight") resumeGPS();
  }
  function closeIFE() { $("ife").classList.remove("on"); document.body.classList.remove("overlay-open"); clearInterval(ifeTimer); clearInterval(ifeTick); }
  function isaTemp(altM) { return altM == null ? null : Math.max(-56.5, 15 - 6.5 * altM / 1000); }
  function renderIFE(swap) {
    if (!MAP) return;
    const now = Date.now(), P = currentPos(now), f = P.leg, A = AIRPORTS[f.from], B = AIRPORTS[f.to], t = legTimes(f);
    let left;
    if (P.src === "gps") left = (P.spd || 0) > 40 ? P.toGo * 1000 / P.spd / 60 : (t && now < t.arr ? (t.arr - Math.max(now, t.dep)) / 60000 : null);
    else left = (1 - P.prog) * f.dur;
    const eta = left != null ? now + left * 60000 : (t ? t.arr : null);
    const alt = P.alt != null ? P.alt : (P.src !== "preview" || P.prog > 0.08 && P.prog < 0.9 ? 11000 : null);
    const altEst = P.alt == null;
    $("ifeHead").innerHTML = "<b>FLIGHT DECK AIR</b><span>" + esc(f.no ? f.no.toUpperCase() + " · " : "") + f.from + " → " + f.to + "</span>";
    const pane = IFE_PANES[ifeIdx];
    let html = "";
    if (pane === "map") {
      const [px, py] = proj(P.lon, P.lat);
      const done = polyPts(A, B, 0, Math.max(0.001, P.prog), 40), all = polyPts(A, B, 0, 1, 40);
      const lands = MAP.lands.map(l => '<path d="' + l.d + '"/>').join("");
      const labels = MAP.labels.map(([n, x, y]) => '<text x="' + (x + 4) + '" y="' + (y + 3) + '">' + n + "</text>").join("");
      const ap = [A, B].map((a, k) => { const [x, y] = proj(a.lon, a.lat); return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" class="i-ap"/><text class="i-apl" x="' + (x + (k ? -8 : 8)).toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="' + (k ? "end" : "start") + '">' + (k ? f.to : f.from) + "</text>"; }).join("");
      html = '<div class="ife-map"><svg id="ifeSvg" data-px="' + px.toFixed(1) + '" data-py="' + py.toFixed(1) + '" viewBox="0 0 400 430" preserveAspectRatio="xMidYMid meet"><g class="i-land">' + lands + '</g><g class="i-lbl">' + labels + '</g><polyline class="i-all" points="' + all + '"/><polyline class="i-done" points="' + done + '"/>' + ap +
        '<g transform="translate(' + px.toFixed(1) + "," + py.toFixed(1) + ") rotate(" + (P.hdg || 0).toFixed(0) + ') scale(1.5)"><path class="i-plane" d="' + PLANE_PATH + '"/></g></svg>' +
        '<div class="ife-strip"><div><small>TIME TO DESTINATION</small><b>' + (left != null ? dur(left) : "—") + '</b></div><div><small>DISTANCE TO GO</small><b>' + fmtInt(P.toGo) + ' km</b></div><div><small>GROUND SPEED</small><b>' + (P.spd ? fmtInt(P.spd * 3.6) : "—") + " km/h</b></div></div></div>";
    } else if (pane === "data") {
      const temp = isaTemp(alt);
      html = '<div class="ife-grid">' +
        '<div><small>ALTITUDE</small><b>' + (alt != null ? fmtInt(alt * 3.28084) : "—") + "<em>ft</em></b><span>" + (alt != null ? fmtInt(alt) + " m" + (altEst ? " · typical cruise" : "") : "") + "</span></div>" +
        '<div><small>GROUND SPEED</small><b>' + (P.spd ? fmtInt(P.spd * 3.6) : "—") + "<em>km/h</em></b><span>" + (P.spd ? fmtInt(P.spd * 1.94384) + " knots" : "") + "</span></div>" +
        '<div><small>OUTSIDE AIR TEMP</small><b>' + (temp != null ? Math.round(temp) : "—") + "<em>°C</em></b><span>estimated</span></div>" +
        '<div><small>HEADING</small><b>' + (P.hdg != null ? Math.round(P.hdg) : "—") + "<em>°</em></b><span>" + (P.hdg != null ? compass(P.hdg) : "") + "</span></div>" +
        '<div class="wide"><small>NOW OVER</small><b class="sm">' + esc(cap(whereLabel(P.lat, P.lon))) + "</b></div></div>";
    } else if (pane === "times") {
      html = '<div class="ife-times">' +
        '<div><small>TIME IN ' + A.city + '</small><b>' + hhmm(now, A.zone) + "</b><span>" + dayKey(now, A.zone) + "</span></div>" +
        '<div><small>TIME IN ' + B.city + '</small><b>' + hhmm(now, B.zone) + "</b><span>" + dayKey(now, B.zone) + "</span></div>" +
        '<div class="wide"><small>ESTIMATED ARRIVAL · ' + B.city + "</small><b>" + (eta ? hhmm(eta, B.zone) : "--:--") + '</b><div class="ife-prog"><i style="width:' + (P.prog * 100).toFixed(1) + '%"></i></div><span>' + Math.round(P.prog * 100) + "% of the way</span></div></div>";
    } else {
      const here = { lat: P.lat, lon: P.lon }, L = [], R = [];
      for (const [n, lat, lon, rng] of MAP.pois) {
        const d = dist(here, { lat, lon }); if (d < 4 || d > (rng || 230)) continue;
        const r = ((bearing(here, { lat, lon }) - (P.hdg || 0) + 540) % 360) - 180;
        if (r <= -20 && r >= -160) L.push({ n, d }); else if (r >= 20 && r <= 160) R.push({ n, d });
      }
      L.sort((a, b) => a.d - b.d); R.sort((a, b) => a.d - b.d);
      const col = (name, arr) => "<div><small>" + name + " SIDE</small>" + (arr.length ? arr.slice(0, 3).map(x => "<p><b>" + esc(x.n) + "</b> " + fmtInt(x.d) + " km</p>").join("") : "<p>Open sky</p>") + "</div>";
      html = '<div class="ife-win">' + col("LEFT", L) + col("RIGHT", R) + "</div>";
    }
    const body = $("ifeBody");
    if (swap) { body.classList.remove("in"); void body.offsetWidth; body.classList.add("in"); }
    body.innerHTML = html;
    const isvg = $("ifeSvg");
    if (isvg) {
      const r = isvg.getBoundingClientRect(), vw = 250, vh = r.width ? vw * r.height / r.width : 300;
      const cx = +isvg.dataset.px, cy = +isvg.dataset.py;
      isvg.setAttribute("viewBox", (cx - vw / 2).toFixed(1) + " " + (cy - vh * 0.52).toFixed(1) + " " + vw + " " + vh.toFixed(1));
    }
    $("ifeDots").innerHTML = IFE_PANES.map((p, k) => "<i" + (k === ifeIdx ? ' class="on"' : "") + "></i>").join("");
    $("ifeSrc").textContent = P.src === "gps" ? "LIVE GPS" : P.src === "est" ? "ESTIMATED POSITION" : "PREVIEW";
  }
  $("ifeBody").addEventListener("click", () => { ifeIdx = (ifeIdx + 1) % IFE_PANES.length; renderIFE(true); clearInterval(ifeTimer); ifeTimer = setInterval(() => { ifeIdx = (ifeIdx + 1) % IFE_PANES.length; renderIFE(true); }, 9000); });
  $("ifeClose").addEventListener("click", closeIFE);
  $("openIFE").addEventListener("click", openIFE);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeIFE(); });

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
