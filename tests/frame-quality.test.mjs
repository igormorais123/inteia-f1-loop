import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameQuality} from '../src/fx/frame-quality.js';

function run(meter, from, until, interval) {
  const decisions = [];
  for (let t = from; t < until; t += interval) {
    const result = meter.observe(t);
    if (result) decisions.push(result);
  }
  return decisions;
}
test('expensive startup followed by 60 fps retains full resolution', () => {
  const meter = createFrameQuality();
  assert.deepEqual(run(meter, 0, 3000, 100), []);
  assert.ok(run(meter, 3000, 12000, 1000 / 60).every(x => !x.reduce));
});
test('one slow window does not reduce, sustained pressure does', () => {
  const meter = createFrameQuality();
  run(meter, 0, 3000, 20);
  const slow = run(meter, 3000, 7200, 40);
  assert.equal(slow[0].reduce, false);
  assert.equal(slow[1].reduce, true);
});
test('a later heavy chapter remains eligible for adaptation', () => {
  const meter = createFrameQuality();
  assert.ok(run(meter, 0, 9000, 1000 / 60).every(x => !x.reduce));
  assert.ok(run(meter, 9000, 16000, 45).some(x => x.reduce));
});
test('tab suspension and resize discard stale pressure samples', () => {
  const meter = createFrameQuality();
  run(meter, 0, 5000, 40);
  meter.observe(5000, false);
  assert.ok(run(meter, 30000, 39000, 1000 / 60).every(x => !x.reduce));
  meter.reset();
  assert.deepEqual(run(meter, 39000, 42000, 100), []);
});
test('intentional 30 fps idle rendering does not sacrifice resolution', () => {
  const meter = createFrameQuality();
  const results = [];
  for (let t = 0; t < 16000; t += 1000 / 30) {
    const sample = meter.observe(t, true, 1000 / 30);
    if (sample) results.push(sample);
  }
  assert.ok(results.length >= 5);
  assert.ok(results.every(x => !x.reduce));
});
