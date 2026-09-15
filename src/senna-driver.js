import * as THREE from 'three';

// Original tribute model, scaled to the existing cockpit. Front of the car is +Z.
export function createSennaDriver(model, mechanics) {
 const root=new THREE.Group();root.name='Piloto · homenagem a Ayrton Senna';model.add(root);
 const materials=[],geometries=[],textures=[];
 const mat=options=>{const m=new THREE.MeshPhysicalMaterial(options);materials.push(m);return m;};
 const paint=mat({color:'#ffd51b',roughness:.23,metalness:.02,clearcoat:1,clearcoatRoughness:.12});
 const rubber=mat({color:'#101217',roughness:.72});
 const visor=mat({color:'#142229',metalness:.65,roughness:.13,clearcoat:1,clearcoatRoughness:.05});
 const metal=mat({color:'#adb5b8',metalness:.85,roughness:.3});
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
 const helmet=new THREE.Group();helmet.name='Capacete amarelo · faixas verde e azul';helmet.position.set(0,.79,.055);helmet.rotation.x=.06;root.add(helmet);
 const profile=[[-.132,.092],[-.115,.121],[-.075,.136],[-.02,.142],[.035,.14],[.085,.125],[.12,.096],[.145,.048],[.153,.002]];
 function radius(y){for(let i=1;i<profile.length;i++){if(y<=profile[i][0]){const [a,r]=profile[i-1],[b,s]=profile[i];return THREE.MathUtils.lerp(r,s,(y-a)/(b-a));}}return .002;}
 function surface(y0,y1,a0,a1,material,lift=0,rows=32){const positions=[],uv=[],indices=[];const cols=96;
  for(let j=0;j<=rows;j++){const y=THREE.MathUtils.lerp(y0,y1,j/rows),r=radius(y)+lift;for(let i=0;i<=cols;i++){const a=THREE.MathUtils.lerp(a0,a1,i/cols);const front=Math.max(0,Math.cos(a));positions.push(Math.sin(a)*r,y,Math.cos(a)*r*1.06+front*Math.max(0,-y)*.15);uv.push(i/cols,j/rows);}}
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const a=j*(cols+1)+i,b=a+cols+1;indices.push(a,a+1,b,a+1,b+1,b);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return mesh(g,material,helmet);
 }
 surface(-.132,.153,-Math.PI,Math.PI,paint);
 const green=mat({color:'#005b36',roughness:.27,clearcoat:1}),blue=mat({color:'#052456',roughness:.27,clearcoat:1});
 surface(.055,.083,-Math.PI,Math.PI,green,.0008,4);
 surface(-.054,-.026,-Math.PI,Math.PI,blue,.0008,4);
 surface(-.131,-.123,-Math.PI,Math.PI,rubber,.001,2);
 // Deep smoked visor, rubber aperture seal, tiny metal pivots and chin ventilation.
 surface(-.021,.052,-1.24,1.24,rubber,.002,12);
 surface(-.014,.046,-1.18,1.18,visor,.0035,12);
 for(const side of [-1,1]){const screw=mesh(new THREE.CylinderGeometry(.008,.008,.004,24),metal,helmet);screw.rotation.z=Math.PI/2;screw.position.set(side*.14,.014,.022);}
 for(const x of [-.034,-.017,0,.017,.034]){const vent=mesh(new THREE.BoxGeometry(.009,.008,.003),rubber,helmet);vent.position.set(x,-.088,.153-Math.abs(x)*.13);}
 // Small, readable tribute signature on the yellow chin bar.
 const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=128;const ctx=labelCanvas.getContext('2d');ctx.font='italic bold 52px Arial';ctx.fillStyle='#10241c';ctx.textAlign='center';ctx.fillText('AYRTON SENNA',256,82);const label=new THREE.CanvasTexture(labelCanvas);label.colorSpace=THREE.SRGBColorSpace;textures.push(label);
 const labelMat=mat({map:label,transparent:true,depthWrite:false,roughness:.3});surface(-.115,-.083,-.7,.7,labelMat,.002,6);
 return {root,update(){root.visible=mechanics.motionAvailable;},dispose(){root.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
