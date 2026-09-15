import test from 'node:test';
import assert from 'node:assert/strict';
import {finalePose} from '../src/finale.js';
import {engineScroll,narrativePose} from '../src/narrative.js';
import {orbitCamera} from '../src/finale-experience.js';

test('finish keeps accelerating and returns to a bounded orbit for the credits',()=>{
 const before=finalePose(.88),end=finalePose(1);
 assert.ok(end.camera[2]>0);
 assert.ok(Math.hypot(...end.camera)<11);
 assert.ok(end.distance-finalePose(.99).distance>finalePose(.89).distance-before.distance);
 assert.equal(end.speed,1);
});

test('free orbit clamps zoom and elevation while retaining a full circle',()=>{
 for(const yaw of [-10,-Math.PI,0,Math.PI,10])for(const pitch of [-5,.3,5])for(const zoom of [-100,9,100]){
  const c=orbitCamera(yaw,pitch,zoom),d=Math.hypot(c[0],c[1]-.45,c[2]);
  assert.ok(d>=4.8-1e-9&&d<=13+1e-9);assert.ok(c[1]>.45);
 }
 const a=orbitCamera(.7,.25,9),b=orbitCamera(.7+Math.PI*2,.25,9);
 a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-9));
});

test('engine controls land on the same lessons after retiming and reserve space for closure',()=>{
 for(const p of [.35,.58,.82,.9,.999])assert.ok(Math.abs(narrativePose(4+engineScroll(p)).engineProgress-p)<1e-9);
 assert.ok(1-engineScroll(.9)>=.25);
});
test('the assembled car crosses the finish exactly once, after reaching the track',()=>{
 let crossings=0,previous=false,lastDistance=0;
 for(let i=0;i<=1000;i++){
  const p=i/1000,f=finalePose(p),s=narrativePose(6+p);
  assert.equal(s.explode,0);assert.equal(s.engineChapter,false);
  assert.ok(f.distance>=lastDistance);lastDistance=f.distance;
  if(f.crossed&&!previous)crossings++;
  if(f.crossed){assert.equal(s.world,'track');assert.ok(f.lineZ< -2.6);}
  previous=f.crossed;
 }
 assert.equal(crossings,1);assert.equal(finalePose(1).crossed,true);
 assert.equal(finalePose(.3).blend,0);
});

