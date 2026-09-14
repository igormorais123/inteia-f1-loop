import {Effect, EffectAttribute, BlendFunction} from 'postprocessing';
import {Matrix4, Uniform, Vector2, Vector3, Vector4} from 'three';

// Efeitos de velocidade para a sequência de pista (src/world/track.js).
//
// SpeedEffect(camera, {samples, topSpeed, cameraBlur, shutter, carMin, carMax})
//   Effect com profundidade. Um único laço de amostras soma dois borrões:
//   (1) obturador do mundo: cada pixel fora da caixa do carro é reprojetado como se o
//       mundo tivesse andado topSpeed·amount/60 m em +Z (o carro está parado na origem
//       e a pista corre em −Z), então asfalto, zebras e barreiras riscam e o carro fica
//       nítido; com cameraBlur a matriz anterior da câmera entra na mesma conta e o
//       efeito substitui o MotionBlurEffect de post.js (câmera presa ao chão, tomada b);
//   (2) arrasto radial em espaço de tela a partir do carro (focus projetado): zero
//       num raio em volta dele, forte nas bordas, com cauda nas luzes HDR.
//   O fundo distante (céu, alambrado transparente) usa a distância travada em farClamp
//   para a velocidade: numa coleta, é o fundo que precisa "puxar" os postes e as luzes
//   que passam na frente dele. Amostras que caem dentro da caixa do carro são descartadas,
//   então a cor do carro não vaza como halo no fundo.
//   setAmount(0..1[, radial]) controla os dois; resetMotion() após um salto de câmera.
//   Deve rodar em HDR, depois do SanitizeEffect e antes de DOF/bloom.
// speedCamera(t, amount, out?, baseFov?) -> {x, y, z, pitch, yaw, roll, fovKick, fov}
//   Função pura e determinística: tremor de pista (10–23 Hz, milímetros), balanço lento
//   (0,2–0,3 Hz) e FOV kick de até 8°. Sem `out`, reutiliza um objeto do módulo.
// createWheelBlur({THREE, mechanics}) -> {update(amount), dispose()}
//   Um disco por roda, preso ao suporte de direção (não gira), com a média dos raios da
//   roda: evita o efeito estroboscópico das rodas a 250 rad/s num quadro de 60 Hz.
// createSparks({THREE, renderer, mobile}) -> {object, update(time, amount), dispose()}
//   Faíscas curtas e raras do assoalho, 1 draw call, todo o estado no vertex shader.
//   Desligadas no celular: em tela pequena liam como tracejado no asfalto.
// Nada aqui aloca por quadro.

export const SPEED_CAMERA_LIMITS = {x: .012, y: .012, z: .006, pitch: .0025, yaw: .0025, roll: .006, fovKick: 8};
const SCRATCH = {x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, fovKick: 0, fov: 30};

export function speedCamera(t, amount, out = SCRATCH, baseFov = 30) {
  const a = amount > 0 ? Math.min(amount, 1) : 0;
  const e = a * a * (3 - 2 * a), trem = e * e, s = Math.sin;
  const time = Number.isFinite(t) ? t : 0;
  // Tremor alto e minúsculo (pista) + balanço baixo e lento (carroceria e operador); nada entre 1 e 5 Hz.
  out.x = .0045 * trem * (s(time * 61.3) * .5 + s(time * 97.1 + 1.7) * .3 + s(time * 143.9 + .4) * .2) + .006 * e * (s(time * 1.9 + .3) * .6 + s(time * 1.13 + 2.1) * .4);
  out.y = .0035 * trem * (s(time * 71.7 + .9) * .6 + s(time * 123.3) * .4) + .004 * e * s(time * 1.37 + .8);
  out.z = .003 * e * s(time * .83) + .002 * trem * s(time * 88.1 + .6);
  out.pitch = .0012 * trem * (s(time * 79.3 + .2) * .6 + s(time * 131.7 + 2) * .4) + .0009 * e * s(time * 1.61 + .4);
  out.yaw = .001 * trem * (s(time * 67.9 + 1.1) * .5 + s(time * 109.3) * .5) + .0012 * e * s(time * .97 + 1.2);
  out.roll = .0045 * e * (s(time * .71 + .5) * .7 + s(time * 1.23 + 2.3) * .3) + .0008 * trem * s(time * 57.1);
  out.fovKick = 8 * e;
  out.fov = baseFov + out.fovKick;
  return out;
}

