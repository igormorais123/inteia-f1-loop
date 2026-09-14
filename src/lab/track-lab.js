// Laboratório isolado da sequência de pista. Carrega o carro pelo mesmo caminho de scene.js,
// monta src/world/track.js e um pós equivalente ao de post.js com o SpeedEffect no lugar proposto.
// URL: track-lab.html?shot=a|b|c&speed=0..1[&manual][&t=segundos][&hud]
//   a: travelling lateral baixo (0,5 m)   b: câmera de chão, o carro vem na direção da lente
//   c: acima e atrás da T-cam
// window.__lab: {ready, step(n, dt), setTime(t), stats(), nanscan()}
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {
  EffectComposer, RenderPass, EffectPass, Effect, BloomEffect, DepthOfFieldEffect, NoiseEffect,
  VignetteEffect, SMAAEffect, ChromaticAberrationEffect, ToneMappingEffect, ToneMappingMode,
  BlendFunction, KernelSize, SMAAPreset,
} from 'postprocessing';
import {applyCarMaterials} from '../../materia-prima/modulos-atualizados/studio.js';
import {createMechanics} from '../../materia-prima/modulos-atualizados/mechanics.js';
import {applyInteiaBranding} from '../../materia-prima/modulos-atualizados/branding.js';
import {createSurfaceLibrary} from '../fx/surface-library.js';
import {enhanceCar} from '../fx/car-look.js';
import {createChoreo} from '../fx/choreo.js';
import {wipeUniforms} from '../fx/wipe-clip.js';
import {createTrack, TRACK_TOP_SPEED} from '../world/track.js';
import {SpeedEffect, speedCamera, createWheelBlur, createSparks} from '../fx/speed.js';

const params = new URLSearchParams(location.search);
const SHOT = ['a', 'b', 'c'].includes(params.get('shot')) ? params.get('shot') : 'a';
const SPEED = params.has('speed') ? Math.min(1, Math.max(0, Number(params.get('speed')) || 0)) : .9;
const MANUAL = params.has('manual');
const BRAKE = Math.min(1, Math.max(0, Number(params.get('brake')) || 0));
const mobile = innerWidth < 761;
const stage = document.getElementById('stage'), hud = document.getElementById('hud');
hud.hidden = !params.has('hud');

class SanitizeEffect extends Effect {
  constructor() {
    super('SanitizeEffect', `void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){vec4 c=inputColor;if(any(isnan(c))||any(isinf(c))||!(c.r+c.g+c.b+c.a<1e5))c=vec4(0.,0.,0.,1.);outputColor=vec4(clamp(c.rgb,0.,64.),clamp(c.a,0.,1.));}`, {blendFunction: BlendFunction.SET});
  }
}
class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', `uniform vec3 uShadow;uniform vec3 uHigh;void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){vec3 c=inputColor.rgb;float l=dot(c,vec3(.2126,.7152,.0722));outputColor=vec4(c*mix(uShadow,uHigh,smoothstep(.05,.7,l)),inputColor.a);}`, {
      uniforms: new Map([['uShadow', new THREE.Uniform(new THREE.Vector3(.86, 1, 1.12))], ['uHigh', new THREE.Uniform(new THREE.Vector3(1.05, 1, .93))]]),
    });
  }
}

function radialTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d'), image = context.createImageData(size, size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const dx = (i + .5) / size * 2 - 1, dy = (j + .5) / size * 2 - 1, d = Math.sqrt(dx * dx + dy * dy);
    image.data[(j * size + i) * 4 + 3] = Math.max(0, Math.min(255, Math.pow(Math.max(0, 1 - d), 1.7) * 255 + Math.random() - .5));
  }
  context.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

