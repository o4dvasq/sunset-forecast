import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggest, timingRange } from '../src/suggest.js';
import { composeBrief, editionFor } from '../src/brief.js';
import { detectPhenomena } from '../src/phenomena.js';
import { IDEAS, COLOR_FRAMES } from '../src/catalog.js';
import { LOCATIONS, PHENOMENA, KIT, BRIEF, SCORING } from '../src/config.js';
import { labelFor } from '../src/score.js';
import { local, deckColumn, context, sunFor, TZ } from './helpers.js';

const run = (session, options) => {
  const ctx = context(session, options);
  const phenomena = detectPhenomena(ctx, PHENOMENA, TZ);
  return { ctx, phenomena, ideas: suggest(phenomena, ctx.sun, LOCATIONS, KIT) };
};

test('catalog is well formed', () => {
  const siteIds = new Set(LOCATIONS.map((l) => l.id));
  for (const idea of IDEAS) {
    assert.ok(idea.needs.length && idea.sessions.length && idea.place && idea.shot && idea.kit && idea.sim, idea.id);
    assert.ok(idea.site === null || siteIds.has(idea.site), `${idea.id} site`);
    for (const key of idea.kit.matchAll(/\{(\w+)\}/g)) assert.ok(KIT[key[1]], `${idea.id} uses unknown lens ${key[1]}`);
  }
  for (const location of LOCATIONS) {
    for (const session of location.faces) assert.ok(COLOR_FRAMES[location.id]?.[session], `${location.id} ${session} frame`);
  }
});

test('towers above the fog leads with Hawk Hill and fills in the lens', () => {
  const { ideas } = run('morning', { column: deckColumn([98, 60, 40, 35, 30, 25]) });
  assert.equal(ideas[0].id, 'bridge-above-fog');
  assert.match(ideas[0].kit, /XC 50-230mm/);
  assert.ok(!ideas.some((i) => /\{\w+\}/.test(i.kit)));
  assert.ok(ideas.some((i) => i.id === 'tam-fog-sea'));
});

test('ideas respect the session and at most one idea per site', () => {
  const { ideas } = run('evening', { column: deckColumn([98, 60, 40, 35, 30, 25]) });
  assert.ok(!ideas.some((i) => i.id === 'bay-bridge-fog'), 'morning-only idea in the evening');
  const sites = ideas.map((i) => i.site).filter(Boolean);
  assert.equal(new Set(sites).size, sites.length);
});

test('thunderstorms remove exposed ideas and leave the indoor one', () => {
  const storm = local({ low: 40, mid: 100, precipitation: 3, weather_code: 95, cape: 900 });
  const { ideas } = run('evening', { column: storm });
  assert.deepEqual(ideas.map((i) => i.id), ['lightning']);
});

test('steady rain in the evening sends you to the wet streets', () => {
  const wet = local({ low: 90, mid: 100, precipitation: 1.5 });
  const { ideas } = run('evening', { column: wet });
  assert.equal(ideas[0].id, 'wet-streets-night');
  assert.match(ideas[0].kit, /27mm f\/1\.2/);
});

test('colour ideas appear only for sites that score well, with timing around the event', () => {
  const { ideas, ctx } = run('evening', { column: local({ high: 50 }), colors: { 'ocean-beach': 82, 'hawk-hill': 30 } });
  const beach = ideas.find((i) => i.id === 'color-ocean-beach');
  assert.ok(beach && !ideas.some((i) => i.id === 'color-hawk-hill'));
  assert.ok(beach.from < ctx.sun.event_utc && beach.to > ctx.sun.event_utc);
});

test('moonrise idea carries the bearing and is timed on the moon', () => {
  const sun = sunFor('evening');
  const rise = new Date(sun.event_utc.getTime() + 20 * 60000);
  const moon = { fraction: 0.99, waxing: true, altitude_deg: -2, azimuth_deg: 70, crossings: [{ type: 'rise', time: rise, azimuth_deg: 72 }] };
  const { ideas } = run('evening', { moon });
  const idea = ideas.find((i) => i.id === 'moonrise-city');
  assert.equal(idea.note, 'Bearing 72°.');
  assert.ok(idea.from < rise && idea.to > rise);
});

