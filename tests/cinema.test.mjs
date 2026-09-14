import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import { sampleStory, portraitFrame } from '../src/story.js';
import { carExtent, speedProfile } from '../tools/camera-metrics.mjs';
import { createChoreo, partTurn } from '../src/fx/choreo.js';

const samples = Array.from({length: 2001}, (_, i) => sampleStory(i / 2000 * 5));

test('the diagonal wipe only runs while one environment replaces the other', () => {
  for (const pose of samples) {
    if (pose.incoming === null) {
      assert.equal(pose.wipe, 0);
      assert.equal(pose.sweep, 0);
      assert.ok(pose.tunnel === 0 || pose.tunnel === 1, `a settled frame shows one world, got tunnel=${pose.tunnel}`);
    } else {
      assert.ok(['tunnel', 'garage', 'track'].includes(pose.incoming) && ['tunnel', 'garage', 'track'].includes(pose.outgoing) && pose.incoming !== pose.outgoing);
      assert.ok(pose.sweep > 0 && pose.sweep < 1);
      for (const [name, value] of [['tunnel', pose.tunnel], ['track', pose.track]]) {
        const expected = pose.incoming === name ? pose.sweep : pose.outgoing === name ? 1 - pose.sweep : 0;
        assert.ok(Math.abs(value - expected) < 1e-9, `${name} weight must match the swept area`);
      }
    }
  }
});

test('the tunnel is the stage of Executar and nowhere else', () => {
  for (const pose of samples) {
    if (pose.tunnel === 1) assert.equal(pose.index, 2, `tunnel fully visible outside Executar at ${pose.index + pose.local}`);
  }
  assert.equal(sampleStory(2.5).tunnel, 1);
  for (const p of [0.3, 1.3, 3.4, 4.3, 5]) assert.equal(sampleStory(p).tunnel, 0);
});

// Round 2 left a limbo at 1.72–2.06: the next chapter's title was legible while the old world
// was still leaving. The wipe now lives in the text-free travel and is done on the seam, so the
// copy of 03 and 04 (opened by main.js after the seam) always lands on a single world.
test('each diagonal wipe runs in a text-free travel and the last one of a chapter is over on the seam', () => {
  for (const [p, incoming] of [[1.8, 'tunnel'], [1.9, 'tunnel'], [1.98, 'tunnel'], [2.52, 'track'], [2.6, 'track'], [2.82, 'garage'], [2.9, 'garage'], [2.98, 'garage']]) {
    assert.equal(sampleStory(p).incoming, incoming, `wipe at ${p}`);
  }
  for (const p of [1.7, 2, 2.02, 2.2, 2.5, 2.7, 3, 3.02, 3.2]) assert.equal(sampleStory(p).incoming, null, `no wipe at ${p}`);
  assert.equal(sampleStory(2.72).world, 'track', 'the run settles on the track between its two wipes');
  for (const seam of [2, 3]) {
    let peak = 0, at = 0;
    for (let p = seam - .3; p < seam; p += .001) { const w = sampleStory(p).wipe; if (w > peak) { peak = w; at = p; } }
    assert.ok(peak > .99 && at <= seam - .1, `wipe into ${seam} peaks at ${at.toFixed(3)}`);
  }
});

test('dark haze covers every wipe and clears before the reading pauses', () => {
  for (const pose of samples) if (pose.incoming) assert.equal(pose.haze, 1, `no haze during the wipe at ${pose.index + pose.local}`);
  for (const p of [0, .3, 1.3, 2.3, 3.3, 4.3, 5]) assert.equal(sampleStory(p).haze, 0, `haze at ${p}`);
});

test('lens, focus and highlights stay physically usable across the take', () => {
  for (const pose of samples) {
    assert.ok(pose.fov >= 20 && pose.fov <= 40, `fov ${pose.fov}`);
    for (const v of pose.focus) assert.ok(Number.isFinite(v));
    for (const key of ['bokeh', 'highlight', 'debrief']) assert.ok(pose[key] >= 0 && pose[key] <= 1, `${key}=${pose[key]}`);
    assert.ok(pose.exposure > .5 && pose.exposure <= 1.05);
    assert.ok(pose.camera[1] > .3, 'camera never goes below the floor line');
  }
});

