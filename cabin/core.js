// Flight Deck core: shared data with the classic app (same saved state), airports, time zones, geography.
export const LS_KEY = "flightdeck.v1";
export const PLANE_PATH = "M0,-10 L1.6,-3 L9,2 L9,4 L1.6,1.5 L1.2,7 L3.5,9 L3.5,10.5 L0,9.5 L-3.5,10.5 L-3.5,9 L-1.2,7 L-1.6,1.5 L-9,4 L-9,2 L-1.6,-3 Z";
export const uid = () => Math.random().toString(36).slice(2, 9);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const pad = n => String(n).padStart(2, "0");
export const fmtInt = n => Math.round(n).toLocaleString("en-SG");
export const HERE_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } })();

// ---------- airports ----------
const SEED_AP = {
  SIN: ["Singapore Changi Airport", "Singapore", "SG", 1.350, 103.994, "Asia/Singapore"],
  CCU: ["Netaji Subhash Chandra Bose International Airport", "Kolkata", "IN", 22.655, 88.447, "Asia/Kolkata"],
  PAT: ["Jay Prakash Narayan Airport", "Patna", "IN", 25.591, 85.088, "Asia/Kolkata"]
};
export let AIR = null;
const apCache = new Map();
let regionNames = null;
try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) {}
export const countryName = cc => { try { return (regionNames && cc && regionNames.of(cc)) || cc || ""; } catch (e) { return cc || ""; } };
export function ap(code) {
  code = String(code || "").toUpperCase();
  if (apCache.has(code)) return apCache.get(code);
  const r = AIR && AIR.get(code); let o;
  if (r) o = { code, name: r[1], city: r[2] || r[1], cc: r[3], lat: r[4], lon: r[5], tz: AIR.tz[r[6]] };
  else if (SEED_AP[code]) { const s = SEED_AP[code]; o = { code, name: s[0], city: s[1], cc: s[2], lat: s[3], lon: s[4], tz: s[5] }; }
  else return { code, name: code, city: code, CITY: code, cc: "", country: "", lat: 0, lon: 0, tz: "UTC", unknown: true };
  o.country = countryName(o.cc); o.CITY = o.city.toUpperCase();
  if (AIR) apCache.set(code, o);
  return o;
}
export let POIS = [];
const LANDMARKS = [["Mount Everest", 27.99, 86.93, 450], ["Kanchenjunga", 27.7, 88.15, 450], ["the Himalayas", 28.5, 84.0, 350], ["Mount Fuji", 35.36, 138.73, 250],
  ["Mont Blanc", 45.83, 6.86, 250], ["the Alps", 46.5, 9.5, 250], ["Mount Kilimanjaro", -3.07, 37.35, 300], ["the Grand Canyon", 36.1, -112.1, 200], ["Uluru", -25.34, 131.04, 150],
  ["the Pyramids of Giza", 29.98, 31.13, 80], ["the Great Barrier Reef", -18.3, 147.7, 220], ["Mount Kinabalu", 6.08, 116.56, 200], ["the Sundarbans", 21.95, 89.18, 150],
  ["the Ganges", 25.65, 85.4, 120], ["the Andaman Islands", 11.62, 92.73, 230], ["the Mergui Archipelago", 12.0, 98.0, 230], ["the Phi Phi Islands", 7.74, 98.77, 150],
  ["Bali", -8.4, 115.2, 200], ["the Maldives", 3.2, 73.2, 250], ["Sri Lanka", 7.8, 80.7, 300], ["the Irrawaddy Delta", 16.0, 95.0, 200], ["the Sahara", 23.0, 13.0, 600]];