test('timing ranges are ordered for both sessions', () => {
  for (const session of ['morning', 'evening']) {
    const sun = sunFor(session);
    for (const timing of ['glow', 'golden', 'blue', 'session']) {
      const r = timingRange(timing, sun, null);
      assert.ok(r.from < r.to, `${session} ${timing}`);
    }
  }
});

function modelFrom(session, options) {
  const { ctx, phenomena, ideas } = run(session, options);
  const rating = Math.round(100 * (ideas[0]?.rank ?? 0));
  const make = (name, date) => ({ key: `${date}:${name}`, date, session: name, sun: sunFor(name, date), phenomena, suggestions: ideas, rating, rating_label: labelFor(rating, SCORING), anchor_local: ctx.sites[0].at_event });
  return { dates: ['2026-11-13'], locations: LOCATIONS, notes: [], sessions: [make('morning', '2026-11-13'), make('evening', '2026-11-13'), make('morning', '2026-11-14')] };
}

test('brief reads as a text message: verdict, sun times, weather, numbered ideas, next session, link', () => {
  const model = modelFrom('morning', { column: deckColumn([98, 60, 40, 35, 30, 25]) });
  const text = composeBrief(model, { edition: 'morning', timeZone: TZ, cfg: BRIEF });
  const lines = text.split('\n');
  assert.equal(lines[0], 'Fri, Nov 13, morning');
  assert.match(lines[1], /^(DON'T MISS|GO|MAYBE|SKIP) \(\d+\): Low fog under the bridge towers$/);
  assert.match(text, /First light \d+:\d\dam, sunrise 6:4\dam \(bearing 11\d°\)/);
  assert.match(text, /\nWEATHER\n- /);
  assert.match(text, /\nSHOOT\n1\. Hawk Hill or Battery Spencer, \d+:\d\dam to \d+:\d\dam\./);
  assert.match(text, /\nTonight: /);
  assert.equal(lines[lines.length - 1], BRIEF.url);
  assert.ok(text.split('\nSHOOT\n')[1].split('\n').filter((l) => /^\d\./.test(l)).length <= BRIEF.suggestions);
});

test('evening brief looks ahead to tomorrow morning and a quiet session says so', () => {
  const model = modelFrom('evening', { column: local({ low: 30, mid: 30, high: 30, visibility_m: 3000 }) });
  model.sessions.forEach((s) => { s.suggestions = []; s.phenomena = []; });
  const text = composeBrief(model, { edition: 'evening', timeZone: TZ, cfg: BRIEF });
  assert.match(text, /Nothing worth a special trip/);
  assert.match(text, /\nTomorrow morning: /);
});

test('an idea window that is already open starts now', () => {
  const model = modelFrom('evening', { column: local({ low: 90, mid: 100, precipitation: 1.5 }) });
  const idea = model.sessions[1].suggestions[0];
  const now = new Date((idea.from.getTime() + idea.to.getTime()) / 2);
  assert.match(composeBrief(model, { edition: 'evening', timeZone: TZ, cfg: BRIEF, now }), /, now to \d+:\d\dpm\./);
});

test('edition follows the local clock', () => {
  assert.equal(editionFor(new Date('2026-11-13T13:00:00Z'), TZ, BRIEF.morning_edition_before_hour), 'morning'); // 5:00 am PST
  assert.equal(editionFor(new Date('2026-11-13T23:30:00Z'), TZ, BRIEF.morning_edition_before_hour), 'evening'); // 3:30 pm PST
  assert.equal(editionFor(new Date('2026-07-01T12:00:00Z'), TZ, BRIEF.morning_edition_before_hour), 'morning'); // 5:00 am PDT
});