test('the part isolated by the hypothesis is the part shown as revised, and only then', () => {
  assert.equal(sampleStory(1.3).highlight, 1, 'Hipótese isolates one part');
  assert.equal(sampleStory(4.3).highlight, 1, 'Corrigir shows the same revised part');
  for (const p of [0.3, 2.3, 3.3, 5]) assert.equal(sampleStory(p).highlight, 0, `no highlight at ${p}`);
});

// Camera speed is measured in scene units per unit of progress. The damped scroll follow
// in main.js smooths time, not space: a spike here is a visible lurch on screen.
// The track run (between the tunnel and the island, while pose.track > 0) is the one place the
// lesson is meant to move fast: three linked takes of a car at 80 m/s, two of them whips hidden in
// diagonal wipes, with the scroll damping of main.js on top. There the camera may reach 6× the
// median, but still never teleports (every 0.005 step stays under 0.6 m) and never stalls.
// Everywhere else the original 0.2–1.8× rule holds unchanged.
test('the camera never lurches and never stalls: speed stays within 0.2–1.8× its median outside the track run', () => {
  const profile = speedProfile(.005), speeds = profile.map(s => s.speed).sort((a, b) => a - b);
  const median = speeds[speeds.length >> 1];
  const onTrack = s => sampleStory(s.p).track > 0 || sampleStory(s.p + .005).track > 0;
  const lesson = profile.filter(s => !onTrack(s)), run = profile.filter(onTrack);
  assert.ok(run.length > 60, `track run only ${run.length} samples long`);
  const peak = lesson.reduce((a, b) => b.speed > a.speed ? b : a), slowest = profile.reduce((a, b) => b.speed < a.speed ? b : a);
  assert.ok(peak.speed <= 1.8 * median, `peak ${peak.speed.toFixed(1)} u/p at p=${peak.p.toFixed(3)} is ${(peak.speed / median).toFixed(2)}× the median ${median.toFixed(1)}`);
  assert.ok(slowest.speed >= .2 * median, `camera nearly stops at p=${slowest.p.toFixed(3)} (${slowest.speed.toFixed(1)} u/p)`);
  const runPeak = run.reduce((a, b) => b.speed > a.speed ? b : a);
  assert.ok(runPeak.speed <= 6 * median && runPeak.speed * .005 < .6, `track take jumps ${(runPeak.speed * .005).toFixed(2)} u in one step at p=${runPeak.p.toFixed(3)} (${(runPeak.speed / median).toFixed(2)}× median)`);
});

test('the camera keeps moving while each chapter reads (no locked-off frames)', () => {
  for (let i = 0; i < 5; i++) {
    const a = sampleStory(i).camera, b = sampleStory(i + .5).camera;
    assert.ok(Math.hypot(...a.map((v, k) => v - b[k])) > 1.5, `chapter ${i + 1} camera barely moves during the copy`);
  }
});

test('while copy is on screen the car stays clear of the text column and the chapter dots (1440×900)', () => {
  const stops = [5];
  for (let i = 0; i < 5; i++) for (let k = 0; k <= 10; k++) stops.push(i + k * .05);
  for (const p of stops) {
    const e = carExtent(sampleStory(p));
    assert.ok(e, `car off screen at ${p}`);
    assert.ok(e.min >= .415 && e.max <= .925, `p=${p.toFixed(2)} car spans ${(e.min * 100).toFixed(0)}%–${(e.max * 100).toFixed(0)}%`);
  }
});