export const airportsReady = fetch("../data/airports.json").then(r => r.json()).then(d => {
  AIR = new Map(); AIR.tz = d.tz; AIR.rows = d.a;
  d.a.forEach(r => AIR.set(r[0], r));
  apCache.clear();
  const seen = new Set(), out = LANDMARKS.map(x => x.slice());
  for (const r of d.a) { const city = r[2] || ""; if (!city) continue; const k = city + "|" + r[3]; if (seen.has(k)) continue; seen.add(k); out.push([city, r[4], r[5], /international/i.test(r[1]) ? 200 : 140]); }
  POIS = out;
  return true;
}).catch(() => false);
const HUB_LIST = "ATL DXB DFW LHR HND DEN IST LAX ORD DEL CDG JFK CAN AMS FRA PVG SIN ICN MAD BKK CGK BOM PEK SFO KUL LAS MIA SEA MCO EWR IAH MUC BCN FCO LGW SYD MEL HKG TPE NRT KIX MNL DOH AUH JED CAI JNB ADD NBO GRU MEX YYZ YVR BOS IAD ZRH VIE CPH ARN DUB MAN LIS ATH TLV KHI DAC CMB MLE KTM BLR MAA HYD CCU COK GOI SGN HAN DPS PNH RGN CTU SZX GMP PUS FUK CTS OKA BNE PER AKL PAT LKO PEN HKT CNX DMK STN LTN EDI".split(" ");
const HUBS = new Map(HUB_LIST.map((c, n) => [c, n]));
export function searchAirports(q) {
  q = q.trim().toLowerCase(); if (!q || !AIR) return [];
  const up = q.toUpperCase(), out = [];
  if (AIR.get(up)) out.push(AIR.get(up));
  for (const r of AIR.rows) { if (out.length >= 120) break; if (r[0] === up) continue; const city = (r[2] || "").toLowerCase(), name = r[1].toLowerCase(); if (city.startsWith(q) || name.startsWith(q)) out.push(r); }
  const score = r => (r[0] === up ? -10 : 0) + (HUBS.has(r[0]) ? -6 - (1 - HUBS.get(r[0]) / HUB_LIST.length) : 0) + (/international/i.test(r[1]) ? -2 : 0) + ((r[2] || "").toLowerCase() === q ? -3 : 0);
  return out.sort((a, b) => score(a) - score(b)).slice(0, 6);
}

// ---------- time zones ----------
const fmtCache = {};
export function tzOff(ms, tz) {
  try {
    const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }));
    const p = {}; f.formatToParts(new Date(ms)).forEach(x => { p[x.type] = +x.value; });
    return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000) / 60000);
  } catch (e) { return 0; }
}
export function localToUTC(str, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(str || ""); if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const o1 = tzOff(guess, tz); let utc = guess - o1 * 60000;
  const o2 = tzOff(utc, tz); if (o2 !== o1) utc = guess - o2 * 60000;
  return utc;
}
export const zoned = (utc, tz) => new Date(utc + tzOff(utc, tz) * 60000);
export const hhmm = (utc, tz) => { const d = zoned(utc, tz); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); };
export const MONS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
export const dayKey = (utc, tz) => { const d = zoned(utc, tz); return DAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONS[d.getUTCMonth()]; };
export const dateStr = (utc, tz) => { const d = zoned(utc, tz); return pad(d.getUTCDate()) + " " + MONS[d.getUTCMonth()] + " " + d.getUTCFullYear(); };
export const durWords = min => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return (h ? h + "h " : "") + pad(m) + "m"; };
export const durClock = min => { min = Math.max(0, Math.round(min)); return Math.floor(min / 60) + ":" + pad(min % 60); };

