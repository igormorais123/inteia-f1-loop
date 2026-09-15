import * as THREE from 'three';
import {DecalGeometry} from 'three/addons/geometries/DecalGeometry.js';

// One outlined INTEIA signature on the right sidepod, attached to the moving body.
export async function applyInteiaBranding(model, mechanics) {
  // Approved vector artwork: preserve the original contours, palette and transparent exterior.
  const loader=new THREE.TextureLoader();
  const [map,crestMap,sponsorMap]=await Promise.all(['inteia-nome-oficial.svg','inteia-escudo-oficial.svg','inteligencia-mil-grau.jpg'].map(name=>loader.loadAsync(`${import.meta.env.BASE_URL}assets/${name}`)));
  for(const t of [map,crestMap,sponsorMap]){t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;}
  const aspect=910.78125/210;
  const options={roughness:.35,metalness:.05,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4};
  const material=new THREE.MeshStandardMaterial({...options,name:'INTEIA | assinatura oficial',map});
  const crestMaterial=new THREE.MeshStandardMaterial({...options,name:'INTEIA | brasão oficial SVG',map:crestMap});
  const sponsorMaterial=new THREE.MeshStandardMaterial({...options,name:'Bob | Inteligência Mil Grau',map:sponsorMap});
  const numberCanvas=document.createElement('canvas');numberCanvas.width=512;numberCanvas.height=768;
  const nc=numberCanvas.getContext('2d');
  // A forward-leaning racing 1, with ivory face, gold keyline and dark separation from the paint.
  nc.translate(50,55);nc.transform(1,0,-.12,1,0,0);
  const one=new Path2D('M120 160 L245 40 L345 40 L345 580 L405 580 L405 670 L105 670 L105 580 L190 580 L190 190 L120 250 Z');
  nc.lineJoin='round';nc.lineWidth=34;nc.strokeStyle='#101214';nc.stroke(one);nc.lineWidth=14;nc.strokeStyle='#CFA64B';nc.stroke(one);nc.fillStyle='#F5F1E7';nc.fill(one);
  const numberMap=new THREE.CanvasTexture(numberCanvas);numberMap.colorSpace=THREE.SRGBColorSpace;numberMap.anisotropy=8;
  const numberMaterial=new THREE.MeshStandardMaterial({...options,name:'Número 1 | marfim e dourado',map:numberMap});
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
  // Channel avatar, preserved as supplied by YouTube, beside the sidepod sponsor signature.
  project('main_body',[2,.35,-1.12],[-1,0,0],[0,Math.PI/2,0],.28,.22,sponsorMaterial,1);
  project('main_body',[-2,.35,-1.12],[1,0,0],[0,-Math.PI/2,0],.28,.22,sponsorMaterial,1);
  project('main_body',[.58,3,-.52],[0,-1,0],[-Math.PI/2,0,0],.36,.30,sponsorMaterial,1);
  project('main_body',[-.58,3,-.52],[0,-1,0],[-Math.PI/2,0,0],.36,.30,sponsorMaterial,1);
  if(crestMaterial){
    project('main_body',[2,.36,.08],[-1,0,0],[0,Math.PI/2,0],.34,.22,crestMaterial,5/6);
    project('main_body',[0,3,1.35],[0,-1,0],[-Math.PI/2,0,0],.36,.45,crestMaterial,5/6);
    project('main_body',[-2,.36,.08],[1,0,0],[0,-Math.PI/2,0],.34,.22,crestMaterial,5/6);
  }
  project('main_body',[0,3,2.02],[0,-1,0],[-Math.PI/2,0,0],.30,.45,numberMaterial,2/3);
  project('main_body',[2,.34,.58],[-1,0,0],[0,Math.PI/2,0],.30,.25,numberMaterial,2/3);
  document.body.dataset.inteiaDecals=String(decals.length);
  return {decals,dispose(){decals.forEach(d=>{d.removeFromParent();d.geometry.dispose();});material.dispose();map.dispose();crestMaterial?.dispose();crestMap?.dispose();sponsorMaterial.dispose();sponsorMap.dispose();numberMaterial.dispose();numberMap.dispose();}};
}
