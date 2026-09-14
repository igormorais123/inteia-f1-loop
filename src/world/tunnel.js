import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createWipeClip, WIPE_SHADER_CHUNK} from '../fx/wipe-clip.js';

// Túnel de vento didático: seção de ensaio escura, fumaça de rake e trajetórias
// ilustrativas moldadas ao envelope do carro. Nada aqui é solução de CFD.
// Coordenadas do carro: x ±0,92; y 0..1,1; z −2,55..+2,56; ar de +Z para −Z.

const CYAN = new THREE.Color('#38e8ff');
const AMBER = new THREE.Color('#ff8a2a');

// Envelope do carro em caixas, medido nos limites das malhas do GLB da aula.
const ENVELOPE = (() => {
  const list = [];
  const add = (x0, x1, y0, y1, z0, z1, mirror = false, floor = false) => {
    list.push({x0, x1, y0, y1, z0, z1, floor});
    if (mirror) list.push({x0: -x1, x1: -x0, y0, y1, z0, z1, floor});
  };
  add(-.66, .66, .10, .32, 2.10, 2.56);            // asa dianteira
  add(.60, .91, .10, .47, 1.80, 2.50, true);       // placas laterais da asa
  add(-.16, .16, .14, .46, 1.60, 2.45);            // bico
  add(-.22, .22, .14, .60, 1.00, 1.60);
  add(-.36, .36, .14, .76, .35, 1.00);             // cockpit
  add(-.30, .30, .14, .94, -.10, .55);             // halo
  add(-.18, .18, .14, 1.14, -.55, -.10);           // entrada de ar
  add(-.26, .26, .14, .98, -1.10, -.55);           // tampa do motor
  add(-.22, .22, .14, .78, -1.70, -1.10);
  add(-.16, .16, .14, .58, -2.30, -1.70);
  add(-.71, .71, .06, .66, -.80, .90);             // sidepods
  add(-.55, .55, .06, .55, -1.50, -.80);
  add(-.85, .85, .04, .10, -2.55, 1.10, false, true); // assoalho
  add(.19, .69, .55, .75, .25, .63, true);         // retrovisores
  add(.56, .93, 0, .66, 1.19, 1.85, true);         // rodas dianteiras
  add(.52, .93, 0, .69, -2.18, -1.50, true);       // rodas traseiras
  add(.39, .62, .24, .86, -2.54, -2.03, true);     // placas da asa traseira
  add(-.62, .62, .70, .86, -2.40, -2.03);          // asa traseira
  add(-.42, .42, .38, .45, -2.35, -2.09);          // beam wing
  return list;
})();

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Trajetória que contorna o envelope: cada obstáculo pede subida ou desvio
// lateral (o menor), e um núcleo cos² antecipa 0,55 m e relaxa 1,0 m.
function streamline(x, y, {under = false, z0 = 3.55, z1 = -7.6, step = .04} = {}) {
  const n = Math.round((z0 - z1) / step) + 1;
  const up = new Float32Array(n), side = new Float32Array(n);
  const C = .075, M = .06;
  for (let i = 0; i < n; i++) {
    const z = z0 - i * step;
    for (const b of ENVELOPE) {
      if (z < b.z0 || z > b.z1) continue;
      if (under && (b.floor || b.y0 > y)) continue;
      if (x < b.x0 - M || x > b.x1 + M || y < b.y0 - M || y > b.y1 + M) continue;
      const needUp = b.y1 + C - y;
      const needSide = x >= 0 ? b.x1 + C - x : x - (b.x0 - C);
      if (Math.abs(x) < .02 || needUp <= needSide * 1.25) up[i] = Math.max(up[i], needUp);
      else side[i] = Math.max(side[i], needSide);
    }
  }
  const ahead = Math.round(.7 / step), behind = Math.round(1.2 / step);
  const U = new Float32Array(n), S = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let u = 0, s = 0;
    for (let j = Math.max(0, i - behind); j <= Math.min(n - 1, i + ahead); j++) {
      const d = j - i;
      const k = Math.cos(Math.PI / 2 * (d >= 0 ? d / ahead : -d / behind)) ** 2;
      u = Math.max(u, up[j] * k); s = Math.max(s, side[j] * k);
    }
    U[i] = u; S[i] = s;
  }
  // Três passadas de média móvel (≈ gaussiana de 0,3 m) arredondam os platôs.
  for (const arr of [U, S]) for (let pass = 0; pass < 3; pass++) {
    const src = arr.slice(), R = 4;
    for (let i = 0; i < n; i++) {
      let acc = 0, cnt = 0;
      for (let j = Math.max(0, i - R); j <= Math.min(n - 1, i + R); j++) { acc += src[j]; cnt++; }
      arr[i] = acc / cnt;
    }
  }
  const pts = new Float32Array(n * 3), wake = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = U[i], s = S[i];
    const z = z0 - i * step;
    let px = x + Math.sign(x) * s, py = y + u;
    if (under) py += .30 * smooth(-1.6, -3.4, z);         // saída do difusor
    else py -= u > .25 ? .16 * smooth(-2.6, -5.2, z) : 0;  // downwash atrás da asa
    pts[i * 3] = px; pts[i * 3 + 1] = py; pts[i * 3 + 2] = z;
    wake[i] = Math.max(smooth(-2.2, -4.4, z), smooth(-1.7, -2.9, z) * smooth(.4, .8, Math.abs(px)));
  }
  return {pts, wake, n};
}

function spiral(sign, strand, strands, {z0, z1, cx0, cx1, cy0, cy1, r0, r1, turns}) {
  const n = 110, pts = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), z = z0 + (z1 - z0) * t;
    const r = r0 + (r1 - r0) * t, a = sign * (t * turns + strand / strands * Math.PI * 2);
    pts[i * 3] = sign * (cx0 + (cx1 - cx0) * t) + Math.cos(a) * r;
    pts[i * 3 + 1] = cy0 + (cy1 - cy0) * t + Math.sin(a) * r;
    pts[i * 3 + 2] = z;
  }
  return {pts, n};
}

function canvasTexture(w, h, draw, {srgb = true, repeat = [1, 1]} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 8;
  texture.userData.redraw = () => { ctx.clearRect(0, 0, w, h); draw(ctx, w, h); texture.needsUpdate = true; };
  return texture;
}

