import * as THREE from 'three';

// Motion choreography layered on the mechanics (runs every frame AFTER mechanics.update,
// which rewrites every part position from its base, so nothing here accumulates).
// Contract: createChoreo({model, mechanics, camera, mobile, scene}) -> {update(dt, time, pose), dispose()}.
//
// (a) Explode: each part tumbles a little around its own centre, later than it starts to
//     travel (delay per category). The quaternion is rebuilt from record.rotation every
//     frame, and at amount 0 the extra turn is exactly zero, so an assembled car always has
//     its original orientation. Node test: tests/cinema.test.mjs; in the page:
//     node tools/probe.mjs 0.3 q "__scene.mechanics.records.every(r=>r.root.quaternion.equals(r.rotation))".
// (b) Tunnel (pose.tunnel): the sprung mass squats under load, heaves and pitches slightly;
//     wheels and uprights stay planted (the engine already spins the wheels in the tunnel).
// (c) Constellation: thin additive threads between neighbouring exploded parts, 2 draw calls,
//     gone below explode 0.3. Desktop only.

const DELAY = {wheels: 0, aero: .12, suspension: .18, body: .24, cockpit: .3, details: .32};
// Radians of tumble at full explode; the body is big and reads best almost level.
const TURN = {wheels: .5, aero: .16, suspension: .38, body: .05, cockpit: .22, details: .3};
const LAG = .1;

const smoothstep = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** Extra tumble (radians) of a part at a given explode amount; exactly 0 when assembled. */
export function partTurn(category, amount, id = 0, time = 0) {
  if (!(amount > 0)) return 0;
  const t = smoothstep(amount, (DELAY[category] ?? .3) + LAG, 1);
  if (t === 0) return 0;
  // A slow drift keeps the exploded constellation alive; it scales with t, so it dies at rest.
  return t * (TURN[category] ?? .2) * (.75 + .5 * hash(id)) + t * .025 * Math.sin(time * .5 + id * 1.7);
}

