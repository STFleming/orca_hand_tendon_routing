import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FCOL = { I: '#8e44ad', M1: '#2f6fde', M2: '#27a844', P: '#d63031', T: '#f39c12' };
const SEL = '#ffd400', ANTA = '#00e0ff', SEG = '#ff6ad5';
const GROUP_COL = { tower: '#7d838f', spool: '#aab0ba', hull: '#5a6070', wrist: '#c3c7cf', carpal: '#d4d7de', finger: '#e4e5ea' };
const FINGERS = ['I', 'M1', 'M2', 'P', 'T'];
const JOINT_ORDER = ['TP', 'AP', 'PP', 'DP'];
const SPOOL_ROW = { '35': '1st (nearest wrist)', '12': '2nd', '-12': '3rd', '-35': '4th (furthest)' };

// ---------- three.js setup ----------
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#14161b');
const camera = new THREE.PerspectiveCamera(38, 1, 1, 5000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight('#ffffff', '#3a3f50', 1.6));
const key = new THREE.DirectionalLight('#ffffff', 1.6); key.position.set(-200, 300, -400); scene.add(key);
const rim = new THREE.DirectionalLight('#ffffff', 0.7); rim.position.set(300, 100, 300); scene.add(rim);

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

// ---------- state ----------
let parts = {}, tendons = [], byNum = {}, selected = null;
const meshes = [];          // {mesh, meta, base material}
const tubes = {};           // num -> {cad, fin}
const holeMarkers = {};     // num -> mesh
const holeLabels = {};      // num -> sprite
let xray = 0.28;
const structMats = {};      // group colour -> shared material
const hiSeg = new THREE.MeshStandardMaterial({ color: SEG, emissive: SEG, emissiveIntensity: 0.35, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
const hiSpool = new THREE.MeshStandardMaterial({ color: SEL, emissive: SEL, emissiveIntensity: 0.3, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });

function structMat(color) {
  if (!structMats[color]) {
    structMats[color] = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide });
  }
  return structMats[color];
}
function applyXray() {
  for (const m of Object.values(structMats)) {
    m.transparent = xray < 0.999; m.opacity = xray; m.depthWrite = xray >= 0.999; m.needsUpdate = true;
  }
  hiSeg.opacity = Math.max(0.6, xray); hiSpool.opacity = Math.max(0.7, xray);
}

// ---------- load ----------
const [pm, td, gltf] = await Promise.all([
  fetch('data/parts.json').then(r => r.json()),
  fetch('data/tendons.json').then(r => r.json()),
  new GLTFLoader().loadAsync('data/hand.glb'),
]);
parts = pm; tendons = td.tendons;
for (const t of tendons) byNum[t.num] = t;

gltf.scene.traverse(o => {
  if (!o.isMesh) return;
  const nm = parts[o.name] ? o.name : (o.parent && parts[o.parent.name] ? o.parent.name : null);
  if (!nm) return;
  const meta = parts[nm];
  const small = /^(Pin|bearing|4x8x3)/.test(meta.name);
  o.material = structMat(small ? '#9aa1ab' : GROUP_COL[meta.group] || '#cccccc');
  o.userData.meta = meta;
  o.userData.base = o.material;
  o.renderOrder = 1;
  meshes.push(o);
});
scene.add(gltf.scene);
applyXray();

// ---------- tendons ----------
function curveFrom(pts) {
  const v = [];
  for (const p of pts) {
    const q = new THREE.Vector3(...p);
    if (!v.length || v[v.length - 1].distanceTo(q) > 0.35) v.push(q);
  }
  return new THREE.CatmullRomCurve3(v, false, 'centripetal');
}
function tubeMat(color, opacity) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.4, transparent: opacity < 1, opacity });
}
for (const t of tendons) {
  const cadPts = t.path.slice(0, t.cadPoints), finPts = t.path.slice(t.cadPoints - 1);
  const c1 = curveFrom(cadPts), c2 = curveFrom(finPts);
  const g1 = new THREE.TubeGeometry(c1, Math.max(64, cadPts.length * 4), 0.42, 8, false);
  const g2 = new THREE.TubeGeometry(c2, 48, 0.42, 8, false);
  const cad = new THREE.Mesh(g1, tubeMat(FCOL[t.finger], 0.9));
  const fin = new THREE.Mesh(g2, tubeMat(FCOL[t.finger], 0.45));
  for (const m of [cad, fin]) { m.userData.tendon = t.num; m.renderOrder = 5; scene.add(m); }
  tubes[t.num] = { cad, fin };

  // marker where the tendon leaves the bottom of the wrist
  const s = new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 12), new THREE.MeshStandardMaterial({ color: FCOL[t.finger], emissive: FCOL[t.finger], emissiveIntensity: 0.4 }));
  s.position.set(...t.bottomHole); s.position.y -= 1.0;
  s.userData.tendon = t.num; s.renderOrder = 6;
  scene.add(s); holeMarkers[t.num] = s;
  // holes are 2.8 mm apart: stagger neighbouring labels so they don't overlap
  const lab = textSprite(String(t.num), FCOL[t.finger], 2.6);
  lab.position.copy(s.position).add(new THREE.Vector3(0, Math.floor((t.num - 1) / 2) % 2 ? -6 : -3, 0));
  scene.add(lab); holeLabels[t.num] = lab;
}

