import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { asSeriesList, interpolate, inputsAt, buildForecastUrl, cachedFetchJson } from '../src/forecast.js';
import { FORECAST } from '../src/config.js';

const raw = JSON.parse(readFileSync(new URL('./fixtures/open-meteo-two-points.json', import.meta.url)));

test('multi-coordinate response parses into one series per point', () => {
  const list = asSeriesList(raw);
  assert.equal(list.length, 2);
  assert.equal(list[0].times[0], Date.parse('2026-12-22T00:00:00Z'));
});

test('interpolation is linear between hours and skips nulls', () => {
  const [s] = asSeriesList(raw);
  const t = Date.parse('2026-12-22T00:30:00Z');
  assert.equal(interpolate(s, 'cloud_cover_low', t), 20);
  assert.equal(interpolate(s, 'cloud_cover_high', Date.parse('2026-12-22T01:30:00Z')), 60); // null on the right
  assert.equal(interpolate(s, 'cloud_cover_high', Date.parse('2026-12-22T02:30:00Z')), 80); // null on the left
  assert.equal(interpolate(s, 'cloud_cover_low', Date.parse('2026-12-23T00:00:00Z')), null); // out of range
  assert.equal(interpolate(s, 'not_a_variable', t), null);
});

test('inputsAt assembles location and sample inputs', () => {
  const [locSeries, sample] = asSeriesList(raw);
  const inputs = inputsAt(locSeries, [sample], [25], Date.parse('2026-12-22T01:00:00Z'), null);
  assert.equal(inputs.at_location.low, 30);
  assert.equal(inputs.at_location.visibility_m, 24000);
  assert.equal(inputs.at_location.aod, null);
  assert.deepEqual(inputs.samples[0], { distance_km: 25, low: 0, mid: null, high: 90 });
});

test('forecast URL carries every point and the model', () => {
  const url = new URL(buildForecastUrl([{ lat: 37.7594, lon: -122.5107 }, { lat: 37.5, lon: -123 }], 'gfs_hrrr', FORECAST));
  assert.equal(url.searchParams.get('latitude'), '37.7594,37.5000');
  assert.equal(url.searchParams.get('models'), 'gfs_hrrr');
  assert.equal(url.searchParams.get('timezone'), 'UTC');
  assert.ok(url.searchParams.get('hourly').includes('cloud_cover_high'));
});

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
}

test('cache serves within TTL, refetches after, and falls back to stale data offline', async () => {
  const storage = memoryStorage();
  let calls = 0;
  const okFetch = async () => { calls += 1; return { ok: true, json: async () => ({ n: calls }) }; };
  const failFetch = async () => { throw new Error('offline'); };
  const ttlMs = 30 * 60 * 1000;

  const first = await cachedFetchJson('u', { fetchImpl: okFetch, storage, ttlMs, now: 0 });
  assert.deepEqual([first.data.n, first.from_cache], [1, false]);
  const second = await cachedFetchJson('u', { fetchImpl: okFetch, storage, ttlMs, now: 10 * 60 * 1000 });
  assert.deepEqual([second.data.n, second.from_cache], [1, true]);
  const third = await cachedFetchJson('u', { fetchImpl: okFetch, storage, ttlMs, now: 40 * 60 * 1000 });
  assert.deepEqual([third.data.n, third.from_cache], [2, false]);
  const offline = await cachedFetchJson('u', { fetchImpl: failFetch, storage, ttlMs, now: 2 * 3600 * 1000 });
  assert.deepEqual([offline.data.n, offline.stale], [2, true]);
  await assert.rejects(cachedFetchJson('other', { fetchImpl: failFetch, storage, ttlMs, now: 0 }));
});
