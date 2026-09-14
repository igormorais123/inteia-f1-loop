import test from 'node:test';
import assert from 'node:assert/strict';
import {finalePose} from '../src/finale.js';
import {engineScroll,narrativePose} from '../src/narrative.js';

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