function textSprite(text, bg, size, fg = '#fff') {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, 120, 56, 16); g.fill();
  g.fillStyle = fg; g.font = 'bold 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 34);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  sp.scale.set(size * 2, size, 1); sp.renderOrder = 20;
  return sp;
}
function ringSprite(color, size) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = color; g.lineWidth = 10; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  sp.scale.set(size, size, 1); sp.renderOrder = 21;
  return sp;
}
const jointRing = ringSprite(SEG, 12); jointRing.visible = false; scene.add(jointRing);
let selLabels = [];

// ---------- selection ----------
function spoolMeshes(t) {
  const [x, y, z] = t.spool.center;
  return meshes.filter(m => m.userData.meta.group === 'spool' &&
    Math.abs(m.userData.meta.center[0] - x) < 12 && Math.abs(m.userData.meta.center[1] - y) < 12 &&
    Math.sign(m.userData.meta.center[2]) === Math.sign(z));
}
function select(num) {
  selected = num == null ? null : byNum[num];
  const anta = selected ? selected.antagonist : null;
  for (const [n, tb] of Object.entries(tubes)) {
    const k = +n;
    let col = FCOL[byNum[k].finger], op = 0.9, vis = document.getElementById('chkAll').checked, r = 1;
    if (selected) {
      if (k === selected.num) { col = SEL; r = 1.9; vis = true; }
      else if (k === anta) { col = ANTA; r = 1.6; vis = true; }
      else op = 0.18;
    }
    for (const [m, o] of [[tb.cad, op], [tb.fin, op * 0.5]]) {
      m.material.color.set(col); m.material.emissive.set(col);
      m.material.opacity = (k === selected?.num || k === anta) ? (m === tb.fin ? 0.6 : 1) : o;
      m.material.transparent = m.material.opacity < 1;
      m.scale.setScalar(1); m.visible = vis;
    }
    tb.cad.userData.radiusScale = r;
    setTubeRadius(tb, r);
    const hit = selected && (k === selected.num || k === anta);
    holeMarkers[k].scale.setScalar(hit ? 1.7 : 1);
    holeLabels[k].material.opacity = !selected || hit ? 1 : 0.2;
  }
  for (const m of meshes) m.material = m.userData.base;
  for (const l of selLabels) scene.remove(l);
  selLabels = [];
  jointRing.visible = false;
  if (selected) {
    for (const m of meshes) if (m.userData.meta.segment === selected.segment) m.material = hiSeg;
    for (const m of spoolMeshes(selected)) m.material = hiSpool;
    jointRing.position.set(...selected.jointPos); jointRing.visible = true;
    for (const [t, col] of [[selected, SEL], [byNum[anta], ANTA]]) {
      const end = t.path[t.path.length - 1];
      const l = textSprite(`${t.num}`, col, 4.5, '#000');
      l.position.set(end[0], end[1] + 4, end[2]); scene.add(l); selLabels.push(l);
    }
  }
  renderInfo(); renderMap(); renderList();
}
function setTubeRadius(tb, r) {
  // TubeGeometry radius is baked in; rebuild only when it changes
  for (const m of [tb.cad, tb.fin]) {
    if (m.userData.r === r) continue;
    const p = m.geometry.parameters;
    m.geometry.dispose();
    m.geometry = new THREE.TubeGeometry(p.path, p.tubularSegments, 0.42 * r, 8, false);
    m.userData.r = r;
  }
}