export function createChoreo({model, mechanics, mobile = false, scene} = {}) {
  const records = mechanics?.records || [];
  const scale = mobile ? .55 : 1;
  model?.updateMatrixWorld(true);

  // Per-part constants, computed once: tumble axis and the part centre in its parent's space.
  const parts = records.map(r => {
    const axis = new THREE.Vector3(hash(r.id + 1) - .5, hash(r.id + 2) - .5, hash(r.id + 3) - .5);
    if (r.category === 'wheels') axis.set(1, 0, 0);                  // rolls outward about the axle
    else axis.addScaledVector(r.direction, -axis.dot(r.direction) / Math.max(1e-6, r.direction.lengthSq()));
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    axis.normalize();
    const parent = r.root.parent;
    const centre = new THREE.Vector3().copy(r.center);
    if (model) centre.add(model.position);                              // record.center is model-relative
    parent?.worldToLocal(centre);
    const sprung = r.category !== 'wheels' && (parent === model || parent === mechanics.flap?.root.parent);
    return {r, axis, offset: centre.sub(r.base), sprung, parentBase: parent && parent !== model ? parent.position.clone() : null};
  });

  const q = new THREE.Quaternion(), pitch = new THREE.Quaternion(), rel = new THREE.Vector3(), turned = new THREE.Vector3();
  const X = new THREE.Vector3(1, 0, 0), pivot = new THREE.Vector3(0, .42, -.2), local = new THREE.Vector3();

  // ------------------------------------------------------------- constellation
  let lines = null, nodes = null, pairs = [], lineMaterial = null, nodeMaterial = null;
  if (!mobile && model && records.length) {
    const size = r => r.size.length();
    const chosen = [...records].filter(r => size(r) > .18).sort((a, b) => size(b) - size(a)).slice(0, 30);
    const seen = new Set();
    for (const a of chosen) {
      const near = chosen.filter(b => b !== a).sort((b, c) => a.center.distanceToSquared(b.center) - a.center.distanceToSquared(c.center)).slice(0, 2);
      for (const b of near) { const key = Math.min(a.id, b.id) + ':' + Math.max(a.id, b.id); if (!seen.has(key)) { seen.add(key); pairs.push([a, b]); } }
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pairs.length * 6), 3).setUsage(THREE.DynamicDrawUsage));
    lineMaterial = new THREE.LineBasicMaterial({color: '#38e8ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false});
    lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(chosen.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
    nodeMaterial = new THREE.PointsMaterial({color: '#bff6ff', size: 3, sizeAttenuation: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false});
    nodes = new THREE.Points(nodeGeometry, nodeMaterial);
    nodes.userData.parts = chosen;
    for (const o of [lines, nodes]) { o.frustumCulled = false; o.visible = false; o.renderOrder = 3; o.name = 'Constelação de peças'; model.add(o); }
  }
  // Part centre in model space, following the travel written by mechanics this frame.
  const centreOf = (r, out) => out.copy(r.center).add(r.root.position).sub(r.base);

  function update(dt, time, pose) {
    const amount = mechanics.amount ?? pose?.explode ?? 0;
    // Load comes from the tunnel airflow or from the track speed (pose.speed, 1 = 80 m/s).
    const tunnel = Math.min(1, Math.max(0, pose?.tunnel || 0, (pose?.speed || 0) * 1.1));
    // Load in the tunnel: static squat plus heave and pitch at two frequencies (a few mm, a fraction of a degree).
    const load = tunnel * scale;
    const heave = load ? load * (-.009 + .0022 * Math.sin(time * 31) + .0014 * Math.sin(time * 47.3 + 1.1) + .003 * Math.sin(time * 2.3)) : 0;
    const pitchAngle = load ? load * (-.0025 + .0022 * Math.sin(time * 1.7 + .4) + .0006 * Math.sin(time * 23.1)) : 0;
    if (load) pitch.setFromAxisAngle(X, pitchAngle);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i], r = part.r;
      const angle = partTurn(r.category, amount, r.id, time) * scale;
      if (angle === 0) r.root.quaternion.copy(r.rotation);
      else {
        q.setFromAxisAngle(part.axis, angle);
        r.root.quaternion.copy(r.rotation).premultiply(q);
        // Turn about the part centre, not the node origin: shift by (offset − q·offset).
        turned.copy(part.offset).applyQuaternion(q);
        r.root.position.add(rel.copy(part.offset).sub(turned));
      }
      if (load && part.sprung) {
        local.copy(pivot); if (part.parentBase) local.sub(part.parentBase);
        rel.subVectors(r.root.position, local).applyQuaternion(pitch);
        r.root.position.copy(local).add(rel);
        r.root.position.y += heave;
        r.root.quaternion.premultiply(pitch);
      }
    }

    if (lines) {
      // Camera r6 (cinema r5 G4): the constellation steps back during the floor close (1.58–1.70), so the part reads.
      const p = (pose?.index || 0) + (pose?.local || 0), close = smoothstep(p, 1.5, 1.58) * (1 - smoothstep(p, 1.7, 1.78));
      const fade = (pose?.engineChapter ? 0 : 1) * smoothstep(amount, .3, .62) * (.3 + .04 * Math.sin(time * 1.3)) * (1 - .9 * close);
      lines.visible = nodes.visible = fade > .005;
      if (lines.visible) {
        lineMaterial.opacity = fade; nodeMaterial.opacity = Math.min(1, fade * 2.2);
        const a = lines.geometry.attributes.position.array;
        for (let i = 0; i < pairs.length; i++) { centreOf(pairs[i][0], rel).toArray(a, i * 6); centreOf(pairs[i][1], rel).toArray(a, i * 6 + 3); }
        lines.geometry.attributes.position.needsUpdate = true;
        const b = nodes.geometry.attributes.position.array, chosen = nodes.userData.parts;
        for (let i = 0; i < chosen.length; i++) centreOf(chosen[i], rel).toArray(b, i * 3);
        nodes.geometry.attributes.position.needsUpdate = true;
      }
    }
  }

  return {
    update,
    dispose() {
      for (const {r} of parts) r.root.quaternion.copy(r.rotation);
      for (const o of [lines, nodes]) if (o) { o.removeFromParent(); o.geometry.dispose(); o.material.dispose(); }
    },
  };
}