// ---------- saved state (shared with the classic app) ----------
const code3 = s => /^[A-Za-z]{3}$/.test(String(s || "")) ? String(s).toUpperCase() : "";
function defaultChecklist() {
  const S = { "DOCUMENTS": ["Passport (6+ months valid)", "Visa sorted if you need one", "Boarding passes", "Address of where you're staying"],
    "TECH": ["Phone", "Charger + cable", "Plug adapter", "Earphones"], "CLOTHES": ["Tops", "Pants", "Underwear + socks", "Jacket"], "TOILETRIES": ["Toothbrush + toothpaste", "Deodorant", "Any meds you take"] };
  const out = []; for (const sec in S) for (const label of S[sec]) out.push({ id: uid(), sec, label, done: false }); return out;
}
export function defaults() { return { v: 3, updatedAt: 0, name: "", flights: [], stamps: [], ppStickers: [], ann: {}, annOn: true, annVoice: false, inr: { rate: 0, at: 0, manual: false }, checklist: defaultChecklist() }; }
export function sanitize(s) {
  const d = defaults();
  if (!s || typeof s !== "object") return d;
  const out = Object.assign({}, d, s);
  out.flights = (Array.isArray(s.flights) ? s.flights : []).filter(g => g && g.id && code3(g.from) && code3(g.to)).map(g => Object.assign({ no: "", dep: "", arr: "", dur: 0, seat: "", gate: "", torn: false, tornAt: 0, tear: null, stickers: [] }, g, { from: code3(g.from), to: code3(g.to), dur: +g.dur > 0 ? Math.max(10, +g.dur) : 0 }));
  out.stamps = (Array.isArray(s.stamps) ? s.stamps : []).filter(x => x && x.id && x.code);
  out.checklist = Array.isArray(s.checklist) ? s.checklist.filter(c => c && c.id) : d.checklist;
  out.ann = s.ann && typeof s.ann === "object" ? s.ann : {};
  out.annOn = s.annOn !== false;
  return out;
}
// ---------- sample trip (for trying everything out; never touches your real data) ----------
export const DEMO = /[?&]demo\b/.test(location.search);
const DEMO_KEY = "flightdeck.demo";
function localStr(ms, tz) { const d = new Date(ms + tzOff(ms, tz) * 60000); return d.toISOString().slice(0, 16); }
function demoState() {
  const now = Date.now(), H = 3600000, D = 24 * H, s = defaults();
  const f = (id, from, to, no, depMs, durMin, seat, gate, torn, fromTz, toTz) => ({ id, from, to, no, dep: localStr(depMs, fromTz), arr: localStr(depMs + durMin * 60000, toTz), dur: durMin, seat, gate, torn, tornAt: torn ? depMs - 20 * 60000 : 0, tear: null, stickers: [], added: now });
  s.name = "Anish";
  s.flights = [
    f("d1", "SIN", "CCU", "6E 1052", now - 1.6 * H, 245, "2A", "C24", true, "Asia/Singapore", "Asia/Kolkata"),
    f("d2", "CCU", "PAT", "6E 721", now + 5 * H, 70, "3A", "14", false, "Asia/Kolkata", "Asia/Kolkata"),
    f("d3", "PAT", "CCU", "6E 6512", now + 7 * D, 75, "4F", "", false, "Asia/Kolkata", "Asia/Kolkata"),
    f("d4", "CCU", "SIN", "SQ 517", now + 7 * D + 4 * H, 250, "11K", "", false, "Asia/Kolkata", "Asia/Singapore"),
    f("p1", "SIN", "BKK", "SQ 708", now - 120 * D, 145, "34A", "B5", true, "Asia/Singapore", "Asia/Bangkok"),
    f("p2", "BKK", "HKT", "TG 201", now - 116 * D, 85, "12C", "", true, "Asia/Bangkok", "Asia/Bangkok"),
    f("p3", "HKT", "SIN", "TR 641", now - 111 * D, 125, "20F", "", true, "Asia/Bangkok", "Asia/Singapore")
  ];
  s.checklist = [["DOCUMENTS", "Passport", true], ["DOCUMENTS", "Boarding passes", true], ["DOCUMENTS", "Address in Patna", false], ["TECH", "Phone charger", true], ["TECH", "Plug adapter", false], ["TECH", "Earphones", false], ["CLOTHES", "Tops", true], ["CLOTHES", "Jacket", false], ["FOR NANI", "Gift from Singapore", false]].map(([sec, label, done]) => ({ id: uid(), sec, label, done }));
  return s;
}
export const store = { state: defaults(), listeners: [] };
if (DEMO) store.state = sanitize(demoState());
else try { const raw = localStorage.getItem(LS_KEY); if (raw) store.state = sanitize(JSON.parse(raw)); } catch (e) {}
export function save() {
  store.state.updatedAt = Date.now();
  try { localStorage.setItem(DEMO ? DEMO_KEY : LS_KEY, JSON.stringify(store.state)); } catch (e) {}
  store.listeners.forEach(f => f());
}
window.addEventListener("storage", e => { if (!DEMO && e.key === LS_KEY && e.newValue) { try { store.state = sanitize(JSON.parse(e.newValue)); store.listeners.forEach(f => f()); } catch (err) {} } });

