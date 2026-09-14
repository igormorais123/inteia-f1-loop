import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {engineShot} from './engine-shot.js';

// Engine bay in the car model frame (tools/car-hull.json): from behind the cockpit rim to the tail,
// above the sidepod lip. The body shell is one mesh, so the cover is the same geometry split by planes.
const BAY={front:-.15,rear:-2.1,lip:.40};
// Seated on the floor (top ≈0.14 m) with the crank on the car centreline, turbo towards the gearbox.
const ENGINE_AT=new THREE.Vector3(0,.43,-.72),ENGINE_LENGTH=.85;
// The authored clip turns the crank 4 times in 8 s; 1.5× reads as 45 rpm: legible, no strobing at 30 fps.
const CLIP_RATE=1.5,WORK_LIGHT=2.6;
const HINGE=new THREE.Vector3(0,.75,-.9);
// Same cut as the car (scene.js): parts under a few centimetres add shadow triangles but no readable shadow.
const SHADOW_RADIUS=.09,UPLOAD_TRIANGLES=60000;
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const aborted=()=>new DOMException('Motor cancelado','AbortError');

/**
 * Engine of chapter 07 inside the host scene: no extra canvas, camera or loop.
 * The 4.6 MB power unit is fetched only by prepare() (near the chapter), can be cancelled (reading mode,
 * the scene signal) and fails alone: until it is ready the car simply stays closed.
 */
