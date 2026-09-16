import * as THREE from 'three';

// Chassis internals for the 2026 didactic car. Parent is the model, not main_body:
// explode lifts the shell and leaves this kit in place.
// 2026: smaller fuel cell (~70 kg vs 110), larger Energy Store for 350 kW MGU-K.
// y < 0.40 in the engine bay stays with the chassis when the cover lifts (in-car.js BAY.lip).

export const INTERNALS_KIT_NAME='assembly_internals';
export const INTERNALS={
 fuelCell:[0,.32,-.06],
 battery:[0,.145,-.08],
 oilTank:[0,.32,-.27],
 gearbox:[0,.28,-1.32],
 intercooler:[-.64,.24,.40],
 radiators:[.64,.24,.40],
 heave:[0,.37,1.22],
 airbox:[0,.86,-.38],
 // 2026: compressor lives on the rear turbo, not on the engine face.
 chargeHot:[[-.06,.36,-.94],[-.38,.26,-.22],[-.58,.20,.32]],
 chargeCold:[[-.58,.32,.48],[-.36,.42,-.08],[-.12,.52,-.62]]
};

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

function mat(list,o){
 const m=new THREE.MeshPhysicalMaterial(o);
 list.push(m);
 return m;
}

function packFins(parent,geos,materials,origin,side,fins){
 const group=new THREE.Group();
 group.name=side<0?'internal_intercooler':'internal_radiator_bank';
 group.position.set(...origin);
 group.rotation.x=.68;
 parent.add(group);
 const alum=mat(materials,{color:'#b9c0c6',metalness:.72,roughness:.34});
 add(group,take(geos,new THREE.BoxGeometry(.11,.16,.06)),alum,group.name+'_core');
 const finG=take(geos,new THREE.BoxGeometry(.13,.18,.0035));
 for(let i=0;i<fins;i++){
  const z=(i/(Math.max(1,fins-1))-.5)*.34;
  add(group,finG,alum,group.name+'_fin_'+i,[0,0,z]);
 }
 if(side>0){
  add(group,take(geos,new THREE.BoxGeometry(.12,.07,.08)),mat(materials,{color:'#8a9096',metalness:.65,roughness:.4}),'internal_oil_cooler',[0,.07,.02]);
  add(group,take(geos,new THREE.BoxGeometry(.12,.05,.07)),mat(materials,{color:'#6e8fa8',metalness:.4,roughness:.45}),'internal_battery_cooler',[0,-.08,.02]);
 }
 return group;
}

function take(geos,g){geos.push(g);return g;}

function tripod(parent,geos,materials){
 const steel=mat(materials,{color:'#9aa0a6',metalness:.8,roughness:.32});
 const cup=add(parent,take(geos,new THREE.CylinderGeometry(.028,.022,.03,10)),steel,'internal_tripod_cup',[0,0,0],[Math.PI/2,0,0]);
 const leg=take(geos,new THREE.CylinderGeometry(.005,.005,.04,6));
 for(let i=0;i<3;i++){
  const a=i*(Math.PI*2/3);
  add(parent,leg,steel,'internal_tripod_leg_'+i,[Math.cos(a)*.016,Math.sin(a)*.016,.01],[Math.PI/2,0,a]);
 }
 return cup;
}

function belleville(parent,geos,materials,origin){
 const steel=mat(materials,{color:'#c4c8cc',metalness:.75,roughness:.3});
 for(let i=0;i<6;i++){
  const r=i%2?.03:.02;
  add(parent,take(geos,new THREE.CylinderGeometry(r,i%2?.02:.03,.005,12)),steel,'internal_heave_washer_'+i,[origin[0],origin[1],origin[2]+i*.006],[Math.PI/2,0,0]);
 }
 add(parent,take(geos,new THREE.CylinderGeometry(.015,.015,.2,10)),steel,'internal_heave_damper',origin,[0,0,Math.PI/2]);
}

