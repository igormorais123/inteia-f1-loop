import {createInCarEngine} from './engine/in-car.js';
import {engineShot} from './engine/engine-shot.js';
import {createFrameQuality} from './fx/frame-quality.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {applyCarMaterials} from '../materia-prima/modulos-atualizados/studio.js';
import {createMechanics} from '../materia-prima/modulos-atualizados/mechanics.js';
import {applyInteiaBranding} from '../materia-prima/modulos-atualizados/branding.js';
import {createPost} from './fx/post.js';
import {wipeUniforms, WIPE_RANGE} from './fx/wipe-clip.js';
import {createDust} from './fx/dust.js';
import {createHighlight} from './fx/highlight.js';
import {enhanceCar} from './fx/car-look.js';
import {createSurfaceLibrary} from './fx/surface-library.js';
import {createChoreo} from './fx/choreo.js';
import {createGarage} from './world/garage.js';
import {createTunnel} from './world/tunnel.js';
import {createTrack} from './world/track.js';
import {speedCamera, createWheelBlur, createSparks} from './fx/speed.js';
import {portraitFrame, monitorShot} from './story.js';

const FOG = '#0b1014';
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

async function fetchModel(names, signal, onFraction) {
  for (const name of names) {
    const response = await fetch(import.meta.env.BASE_URL + 'assets/' + name, {signal});
    if (response.status === 404 || (response.headers.get('content-type') || '').includes('text/html')) continue;
    if (!response.ok) throw new Error('Modelo HTTP ' + response.status);
    const total = Number(response.headers.get('content-length')) || 0;
    if (!response.body || !total) { const bytes = await response.arrayBuffer(); onFraction(1); return bytes; }
    const reader = response.body.getReader(), chunks = [];
    let received = 0;
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      chunks.push(value); received += value.length; onFraction(Math.min(1, received / total));
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes.buffer;
  }
  throw new Error('Modelo do carro ausente');
}

function radialTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d'), image = context.createImageData(size, size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const dx = (i + .5) / size * 2 - 1, dy = (j + .5) / size * 2 - 1, d = Math.sqrt(dx * dx + dy * dy);
    // Dithered alpha avoids the 8-bit banding a smooth gradient shows under grading.
    image.data[(j * size + i) * 4 + 3] = Math.max(0, Math.min(255, Math.pow(Math.max(0, 1 - d), 1.7) * 255 + Math.random() - .5));
  }
  context.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

