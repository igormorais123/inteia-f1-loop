import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {attachInternalsKit, INTERNALS_KIT_NAME, INTERNALS} from '../src/car/internals-kit.js';

function dummyCar(){
 const model=new THREE.Group();
 const shaft=new THREE.Group();shaft.name='rear_driveshaft';
 shaft.add(new THREE.Mesh(new THREE.BoxGeometry(.04,.04,.4)));
 shaft.position.set(-.45,.3,-1.7);model.add(shaft);
 const pivot=new THREE.Group();pivot.position.set(.7,.33,1.52);model.add(pivot);
 const spinPivot=new THREE.Group();pivot.add(spinPivot);
 const mechanics={
  records:[{source:'rear_driveshaft',root:shaft,center:new THREE.Vector3(-.45,.3,-1.7),size:new THREE.Vector3(.04,.04,.4)}],
  wheels:[{pivot,spinPivot,front:true}]
 };
 return {model,mechanics};
}

test('internals kit fills the hollow car: fuel, battery, coolers, gearbox, heave',()=>{
 const {model,mechanics}=dummyCar();
 const first=attachInternalsKit(model,mechanics,{mobile:true});
 const second=attachInternalsKit(model,mechanics,{mobile:true});
 assert.equal(first,second);
 assert.equal(model.getObjectByName(INTERNALS_KIT_NAME),first.root);
 for(const name of ['internal_fuel_cell','internal_energy_store','internal_oil_tank','internal_gearbox','internal_intercooler','internal_radiator_bank','internal_heave_damper','internal_pullrod_-1','internal_charge_air_duct','internal_charge_hot_duct']){
  assert.ok(model.getObjectByName(name),name);
 }
 assert.ok(model.getObjectByName('internal_tripod_l')||model.getObjectByName('internal_tripod_r'));
 assert.ok(model.getObjectByName('internal_brake_disc'));
 assert.ok(model.getObjectByName('internal_brake_caliper'));
});

test('fuel cell sits between cockpit and engine, coolers are asymmetric, oil tank stays under the engine-cover lip',()=>{
 assert.ok(INTERNALS.fuelCell[2]>INTERNALS.oilTank[2],'fuel cell is ahead of the oil tank');
 assert.ok(INTERNALS.oilTank[2]>INTERNALS.gearbox[2],'oil tank is ahead of the gearbox');
 assert.ok(INTERNALS.oilTank[1]<.40,'oil tank stays with the chassis when the bay cover lifts');
 assert.ok(INTERNALS.intercooler[0]<0&&INTERNALS.radiators[0]>0,'intercooler left, liquid radiators right');
 assert.ok(INTERNALS.heave[2]>1,'heave lives in the nose');
});

test('2026 internals: smaller 70 kg cell, larger energy-store footprint',()=>{
 assert.ok(.42>.32&&.28>.20,'energy store footprint beats the reduced fuel cell');
});

test('2026 charge air leaves the rear turbo, cools in the left sidepod, returns to the intake',()=>{
 const hot=INTERNALS.chargeHot,cold=INTERNALS.chargeCold;
 assert.ok(hot[0][2]<-.7,'hot duct starts at the rear turbo, not the engine face');
 assert.ok(hot[hot.length-1][0]<0&&hot[hot.length-1][2]>0,'hot duct lands in the left sidepod');
 assert.ok(cold[0][0]<0&&cold[0][2]>0,'cold return starts at the left intercooler');
 assert.ok(cold[cold.length-1][2]<INTERNALS.intercooler[2],'cold return ends aft of the sidepod, at the intake');
 assert.ok(cold[cold.length-1][1]>hot[0][1],'cold return climbs to the trumpets');
});

test('kit dispose removes the root',()=>{
 const {model,mechanics}=dummyCar();
 const kit=attachInternalsKit(model,mechanics);
 kit.dispose();
 assert.ok(!model.getObjectByName(INTERNALS_KIT_NAME));
});
