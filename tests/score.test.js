import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreInstant, scoreEvening, confidence, labelFor, piecewise } from '../src/score.js';
import { LOCATIONS, SCORING } from '../src/config.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));
const loc = (id) => LOCATIONS.find((l) => l.id === id);
const score = (name, id = 'ocean-beach') => scoreInstant(fixture(name), loc(id), SCORING, LOCATIONS);

test('clear sky everywhere: 10 to 25, Skip or Maybe, reason mentions clear sky', () => {
  const r = score('clear-sky');
  assert.ok(r.score >= 10 && r.score <= 25, `score ${r.score}`);
  assert.ok(['Skip', 'Maybe'].includes(r.label));
  assert.match(r.reason, /clear sky/i);
});

test('50% high cloud overhead, clear light path: 75 or higher', () => {
  const r = score('good-high-cloud');
  assert.ok(r.score >= 75, `score ${r.score}`);
  assert.equal(r.label, "Don't miss");
  assert.match(r.reason, /clear western horizon/i);
});

test('50% high cloud overhead but a 90% deck from 100 to 400 km: below 25, reason names the deck ("goes grey")', () => {
  const r = score('offshore-deck');
  assert.ok(r.score < 25, `score ${r.score}`);
  assert.match(r.reason, /deck 100 to 400 km/);
  assert.ok(r.components.light_path < 0.5);
  assert.ok(r.components.canvas >= 0.99, 'canvas should still be ideal');
});

test('marine layer: Ocean Beach below 25, Twin Peaks meaningfully higher', () => {
  const beach = score('marine-layer', 'ocean-beach');
  const peaks = score('marine-layer', 'twin-peaks');
  assert.ok(beach.score < 25, `beach ${beach.score}`);
  assert.ok(peaks.score >= beach.score + 20, `peaks ${peaks.score} vs beach ${beach.score}`);
  assert.match(beach.reason, /marine layer/i);
  assert.match(beach.reason, /Twin Peaks|Hawk Hill/);
});

test('rain at sunset: below 10', () => {
  const r = score('rain');
  assert.ok(r.score < 10, `score ${r.score}`);
  assert.match(r.reason, /rain/i);
});

test('afterglow evaluation wins when it scores higher', () => {
  const a = fixture('offshore-deck');
  const b = fixture('good-high-cloud');
  const r = scoreEvening(a, b, loc('ocean-beach'), SCORING, LOCATIONS);
  assert.equal(r.evaluated_at, 'afterglow');
  assert.ok(r.score >= 75);
});

test('low confidence when the two models differ by more than 25 points', () => {
  const hires = score('good-high-cloud').score;
  const global = score('offshore-deck').score;
  const c = confidence(hires, global, SCORING);
  assert.equal(c.level, 'low');
  assert.ok(c.diff > 25);
  assert.equal(confidence(60, 50, SCORING).level, 'normal');
  assert.equal(confidence(60, null, SCORING).level, 'single-model');
});

test('labels follow the configured thresholds', () => {
  assert.equal(labelFor(0, SCORING), 'Skip');
  assert.equal(labelFor(24, SCORING), 'Skip');
  assert.equal(labelFor(25, SCORING), 'Maybe');
  assert.equal(labelFor(50, SCORING), 'Go');
  assert.equal(labelFor(75, SCORING), "Don't miss");
  assert.equal(labelFor(100, SCORING), "Don't miss");
});

test('piecewise interpolation', () => {
  const c = [[0, 0], [10, 1], [20, 0.5]];
  assert.equal(piecewise(c, -5), 0);
  assert.equal(piecewise(c, 5), 0.5);
  assert.equal(piecewise(c, 15), 0.75);
  assert.equal(piecewise(c, 50), 0.5);
});

test('smoke flag appears when aerosol optical depth is high', () => {
  const f = fixture('good-high-cloud');
  f.at_location.aod = 0.9;
  const r = scoreInstant(f, loc('ocean-beach'), SCORING, LOCATIONS);
  assert.match(r.reason, /smoke/i);
  assert.ok(r.components.clarity <= 0.7);
});

test('null inputs do not crash scoring', () => {
  const f = fixture('good-high-cloud');
  f.at_location = { low: null, mid: null, high: 50, visibility_m: null, relative_humidity: null, precipitation: null, aod: null };
  f.samples = f.samples.map((s) => ({ ...s, mid: null }));
  const r = scoreInstant(f, loc('ocean-beach'), SCORING, LOCATIONS);
  assert.ok(Number.isFinite(r.score));
});

test('forecast record is JSON serializable', () => {
  const r = score('good-high-cloud');
  const back = JSON.parse(JSON.stringify(r));
  assert.equal(back.score, r.score);
});