export async function createScene(stage, {onProgress, onError, signal}) {
  const mobile = innerWidth < 761;
  const params = new URLSearchParams(location.search);
  let pixelRatio = Math.min(devicePixelRatio, mobile ? 1.25 : 1.5);
  const frameQuality = createFrameQuality();
  const renderer = new THREE.WebGLRenderer({antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance'});
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.Fog(FOG, 15, 40);
  const camera = new THREE.PerspectiveCamera(30, 1, .05, 80);
  stage.append(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); onError(); });

  // Warm key against a cold world (R10); the environment map supplies the softboxes.
  const warmKey = new THREE.Color('#ffcf9e'), coldKey = new THREE.Color('#dcecff');
  // Hot subject, cold world: the box rim is amber and only the tunnel turns it cyan.
  const warmRim = new THREE.Color('#ffa24a'), coldRim = new THREE.Color('#4fd6ff');
  const key = new THREE.DirectionalLight(warmKey, 3);
  key.position.set(4.5, 7, -2.5);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(mobile ? 1024 : 2048);
  Object.assign(key.shadow.camera, {left: -4.2, right: 4.2, top: 4.2, bottom: -4.2, near: 1, far: 20});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -.00025;
  key.shadow.normalBias = .012;
  key.shadow.radius = 5;
  // Steep rim: a low rim mirrors off the epoxy straight into the low cameras as a white sheet.
  const rim = new THREE.DirectionalLight(warmRim, 2);
  rim.position.set(-2.5, 9, -6);
  const front = new THREE.DirectionalLight('#dfe8f0', .45);
  front.position.set(3, 2, 8);
  const hemi = new THREE.HemisphereLight('#44576a', '#07090b', .4);
  // Warm kicker from above and behind draws the hot edge along engine cover and halo (R10).
  const kicker = new THREE.DirectionalLight('#ffab66', 1.4);
  kicker.position.set(1.2, 6.5, -8);
  const rimEdge = new THREE.Vector3(-.2, .75, -.63).normalize(), rimBack = new THREE.Vector3();
  scene.add(key, key.target, rim, front, hemi, kicker);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 45000);
  // Choosing to read without 3D stops the car download instead of finishing it in the background.
  // The catch below removes the canvas; after the download the build simply finishes.
  if (signal?.aborted) abort.abort();
  else signal?.addEventListener('abort', () => abort.abort(), {once: true});
  let model;
  try {
    const names = mobile ? ['carro-aula-mobile-v2.glb', 'carro-aula-mobile.glb'] : ['carro-aula-v2.glb', 'carro-aula.glb'];
    const raw = await fetchModel(names, abort.signal, f => onProgress(f * .8, 'Carregando o carro'));
    onProgress(.84, 'Montando o carro');
    await MeshoptDecoder.ready;
    model = (await loader.parseAsync(raw, '')).scene;
  } catch (error) {
    renderer.dispose(); renderer.domElement.remove(); throw error;
  } finally { clearTimeout(timer); }
  const bounds = new THREE.Box3().setFromObject(model), center = bounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -bounds.min.y, -center.z);
  scene.add(model);
  model.updateMatrixWorld(true);
  const carMaterials = applyCarMaterials(THREE, model);
  for (const m of carMaterials.materials) if (m.name.toLowerCase().startsWith('pintura')) m.envMapIntensity = 1.25;
  const mechanics = createMechanics(model);
  // Chapter 07: created empty, no download here; apply() calls prepare() near Encerrar (GRAVE 2, r5).
  const inCarEngine = createInCarEngine({scene, renderer, camera, model, mechanics, mobile, signal, target: () => post.composer.inputBuffer, offstage: () => [tunnel?.root, track.root]}), engineAim = new THREE.Vector3();
  await applyInteiaBranding(model, mechanics);
  // Complementary finish maps; keep the canonical car rig and solid pigment.
  const surfaceLibrary = createSurfaceLibrary(THREE, {renderer, mobile});
  const detailedMaterials = new Set();
  model.traverse(object => { if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (detailedMaterials.has(material)) continue;
      const name = material.name.toLowerCase();
      const kind = name.startsWith('pintura') ? 'paint' : name.includes('carbon') ? 'carbon' : ['pneus','borracha'].includes(name) ? 'rubber' : name === 'aço' ? 'aluminum' : null;
      if (kind) { surfaceLibrary.applyTo(material, kind, {uvSpanMeters: name === 'pneus' ? .65 : 1}); detailedMaterials.add(material); }
    }
  });
  stage.dataset.surfaceDetails = String(detailedMaterials.size);
  // Wheel machining and artwork authored by the other execution refine these base maps.
  const carLook = enhanceCar({model, mechanics, mobile});
  // The finish pass runs last so its art direction is the final word on the car materials.
  let triangles = 0;
  const offsetScale = new THREE.Vector3();
  // Parts smaller than a few centimetres add shadow-pass draw calls but no readable shadow.
  model.traverse(o => {
    if (!o.isMesh) return;
    triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    o.castShadow = !o.userData.inteiaDecal && o.geometry.boundingSphere.radius * o.getWorldScale(offsetScale).x > .09;
    o.receiveShadow = true;
  });
  const find = pattern => mechanics.records.find(r => pattern.test(r.source));
  // Telemetry cyan, not red: a red glow on red paint reads as salmon, outside the palette.
  const floor = createHighlight(mechanics.records.filter(r => /^floor/.test(r.source)), '#38e8ff');

  // Soft contact shadow under the chassis and each tyre, faded when the car opens.
  const blobTexture = radialTexture();
  const blobMaterial = new THREE.MeshBasicMaterial({map: blobTexture, color: '#000', transparent: true, depthWrite: false});
  const contacts = new THREE.Group();
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 6.6), blobMaterial);
  blob.rotation.x = -Math.PI / 2; blob.position.y = .004; contacts.add(blob);
  for (const w of mechanics.wheels) {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.62, .86), blobMaterial);
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(w.pivot.position.x, .006, w.pivot.position.z); contacts.add(shadow);
  }
  contacts.renderOrder = 1;
  scene.add(contacts);

  onProgress(.9, 'Acendendo o box');
  const garage = createGarage({renderer, scene, mobile});
  const tunnel = createTunnel({renderer, scene, mobile});
  // Night circuit: the world runs past the parked car, so it shares the car coordinates.
  const track = createTrack({THREE, renderer, mobile});
  scene.add(track.root);
  const wheelBlur = createWheelBlur({THREE, mechanics});
  const sparks = createSparks({THREE, renderer, mobile});
  scene.add(sparks.object);
  const shake = {x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, fovKick: 0, fov: 30};
  const worlds = {garage, tunnel, track};
  // Lights of the tunnel world (cyan rim under the floor) fade with the track's weight during the wipe.
  const tunnelLights = [], tunnelLightBase = [];
  tunnel?.root.traverse(o => { if (o.isLight) { tunnelLights.push(o); tunnelLightBase.push(o.intensity); } });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envGarage = pmrem.fromScene(garage.envScene, .02);
  const envTunnel = pmrem.fromScene(tunnel.envScene, .02);
  pmrem.dispose();
  scene.environment = envGarage.texture;
  const dust = createDust({mobile});
  scene.add(dust.points);
  const post = createPost(renderer, scene, camera, {mobile});
  const choreo = createChoreo({model, mechanics, camera, mobile, scene});

  const target = new THREE.Vector3(), focus = new THREE.Vector3(), offset = new THREE.Vector3(), side = new THREE.Vector3(), point = new THREE.Vector3(), buffer = new THREE.Vector2();
  const pointer = {x: 0, y: 0, sx: 0, sy: 0}, lastCamera = new THREE.Vector3();
  const gradeGarage = [[.9, .99, 1.07], [1.06, 1, .92]], gradeTunnel = [[.84, 1, 1.14], [.97, 1.02, 1.07]], gradeDebrief = [[.97, .92, 1.02], [1.05, .98, .93]], gradeTrack = [[.86, 1, 1.12], [1.05, 1, .93]];
  const dustWarm = new THREE.Color('#ffd9b8'), dustCold = new THREE.Color('#bfe9ff'), dustColor = new THREE.Color();
  const fogBase = new THREE.Color(FOG), fogHaze = new THREE.Color('#0a1218');
  let pose = null, width = 1, height = 1;

  function resize() {
    frameQuality.reset();
    width = innerWidth; height = innerHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height);
    post.setSize(width, height);
    camera.aspect = width / height;
    // Text owns the left column on desktop and the lower half on phones (R4).
    camera.setViewOffset(width, height, mobile ? 0 : -width * .15, mobile ? height * .2 : -height * .03, width, height);
    camera.updateProjectionMatrix();
    wipeUniforms.uWipeRes.value.copy(renderer.getDrawingBufferSize(buffer));
    wipeUniforms.uWipeCenter.value.set(.5, mobile ? .7 : .5);
  }

  const partPoint = (record, extra) => record
    ? () => point.copy(record.center).add(model.position).add(offset.subVectors(record.root.position, record.base)).add(extra)
    : () => point.set(0, .8, 0);
  const floorPart = find(/^floor/), steering = find(/^steering_wheel/);
  // Hotspots sit on the subject, clear of the text column and of the evidence itself.
  const anchors = [
    partPoint(steering, new THREE.Vector3(0, .62, -.7)),
    partPoint(floorPart, new THREE.Vector3(0, .05, -1.2)),
    partPoint(steering, new THREE.Vector3(0, .62, -.9)),
    () => (garage?.anchors?.monitors ? point.copy(garage.anchors.monitors) : point.set(-4.6, 1.52, -1.35)).add(offset.set(0, .72, -1.9)),
    partPoint(floorPart, new THREE.Vector3(0, -.02, -.4)),
    partPoint(steering, new THREE.Vector3(0, .62, -.7)),
  ];

  // Monitor reading shot state (camera r6): weight and reading arrive straight from the scroll, so they are damped.
  const shot = {weight: 0, reading: 0, lens: null};
  function apply(dt, time) {
    const t = pose.tunnel, d = pose.debrief, e = pose.exposure, v = pose.evaluate;
    const p = pose.index + pose.local;
    // Chapter 07 (engine/engine-shot.js): one take from the closing frame into the running engine.
    const engineTake=pose.engineChapter?engineShot(pose.engineProgress||0,mobile):null,engineZoom=engineTake?engineTake.weight:0;
    if(pose.engineChapter||p>4.97)inCarEngine.prepare();
    // Portrait framing is a pure function of the pose (story.js portraitFrame, shared with the tests):
    // lifted above the copy while it reads, car centred and ≈58% of the width when there is none,
    // the wide reverse shot inside the box at 1.68–1.97 and the lesson screen centred at 3.52–3.92.
    const portrait = mobile ? portraitFrame(pose, width / height) : null;
    camera.position.fromArray(portrait ? portrait.camera : pose.camera);
    target.fromArray(portrait ? portrait.target : pose.target);
    // Dedicated monitor reading (monitor-scene.js; story.js monitorShot): a drifting shot with a rack focus,
    // blended over the held island pose. Damped like main.js damps the story, so a wheel step never jumps the
    // lens; the reading snaps while the shot is out of frame (arriving from elsewhere does not replay pages).
    const lag = 1 - Math.exp(-Math.min(dt, .1) * 5), wantReading = pose.monitorReading ?? shot.reading;
    shot.weight += ((pose.monitorScene || 0) - shot.weight) * lag;
    if (shot.weight < 1e-3) { if (!pose.monitorScene) shot.weight = 0; shot.reading = wantReading; }
    else shot.reading += (wantReading - shot.reading) * lag;
    const dedicated = shot.weight < 1e-3 ? 0 : shot.weight;
    shot.lens = dedicated > 0 ? monitorShot(shot.reading, width / height) : null;
    if (shot.lens) {
      target.lerp(offset.fromArray(shot.lens.target), dedicated);
      camera.position.lerp(offset.fromArray(shot.lens.camera), dedicated);
    }
    if(engineZoom>0){
      target.lerp(engineAim.fromArray(engineTake.target),engineZoom);
      camera.position.lerp(engineAim.fromArray(engineTake.camera),engineZoom);
    }
    // Handheld breathing and pointer parallax stay small so the take remains legible.
    const follow = 1 - Math.exp(-dt * 3);
    pointer.sx += (pointer.x - pointer.sx) * follow; pointer.sy += (pointer.y - pointer.sy) * follow;
    side.subVectors(target, camera.position).cross(camera.up).normalize();
    camera.position.addScaledVector(side, (pointer.sx * .16 + Math.sin(time * .31) * .025) * (1-dedicated));
    camera.position.y += (-pointer.sy * .08 + Math.sin(time * .23 + 1.3) * .018) * (1-dedicated);
    // Track run: the frame drops the text-column offset and centres the car; the speed camera adds
    // millimetre shake, a slow sway and the FOV kick on top of the take.
    const c = Math.max(pose.center || 0, dedicated), run = pose.speed || 0, r = pose.track || 0;
    camera.setViewOffset(width, height, mobile ? 0 : -width * .15 * (1 - c), portrait ? height * portrait.offsetY * (1 - dedicated) : -height * .03 * (1 - c), width, height);
    speedCamera(time, run, shake, pose.fov);
    const s = pose.shake || 0;
    camera.fov = portrait ? portrait.fov + shake.fovKick * s * 1.32 : pose.fov + shake.fovKick * s;
    if (shot.lens) camera.fov = mix(camera.fov, shot.lens.fov, dedicated);
    if(engineZoom>0)camera.fov = mix(camera.fov,engineTake.fov,engineZoom);
    camera.far = r > 0 ? track.cameraFar : 80;
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    if (s > 0) {
      camera.translateX(shake.x * s); camera.translateY(shake.y * s); camera.translateZ(shake.z * s);
      camera.rotateX(shake.pitch * s); camera.rotateY(shake.yaw * s); camera.rotateZ(shake.roll * s);
    }

    // The car stays assembled in chapter 07: only the engine cover lifts (in-car.js), after mechanics rewrote the parts.
    mechanics.setAmount(pose.explode);
    mechanics.setSpin(t > .01);
    mechanics.update(dt * (1 + 20 * t), time * 1000, true);
    inCarEngine.update(dt,engineTake,pose.enginePaused);
    // The circuit integrates its own roll; the wheels follow it (after mechanics rewrote the spin).
    if (r > 0 || run > 0) {
      const motion = track.update(time, dt, run);
      if (run > 0) for (const w of mechanics.wheels) w.spinPivot.rotation.x = motion.wheelAngle;
    }
    wheelBlur.update(run);
    sparks.update(time, run * r);
    // Arrival at the box (the track is the outgoing world): the discs glow while speed falls and the
    // rain light stays on; it only flashes while the car runs. Fades as the box takes the frame.
    const braking = pose.outgoing === 'track' ? Math.min(1, (1 - run) * 4) * (1 - smooth(((pose.sweep || 0) - .88) / .1)) : 0;
    carLook.race(run, braking, time);
    floor.set(pose.highlight, time, pose.index);
    carLook.update(dt, time, pose);
    choreo.update(dt, time, pose);
    blobMaterial.opacity = .85 * (1 - smooth(pose.explode * 4));

    const inTunnel = t >= .5;
    // Worlds by name (story WIPES): a settled frame renders only pose.world; during a wipe the
    // incoming world keeps the swept side (+1) and the outgoing one the rest (−1).
    wipeUniforms.uWipePos.value = pose.incoming ? mix(-WIPE_RANGE, WIPE_RANGE, pose.sweep) : -9;
    for (const [name, world] of Object.entries(worlds)) {
      if (!world) continue;
      const side = !pose.incoming ? 0 : name === pose.incoming ? 1 : name === pose.outgoing ? -1 : 0;
      world.root.visible = pose.incoming ? side !== 0 : name === pose.world;
      world.clip.side = side;
    }
    scene.environment = r >= .5 && track.envTexture ? track.envTexture : (inTunnel ? envTunnel : envGarage).texture;
    tunnel?.setFlow(t);
    // Corrigir (≈3.9–4.75) gets its own light: fill down, blacks back to black, car the brightest thing.
    const fix = smooth((p - 3.9) / .2) * (1 - smooth((p - 4.6) / .25));
    // The box floor stays near black from Corrigir through Encerrar (4.4–5.0), with no lift between the two moods.
    // Rear-wing close (≈0.72): a grazing warm backlight draws wing and engine cover, the bay line calms down.
    const rearClose = smooth((p - .56) / .1) * (1 - smooth((p - .84) / .08));
    garage.setMood({debrief: d, evaluate: v, fix: Math.max(fix, smooth((p - 4.3) / .15)), focus: Math.max(pose.highlight || 0, .55 * rearClose), monitor: pose.monitorScene || 0});
    garage.setLessonProgress(p, pose.monitorReading);
    garage?.update(dt, camera, time);
    tunnel?.update(dt, camera, time);

    key.color.lerpColors(warmKey, coldKey, Math.max(t, r));
    key.intensity = (3.1 - .8 * t) * (1 - .6 * d) * (1 - .65 * v) * (1 - .2 * fix) * e;
    rim.color.lerpColors(warmRim, coldRim, t);
    // Steep amber rim also lands on the floor: kept low in the box, the edge line comes from the coat.
    rim.intensity = (1.1 + 2.4 * t + .4 * d) * (1 - .4 * fix) * e;
    front.intensity = .3 * (1 - .8 * d) * (1 - .7 * v) * (1 - .6 * fix) * e;
    hemi.intensity = .28 * (1 - .5 * v) * (1 - .6 * fix) * (1 - .5 * d) * e;
    kicker.intensity = 1.4 * (1 - t) * (1 + .6 * d) * e;
    scene.environmentIntensity = (.9 + .15 * t) * (1 - .35 * d) * (1 - .4 * v) * (1 - .3 * fix) * e;
    // Track (levels from the track lab): a cold, lower key; the amber rim and kicker draw the edge
    // that the circuit's long light strips run along.
    if (r > 0) {
      key.intensity *= mix(1, .42, r);
      rim.color.lerp(warmRim, r); rim.intensity = mix(rim.intensity, 1.5 * e, r);
      front.intensity *= 1 - .6 * r; hemi.intensity *= 1 - .5 * r;
      kicker.intensity = mix(kicker.intensity, .55 * e, r);
      scene.environmentIntensity = mix(scene.environmentIntensity, .95 * e, r);
    }
    // The edge line is drawn in the car shaders from behind and above (car-look setRim): it outlines
    // engine cover and halo without landing on the floor; cyan and fainter in the tunnel.
    // In the close the edge light comes from beyond the subject (camera forward, lifted), wider and stronger.
    if (rearClose > 0) rimBack.subVectors(target, camera.position).normalize().setY(.9).normalize().lerp(rimEdge, 1 - rearClose);
    carLook.setRim(rim.color, mix((2.4 - 1.6 * t) * (1 + .25 * d) * (1 + 3.5 * rearClose), 1.2, r) * e, rearClose > 0 ? rimBack : rimEdge, mix(.72, .32, rearClose));
    // Out early in the wipe: at half weight the cyan point light still lit the floor edge on the track.
    for (let i = 0; i < tunnelLights.length; i++) tunnelLights[i].intensity = tunnelLightBase[i] * (1 - smooth(r / .3));
    const g = t > 0 ? [0, 1].map(k => gradeGarage[k].map((v, i) => mix(v, gradeTunnel[k][i], t))) : gradeGarage.map((row, k) => row.map((v, i) => mix(v, gradeDebrief[k][i], d)));
    if (r > 0) for (let k = 0; k < 2; k++) for (let i = 0; i < 3; i++) g[k][i] = mix(g[k][i], gradeTrack[k][i], r);
    post.setGrade(g[0], g[1], 1);
    // Chapter 07: the work light mirrors on the piston crowns and bloom turned them into white halos; the bay needs none.
    post.setBloom(mix(mix(mix(.5 + .35 * t + .3 * d, .62, r),.12,dedicated),.18,engineZoom));
    post.setSpeed(run, run * .7);
    post.setBand(pose.incoming ? pose.wipe : 0, time);
    focus.fromArray(pose.focus);
    // Focus range and bokeh scale come from the story pose.
    // Monitor reading: the rack from the card label to its number (story.js monitorShot).
    let range = pose.focusRange, bokehScale = pose.bokehScale;
    if (shot.lens) { focus.lerp(offset.fromArray(shot.lens.focus), dedicated); range = mix(range, shot.lens.focusRange, dedicated); bokehScale = mix(bokehScale, shot.lens.bokehScale, dedicated); }
    // Chapter 07 racks focus part by part with a thin slice (engine-shot.js).
    if (engineZoom > 0) { focus.lerp(engineAim.fromArray(engineTake.focus), engineZoom); range = mix(range, engineTake.range, engineZoom); bokehScale = mix(bokehScale, engineTake.bokeh, engineZoom); }
    post.focus(camera.position.distanceTo(focus), range, bokehScale);
    // Seams (story haze): the far box floor and the tunnel shell sink into dark haze with no horizon,
    // and the dust thins so the empty background never reads as a starry sky.
    const h = pose.haze || 0;
    // The track has its own sky and a 150 m horizon: as it sweeps in, fog moves out to its range.
    scene.fog.near = mix(mix(15, 12, h), track.fog.near, r); scene.fog.far = mix(mix(40, 21, h), track.fog.far, r);
    // The portrait camera pulls back 1.4×: keep the box walls in sight as the track clears.
    const returnFog = mobile ? 1 + .4 * smooth((p - 2.94) / .06) * (1 - smooth((p - 3.10) / .14)) : 1;
    scene.fog.near *= returnFog; scene.fog.far *= returnFog;
    scene.fog.color.lerpColors(fogBase, fogHaze, h * (1 - r)); scene.background.copy(scene.fog.color);
    dustColor.lerpColors(dustWarm, dustCold, t);
    dust.update(time, pixelRatio * height / 900, (1 - .5 * t) * (1 - .8 * h) * (1 - r), dustColor);
    debug?.after?.();
  }
  // ?debug=1 exposes the rig to tools/probe.mjs for isolating a look problem.
  const debug = params.has('debug') ? (window.__scene = {inCarEngine,scene, camera, key, rim, front, hemi, garage, tunnel, track, sparks, wheelBlur, post, mechanics, model, renderer}) : null;

  // Adapt only after warmup and sustained slow real frames, never simulation dt.
  const adaptive = params.get('quality') !== 'high';
  function adapt(now, budgetMs) {
    if (!adaptive) return;
    const sample = frameQuality.observe(now, !document.hidden, budgetMs);
    if (!sample) return;
    stage.dataset.frameMeanMs = sample.meanMs.toFixed(1);
    if (sample.reduce && pixelRatio > .9) {
      pixelRatio = Math.max(.85, pixelRatio - .2);
      resize();
      stage.dataset.quality = String(pixelRatio);
      stage.dataset.qualityReason = 'sustained-slow-frames';
    }
  }

  stage.dataset.parts = String(mechanics.records.length);
  stage.dataset.triangles = String(triangles);
  stage.dataset.highlights = String(floor.count);
  resize();
  // Each world carries its own lights, so box, tunnel and the wipe (both) are three shader
  // variants. Compile all of them behind the preloader instead of freezing on the first tunnel entry.
  // Programs are keyed by the active target too: compile against the composer's half-float buffer, not the canvas.
  onProgress(.96, 'Preparando o túnel e a pista');
  renderer.setRenderTarget(post.composer.inputBuffer);
  // Every pair a wipe can show, plus each world alone; the track's lights change the light count.
  for (const disc of wheelBlur.discs) disc.visible = true;
  sparks.object.visible = true;
  for (const [inBox, inTunnel, onTrack] of [[1, 1, 0], [0, 1, 0], [1, 0, 0], [0, 1, 1], [0, 0, 1], [1, 0, 1]]) {
    garage.root.visible = !!inBox; tunnel.root.visible = !!inTunnel; track.root.visible = !!onTrack;
    scene.environment = onTrack && !inBox && !inTunnel && track.envTexture ? track.envTexture : (inTunnel && !inBox ? envTunnel : envGarage).texture;
    try { await renderer.compileAsync(scene, camera); } catch { renderer.compile(scene, camera); }
  }
  renderer.setRenderTarget(null);
  // First tunnel entry: programs are compiled above, but the tunnel textures (the disc maps are redrawn
  // once the stencil font loads) and the wipe band only upload when first drawn. Upload them and draw one
  // frame of the box → tunnel wipe halfway through, behind the preloader.
  await tunnel.ready;
  const warmTextures = new Set();
  tunnel.root.traverse(o => {
    for (const m of [].concat(o.material || [])) {
      for (const value of Object.values(m)) if (value?.isTexture) warmTextures.add(value);
      for (const u of Object.values(m.uniforms || {})) if (u?.value?.isTexture) warmTextures.add(u.value);
    }
  });
  for (const texture of warmTextures) renderer.initTexture(texture);
  garage.root.visible = tunnel.root.visible = true; track.root.visible = false;
  garage.clip.side = -1; tunnel.clip.side = 1; wipeUniforms.uWipePos.value = 0;
  scene.environment = envTunnel.texture;
  camera.position.set(4.6, 1.5, 5.8); camera.lookAt(0, .5, 0); camera.updateMatrixWorld();
  tunnel.setFlow(1); tunnel.update(.1, camera, 0);
  post.setBand(.5, 0); post.render(0); post.setBand(0, 0);
  garage.clip.side = tunnel.clip.side = 0; wipeUniforms.uWipePos.value = -9; tunnel.setFlow(0);
  // Back to the last compiled pair (box + track) for the speed frame below.
  tunnel.root.visible = false; track.root.visible = true; scene.environment = envGarage.texture;
  // One frame at full speed behind the preloader, so the first run does not stall on the speed pass.
  post.setSpeed(1, 1); post.render(0); post.setSpeed(0, 0); post.resetMotion();
  track.root.visible = false; wheelBlur.update(0); sparks.update(0, 0);
  onProgress(1, 'Pronto');
  return {
    setPose(next) { pose = next; },
    setPointer(x, y) { pointer.x = x; pointer.y = y; },
    setNotebook(values, fields) { garage?.setNotebook(values, fields); },
    anchor(index) {
      const p = anchors[index]().project(camera);
      return {x: (p.x + 1) / 2 * width, y: (1 - p.y) / 2 * height, ok: p.z > -1 && p.z < 1 && Math.abs(p.x) < .92 && Math.abs(p.y) < .86};
    },
    resize,
    render(dt, time, budgetMs = 1000 / 60) {
      if (!pose) return;
      apply(dt, time);
      if (lastCamera.distanceTo(camera.position) > 1.2) post.resetMotion();
      lastCamera.copy(camera.position);
      renderer.info.reset();
      post.render(dt);
      stage.dataset.calls = String(renderer.info.render.calls);
      if (!stage.dataset.loaded) { stage.dataset.loaded = 'true'; stage.classList.add('loaded'); }
      adapt(time * 1000, budgetMs);
    },
    dispose() { inCarEngine.dispose();post.dispose(); dust.dispose(); floor.dispose(); carLook.dispose(); surfaceLibrary.dispose(); carMaterials.dispose(); garage?.dispose(); tunnel?.dispose(); track.dispose(); wheelBlur.dispose(); sparks.dispose(); envGarage.dispose(); envTunnel.dispose(); renderer.dispose(); },
  };
}
