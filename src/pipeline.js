// Fetch, score and describe every session in the outlook. No DOM, so the page
// and the Node brief script share it. Network and storage are injectable.
import { LOCATIONS, SCORING, FORECAST, SESSIONS, PHENOMENA, KIT } from './config.js';
import { samplePoints } from './geo.js';
import { sunEvents, sessionSun, moonInfo, localDateString } from './sun.js';
import { buildForecastUrl, buildLocalUrl, buildAirQualityUrl, buildMarineUrl, asSeriesList, inputsAt, localAt, marineAt, hasCloudData, cachedFetchJson } from './forecast.js';
import { scoreSession, confidence, labelFor } from './score.js';
import { detectPhenomena, siteFogState } from './phenomena.js';
import { suggest } from './suggest.js';

const TZ = FORECAST.display_timezone;
const SESSION_NAMES = ['morning', 'evening'];
const ANCHOR_SITE_ID = 'twin-peaks'; // session-level sun, moon and prior rain are read here
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function outlookDates(now) {
  const dates = [];
  for (let i = 0; i < SCORING.outlook_days; i += 1) {
    dates.push(localDateString(new Date(now.getTime() + i * 24 * HOUR), TZ));
  }
  return dates;
}

// One flat list of points for the cloud request: for each site, the site
// itself, then its sample points along the sunrise and sunset bearings for the
// sessions it faces. The grid uses today's bearings; the drift over three days
// is well under the model grid spacing.
export function buildGrid(todayDate) {
  const points = [];
  const grid = LOCATIONS.map((location) => {
    const events = sunEvents(location.lat, location.lon, todayDate, TZ);
    const entry = { location, site_index: points.length, paths: {} };
    points.push({ lat: location.lat, lon: location.lon, distance_km: 0 });
    for (const session of SESSION_NAMES) {
      if (!location.faces.includes(session)) continue;
      const bearing = session === 'morning' ? events.sunrise_azimuth_deg : events.azimuth_deg;
      const samples = samplePoints(location.lat, location.lon, bearing, SCORING.sample_distances_km);
      entry.paths[session] = { start: points.length, samples };
      points.push(...samples);
    }
    return entry;
  });
  return { grid, points };
}

async function fetchAll(points, now, { fetchImpl, storage }) {
  const sitePoints = LOCATIONS.map((l) => ({ lat: l.lat, lon: l.lon }));
  const opts = { fetchImpl, storage, ttlMs: SCORING.cache_ttl_min * MINUTE, now: now.getTime() };
  const requests = {
    hires: buildForecastUrl(points, FORECAST.hires_model, FORECAST),
    global: buildForecastUrl(points, FORECAST.global_model, FORECAST),
    local_hires: buildLocalUrl(sitePoints, FORECAST.hires_model, FORECAST),
    local_global: buildLocalUrl(sitePoints, FORECAST.global_model, FORECAST),
    air: buildAirQualityUrl(sitePoints, FORECAST),
    marine: buildMarineUrl(FORECAST),
  };
  const names = Object.keys(requests);
  const settled = await Promise.allSettled(names.map((name) => cachedFetchJson(requests[name], opts)));
  return Object.fromEntries(names.map((name, i) => [name, settled[i]]));
}

function seriesFor(result) {
  return result.status === 'fulfilled' ? asSeriesList(result.value.data) : null;
}

function scoreWithModel(series, entry, session, sun, airSeries) {
  const path = entry.paths[session];
  if (!series || !path) return null;
  const locationSeries = series[entry.site_index];
  const sampleSeries = series.slice(path.start, path.start + path.samples.length);
  if (!locationSeries || sampleSeries.length !== SCORING.sample_distances_km.length) return null;
  const atEvent = inputsAt(locationSeries, sampleSeries, SCORING.sample_distances_km, sun.event_utc, airSeries);
  if (!hasCloudData(atEvent)) return null;
  const glowOffset = session === 'morning' ? -SCORING.preglow_offset_min : SCORING.afterglow_offset_min;
  const atGlow = inputsAt(locationSeries, sampleSeries, SCORING.sample_distances_km, new Date(sun.event_utc.getTime() + glowOffset * MINUTE), airSeries);
  const result = scoreSession(atEvent, hasCloudData(atGlow) ? atGlow : null, entry.location, SCORING, LOCATIONS, session);
  return { ...result, inputs: result.evaluated_at === sun.event_name ? atEvent : atGlow };
}

