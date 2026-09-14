import test from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import vm from 'node:vm';
import {PerformanceObserver} from 'node:perf_hooks';
import * as THREE from 'three';
import {wrapAlong, createTrackMotion, TRACK_LOOP, TRACK_ROWS, TRACK_VISIBLE, TRACK_TOP_SPEED, WHEEL_RADIUS} from '../src/world/track.js';
import {speedCamera, SPEED_CAMERA_LIMITS, SpeedEffect} from '../src/fx/speed.js';

v8.setFlagsFromString('--expose_gc');
const gc = vm.runInNewContext('gc');

test('toda fileira fecha o laço com espaçamento inteiro e só troca de ponta fora do alcance da lente', () => {
  for (const [name, {spacing, half}] of Object.entries(TRACK_ROWS)) {
    if (spacing !== null) {
      const count = TRACK_LOOP / spacing;
      assert.ok(Math.abs(count - Math.round(count)) < 1e-9, `${name}: ${spacing} m não divide o laço de ${TRACK_LOOP} m`);
    }
    assert.ok(TRACK_LOOP / 2 - half >= TRACK_VISIBLE, `${name}: ponta visível a ${TRACK_LOOP / 2 - half} m`);
  }
});

test('o laço infinito não salta: cada objeto anda exatamente v·dt, e só pula um laço inteiro atrás do horizonte', () => {
  const dt = 1 / 60, motion = createTrackMotion();
  const alongs = [0, .8, 6.4, 40, 159.9, 320, 480.4, 639.9];
  let previous = alongs.map(a => wrapAlong(a, motion.travel));
  let wraps = 0;
  for (let frame = 0; frame < 60 * 30; frame++) {
    const before = motion.travel;
    motion.step(dt, 1);
    const moved = (motion.travel - before + TRACK_LOOP) % TRACK_LOOP;
    assert.ok(Math.abs(moved - TRACK_TOP_SPEED * dt) < 1e-9, `deslocamento ${moved} no quadro ${frame}`);
    const now = alongs.map(a => wrapAlong(a, motion.travel));
    now.forEach((z, i) => {
      const step = z - previous[i];
      if (Math.abs(step + TRACK_TOP_SPEED * dt) < 1e-6) return;
      assert.ok(Math.abs(step - (TRACK_LOOP - TRACK_TOP_SPEED * dt)) < 1e-6, `salto de ${step} m em along ${alongs[i]}`);
      assert.ok(Math.abs(previous[i]) >= TRACK_VISIBLE + TRACK_ROWS.stand.half, `troca de ponta visível em z=${previous[i]}`);
      wraps++;
    });
    previous = now;
  }
  assert.ok(wraps >= alongs.length * 3, `laço percorrido poucas vezes (${wraps} trocas)`);
});

test('o acumulador de percurso dá a volta sem mover nada: posições e roda iguais ao percurso sem limite', () => {
  const motion = createTrackMotion();
  let unwrapped = 0, seed = 5;
  const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 20000; i++) {
    const dt = .004 + rand() * .03, speed = rand();
    motion.step(dt, speed);
    unwrapped += speed * TRACK_TOP_SPEED * dt;
    assert.ok(motion.travel >= 0 && motion.travel < TRACK_LOOP);
    assert.ok(motion.wheelAngle >= 0 && motion.wheelAngle < Math.PI * 2);
  }
  for (const a of [3.2, 100, 333.3, 600]) {
    const z = wrapAlong(a, motion.travel), expected = wrapAlong(a, unwrapped);
    assert.ok(Math.abs(z - expected) < 1e-6, `along ${a}: ${z} ≠ ${expected}`);
  }
  const angle = (unwrapped / WHEEL_RADIUS) % (Math.PI * 2);
  assert.ok(Math.abs(motion.wheelAngle - angle) < 1e-6, `roda ${motion.wheelAngle} ≠ ${angle}`);
  const stopped = createTrackMotion();
  for (const bad of [NaN, -1, undefined, Infinity]) stopped.step(1 / 60, bad === Infinity ? 1 : bad);
  assert.equal(stopped.travel, TRACK_TOP_SPEED / 60, 'só a velocidade infinita, limitada a 1, anda');
});

const FIELDS = ['x', 'y', 'z', 'pitch', 'yaw', 'roll'];

test('speedCamera é limitada, parada em velocidade zero e com FOV kick de 30° a 38°', () => {
  const out = {};
  for (const amount of [0, .1, .35, .7, 1, 1.6, -2, NaN]) {
    for (let t = 0; t < 400; t += .0131) {
      const r = speedCamera(t, amount, out);
      assert.equal(r, out);
      for (const f of FIELDS) assert.ok(Math.abs(r[f]) <= SPEED_CAMERA_LIMITS[f], `${f}=${r[f]} com amount ${amount} em t=${t.toFixed(3)}`);
      assert.ok(r.fovKick >= 0 && r.fovKick <= SPEED_CAMERA_LIMITS.fovKick && r.fov === 30 + r.fovKick);
      if (!(amount > 0)) for (const f of [...FIELDS, 'fovKick']) assert.ok(r[f] === 0, `${f}=${r[f]} com o carro parado`);
    }
  }
  assert.equal(speedCamera(1, 1, out).fov, 38);
  assert.equal(speedCamera(1, 1, out, 22).fov, 30);
});

