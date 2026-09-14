import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {glyphs} from '../../materia-prima/modulos-atualizados/identity.js';
import {createWipeClip, WIPE_SHADER_CHUNK} from '../fx/wipe-clip.js';

// Reta de circuito à noite. O carro fica parado na origem (nariz em +Z) e o mundo
// corre em −Z à sua volta, em laço de TRACK_LOOP metros, então as câmeras da aula
// continuam sendo coordenadas do carro.
//
// Contrato: createTrack({THREE, renderer, mobile}) ->
//   {root, clip, envTexture, fog, cameraFar, motion, lights,
//    update(time, dt, speed) -> motion, dispose()}
//   - speed 0..1 (1 = TRACK_TOP_SPEED m/s). update devolve o estado de movimento
//     {travel, velocity, wheelAngle}: aplique wheelAngle em spinPivot.rotation.x das
//     quatro rodas DEPOIS de mechanics.update (mechanics reescreve a rotação).
//   - Tudo que passa pelo carro é instanciado; o deslocamento é um uniform (uTravel)
//     e o laço é feito por instância no vertex shader: nenhuma matriz é tocada por
//     quadro. root deve ficar na identidade (sem rotação nem escala).
//   - envTexture é um PMREM próprio: faixas de luz ao longo de Z (torres, cobertura
//     da arquibancada, muro e garagens dos boxes) que viram reflexos alongados na pintura.
//   - fog/cameraFar são a recomendação para a cena enquanto a pista é visível.
//   - clip é o recorte diagonal do wipe, como no túnel e no box.
//   - Luzes próprias: dois PointLights sem sombra presos às luminárias da reta (uma a cada
//     20 m, braço sobre a pista à direita). Passam pelo carro a cada 0,25 s a 80 m/s e se
//     revezam com peso cos², então a soma não pisca; a contagem é fixa.
// Asfalto: reflexos analíticos das torres, das placas de LED, do muro e das garagens dos
// boxes, calculados pelo raio refletido contra os planos dessas fontes; manchas úmidas
// de rugosidade baixa esticam os reflexos. O carro bloqueia o reflexo que passa por ele.
// Laço sem salto: um objeto de meia extensão h só troca de ponta quando |z| = LOOP/2,
// e LOOP/2 − h ≥ TRACK_VISIBLE para toda fileira (tests/track.test.mjs). Todo padrão
// procedural ao longo da pista tem período que divide o laço.

export const TRACK_LOOP = 640;
export const TRACK_VISIBLE = 150;
export const TRACK_TOP_SPEED = 80;      // m/s com speed = 1 (≈ 290 km/h)
export const WHEEL_RADIUS = .33;
const TAU = Math.PI * 2;

// Fileiras ao longo da pista (along = z + travel). As regulares têm espaçamento que divide o
// laço; as de posição explícita têm spacing null. `half` é a meia extensão em z de cada peça
// (com a folga do espaçamento irregular, quando houver).
export const TRACK_ROWS = {
  tecpro: {spacing: 1.6, half: .8},
  banner: {spacing: 12.8, half: 4.8},
  fencePost: {spacing: 4, half: 1.8},
  tower: {spacing: 80, half: 3},
  lampPost: {spacing: 20, half: .8},
  marshal: {spacing: 160, half: 1.5},
  haze: {spacing: 80, half: .5},
  stand: {spacing: 320, half: 48},
  crowd: {spacing: 320, half: 48},
  kerb: {spacing: null, half: 6},
  board: {spacing: null, half: .8},
  pitGarage: {spacing: null, half: 9},
  pitBoard: {spacing: null, half: .5},
};

/** Posição em z de um objeto nascido em `along`, depois de `travel` metros, dentro de [−loop/2, loop/2). */
export function wrapAlong(along, travel, loop = TRACK_LOOP) {
  const h = loop / 2;
  let v = (along - travel + h) % loop;
  if (v < 0) v += loop;
  return v - h;
}

/** Integrador puro do rolamento: sem alocação por passo. */
export function createTrackMotion({loop = TRACK_LOOP, topSpeed = TRACK_TOP_SPEED, wheelRadius = WHEEL_RADIUS} = {}) {
  const state = {
    travel: 0, velocity: 0, wheelAngle: 0, speed: 0,
    step(dt, speed) {
      const d = dt > 0 ? Math.min(dt, .1) : 0;
      const s = speed > 0 ? Math.min(speed, 1) : 0;   // NaN e negativos param o carro
      state.speed = s;
      state.velocity = s * topSpeed;
      state.travel += state.velocity * d;
      if (state.travel >= loop) state.travel -= loop * Math.floor(state.travel / loop);
      state.wheelAngle += state.velocity * d / wheelRadius;
      if (state.wheelAngle >= TAU) state.wheelAngle -= TAU * Math.floor(state.wheelAngle / TAU);
      return state;
    },
  };
  return state;
}

// ------------------------------------------------------------------ GLSL
const ROLL_VERTEX = /* glsl */`
#ifdef USE_INSTANCING
{
  float rz = instanceMatrix[3].z;
  float rs = mod(rz - uTravel + .5 * uLoop, uLoop) - .5 * uLoop - rz;
  transformed += inverse(mat3(instanceMatrix)) * vec3(0., 0., rs);
}
#endif`;

const FOG_UNIFORMS = THREE => ({fogColor: {value: new THREE.Color('#0b1014')}, fogNear: {value: 1}, fogFar: {value: 2000}, fogDensity: {value: .00025}});
const FOG_FRAGMENT = /* glsl */`
#include <fog_pars_fragment>
float fogAmount(){
#ifdef USE_FOG
#ifdef FOG_EXP2
  return 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
#else
  return smoothstep(fogNear, fogFar, vFogDepth);
#endif
#else
  return 0.0;
#endif
}
vec3 fogTint(){
#ifdef USE_FOG
  return fogColor;
#else
  return vec3(.0037, .005, .0069);
#endif
}`;

const NOISE_GLSL = /* glsl */`
float trHash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
// Ruído de valor periódico em y (período em células): o padrão ao longo da pista fecha o laço.
float trNoise(vec2 p, float period){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  float y0=mod(i.y,period), y1=mod(i.y+1.,period);
  return mix(mix(trHash(vec2(i.x,y0)),trHash(vec2(i.x+1.,y0)),f.x),mix(trHash(vec2(i.x,y1)),trHash(vec2(i.x+1.,y1)),f.x),f.y);
}`;

// Poças de luz das torres: esquerda em along 40+80k (x −15), direita em 80k (x +24).
const POOLS_GLSL = /* glsl */`
uniform vec3 uPoolColor;
uniform float uPoolGain;
float trPools(float along, float x, float z, float near){
  float dzL = mod(along - 40. + 40., 80.) - 40.;
  float dzR = mod(along + 40., 80.) - 40.;
  float wL = mix(1., smoothstep(25., 40., abs(z - dzL)), near);
  float wR = mix(1., smoothstep(25., 40., abs(z - dzR)), near);
  float pL = exp(-dzL*dzL/162. - (x+2.)*(x+2.)/242.);
  float pR = exp(-dzR*dzR/162. - (x-5.)*(x-5.)/242.) * .75;
  return (pL*wL + pR*wR) * uPoolGain;
}`;