function rng(seed) { return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }; }

const FONT = 'TunnelStencil';
const fontStack = px => `${px}px ${FONT}, "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;

const FOG_UNIFORMS = () => ({fogColor: {value: new THREE.Color()}, fogNear: {value: 1}, fogFar: {value: 2000}, fogDensity: {value: .00025}});
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
`;
const NOISE_GLSL = /* glsl */`
float tHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float tNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(tHash(i),tHash(i+vec2(1,0)),f.x),mix(tHash(i+vec2(0,1)),tHash(i+vec2(1,1)),f.x),f.y);}
`;
// Car silhouette as boxes (car coordinates, shrunk to the body). A flow point whose view ray still
// meets the car beyond it sits between the camera and the car: fading it lets lines and smoke pass
// around the body instead of veiling it. Behind the car the depth test already hides them.
const CAR_BOXES = [
  [-.70, .06, -1.5, .70, .64, .9], [-.30, .14, -1.7, .30, .95, 1.0], [-.18, .9, -.55, .18, 1.12, -.1],
  [-.20, .14, 1.0, .20, .5, 2.45], [-.88, .08, 2.1, .88, .3, 2.56], [-.85, .02, -2.5, .85, .1, 1.1],
  [-.62, .3, -2.5, .62, .86, -2.03],
  [.56, 0, 1.19, .93, .66, 1.85], [-.93, 0, 1.19, -.56, .66, 1.85],
  [.52, 0, -2.18, .93, .69, -1.5], [-.93, 0, -2.18, -.52, .69, -1.5],
];
const glf = v => v.toFixed(3);
const CAR_OCCLUDER = /* glsl */`
float carAhead(vec3 w, float pad){
  vec3 d=w-cameraPosition;
  d+=vec3(equal(d,vec3(0.)))*1e-5;
  vec3 inv=1./d;
  float hit=0.;
${CAR_BOXES.map(([x0, y0, z0, x1, y1, z1]) => `  {vec3 a=(vec3(${glf(x0)},${glf(y0)},${glf(z0)})-pad-cameraPosition)*inv, b=(vec3(${glf(x1)},${glf(y1)},${glf(z1)})+pad-cameraPosition)*inv;
   vec3 n=min(a,b), x=max(a,b);
   hit=max(hit, step(max(max(max(n.x,n.y),n.z),1.), min(min(x.x,x.y),x.z)));}`).join('\n')}
  return hit;
}`;
const PLANE_VERTEX = /* glsl */`
varying vec2 vUv;
#include <fog_pars_vertex>
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
#ifdef USE_FOG
  vFogDepth = -mv.z;
#endif
}`;

