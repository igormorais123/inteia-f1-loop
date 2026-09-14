// Surface finish pass for the lesson car (paint depth, rims, brakes, tyre sidewalls).
// Contract: enhanceCar({model, mechanics, mobile}) -> {update(dt, time, pose), setRim(color, strength, direction, edge), race(speed, brake, time), dispose()}.
// Geometry and part names stay untouched: rims and tyres get procedural shading in their
// own local frame (axle = local X), and each wheel gains one brake disc and one caliper
// parented to the rim's record root so they follow spin and the exploded view.
import * as THREE from 'three';

// Deep pigment: AgX desaturates bright reds toward salmon, so the albedo stays low and the
// gloss comes from the clear coat, not from a broad base-layer specular.
const PAINT = '#a3081c';
// Punctual lights on a glassy coat read as isolated pin dots (plastic); long reflections
// come from the environment strips instead.
const COAT_DIRECT = .35;

// Warm rim edge (R10): a fresnel term gated by a light direction behind and above the car, so only
// the edges facing it (engine cover, halo, sidepod shoulders) catch a thin amber line. Added to the
// coat layer, whose own Fresnel would otherwise dim it at grazing angles. Car materials only: the
// floor never receives it.
// A thresholded edge, not a power falloff: on dark carbon and thin arms a soft falloff tinted whole
// surfaces orange. The coat weight scales it (paint 1, carbon about a quarter).
const RIM_CHUNK = `{
  vec3 rimDir = normalize((viewMatrix * vec4(uRimDir, 0.)).xyz);
  float rimEdge = smoothstep(uRimPower, 1., 1. - saturate(dot(geometryNormal, geometryViewDir)));
  // Low edges stay out: from the low lateral track take the floor plank's upper face grazes the lens and
  // read as a gold neon line under the car. World height from the view-space position.
  float rimHeight = (transpose(mat3(viewMatrix)) * (-vViewPosition) + cameraPosition).y;
  vec3 rimLight = uRimColor * (uRimStrength * rimEdge * rimEdge * smoothstep(.1, .75, dot(geometryNormal, rimDir)) * smoothstep(.16, .34, rimHeight));
#ifdef USE_CLEARCOAT
  clearcoatSpecularDirect += rimLight;
#else
  reflectedLight.directSpecular += rimLight;
#endif
}
#include <aomap_fragment>`;

function rimPatch(material, uniforms) {
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function (shader, renderer) {
    previous?.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor, uRimDir;\nuniform float uRimStrength, uRimPower;')
      .replace('#include <aomap_fragment>', RIM_CHUNK);
  };
  material.customProgramCacheKey = () => key() + '-rim-v1';
  material.needsUpdate = true;
}

function paintShader(material) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
#ifdef USE_CLEARCOAT
clearcoatSpecularDirect *= ${COAT_DIRECT.toFixed(3)};
#endif`);
  };
  material.customProgramCacheKey = () => 'car-look-paint-v2';
}

// Varyings in object space: the pattern stays glued to the part while it spins or explodes.
function localVaryings(shader, tag) {
  const decl = `\nvarying vec3 v${tag}P;\nvarying vec3 v${tag}N;\n`;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>' + decl)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\nv${tag}P = position;\nv${tag}N = normal;`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>' + decl);
}