function windowInstants(sun) {
  const instants = [];
  for (let t = sun.window_start.getTime(); t <= sun.window_end.getTime(); t += SESSIONS.step_min * MINUTE) instants.push(new Date(t));
  return instants;
}

// Local weather for one site across the window, from the high-resolution model
// where it reaches the event and the global model otherwise.
function localForSite(series, siteIndex, sun, airSeries) {
  for (const model of ['local_hires', 'local_global']) {
    const s = series[model]?.[siteIndex];
    if (!s) continue;
    const atEvent = localAt(s, sun.event_utc, FORECAST, airSeries);
    if (atEvent.low == null && atEvent.temperature_c == null) continue;
    return { model, series: s, at_event: atEvent, hours: windowInstants(sun).map((t) => localAt(s, t, FORECAST, airSeries)).filter((l) => l.low != null || l.temperature_c != null) };
  }
  return null;
}

// Rain that fell at a site in the hours before the event, in mm.
function priorRain(localSeries, event) {
  if (!localSeries) return null;
  const values = localSeries.hourly.precipitation;
  if (!values) return null;
  let total = 0;
  let found = false;
  localSeries.times.forEach((t, i) => {
    const hoursBefore = (event.getTime() - t) / HOUR;
    if (hoursBefore >= 0 && hoursBefore < SESSIONS.prior_rain_hours && values[i] != null) {
      total += values[i];
      found = true;
    }
  });
  return found ? total : null;
}

function siteRecord(entry, date, session, sun, series, siteIndex, notes) {
  const { location } = entry;
  const airSeries = series.air ? series.air[siteIndex] : null;
  const local = localForSite(series, siteIndex, sun, airSeries);
  const record = {
    location_id: location.id,
    date,
    session,
    faces: location.faces.includes(session),
    event_utc: sun.event_utc,
    first_light: sun.first_light,
    last_light: sun.last_light,
    azimuth_deg: sun.azimuth_deg,
    local: local?.at_event ?? null,
    local_hours: local?.hours ?? [],
    local_series: local?.series ?? null,
    fog: local ? siteFogState(location, local.at_event, PHENOMENA) : null,
    score: null,
    label: null,
    reason: null,
    components: null,
    samples: [],
    confidence: null,
    notes: [...notes],
  };
  if (!record.faces) return record;

  const hires = scoreWithModel(series.hires, entry, session, sun, airSeries);
  const global = scoreWithModel(series.global, entry, session, sun, airSeries);
  const primary = hires ?? global;
  record.confidence = confidence(hires?.score ?? null, global?.score ?? null, SCORING);
  if (!primary) {
    record.label = 'No data';
    record.reason = 'Forecast unavailable for this session.';
    return record;
  }
  if (!hires) record.notes.push('Global model only');
  if (!series.air) record.notes.push('Air quality data unavailable');
  return {
    ...record,
    model: hires ? FORECAST.hires_model : FORECAST.global_model,
    components: primary.components,
    samples: entry.paths[session].samples.map((p, i) => ({ ...p, ...primary.inputs.samples[i] })),
    at_location: primary.inputs.at_location,
    blocks: primary.detail.lightPath.blocks,
    score: primary.score,
    label: primary.label,
    reason: primary.reason,
    evaluated_at: primary.evaluated_at,
  };
}

