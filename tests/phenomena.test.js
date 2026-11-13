import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPhenomena, deckProfile, siteFogState, roundTo } from '../src/phenomena.js';
import { LOCATIONS, PHENOMENA } from '../src/config.js';
import { local, deckColumn, context, sunFor, TZ } from './helpers.js';

const ids = (list) => list.map((p) => p.id);
const site = (id) => LOCATIONS.find((l) => l.id === id);
const detect = (ctx) => detectPhenomena(ctx, PHENOMENA, TZ);

test('deck top is interpolated between pressure levels', () => {
  // Saturated at 65 m, dry by 280 m: the 92% line falls between them.
  const deck = deckProfile(deckColumn([98, 60, 40, 35, 30, 25]), PHENOMENA);
  assert.equal(deck.present, true);
  assert.equal(deck.base_m, 0);
  assert.ok(deck.top_m > 65 && deck.top_m < 280, `top ${deck.top_m}`);
});

test('no low cloud means no deck', () => {
  assert.equal(deckProfile(local(), PHENOMENA).present, false);
});

test('a site above the deck top is above, one inside it is in, one below the base is under', () => {
  const shallow = deckColumn([98, 60, 40, 35, 30, 25]);
  assert.equal(siteFogState(site('hawk-hill'), shallow, PHENOMENA).state, 'above');
  assert.equal(siteFogState(site('ocean-beach'), shallow, PHENOMENA).state, 'in');
  // Stratus lifted off the ground: dry at the surface and 65 m, saturated at 280 to 500 m.
  const lifted = local({ low: 95, relative_humidity: 80, profile: deckColumn([70, 97, 96, 50, 30, 25]).profile });
  assert.equal(siteFogState(site('ocean-beach'), lifted, PHENOMENA).state, 'under');
});

test('shallow marine layer: towers above the fog, sea of fog from the high sites', () => {
  const found = detect(context('morning', { column: deckColumn([98, 60, 40, 35, 30, 25]) }));
  assert.ok(ids(found).includes('fog-under-bridge'), ids(found).join());
  const sea = found.find((p) => p.id === 'fog-sea');
  assert.ok(sea.sites.includes('mount-tam') && sea.sites.includes('hawk-hill'));
  assert.ok(!sea.sites.includes('ocean-beach'));
  assert.match(found.find((p) => p.id === 'fog-under-bridge').text, /about \d+ m/);
});

test('a deck with its top near 400 m buries the bridge but Mount Tam is above it', () => {
  const found = detect(context('evening', { column: deckColumn([98, 97, 80, 40, 30, 25]) }));
  assert.ok(!ids(found).includes('fog-under-bridge'));
  assert.deepEqual(found.find((p) => p.id === 'fog-sea').sites, ['mount-tam']);
  assert.ok(ids(found).includes('fog-in-trees'));
});

test('a deep deck is socked in', () => {
  const found = detect(context('evening', { column: deckColumn([98, 98, 97, 97, 96, 60]) }));
  assert.ok(ids(found).includes('socked-in'));
  assert.ok(!ids(found).includes('fog-sea'));
});

test('low cloud under a rain band is not reported as fog', () => {
  const wet = local({ low: 100, mid: 100, precipitation: 2, relative_humidity: 97, profile: deckColumn([98, 98, 97, 97, 96, 95]).profile });
  const found = detect(context('evening', { column: wet }));
  assert.ok(ids(found).includes('rain'));
  assert.ok(!ids(found).some((id) => id.startsWith('fog') || id === 'socked-in' || id === 'marine-layer'));
});

test('fog burning off and rolling in are read from the trend at the coast', () => {
  const foggy = deckColumn([98, 60, 40, 35, 30, 25]);
  const clear = local();
  assert.ok(ids(detect(context('morning', { column: clear, hours: { all: [foggy, foggy, clear] } }))).includes('fog-clearing'));
  assert.ok(ids(detect(context('evening', { column: foggy, hours: { all: [clear, clear, foggy] } }))).includes('fog-arriving'));
});

test('showers with sun breaks suggest a rainbow opposite the sun', () => {
  const dry = local({ mid: 40, precipitation_probability: 50 });
  const shower = local({ mid: 60, precipitation: 0.8, precipitation_probability: 60, weather_code: 80 });
  const evening = detect(context('evening', { column: dry, hours: { all: [dry, shower, dry, dry, dry, dry] } }));
  assert.equal(evening.find((p) => p.id === 'rainbow').look, 'east');
  const morning = detect(context('morning', { column: dry, hours: { all: [dry, shower, dry, dry, dry, dry] } }));
  assert.equal(morning.find((p) => p.id === 'rainbow').look, 'west');
});

