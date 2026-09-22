import * as THREE from 'three';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';

// Original Cycles/OptiX assets, shared with the lesson. HDR stays scene-linear;
// lacquer maps are data, never sRGB. GPU work happens once while loading.
export async function loadCyclesFinish({renderer, model, base = './assets/', mobile = false}) {
  const loader = new THREE.TextureLoader();
  const results = await Promise.allSettled([
    new RGBELoader().setDataType(THREE.FloatType).loadAsync(base + (mobile ? 'pitlane-cycles-mobile.hdr' : 'pitlane-cycles.hdr')),
    loader.loadAsync(base + 'lacquer-cycles-normal.png'),
    loader.loadAsync(base + 'lacquer-cycles-roughness.png'),
  ]);
  if (results.some(r => r.status === 'rejected')) {
    for (const r of results) if (r.status === 'fulfilled') r.value.dispose();
    throw new Error('Não foi possível carregar o acabamento Cycles.');
  }
  const [hdr, normal, roughness] = results.map(r => r.value);
  // Cycles emits scene-linear radiance; match its probe exposure to the web
  // key lights before prefiltering, keeping HDR highlights and their ratios.
  for (let i = 0; i < hdr.image.data.length; i += 4) {
    hdr.image.data[i] *= .32;
    hdr.image.data[i + 1] *= .32;
    hdr.image.data[i + 2] *= .32;
  }
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(hdr);
  hdr.dispose(); pmrem.dispose();
  for (const map of [normal, roughness]) {
    map.colorSpace = THREE.NoColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.setScalar(5);
    map.anisotropy = Math.min(mobile ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
  }
  const paints = new Set();
  model.traverse(o => {
    if (!o.isMesh) return;
    for (const material of [].concat(o.material)) {
      if (!material.isMeshPhysicalMaterial || !/^pintura/i.test(material.name) || paints.has(material)) continue;
      paints.add(material);
      material.normalMap = null;
      material.roughnessMap = roughness;
      material.clearcoatNormalMap = normal;
      material.clearcoatNormalScale.setScalar(.12);
      material.clearcoatRoughnessMap = roughness;
      material.needsUpdate = true;
    }
  });
  renderer.domElement.dataset.finish = 'cycles-optix-v1';
  return {environment, dispose() { environment.dispose(); normal.dispose(); roughness.dispose(); }};
}