// Desktop frame as scene.js builds it (text column on the left: view offset −15% x, −3% y).
const frame = new THREE.PerspectiveCamera(30, 1440 / 900, .05, 80);
frame.setViewOffset(1440, 900, -216, -27, 1440, 900);
function shoot(pose) {
  frame.fov = pose.fov; frame.updateProjectionMatrix(); frame.position.fromArray(pose.camera);
  frame.lookAt(new THREE.Vector3().fromArray(pose.target)); frame.updateMatrixWorld();
  return frame;
}
function screenBox(pose, lo, hi) {
  const camera = shoot(pose), v = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < 8; i++) { v.set(i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]).project(camera); x0 = Math.min(x0, (v.x + 1) / 2); x1 = Math.max(x1, (v.x + 1) / 2); }
  return {x0, x1, width: x1 - x0, centre: (x0 + x1) / 2};
}

// Round 2 racked to monitors that were 6–10% of the width and blurred the hero for nothing.
// Now the car is the sharp subject through the copy, the push-in makes the central monitor
// legible (35–40% of the width), and the focus only settles on it once it is that big.
test('Avaliar keeps the car sharp through the copy, pushes in to the central monitor, then racks to it', () => {
  const monitors = new THREE.Vector3(-4.72, 1.52, -1.35), car = new THREE.Vector3(0, .5, 0);
  const lo = [monitors.x, monitors.y - .32, monitors.z - .57], hi = [monitors.x, monitors.y + .32, monitors.z + .57];
  for (const p of [3, 3.1, 3.2, 3.3, 3.4, 3.45]) {
    const pose = sampleStory(p), eye = new THREE.Vector3().fromArray(pose.camera), focus = new THREE.Vector3().fromArray(pose.focus);
    assert.ok(focus.distanceTo(car) < 1.5, `focus left the car at ${p}`);
    assert.ok(Math.abs(eye.distanceTo(focus) - eye.distanceTo(car)) < pose.focusRange, `car outside the depth of field at ${p}`);
  }
  for (let p = 3.45; p <= 3.9; p += .01) {
    const pose = sampleStory(p);
    if (new THREE.Vector3().fromArray(pose.focus).distanceTo(monitors) < .01) {
      const m = screenBox(pose, lo, hi);
      assert.ok(m.width >= .3, `focus settles on a monitor only ${(m.width * 100).toFixed(0)}% wide at ${p.toFixed(2)}`);
    }
  }
  let held = 0;
  for (let p = 3.68; p <= 3.82; p += .01) {
    const pose = sampleStory(p), m = screenBox(pose, lo, hi);
    if (m.width >= .35 && m.width <= .4 && m.centre >= .45 && m.centre <= .65) held++;
  }
  assert.ok(held >= 6, `central monitor at 35–40% of the width for only ${held} of 15 samples`);
  const pose = sampleStory(3.74), eye = new THREE.Vector3().fromArray(pose.camera), e = carExtent(pose);
  assert.ok(new THREE.Vector3().fromArray(pose.focus).distanceTo(monitors) < .01, 'focus on the monitor at the peak');
  assert.ok(!e || e.min > 1 || e.max < 0 || Math.abs(eye.distanceTo(car) - eye.distanceTo(monitors)) > pose.focusRange, 'a car in frame at the peak must be out of focus');
});

// Round 2 "closes" cropped the whole car under the chapter dots. A close is one part, centred,
// sharp, with the rest of the car soft and never past 88% of the width (the dots column).
// The track run (src/world/track.js) lives in the Executar travel, between the end of its copy and
// the Avaliar seam; speed and shake only exist while the circuit is on screen, and the depth of
// field stays shallow enough not to erase the speed streaks.
test('the track run sits in the Executar travel, runs only while the circuit is on screen and keeps bokeh low', () => {
  let first = Infinity, last = -Infinity, full = 0, peak = 0;
  for (const pose of samples) {
    const p = pose.index + pose.local;
    for (const key of ['track', 'speed', 'shake', 'center']) assert.ok(pose[key] >= 0 && pose[key] <= 1, `${key}=${pose[key]} at ${p}`);
    if (pose.speed > 0 || pose.shake > 0) assert.ok(pose.track > 0, `speed without the circuit at ${p.toFixed(3)}`);
    if (pose.track > 0) { first = Math.min(first, p); last = Math.max(last, p); }
    if (pose.track === 1) { full++; assert.ok(pose.bokeh <= .15, `bokeh ${pose.bokeh.toFixed(2)} on the track at ${p.toFixed(3)}`); }
    peak = Math.max(peak, pose.speed);
  }
  assert.ok(first >= 2.5 && last < 3, `track on screen from ${first} to ${last}`);
  assert.ok(full >= 40 && peak === 1, `the run is a real sequence (${full} full samples, peak speed ${peak})`);
  for (const p of [2.5, 3, 3.02]) { const pose = sampleStory(p); assert.ok(pose.speed === 0 && pose.center === 0, `run still on at ${p}`); }
});

