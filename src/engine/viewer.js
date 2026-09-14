import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import './viewer.css';

let active=false;
const smooth=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
const mix=THREE.MathUtils.lerp;
const source='https://www.formula1.com/en/latest/article/2026-regulations-explained-all-you-need-to-know-about-f1s-new-power-units.14jfv7a36905uDJDdNyfQd';

/** A self-contained inspection within the lesson; only one active motor renderer. */
export async function openEngine({opener=document.activeElement}={}){
 if(active)return;active=true;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const dialog=document.createElement('dialog');dialog.className='engine-dialog';dialog.setAttribute('aria-labelledby','engine-title');
 dialog.innerHTML=`<div class="engine-stage" aria-label="Motor tridimensional. Arraste para girar e use a roda do mouse para aproximar."></div><div class="engine-top"><span class="engine-mark">INTEIA / MOTOR V6</span><button class="engine-close" type="button">Voltar à aula ↗</button></div><div class="engine-caption"><p class="engine-kicker">01 / CONJUNTO MONTADO</p><h2 id="engine-title">MOTOR<br>V6 TURBO</h2><p class="engine-explanation">Pistões, bielas e virabrequim trabalham juntos. Interrompa o ciclo para ver as conexões.</p></div><p class="engine-status" role="status">Preparando o motor…</p><div class="engine-bottom"><div><div class="engine-controls"><button data-engine="reveal" disabled>Parar e abrir</button><button data-engine="run" disabled>Girar o ciclo</button><button data-engine="reset" disabled>Recompor</button></div><span class="engine-hint">Arraste para olhar de outro ângulo · role para aproximar</span></div><p class="engine-footnote"><a class="engine-source" href="${source}" target="_blank" rel="noopener">Arquitetura V6 turbo / referência F1 ↗</a></p></div>`;
 document.body.append(dialog);document.body.classList.add('engine-open');window.dispatchEvent(new Event('engine:opened'));dialog.showModal();
 const stage=dialog.querySelector('.engine-stage'),status=dialog.querySelector('.engine-status'),buttons=[...dialog.querySelectorAll('[data-engine]')];
 let renderer,controls,environment,model,mixer,frame=0,closed=false,last=0,time=0,phase='assembled',phaseTime=0,openAmount=0,openStart=0,speedStart=0,speed=0,assemblies=[];
 const geometries=new Set(),materials=new Set(),textures=new Set();
 const close=()=>{if(closed)return;closed=true;cancelAnimationFrame(frame);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);controls?.dispose();mixer?.stopAllAction();mixer?.uncacheRoot(model);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());environment?.dispose();renderer?.dispose();renderer?.forceContextLoss();dialog.remove();document.body.classList.remove('engine-open');active=false;opener?.focus({preventScroll:true});window.dispatchEvent(new Event('engine:closed'));};
 dialog.querySelector('.engine-close').onclick=()=>dialog.close();dialog.addEventListener('close',close,{once:true});
 let scene,camera,centre,size=1,home,target,interacted=false;
 const resize=()=>{if(!renderer)return;const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;if(w<760)camera.clearViewOffset();else camera.setViewOffset(w,h,-w*.11,0,w,h);camera.updateProjectionMatrix();if(centre){home=centre.clone().add(new THREE.Vector3(size*1.9,size*1.25,size*2.2).multiplyScalar(w<760?1.3:1));target=centre.clone();target.y+=size*(w<760?.16:0);interacted=false;}};
 const visibility=()=>{last=0;};
 function caption(step,title,body){dialog.querySelector('.engine-kicker').textContent=step;dialog.querySelector('h2').innerHTML=title;dialog.querySelector('.engine-explanation').textContent=body;}
 function reveal(){openStart=openAmount;speedStart=speed;phase='reveal';phaseTime=0;interacted=false;controls.autoRotate=false;caption('02 / INSPEÇÃO','CONJUNTO<br>ABERTO','O virabrequim para. Bloco, admissão, cabeçotes e turbo se afastam para revelar o mecanismo.');if(reduced){openAmount=1;speed=0;phase='open';}}
 function run(){phase='running';phaseTime=0;speed=.25;caption('03 / CICLO MECÂNICO','PISTÕES E<br>VIRABREQUIM','As bielas ligam os pistões ao virabrequim. Gire a vista para acompanhar o movimento.');}
 function reset(){openStart=openAmount;phase='return';phaseTime=0;interacted=false;caption('01 / CONJUNTO MONTADO','MOTOR<br>V6 TURBO','Pistões, bielas e virabrequim trabalham juntos. Interrompa o ciclo para ver as conexões.');if(reduced){openAmount=0;speed=0;phase='assembled';}}
 buttons.forEach(b=>b.onclick=()=>({reveal,run,reset}[b.dataset.engine]()));
 try{
  scene=new THREE.Scene();scene.background=new THREE.Color('#080d10');
  camera=new THREE.PerspectiveCamera(33,1,.01,60);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<760?1.5:1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;stage.append(renderer.domElement);
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();environment=pmrem.fromScene(room,.05);scene.environment=environment.texture;scene.environmentIntensity=.6;room.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#d7e6f0','#1e1110',1));
  const key=new THREE.DirectionalLight('#f4e5d1',4);key.position.set(3,5,4);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.normalBias=.015;scene.add(key);
  const rim=new THREE.DirectionalLight('#8ccae7',3);rim.position.set(-3,2,-3);scene.add(rim);
  const warm=new THREE.DirectionalLight('#f48c5b',1.5);warm.position.set(1,0,-3);scene.add(warm);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;controls.enablePan=false;controls.autoRotate=false;controls.maxPolarAngle=Math.PI*.85;controls.addEventListener('start',()=>{interacted=true;});
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(new URL('assets/power-unit-v1.glb',document.baseURI).href,e=>{if(!closed&&e.total)status.textContent=`Montando o motor · ${Math.round(e.loaded/e.total*100)}%`;});
  model=gltf.scene;
  model.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);for(const mat of Array.isArray(o.material)?o.material:[o.material]){materials.add(mat);for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);}o.castShadow=true;o.receiveShadow=true;}});
  if(closed){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());return;}
  scene.add(model);model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model);centre=bounds.getCenter(new THREE.Vector3());const dimensions=bounds.getSize(new THREE.Vector3());size=Math.max(dimensions.x,dimensions.y,dimensions.z);
  const mobile=innerWidth<760;target=centre.clone();target.y+=size*(mobile?.16:0);home=centre.clone().add(new THREE.Vector3(size*1.9,size*1.25,size*2.2));if(mobile)home.sub(centre).multiplyScalar(1.3).add(centre);camera.position.copy(home);controls.target.copy(target);controls.minDistance=size*.8;controls.maxDistance=size*10;
  // Leave room for the desktop caption without moving the physical assembly.
  if(!mobile)camera.setViewOffset(stage.clientWidth,stage.clientHeight,-stage.clientWidth*.11,0,stage.clientWidth,stage.clientHeight);
  model.traverse(o=>{if(/^assembly_/.test(o.name)){const name=o.name.toLowerCase();let direction=new THREE.Vector3();if(name.includes('left'))direction.set(-1,.55,0);else if(name.includes('right'))direction.set(1,.55,0);else if(name.includes('intake'))direction.set(0,1.5,0);else if(name.includes('turbo'))direction.set(0,.25,-1.1);else if(name.includes('electric'))direction.set(1,.05,-.4);else if(name.includes('block'))direction.set(0,-.8,0);else if(name.includes('head'))direction.set(0,1,0);assemblies.push({object:o,base:o.position.clone(),offset:direction.multiplyScalar(size*.43)});}});
  mixer=new THREE.AnimationMixer(model);gltf.animations.forEach(clip=>mixer.clipAction(clip).play());mixer.update(0);
  const floorGeo=new THREE.CircleGeometry(size*1.8,96),floorMat=new THREE.MeshBasicMaterial({color:'#0a1014',toneMapped:false});geometries.add(floorGeo);materials.add(floorMat);const floor=new THREE.Mesh(floorGeo,floorMat);floor.rotation.x=-Math.PI/2;floor.position.set(centre.x,bounds.min.y-size*.7,centre.z);floor.receiveShadow=true;scene.add(floor);
  resize();window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);buttons.forEach(b=>b.disabled=false);if(reduced)buttons.find(b=>b.dataset.engine==='reveal').textContent='Abrir o conjunto';status.textContent='';dialog.querySelector('.engine-close').focus();
  
  if(!reduced){phase='running';speed=.25;}else caption('01 / INSPEÇÃO SEM MOVIMENTO','MOTOR<br>V6 TURBO','Abra o conjunto ou gire o ciclo quando quiser. A animação automática está desativada.');
  function tick(now){if(closed)return;frame=requestAnimationFrame(tick);if(document.hidden){last=0;return;}const dt=last?Math.min((now-last)/1000,.04):0;last=now;time+=dt;phaseTime+=dt;
   if(phase==='reveal'){speed=mix(speedStart,0,smooth(phaseTime/1.4));openAmount=mix(openStart,1,smooth((phaseTime-1.1)/2.8));if(phaseTime>4){phase='open';speed=0;}}
   else if(phase==='return'){openAmount=mix(openStart,0,smooth(phaseTime/2.4));speed=0;if(phaseTime>2.4){phase='assembled';openAmount=0;}}
   if(mixer&&speed)mixer.update(dt*speed);
   for(const a of assemblies)a.object.position.copy(a.base).addScaledVector(a.offset,openAmount);
   if(!interacted){const orbit=reduced?0:openAmount*.32,base=home.clone().sub(centre);base.applyAxisAngle(new THREE.Vector3(0,1,0),orbit);camera.position.copy(centre).add(base.multiplyScalar(1+openAmount*(stage.clientWidth<760?.9:.55)));controls.target.copy(target);controls.target.y+=size*.2*openAmount;}
   controls.update();renderer.render(scene,camera);
  }
  frame=requestAnimationFrame(tick);
  if(new URLSearchParams(location.search).has('debug'))window.__engine={model,scene,camera,renderer,mixer,assemblies,reveal,run,reset,get phase(){return phase;},get openAmount(){return openAmount;}};
 }catch(error){console.error('Motor 3D:',error);status.textContent='Não foi possível abrir o motor 3D. Volte à aula e tente novamente.';}
}