function buildSession(grid, date, session, series, notes, now) {
  const anchorIndex = Math.max(0, LOCATIONS.findIndex((l) => l.id === ANCHOR_SITE_ID));
  const anchor = LOCATIONS[anchorIndex];
  const sunFor = (location) => {
    const sun = sessionSun(sunEvents(location.lat, location.lon, date, TZ), session, SESSIONS);
    return { ...sun, event_name: SESSIONS[session].event };
  };
  const anchorSun = sunFor(anchor);
  const records = grid.map((entry, i) => siteRecord(entry, date, session, sunFor(entry.location), series, i, notes));

  const ctx = {
    session,
    sun: anchorSun,
    sites: records.map((record, i) => ({
      site: LOCATIONS[i],
      hours: record.local_hours,
      at_event: record.local,
      color: record.score != null ? { score: record.score, label: record.label, reason: record.reason } : null,
    })),
    marine: series.marine ? windowInstants(anchorSun).map((t) => marineAt(series.marine[0], t)).filter((m) => m.wave_m != null || m.sea_level_m != null) : [],
    moon: moonInfo(anchor.lat, anchor.lon, anchorSun),
    prior_rain_mm: priorRain(records[anchorIndex].local_series, anchorSun.event_utc),
  };
  const phenomena = detectPhenomena(ctx, PHENOMENA, TZ);
  const suggestions = suggest(phenomena, anchorSun, LOCATIONS, KIT);

  const scored = records.filter((r) => r.score != null);
  const best = scored.length ? scored.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  const topRank = suggestions.length ? suggestions[0].rank : 0;
  const hasData = records.some((r) => r.local != null) || scored.length > 0;
  const rating = hasData ? Math.round(100 * Math.min(1, Math.max(topRank, (best?.score ?? 0) / 100))) : null;

  // The series objects are large and only needed while building.
  for (const record of records) {
    delete record.local_series;
    delete record.local_hours;
  }

  return {
    key: `${date}:${session}`,
    date,
    session,
    label: SESSIONS[session].label,
    sun: anchorSun,
    past: now.getTime() > anchorSun.window_end.getTime(),
    sites: records,
    phenomena,
    suggestions,
    best: best ? { site_id: best.location_id, score: best.score, label: best.label } : null,
    rating,
    rating_label: rating == null ? 'No data' : labelFor(rating, SCORING),
    anchor_local: records[anchorIndex].local,
  };
}

export async function load({ now = new Date(), fetchImpl = globalThis.fetch, storage = null } = {}) {
  const dates = outlookDates(now);
  const { grid, points } = buildGrid(dates[0]);
  const fetched = await fetchAll(points, now, { fetchImpl, storage });
  const series = Object.fromEntries(Object.entries(fetched).map(([name, result]) => [name, seriesFor(result)]));

  if (!series.hires && !series.global && !series.local_hires && !series.local_global) {
    const reason = fetched.global.reason?.message ?? fetched.hires.reason?.message ?? 'unknown error';
    throw new Error(`Could not reach Open-Meteo (${reason}) and nothing is cached yet.`);
  }

  const notes = [];
  const fulfilled = Object.values(fetched).filter((r) => r.status === 'fulfilled');
  const anyStale = fulfilled.some((r) => r.value.stale);
  if (anyStale) notes.push('Offline: showing the last saved forecast');
  if (!series.global) notes.push('Global model unavailable');
  if (!series.local_hires && !series.local_global) notes.push('Local weather unavailable; colour scores only');
  if (!series.marine) notes.push('Surf and tide data unavailable');

  const fetchedAt = fulfilled.map((r) => r.value.fetched_at).reduce((a, b) => Math.max(a, b), 0);
  const sessions = dates.flatMap((date) => SESSION_NAMES.map((session) => buildSession(grid, date, session, series, notes, now)));
  return { dates, fetched_at: new Date(fetchedAt), locations: LOCATIONS, sessions, stale: anyStale, notes };
}

// The session to show first: the first one that has not ended.
export function currentSession(model) {
  return model.sessions.find((s) => !s.past) ?? model.sessions[model.sessions.length - 1];
}