const HULL = JSON.parse(readFileSync(new URL('../tools/car-hull.json', import.meta.url), 'utf8')).parts;
const DELAY = {wheels: 0, aero: .12, suspension: .18, body: .24, cockpit: .3, details: .32};
const ease = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function partBox(indices, explode) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const i of indices) {
    const [category, box, dir] = HULL[i], t = ease(explode, DELAY[category], 1);
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], box[k] + dir[k] * t); hi[k] = Math.max(hi[k], box[k + 3] + dir[k] * t); }
  }
  return [lo, hi];
}
test('each text-free close centres one part at 45–65%, locks a short focus on it and keeps the car off the dots', () => {
  const closes = [[.72, [0, 1, 2, 3, 4, 5, 6, 7, 8], 'rear wing'], [1.64, [25], 'floor']];
  for (const [p, indices, name] of closes) {
    const pose = sampleStory(p), [lo, hi] = partBox(indices, pose.explode), s = screenBox(pose, lo, hi), e = carExtent(pose);
    assert.ok(s.centre >= .45 && s.centre <= .65, `${name} centred at ${(s.centre * 100).toFixed(0)}% at ${p}`);
    // Camera r6 (cinema r5 G4), explicit exception for the floor close only (1.58–1.70, no copy on screen): a long
    // lens from the rear quarter makes the floor the frame, so the flown wheels and wings run past both edges and the
    // ≤88% rule cannot hold. There the part itself must be big (≥35% of the width); the lock and bokeh checks stay.
    if (p >= 1.58 && p <= 1.70) assert.ok(e && s.width >= .35, `${name} close only ${(s.width * 100).toFixed(0)}% wide at ${p} (car ${(e?.min * 100).toFixed(0)}%–${(e?.max * 100).toFixed(0)}%)`);
    else assert.ok(e && e.max <= .88, `${name} close lets the car reach ${(e?.max * 100).toFixed(0)}% at ${p}`);
    const eye = new THREE.Vector3().fromArray(pose.camera), centre = new THREE.Vector3(...lo.map((v, k) => (v + hi[k]) / 2));
    assert.ok(Math.abs(eye.distanceTo(new THREE.Vector3().fromArray(pose.focus)) - eye.distanceTo(centre)) < .5, `${name} is not the focal plane at ${p}`);
    assert.ok(pose.focusRange <= 1.6 && pose.bokeh >= .45, `${name} close keeps a deep focus (range ${pose.focusRange.toFixed(2)}, bokeh ${pose.bokeh.toFixed(2)})`);
  }
});

// Choreography runs on top of mechanics.js, which rewrites positions but never quaternions.
// This mock reproduces that contract; the same check in the page is documented in choreo.js.
function mockMechanics() {
  const model = new THREE.Group(), categories = ['wheels', 'aero', 'suspension', 'body', 'cockpit', 'details'];
  const records = categories.map((category, id) => {
    const root = new THREE.Group();
    root.position.set(id * .1, .2, -id * .3);
    root.quaternion.setFromEuler(new THREE.Euler(.3 * id, -.2, .11 * id));
    model.add(root);
    return {id, root, category, source: category, base: root.position.clone(), rotation: root.quaternion.clone(),
      center: new THREE.Vector3(id * .2, .4, id * .1 - .5), size: new THREE.Vector3(.5, .3, .6), direction: new THREE.Vector3(id % 2 ? 1 : -1, .6, .2)};
  });
  const mechanics = {records, wheels: [], flap: null, amount: 0};
  const apply = amount => { mechanics.amount = amount; for (const r of records) r.root.position.copy(r.base).addScaledVector(r.direction, amount); };
  return {model, mechanics, apply};
}