const speedFragment = /* glsl */`
uniform mat4 uInvViewProj;
uniform mat4 uReproject;
uniform vec3 uShift;
uniform vec3 uCarMin;
uniform vec3 uCarMax;
uniform vec3 uCamPos;
uniform vec2 uCenter;
uniform vec3 uParams;    // x = arrasto radial, y = cauda das luzes, z = ativo
uniform vec3 uParams2;   // x = distância travada do fundo (m), y = risco máximo (uv)
vec3 speedWorld(vec2 st, float d){
  vec4 w = uInvViewProj * vec4(st * 2. - 1., min(d, .9999) * 2. - 1., 1.);
  return w.xyz / w.w;
}
bool speedInCar(vec3 p){ return all(greaterThan(p, uCarMin)) && all(lessThan(p, uCarMax)); }
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor){
  if(uParams.z < .5){ outputColor = inputColor; return; }
  vec3 p = speedWorld(uv, depth);
  // O carro é o assunto: como num panorâmico que o acompanha, fica nítido mesmo com a câmera no chão.
  if(speedInCar(p)){ outputColor = inputColor; return; }
  vec3 ray = p - uCamPos;
  float dist = length(ray);
  vec3 pv = uCamPos + ray * (min(dist, uParams2.x) / max(dist, 1e-4));
  vec2 vel = vec2(0.);
  vec4 prev = uReproject * vec4(pv + uShift, 1.);
  if(prev.w > 1e-4) vel = uv - (prev.xy / prev.w * .5 + .5);
  // Céu: risca por inteiro quando só o mundo anda (é ele que puxa os postes); com a câmera
  // em movimento o risco fica curto, senão um flare no céu vira mancha oval.
  float maxLen = depth >= .9999 ? uParams2.y * uParams2.z : uParams2.y;
  float len = length(vel);
  if(len > maxLen) vel *= maxLen / len;
  vec2 rel = (uv - uCenter) * vec2(aspect, 1.);
  float mask = smoothstep(.17, .7, length(rel));
  vec2 radial = (uv - uCenter) * uParams.x * mask;
  float rl = length(radial);
  // Arrasto radial curto: longo, uma linha fina e clara vira degraus (uma cópia por amostra).
  if(rl > .035) radial *= .035 / rl;
  if(dot(vel, vel) + rl * rl < 4e-7){ outputColor = inputColor; return; }
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
  vec3 sum = inputColor.rgb, trail = vec3(0.);
  float weight = 1.;
  for(int i = 0; i < SAMPLES; i++){
    float t = (float(i) + jitter) / float(SAMPLES);
    vec2 st = uv + vel * (t - .5) - radial * t;
    // Amostra que cai no carro não entra no fundo: sem halo da pintura em volta dele.
    if(speedInCar(speedWorld(st, readDepth(st)))) continue;
    vec3 s = textureLod(inputBuffer, st, 0.).rgb;
    sum += s; weight += 1.;
    float l = dot(s, vec3(.2126, .7152, .0722));
    trail = max(trail, s * smoothstep(1., 5., l) * (1. - t));
  }
  outputColor = vec4(sum / weight + trail * uParams.y * mask, inputColor.a);
}`;

