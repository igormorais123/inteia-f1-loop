import * as THREE from 'three';

// 2026 didactic overlay. The shipped GLB is an original INTEIA V6 with MGU-K and a rear turbo.
// 2014–2025 Animagraffs architecture (split-turbo + MGU-H in the V) is illegal in 2026:
// FIA deletes the MGU-H, deletes variable intake trumpets, and raises MGU-K to 350 kW (~50/50 split).
// References: formula1.com 2026 PU explainer; FIA 2026 Power Unit Technical Regulations.

export const HYBRID_KIT_NAME='assembly_ers';
export const HYBRID_KIT={
 mguk:[.215,.22,-.065],
 trumpetsZ:[-.02,.09,.20],
 iceKw:400,
 mgukKw:350,
 fuelKg:70
};

function cloneNamed(unit,test,fallback){
 let found=null;
 unit.traverse(o=>{
  if(found||!o.isMesh)return;
  for(const m of [].concat(o.material)){
   if(m?.name&&test(m.name.toLowerCase())){found=m;return;}
  }
 });
 return found?found.clone():new THREE.MeshPhysicalMaterial(fallback);
}

function bellmouth(){
 const pts=[];
 for(let i=0;i<=12;i++){
  const t=i/12;
  pts.push(new THREE.Vector2(.011+.018*Math.pow(t,.5),.002+.052*t));
 }
 return new THREE.LatheGeometry(pts,20);
}

function add(parent,geometry,material,name,position,rotation){
 const mesh=new THREE.Mesh(geometry,material);
 mesh.name=name;
 if(position)mesh.position.set(...position);
 if(rotation)mesh.rotation.set(...rotation);
 mesh.castShadow=true;
 mesh.receiveShadow=true;
 parent.add(mesh);
 return mesh;
}

/** Attach 2026 ERS parts. Idempotent. Returns the kit root. */
export function attachHybridKit(unit){
 const existing=unit.getObjectByName(HYBRID_KIT_NAME);
 if(existing)return existing;

 const graphite=cloneNamed(unit,n=>n.includes('graphite'),{color:'#2b2e32',metalness:.55,roughness:.42});
 const aluminium=cloneNamed(unit,n=>n.includes('machined'),{color:'#c5c8cc',metalness:.78,roughness:.28});
 const carbon=cloneNamed(unit,n=>n.includes('carbon')||n.includes('twill'),{color:'#141618',roughness:.48,metalness:.08});
 const hv=cloneNamed(unit,n=>n.includes('high voltage')||n.includes('insulation'),{color:'#e24a12',roughness:.62,metalness:.05});
 const patina=cloneNamed(unit,n=>n.includes('patina'),{color:'#6a5344',metalness:.55,roughness:.46});
 graphite.name='Hybrid anodized graphite';
 aluminium.name='Hybrid machined aluminium';
 carbon.name='Hybrid carbon twill';
 hv.name='Hybrid high voltage insulation';
 patina.name='Hybrid exhaust patina';

 const kit=new THREE.Group();kit.name=HYBRID_KIT_NAME;unit.add(kit);
 const intake=unit.getObjectByName('assembly_intake')||kit;
 const turbo=unit.getObjectByName('assembly_turbo')||kit;
 const electric=unit.getObjectByName('assembly_electric')||kit;

 // 2026 MGU-K is ~3× the old 120 kW unit (350 kW, ≥16 kg). Jacket around the existing electric cluster.
 add(electric,new THREE.CylinderGeometry(.072,.068,.16,24),carbon,'hybrid_mguk_stator',HYBRID_KIT.mguk,[0,0,Math.PI/2]);
 add(electric,new THREE.CylinderGeometry(.048,.048,.12,16),aluminium,'hybrid_mguk_rotor',HYBRID_KIT.mguk,[0,0,Math.PI/2]);
 add(electric,new THREE.CylinderGeometry(.074,.074,.012,20),graphite,'hybrid_mguk_end',[HYBRID_KIT.mguk[0]+.08,HYBRID_KIT.mguk[1],HYBRID_KIT.mguk[2]],[0,0,Math.PI/2]);
 const lead=new THREE.CatmullRomCurve3([
  new THREE.Vector3(.26,.22,-.06),
  new THREE.Vector3(.18,.16,-.08),
  new THREE.Vector3(.06,.12,-.10),
  new THREE.Vector3(0,.10,-.08)
 ]);
 add(kit,new THREE.TubeGeometry(lead,12,.008,6,false),hv,'hybrid_mguk_hv_lead');

 // Fixed trumpets: 2026 deletes variable stacks and their actuators.
 const trumpet=bellmouth();
 for(const side of [-1,1]){
  for(const z of HYBRID_KIT.trumpetsZ){
   add(intake,trumpet,aluminium,`hybrid_trumpet_${side>0?'r':'l'}_${z}`,[side*.125,.495,z],[0,0,side*.55]);
  }
 }
 add(intake,new THREE.BoxGeometry(.09,.03,.28),carbon,'hybrid_plenum_left',[-.13,.555,.09]);
 add(intake,new THREE.BoxGeometry(.09,.03,.28),carbon,'hybrid_plenum_right',[.13,.555,.09]);

 for(const side of [-1,1]){
  add(turbo,new THREE.CylinderGeometry(.012,.012,.07,10),patina,`hybrid_wastegate_valve_${side>0?'r':'l'}`,[side*.055,.42,-.52],[.4,0,side*.2]);
  add(turbo,new THREE.CylinderGeometry(.009,.009,.11,8),patina,`hybrid_wastegate_pipe_${side>0?'r':'l'}`,[side*.04,.36,-.60],[1.15,0,0]);
 }

 kit.userData.hybridKit=true;
 kit.userData.regulation=2026;
 return kit;
}

export function hybridKitBounds(unit){
 const kit=unit.getObjectByName(HYBRID_KIT_NAME);
 if(!kit)return null;
 return new THREE.Box3().setFromObject(kit);
}