test('exploded parts tumble, and an assembled car returns exactly to its original orientation', () => {
  for (const c of ['wheels', 'aero', 'suspension', 'body', 'cockpit', 'details']) {
    assert.equal(partTurn(c, 0, 3, 12.3), 0, `${c} turns while assembled`);
    assert.ok(partTurn(c, 1, 3, 0) > 0, `${c} never turns`);
    assert.ok(partTurn('wheels', .3) > partTurn(c === 'wheels' ? 'details' : c, .3) || c === 'wheels', 'turn lags by category');
  }
  const {model, mechanics, apply} = mockMechanics();
  const choreo = createChoreo({model, mechanics, mobile: false});
  for (let frame = 0; frame < 90; frame++) { apply(.9); choreo.update(1 / 60, frame / 60, {explode: .9, tunnel: 0}); }
  assert.ok(mechanics.records.some(r => r.root.quaternion.angleTo(r.rotation) > .05), 'no part tumbles when exploded');
  for (let frame = 0; frame < 5; frame++) { apply(0); choreo.update(1 / 60, 2 + frame / 60, {explode: 0, tunnel: 0}); }
  for (const r of mechanics.records) {
    assert.ok(r.root.quaternion.equals(r.rotation), `${r.category} orientation drifted`);
    assert.ok(r.root.position.equals(r.base), `${r.category} position drifted`);
  }
  choreo.dispose();
});

// Round 3: the footer read the wrong world at 2.90–2.98. pose.world names the world that owns most
// of the frame and flips exactly once per wipe, at its midpoint, so labels never flicker.
test('pose.world flips once per wipe and is the box when the box owns the return from the track', () => {
  let changes = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i].world !== samples[i - 1].world) changes++;
  assert.equal(changes, 3, `world label changes ${changes} times`);
  for (const [p, world] of [[.5, 'garage'], [1.95, 'tunnel'], [2.3, 'tunnel'], [2.6, 'track'], [2.74, 'track'], [2.9, 'garage'], [2.94, 'garage'], [2.98, 'garage'], [3.5, 'garage']]) {
    assert.equal(sampleStory(p).world, world, `world at ${p}`);
  }
});

// Phones (390×844): with no copy the car is the subject, centred and big; the lens widens before the
// camera backs off, so it never leaves the set or sinks into the fog. On the track it fills ≥45%.
const phone = new THREE.PerspectiveCamera(30, 390 / 844, .05, 80);
function phoneExtent(pose) {
  const f = portraitFrame(pose, 390 / 844), v = new THREE.Vector3();
  phone.setViewOffset(390, 844, 0, 844 * f.offsetY, 390, 844);
  phone.fov = f.fov; phone.updateProjectionMatrix(); phone.position.fromArray(f.camera); phone.lookAt(v.fromArray(f.target)); phone.updateMatrixWorld();
  let x0 = Infinity, x1 = -Infinity;
  for (const [category, box, dir] of HULL) {
    const t = ease(pose.explode, DELAY[category], 1);
    for (let i = 0; i < 8; i++) {
      v.set(box[i & 1 ? 3 : 0] + dir[0] * t, box[i & 2 ? 4 : 1] + dir[1] * t, box[i & 4 ? 5 : 2] + dir[2] * t).project(phone);
      x0 = Math.min(x0, (v.x + 1) / 2); x1 = Math.max(x1, (v.x + 1) / 2);
    }
  }
  return {x0, x1, frame: f};
}
test('portrait travels keep the car whole and big, and the track run fills at least 45% of the width', () => {
  for (let p = 2.58; p <= 2.9001; p += .02) {
    const {x0, x1} = phoneExtent(sampleStory(p));
    assert.ok(x1 - x0 >= .45 && x0 >= 0 && x1 <= 1, `p=${p.toFixed(2)} car spans ${(x0 * 100).toFixed(0)}%–${(x1 * 100).toFixed(0)}% on the phone`);
  }
  for (const p of [.72, .8, 2.2 + .5, 4.66]) {
    const pose = sampleStory(p), {x0, x1, frame} = phoneExtent(pose);
    assert.ok(x0 >= 0 && x1 <= 1 && x1 - x0 >= .45, `p=${p} car spans ${(x0 * 100).toFixed(0)}%–${(x1 * 100).toFixed(0)}% on the phone`);
    assert.equal(frame.offsetY, 0, `text-free frame lifted at ${p}`);
    const d = Math.hypot(...frame.camera.map((x, k) => x - [0, .5, 0][k])), len = Math.hypot(...pose.camera.map((x, k) => x - [0, .5, 0][k]));
    assert.ok(d <= len * 1.5 + 1e-6 && frame.fov <= 72 + 1e-6, `portrait camera backs off to ${d.toFixed(1)} m (pose ${len.toFixed(1)} m) at ${p}`);
  }
});