export class SpeedEffect extends Effect {
  constructor(camera, {samples = 12, topSpeed = 80, cameraBlur = false, shutter = 1, carMin = [-1.05, .012, -2.75], carMax = [1.05, 1.3, 2.75]} = {}) {
    super('SpeedEffect', speedFragment, {
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.NORMAL,
      defines: new Map([['SAMPLES', String(Math.max(3, samples | 0))]]),
      uniforms: new Map([
        ['uInvViewProj', new Uniform(new Matrix4())], ['uReproject', new Uniform(new Matrix4())],
        ['uShift', new Uniform(new Vector3())], ['uCarMin', new Uniform(new Vector3(...carMin))], ['uCarMax', new Uniform(new Vector3(...carMax))],
        ['uCamPos', new Uniform(new Vector3())],
        // Escalares em Vector3: Uniform compartilha a forma com os que guardam matrizes, e um double
        // escrito direto em .value viraria um HeapNumber novo a cada quadro.
        ['uCenter', new Uniform(new Vector2(.5, .5))], ['uParams', new Uniform(new Vector3(0, .45, 0))], ['uParams2', new Uniform(new Vector3(30, .085, 0))],
      ]),
    });
    this.camera = camera;
    this.topSpeed = topSpeed;
    this.cameraBlur = cameraBlur;
    this.shutter = shutter;
    this.radialGain = .11;
    this.farClamp = 30;
    this.maxStreak = .085;
    this.focus = new Vector3(0, .45, 0);
    this.amount = 0;
    this.radial = 0;
    this.fresh = true;
    this._viewProj = new Matrix4();
    this._previous = new Matrix4();
    this._clip = new Vector4();
  }
  set mainCamera(value) { this.camera = value; }
  get mainCamera() { return this.camera; }
  setAmount(amount, radial = amount) {
    this.amount = amount > 0 ? Math.min(amount, 1) : 0;
    this.radial = radial > 0 ? Math.min(radial, 1) : 0;
  }
  resetMotion() { this.fresh = true; }
  update() {
    const camera = this.camera, u = this.uniforms;
    if (!camera) return;
    const viewProj = this._viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    u.get('uInvViewProj').value.copy(viewProj).invert();
    const reproject = u.get('uReproject').value;
    if (this.cameraBlur) {
      if (this.fresh) { this._previous.copy(viewProj); this.fresh = false; }
      reproject.copy(this._previous);
      this._previous.copy(viewProj);
    } else reproject.copy(viewProj);
    u.get('uShift').value.set(0, 0, this.amount * this.topSpeed / 60 * this.shutter);
    u.get('uCamPos').value.setFromMatrixPosition(camera.matrixWorld);
    const params = u.get('uParams').value;
    params.x = this.radial * this.radial * this.radialGain;
    params.z = this.amount > 0 || this.radial > 0 || this.cameraBlur ? 1 : 0;
    const params2 = u.get('uParams2').value;
    params2.x = this.farClamp;
    params2.y = this.maxStreak;
    // Céu sem profundidade: travelling lateral risca por inteiro; olhando ao longo da pista, a
    // distância travada daria vetores radiais enormes e cada luz no céu viraria um traço solto.
    const lateral = 1 - Math.abs(camera.matrixWorld.elements[10]) * 1.15;
    params2.z = Math.min(this.cameraBlur ? .1 : 1, Math.max(.06, lateral));
    const c = this._clip.set(this.focus.x, this.focus.y, this.focus.z, 1).applyMatrix4(viewProj);
    if (c.w > .01) u.get('uCenter').value.set(c.x / c.w * .5 + .5, c.y / c.w * .5 + .5);
  }
}