test('rain earlier and breaking cloud at the event is a clearing storm', () => {
  const cloudy = local({ mid: 90 });
  const breaking = local({ mid: 40, high: 40 });
  const found = detect(context('evening', { column: breaking, hours: { all: [cloudy, cloudy, breaking] }, priorRain: 6 }));
  assert.ok(ids(found).includes('clearing-storm'));
  assert.ok(!ids(detect(context('evening', { column: breaking, hours: { all: [cloudy, cloudy, breaking] }, priorRain: 0 }))).includes('clearing-storm'));
});

test('thunderstorm code is reported with a safety line', () => {
  const storm = local({ low: 80, mid: 100, precipitation: 3, weather_code: 95, cape: 900 });
  const thunder = detect(context('evening', { column: storm })).find((p) => p.id === 'thunder');
  assert.match(thunder.text, /stay off/i);
});

test('strong wind and calm air are mutually exclusive', () => {
  const windy = detect(context('evening', { column: local({ wind_mph: 25, gust_mph: 38 }) }));
  assert.ok(ids(windy).includes('wind') && !ids(windy).includes('calm'));
  const calm = detect(context('morning', { column: local({ wind_mph: 2, gust_mph: 4 }) }));
  assert.ok(ids(calm).includes('calm') && !ids(calm).includes('wind'));
  assert.ok(calm.find((p) => p.id === 'calm').sites.includes('embarcadero'));
});

test('big surf and low tide come from the marine series', () => {
  const sun = sunFor('evening');
  const marine = [0, 1, 2, 3].map((i) => ({ time: new Date(sun.window_start.getTime() + i * 3600000), wave_m: 3.6, swell_m: 3.0, swell_period_s: 16, wave_period_s: 14, sea_level_m: [0.2, -0.5, -0.8, -0.3][i] }));
  const found = detect(context('evening', { marine }));
  assert.ok(ids(found).includes('big-surf'));
  const tide = found.find((p) => p.id === 'low-tide');
  assert.equal(tide.time.getTime(), marine[2].time.getTime());
  assert.match(tide.text, /Low water around \d+:\d\d(am|pm)/);
});

test('crystal air needs long visibility, dry air and no deck; smoke overrides it', () => {
  assert.ok(ids(detect(context('evening', { column: local({ visibility_m: 60000, relative_humidity: 40, aod: 0.05 }) }))).includes('crystal-air'));
  const smoky = detect(context('evening', { column: local({ visibility_m: 60000, relative_humidity: 40, aod: 0.9 }) }));
  assert.ok(ids(smoky).includes('smoke') && !ids(smoky).includes('crystal-air'));
});

test('full moon rising near sunset is reported with time and bearing', () => {
  const sun = sunFor('evening');
  const moon = { fraction: 0.99, waxing: true, altitude_deg: -2, azimuth_deg: 70, crossings: [{ type: 'rise', time: new Date(sun.event_utc.getTime() + 20 * 60000), azimuth_deg: 72.4 }] };
  const found = detect(context('evening', { moon })).find((p) => p.id === 'moonrise');
  assert.equal(found.bearing_deg, 72);
  assert.match(found.text, /Full moon \(99%\) rises at \d+:\d\d(am|pm), bearing 72°/);
  const late = { ...moon, crossings: [{ type: 'rise', time: new Date(sun.event_utc.getTime() + 3 * 3600000), azimuth_deg: 72 }] };
  assert.ok(!ids(detect(context('evening', { moon: late }))).includes('moonrise'));
});

test('a low freezing level after rain puts snow on the peaks it reaches', () => {
  const cold = local({ freezing_level_m: 1300, mid: 50 });
  const snow = detect(context('morning', { column: cold, priorRain: 8 })).find((p) => p.id === 'snow');
  assert.match(snow.text, /Mount Diablo and Mount Hamilton/);
  assert.doesNotMatch(snow.text, /Tamalpais/);
});

test('colour is always reported and carries every site score', () => {
  const found = detect(context('evening', { column: local({ high: 50 }), colors: { 'ocean-beach': 80, 'twin-peaks': 70, 'hawk-hill': 30 } }));
  const color = found.find((p) => p.id === 'color');
  assert.equal(color.best_site, 'ocean-beach');
  assert.deepEqual(color.sites, ['ocean-beach', 'twin-peaks']);
  assert.equal(color.scores['hawk-hill'], 30);
  assert.equal(found[0].id, 'color');
});

test('clear sky gives clean light; high overcast gives soft light and no rays', () => {
  assert.ok(ids(detect(context('evening'))).includes('clean-light'));
  const overcast = detect(context('evening', { column: local({ mid: 50, high: 95, visibility_m: 15000 }) }));
  assert.ok(ids(overcast).includes('soft-light') && !ids(overcast).includes('rays'));
  assert.ok(ids(detect(context('evening', { column: local({ mid: 50, high: 20, visibility_m: 15000 }) }))).includes('rays'));
});

test('missing local weather does not crash detection', () => {
  const ctx = context('evening');
  ctx.sites.forEach((entry) => { entry.at_event = null; entry.hours = []; });
  assert.deepEqual(detect(ctx), []);
  assert.equal(roundTo(338, 50), 350);
});
