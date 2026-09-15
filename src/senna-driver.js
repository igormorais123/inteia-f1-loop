import {createHelmet1991} from './helmet-1991.js';
import * as THREE from 'three';

// Original tribute model, scaled to the existing cockpit. Front of the car is +Z.
export function createSennaDriver(model, mechanics) {
 const root=new THREE.Group();root.name='Piloto · homenagem a Ayrton Senna';model.add(root);
 const materials=[],geometries=[],textures=[];
 const mat=options=>{const m=new THREE.MeshPhysicalMaterial(options);materials.push(m);return m;};
 const rubber=mat({color:'#101217',roughness:.72});
 const fabricCanvas=document.createElement('canvas');fabricCanvas.width=fabricCanvas.height=128;
 const f=fabricCanvas.getContext('2d');f.fillStyle='#878787';f.fillRect(0,0,128,128);
 for(let i=0;i<128;i+=4){f.fillStyle='#aaa';f.fillRect(i,0,1,128);f.fillStyle='#666';f.fillRect(0,i,128,1);}
 const weave=new THREE.CanvasTexture(fabricCanvas);weave.wrapS=weave.wrapT=THREE.RepeatWrapping;weave.repeat.set(8,8);textures.push(weave);
 const suit=mat({color:'#b51c22',roughness:.88,bumpMap:weave,bumpScale:.0007});
 const glove=mat({color:'#eee9df',roughness:.8,bumpMap:weave,bumpScale:.0004});
 const belt=mat({color:'#20242b',roughness:.92});
 function mesh(geo,material,parent=root){geometries.push(geo);const m=new THREE.Mesh(geo,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 function ellipsoid(center,scale,material,parent=root){const m=mesh(new THREE.SphereGeometry(1,40,28),material,parent);m.position.set(...center);m.scale.set(...scale);return m;}
 function limb(a,b,r1,r2,material){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const m=mesh(new THREE.CylinderGeometry(r2,r1,d.length(),24,6),material);m.position.copy(av).add(bv).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;}
 // Reclined torso, shoulder padding, bent elbows and gloves wrapped around the real wheel.
 ellipsoid([0,.48,.16],[.117,.18,.13],suit).rotation.x=-.35;
 for(const side of [-1,1]){
  ellipsoid([side*.105,.59,.13],[.045,.06,.064],suit);
  limb([side*.11,.58,.14],[side*.125,.45,.34],.043,.034,suit);
  ellipsoid([side*.125,.45,.34],[.035,.036,.04],suit);
  limb([side*.125,.45,.34],[side*.088,.586,.493],.033,.025,suit);
  const hand=ellipsoid([side*.088,.591,.509],[.028,.044,.025],glove);hand.rotation.z=side*.16;
  ellipsoid([side*.065,.584,.518],[.012,.022,.017],glove);
  limb([side*.062,.61,.195],[side*.046,.40,.28],.016,.016,belt);
 }
 ellipsoid([0,.64,.065],[.057,.052,.058],rubber);
 const helmetModel=createHelmet1991({detail:64});const helmet=helmetModel.root;helmet.position.set(0,.79,.055);helmet.rotation.x=.06;root.add(helmet);
 return {root,update(){root.visible=mechanics.motionAvailable;},dispose(){helmetModel.dispose();root.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
