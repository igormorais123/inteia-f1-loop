import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {monitorTimeline} from '../src/monitor-scene.js';
import {monitorShot,screenPoint} from '../src/story.js';
test('the monitor adds four full viewports of reading with a stationary story camera',()=>{
 const top=2400,height=5400;
 for(const y of [top+901,top+1800,top+2700,top+3600,top+4499])assert.equal(monitorTimeline(y,top,height).story,3.74);
 assert.equal(monitorTimeline(top,top,height).story,3.64);
 assert.equal(monitorTimeline(top+height,top,height).story,4);
});
test('three monitor pages remain reversible and independent of time',()=>{
 const sample=y=>monitorTimeline(y,0,6000);
 assert.deepEqual([1200,2600,4200,2600,1200].map(y=>sample(y).beat),[0,1,2,1,0]);
 assert.equal(sample(-1).active,false);assert.equal(sample(6000).active,false);
});

// Camera r6 (cinema r5 G2, M2, M5). Frames as scene.js builds them while the shot owns the frame: no view offset.
const shoot=(shot,aspect)=>{
 const c=new THREE.PerspectiveCamera(shot.fov,aspect,.05,80);
 c.position.fromArray(shot.camera);c.lookAt(new THREE.Vector3(...shot.target));c.updateMatrixWorld();
 const v=new THREE.Vector3();
 return pts=>{const a=pts.map(p=>{v.set(...p).project(c);return [(v.x+1)/2,(1-v.y)/2];});
  return {x0:Math.min(...a.map(q=>q[0])),x1:Math.max(...a.map(q=>q[0])),y0:Math.min(...a.map(q=>q[1])),y1:Math.max(...a.map(q=>q[1]))};};
};
const corners=(u0,v0,u1,v1)=>[screenPoint(u0,v0),screenPoint(u1,v0),screenPoint(u0,v1),screenPoint(u1,v1)];
test('the reading shot keeps the card big and whole: ≈60% of the desktop width, ≥40% of the phone height',()=>{
 for(let r=0;r<=1.0001;r+=.01){
  const wide=shoot(monitorShot(r,1440/900),1440/900),screen=wide(corners(0,0,1,1));
  // Between the scene title (top 17%) and the controls (bottom 15%), never edge to edge like a slide.
  assert.ok(screen.x1-screen.x0>=.5&&screen.x1-screen.x0<=.7&&screen.x0>=.05&&screen.x1<=.95&&screen.y0>=.15&&screen.y1<=.85,
   `desktop screen ${JSON.stringify(screen)} at reading ${r.toFixed(2)}`);
  const tall=shoot(monitorShot(r,390/844),390/844),text=tall(corners(.03,.08,.72,.97)),column=tall([screenPoint(.375,0),screenPoint(.375,1)]),whole=tall(corners(0,0,1,1));
  assert.ok(column.y1-column.y0>=.4,`phone screen only ${((column.y1-column.y0)*100).toFixed(0)}% of the height at reading ${r.toFixed(2)}`);
  assert.ok(text.x0>=.02&&text.x1<=.98&&whole.y0>=.18&&whole.y1<=.82,`phone text ${JSON.stringify(text)} at reading ${r.toFixed(2)}`);
 }
});
test('the reading shot never locks off: the lens always drifts, pans only briefly and racks focus inside each page',()=>{
 for(const aspect of [1440/900,390/844]){
  for(let r=0;r<1;r+=.005){
   const a=monitorShot(r,aspect),b=monitorShot(r+.005,aspect),step=Math.hypot(...a.camera.map((v,i)=>v-b.camera[i]));
   assert.ok(step>.001&&step<.12,`lens moves ${step.toFixed(4)} m between reading ${r.toFixed(3)} and ${(r+.005).toFixed(3)}`);
  }
  for(let page=0;page<3;page++){
   const a=monitorShot((page+.13)/3,aspect),b=monitorShot((page+.5)/3,aspect);
   assert.ok(Math.hypot(...a.focus.map((v,i)=>v-b.focus[i]))>.1&&b.focusRange>a.focusRange,`no rack on page ${page+1}`);
  }
 }
});
test('the story and the shot never move the lens together; arrival keeps moving and the exit is a pan, not a jump',()=>{
 const top=0,height=5400;
 let last=3.64;
 for(let y=0;y<=height;y+=6){
  const t=monitorTimeline(y,top,height);
  if(t.weight>.02)assert.ok(Math.abs(t.story-3.74)<.002,`story ${t.story.toFixed(3)} moves under the shot (weight ${t.weight.toFixed(2)}) at local ${t.local.toFixed(3)}`);
  assert.ok(t.story>=last-1e-12,'story never runs back');last=t.story;
 }
 assert.ok(monitorTimeline(6,top,height).story>3.641,'the push-in parks where the section starts');
 for(let y=4500;y<height;y+=6){const a=monitorTimeline(y,top,height).story,b=monitorTimeline(y+100,top,height).story;assert.ok(b-a<=.045,`a 100 px step jumps the story ${(b-a).toFixed(3)} at ${y}`);}
 const t=monitorTimeline(0,top,height);
 assert.equal(monitorTimeline(t.enter*height,top,height).reading,0);assert.equal(monitorTimeline(t.exit*height,top,height).reading,1);
 assert.ok(monitorTimeline((t.enter-.005)*height,top,height).weight>.95&&monitorTimeline((t.exit+.005)*height,top,height).weight>.95,'the shot owns the frame across the reading');
});
