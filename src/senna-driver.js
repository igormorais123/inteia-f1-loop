import {createHelmet1991} from './helmet-1991.js';
import * as THREE from 'three';

// Seated driver fitted to the car's existing seat and steering-wheel coordinates.
export function createSennaDriver(model, mechanics) {
 const root=new THREE.Group();root.name='Piloto · homenagem a Ayrton Senna';model.add(root);
 const materials=[],geometries=[],textures=[];
 const mat=o=>{const m=new THREE.MeshPhysicalMaterial(o);materials.push(m);return m;};
 const fabric=document.createElement('canvas');fabric.width=fabric.height=256;const ctx=fabric.getContext('2d');ctx.fillStyle='#888';ctx.fillRect(0,0,256,256);for(let i=0;i<256;i+=3){ctx.fillStyle=i%2?'#929292':'#777';ctx.fillRect(i,0,1,256);ctx.fillRect(0,i,256,1);}
 const weave=new THREE.CanvasTexture(fabric);weave.wrapS=weave.wrapT=THREE.RepeatWrapping;weave.repeat.set(4,4);textures.push(weave);
 const suit=mat({color:'#b71620',roughness:.9,bumpMap:weave,bumpScale:.00018}),seam=mat({color:'#661219',roughness:.95}),ivory=mat({color:'#dedbd0',roughness:.85,bumpMap:weave,bumpScale:.0001}),glove=mat({color:'#ac1621',roughness:.78}),black=mat({color:'#131518',roughness:.88}),metal=mat({color:'#a5a8aa',metalness:.8,roughness:.36});
 function mesh(g,m,parent=root){geometries.push(g);const o=new THREE.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 // Continuous elliptical lofts follow the body; local folds gather at bent joints.
 function loft(stations,m,{segments=64,sides=32,fold=0}={}){
  const curve=new THREE.CatmullRomCurve3(stations.map(s=>new THREE.Vector3(...s.p))),frames=curve.computeFrenetFrames(segments,false),p=[],uv=[],idx=[];
  for(let j=0;j<=segments;j++){const t=j/segments,v=curve.getPointAt(t),u=t*(stations.length-1),k=Math.min(stations.length-2,Math.floor(u)),f=u-k;const rx=THREE.MathUtils.lerp(stations[k].r[0],stations[k+1].r[0],f),ry=THREE.MathUtils.lerp(stations[k].r[1],stations[k+1].r[1],f);
   for(let i=0;i<=sides;i++){const a=i/sides*Math.PI*2,wrinkle=1+fold*Math.sin(t*42+Math.sin(a*2)*1.5)*Math.exp(-Math.pow((t-.53)/.18,2));const point=v.clone().addScaledVector(frames.normals[j],Math.cos(a)*rx*wrinkle).addScaledVector(frames.binormals[j],Math.sin(a)*ry*wrinkle);p.push(...point.toArray());uv.push(i/sides,t*3);if(j<segments&&i<sides){const n=j*(sides+1)+i;idx.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);}}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return mesh(g,m);
 }
 function path(points,r,m){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),40,r,8,false),m);}
 // Pelvis lower and forward, chest reclined; neck emerges from a gathered collar.
 loft([{p:[0,.24,.46],r:[.05,.087]},{p:[0,.29,.40],r:[.072,.10]},{p:[0,.39,.29],r:[.075,.108]},{p:[0,.51,.16],r:[.087,.145]},{p:[0,.595,.095],r:[.063,.152]},{p:[0,.63,.085],r:[.039,.065]}],suit,{fold:.012});
 loft([{p:[0,.614,.087],r:[.048,.052]},{p:[0,.661,.072],r:[.041,.047]}],ivory,{segments:16,fold:.01});
 for(const side of [-1,1]){
  // Shoulder to wrist is a single smooth sleeve with compressed cloth around the elbow.
  loft([{p:[side*.12,.59,.13],r:[.050,.050]},{p:[side*.125,.56,.20],r:[.044,.042]},{p:[side*.133,.468,.315],r:[.035,.036]},{p:[side*.118,.49,.40],r:[.030,.032]},{p:[side*.089,.568,.49],r:[.024,.026]}],suit,{fold:.04});
  loft([{p:[side*.093,.552,.47],r:[.026,.027]},{p:[side*.087,.577,.495],r:[.025,.027]}],ivory,{segments:12});
  loft([{p:[side*.088,.572,.489],r:[.020,.018]},{p:[side*.09,.594,.506],r:[.024,.017]},{p:[side*.09,.613,.519],r:[.018,.013]}],glove,{segments:20,fold:.025});
  for(let finger=0;finger<4;finger++){const y=.576+finger*.010;path([[side*.099,y,.504],[side*.112,y+.002,.518],[side*.104,y+.002,.534],[side*.089,y,.533]],.0052,glove);}
  path([[side*.071,.579,.496],[side*.062,.588,.513],[side*.074,.597,.526]],.007,glove);
  // Extended legs are tucked under the nose, with fabric tightening over the knees.
  loft([{p:[side*.060,.29,.39],r:[.064,.062]},{p:[side*.064,.25,.56],r:[.055,.052]},{p:[side*.066,.24,.75],r:[.042,.043]},{p:[side*.058,.20,.94],r:[.034,.035]},{p:[side*.052,.17,1.10],r:[.027,.028]}],suit,{fold:.03});
  loft([{p:[side*.052,.17,1.06],r:[.030,.030]},{p:[side*.052,.18,1.16],r:[.030,.041]},{p:[side*.052,.205,1.22],r:[.015,.033]}],black,{segments:24});
  // Flat shoulder harness, edged stitching, and suit piping.
  const strap=mesh(new THREE.BoxGeometry(.030,.23,.004),black);strap.position.set(side*.060,.505,.245);strap.rotation.x=-.72;
  path([[side*.12,.602,.14],[side*.146,.55,.23],[side*.152,.475,.315],[side*.138,.50,.40],[side*.111,.553,.467]],.0013,ivory);
  path([[side*.047,.61,.147],[side*.045,.55,.205],[side*.042,.45,.296]],.001,seam);
 }
 // Sewn chest panels and a fabric name strip, placed on the reclined suit.
 function patchLabel(text,x,y,z,w,h,bg,fg){const c=document.createElement('canvas');c.width=512;c.height=192;const q=c.getContext('2d');q.fillStyle=bg;q.fillRect(0,0,512,192);q.strokeStyle=fg;q.lineWidth=3;q.setLineDash([5,5]);q.strokeRect(10,10,492,172);q.fillStyle=fg;q.font='bold 90px Arial';q.textAlign='center';q.textBaseline='middle';q.fillText(text,256,98,470);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;textures.push(t);const m=mat({map:t,roughness:.92});const panel=mesh(new THREE.PlaneGeometry(w,h),m);panel.position.set(x,y,z);panel.rotation.x=-.65;}
 patchLabel('HONDA',-.058,.558,.235,.066,.026,'#ece8df','#b3141f');
 patchLabel('Shell',.055,.558,.235,.059,.028,'#e9bc22','#a20b12');
 patchLabel('A. SENNA',0,.482,.313,.08,.018,'#e4dfd2','#181a1c');
 path([[0,.616,.141],[0,.55,.225],[0,.40,.33]],.0018,metal);
 const buckle=mesh(new THREE.CylinderGeometry(.022,.022,.008,32),metal);buckle.rotation.x=Math.PI/2;buckle.position.set(0,.392,.36);
 // Sink the upper body into the seat while keeping wrists on the fixed wheel.
 // The deformation fades towards the pelvis and forward along the forearms.
 root.updateMatrixWorld(true);
 for(const part of root.children){
  if(!part.isMesh)continue;
  part.updateMatrix();const inverse=part.matrix.clone().invert(),positions=part.geometry.attributes.position,v=new THREE.Vector3();
  for(let i=0;i<positions.count;i++){
   v.fromBufferAttribute(positions,i).applyMatrix4(part.matrix);
   const weight=THREE.MathUtils.smoothstep(v.y,.25,.55)*(1-THREE.MathUtils.smoothstep(v.z,.15,.49));
   v.y-=.105*weight;
   v.applyMatrix4(inverse);positions.setXYZ(i,v.x,v.y,v.z);
  }
  positions.needsUpdate=true;part.geometry.computeVertexNormals();part.geometry.computeBoundingSphere();
 }
 const helmetModel=createHelmet1991({detail:64});const helmet=helmetModel.root;helmet.position.set(0,.653,.068);helmet.rotation.x=.14;helmet.scale.setScalar(.84);root.add(helmet);
 root.userData.helmet=helmet;
 return {root,update(){root.visible=mechanics.motionAvailable;},dispose(){helmetModel.dispose();root.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