function rimShader(material) {
  material.onBeforeCompile = shader => {
    localVaryings(shader, 'Rim');
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
{
  float rr = length(vRimP.yz);
  float face = smoothstep(.45, .75, abs(normalize(vRimN).x));
  float sector = 6.2831853 / 10.0;
  float ang = atan(vRimP.z, vRimP.y);
  float d = abs((fract(ang / sector + .5) - .5) * sector) * rr;
  float halfW = mix(.0135, .009, clamp((rr - .062) / .086, 0., 1.));
  // Rounded window between two spokes, as a distance field in (radius, arc) space.
  vec2 q = vec2(max(.062 - rr, rr - .148), halfW - d) + .008;
  float sd = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - .008;
  float fw = max(fwidth(sd), 1e-5); // derivatives before discard (D3D requirement)
  if (face > .5 && sd < 0.) discard;
  float chamfer = face * (1. - smoothstep(0., .0032 + fw, sd));
  float lip = face * smoothstep(.148, .152, rr);
  float lathe = .5 + .5 * sin(rr * 2600.);
  vec3 gunmetal = vec3(.052, .056, .064);
  vec3 machined = vec3(.40, .42, .45);
  diffuseColor.rgb = mix(gunmetal, machined * (.85 + .15 * lathe), max(lip * .55, chamfer));
  metalnessFactor = .95;
  roughnessFactor = mix(.36, .16 + .08 * lathe, max(lip, chamfer));
}`);
  };
  material.customProgramCacheKey = () => 'car-look-rim-v1';
  material.needsUpdate = true;
}

function tyreShader(material) {
  material.onBeforeCompile = shader => {
    localVaryings(shader, 'Tyre');
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
{
  float rr = length(vTyreP.yz);
  float nx = abs(normalize(vTyreN).x);
  float grain = roughnessFactor / max(roughness, 1e-3);
  float side = smoothstep(.55, .85, nx);
  float shoulder = smoothstep(.12, .4, nx) * (1. - smoothstep(.6, .85, nx));
  float fw = max(fwidth(rr), 1e-5);
  // Front faces only: the inside of the carcass shows through the rim windows.
  float stripe = side * float(gl_FrontFacing) * (smoothstep(.2765 - fw, .2765 + fw, rr) - smoothstep(.2885 - fw, .2885 + fw, rr));
  if (!gl_FrontFacing) diffuseColor.rgb *= .35;
  float bead = side * (1. - smoothstep(.246, .256, rr));
  roughnessFactor = mix(.86, .6, side) * grain;
  roughnessFactor = mix(roughnessFactor, .95, shoulder * .7);
  diffuseColor.rgb *= 1. + shoulder * .45 - bead * .3;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1., .66, .03), stripe);
  roughnessFactor = mix(roughnessFactor, .42, stripe);
}`);
  };
  material.customProgramCacheKey = () => 'car-look-tyre-v1';
  material.needsUpdate = true;
}