// ---------- camera ----------
const VIEW_DIR = new THREE.Vector3(0.45, 0.2, -1).normalize();
function frame(box, dir, k = 0.85) {
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length();
  const d = s / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * k;
  const v = dir || camera.position.clone().sub(controls.target).normalize();
  controls.target.copy(c); camera.position.copy(c).addScaledVector(v, d);
  controls.update();
}
function frameAll() {
  const box = new THREE.Box3();
  for (const m of meshes) if (m.visible && m.userData.meta.group !== 'hull') box.expandByObject(m);
  frame(box, VIEW_DIR);
}
function frameSelection() {
  if (!selected) return frameAll();
  const box = new THREE.Box3();
  for (const t of [selected, byNum[selected.antagonist]]) for (const p of t.path) box.expandByPoint(new THREE.Vector3(...p));
  frame(box, null, 1.4);
}

// ---------- 2D wrist-bottom map (oriented like diagram p.5: right = -z, up = +x) ----------
const svg = document.getElementById('holemap');
const COLS = { '38.5': 32, '33.2': 70, '-33.0': 230, '-38.4': 268 };
const mapY = x => 22 + (27.5 - x) * 5.3;
svg.setAttribute('viewBox', '0 0 300 420');
function renderMap() {
  const anta = selected?.antagonist;
  let s = `<text class="axis" x="51" y="10" text-anchor="middle">back side (+z)</text>
    <text class="axis" x="249" y="10" text-anchor="middle">palm side (−z)</text>
    <text class="axis" x="150" y="${mapY(26)}" text-anchor="middle">↑ +x (pinky side)</text>
    <text class="axis" x="150" y="${mapY(-44)}" text-anchor="middle">↓ −x (index / thumb side)</text>
    <text class="axis" x="150" y="${mapY(-9)}" text-anchor="middle">viewed from below</text>`;
  for (const t of tendons) {
    const [x, , z] = t.bottomHole;
    const key = Object.keys(COLS).reduce((a, b) => Math.abs(+b - z) < Math.abs(+a - z) ? b : a);
    const cls = t.num === selected?.num ? 'sel' : (t.num === anta ? 'anta' : '');
    s += `<g class="hole ${cls}" data-num="${t.num}"><title>#${t.num} ${t.label}</title>
      <circle cx="${COLS[key]}" cy="${mapY(x)}" r="${cls ? 8.5 : 7.3}" fill="${FCOL[t.finger]}"/>
      <text x="${COLS[key]}" y="${mapY(x) + 0.5}">${t.num}</text></g>`;
  }
  svg.innerHTML = s;
}
svg.addEventListener('click', e => {
  const g = e.target.closest('.hole'); if (g) { select(+g.dataset.num); frameSelection(); }
});

// ---------- list + info ----------
function renderList() {
  const anta = selected?.antagonist;
  let h = '';
  for (const f of FINGERS) {
    const ts = tendons.filter(t => t.finger === f);
    h += `<div class="finger"><div class="fname" style="color:${FCOL[f]}">${ts[0].fingerName}</div><div class="pairs">`;
    const seen = new Set();
    for (const j of JOINT_ORDER) for (const t of ts.filter(t => t.joint === j).sort((a, b) => a.dir < b.dir ? 1 : -1)) {
      if (seen.has(t.num)) continue;
      for (const u of [t, byNum[t.antagonist]]) {
        seen.add(u.num);
        const cls = u.num === selected?.num ? 'sel' : (u.num === anta ? 'anta' : '');
        h += `<button class="${cls}" data-num="${u.num}"><b style="background:${FCOL[f]}">${u.num}</b>${u.joint}-${u.dir}</button>`;
      }
    }
    h += '</div></div>';
  }
  document.getElementById('list').innerHTML = h;
}
document.getElementById('list').addEventListener('click', e => {
  const b = e.target.closest('button'); if (b) { select(+b.dataset.num); frameSelection(); }
});