// Reflexo analítico no asfalto: o raio refletido é intersectado com os planos das fontes
// (refletores a 24,4 m, cobertura da arquibancada a 17,75 m, placas de LED em x −10,58,
// faixa do muro dos boxes em x 16,4 e garagens em x 29,5). O borrão cresce com a distância
// percorrida pelo raio e com a rugosidade; a caixa do carro bloqueia o que passa por ele.
const REFLECT_GLSL = /* glsl */`
uniform vec3 uLampColor;
uniform float uReflGain, uSpecGain;
vec3 trReflect(vec3 P, vec3 nW, float rough){
  vec3 V = normalize(cameraPosition - P);
  vec3 N = normalize(mix(vec3(0., 1., 0.), nW, .5));
  vec3 R = reflect(-V, N);
  float NoV = max(V.y, 0.);
  float F = .04 + .96 * pow(1. - NoV, 5.);
  float spread = .02 + rough * rough * .8;
  float gloss = 1. / (1. + rough * rough * 30.);
  vec3 sum = vec3(0.);
  if (R.y > .002) {
    float t = (24.4 - P.y) / R.y; vec3 H = P + R * t; float w = spread * t;
    float aH = H.z + uTravel;
    float dzL = mod(aH, 80.) - 40., dzR = mod(aH + 40., 80.) - 40.;
    float sx = .7 + w, sz = 2.6 + w;
    float lamps = exp(-pow((H.x + 15.) / sx, 2.) - pow(dzL / sz, 2.)) + .8 * exp(-pow((H.x - 24.) / sx, 2.) - pow(dzR / sz, 2.));
    sum += uLampColor * lamps * 7. / (1. + w * .5);
    float t2 = (17.75 - P.y) / R.y; vec3 H2 = P + R * t2; float w2 = spread * t2 + .3;
    float a2 = mod(H2.z + uTravel, 320.) - 160.;
    float inX = smoothstep(-43.5 - w2, -42., H2.x) * (1. - smoothstep(-22.5, -21. + w2, H2.x));
    float inZ = 1. - smoothstep(46., 48. + w2, abs(a2));
    sum += vec3(1., .62, .28) * 1.1 * inX * inZ / (1. + w2 * .3);
    // Luminárias da reta (x 6,2, y 8,6, uma a cada 20 m): riscos curtos que passam rente ao carro.
    float t4 = (8.6 - P.y) / R.y; vec3 H4 = P + R * t4; float w4 = spread * t4;
    float dz4 = mod(H4.z + uTravel - 10., 20.) - 10.;
    sum += uLampColor * 6. * exp(-pow((H4.x - 6.2) / (.55 + w4), 2.) - pow(dz4 / (.25 + w4), 2.)) / (1. + w4 * .5);
  }
  if (R.x < -.002 && P.x > -10.5) {
    float t = (-10.58 - P.x) / R.x; vec3 H = P + R * t; float w = spread * t + .04;
    float inY = smoothstep(.11 - w, .11 + w, H.y) * (1. - smoothstep(1.01 - w, 1.01 + w, H.y));
    float a = H.z + uTravel;
    float cell = mod(a, 12.8);
    float inZ = smoothstep(1.6 - w, 1.6 + w, cell) * (1. - smoothstep(11.2 - w, 11.2 + w, cell));
    float bi = mod(floor(a / 12.8), 50.);
    float brand = 1. - step(.5, abs(mod(bi, 3.) - 1.));
    sum += mix(vec3(.09, .012, .016), vec3(.55, .5, .5), brand) * inY * inZ / (1. + w);
  }
  if (R.x > .002 && P.x < 16.3) {
    float t = (16.4 - P.x) / R.x; vec3 H = P + R * t; float w = spread * t + .02;
    float strip = smoothstep(.99 - w, 1.01, H.y) * (1. - smoothstep(1.07, 1.09 + w, H.y));
    float c = mod(H.z + uTravel, 6.4);
    float dash = smoothstep(.2 - w, .2 + w, c) * (1. - smoothstep(4.6 - w, 4.6 + w, c));
    sum += vec3(.8, .9, 1.) * 1.7 * strip * mix(dash, .69, clamp(w * 2., 0., 1.));
    float t3 = (29.5 - P.x) / R.x; vec3 H3 = P + R * t3; float w3 = spread * t3 + .1;
    float a3 = mod(H3.z + uTravel, 640.);
    float inPit = 1. - smoothstep(288., 288. + w3, a3);
    float c3 = mod(a3, 18.);
    float open = smoothstep(2. - w3, 2. + w3, c3) * (1. - smoothstep(16. - w3, 16. + w3, c3))
               * smoothstep(.1 - w3, .1 + w3, H3.y) * (1. - smoothstep(4.6 - w3, 4.6 + w3, H3.y));
    sum += vec3(1., .88, .7) * 1.3 * open * inPit * smoothstep(1.1, 1.35, H.y) / (1. + w3 * .5);
  }
  // Arquibancada iluminada (face em x ≈ −30, degraus de 2 a 13 m): brilho quente e manchado que
  // os trechos úmidos esticam; é ela que o carro recorta no reflexo da tomada lateral.
  // Fonte larga: no asfalto seco ela só borra, não some (energia de área, não de ponto).
  vec3 wide = vec3(0.);
  if (R.x < -.002 && R.y > .002) {
    float t5 = (-30. - P.x) / R.x; vec3 H5 = P + R * t5; float w5 = spread * t5 + .5;
    float a5 = mod(H5.z + uTravel, 320.) - 160.;
    float inZ5 = 1. - smoothstep(44. - w5, 48. + w5, abs(a5));
    float inY5 = smoothstep(2. - w5, 3. + w5, H5.y) * (1. - smoothstep(11. - w5, 13. + w5, H5.y));
    float mottle = .55 + .45 * trNoise(vec2(H5.y * .6, a5 * .3), 64.);
    float wash = .6 + .4 * cos((a5 + 40.) * .0785398);
    wide += vec3(.62, .46, .32) * inZ5 * inY5 * mottle * wash / (1. + w5 * .25);
  }
  vec3 safe = R + vec3(1e-5) * step(abs(R), vec3(1e-5));
  vec3 t0 = (vec3(-.95, 0., -2.6) - P) / safe, t1 = (vec3(.95, 1.05, 2.6) - P) / safe;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  float enter = max(max(tmin.x, tmin.y), tmin.z), leave = min(min(tmax.x, tmax.y), tmax.z);
  // O raio que bate no carro só apaga as luzes atrás dele: silhueta escura, borda macia pela corda
  // percorrida dentro da caixa (sem retângulo) e quebrada pela normal do agregado.
  float hit = smoothstep(0., .5, leave - max(enter, 0.));
  float yHit = P.y + R.y * max(enter, 0.);
  vec3 carSeen = mix(vec3(.002, .002, .0025), vec3(.022, .003, .004), smoothstep(.25, .5, yHit));
  sum = mix(sum, carSeen, hit);
  wide *= 1. - hit;
  return (sum * gloss + wide / (1. + rough * rough * 4.)) * F * uReflGain;
}
// Especular de microfaceta das luminárias da reta e das torres: em visão rasante sobre asfalto
// rugoso, cada lâmpada vira uma faixa longa na direção da lente, quebrada pela normal e pela
// rugosidade do agregado. As fontes andam com a pista, então nada acompanha a câmera.
float trGGX(vec3 P, vec3 N, vec3 V, vec3 Lp, float a2){
  vec3 L = Lp - P; float d2 = dot(L, L); L *= inversesqrt(d2);
  vec3 H = normalize(L + V);
  float NoL = max(dot(N, L), 0.), NoH = max(dot(N, H), 0.), NoV = max(dot(N, V), .02);
  float q = NoH * NoH * (a2 - 1.) + 1.;
  float k = sqrt(a2) * .5;
  float G = NoL / (NoL * (1. - k) + k) / (NoV * (1. - k) + k);
  float Fr = .04 + .96 * pow(1. - max(dot(V, H), 0.), 5.);
  return a2 / (3.14159 * q * q) * G * Fr * .25 / d2;
}
vec3 trLampSpec(vec3 P, vec3 N, float rough){
  vec3 V = normalize(cameraPosition - P);
  float a = max(rough * rough, .03), a2 = a * a;
  float along = P.z + uTravel;
  float dz = mod(along - 10., 20.) - 10.;
  float dzL = mod(along, 80.) - 40., dzR = mod(along + 40., 80.) - 40.;
  float posts = 0., towers = 0.;
  for (int k = -2; k <= 2; k++) posts += trGGX(P, N, V, vec3(6.2, 8.6, P.z - dz + 20. * float(k)), a2);
  for (int k = -1; k <= 1; k++) {
    towers += trGGX(P, N, V, vec3(-15., 24.4, P.z - dzL + 80. * float(k)), a2);
    towers += .8 * trGGX(P, N, V, vec3(24., 24.4, P.z - dzR + 80. * float(k)), a2);
  }
  // Teto baixo: acima disso a lâmpada sobre a roda virava um lóbulo branco saturado.
  return min(uLampColor * (posts * 80. + towers * 1100.) * uSpecGain, vec3(2.2));
}`;

// Luz das luminárias da reta no chão (as duas mais próximas em z) e sombra de contato do carro
// parado na origem: caixa do assoalho e os quatro pneus (caixas do GLB).
const CONTACT_GLSL = /* glsl */`
float trSweep(vec3 P){
  float dz = mod(P.z + uTravel - 10., 20.) - 10.;
  float e = 0.;
  for (int k = 0; k < 2; k++) {
    float z = k == 0 ? dz : dz - sign(dz) * 20.;
    vec3 L = vec3(6.2 - P.x, 8.6 - P.y, -z);
    float d2 = dot(L, L);
    e += L.y / (d2 * sqrt(d2));
  }
  return e;
}
float trContact(vec3 P){
  vec2 q = abs(P.xz - vec2(0., -.72)) - vec2(.8, 1.8);
  float d = length(max(q, 0.)) + min(max(q.x, q.y), 0.);
  // Núcleo quase preto sob o assoalho e uma penumbra larga; sob os pneus, contato duro e escuro.
  float body = 1. - .9 * (1. - smoothstep(-.45, .9, d));
  vec2 f = vec2(abs(P.x) - .743, P.z - 1.52) / vec2(.26, .4);
  vec2 r = vec2(abs(P.x) - .72, P.z + 1.84) / vec2(.28, .44);
  float tyres = 1. - .95 * exp(-dot(f, f) * 1.8) - .95 * exp(-dot(r, r) * 1.8);
  return body * clamp(tyres, .04, 1.);
}`;

// ------------------------------------------------------------ texturas
function rng(seed) { return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }; }

function periodicNoise(size, cells, seed) {
  const r = rng(seed), lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = r();
  return (x, y) => {
    const fx = x / size * cells, fy = y / size * cells, ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const x0 = ix % cells, y0 = iy % cells, x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
    const a = lattice[y0 * cells + x0], b = lattice[y0 * cells + x1], c = lattice[y1 * cells + x0], d = lattice[y1 * cells + x1];
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  };
}

// Microtextura do asfalto (ladrilho de 4 m): agregado, vazios do ligante e altura para a normal.
function asphaltTextures(THREE, size) {
  const r = rng(7331), n = size * size;
  const height = new Float32Array(n), albedo = new Float32Array(n), rough = new Float32Array(n);
  const low = periodicNoise(size, 12, 11), mid = periodicNoise(size, 48, 23);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, l = low(x, y), m = mid(x, y), g = r();
    height[i] = .35 * m + .15 * g;
    albedo[i] = .42 + .18 * l + .12 * m + .16 * (g - .5);
    rough[i] = .5 + .25 * (m - .5);
  }
  const stones = Math.round(n / 26);
  for (let s = 0; s < stones; s++) {
    const cx = r() * size, cy = r() * size, rad = .7 + r() * r() * 2.6 * size / 1024, tone = r(), lift = .45 + r() * .55;
    const R = Math.ceil(rad);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx, dy) / rad;
      if (d > 1) continue;
      const px = ((Math.floor(cx) + dx) % size + size) % size, py = ((Math.floor(cy) + dy) % size + size) % size, i = py * size + px;
      const dome = Math.sqrt(1 - d * d);
      height[i] = Math.max(height[i], .45 + dome * lift * .55);
      albedo[i] = albedo[i] * .35 + (.3 + tone * .7) * .65;
      rough[i] = .35 + .25 * tone;
    }
  }
  for (let s = 0; s < n / 90; s++) {
    const i = Math.floor(r() * n);
    height[i] *= .3; albedo[i] *= .35; rough[i] = .9;
  }
  const colorCanvas = document.createElement('canvas'), normalCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = normalCanvas.width = normalCanvas.height = size;
  const cctx = colorCanvas.getContext('2d'), nctx = normalCanvas.getContext('2d');
  const cimg = cctx.createImageData(size, size), nimg = nctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, o = i * 4;
    const v = Math.max(0, Math.min(1, albedo[i]));
    cimg.data[o] = v * 255; cimg.data[o + 1] = height[i] * 255; cimg.data[o + 2] = Math.max(0, Math.min(1, rough[i])) * 255; cimg.data[o + 3] = 255;
    const sx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const sy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    const k = 2.2, nx = -sx * k, ny = sy * k, len = Math.hypot(nx, ny, 1);
    nimg.data[o] = (nx / len * .5 + .5) * 255; nimg.data[o + 1] = (ny / len * .5 + .5) * 255; nimg.data[o + 2] = (1 / len * .5 + .5) * 255; nimg.data[o + 3] = 255;
  }
  cctx.putImageData(cimg, 0, 0); nctx.putImageData(nimg, 0, 0);
  const make = canvas => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; t.colorSpace = THREE.NoColorSpace;
    return t;
  };
  return {data: make(colorCanvas), normal: make(normalCanvas)};
}

