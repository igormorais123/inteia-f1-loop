// Camera QA without a browser: node tools/camera-metrics.mjs [--step 0.005] [--verbose]
// Speed of the camera along the take (units per progress) and where the car lands on a
// 1440×900 desktop frame while copy is on screen. Mirrors scene.js: fov, setViewOffset
// (−15% x, −3% y) and the per-category explode delays of mechanics.js.
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {sampleStory} from '../src/story.js';

const HULL = JSON.parse(readFileSync(new URL('./car-hull.json', import.meta.url), 'utf8')).parts;
const DELAY = {wheels: 0, aero: .12, suspension: .18, body: .24, cockpit: .3, details: .32};
const W = 1440, H = 900;
const camera = new THREE.PerspectiveCamera(30, W / H, .05, 80);
camera.setViewOffset(W, H, -W * .15, -H * .03, W, H);
const v = new THREE.Vector3();

export function smoothstep(x, a, b) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// Horizontal extent (0..1) of the visible car on the desktop frame, or null if off screen.
export function carExtent(pose) {
  camera.fov = pose.fov; camera.updateProjectionMatrix();
  camera.position.fromArray(pose.camera); camera.lookAt(v.fromArray(pose.target)); camera.updateMatrixWorld();
  let min = Infinity, max = -Infinity, seen = 0, total = 0, top = Infinity, bottom = -Infinity;
  for (const [category, box, dir] of HULL) {
    const t = smoothstep(pose.explode, DELAY[category], 1);
    for (let i = 0; i < 8; i++) {
      v.set(box[i & 1 ? 3 : 0], box[i & 2 ? 4 : 1], box[i & 4 ? 5 : 2]).addScaledVector({x: dir[0], y: dir[1], z: dir[2]}, t);
      v.project(camera); total++;
      if (v.z > 1 || v.z < -1) continue;
      const x = (v.x + 1) / 2, y = (1 - v.y) / 2;
      if (y < 0 || y > 1) continue;              // cropped by the top/bottom edge is allowed
      seen++; min = Math.min(min, x); max = Math.max(max, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  return seen ? {min, max, top, bottom, visible: seen / total} : null;
}

export function speedProfile(step = .005) {
  const out = [];
  for (let p = 0; p < 5 - 1e-9; p += step) {
    const a = sampleStory(p), b = sampleStory(Math.min(5, p + step));
    const d = Math.hypot(...a.camera.map((x, k) => b.camera[k] - x));
    const da = new THREE.Vector3().fromArray(a.target).sub(v.fromArray(a.camera)).normalize();
    const db = new THREE.Vector3().fromArray(b.target).sub(v.fromArray(b.camera)).normalize();
    out.push({p, speed: d / step, turn: da.angleTo(db) / step * 180 / Math.PI});
  }
  return out;
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

if ((process.argv[1] || '').endsWith('camera-metrics.mjs')) {
  const step = Number(process.argv[process.argv.indexOf('--step') + 1]) || .005;
  const prof = speedProfile(step), speeds = prof.map(s => s.speed), med = median(speeds);
  const top = prof.reduce((a, b) => b.speed > a.speed ? b : a), slow = prof.reduce((a, b) => b.speed < a.speed ? b : a);
  const turnTop = prof.reduce((a, b) => b.turn > a.turn ? b : a);
  console.log(`velocidade: mediana ${med.toFixed(2)} u/p · máx ${top.speed.toFixed(2)} em p=${top.p.toFixed(3)} (${(top.speed / med).toFixed(2)}× mediana) · mín ${slow.speed.toFixed(2)} em p=${slow.p.toFixed(3)} · giro máx ${turnTop.turn.toFixed(0)}°/p em p=${turnTop.p.toFixed(3)}`);
  const jump = (a, b) => Math.hypot(...sampleStory(a).camera.map((x, k) => sampleStory(b).camera[k] - x));
  console.log(`deslocamento 2,8→3,2: ${jump(2.8, 3.2).toFixed(2)} u · 1,8→2,2: ${jump(1.8, 2.2).toFixed(2)} u`);
  const rows = [];
  for (let i = 0; i < 6; i++) for (let l = -.1; l <= .5001; l += .05) {
    const p = i + l; if (p < 0 || p > 5) continue;
    const e = carExtent(sampleStory(p));
    const ok = e && e.min >= .42 && e.max <= .92;
    rows.push({p, e, ok});
  }
  const bad = rows.filter(r => !r.ok && r.p - Math.floor(r.p + 1e-9) <= .5 + 1e-9 && r.p - Math.floor(r.p + 1e-9) >= -1e-9);
  const monitorCorners = [];
  for (const z of [-2.7, -1.35, 0]) for (const dz of [-.57, .57]) for (const dy of [-.32, .32]) monitorCorners.push([-4.72, 1.52 + dy, z + dz]);
  const monitors = pose => { carExtent(pose); let a = 9, b = -9; for (const c of monitorCorners) { v.fromArray(c).project(camera); a = Math.min(a, (v.x + 1) / 2); b = Math.max(b, (v.x + 1) / 2); } return ` · monitores ${(a * 100).toFixed(0)}%–${(b * 100).toFixed(0)}%`; };
  for (const r of rows) if (process.argv.includes('--verbose') || !r.ok) console.log(`p=${r.p.toFixed(2)} carro x ${r.e ? `${(r.e.min * 100).toFixed(0)}%–${(r.e.max * 100).toFixed(0)}% (visível ${(r.e.visible * 100).toFixed(0)}%)` : 'fora'} ${r.ok ? 'ok' : 'FORA DA ZONA'}${Math.floor(r.p + 1e-9) === 3 ? monitors(sampleStory(r.p)) : ''}`);
  console.log(`composição: ${rows.filter(r => r.ok).length}/${rows.length} amostras de leitura na zona 42–92%`);
  if (process.argv.includes('--profile')) for (const s of prof.filter((_, i) => i % Math.round(.05 / step) === 0)) console.log(s.p.toFixed(2), s.speed.toFixed(2), s.turn.toFixed(0));
}