test('speedCamera é determinística e o balanço lento não enjoa (roll abaixo de 0,35° e sem salto entre quadros)', () => {
  const a = {}, b = {};
  let maxRollStep = 0, lastRoll = speedCamera(0, 1, {}).roll;
  for (let t = 0; t < 120; t += 1 / 60) {
    speedCamera(t, .83, a); speedCamera(t, .83, b);
    for (const f of [...FIELDS, 'fovKick', 'fov']) assert.equal(a[f], b[f]);
    const r = speedCamera(t, 1, a).roll;
    maxRollStep = Math.max(maxRollStep, Math.abs(r - lastRoll)); lastRoll = r;
  }
  assert.ok(Math.abs(SPEED_CAMERA_LIMITS.roll) * 180 / Math.PI < .35);
  assert.ok(maxRollStep < .0012, `roll muda ${maxRollStep} rad por quadro`);
});

// Alocação medida no novo espaço do heap: com o coletor chamado antes, N chamadas que
// não criam objetos deixam o espaço jovem igual e não disparam coleta. Um controle que
// cria um objeto por chamada prova que a medida enxerga alocação.
async function allocation(fn, iterations = 60000) {
  for (let i = 0; i < 30000; i++) fn(i);   // aquecimento: otimização e caches inline
  // A primeira janela pode pegar a troca de nível do JIT (bytes de compilação no espaço jovem);
  // vale a melhor de cinco janelas sem coleta. Uma função que aloca cresce em todas elas.
  const used = () => v8.getHeapSpaceStatistics().find(s => s.space_name === 'new_space').space_used_size;
  let best = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const entries = [];
    const observer = new PerformanceObserver(list => entries.push(...list.getEntries()));
    observer.observe({entryTypes: ['gc']});
    gc();
    const before = used(), start = performance.now();
    for (let i = 0; i < iterations; i++) fn(i);
    const end = performance.now(), after = used();
    await new Promise(r => setTimeout(r, 20));
    observer.disconnect();
    // Só contam coletas que começaram dentro do laço medido.
    const collections = entries.filter(e => e.startTime >= start && e.startTime <= end).length;
    const result = {bytes: after - before, collections, perCall: (after - before) / iterations};
    if (!best || (result.collections === 0 && (best.collections > 0 || result.perCall < best.perCall))) best = result;
  }
  return best;
}

test('zero alocação por quadro: speedCamera, rolamento da pista e SpeedEffect.update', async () => {
  const sink = [];
  const control = await allocation(i => { sink[0] = {i, v: i * .5}; });
  assert.ok(control.bytes > 200000 || control.collections > 0, `controle não detectou alocação: ${JSON.stringify(control)}`);

  // Argumentos inteiros (Smi) ou constantes: um double calculado no laço e passado a uma
  // função não embutida vira HeapNumber no próprio chamador (16 bytes), o que mediria o teste, não a função.
  const out = {x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, fovKick: 0, fov: 30};
  const cam = await allocation(i => speedCamera(i, .9, out));
  assert.equal(cam.collections, 0, 'speedCamera disparou coleta');
  assert.ok(cam.perCall < 1, `speedCamera: ${cam.perCall.toFixed(2)} bytes por chamada`);

  const motion = createTrackMotion();
  const roll = await allocation(() => { motion.step(1 / 60, .9); });
  assert.equal(roll.collections, 0, 'rolamento disparou coleta');
  assert.ok(roll.perCall < 1, `rolamento: ${roll.perCall.toFixed(2)} bytes por chamada`);

  const camera = new THREE.PerspectiveCamera(30, 1.6, .05, 150);
  camera.position.set(5.6, .5, .3); camera.lookAt(0, .45, 0); camera.updateMatrixWorld();
  const effect = new SpeedEffect(camera, {cameraBlur: true});
  const fx = await allocation(i => { effect.setAmount(.9, .5); effect.update(null, null, 1 / 60); });
  assert.equal(fx.collections, 0, 'SpeedEffect.update disparou coleta');
  assert.ok(fx.perCall < 1, `SpeedEffect.update: ${fx.perCall.toFixed(2)} bytes por chamada`);
  const shift = effect.uniforms.get('uShift').value;
  assert.ok(Math.abs(shift.z - .9 * 80 / 60) < 1e-9 && shift.x === 0 && shift.y === 0, 'o mundo anda em +Z no quadro anterior');
  const c = effect.uniforms.get('uCenter').value;
  assert.ok(c.x > .45 && c.x < .55 && c.y > .4 && c.y < .6, `centro radial fora do carro: ${c.x}, ${c.y}`);
});