// Ladrilho de 16 × 32 m: R = selante de trincas (tar snakes), G = remendos, B = marcas de pneu.
function detailTexture(THREE, w, h) {
  const r = rng(4242), mpx = w / 16;
  const layer = draw => { const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); draw(ctx); return ctx.getImageData(0, 0, w, h).data; };
  const wrapStroke = (ctx, path) => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { ctx.save(); ctx.translate(ox, oy); path(); ctx.stroke(); ctx.restore(); } };
  const tar = layer(ctx => {
    ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let k = 0; k < 26; k++) {
      let x = r() * w, y = r() * h, a = r() * TAU;
      const pts = [[x, y]];
      for (let s = 0; s < 14 + r() * 30; s++) { a += (r() - .5) * 1.4; x += Math.cos(a) * mpx * .35; y += Math.sin(a) * mpx * .35; pts.push([x, y]); }
      ctx.lineWidth = Math.max(1, mpx * (.04 + r() * .05));
      ctx.globalAlpha = .55 + r() * .45;
      wrapStroke(ctx, () => { ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); });
    }
  });
  const patch = layer(ctx => {
    for (let k = 0; k < 7; k++) {
      const pw = mpx * (1.5 + r() * 4), ph = mpx * (2 + r() * 6), x = r() * w, y = r() * h;
      ctx.globalAlpha = .4 + r() * .5; ctx.fillStyle = '#fff'; ctx.filter = 'blur(1px)';
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) ctx.fillRect(x + ox, y + oy, pw, ph);
    }
    ctx.filter = 'none';
  });
  // Marcas de pneu: pares de riscos na trajetória e borracha espalhada nas saídas.
  const skid = layer(ctx => {
    ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
    for (let k = 0; k < 9; k++) {
      const x0 = w / 2 + (r() - .5) * mpx * 7, y0 = r() * h, len = mpx * (5 + r() * 20), bend = (r() - .5) * mpx * 1.2, gap = mpx * 1.52;
      for (const side of [-.5, .5]) {
        ctx.lineWidth = mpx * (.22 + r() * .12); ctx.globalAlpha = .45 + r() * .45;
        wrapStroke(ctx, () => { ctx.beginPath(); ctx.moveTo(x0 + side * gap, y0); ctx.bezierCurveTo(x0 + side * gap + bend, y0 + len * .35, x0 + side * gap - bend, y0 + len * .7, x0 + side * gap + bend * .4, y0 + len); });
      }
    }
  });
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h * 4; i += 4) { img.data[i] = tar[i]; img.data[i + 1] = patch[i]; img.data[i + 2] = skid[i]; img.data[i + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace;
  return t;
}

const BOARD_FONT = 'TrackBoard';
const ATLAS = {
  w: 2048, h: 1024,
  brand: [0, 0, 2048, 192], plain: [0, 208, 2048, 192],
  boards: [[0, 420, 600, 430], [712, 420, 600, 430], [1424, 420, 600, 430]],
  pit: Array.from({length: 16}, (_, i) => [i * 128, 866, 128, 64]),
  marshal: [0, 940, 240, 80],
};
const rect = ([x, y, w, h]) => [x / ATLAS.w, 1 - (y + h) / ATLAS.h, w / ATLAS.w, h / ATLAS.h];

function drawAtlas(ctx, scale) {
  const S = v => v * scale;
  const font = px => `${S(px)}px ${BOARD_FONT}, "Bebas Neue", "Arial Narrow", Impact, sans-serif`;
  ctx.clearRect(0, 0, S(ATLAS.w), S(ATLAS.h));
  // Faixa com a marca: fundo grafite e nome, nada além disso.
  const [bx, by, bw, bh] = ATLAS.brand.map(S);
  ctx.fillStyle = '#101417'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(bx, by + S(10), bw, S(2)); ctx.fillRect(bx, by + bh - S(12), bw, S(2));
  const k = S(1.22), logoW = 390 * k, ox = bx + (bw - logoW) / 2, oy = by + (bh - 96 * k) / 2;
  ctx.save(); ctx.translate(ox, oy); ctx.scale(k, k);
  ctx.translate(18, 16); ctx.transform(1, 0, -Math.tan(12 * Math.PI / 180), 1, 0, 0);
  for (const [, d, accent] of glyphs) { ctx.fillStyle = accent ? '#d92135' : '#e8ebed'; ctx.fill(new Path2D(d), 'evenodd'); }
  ctx.restore();
  // Faixa lisa: grafite com um fio vermelho.
  const [px, py, pw, ph] = ATLAS.plain.map(S);
  ctx.fillStyle = '#14181b'; ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = '#7a1520'; ctx.fillRect(px, py + ph - S(30), pw, S(5));
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Placas de frenagem.
  ['300', '200', '100'].forEach((label, i) => {
    const [x, y, w, h] = ATLAS.boards[i].map(S);
    ctx.fillStyle = '#0b0d0f'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#e8ebed'; ctx.lineWidth = S(14); ctx.strokeRect(x + S(24), y + S(24), w - S(48), h - S(48));
    ctx.fillStyle = '#e8ebed'; ctx.font = font(300);
    ctx.fillText(label, x + w / 2, y + h / 2 + S(14));
  });
  // Placas numeradas do muro dos boxes.
  ATLAS.pit.forEach((cell, i) => {
    const [x, y, w, h] = cell.map(S);
    ctx.fillStyle = '#0c0f11'; ctx.fillRect(x + S(3), y, w - S(6), h);
    ctx.fillStyle = '#9aa3a9'; ctx.fillRect(x + S(3), y, w - S(6), S(3));
    ctx.fillStyle = '#dfe4e7'; ctx.font = font(50);
    ctx.fillText(String(i + 1).padStart(2, '0'), x + w / 2, y + h / 2 + S(4));
  });
  // Posto de fiscal: painel de LED âmbar e a janela acesa da cabine.
  const [mx, my, mw, mh] = ATLAS.marshal.map(S);
  ctx.fillStyle = '#050607'; ctx.fillRect(mx, my, mw, mh);
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
    ctx.fillStyle = '#ffb04a';
    ctx.beginPath(); ctx.arc(mx + S(12 + i * 14), my + S(12 + j * 14), S(4.5), 0, TAU); ctx.fill();
  }
  const g = ctx.createLinearGradient(0, my, 0, my + mh);
  g.addColorStop(0, '#c9a77a'); g.addColorStop(1, '#5d4632');
  ctx.fillStyle = g; ctx.fillRect(mx + S(90), my + S(8), S(140), mh - S(16));
  ctx.fillStyle = '#050607';
  for (const x of [140, 188]) ctx.fillRect(mx + S(x), my + S(8), S(4), mh - S(16));
  ctx.fillRect(mx + S(100), my + S(46), S(26), S(26));
}

