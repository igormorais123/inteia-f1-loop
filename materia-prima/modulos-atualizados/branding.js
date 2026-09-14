import {glyphs} from './identity.js';
import * as THREE from 'three';
import {DecalGeometry} from 'three/addons/geometries/DecalGeometry.js';

// One outlined INTEIA signature on the right sidepod, attached to the moving body.
export async function applyInteiaBranding(model, mechanics) {
  const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=320;
  const ctx=canvas.getContext('2d');ctx.scale(3.6,3.6);ctx.translate(29,12);
  ctx.transform(1,0,-Math.tan(12*Math.PI/180),1,0,0);
  for(const [,path,accent] of glyphs){
    ctx.fillStyle=accent?'#ffd447':'#f5f5f2';
    ctx.fill(new Path2D(path),'evenodd');
  }
  const aspect=canvas.width/canvas.height;
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
  const material=new THREE.MeshStandardMaterial({name:'INTEIA | branco e amarelo',map,roughness:.35,metalness:0,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4});
  // 512×768 WebP (≈120 kB): the badge is 0.20–0.23 m on the car. A failed load only omits the badge.
  const crestMap=await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}assets/inteia-crest-racing-v1.webp`).catch(()=>null);
  if(crestMap){crestMap.colorSpace=THREE.SRGBColorSpace;crestMap.anisotropy=8;}
  // The generated artwork has an opaque exterior. A separate material mask
  // follows the shield boundary, leaving the paint visible outside the badge.
  const mask=document.createElement('canvas');mask.width=512;mask.height=768;
  const mc=mask.getContext('2d');mc.scale(.5,.5);mc.fillStyle='#000';mc.fillRect(0,0,1024,1536);
  mc.fillStyle='#fff';mc.beginPath();mc.moveTo(512,96);
  mc.bezierCurveTo(380,205,195,265,32,309);
  mc.bezierCurveTo(10,780,162,1110,512,1358);
  mc.bezierCurveTo(862,1110,1014,780,992,309);
  mc.bezierCurveTo(829,265,644,205,512,96);mc.closePath();mc.fill();
  const crestAlpha=new THREE.CanvasTexture(mask);
  const crestMaterial=crestMap&&new THREE.MeshStandardMaterial({name:'INTEIA | escudo neural racing',map:crestMap,alphaMap:crestAlpha,alphaTest:.5,roughness:.4,metalness:.12,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4});
  const decals=[];model.updateMatrixWorld(true);
  const offset=model.position;
  function project(source,origin,direction,rotation,width,depth,decalMaterial=material,decalAspect=aspect){
    const record=mechanics.records.find(r=>r.source===source);if(!record)return;
    const ray=new THREE.Raycaster(new THREE.Vector3(...origin).add(offset),new THREE.Vector3(...direction));
    const hit=ray.intersectObject(record.root,true).find(h=>h.object.isMesh&&!h.object.userData.inteiaDecal);if(!hit)return;
    const geo=new DecalGeometry(hit.object,hit.point,new THREE.Euler(...rotation),new THREE.Vector3(width,width/decalAspect,depth));
    if(!geo.attributes.position.count){geo.dispose();return;}
    geo.applyMatrix4(hit.object.matrixWorld.clone().invert());
    const decal=new THREE.Mesh(geo,decalMaterial);decal.name='INTEIA / '+source+' / '+decals.length;
    decal.userData={inteiaDecal:true,recordId:record.id};decal.renderOrder=2;decal.receiveShadow=true;
    hit.object.add(decal);decals.push(decal);
  }
  project('main_body',[2,.32,-.55],[-1,0,0],[0,Math.PI/2,0],.76,.22);
  if(crestMaterial){
    project('main_body',[2,.36,.03],[-1,0,0],[0,Math.PI/2,0],.20,.22,crestMaterial,2/3);
    project('main_body',[0,3,1.62],[0,-1,0],[-Math.PI/2,0,0],.23,.45,crestMaterial,2/3);
  }
  document.body.dataset.inteiaDecals=String(decals.length);
  return {decals,dispose(){decals.forEach(d=>{d.removeFromParent();d.geometry.dispose();});material.dispose();map.dispose();crestMaterial?.dispose();crestMap?.dispose();crestAlpha.dispose();}};
}
