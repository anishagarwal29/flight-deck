(function () {
  "use strict";
  // ================= constants =================
  const LS_KEY = "flightdeck.v1", LS_GPS = "flightdeck.gpsOn";
  const PLANE_PATH = "M0,-10 L1.6,-3 L9,2 L9,4 L1.6,1.5 L1.2,7 L3.5,9 L3.5,10.5 L0,9.5 L-3.5,10.5 L-3.5,9 L-1.2,7 L-1.6,1.5 L-9,4 L-9,2 L-1.6,-3 Z";
  // things you can log in the journal, each with its own rubber stamp
  const MOMENT_KINDS = {
    ate: { label: "Ate", word: "ATE", ink: "#c2410c", ph: "Litti chokha at the station", icon: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16.5 3C14.5 4.5 14 7 14 10h2.5v11"/>' },
    saw: { label: "Saw", word: "SAW", ink: "#1f6f8b", ph: "Golghar at sunset", icon: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' },
    did: { label: "Did", word: "DID", ink: "#2d7a4c", ph: "Boat ride on the Ganges", icon: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>' },
    bought: { label: "Bought", word: "BOUGHT", ink: "#8a3c8f", ph: "Bangles from the market", icon: '<path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2"/>' },
    met: { label: "Met", word: "MET", ink: "#b0294a", ph: "Cousins at Nani's", icon: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c3 .2 5.5 2.4 5.5 5.8"/>' },
    stayed: { label: "Stayed", word: "STAYED", ink: "#3b47a8", ph: "Nani's house", icon: '<path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"/>' }
  };
  const CHECK_SVG = '<svg viewBox="0 0 12 12"><path d="M2 6.5 5 9.2 10 3"/></svg>';
  const uid = () => Math.random().toString(36).slice(2, 9);
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const HERE_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } })();

  // ================= airports (any in the world) =================
  // a few built in so the app works before the full list (7,900 airports) has loaded
  const SEED_AP = {
    SIN: ["Singapore Changi Airport", "Singapore", "SG", 1.350, 103.994, "Asia/Singapore"],
    CCU: ["Netaji Subhash Chandra Bose International Airport", "Kolkata", "IN", 22.655, 88.447, "Asia/Kolkata"],
    PAT: ["Jay Prakash Narayan Airport", "Patna", "IN", 25.591, 85.088, "Asia/Kolkata"]
  };
  let AIR = null;               // Map code -> row
  const apCache = new Map();
  let regionNames = null;
  try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) {}
  const countryName = cc => { try { return (regionNames && cc && regionNames.of(cc)) || cc || ""; } catch (e) { return cc || ""; } };
  function ap(code) {
    code = String(code || "").toUpperCase();
    if (apCache.has(code)) return apCache.get(code);
    let r = AIR && AIR.get(code), o;
    if (r) o = { code, name: r[1], city: r[2] || r[1], cc: r[3], lat: r[4], lon: r[5], tz: AIR.tz[r[6]] };
    else if (SEED_AP[code]) { const s = SEED_AP[code]; o = { code, name: s[0], city: s[1], cc: s[2], lat: s[3], lon: s[4], tz: s[5] }; }
    else return { code, name: code, city: code, cc: "", country: "", lat: 0, lon: 0, tz: "UTC", unknown: true };
    o.country = countryName(o.cc);
    o.CITY = o.city.toUpperCase();
    if (AIR) apCache.set(code, o);
    return o;
  }
  const airportsReady = fetch("data/airports.json").then(r => r.json()).then(d => {
    AIR = new Map(); AIR.tz = d.tz; AIR.rows = d.a;
    d.a.forEach(r => AIR.set(r[0], r));
    apCache.clear();
    buildPOIs();
    return true;
  }).catch(() => false);
  const HUB_LIST = "ATL DXB DFW LHR HND DEN IST LAX ORD DEL CDG JFK CAN AMS FRA PVG SIN ICN MAD BKK CGK BOM PEK PKX SFO KUL LAS MIA SEA CLT MCO EWR PHX IAH MUC BCN FCO LGW SYD MEL HKG TPE NRT KIX MNL DOH AUH JED RUH CAI JNB CPT ADD NBO LOS GRU GIG EZE BOG LIM SCL MEX CUN YYZ YVR YUL BOS IAD DCA MSP DTW PHL BWI SLC SAN HNL ZRH VIE CPH ARN OSL HEL DUB MAN BRU LIS ATH WAW PRG BUD SVO LED TLV KWI MCT BAH KHI LHE ISB DAC CMB MLE KTM BLR MAA HYD CCU COK AMD GOI PNQ SGN HAN DPS SUB PNH RGN CTU SZX XMN CKG KMG HGH WUH XIY SHA GMP PUS CJU FUK CTS OKA ITM NGO BNE PER ADL AKL CHC PAT LKO JAI GAU VNS TRV SXR BBI IXR NAG PEN BKI KCH HKT CNX DMK KNO CEB ORY STN LTN EDI BHX YYC SJC OAK AUS BNA DAL HOU MDW LGA FLL TPA MSY STL PDX MCI".split(" "), HUBS = new Map(HUB_LIST.map((c, n) => [c, n]));
  function searchAirports(q) {
    q = q.trim().toLowerCase(); if (!q || !AIR) return [];
    const out = [];
    const up = q.toUpperCase();
    if (AIR.get(up)) out.push(AIR.get(up));
    for (const r of AIR.rows) {
      if (out.length >= 120) break;
      if (r[0] === up) continue;
      const city = (r[2] || "").toLowerCase(), name = r[1].toLowerCase();
      if (city.startsWith(q) || name.startsWith(q)) out.push(r);
    }
    if (out.length < 8) for (const r of AIR.rows) { if (out.length >= 40) break; if (!out.includes(r) && r[1].toLowerCase().includes(q)) out.push(r); }
    // big airports first
    const score = r => (r[0] === up ? -10 : 0) + (HUBS.has(r[0]) ? -6 - (1 - HUBS.get(r[0]) / HUB_LIST.length) : 0) + (/international/i.test(r[1]) ? -2 : 0) + ((r[2] || "").toLowerCase() === q ? -3 : 0);
    return out.sort((a, b) => score(a) - score(b)).slice(0, 7);
  }

  function defaultChecklist() {
    const S = {
      "DOCUMENTS": ["Passport (6+ months valid)", "Visa sorted if you need one", "Boarding passes", "Travel insurance details", "Address of where you're staying"],
      "MONEY": ["Some local cash", "Card that works overseas"],
      "ELECTRONICS": ["Phone", "Charger + cable", "Power bank (carry-on only)", "Plug adapter", "Earphones", "Roaming / eSIM / data plan"],
      "CARRY-ON": ["Hoodie for the plane", "Empty water bottle", "Snacks", "Pen"],
      "CLOTHES": ["Tops", "Pants / shorts", "Underwear + socks", "Sleepwear", "Jacket", "Slippers"],
      "TOILETRIES": ["Toothbrush + toothpaste", "Deodorant", "Sunscreen", "Any meds you take", "Tissues + hand sanitiser"],
      "BEFORE THE FLIGHT": ["Open Flight Deck once with internet", "Test GPS in airplane mode"]
    };
    const out = [];
    for (const sec in S) for (const label of S[sec]) out.push({ id: uid(), sec, label, done: false });
    return out;
  }
  function defaults() {
    return { v: 3, updatedAt: 0, name: "", flights: [], stamps: [], ppStickers: [], moments: [], ann: {}, annOn: true, annVoice: false, inr: { rate: 0, at: 0, manual: false }, checklist: defaultChecklist() };
  }
  const code3 = s => /^[A-Za-z]{3}$/.test(String(s || "")) ? String(s).toUpperCase() : "";
  const cleanStickers = (arr, max) => Array.isArray(arr) ? arr.filter(k => k && typeof k.t === "string").slice(-(max || 20)).map(k => ({ t: String(k.t), x: Math.max(0, Math.min(100, +k.x || 0)), y: Math.max(0, Math.min(100, +k.y || 0)), r: +k.r || 0, s: Math.max(0.6, Math.min(1.6, +k.s || 1)), pg: k.pg != null ? String(k.pg) : undefined })) : [];
  function sanitize(s) {
    const d = defaults();
    if (!s || typeof s !== "object") return d;
    const out = { v: 3, updatedAt: +s.updatedAt || 0, name: String(s.name || "").slice(0, 40) };
    out.flights = (Array.isArray(s.flights) ? s.flights : []).filter(g => g && g.id && code3(g.from) && code3(g.to)).map(g => ({
      id: String(g.id), from: code3(g.from), to: code3(g.to), no: String(g.no || ""), dep: String(g.dep || ""), arr: String(g.arr || ""),
      dur: +g.dur > 0 ? Math.max(10, +g.dur) : 0, seat: String(g.seat || ""), gate: String(g.gate || ""), torn: !!g.torn, tornAt: +g.tornAt || 0,
      tear: g.tear && typeof g.tear.p === "number" ? { p: Math.max(0, Math.min(0.97, g.tear.p)), dir: g.tear.dir === "bottom" ? "bottom" : "top" } : null,
      stickers: cleanStickers(g.stickers), added: +g.added || 0
    }));
    // stamps: v2 used ids like "dep-SIN"; v3 stores the airport on the stamp itself
    out.stamps = (Array.isArray(s.stamps) ? s.stamps : []).filter(x => x && typeof x.id === "string").map(x => {
      let kind = x.kind, code = x.code, id = x.id;
      const m = /^(dep|arr)-([A-Z]{3})$/.exec(id);
      if (m) {
        kind = m[1]; code = m[2];
        const f = out.flights.find(z => (kind === "dep" ? z.from : z.to) === code);
        id = kind + ":" + (f ? f.id : code);
      }
      return { id, kind: kind === "arr" ? "arr" : "dep", code: code3(code) || "???", at: +x.at || Date.now(), r: +x.r || 0, dx: +x.dx || 0 };
    }).filter(x => x.code !== "???");
    out.ppStickers = cleanStickers(s.ppStickers, 200);
    out.moments = (Array.isArray(s.moments) ? s.moments : []).filter(m => m && m.id).map(m => ({ id: String(m.id), kind: MOMENT_KINDS[m.kind] ? m.kind : "did", what: String(m.what || "").slice(0, 80), note: String(m.note || "").slice(0, 400),
      where: String(m.where || "").slice(0, 40), at: +m.at || Date.now(), hearts: Math.max(0, Math.min(3, +m.hearts || 0)), photo: !!m.photo, x: m.x == null ? null : +m.x, y: m.y == null ? null : +m.y, r: +m.r || 0 }));
    out.ann = s.ann && typeof s.ann === "object" ? s.ann : {};
    out.annOn = s.annOn !== false; out.annVoice = !!s.annVoice;
    out.inr = s.inr && typeof s.inr === "object" ? { rate: +s.inr.rate || 0, at: +s.inr.at || 0, manual: !!s.inr.manual } : d.inr;
    out.checklist = Array.isArray(s.checklist) ? s.checklist.filter(c => c && c.id).map(c => ({ id: String(c.id), sec: String(c.sec == null ? "" : c.sec), label: String(c.label || ""), done: !!c.done })) : d.checklist;
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

  // ================= time (real time zones, works anywhere) =================
  const fmtCache = {};
  function tzOff(ms, tz) {
    try {
      const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }));
      const p = {}; f.formatToParts(new Date(ms)).forEach(x => { p[x.type] = +x.value; });
      const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
      return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / 60000);
    } catch (e) { return 0; }
  }
  function localToUTC(str, tz) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(str || "");
    if (!m) return null;
    const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    const o1 = tzOff(guess, tz); let utc = guess - o1 * 60000;
    const o2 = tzOff(utc, tz); if (o2 !== o1) utc = guess - o2 * 60000;
    return utc;
  }
  function utcToLocalInput(ms, tz) { const d = zoned(ms, tz); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); }
  const zoned = (utc, tz) => new Date(utc + tzOff(utc, tz) * 60000);
  const pad = n => String(n).padStart(2, "0");
  const hhmm = (utc, tz) => { const d = zoned(utc, tz); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); };
  const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const MONS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const dayKey = (utc, tz) => { const d = zoned(utc, tz); return DAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONS[d.getUTCMonth()]; };
  const dur = min => { min = Math.max(0, Math.round(min)); return Math.floor(min / 60) + ":" + pad(min % 60); };
  const durWords = min => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return (h ? h + "H " : "") + pad(m) + "M"; };
  const fmtInt = n => Math.round(n).toLocaleString("en-SG");
  const estDur = f => f.dur > 0 ? f.dur : Math.round(legLen(f) / 780 * 60 + 30);
  function legTimes(f) {
    const A = ap(f.from), B = ap(f.to);
    const dep = localToUTC(f.dep, A.tz);
    if (dep == null) return null;
    let arr = f.arr ? localToUTC(f.arr, B.tz) : null;
    if (arr == null || arr <= dep) arr = dep + estDur(f) * 60000;
    return { dep, arr };
  }
  // flights in travel order: upcoming/active first (soonest on top), then the ones you've flown (latest first)
  function flightsOrdered() {
    const now = Date.now();
    const withT = state.flights.map(f => ({ f, t: legTimes(f) }));
    const up = withT.filter(x => !x.t || x.t.arr > now - 3 * 3600000).sort((a, b) => (a.t ? a.t.dep : 9e15) - (b.t ? b.t.dep : 9e15) || (b.f.added || 0) - (a.f.added || 0));
    const past = withT.filter(x => x.t && x.t.arr <= now - 3 * 3600000).sort((a, b) => b.t.dep - a.t.dep);
    return { up: up.map(x => x.f), past: past.map(x => x.f) };
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
    if (d < 1e-9) return { lat: a.lat, lon: a.lon };
    const s1 = Math.sin((1 - t) * d) / Math.sin(d), s2 = Math.sin(t * d) / Math.sin(d);
    const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
    return { lon: toDeg(Math.atan2(y, x)), lat: toDeg(Math.atan2(z, Math.hypot(x, y))) };
  }
  const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const compass = deg => COMPASS[Math.round(deg / 22.5) % 16];
  const legLen = f => dist(ap(f.from), ap(f.to));

  // ================= world map + "where am I" =================
  let WORLD = null;   // { feats: [{n, f, b}] }
  const worldReady = fetch("data/world-50m.json").then(r => r.json()).then(t => {
    if (!window.topojson || !window.d3) return false;
    const fc = topojson.feature(t, t.objects.countries);
    WORLD = { fc, feats: fc.features.map(f => ({ n: f.properties.name, f, b: d3.geoBounds(f) })) };
    return true;
  }).catch(() => false);
  const SEAS = [
    ["the Singapore Strait", 1.0, 1.6, 103.4, 104.6], ["the Strait of Malacca", 1.2, 6.3, 95.0, 103.5], ["the Gulf of Thailand", 5.5, 13.6, 99.5, 105.0],
    ["the Andaman Sea", 5, 17, 92.5, 98.8], ["the Bay of Bengal", 5, 23, 79.5, 94.5], ["the Arabian Sea", 5, 25, 50, 77], ["the Persian Gulf", 23, 30.5, 47.5, 57],
    ["the Gulf of Aden", 10, 15, 43, 52], ["the Red Sea", 12, 30, 32, 44], ["the Mediterranean Sea", 30, 46, -6, 36.5], ["the Black Sea", 40.5, 47, 27, 42],
    ["the Caspian Sea", 36.5, 47.5, 46.5, 55], ["the North Sea", 51, 61, -4, 9], ["the Baltic Sea", 53.5, 66, 9, 30], ["the South China Sea", 0, 23, 105, 121],
    ["the Java Sea", -7.5, -2.5, 105, 118], ["the Celebes Sea", 0, 7, 118, 126], ["the Philippine Sea", 5, 30, 121, 140], ["the East China Sea", 23, 33, 117, 131],
    ["the Yellow Sea", 33, 41, 117, 127], ["the Sea of Japan", 33, 52, 127, 142], ["the Coral Sea", -30, -8, 142, 165], ["the Tasman Sea", -47, -30, 147, 175],
    ["the Timor Sea", -15, -8, 122, 132], ["the Caribbean Sea", 9, 22, -89, -60], ["the Gulf of Mexico", 18, 31, -98, -81], ["Hudson Bay", 51, 64, -95, -77]
  ];
  function seaName(lat, lon) {
    for (const [n, a, b, c, d] of SEAS) if (lat >= a && lat <= b && lon >= c && lon <= d) return n;
    if (lat > 66) return "the Arctic Ocean";
    if (lat < -60) return "the Southern Ocean";
    if (lon > -80 && lon < 20) return "the Atlantic Ocean";
    if (lon >= 20 && lon < 147 && lat < 30) return "the Indian Ocean";
    return "the Pacific Ocean";
  }
  function inBox(b, lon, lat) {
    if (lat < b[0][1] - 0.1 || lat > b[1][1] + 0.1) return false;
    return b[0][0] <= b[1][0] ? (lon >= b[0][0] - 0.1 && lon <= b[1][0] + 0.1) : (lon >= b[0][0] || lon <= b[1][0]);
  }
  function overCountry(lat, lon) {
    if (!WORLD) return null;
    for (const c of WORLD.feats) if (inBox(c.b, lon, lat) && d3.geoContains(c.f, [lon, lat])) return c.n;
    return null;
  }
  function whereLabel(lat, lon) {
    const c = overCountry(lat, lon);
    if (c) return c;
    if (!WORLD) return "…";
    return seaName(lat, lon);
  }
  const isSea = label => /^the .*(Sea|Ocean|Strait|Gulf|Bay)$|^Hudson Bay$/.test(label);

  // ================= places you might see out the window =================
  const LANDMARKS = [["Mount Everest", 27.99, 86.93, 450], ["Kanchenjunga", 27.7, 88.15, 450], ["K2", 35.88, 76.51, 400], ["the Himalayas", 28.5, 84.0, 350],
    ["Mount Fuji", 35.36, 138.73, 250], ["Mont Blanc", 45.83, 6.86, 250], ["the Matterhorn", 45.98, 7.66, 200], ["the Alps", 46.5, 9.5, 250], ["Mount Kilimanjaro", -3.07, 37.35, 300],
    ["Mount Rainier", 46.85, -121.76, 250], ["the Grand Canyon", 36.1, -112.1, 200], ["Uluru", -25.34, 131.04, 150], ["the Dead Sea", 31.5, 35.5, 150], ["the Pyramids of Giza", 29.98, 31.13, 80],
    ["Lake Baikal", 53.5, 108.0, 250], ["the Great Barrier Reef", -18.3, 147.7, 220], ["Victoria Falls", -17.92, 25.86, 80], ["Mount Kinabalu", 6.08, 116.56, 200], ["Krakatoa", -6.1, 105.42, 100],
    ["Mount Bromo", -7.94, 112.95, 120], ["the Sundarbans", 21.95, 89.18, 150], ["the Ganges", 25.65, 85.4, 120], ["Mount Ararat", 39.7, 44.3, 250], ["Mount Elbrus", 43.35, 42.44, 250],
    ["Aconcagua", -32.65, -70.01, 250], ["Denali", 63.07, -151.0, 300], ["the Sahara", 23.0, 13.0, 600], ["the Gobi Desert", 43.0, 105.0, 400], ["the Mergui Archipelago", 12.0, 98.0, 230],
    ["the Andaman Islands", 11.62, 92.73, 230], ["the Phi Phi Islands", 7.74, 98.77, 150], ["Bali", -8.4, 115.2, 200], ["the Maldives", 3.2, 73.2, 250], ["Sri Lanka", 7.8, 80.7, 300],
    ["the Irrawaddy Delta", 16.0, 95.0, 200], ["the Nile Delta", 31.0, 31.0, 200], ["the Strait of Gibraltar", 35.95, -5.6, 150], ["the Bosphorus", 41.1, 29.05, 120], ["Mount Etna", 37.75, 14.99, 200]];
  let POIS = LANDMARKS.map(([n, lat, lon, r]) => [n, lat, lon, r]);
  function buildPOIs() {
    const seen = new Set(), out = LANDMARKS.map(x => x.slice());
    for (const r of AIR.rows) {
      const city = r[2] || ""; if (!city) continue;
      const k = city + "|" + r[3]; if (seen.has(k)) continue; seen.add(k);
      out.push([city, r[4], r[5], /international/i.test(r[1]) ? 200 : 140]);
    }
    POIS = out;
  }
  function nearbySides(P, maxPer) {
    const here = { lat: P.lat, lon: P.lon }, L = [], Rr = [], ahead = [];
    const dLat = 6, cosl = Math.max(0.2, Math.cos(toRad(P.lat))), dLon = 6 / cosl;
    for (const [n, lat, lon, rng] of POIS) {
      if (Math.abs(lat - P.lat) > dLat || Math.abs(((lon - P.lon + 540) % 360) - 180) > dLon) continue;
      const d = dist(here, { lat, lon }); if (d < 6) continue;
      const rel = ((bearing(here, { lat, lon }) - (P.hdg || 0) + 540) % 360) - 180;
      if (d <= (rng || 180)) { if (rel <= -20 && rel >= -160) L.push({ n, d }); else if (rel >= 20 && rel <= 160) Rr.push({ n, d }); }
      if (Math.abs(rel) < 22 && d < 650) ahead.push({ n, d });
    }
    const uniq = arr => { const s = new Set(); return arr.sort((a, b) => a.d - b.d).filter(x => !s.has(x.n) && s.add(x.n)).slice(0, maxPer || 3); };
    return { left: uniq(L), right: uniq(Rr), ahead: uniq(ahead)[0] || null };
  }

  // ================= GPS: one quick fix when you ask, never left running (battery) =================
  const gps = { on: false, watch: null, last: null, prev: null, status: "off", err: "", airborne: false, slowCount: 0, calib: null };
  let gpsTimer = null;
  function startGPS() {
    if (!("geolocation" in navigator)) { gps.status = "denied"; gps.err = "This browser has no location support."; renderGPS(); return; }
    if (gps.status === "searching") return;
    gps.status = "searching"; gps.err = ""; gps.on = true;
    renderGPS();
    try {
      navigator.geolocation.getCurrentPosition(p => { gps.on = false; onFix(p); }, e => { gps.on = false; onGpsErr(e); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 75000 });
    } catch (e) { gps.on = false; gps.status = "denied"; gps.err = "Location is blocked here. Open the app in Safari."; renderGPS(); }
  }
  function pauseGPS() {}
  function resumeGPS() {}
  function stopGPS() { gps.on = false; if (gps.status === "searching") gps.status = gps.last ? "locked" : "off"; renderGPS(); }
  function onGpsErr(e) {
    if (e && e.code === 1) { gps.status = "denied"; gps.err = "Location permission was refused. Open the app in Safari (not the home-screen icon) and allow location."; }
    else { gps.status = "nofix"; }
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
    // use this fix to correct the time-based estimate for the rest of the flight (late take-off, headwinds...)
    const live = liveLegBySchedule(t);
    if (live) {
      const lt = legTimes(live), A = ap(live.from), B = ap(live.to), da = dist(A, fix), db = dist(fix, B);
      const progGps = da / Math.max(1, da + db), progSched = (t - lt.dep) / (lt.arr - lt.dep);
      gps.calib = { leg: live.id, delta: progGps - progSched, at: t };
    }
    const spd = fix.spd || 0;
    if (!gps.airborne && spd > 60) { gps.airborne = true; gps.slowCount = 0; }
    else if (spd < 25 && live === null) {
      {
        gps.airborne = false;
        const near = nearestAirport(fix);
        const f = near && state.flights.find(z => z.to === near.code && (() => { const tt = legTimes(z); return !tt || Math.abs(tt.arr - Date.now()) < 18 * 3600000; })());
        if (f) { addStamp("arr", f); announce(f, "landed", true); }
        if (f) toast("Welcome to " + near.city + ". Passport stamped!");
      }
    }
    else gps.slowCount = 0;
    renderGPS(); renderFlight();
  }
  function nearestAirport(p) {
    let best = null, bd = 30;
    if (AIR) for (const r of AIR.rows) { if (Math.abs(r[4] - p.lat) > 0.5) continue; const d = dist({ lat: r[4], lon: r[5] }, p); if (d < bd) { bd = d; best = r[0]; } }
    else for (const k in SEED_AP) { const d = dist(ap(k), p); if (d < bd) { bd = d; best = k; } }
    return best ? ap(best) : null;
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { if (curTab === "flight") resumeGPS(); pull(); renderAll(); }
    else pauseGPS();
  });

  // ================= leg + position resolution =================
  let selLeg = null, userPickedLeg = false;
  function flightLegs() {
    // the flights worth showing on the Flight tab: anything not long finished, else everything
    const o = flightsOrdered();
    return o.up.length ? o.up : o.past.slice(0, 3);
  }
  function pickLeg(p) {
    let best = null, bs = Infinity;
    for (const f of flightLegs()) {
      const A = ap(f.from), B = ap(f.to);
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
    if (!state.flights.length) return null;
    const legs = flightLegs();
    const chosen = () => state.flights.find(f => f.id === selLeg) || legs[0] || state.flights[0];
    const fresh = gps.last && now - gps.last.t < 180000;
    if (fresh) {
      const leg = userPickedLeg ? chosen() : (pickLeg(gps.last) || chosen());
      const A = ap(leg.from), B = ap(leg.to);
      const da = dist(A, gps.last), db = dist(gps.last, B);
      const hdg = gps.last.hdg != null ? gps.last.hdg : bearing(gps.last, B);
      return { src: "gps", leg, lat: gps.last.lat, lon: gps.last.lon, hdg, spd: gps.last.spd, alt: gps.last.alt, prog: Math.min(1, da / Math.max(1, da + db)), toGo: db, acc: gps.last.acc };
    }
    const live = !userPickedLeg ? liveLegBySchedule(now) : null;
    const leg = live || chosen();
    const A = ap(leg.from), B = ap(leg.to), t = legTimes(leg);
    let prog, src;
    if (t && now >= t.dep && now < t.arr) {
      prog = (now - t.dep) / (t.arr - t.dep); src = "est";
      if (gps.calib && gps.calib.leg === leg.id) prog = Math.max(0, Math.min(0.995, prog + gps.calib.delta));
    }
    else if (t && now >= t.arr && !userPickedLeg && live) { prog = 1; src = "landed"; }
    else { prog = $("prev").value / 100; src = "preview"; }
    const p = interp(A, B, prog), q = interp(A, B, Math.min(0.999, prog + 0.005)), p0 = interp(A, B, Math.max(0, prog - 0.005));
    const hdg = prog >= 0.995 ? bearing(p0, p) : bearing(p, q);
    const L = legLen(leg), D = t ? (t.arr - t.dep) / 60000 : estDur(leg);
    return { src, leg, lat: p.lat, lon: p.lon, hdg, spd: L * 1000 / (D * 60), alt: null, prog, toGo: L * (1 - prog) };
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
  const fmtDate = (f) => { const t = legTimes(f); if (!t) return "TBC"; const d = zoned(t.dep, ap(f.from).tz); return d.getUTCDate() + " " + MONS[d.getUTCMonth()]; };
  function stubInner(f) {
    const st = flightStatus(f, Date.now()), side = seatSide(f.seat);
    return fld("GATE", f.gate ? f.gate.toUpperCase() : "—") + fld("SEAT", f.seat ? f.seat.toUpperCase() : "—") +
      (side === "left" || side === "right" ? '<span class="side">WINDOW · ' + side.toUpperCase() + "</span>" : "") +
      '<div class="stamp ' + st.cls + '">' + st.txt + "</div>" + barcode(f.from + f.to + (f.no || "") + (f.dep || "")) +
      '<span class="tear-hint">PULL TO TEAR ↘</span>';
  }
  const cityFit = s => s.length > 13 ? s.slice(0, 12) + "…" : s;
  let passesAnimated = false, landId = null, boardedThunk = null, editPasses = false, newPassId = null;
  function passHTML(f, i, label) {
    const now = Date.now(), A = ap(f.from), B = ap(f.to), t = legTimes(f), st = flightStatus(f, now), side = seatSide(f.seat);
    const D = t ? (t.arr - t.dep) / 60000 : estDur(f);
    return '<div class="ticket' + (st.past ? " past" : "") + (f.torn ? " torn" : "") + (f.id === newPassId ? " fresh" : "") + '" data-id="' + f.id + '" style="--i:' + i + (passesAnimated && f.id !== newPassId ? ";animation:none" : "") + '">' +
      (editPasses ? '<button class="pass-del" data-del-flight="' + f.id + '" aria-label="Delete flight ' + f.from + ' to ' + f.to + '">−</button>' : "") +
      '<div class="flipper"><div class="front">' +
        '<div class="main" tabindex="0" role="button" aria-label="' + (editPasses ? "Edit this flight" : "Flip pass to see your seat") + '">' +
          '<div class="tk-top"><span>BOARDING PASS</span><span class="red">' + esc(label) + "</span></div>" +
          '<div class="route"><div><span class="code">' + f.from + '</span><span class="city">' + esc(cityFit(A.CITY || A.city.toUpperCase())) + "</span></div>" +
          '<div class="path"><svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="' + PLANE_PATH + '"/></svg></div>' +
          '<div class="end"><span class="code">' + f.to + '</span><span class="city">' + esc(cityFit(B.CITY || B.city.toUpperCase())) + "</span></div></div>" +
          '<div class="fields">' + fld("DATE", fmtDate(f)) + fld("DEPARTS", t ? hhmm(t.dep, A.tz) : "--:--") + fld("LANDS", t ? hhmm(t.arr, B.tz) : "--:--") +
          fld("FLIGHT", f.no ? f.no.toUpperCase() : "—") + fld("LENGTH", durWords(D)) + fld("KM", fmtInt(legLen(f))) + "</div>" +
          (f.torn ? '<div class="boarded' + (boardedThunk === f.id ? " thunk" : "") + '">BOARDED</div>' : "") +
          stickersHTML(f) +
        "</div>" +
        '<div class="stub" aria-label="Boarding pass stub. Drag it down and right to tear it off.">' + stubInner(f) + "</div>" +
      "</div>" +
      '<div class="back" tabindex="0" role="button" aria-label="Flip pass back">' +
        '<div class="tk-top"><span>SEAT MAP · TYPICAL LAYOUT</span><span class="red">' + f.from + " → " + f.to + "</span></div>" +
        seatMap(f.seat) +
        '<p class="fine">' + (side === "left" || side === "right" ? "Window on your " + side + ". " : "") + "Layouts differ between planes, so check when you board. Tap to flip back.</p>" +
        '<p class="fine tiny" style="margin-top:auto">NOT VALID FOR TRAVEL · FLIGHT DECK AIR</p>' +
      "</div></div></div>";
  }
  function renderPasses() {
    const { up, past } = flightsOrdered();
    let html = "", i = 0;
    $("editPassesBtn").textContent = editPasses ? "Done" : "Edit";
    $("editPassesBtn").style.display = state.flights.length ? "" : "none";
    $("passes").classList.toggle("editing", editPasses);
    if (!state.flights.length) {
      html = '<button class="empty-pass" id="emptyAdd"><span class="ep-plus">+</span><b>Add your first flight</b><span>Any airport in the world. Your boarding pass appears here.</span></button>';
    }
    // connecting flights (one lands where the next takes off, within 36 hours) make one trip
    const connects = (f, nx) => { if (!nx || nx.from !== f.to) return false; const a = legTimes(f), b = legTimes(nx); return a && b && b.dep > a.arr && b.dep - a.arr < 36 * 3600000; };
    const group = (list, title, past) => {
      if (!list.length) return;
      if (title) html += '<div class="pass-sec">' + title + "</div>";
      const trips = []; list.forEach((f, k) => { const prev = list[k - 1]; if (k && !past && connects(prev, f)) trips[trips.length - 1].push(f); else trips.push([f]); });
      trips.forEach((trip, ti) => {
        if (ti && !past) { const t = legTimes(trip[0]); html += '<div class="pass-sec">NEXT TRIP' + (t ? " · " + dayKey(t.dep, ap(trip[0].from).tz) : "") + "</div>"; }
        trip.forEach((f, k) => {
          const n = trip.length > 1 ? "LEG " + (k + 1) + " OF " + trip.length : (past ? "FLOWN" : "YOUR FLIGHT");
          html += passHTML(f, i++, n);
          const nx = trip[k + 1];
          if (nx) { const a = legTimes(f), b = legTimes(nx); html += '<div class="layover"' + (passesAnimated ? ' style="animation:none"' : "") + ">LAYOVER · <b>" + durWords((b.dep - a.arr) / 60000) + "</b> IN " + esc(ap(f.to).CITY || f.to) + "</div>"; }
        });
      });
    };
    group(up, "", false);
    group(past, past.length && up.length ? "PAST FLIGHTS" : (past.length ? "FLOWN" : ""), true);
    $("passes").innerHTML = html;
    renderPocket();
    autoStamps();
    passesAnimated = true; boardedThunk = null; newPassId = null;
    requestAnimationFrame(applyStaticTears);
  }
  $("passes").addEventListener("click", e => {
    if (e.target.closest("#emptyAdd")) { openFlightEditor(null); return; }
    const del = e.target.closest("[data-del-flight]");
    if (del) {
      const id = del.dataset.delFlight;
      if (del.dataset.armed) {
        const tk = del.closest(".ticket");
        const go = () => { state.flights = state.flights.filter(f => f.id !== id); commit({ quiet: true }); renderPasses(); renderFlight(); };
        if (tk && tk.animate && !reduceMotion) tk.animate([{ opacity: 1 }, { opacity: 0, transform: "translateX(-40px) rotate(-2deg)" }], { duration: 220 }).onfinish = go; else go();
      } else { del.dataset.armed = "1"; del.textContent = "Delete"; del.classList.add("armed"); setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = "−"; del.classList.remove("armed"); } }, 3000); }
      e.stopPropagation(); return;
    }
    if (editPasses) { const tk = e.target.closest(".ticket"); if (tk) { openFlightEditor(tk.dataset.id); e.stopPropagation(); } }
  }, true);
  $("editPassesBtn").addEventListener("click", () => { editPasses = !editPasses; renderPasses(); });
  $("addFlightBtn").addEventListener("click", () => openFlightEditor(null));

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
  const TEAR_LEN = 62;            // px of pull to tear all the way through
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
      dir: partial ? f.tear.dir : null, fixed: !!partial, live: false, H: stub.offsetHeight, w: stub.offsetWidth, W: tk.querySelector(".main").offsetWidth,
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
      T.live = true;
      if (!T.dir) T.dir = "top";
      beginTear();
    }
    // any pull away from the pass tears it: right, down or up all count. Which end rips first just follows
    // the way you're pulling, and only settles once the tear has really started (a finger wobbles at first)
    if (!T.fixed && Math.abs(dy) > 14) { const want = dy < 0 ? "bottom" : "top"; if (want !== T.dir && T.e < T.H * 0.12) { T.dir = want; } }
    if (T.e > T.H * 0.12) T.fixed = true;
    const pull = Math.hypot(Math.max(0, dx) * 1.3, dy) * 1.1;
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

  // ================= FLIGHT MAP (any route in the world) =================
  const planeAnim = { x: null, y: null, a: 0, tx: 0, ty: 0, ta: 0, raf: 0 };
  let VIEW = null;
  function destPoint(p, brg, km) {
    const d = km / R, b = toRad(brg), la = toRad(p.lat), lo = toRad(p.lon);
    const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
    const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    return { lat: toDeg(la2), lon: ((toDeg(lo2) + 540) % 360) - 180 };
  }
  function buildView(f) {
    const key = f.from + "-" + f.to + (AIR ? "+" : "");
    if (VIEW && VIEW.key === key) return VIEW;
    if (!WORLD || !window.d3) return null;
    const A = ap(f.from), B = ap(f.to), L = Math.max(1, dist(A, B)), mid = interp(A, B, 0.5);
    const buf = Math.max(260, L * 0.16);
    const pts = [A, B].concat([0, 90, 180, 270].map(b => destPoint(mid, b, buf))).map(p => [p.lon, p.lat]);
    let p = L > 3200 ? d3.geoAzimuthalEquidistant().rotate([-mid.lon, -mid.lat]).clipAngle(100) : d3.geoMercator().rotate([-mid.lon, 0]);
    p.fitExtent([[24, 40], [376, 412]], { type: "Feature", geometry: { type: "MultiPoint", coordinates: pts } });
    if (p.clipExtent) p.clipExtent([[-20, -20], [420, 450]]);
    const path = d3.geoPath(p).digits(1);
    let lands = "", countries = [];
    for (const c of WORLD.feats) {
      const d = path(c.f); if (!d) continue;
      lands += '<path class="land" d="' + d + '"/>';
      const a = path.area(c.f);
      if (a > 3500) { const ct = p(d3.geoCentroid(c.f)); if (ct && ct[0] > 30 && ct[0] < 370 && ct[1] > 40 && ct[1] < 410) countries.push([c.n, ct[0], ct[1], a]); }
    }
    countries.sort((a, b) => b[3] - a[3]);
    const placed = [p([A.lon, A.lat]), p([B.lon, B.lat])];
    const far = (x, y, d) => placed.every(q => !q || Math.hypot(q[0] - x, q[1] - y) > d);
    let lbl = "";
    countries.slice(0, 9).forEach(([n, x, y]) => { if (far(x, y, 50)) { lbl += '<text class="lbl-country" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="middle">' + esc(n.toUpperCase()) + "</text>"; placed.push([x, y]); } });
    let cities = "";
    if (AIR) {
      const cand = [];
      for (const r of AIR.rows) {
        if (r[0] === A.code || r[0] === B.code || !/international/i.test(r[1])) continue;
        const c = { lat: r[4], lon: r[5] };
        const det = dist(A, c) + dist(c, B) - L; if (det > Math.max(260, L * 0.12)) continue;
        cand.push([r[2] || r[1], c, det]);
      }
      cand.sort((a, b) => a[2] - b[2]);
      let n = 0;
      for (const [name, c] of cand) {
        if (n >= 7) break;
        const q = p([c.lon, c.lat]); if (!q || q[0] < 20 || q[0] > 380 || q[1] < 50 || q[1] > 410) continue;
        if (!far(q[0], q[1], 46)) continue;
        cities += '<circle class="city-dot" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="1.6"/><text class="lbl-city" x="' + (q[0] + 4).toFixed(1) + '" y="' + (q[1] + 3).toFixed(1) + '">' + esc(name) + "</text>";
        placed.push(q); n++;
      }
    }
    const apMark = (a, other) => {
      const q = p([a.lon, a.lat]), o = p([other.lon, other.lat]); if (!q) return "";
      const right = !o || q[0] >= o[0];
      return '<circle class="ap-dot" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="3.4"/><text class="ap-lbl" x="' + (q[0] + (right ? 8 : -8)).toFixed(1) + '" y="' + (q[1] + 4).toFixed(1) + '" text-anchor="' + (right ? "start" : "end") + '">' + a.code + "</text>";
    };
    VIEW = { key, p, f, lands, lbl, cities, aps: apMark(A, B) + apMark(B, A) };
    return VIEW;
  }
  function proj(lon, lat) { const q = VIEW && VIEW.p([lon, lat]); return q || [-50, -50]; }
  function buildMapBase(v) {
    $("mapSvg").innerHTML = v.lands + v.lbl + v.cities + '<g id="routes"></g>' + v.aps +
      '<g id="planeG"><circle class="plane-halo" r="10" opacity=".18">' + (reduceMotion ? "" : '<animate attributeName="r" values="8;16;8" dur="2.4s" repeatCount="5"/><animate attributeName="opacity" values=".25;0;.25" dur="2.4s" repeatCount="5"/>') + '</circle><path class="plane" d="' + PLANE_PATH + '"/></g>';
    planeAnim.x = null;
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
  // the map is drawn in its own projection, so the plane's nose has to follow the route on screen
  function screenHeading(P) {
    const q = destPoint(P, P.hdg || 0, 30), a = proj(P.lon, P.lat), b = proj(q.lon, q.lat);
    return toDeg(Math.atan2(b[0] - a[0], -(b[1] - a[1])));
  }
  let drawNext = true, lastOver = "", builtKey = "";
  function renderFlight() {
    const now = Date.now();
    const P = currentPos(now);
    $("flightEmpty").style.display = P ? "none" : "";
    $("flightMain").style.display = P ? "" : "none";
    if (!P) return;
    const f = P.leg, A = ap(f.from), B = ap(f.to), t = legTimes(f);
    if (!userPickedLeg) selLeg = f.id;
    const chips = flightLegs().slice(0, 4);
    if (!chips.includes(f)) chips.unshift(f);
    $("legChips").innerHTML = chips.map(x => '<button class="chip" data-leg="' + x.id + '" aria-pressed="' + (x.id === f.id) + '">' + x.from + " → " + x.to + "</button>").join("") +
      (userPickedLeg ? '<button class="chip" data-leg="auto" aria-pressed="false">Auto</button>' : "");
    const v = buildView(f);
    if (!v) { $("overTxt").textContent = "Loading the map…"; worldReady.then(() => renderFlight()); return; }
    if (builtKey !== v.key) { buildMapBase(v); builtKey = v.key; drawNext = true; }
    let r = '<polyline class="route-all" points="' + polyPts(A, B, 0, 1, 64) + '"/>';
    if (P.prog > 0.002) r += '<polyline class="route-done' + (drawNext ? " draw" : "") + '" pathLength="1" points="' + polyPts(A, B, 0, P.prog, 64) + '"/>';
    $("routes").innerHTML = r;
    drawNext = false;
    const [px, py] = proj(P.lon, P.lat);
    movePlane(px, py, screenHeading(P));
    const tag = $("modeTag");
    const onGround = P.src === "gps" && (P.spd || 0) < 15;
    tag.className = "mode-tag " + (P.src === "gps" ? "gps" : P.src === "est" ? "est" : "");
    tag.textContent = P.src === "gps" ? (onGround ? "GPS · ON THE GROUND" : "GPS FIX") : P.src === "est" ? (gps.calib && gps.calib.leg === f.id ? "ESTIMATE · GPS-CORRECTED" : "ESTIMATE") : P.src === "landed" ? "LANDED" : "PREVIEW";
    let overLbl, overTxt;
    if (P.src === "gps") { overLbl = onGround ? "YOU'RE IN" : "NOW FLYING OVER"; overTxt = cap(whereLabel(P.lat, P.lon)); }
    else if (P.prog <= 0.003) { overLbl = "STARTING IN"; overTxt = A.city; }
    else if (P.prog >= 0.997) { overLbl = "ARRIVED IN"; overTxt = B.city; }
    else { overLbl = P.src === "est" ? "PROBABLY OVER" : "AT THIS POINT YOU'D BE OVER"; overTxt = cap(whereLabel(P.lat, P.lon)); }
    $("overLbl").textContent = overLbl;
    const ot = $("overTxt");
    if (overTxt !== lastOver) { ot.textContent = overTxt; ot.classList.remove("swap"); void ot.offsetWidth; ot.classList.add("swap"); lastOver = overTxt; }
    $("progBar").style.width = (P.prog * 100).toFixed(1) + "%";
    $("progFrom").textContent = f.from; $("progTo").textContent = f.to;
    $("progPct").textContent = Math.round(P.prog * 100) + "%";
    const D = t ? (t.arr - t.dep) / 60000 : estDur(f);
    let left;
    if (P.src === "gps") left = (P.spd || 0) > 40 ? P.toGo * 1000 / P.spd / 60 : (t && now < t.arr ? (t.arr - Math.max(now, t.dep)) / 60000 : null);
    else left = (1 - P.prog) * D;
    $("sAlt").innerHTML = P.alt != null ? fmtInt(P.alt * 3.28084) + "<em>ft</em>" : "—";
    $("sSpd").innerHTML = P.src === "gps" ? (P.spd != null ? fmtInt(P.spd * 3.6) + "<em>km/h</em>" : "—") : "~" + fmtInt(P.spd * 3.6) + "<em>km/h</em>";
    $("sHdg").textContent = P.hdg != null ? Math.round(P.hdg) + "° " + compass(P.hdg) : "—";
    $("sDist").innerHTML = fmtInt(P.toGo) + "<em>km</em>";
    $("sLeft").textContent = left != null ? dur(left) : "—";
    $("sLands").textContent = left != null ? hhmm(now + left * 60000, B.tz) : (t ? hhmm(t.arr, B.tz) : "--:--");
    $("sLandsLbl").textContent = "LANDS (" + (B.CITY || B.code).slice(0, 12) + ")";
    $("sliderBox").style.display = P.src === "preview" ? "" : "none";
    $("prevVal").textContent = $("prev").value + "%";
    renderWindow(P, now);
    checkAnnouncements(P, now);
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
    const near = nearbySides(P, 3), left = near.left, right = near.right;
    const side = seatSide(P.leg.seat);
    const sea = isSea(whereLabel(P.lat, P.lon));
    const list = arr => arr.length ? arr.map(x => '<div class="poi"><b>' + esc(x.n) + "</b><span>" + fmtInt(x.d) + " km away</span></div>").join("")
      : '<div class="poi none"><b>' + (sea ? "Open sea" : "Nothing big nearby") + "</b></div>";
    const key = left.map(x => x.n).join() + "|" + right.map(x => x.n).join() + "|" + side + "|" + sea;
    const col = (name, arr, mine) => '<div class="side-col' + (mine ? " mine" : "") + '"><h4><i class="wicon" aria-hidden="true"></i>' + name + (mine ? "<span>YOUR SIDE</span>" : "") + "</h4>" + list(arr) + "</div>";
    if (key !== lastWindowKey) {
      $("windowSides").innerHTML = col("LEFT", left, side === "left") + col("RIGHT", right, side === "right");
      lastWindowKey = key;
    } else {
      const cols = $("windowSides").querySelectorAll(".side-col");
      [left, right].forEach((arr, i) => cols[i] && cols[i].querySelectorAll(".poi span").forEach((s, j) => { if (arr[j]) s.textContent = fmtInt(arr[j].d) + " km away"; }));
    }
    const a = near.ahead;
    let aheadTxt;
    if (a) {
      const mins = P.spd > 40 ? a.d * 1000 / P.spd / 60 : null;
      aheadTxt = "Coming up ahead: <b>" + esc(a.n) + "</b> · " + fmtInt(a.d) + " km" + (mins != null && P.src !== "preview" ? " (~" + Math.round(mins) + " min)" : "");
    } else aheadTxt = "Nothing big straight ahead for a while.";
    $("ahead").innerHTML = aheadTxt;
    { const t = legTimes(P.leg); renderPorthole(P, P.src === "preview" && t ? t.dep + P.prog * (t.arr - t.dep) : now); }
    $("seatHint").textContent = side === "left" || side === "right" ? "Based on seat " + P.leg.seat.toUpperCase() + ". Check it once you're on board, since plane layouts differ." :
      side === "aisle" ? "Seat " + P.leg.seat.toUpperCase() + " looks like a middle or aisle seat. Lean over!" : "Add your seat to this flight (Passes → Edit) and your window side gets highlighted.";
  }

  // ================= GPS card =================
  function renderGPS() {
    const dot = $("gpsDot"), title = $("gpsTitle"), sub = $("gpsSub"), btn = $("gpsBtn");
    dot.className = "gps-dot " + (gps.status === "off" || gps.status === "nofix" ? "" : gps.status);
    btn.textContent = gps.status === "searching" ? "Cancel" : "Check my position";
    btn.className = gps.status === "searching" ? "btn" : "btn red";
    const ago = gps.last ? Math.round((Date.now() - gps.last.t) / 60000) : null;
    if (gps.status === "searching") { title.textContent = "Finding you…"; sub.textContent = "Hold the phone near the window. It can take up to a minute in the air, then GPS switches off."; }
    else if (gps.status === "denied") { title.textContent = "Can't use location"; sub.textContent = gps.err; }
    else if (gps.status === "nofix") { title.textContent = "Couldn't get a fix"; sub.textContent = "Try again closer to the window. Until then the map uses your flight times."; }
    else if (gps.last) { title.textContent = ago < 1 ? "Found you just now" : "Last checked " + ago + " min ago"; sub.textContent = gps.calib ? "Your estimate has been corrected with that fix. GPS is off again, so no battery drain." : "GPS is off again, so no battery drain."; }
    else { title.textContent = "Using your flight times"; sub.textContent = "No GPS running, so no battery drain. Tap to check once; it turns off right after."; }
  }
  $("gpsBtn").addEventListener("click", () => gps.status === "searching" ? stopGPS() : startGPS());

  // ================= CHECKLIST (no edit mode: type, Enter, tick, swipe) =================
  function renderChecklist(focusId, focusEnd) {
    if (!focusId && document.activeElement && $("ckList").contains(document.activeElement) && document.activeElement.tagName === "INPUT") { ckProgress(); return; }   // don't yank the keyboard away mid-typing
    const list = state.checklist, real = list.filter(c => c.label.trim()), doneN = real.filter(c => c.done).length;
    $("ckCount").textContent = doneN + " of " + real.length + " packed";
    $("ckBar").style.width = (real.length ? doneN / real.length * 100 : 0) + "%";
    const cl = $("cleared");
    if (real.length && doneN === real.length) { if (!cl.firstChild) cl.innerHTML = '<div class="cleared"><div class="big">CLEARED FOR<br>DEPARTURE</div><p>Everything\'s packed. Have a good flight.</p></div>'; }
    else cl.innerHTML = "";
    const groups = []; list.forEach(c => { let g = groups[groups.length - 1]; if (!g || g.sec !== c.sec) groups.push(g = { sec: c.sec, items: [] }); g.items.push(c); });
    $("ckList").innerHTML = (list.length ? "" : '<p class="note ck-empty">Nothing on the list yet. Add the first thing to pack.</p>') + groups.map((g, gi) =>
      '<div class="ck-div"><input value="' + esc(g.sec || "") + '" data-gi="' + gi + '" aria-label="Divider name" enterkeyhint="done"></div>' +
      g.items.map(c => '<div class="ck-item' + (c.done ? " done" : "") + '" data-id="' + esc(c.id) + '"><div class="ck-del">DELETE</div><div class="ck-row">' +
        '<button class="ck-box" data-tick aria-label="Tick">' + CHECK_SVG + '</button>' +
        '<input value="' + esc(c.label) + '" data-label aria-label="Item" enterkeyhint="next"></div></div>').join("")).join("");
    $("ckList")._groups = groups;
    if (focusId) { const inp = document.querySelector('.ck-item[data-id="' + focusId + '"] input'); if (inp) { inp.focus(); const n = focusEnd ? inp.value.length : 0; try { inp.setSelectionRange(n, n); } catch (e) {} } }
  }
  const ckBox = $("ckList");
  const ckItem = el => { const row = el.closest(".ck-item"); return row && state.checklist.find(c => c.id === row.dataset.id); };
  function ckProgress() {
    const real = state.checklist.filter(c => c.label.trim()), d = real.filter(c => c.done).length;
    $("ckCount").textContent = d + " of " + real.length + " packed"; $("ckBar").style.width = (real.length ? d / real.length * 100 : 0) + "%";
  }
  function ckRemove(c, el) {
    const go = () => { const i = state.checklist.indexOf(c); if (i >= 0) state.checklist.splice(i, 1); commit({ quiet: true }); renderChecklist(); };
    if (el && el.animate && !reduceMotion) { el.style.height = el.offsetHeight + "px"; el.animate([{ opacity: 1, height: el.offsetHeight + "px" }, { opacity: 0, height: "0px" }], { duration: 220, easing: "ease-in" }).onfinish = go; } else go();
  }
  ckBox.addEventListener("click", e => {
    const t = e.target.closest("[data-tick]"); if (!t) return;
    const c = ckItem(t); if (!c) return;
    c.done = !c.done; const row = t.closest(".ck-item"); row.classList.toggle("done", c.done); if (c.done) { row.classList.remove("pop"); void row.offsetWidth; row.classList.add("pop"); if (navigator.vibrate) navigator.vibrate(10); }
    commit({ quiet: true }); ckProgress();
    const real = state.checklist.filter(x => x.label.trim()); if (real.length && real.every(x => x.done)) renderChecklist(); else $("cleared").innerHTML = "";
  });
  ckBox.addEventListener("input", e => {
    if (e.target.matches("[data-label]")) { const c = ckItem(e.target); if (c) { c.label = e.target.value; commit({ quiet: true }); ckProgress(); } }
  });
  ckBox.addEventListener("change", e => {
    if (e.target.matches("[data-gi]")) { const g = ckBox._groups[+e.target.dataset.gi], v = e.target.value.trim().toUpperCase(); g.items.forEach(c => c.sec = v); commit({ quiet: true }); }
  });
  ckBox.addEventListener("keydown", e => {
    if (e.target.matches("[data-gi]") && e.key === "Enter") { e.preventDefault(); e.target.blur(); const g = ckBox._groups[+e.target.dataset.gi]; if (g && g.items[0] && !g.items[0].label) renderChecklist(g.items[0].id); return; }
    if (!e.target.matches("[data-label]")) return;
    const c = ckItem(e.target); if (!c) return;
    if (e.key === "Enter") { e.preventDefault(); const n = { id: uid(), sec: c.sec, label: "", done: false }; state.checklist.splice(state.checklist.indexOf(c) + 1, 0, n); commit({ quiet: true }); renderChecklist(n.id); }
    else if (e.key === "Backspace" && !e.target.value) { e.preventDefault(); const i = state.checklist.indexOf(c), prev = state.checklist[i - 1]; state.checklist.splice(i, 1); commit({ quiet: true }); renderChecklist(prev && prev.id, true); }
  });
  ckBox.addEventListener("focusout", e => {
    if (!e.target.matches("[data-label]")) return;
    const c = ckItem(e.target);
    setTimeout(() => { if (c && !c.label.trim() && state.checklist.includes(c) && !(document.activeElement && document.activeElement.closest && document.activeElement.closest(".ck-item[data-id='" + c.id + "']"))) { state.checklist.splice(state.checklist.indexOf(c), 1); commit({ quiet: true }); if (!ckBox.contains(document.activeElement)) renderChecklist(); } }, 150);
  });
  // swipe left to delete (finger or mouse)
  let sw = null;
  ckBox.addEventListener("pointerdown", e => { const row = e.target.closest(".ck-row"); if (!row || e.target.closest("button")) return; sw = { row, x: e.clientX, y: e.clientY, dx: 0, on: false, id: e.pointerId }; });
  ckBox.addEventListener("pointermove", e => {
    if (!sw || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (!sw.on) { if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; } if (dx < -10) { sw.on = true; sw.row.classList.add("swiping"); try { sw.row.setPointerCapture(e.pointerId); } catch (err) {} if (document.activeElement) document.activeElement.blur(); } else return; }
    sw.dx = Math.min(0, dx); sw.row.style.transform = "translateX(" + sw.dx + "px)";
    sw.row.parentElement.querySelector(".ck-del").style.opacity = Math.min(1, -sw.dx / 110);
  });
  const swEnd = () => {
    if (!sw) return; const { row, dx, on } = sw; sw = null; if (!on) return;
    row.classList.remove("swiping");
    const item = row.parentElement, c = ckItem(row);
    if (dx < -110 && c) { row.style.transform = "translateX(-110%)"; setTimeout(() => ckRemove(c, item), 160); }
    else { row.style.transform = ""; item.querySelector(".ck-del").style.opacity = 0; }
  };
  ckBox.addEventListener("pointerup", swEnd); ckBox.addEventListener("pointercancel", swEnd);
  $("ckAddItem").addEventListener("click", () => { const last = state.checklist[state.checklist.length - 1]; const n = { id: uid(), sec: last ? last.sec : "", label: "", done: false }; state.checklist.push(n); commit({ quiet: true }); renderChecklist(n.id); });
  $("ckAddDiv").addEventListener("click", () => { const n = { id: uid(), sec: "", label: "", done: false }; state.checklist.push(n); commit({ quiet: true }); renderChecklist(); const ins = ckBox.querySelectorAll("[data-gi]"); ins[ins.length - 1].focus(); });

  // ================= sheet: add / edit a flight =================
  const scrim = $("scrim"), sheet = $("sheet"), sheetEl = sheet;
  function closeSheet() { scrim.classList.remove("on"); sheet.innerHTML = ""; }
  scrim.addEventListener("click", e => { if (e.target === scrim) closeSheet(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && scrim.classList.contains("on")) closeSheet(); });
  function apLabel(code) { const a = ap(code); return a.unknown ? code : a.code + " · " + a.city + (a.country ? ", " + a.country : ""); }
  function airportField(id, label, code) {
    return '<div class="field ap-field"><label for="' + id + '">' + label + '</label><input type="text" id="' + id + '" autocomplete="off" autocapitalize="characters" spellcheck="false" value="' + esc(code ? apLabel(code) : "") + '" data-code="' + esc(code || "") + '"><div class="ap-sug" role="listbox"></div></div>';
  }
  function openFlightEditor(id) {
    const f = id ? state.flights.find(x => x.id === id) : null;
    // a new flight starts where your last one landed
    const o = flightsOrdered(), last = o.up[o.up.length - 1] || o.past[0];
    const from = f ? f.from : (last ? last.to : ""), to = f ? f.to : "";
    sheet.innerHTML = '<form id="flightForm" style="display:flex;flex-direction:column;gap:14px" autocomplete="off"><h2>' + (f ? "Edit flight" : "Add a flight") + "</h2>" +
      '<div class="grid2">' + airportField("fFrom", "From", from) + airportField("fTo", "To", to) + "</div>" +
      '<div class="grid2"><div class="field"><label for="fNo">Flight number</label><input type="text" id="fNo" value="' + esc(f ? f.no : "") + '" autocomplete="off"></div>' +
      '<div class="field"><label for="fSeat">Seat</label><input type="text" id="fSeat" value="' + esc(f ? f.seat : "") + '" autocomplete="off"></div></div>' +
      '<div class="field"><label for="fDep" id="fDepL">Departs (local time)</label><input type="datetime-local" id="fDep" value="' + esc(f ? f.dep : "") + '"></div>' +
      '<div class="field"><label for="fArr" id="fArrL">Lands (local time, optional)</label><input type="datetime-local" id="fArr" value="' + esc(f ? f.arr : "") + '"><small class="fine" id="fArrHint"></small></div>' +
      '<div class="grid2"><div class="field"><label for="fGate">Gate</label><input type="text" id="fGate" value="' + esc(f ? f.gate : "") + '" autocomplete="off"></div><div></div></div>' +
      '<p class="fine" id="fErr" style="color:var(--red)"></p>' +
      '<div class="actions">' + (f ? '<button type="button" class="btn danger" id="fDelete">Delete</button>' : "") + '<span style="flex:1"></span><button type="button" class="btn ghost" id="cancelSheet">Cancel</button><button type="submit" class="btn primary">' + (f ? "Save" : "Add flight") + "</button></div></form>";
    scrim.classList.add("on");
    const upd = () => {
      const a = ap($("fFrom").dataset.code), b = ap($("fTo").dataset.code);
      $("fDepL").textContent = "Departs (" + (a.unknown ? "local time" : a.city + " time") + ")";
      $("fArrL").textContent = "Lands (" + (b.unknown ? "local time" : b.city + " time") + ", optional)";
      $("fArrHint").textContent = !a.unknown && !b.unknown ? "Leave it empty and I'll estimate about " + durWords(Math.round(dist(a, b) / 780 * 60 + 30)) + " of flying." : "";
    };
    ["fFrom", "fTo"].forEach(fid => {
      const inp = $(fid), sug = inp.parentElement.querySelector(".ap-sug");
      const show = () => {
        const list = searchAirports(inp.value);
        sug.innerHTML = list.map(r => '<button type="button" data-code="' + r[0] + '"><b>' + r[0] + "</b><span>" + esc(r[2] || r[1]) + ", " + esc(countryName(r[3])) + "<small>" + esc(r[1]) + "</small></span></button>").join("");
        sug.classList.toggle("on", list.length > 0 && document.activeElement === inp);
      };
      inp.addEventListener("input", () => { inp.dataset.code = /^[A-Za-z]{3}$/.test(inp.value.trim()) && AIR && AIR.get(inp.value.trim().toUpperCase()) ? inp.value.trim().toUpperCase() : ""; show(); upd(); });
      inp.addEventListener("focus", () => { if (inp.dataset.code) inp.select(); show(); });
      inp.addEventListener("blur", () => setTimeout(() => sug.classList.remove("on"), 150));
      sug.addEventListener("pointerdown", e => e.preventDefault());
      sug.addEventListener("click", e => { const b = e.target.closest("[data-code]"); if (!b) return; inp.dataset.code = b.dataset.code; inp.value = apLabel(b.dataset.code); sug.classList.remove("on"); upd(); if (fid === "fFrom") $("fTo").focus(); });
    });
    airportsReady.then(upd);
    upd();
    $("cancelSheet").onclick = closeSheet;
    if (f) $("fDelete").onclick = e => {
      const b = e.currentTarget;
      if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again to delete"; return; }
      state.flights = state.flights.filter(x => x.id !== f.id); closeSheet(); commit(); toast("Flight deleted");
    };
    $("flightForm").onsubmit = e => {
      e.preventDefault();
      const fr = $("fFrom").dataset.code, tt = $("fTo").dataset.code;
      if (!fr || !tt) { $("fErr").textContent = "Pick both airports from the list (type a city or a 3-letter code)."; return; }
      if (fr === tt) { $("fErr").textContent = "From and To are the same airport."; return; }
      const rec = f || { id: uid(), torn: false, tornAt: 0, tear: null, stickers: [], added: Date.now() };
      Object.assign(rec, { from: fr, to: tt, no: $("fNo").value.trim(), seat: $("fSeat").value.trim(), gate: $("fGate").value.trim(), dep: $("fDep").value, arr: $("fArr").value });
      const t = legTimes(Object.assign({}, rec, { dur: 0 }));
      rec.dur = t && rec.arr ? Math.round((t.arr - t.dep) / 60000) : 0;
      if (!f) { state.flights.push(rec); newPassId = rec.id; }
      closeSheet();
      if (curTab !== "passes") location.hash = "passes";
      commit();
      toast(f ? "Flight saved" : "New boarding pass issued");
    };
  }

  // ================= toast =================
  let toastTimer = null;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
  }

  // ================= tabs =================
  const TABS = { passes: "v-passes", flight: "v-flight", passport: "v-passport", checklist: "v-check" };
  let curTab = "passes";
  function showTab(name) {
    if (!TABS[name]) name = "passes";
    curTab = name;
    if (stickerMode) setStickerMode(false);
    Object.entries(TABS).forEach(([k, v]) => $(v).classList.toggle("on", k === name));
    document.querySelectorAll("nav.tabs button").forEach(b => { if (b.dataset.tab === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    document.querySelector("nav.tabs").style.setProperty("--idx", Object.keys(TABS).indexOf(name));
    $("main").scrollTop = 0;
    if (name !== "passes" && editPasses) editPasses = false;
    if (name === "passes") { passesAnimated = false; renderPasses(); hintTear(); }
    if (name === "flight") { drawNext = true; lastWindowKey = ""; resumeGPS(); renderFlight(); } else pauseGPS();
    if (name === "passport") openPassportToNewest();
    if (name === "checklist") renderChecklist();
    updateTabDot();
  }
  document.querySelector("nav.tabs").addEventListener("click", e => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    if (location.hash !== "#" + b.dataset.tab) location.hash = b.dataset.tab; else showTab(b.dataset.tab);
  });
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));

  // ================= RUPEE CHECKER =================
  function fmtMoney(n, cur) { return (cur === "INR" ? "₹" : "S$") + (n >= 100 ? Math.round(n).toLocaleString("en-IN") : n.toFixed(2)); }
  let inrDir = "INR";
  function renderRupee() {
    const rate = state.inr.rate;                // SGD for 1 INR
    const v = parseFloat(($("inrIn").value || "").replace(/,/g, ""));
    $("inrCur").textContent = inrDir === "INR" ? "₹" : "S$";
    $("inrSwap").setAttribute("aria-label", inrDir === "INR" ? "Switch to Singapore dollars to rupees" : "Switch to rupees to Singapore dollars");
    if (!rate) { $("inrOut").textContent = "—"; $("inrNote").innerHTML = "Open the app once with internet to get today's rate, or <button class=\"linkbtn\" id=\"inrSet\">set it yourself</button>."; }
    else {
      $("inrOut").textContent = isNaN(v) ? (inrDir === "INR" ? "S$0" : "₹0") : (inrDir === "INR" ? fmtMoney(v * rate, "SGD") : fmtMoney(v / rate, "INR"));
      const d = new Date(state.inr.at);
      $("inrNote").innerHTML = "S$1 ≈ ₹" + (1 / rate).toFixed(1) + " · " + (state.inr.manual ? "your rate" : "rate from " + d.getDate() + " " + MONS[d.getMonth()].toLowerCase()) + " · <button class=\"linkbtn\" id=\"inrSet\">change</button>";
    }
    $("inrQuick").innerHTML = rate ? [100, 500, 1000, 5000].map(n => "<div><b>₹" + n.toLocaleString("en-IN") + "</b><span>" + fmtMoney(n * rate, "SGD") + "</span></div>").join("") : "";
  }
  async function fetchRate() {
    if (state.inr.manual && state.inr.rate) return;
    if (state.inr.at && Date.now() - state.inr.at < 6 * 3600000) return;
    try {
      const r = await fetch("https://api.frankfurter.app/latest?from=INR&to=SGD", { cache: "no-store" });
      const d = await r.json();
      if (d && d.rates && d.rates.SGD) { state.inr = { rate: d.rates.SGD, at: Date.now(), manual: false }; commit({ quiet: true }); renderRupee(); }
    } catch (e) {}
  }
  $("inrIn").addEventListener("input", renderRupee);
  $("inrSwap").addEventListener("click", () => { inrDir = inrDir === "INR" ? "SGD" : "INR"; renderRupee(); });
  $("rupee").addEventListener("click", e => {
    if (e.target.id !== "inrSet") return;
    const cur = state.inr.rate ? (1 / state.inr.rate).toFixed(1) : "";
    $("inrNote").innerHTML = '<span style="display:flex;gap:8px;align-items:center">₹ per S$1 <input type="number" id="inrRate" inputmode="decimal" value="' + cur + '" style="width:90px;padding:6px"><button class="btn sm" id="inrOk">Save</button></span>';
    $("inrRate").focus();
    $("inrOk").onclick = () => { const v = parseFloat($("inrRate").value); if (v > 0) { state.inr = { rate: 1 / v, at: Date.now(), manual: true }; commit({ quiet: true }); } renderRupee(); };
  });

  // ================= CAPTAIN ANNOUNCEMENTS =================
  let annQueue = [], annBusy = false;
  function chime() {
    const a = audio(); if (!a) return;
    [[740, 0], [587, 0.42]].forEach(([fq, dt]) => {
      const t = a.currentTime + dt, o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.value = fq; o2.type = "sine"; o2.frequency.value = fq * 2.01;
      const g2 = a.createGain(); g2.gain.value = 0.18;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.3);
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(a.destination); o.start(t); o2.start(t); o.stop(t + 1.4); o2.stop(t + 1.4);
    });
  }
  function speak() {
  }
  function showAnn(title, text) {
    annQueue.push([title, text]);
    if (annBusy) return;
    (function next() {
      const it = annQueue.shift(); if (!it) { annBusy = false; return; }
      annBusy = true;
      $("annTitle").textContent = it[0]; $("annText").textContent = it[1];
      $("ann").classList.add("on"); chime(); setTimeout(() => speak(it[1]), 900);
      clearTimeout(showAnn.t); showAnn.t = setTimeout(() => { $("ann").classList.remove("on"); setTimeout(next, 450); }, 7500);
    })();
  }
  $("ann").addEventListener("click", () => { clearTimeout(showAnn.t); $("ann").classList.remove("on"); setTimeout(() => { annBusy = false; const n = annQueue.length; if (n) { const it = annQueue.shift(); showAnn(it[0], it[1]); } }, 400); });
  function announce(f, key, force) {
    if (!state.annOn && !force) return false;
    state.ann[f.id] = state.ann[f.id] || [];
    if (state.ann[f.id].includes(key)) return false;
    state.ann[f.id].push(key); commit({ quiet: true });
    return true;
  }
  function checkAnnouncements(P, now) {
    if (!P || !state.annOn) return;
    const f = P.leg, A = ap(f.from), B = ap(f.to), t = legTimes(f), fn = f.no ? f.no.toUpperCase() : f.from + " to " + f.to;
    const say = (key, title, text) => { if (announce(f, key)) showAnn(title, text); };
    if (t && now > t.dep - 35 * 60000 && now < t.dep - 5 * 60000 && P.src !== "gps") say("board", "NOW BOARDING", "Ladies and gentlemen, flight " + fn + " to " + B.city + " is now boarding. Time to tear your stub.");
    const flying = P.src === "est" || (P.src === "gps" && (P.spd || 0) > 60);
    if (!flying) return;
    const elapsed = t ? (now - t.dep) / 60000 : null;
    if ((P.alt != null && P.alt > 9000) || (P.src === "est" && elapsed > 22 && P.prog < 0.8)) say("cruise", "FROM THE FLIGHT DECK", "Good " + partOfDay(now, A.tz) + ", this is your captain. We've reached our cruising altitude" + (P.alt ? " of " + fmtInt(Math.round(P.alt * 3.28084 / 1000) * 1000) + " feet" : "") + ". Sit back and enjoy the flight to " + B.city + ".");
    const c = overCountry(P.lat, P.lon);
    if (c && c !== A.country && c !== B.country && P.prog > 0.04 && P.prog < 0.96) say("over:" + c, "FROM THE FLIGHT DECK", "We're now flying over " + c + ".");
    if (P.prog >= 0.5 && P.prog < 0.6 && legLen(f) > 900) say("half", "HALFWAY THERE", "We're halfway to " + B.city + ". About " + durWords(Math.max(0, (1 - P.prog) * (t ? (t.arr - t.dep) / 60000 : estDur(f)))).toLowerCase() + " to go.");
    if (P.toGo < 170 && P.prog > 0.5 && P.prog < 0.995) say("descent", "BEGINNING OUR DESCENT", "We've started our descent into " + B.city + ". The local time there is " + hhmm(now, B.tz) + ".");
    if (P.prog >= 0.995 && P.src === "est") say("landed", "WELCOME TO " + B.CITY, "Welcome to " + B.city + (B.country ? ", " + B.country : "") + ". The local time is " + hhmm(now, B.tz) + ". Thanks for flying with Flight Deck.");
  }
  function partOfDay(ms, tz) { const h = zoned(ms, tz).getUTCHours(); return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"; }
  $("annOn").addEventListener("change", e => { state.annOn = e.target.checked; commit({ quiet: true }); if (state.annOn) showAnn("FROM THE FLIGHT DECK", "Announcements are on. You'll hear from me at boarding, cruise, new countries and landing."); });

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
    document.querySelectorAll(".sticker-toggle").forEach(b => { b.textContent = on ? "Done" : "Stickers"; b.classList.toggle("red", on); });
    $("tray").classList.toggle("on", on);
    if (on) { const m = $("main"); if (m.scrollTo) m.scrollTo({ top: 0, behavior: "smooth" }); else m.scrollTop = 0; }
    if (on && !$("trayRow").firstChild) $("trayRow").innerHTML = ST_KEYS.map(k => '<button class="tray-stk" data-st="' + k + '" aria-label="' + k + ' sticker">' + stickerSVG(k) + "</button>").join("");
  }
  document.querySelectorAll(".sticker-toggle").forEach(b => b.addEventListener("click", () => setStickerMode(!stickerMode)));
  $("trayDone").addEventListener("click", () => setStickerMode(false));
  function slapSound() { burst(0.05, 1200, 0.7, 0.55, "lowpass"); burst(0.03, 3000, 1, 0.25); }
  function peelSound() {
    const a = audio(); if (!a) return;
    const t = a.currentTime, s = a.createBufferSource(); s.buffer = noiseBuf;
    const f = a.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 3; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(1500, t + 0.22);
    const g = a.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t); s.stop(t + 0.3);
  }
  // drag a sticker from the tray, or move one already on a pass or a passport page
  let SD = null;
  function targetUnder(x, y) {
    const el = document.elementFromPoint(x, y); if (!el || !el.closest) return null;
    const main = el.closest("#passes .main");
    if (main && !main.closest(".ticket").classList.contains("flipped")) return { el: main, kind: "pass", id: main.closest(".ticket").dataset.id };
    const sheet = el.closest("#ppBook .pp-sheet:not(.leaf)");
    if (sheet) return { el: sheet, kind: "page", id: sheet.dataset.pg };
    return null;
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
    document.querySelectorAll(".drop").forEach(m => m.classList.remove("drop"));
    const m = targetUnder(x, y); if (m) m.el.classList.add("drop");
  }
  $("trayRow").addEventListener("pointerdown", e => {
    if (e.pointerType === "touch") return;   // fingers go through the touch handlers below
    const b = e.target.closest("[data-st]"); if (!b) return;
    e.preventDefault();
    startStickerDrag(e, b.dataset.st, b, null);
  });
  function grabPlaced(e) {
    if (!stickerMode || e.pointerType === "touch") return;
    const s = e.target.closest(".stk"); if (!s) return;
    e.preventDefault(); e.stopPropagation();
    if (s.dataset.psk != null) {
      const k = +s.dataset.psk, rec = state.ppStickers[k];
      startStickerDrag(e, rec.t, s, { list: state.ppStickers, k, s: rec, el: s });
    } else {
      const tk = s.closest(".ticket"), f = state.flights.find(x => x.id === tk.dataset.id), k = +s.dataset.sk;
      startStickerDrag(e, f.stickers[k].t, s, { list: f.stickers, k, s: f.stickers[k], el: s });
    }
    s.style.visibility = "hidden";
  }
  $("passes").addEventListener("pointerdown", grabPlaced, true);
  $("ppBook").addEventListener("pointerdown", grabPlaced, true);
  window.addEventListener("pointermove", e => {
    if (!SD || e.pointerId !== SD.id) return;
    if (Math.abs(e.clientX - SD.x0) + Math.abs(e.clientY - SD.y0) > 6) SD.moved = true;
    moveFloat(e.clientX, e.clientY);
  });
  function rerenderStickers() { if (curTab === "passport") renderPassport(); else renderPasses(); }
  function dropSticker(e) {
    if (!SD || (e && e.pointerId !== SD.id)) return;
    const d = SD; SD = null;
    document.body.classList.remove("stk-dragging");
    try { const sel = window.getSelection(); if (sel) sel.removeAllRanges(); } catch (err) {}
    document.querySelectorAll(".drop").forEach(m => m.classList.remove("drop"));
    let tgt = d.moved ? targetUnder(e.clientX, e.clientY) : null;
    let x = e.clientX, y = e.clientY;
    if (!d.moved && !d.existing) {           // a tap on the tray: stick it somewhere you can see
      const el = curTab === "passport" ? document.querySelector("#ppBook .pp-sheet") :
        Array.from(document.querySelectorAll("#passes .ticket:not(.flipped) .main")).find(m => { const r = m.getBoundingClientRect(); return r.bottom > 80 && r.top < innerHeight - 260; });
      if (el) { const r = el.getBoundingClientRect(); x = r.left + r.width * (0.2 + Math.random() * 0.6); y = r.top + r.height * (0.25 + Math.random() * 0.5); tgt = targetUnder(x, y) || (el.classList.contains("main") ? { el, kind: "pass", id: el.closest(".ticket").dataset.id } : { el, kind: "page", id: el.dataset.pg }); }
    }
    if (!d.moved && d.existing) { d.existing.el.style.visibility = ""; d.fl.remove(); return; }
    if (tgt) {
      const r = tgt.el.getBoundingClientRect();
      const rec = { t: d.t, x: +(((x - r.left) / r.width) * 100).toFixed(1), y: +(((y - r.top) / r.height) * 100).toFixed(1), r: parseFloat(d.fl.style.getPropertyValue("--r")) || 0, s: d.existing ? d.existing.s.s : 1 };
      if (d.existing) d.existing.list.splice(d.existing.k, 1);
      if (tgt.kind === "pass") { const f = state.flights.find(z => z.id === tgt.id); (f.stickers = f.stickers || []).push(rec); if (f.stickers.length > 20) f.stickers.shift(); }
      else { rec.pg = tgt.id; state.ppStickers.push(rec); if (state.ppStickers.length > 200) state.ppStickers.shift(); }
      d.fl.remove(); slapSound();
      commit({ quiet: true }); rerenderStickers();
      const scope = tgt.kind === "pass" ? '#passes .ticket[data-id="' + tgt.id + '"] .stk' : "#ppBook .stk";
      const els = document.querySelectorAll(scope), last = els[els.length - 1]; if (last) last.classList.add("slap");
    } else if (d.existing) {                 // dragged off: peel it away
      d.existing.list.splice(d.existing.k, 1);
      peelSound();
      d.fl.classList.add("peel"); setTimeout(() => d.fl.remove(), 420);
      commit({ quiet: true }); rerenderStickers();
    } else {
      d.fl.style.transition = "left .3s, top .3s, opacity .3s, transform .3s";
      d.fl.style.left = d.from.left + "px"; d.fl.style.top = d.from.top + "px"; d.fl.style.opacity = "0";
      setTimeout(() => d.fl.remove(), 320);
    }
  }
  window.addEventListener("pointerup", dropSticker);
  window.addEventListener("pointercancel", dropSticker);
  // fingers: plain touch events, like the stub tear (iPhone Safari cancels pointer drags)
  const asPtr = (e, t) => ({ clientX: t.clientX, clientY: t.clientY, pointerId: "touch", pointerType: "mouse", target: e.target, preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation() });
  $("trayRow").addEventListener("touchstart", e => {
    const b = e.target.closest("[data-st]"); if (!b || SD) return;
    e.preventDefault(); startStickerDrag(asPtr(e, e.touches[0]), b.dataset.st, b, null);
  }, { passive: false });
  ["passes", "ppBook"].forEach(id => $(id).addEventListener("touchstart", e => { if (!stickerMode || SD || !e.target.closest(".stk")) return; grabPlaced(asPtr(e, e.touches[0])); }, { capture: true, passive: false }));
  window.addEventListener("touchmove", e => {
    if (!SD || SD.id !== "touch") return;
    e.preventDefault(); const t = e.touches[0];
    if (Math.abs(t.clientX - SD.x0) + Math.abs(t.clientY - SD.y0) > 6) SD.moved = true;
    moveFloat(t.clientX, t.clientY);
  }, { passive: false });
  const touchDrop = e => { if (!SD || SD.id !== "touch") return; const t = e.changedTouches[0]; dropSticker({ clientX: t.clientX, clientY: t.clientY, pointerId: "touch" }); };
  window.addEventListener("touchend", touchDrop); window.addEventListener("touchcancel", touchDrop);

  // ================= PASSPORT (any trip, as many pages as you need) =================
  const INK = ["#3b47a8", "#b0294a", "#2d7a4c", "#6b3fa0", "#1f7a8c", "#8a4b1c", "#c2410c", "#1e3a8a"];
  const hashStr = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  let freshStamps = new Set(), ppPage = 0, ppNewDot = false;
  function stampDate(ms, tz) { const d = zoned(ms, tz); return pad(d.getUTCDate()) + " " + MONS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function fitText(txt, maxW, base) { return txt.length * base * 0.56 > maxW ? ' textLength="' + maxW + '" lengthAdjust="spacingAndGlyphs"' : ""; }
  function stampArt(s) {
    const a = ap(s.code), date = stampDate(s.at, a.tz), city = (a.city || a.code).toUpperCase(), ctry = (a.country || "").toUpperCase();
    const kind = s.kind === "arr" ? "ARRIVED" : "DEPARTED";
    const h = hashStr(s.code + s.kind), color = INK[hashStr(s.code) % INK.length], shape = h % 5;
    const uidp = "r" + hashStr(s.id).toString(36);
    const plane = (rot, x, y, sc) => '<path transform="translate(' + x + " " + y + ") rotate(" + rot + ") scale(" + sc + ')" d="' + PLANE_PATH + '" fill="currentColor"/>';
    const pr = s.kind === "arr" ? 135 : 45;
    if (shape === 0) return '<svg viewBox="0 0 150 96" class="ink" style="color:' + color + '"><rect x="4" y="4" width="142" height="88" rx="6" fill="none" stroke="currentColor" stroke-width="3.5"/><rect x="10" y="10" width="130" height="76" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<text x="75" y="28" text-anchor="middle" class="st-s">' + kind + '</text><text x="75" y="54" text-anchor="middle" class="st-b"' + fitText(city, 120, 23) + ">" + esc(city) + "</text>" +
      '<text x="75" y="66" text-anchor="middle" class="st-s"' + fitText(ctry, 110, 9.5) + ">" + esc(ctry) + "</text>" + plane(pr, 22, 78, 0.8) + '<text x="80" y="81" text-anchor="middle" class="st-d">' + date + '</text><text x="128" y="81" text-anchor="middle" class="st-s">' + s.code + "</text></svg>";
    if (shape === 1) return '<svg viewBox="0 0 120 120" class="ink" style="color:' + color + '"><circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="3.5"/><circle cx="60" cy="60" r="40" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<defs><path id="' + uidp + '" d="M60 60 m-47 0 a47 47 0 1 1 94 0 a47 47 0 1 1 -94 0"/></defs><text class="st-s"><textPath href="#' + uidp + '" startOffset="1%" textLength="290">' + esc(kind + " · " + city + " · " + (ctry || kind) + " ·") + "</textPath></text>" +
      '<text x="60" y="62" text-anchor="middle" class="st-b">' + s.code + '</text><text x="60" y="78" text-anchor="middle" class="st-d">' + date + "</text>" + plane(pr, 60, 34, 0.7) + "</svg>";
    if (shape === 2) return '<svg viewBox="0 0 150 100" class="ink" style="color:' + color + '"><path d="M30 6 H120 L146 50 L120 94 H30 L4 50 Z" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M34 13 H116 L138 50 L116 87 H34 L12 50 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<text x="75" y="32" text-anchor="middle" class="st-s"' + fitText(kind + " · " + ctry, 84, 9.5) + ">" + esc(kind + (ctry ? " · " + ctry : "")) + '</text><text x="75" y="58" text-anchor="middle" class="st-b"' + fitText(city, 82, 23) + ">" + esc(city) + '</text><text x="75" y="76" text-anchor="middle" class="st-d">' + date + "</text>" + plane(pr, 22, 50, 0.55) + plane(pr, 128, 50, 0.55) + "</svg>";
    if (shape === 3) return '<svg viewBox="0 0 150 100" class="ink" style="color:' + color + '"><ellipse cx="75" cy="50" rx="70" ry="45" fill="none" stroke="currentColor" stroke-width="3.5"/><ellipse cx="75" cy="50" rx="62" ry="37" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 3"/>' +
      '<text x="75" y="34" text-anchor="middle" class="st-s">' + kind + " · " + s.code + '</text><text x="75" y="58" text-anchor="middle" class="st-b"' + fitText(city, 104, 23) + ">" + esc(city) + '</text><text x="75" y="74" text-anchor="middle" class="st-d">' + date + "</text></svg>";
    return '<svg viewBox="0 0 120 120" class="ink" style="color:' + color + '"><rect x="5" y="5" width="110" height="110" rx="14" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="1 7" stroke-linecap="round"/><rect x="14" y="14" width="92" height="92" rx="8" fill="none" stroke="currentColor" stroke-width="2"/>' +
      plane(pr, 60, 34, 0.75) + '<text x="60" y="58" text-anchor="middle" class="st-s">' + kind + '</text><text x="60" y="78" text-anchor="middle" class="st-b"' + fitText(city, 84, 20) + ' style="font-size:20px">' + esc(city) + '</text><text x="60" y="95" text-anchor="middle" class="st-d">' + date + "</text></svg>";
  }
  function addStamp(kind, f, at) {
    const id = kind + ":" + f.id;
    if (state.stamps.some(s => s.id === id)) return false;
    state.stamps.push({ id, kind, code: kind === "dep" ? f.from : f.to, at: at || Date.now(), r: +(Math.random() * 18 - 9).toFixed(1), dx: +(Math.random() * 10 - 5).toFixed(1) });
    freshStamps.add(id); ppNewDot = true; updateTabDot();
    commit({ quiet: true });
    return true;
  }
  function autoStamps() {
    const now = Date.now();
    for (const f of state.flights) {
      const t = legTimes(f);
      if (f.torn) addStamp("dep", f, f.tornAt || now);
      else if (t && now > t.dep) addStamp("dep", f, t.dep);
      if (t && now > t.arr) addStamp("arr", f, t.arr);
    }
  }
  const AIRLINES = { SQ: "Singapore Airlines", TR: "Scoot", "3K": "Jetstar Asia", "6E": "IndiGo", AI: "Air India", IX: "Air India Express", UK: "Vistara", SG: "SpiceJet", QP: "Akasa Air",
    EK: "Emirates", QR: "Qatar Airways", EY: "Etihad", TG: "Thai Airways", MH: "Malaysia Airlines", AK: "AirAsia", D7: "AirAsia X", FD: "Thai AirAsia", OD: "Batik Air", ID: "Batik Air",
    GA: "Garuda Indonesia", CX: "Cathay Pacific", UO: "HK Express", JL: "Japan Airlines", NH: "ANA", KE: "Korean Air", OZ: "Asiana", CI: "China Airlines", BR: "EVA Air",
    CA: "Air China", MU: "China Eastern", CZ: "China Southern", BA: "British Airways", VS: "Virgin Atlantic", LH: "Lufthansa", AF: "Air France", KL: "KLM", LX: "Swiss",
    TK: "Turkish Airlines", QF: "Qantas", JQ: "Jetstar", VA: "Virgin Australia", NZ: "Air New Zealand", AA: "American", UA: "United", DL: "Delta", AC: "Air Canada",
    UL: "SriLankan", BG: "Biman", PR: "Philippine Airlines", "5J": "Cebu Pacific", VN: "Vietnam Airlines", VJ: "VietJet", ET: "Ethiopian", SV: "Saudia", WY: "Oman Air",
    GF: "Gulf Air", FZ: "flydubai", G9: "Air Arabia", U2: "easyJet", FR: "Ryanair", W6: "Wizz Air", EI: "Aer Lingus", IB: "Iberia", AZ: "ITA Airways", SK: "SAS", AY: "Finnair", OS: "Austrian" };
  const airlineOf = no => { const m = /^\s*([A-Z0-9]{2})\s*\d/i.exec(no || ""); return m ? (AIRLINES[m[1].toUpperCase()] || m[1].toUpperCase()) : null; };
  function travelStats(year) {
    const now = Date.now();
    const flown = state.flights.filter(f => { const t = legTimes(f); if (!(f.torn || (t && t.arr < now))) return false; return !year || (t && new Date(t.dep).getUTCFullYear() === year); });
    let km = 0, mins = 0, longest = null, shortest = null;
    const airports = new Map(), countries = new Map(), airlines = new Map();
    flown.forEach(f => {
      const L = legLen(f), t = legTimes(f); km += L; mins += t ? (t.arr - t.dep) / 60000 : estDur(f);
      if (!longest || L > longest.L) longest = { f, L };
      if (!shortest || L < shortest.L) shortest = { f, L };
      [f.from, f.to].forEach(c => airports.set(c, (airports.get(c) || 0) + 1));
      const al = airlineOf(f.no); if (al) airlines.set(al, (airlines.get(al) || 0) + 1);
      [f.from, f.to].forEach(c => { const cc = ap(c).cc; if (cc && !countries.has(cc)) countries.set(cc, t ? t.dep : now); });
    });
    state.stamps.forEach(s => { const cc = ap(s.code).cc; if (cc && (!year || new Date(s.at).getUTCFullYear() === year)) { if (!countries.has(cc) || countries.get(cc) > s.at) countries.set(cc, s.at); } });
    const first = state.flights.map(f => legTimes(f)).filter(Boolean).sort((a, b) => a.dep - b.dep)[0];
    const homeCount = {}; state.flights.forEach(f => { homeCount[f.from] = (homeCount[f.from] || 0) + 1; });
    const home = Object.keys(homeCount).sort((a, b) => homeCount[b] - homeCount[a])[0];
    const upcoming = state.flights.filter(f => { const t = legTimes(f); return !f.torn && (!t || t.arr >= now); }).length;
    return { flights: flown.length, km, mins, airports, countries, airlines, longest, shortest, first, home, upcoming };
  }
  const sealColor = cc => INK[hashStr(cc) % INK.length];
  function seal(cc) { return '<svg class="seal" viewBox="0 0 40 40" style="color:' + sealColor(cc) + '"><circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" stroke-width=".8" stroke-dasharray="1.5 1.5"/><text x="20" y="24.5" text-anchor="middle" fill="currentColor">' + esc(cc) + "</text></svg>"; }
  function passportNo() { return "FD" + (hashStr((state.name || "traveller") + (state.flights[0] ? state.flights[0].id : "")) % 9000000 + 1000000); }
  const SILHOUETTE = '<svg class="sil" viewBox="0 0 100 120" aria-hidden="true"><path d="M50 18c13 0 21 10 21 24 0 15-9 27-21 27S29 57 29 42c0-14 8-24 21-24z"/><path d="M10 120c2-24 18-38 40-38s38 14 40 38z"/></svg>';
  const EMBLEM = '<svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e3a1"/><stop offset=".45" stop-color="#c79a3e"/><stop offset=".6" stop-color="#f1d98c"/><stop offset="1" stop-color="#9c7428"/></linearGradient></defs><g fill="none" stroke="url(#gold)" stroke-width="2.4"><circle cx="60" cy="60" r="30"/><ellipse cx="60" cy="60" rx="13" ry="30"/><path d="M30 60h60M34 45h52M34 75h52"/>' +
    '<path d="M28 62c-10-4-18-12-22-24 8 4 15 6 22 6M27 70c-9-1-17-6-22-13 7 2 14 2 21 1M92 62c10-4 18-12 22-24-8 4-15 6-22 6M93 70c9-1 17-6 22-13-7 2-14 2-21 1" stroke-linecap="round"/></g><path fill="url(#gold)" transform="translate(60 22) scale(1.1)" d="' + PLANE_PATH + '"/></svg>';
  function ppPages() {
    const stamps = state.stamps.slice().sort((a, b) => a.at - b.at);
    const per = 5, n = Math.max(2, Math.ceil(stamps.length / per) + (stamps.length % per === 0 ? 1 : 0));
    const pages = [{ k: "cover" }, { k: "info" }, { k: "record" }, { k: "map" }];
    for (let i = 0; i < n; i++) pages.push({ k: "visa", i, stamps: stamps.slice(i * per, i * per + per) });
    // journal: a page per day (4 moments a page), plus a fresh page for today
    const ms = state.moments.slice().sort((a, b) => a.at - b.at), dk = ms2 => new Date(ms2).toDateString();
    let j = 0, cur = null;
    ms.forEach(m => { if (!cur || cur.day !== dk(m.at) || cur.moments.length >= 4) { cur = { k: "journal", i: j++, day: dk(m.at), at: m.at, moments: [] }; pages.push(cur); } cur.moments.push(m); });
    if (!cur || cur.day !== dk(Date.now()) || cur.moments.length >= 4) pages.push({ k: "journal", i: j++, day: dk(Date.now()), at: Date.now(), moments: [] });
    pages.push({ k: "countries" });
    return pages;
  }
  function pageStickers(pg) { return state.ppStickers.map((s, k) => ({ s, k })).filter(x => x.s.pg === pg).map(({ s, k }) => '<span class="stk" data-psk="' + k + '" style="left:' + s.x + "%;top:" + s.y + "%;--r:" + s.r + "deg;--s:" + s.s + '">' + stickerSVG(s.t) + "</span>").join(""); }
  // fits the map to the places you've flown; the whole world only once your trips are spread out
  function routesProjection(x0, y0, x1, y1) {
    const pts = [...new Set(state.flights.flatMap(f => [f.from, f.to]))].map(c => ap(c)).filter(a => !a.unknown);
    if (pts.length) {
      const lons = pts.map(a => a.lon), lats = pts.map(a => a.lat);
      const spanLon = Math.max(...lons) - Math.min(...lons), spanLat = Math.max(...lats) - Math.min(...lats);
      if (spanLon < 140 && spanLat < 70) {
        const ring = pts.flatMap(a => [0, 90, 180, 270].map(b => destPoint(a, b, 700))).concat(pts).map(a => [a.lon, a.lat]);
        const midLon = (Math.max(...lons) + Math.min(...lons)) / 2;
        return { p: d3.geoMercator().rotate([-midLon, 0]).fitExtent([[x0, y0], [x1, y1]], { type: "Feature", geometry: { type: "MultiPoint", coordinates: ring } }), world: false };
      }
    }
    return { p: d3.geoEqualEarth().fitExtent([[x0, y0], [x1, y1]], { type: "Sphere" }), world: true };
  }
  function worldMapSVG(w, h) {
    if (!WORLD || !window.d3) return '<p class="fine">The map loads once you\'ve opened the app with internet.</p>';
    const rp = routesProjection(4, 4, w - 4, h - 4), p = rp.p.clipExtent ? rp.p.clipExtent([[0, 0], [w, h]]) : rp.p, path = d3.geoPath(p).digits(1);
    const visited = new Set(); state.stamps.forEach(s => visited.add(ap(s.code).cc));
    const ccOf = name => { const hit = state.stamps.find(s => ap(s.code).country === name); return hit ? ap(hit.code).cc : null; };
    let land = WORLD.feats.map(c => '<path class="' + (ccOf(c.n) ? "pm-land on" : "pm-land") + '" d="' + (path(c.f) || "") + '"/>').join("");
    const now = Date.now();
    const routes = state.flights.map(f => {
      const A = ap(f.from), B = ap(f.to), t = legTimes(f), done = f.torn || (t && t.arr < now);
      return '<path class="pm-route' + (done ? " done" : "") + '" d="' + path({ type: "LineString", coordinates: [[A.lon, A.lat], [B.lon, B.lat]] }) + '"/>';
    }).join("");
    const dots = [...new Set(state.flights.flatMap(f => [f.from, f.to]))].map(c => { const a = ap(c), q = p([a.lon, a.lat]); return q ? '<circle class="pm-dot" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="2.2"/>' : ""; }).join("");
    const lbls = rp.world ? "" : [...new Set(state.flights.flatMap(f => [f.from, f.to]))].map(c => { const a = ap(c), q = p([a.lon, a.lat]); return q ? '<text class="pm-lbl" x="' + (q[0] + 4).toFixed(1) + '" y="' + (q[1] - 3).toFixed(1) + '">' + c + "</text>" : ""; }).join("");
    return '<svg class="pp-map" viewBox="0 0 ' + w + " " + h + '">' + (rp.world ? '<path class="pm-sphere" d="' + path({ type: "Sphere" }) + '"/>' : '<rect class="pm-sphere" width="' + w + '" height="' + h + '"/>') + '<path class="pm-grat" d="' + path(d3.geoGraticule10()) + '"/>' + land + routes + dots + lbls + "</svg>";
  }
  const ppSheet = (cls, pg, inner, idx) => '<div class="pp-sheet ' + cls + '" data-pg="' + pg + '" style="--hue:' + [158, 205, 28, 330, 95, 250][idx % 6] + '"><div class="pp-micro" aria-hidden="true"></div><div class="pp-wm" aria-hidden="true">' + EMBLEM + "</div>" + inner + pageStickers(pg) + '<div class="pp-foot">' + (idx > 0 ? idx : "") + "</div></div>";
  function pageHTML(pg, idx) {
    if (pg.k === "cover") return '<div class="pp-sheet cover" data-pg="cover"><div class="cv-frame"></div><div class="cv-top">FLIGHT DECK</div><div class="cv-emblem">' + EMBLEM + '</div><div class="cv-title">PASSPORT</div><div class="cv-sub">' + esc(state.name ? state.name.toUpperCase() : "TRAVEL DOCUMENT") + '</div><svg class="cv-chip" viewBox="0 0 40 26" aria-hidden="true"><rect x="1" y="1" width="38" height="24" rx="3"/><circle cx="20" cy="13" r="6"/><path d="M1 13h13M26 13h13"/></svg>' + pageStickers("cover") + "</div>";
    if (pg.k === "info") {
      const st = travelStats(), nm = (state.name || "").trim(), parts = nm.split(/\s+/);
      const surname = parts.length > 1 ? parts[parts.length - 1] : "", given = parts.length > 1 ? parts.slice(0, -1).join(" ") : nm;
      return ppSheet("info", "info", '<div class="pp-head">PASSPORT · FLIGHT DECK<span>P &nbsp;·&nbsp; ' + passportNo() + "</span></div>" +
        '<div class="id-row"><div class="id-photo">' + SILHOUETTE + '<span class="holo" aria-hidden="true"></span></div><div class="id-fields">' +
        '<label class="id-f"><small>NAME</small><input type="text" id="ppName" value="' + esc(nm) + '" maxlength="40" autocomplete="off" autocapitalize="words"></label>' +
        (surname ? '<div class="id-f"><small>SURNAME / GIVEN NAMES</small><b>' + esc(surname.toUpperCase()) + " / " + esc(given.toUpperCase()) + "</b></div>" : "") +
        '<div class="id-f"><small>HOME AIRPORT</small><b>' + (st.home ? esc(st.home + " · " + ap(st.home).city.toUpperCase()) : "—") + "</b></div>" +
        '<div class="id-f"><small>DATE OF ISSUE</small><b>' + (st.first ? stampDate(st.first.dep, "UTC") : "—") + '</b></div><div class="id-f"><small>AUTHORITY</small><b>FLIGHT DECK</b></div></div></div>' +
        '<div class="id-ghost">' + SILHOUETTE + "</div>" +
        '<div class="id-sign"><span class="sig">' + esc(nm || " ") + '</span><small>HOLDER\'S SIGNATURE</small></div>', idx);
    }
    if (pg.k === "record") {
      const st = travelStats(), yr = new Date().getFullYear(), ys = travelStats(yr);
      const around = st.km / 40075, moon = st.km / 384400 * 100;
      const top = [...st.airports.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
      const als = [...st.airlines.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
      const h = Math.floor(st.mins / 60), m = Math.round(st.mins % 60);
      const body = st.flights ? '<div class="rec-big"><div><b>' + st.flights + '</b><small>FLIGHTS</small></div><div><b>' + fmtInt(st.km) + '</b><small>KILOMETRES</small></div><div><b>' + h + "<i>h</i> " + m + '<i>m</i></b><small>IN THE AIR</small></div></div>' +
        '<p class="rec-fun">That\'s <b>' + (around >= 0.1 ? around.toFixed(around < 1 ? 2 : 1) + "×" : "a little bit of the way") + "</b> around the Earth" + (moon >= 1 ? ", or " + moon.toFixed(moon < 10 ? 1 : 0) + "% of the way to the Moon" : "") + ".</p>" +
        '<div class="rec-grid"><div><small>COUNTRIES</small><b>' + st.countries.size + '</b></div><div><small>AIRPORTS</small><b>' + st.airports.size + '</b></div><div><small>AIRLINES</small><b>' + (st.airlines.size || "—") + "</b></div></div>" +
        '<div class="rec-list"><small>LONGEST FLIGHT</small><p><b>' + st.longest.f.from + " → " + st.longest.f.to + "</b><span>" + fmtInt(st.longest.L) + " km</span></p>" +
        (st.flights > 1 && Math.abs(st.shortest.L - st.longest.L) > 1 ? "<small>SHORTEST FLIGHT</small><p><b>" + st.shortest.f.from + " → " + st.shortest.f.to + "</b><span>" + fmtInt(st.shortest.L) + " km</span></p>" : "") +
        "<small>TOP AIRPORTS</small>" + top.map(([c, n]) => "<p><b>" + c + " · " + esc(ap(c).city) + "</b><span>" + n + "×</span></p>").join("") +
        (als.length ? "<small>AIRLINES</small>" + als.map(([a, n]) => "<p><b>" + esc(a) + "</b><span>" + n + "×</span></p>").join("") : "") +
        (state.moments.length ? "<small>JOURNAL</small><p><b>" + state.moments.length + " moment" + (state.moments.length === 1 ? "" : "s") + "</b><span>" + Object.keys(MOMENT_KINDS).map(k => [k, state.moments.filter(m => m.kind === k).length]).filter(x => x[1]).map(([k, n]) => n + " " + MOMENT_KINDS[k].word.toLowerCase()).join(" · ") + "</span></p>" : "") + "</div>" +
        '<p class="rec-year">' + yr + ": " + ys.flights + " flight" + (ys.flights === 1 ? "" : "s") + " · " + fmtInt(ys.km) + " km · " + ys.countries.size + " countr" + (ys.countries.size === 1 ? "y" : "ies") + "</p>"
        : '<div class="rec-empty"><b>Your record starts with your first landing.</b><p>Every flight you take adds to it: distance, hours in the air, countries, airports and airlines.</p>' + (st.upcoming ? "<p>" + st.upcoming + " flight" + (st.upcoming === 1 ? "" : "s") + " coming up.</p>" : "") + "</div>";
      return ppSheet("record", "record", '<div class="pp-head">TRAVEL RECORD<span>ALL TIME</span></div>' + body + '<button class="rec-share" id="ppShare">Share my passport</button>', idx);
    }
    if (pg.k === "map") return ppSheet("", "map", '<div class="pp-head">ROUTES FLOWN<span>' + state.flights.length + " FLIGHT" + (state.flights.length === 1 ? "" : "S") + "</span></div>" + worldMapSVG(300, 250) +
      '<p class="fine">Solid lines are flights you\'ve taken, dashed ones are coming up. Countries you\'ve been stamped in are shaded.</p>', idx);
    if (pg.k === "journal") return journalPage(pg, idx);
    if (pg.k === "countries") {
      const st = travelStats(), list = [...st.countries.entries()].sort((a, b) => a[1] - b[1]);
      return ppSheet("", "countries", '<div class="pp-head">COUNTRIES VISITED<span>' + list.length + "</span></div>" +
        (list.length ? '<div class="ctry">' + list.map(([cc, at]) => "<div>" + seal(cc) + "<b>" + esc(countryName(cc)) + "</b><small>" + stampDate(at, "UTC") + "</small></div>").join("") + "</div>" : '<p class="fine">Countries appear here as you get stamped in.</p>'), idx);
    }
    // visa pages: stamps land where they land, a little crooked, sometimes overlapping, like the real thing
    const pgKey = "v" + pg.i;
    const SPOTS = [[27, 24], [73, 30], [30, 55], [70, 62], [42, 84]];
    let inner = '<div class="pp-head">VISAS<span>' + (pg.i + 1) + "</span></div>";
    pg.stamps.forEach((s, k) => {
      const rnd = seeded(s.id), sp = SPOTS[k], x = sp[0] + (rnd() * 10 - 5), y = sp[1] + (rnd() * 8 - 4);
      inner += '<div class="st-wrap' + (freshStamps.has(s.id) ? " fresh" : "") + '" style="left:' + x.toFixed(1) + "%;top:" + y.toFixed(1) + "%;--r:" + s.r + 'deg"><span class="rubber" aria-hidden="true"></span>' + stampArt(s) + "</div>";
    });
    const pages = ppPages(), firstRoom = pages.find(p => p.k === "visa" && p.stamps.length < 5);
    if (firstRoom && firstRoom.i === pg.i) {
      const nx = flightsOrdered().up.find(f => !state.stamps.some(s => s.id === "dep:" + f.id) || !state.stamps.some(s => s.id === "arr:" + f.id));
      if (nx) {
        const kind = state.stamps.some(s => s.id === "dep:" + nx.id) ? "arr" : "dep", code = kind === "dep" ? nx.from : nx.to, sp = SPOTS[pg.stamps.length];
        inner += '<button class="st-slot" style="left:' + sp[0] + "%;top:" + sp[1] + '%" data-stamp="' + kind + ":" + nx.id + '"><span>' + esc(ap(code).city.toUpperCase()) + "</span><small>" + (kind === "dep" ? "Stamps when you tear your stub" : "Stamps when you land") + " · tap to stamp now</small></button>";
      }
    }
    return ppSheet("visa", pgKey, inner, idx);
  }
  function renderPassport() {
    const pages = ppPages();
    if (ppPage >= pages.length) ppPage = pages.length - 1;
    const book = $("ppBook");
    book.innerHTML = pageHTML(pages[ppPage], ppPage);
    book.classList.toggle("closed", ppPage === 0);
    $("ppCount").textContent = state.stamps.length + " STAMP" + (state.stamps.length === 1 ? "" : "S") + (state.moments.length ? " · " + state.moments.length + " MOMENT" + (state.moments.length === 1 ? "" : "S") : "");
    const fresh = book.querySelector(".st-wrap.fresh");
    if (fresh) { setTimeout(stampSound, 330); pages[ppPage].stamps && pages[ppPage].stamps.forEach(s => freshStamps.delete(s.id)); }
    const nm = $("ppName");
    if (nm) nm.addEventListener("change", () => { state.name = nm.value.trim().slice(0, 40); commit({ quiet: true }); renderPassport(); });
    const sh = $("ppShare"); if (sh) sh.addEventListener("click", sharePassport);
  }
  // ---------- share card (an image of your passport stats, like Flighty's) ----------
  async function sharePassport() {
    const st = travelStats(), W = 1080, H = 1350;
    try { await document.fonts.ready; } catch (e) {}
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    const bg = g.createRadialGradient(W * 0.3, H * 0.15, 50, W * 0.5, H * 0.5, H * 0.9); bg.addColorStop(0, "#2e3f6b"); bg.addColorStop(1, "#141d38");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const gold = g.createLinearGradient(0, 0, W, H); gold.addColorStop(0, "#f6e3a1"); gold.addColorStop(0.45, "#c79a3e"); gold.addColorStop(0.6, "#f1d98c"); gold.addColorStop(1, "#9c7428");
    g.strokeStyle = gold; g.lineWidth = 3; g.strokeRect(40, 40, W - 80, H - 80);
    g.fillStyle = gold; g.textAlign = "center";
    g.font = "600 34px 'Barlow Condensed', sans-serif"; g.fillText("F L I G H T   D E C K", W / 2, 130);
    g.font = "700 120px 'Barlow Condensed', sans-serif"; g.fillText("PASSPORT", W / 2, 250);
    g.font = "600 38px 'Barlow Condensed', sans-serif"; g.fillText((state.name || "TRAVELLER").toUpperCase(), W / 2, 310);
    // map
    if (WORLD && window.d3) {
      const rp = routesProjection(90, 360, W - 90, 800), p = rp.p, path = d3.geoPath(p, g);
      g.save(); g.beginPath(); g.rect(80, 350, W - 160, 460); g.clip();
      if (rp.world) { g.beginPath(); path({ type: "Sphere" }); } else { g.beginPath(); g.rect(80, 350, W - 160, 460); }
      g.fillStyle = "rgba(255,255,255,0.05)"; g.fill();
      const visited = new Set(state.stamps.map(s => ap(s.code).country));
      WORLD.feats.forEach(ct => { g.beginPath(); path(ct.f); g.fillStyle = visited.has(ct.n) ? "#d9b867" : "rgba(214,226,255,0.16)"; g.fill(); });
      g.strokeStyle = "#f6e3a1"; g.lineWidth = 3.5; g.lineCap = "round";
      state.flights.forEach(f => { const A = ap(f.from), B = ap(f.to); g.beginPath(); path({ type: "LineString", coordinates: [[A.lon, A.lat], [B.lon, B.lat]] }); g.stroke(); });
      g.fillStyle = "#fff";
      g.font = "600 26px 'DM Mono', monospace"; g.textAlign = "left";
      [...new Set(state.flights.flatMap(f => [f.from, f.to]))].forEach(code => { const a = ap(code), q = p([a.lon, a.lat]); if (q) { g.fillStyle = "#fff"; g.beginPath(); g.arc(q[0], q[1], 7, 0, Math.PI * 2); g.fill(); if (!rp.world) { g.fillStyle = "rgba(255,255,255,.85)"; g.fillText(code, q[0] + 12, q[1] - 8); } } });
      g.restore(); g.textAlign = "center";
    }
    // numbers
    const nums = [[st.flights || state.flights.length, st.flights ? "FLIGHTS" : "FLIGHTS BOOKED"], [fmtInt(st.km || state.flights.reduce((s, f) => s + legLen(f), 0)), st.flights ? "KILOMETRES" : "KM PLANNED"], [st.countries.size, "COUNTRIES"]];
    nums.forEach(([v, l], k) => {
      const x = W / 2 + (k - 1) * 320;
      g.fillStyle = "#fff"; g.font = "700 104px 'Barlow Condensed', sans-serif"; g.fillText(String(v), x, 960);
      g.fillStyle = gold; g.font = "600 30px 'Barlow Condensed', sans-serif"; g.fillText(l, x, 1005);
    });
    g.fillStyle = "rgba(255,255,255,0.75)"; g.font = "500 34px 'Barlow', sans-serif";
    const around = (st.km || 0) / 40075;
    g.fillText(st.flights ? "That's " + (around >= 0.1 ? around.toFixed(around < 1 ? 2 : 1) + "× around the Earth" : "just getting started") + "." : "The trip is about to begin.", W / 2, 1110);
    const top = [...st.countries.keys()].slice(0, 6).map(cc => countryName(cc)).join("  ·  ");
    g.font = "600 30px 'Barlow Condensed', sans-serif"; g.fillStyle = gold; g.fillText(top.toUpperCase(), W / 2, 1180);
    g.fillStyle = "rgba(255,255,255,0.4)"; g.font = "500 24px 'DM Mono', monospace"; g.fillText("anishagarwal29.github.io/flight-deck", W / 2, 1265);
    c.toBlob(async blob => {
      if (!blob) return;
      const file = new File([blob], "flight-deck-passport.png", { type: "image/png" });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "My Flight Deck passport" }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
      const url = URL.createObjectURL(blob);
      sheetEl.innerHTML = '<h2>Your passport card</h2><img src="' + url + '" alt="Flight Deck passport card" style="width:100%;border-radius:10px"><p class="note">Press and hold the image to save or share it.</p><div class="actions"><button class="btn primary" id="cancelSheet">Done</button></div>';
      scrim.classList.add("on"); $("cancelSheet").onclick = closeSheet;
    }, "image/png");
  }

  function turnPage(delta) {
    const pages = ppPages(), to = Math.max(0, Math.min(pages.length - 1, ppPage + delta));
    if (to === ppPage) { const b = $("ppBook"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); return; }
    const book = $("ppBook"), old = book.firstElementChild;
    pageSound();
    if (!old || reduceMotion || !old.animate) { ppPage = to; renderPassport(); return; }
    if (delta > 0) {
      const leaf = old.cloneNode(true); leaf.classList.add("leaf");
      ppPage = to; renderPassport();
      book.appendChild(leaf);
      leaf.animate([{ transform: "perspective(1400px) rotateY(0deg)", filter: "brightness(1)" }, { transform: "perspective(1400px) rotateY(-100deg)", filter: "brightness(.75)" }], { duration: 520, easing: "cubic-bezier(.45,.05,.4,1)" }).onfinish = () => leaf.remove();
    } else {
      ppPage = to; renderPassport();
      const neu = book.firstElementChild;
      neu.animate([{ transform: "perspective(1400px) rotateY(-100deg)", filter: "brightness(.75)" }, { transform: "perspective(1400px) rotateY(0deg)", filter: "brightness(1)" }], { duration: 520, easing: "cubic-bezier(.45,.05,.4,1)" });
    }
  }
  function pageSound() {
    const a = audio(); if (!a) return;
    const t = a.currentTime, s = a.createBufferSource(); s.buffer = noiseBuf;
    const f = a.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.8; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.18);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.06); g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t, Math.random()); s.stop(t + 0.3);
  }
  $("ppBook").addEventListener("click", e => {
    if (stickerMode || stamping) return;
    const mo = e.target.closest("[data-moment]"); if (mo) { openMoment(mo.dataset.moment); return; }
    if (e.target.closest("[data-act=log]")) { openMomentEditor(); return; }
    const b = e.target.closest("[data-stamp]");
    if (b) { const [kind, fid] = b.dataset.stamp.split(":"); const f = state.flights.find(x => x.id === fid); if (f) { addStamp(kind, f); renderPassport(); } return; }
    if (e.target.closest("input, button, a")) return;
    if (ppPage === 0) { turnPage(1); return; }
    const r = $("ppBook").getBoundingClientRect(), x = e.clientX - r.left;
    if (x > r.width * 0.72) turnPage(1); else if (x < r.width * 0.28) turnPage(-1);
  });
  let ppSwipe = null;
  $("ppBook").addEventListener("touchstart", e => { if (stickerMode || e.touches.length !== 1 || e.target.closest("input")) return; ppSwipe = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  $("ppBook").addEventListener("touchend", e => {
    if (!ppSwipe || stamping) { ppSwipe = null; return; } const t = e.changedTouches[0], dx = t.clientX - ppSwipe.x, dy = t.clientY - ppSwipe.y; ppSwipe = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) { e.preventDefault(); turnPage(dx < 0 ? 1 : -1); }
  });
  function updateTabDot() { const b = document.querySelector('nav.tabs [data-tab="passport"]'); if (b) b.classList.toggle("dot", ppNewDot && curTab !== "passport"); }
  function openPassportToNewest() {
    if (freshStamps.size) { const pages = ppPages(); const k = pages.findIndex(p => p.stamps && p.stamps.some(s => freshStamps.has(s.id))); if (k > 0) ppPage = k; }
    ppNewDot = false; updateTabDot(); renderPassport();
  }


  // ================= TRAVEL JOURNAL: log a moment, then stamp it onto the page yourself =================
  // photos live in IndexedDB on the phone (too big for normal storage)
  const photoURL = new Map();
  const photoDB = new Promise(res => { try { const r = indexedDB.open("flightdeck-photos", 1); r.onupgradeneeded = () => r.result.createObjectStore("p"); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (e) { res(null); } });
  photoDB.then(db => { if (!db) return; const q = db.transaction("p").objectStore("p").openCursor(); q.onsuccess = () => { const c = q.result; if (c) { photoURL.set(c.key, c.value); c.continue(); } else if (curTab === "passport") renderPassport(); }; });
  const photoPut = (id, data) => { photoURL.set(id, data); photoDB.then(db => { if (db) db.transaction("p", "readwrite").objectStore("p").put(data, id); }); };
  const photoDel = id => { photoURL.delete(id); photoDB.then(db => { if (db) db.transaction("p", "readwrite").objectStore("p").delete(id); }); };
  async function readPhoto(file) {
    const url = URL.createObjectURL(file), img = new Image(); img.src = url;
    try { await img.decode(); } catch (e) { URL.revokeObjectURL(url); throw e; }
    const k = Math.min(1, 1100 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    return c.toDataURL("image/jpeg", 0.8);
  }
  // where you are right now, worked out from your flights (no GPS, so no battery)
  function placeNow() {
    const now = Date.now();
    for (const f of state.flights) { const t = legTimes(f); if (t && now >= t.dep && now < t.arr) return "In the air"; }
    const landed = state.flights.map(f => ({ f, t: legTimes(f) })).filter(x => x.t && x.t.arr <= now).sort((a, b) => b.t.arr - a.t.arr)[0];
    if (landed) return ap(landed.f.to).city;
    const next = flightsOrdered().up[0]; return next ? ap(next.from).city : "";
  }
  const kindIcon = (k, cls) => '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + MOMENT_KINDS[k].icon + "</svg>";
  const HEART = '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>';
  function momentStamp(m) {
    const K = MOMENT_KINDS[m.kind], d = new Date(m.at), date = pad(d.getDate()) + " " + MONS[d.getMonth()] + " " + String(d.getFullYear()).slice(2);
    const ring = K.word + " · " + (m.where || "ON THE ROAD").toUpperCase() + " · " + date + " ·", pid = "mr" + hashStr(m.id).toString(36);
    const hearts = m.hearts ? '<g transform="translate(' + (60 - m.hearts * 6.5) + ' 80)">' + [...Array(m.hearts)].map((_, i) => '<path transform="translate(' + (i * 13) + ' 0) scale(.5)" d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor"/>').join("") + "</g>" : "";
    return '<svg viewBox="0 0 120 120" class="ink mo-ink" style="color:' + K.ink + '"><circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="3.6"/><circle cx="60" cy="60" r="41" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
      '<defs><path id="' + pid + '" d="M60 60 m-48 0 a48 48 0 1 1 96 0 a48 48 0 1 1 -96 0"/></defs><text class="st-s"><textPath href="#' + pid + '" startOffset="0" textLength="296" lengthAdjust="spacingAndGlyphs">' + esc(ring) + "</textPath></text>" +
      '<g transform="translate(' + (hearts ? "41 30" : "41 38") + ') scale(1.6)" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + K.icon + "</g>" + hearts + "</svg>";
  }
  function momentHTML(m, fresh) {
    const ph = m.photo && photoURL.get(m.id);
    return '<div class="mo' + (ph ? " has-photo" : "") + (fresh ? " fresh" : "") + '" data-moment="' + esc(m.id) + '" style="left:' + m.x + "%;top:" + m.y + "%;--r:" + m.r + 'deg">' +
      (ph ? '<div class="pol"><i class="tape" aria-hidden="true"></i><img src="' + ph + '" alt=""><span class="cap">' + esc(m.what) + '</span></div><div class="mo-st">' + momentStamp(m) + "</div>"
        : '<div class="mo-st solo">' + momentStamp(m) + '</div><span class="cap solo">' + esc(m.what) + "</span>") + "</div>";
  }
  let freshMoment = null, stamping = null;
  const J_SPOTS = [[32, 30], [68, 42], [32, 66], [68, 80]];
  function journalPage(pg, idx) {
    const d = new Date(pg.at), today = pg.day === new Date().toDateString();
    const where = [...new Set(pg.moments.map(m => m.where).filter(Boolean))].slice(0, 2).join(" · ");
    let inner = '<div class="pp-head">JOURNAL · ' + (today ? "TODAY" : DAYS[d.getDay()] + " " + d.getDate() + " " + MONS[d.getMonth()]) + "<span>" + esc((where || placeNow() || "").toUpperCase()) + "</span></div>";
    pg.moments.forEach((m, k) => {
      if (stamping && stamping.id === m.id) return;
      const mm = m.x == null ? Object.assign({}, m, { x: J_SPOTS[k][0], y: J_SPOTS[k][1] }) : m;
      inner += momentHTML(mm, freshMoment === m.id);
    });
    if (!pg.moments.length && !(stamping)) inner += '<button class="j-empty" data-act="log">' + kindIcon("did") + "<b>Log a moment</b><small>Something you ate, saw or bought today. Then stamp it in.</small></button>";
    return ppSheet("journal", "j" + pg.i, inner, idx);
  }
  function journalPageIndex(id) { return ppPages().findIndex(p => p.k === "journal" && p.moments.some(m => m.id === id)); }

  // ---------- the log sheet ----------
  let draftPhoto = null;
  function openMomentEditor(id) {
    const m = id ? state.moments.find(x => x.id === id) : null;
    let kind = m ? m.kind : "ate", hearts = m ? m.hearts : 0;
    draftPhoto = m && m.photo ? photoURL.get(m.id) || null : null;
    sheet.innerHTML = '<form id="moForm" class="mo-form" autocomplete="off"><h2>' + (m ? "Edit moment" : "Log a moment") + "</h2>" +
      '<div class="mo-kinds" role="radiogroup">' + Object.keys(MOMENT_KINDS).map(k => '<button type="button" role="radio" data-kind="' + k + '" style="--ink:' + MOMENT_KINDS[k].ink + '">' + kindIcon(k) + "<span>" + MOMENT_KINDS[k].label + "</span></button>").join("") + "</div>" +
      '<div class="field"><label for="moWhat">What was it?</label><input type="text" id="moWhat" maxlength="80" value="' + esc(m ? m.what : "") + '"></div>' +
      '<div class="field"><label for="moNote">A line for the journal <span class="fine">(optional)</span></label><textarea id="moNote" rows="2" maxlength="400">' + esc(m ? m.note : "") + "</textarea></div>" +
      '<div class="mo-row"><label class="mo-photo" id="moPhotoBtn"><input type="file" accept="image/*" id="moPhoto" hidden><span id="moPhotoPrev"></span></label>' +
      '<div class="mo-side"><div class="field"><label>How good?</label><div class="mo-hearts" id="moHearts">' + [1, 2, 3].map(n => '<button type="button" data-h="' + n + '" aria-label="' + n + ' hearts"><svg viewBox="0 0 24 24">' + HEART + "</svg></button>").join("") + "</div></div>" +
      '<div class="field"><label for="moWhere">Where</label><input type="text" id="moWhere" maxlength="40" value="' + esc(m ? m.where : placeNow()) + '"></div></div></div>' +
      '<p class="fine" id="moErr" style="color:var(--red)"></p>' +
      '<div class="actions"><button type="button" class="btn ghost" id="cancelSheet">Cancel</button><button type="submit" class="btn red">' + (m ? "Save" : "Stamp it") + "</button></div></form>";
    scrim.classList.add("on");
    const setKind = k => { kind = k; sheet.querySelectorAll("[data-kind]").forEach(b => b.setAttribute("aria-checked", b.dataset.kind === k)); };
    const setHearts = n => { hearts = n; sheet.querySelectorAll("[data-h]").forEach(b => b.classList.toggle("on", +b.dataset.h <= n)); };
    const showPhoto = () => { $("moPhotoPrev").innerHTML = draftPhoto ? '<img src="' + draftPhoto + '" alt=""><b class="mo-x" id="moPhotoX">×</b>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/></svg><small>Add a photo</small>'; $("moPhotoBtn").classList.toggle("on", !!draftPhoto); };
    setKind(kind); setHearts(hearts); showPhoto();
    sheet.querySelectorAll("[data-kind]").forEach(b => b.onclick = () => { setKind(b.dataset.kind); snapSound(); });
    sheet.querySelectorAll("[data-h]").forEach(b => b.onclick = () => { setHearts(hearts === +b.dataset.h ? 0 : +b.dataset.h); if (navigator.vibrate) navigator.vibrate(8); });
    $("moPhotoBtn").addEventListener("click", e => { if (e.target.id === "moPhotoX") { e.preventDefault(); draftPhoto = null; showPhoto(); } });
    $("moPhoto").onchange = async e => { const f = e.target.files && e.target.files[0]; if (!f) return; $("moPhotoPrev").innerHTML = "<small>Developing…</small>"; try { draftPhoto = await readPhoto(f); } catch (err) { $("moErr").textContent = "Couldn't read that photo. Try another one."; } showPhoto(); };
    $("cancelSheet").onclick = closeSheet;
    $("moForm").onsubmit = e => {
      e.preventDefault();
      const what = $("moWhat").value.trim();
      if (!what) { $("moErr").textContent = "Write what it was, even just a word."; $("moWhat").focus(); return; }
      const fields = { kind, what, note: $("moNote").value.trim(), where: $("moWhere").value.trim(), hearts, photo: !!draftPhoto };
      if (m) {
        Object.assign(m, fields); if (draftPhoto) photoPut(m.id, draftPhoto); else photoDel(m.id);
        commit({ quiet: true }); closeSheet(); renderPassport(); toast("Saved"); return;
      }
      const nm = Object.assign({ id: uid(), at: Date.now(), x: null, y: null, r: +(Math.random() * 16 - 8).toFixed(1) }, fields);
      if (draftPhoto) photoPut(nm.id, draftPhoto);
      state.moments.push(nm); commit({ quiet: true }); closeSheet();
      startStamping(nm);
    };
    if (!m) setTimeout(() => $("moWhat").focus(), 350);
  }

  // ---------- the moment, up close ----------
  function openMoment(id) {
    const m = state.moments.find(x => x.id === id); if (!m) return;
    const K = MOMENT_KINDS[m.kind], ph = m.photo && photoURL.get(m.id), d = new Date(m.at);
    sheet.innerHTML = '<div class="mo-view">' + (ph ? '<div class="pol big"><i class="tape" aria-hidden="true"></i><img src="' + ph + '" alt=""></div>' : '<div class="mo-view-st">' + momentStamp(m) + "</div>") +
      '<div class="mo-kind" style="color:' + K.ink + '">' + kindIcon(m.kind) + K.word + (m.hearts ? ' <span class="mo-h">' + [...Array(m.hearts)].map(() => '<svg viewBox="0 0 24 24">' + HEART + "</svg>").join("") + "</span>" : "") + "</div>" +
      '<h2 class="hand">' + esc(m.what) + "</h2>" + (m.note ? '<p class="hand note-hand">' + esc(m.note) + "</p>" : "") +
      '<p class="fine">' + esc(m.where || "Somewhere") + " · " + DAYS[d.getDay()] + " " + d.getDate() + " " + MONS[d.getMonth()] + " " + d.getFullYear() + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + "</p>" +
      '<div class="actions"><button class="btn danger" id="moDel">Delete</button><span style="flex:1"></span><button class="btn ghost" id="moMove">Move</button><button class="btn ghost" id="moEdit">Edit</button><button class="btn primary" id="cancelSheet">Done</button></div></div>';
    scrim.classList.add("on");
    $("cancelSheet").onclick = closeSheet;
    $("moEdit").onclick = () => openMomentEditor(id);
    $("moMove").onclick = () => { closeSheet(); startStamping(m); };
    $("moDel").onclick = e => { const b = e.currentTarget; if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again to delete"; return; } state.moments = state.moments.filter(x => x.id !== id); photoDel(id); commit({ quiet: true }); closeSheet(); renderPassport(); toast("Moment removed"); };
  }

  // ---------- stamping it in: the stamp follows your finger, lift to slam it down ----------
  const stamper = document.createElement("div"); stamper.className = "stamper"; stamper.innerHTML = '<div class="st-handle"></div><div class="st-block"><div class="st-face"></div></div>';
  document.body.appendChild(stamper);
  function startStamping(m) {
    stamping = m;
    if (curTab !== "passport") showTab("passport");
    ppPage = Math.max(0, journalPageIndex(m.id)); renderPassport();
    $("ppBook").classList.add("stamping"); $("stampHint").classList.add("on");
    stamper.querySelector(".st-face").innerHTML = momentStamp(m); stamper.style.color = MOMENT_KINDS[m.kind].ink;
    const r = $("ppBook").getBoundingClientRect(); moveStamper(r.left + r.width / 2, r.top + r.height * 0.55); stamper.className = "stamper on hover";
  }
  function moveStamper(x, y) { stamper.style.left = x + "px"; stamper.style.top = y + "px"; }
  function slam(x, y) {
    const m = stamping, sheetEl2 = $("ppBook").querySelector(".pp-sheet:not(.leaf)"); if (!m || !sheetEl2) return;
    const r = sheetEl2.getBoundingClientRect();
    m.x = +Math.max(16, Math.min(84, (x - r.left) / r.width * 100)).toFixed(1);
    m.y = +Math.max(16, Math.min(88, (y - r.top) / r.height * 100)).toFixed(1);
    moveStamper(x, y); stamper.className = "stamper on slam";
    setTimeout(() => {
      stampSound(); if (navigator.vibrate) navigator.vibrate([18, 30, 8]);
      stamping = null; freshMoment = m.id; commit({ quiet: true });
      $("ppBook").classList.remove("stamping"); $("stampHint").classList.remove("on");
      renderPassport(); freshMoment = null;
      if (m.photo) setTimeout(tapeSound, 380);
    }, 150);
    setTimeout(() => { stamper.className = "stamper"; }, 650);
  }
  const bookEl = $("ppBook");
  bookEl.addEventListener("pointerdown", e => { if (!stamping) return; e.preventDefault(); stamper.className = "stamper on lift"; moveStamper(e.clientX, e.clientY); try { bookEl.setPointerCapture(e.pointerId); } catch (err) {} });
  bookEl.addEventListener("pointermove", e => { if (!stamping) return; moveStamper(e.clientX, e.clientY); });
  bookEl.addEventListener("pointerup", e => { if (!stamping) return; e.preventDefault(); slam(e.clientX, e.clientY); });
  $("stampAuto").addEventListener("click", () => { if (!stamping) return; const sh = bookEl.querySelector(".pp-sheet:not(.leaf)"), r = sh.getBoundingClientRect(), pg = ppPages()[ppPage], k = pg.moments ? pg.moments.indexOf(stamping) : 0, sp = J_SPOTS[Math.max(0, k) % 4]; slam(r.left + r.width * sp[0] / 100, r.top + r.height * sp[1] / 100); });
  $("logMomentBtn").addEventListener("click", () => openMomentEditor());

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
    const now = Date.now(), P = currentPos(now); if (!P) return;
    const f = P.leg, A = ap(f.from), B = ap(f.to), t = legTimes(f), v = buildView(f); if (!v) return;
    let left;
    if (P.src === "gps") left = (P.spd || 0) > 40 ? P.toGo * 1000 / P.spd / 60 : (t && now < t.arr ? (t.arr - Math.max(now, t.dep)) / 60000 : null);
    else left = (1 - P.prog) * (t ? (t.arr - t.dep) / 60000 : estDur(f));
    const eta = left != null ? now + left * 60000 : (t ? t.arr : null);
    const alt = P.alt != null ? P.alt : (P.src !== "preview" || P.prog > 0.08 && P.prog < 0.9 ? 11000 : null);
    const altEst = P.alt == null;
    $("ifeHead").innerHTML = "<b>FLIGHT DECK AIR</b><span>" + esc(f.no ? f.no.toUpperCase() + " · " : "") + f.from + " → " + f.to + "</span>";
    const pane = IFE_PANES[ifeIdx];
    let html = "";
    if (pane === "map") {
      const [px, py] = proj(P.lon, P.lat);
      const done = polyPts(A, B, 0, Math.max(0.001, P.prog), 40), all = polyPts(A, B, 0, 1, 40);
      const lands = v.lands.replace(/ class="land"/g, ""), labels = v.cities.replace(/<circle[^>]*\/>/g, "").replace(/ class="lbl-city"/g, "");
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
        '<div><small>TIME IN ' + esc(A.CITY) + '</small><b>' + hhmm(now, A.tz) + "</b><span>" + dayKey(now, A.tz) + "</span></div>" +
        '<div><small>TIME IN ' + esc(B.CITY) + '</small><b>' + hhmm(now, B.tz) + "</b><span>" + dayKey(now, B.tz) + "</span></div>" +
        '<div class="wide"><small>ESTIMATED ARRIVAL · ' + esc(B.CITY) + "</small><b>" + (eta ? hhmm(eta, B.tz) : "--:--") + '</b><div class="ife-prog"><i style="width:' + (P.prog * 100).toFixed(1) + '%"></i></div><span>' + Math.round(P.prog * 100) + "% of the way</span></div></div>";
    } else {
      const nb = nearbySides(P, 3), L = nb.left, R = nb.right;
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
  function nextDest() {
    const now = Date.now(), o = flightsOrdered();
    const f = o.up.find(x => { const t = legTimes(x); return !t || t.arr > now; });
    return f ? ap(f.to) : null;
  }
  function tickClocks() {
    const now = Date.now(), d = nextDest();
    $("clkA").textContent = hhmm(now, HERE_TZ);
    if (d && !d.unknown && tzOff(now, d.tz) !== tzOff(now, HERE_TZ)) { $("clkBWrap").style.display = ""; $("clkBLbl").textContent = (d.CITY || d.code).slice(0, 11); $("clkB").textContent = hhmm(now, d.tz); }
    else $("clkBWrap").style.display = "none";
  }
  function renderAll() { renderPasses(); renderFlight(); renderChecklist(); if (curTab === "passport") renderPassport(); tickClocks(); }
  // battery: the clock only changes once a minute, and nothing runs while the app is in the background
  tickClocks();
  setTimeout(() => { tickClocks(); setInterval(tickClocks, 60000); }, 60000 - Date.now() % 60000 + 50);
  setInterval(() => {
    if (document.hidden) return;
    if (curTab === "flight") { renderGPS(); renderFlight(); }
    else { const P = currentPos(Date.now()); if (P && P.src !== "preview") checkAnnouncements(P, Date.now()); }
    if (curTab === "passes") { refreshStamps(); autoStamps(); }
  }, 20000);

  renderGPS(); renderChecklist(); renderRupee(); fetchRate();
  $("annOn").checked = state.annOn;
  try { localStorage.removeItem(LS_GPS); } catch (e) {}
  showTab(location.hash.slice(1) || "passes");
  Promise.all([airportsReady, worldReady]).then(() => { VIEW = null; builtKey = ""; renderPasses(); renderFlight(); if (curTab === "passport") renderPassport(); tickClocks(); });

  // offline support (only works on your own hosted copy)
  if ("serviceWorker" in navigator && !window.claude) {
    navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then(() => { offlineReady = true; setSync(); }).catch(() => {});
  }
  setSync();
  // test hook for simulated fixes
  window.__fdFix = onFix;
})();