// ---------- geography ----------
const R = 6371;
export const toRad = d => d * Math.PI / 180, toDeg = r => r * 180 / Math.PI;
export function dist(a, b) {
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function bearing(a, b) {
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function vec(p) { const l = toRad(p.lon), q = toRad(p.lat); return [Math.cos(q) * Math.cos(l), Math.cos(q) * Math.sin(l), Math.sin(q)]; }
export function interp(a, b, t) {
  const A = vec(a), B = vec(b), d = Math.acos(Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
  if (d < 1e-9) return { lat: a.lat, lon: a.lon };
  const s1 = Math.sin((1 - t) * d) / Math.sin(d), s2 = Math.sin(t * d) / Math.sin(d);
  const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
  return { lon: toDeg(Math.atan2(y, x)), lat: toDeg(Math.atan2(z, Math.hypot(x, y))) };
}
export function destPoint(p, brg, km) {
  const d = km / R, b = toRad(brg), la = toRad(p.lat), lo = toRad(p.lon);
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return { lat: toDeg(la2), lon: ((toDeg(lo2) + 540) % 360) - 180 };
}
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = deg => COMPASS[Math.round(deg / 22.5) % 16];
export const legLen = f => dist(ap(f.from), ap(f.to));
export const estDur = f => f.dur > 0 ? f.dur : Math.round(legLen(f) / 780 * 60 + 30);
export function legTimes(f) {
  const A = ap(f.from), B = ap(f.to), dep = localToUTC(f.dep, A.tz);
  if (dep == null) return null;
  let arr = f.arr ? localToUTC(f.arr, B.tz) : null;
  if (arr == null || arr <= dep) arr = dep + estDur(f) * 60000;
  return { dep, arr };
}
export function flightsOrdered() {
  const now = Date.now(), withT = store.state.flights.map(f => ({ f, t: legTimes(f) }));
  const up = withT.filter(x => !x.t || x.t.arr > now - 3 * 3600000).sort((a, b) => (a.t ? a.t.dep : 9e15) - (b.t ? b.t.dep : 9e15));
  const past = withT.filter(x => x.t && x.t.arr <= now - 3 * 3600000).sort((a, b) => b.t.dep - a.t.dep);
  return { up: up.map(x => x.f), past: past.map(x => x.f) };
}

// ---------- world map + where am I ----------
export let WORLD = null;
export const worldReady = fetch("../data/world-50m.json").then(r => r.json()).then(t => {
  const fc = topojson.feature(t, t.objects.countries);
  WORLD = { fc, feats: fc.features.map(f => ({ n: f.properties.name, f, b: d3.geoBounds(f) })) };
  return true;
}).catch(() => false);
const SEAS = [["the Singapore Strait", 1.0, 1.6, 103.4, 104.6], ["the Strait of Malacca", 1.2, 6.3, 95.0, 103.5], ["the Gulf of Thailand", 5.5, 13.6, 99.5, 105.0],
  ["the Andaman Sea", 5, 17, 92.5, 98.8], ["the Bay of Bengal", 5, 23, 79.5, 94.5], ["the Arabian Sea", 5, 25, 50, 77], ["the Persian Gulf", 23, 30.5, 47.5, 57],
  ["the Red Sea", 12, 30, 32, 44], ["the Mediterranean Sea", 30, 46, -6, 36.5], ["the Black Sea", 40.5, 47, 27, 42], ["the North Sea", 51, 61, -4, 9],
  ["the South China Sea", 0, 23, 105, 121], ["the Java Sea", -7.5, -2.5, 105, 118], ["the Philippine Sea", 5, 30, 121, 140], ["the East China Sea", 23, 33, 117, 131],
  ["the Sea of Japan", 33, 52, 127, 142], ["the Coral Sea", -30, -8, 142, 165], ["the Tasman Sea", -47, -30, 147, 175], ["the Caribbean Sea", 9, 22, -89, -60], ["the Gulf of Mexico", 18, 31, -98, -81]];
function seaName(lat, lon) {
  for (const [n, a, b, c, d] of SEAS) if (lat >= a && lat <= b && lon >= c && lon <= d) return n;
  if (lat > 66) return "the Arctic Ocean"; if (lat < -60) return "the Southern Ocean";
  if (lon > -80 && lon < 20) return "the Atlantic Ocean"; if (lon >= 20 && lon < 147 && lat < 30) return "the Indian Ocean";
  return "the Pacific Ocean";
}
function inBox(b, lon, lat) { if (lat < b[0][1] - 0.1 || lat > b[1][1] + 0.1) return false; return b[0][0] <= b[1][0] ? (lon >= b[0][0] - 0.1 && lon <= b[1][0] + 0.1) : (lon >= b[0][0] || lon <= b[1][0]); }
export function overCountry(lat, lon) { if (!WORLD) return null; for (const c of WORLD.feats) if (inBox(c.b, lon, lat) && d3.geoContains(c.f, [lon, lat])) return c.n; return null; }
export function whereLabel(lat, lon) { return overCountry(lat, lon) || (WORLD ? seaName(lat, lon) : "…"); }
export const isSea = label => /^the .*(Sea|Ocean|Strait|Gulf|Bay)$/.test(label);
export function nearbySides(P, maxPer) {
  const here = { lat: P.lat, lon: P.lon }, L = [], Rr = [], ahead = [];
  const cosl = Math.max(0.2, Math.cos(toRad(P.lat)));
  for (const [n, lat, lon, rng] of POIS) {
    if (Math.abs(lat - P.lat) > 6 || Math.abs(((lon - P.lon + 540) % 360) - 180) > 6 / cosl) continue;
    const d = dist(here, { lat, lon }); if (d < 6) continue;
    const rel = ((bearing(here, { lat, lon }) - (P.hdg || 0) + 540) % 360) - 180;
    if (d <= (rng || 180)) { if (rel <= -20 && rel >= -160) L.push({ n, d }); else if (rel >= 20 && rel <= 160) Rr.push({ n, d }); }
    if (Math.abs(rel) < 22 && d < 650) ahead.push({ n, d });
  }
  const uniq = arr => { const s = new Set(); return arr.sort((a, b) => a.d - b.d).filter(x => !s.has(x.n) && s.add(x.n)).slice(0, maxPer || 3); };
  return { left: uniq(L), right: uniq(Rr), ahead: uniq(ahead)[0] || null };
}
export function sunPos(ms, lat, lon) {
  const d = ms / 86400000 - 10957.5;
  const g = toRad((357.529 + 0.98560028 * d) % 360), q = (280.459 + 0.98564736 * d) % 360;
  const L = toRad(q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)), e = toRad(23.439 - 0.00000036 * d);
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24, ha = toRad(gmst * 15 + lon) - ra, la = toRad(lat);
  const elev = toDeg(Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)));
  const az = (toDeg(Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha))) + 360) % 360;
  return { elev, az };
}