function spoolText(t) {
  const [x, y] = t.spool.center;
  const col = x < -10 ? 'index-side column (x≈−26)' : 'pinky-side column (x≈+8)';
  return `${t.spool.side}, ${col}, ${SPOOL_ROW[String(Math.round(y))] || ''} drum`;
}
function renderInfo() {
  const el = document.getElementById('info');
  if (!selected) {
    el.className = 'empty';
    el.innerHTML = '<div class="placeholder">Click a hole on the map, a marker at the bottom of the wrist, or an entry in the list.</div>';
    return;
  }
  const t = selected, a = byNum[t.antagonist];
  const bz = t.bottomHole[2], row = Math.abs(bz) > 36 ? 'outer' : 'inner';
  el.className = '';
  el.innerHTML = `
    <div class="title"><span class="num" style="background:${FCOL[t.finger]}">${t.num}</span>${t.label}</div>
    <div class="action"><b style="color:${FCOL[t.finger]}">${t.fingerName}</b>: ${t.action}.</div>
    <table>
      <tr><td>Moves</td><td><span style="color:${SEG}">■</span> ${t.segmentName}</td></tr>
      <tr><td>Motor drum</td><td>${spoolText(t)} — shared with #${a.num}</td></tr>
      <tr><td>Wrist bottom</td><td>${bz < 0 ? 'palm' : 'back'} side, ${row} row</td></tr>
      <tr><td>Wrist joint</td><td>wraps the ${bz < 0 ? 'palm-side' : 'back-side'} Pin-3x50</td></tr>
      <tr><td>Carpal entry</td><td>${bz < 0 ? 'odd (palm-side) row' : 'even (back-side) row'}, x = ${t.carpalEntry[0].toFixed(1)} mm</td></tr>
    </table>
    <div class="antarow"><span class="num anta" data-num="${a.num}" style="background:${FCOL[a.finger]}">${a.num}</span>
      <div>Antagonist: <b>${a.label}</b><br><span style="color:var(--dim)">${a.action}</span></div></div>
    <div class="route">Route: motor drum → wrist bottom hole → wrist channel → wrist pin → carpal channel → ${t.fingerName.toLowerCase()} ${t.joint} joint</div>`;
  el.querySelector('.num.anta').onclick = () => select(a.num);
}

// ---------- picking ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const tip = document.getElementById('tip');
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const cands = [...Object.values(holeMarkers), ...Object.values(tubes).flatMap(t => [t.cad, t.fin])].filter(m => m.visible);
  const hit = ray.intersectObjects(cands, false)[0];
  return hit ? hit.object.userData.tendon : null;
}
let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  const n = pick(e);
  select(n);
});
renderer.domElement.addEventListener('pointermove', e => {
  if (e.buttons) { tip.style.display = 'none'; return; }
  const n = pick(e);
  if (n == null) { tip.style.display = 'none'; renderer.domElement.style.cursor = ''; return; }
  const r = view.getBoundingClientRect();
  tip.textContent = `#${n} ${byNum[n].label}`;
  tip.style.left = (e.clientX - r.left + 12) + 'px'; tip.style.top = (e.clientY - r.top + 12) + 'px';
  tip.style.display = 'block'; renderer.domElement.style.cursor = 'pointer';
});

// ---------- toolbar / keys ----------
const setGroupVisible = (groups, v) => { for (const m of meshes) if (groups.includes(m.userData.meta.group)) m.visible = v; };
document.getElementById('chkHull').onchange = e => setGroupVisible(['hull'], e.target.checked);
document.getElementById('chkTower').onchange = e => setGroupVisible(['tower', 'spool'], e.target.checked);
document.getElementById('chkAll').onchange = () => select(selected?.num ?? null);
document.getElementById('rngOpacity').oninput = e => { xray = +e.target.value; applyXray(); };
document.getElementById('btnFocus').onclick = frameSelection;
document.getElementById('btnReset').onclick = frameAll;
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const nums = tendons.map(t => t.num).sort((a, b) => a - b);
  const i = selected ? nums.indexOf(selected.num) : -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { select(nums[(i + 1) % nums.length]); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { select(nums[(i - 1 + nums.length) % nums.length]); e.preventDefault(); }
  else if (e.key === 'a' && selected) select(selected.antagonist);
  else if (e.key === 'f') frameSelection();
  else if (e.key === 'r') frameAll();
  else if (e.key === 'Escape') select(null);
});

setGroupVisible(['hull'], false);
document.getElementById('loading').remove();
select(null);
frameAll();
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

// deep link: index.html#9 selects tendon 9
const h = parseInt(location.hash.slice(1));
if (byNum[h]) { select(h); frameSelection(); }
window.addEventListener('hashchange', () => { const n = parseInt(location.hash.slice(1)); if (byNum[n]) { select(n); frameSelection(); } });