// ------------------------------------------------------------- rodas
export function createWheelBlur({THREE, mechanics}) {
  // Roda a 250 rad/s num quadro parado: raios em média quase opacos (nada de raio nítido por
  // trás) e arcos de giro, reflexos do raio arrastados ao longo do círculo que somem na cauda.
  const size = 256, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  {
    const g = canvas.getContext('2d'), c = size / 2;
    let seed = 4243;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    const base = g.createRadialGradient(c, c, 0, c, c, c);
    base.addColorStop(0, 'rgba(118,120,124,1)'); base.addColorStop(.1, 'rgba(78,80,84,.98)'); base.addColorStop(.18, 'rgba(30,31,34,.95)');
    base.addColorStop(.84, 'rgba(36,37,40,.94)'); base.addColorStop(.9, 'rgba(92,94,98,.97)'); base.addColorStop(.965, 'rgba(66,68,71,1)'); base.addColorStop(1, 'rgba(20,20,22,0)');
    g.fillStyle = base; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    g.lineCap = 'round';
    // Arcs carry the read of spin at night: brighter and denser than a daylight rim would need.
    for (let k = 0; k < 90; k++) {
      const r = (.2 + random() * .72) * c, a0 = random() * Math.PI * 2, span = .5 + random() * 1.8;
      const v = 170 + random() * 80 | 0, width = .6 + random() * 1.8, alpha = .14 + random() * .3;
      g.lineWidth = width;
      for (let s = 0; s < 10; s++) {
        g.strokeStyle = `rgba(${v},${v},${v + 4},${(alpha * (1 - s / 10)).toFixed(3)})`;
        g.beginPath(); g.arc(c, c, r, a0 + span * s / 10, a0 + span * (s + 1) / 10); g.stroke();
      }
    }
    g.strokeStyle = 'rgba(150,152,156,.35)'; g.lineWidth = size * .02; g.beginPath(); g.arc(c, c, c * .925, 0, Math.PI * 2); g.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.center.set(.5, .5);
  // Less metal and a faint emissive copy of the arcs: in a dark environment a metal disc read as a black cover.
  const material = new THREE.MeshStandardMaterial({map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: .05, transparent: true, depthWrite: false, metalness: .6, roughness: .4, envMapIntensity: 1.2, opacity: 0});
  material.name = 'Roda em movimento';
  const discs = [], box = new THREE.Box3(), inverse = new THREE.Matrix4(), part = new THREE.Box3();
  for (const w of mechanics?.wheels || []) {
    w.pivot.updateWorldMatrix(true, true);
    inverse.copy(w.pivot.matrixWorld).invert();
    box.makeEmpty();
    for (const r of w.members) r.root.traverse(o => {
      if (o.isMesh && [].concat(o.material).some(m => m.name.toLowerCase() === 'rodas')) box.union(part.setFromObject(o).applyMatrix4(inverse));
    });
    if (box.isEmpty()) continue;
    const side = Math.sign(w.pivot.position.x) || 1;
    const radius = Math.min(box.max.y - box.min.y, box.max.z - box.min.z) / 2 * .985;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 48).rotateY(side * Math.PI / 2), material);
    disc.position.set((side > 0 ? box.max.x : box.min.x) + side * .004, (box.max.y + box.min.y) / 2, (box.max.z + box.min.z) / 2);
    disc.name = 'Roda em movimento'; disc.renderOrder = 1; disc.visible = false;
    w.pivot.add(disc);
    discs.push(disc);
  }
  return {
    discs,
    update(amount) {
      const t = Math.min(1, Math.max(0, ((amount || 0) - .2) / .4));
      material.opacity = t * t * (3 - 2 * t) * .97;
      for (let i = 0; i < discs.length; i++) discs[i].visible = material.opacity > .01;
      // Os arcos giram devagar (3% do ângulo da roda): parados, liam como desenho colado no aro.
      const spin = mechanics?.wheels?.[0]?.spinPivot;
      if (spin) map.rotation = -spin.rotation.x * .03;
    },
    dispose() { for (const d of discs) { d.removeFromParent(); d.geometry.dispose(); } material.dispose(); map.dispose(); },
  };
}