export function createTunnel({renderer, scene, mobile = false} = {}) {
  const root = new THREE.Group();
  root.name = 'Túnel de vento';
  scene?.add(root);
  const clip = createWipeClip('tunnel');
  const tex = mobile ? .5 : 1;
  const disposables = [];

  // ---------- materiais ----------
  const steel = new THREE.MeshStandardMaterial({color: '#0f181d', metalness: .6, roughness: .5, envMapIntensity: .45});
  const steelDark = new THREE.MeshStandardMaterial({color: '#0a1216', metalness: .45, roughness: .62, envMapIntensity: .35});
  const ledCold = new THREE.MeshBasicMaterial({color: new THREE.Color(.78, .9, 1).multiplyScalar(1.7)});
  const ledDim = new THREE.MeshBasicMaterial({color: new THREE.Color(.4, .72, .85).multiplyScalar(.32)});

  const group = name => { const g = new THREE.Group(); g.name = name; root.add(g); return g; };
  const boxGeo = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const merged = (parts, material, parent, name) => {
    const mesh = new THREE.Mesh(mergeGeometries(parts), material);
    parts.forEach(g => g.dispose());
    mesh.name = name; parent.add(mesh); return mesh;
  };

  // ---------- piso ----------
  const floorGroup = group('Piso da seção de ensaio');
  const floorMap = canvasTexture(1024 * tex, 1024 * tex, (ctx, w) => {
    const r = rng(9127);
    ctx.fillStyle = '#141d23'; ctx.fillRect(0, 0, w, w);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = `rgba(${150 + r() * 40},${180 + r() * 30},200,${.018 + r() * .025})`;
      ctx.fillRect(i * w / 2, j * w / 2, w / 2, w / 2);
    }
    for (let i = 0; i < 9000 * tex; i++) {
      ctx.fillStyle = r() > .5 ? 'rgba(255,255,255,.022)' : 'rgba(0,0,0,.06)';
      ctx.fillRect(r() * w, r() * w, 1 + r() * 6, 1);
    }
    ctx.fillStyle = '#060a0c';
    for (const p of [0, w / 2]) { ctx.fillRect(0, p, w, 4 * tex); ctx.fillRect(p, 0, 4 * tex, w); }
    ctx.fillStyle = 'rgba(140,175,190,.10)';
    for (const p of [0, w / 2]) { ctx.fillRect(0, p + 4 * tex, w, 1); ctx.fillRect(p + 4 * tex, 0, 1, w); }
    ctx.fillStyle = 'rgba(150,180,190,.16)';
    for (const px of [24, w / 2 - 24, w / 2 + 24, w - 24]) for (const py of [24, w / 2 - 24, w / 2 + 24, w - 24]) {
      ctx.beginPath(); ctx.arc(px * 1, py, 4 * tex, 0, Math.PI * 2); ctx.fill();
    }
  }, {repeat: [3, 16 / 2.4]});
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 16).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({map: floorMap, color: '#9fb2bb', metalness: .55, roughness: .52, envMapIntensity: .55}));
  floor.name = 'Piso'; floor.receiveShadow = true; floorGroup.add(floor);
  // Chão escuro além da seção de ensaio: quando a câmera sai pelas paredes recolhidas, ela não vê
  // a borda da laje nem o vazio abaixo dela; a névoa termina o plano.
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(48, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({color: '#080d10', metalness: .2, roughness: .85, envMapIntensity: .25}));
  apron.position.y = -.02; apron.name = 'Piso externo'; floorGroup.add(apron);

  // Prato giratório com marcações angulares.
  const disk = (ctx, w, emissive) => {
    const c = w / 2, R = w / 2;
    if (!emissive) {
      ctx.fillStyle = '#111920'; ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#17212a'; ctx.beginPath(); ctx.arc(c, c, R * .995, 0, Math.PI * 2); ctx.arc(c, c, R * .905, 0, Math.PI * 2, true); ctx.fill();
      ctx.strokeStyle = '#05080a'; ctx.lineWidth = 6 * tex; ctx.beginPath(); ctx.arc(c, c, R * .997, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,150,165,.20)'; ctx.lineWidth = 2 * tex; ctx.setLineDash([22 * tex, 18 * tex]);
      ctx.beginPath(); ctx.moveTo(c, c - R * .9); ctx.lineTo(c, c + R * .9); ctx.moveTo(c - R * .9, c); ctx.lineTo(c + R * .9, c); ctx.stroke();
      ctx.setLineDash([]);
    } else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, w); }
    const ink = emissive ? '#ffffff' : 'rgba(170,200,212,.8)';
    ctx.strokeStyle = ink; ctx.fillStyle = ink;
    for (let deg = 0; deg < 360; deg++) {
      const len = deg % 15 === 0 ? .055 : deg % 5 === 0 ? .03 : .014;
      if (tex < 1 && len < .02) continue;
      const a = deg * Math.PI / 180;
      ctx.lineWidth = (deg % 15 === 0 ? 4 : 2) * tex;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * R * .985, c + Math.sin(a) * R * .985);
      ctx.lineTo(c + Math.cos(a) * R * (.985 - len), c + Math.sin(a) * R * (.985 - len));
      ctx.stroke();
    }
    ctx.lineWidth = 2 * tex;
    ctx.beginPath(); ctx.arc(c, c, R * .905, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = emissive ? .5 : .35;
    ctx.beginPath(); ctx.arc(c, c, R * .62, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = fontStack(46 * tex); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let deg = 0; deg < 360; deg += 30) {
      const a = deg * Math.PI / 180;
      ctx.save(); ctx.translate(c + Math.cos(a) * R * .86, c + Math.sin(a) * R * .86); ctx.rotate(a + Math.PI / 2);
      ctx.fillText(String(deg).padStart(3, '0'), 0, 0); ctx.restore();
    }
  };
  const diskMap = canvasTexture(2048 * tex, 2048 * tex, (ctx, w) => disk(ctx, w, false), {repeat: [1, 1]});
  const diskEmissive = canvasTexture(2048 * tex, 2048 * tex, (ctx, w) => disk(ctx, w, true), {repeat: [1, 1]});
  const turntable = new THREE.Mesh(new THREE.CircleGeometry(3.05, 128).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({map: diskMap, emissiveMap: diskEmissive, emissive: new THREE.Color('#38e8ff').multiplyScalar(.28), metalness: .45, roughness: .5, envMapIntensity: .6}));
  turntable.position.y = .003; turntable.name = 'Prato giratório'; turntable.receiveShadow = true;
  floorGroup.add(turntable);

  // Esteira rolante: a textura corre no sentido do ar (−Z).
  const beltMap = canvasTexture(256 * tex, 1024 * tex, (ctx, w, h) => {
    const r = rng(4411);
    ctx.fillStyle = '#0d1215'; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3 * tex) { ctx.fillStyle = `rgba(255,255,255,${.012 + r() * .02})`; ctx.fillRect(x, 0, 1, h); }
    for (let i = 0; i < 1800 * tex; i++) { ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fillRect(r() * w, r() * h, 1, 2 + r() * 10); }
    ctx.fillStyle = 'rgba(150,175,185,.20)'; ctx.fillRect(0, 0, w, 2); ctx.fillRect(0, h / 2, w, 1);
    ctx.fillStyle = 'rgba(205,225,232,.2)';
    for (let y = 0; y < h; y += h / 8) { ctx.fillRect(10 * tex, y, 6 * tex, h / 28); ctx.fillRect(w - 16 * tex, y, 6 * tex, h / 28); }
    ctx.fillStyle = 'rgba(56,232,255,.18)';
    for (let y = h / 4; y < h; y += h / 2) {       // setas no sentido do ar
      ctx.beginPath(); ctx.moveTo(w / 2, y - 26 * tex); ctx.lineTo(w / 2 + 22 * tex, y + 6 * tex); ctx.lineTo(w / 2 + 8 * tex, y + 6 * tex);
      ctx.lineTo(w / 2, y - 6 * tex); ctx.lineTo(w / 2 - 8 * tex, y + 6 * tex); ctx.lineTo(w / 2 - 22 * tex, y + 6 * tex); ctx.closePath(); ctx.fill();
    }
  }, {repeat: [1, 6.6 / 2]});
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(2, 6.6).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({map: beltMap, color: '#c8d2d6', metalness: 0, roughness: .82, envMapIntensity: .35}));
  belt.position.y = .007; belt.name = 'Esteira rolante'; belt.receiveShadow = true;
  floorGroup.add(belt);

  const floorLeds = [];
  for (const s of [-1, 1]) {
    floorLeds.push(boxGeo(.012, .006, 6.6, s * 1.01, .009, 0));   // bordas da esteira
    floorLeds.push(boxGeo(.03, .02, 16, s * 3.44, .012, 0));        // rodapé
  }
  merged(floorLeds, ledDim, floorGroup, 'LEDs do piso');

  // ---------- paredes ----------
  const windowsMap = canvasTexture(1024 * tex, 112 * tex, (ctx, w, h) => {
    const r = rng(3301);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b1720'); g.addColorStop(.6, '#07111a'); g.addColorStop(1, '#040709');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {                  // brilho da sala de controle
      const x = r() * w, y = h * (.35 + r() * .3), rr = h * (.4 + r() * .6);
      const rg = ctx.createRadialGradient(x, y, 0, x, y, rr);
      rg.addColorStop(0, 'rgba(50,110,140,.28)'); rg.addColorStop(1, 'rgba(50,110,140,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
    }
    for (let i = 0; i < 34; i++) {                  // monitores distantes
      const mw = (6 + r() * 12) * tex, mh = (4 + r() * 5) * tex, x = r() * w, y = h * (.46 + r() * .16);
      ctx.fillStyle = r() > .88 ? 'rgba(255,150,70,.32)' : `rgba(70,210,240,${.12 + r() * .22})`;
      ctx.fillRect(x, y, mw, mh);
    }
    ctx.fillStyle = '#030506'; ctx.fillRect(0, h * .72, w, h * .28);   // bancadas
    ctx.fillStyle = 'rgba(160,205,225,.05)';
    for (let i = 0; i < 9; i++) { const x = r() * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 40 * tex, 0); ctx.lineTo(x - 30 * tex, h); ctx.lineTo(x - 60 * tex, h); ctx.fill(); }
    ctx.fillStyle = '#05090c';
    for (let i = 0; i <= 5; i++) ctx.fillRect(i * w / 5 - 5 * tex, 0, 10 * tex, h);
    ctx.fillRect(0, 0, w, 5 * tex); ctx.fillRect(0, h - 5 * tex, w, 5 * tex);
  }, {repeat: [1, 1]});
  windowsMap.wrapS = windowsMap.wrapT = THREE.ClampToEdgeWrapping;
  const windowsMaterial = new THREE.MeshBasicMaterial({map: windowsMap, color: new THREE.Color(.85, .85, .85)});

  // Janelas acima da linha do carro: no plano lateral a silhueta projeta até y≈1,3 na parede.
  const walls = {};
  for (const s of [-1, 1]) {
    const g = group(s < 0 ? 'Parede de observação (−X)' : 'Parede (+X)');
    const parts = [], leds = [];
    const windows = s < 0;
    const rows = [[0, .85], [.85, 1.5], [1.5, 2.36], [2.36, 3.8]];
    for (let c = 0; c < 10; c++) {
      const za = -8 + c * 1.6, zb = za + 1.6, zm = (za + zb) / 2;
      rows.forEach(([ya, yb], ri) => {
        if (windows && ri === 2 && zm > -5.6 && zm < 2.4) return;
        const inset = (c + ri) % 2 ? .012 : 0;
        parts.push(boxGeo(.05, yb - ya - .035, 1.565, s * (3.56 + inset), (ya + yb) / 2, zm));
      });
    }
    parts.push(boxGeo(.02, 3.8, 16, s * 3.62, 1.9, 0));
    for (const z of [-8, -4.8, -1.6, 1.6, 4.8, 8]) parts.push(boxGeo(.14, 3.8, .16, s * 3.47, 1.9, z));
    for (const y of [1.5, 2.36]) parts.push(boxGeo(.08, .06, 16, s * 3.5, y, 0));
    merged(parts, steel, g, 'Painéis');
    leds.push(boxGeo(.02, .02, 16, s * 3.43, 2.62, 0));
    leds.push(boxGeo(.02, .014, 16, s * 3.43, .05, 0));
    merged(leds, ledCold, g, 'Faixas de LED');
    if (windows) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(8, .84).rotateY(Math.PI / 2).translate(-3.545, 1.93, -1.6), windowsMaterial);
      pane.name = 'Janelas de observação'; g.add(pane);
    }
    walls[s] = g;
  }

  // ---------- teto ----------
  const ceiling = group('Teto');
  {
    const parts = [boxGeo(7.2, .05, 16, 0, 3.83, 0)];
    for (let z = -8; z <= 8; z += 1.6) parts.push(boxGeo(7, .14, .12, 0, 3.74, z));
    merged(parts, steelDark, ceiling, 'Estrutura do teto');
    merged([-1.4, 0, 1.4].map(x => boxGeo(.12, .03, 15.6, x, 3.7, 0)), ledCold, ceiling, 'LEDs do teto');
  }

  // ---------- bocal com colmeia (+Z) ----------
  const nozzle = group('Bocal e colmeia');
  const honeycombMaterial = new THREE.ShaderMaterial({
    fog: true,
    uniforms: {...FOG_UNIFORMS()},
    vertexShader: PLANE_VERTEX,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      ${FOG_FRAGMENT}
      ${WIPE_SHADER_CHUNK}
      float hexDist(vec2 p){p=abs(p);return max(dot(p,vec2(.8660254,.5)),p.y);}
      void main(){
        wipeDiscard();
        vec2 w=(vUv-.5)*vec2(7.,3.8);
        vec2 g=w/.075, r=vec2(1.7320508,1.), h=r*.5;
        vec2 a=mod(g,r)-h, b=mod(g-h,r)-h;
        vec2 gv=dot(a,a)<dot(b,b)?a:b;
        float d=hexDist(gv);
        float cell=1.-smoothstep(.40,.47,d);
        vec2 q=(w-vec2(0.,-.55))*vec2(.36,.62);
        float glow=exp(-dot(q,q)*1.3);
        vec3 light=vec3(.55,.8,.95)*(.015+.85*glow*glow);
        vec3 rim=vec3(.012,.018,.022)*(.5+glow);
        vec3 col=mix(rim, light*(.2+.8*smoothstep(.42,0.,d)), cell);
        col=mix(col, fogColor, fogAmount());
        gl_FragColor=vec4(col,1.);
      }`,
  });
  const honeycomb = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.8).rotateY(Math.PI).translate(0, 1.9, 7.95), honeycombMaterial);
  honeycomb.name = 'Colmeia'; nozzle.add(honeycomb);
  merged([
    boxGeo(7.2, .45, .4, 0, 3.6, 7.7), boxGeo(.45, 3.8, .4, -3.4, 1.9, 7.7), boxGeo(.45, 3.8, .4, 3.4, 1.9, 7.7),
    boxGeo(7.2, .06, .08, 0, 1.25, 7.85), boxGeo(7.2, .06, .08, 0, 2.5, 7.85),
    boxGeo(.06, 3.8, .08, -1.2, 1.9, 7.85), boxGeo(.06, 3.8, .08, 1.2, 1.9, 7.85),
  ], steel, nozzle, 'Moldura do bocal');

  // ---------- difusor de saída (−Z) ----------
  const diffuser = group('Difusor de saída');
  const diffuserGlowMaterial = new THREE.ShaderMaterial({
    fog: true,
    uniforms: {...FOG_UNIFORMS(), uTime: {value: 0}},
    vertexShader: PLANE_VERTEX,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uTime;
      ${FOG_FRAGMENT}
      ${WIPE_SHADER_CHUNK}
      void main(){
        wipeDiscard();
        vec2 w=(vUv-.5)*vec2(7.,3.8);
        vec2 q=w-vec2(0.,-.15);
        float rr=length(q);
        float glow=exp(-rr*rr*.42);
        float ang=atan(q.y,q.x)+uTime*.7;
        float blade=smoothstep(.35,.55,sin(ang*7.)*.5+.5);
        float fan=step(rr,1.5)*smoothstep(.28,.34,rr);
        float mask=mix(1.,.12,fan*blade);
        mask*=1.-(smoothstep(1.48,1.52,rr)-smoothstep(1.64,1.7,rr))*.92;
        mask*=mix(.12,1.,smoothstep(.26,.3,rr));
        vec3 col=vec3(.42,.72,.86)*(.03+.9*glow)*mask;
        col=mix(col, fogColor, fogAmount()*.85);
        gl_FragColor=vec4(col,1.);
      }`,
  });
  const diffuserGlow = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.8).translate(0, 1.9, -7.95), diffuserGlowMaterial);
  diffuserGlow.name = 'Ventilador'; diffuser.add(diffuserGlow);
  {
    const vanes = [];
    for (let x = -3.2; x <= 3.21; x += .4) vanes.push(boxGeo(.035, 3.7, .5, x, 1.9, -7.55));
    for (const y of [.95, 1.9, 2.85]) vanes.push(boxGeo(7, .035, .5, 0, y, -7.55));
    vanes.push(boxGeo(7.2, .45, .4, 0, 3.6, -7.4), boxGeo(.45, 3.8, .4, -3.4, 1.9, -7.4), boxGeo(.45, 3.8, .4, 3.4, 1.9, -7.4));
    merged(vanes, steelDark, diffuser, 'Aletas do difusor');
  }

  // ---------- rake de fumaça ----------
  const RAKE_Z = 3.55;
  const smokeLanes = [];
  // Poucas faixas largas e macias: cada faixa é um feixe espalhado de partículas
  // aditivas, lido como luz/fumaça iluminada e não como tubos.
  // A faixa do lado das câmeras da aula (+X) corre baixa, abaixo do logotipo do sidepod.
  const smokeSpecs = mobile ? [[-.5, .42], [.1, .5], [.8, .18]] : [[-.78, .36], [-.36, .52], [0, .42], [.36, .56], [.8, .18], [0, .78]];
  smokeLanes.push(...smokeSpecs);
  const laneXs = smokeSpecs.map(([x]) => x);
  {
    const parts = [];
    // Barras só sobre os bocais, alimentadas por um tubo rente ao piso que vai
    // até as colunas em |x| = 3: nenhum poste alto entre a câmera e o carro.
    const half = Math.max(...laneXs) + .07;
    const ys = [...new Set(smokeLanes.map(l => l[1]))], top = Math.max(...ys);
    for (const y of ys) parts.push(boxGeo(half * 2, .025, .025, 0, y, RAKE_Z + .12));
    for (const x of [-half, half]) parts.push(boxGeo(.022, top, .022, x, top / 2, RAKE_Z + .12));
    parts.push(boxGeo(6, .03, .05, 0, .018, RAKE_Z + .12));
    for (const x of [-3, 3]) parts.push(boxGeo(.08, .16, .12, x, .08, RAKE_Z + .12));
    for (const [x, y] of smokeLanes) {
      parts.push(new THREE.CylinderGeometry(.006, .011, .12, 8, 1, true).rotateX(Math.PI / 2).translate(x, y, RAKE_Z + .06));
      parts.push(boxGeo(.012, .012, .06, x, y, RAKE_Z + .13));
    }
    merged(parts, steel, root, 'Rake de fumaça');
  }

  // Trajetórias base da fumaça em textura (xyz + fator de esteira).
  const SAMPLES = 256;
  const pathData = new Float32Array(SAMPLES * smokeLanes.length * 4);
  smokeLanes.forEach(([x, y], lane) => {
    const {pts, wake, n} = streamline(x, y);
    for (let s = 0; s < SAMPLES; s++) {
      const f = s / (SAMPLES - 1) * (n - 1), i = Math.min(n - 2, Math.floor(f)), fr = f - i, o = (lane * SAMPLES + s) * 4;
      for (let k = 0; k < 3; k++) pathData[o + k] = pts[i * 3 + k] * (1 - fr) + pts[(i + 1) * 3 + k] * fr;
      pathData[o + 3] = wake[i] * (1 - fr) + wake[i + 1] * fr;
    }
  });
  const pathTexture = new THREE.DataTexture(pathData, SAMPLES, smokeLanes.length, THREE.RGBAFormat, THREE.FloatType);
  pathTexture.magFilter = pathTexture.minFilter = THREE.NearestFilter;
  pathTexture.needsUpdate = true;
  disposables.push(pathTexture);

  const COUNT = mobile ? 2500 : 7200;
  const seeds = new Float32Array(COUNT * 3), aR = new Float32Array(COUNT);
  {
    const r = rng(21731);
    for (let i = 0; i < COUNT; i++) {
      seeds[i * 3] = i % smokeLanes.length; seeds[i * 3 + 1] = r(); seeds[i * 3 + 2] = r(); aR[i] = r();
    }
  }
  const smokeGeometry = new THREE.BufferGeometry();
  smokeGeometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
  smokeGeometry.setAttribute('aR', new THREE.BufferAttribute(aR, 1));
  const perLane = COUNT / smokeLanes.length;
  const smokeUniforms = {
    ...FOG_UNIFORMS(),
    uPath: {value: pathTexture}, uRes: {value: new THREE.Vector2(1440, 900)},
    uTime: {value: 0}, uRate: {value: .12}, uFlow: {value: 0}, uSamples: {value: SAMPLES},
    uThin: {value: .028}, uPuff: {value: .22}, uStreak: {value: .16}, uGain: {value: .036 * Math.sqrt(1200 / perLane)},
  };
  const smokeMaterial = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: smokeUniforms,
    vertexShader: /* glsl */`
      uniform sampler2D uPath;
      uniform vec2 uRes;
      uniform float uTime, uRate, uFlow, uSamples, uThin, uPuff, uStreak, uGain;
      attribute float aR;
      varying float vAlpha, vWake, vLen, vRad, vSeed, vLight;
      varying vec2 vDir;
      #include <fog_pars_vertex>
      ${CAR_OCCLUDER}
      void main(){
        float lane=position.x;
        float t=fract(position.y+uTime*uRate*(.9+.2*position.z));
        float f=t*(uSamples-1.), i0=floor(f), fr=f-i0;
        vec4 A=texelFetch(uPath, ivec2(int(i0), int(lane)), 0);
        vec4 B=texelFetch(uPath, ivec2(int(min(i0+1., uSamples-1.)), int(lane)), 0);
        vec3 P=mix(A.xyz,B.xyz,fr); float wake=mix(A.w,B.w,fr);
        vec3 T=B.xyz-A.xyz; T=length(T)>1e-5?normalize(T):vec3(0.,0.,-1.);
        // Campo coerente por filete (todas as partículas do filete o seguem) e
        // espalhamento individual fixo que só abre na esteira: fios, não rabiscos.
        float ph=lane*1.931;
        float lam=.006*smoothstep(1.2,-1.,P.z);
        vec3 eddy=vec3(sin(P.z*1.9-uTime*2.2+ph)+.55*sin(P.z*4.3-uTime*3.3+ph*2.1),
                       .8*sin(P.z*2.6-uTime*1.8+ph*1.37)+.55, 0.)*(vec3(.15,.12,0.)*wake+lam);
        float spread=.006+.045*smoothstep(0.,.25,t)+wake*.2;
        float ang=position.z*6.2831+uTime*wake*1.6;
        vec3 J=vec3(cos(ang), sin(ang), 0.)*spread*sqrt(aR);
        vec3 W=P+eddy+J;
        vec4 mv=modelViewMatrix*vec4(W,1.);
        vec4 c1=projectionMatrix*mv;
        vec4 c2=projectionMatrix*(modelViewMatrix*vec4(W+T*uStreak*(1.-.8*wake),1.));
        gl_Position=c1;
        vec2 d=(c2.xy/max(c2.w,.05)-c1.xy/max(c1.w,.05))*uRes*.5;
        float len=length(d);
        float pxPerM=projectionMatrix[1][1]*uRes.y*.5/max(-mv.z,.05);
        float thick=max((uThin+wake*uPuff*(.4+aR))*pxPerM, 1.5);
        float size=2.*len+2.8*thick+2.;   // folga para o halo suave em volta do núcleo
        gl_PointSize=min(size, 220.);
        vDir=len>.001?d/len:vec2(1.,0.);
        vLen=len/size; vRad=.5*thick/size;
        // Cauda que some suavemente; nada a menos de ~1,5 m da lente.
        float fade=smoothstep(0.,.06,t)*(1.-smoothstep(.45,.95,t));
        // Baforadas: a densidade viaja com as partículas e abre falhas na faixa.
        float puff=.5+.5*sin(t*53.+lane*2.3+sin(t*17.+lane)*1.7);
        float pulse=.35+.65*puff;
        vAlpha=uFlow*uGain*fade*pulse*mix(1.,.22,wake)*clamp(10./thick,.2,1.)*smoothstep(1.2,1.9,-mv.z);
        // In front of the body the smoke keeps 8%: the paint never reads translucent. The boxes grow by
        // the puff radius, since a particle centred just off the silhouette still spreads over it.
        vAlpha*=mix(1.,.08,carAhead(W,.06+.2*wake));
        // Seen from the flank each lane lines up into one long, solid band that the depth of
        // field widens into a white arc over the car; the side view keeps a quarter of it.
        float flank=smoothstep(.72,.97,abs(normalize(cameraPosition-W).x));
        vAlpha*=mix(1.,.25,flank);
        vLight=smoothstep(.1,1.2,W.y);
        vWake=wake; vSeed=position.z;
      #ifdef USE_FOG
        vFogDepth=-mv.z;
      #endif
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying float vAlpha, vWake, vLen, vRad, vSeed, vLight;
      varying vec2 vDir;
      ${FOG_FRAGMENT}
      ${WIPE_SHADER_CHUNK}
      ${NOISE_GLSL}
      void main(){
        wipeDiscard();
        vec2 p=gl_PointCoord-.5; p.y=-p.y;
        float along=dot(p,vDir), across=dot(p,vec2(-vDir.y,vDir.x));
        float ax=max(abs(along)-vLen,0.);
        float r=length(vec2(ax,across))/vRad;
        float a=exp(-r*r*1.2)*.7+exp(-r*r*.4)*.3;
        if(vWake>.02){
          float cloud=tNoise(p*5.+vSeed*31.+vec2(uTime*.15,0.))*.65+tNoise(p*12.+vSeed*57.)*.35;
          a*=mix(1.,.2+cloud*1.3,vWake);
        }
        vec3 col=mix(vec3(.22,.62,.82), vec3(.72,.9,1.), .15+.55*vLight);
        col=mix(col, vec3(.7,.9,1.)*1.35, vWake*.6);   // esteira fria e luminosa, não cinza
        gl_FragColor=vec4(col*a*vAlpha*(1.-fogAmount()), 1.);
      }`,
  });
  const smoke = new THREE.Points(smokeGeometry, smokeMaterial);
  smoke.name = 'Fumaça'; smoke.frustumCulled = false; smoke.renderOrder = 2;
  root.add(smoke);

  // ---------- trajetórias em fita (instanciadas, largura em espaço de tela) ----------
  const ribbonPaths = [];
  const addPath = (pts, n, amber, width) => ribbonPaths.push({pts, n, amber, width});
  const decimate = mobile ? 3 : 1;
  const laneSpecs = mobile
    ? [[-.36, .8], [.36, .8], [0, 1.02], [.66, .48]]
    : [[-.36, .8], [.36, .8], [0, 1.02], [-.66, .48], [.66, .48], [1.02, .36]];
  for (const [x, y] of laneSpecs) { const s = streamline(x, y); addPath(s.pts, s.n, 0, 1); }
  for (const x of mobile ? [] : [-.45, .45]) { const s = streamline(x, .035, {under: true}); addPath(s.pts, s.n, 0, .85); }
  const rearStrands = mobile ? 1 : 2, frontStrands = 1;
  for (const sign of [-1, 1]) {
    for (let k = 0; k < rearStrands; k++) { const s = spiral(sign, k, rearStrands, {z0: -2.2, z1: -6.4, cx0: .8, cx1: 1.08, cy0: .33, cy1: .58, r0: .04, r1: .24, turns: 17}); addPath(s.pts, s.n, 1, .9); }
    for (let k = 0; k < frontStrands; k++) { const s = spiral(sign, k, frontStrands, {z0: 1.15, z1: -1.3, cx0: 1.0, cx1: 1.06, cy0: .3, cy1: .36, r0: .03, r1: .075, turns: 12}); addPath(s.pts, s.n, 1, .75); }
  }
  let segCount = 0;
  for (const p of ribbonPaths) segCount += Math.floor((p.n - 1) / decimate);
  const aStart = new Float32Array(segCount * 3), aEnd = new Float32Array(segCount * 3), aU = new Float32Array(segCount * 2), aInfo = new Float32Array(segCount * 3);
  {
    let o = 0;
    ribbonPaths.forEach((p, pi) => {
      const idx = [];
      for (let i = 0; i < p.n; i += decimate) idx.push(i);
      if (idx[idx.length - 1] !== p.n - 1) idx.push(p.n - 1);
      const lengths = [0];
      for (let k = 1; k < idx.length; k++) {
        const a = idx[k - 1] * 3, b = idx[k] * 3;
        lengths.push(lengths[k - 1] + Math.hypot(p.pts[b] - p.pts[a], p.pts[b + 1] - p.pts[a + 1], p.pts[b + 2] - p.pts[a + 2]));
      }
      const total = lengths[lengths.length - 1];
      const seed = (pi * .618034) % 1;
      for (let k = 1; k < idx.length && o < segCount; k++, o++) {
        const a = idx[k - 1] * 3, b = idx[k] * 3;
        aStart.set([p.pts[a], p.pts[a + 1], p.pts[a + 2]], o * 3);
        aEnd.set([p.pts[b], p.pts[b + 1], p.pts[b + 2]], o * 3);
        aU.set([lengths[k - 1] / total, lengths[k] / total], o * 2);
        aInfo.set([seed, p.amber, p.width], o * 3);
      }
    });
  }
  const ribbonGeometry = new THREE.InstancedBufferGeometry();
  ribbonGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
  ribbonGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  ribbonGeometry.setAttribute('aStart', new THREE.InstancedBufferAttribute(aStart, 3));
  ribbonGeometry.setAttribute('aEnd', new THREE.InstancedBufferAttribute(aEnd, 3));
  ribbonGeometry.setAttribute('aU', new THREE.InstancedBufferAttribute(aU, 2));
  ribbonGeometry.setAttribute('aInfo', new THREE.InstancedBufferAttribute(aInfo, 3));
  ribbonGeometry.instanceCount = segCount;
  const ribbonUniforms = {
    ...FOG_UNIFORMS(),
    uRes: smokeUniforms.uRes, uTime: {value: 0}, uFlow: {value: 0}, uReveal: {value: 0},
    uWidth: {value: .0055}, uMinPx: {value: mobile ? .8 : .9}, uPulses: {value: 3}, uPulseSpeed: {value: .75},
    uCyan: {value: CYAN.clone()}, uAmber: {value: AMBER.clone()},
  };
  const ribbonMaterial = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: ribbonUniforms,
    vertexShader: /* glsl */`
      uniform vec2 uRes;
      uniform float uWidth, uMinPx;
      attribute vec3 aStart, aEnd, aInfo;
      attribute vec2 aU;
      varying float vU, vAcross, vSeed, vAmber, vThin, vNear, vOcc;
      #include <fog_pars_vertex>
      ${CAR_OCCLUDER}
      void main(){
        vec4 mA=modelViewMatrix*vec4(aStart,1.), mB=modelViewMatrix*vec4(aEnd,1.);
        vec4 cA=projectionMatrix*mA, cB=projectionMatrix*mB;
        vU=0.; vAcross=0.; vSeed=aInfo.x; vAmber=aInfo.y; vThin=0.; vNear=0.; vOcc=0.;
      #ifdef USE_FOG
        vFogDepth=0.;
      #endif
        if(cA.w<.06||cB.w<.06){gl_Position=vec4(0.,0.,2.,1.);return;}
        vec2 sA=cA.xy/cA.w*uRes, sB=cB.xy/cB.w*uRes;
        vec2 dir=sB-sA; float l=length(dir); dir=l>1e-4?dir/l:vec2(1.,0.);
        vec2 nrm=vec2(-dir.y,dir.x);
        bool tail=position.x>.5;
        vec4 c=tail?cB:cA; vec4 m=tail?mB:mA;
        float pxPerM=projectionMatrix[1][1]*uRes.y*.5/max(-m.z,.05);
        float worldPx=uWidth*aInfo.z*pxPerM;
        float halfPx=max(worldPx,uMinPx);
        c.xy+=nrm*position.y*halfPx*2./uRes*c.w;
        gl_Position=c;
        vU=tail?aU.y:aU.x; vAcross=position.y; vThin=clamp(worldPx/uMinPx,0.,1.);
        vNear=smoothstep(1.2,1.9,-m.z);
        vOcc=carAhead(tail?aEnd:aStart,0.);
      #ifdef USE_FOG
        vFogDepth=-m.z;
      #endif
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uFlow, uReveal, uPulses, uPulseSpeed;
      uniform vec3 uCyan, uAmber;
      varying float vU, vAcross, vSeed, vAmber, vThin, vNear, vOcc;
      ${FOG_FRAGMENT}
      ${WIPE_SHADER_CHUNK}
      void main(){
        wipeDiscard();
        float x=abs(vAcross);
        float profile=exp(-x*x*7.)+exp(-x*x*1.8)*.28;
        float ends=smoothstep(0.,.18,vU)*(1.-smoothstep(.55,1.,vU));
        float reveal=1.-smoothstep(uReveal*1.12-.1,uReveal*1.12,vU);
        float p=fract(vU*uPulses-uTime*uPulseSpeed+vSeed);
        float pulse=pow(p,8.)*.8+pow(p,3.)*.2;
        vec3 col=mix(uCyan,uAmber,vAmber);
        float I=(.09+1.5*pulse)*profile*ends*reveal*uFlow*mix(.6,1.,vThin)*vNear*(1.-.94*vOcc);
        gl_FragColor=vec4(col*I*(1.-fogAmount()),1.);
      }`,
  });
  const ribbons = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
  ribbons.name = 'Trajetórias ilustrativas'; ribbons.frustumCulled = false; ribbons.renderOrder = 3;
  root.add(ribbons);

  // ---------- preenchimento frio do túnel (sem sombra) ----------
  const rimCyan = new THREE.PointLight('#5fe6ff', 3.2, 4.5, 2);
  rimCyan.position.set(-1.7, 1.25, -1.1);
  const rimCold = new THREE.PointLight('#cfe7ff', 2.4, 6, 2);
  rimCold.position.set(2.2, 2.6, -3.4);
  root.add(rimCyan, rimCold);

  clip.patchObject(root);

  // ---------- cena de ambiente para PMREM ----------
  const envScene = new THREE.Scene();
  envScene.name = 'Ambiente do túnel';
  {
    const envMaterials = [];
    const add = (geometry, color, position, rotation) => {
      const material = new THREE.MeshBasicMaterial({color, side: THREE.DoubleSide});
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      if (rotation) mesh.rotation.set(...rotation);
      envScene.add(mesh); envMaterials.push(material);
      return mesh;
    };
    const Y = -.55;   // PMREM captura a partir da origem: câmara deslocada para a altura do carro
    add(new THREE.BoxGeometry(7.2, 3.9, 16), new THREE.Color('#0b1419'), [0, 1.95 + Y, 0]);
    envScene.children[0].material.side = THREE.BackSide;
    add(new THREE.PlaneGeometry(7.2, 16), new THREE.Color('#070b0e'), [0, Y + .01, 0], [-Math.PI / 2, 0, 0]);
    for (const x of [-1.4, 0, 1.4]) add(new THREE.PlaneGeometry(.28, 15), new THREE.Color(.8, .92, 1).multiplyScalar(6), [x, 3.75 + Y, 0], [Math.PI / 2, 0, 0]);
    for (const s of [-1, 1]) {
      for (const y of [2.05, 2.9]) add(new THREE.PlaneGeometry(16, .1), new THREE.Color(.7, .9, 1).multiplyScalar(3.5), [s * 3.5, y + Y, 0], [0, -s * Math.PI / 2, 0]);
      add(new THREE.PlaneGeometry(16, .05), new THREE.Color(.5, .8, .9).multiplyScalar(1.5), [s * 3.5, .1 + Y, 0], [0, -s * Math.PI / 2, 0]);
    }
    add(new THREE.PlaneGeometry(4.5, 2.6), new THREE.Color(.55, .72, .8).multiplyScalar(1.3), [0, 1.5 + Y, 7.9], [0, Math.PI, 0]);
    add(new THREE.PlaneGeometry(3.2, 2.6), new THREE.Color(.3, .5, .6).multiplyScalar(.7), [0, 1.6 + Y, -7.9]);
    envScene.userData.dispose = () => { envScene.traverse(o => o.geometry?.dispose()); envMaterials.forEach(m => m.dispose()); };
  }

  // ---------- fonte do estêncil ----------
  let ready = Promise.resolve();
  try {
    if (typeof FontFace !== 'undefined' && typeof document !== 'undefined') {
      const base = import.meta.env?.BASE_URL ?? '/';
      const face = new FontFace(FONT, `url(${base}fonts/BebasNeue-Regular.woff2)`);
      document.fonts.add(face);
      // Upload the redrawn 2048 px disc maps now: deferred, they landed on the first tunnel frame.
      ready = face.load().then(() => { diskMap.userData.redraw(); diskEmissive.userData.redraw(); renderer?.initTexture?.(diskMap); renderer?.initTexture?.(diskEmissive); }).catch(() => {});
    }
  } catch { /* fonte opcional: o estêncil já foi desenhado com a pilha de reserva */ }

  // ---------- estado ----------
  let flowTarget = 0, flow = 0, time = 0;
  const buffer = new THREE.Vector2(), local = new THREE.Vector3();

  return {
    root,
    clip,
    envScene,
    ready,
    setFlow(v) { flowTarget = Math.min(1, Math.max(0, Number(v) || 0)); },
    update(dt = 0, camera, elapsed) {
      dt = Math.min(Math.max(dt, 0), .1);
      time += dt;
      flow += (flowTarget - flow) * (1 - Math.exp(-dt * 1.2));
      if (Math.abs(flowTarget - flow) < .001) flow = flowTarget;
      if (renderer) { renderer.getDrawingBufferSize(buffer); smokeUniforms.uRes.value.copy(buffer); }
      smokeUniforms.uTime.value = time;
      smokeUniforms.uFlow.value = flow;
      ribbonUniforms.uTime.value = time;
      ribbonUniforms.uFlow.value = Math.min(1, flow * 1.15);
      ribbonUniforms.uReveal.value = flow;
      diffuserGlowMaterial.uniforms.uTime.value = time;
      beltMap.offset.y -= dt * 2.4 / 2;   // 2,4 m/s na textura de 2 m
      const visible = flow > .002;
      smoke.visible = ribbons.visible = visible;
      if (camera) {
        root.updateWorldMatrix(true, false);
        root.worldToLocal(camera.getWorldPosition(local));
        walls[1].visible = local.x < 3.3;
        walls[-1].visible = local.x > -3.3;
        ceiling.visible = local.y < 3.65;
        nozzle.visible = local.z < 7.6;
        diffuser.visible = local.z > -7.3;
      }
    },
    dispose() {
      scene?.remove(root);
      root.removeFromParent();
      const geometries = new Set(), materials = new Set(), textures = new Set(disposables);
      root.traverse(o => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) for (const m of [].concat(o.material)) {
          materials.add(m);
          for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
        }
        if (o.isLight) o.dispose?.();
      });
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      textures.forEach(t => t.dispose());
      envScene.userData.dispose();
    },
  };
}
