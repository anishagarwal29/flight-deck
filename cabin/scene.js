// The first-class cabin: modelled in code, finished with real PBR materials, lit by an HDR,
// soft shadows, sun that actually comes through the windows, and ambient occlusion in post.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

export const HOT = {};
export const anim = {};
export const LOADING = [];

// ---------- textures ----------
const TL = new THREE.TextureLoader();
function tex(name, rx, ry, srgb) {
  const t = TL.load("tex/" + name);
  LOADING.push(new Promise(r => { const i = setInterval(() => { if (t.image && t.image.width) { clearInterval(i); r(); } }, 50); setTimeout(() => { clearInterval(i); r(); }, 8000); }));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx || 1, ry || rx || 1); t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const rnd = seed => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

export function coverTex(name) {
  return canvasTex(512, 720, (g, w, h) => {
    const bg = g.createRadialGradient(w * 0.3, h * 0.2, 20, w * 0.5, h * 0.5, h * 0.8); bg.addColorStop(0, "#2f3f6e"); bg.addColorStop(1, "#121a33"); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const r = rnd(11); for (let i = 0; i < 14000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.03})`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
    const gold = g.createLinearGradient(0, 0, w, h); gold.addColorStop(0, "#f6e3a1"); gold.addColorStop(0.45, "#c79a3e"); gold.addColorStop(0.6, "#f1d98c"); gold.addColorStop(1, "#9c7428");
    g.fillStyle = gold; g.strokeStyle = gold; g.textAlign = "center";
    g.font = "600 28px Sora, sans-serif"; g.fillText("F L I G H T   D E C K", w / 2, 120);
    g.lineWidth = 5; g.beginPath(); g.arc(w / 2, 300, 88, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.ellipse(w / 2, 300, 38, 88, 0, 0, Math.PI * 2); g.stroke();
    [-40, 0, 40].forEach(dy => { const hw = Math.sqrt(88 * 88 - dy * dy); g.beginPath(); g.moveTo(w / 2 - hw, 300 + dy); g.lineTo(w / 2 + hw, 300 + dy); g.stroke(); });
    g.font = "600 62px Sora, sans-serif"; g.fillText("PASSPORT", w / 2, 500);
    g.font = "600 22px Sora, sans-serif"; g.fillText((name || "TRAVEL DOCUMENT").toUpperCase(), w / 2, 548);
    g.lineWidth = 3; g.strokeRect(w / 2 - 34, 610, 68, 44); g.beginPath(); g.arc(w / 2, 632, 12, 0, Math.PI * 2); g.stroke();
  });
}
const INKS = ["#2d4f9e", "#b2342e", "#1f7a58", "#6a3d9a", "#b0661c"];
/** The open passport page you see on the tray: security print + your latest stamps. null = the inside cover. */
export function pageTex(codes) {
  return canvasTex(512, 728, (g, w, h) => {
    g.fillStyle = codes ? "#e9ede4" : "#e4e7ee"; g.fillRect(0, 0, w, h);
    g.strokeStyle = codes ? "rgba(120,160,130,.28)" : "rgba(120,140,190,.25)"; g.lineWidth = 1;
    for (let i = 0; i < 46; i++) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, i * 16 + Math.sin(x / 40 + i * 0.7) * 6); g.stroke(); }
    if (!codes) { g.fillStyle = "rgba(60,70,110,.55)"; g.font = "600 22px Sora, sans-serif"; g.textAlign = "center"; g.fillText("FLIGHT DECK", w / 2, h / 2); return; }
    g.fillStyle = "rgba(90,100,120,.6)"; g.font = "600 16px Sora, sans-serif"; g.fillText("VISAS", 28, 40);
    codes.slice(-3).forEach((c, i) => {
      const x = [150, 360, 220][i], y = [190, 380, 560][i], ink = INKS[(c.charCodeAt(0) + c.charCodeAt(2)) % INKS.length];
      g.save(); g.translate(x, y); g.rotate([-0.2, 0.15, -0.08][i]); g.strokeStyle = g.fillStyle = ink; g.globalAlpha = 0.95; g.textAlign = "center";
      if (i % 2 === 0) { g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 92, 0, 7); g.stroke(); g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 78, 0, 7); g.stroke(); }
      else { g.lineWidth = 6; g.strokeRect(-110, -70, 220, 140); g.lineWidth = 2; g.strokeRect(-98, -58, 196, 116); }
      g.font = "600 52px Sora, sans-serif"; g.fillText(c, 0, 18); g.font = "600 15px Sora, sans-serif"; g.fillText(i % 2 ? "ARRIVED" : "DEPARTED", 0, -30);
      g.restore();
    });
  });
}
export function passTex(f, i) {
  return canvasTex(512, 300, (g, w, h) => {
    g.fillStyle = "#f4efe4"; g.fillRect(0, 0, w, h);
    const r = rnd(5 + i); for (let k = 0; k < 3000; k++) { g.fillStyle = `rgba(0,0,0,${r() * 0.025})`; g.fillRect(r() * w, r() * h, 1, 1); }
    g.fillStyle = ["#9c2a24", "#22477f", "#1b6a50"][i % 3]; g.fillRect(0, 0, w, 50);
    g.fillStyle = "#fff"; g.font = "600 24px Sora, sans-serif"; g.textAlign = "left"; g.fillText("BOARDING PASS", 22, 34);
    g.fillStyle = "#1e2331"; g.font = "600 70px Sora, sans-serif"; g.fillText(f ? f.from + " → " + f.to : "FLIGHT", 22, 148);
    g.font = "500 24px Manrope, sans-serif"; g.fillStyle = "#6b6f7a"; g.fillText(f && f.no ? f.no.toUpperCase() : "", 22, 192);
    g.strokeStyle = "#bbb"; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(380, 50); g.lineTo(380, h); g.stroke();
  });
}

// ---------- materials (physically based, with real surface detail) ----------
function makeMaterials() {
  const leather = (color, rep, sheen) => new THREE.MeshPhysicalMaterial({
    color, map: tex("leather_g.jpg", rep, rep, true), normalMap: tex("leather_n.jpg", rep), normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: tex("leather_r.jpg", rep), roughness: 1.0, sheen: sheen || 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xfff0dc)
  });
  const quilt = (color, rep) => new THREE.MeshPhysicalMaterial({
    color, map: tex("quilt_g.jpg", rep, rep, true), normalMap: tex("quilt_n.jpg", rep), normalScale: new THREE.Vector2(1.1, 1.1),
    roughnessMap: tex("quilt_r.jpg", rep), roughness: 1.0, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xfff2e0)
  });
  const walnut = (rx, ry) => new THREE.MeshPhysicalMaterial({
    map: tex("walnut_c.jpg", rx, ry, true), normalMap: tex("walnut_n.jpg", rx, ry), normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.07
  });
  const champagne = new THREE.MeshPhysicalMaterial({ color: 0xcdb48a, metalness: 1, roughnessMap: tex("brushed_r.jpg", 2, 2), roughness: 1, normalMap: tex("brushed_n.jpg", 2, 2), normalScale: new THREE.Vector2(0.3, 0.3), anisotropy: 0.7 });
  return {
    leather: leather(0xd8c7ad, 3), cognac: leather(0x7b4426, 3, 0.25), dark: leather(0x2a2624, 3, 0.15),
    quilt: quilt(0xdacab1, 1.5), quiltSmall: quilt(0xdacab1, 1),
    walnut: walnut(1, 1), walnutWide: walnut(2, 1), walnutTall: walnut(1, 2),
    lacquer: new THREE.MeshPhysicalMaterial({ color: 0x1c1d21, roughness: 0.38, clearcoat: 0.9, clearcoatRoughness: 0.12 }),
    satin: new THREE.MeshPhysicalMaterial({ color: 0x2b2c31, roughness: 0.55, clearcoat: 0.3 }),
    champagne, chrome: new THREE.MeshPhysicalMaterial({ color: 0xe6e8ec, metalness: 1, roughness: 0.08 }),
    blackGlass: new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 }),
    liner: new THREE.MeshStandardMaterial({ color: 0xd9d3c9, map: tex("liner_g.jpg", 4, 4, true), normalMap: tex("liner_n.jpg", 4, 4), normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.72 }),
    carpet: new THREE.MeshStandardMaterial({ map: tex("carpet_c.jpg", 3, 14, true), normalMap: tex("carpet_n.jpg", 3, 14), normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.96 }),
    fabric: new THREE.MeshPhysicalMaterial({ color: 0xbfb2a2, map: tex("fabric_g.jpg", 2, 2, true), normalMap: tex("fabric_n.jpg", 2, 2), roughness: 0.9, sheen: 0.8, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffffff) }),
    knit: new THREE.MeshPhysicalMaterial({ color: 0x8e8478, map: tex("knit_g.jpg", 3, 3, true), normalMap: tex("knit_n.jpg", 3, 3), normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95, sheen: 1, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xd8cfc4) }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 2.5, depthWrite: false }),
    warm: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.42).multiplyScalar(3.2), toneMapped: false }),
    warmSoft: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.55).multiplyScalar(1.5), toneMapped: false })
  };
}

// ---------- geometry helpers ----------
const RB = (w, h, d, r, seg = 5) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
/** Make a box look padded: faces bulge outward, most in the middle. */
function puffy(geo, amt, axes = "y") {
  geo.computeBoundingBox(); const b = geo.boundingBox, p = geo.attributes.position, c = new THREE.Vector3(), h = new THREE.Vector3();
  b.getCenter(c); b.getSize(h).multiplyScalar(0.5);
  for (let i = 0; i < p.count; i++) {
    const x = (p.getX(i) - c.x) / h.x, y = (p.getY(i) - c.y) / h.y, z = (p.getZ(i) - c.z) / h.z;
    const fx = Math.max(0, 1 - x * x), fy = Math.max(0, 1 - y * y), fz = Math.max(0, 1 - z * z);
    if (axes.includes("y")) p.setY(i, p.getY(i) + Math.sign(y) * Math.abs(y) ** 3 * amt * fx * fz);
    if (axes.includes("z")) p.setZ(i, p.getZ(i) + Math.sign(z) * Math.abs(z) ** 3 * amt * fx * fy);
    if (axes.includes("x")) p.setX(i, p.getX(i) + Math.sign(x) * Math.abs(x) ** 3 * amt * fy * fz);
  }
  geo.computeVertexNormals(); return geo;
}
function rrect(s, w, h, r) {
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2); return s;
}
/** A piping cord around a rounded rectangle (w × d) at height y. */
function piping(w, d, r, y, thick) {
  const pts = rrect(new THREE.Shape(), w, d, r).getSpacedPoints(120).map(p => new THREE.Vector3(p.x, y, p.y));
  pts.pop();
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 220, thick, 8, true);
}
function mesh(geo, mat, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; if (parent) parent.add(m); return m;
}
/** Sweep a 2D cross-section along z (the fuselage wall). u = distance along the profile, v = z. */
function sweep(pts, z0, z1, segZ) {
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = L[L.length - 1], pos = [], uv = [], idx = [], n = pts.length;
  for (let i = 0; i < n; i++) for (let j = 0; j <= segZ; j++) { const z = z0 + (z1 - z0) * j / segZ; pos.push(pts[i].x, pts[i].y, z); uv.push(L[i] / total, (z - z0) / (z1 - z0)); }
  const id = (i, j) => i * (segZ + 1) + j;
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < segZ; j++) idx.push(id(i, j), id(i + 1, j), id(i, j + 1), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1));
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  g.userData = { L, total }; return g;
}

// ---------- the sky outside ----------
export const skyUniforms = {
  uTime: { value: 0 }, uTop: { value: new THREE.Color(0x2c72c8) }, uHorizon: { value: new THREE.Color(0xa9d4f5) }, uGround: { value: new THREE.Color(0x3a6e9e) },
  uNight: { value: 0 }, uSun: { value: new THREE.Vector3(0.5, 0.7, 0) }, uSunColor: { value: new THREE.Color(1, 0.95, 0.85) }, uDrift: { value: 1 }, uCloud: { value: 0.55 }, uBright: { value: 1.5 }
};
const skyMat = () => new THREE.ShaderMaterial({
  uniforms: skyUniforms, toneMapped: false,
  vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
    varying vec2 vUv; varying vec3 vW; uniform float uTime, uNight, uDrift, uCloud, uBright; uniform vec3 uTop, uHorizon, uGround, uSun, uSunColor;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<6;i++){ v+=a*n(p); p*=2.03; a*=.5; } return v; }
    void main(){
      vec2 uv = vUv; uv.x = uv.x*0.55 + vW.z*0.16;   // each window sees its own slice of one sky
      float y = vUv.y, hz = 0.38;
      vec3 sky = mix(uHorizon, uTop, pow(smoothstep(hz, 1.0, y), 0.7));
      vec2 sp = vec2(uv.x*0.7, y*1.25);
      float sd = distance(sp, vec2(uSun.x*0.7, uSun.y*1.25));
      sky += uSunColor * (smoothstep(0.035,0.0,sd)*6.0 + smoothstep(0.4,0.0,sd)*0.5) * uSun.z;
      vec2 stp = floor(vec2(uv.x*160., y*220.)); float st = step(0.992, h(stp)) * (0.5+0.5*sin(uTime*1.7+h(stp)*30.));
      sky += vec3(st) * uNight * smoothstep(hz, hz+0.25, y);
      float below = smoothstep(hz+0.005, hz-0.01, y);
      float persp = 1.0/max(0.02, hz - y + 0.02);
      vec2 gp = vec2(uv.x*persp*0.9 + uTime*0.01*uDrift, persp*0.6);
      vec3 ground = uGround * (0.85 + 0.3*fbm(gp*3.0));
      ground = mix(ground, uHorizon, exp(-(hz - y)*9.0));
      vec3 col = mix(sky, ground, below);
      vec2 cp = vec2(uv.x*2.6 + uTime*0.03*uDrift, (hz - y)*9.0);
      float c = fbm(cp*vec2(1.0,1.6));
      float cover = smoothstep(0.52 - uCloud*0.25, 0.85, c) * smoothstep(hz+0.04, hz-0.06, y);
      vec3 cloudLit = mix(vec3(1.0,0.98,0.95), uSunColor, 0.25) * (1.0 - uNight*0.9);
      vec3 cloudShade = mix(uHorizon, uGround, 0.3) * (1.0 - uNight*0.7);
      col = mix(col, mix(cloudShade, cloudLit, smoothstep(0.55, 0.9, c)), cover*0.92);
      float w = fbm(vec2(uv.x*1.4 + uTime*0.008*uDrift, y*4.0));
      col = mix(col, cloudLit, smoothstep(0.6, 0.85, w) * smoothstep(hz+0.05, hz+0.35, y) * 0.35);
      col = mix(col, uHorizon*1.05, exp(-abs(y-hz)*28.0)*0.55);
      gl_FragColor = vec4(col * uBright, 1.0);
    }`
});