async function main() {
  const pixelRatio = Math.min(devicePixelRatio, mobile ? 1.25 : 1.5);
  const renderer = new THREE.WebGLRenderer({antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: true});
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  stage.append(renderer.domElement);

  const track = createTrack({THREE, renderer, mobile});
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(track.fog.color);
  scene.fog = new THREE.Fog(track.fog.color, track.fog.near, track.fog.far);
  scene.environment = track.envTexture;
  scene.environmentIntensity = .95;
  scene.add(track.root);
  const camera = new THREE.PerspectiveCamera(30, 1, .05, track.cameraFar);

  // Mesma rigging de scene.js (posições), com os níveis propostos para a pista.
  const key = new THREE.DirectionalLight('#dfe8ff', 1.25);
  key.position.set(4.5, 7, -2.5);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(mobile ? 1024 : 2048);
  Object.assign(key.shadow.camera, {left: -4.2, right: 4.2, top: 4.2, bottom: -4.2, near: 1, far: 20});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -.00025; key.shadow.normalBias = .012; key.shadow.radius = 5;
  const rim = new THREE.DirectionalLight('#ffa24a', 1.5);
  rim.position.set(-2.5, 9, -6);
  const front = new THREE.DirectionalLight('#dfe8f0', .12);
  front.position.set(3, 2, 8);
  const hemi = new THREE.HemisphereLight('#3a4a5c', '#07090b', .14);
  const kicker = new THREE.DirectionalLight('#ffab66', .55);
  kicker.position.set(1.2, 6.5, -8);
  scene.add(key, key.target, rim, front, hemi, kicker);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const name = mobile ? 'carro-aula-mobile-v2.glb' : 'carro-aula-v2.glb';
  const raw = await (await fetch(import.meta.env.BASE_URL + 'assets/' + name)).arrayBuffer();
  await MeshoptDecoder.ready;
  const model = (await loader.parseAsync(raw, '')).scene;
  const bounds = new THREE.Box3().setFromObject(model), center = bounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -bounds.min.y, -center.z);
  scene.add(model);
  model.updateMatrixWorld(true);
  const carMaterials = applyCarMaterials(THREE, model);
  for (const m of carMaterials.materials) if (m.name.toLowerCase().startsWith('pintura')) m.envMapIntensity = 1.25;
  const mechanics = createMechanics(model);
  await applyInteiaBranding(model, mechanics);
  const surfaceLibrary = createSurfaceLibrary(THREE, {renderer, mobile});
  const detailed = new Set();
  model.traverse(object => { if (!object.isMesh) return;
    for (const material of [].concat(object.material)) {
      if (detailed.has(material)) continue;
      const n = material.name.toLowerCase();
      const kind = n.startsWith('pintura') ? 'paint' : n.includes('carbon') ? 'carbon' : ['pneus', 'borracha'].includes(n) ? 'rubber' : n === 'aço' ? 'aluminum' : null;
      if (kind) { surfaceLibrary.applyTo(material, kind, {uvSpanMeters: n === 'pneus' ? .65 : 1}); detailed.add(material); }
    }
  });
  const carLook = enhanceCar({model, mechanics, mobile});
  let carTriangles = 0;
  const scale = new THREE.Vector3();
  model.traverse(o => {
    if (!o.isMesh) return;
    carTriangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    o.castShadow = !o.userData.inteiaDecal && o.geometry.boundingSphere.radius * o.getWorldScale(scale).x > .09;
    o.receiveShadow = true;
  });
  const blobMaterial = new THREE.MeshBasicMaterial({map: radialTexture(), color: '#000', transparent: true, depthWrite: false, opacity: .85});
  const contacts = new THREE.Group();
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 6.6), blobMaterial);
  blob.rotation.x = -Math.PI / 2; blob.position.y = .004; contacts.add(blob);
  for (const w of mechanics.wheels) {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.62, .86), blobMaterial);
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(w.pivot.position.x, .006, w.pivot.position.z); contacts.add(shadow);
  }
  contacts.renderOrder = 1;
  scene.add(contacts);
  const choreo = createChoreo({model, mechanics, mobile, scene});
  const wheelBlur = createWheelBlur({THREE, mechanics});
  const sparks = createSparks({THREE, renderer, mobile});
  scene.add(sparks.object);

  // Pós: ordem de post.js com o SpeedEffect entre o saneamento e DOF/bloom.
  const composer = new EffectComposer(renderer, {multisampling: 0, frameBufferType: THREE.HalfFloatType});
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new EffectPass(camera, new SanitizeEffect()));
  const speedFx = new SpeedEffect(camera, {samples: mobile ? 7 : 12, topSpeed: TRACK_TOP_SPEED, cameraBlur: SHOT === 'b'});
  composer.addPass(new EffectPass(camera, speedFx));
  const dof = mobile ? null : new DepthOfFieldEffect(camera, {focusDistance: 7, focusRange: 2.4, bokehScale: 3, resolutionScale: .6});
  const bloom = new BloomEffect({intensity: .62, luminanceThreshold: .82, luminanceSmoothing: .25, mipmapBlur: true, kernelSize: KernelSize.MEDIUM, radius: .68});
  composer.addPass(new EffectPass(camera, ...(dof ? [dof, bloom] : [bloom])));
  if (!mobile) composer.addPass(new EffectPass(camera, new ChromaticAberrationEffect({offset: new THREE.Vector2(.0007, .0005), radialModulation: true, modulationOffset: .4})));
  const noise = new NoiseEffect({blendFunction: BlendFunction.SOFT_LIGHT, premultiply: false});
  noise.blendMode.opacity.value = mobile ? .08 : .15;
  composer.addPass(new EffectPass(camera, new ToneMappingEffect({mode: ToneMappingMode.AGX}), new GradeEffect(), noise, new VignetteEffect({offset: .22, darkness: mobile ? .6 : .8})));
  composer.addPass(new EffectPass(camera, new SMAAEffect({preset: mobile ? SMAAPreset.MEDIUM : SMAAPreset.HIGH})));

  const buffer = new THREE.Vector2();
  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    wipeUniforms.uWipeRes.value.copy(renderer.getDrawingBufferSize(buffer));
  }
  addEventListener('resize', resize);
  resize();

  // ------------------------------------------------------------- tomadas
  const shake = {x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, fovKick: 0, fov: 30};
  const eye = new THREE.Vector3(), look = new THREE.Vector3(), carPoint = new THREE.Vector3(0, .45, 0), lastEye = new THREE.Vector3();
  // No retrato o quadro é estreito: o travelling lateral recua mais que as outras tomadas.
  const pull = mobile ? {a: 2.15, b: 1, c: 1.35} : {a: 1, b: 1, c: 1};
  const B_PERIOD = 2;
  function rig(time, speed) {
    let fov = 30, gain = 1, kick = 1, radial = .55, range = 3.2, bokeh = 2.6;
    if (SHOT === 'a') {
      // Travelling lateral a 0,5 m: o carrinho acompanha com uma deriva lenta, sem cortar o carro.
      eye.set(5.6 * pull.a, .5, .25 + Math.sin(time * .37) * .45);
      look.set(0, .42, .1 + Math.sin(time * .37 - .6) * .22);
      // Bokeh contido: um desfoque redondo forte apagaria os riscos do fundo.
      radial = .35; range = 3.4; bokeh = 1.3;
    } else if (SHOT === 'b') {
      // Carro-câmera à frente, rente ao chão, a 72% da velocidade: o carro alcança a lente
      // enquanto o asfalto e as luzes correm em direção a ele.
      const v = speed * TRACK_TOP_SPEED, tc = ((time % B_PERIOD) + B_PERIOD) % B_PERIOD;
      eye.set(mobile ? -1.2 : -1.6, .28, (mobile ? 52 : 48) - .28 * v * tc);
      look.set(-.2, .55, 0);
      fov = 24; gain = .6; kick = .35; radial = .9; range = 6;
    } else {
      // Acima e atrás da T-cam (entrada de ar, y≈1,2): a pista converge à frente.
      eye.set(0, 2.3, -6.3 * pull.c);
      look.set(0, .95, 5.5);
      fov = 34; gain = 1.5; kick = 1; radial = 1; range = 7;
    }
    camera.position.copy(eye);
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    speedCamera(time, speed, shake, fov);
    camera.translateX(shake.x * gain); camera.translateY(shake.y * gain); camera.translateZ(shake.z * gain);
    camera.rotateX(shake.pitch * gain); camera.rotateY(shake.yaw * gain); camera.rotateZ(shake.roll * gain);
    camera.fov = (fov + shake.fovKick * kick) * (mobile ? 1.32 : 1);
    camera.updateProjectionMatrix();
    if (lastEye.distanceTo(camera.position) > 6) speedFx.resetMotion();
    lastEye.copy(camera.position);
    speedFx.setAmount(speed, speed * radial);
    if (dof) {
      dof.cocMaterial.focusDistance = camera.position.distanceTo(carPoint);
      dof.cocMaterial.focusRange = range;
      dof.bokehScale = bokeh;
    }
  }

  let time = Number(params.get('t')) || 0, speed = SPEED;
  const pose = {explode: 0, tunnel: 0};
  function frame(dt) {
    time += dt;
    const motion = track.update(time, dt, speed);
    mechanics.update(dt, time * 1000, true);
    for (const w of mechanics.wheels) w.spinPivot.rotation.x = motion.wheelAngle;
    carLook.update(dt, time, pose);
    carLook.race(speed, BRAKE, time);
    pose.tunnel = Math.min(1, speed * 1.1);
    choreo.update(dt, time, pose);
    wheelBlur.update(speed);
    sparks.update(time, speed);
    rig(time, speed);
    renderer.info.reset();
    composer.render(dt);
    if (!hud.hidden) hud.textContent = `tomada ${SHOT} · ${Math.round(motion.velocity * 3.6)} km/h · ${renderer.info.render.calls} draw calls`;
  }

  renderer.setRenderTarget(composer.inputBuffer);
  try { await renderer.compileAsync(scene, camera); } catch { renderer.compile(scene, camera); }
  renderer.setRenderTarget(null);
  await track.ready;
  frame(0);

  const readCalls = visible => {
    track.root.visible = visible;
    renderer.info.reset();
    renderer.render(scene, camera);
    const out = {calls: renderer.info.render.calls, triangles: renderer.info.render.triangles};
    track.root.visible = true;
    return out;
  };
  window.__lab = {
    ready: true, shot: SHOT, mobile, carTriangles,
    debug: {scene, camera, track, speedFx, dof, bloom, lights: {key, rim, front, hemi, kicker}},
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt); return {time, travel: track.motion.travel}; },
    setTime(t) { time = t; lastEye.set(1e6, 0, 0); frame(0); },
    setSpeed(v) { speed = v; },
    stats() {
      const withTrack = readCalls(true), without = readCalls(false);
      renderer.info.reset(); composer.render(0);
      const pipeline = {calls: renderer.info.render.calls, triangles: renderer.info.render.triangles};
      const gl = renderer.getContext(), times = [];
      for (let i = 0; i < 90; i++) { const t0 = performance.now(); frame(1 / 60); gl.finish(); times.push(performance.now() - t0); }
      times.sort((a, b) => a - b);
      return {sceneWithTrack: withTrack, sceneWithoutTrack: without, trackCalls: withTrack.calls - without.calls, trackTriangles: withTrack.triangles - without.triangles, pipeline,
        frameMsMedian: +times[45].toFixed(2), frameMsP90: +times[81].toFixed(2), drawingBuffer: renderer.getDrawingBufferSize(new THREE.Vector2()).toArray()};
    },
    // tools/nanscan.js adaptado: cena crua num alvo float, depois cada objeto da pista escondido.
    nanscan() {
      const w = 720, h = Math.round(720 / camera.aspect);
      const rt = new THREE.WebGLRenderTarget(w, h, {type: THREE.FloatType});
      const buf = new Float32Array(w * h * 4);
      const scan = () => {
        renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
        renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf); renderer.setRenderTarget(null);
        let bad = 0, over = 0, neg = 0, sum = 0, max = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = buf[i];
          if (!Number.isFinite(v)) bad++; else if (v > 65000) over++; else if (v < -.001) neg++;
          else if ((i & 3) !== 3) { sum += v; if (v > max) max = v; }
        }
        return {bad, over, neg, mean: +(sum / (w * h * 3)).toFixed(4), max: +max.toFixed(1)};
      };
      const base = scan(), total = base.bad + base.over + base.neg, perObjectHidden = {};
      for (const o of [...track.root.children, model, sparks.object]) {
        if (!o.isMesh && !o.isPoints && o !== model) continue;
        o.visible = false;
        const k = scan();
        o.visible = true;
        if (k.bad + k.over + k.neg !== total) perObjectHidden[o.name] = k.bad + k.over + k.neg;
      }
      rt.dispose();
      return {base, perObjectHidden};
    },
  };
  document.body.dataset.ready = 'true';

  if (!MANUAL) {
    let last = performance.now();
    const loop = now => { const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now; frame(dt); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}

main().catch(error => { document.body.dataset.error = String(error?.stack || error); console.error(error); });
