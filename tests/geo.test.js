import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinationPoint, distanceKm, samplePoints } from '../src/geo.js';
import { sunEvents } from '../src/sun.js';
import { SCORING } from '../src/config.js';

const OCEAN_BEACH = { lat: 37.7594, lon: -122.5107 };

test('400 km point along the 2026-12-21 sunset bearing from Ocean Beach lands over the Pacific to the WSW', () => {
  const sun = sunEvents(OCEAN_BEACH.lat, OCEAN_BEACH.lon, '2026-12-21', 'America/Los_Angeles');
  const p = destinationPoint(OCEAN_BEACH.lat, OCEAN_BEACH.lon, sun.azimuth_deg, 400);
  // Reference computed independently with the NOAA sunset azimuth (240.53°)
  // and the spherical destination formula in Python.
  const expected = { lat: 35.926, lon: -126.379 };
  assert.ok(distanceKm(p.lat, p.lon, expected.lat, expected.lon) < 1, `off by ${distanceKm(p.lat, p.lon, expected.lat, expected.lon).toFixed(2)} km`);
  assert.ok(p.lon < OCEAN_BEACH.lon && p.lat < OCEAN_BEACH.lat, 'should be west and south');
});

test('100 km due west from Ocean Beach', () => {
  const p = destinationPoint(OCEAN_BEACH.lat, OCEAN_BEACH.lon, 270, 100);
  assert.ok(distanceKm(p.lat, p.lon, 37.75393, -123.64818) < 0.05);
  assert.ok(Math.abs(distanceKm(OCEAN_BEACH.lat, OCEAN_BEACH.lon, p.lat, p.lon) - 100) < 0.01);
});

test('sample points come back at the configured distances, in order', () => {
  const pts = samplePoints(OCEAN_BEACH.lat, OCEAN_BEACH.lon, 250, SCORING.sample_distances_km);
  assert.equal(pts.length, 7);
  assert.deepEqual(pts.map((p) => p.distance_km), SCORING.sample_distances_km);
  pts.forEach((p) => assert.ok(Math.abs(distanceKm(OCEAN_BEACH.lat, OCEAN_BEACH.lon, p.lat, p.lon) - p.distance_km) < 0.01));
});

test('config distance weight rows match the sample distances', () => {
  for (const layer of ['low', 'mid', 'high']) {
    assert.equal(SCORING.distance_weights[layer].length, SCORING.sample_distances_km.length, layer);
  }
});
