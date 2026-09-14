import test from 'node:test';
import assert from 'node:assert/strict';
import {narrativePose,CHAPTER_IDS} from '../src/narrative.js';
import {engineShot} from '../src/engine/engine-shot.js';

test('the monitor leads into the engine, then correction and an assembled ending',()=>{
 assert.deepEqual(CHAPTER_IDS.slice(3),['avaliar','motor-do-loop','corrigir','encerrar']);
 assert.equal(narrativePose(4.5).engineChapter,true);
 assert.equal(narrativePose(5).index,4);
 for(const p of [6,6.5,7]){
  const s=narrativePose(p);assert.equal(s.engineChapter,false);assert.equal(s.explode,0);assert.equal(s.index,5);
 }
});
test('engine entry and exit blend into the same adjoining story pose in either direction',()=>{
 for(const edge of [4,5]){
  const before=narrativePose(edge-1e-6),after=narrativePose(edge+1e-6);
  assert.ok(Math.hypot(...before.camera.map((v,i)=>v-after.camera[i]))<.001);
  assert.ok(Math.abs(before.explode-after.explode)<.001);
 }
 assert.equal(engineShot(0).weight,0);assert.equal(engineShot(1).weight,0);
 assert.equal(engineShot(1).open,0);assert.equal(engineShot(1).cut,0);
});
