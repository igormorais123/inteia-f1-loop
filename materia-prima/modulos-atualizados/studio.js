// Lighting and material detail are procedural; the supplied car remains the geometry source.
export function setupStudio(THREE, renderer, scene) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .88;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const environment = new THREE.Scene();
  environment.background = new THREE.Color('#4a4d52');
  const room = new THREE.Mesh(new THREE.BoxGeometry(30, 20, 30), new THREE.MeshBasicMaterial({color: '#404348', side: THREE.BackSide}));
  room.position.y = 8;
  environment.add(room);
  const panel = (w, h, position, power, color = '#ffffff') => {
    const light = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide}));
    light.position.set(...position);
    light.lookAt(0, .7, 0);
    environment.add(light);
  };
  // Large rectangular highlights articulate the bodywork and its clear coat.
  panel(3.2, 10, [-5.5, 6, 0], 2.6, '#fffaf5');
  panel(1.2, 11, [5.7, 4.2, -1.5], 3.2, '#f0f4ff');
  panel(7, 3.0, [0, 9, -1], 2.1);
  panel(5, 2, [0, 4, -9], 1.8, '#f2f5ff');
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(environment, .035, .1, 100);
  scene.environment = target.texture;
  scene.environmentIntensity = .9;
  environment.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  pmrem.dispose();

  const lights = new THREE.Group();
  lights.name = 'Studio lighting';
  const key = new THREE.DirectionalLight('#fffaf5', 1.45);
  key.position.set(-4.5, 7, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {left: -7, right: 7, top: 7, bottom: -7, near: .1, far: 30});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -.00008;
  key.shadow.normalBias = .003;
  key.shadow.radius = 5;
  key.shadow.blurSamples = 12;
  lights.add(key);
  const fill = new THREE.DirectionalLight('#eef3ff', .82);
  fill.position.set(5, 3, -5);
  lights.add(fill);
  const ambient = new THREE.HemisphereLight('#edf1f8', '#77726d', .44);
  lights.add(ambient);
  scene.add(lights);
  const floorMaterial = new THREE.MeshStandardMaterial({color: '#c9c8c5', metalness: .06, roughness: .7});
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMaterial);
  floor.name = 'Studio floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.009;
  floor.receiveShadow = true;
  scene.add(floor);

  const setTheme = dark => {
    const color = dark ? '#171a20' : '#d9d8d5';
    scene.background = new THREE.Color(color);
    scene.fog = new THREE.Fog(color, 20, 65);
    floorMaterial.color.set(dark ? '#20232a' : '#c9c8c5');
    floorMaterial.roughness = dark ? .6 : .7;
    scene.environmentIntensity = dark ? 1.0 : .9;
    renderer.toneMappingExposure = dark ? .92 : .88;
  };
  setTheme(false);
  return {floor, setTheme, update() {}, dispose() {
    target.dispose(); floor.geometry.dispose(); floorMaterial.dispose();
    key.shadow.map?.dispose(); scene.remove(floor, lights);
  }};
}

function texture(THREE, mode) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const image = context.createImageData(256, 256);
  let seed = 73517;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    let value;
    if (mode === 'carbon') {
      const xx = (x + y) % 256, yy = (y - x + 256) % 256;
      const across = ((Math.floor(xx / 16) + Math.floor(yy / 16)) % 4) < 2;
      const coordinate = across ? xx : yy;
      const strand = .5 + .5 * Math.sin(coordinate * Math.PI / 2);
      const bulge = Math.sin((coordinate % 16) / 16 * Math.PI);
      value = 70 + bulge * 70 + strand * 12 + random() * 5;
    } else value = 165 + random() * 50;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const result = new THREE.CanvasTexture(canvas);
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  result.repeat.set(mode === 'carbon' ? 16 : 28, mode === 'carbon' ? 16 : 28);
  result.anisotropy = 8;
  return result;
}

function applyLocalCarbonProjection(material) {
  // Per-object projection follows disassembly/rotation; matrix column lengths
  // retain the physical scale without baking or changing the supplied UVs.
  material.onBeforeCompile = shader => {
    const declarations = `
varying vec3 vCarbonPosition;
varying vec3 vCarbonNormal;
`;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + declarations);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
#include <begin_vertex>
vec3 carbonScale = max(vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz)), vec3(0.00001));
vCarbonPosition = position * carbonScale;
vCarbonNormal = normalize(normal / carbonScale);
`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
#include <common>
${declarations}
vec4 sampleCarbonSurface(sampler2D surfaceMap) {
  vec3 weights = pow(abs(normalize(vCarbonNormal)), vec3(6.0));
  weights /= max(weights.x + weights.y + weights.z, 0.00001);
  vec3 p = vCarbonPosition * 3.0;
  return texture2D(surfaceMap, p.yz) * weights.x
       + texture2D(surfaceMap, p.xz) * weights.y
       + texture2D(surfaceMap, p.xy) * weights.z;
}
`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
#ifdef USE_MAP
  diffuseColor *= sampleCarbonSurface(map);