/** Attach chassis internals. Idempotent. */
export function attachInternalsKit(model,mechanics,{mobile=false}={}){
 const existing=model.getObjectByName(INTERNALS_KIT_NAME);
 if(existing)return existing.userData.kit;
 const geos=[],materials=[];
 const root=new THREE.Group();root.name=INTERNALS_KIT_NAME;model.add(root);

 const kevlar=mat(materials,{color:'#c7a24a',roughness:.78,metalness:.04});
 const liner=mat(materials,{color:'#3a2a1c',roughness:.9,metalness:.02});
 const carbon=mat(materials,{color:'#16181b',roughness:.5,metalness:.08});
 const alum=mat(materials,{color:'#c5c8cc',metalness:.78,roughness:.28});
 const graphite=mat(materials,{color:'#2c3036',metalness:.55,roughness:.42});
 const hv=mat(materials,{color:'#e24a12',roughness:.62,metalness:.05});
 const disc=mat(materials,{color:'#1a1c1e',roughness:.55,metalness:.15});
 const caliper=mat(materials,{color:'#8a9098',metalness:.7,roughness:.35});

 add(root,take(geos,new THREE.BoxGeometry(.32,.2,.2)),kevlar,'internal_fuel_cell',INTERNALS.fuelCell);
 add(root,take(geos,new THREE.BoxGeometry(.28,.002,.16)),liner,'internal_fuel_baffle_h',INTERNALS.fuelCell);
 add(root,take(geos,new THREE.BoxGeometry(.002,.16,.16)),liner,'internal_fuel_baffle_v',INTERNALS.fuelCell);
 add(root,take(geos,new THREE.BoxGeometry(.42,.1,.28)),graphite,'internal_energy_store',INTERNALS.battery);
 add(root,take(geos,new THREE.BoxGeometry(.08,.04,.12)),hv,'internal_energy_terminal',[.14,.145,-.08]);
 add(root,take(geos,new THREE.CylinderGeometry(.065,.07,.16,16)),alum,'internal_oil_tank',INTERNALS.oilTank);
 add(root,take(geos,new THREE.BoxGeometry(.3,.2,.34)),alum,'internal_gearbox',INTERNALS.gearbox);
 add(root,take(geos,new THREE.CylinderGeometry(.07,.07,.08,16)),graphite,'internal_differential',[0,.28,-1.48],[0,0,Math.PI/2]);

 const fins=mobile?5:9;
 packFins(root,geos,materials,INTERNALS.intercooler,-1,fins);
 packFins(root,geos,materials,INTERNALS.radiators,1,fins);

 const hotDuct=new THREE.CatmullRomCurve3(INTERNALS.chargeHot.map(p=>new THREE.Vector3(...p)));
 add(root,take(geos,new THREE.TubeGeometry(hotDuct,12,.016,6,false)),alum,'internal_charge_hot_duct');
 const coldDuct=new THREE.CatmullRomCurve3(INTERNALS.chargeCold.map(p=>new THREE.Vector3(...p)));
 add(root,take(geos,new THREE.TubeGeometry(coldDuct,12,.018,6,false)),carbon,'internal_charge_air_duct');
 const rightPipe=new THREE.CatmullRomCurve3([
  new THREE.Vector3(.52,.22,.18),
  new THREE.Vector3(.22,.20,-.4),
  new THREE.Vector3(.08,.22,-.7)
 ]);
 add(root,take(geos,new THREE.TubeGeometry(rightPipe,10,.012,5,false)),alum,'internal_water_pipe');

 add(root,take(geos,new THREE.BoxGeometry(.16,.035,.08)),alum,'internal_airbox_cooler_l',[-.08,INTERNALS.airbox[1],INTERNALS.airbox[2]]);
 add(root,take(geos,new THREE.BoxGeometry(.16,.035,.08)),alum,'internal_airbox_cooler_r',[.08,INTERNALS.airbox[1],INTERNALS.airbox[2]]);

 belleville(root,geos,materials,INTERNALS.heave);
 for(const side of [-1,1]){
  add(root,take(geos,new THREE.CylinderGeometry(.01,.01,.32,8)),alum,'internal_torsion_'+side,[side*.09,.36,1.18],[Math.PI/2,0,0]);
  add(root,take(geos,new THREE.CylinderGeometry(.008,.008,.55,6)),carbon,'internal_pullrod_'+side,[side*.34,.30,-1.72],[1.05,0,side*.32]);
  add(root,take(geos,new THREE.CylinderGeometry(.009,.009,.18,6)),carbon,'internal_antiroll_'+side,[side*.12,.34,1.22],[0,0,Math.PI/2]);
 }

 model.updateMatrixWorld(true);
 for(const r of mechanics?.records||[]){
  if(!/rear_driveshaft/.test(r.source))continue;
  const holder=new THREE.Group();
  holder.name='internal_tripod_'+(r.center.x>0?'r':'l');
  const world=new THREE.Vector3(
   r.center.x-Math.sign(r.center.x||1)*r.size.x*.38,
   r.center.y,
   r.center.z
  ).add(model.position);
  r.root.worldToLocal(world);
  holder.position.copy(world);
  r.root.add(holder);
  tripod(holder,geos,materials);
 }

 const discG=take(geos,new THREE.CylinderGeometry(.128,.128,.024,28));
 const calG=take(geos,new THREE.BoxGeometry(.05,.04,.08));
 for(const w of mechanics?.wheels||[]){
  const inward=-Math.sign(w.pivot.position.x||1)*.07;
  add(w.spinPivot,discG,disc,'internal_brake_disc',[inward,0,0],[0,0,Math.PI/2]);
  add(w.pivot,calG,caliper,'internal_brake_caliper',[inward,-.11,0]);
 }

 const kit={root,dispose(){
  root.removeFromParent();
  geos.forEach(g=>g.dispose());
  materials.forEach(m=>m.dispose());
 }};
 root.userData.kit=kit;
 return kit;
}
