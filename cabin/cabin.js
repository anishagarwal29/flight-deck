import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import * as C from "./core.js";
import { buildCabin, HOT, anim, skyUniforms, screenCanvas, screenTex, coverTex, passTex, pageTex, LOADING } from "./scene.js";

const $ = s => document.querySelector(s);
const st = () => C.store.state;
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- renderer: physically based, filmic, with ambient occlusion ----------
const canvas = $("#gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
const DPR = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;   // shadows only re-render when something moves (saves a lot of GPU)
let shadowFrames = 3;
const refreshShadows = (n = 2) => { shadowFrames = Math.max(shadowFrames, n); };
const { scene } = buildCabin(renderer);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.02, 40);
const rt = new THREE.WebGLRenderTarget(innerWidth * DPR, innerHeight * DPR, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.output = GTAOPass.OUTPUT.Default;
gtao.blendIntensity = 1.0;
gtao.updateGtaoMaterial({ radius: 0.28, distanceExponent: 1.6, thickness: 1.2, scale: 1.15, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.6, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// photographic finish: soft vignette and a touch of film grain
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; d.x *= 1.2;
      c.rgb *= mix(0.72, 1.0, smoothstep(0.82, 0.22, length(d)));
      c.rgb += (h(vUv * 1000.0 + fract(uTime)) - 0.5) * 0.022;
      gl_FragColor = c; }`
});
composer.addPass(grade);
function sizeAll() {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
sizeAll();
addEventListener("resize", () => { sizeAll(); applyOffset(); });

// ---------- camera poses ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const POSES = {
  aisle: { pos: V(0.05, 1.68, 5.6), look: V(-0.3, 1.25, -6) },
  seat: { pos: V(-1.12, 1.2, 0.2), look: V(-1.02, 0.86, -1.85) },
  screen: { pos: V(-1.08, 0.9, -0.62), look: V(-1.08, 0.86, -1.83), side: "right" },
  pocket: { pos: V(-0.68, 0.98, -1.0), look: V(-0.52, 0.48, -1.85), side: "right" },
  passport: { pos: V(-0.7, 1.0, -0.38), look: V(-0.55, 0.7, -0.63), side: "right" },
  bin: { pos: V(-0.45, 1.62, 0.55), look: V(-1.4, 1.98, -0.6), side: "right" },
  window: { pos: V(-1.5, 1.27, -0.3), look: V(-2.05, 1.22, -0.64), side: "right" },
  call: { pos: V(-0.72, 0.98, -0.66), look: V(-0.5, 0.7, -1.0), side: "right" }
};
const LABELS = {
  screen: ["Seatback screen", "Live map + flight info"], pocket: ["Seat pocket", "Your boarding passes"], passport: ["Passport", "Stamps from every trip"],
  bin: ["Overhead bin", "Your packing list"], window: ["Window", "What's outside, on each side"], call: ["Call button", "Captain announcements"]
};
const cam = { pos: POSES.aisle.pos.clone(), look: POSES.aisle.look.clone(), from: null, to: null, t0: 0, dur: 1, via: null, off: 0, offFrom: 0, offTo: 0 };
let mode = "board", focus = null;
camera.position.copy(cam.pos); camera.lookAt(cam.look);
function glide(pose, dur, via) {
  cam.from = { pos: cam.pos.clone(), look: cam.look.clone() }; cam.to = pose; cam.t0 = performance.now(); cam.dur = dur || 1.25; cam.via = via || null;
  cam.offFrom = cam.off; cam.offTo = pose.side && innerWidth > 760 ? Math.min(innerWidth * 0.42, 520) / 2 + 26 : 0;
}
function applyOffset() {
  if (Math.abs(cam.off) < 0.5) { camera.clearViewOffset(); return; }
  camera.setViewOffset(innerWidth, innerHeight, cam.off, 0, innerWidth, innerHeight);
}
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener("pointermove", e => { mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1; });
function updateCamera(now) {
  if (cam.to) {
    let t = clamp((now - cam.t0) / (cam.dur * 1000), 0, 1); const k = ease(t);
    if (cam.via) {   // a soft curve (used for the walk to your seat)
      const a = cam.from.pos, b = cam.via, c = cam.to.pos, u = 1 - k;
      cam.pos.set(u * u * a.x + 2 * u * k * b.x + k * k * c.x, u * u * a.y + 2 * u * k * b.y + k * k * c.y, u * u * a.z + 2 * u * k * b.z + k * k * c.z);
    } else cam.pos.lerpVectors(cam.from.pos, cam.to.pos, k);
    cam.look.lerpVectors(cam.from.look, cam.to.look, k);
    cam.off = cam.offFrom + (cam.offTo - cam.offFrom) * k;
    if (t >= 1) cam.to = null;
  }
  // gentle parallax so the cabin feels alive
  mouse.sx += (mouse.x - mouse.sx) * 0.05; mouse.sy += (mouse.y - mouse.sy) * 0.05;
  const amt = mode === "seat" ? 1 : mode === "focus" ? 0.18 : 0.3, breathe = Math.sin(now / 2400) * 0.004;
  camera.position.set(cam.pos.x + mouse.sx * 0.05 * amt, cam.pos.y - mouse.sy * 0.03 * amt + breathe, cam.pos.z);
  camera.lookAt(cam.look.x + mouse.sx * 0.35 * amt, cam.look.y - mouse.sy * 0.22 * amt, cam.look.z);
  applyOffset();
}

// ---------- hotspots ----------
const hotMeshes = []; scene.traverse(o => { if (o.isMesh && o.userData.hot) hotMeshes.push(o); });
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let hover = null;
function pick(e) {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(hotMeshes, false)[0];
  return hit && hit.distance < 3.2 ? hit.object.userData.hot : null;
}
canvas.addEventListener("pointermove", e => {
  if (mode !== "seat" && mode !== "focus") return;
  const h = pick(e); hover = h && h !== focus ? h : null;
  canvas.classList.toggle("hand", !!hover);
  const tip = $("#tip");
  if (hover) { $("#tipT").textContent = LABELS[hover][0]; $("#tipS").textContent = LABELS[hover][1]; tip.style.left = e.clientX + "px"; tip.style.top = e.clientY + "px"; tip.classList.add("on"); }
  else tip.classList.remove("on");
});
canvas.addEventListener("click", e => {
  if (mode !== "seat" && mode !== "focus") return;
  const h = pick(e);
  if (h && h !== focus) open(h);
  else if (!h && mode === "focus" && innerWidth > 760) close();
});
document.querySelectorAll("#dock button").forEach(b => b.addEventListener("click", () => open(b.dataset.go)));
$("#pClose").addEventListener("click", () => close());
addEventListener("keydown", e => {
  if (e.key === "Escape") { if ($("#sheetWrap").classList.contains("on")) closeSheet(); else if (mode === "focus") close(); }
  if (mode === "focus" && focus === "passport" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { if (e.key === "ArrowRight") turnPage(1); if (e.key === "ArrowLeft") turnPage(-1); }
});

// ---------- open / close a spot ----------
const PANELS = {};
function open(name) {
  if (!PANELS[name]) return;
  sfx.whoosh();
  if (name === "call") sfx.ding();
  focus = name; mode = "focus"; document.body.classList.add("focused");
  $("#tip").classList.remove("on"); canvas.classList.remove("hand");
  glide(POSES[name], 1.15);
  const p = $("#panel"); p.classList.remove("on");
  setTimeout(() => {
    if (focus !== name) return;
    p.className = name === "passport" ? "wide" : "";
    PANELS[name]();
    requestAnimationFrame(() => p.classList.add("on"));
    p.setAttribute("aria-hidden", "false");
  }, 260);
}
function close() {
  focus = null; mode = "seat"; document.body.classList.remove("focused");
  $("#panel").classList.remove("on"); $("#panel").setAttribute("aria-hidden", "true");
  glide(POSES.seat, 1.1); sfx.whoosh(0.6);
}
function panel(kicker, title, html) { $("#pKick").textContent = kicker; $("#pTitle").innerHTML = title; $("#pBody").innerHTML = html; $("#pBody").scrollTop = 0; }
const rerender = () => { if (mode === "focus" && focus && PANELS[focus] && !$("#panel").contains(document.activeElement)) PANELS[focus](); };

// ---------- sound (all synthesized, nothing to download) ----------
let AC = null;
const ac = () => { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === "suspended") AC.resume(); return AC; };
function noise(dur, f0, f1, gain, q) {
  const a = ac(); if (!a) return; const n = a.createBufferSource(), len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  n.buffer = buf; const f = a.createBiquadFilter(); f.type = "bandpass"; f.Q.value = q || 0.8; f.frequency.setValueAtTime(f0, a.currentTime); f.frequency.exponentialRampToValueAtTime(f1, a.currentTime + dur);
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(gain, a.currentTime + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  n.connect(f).connect(g).connect(a.destination); n.start();
}
function tone(freq, at, dur, gain, type) {
  const a = ac(); if (!a) return; const o = a.createOscillator(), g = a.createGain(); o.type = type || "sine"; o.frequency.value = freq;
  const t = a.currentTime + (at || 0); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}
const sfx = {
  whoosh: (v = 1) => noise(0.55, 300, 1400, 0.05 * v, 0.5),
  ding: () => { tone(1318.5, 0, 1.4, 0.07); tone(1046.5, 0.32, 1.8, 0.06); },
  chime: () => { tone(880, 0, 1.6, 0.08); tone(659.3, 0.45, 2.2, 0.07); },
  rip: () => { noise(0.35, 2400, 900, 0.12, 1.4); noise(0.2, 5000, 3000, 0.05, 2); },
  tick: () => tone(2400, 0, 0.05, 0.03, "triangle"),
  thunk: () => { tone(120, 0, 0.25, 0.25, "sine"); noise(0.12, 800, 300, 0.12, 0.6); },
  flip: () => noise(0.28, 1800, 600, 0.05, 0.9),
  pop: () => tone(660, 0, 0.12, 0.05, "triangle")
};

// ---------- toast + clocks + HUD ----------
let toastT = 0;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600); }
function focusLeg(now) { const o = C.flightsOrdered(); return C.liveLeg(now) || o.up[0] || null; }
function tickHUD() {
  const now = Date.now();
  $("#clkA").textContent = C.hhmm(now, C.HERE_TZ);
  const f = focusLeg(now), B = f && C.ap(f.to);
  if (B && B.tz !== C.HERE_TZ) { $("#clkBWrap").style.display = ""; $("#clkBLbl").textContent = B.code; $("#clkB").textContent = C.hhmm(now, B.tz); } else $("#clkBWrap").style.display = "none";
  if (!f) { $("#hRoute").textContent = "FIRST CLASS"; $("#hSub").textContent = "No flights yet · open the seat pocket"; return; }
  const t = C.legTimes(f), live = C.liveLeg(now) === f;
  $("#hRoute").textContent = f.from + "  —  " + f.to;
  if (live) $("#hSub").textContent = "In flight · " + C.durClock((t.arr - now) / 60000) + " to go";
  else if (t) { const d = t.dep - now, h = d / 3600000; $("#hSub").textContent = (f.no ? f.no.toUpperCase() + " · " : "") + C.dayKey(t.dep, C.ap(f.from).tz) + " · " + (h < 48 ? "departs in " + C.durWords(d / 60000) : C.hhmm(t.dep, C.ap(f.from).tz)); }
  else $("#hSub").textContent = "Add a departure time";
}

// ---------- the seatback screen ----------
const view = { leg: null, prog: 0.42 };
let mapCache = null;
function legProjection(f, w, h) {
  const A = C.ap(f.from), B = C.ap(f.to), mid = C.interp(A, B, 0.5), L = C.dist(A, B);
  const proj = d3.geoAzimuthalEquidistant().rotate([-mid.lon, -mid.lat]).clipAngle(Math.min(170, L / 111 + 40));
  const route = { type: "LineString", coordinates: [[A.lon, A.lat], [B.lon, B.lat]] };
  const pad = Math.max(60, Math.min(w, h) * 0.12);
  proj.fitExtent([[pad, pad + 20], [w - pad, h - pad]], { type: "MultiPoint", coordinates: [[A.lon, A.lat], [B.lon, B.lat], ...[0.25, 0.5, 0.75].map(t => { const p = C.interp(A, B, t); return [p.lon, p.lat]; })] });
  const s = proj.scale(), minSpan = 700;   // never zoom in tighter than ~700 km across
  if (L < minSpan) proj.scale(s * L / minSpan);
  proj.translate([w / 2, h / 2 + 10]);
  return { proj, route };
}
function drawMapBase(f, w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
  const { proj } = legProjection(f, w, h), path = d3.geoPath(proj, g);
  const bg = g.createRadialGradient(w * 0.5, h * 0.45, 50, w * 0.5, h * 0.5, w * 0.7); bg.addColorStop(0, "#0d2444"); bg.addColorStop(1, "#060d1c"); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(140,200,255,.07)"; g.lineWidth = 1; g.beginPath(); path(d3.geoGraticule10()); g.stroke();
  if (C.WORLD) {
    g.fillStyle = "#1d3552"; g.beginPath(); path(C.WORLD.fc); g.fill();
    g.strokeStyle = "rgba(160,210,255,.22)"; g.lineWidth = 1.2; g.beginPath(); path(C.WORLD.fc); g.stroke();
  }
  return { c, proj, path, key: f.id + "|" + w + "|" + !!C.WORLD + "|" + f.from + f.to };
}
const planeP = new Path2D(C.PLANE_PATH);
function drawScreen() {
  const W = screenCanvas.width, H = screenCanvas.height, g = screenCanvas.getContext("2d"), now = Date.now();
  const P = C.currentPos(now, view.prog, view.leg);
  if (!P) {
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#0b1a33"); bg.addColorStop(1, "#050a16"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = "#e9dcc2"; g.textAlign = "center"; g.font = "300 84px Sora"; g.fillText("Welcome aboard", W / 2, H / 2 - 20);
    g.fillStyle = "rgba(233,220,194,.6)"; g.font = "500 34px Manrope"; g.fillText("Add a flight from the seat pocket to see your route", W / 2, H / 2 + 50);
    screenTex.needsUpdate = true; return;
  }
  const f = P.leg, A = C.ap(f.from), B = C.ap(f.to), mapW = 1100;
  if (!mapCache || mapCache.key !== f.id + "|" + mapW + "|" + !!C.WORLD + "|" + f.from + f.to) mapCache = drawMapBase(f, mapW, H);
  g.drawImage(mapCache.c, 0, 0);
  const proj = mapCache.proj, path = d3.geoPath(proj, g);
  // route: dashed ahead, solid gold behind
  const ahead = [], behind = [];
  for (let i = 0; i <= 64; i++) { const t = i / 64, p = C.interp(A, B, t), xy = proj([p.lon, p.lat]); (t <= P.prog ? behind : ahead).push(xy); }
  behind.length && ahead.unshift(behind[behind.length - 1]);
  g.lineCap = "round";
  g.setLineDash([6, 12]); g.strokeStyle = "rgba(230,220,200,.55)"; g.lineWidth = 3; g.beginPath(); ahead.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); g.setLineDash([]);
  g.strokeStyle = "#f0c57e"; g.lineWidth = 5; g.shadowColor = "rgba(240,190,110,.9)"; g.shadowBlur = 18; g.beginPath(); behind.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); g.shadowBlur = 0;
  // airports
  [[A, "left"], [B, "right"]].forEach(([X]) => { const p = proj([X.lon, X.lat]); g.fillStyle = "#fff"; g.beginPath(); g.arc(p[0], p[1], 7, 0, 7); g.fill(); g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 2; g.beginPath(); g.arc(p[0], p[1], 15, 0, 7); g.stroke();
    g.font = "600 30px Sora"; g.textAlign = "center"; g.fillStyle = "#fff"; g.fillText(X.code, p[0], p[1] - 30); g.font = "500 20px Manrope"; g.fillStyle = "rgba(255,255,255,.6)"; g.fillText(X.city, p[0], p[1] + 42); });
  // plane, pointing the way it's flying on this map
  const pp = proj([P.lon, P.lat]), q = C.destPoint(P, P.hdg, 30), qq = proj([q.lon, q.lat]);
  const ang = Math.atan2(qq[0] - pp[0], -(qq[1] - pp[1]));
  g.save(); g.translate(pp[0], pp[1]); g.fillStyle = "rgba(240,197,126,.22)"; g.beginPath(); g.arc(0, 0, 34 + Math.sin(now / 400) * 3, 0, 7); g.fill();
  g.rotate(ang); g.scale(2.6, 2.6); g.fillStyle = "#fff"; g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 8; g.fill(planeP); g.restore();
  // header strip on the map
  g.fillStyle = "rgba(255,255,255,.55)"; g.font = "600 20px Sora"; g.textAlign = "left";
  g.fillText(P.src === "preview" ? "PREVIEW · " + Math.round(P.prog * 100) + "% OF THE WAY" : P.src === "gps" ? "GPS FIX" : "LIVE ESTIMATE", 48, 58);
  // right column
  const x0 = mapW, cw = W - mapW; const col = g.createLinearGradient(x0, 0, W, 0); col.addColorStop(0, "#0b1222"); col.addColorStop(1, "#0e1526"); g.fillStyle = col; g.fillRect(x0, 0, cw, H);
  g.fillStyle = "rgba(240,197,126,.85)"; g.fillRect(x0, 0, 3, H);
  let y = 86; const lx = x0 + 52;
  g.textAlign = "left"; g.fillStyle = "#fff"; g.font = "300 64px Sora"; g.fillText(A.code + " → " + B.code, lx, y + 10); y += 52;
  g.fillStyle = "rgba(255,255,255,.55)"; g.font = "500 22px Manrope"; g.fillText((f.no ? f.no.toUpperCase() + " · " : "") + A.city + " to " + B.city, lx, y); y += 70;
  const over = C.whereLabel(P.lat, P.lon);
  g.fillStyle = "rgba(255,255,255,.45)"; g.font = "600 16px Sora"; g.fillText(C.isSea(over) ? "OVER THE WATER" : "FLYING OVER", lx, y); y += 46;
  g.fillStyle = "#fff"; g.font = "300 44px Sora"; g.fillText(over.replace(/^the /, ""), lx, y); y += 70;
  const t = C.legTimes(f), D = t ? (t.arr - t.dep) / 60000 : C.estDur(f);
  const rows = [["TO GO", C.fmtInt(P.toGo) + " km"], ["TIME LEFT", C.durClock(D * (1 - P.prog))], ["SPEED", P.spd ? C.fmtInt(P.spd * 3.6) + " km/h" : "—"], ["ALTITUDE", P.alt ? C.fmtInt(P.alt) + " m" : "~11,000 m"], ["LANDS", t ? C.hhmm(t.arr, B.tz) + " " + B.code : "—"]];
  rows.forEach(([k, v]) => { g.fillStyle = "rgba(255,255,255,.42)"; g.font = "600 15px Sora"; g.fillText(k, lx, y); g.fillStyle = "#fff"; g.font = "400 34px Sora"; g.fillText(v, lx + 190, y + 4); y += 66; });
  // progress bar
  y = H - 70; g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(lx, y, cw - 104, 4); g.fillStyle = "#f0c57e"; g.fillRect(lx, y, (cw - 104) * P.prog, 4);
  g.beginPath(); g.arc(lx + (cw - 104) * P.prog, y + 2, 9, 0, 7); g.fillStyle = "#fff"; g.fill();
  screenTex.needsUpdate = true;
  return P;
}

// ---------- sky outside follows the real sun ----------
const cA = new THREE.Color(), cB = new THREE.Color();
function mix3(a, b, t, out) { return out.copy(cA.set(a)).lerp(cB.set(b), clamp(t, 0, 1)); }
function updateSky(P) {
  const now = Date.now(), lat = P ? P.lat : 1.35, lon = P ? P.lon : 103.99, hdg = P ? P.hdg : 0;
  const sun = C.sunPos(now, lat, lon), e = sun.elev, U = skyUniforms;
  const day = clamp((e + 2) / 14, 0, 1), dusk = clamp(1 - Math.abs(e - 2) / 9, 0, 1), night = clamp((-e - 3) / 6, 0, 1);
  mix3(0x060b1d, 0x2f78d0, day, U.uTop.value); mix3(0x16203a, 0xb4daf6, day, U.uHorizon.value);
  U.uHorizon.value.lerp(cA.set(0xffa25e), dusk * 0.75); U.uTop.value.lerp(cA.set(0x3b3f7a), dusk * 0.4);
  const over = P ? C.whereLabel(lat, lon) : "the sea", sea = C.isSea(over);
  mix3(sea ? 0x050a14 : 0x0a0d0a, sea ? 0x2d5f92 : 0x56694a, day, U.uGround.value);
  U.uNight.value = night;
  const rel = ((sun.az - (hdg - 90)) + 540) % 360 - 180;   // you sit on the left; your window looks 90° left of the heading
  U.uSun.value.set(0.5 + rel / 90, 0.36 + e / 50, Math.abs(rel) < 55 && e > -3 ? 1 : 0);
  U.uDrift.value = P && P.src !== "preview" ? 1 : 0.35;
  anim.winLight.color.copy(U.uHorizon.value).lerp(cA.set(0xffffff), 0.3); anim.winLight.intensity = 0.3 + day * 1.6;
  // real sun direction in cabin space (nose points to -z, right wing to +x)
  const relH = THREE.MathUtils.degToRad(sun.az - hdg), el = THREE.MathUtils.degToRad(Math.max(e, 0.5));
  const dir = new THREE.Vector3(Math.sin(relH) * Math.cos(el), Math.sin(el), -Math.cos(relH) * Math.cos(el));
  anim.sun.position.copy(anim.sun.target.position).addScaledVector(dir, 10); refreshShadows(1);
  anim.sun.intensity = e > 0 ? 3.2 * clamp(e / 8, 0, 1) : 0;
  anim.sun.color.setRGB(1, 0.86 + 0.12 * clamp(e / 25, 0, 1), 0.7 + 0.25 * clamp(e / 25, 0, 1));
  U.uSunColor.value.copy(anim.sun.color);
  return { sun, rel, day, night, dusk };
}

// ---------- announcements ----------
let annQ = [], annBusy = false;
function speak(text) { if (!st().annVoice || !("speechSynthesis" in window)) return; try { const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.pitch = 0.9; speechSynthesis.speak(u); } catch (e) {} }
function showAnn(text) { annQ.push(text); if (!annBusy) nextAnn(); }
function nextAnn() {
  const text = annQ.shift(); if (!text) { annBusy = false; return; } annBusy = true;
  sfx.chime(); $("#annT").textContent = text; $("#ann").classList.add("on"); speak(text);
  anim.callRingPulse = performance.now();
  setTimeout(() => { $("#ann").classList.remove("on"); setTimeout(nextAnn, 700); }, Math.max(6000, text.length * 70));
}
function annText(key, f, P) {
  const A = C.ap(f.from), B = C.ap(f.to), t = C.legTimes(f);
  if (key === "board") return `Good ${greet(Date.now(), A.tz)} and welcome aboard${f.no ? " flight " + f.no.toUpperCase() : ""} to ${B.city}. Flight time today is about ${C.durWords(C.estDur(f))}. Sit back and enjoy the flight.`;
  if (key === "cruise") return `We've reached our cruising altitude. The seatbelt sign is off, so feel free to move around the cabin.`;
  if (key === "half") return `We're halfway to ${B.city}. About ${C.durWords((t.arr - Date.now()) / 60000)} to go.`;
  if (key === "descent") return `We've started our descent into ${B.city}. Local time there is ${C.hhmm(Date.now(), B.tz)}. Please make sure your seatbelt is fastened.`;
  if (key === "landed") return `Welcome to ${B.city}. Local time is ${C.hhmm(Date.now(), B.tz)}. Thank you for flying with us.`;
  if (key.startsWith("over:")) return `If you look outside, we're now flying over ${key.slice(5)}.`;
  return "";
}
const greet = (ms, tz) => { const h = C.zoned(ms, tz).getUTCHours(); return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"; };
function announce(f, key, P) { const s = st(); s.ann[f.id] = s.ann[f.id] || []; if (s.ann[f.id].includes(key)) return; s.ann[f.id].push(key); C.save(); if (s.annOn) showAnn(annText(key, f, P)); }
function checkAnnouncements(P) {
  if (!P || P.src === "preview") return;
  const f = P.leg, t = C.legTimes(f); if (!t) return; const now = Date.now();
  if (now >= t.arr) { announce(f, "landed", P); return; }
  announce(f, "board", P);
  if (P.prog > 0.08) announce(f, "cruise", P);
  const c = C.overCountry(P.lat, P.lon); if (c && P.prog > 0.05 && P.prog < 0.92) announce(f, "over:" + c, P);
  if (P.prog >= 0.5) announce(f, "half", P);
  if ((t.arr - now) / 60000 < 30) announce(f, "descent", P);
}

// ---------- PANEL: seatback screen ----------
PANELS.screen = () => {
  const now = Date.now(), P = C.currentPos(now, view.prog, view.leg);
  if (!P) { panel("SEATBACK", "Nothing to show yet", `<p class="empty">Add a flight in the seat pocket and your route shows up here, with where you are and what you're flying over.</p><button class="btn gold" data-act="go-pocket">Open the seat pocket</button>`); bind(); return; }
  const f = P.leg, A = C.ap(f.from), B = C.ap(f.to), t = C.legTimes(f), live = P.src !== "preview";
  const over = C.whereLabel(P.lat, P.lon);
  const legs = C.store.state.flights.slice().sort((a, b) => (C.legTimes(a) || { dep: 9e15 }).dep - (C.legTimes(b) || { dep: 9e15 }).dep);
  const gs = C.gps.status, fixAge = C.gps.last ? Math.round((now - C.gps.last.t) / 60000) : null;
  panel("SEATBACK SCREEN", `${A.city} <span class="muted">to</span> ${B.city}`, `
    ${!live && legs.length > 1 ? `<div class="legs">${legs.map(l => `<button data-leg="${l.id}" class="${l.id === f.id ? "on" : ""}">${l.from} – ${l.to}</button>`).join("")}</div>` : ""}
    <div class="lbl">${C.isSea(over) ? "Over the water" : "Flying over"}</div>
    <div class="over">${C.esc(over.replace(/^the /, "The "))}</div>
    <div class="muted" style="font-size:12px">${live ? (P.src === "gps" ? "From your GPS fix " + (fixAge || 0) + " min ago" : "Estimated from your flight times" + (C.gps.calib && C.gps.calib.leg === f.id ? ", corrected by your last GPS fix" : "")) : "Preview: drag to see the whole flight"}</div>
    <div class="prog">
      <div class="prog-ends"><span>${A.code}</span><span>${B.code}</span></div>
      <div class="prog-bar"><i style="width:${P.prog * 100}%"></i><em style="left:${P.prog * 100}%"></em></div>
      ${!live ? `<input class="scrub" type="range" min="0" max="100" value="${Math.round(P.prog * 100)}" data-scrub>` : ""}
    </div>
    <div class="stats">
      <div><span class="lbl">Flown</span><b>${C.fmtInt(C.legLen(f) - P.toGo)}</b><small>km</small></div>
      <div><span class="lbl">To go</span><b>${C.fmtInt(P.toGo)}</b><small>km</small></div>
      <div><span class="lbl">Heading</span><b>${Math.round(P.hdg)}°</b><small>${C.compass(P.hdg)}</small></div>
      <div><span class="lbl">Speed</span><b>${P.spd ? C.fmtInt(P.spd * 3.6) : "—"}</b><small>km/h</small></div>
      <div><span class="lbl">Departs</span><b>${t ? C.hhmm(t.dep, A.tz) : "—"}</b><small>${A.code} time</small></div>
      <div><span class="lbl">Lands</span><b>${t ? C.hhmm(t.arr, B.tz) : "—"}</b><small>${B.code} time</small></div>
    </div>
    <div class="sep"></div>
    <div class="gps-row">
      <i class="gps-dot ${gs === "locked" ? "ok" : gs === "searching" ? "busy" : ""}"></i>
      <div class="t"><b>${gs === "searching" ? "Finding you…" : gs === "locked" ? "Position checked" : gs === "denied" ? "Location is blocked" : gs === "nofix" ? "No signal yet" : "Check my position"}</b>
      <span>${gs === "nofix" ? "Try again next to the window" : gs === "denied" ? "Allow location for this site in Settings" : "One quick GPS fix, then it switches off. Works in airplane mode."}</span></div>
      <button class="btn" data-act="gps" ${gs === "searching" ? "disabled" : ""}>Check</button>
    </div>`);
  bind();
};

// ---------- PANEL: seat pocket (boarding passes) ----------
function passHTML(f) {
  const A = C.ap(f.from), B = C.ap(f.to), t = C.legTimes(f);
  return `<div class="pass ${f.torn ? "torn" : ""}" data-id="${f.id}">
    <div class="main">
      <div class="top"><span>BOARDING PASS · FIRST<em class="torn-tag"> · STUB KEPT</em></span><button class="edit" data-edit="${f.id}">EDIT</button></div>
      <div class="route"><b>${A.code}</b><i></i><b>${B.code}</b></div>
      <div class="cities"><span>${C.esc(A.city)}</span><span>${C.esc(B.city)}</span></div>
      <div class="grid"><div><span>FLIGHT</span><b>${C.esc(f.no ? f.no.toUpperCase() : "—")}</b></div><div><span>DATE</span><b>${t ? C.dayKey(t.dep, A.tz).slice(4) : "—"}</b></div><div><span>DEPARTS</span><b>${t ? C.hhmm(t.dep, A.tz) : "—"}</b></div><div><span>LANDS</span><b>${t ? C.hhmm(t.arr, B.tz) : "—"}</b></div></div>
      <div class="bar"></div>
    </div>
    <div class="stub"><div class="top"><span>${A.code}–${B.code}</span></div><div class="grid"><div><span>SEAT</span><b>${C.esc(f.seat || "—")}</b></div><div><span>GATE</span><b>${C.esc(f.gate || "—")}</b></div><div><span>FLIGHT</span><b>${C.esc(f.no ? f.no.toUpperCase() : "—")}</b></div></div></div>
  </div>`;
}
PANELS.pocket = () => {
  const o = C.flightsOrdered();
  let html = "";
  if (!o.up.length && !o.past.length) html = `<p class="empty">Your seat pocket's empty. Add a flight and its boarding pass slides in here. Tear the stub off when you board, and you get a stamp in your passport.</p>`;
  else {
    let lastArr = null;
    o.up.forEach((f, i) => {
      const t = C.legTimes(f);
      if (i && lastArr && t && t.dep - lastArr < 36 * 3600000 && t.dep > lastArr) html += `<div class="lay">${C.durWords((t.dep - lastArr) / 60000).toUpperCase()} IN ${C.ap(f.from).CITY}</div>`;
      else if (t) html += `<div class="trip-h"><span class="lbl">${i ? "Next trip" : "Up next"}</span><span class="lbl">${C.dateStr(t.dep, C.ap(f.from).tz)}</span></div>`;
      html += passHTML(f); lastArr = t ? t.arr : null;
    });
    if (o.past.length) html += `<div class="sep"></div><div class="trip-h"><span class="lbl">Past flights</span></div>` + o.past.map(passHTML).join("");
    if (o.up.some(f => !f.torn)) html = `<div class="hint">Drag a stub to the side to tear it off</div>` + html;
  }
  panel("SEAT POCKET", "Boarding passes", html + `<div class="row" style="margin-top:16px"><button class="btn gold" data-act="add">Add a flight</button></div>`);
  bind(); bindTear();
};
function bindTear() {
  document.querySelectorAll("#pBody .pass:not(.torn) .stub").forEach(stub => {
    const id = stub.parentElement.dataset.id; let sx = 0, sy = 0, on = false, ticks = 0;
    stub.addEventListener("pointerdown", e => { on = true; sx = e.clientX; sy = e.clientY; ticks = 0; stub.setPointerCapture(e.pointerId); stub.classList.add("dragging"); ac(); });
    stub.addEventListener("pointermove", e => {
      if (!on) return; const dx = Math.max(0, e.clientX - sx), dy = e.clientY - sy, pull = Math.hypot(dx, dy * 0.8);
      const k = Math.min(1, pull / 90); stub.style.transform = `translate(${dx * 0.6}px, ${dy * 0.5}px) rotate(${k * 9}deg)`;
      const tk = Math.floor(pull / 14); if (tk > ticks) { ticks = tk; sfx.tick(); }
    });
    const end = e => {
      if (!on) return; on = false; stub.classList.remove("dragging");
      const pull = Math.hypot(Math.max(0, e.clientX - sx), (e.clientY - sy) * 0.8);
      if (pull > 90) {
        sfx.rip(); stub.style.transform = `translate(160px, 60px) rotate(28deg)`; stub.style.opacity = "0";
        const f = st().flights.find(x => x.id === id); if (f) { f.torn = true; f.tornAt = Date.now(); const got = C.addStamp("dep", f, f.tornAt); C.save(); setTimeout(() => { sfx.thunk(); toast(got ? "Stamped. Check your passport." : "Stub kept"); PANELS.pocket(); }, 520); }
      } else stub.style.transform = "";
    };
    stub.addEventListener("pointerup", end); stub.addEventListener("pointercancel", end);
  });
}

// flight editor sheet
function openSheet(html) { $("#sheet").innerHTML = html; $("#sheetWrap").classList.add("on"); }
function closeSheet() { $("#sheetWrap").classList.remove("on"); }
$("#sheetWrap").addEventListener("click", e => { if (e.target.id === "sheetWrap") closeSheet(); });
function editFlight(id) {
  const s = st(), f = id ? s.flights.find(x => x.id === id) : null;
  const last = s.flights.slice().sort((a, b) => (C.legTimes(b) || { dep: 0 }).dep - (C.legTimes(a) || { dep: 0 }).dep)[0];
  const v = f || { from: last ? last.to : "", to: last ? last.from : "", no: "", dep: "", arr: "", seat: "", gate: "" };
  openSheet(`<div class="p-kicker">${f ? "EDIT FLIGHT" : "NEW FLIGHT"}</div><h2 class="p-title" style="margin-bottom:0">${f ? f.from + " to " + f.to : "Where to?"}</h2>
    <div class="f-grid">
      <div class="fld"><label class="lbl">From</label><input data-k="from" value="${C.esc(v.from)}" placeholder="City or code" autocomplete="off"><div class="sug"></div></div>
      <div class="fld"><label class="lbl">To</label><input data-k="to" value="${C.esc(v.to)}" placeholder="City or code" autocomplete="off"><div class="sug"></div></div>
      <div class="fld"><label class="lbl">Departs (local)</label><input data-k="dep" type="datetime-local" value="${C.esc(v.dep)}"></div>
      <div class="fld"><label class="lbl">Lands (local)</label><input data-k="arr" type="datetime-local" value="${C.esc(v.arr)}"></div>
      <div class="fld"><label class="lbl">Flight no.</label><input data-k="no" value="${C.esc(v.no)}" placeholder="6E 1234"></div>
      <div class="fld" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label class="lbl">Seat</label><input data-k="seat" value="${C.esc(v.seat)}" placeholder="12A"></div><div><label class="lbl">Gate</label><input data-k="gate" value="${C.esc(v.gate)}" placeholder="—"></div></div>
    </div>
    <div class="row">${f ? `<button class="btn ghost danger" data-del>Delete</button>` : ""}<span style="flex:1"></span><button class="btn ghost" data-cancel>Cancel</button><button class="btn gold" data-save>${f ? "Save" : "Add flight"}</button></div>`);
  const sh = $("#sheet");
  sh.querySelectorAll('input[data-k="from"],input[data-k="to"]').forEach(inp => {
    const box = inp.nextElementSibling; let hi = 0, list = [];
    const show = () => { list = C.searchAirports(inp.value); hi = 0; box.innerHTML = list.map((r, i) => `<button type="button" data-c="${r[0]}" class="${i ? "" : "hi"}"><b>${r[0]}</b><span>${C.esc(r[2] || r[1])} · ${C.esc(r[1])}</span></button>`).join(""); box.classList.toggle("on", !!list.length && document.activeElement === inp); };
    inp.addEventListener("input", show); inp.addEventListener("focus", () => inp.value.length > 1 && show());
    inp.addEventListener("blur", () => setTimeout(() => box.classList.remove("on"), 150));
    inp.addEventListener("keydown", e => { if (!box.classList.contains("on")) return; if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); hi = (hi + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length; box.querySelectorAll("button").forEach((b, i) => b.classList.toggle("hi", i === hi)); } if (e.key === "Enter") { e.preventDefault(); inp.value = list[hi][0]; box.classList.remove("on"); } });
    box.addEventListener("mousedown", e => { const b = e.target.closest("button"); if (b) { e.preventDefault(); inp.value = b.dataset.c; box.classList.remove("on"); } });
  });
  sh.querySelector("[data-cancel]").onclick = closeSheet;
  if (f) sh.querySelector("[data-del]").onclick = () => { s.flights = s.flights.filter(x => x.id !== f.id); s.stamps = s.stamps.filter(x => !x.id.endsWith(":" + f.id)); C.save(); closeSheet(); toast("Flight removed"); PANELS.pocket(); };
  sh.querySelector("[data-save]").onclick = () => {
    const val = k => sh.querySelector(`[data-k="${k}"]`).value.trim();
    const code = x => { x = x.toUpperCase(); if (/^[A-Z]{3}$/.test(x) && (!C.AIR || C.AIR.get(x))) return x; const r = C.searchAirports(x)[0]; return r ? r[0] : ""; };
    const from = code(val("from")), to = code(val("to"));
    if (!from || !to) { toast("Pick both airports"); return; } if (from === to) { toast("From and to are the same"); return; }
    const g = f || { id: C.uid(), torn: false, tornAt: 0, tear: null, stickers: [], added: Date.now() };
    Object.assign(g, { from, to, no: val("no"), dep: val("dep"), arr: val("arr"), seat: val("seat").toUpperCase(), gate: val("gate").toUpperCase(), dur: 0 });
    const t = C.legTimes(g); if (t && g.arr && C.localToUTC(g.arr, C.ap(to).tz) > t.dep) g.dur = Math.round((t.arr - t.dep) / 60000);
    if (!f) s.flights.push(g); C.save(); closeSheet(); sfx.pop(); toast(f ? "Saved" : "Boarding pass added"); PANELS.pocket(); refreshPassCards();
  };
  setTimeout(() => sh.querySelector(f ? '[data-k="dep"]' : (v.from ? '[data-k="to"]' : '[data-k="from"]')).focus(), 80);
}

// ---------- PANEL: passport ----------
const INK = ["#2d4f9e", "#b2342e", "#1f7a58", "#6a3d9a", "#b0661c", "#1d6f8a", "#8c2f5e"];
function stampSVG(s) {
  const A = C.ap(s.code), h = C.hashStr(s.code + s.kind), ink = INK[h % INK.length], shape = h % 4, dep = s.kind === "dep";
  const d = new Date(s.at), date = C.pad(d.getDate()) + " " + C.MONS[d.getMonth()] + " " + String(d.getFullYear()).slice(2);
  const word = dep ? "DEPARTED" : "ARRIVED", city = A.CITY.length > 13 ? A.code : A.CITY, arrow = dep ? "M-8 0h14m-5-5 5 5-5 5" : "M8 0H-6m5-5-5 5 5 5", id = "c" + s.id.replace(/[^a-z0-9]/gi, "");
  const common = `fill="none" stroke="${ink}"`, txt = (x, y, sz, w, t, ls) => `<text x="${x}" y="${y}" fill="${ink}" font-family="Sora" font-weight="${w}" font-size="${sz}" letter-spacing="${ls || 0}" text-anchor="middle">${C.esc(t)}</text>`;
  let body;
  if (shape === 0) body = `<circle r="46" ${common} stroke-width="2.6"/><circle r="40" ${common} stroke-width="1"/><circle r="27" ${common} stroke-width="1"/>
    <path id="${id}" d="M-33 0a33 33 0 1 1 66 0a33 33 0 1 1-66 0" fill="none"/><text fill="${ink}" font-family="Sora" font-weight="600" font-size="7.5" letter-spacing="2.2"><textPath href="#${id}" startOffset="25%" text-anchor="middle">${C.esc(city)} · ${word}</textPath></text>
    ${txt(0, 4, 17, 600, A.code, 1)}${txt(0, 16, 6.5, 600, date, 1)}<path d="${arrow}" transform="translate(0,-12) scale(.8)" ${common} stroke-width="2"/>`;
  else if (shape === 1) body = `<rect x="-56" y="-34" width="112" height="68" rx="6" ${common} stroke-width="2.6"/><rect x="-51" y="-29" width="102" height="58" rx="3" ${common} stroke-width="1"/>
    ${txt(0, -14, 7.5, 600, word, 3)}${txt(0, 10, 24, 600, A.code, 2)}${txt(0, 23, 7, 600, city + " · " + date, 1.2)}<path d="${arrow}" transform="translate(-38,4)" ${common} stroke-width="2"/>`;
  else if (shape === 2) body = `<ellipse rx="58" ry="36" ${common} stroke-width="2.6"/><ellipse rx="52" ry="30" ${common} stroke-width="1" stroke-dasharray="3 2.4"/>
    ${txt(0, -13, 7.5, 600, city, 2.4)}${txt(0, 9, 20, 600, A.code, 1.5)}${txt(0, 21, 6.5, 600, word + " " + date, 1)}`;
  else { const pts = [...Array(8)].map((_, i) => { const a = Math.PI / 8 + i * Math.PI / 4; return (Math.cos(a) * 46).toFixed(1) + "," + (Math.sin(a) * 46).toFixed(1); }).join(" ");
    body = `<polygon points="${pts}" ${common} stroke-width="2.6"/><polygon points="${pts}" transform="scale(.86)" ${common} stroke-width="1"/>
    ${txt(0, -16, 7, 600, word, 2.2)}${txt(0, 6, 19, 600, A.code, 1)}${txt(0, 18, 6.5, 600, date, 1)}${txt(0, 28, 6, 600, A.cc, 2)}`; }
  return `<svg width="128" height="100" viewBox="-64 -50 128 100" style="opacity:.9;mix-blend-mode:multiply">${body}</svg>`;
}
function travelStats() {
  const s = st(), done = s.flights.filter(f => f.torn || (C.legTimes(f) && C.legTimes(f).dep < Date.now()));
  const km = done.reduce((a, f) => a + C.legLen(f), 0), min = done.reduce((a, f) => a + C.estDur(f), 0);
  const cc = new Set(), apts = new Set(); s.stamps.forEach(x => { const a = C.ap(x.code); apts.add(a.code); a.cc && cc.add(a.cc); });
  return { flights: done.length, km, min, countries: cc.size, airports: apts.size, ccList: [...cc] };
}
const ppState = { page: 0 };
function ppPages() {
  const s = st(), stamps = s.stamps.slice().sort((a, b) => a.at - b.at), pages = [];
  const name = s.name || "", no = "FD" + String(C.hashStr(name || "traveller") % 9000000 + 1000000);
  pages.push(`<div class="pp-page pp-cover"><div class="pp-in"><div class="small">FLIGHT DECK</div>
    <svg width="96" height="96" viewBox="-50 -50 100 100" fill="none" stroke="#e2bd78" stroke-width="2"><circle r="44"/><ellipse rx="19" ry="44"/><path d="M-44 0h88M-38-22h76M-38 22h76"/></svg>
    <h3>PASSPORT</h3><div class="small">${C.esc((name || "TRAVEL DOCUMENT").toUpperCase())}</div></div></div>`);
  const mrzName = (name || "TRAVELLER").toUpperCase().replace(/[^A-Z ]/g, "").split(" ").join("<");
  pages.push(`<div class="pp-page" style="--h:205"><svg class="pp-bg" viewBox="0 0 100 140" preserveAspectRatio="none">${[...Array(24)].map((_, i) => `<path d="M-10 ${i * 6} Q 50 ${i * 6 - 8} 110 ${i * 6}" stroke="#9fb3d6" stroke-width=".25" fill="none"/>`).join("")}</svg>
    <div class="pp-in"><div class="pp-h"><span>PASSPORT · TYPE P</span><span>No. ${no}</span></div>
    <div style="display:flex;gap:16px;margin:18px 0 16px"><div class="pp-photo"><svg width="70" height="90" viewBox="0 0 70 90"><circle cx="35" cy="34" r="16" fill="#8e98ab"/><path d="M5 92c2-22 15-32 30-32s28 10 30 32z" fill="#8e98ab"/></svg></div>
    <div class="pp-data" style="flex:1"><div style="grid-column:1/-1"><span>NAME</span><input class="pp-name" data-name value="${C.esc(name)}" placeholder="Type your name" maxlength="28"></div>
    <div><span>NATIONALITY</span><b>TRAVELLER</b></div><div><span>CLASS</span><b>FIRST</b></div><div><span>ISSUED</span><b>${stamps[0] ? C.dateStr(stamps[0].at, C.HERE_TZ) : "TODAY"}</b></div><div><span>STAMPS</span><b>${stamps.length}</b></div></div></div>
    <div class="pp-mrz">P&lt;FDK${mrzName}${"&lt;".repeat(Math.max(2, 30 - mrzName.length))}<br>${no}&lt;&lt;FIRST&lt;CLASS&lt;${stamps.length}&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</div></div></div>`);
  const T = travelStats();
  pages.push(`<div class="pp-page"><div class="pp-in"><div class="pp-h"><span>TRAVEL RECORD</span><span>ALL TIME</span></div>
    <div class="rec" style="margin-top:18px"><div><span>FLIGHTS</span><b>${T.flights}</b></div><div><span>KILOMETRES</span><b>${C.fmtInt(T.km)}</b></div><div><span>IN THE AIR</span><b>${C.durWords(T.min)}</b></div><div><span>AROUND EARTH</span><b>${(T.km / 40075).toFixed(2)}×</b></div><div><span>AIRPORTS</span><b>${T.airports}</b></div><div><span>COUNTRIES</span><b>${T.countries}</b></div></div>
    <div style="margin-top:auto;font:600 8px Sora;letter-spacing:.24em;color:#7b849c">${T.ccList.map(C.countryName).join(" · ").toUpperCase() || "YOUR COUNTRIES APPEAR HERE"}</div></div></div>`);
  const per = 5, n = Math.max(2, Math.ceil(stamps.length / per) + (stamps.length % per === 0 ? 1 : 0));
  const SPOTS = [[8, 6], [52, 14], [14, 40], [56, 46], [26, 72]];
  for (let p = 0; p < n; p++) {
    const chunk = stamps.slice(p * per, p * per + per);
    pages.push(`<div class="pp-page"><svg class="pp-bg" viewBox="0 0 100 140" preserveAspectRatio="none">${[...Array(18)].map((_, i) => `<circle cx="50" cy="70" r="${6 + i * 5}" stroke="#b9c7b1" stroke-width=".22" fill="none"/>`).join("")}</svg>
      <div class="pp-in"><div class="pp-h"><span>VISAS</span><span>${p + 4}</span></div><div class="pp-stamps">
      ${chunk.map((x, i) => { const sp = SPOTS[(i + C.hashStr(x.id)) % 5], r = C.seeded(x.id); return `<div class="stamp" style="left:${sp[0] + r() * 8 - 4}%;top:${sp[1] + r() * 6 - 3}%;transform:rotate(${x.r}deg)">${stampSVG(x)}</div>`; }).join("")}
      ${!chunk.length && p === Math.ceil(stamps.length / per) ? `<div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center;font:600 8.5px Sora;letter-spacing:.24em;color:#9aa3b8">TEAR A BOARDING PASS STUB<br><br>TO GET YOUR NEXT STAMP</div>` : ""}
      </div></div></div>`);
  }
  return pages;
}
function renderPassport() {
  const pages = ppPages(); ppState.page = clamp(ppState.page, 0, pages.length - 1);
  panel("ON YOUR TRAY", "Passport", `<div class="pp"><div class="pp-book" id="ppBook">${pages.join("")}</div></div><div class="pp-nav">${pages.map((_, i) => `<i data-pg="${i}" class="${i === ppState.page ? "on" : ""}"></i>`).join("")}</div><div class="hint" style="margin-top:12px">Swipe, click the edges, or use the arrow keys</div>`);
  layoutPages(); bind();
  const book = $("#ppBook"); let sx = null;
  book.addEventListener("pointerdown", e => { if (e.target.closest("input")) return; sx = e.clientX; });
  book.addEventListener("pointerup", e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40) turnPage(dx < 0 ? 1 : -1); else { const r = book.getBoundingClientRect(); turnPage(e.clientX > r.left + r.width / 2 ? 1 : -1); } });
  document.querySelectorAll(".pp-nav i").forEach(i => i.onclick = () => { ppState.page = +i.dataset.pg; layoutPages(); sfx.flip(); });
  const nm = book.querySelector("[data-name]"); if (nm) { nm.addEventListener("pointerdown", e => e.stopPropagation()); nm.addEventListener("change", () => { st().name = nm.value.trim(); C.save(); anim.ppCoverMat.map = coverTex(st().name); anim.ppCoverMat.needsUpdate = true; }); nm.addEventListener("keydown", e => { if (e.key === "Enter") nm.blur(); }); }
}
function layoutPages() { document.querySelectorAll("#ppBook .pp-page").forEach((p, i) => { p.classList.toggle("gone", i < ppState.page); p.classList.toggle("cur", i === ppState.page); p.style.zIndex = 100 - i; }); document.querySelectorAll(".pp-nav i").forEach((d, i) => d.classList.toggle("on", i === ppState.page)); }
function turnPage(d) { const n = document.querySelectorAll("#ppBook .pp-page").length; const p = clamp(ppState.page + d, 0, n - 1); if (p !== ppState.page) { ppState.page = p; layoutPages(); sfx.flip(); } }
PANELS.passport = () => { if (!st().stamps.length) ppState.page = 0; renderPassport(); };

// ---------- PANEL: overhead bin (packing list) ----------
PANELS.bin = () => {
  const list = st().checklist, done = list.filter(c => c.done && c.label).length, total = list.filter(c => c.label).length;
  const secs = []; list.forEach(c => { let s = secs[secs.length - 1]; if (!s || s.name !== c.sec) secs.push(s = { name: c.sec, items: [] }); s.items.push(c); });
  const tick = `<svg viewBox="0 0 12 12"><path d="M2.5 6.4l2.3 2.3 4.7-5"/></svg>`;
  panel("OVERHEAD BIN", "What's in the bag", `
    <div class="ck-prog"><div class="prog-bar"><i style="width:${total ? done / total * 100 : 0}%"></i></div><b>${done}/${total}</b></div>
    ${list.length ? "" : `<p class="empty">The bag's empty. Add the first thing to pack.</p>`}<div id="ckList">${secs.map((s, si) => `<div class="ck-div"><input data-sec="${si}" value="${C.esc(s.name || "")}" placeholder="NAME THIS"></div>` + s.items.map(c => `<div class="ck-item ${c.done ? "done" : ""}" data-id="${c.id}"><div class="ck-del">DELETE</div><div class="ck-row"><button class="ck-box" data-tick>${tick}</button><input data-label value="${C.esc(c.label)}" placeholder="Something to pack"><button class="ck-x" data-x title="Delete">×</button></div></div>`).join("")).join("")}</div>
    <div class="ck-add"><button class="btn" data-act="ck-item">Add item</button><button class="btn" data-act="ck-div">Add divider</button></div>
    <div class="hint" style="margin-top:14px">Enter for a new line · swipe left to delete · tap the circle to tick</div>`);
  bindChecklist(secs);
};
function ckSave(soft) { C.save(); if (!soft) return; const list = st().checklist, d = list.filter(c => c.done && c.label).length, t = list.filter(c => c.label).length; const b = document.querySelector(".ck-prog"); if (b) { b.querySelector("i").style.width = (t ? d / t * 100 : 0) + "%"; b.querySelector("b").textContent = d + "/" + t; } }
function bindChecklist(secs) {
  const L = st().checklist, byId = id => L.find(c => c.id === id), body = $("#pBody");
  const focusItem = (id, end) => { const inp = body.querySelector(`.ck-item[data-id="${id}"] input`); if (inp) { inp.focus(); const n = end ? inp.value.length : 0; inp.setSelectionRange(n, n); } };
  body.querySelectorAll(".ck-item").forEach(el => {
    const id = el.dataset.id, c = byId(id), inp = el.querySelector("[data-label]"), row = el.querySelector(".ck-row");
    el.querySelector("[data-tick]").onclick = () => { c.done = !c.done; el.classList.toggle("done", c.done); c.done ? sfx.tick() : 0; ckSave(true); };
    inp.addEventListener("input", () => { c.label = inp.value; ckSave(true); });
    inp.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); const n = { id: C.uid(), sec: c.sec, label: "", done: false }; L.splice(L.indexOf(c) + 1, 0, n); C.save(); PANELS.bin(); focusItem(n.id); }
      else if (e.key === "Backspace" && !inp.value) { e.preventDefault(); const i = L.indexOf(c), prev = L[i - 1]; L.splice(i, 1); C.save(); PANELS.bin(); if (prev) focusItem(prev.id, true); }
    });
    inp.addEventListener("blur", () => setTimeout(() => { if (!c.label.trim() && L.includes(c) && document.activeElement !== inp && !$("#pBody").contains(document.activeElement)) { L.splice(L.indexOf(c), 1); C.save(); PANELS.bin(); } }, 120));
    el.querySelector("[data-x]").onclick = () => removeItem(el, c);
    // swipe left to delete
    let sx = null, dx = 0;
    row.addEventListener("pointerdown", e => { if (e.target.closest("button")) return; sx = e.clientX; dx = 0; });
    row.addEventListener("pointermove", e => { if (sx == null) return; dx = Math.min(0, e.clientX - sx); if (dx < -8) { row.classList.add("swiping"); row.setPointerCapture(e.pointerId); row.style.transform = `translateX(${dx}px)`; el.querySelector(".ck-del").style.opacity = Math.min(1, -dx / 120); } });
    const up = () => { if (sx == null) return; sx = null; row.classList.remove("swiping"); if (dx < -120) removeItem(el, c); else { row.style.transform = ""; el.querySelector(".ck-del").style.opacity = 0; } };
    row.addEventListener("pointerup", up); row.addEventListener("pointercancel", up);
  });
  body.querySelectorAll("[data-sec]").forEach(inp => {
    const s = secs[+inp.dataset.sec];
    inp.addEventListener("change", () => { const v = inp.value.trim().toUpperCase(); s.items.forEach(c => c.sec = v); C.save(); });
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); inp.blur(); const first = s.items[0]; if (first && !first.label) focusItem(first.id); } });
  });
}
function removeItem(el, c) {
  const L = st().checklist; el.style.transition = "height .3s, opacity .3s"; el.style.height = el.offsetHeight + "px"; requestAnimationFrame(() => { el.style.height = "0px"; el.style.opacity = "0"; });
  sfx.pop(); setTimeout(() => { const i = L.indexOf(c); if (i >= 0) L.splice(i, 1); C.save(); PANELS.bin(); }, 300);
}
function addItem(newDivider) {
  const L = st().checklist, sec = newDivider ? "" : (L.length ? L[L.length - 1].sec : "");
  const n = { id: C.uid(), sec, label: "", done: false }; L.push(n); C.save(); PANELS.bin();
  const body = $("#pBody");
  if (newDivider) { const divs = body.querySelectorAll("[data-sec]"); divs[divs.length - 1].focus(); } else body.querySelector(`.ck-item[data-id="${n.id}"] input`).focus();
  body.scrollTop = body.scrollHeight;
}

// ---------- PANEL: window ----------
PANELS.window = () => {
  const now = Date.now(), P = C.currentPos(now, view.prog, view.leg);
  if (!P) { panel("WINDOW", "Clouds, mostly", `<p class="empty">Add a flight and the window shows the real sky for where you'll be, and the cities and landmarks out each side.</p>`); return; }
  const near = C.nearbySides(P, 5), sky = updateSky(P), over = C.whereLabel(P.lat, P.lon);
  const seat = (P.leg.seat || "").toUpperCase().replace(/[^A-Z]/g, ""), letter = seat.slice(-1);
  const mySide = !letter ? null : "ABC".includes(letter) ? "left" : "HJK".includes(letter) ? "right" : "middle";
  const e = sky.sun.elev, sunSide = e < -3 ? null : Math.abs(sky.rel) < 90 ? "left" : "right";
  const sunTxt = e < -6 ? "It's night outside. Look for stars and city lights." : e < 6 ? (sunSide === "left" ? "The sun is low on the left. Great light on that side." : "The sun is low on the right. The left side gets the softer view.") : sunSide === "left" ? "The sun is on the left. Pull the shade down a bit if it's bright." : "The sun is on the right. The left side is in the shade.";
  const list = (arr, empty) => arr.length ? `<ul>${arr.map(x => `<li><b>${C.esc(x.n)}</b><span>${C.fmtInt(x.d)} km</span></li>`).join("")}</ul>` : `<div class="muted" style="margin-top:8px;font-size:13px">${empty}</div>`;
  panel(P.src === "preview" ? "WINDOW · PREVIEW" : "WINDOW", C.esc(over.replace(/^the /, "The ")), `
    <p class="muted" style="margin-top:-6px">${sunTxt}</p>
    <div class="side"><div class="row"><span class="lbl">Left side</span>${mySide === "left" ? `<span class="lbl" style="color:var(--gold)">Your seat</span>` : ""}</div>${list(near.left, "Nothing big on this side right now.")}</div>
    <div class="side"><div class="row"><span class="lbl">Right side</span>${mySide === "right" ? `<span class="lbl" style="color:var(--gold)">Your seat</span>` : ""}</div>${list(near.right, "Nothing big on this side right now.")}</div>
    ${near.ahead ? `<div class="side"><span class="lbl">Coming up ahead</span><ul><li><b>${C.esc(near.ahead.n)}</b><span>${C.fmtInt(near.ahead.d)} km</span></li></ul></div>` : ""}
    ${mySide === "middle" ? `<div class="hint">Seat ${C.esc(seat)} is in the middle, so try to peek either way.</div>` : !seat ? `<div class="hint">Add your seat to the boarding pass to see which side is yours</div>` : ""}`);
};

// ---------- PANEL: call button ----------
PANELS.call = () => {
  const s = st(), now = Date.now(), f = focusLeg(now), heard = f ? (s.ann[f.id] || []) : [];
  const ALL = [["board", "Welcome aboard", "When the flight starts"], ["cruise", "Cruising altitude", "A few minutes in"], ["over", "Countries below", "Each time you cross into a new one"], ["half", "Halfway there", "With the time left"], ["descent", "Starting descent", "About 30 minutes out, with local time"], ["landed", "Welcome to the city", "Once you land"]];
  panel("CALL BUTTON", "The captain", `
    <div class="toggle"><div class="t"><b>Announcements</b><span>Little updates from the flight deck during the flight</span></div><button class="sw ${s.annOn ? "on" : ""}" data-sw="annOn"></button></div>
    <div class="toggle"><div class="t"><b>Read them out loud</b><span>Uses your device's voice. Earphones in.</span></div><button class="sw ${s.annVoice ? "on" : ""}" data-sw="annVoice"></button></div>
    <div class="sep" style="margin:8px 0 14px"></div>
    <span class="lbl">What you'll hear${f ? " on " + f.from + " – " + f.to : ""}</span>
    <div class="ann-list">${ALL.map(([k, t, d]) => `<div style="${heard.some(h => h === k || (k === "over" && h.startsWith("over:"))) ? "opacity:.45" : ""}"><b>${t}</b>${d}</div>`).join("")}</div>
    <div class="row" style="margin-top:18px"><button class="btn gold" data-act="test-ann">Play a test</button></div>
    <p class="muted" style="font-size:12px;margin-top:14px">They run off your flight times, so they work in airplane mode. Keep the app open on a flight to hear them.</p>`);
  bind();
};

// ---------- shared click handler for panel buttons ----------
function bind() {
  const b = $("#pBody");
  b.querySelectorAll("[data-act]").forEach(el => el.onclick = () => {
    const a = el.dataset.act;
    if (a === "add") editFlight(null);
    if (a === "go-pocket") open("pocket");
    if (a === "gps") { C.checkPosition(() => { PANELS.screen(); if (C.gps.status === "locked") { toast("Got your position"); tickScreen(true); } }); }
    if (a === "ck-item") addItem(false);
    if (a === "ck-div") addItem(true);
    if (a === "test-ann") { const f = focusLeg(Date.now()); showAnn(f ? annText("half", f) .replace(/About .* to go\./, "About 2h 10m to go.") : "This is your captain speaking. Welcome aboard."); }
  });
  b.querySelectorAll("[data-edit]").forEach(el => el.onclick = e => { e.stopPropagation(); editFlight(el.dataset.edit); });
  b.querySelectorAll("[data-leg]").forEach(el => el.onclick = () => { view.leg = el.dataset.leg; mapCache = null; tickScreen(true); PANELS.screen(); });
  b.querySelectorAll("[data-sw]").forEach(el => el.onclick = () => { const k = el.dataset.sw; st()[k] = !st()[k]; C.save(); el.classList.toggle("on", st()[k]); sfx.tick(); });
  const sc = b.querySelector("[data-scrub]");
  if (sc) sc.addEventListener("input", () => { view.prog = sc.value / 100; const P = tickScreen(true); const bar = b.querySelector(".prog-bar"); bar.querySelector("i").style.width = sc.value + "%"; bar.querySelector("em").style.left = sc.value + "%"; const o = b.querySelector(".over"); if (o && P) o.textContent = C.whereLabel(P.lat, P.lon).replace(/^the /, "The "); });
}

// ---------- 3D props that react ----------
function refreshPassportProp() { if (!anim.ppPageMat) return; anim.ppPageMat.map = pageTex(st().stamps.slice().sort((a, b) => a.at - b.at).map(s => s.code)); anim.ppPageMat.needsUpdate = true; }
function refreshPassCards() {
  refreshPassportProp();
  const o = C.flightsOrdered(), fl = o.up.filter(f => !f.torn).concat(o.up.filter(f => f.torn)).slice(0, 3);
  anim.passCards.forEach((card, i) => { card.visible = i < Math.max(1, fl.length) && (fl.length > 0 || i === 0); const ff = fl[Math.max(1, Math.min(3, fl.length)) - 1 - i] || null; card.material.map = passTex(ff, i); card.material.needsUpdate = true; });
}
let lastFrame = performance.now();
function animateProps(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
  const k = 1 - Math.pow(0.002, dt);
  anim.binDoor.rotation.z += ((focus === "bin" ? 1.25 : 0) - anim.binDoor.rotation.z) * k;
  anim.binLight.intensity += ((focus === "bin" ? 0.25 : 0) - anim.binLight.intensity) * k;
  anim.ppCover.rotation.z += ((focus === "passport" ? 2.95 : 0) - anim.ppCover.rotation.z) * k * 0.8;
  anim.passCards.forEach((c, i) => { const ty = 0.47 + i * 0.012 + (focus === "pocket" ? 0.05 + i * 0.016 : 0); c.position.y += (ty - c.position.y) * k; });
  if (Math.abs(anim.binDoor.rotation.z - (focus === "bin" ? 1.25 : 0)) > 0.002 || Math.abs(anim.ppCover.rotation.z - (focus === "passport" ? 2.95 : 0)) > 0.002) refreshShadows(1);
  const pulse = anim.callRingPulse ? Math.max(0, 1 - (now - anim.callRingPulse) / 4000) : 0;
  anim.callRing.material.color.setRGB(1, 0.8, 0.45).multiplyScalar(0.9 + (focus === "call" ? 1.6 : 0) + pulse * 2 * (0.5 + 0.5 * Math.sin(now / 120)) + (mode === "seat" ? 0.4 + 0.4 * Math.sin(now / 900) : 0));
  skyUniforms.uTime.value = now / 1000;
}

// ---------- loop ----------
let lastScreen = 0, lastP = null, idleSkip = 0;
function tickScreen(force) {
  const now = performance.now();
  if (!force && now - lastScreen < 1000) return lastP;
  lastScreen = now; lastP = drawScreen(); updateSky(lastP); return lastP;
}
function frame(now) {
  updateCamera(now); animateProps(now); tickScreen(false);
  grade.uniforms.uTime.value = now / 1000;
  if (shadowFrames > 0) { renderer.shadowMap.needsUpdate = true; shadowFrames--; }
  // when nothing is moving, draw at half rate to save battery
  const busy = cam.to || Math.abs(mouse.x - mouse.sx) > 0.002 || Math.abs(mouse.y - mouse.sy) > 0.002 || shadowFrames > 0 || mode === "board";
  idleSkip = busy ? 0 : idleSkip + 1;
  if (idleSkip % 2 === 0) composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(() => { if (document.hidden) return; tickHUD(); const P = C.currentPos(Date.now(), view.prog, view.leg); checkAnnouncements(P); if (C.autoStamps()) rerender(); }, 20000);
C.store.listeners.push(() => { refreshPassCards(); tickHUD(); mapCache = null; tickScreen(true); });

// ---------- boarding ----------
const fontsReady = Promise.all([Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 1500))]), Promise.all(LOADING)]);
function boardInfo() { const f = C.flightsOrdered().up[0]; if (!f) return; $("#bRoute").textContent = C.ap(f.from).city + "  —  " + C.ap(f.to).city; const t = C.legTimes(f); $("#bSub").textContent = (f.seat ? "Seat " + f.seat : "Suite 1A") + (t ? " · " + C.dayKey(t.dep, C.ap(f.from).tz) : ""); }
boardInfo(); $("#boardBtn").disabled = true;
fontsReady.then(() => {
  anim.ppCoverMat.map = coverTex(st().name); anim.ppCoverMat.needsUpdate = true;
  refreshPassCards(); tickHUD(); tickScreen(true);
  $("#bLoad").textContent = ""; $("#boardBtn").disabled = false;
  if (/[?&]skip/.test(location.search)) board(true);
});
Promise.all([C.airportsReady, C.worldReady]).then(() => { boardInfo(); refreshPassCards(); tickHUD(); mapCache = null; tickScreen(true); if (C.autoStamps()) rerender(); else rerender(); });
function board(instant) {
  ac(); $("#board").classList.add("gone"); document.body.classList.add("aboard");
  if (instant) { cam.pos.copy(POSES.seat.pos); cam.look.copy(POSES.seat.look); mode = "seat"; }
  else { sfx.whoosh(1.4); glide(POSES.seat, 3.6, V(-0.35, 1.5, 1.4)); setTimeout(() => { mode = "seat"; }, 3000); }
  const go = new URLSearchParams(location.search).get("open"); if (go) setTimeout(() => open(go), instant ? 50 : 3700);
}
$("#boardBtn").addEventListener("click", () => board(false));
tickHUD();
window.__cabin = { open, close, scene, camera, st, C };
