import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Purpose-built, open-front engineering bay. All equipment is supported;
// merged construction keeps the room to five static material submissions.
export function createBox(){
 const root=new THREE.Group();root.name='Box procedural INTEIA';
 const finishes=[
  new THREE.MeshStandardMaterial({color:'#18252a',roughness:.72,metalness:.25}),
  new THREE.MeshStandardMaterial({color:'#35444a',roughness:.38,metalness:.7}),
  new THREE.MeshStandardMaterial({color:'#090f13',roughness:.48,metalness:.25}),
  new THREE.MeshBasicMaterial({color:new THREE.Color('#b9d9df').multiplyScalar(2)}),
  new THREE.MeshBasicMaterial({color:'#933427'})
 ];
 const pieces=finishes.map(()=>[]);
 function block(w,h,d,x,y,z,m=0){const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);pieces[m].push(g);}
 // A low uninterrupted horizon, no pillars between lens and hero.
 block(15,.18,13,0,-.12,-1,0);
 block(14,2.8,.2,0,1.4,-7,0);
 block(14,.055,.035,0,2.62,-6.88,3);
 for(let x=-6.5;x<7;x+=1.3){
  block(1.22,1,.82,x,.53,-6.3,2);
  block(1.25,.07,.88,x,1.06,-6.3,1);
  for(let j=0;j<4;j++)block(1.08,.012,.018,x,.3+j*.18,-5.88,1);
  block(.014,1.3,.04,x+.61,1.96,-6.87,1);
 }
 for(const x of [-3.3,3.3]){
  block(.045,.014,12,x,.008,-.8,3);
  for(let z=-5;z<5;z+=.6)block(.13,.016,.022,x,.009,z,4);
 }
 for(const x of [-3.8,0,3.8]){
  block(.075,.48,.09,x,1.32,-6.2,1);
  block(2.3,.99,.08,x,1.98,-6.2,2);
 }
 pieces.forEach((list,i)=>{const g=mergeGeometries(list);list.forEach(p=>p.dispose());const mesh=new THREE.Mesh(g,finishes[i]);mesh.receiveShadow=true;root.add(mesh);});
 const screens=[];
 for(const [i,x] of [-3.8,0,3.8].entries()){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=320;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2.18,.9),material);mesh.position.set(x,1.98,-6.15);root.add(mesh);screens.push({canvas,texture,i});
 }
 function setNotebook(values={}){
  const fields=[['REFERÊNCIA','reference'],['CRITÉRIO','criterion'],['EVIDÊNCIA','evidence']];
  for(const {canvas,texture,i} of screens){const ctx=canvas.getContext('2d');ctx.fillStyle='#081317';ctx.fillRect(0,0,768,320);ctx.fillStyle='#ce7751';ctx.fillRect(30,32,4,28);ctx.font='22px sans-serif';ctx.fillStyle='#b3ced0';ctx.fillText(fields[i][0],48,56);ctx.font='17px sans-serif';ctx.fillStyle='#6d858a';ctx.fillText('CADERNO DO ALUNO · NÃO VERIFICADO',30,292);ctx.strokeStyle='#2a434a';ctx.beginPath();ctx.moveTo(30,80);ctx.lineTo(738,80);ctx.stroke();
   ctx.font='23px sans-serif';ctx.fillStyle='#d0dcdb';const words=String(values[fields[i][1]]||'').replace(/\s+/g,' ').split(' ');let line='',row=0;for(const word of words){if(ctx.measureText(line+word).width>690&&line){ctx.fillText(line,30,124+row*35);line='';row++;if(row===4)break;}line+=word+' ';}if(row<4)ctx.fillText(line,30,124+row*35);texture.needsUpdate=true;
  }
 }
 setNotebook();
 return {root,setNotebook};
}
