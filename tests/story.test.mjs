import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleStory, exportNotebook } from '../src/story.js';
import { CHAPTERS } from '../src/content.js';

const lastChapter = CHAPTERS.length - 1;
const fixedTime = '2026-09-13T12:00:00.000Z';

function assertPoseNear(a, b, tolerance = 0.0001) {
  for (const key of ['camera', 'target']) {
    assert.equal(a[key].length, 3, `${key} must have three coordinates`);
    a[key].forEach((value, axis) => {
      assert.ok(Math.abs(value - b[key][axis]) < tolerance,
        `${key}[${axis}] jumped from ${value} to ${b[key][axis]}`);
    });
  }
  for (const key of ['explode', 'tunnel', 'wipe']) {
    assert.ok(Math.abs(a[key] - b[key]) < tolerance,
      `${key} jumped from ${a[key]} to ${b[key]}`);
  }
}

test('returning through any chapter restores the same absolute pose', () => {
  const stops = [0, 0.87, 1, 1.81, 2.96, 3.73, 4.99, lastChapter];
  const expected = stops.map(progress => structuredClone(sampleStory(progress)));
  for (const i of [7, 2, 5, 0, 6, 3, 1, 4, 0, 7]) {
    assert.deepEqual(sampleStory(stops[i]), expected[i],
      `pose at ${stops[i]} must not depend on the route taken`);
  }
});

test('camera, target, car and tunnel remain continuous at every chapter seam', () => {
  const epsilon = 0.000001;
  for (let boundary = 1; boundary <= lastChapter; boundary++) {
    const before = sampleStory(boundary - epsilon);
    const at = sampleStory(boundary);
    const after = sampleStory(boundary + epsilon);
    assert.equal(before.index, boundary - 1);
    assert.equal(at.index, boundary);
    assertPoseNear(before, at);
    assertPoseNear(at, after);
  }
});

test('the closing composition rejoins the opening composition for a new loop', () => {
  const opening = sampleStory(0);
  const closing = sampleStory(lastChapter);
  assert.equal(closing.index, lastChapter, 'all content chapters need a pose');
  assertPoseNear(opening, closing);
});

test('a consumer cannot mutate the shared camera path through a sampled pose', () => {
  const progress = 1.84;
  const expected = structuredClone(sampleStory(progress));
  const sampled = sampleStory(progress);
  sampled.camera.fill(-999);
  sampled.target.fill(999);
  sampled.explode = -999;
  assert.deepEqual(sampleStory(progress), expected);
});

test('out-of-range progress clamps to endpoints and invalid input is safe', () => {
  const opening = sampleStory(0);
  const closing = sampleStory(lastChapter);
  for (const value of [-0.001, -1000, -Number.MAX_VALUE]) {
    assert.deepEqual(sampleStory(value), opening);
  }
  for (const value of [lastChapter + 0.001, 1000, Number.MAX_VALUE]) {
    assert.deepEqual(sampleStory(value), closing);
  }
  for (const value of [NaN, Infinity, -Infinity, undefined, null, '2', {}, []]) {
    assert.deepEqual(sampleStory(value), opening,
      `invalid progress ${String(value)} must not inject NaN into WebGL`);
  }
});

test('samples throughout the story contain only finite coordinates and valid effects', () => {
  for (let i = 0; i <= 200; i++) {
    const pose = sampleStory((i / 200) * lastChapter);
    for (const value of [...pose.camera, ...pose.target, pose.local]) {
      assert.ok(Number.isFinite(value), 'render state cannot contain non-finite values');
    }
    assert.ok(Number.isInteger(pose.index) && pose.index >= 0 && pose.index <= lastChapter);
    for (const key of ['explode', 'tunnel', 'wipe']) {
      assert.ok(Number.isFinite(pose[key]) && pose[key] >= 0 && pose[key] <= 1,
        `${key} must stay within the normalized visual range`);
    }
  }
});

test('notebook export preserves literal user input, including uncertainty and empty decisions', () => {
  const input = Object.freeze({
    task: '  Revisar a descrição do carro 🏎️\nSem inventar medições.  ',
    reference: 'Arquivo A&B <rascunho> "versão 2"',
    criterion: 'Preservar todos os fatos fornecidos.',
    evidence: 'Não executei o teste.\nAinda falta prova.',
    next: '',
    decision: '',
  });
  const result = exportNotebook(input, fixedTime);
  for (const [key, value] of Object.entries(input)) {
    assert.equal(result[key], value, `${key} must remain exactly as written`);
  }
  assert.equal(result.exportedAt, fixedTime);
  assert.equal(result.decision, '', 'an undecided task cannot become accepted');
  assert.notStrictEqual(result, input);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result, 'download is lossless JSON');
});

test('a blank notebook contains no invented approval, evidence or conclusion', () => {
  const result = exportNotebook({}, fixedTime);
  for (const key of ['decision', 'evidence', 'approved', 'verified', 'correct', 'score', 'success']) {
    assert.equal(Object.hasOwn(result, key), false, `${key} cannot be fabricated`);
  }
  assert.equal(result.exportedAt, fixedTime);
  assert.equal(result.schemaVersion, 1);
  assert.match(result.origin, /não verificadas automaticamente/u);
});

test('imported annotations cannot replace export provenance or schema metadata', () => {
  const clean = exportNotebook({}, fixedTime);
  const result = exportNotebook({
    origin: 'Resultado aprovado e verificado automaticamente',
    schemaVersion: '999',
    exportedAt: 'data inventada',
    task: 'Minha tarefa deve permanecer íntegra.',
    decision: 'inconclusivo',
  }, fixedTime);
  assert.equal(result.origin, clean.origin, 'annotations cannot impersonate verification metadata');
  assert.equal(result.schemaVersion, clean.schemaVersion);
  assert.equal(result.exportedAt, fixedTime);
  assert.equal(result.task, 'Minha tarefa deve permanecer íntegra.');
  assert.equal(result.decision, 'inconclusivo');
});
