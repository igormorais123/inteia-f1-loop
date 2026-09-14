const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const FINALE_SECONDS=14;
export function finalePose(local){
 const blend=smooth((local-.34)/.18),sweep=smooth((local-.38)/.14);
 const race=clamp((local-.52)/.48),distance=100*smooth(race);
 const angle=.45+1.9*smooth(race),radius=8.8;
 return {blend,sweep,race,distance,crossed:distance>82.6,
  camera:[Math.cos(angle)*radius,2.7+1.3*smooth(race),Math.sin(angle)*radius],
  target:[0,.5,0],lineZ:80-distance,
  speed:race>0&&race<1?.65:0};
}

export function createFinishLine(THREE,track){
 const root=new THREE.Group();root.name='Linha de chegada';root.visible=false;track.root.add(root);
 const white=new THREE.MeshStandardMaterial({color:'#f2f2ea',roughness:.8}),black=new THREE.MeshStandardMaterial({color:'#111318',roughness:.8});
 const tile=new THREE.PlaneGeometry(.8,.8);tile.rotateX(-Math.PI/2);
 for(let row=0;row<3;row++)for(let col=0;col<18;col++){
  const m=new THREE.Mesh(tile,(row+col)%2?black:white);m.position.set((col-8.5)*.8,.012,(row-1)*.8);root.add(m);
 }
 const beam=new THREE.BoxGeometry(1,1,1),metal=new THREE.MeshStandardMaterial({color:'#263039',metalness:.7,roughness:.4});
 for(const x of [-8,8]){const m=new THREE.Mesh(beam,metal);m.scale.set(.22,6,.22);m.position.set(x,3,0);root.add(m);}
 const top=new THREE.Mesh(beam,metal);top.scale.set(16.4,1.1,.35);top.position.set(0,6,0);root.add(top);
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const c=canvas.getContext('2d');
 c.fillStyle='#0d141a';c.fillRect(0,0,1024,128);c.fillStyle='#fff';c.font='bold 76px Arial';c.textAlign='center';c.fillText('CHEGADA',512,94);
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
 const sign=new THREE.Mesh(new THREE.PlaneGeometry(10,.96),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));sign.position.set(0,6,.19);root.add(sign);
 track.clip.patchObject(root);
 return {root,update(shot){root.visible=!!shot&&shot.blend>0;root.position.z=shot?.lineZ??80;},dispose(){tex.dispose();}};
}