// ---------- where is the plane right now (from flight times; one GPS fix can correct it) ----------
export const gps = { last: null, calib: null, status: "off" };
export function currentLeg(now) {
  for (const f of store.state.flights) { const t = legTimes(f); if (t && now >= t.dep && now < t.arr) return f; }
  const o = flightsOrdered(); return o.up[0] || o.past[0] || null;
}
export function liveLeg(now) { for (const f of store.state.flights) { const t = legTimes(f); if (t && now >= t.dep && now < t.arr) return f; } return null; }
export function currentPos(now, previewProg, legOverride) {
  const live = liveLeg(now);
  const leg = live || (legOverride && store.state.flights.find(f => f.id === legOverride)) || currentLeg(now); if (!leg) return null;
  const A = ap(leg.from), B = ap(leg.to), t = legTimes(leg);
  let prog, src;
  if (gps.last && now - gps.last.t < 180000) {
    const da = dist(A, gps.last), db = dist(gps.last, B);
    return { src: "gps", leg, lat: gps.last.lat, lon: gps.last.lon, hdg: gps.last.hdg != null ? gps.last.hdg : bearing(gps.last, B), spd: gps.last.spd, alt: gps.last.alt, prog: Math.min(1, da / Math.max(1, da + db)), toGo: db };
  }
  if (t && now >= t.dep && now < t.arr) { prog = (now - t.dep) / (t.arr - t.dep); src = "est"; if (gps.calib && gps.calib.leg === leg.id) prog = Math.max(0, Math.min(0.995, prog + gps.calib.delta)); }
  else { prog = previewProg != null ? previewProg : 0.42; src = "preview"; }
  const p = interp(A, B, prog), q = interp(A, B, Math.min(0.999, prog + 0.005)), p0 = interp(A, B, Math.max(0, prog - 0.005));
  const L = legLen(leg), D = t ? (t.arr - t.dep) / 60000 : estDur(leg);
  return { src, leg, lat: p.lat, lon: p.lon, hdg: prog >= 0.995 ? bearing(p0, p) : bearing(p, q), spd: L * 1000 / (D * 60), alt: src === "preview" ? null : 11000, prog, toGo: L * (1 - prog), D };
}
export function checkPosition(cb) {
  if (!("geolocation" in navigator)) { gps.status = "denied"; cb && cb(); return; }
  gps.status = "searching"; cb && cb();
  navigator.geolocation.getCurrentPosition(pos => {
    const c = pos.coords, t = pos.timestamp || Date.now();
    const fix = { t, lat: c.latitude, lon: c.longitude, alt: c.altitude, spd: c.speed != null && c.speed >= 0 ? c.speed : null, hdg: c.heading != null && !isNaN(c.heading) ? c.heading : null };
    gps.last = fix; gps.status = "locked";
    const live = store.state.flights.find(f => { const lt = legTimes(f); return lt && t >= lt.dep && t < lt.arr; });
    if (live) { const lt = legTimes(live), A = ap(live.from), B = ap(live.to), da = dist(A, fix), db = dist(fix, B); gps.calib = { leg: live.id, delta: da / Math.max(1, da + db) - (t - lt.dep) / (lt.arr - lt.dep), at: t }; }
    cb && cb();
  }, e => { gps.status = e && e.code === 1 ? "denied" : "nofix"; cb && cb(); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 75000 });
}

// ---------- passport stamps ----------
export function addStamp(kind, f, at) {
  const st = store.state, id = kind + ":" + f.id;
  if (st.stamps.some(s => s.id === id)) return false;
  st.stamps.push({ id, kind, code: kind === "dep" ? f.from : f.to, at: at || Date.now(), r: +(Math.random() * 18 - 9).toFixed(1), dx: 0 });
  return true;
}
export function autoStamps() {
  const now = Date.now(); let added = false;
  for (const f of store.state.flights) { const t = legTimes(f); if (f.torn) added = addStamp("dep", f, f.tornAt || now) || added; else if (t && now > t.dep) added = addStamp("dep", f, t.dep) || added; if (t && now > t.arr) added = addStamp("arr", f, t.arr) || added; }
  if (added) save();
  return added;
}
export function seeded(str) {
  let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
}
export const hashStr = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
