import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {attachHybridKit, HYBRID_KIT_NAME, HYBRID_KIT} from '../src/engine/hybrid-kit.js';
import {ENGINE_PARTS} from '../src/engine/engine-shot.js';

function dummyUnit(){
 const unit=new THREE.Group();
 for(const name of ['assembly_intake','assembly_turbo','assembly_electric']){
  const g=new THREE.Group();g.name=name;unit.add(g);
 }
 const hull=new THREE.Mesh(new THREE.BoxGeometry(.71,.57,.95),new THREE.MeshStandardMaterial({name:'Machined aluminium · bright edges'}));
 hull.position.set(0,.28,0);unit.add(hull);
 return unit;
}

test('2026 hybrid kit enlarges MGU-K, keeps fixed trumpets and has no MGU-H',()=>{
 const unit=dummyUnit();
 const first=attachHybridKit(unit);
 const second=attachHybridKit(unit);
 assert.equal(first,second);
 assert.equal(unit.getObjectByName(HYBRID_KIT_NAME),first);
 assert.equal(first.userData.regulation,2026);
 assert.ok(unit.getObjectByName('hybrid_mguk_stator'));
 assert.ok(unit.getObjectByName('hybrid_mguk_rotor'));
 assert.ok(unit.getObjectByName('hybrid_mguk_hv_lead'));
 assert.equal(unit.getObjectByName('hybrid_mguh_stator'),undefined);
 assert.equal(unit.getObjectByName('hybrid_split_shaft'),undefined);
 const trumpets=[];
 unit.traverse(o=>{if(/^hybrid_trumpet_/.test(o.name))trumpets.push(o.name);});
 assert.equal(trumpets.length,6);
 assert.ok(unit.getObjectByName('hybrid_plenum_left'));
 assert.ok(unit.getObjectByName('hybrid_wastegate_valve_l'));
});

test('hybrid kit stays inside a small envelope so the in-car scale does not collapse',()=>{
 const unit=dummyUnit();
 const before=new THREE.Box3().setFromObject(unit).getSize(new THREE.Vector3());
 attachHybridKit(unit);
 const after=new THREE.Box3().setFromObject(unit).getSize(new THREE.Vector3());
 assert.ok(after.x-before.x<.16,`width grew ${after.x-before.x}`);
 assert.ok(after.y-before.y<.14,`height grew ${after.y-before.y}`);
 assert.ok(after.z-before.z<.18,`length grew ${after.z-before.z}`);
});

test('2026 kit numbers match the FIA split: no MGU-H, 350 kW MGU-K, 70 kg fuel',()=>{
 assert.equal(HYBRID_KIT.mgukKw,350);
 assert.equal(HYBRID_KIT.iceKw,400);
 assert.equal(HYBRID_KIT.fuelKg,70);
 assert.ok('mguk' in ENGINE_PARTS);
 assert.ok(ENGINE_PARTS.intake[1]>ENGINE_PARTS.crank[1],'intake reading stays above the crank');
});