#endif
`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  roughnessFactor *= sampleCarbonSurface(roughnessMap).g;
#endif
`);
  };
  material.customProgramCacheKey = () => 'carbon-local-triplanar-v1';
}

export function applyCarMaterials(THREE, model) {
  const carbon = texture(THREE, 'carbon'), rubber = texture(THREE, 'rubber');
  carbon.repeat.set(6, 6);
  const carbonToneCanvas = document.createElement('canvas');
  const carbonRoughCanvas = document.createElement('canvas');
  carbonToneCanvas.width = carbonToneCanvas.height = 256;
  carbonRoughCanvas.width = carbonRoughCanvas.height = 256;
  const toneContext = carbonToneCanvas.getContext('2d');
  const roughContext = carbonRoughCanvas.getContext('2d');
  const weave = carbon.image.getContext('2d').getImageData(0, 0, 256, 256);
  const tones = toneContext.createImageData(256, 256);
  const roughness = roughContext.createImageData(256, 256);
  for (let i = 0; i < weave.data.length; i += 4) {
    const fiber = weave.data[i];
    const grey = 35 + fiber * .19;
    tones.data[i] = grey;
    tones.data[i + 1] = grey + 1;
    tones.data[i + 2] = grey + 2;
    tones.data[i + 3] = 255;
    roughness.data[i] = roughness.data[i + 1] = roughness.data[i + 2] = 198 + fiber * .25;
    roughness.data[i + 3] = 255;
  }
  toneContext.putImageData(tones, 0, 0);
  roughContext.putImageData(roughness, 0, 0);
  const carbonTone = new THREE.CanvasTexture(carbonToneCanvas);
  carbonTone.colorSpace = THREE.SRGBColorSpace;
  const carbonRoughness = new THREE.CanvasTexture(carbonRoughCanvas);
  for (const map of [carbonTone, carbonRoughness]) {
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.copy(carbon.repeat);
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = 8;
  }
  const cache = new Map();
  const upgrade = original => {
    if (cache.has(original.uuid)) return cache.get(original.uuid);
    const m = new THREE.MeshPhysicalMaterial();
    THREE.MeshStandardMaterial.prototype.copy.call(m, original);
    m.defines = {STANDARD: '', PHYSICAL: ''};
    m.name = original.name;
    m.envMapIntensity = 1;
    const name = m.name.toLowerCase();
    if (name.startsWith('pintura')) {
      // Solid Rosso Corsa inspired paint; no pigment metal flakes or sponsor maps.
      m.map = null;
      m.normalMap = m.bumpMap = m.roughnessMap = m.metalnessMap = m.aoMap = null;
      m.color.set('#ce0014');
      m.metalness = .0;
      m.roughness = .21;
      m.clearcoat = 1;
      m.clearcoatRoughness = .065;
      m.ior = 1.48;
    } else if (name.includes('carbon')) {
      m.color.set('#d2d4d6');
      m.map = carbonTone;
      m.metalness = .05;
      m.roughness = .43;
      m.bumpMap = null;
      m.bumpScale = .00006;
      m.roughnessMap = carbonRoughness;
      m.normalMap = null;
      m.clearcoat = .35;
      m.clearcoatRoughness = .22;
      m.anisotropy = 0;
      m.envMapIntensity = .9;
      applyLocalCarbonProjection(m);
    } else if (name === 'pneus' || name === 'borracha') {
      m.map = null;
      m.color.set(name === 'pneus' ? '#202124' : '#191a1b');
      m.metalness = 0;
      m.roughness = .72;
      m.roughnessMap = rubber;
      m.bumpMap = rubber;
      m.bumpScale = .00045;
    } else if (name === 'rodas') {
      m.map = null;
      m.color.set('#282b30');
      m.metalness = .78;
      m.roughness = .29;
      m.clearcoat = .2;
      m.clearcoatRoughness = .2;
    } else if (name === 'aço') {
      // The export assigns one steel material to broad internal panels as well
      // as hardware, so use a restrained brushed finish rather than chrome.
      m.color.set('#92999f'); m.metalness = 1; m.roughness = .25;
      m.envMapIntensity = 1;
    } else if (name === 'mirror') {
      m.color.set('#e0e4e7'); m.metalness = 1; m.roughness = .055;
    } else if (name === 'vidro') {
      m.color.set('#bccbd0'); m.roughness = .1; m.metalness = .12;
      m.transparent = true; m.opacity = .38; m.depthWrite = false;
      m.clearcoat = 1; m.clearcoatRoughness = .06;
    }
    m.needsUpdate = true;
    cache.set(original.uuid, m);
    return m;
  };
  model.traverse(o => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(upgrade) : upgrade(o.material);
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return {materials: [...cache.values()], dispose() {cache.forEach(m => m.dispose()); carbon.dispose(); carbonTone.dispose(); carbonRoughness.dispose(); rubber.dispose();}};
}