export function createInCarEngine({scene,renderer,camera,model,mechanics,target,mobile=false,signal=null,offstage=()=>[]}){
 renderer.localClippingEnabled=true;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 // Warm work light over the bay. It joins the scene only while the bay is open (the light count of every
 // material changes), and the programs for that count are compiled in prepare().
 const light=new THREE.PointLight('#ffb36b',0,3.4,1.6);light.name='Luz de trabalho do motor';light.position.set(.6,1.5,-.35);
 const root=new THREE.Group();root.name='Motor no compartimento';root.position.copy(ENGINE_AT);root.visible=false;scene.add(root);

 let state='idle',ready=false,disposed=false,split=false,reveal=0,abort=null,mixer=null;
 const groups=[],engineGeometries=new Set(),engineMaterials=new Set(),engineTextures=new Set(),cutMaterials=new Map(),satinMaterials=new Map();
 // Section plane: keeps x < constant; swept from outside the engine to the crank centreline.
 const cutPlane=new THREE.Plane(new THREE.Vector3(-1,0,0),.7);

 const body=mechanics.records.find(r=>r.source==='main_body');
 const lifted=mechanics.records.filter(r=>/^top_intake_details/.test(r.source));
 const cover=new THREE.Group();cover.name='Tampa do motor';cover.visible=false;
 const bodyMeshes=[],original=new Map(),castShadow=new Map(),coverMaterials=new Map(),restMaterials=new Map();
 const coverLocal=[new THREE.Plane(new THREE.Vector3(0,0,-1),BAY.front),new THREE.Plane(new THREE.Vector3(0,0,1),-BAY.rear),new THREE.Plane(new THREE.Vector3(0,1,0),-BAY.lip)];
 const restLocal=coverLocal.map(p=>p.clone().negate());
 const coverPlanes=coverLocal.map(p=>p.clone()),restPlanes=restLocal.map(p=>p.clone());
 const turn=new THREE.Quaternion(),axisX=new THREE.Vector3(1,0,0),pivot=new THREE.Vector3(),coverWorld=new THREE.Matrix4();

 // Reading mode (main.js puts .reading on the body) stops a download in progress; cinema mode asks again.
 const cancel=()=>{if(state==='loading')abort?.abort();};
 const observer=new MutationObserver(()=>{if(document.body.classList.contains('reading'))cancel();});
 observer.observe(document.body,{attributes:true,attributeFilter:['class']});
 signal?.addEventListener('abort',cancel,{once:true});

 // Same program as the car material plus its clipping planes (car-look and surface patches stay on).
 const derive=(material,planes,intersection)=>{const c=material.clone();c.name=material.name;c.onBeforeCompile=material.onBeforeCompile;c.customProgramCacheKey=material.customProgramCacheKey;c.clippingPlanes=planes;c.clipIntersection=intersection;return c;};
 function buildSplit(){
  model.updateMatrixWorld(true);
  const inverse=new THREE.Matrix4().copy(model.matrixWorld).invert();
  const twin=(mesh,material)=>{const t=new THREE.Mesh(mesh.geometry,material);t.name=mesh.name+' (tampa)';t.matrixAutoUpdate=false;t.matrix.multiplyMatrices(inverse,mesh.matrixWorld);t.renderOrder=mesh.renderOrder;t.layers.mask=mesh.layers.mask;t.receiveShadow=true;t.castShadow=false;cover.add(t);};
  body.root.traverse(o=>{
   if(!o.isMesh||Array.isArray(o.material))return;
   bodyMeshes.push(o);original.set(o,o.material);castShadow.set(o,o.castShadow);
   if(!coverMaterials.has(o.material)){coverMaterials.set(o.material,derive(o.material,coverPlanes,false));restMaterials.set(o.material,derive(o.material,restPlanes,true));}
   twin(o,coverMaterials.get(o.material));
  });
  for(const r of lifted)r.root.traverse(o=>{if(o.isMesh)twin(o,o.material);});
  model.add(cover);
 }
 function setSplit(on){
  split=on;cover.visible=on;
  // The open shell casts no shadow into the bay; the closed car keeps its own.
  for(const m of bodyMeshes){const base=original.get(m);m.material=on?restMaterials.get(base):base;m.castShadow=on?false:castShadow.get(m);}
  for(const r of lifted){r.hidden=on;r.root.visible=!on;}
  if(on)scene.add(light);else light.removeFromParent();
 }
 function poseCover(open){
  const lift=smooth(open);
  // Lifts straight out of the lens (the close-ups look down into the bay) with a slight nose-up tilt.
  turn.setFromAxisAngle(axisX,-.2*lift);cover.quaternion.copy(turn);
  cover.position.copy(HINGE).sub(pivot.copy(HINGE).applyQuaternion(turn));cover.position.y+=1.9*lift;cover.position.z-=.2*lift;
  cover.updateMatrix();model.updateMatrixWorld();
  coverWorld.multiplyMatrices(model.matrixWorld,cover.matrix);
  for(let i=0;i<3;i++){coverPlanes[i].copy(coverLocal[i]).applyMatrix4(coverWorld);restPlanes[i].copy(restLocal[i]).applyMatrix4(model.matrixWorld);}
 }

 function collect(object){
  object.traverse(o=>{if(!o.isMesh)return;engineGeometries.add(o.geometry);for(const m of [].concat(o.material)){engineMaterials.add(m);for(const v of Object.values(m))if(v?.isTexture)engineTextures.add(v);}});
 }
 function buildEngine(gltf){
  const unit=gltf.scene,bounds=new THREE.Box3().setFromObject(unit),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const scale=ENGINE_LENGTH/Math.max(size.x,size.y,size.z);
  root.scale.setScalar(scale);unit.position.sub(center);root.add(unit);
  unit.updateMatrixWorld(true);
  const worldScale=new THREE.Vector3();
  unit.traverse(o=>{
   if(o.isMesh){
    if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();
    // Phones draw no engine shadow; desktop keeps it on the large castings only.
    o.castShadow=!mobile&&o.geometry.boundingSphere.radius*o.getWorldScale(worldScale).x>SHADOW_RADIUS;o.receiveShadow=true;
   }
   if(!/^assembly_/.test(o.name))return;
   // Moving parts and the turbo stay whole; the static block, heads, exhausts, intake and MGU-K are sectioned.
   groups.push({object:o,cut:!/rotating|turbo/.test(o.name),hiddenWhenCut:/head_right|exhaust_right|electric/.test(o.name)});
  });
  const sectioned=m=>{if(!cutMaterials.has(m)){const c=m.clone();c.clippingPlanes=[cutPlane];c.side=THREE.DoubleSide;cutMaterials.set(m,c);}return cutMaterials.get(m);};
  // Moving parts in polished metal (roughness 0.22–0.39) flare white under the close work light: a satin copy
  // keeps the pistons, rods and crank readable in the section.
  const satin=m=>{if(!satinMaterials.has(m)){const c=m.clone();c.roughness=Math.max(c.roughness,.46);c.envMapIntensity=.8;satinMaterials.set(m,c);}return satinMaterials.get(m);};
  for(const g of groups){const swap=g.cut?sectioned:/rotating/.test(g.object.name)?satin:null;if(swap)g.object.traverse(o=>{if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(swap):swap(o.material);});}
  mixer=new THREE.AnimationMixer(unit);for(const clip of gltf.animations)mixer.clipAction(clip).play();
 }
 // First entry without a stall: programs for the open bay and the work light are compiled against the
 // composer buffer (programs are keyed by the target) without touching the frame on screen (compile walks
 // hidden objects; the light is attached only while compiling). Other worlds are left out. One compile of the
 // whole scene took 415 ms on a 4× slowed phone, so it runs one material at a time within a small budget per frame.
 async function precompile(){
  const skip=new Set(offstage().filter(Boolean)),seen=new Set(),queue=[];
  const add=mesh=>{const fresh=[].concat(mesh.material).some(m=>!seen.has(m));if(!fresh)return;[].concat(mesh.material).forEach(m=>seen.add(m));queue.push(mesh);};
  (function walk(o){if(skip.has(o))return;if(o.isMesh||o.isPoints||o.isLine||o.isSprite)add(o);for(const c of o.children)walk(c);})(scene);
  for(const m of bodyMeshes)add(new THREE.Mesh(m.geometry,restMaterials.get(original.get(m))));
  const budget=mobile?8:12,pending=[];
  while(queue.length&&!disposed){
   const start=performance.now(),previous=renderer.getRenderTarget();
   try{
    scene.add(light);renderer.setRenderTarget(target());
    // compileAsync runs the same synchronous compile and resolves once the programs finished linking in parallel.
    do pending.push(renderer.compileAsync(queue.shift(),camera,scene));while(queue.length&&performance.now()-start<budget);
   }finally{renderer.setRenderTarget(previous);light.removeFromParent();}
   await nextFrame();
  }
  // The first render with a program still linking blocks until all of them finish (350 ms on a 4× slowed phone).
  await Promise.all(pending);
 }
 // Textures and vertex buffers reach the GPU in small batches, one per frame, while the student reads Encerrar.
 async function upload(){
  for(const texture of engineTextures)renderer.initTexture(texture);
  const stage=new THREE.Scene(),basic=new THREE.MeshBasicMaterial(),buffer=new THREE.WebGLRenderTarget(1,1);stage.overrideMaterial=basic;
  const meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o);});cover.traverse(o=>{if(o.isMesh)meshes.push(o);});
  let triangles=0;
  const flush=async()=>{
   if(!stage.children.length)return;
   const previous=renderer.getRenderTarget();renderer.setRenderTarget(buffer);renderer.render(stage,camera);renderer.setRenderTarget(previous);
   stage.clear();triangles=0;await nextFrame();
  };
  try{
   for(const mesh of meshes){
    if(disposed)return;
    const proxy=new THREE.Mesh(mesh.geometry,basic);proxy.frustumCulled=false;stage.add(proxy);
    triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
    if(triangles>=UPLOAD_TRIANGLES)await flush();
   }
   await flush();
  }finally{buffer.dispose();basic.dispose();}
 }
 async function load(){
  abort=new AbortController();
  const response=await fetch(`${import.meta.env.BASE_URL}assets/power-unit-v1.glb`,{signal:abort.signal});
  if(!response.ok)throw new Error('Motor HTTP '+response.status);
  const bytes=await response.arrayBuffer();
  await MeshoptDecoder.ready;
  if(abort.signal.aborted)throw aborted();
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,`${import.meta.env.BASE_URL}assets/`);
  collect(gltf.scene);
  if(disposed||abort.signal.aborted){releaseEngine();throw aborted();}
  // From here the work is local (no network) and finishes even if reading mode is chosen meanwhile.
  buildSplit();buildEngine(gltf);
  await precompile();
  if(disposed)return;
  await upload();
  if(disposed)return;
  await rehearse();
  if(!disposed){ready=true;state='ready';}
 }
 // Each lesson looks where the story never did (garage corners, rear wing, shadow casters): the first cold pass
 // spiked 106–381 ms on a 4× slowed phone (pub07 r6). The real scene is rendered once from each lesson view,
 // off screen into the composer buffer, one view per frame while Encerrar is read; the closed car is restored.
 async function rehearse(){
  const view=camera.clone(),aim=new THREE.Vector3();
  for(const p of [.2,.38,.61,.72,.84]){
   if(disposed)return;
   const take=engineShot(p,mobile),wasSplit=split,wasVisible=root.visible,constant=cutPlane.constant,previous=renderer.getRenderTarget();
   view.copy(camera);view.position.fromArray(take.camera);view.fov=take.fov;view.updateProjectionMatrix();view.lookAt(aim.fromArray(take.target));view.updateMatrixWorld();
   try{
    setSplit(true);root.visible=true;poseCover(take.open);cutPlane.constant=THREE.MathUtils.lerp(.7,.004,smooth(take.cut));
    renderer.setRenderTarget(target());renderer.render(scene,view);
   }finally{
    renderer.setRenderTarget(previous);cutPlane.constant=constant;root.visible=wasVisible;if(!wasSplit)setSplit(false);
   }
   await nextFrame();
  }
 }
 function releaseEngine(){
  engineGeometries.forEach(g=>g.dispose());engineMaterials.forEach(m=>m.dispose());cutMaterials.forEach(m=>m.dispose());satinMaterials.forEach(m=>m.dispose());engineTextures.forEach(t=>t.dispose());
  engineGeometries.clear();engineMaterials.clear();cutMaterials.clear();satinMaterials.clear();engineTextures.clear();
 }

 return {
  root,light,
  get state(){return state;},
  get ready(){return ready;},
  /** Starts the download once (again after a cancel); a failure leaves the car closed for the session. */
  prepare(){
   if(state!=='idle'||disposed||document.body.classList.contains('reading'))return;
   state='loading';
   load().catch(error=>{
    if(disposed)return;
    if(error?.name==='AbortError'){state='idle';return;}
    state='failed';console.warn('Capítulo 07: motor indisponível; o carro segue fechado.',error);
   });
  },
  /** shot: engineShot() of the chapter (null outside it). */
  update(dt,shot,paused){
   reveal+=((ready?1:0)-reveal)*(1-Math.exp(-dt*3));if(reveal>.999)reveal=1;
   const open=(shot?shot.open:0)*reveal,on=ready&&open>.001;
   if(on!==split)setSplit(on);
   root.visible=on;
   if(!on)return;
   poseCover(open);
   light.intensity=shot.light*reveal*WORK_LIGHT;
   const cut=shot.cut;
   cutPlane.constant=THREE.MathUtils.lerp(.7,.004,smooth(cut));
   for(const g of groups)g.object.visible=!(g.hiddenWhenCut&&cut>.999);
   if(!paused&&!reduced.matches)mixer.update(dt*CLIP_RATE);
  },
  dispose(){
   disposed=true;abort?.abort();observer.disconnect();signal?.removeEventListener('abort',cancel);
   if(split)setSplit(false);
   cover.removeFromParent();coverMaterials.forEach(m=>m.dispose());restMaterials.forEach(m=>m.dispose());
   light.removeFromParent();light.dispose();
   if(mixer){mixer.stopAllAction();mixer.uncacheRoot(mixer.getRoot());}
   root.removeFromParent();
   releaseEngine();
  }
 };
}
