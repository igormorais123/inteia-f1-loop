import test from 'node:test';
import assert from 'node:assert/strict';
import {ENGINE_LESSONS,engineBeat,engineChapterMarkup} from '../src/engine/chapter.js';
import {engineShot,ENGINE_WINDOWS,ENGINE_PARTS} from '../src/engine/engine-shot.js';
test('the engine lesson revisits its three parts in either scroll direction',()=>{
 assert.equal(ENGINE_LESSONS.length,3);
 assert.deepEqual([.35,.58,.82,.58,.35].map(engineBeat),[0,1,2,1,0]);
});
test('the seventh chapter provides readable content without WebGL',()=>{
 const html=engineChapterMarkup();assert.match(html,/id="motor-do-loop"/);
 for(const lesson of ENGINE_LESSONS){assert.ok(html.includes(lesson.title));assert.ok(html.includes(lesson.text));}
});

const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const samples=n=>Array.from({length:n+1},(_,i)=>i/n);

test('the engine take starts on the closing pose, ends closed and is a pure function of progress',()=>{
 const start=engineShot(0),end=engineShot(1);
 assert.equal(start.weight,0);assert.equal(start.open,0);assert.equal(start.cut,0);
 assert.equal(end.open,0);assert.equal(end.cut,0);assert.equal(end.light,0);
 assert.deepEqual(engineShot(.62),engineShot(.62));
 for(const p of samples(400)){const s=engineShot(p);for(const v of [...s.camera,...s.target,...s.focus,s.fov,s.range,s.bokeh,s.open,s.cut,s.light,s.weight])assert.ok(Number.isFinite(v),`finite at ${p}`);}
 assert.deepEqual(engineShot(NaN),engineShot(0));
});
test('the camera moves continuously: no jump between neighbouring scroll positions',()=>{
 // 0.001 of the chapter is ≈6 px of scroll on a 900 px screen: at most 4 cm of camera or focus travel.
 let prev=engineShot(0);
 for(const p of samples(1000).slice(1)){const s=engineShot(p);assert.ok(dist(s.camera,prev.camera)<.04,`camera jump at ${p}`);assert.ok(dist(s.focus,prev.focus)<.04,`focus jump at ${p}`);prev=s;}
});
test('each lesson reads inside the open, sectioned engine with its own frame, drift and focus on its part',()=>{
 const parts=[ENGINE_PARTS.crank,ENGINE_PARTS.intake,ENGINE_PARTS.turbo],mids=[];
 ENGINE_WINDOWS.forEach(([a,b],i)=>{
  const mid=(a+b)/2;mids.push(engineShot(mid));
  assert.equal(engineBeat(a+.01),i);assert.equal(engineBeat(b-.01),i);
  for(const p of [a,mid,b]){const s=engineShot(p);assert.equal(s.weight,1);assert.ok(s.open>.99);assert.ok(s.cut>.99);assert.ok(s.light>.99);assert.ok(s.range<.5,'thin focus slice');}
  assert.ok(dist(engineShot(a).camera,engineShot(b).camera)>.2,`lesson ${i+1} drifts`);
  assert.ok(dist(engineShot(b-.02).focus,parts[i])<.05,`lesson ${i+1} ends focused on its part`);
  assert.ok(dist(engineShot(mid).camera,parts[i])<1.8,`lesson ${i+1} is a close`);
 });
 for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)assert.ok(dist(mids[i].camera,mids[j].camera)>.8,`lessons ${i+1} and ${j+1} have different frames`);
 // The copy-button targets in main.js land inside the reading windows.
 [.35,.58,.82].forEach((p,i)=>assert.ok(p>=ENGINE_WINDOWS[i][0]&&p<=ENGINE_WINDOWS[i][1]));
});
test('the camera stays above the open bay and outside the engine',()=>{
 for(const p of samples(500)){const s=engineShot(p);assert.ok(s.camera[1]>.7,`camera above the sidepod lip at ${p}`);assert.ok(dist(s.camera,[0,.45,-.72])>.75,`camera outside the engine bounding sphere (≈0.59 m) at ${p}`);}
 for(const p of samples(100)){const s=engineShot(p,true);assert.ok(s.fov>engineShot(p).fov);assert.ok(dist(s.camera,s.target)>dist(engineShot(p).camera,s.target));}
});