// ------------------------------------------------------------ faíscas
export function createSparks({THREE, renderer, mobile = false}) {
  const count = mobile ? 1 : 56;
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(count * 4);
  let seed = 7129;
  for (let i = 0; i < seeds.length; i++) { seed = (1664525 * seed + 1013904223) >>> 0; seeds[i] = seed / 4294967296; }
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.instanceCount = count;
  const uniforms = {uTime: {value: 0}, uAmount: {value: 0}, uShutter: {value: 1 / 200}, uRes: {value: new THREE.Vector2(1440, 900)}};
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms,
    vertexShader: /* glsl */`
      uniform float uTime, uAmount, uShutter;
      uniform vec2 uRes;
      attribute vec4 aSeed;
      varying float vHeat, vAcross;
      vec3 sparkAt(float age, vec3 o, vec3 v){
        vec3 p = o + v * age + vec3(0., -4.9 * age * age, 0.);
        p.y = abs(p.y - .015) + .015;
        return p;
      }
      void main(){
        // Rajadas curtas e frequentes: a prancha toca o asfalto a cada ~0,45 s e solta um feixe que
        // dura ~0,35 s; quatro ciclos em cinco acendem, então um quadro parado quase sempre pega
        // faíscas. Continuam na frenagem (a prancha desce com o bico), apagam com o carro lento.
        const float B = .45;
        float k = floor(uTime / B);
        float age = uTime - k * B - aSeed.y * .3;
        float life = .06 + .1 * aSeed.w;
        float gate = step(.1, fract(sin(k * 91.7 + 3.1) * 43758.5453))
                   * step(.55, fract(sin(k * 12.9 + aSeed.z * 78.2) * 43758.5453))
                   * smoothstep(.12, .4, uAmount);
        vec3 o = vec3((aSeed.z - .5) * .6, .02, -1.2 - aSeed.x * .9);
        // O asfalto corre a 80 m/s: solta da prancha, a faísca fica para trás rápido e quica baixo.
        vec3 v = vec3((aSeed.w - .5) * 3., .5 + 2.2 * aSeed.y, -(16. + 26. * aSeed.z));
        vec4 ca = projectionMatrix * modelViewMatrix * vec4(sparkAt(age, o, v), 1.);
        vec4 cb = projectionMatrix * modelViewMatrix * vec4(sparkAt(max(age - uShutter, 0.), o, v), 1.);
        vHeat = clamp(1. - age / life, 0., 1.); vAcross = position.y;
        if(gate * step(0., age) * step(age, life) < .5 || ca.w < .05 || cb.w < .05){ gl_Position = vec4(0., 0., 2., 1.); return; }
        vec2 sa = ca.xy / ca.w * uRes * .5, sb = cb.xy / cb.w * uRes * .5;
        vec2 dir = sa - sb; float l = length(dir);
        dir = l > 1e-3 ? dir / l : vec2(1., 0.);
        vec4 c = position.x > .5 ? ca : cb;
        c.xy += vec2(-dir.y, dir.x) * position.y * 1.6 / uRes * c.w;
        gl_Position = c;
      }`,
    fragmentShader: /* glsl */`
      varying float vHeat, vAcross;
      void main(){
        float profile = exp(-vAcross * vAcross * 3.);
        vec3 col = mix(vec3(1., .28, .04) * 5., vec3(1., .72, .42) * 14., vHeat * vHeat);
        gl_FragColor = vec4(col * profile * (.25 + .75 * vHeat), 1.);
      }`,
  });
  const object = new THREE.Mesh(geometry, material);
  object.name = 'Faíscas do assoalho'; object.frustumCulled = false; object.renderOrder = 4; object.visible = false;
  const buffer = new THREE.Vector2();
  return {
    object,
    update(time, amount) {
      if (mobile) return;
      uniforms.uTime.value = time;
      uniforms.uAmount.value = amount > 0 ? Math.min(amount, 1) : 0;
      object.visible = uniforms.uAmount.value > .12;
      if (renderer) uniforms.uRes.value.copy(renderer.getDrawingBufferSize(buffer));
    },
    dispose() { object.removeFromParent(); geometry.dispose(); material.dispose(); },
  };
}