// ---------- the seatback screen ----------
export const screenCanvas = document.createElement("canvas");
screenCanvas.width = 1600; screenCanvas.height = 900;
export const screenTex = new THREE.CanvasTexture(screenCanvas);
screenTex.colorSpace = THREE.SRGBColorSpace; screenTex.anisotropy = 8;

// ---------- build ----------
export function buildCabin(renderer) {
  RectAreaLightUniformsLib.init();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080b);
  const M = makeMaterials();
  const pm = new THREE.PMREMGenerator(renderer);
  LOADING.push(new RGBELoader().loadAsync("tex/interior.hdr").then(hdr => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pm.fromEquirectangular(hdr).texture; hdr.dispose();
  }).catch(() => {}));
  scene.environmentIntensity = 0.32;
  scene.environmentRotation = new THREE.Euler(0, 1.2, 0);

  const LEN = 15, Z0 = -7.2, Z1 = Z0 + LEN, ZC = (Z0 + Z1) / 2;
  // ----- fuselage walls: a real cross-section swept along the cabin -----
  const prof = new THREE.SplineCurve([[-1.70, 0], [-1.79, 0.38], [-1.88, 0.8], [-1.93, 1.1], [-1.945, 1.32], [-1.91, 1.6], [-1.80, 1.88], [-1.58, 2.16], [-1.24, 2.35], [-0.84, 2.44], [-0.6, 2.46]].map(p => new THREE.Vector2(p[0], p[1]))).getSpacedPoints(90);
  const wallL = sweep(prof, Z0, Z1, 60), wallR = sweep(prof.slice().reverse().map(p => new THREE.Vector2(-p.x, p.y)), Z0, Z1, 60);
  { const uv = wallR.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }   // both walls measure from the floor
  let uWin = 0; { let best = 9; prof.forEach((p, i) => { const d = Math.abs(p.y - 1.25); if (d < best) { best = d; uWin = wallL.userData.L[i] / wallL.userData.total; } }); }
  const PITCH = 0.55, total = wallL.userData.total, winZ = [];
  for (let z = 4.6; z > Z0 + 0.5; z -= PITCH) winZ.push(z);
  // the wall has real holes where the windows are (so sunlight comes through them)
  const holeTex = canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.fillStyle = "#000";
    const hh = 0.47 / total * w, ww = 0.31 / PITCH * h, c = (((4.6 - Z0) / PITCH) % 1) * h;
    [uWin].forEach(u => [-h, 0, h].forEach(off => { g.beginPath(); g.roundRect(u * w - hh / 2, c + off - ww / 2, hh, ww, Math.min(hh, ww) * 0.45); g.fill(); }));
  }, false);
  holeTex.wrapT = THREE.RepeatWrapping; holeTex.flipY = false; holeTex.repeat.set(1, LEN / PITCH);
  const wallMat = M.liner.clone();
  wallMat.alphaMap = holeTex; wallMat.alphaTest = 0.5;
  wallMat.map = M.liner.map.clone(); wallMat.map.repeat.set(total / 0.6, LEN / 0.6);
  wallMat.normalMap = M.liner.normalMap.clone(); wallMat.normalMap.repeat.set(total / 0.6, LEN / 0.6);
  [wallL, wallR].forEach(g => { const m = new THREE.Mesh(g, wallMat); m.castShadow = true; m.receiveShadow = true; scene.add(m); });
  // raised centre ceiling with hidden coves either side
  const ceilProf = new THREE.SplineCurve([[-0.62, 2.6], [-0.3, 2.66], [0, 2.67], [0.3, 2.66], [0.62, 2.6]].map(p => new THREE.Vector2(p[0], p[1]))).getSpacedPoints(30).reverse();
  const glow = canvasTex(256, 8, (g, w) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "#ffb873"); gr.addColorStop(0.22, "#3a2b1e"); gr.addColorStop(0.5, "#1c160f"); gr.addColorStop(0.78, "#3a2b1e"); gr.addColorStop(1, "#ffb873"); g.fillStyle = gr; g.fillRect(0, 0, w, 8); });
  const ceil = new THREE.Mesh(sweep(ceilProf, Z0, Z1, 20), new THREE.MeshStandardMaterial({ color: 0xe4ddd2, roughness: 0.85, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.9 })); ceil.receiveShadow = true; scene.add(ceil);
  [-1, 1].forEach(s => {
    mesh(RB(0.05, 0.16, LEN, 0.015), M.liner, s * 0.6, 2.47, ZC, scene, false);
    mesh(new THREE.BoxGeometry(0.012, 0.01, LEN), M.warm, s * 0.585, 2.56, ZC, scene, false);
    const ra = new THREE.RectAreaLight(0xffbd7a, 5, 0.35, LEN); ra.position.set(s * 0.45, 2.6, ZC); ra.lookAt(s * 0.45, 0, ZC); scene.add(ra);
  });
  for (let z = 4.4; z > Z0 + 0.6; z -= 1.3) { mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 24), M.chrome, 0, 2.663, z, scene, false); mesh(new THREE.CircleGeometry(0.022, 24), M.warmSoft, 0, 2.656, z, scene, false).rotation.x = Math.PI / 2; }
  const floor = mesh(new THREE.PlaneGeometry(3.42, LEN), M.carpet, 0, 0, ZC, scene, false); floor.rotation.x = -Math.PI / 2;
  // front bulkhead in walnut with a backlit wordmark; dark rear wall
  const bh = new THREE.Group(); bh.position.z = Z0 + 0.02; scene.add(bh);
  mesh(new THREE.PlaneGeometry(3.9, 2.7), M.walnutWide, 0, 1.35, 0, bh, false);
  const logo = canvasTex(1024, 256, (g, w, h) => { g.fillStyle = "#fff"; g.font = "300 104px Sora, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("F  I  R  S  T", w / 2, h / 2); });
  const lm = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.275), new THREE.MeshBasicMaterial({ map: logo, color: new THREE.Color(1.0, 0.8, 0.55).multiplyScalar(2.4), transparent: true, toneMapped: false })); lm.position.set(0, 1.8, 0.012); bh.add(lm);
  [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(0.012, 1.6, 0.01), M.warm, s * 0.95, 1.2, 0.01, bh, false));
  const back = mesh(new THREE.PlaneGeometry(3.9, 2.7), M.lacquer, 0, 1.35, Z1 - 0.02, scene, false); back.rotation.y = Math.PI;
  scene.add(new THREE.HemisphereLight(0xffe0c0, 0x0d0f14, 0.12));

  // ----- windows: deep reveal, the sky, and pull-down shades at different heights -----
  const sky = skyMat();
  const revShape = rrect(new THREE.Shape(), 0.51, 0.35, 0.16); revShape.holes.push(rrect(new THREE.Path(), 0.43, 0.27, 0.125));
  const revealGeo = new THREE.ExtrudeGeometry(revShape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3, curveSegments: 24 });
  const revealMat = new THREE.MeshPhysicalMaterial({ color: 0xe3ddd3, roughness: 0.45, clearcoat: 0.4 });
  const skyGeo = new THREE.PlaneGeometry(0.29, 0.45);
  const flShape = rrect(new THREE.Shape(), 0.42, 0.6, 0.2); flShape.holes.push(rrect(new THREE.Path(), 0.33, 0.49, 0.155));
  const flangeGeo = new THREE.ExtrudeGeometry(flShape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 3, curveSegments: 24 });
  { // bend the surround so it hugs the curved sidewall
    const wallX = y => { for (let i = 1; i < prof.length; i++) if (prof[i].y >= y) { const a = prof[i - 1], b = prof[i], t = (y - a.y) / (b.y - a.y); return a.x + (b.x - a.x) * t; } return prof[prof.length - 1].x; };
    const p = flangeGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + (wallX(1.25 + p.getY(i)) + 1.94) - 0.004);
    flangeGeo.computeVertexNormals();
  }
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xd2ccc2, roughness: 0.7, side: THREE.DoubleSide });
  const myWindows = [], shadeAmt = [0, 0.1, 0.55, 0, 0.85, 0.2, 0, 0.35, 1, 0, 0.15, 0.6];
  winZ.forEach((z, wi) => {
    [-1, 1].forEach(side => {
      // local frame: x = along the cabin, y = up, z = into the cabin
      const g = new THREE.Group(); g.position.set(side * 1.94, 1.25, z);
      g.rotation.set(0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0); scene.add(g);
      const r = mesh(revealGeo, revealMat, 0, 0, -0.105, g, true); r.rotation.z = Math.PI / 2;
      const s = mesh(skyGeo, sky, 0, 0, -0.108, g, false);
      mesh(flangeGeo, revealMat, 0, 0, 0.0, g, false);
      const mine = side < 0 && (Math.abs(z - (-0.35)) < 0.2 || Math.abs(z - (-0.9)) < 0.2);
      const amt = mine ? 0.12 : shadeAmt[(wi * 3 + (side > 0 ? 5 : 0)) % shadeAmt.length];
      if (amt > 0.02) {
        const hgt = 0.43 * amt;
        mesh(new THREE.PlaneGeometry(0.27, hgt), shadeMat, 0, 0.215 - hgt / 2, -0.05, g, true);
        mesh(RB(0.25, 0.012, 0.012, 0.004, 2), M.champagne, 0, 0.215 - hgt, -0.048, g, false);
      }
      if (mine) { r.userData.hot = "window"; s.userData.hot = "window"; myWindows.push(g); }
    });
  });
  HOT.window = myWindows[0];
  const winLight = new THREE.RectAreaLight(0xbfe0ff, 2.0, 0.6, 1.0); winLight.position.set(-1.86, 1.25, -0.62); winLight.lookAt(0, 1.0, -0.62); scene.add(winLight); anim.winLight = winLight;
  // the sun, coming in through whichever windows face it
  const sun = new THREE.DirectionalLight(0xfff1dc, 0); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -3.2, right: 3.2, top: 3.2, bottom: -3.2, near: 0.5, far: 20 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  sun.target.position.set(-0.8, 0.6, -0.6); scene.add(sun, sun.target); anim.sun = sun;

  // ----- overhead bins -----
  const binInner = new THREE.MeshStandardMaterial({ color: 0xc9c2b7, roughness: 0.8 });
  [-1, 1].forEach(side => {
    for (let z = 4.2; z > Z0 + 0.6; z -= 1.6) {
      const isMine = side < 0 && Math.abs(z - (-0.6)) < 0.2;
      const g = new THREE.Group(); g.position.set(side * 1.46, 2.03, z); if (side > 0) g.scale.x = -1; scene.add(g);
      if (isMine) {
        mesh(RB(0.66, 0.03, 1.56, 0.012), M.liner, 0, 0.175, 0, g); mesh(RB(0.66, 0.03, 1.56, 0.012), M.liner, 0, -0.175, 0, g);
        mesh(RB(0.03, 0.38, 1.56, 0.012), binInner, -0.31, 0, 0, g); mesh(RB(0.66, 0.38, 0.03, 0.012), M.liner, 0, 0, 0.77, g); mesh(RB(0.66, 0.38, 0.03, 0.012), M.liner, 0, 0, -0.77, g);
        const bl = new THREE.PointLight(0xffd6a8, 0, 0.8, 2); bl.position.set(0.05, 0.13, 0); g.add(bl); anim.binLight = bl;
      } else mesh(RB(0.66, 0.38, 1.56, 0.04, 4), M.liner, 0, 0, 0, g);
      const hinge = new THREE.Group(); hinge.position.set(0.33, 0.19, 0); g.add(hinge);
      mesh(puffy(RB(0.035, 0.4, 1.54, 0.016, 4), 0.012, "x"), M.liner, 0.018, -0.2, 0, hinge);
      mesh(RB(0.012, 0.03, 0.36, 0.006, 3), M.champagne, 0.04, -0.35, 0, hinge);
      mesh(new THREE.BoxGeometry(0.006, 0.004, 1.5), M.warmSoft, 0.03, -0.395, 0, hinge, false);
      if (isMine) {
        anim.binDoor = hinge;
        const bag = new THREE.Group(); bag.position.set(-0.04, -0.03, 0.05); g.add(bag);
        mesh(puffy(RB(0.3, 0.26, 0.7, 0.11, 6), 0.03, "xy"), M.cognac, 0, 0, 0, bag);
        mesh(piping(0.26, 0.7, 0.1, 0, 0.007), M.dark, 0, 0, 0, bag).rotation.z = Math.PI / 2;
        [-0.12, 0.12].forEach(dz => { const hnd = mesh(new THREE.TorusGeometry(0.085, 0.011, 10, 32, Math.PI), M.dark, 0, 0.13, dz, bag); hnd.rotation.y = Math.PI / 2; });
        mesh(RB(0.02, 0.012, 0.6, 0.005, 2), M.champagne, 0, 0.135, 0, bag);
        g.traverse(o => { if (o.isMesh) o.userData.hot = "bin"; }); anim.bag = bag; HOT.bin = g;
      }
    }
  });

  // ----- the suites -----
  function baseSuite() {
    const S = new THREE.Group();
    // aisle privacy wall
    mesh(RB(0.07, 1.16, 2.5, 0.03), M.lacquer, -0.15, 0.58, -0.65, S);
    mesh(RB(0.12, 0.035, 2.52, 0.014), M.walnut, -0.15, 1.175, -0.65, S);
    mesh(new THREE.BoxGeometry(0.006, 0.006, 2.4), M.champagne, -0.113, 1.12, -0.65, S);
    mesh(new THREE.BoxGeometry(0.004, 0.012, 2.4), M.warm, -0.098, 1.15, -0.65, S, false);
    mesh(puffy(RB(0.03, 0.36, 1.45, 0.012, 4), 0.006, "x"), M.quiltSmall, -0.2, 0.93, -0.45, S);
    // front (monitor) wall
    mesh(RB(1.52, 1.17, 0.08, 0.03), M.lacquer, -0.88, 0.585, -1.9, S);
    mesh(RB(1.44, 1.02, 0.02, 0.01), M.walnutWide, -0.88, 0.6, -1.857, S);
    mesh(RB(1.54, 0.035, 0.13, 0.014), M.walnut, -0.88, 1.175, -1.9, S);
    mesh(new THREE.BoxGeometry(1.4, 0.004, 0.004), M.warm, -0.88, 1.15, -1.835, S, false);
    // ottoman
    mesh(puffy(RB(0.52, 0.12, 0.42, 0.05, 6), 0.03, "y"), M.quilt, -0.95, 0.33, -1.64, S);
    mesh(piping(0.5, 0.4, 0.05, 0.39, 0.006), M.cognac, -0.95, 0, -1.64, S);
    mesh(RB(0.5, 0.26, 0.4, 0.03), M.satin, -0.95, 0.14, -1.64, S);
    mesh(RB(0.505, 0.012, 0.405, 0.005, 2), M.champagne, -0.95, 0.27, -1.64, S);
    // window-side ledge
    mesh(RB(0.32, 0.04, 2.2, 0.015), M.walnutTall, -1.52, 0.745, -0.7, S);
    mesh(RB(0.3, 0.72, 2.18, 0.03), M.lacquer, -1.53, 0.36, -0.7, S);
    mesh(new THREE.BoxGeometry(0.004, 0.004, 2.1), M.warm, -1.365, 0.72, -0.7, S, false);
    // seat
    const seat = new THREE.Group(); seat.position.set(-0.95, 0, 0.02); S.add(seat);
    mesh(RB(0.46, 0.3, 0.5, 0.05), M.satin, 0, 0.15, 0.02, seat);
    mesh(RB(0.48, 0.015, 0.52, 0.006, 2), M.champagne, 0, 0.305, 0.02, seat);
    mesh(puffy(RB(0.62, 0.15, 0.64, 0.06, 7), 0.035, "y"), M.quilt, 0, 0.4, 0, seat);
    mesh(piping(0.6, 0.62, 0.06, 0.465, 0.007), M.cognac, 0, 0, 0, seat);
    // back shell that wraps the backrest like a pod
    const shellG = new THREE.CylinderGeometry(0.42, 0.4, 0.95, 48, 1, true, -Math.PI * 0.52, Math.PI * 1.04); shellG.scale(1, 1, 0.55);
    const shellMat = M.lacquer.clone(); shellMat.side = THREE.DoubleSide;
    mesh(shellG, shellMat, 0, 0.51, 0.36, seat);
    const rim = mesh(new THREE.TorusGeometry(0.41, 0.008, 8, 64, Math.PI * 1.04), M.champagne, 0, 0.985, 0.36, seat); rim.rotation.set(Math.PI / 2, 0, -Math.PI * 0.02); rim.scale.set(1, 0.55, 1);
    const backrest = new THREE.Group(); backrest.position.set(0, 0.47, 0.32); backrest.rotation.x = 0.2; seat.add(backrest);
    mesh(puffy(RB(0.58, 0.74, 0.14, 0.06, 7), 0.04, "z"), M.quilt, 0, 0.38, 0, backrest);
    mesh(puffy(RB(0.5, 0.2, 0.1, 0.05, 6), 0.03, "z"), M.leather, 0, 0.88, -0.03, backrest);
    [-1, 1].forEach(s => { const w = mesh(puffy(RB(0.1, 0.24, 0.1, 0.045, 5), 0.02, "x"), M.leather, s * 0.27, 0.86, -0.06, backrest); w.rotation.y = -s * 0.35; });
    // aisle armrest
    mesh(puffy(RB(0.11, 0.07, 0.6, 0.03, 5), 0.015, "y"), M.cognac, 0.38, 0.62, 0.05, seat);
    mesh(RB(0.06, 0.15, 0.5, 0.02), M.satin, 0.38, 0.52, 0.05, seat);
    // console (the tray-table side)
    mesh(RB(0.32, 0.67, 1.45, 0.03), M.lacquer, -0.36, 0.335, -0.45, S);
    mesh(RB(0.36, 0.035, 1.5, 0.014), M.walnutTall, -0.36, 0.685, -0.45, S);
    mesh(RB(0.24, 0.004, 0.52, 0.002, 2), M.dark, -0.36, 0.704, -0.62, S);
    mesh(new THREE.BoxGeometry(0.004, 0.004, 1.4), M.warm, -0.175, 0.665, -0.45, S, false);
    return S;
  }
  const base = baseSuite();
  const mine = base.clone(); mine.position.x = -0.2; scene.add(mine);
  [[-0.2, -2.6, 1], [-0.2, -5.2, 1], [-0.2, 2.6, 1], [0.2, 0, -1], [0.2, -2.6, -1], [0.2, -5.2, -1], [0.2, 2.6, -1]].forEach(([x, z, sx]) => { const s = base.clone(); s.position.set(x, 0, z); s.scale.x = sx; scene.add(s); });

  // ----- things only in your suite -----
  const S = mine;
  const bez = mesh(RB(1.0, 0.6, 0.025, 0.012, 3), M.blackGlass, -0.88, 0.86, -1.838, S);
  mesh(RB(1.012, 0.612, 0.018, 0.012, 3), M.champagne, -0.88, 0.86, -1.846, S);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.534), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false, color: new THREE.Color(0.92, 0.92, 0.92) }));
  scr.position.set(-0.88, 0.86, -1.8245); S.add(scr);
  const cover = new THREE.Mesh(new THREE.PlaneGeometry(0.97, 0.55), new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.03, transparent: true, opacity: 0.16, envMapIntensity: 2 }));
  cover.position.set(-0.88, 0.86, -1.823); S.add(cover);
  HOT.screen = scr; [scr, bez, cover].forEach(m => m.userData.hot = "screen");
  // seat pocket with boarding passes peeking out
  const pocket = mesh(puffy(RB(0.24, 0.22, 0.03, 0.012, 4), 0.006, "z"), M.cognac, -0.3, 0.4, -1.835, S);
  mesh(new THREE.BoxGeometry(0.2, 0.004, 0.004), M.champagne, -0.3, 0.505, -1.818, S, false);
  pocket.userData.hot = "pocket"; HOT.pocket = pocket;
  anim.passCards = [];
  for (let i = 0; i < 3; i++) {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.1), new THREE.MeshStandardMaterial({ map: passTex(null, i), roughness: 0.65, side: THREE.DoubleSide }));
    card.position.set(-0.3 + (i - 1) * 0.03, 0.47 + i * 0.012, -1.847 + i * 0.002); card.rotation.z = (i - 1) * 0.06; card.userData.hot = "pocket"; card.castShadow = true;
    S.add(card); anim.passCards.push(card);
  }
  // passport on the leather pad
  const pp = new THREE.Group(); pp.position.set(-0.36, 0.707, -0.6); pp.rotation.y = 0.22; S.add(pp);
  const cm = { roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0x8899cc), normalMap: M.leather.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) };
  const paper = new THREE.MeshStandardMaterial({ color: 0xaeb1a8, roughness: 0.9 });
  const pageTop = new THREE.MeshStandardMaterial({ map: pageTex([]), color: 0xb9bcb3, roughness: 0.85 });
  const pages = mesh(new THREE.BoxGeometry(0.086, 0.011, 0.122), [paper, paper, pageTop, paper, paper, paper], 0.001, 0.0065, 0, pp);
  anim.ppPageMat = pageTop;
  const navy = new THREE.MeshPhysicalMaterial({ color: 0x1b2647, ...cm });
  const backCov = mesh(RB(0.092, 0.003, 0.128, 0.0015, 2), navy, 0, 0.0015, 0, pp);
  const hinge = new THREE.Group(); hinge.position.set(-0.046, 0.013, 0); pp.add(hinge);
  const covMat = [navy, navy, new THREE.MeshPhysicalMaterial({ map: coverTex(""), ...cm }), new THREE.MeshStandardMaterial({ map: pageTex(null), color: 0xb9bcb3, roughness: 0.85 }), navy, navy];
  const cov = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.003, 0.128), covMat); cov.position.set(0.046, 0, 0); cov.castShadow = true; hinge.add(cov);
  [pages, backCov, cov].forEach(m => m.userData.hot = "passport");
  anim.ppCover = hinge; anim.ppCoverMat = covMat[2]; HOT.passport = pp;
  // call button + a small touch panel
  const cb = new THREE.Group(); cb.position.set(-0.3, 0.703, -1.0); S.add(cb);
  mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.008, 48), M.champagne, 0, 0, 0, cb);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0028, 12, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.45).multiplyScalar(1.6), toneMapped: false }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.0045; cb.add(ring);
  mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.006, 48), M.blackGlass, 0, 0.005, 0, cb);
  cb.traverse(o => { if (o.isMesh) o.userData.hot = "call"; }); anim.callRing = ring; HOT.call = cb;
  const panelTex = canvasTex(256, 512, (g, w) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, w, 512); g.strokeStyle = g.fillStyle = "rgba(255,210,150,.85)"; g.lineWidth = 6; g.lineCap = "round";
    const ic = [(x, y) => { g.beginPath(); g.arc(x, y, 26, 0, 7); g.stroke(); g.beginPath(); g.moveTo(x, y - 40); g.lineTo(x, y - 32); g.stroke(); }, (x, y) => { g.beginPath(); g.moveTo(x - 30, y + 20); g.lineTo(x - 10, y - 20); g.lineTo(x + 30, y - 20); g.stroke(); }, (x, y) => { g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); g.beginPath(); g.arc(x, y, 28, -2.2, -0.9); g.stroke(); g.beginPath(); g.arc(x, y, 28, 0.9, 2.2); g.stroke(); }];
    ic.forEach((f, i) => f(w / 2, 100 + i * 150));
  });
  const tp = mesh(new THREE.PlaneGeometry(0.1, 0.2), new THREE.MeshPhysicalMaterial({ color: 0x050505, emissive: 0xffffff, emissiveMap: panelTex, emissiveIntensity: 0.6, roughness: 0.05, clearcoat: 1 }), -0.25, 0.7035, -0.2, S, false); tp.rotation.x = -Math.PI / 2;
  // reading lamp
  const lamp = new THREE.Group(); lamp.position.set(-0.28, 0.703, 0.28); S.add(lamp);
  mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.012, 48), M.champagne, 0, 0, 0, lamp);
  lamp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.22, 0), new THREE.Vector3(-0.04, 0.38, -0.02), new THREE.Vector3(-0.14, 0.42, -0.06)]), 48, 0.005, 10), M.champagne));
  const shadeM = M.champagne.clone(); shadeM.side = THREE.DoubleSide;
  const shade = mesh(new THREE.CylinderGeometry(0.02, 0.045, 0.05, 48, 1, true), shadeM, -0.15, 0.415, -0.065, lamp); shade.rotation.z = 0.55;
  mesh(new THREE.CircleGeometry(0.04, 32), M.warm, -0.163, 0.395, -0.065, lamp, false).rotation.set(Math.PI / 2 - 0.55, 0, 0);
  const lampLight = new THREE.SpotLight(0xffc07a, 1.4, 2.5, 0.9, 0.8, 2); lampLight.position.set(-0.45, 1.1, 0.24); lampLight.target.position.set(-0.6, 0.4, 0.0); S.add(lampLight, lampLight.target);
  // champagne flute
  const fl = new THREE.Group(); fl.position.set(-0.43, 0.703, -0.22); S.add(fl);
  const flP = [[0, 0], [0.03, 0], [0.031, 0.003], [0.003, 0.008], [0.0028, 0.09], [0.018, 0.105], [0.025, 0.2], [0.024, 0.2], [0.017, 0.106], [0.001, 0.097]].map(p => new THREE.Vector2(p[0], p[1]));
  mesh(new THREE.LatheGeometry(flP, 48), M.glass, 0, 0, 0, fl);
  mesh(new THREE.LatheGeometry([[0, 0.1], [0.016, 0.107], [0.0225, 0.165], [0, 0.165]].map(p => new THREE.Vector2(p[0], p[1])), 48), new THREE.MeshPhysicalMaterial({ color: 0xe8c25e, roughness: 0.08, transparent: true, opacity: 0.72, emissive: 0x3a2a08, clearcoat: 1 }), 0, 0, 0, fl);
  // amenity kit, folded blanket, pillow
  const kit = new THREE.Group(); kit.position.set(-1.5, 0.765, -1.15); kit.rotation.y = 0.25; S.add(kit);
  mesh(puffy(RB(0.21, 0.065, 0.12, 0.028, 6), 0.012, "y"), M.dark, 0, 0.033, 0, kit);
  mesh(RB(0.19, 0.004, 0.006, 0.002, 2), M.champagne, 0, 0.068, 0, kit);
  mesh(RB(0.018, 0.006, 0.03, 0.002, 2), M.champagne, 0.1, 0.066, 0.012, kit);
  const blanket = new THREE.Group(); blanket.position.set(-0.95, 0.42, -1.64); blanket.rotation.y = 0.08; S.add(blanket);
  mesh(puffy(RB(0.44, 0.04, 0.3, 0.018, 5), 0.008, "y"), M.knit, 0, 0.005, 0, blanket);
  mesh(puffy(RB(0.44, 0.035, 0.3, 0.016, 5), 0.008, "y"), M.knit, 0.006, 0.042, 0.004, blanket);
  const pillow = mesh(puffy(RB(0.4, 0.28, 0.1, 0.05, 7), 0.045, "z"), M.fabric, -0.95, 0.67, 0.25, S); pillow.rotation.set(0.25, 0.06, 0.04);
  // overhead reading light: the key light on your seat, with soft shadows
  const spot = new THREE.SpotLight(0xffe0b8, 5.5, 0, 0.62, 0.75, 2); spot.position.set(-1.0, 2.25, -0.35); spot.target.position.set(-1.0, 0.45, -0.75);
  spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048); spot.shadow.bias = -0.0002; spot.shadow.normalBias = 0.01; spot.shadow.camera.near = 0.3; S.add(spot, spot.target);
  const fill = new THREE.PointLight(0xffd2a0, 0.5, 3.5, 2); fill.position.set(-0.6, 1.7, 0.6); S.add(fill);
  return { scene, M };
}