// Round 3 N1: the INTEIA sign on the rear wall (garage.js brand, y≈3.02 at z −6.47) was cut by the top edge
// at 4.25 and 5.00. The tilt keeps its lower edge above the frame.
test('the rear-wall sign stays out of the top of the desktop frame in the Corrigir and closing frames', () => {
  const sign = new THREE.Vector3();
  for (const p of [0, 4.25, 5]) {
    const camera = shoot(sampleStory(p));
    for (const x of [-3, -2.2, -1.4]) {
      sign.set(x, 2.8, -6.47).project(camera);
      assert.ok((1 - sign.y) / 2 < 0 || Math.abs(sign.x) > 1, `sign visible at ${p} (y ${((1 - sign.y) / 2 * 100).toFixed(0)}%)`);
    }
  }
});

// Round 3 M6: the descending crane of Corrigir lands on the nose with shallow but readable depth.
test('the Corrigir crane focuses on the nose with bokeh at most 0.25', () => {
  const pose = sampleStory(4.66);
  assert.ok(pose.bokeh <= .25, `bokeh ${pose.bokeh.toFixed(2)}`);
  assert.ok(Math.hypot(...pose.focus.map((v, k) => v - [0, .3, 2.2][k])) < .3, `focus ${pose.focus.map(v => v.toFixed(2))} is not on the nose`);
});

// Camera r6 (cinema r5 M2): leaving the island the crane pans onto the car, which is whole across and clear of the
// copy column from 3.86 on (desktop 42–92%), and in frame on the phone. Looking down its length, the nose and the
// rear wing may touch the top and bottom edges (≥80% of the hull in frame).
test('the exit from Avaliar has the car in frame and clear of the copy column from 3.86 to 3.96', () => {
  for (let p = 3.86; p <= 3.9601; p += .01) {
    const pose = sampleStory(p), e = carExtent(pose), {x0, x1} = phoneExtent(pose);
    assert.ok(e && e.min >= .42 && e.max <= .92 && e.visible >= .8, `p=${p.toFixed(2)} desktop car ${e ? `${(e.min * 100).toFixed(0)}%–${(e.max * 100).toFixed(0)}%, ${(e.visible * 100).toFixed(0)}% visible` : 'off screen'}`);
    assert.ok(x0 >= 0 && x1 <= 1 && x1 - x0 >= .45, `p=${p.toFixed(2)} phone car ${(x0 * 100).toFixed(0)}%–${(x1 * 100).toFixed(0)}%`);
  }
});