// --------------------------------------------------------------- pista
export function createTrack({THREE, renderer, mobile = false} = {}) {
  const root = new THREE.Group();
  root.name = 'Pista noturna';
  const clip = createWipeClip('track');
  const motion = createTrackMotion();
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const helper = new THREE.Object3D();
  const own = (set, v) => { set.add(v); return v; };
  const nonIndexed = parts => parts.map(g => g.index ? g.toNonIndexed() : g);

  // Uniforms compartilhados por todos os materiais que rolam.
  const roll = {uTravel: {value: 0}, uLoop: {value: TRACK_LOOP}, uTime: {value: 0}, uSmear: {value: 0}};
  const pools = {uPoolColor: {value: new THREE.Color('#dfe9ff')}, uPoolGain: {value: .22}};

  const rolling = (material, key) => {
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, roll);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTravel;\nuniform float uLoop;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + ROLL_VERTEX);
      material.userData.extraVertex?.(shader);
    };
    material.customProgramCacheKey = () => 'track-roll-' + key;
    return own(materials, material);
  };
  const instanced = (geometry, material, count, name) => {
    const mesh = new THREE.InstancedMesh(own(geometries, geometry), material, count);
    mesh.name = name; mesh.frustumCulled = false; root.add(mesh);
    return mesh;
  };
  const place = (mesh, i, x, y, along, {rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1} = {}) => {
    helper.position.set(x, y, along); helper.rotation.set(rx, ry, rz); helper.scale.set(sx, sy, sz); helper.updateMatrix();
    mesh.setMatrixAt(i, helper.matrix);
  };
  const rowCount = row => Math.round(TRACK_LOOP / TRACK_ROWS[row].spacing);
  const darkSteel = rolling(new THREE.MeshStandardMaterial({color: '#1c2227', roughness: .55, metalness: .6, envMapIntensity: .6}), 'dark-steel');

  // ---------------------------------------------------------------- céu
  {
    const material = own(materials, new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {uTime: roll.uTime, uHorizon: {value: new THREE.Color('#0b1014')}, uZenith: {value: new THREE.Color('#04060a')}, uGlow: {value: new THREE.Color('#ff8a2a')}},
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){
          vDir = position;
          vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.);
          gl_Position = vec4(p.xy, p.w * .99998, p.w);
        }`,
      fragmentShader: /* glsl */`
        #define SKY_LIFT ${mobile ? '1.7' : '1.0'}
        uniform vec3 uHorizon, uZenith, uGlow;
        uniform float uTime;
        varying vec3 vDir;
        ${WIPE_SHADER_CHUNK}
        float sHash(float n){return fract(sin(n*12.9898)*43758.5453);}
        float sNoise(float u, float period){float i=floor(u),f=fract(u);f=f*f*(3.-2.*f);return mix(sHash(mod(i,period)),sHash(mod(i+1.,period)),f);}
        void main(){
          wipeDiscard();
          vec3 d = normalize(vDir);
          float el = d.y;
          float u = atan(d.x, d.z) / 6.2831853 + .5;
          vec3 col = mix(uHorizon, uZenith, smoothstep(.0, .45, el));
          // Clarão da cidade: âmbar baixo e largo, frio acima, mais forte do lado da arquibancada.
          float side = .6 + .4 * smoothstep(-.2, -.9, d.x);
          float glowBand = exp(-abs(el) * 16.) * (.6 + .4 * sNoise(u * 7., 7.)) * side;
          // A faixa de cima não fica preta: clarão largo da cidade, subindo pela névoa.
          col += uGlow * glowBand * .06 * SKY_LIFT;
          col += uGlow * exp(-max(el, 0.) * 5.) * .016 * side * SKY_LIFT;
          col += vec3(.45, .6, .8) * exp(-abs(el) * 34.) * .014;
          // Silhueta distante, próxima do tom do horizonte: a névoa a dissolve, não recorta.
          float h = .004 + .011 * sNoise(u * 38., 38.) + .009 * step(.62, sNoise(u * 150., 150.)) * sNoise(u * 600., 600.);
          float fw = max(fwidth(el), 1e-5);
          float sil = 1. - smoothstep(h - fw * 2., h + fw * 2., el);
          col = mix(col, uHorizon * .8 + uGlow * .012, sil * step(0., el));
          vec2 g = vec2(u * 2400., el * 380.);
          vec2 cell = floor(g), f = fract(g) - .5;
          float rnd = fract(sin(dot(cell, vec2(41.3, 289.1))) * 43758.5453);
          float lit = step(.972, rnd) * sil * step(.0, el);
          float dist = length(f * vec2(1., 380. / 2400. * 6.3));
          float spot = 1. - smoothstep(.06, .06 + fwidth(g.x) * 1.2, dist);
          vec3 tint = rnd > .993 ? vec3(1., .08, .1) * (.5 + .5 * step(.0, sin(uTime * 3.1 + rnd * 40.))) : mix(vec3(1., .62, .3), vec3(.75, .86, 1.), step(.982, rnd));
          // Abaixo do limiar da cauda de luz do SpeedEffect: em HDR, cada janela riscada virava um palito.
          col += tint * lit * spot * .55;
          gl_FragColor = vec4(col, 1.);
        }`,
    }));
    const sky = new THREE.Mesh(own(geometries, new THREE.SphereGeometry(1, 48, 24)), material);
    sky.name = 'Céu'; sky.frustumCulled = false; sky.renderOrder = -10;
    root.add(sky);
  }

  // --------------------------------------------------------------- solo
  const texSize = mobile ? 512 : 1024;
  const asphalt = asphaltTextures(THREE, texSize);
  const detail = detailTexture(THREE, mobile ? 256 : 512, mobile ? 512 : 1024);
  textures.add(asphalt.data); textures.add(asphalt.normal); textures.add(detail);
  const reflect = {uLampColor: {value: new THREE.Color('#e4ecff')}, uReflGain: {value: .55}, uSpecGain: {value: 1}};
  {
    const material = new THREE.MeshStandardMaterial({color: '#ffffff', roughness: 1, metalness: 0, envMapIntensity: .15});
    const groundUniforms = {uAsphalt: {value: asphalt.data}, uAsphaltN: {value: asphalt.normal}, uDetail: {value: detail}};
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, roll, pools, reflect, groundUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTrackW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTrackW = (modelMatrix * vec4(transformed, 1.)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vTrackW;
uniform float uTravel, uSmear;
uniform sampler2D uAsphalt, uAsphaltN, uDetail;
${NOISE_GLSL}
${POOLS_GLSL}
${REFLECT_GLSL}
${CONTACT_GLSL}
float trBand(float x, float a, float b, float fw){return smoothstep(a-fw,a+fw,x)-smoothstep(b-fw,b+fw,x);}
float trRough, trWet; vec2 trUv, trGx, trGy; float trTrack, trRun, trLine, trGrass; vec3 trNW = vec3(0., 1., 0.);`)
        .replace('#include <map_fragment>', /* glsl */`
{
  float x = vTrackW.x, along = vTrackW.z + uTravel;
  trUv = vec2(x, along) * .25;
  trGx = dFdx(trUv); trGy = dFdy(trUv);
  // Desfoque de obturador na própria amostragem: o gradiente cresce ao longo da pista.
  float s = uSmear * .25;
  if (abs(trGx.y) > abs(trGy.y)) trGx.y += trGx.y < 0. ? -s : s; else trGy.y += trGy.y < 0. ? -s : s;
  vec4 agg = textureGrad(uAsphalt, trUv, trGx, trGy);
  vec4 det = texture(uDetail, vec2((x + 8.) / 16., along / 32.));
  float fw = max(fwidth(x), 1e-3);
  trLine = trBand(x, -6.4, -6.2, fw) + trBand(x, 8.2, 8.4, fw);
  trTrack = trBand(x, -6.2, 8.2, fw);
  trRun = trBand(x, -10.6, -6.4, fw) + trBand(x, 8.4, 16.4, fw);
  trGrass = clamp(1. - trLine - trTrack - trRun, 0., 1.);
  float lowN = trNoise(vec2(x * .25, along * .125), 80.);
  float midN = trNoise(vec2(x * 1.3, along * .5), 320.);
  // Estrias do agregado: finas através da pista (0,05–0,15 m) e longas ao longo dela, então
  // sobrevivem ao arrasto como riscos de tom e rugosidade e não cintilam com o mundo correndo.
  // Cada oitava some antes de ficar menor que um pixel.
  float fx = fwidth(x);
  float st1 = mix(.5, trNoise(vec2(x * 7., along * .15), 96.), 1. - smoothstep(.25, .6, fx * 7.));
  float st2 = mix(.5, trNoise(vec2(x * 20., along * .4), 256.), 1. - smoothstep(.25, .6, fx * 20.));
  float streak = .55 * st1 + .45 * st2;
  // Manchas úmidas: rugosidade baixa onde o reflexo das luzes se estica.
  float wetN = .7 * trNoise(vec2(x * .2, along * .1), 64.) + .3 * trNoise(vec2(x * .9, along * .5), 320.);
  trWet = smoothstep(.5, .66, wetN) * (trTrack + .6 * trRun + .5 * trLine);
  float racing = exp(-x * x / 5.1);
  float grooves = exp(-pow((abs(x) - .76) / .22, 2.));
  float tar = det.r * trTrack, repair = det.g, skid = det.b * trTrack;
  // Asfalto velho à noite: albedo ≈ .02, porque o AgX do pós levanta o preto.
  vec3 road = vec3(.02, .021, .023) * (.4 + 1.2 * agg.r) * (.8 + .4 * lowN) * (.6 + .8 * streak);
  road *= 1. - .35 * racing - .25 * grooves * (.6 + .4 * midN);
  road = mix(road, road * vec3(1.25, 1.22, 1.18), repair * .6);
  road *= (1. - .7 * tar) * (1. - .8 * skid);
  road *= 1. - .35 * trWet;
  vec3 runoff = vec3(.036, .037, .039) * (.5 + agg.r) * (.88 + .24 * lowN) * (1. - .3 * trWet);
  float wear = smoothstep(.3, .8, trNoise(vec2(x * 6., along * 3.), 1920.));
  vec3 paint = mix(vec3(.4, .41, .4) * (.8 + .3 * agg.r), road * 1.6, wear * .35);
  vec3 grass = vec3(.01, .015, .011) * (.6 + .8 * agg.r);
  diffuseColor.rgb *= road * trTrack + runoff * trRun + paint * trLine + grass * trGrass;
  // Rugosidade variável: a trajetória polida e as estrias mais lisas seguram a faixa de luz.
  trRough = .78 - .22 * racing - .1 * grooves + .22 * (agg.b - .5) - .36 * (streak - .5);
  trRough = mix(trRough, .28, tar);
  trRough = mix(trRough, .7, skid * .6);
  trRough = mix(trRough, .6, trLine);
  trRough = mix(trRough, .1 + .12 * agg.b - .12 * (streak - .5), trWet);
  trRough = mix(trRough, .97, trGrass);
  trRough = clamp(trRough, .06, 1.);
}`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = trRough;')
        .replace('#include <normal_fragment_maps>', /* glsl */`
{
  vec3 tn = textureGrad(uAsphaltN, trUv, trGx, trGy).xyz * 2. - 1.;
  float k = (.7 * trTrack + .9 * trRun + .3 * trLine + .5 * trGrass) * (1. - .75 * trWet);
  trNW = normalize(vec3(tn.x * k, 1., -tn.y * k));
  normal = normalize((viewMatrix * vec4(trNW, 0.)).xyz);
}`)
        // As direcionais da cena foram afinadas para o carro e lavariam o chão por igual; no asfalto
        // elas descem, as poças das torres dão o ritmo e os reflexos analíticos dão o brilho.
        .replace('#include <lights_fragment_end>', /* glsl */`#include <lights_fragment_end>
float trAO = trContact(vTrackW);
reflectedLight.directDiffuse *= .12 * trAO;
// Sem lóbulo especular das direcionais: no asfalto molhado ele virava um foco que segue a câmera.
reflectedLight.directSpecular *= .01 * trAO;
reflectedLight.indirectDiffuse *= trAO;
reflectedLight.indirectSpecular *= .3 * trAO;
reflectedLight.directDiffuse += uPoolColor * (trPools(vTrackW.z + uTravel, vTrackW.x, vTrackW.z, 0.) * 4. + trSweep(vTrackW) * 110.) * material.diffuseColor * trAO;
// Reflexos também passam pela oclusão: sem ela, a borda do assoalho ganhava uma linha de luz.
float trMask = (trTrack + .7 * trRun + .8 * trLine) * trAO;
reflectedLight.indirectSpecular += trReflect(vTrackW, trNW, trRough) * trMask;
reflectedLight.directSpecular += trLampSpec(vTrackW, trNW, trRough) * trMask;`);
    };
    material.customProgramCacheKey = () => 'track-ground-v3';
    own(materials, material);
    const ground = new THREE.Mesh(own(geometries, new THREE.PlaneGeometry(140, 320, 1, 1).rotateX(-Math.PI / 2)), material);
    ground.position.x = 2; ground.name = 'Asfalto, zebras pintadas e grama'; ground.receiveShadow = true;
    root.add(ground);
  }

  // -------------------------------------------------------------- zebras
  {
    const positions = [], normals = [], colors = [];
    const red = new THREE.Color('#7e1c24'), white = new THREE.Color('#b9bcbb');
    const profile = [[0, 0], [.06, .026], [.45, .038], [1.12, .044], [1.2, 0]];
    for (let k = 0; k < 12; k++) {
      const z0 = k - 6 + .012, z1 = k - 5 - .012, c = k % 2 ? white : red;
      for (let s = 0; s < profile.length - 1; s++) {
        const [xa, ya] = profile[s], [xb, yb] = profile[s + 1];
        const nx = -(yb - ya), ny = xb - xa, len = Math.hypot(nx, ny);
        const quad = [[xa, ya, z0], [xb, yb, z1], [xb, yb, z0], [xa, ya, z0], [xa, ya, z1], [xb, yb, z1]];
        for (const [px, py, pz] of quad) { positions.push(px, py, pz); normals.push(nx / len, ny / len, 0); colors.push(c.r, c.g, c.b); }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = rolling(new THREE.MeshStandardMaterial({vertexColors: true, roughness: .5, metalness: 0, envMapIntensity: .5}), 'kerb');
    const right = [406, 418, 430, 442, 454], left = [6, 18, 30, 42, 54, 66, 470, 482, 494, 506];
    const mesh = instanced(geometry, material, right.length + left.length, 'Zebras');
    right.forEach((a, i) => place(mesh, i, 8.4, 0, a));
    left.forEach((a, i) => place(mesh, right.length + i, -6.4, 0, a, {ry: Math.PI}));
    mesh.receiveShadow = true;
  }

  // ------------------------------------------------------ barreira Tecpro
  const tecproCount = rowCount('tecpro');
  {
    const geometry = mobile ? new THREE.BoxGeometry(1, 1.1, 1.56) : new RoundedBoxGeometry(1, 1.1, 1.56, 1, .07);
    const material = rolling(new THREE.MeshStandardMaterial({color: '#ffffff', roughness: .62, metalness: 0, envMapIntensity: .5}), 'tecpro');
    const mesh = instanced(geometry, material, tecproCount, 'Barreira Tecpro');
    // Tons frios e escuros: o vermelho saturado do quadro é o carro.
    const tones = [new THREE.Color('#161b1f'), new THREE.Color('#20262b'), new THREE.Color('#161b1f'), new THREE.Color('#2a1d20')];
    for (let i = 0; i < tecproCount; i++) { place(mesh, i, -11.1, .55, i * TRACK_ROWS.tecpro.spacing); mesh.setColorAt(i, tones[i % 4]); }
    mesh.receiveShadow = true;
  }

  // ------------------------------- faixas, placas, números dos boxes e fiscais (atlas)
  const atlasCanvas = document.createElement('canvas');
  const atlasScale = mobile ? .5 : 1;
  atlasCanvas.width = ATLAS.w * atlasScale; atlasCanvas.height = ATLAS.h * atlasScale;
  const atlas = own(textures, new THREE.CanvasTexture(atlasCanvas));
  atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 8;
  const redrawAtlas = () => { drawAtlas(atlasCanvas.getContext('2d'), atlasScale); atlas.needsUpdate = true; };
  redrawAtlas();
  let fontReady = Promise.resolve();
  try {
    if (typeof FontFace !== 'undefined') {
      const face = new FontFace(BOARD_FONT, `url(${import.meta.env?.BASE_URL ?? './'}fonts/BebasNeue-Regular.woff2)`);
      document.fonts.add(face);
      fontReady = face.load().then(redrawAtlas).catch(() => {});
    }
  } catch { /* a pilha de reserva já desenhou as placas */ }
  const marshalAlong = [90, 250, 410, 570];
  const pitAlong = Array.from({length: 16}, (_, i) => 9 + i * 18);
  {
    const bannerCount = rowCount('banner'), boards = [[100, 0], [200, 1], [300, 2]];
    const total = bannerCount + boards.length + pitAlong.length + marshalAlong.length;
    const geometry = new THREE.PlaneGeometry(1, 1);
    const rects = new Float32Array(total * 4);
    // Placas de LED do perímetro: acesas, viram riscos de luz quando o mundo corre.
    const material = rolling(new THREE.MeshStandardMaterial({map: atlas, emissiveMap: atlas, emissive: '#ffffff', emissiveIntensity: .6, roughness: .72, metalness: 0, envMapIntensity: .3}), 'atlas');
    material.userData.extraVertex = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aRect;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = aRect.xy + uv * aRect.zw;\n#endif\n#ifdef USE_EMISSIVEMAP\nvEmissiveMapUv = aRect.xy + uv * aRect.zw;\n#endif');
    };
    const mesh = instanced(geometry, material, total, 'Faixas INTEIA, placas e números dos boxes');
    const brand = rect(ATLAS.brand), plain = rect(ATLAS.plain);
    let n = 0;
    for (let i = 0; i < bannerCount; i++, n++) {
      place(mesh, n, -10.58, .56, i * TRACK_ROWS.banner.spacing + 6.4, {ry: Math.PI / 2, sx: 9.6, sy: .9});
      rects.set(i % 3 === 1 ? brand : plain, n * 4);
    }
    for (const [along, cell] of boards) {
      place(mesh, n, 12.5, 1.3, along, {ry: Math.PI, sx: 1.4, sy: 1.0});
      rects.set(rect(ATLAS.boards[cell]), n * 4); n++;
    }
    pitAlong.forEach((along, i) => {
      place(mesh, n, 16.37, 1.45, along, {ry: -Math.PI / 2, sx: 1.0, sy: .5});
      rects.set(rect(ATLAS.pit[i]), n * 4); n++;
    });
    for (const along of marshalAlong) {
      place(mesh, n, -12.42, 1.55, along, {ry: Math.PI / 2, sx: 2.4, sy: .8});
      rects.set(rect(ATLAS.marshal), n * 4); n++;
    }
    geometry.setAttribute('aRect', new THREE.InstancedBufferAttribute(rects, 4));
    const backs = mergeGeometries([new THREE.BoxGeometry(1.52, 1.1, .05).translate(0, 1.3, .035), new THREE.BoxGeometry(.06, .76, .06).translate(-.5, .38, .05), new THREE.BoxGeometry(.06, .76, .06).translate(.5, .38, .05)]);
    const backMesh = instanced(backs, darkSteel, boards.length, 'Suportes das placas');
    boards.forEach(([along], k) => place(backMesh, k, 12.5, 0, along));
    // Cabines dos fiscais atrás do alambrado.
    const cabin = mergeGeometries([new THREE.BoxGeometry(2.2, 2.6, 2.6).translate(0, 1.3, 0), new THREE.BoxGeometry(2.7, .16, 3.1).translate(.15, 2.68, 0)]);
    const cabins = instanced(cabin, darkSteel, marshalAlong.length, 'Postos de fiscais');
    marshalAlong.forEach((along, k) => place(cabins, k, -13.55, 0, along));
  }

  // ---------------------------------------------------------- alambrados
  const fenceMaterial = own(materials, new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {...FOG_UNIFORMS(THREE), ...roll, ...pools},
    vertexShader: /* glsl */`
      varying vec3 vW;
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){
        vW = (modelMatrix * vec4(position, 1.)).xyz;
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * mv;
      #ifdef USE_FOG
        vFogDepth = -mv.z;
      #endif
      }`,
    fragmentShader: /* glsl */`
      uniform float uTravel;
      varying vec3 vW;
      varying vec2 vUv;
      ${FOG_FRAGMENT}
      ${WIPE_SHADER_CHUNK}
      ${POOLS_GLSL}
      void main(){
        wipeDiscard();
        float along = vW.z + uTravel;
        vec2 p = vec2(along, vW.y) / .065;
        vec2 d = vec2(p.x + p.y, p.x - p.y) * .70710678;
        vec2 fw = max(fwidth(d), vec2(1e-4));
        vec2 dist = .5 - abs(fract(d) - .5);
        // Arame de 3 mm numa malha de 65 mm: abaixo de um pixel, a linha alarga até 1 px
        // e a intensidade cai na mesma proporção (cobertura média ≈ 2·w, não uma parede).
        const float W = .025;
        vec2 ww = max(vec2(W), fw * .5);
        vec2 cov = (1. - smoothstep(ww - fw * .5, ww + fw * .5, dist)) * (W / ww);
        float c = max(cov.x, cov.y);
        float top = smoothstep(1., .97, vUv.y);
        float light = .015 + trPools(along, vW.x, vW.z, 0.) * .7;
        vec3 col = vec3(.6, .64, .68) * light;
        float fog = fogAmount();
        gl_FragColor = vec4(mix(col, fogTint(), fog), c * top * .6 * (1. - fog * .6));
      }`,
  }));
  {
    const fences = mergeGeometries([
      new THREE.PlaneGeometry(320, 4.3).rotateY(Math.PI / 2).translate(-12.1, 2.15, 0),
      new THREE.PlaneGeometry(320, 2.4).rotateY(Math.PI / 2).translate(16.65, 2.35, 0),
    ]);
    const fence = new THREE.Mesh(own(geometries, fences), fenceMaterial);
    fence.name = 'Alambrados'; fence.renderOrder = 2;
    root.add(fence);
    const posts = mergeGeometries([
      new THREE.BoxGeometry(.08, 4.5, .08).translate(0, 2.25, 0),
      new THREE.BoxGeometry(.06, .06, 1.3).rotateY(Math.PI / 2).rotateZ(-.6).translate(.5, 4.75, 0),
    ]);
    // Aço galvanizado fosco: brilhante, o braço inclinado saturava sob o refletor e ficava nítido no risco.
    const steel = rolling(new THREE.MeshStandardMaterial({color: '#2f353a', roughness: .7, metalness: .6, envMapIntensity: .4}), 'steel');
    // Espaçamento irregular (2,9 a 5,1 m): postes iguais a cada 4 m estrobam a 1,2 m por quadro.
    const count = rowCount('fencePost'), mesh = instanced(posts, steel, count, 'Postes do alambrado'), r = rng(515);
    for (let i = 0; i < count; i++) place(mesh, i, -12.15, 0, i * TRACK_ROWS.fencePost.spacing + 1 + (r() - .5) * 2.2);
    // Muro dos boxes (concreto, faixa de LED tracejada que corre) e tubos contínuos.
    const wallMaterial = new THREE.MeshStandardMaterial({color: '#2a2e31', roughness: .88, metalness: 0, envMapIntensity: .3});
    wallMaterial.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, roll);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPW = (modelMatrix * vec4(transformed, 1.)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPW;\nuniform float uTravel;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float c = mod(vPW.z + uTravel, 6.4);
  float strip = smoothstep(.99, 1.01, vPW.y) * (1. - smoothstep(1.07, 1.09, vPW.y)) * step(vPW.x, 16.42);
  totalEmissiveRadiance += vec3(.8, .9, 1.) * .4 * strip * smoothstep(.15, .25, c) * (1. - smoothstep(4.55, 4.65, c));
}`);
    };
    wallMaterial.customProgramCacheKey = () => 'track-pit-wall-v1';
    own(materials, wallMaterial);
    const wall = new THREE.Mesh(own(geometries, new THREE.BoxGeometry(.5, 1.15, 320).translate(16.65, .575, 0)), wallMaterial);
    wall.name = 'Muro dos boxes'; wall.receiveShadow = true; root.add(wall);
    const railParts = [new THREE.CylinderGeometry(.04, .04, 320, 6).rotateX(Math.PI / 2).translate(-12.1, 4.3, 0), new THREE.CylinderGeometry(.03, .03, 320, 6).rotateX(Math.PI / 2).translate(-12.1, .08, 0), new THREE.CylinderGeometry(.035, .035, 320, 6).rotateX(Math.PI / 2).translate(16.65, 3.55, 0)];
    const railMaterial = own(materials, new THREE.MeshStandardMaterial({color: '#7b848a', roughness: .38, metalness: .9, envMapIntensity: .8}));
    const rail = new THREE.Mesh(own(geometries, mergeGeometries(nonIndexed(railParts))), railMaterial);
    railParts.forEach(g => g.dispose());
    rail.name = 'Tubos dos alambrados'; root.add(rail);
  }

  // ---------------------------------------------------- garagens dos boxes
  {
    const parts = [
      new THREE.PlaneGeometry(18, 7.5).rotateY(-Math.PI / 2).translate(0, 3.75, 0),
      new THREE.BoxGeometry(12, .6, 18).translate(6, 7.8, 0),
      new THREE.BoxGeometry(2.2, .25, 18).translate(-1.1, 5.3, 0),
    ];
    const geometry = mergeGeometries(nonIndexed(parts));
    parts.forEach(g => g.dispose());
    const material = own(materials, new THREE.ShaderMaterial({
      fog: true,
      uniforms: {...FOG_UNIFORMS(THREE), ...roll},
      vertexShader: /* glsl */`
        uniform float uTravel, uLoop;
        varying vec3 vL, vN;
        varying float vSeed;
        #include <fog_pars_vertex>
        void main(){
          vec3 transformed = position;
          ${ROLL_VERTEX}
          vL = position; vN = normal; vSeed = instanceMatrix[3].z;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(transformed, 1.);
          gl_Position = projectionMatrix * mv;
        #ifdef USE_FOG
          vFogDepth = -mv.z;
        #endif
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vL, vN;
        varying float vSeed;
        ${FOG_FRAGMENT}
        ${WIPE_SHADER_CHUNK}
        void main(){
          wipeDiscard();
          vec3 col = vec3(.008, .009, .011);
          float z = vL.z, y = vL.y, fogK = .9;
          if (vN.x < -.5 && vL.x < .05) {
            if (abs(z) < 7. && y > .05 && y < 4.6) {
              // Interior aceso por cima: fundo escuro, faixas de luz no teto, bancadas, pneus e
              // montantes em silhueta. A luz atravessa a névoa mais que o concreto.
              vec3 light = mix(vec3(1., .82, .6), vec3(.78, .88, 1.), step(.62, fract(vSeed * .37)));
              float ceilingBand = smoothstep(3.9, 4.4, y) * (.5 + .5 * step(.5, fract(z * .35))) * step(.3, fract(vSeed * .61 + .2));
              float wash = .03 + .3 * smoothstep(1.5, 4.4, y) * (.6 + .4 * cos(z * .45 + vSeed));
              vec3 inside = light * (wash + .9 * ceilingBand) * (.35 + .65 * fract(vSeed * 2.9));
              float cab = step(abs(z - (-5. + 2. * fract(vSeed * 1.7))), 1.1) * step(y, 1.9);
              float tyres = step(abs(z - (4.5 - 1.5 * fract(vSeed * 2.3))), .45) * step(y, 1.3);
              float gantry = step(abs(y - 3.3), .1);
              float mullion = step(abs(abs(z) - 2.4), .09);
              col = inside * .55 * (1. - .94 * max(max(max(cab, tyres), gantry), mullion));
              fogK = .6;
            } else {
              col += vec3(.01) * step(.94, fract(y / 1.2));
              col += vec3(.9, .95, 1.) * 1.4 * smoothstep(.06, 0., abs(y - 5.05)) * step(abs(z), 8.5);
            }
          } else if (vN.y < -.5 && y < 6.) {
            float dots = smoothstep(.25, 0., length(vec2(fract(z / 3.) - .5, (vL.x + 1.1) * .8)));
            col += vec3(1., .9, .75) * .7 * dots;
          }
          gl_FragColor = vec4(mix(col, fogTint(), fogAmount() * fogK), 1.);
        }`,
    }));
    const mesh = instanced(own(geometries, geometry), material, pitAlong.length, 'Garagens dos boxes');
    pitAlong.forEach((along, i) => place(mesh, i, 29.5, 0, along));
  }

  // -------------------------------------------------- torres de iluminação
  const towerAlong = [];
  for (let k = 0; k < TRACK_LOOP / 80; k++) { towerAlong.push([-15, 40 + k * 80, -2]); towerAlong.push([24, k * 80, 5]); }
  {
    const poles = instanced(new THREE.CylinderGeometry(.18, .32, 25, mobile ? 6 : 10).translate(0, 12.5, 0), darkSteel, towerAlong.length, 'Mastros das torres');
    towerAlong.forEach(([x, a], i) => place(poles, i, x, 0, a));

    const lampCanvas = document.createElement('canvas');
    lampCanvas.width = 256; lampCanvas.height = 128;
    {
      const g = lampCanvas.getContext('2d');
      g.fillStyle = '#05070a'; g.fillRect(0, 0, 256, 128);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) {
        const cx = 22 + i * 42.4, cy = 22 + j * 42, rg = g.createRadialGradient(cx, cy, 0, cx, cy, 16);
        rg.addColorStop(0, '#ffffff'); rg.addColorStop(.5, '#cfdaf0'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg; g.fillRect(cx - 17, cy - 17, 34, 34);
      }
    }
    const lampMap = own(textures, new THREE.CanvasTexture(lampCanvas));
    lampMap.colorSpace = THREE.SRGBColorSpace;
    // O painel é contido; o brilho vem do flare por sprite (um quadrado muito claro vira halo quadrado no bloom).
    const lampMaterial = rolling(new THREE.MeshBasicMaterial({map: lampMap, color: new THREE.Color(1, 1, 1).multiplyScalar(.95)}), 'lamp');
    const frames = instanced(new THREE.BoxGeometry(5.4, 2.9, .4), darkSteel, towerAlong.length, 'Cabeças das torres');
    const lamps = instanced(new THREE.PlaneGeometry(5, 2.5).translate(0, 0, .21), lampMaterial, towerAlong.length, 'Refletores');
    const beaconMaterial = rolling(new THREE.MeshBasicMaterial({color: new THREE.Color(1, .05, .06).multiplyScalar(5)}), 'beacon');
    const beacons = instanced(new THREE.IcosahedronGeometry(.16, 0), beaconMaterial, towerAlong.length, 'Balizamento');
    const beamMaterial = own(materials, new THREE.ShaderMaterial({
      fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: {...FOG_UNIFORMS(THREE), ...roll, uGain: {value: mobile ? .03 : .04}, uColor: {value: new THREE.Color('#cfdcff')}},
      vertexShader: /* glsl */`
        uniform float uTravel, uLoop;
        varying float vLen;
        varying vec3 vN, vV;
        #include <fog_pars_vertex>
        void main(){
          vec3 transformed = position;
          ${ROLL_VERTEX}
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(transformed, 1.);
          gl_Position = projectionMatrix * mv;
          vLen = position.z;
          vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          vV = -mv.xyz;
        #ifdef USE_FOG
          vFogDepth = -mv.z;
        #endif
        }`,
      fragmentShader: /* glsl */`
        uniform float uGain;
        uniform vec3 uColor;
        varying float vLen;
        varying vec3 vN, vV;
        ${FOG_FRAGMENT}
        ${WIPE_SHADER_CHUNK}
        void main(){
          wipeDiscard();
          float facing = abs(dot(normalize(vN), normalize(vV)));
          float along = pow(1. - vLen, 1.6) * smoothstep(0., .06, vLen);
          float a = pow(facing, 3.) * along * smoothstep(14., 45., length(vV)) * uGain;
          gl_FragColor = vec4(uColor * a * (1. - fogAmount() * .8), 1.);
        }`,
    }));
    const beamGeometry = new THREE.ConeGeometry(1, 1, mobile ? 12 : 20, 1, true).translate(0, -.5, 0).rotateX(-Math.PI / 2);
    const beams = instanced(beamGeometry, beamMaterial, towerAlong.length, 'Fachos de luz');
    beams.renderOrder = 3;
    // Flare por sprite: núcleo pequeno e queda radial, mais forte quando o refletor aponta para a lente.
    const flareMaterial = own(materials, new THREE.ShaderMaterial({
      fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {...FOG_UNIFORMS(THREE), ...roll, uColor: {value: new THREE.Color('#e6eeff')}, uSize: {value: 4.5}},
      vertexShader: /* glsl */`
        uniform float uTravel, uLoop, uSize;
        varying vec2 vQ;
        varying float vFacing;
        #include <fog_pars_vertex>
        void main(){
          vec3 c = instanceMatrix[3].xyz;
          c.z = mod(c.z - uTravel + .5 * uLoop, uLoop) - .5 * uLoop;
          vec3 dir = normalize(instanceMatrix[2].xyz);
          vec3 toCam = normalize(cameraPosition - (modelMatrix * vec4(c, 1.)).xyz);
          vFacing = smoothstep(-.1, .85, dot(dir, toCam));
          vec4 mv = modelViewMatrix * vec4(c + dir * .7, 1.);
          mv.xy += position.xy * uSize;
          gl_Position = projectionMatrix * mv;
          vQ = position.xy;
        #ifdef USE_FOG
          vFogDepth = -mv.z;
        #endif
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        varying vec2 vQ;
        varying float vFacing;
        ${FOG_FRAGMENT}
        ${WIPE_SHADER_CHUNK}
        void main(){
          wipeDiscard();
          float r = length(vQ) * 2.;
          float core = exp(-r * r * 260.) * 6.;
          float glow = exp(-r * r * 14.) * .14 + exp(-r * 5.) * .035;
          float streak = exp(-abs(vQ.y) * 90.) * exp(-abs(vQ.x) * 5.) * .12;
          float a = (core + glow + streak) * (1. - smoothstep(.9, 1., r)) * (.15 + .85 * vFacing);
        #ifdef USE_FOG
          // Longe, um refletor sozinho no céu vazio vira mancha: a névoa come o flare antes da lâmpada.
          a *= 1. - .8 * smoothstep(45., 110., vFogDepth);
        #endif
          gl_FragColor = vec4(uColor * a * (1. - fogAmount() * .7), 1.);
        }`,
    }));
    const flares = instanced(new THREE.PlaneGeometry(1, 1), flareMaterial, towerAlong.length, 'Flares dos refletores');
    flares.renderOrder = 6;
    const target = new THREE.Vector3();
    towerAlong.forEach(([x, a, cx], i) => {
      helper.position.set(x, 24.4, a); helper.scale.set(1, 1, 1);
      helper.lookAt(target.set(cx, 0, a + 4)); helper.updateMatrix();
      frames.setMatrixAt(i, helper.matrix); lamps.setMatrixAt(i, helper.matrix); flares.setMatrixAt(i, helper.matrix);
      const length = helper.position.distanceTo(target);
      helper.scale.set(6.5, 5, length); helper.updateMatrix(); beams.setMatrixAt(i, helper.matrix);
      place(beacons, i, x, 26.1, a);
    });
    root.userData.beaconMaterial = beaconMaterial;
  }

  // ------------------------------------------------- arquibancada e público
  {
    const seats = new THREE.Shape([[-22.6, 0], [-22.6, 1.7], ...Array.from({length: 15}, (_, k) => [[-23.4 - k * 1.2, 1.7 + k * .72], [-23.4 - k * 1.2, 2.42 + k * .72]]).flat(), [-41.6, 12.5], [-42.4, 12.5], [-42.4, 0]].map(([x, y]) => new THREE.Vector2(x, y)));
    const roof = new THREE.Shape([[-21, 17.6], [-43.5, 18.8], [-43.5, 19.3], [-21, 18]].map(([x, y]) => new THREE.Vector2(x, y)));
    const parts = [seats, roof].map(shape => new THREE.ExtrudeGeometry(shape, {depth: 96, bevelEnabled: false}).translate(0, 0, -48));
    for (const x of [-42, -30]) for (let z = -44; z <= 44; z += 22) parts.push(new THREE.BoxGeometry(.5, 19, .5).translate(x, 9.5, z));
    const geometry = mergeGeometries(nonIndexed(parts));
    parts.forEach(g => g.dispose());
    const material = own(materials, new THREE.ShaderMaterial({
      fog: true,
      uniforms: {...FOG_UNIFORMS(THREE), ...roll},
      vertexShader: /* glsl */`
        uniform float uTravel, uLoop;
        varying vec3 vL;
        #include <fog_pars_vertex>
        void main(){
          vec3 transformed = position;
          ${ROLL_VERTEX}
          vL = position;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(transformed, 1.);
          gl_Position = projectionMatrix * mv;
        #ifdef USE_FOG
          vFogDepth = -mv.z;
        #endif
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vL;
        ${FOG_FRAGMENT}
        ${WIPE_SHADER_CHUNK}
        void main(){
          wipeDiscard();
          vec3 col = vec3(.009, .011, .013);
          float rows = smoothstep(.5, .9, fract(vL.y / .72)) * step(1.7, vL.y) * step(vL.y, 12.5) * step(vL.x, -22.7);
          col += vec3(.06, .048, .038) * rows * smoothstep(1., 12., vL.y);
          float aisle = step(.93, fract(vL.z / 8.));
          col *= 1. - .6 * aisle;
          // Sob a cobertura: pontos de luz por vão, não uma faixa contínua (lida como placa chapada).
          float under = smoothstep(.2, 0., abs(vL.y - 17.75)) * step(vL.x, -21.2);
          float bays = smoothstep(.06, 0., abs(fract(vL.z / 5.5) - .5)) * smoothstep(.5, .2, abs(fract(vL.x / 4.) - .5));
          col += vec3(1., .62, .28) * under * bays * .8;
          col += vec3(.015, .018, .022) * step(18.2, vL.y);
          gl_FragColor = vec4(mix(col, fogTint(), fogAmount() * .92), 1.);
        }`,
    }));
    const mesh = instanced(own(geometries, geometry), material, 2, 'Arquibancada');
    place(mesh, 0, 0, 0, 160); place(mesh, 1, 0, 0, 480);

    // Público: uma faixa instanciada por degrau, silhuetas recortadas no shader e telas acesas raras.
    const crowdMaterial = own(materials, new THREE.ShaderMaterial({
      fog: true,
      uniforms: {...FOG_UNIFORMS(THREE), ...roll},
      vertexShader: /* glsl */`
        uniform float uTravel, uLoop;
        varying vec2 vUv;
        varying float vRow, vWash;
        #include <fog_pars_vertex>
        void main(){
          vec3 transformed = position;
          ${ROLL_VERTEX}
          vUv = uv; vRow = instanceMatrix[3].x * 7.13 + instanceMatrix[3].z * .011;
          // Holofotes da torre esquerda (along 40 + 80k) lavam o público por trechos.
          float along = instanceMatrix[3].z - (uv.x - .5) * 96.;
          vWash = .55 + .65 * (.5 + .5 * cos((along - 40.) * .0785398));
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(transformed, 1.);
          gl_Position = projectionMatrix * mv;
        #ifdef USE_FOG
          vFogDepth = -mv.z;
        #endif
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime;
        varying vec2 vUv;
        varying float vRow, vWash;
        ${FOG_FRAGMENT}
        ${WIPE_SHADER_CHUNK}
        float cHash(float n){return fract(sin(n * 91.345 + 17.1) * 43758.5453);}
        void main(){
          wipeDiscard();
          const float CELL = .52;
          float u = vUv.x * 96. / CELL, ci = floor(u), f = (fract(u) - .5) * CELL;
          float seed = cHash(ci + vRow * 13.);
          if (seed < .3) discard;
          float y = vUv.y * .84;
          // Pessoas, não palitos: escala, altura e roupa variam por lugar; a luz dos holofotes pega
          // ombros e cabeças por cima e o resto cai no escuro da arquibancada.
          float sc = .8 + .4 * cHash(ci * 1.91 + vRow);
          float head = (.52 + .16 * cHash(ci * 1.37 + vRow)) * sc + .06;
          float lean = (cHash(ci * 2.11 + vRow) - .5) * .08;
          float body = step(abs(f - lean * .5), (.13 + .05 * (1. - smoothstep(0., head - .12, y))) * sc) * step(y, head - .09 * sc);
          float skull = step(length(vec2(f - lean, y - head)), .075 * sc);
          if (max(body, skull) < .5) discard;
          float pick = cHash(ci * 7.9 + vRow * 3.1);
          vec3 cloth = pick < .3 ? vec3(.09, .1, .12) : pick < .48 ? vec3(.16, .03, .035) : pick < .62 ? vec3(.17, .16, .15) : pick < .74 ? vec3(.15, .11, .03) : vec3(.04, .06, .1);
          // Massa iluminada, não breu: sob o risco lateral vira faixas quentes de cor.
          vec3 col = cloth * (.25 + 1.1 * smoothstep(head - .45, head, y)) * (.6 + .5 * cHash(ci * 3.7 + vRow));
          col += vec3(.11, .08, .06) * smoothstep(head - .04, head + .08, y);
          col *= vWash;
          // Telas abaixo de luminância 1: acima disso a cauda de luz as riscava em palitos.
          float screen = step(.978, cHash(ci * 5.3 + vRow * 1.9)) * step(length(vec2(f - .05, y - (head - .26))), .025);
          col += vec3(.75, .85, 1.) * .9 * screen * (.7 + .3 * sin(uTime * 2. + seed * 30.));
          gl_FragColor = vec4(mix(col, fogTint(), fogAmount() * .92), 1.);
        }`,
    }));
    const rows = 15, crowd = instanced(new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2), crowdMaterial, rows * 2, 'Público');
    [160, 480].forEach((along, m) => {
      for (let k = 0; k < rows; k++) place(crowd, m * rows + k, -24.1 - k * 1.2, 2.42 + k * .72 + .42, along, {sz: 96, sy: .84});
    });
  }

  // ----------------------------------------------------- luzes distantes
  {
    // Só longe do eixo: pontos aditivos não escrevem profundidade e herdam o risco do que está
    // atrás deles; perto da pista, viravam traços soltos em todas as direções.
    const count = mobile ? 70 : 150, r = rng(9901);
    const pos = new Float32Array(count * 3), color = new Float32Array(count * 3), size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const left = r() < .5;
      pos[i * 3] = left ? -55 - r() * 45 : 42 + r() * 60;
      pos[i * 3 + 1] = 1 + r() * r() * 22;
      pos[i * 3 + 2] = r() * TRACK_LOOP;
      // Abaixo de luminância 1: acima disso a cauda de luz do SpeedEffect riscava cada ponto num palito.
      const warm = r() < .6, k = .18 + r() * .4;
      color.set(warm ? [1 * k, .56 * k, .24 * k] : [.7 * k, .82 * k, 1 * k], i * 3);
      size[i] = .5 + r() * 1.1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const material = own(materials, new THREE.ShaderMaterial({
      fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {...FOG_UNIFORMS(THREE), ...roll, uResY: {value: 900}},
      vertexShader: /* glsl */`
        uniform float uTravel, uLoop, uResY;
        attribute vec3 aColor;
        attribute float aSize;
        varying vec3 vColor;
        #include <fog_pars_vertex>
        void main(){
          vec3 p = position;
          p.z = mod(p.z - uTravel + .5 * uLoop, uLoop) - .5 * uLoop;
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * projectionMatrix[1][1] * uResY * .5 / max(-mv.z, 1.), 2., 12.);
          // Só contam como horizonte: de perto, pontos soltos riscados viram confete.
          vColor = aColor * smoothstep(35., 75., length(mv.xyz));
        #ifdef USE_FOG
          vFogDepth = -mv.z;
        #endif
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        ${FOG_FRAGMENT}
        ${WIPE_SHADER_CHUNK}
        void main(){
          wipeDiscard();
          vec2 q = gl_PointCoord - .5;
          float a = exp(-dot(q, q) * 22.);
          gl_FragColor = vec4(vColor * a * (1. - fogAmount() * .55), 1.);
        }`,
    }));
    const points = new THREE.Points(own(geometries, geometry), material);
    points.name = 'Luzes distantes'; points.frustumCulled = false;
    root.add(points);
    root.userData.distantLights = material;
  }

  // ----------------------------------------------- bokeh dos holofotes
  // Massa de luz na faixa de cima: holofotes e prédios fora de foco a 40–95 m, discos grandes e
  // fracos (abaixo do limiar da cauda de luz, então riscam como névoa clara, não como palitos).
  {
    const count = mobile ? 48 : 72, r = rng(4217);
    const pos = new Float32Array(count * 3), color = new Float32Array(count * 3), size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const left = r() < .55;
      pos[i * 3] = left ? -38 - r() * 52 : 40 + r() * 55;
      // Baixo, atrás das coberturas e do horizonte: alto no céu vazio, cada disco lia como uma lua.
      pos[i * 3 + 1] = 6 + r() * 14;
      pos[i * 3 + 2] = r() * TRACK_LOOP;
      // Só tons quentes: os frios, depois do AgX, liam como discos cinza no céu.
      const warm = r() < .5, k = (mobile ? .2 : .16) + r() * (mobile ? .18 : .24);
      color.set(warm ? [k, .68 * k, .4 * k] : [k, .78 * k, .55 * k], i * 3);
      size[i] = 2.5 + r() * 3.5;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const material = own(materials, new THREE.ShaderMaterial({
      fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {...FOG_UNIFORMS(THREE), ...roll, uResY: {value: 900}},
      vertexShader: /* glsl */`
        uniform float uTravel, uLoop, uResY;
        attribute vec3 aColor;
        attribute float aSize;
        varying vec3 vColor;
        #include <fog_pars_vertex>
        void main(){
          vec3 p = position;
          p.z = mod(p.z - uTravel + .5 * uLoop, uLoop) - .5 * uLoop;
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * projectionMatrix[1][1] * uResY * .5 / max(-mv.z, 1.), 3., ${mobile ? '56.' : '72.'});
          vColor = aColor;
        #ifdef USE_FOG
          vFogDepth = -mv.z;
        #endif
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        ${FOG_FRAGMENT}
        ${WIPE_SHADER_CHUNK}
        void main(){
          wipeDiscard();
          float d = length(gl_PointCoord - .5) * 2.;
          if (d > 1.) discard;
          // Disco macio com aro leve: lâmpada fora de foco, não uma moeda cinza chapada.
          float disc = 1. - smoothstep(.45, 1., d);
          float ring = .75 + .25 * smoothstep(.3, .8, d);
          gl_FragColor = vec4(vColor * disc * ring * (1. - fogAmount() * .45), 1.);
        }`,
    }));
    const points = new THREE.Points(own(geometries, geometry), material);
    points.name = 'Bokeh dos holofotes'; points.frustumCulled = false; points.renderOrder = 4;
    root.add(points);
    root.userData.bokeh = material;
  }

  // --------------------------------------------------- névoa em camadas
  {
    const material = own(materials, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {...roll, uColor: {value: new THREE.Color('#2b2c30')}, uDensity: {value: mobile ? .38 : .42}},
      vertexShader: /* glsl */`
        uniform float uTravel, uLoop;
        varying vec2 vUv;
        varying vec3 vW, vNW;
        void main(){
          vec3 transformed = position;
          ${ROLL_VERTEX}
        #ifdef USE_INSTANCING
          vec4 w = modelMatrix * instanceMatrix * vec4(transformed, 1.);
          vec3 n = mat3(instanceMatrix) * normal;
        #else
          vec4 w = modelMatrix * vec4(transformed, 1.);
          vec3 n = normal;
        #endif
          vW = w.xyz; vNW = normalize(mat3(modelMatrix) * n); vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uDensity, uTime, uTravel;
        varying vec2 vUv;
        varying vec3 vW, vNW;
        ${WIPE_SHADER_CHUNK}
        ${NOISE_GLSL}
        void main(){
          wipeDiscard();
          float c = vW.x + vW.z + uTravel;
          float n = .6 * trNoise(vec2(vW.y * .15 + uTime * .015, c * .05), 32.) + .4 * trNoise(vec2(vW.y * .4 - uTime * .02, c * .2), 128.);
          float vertical = smoothstep(-.3, 2.5, vW.y) * (1. - smoothstep(5., 19., vW.y));
          float edges = smoothstep(0., .12, vUv.x) * (1. - smoothstep(.88, 1., vUv.x)) * (1. - smoothstep(.75, 1., vUv.y));
          vec3 V = cameraPosition - vW;
          float facing = smoothstep(.12, .45, abs(dot(normalize(V), vNW)));
          float near = smoothstep(10., 40., length(V));
          // A camada lateral fica rala e manchada: densa, ela virava uma parede cinza atrás do carro.
          float layer = mix(.4, 1., abs(vNW.z));
          float a = uDensity * layer * vertical * smoothstep(.2, .85, n) * edges * facing * near;
          gl_FragColor = vec4(uColor, a);
        }`,
    }));
    const cross = instanced(new THREE.PlaneGeometry(1, 1), material, rowCount('haze'), 'Névoa entre as torres');
    for (let i = 0; i < rowCount('haze'); i++) place(cross, i, 5, 8, 20 + i * 80, {sx: 150, sy: 22});
    cross.renderOrder = 5;
    const lateral = new THREE.Mesh(own(geometries, mergeGeometries([
      new THREE.PlaneGeometry(320, 26).rotateY(Math.PI / 2).translate(-50, 11, 0),
      new THREE.PlaneGeometry(320, 26).rotateY(Math.PI / 2).translate(46, 11, 0),
    ])), material);
    lateral.name = 'Névoa ao fundo'; lateral.frustumCulled = false; lateral.renderOrder = 5;
    root.add(lateral);
  }

  // ---------------------------------------------------- luminárias da reta
  // Poste na área de escape à direita (x 11,2) com braço sobre a pista e lente voltada para baixo
  // em x 6,2 e y 8,6, uma a cada 20 m: é a luz delas que varre o carro.
  {
    const count = rowCount('lampPost');
    const parts = [
      new THREE.CylinderGeometry(.09, .13, 9.1, mobile ? 6 : 8).translate(11.2, 4.55, 0),
      new THREE.BoxGeometry(5.6, .12, .12).translate(8.5, 8.95, 0),
      new THREE.BoxGeometry(1.3, .22, .56).translate(6.2, 8.78, 0),
    ];
    const frame = mergeGeometries(nonIndexed(parts));
    parts.forEach(g => g.dispose());
    const poles = instanced(frame, darkSteel, count, 'Luminárias da reta');
    const lensMaterial = rolling(new THREE.MeshBasicMaterial({color: new THREE.Color('#e6eeff').multiplyScalar(5)}), 'lamp-lens');
    const lenses = instanced(new THREE.PlaneGeometry(1.1, .4).rotateX(Math.PI / 2).translate(6.2, 8.66, 0), lensMaterial, count, 'Lentes das luminárias');
    for (let i = 0; i < count; i++) { place(poles, i, 0, 0, 10 + i * TRACK_ROWS.lampPost.spacing); place(lenses, i, 0, 0, 10 + i * TRACK_ROWS.lampPost.spacing); }
  }

  // ---------------------------------------------------------- luzes reais
  // Duas luzes andam com as duas luminárias mais próximas; o peso cos² faz uma entregar à outra.
  const SWEEP_INTENSITY = 170;
  const sweeps = [0, 1].map(k => {
    const light = new THREE.PointLight('#e2ebff', 0, 0, 2);
    light.position.set(6.2, 8.45, 0);
    light.name = 'Luz da luminária da reta ' + (k + 1);
    root.add(light);
    return light;
  });

  clip.patchObject(root);

  // ------------------------------------------------ ambiente para PMREM
  let envTarget = null;
  const envScene = new THREE.Scene();
  {
    const Y = -.55;
    const add = (geometry, color, position, rotation) => {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color, side: THREE.DoubleSide}));
      mesh.position.set(...position);
      if (rotation) mesh.rotation.set(...rotation);
      envScene.add(mesh);
      return mesh;
    };
    const dome = new THREE.SphereGeometry(600, 32, 16), cols = [];
    const horizon = new THREE.Color('#0b1014'), zenith = new THREE.Color('#040608'), glow = new THREE.Color('#ff8a2a').multiplyScalar(.12), tmp = new THREE.Color(), add2 = new THREE.Color();
    const p = dome.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const el = Math.max(0, p.getY(i) / 600);
      tmp.copy(horizon).lerp(zenith, Math.min(1, el * 2.2)).add(add2.copy(glow).multiplyScalar(Math.exp(-el * 12)));
      cols.push(tmp.r, tmp.g, tmp.b);
    }
    dome.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const domeMesh = add(dome, '#ffffff', [0, 0, 0]);
    domeMesh.material.vertexColors = true; domeMesh.material.side = THREE.BackSide;
    add(new THREE.PlaneGeometry(1200, 1200), new THREE.Color('#040506'), [0, Y - .01, 0], [-Math.PI / 2, 0, 0]);
    add(new THREE.PlaneGeometry(14.6, 1200), new THREE.Color('#0a0c0e'), [1, Y, 0], [-Math.PI / 2, 0, 0]);
    // Fileiras de refletores ao longo de Z: na pintura viram riscos compridos.
    add(new THREE.BoxGeometry(1.2, .7, 1200), new THREE.Color('#dfe8ff').multiplyScalar(9), [-15, 24.4 + Y, 0]);
    add(new THREE.BoxGeometry(1.2, .7, 1200), new THREE.Color('#dfe8ff').multiplyScalar(6), [24, 24.4 + Y, 0]);
    add(new THREE.BoxGeometry(.8, .25, 1200), new THREE.Color('#ffa257').multiplyScalar(2.2), [-24, 17.7 + Y, 0]);
    add(new THREE.BoxGeometry(.2, .35, 1200), new THREE.Color('#d8d4d4').multiplyScalar(.35), [-10.6, .56 + Y, 0]);
    add(new THREE.BoxGeometry(.1, .08, 1200), new THREE.Color('#dfe8ff').multiplyScalar(1.6), [16.4, 1.04 + Y, 0]);
    add(new THREE.BoxGeometry(.2, 4, 1200), new THREE.Color('#ffe2b8').multiplyScalar(.9), [29.5, 2.3 + Y, 0]);
    if (renderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      envTarget = pmrem.fromScene(envScene, .035, .1, 1400);
      pmrem.dispose();
    }
    envScene.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }

  root.traverse(o => { if (o.isMesh) o.castShadow = false; });
  const beaconBase = root.userData.beaconMaterial.color.clone();
  const buffer = new THREE.Vector2();

  return {
    root,
    clip,
    envTexture: envTarget?.texture ?? null,
    fog: {color: '#0b1014', near: 16, far: 120},
    cameraFar: 150,
    motion,
    lights: sweeps,
    // uTravel/uTime/uSmear compartilhados, ganho das poças e dos reflexos do asfalto.
    uniforms: {roll, pools, reflect},
    ready: fontReady,
    get wheelAngle() { return motion.wheelAngle; },
    update(time, dt, speed) {
      motion.step(dt, speed);
      roll.uTravel.value = motion.travel;
      roll.uTime.value = time;
      // Meio quadro a 60 fps de arrasto na amostragem do asfalto (antisserrilhado, não o blur).
      roll.uSmear.value = Math.min(1.2, motion.velocity / 120);
      // Luminárias em along 10 + 20k: z0 ∈ [−20, 0) e z0 + 20 ∈ [0, 20), pesos que somam 1.
      let z0 = (10 - motion.travel) % 20;
      if (z0 >= 0) z0 -= 20;
      for (let k = 0; k < 2; k++) {
        const z = z0 + 20 * k, light = sweeps[k];
        light.position.z = z;
        light.intensity = SWEEP_INTENSITY * (.5 + .5 * Math.cos(Math.PI * z / 20));
      }
      const blink = Math.sin(time * Math.PI * .9) > .2 ? 1 : .06;
      root.userData.beaconMaterial.color.copy(beaconBase).multiplyScalar(blink);
      if (renderer) {
        const resY = renderer.getDrawingBufferSize(buffer).y;
        root.userData.distantLights.uniforms.uResY.value = resY;
        root.userData.bokeh.uniforms.uResY.value = resY;
      }
      return motion;
    },
    dispose() {
      root.removeFromParent();
      root.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); if (o.isLight) o.dispose?.(); });
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      textures.forEach(t => t.dispose());
      envTarget?.dispose();
    },
  };
}