// Polar texture for the disc: x = angle, y = radius from the bell to the outer edge.
function discTexture(width) {
  const height = width / 4, canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const g = canvas.getContext('2d');
  let seed = 9127;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const bell = Math.round(height * .376);
  g.fillStyle = '#3e3e41'; g.fillRect(0, 0, width, height);
  for (let y = bell; y < height; y++) { // concentric pad-wear rings
    const v = 58 + random() * 22 | 0;
    g.fillStyle = `rgba(${v},${v},${v + 1},.55)`; g.fillRect(0, y, width, 1);
  }
  const heat = g.createLinearGradient(0, bell, 0, bell + height * .16);
  heat.addColorStop(0, 'rgba(92,70,52,.35)'); heat.addColorStop(1, 'rgba(92,70,52,0)');
  g.fillStyle = heat; g.fillRect(0, bell, width, height * .16);
  g.fillStyle = '#74777c'; g.fillRect(0, 0, width, bell);
  g.fillStyle = '#3a3c40'; g.fillRect(0, bell - 2, width, 3);
  for (let k = 0; k < 8; k++) { g.fillStyle = '#9a9da2'; g.beginPath(); g.ellipse((k + .5) / 8 * width, bell * .55, width * .006, height * .045, 0, 0, Math.PI * 2); g.fill(); }
  const columns = 72, rx = width * .003, ry = height * .02;
  for (let row = 0; row < 3; row++) for (let k = 0; k < columns; k++) {
    const x = (k + row / 3) / columns * width, y = height * (.56 + row * .15);
    g.fillStyle = 'rgba(120,120,122,.5)'; g.beginPath(); g.ellipse(x, y, rx * 1.6, ry * 1.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#070708'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#3c3c3f'; g.fillRect(0, height * .975, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

// Mesmo mapeamento polar do disco: brasa laranja na pista de atrito, apagada no sino.
function heatTexture() {
  const width = 256, height = 64, canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, width, height);
  const ring = g.createLinearGradient(0, height * .4, 0, height);
  ring.addColorStop(0, 'rgba(0,0,0,1)'); ring.addColorStop(.25, 'rgba(255,190,150,1)'); ring.addColorStop(.7, 'rgba(255,120,60,1)'); ring.addColorStop(1, 'rgba(60,20,8,1)');
  g.fillStyle = ring; g.fillRect(0, height * .4, width, height * .6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function discGeometry() {
  const R0 = .045, R1 = .1605, profile = [
    [R0, .058], [.088, .058], [.0885, .0575], [.0885, .016], [.089, .0155], [.16, .0155], [R1, .015], [R1, -.015],
    [.16, -.0155], [.08, -.0155], [.0795, -.015], [.0795, .045], [.079, .0455], [R0, .0455],
  ].map(([r, h]) => new THREE.Vector2(r, h));
  const geometry = new THREE.LatheGeometry(profile, 64);
  const p = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setY(i, (Math.hypot(p.getX(i), p.getZ(i)) - R0) / (R1 - R0));
  geometry.rotateZ(-Math.PI / 2); // lathe axis Y -> axle X, bell towards +X
  return geometry;
}

function caliperGeometry() {
  const inner = .108, outer = .184, half = THREE.MathUtils.degToRad(31), depth = .064, shape = new THREE.Shape();
  const at = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
  const a0 = Math.PI / 2 - half, a1 = Math.PI / 2 + half;
  shape.moveTo(...at(outer, a0));
  shape.absarc(0, 0, outer, a0, a1, false);
  shape.lineTo(...at(inner, a1));
  shape.absarc(0, 0, inner, a1, a0, true);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: true, bevelThickness: .006, bevelSize: .005, bevelSegments: 2, curveSegments: 14});
  geometry.clearGroups(); // one draw call per caliper
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateY(Math.PI / 2); // extrusion -> axle X, arc stays on top (+Y)
  return geometry;
}

export function enhanceCar({model, mechanics, mobile}) {
  const materials = new Map();
  model.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) materials.set(m.uuid, m); });

  // 1. Paint: solid Racing Red base under a thick, glassy clear coat.
  for (const m of materials.values()) {
    if (!m.name.toLowerCase().startsWith('pintura') || !m.isMeshPhysicalMaterial) continue;
    m.color.set(PAINT);
    m.roughness = .42;
    m.metalness = 0;
    m.clearcoat = 1;
    m.clearcoatRoughness = .065; // long strip reflections, soft enough to hide facet ripples
    m.ior = 1.5;
    m.specularIntensity = .3;
    m.envMapIntensity = 1.35;
    paintShader(m);
    m.needsUpdate = true;
  }

  const rimUniforms = {uRimColor: {value: new THREE.Color('#ffa24a')}, uRimDir: {value: new THREE.Vector3(-.2, .75, -.63).normalize()}, uRimStrength: {value: 0}, uRimPower: {value: .72}};
  for (const m of materials.values()) {
    const name = m.name.toLowerCase();
    if (m.isMeshPhysicalMaterial && (name.startsWith('pintura') || name === 'carbono')) rimPatch(m, rimUniforms);
  }
  // Sharing the mid-grey body carbon, the exploded floor read as a translucent editor selection:
  // the floor parts get a darker, glossier copy (same program, own colour and coat).
  let floorCarbon = null;
  for (const r of mechanics.records) if (/^floor/.test(r.source)) r.root.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material) || o.material.name !== 'Carbono') return;
    if (!floorCarbon) {
      const source = o.material;
      floorCarbon = source.clone();
      floorCarbon.name = source.name;
      floorCarbon.onBeforeCompile = source.onBeforeCompile;
      floorCarbon.customProgramCacheKey = source.customProgramCacheKey;
      floorCarbon.color.setScalar(.38);
      floorCarbon.clearcoat = .45;
      floorCarbon.clearcoatRoughness = .14;
    }
    o.material = floorCarbon;
  });
  // The hairline antennas on the nose render as a stray "/\" glyph and loose ticks at lesson distances.
  // Moved off the camera layer: mechanics rewrites record visibility every frame.
  model.traverse(o => { if (o.isMesh && /^antennas__/.test(o.name)) o.layers.set(31); });

  // 2 + 3. Wheel-only material copies, shared by the four wheels (no extra draw calls).
  const owned = [], added = [], holders = [];
  const share = (source, setup) => {
    if (!source.__carLook) { const copy = source.clone(); copy.name = source.name; setup(copy); owned.push(copy); source.__carLook = copy; }
    return source.__carLook;
  };
  const rimSetup = m => { m.map = null; m.clearcoat = .35; m.clearcoatRoughness = .12; m.envMapIntensity = 1.3; rimShader(m); };
  const tyreSetup = m => { m.color.set('#151618'); m.bumpScale = .0003; m.sheen = .18; m.sheenColor.set('#34383d'); m.sheenRoughness = .55; m.envMapIntensity = .8; tyreShader(m); };
  // Wheel hardware (centre nut, bolt liners) as machined titanium: the body steel's
  // tiled normal map sparkles at this scale.
  const nutSetup = m => { m.normalMap = m.roughnessMap = m.bumpMap = null; m.anisotropy = 0; m.color.set('#b9bcc0'); m.metalness = 1; m.roughness = .3; m.envMapIntensity = 1.1; };
  const setups = {rodas: rimSetup, pneus: tyreSetup, 'aço': nutSetup};
  const sources = [];
  for (const w of mechanics.wheels) for (const r of w.members) r.root.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    const setup = setups[o.material.name.toLowerCase()];
    if (setup) { sources.push(o.material); o.material = share(o.material, setup); }
  });
  for (const m of new Set(sources)) delete m.__carLook;

  // Brasa só na pista de atrito (emissiveMap), acesa por race() na frenagem.
  const discMaterial = new THREE.MeshPhysicalMaterial({name: 'Disco de freio', map: discTexture(mobile ? 512 : 1024), emissiveMap: heatTexture(), emissive: '#ff5a1a', emissiveIntensity: 0, metalness: .4, roughness: .4, side: THREE.DoubleSide, envMapIntensity: 1.5});
  // Luz de chuva: o emissor do conjunto traseiro (material do GLB).
  const leds = [];
  for (const m of materials.values()) if (/rear_led/i.test(m.name) && m.emissive) leds.push({material: m, color: m.emissive.clone(), intensity: m.emissiveIntensity, lit: false});
  const caliperMaterial = new THREE.MeshPhysicalMaterial({name: 'Pinça', color: '#b0aca3', metalness: .9, roughness: .3, clearcoat: .4, clearcoatRoughness: .2, envMapIntensity: 1.4});
  const discGeo = discGeometry(), caliperGeo = caliperGeometry();
  const box = new THREE.Box3(), rimCenter = new THREE.Vector3(), tyreCenter = new THREE.Vector3();
  model.updateMatrixWorld(true);
  for (const w of mechanics.wheels) {
    let rim = null, tyre = null, best = -1;
    for (const r of w.members) {
      if (/tire/.test(r.source)) { tyre = r; continue; }
      let hasRim = false;
      r.root.traverse(o => { if (o.isMesh && o.material.name === 'Rodas') hasRim = true; });
      if (hasRim && r.size.x > best) { best = r.size.x; rim = r; }
    }
    if (!rim || !tyre) continue;
    rim.root.worldToLocal(box.setFromObject(rim.root).getCenter(rimCenter));
    rim.root.worldToLocal(box.setFromObject(tyre.root).getCenter(tyreCenter));
    const out = Math.sign(rimCenter.x - tyreCenter.x) || 1;
    const x = rimCenter.x - out * .115;
    const disc = new THREE.Mesh(discGeo, discMaterial);
    disc.name = 'Disco de freio';
    disc.position.set(x, rimCenter.y, rimCenter.z);
    disc.scale.x = out;
    const holder = new THREE.Group();
    holder.position.set(0, rimCenter.y, rimCenter.z);
    const caliper = new THREE.Mesh(caliperGeo, caliperMaterial);
    caliper.name = 'Pinça de freio';
    caliper.position.x = x;
    holder.add(caliper);
    // Caliper sits high and towards the middle of the car, and does not roll with the wheel.
    const zSide = Math.sign(w.pivot.position.z) || 1;
    holders.push({holder, wheel: w, angle: -zSide * THREE.MathUtils.degToRad(38)});
    for (const mesh of [disc, caliper]) { mesh.userData.recordId = rim.id; mesh.receiveShadow = true; added.push(mesh); }
    rim.root.add(disc, holder);
  }

  let first = true;
  return {
    update() {
      if (first) { first = false; for (const mesh of added) mesh.castShadow = false; }
      for (const h of holders) h.holder.rotation.x = h.angle - h.wheel.spinPivot.rotation.x;
    },
    // Rim edge: colour, strength (0 = off), world direction towards the light and edge threshold
    // (1 − N·V where the line starts: lower is a wider band).
    setRim(color, strength, direction, edge = .72) {
      rimUniforms.uRimColor.value.copy(color);
      rimUniforms.uRimStrength.value = Math.max(0, strength);
      rimUniforms.uRimDir.value.copy(direction).normalize();
      rimUniforms.uRimPower.value = edge;
    },
    // Pista: speed 0..1 (pose.speed) e brake 0..1 (desaceleração). A luz de chuva pisca a 4 Hz com
    // o carro andando e fica acesa e mais forte na frenagem; os discos ganham brasa. Sem alocação.
    race(speed, brake, time) {
      const s = speed > 0 ? Math.min(speed, 1) : 0, b = brake > 0 ? Math.min(brake, 1) : 0;
      // Rear light stays lit while running (a bright deep red, not AgX pink), with the 4 Hz flash on top.
      const flash = s > .05 ? s * (.45 + .55 * (Math.sin(time * 25.13) > -.3 ? 1 : 0)) : 0;
      const glow = Math.max(flash, b);
      for (let i = 0; i < leds.length; i++) {
        const led = leds[i];
        if (glow > 0) { led.material.emissive.setRGB(1, .008, .015); led.material.emissiveIntensity = led.intensity + glow * (20 + 14 * b); led.lit = true; }
        else if (led.lit) { led.material.emissive.copy(led.color); led.material.emissiveIntensity = led.intensity; led.lit = false; }
      }
      // Discs heat up as soon as braking starts, not only at the end.
      discMaterial.emissiveIntensity = b * (1.1 + 1.9 * b);
      // Nose dive under braking: pitch about the rear axle (z ≈ −1.84), so the rear stays planted.
      const rest = model.userData.raceRestY ??= model.position.y;
      const dive = .0045 * b * b * (3 - 2 * b);
      model.rotation.x = dive;
      model.position.y = rest - 1.84 * dive;
    },
    dispose() {
      for (const h of holders) h.holder.removeFromParent();
      for (const mesh of added) mesh.removeFromParent();
      discGeo.dispose(); caliperGeo.dispose();
      discMaterial.map.dispose(); discMaterial.emissiveMap.dispose(); discMaterial.dispose(); caliperMaterial.dispose();
      for (const m of owned) m.dispose();
      floorCarbon?.dispose();
    },
  };
}
