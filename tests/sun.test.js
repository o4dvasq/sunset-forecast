import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunEvents, azimuthToBearing, localDateString, formatLocalTime } from '../src/sun.js';

const TZ = 'America/Los_Angeles';
const OCEAN_BEACH = { lat: 37.7594, lon: -122.5107 };
const HAWK_HILL = { lat: 37.8255, lon: -122.499 };

// Reference values from the NOAA solar position equations (General Solar
// Position Calculations), computed independently in Python on 2026-11-09.
const REFERENCE = [
  { loc: OCEAN_BEACH, date: '2026-12-21', sunset_utc_min: 1494.76, azimuth: 240.53 },
  { loc: HAWK_HILL, date: '2026-12-21', sunset_utc_min: 1494.53, azimuth: 240.51 },
  { loc: OCEAN_BEACH, date: '2026-06-21', sunset_utc_min: 1655.38, azimuth: 300.96 },
  { loc: HAWK_HILL, date: '2026-06-21', sunset_utc_min: 1655.53, azimuth: 300.99 },
  { loc: OCEAN_BEACH, date: '2026-11-09', sunset_utc_min: 1503.28, azimuth: 248.87 },
];

for (const ref of REFERENCE) {
  test(`sunset for ${ref.date} at ${ref.loc.lat},${ref.loc.lon} within 1 minute and 1 degree of NOAA`, () => {
    const ev = sunEvents(ref.loc.lat, ref.loc.lon, ref.date, TZ);
    const dayStart = Date.parse(`${ref.date}T00:00:00Z`);
    const minutesUtc = (ev.sunset_utc.getTime() - dayStart) / 60000;
    assert.ok(Math.abs(minutesUtc - ref.sunset_utc_min) < 1, `sunset off by ${(minutesUtc - ref.sunset_utc_min).toFixed(2)} min`);
    assert.ok(Math.abs(ev.azimuth_deg - ref.azimuth) < 1, `azimuth ${ev.azimuth_deg.toFixed(2)} vs ${ref.azimuth}`);
  });
}

test('golden hour starts before sunset and blue hour ends after it', () => {
  const ev = sunEvents(OCEAN_BEACH.lat, OCEAN_BEACH.lon, '2026-11-09', TZ);
  assert.ok(ev.golden_start < ev.sunset_utc);
  assert.ok(ev.blue_end > ev.sunset_utc);
  const goldenMin = (ev.sunset_utc - ev.golden_start) / 60000;
  const blueMin = (ev.blue_end - ev.sunset_utc) / 60000;
  assert.ok(goldenMin > 25 && goldenMin < 60, `golden ${goldenMin}`);
  assert.ok(blueMin > 20 && blueMin < 45, `blue ${blueMin}`);
});

test('SunCalc azimuth converts to a compass bearing', () => {
  assert.equal(azimuthToBearing(0), 180); // south
  assert.equal(Math.round(azimuthToBearing(Math.PI / 2)), 270); // west
  assert.equal(Math.round(azimuthToBearing(-Math.PI / 2)), 90); // east
});

test('Pacific date and time formatting', () => {
  const d = new Date('2026-11-10T01:03:00Z');
  assert.equal(localDateString(d, TZ), '2026-11-09');
  assert.equal(formatLocalTime(d, TZ), '5:03 PM');
});