// Camera r6 (cinema r5 M1, M6): on the track the car is the frame. Hull boxes carry wheel and wing corners, so they
// read ≈1.2× the visible silhouette: 0.72 of the desktop width ≈ 60% visible, 0.8 of the phone width ≈ 65%.
// The desktop track frame is centred (scene.js view offset × (1 − center)); the phone frame is not lifted.
const trackFrame = new THREE.PerspectiveCamera(30, 1440 / 900, .05, 80);
function hullSpan(camera, pose) {
  const v = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [category, box, dir] of HULL) {
    const t = ease(pose.explode, DELAY[category], 1);
    for (let i = 0; i < 8; i++) {
      v.set(box[i & 1 ? 3 : 0] + dir[0] * t, box[i & 2 ? 4 : 1] + dir[1] * t, box[i & 4 ? 5 : 2] + dir[2] * t).project(camera);
      x0 = Math.min(x0, (v.x + 1) / 2); x1 = Math.max(x1, (v.x + 1) / 2); y0 = Math.min(y0, (1 - v.y) / 2); y1 = Math.max(y1, (1 - v.y) / 2);
    }
  }
  return {x0, x1, y0, y1};
}
test('on the track the car fills ≥60% of the desktop width at 2.72–2.84 and ≥65% of the phone width, low in the phone frame', () => {
  for (let p = 2.72; p <= 2.8401; p += .02) {
    const pose = sampleStory(p);
    assert.equal(pose.center, 1, `track frame not centred at ${p}`);
    // scene.js adds the speed camera's FOV kick (speed.js: 8° × smoothstep(speed)) scaled by shake.
    const kick = 8 * pose.speed * pose.speed * (3 - 2 * pose.speed) * pose.shake;
    trackFrame.fov = pose.fov + kick; trackFrame.updateProjectionMatrix(); trackFrame.position.fromArray(pose.camera);
    trackFrame.lookAt(new THREE.Vector3().fromArray(pose.target)); trackFrame.updateMatrixWorld();
    const d = hullSpan(trackFrame, pose);
    assert.ok(d.x1 - d.x0 >= .72 && d.x0 >= .01 && d.x1 <= .99, `p=${p.toFixed(2)} desktop car ${(d.x0 * 100).toFixed(0)}%–${(d.x1 * 100).toFixed(0)}%`);
  }
  for (let p = 2.62; p <= 2.8801; p += .02) {
    const pose = sampleStory(p), f = portraitFrame(pose, 390 / 844);
    phone.setViewOffset(390, 844, 0, 844 * f.offsetY, 390, 844);
    phone.fov = f.fov; phone.updateProjectionMatrix(); phone.position.fromArray(f.camera); phone.lookAt(new THREE.Vector3().fromArray(f.target)); phone.updateMatrixWorld();
    const m = hullSpan(phone, pose);
    assert.ok(m.x1 - m.x0 >= .8 && m.x0 >= 0 && m.x1 <= 1, `p=${p.toFixed(2)} phone car ${(m.x0 * 100).toFixed(0)}%–${(m.x1 * 100).toFixed(0)}%`);
    // Horizon lower: the car sits in the lower half, with the lit stands above it instead of dark asphalt below,
    // and stays above the chapter dots (≈90% of the height).
    assert.ok((m.y0 + m.y1) / 2 >= .5 && m.y1 <= .88, `p=${p.toFixed(2)} phone car at ${(m.y0 * 100).toFixed(0)}%–${(m.y1 * 100).toFixed(0)}% of the height`);
  }
});

test('the car works in the tunnel and settles back exactly when it leaves', () => {
  const {model, mechanics, apply} = mockMechanics();
  const choreo = createChoreo({model, mechanics, mobile: false});
  let moved = 0;
  for (let frame = 0; frame < 60; frame++) {
    apply(0); choreo.update(1 / 60, frame / 60, {explode: 0, tunnel: 1});
    const body = mechanics.records.find(r => r.category === 'body');
    moved = Math.max(moved, body.root.position.distanceTo(body.base));
    const wheel = mechanics.records.find(r => r.category === 'wheels');
    assert.ok(wheel.root.position.equals(wheel.base), 'wheels stay planted');
  }
  assert.ok(moved > .003 && moved < .05, `body load motion ${moved.toFixed(4)} m`);
  apply(0); choreo.update(1 / 60, 5, {explode: 0, tunnel: 0});
  for (const r of mechanics.records) assert.ok(r.root.quaternion.equals(r.rotation) && r.root.position.equals(r.base), `${r.category} kept tunnel motion`);
  choreo.dispose();
});
