// Wiring: build the sample grid, fetch both models plus air quality, score
// every location for today and the next two evenings, render.
import { LOCATIONS, SCORING, FORECAST } from './config.js';
import { samplePoints } from './geo.js';
import { sunEvents, localDateString } from './sun.js';
import { buildForecastUrl, buildAirQualityUrl, asSeriesList, inputsAt, hasCloudData, cachedFetchJson } from './forecast.js';
import { scoreEvening, confidence } from './score.js';
import { renderPage, renderError } from './render.js';

const TZ = FORECAST.display_timezone;

// Dates (local), one per outlook day, starting today.
function outlookDates(now) {
  const dates = [];
  for (let i = 0; i < SCORING.outlook_days; i += 1) {
    dates.push(localDateString(new Date(now.getTime() + i * 86400 * 1000), TZ));
  }
  return dates;
}

// Each location needs sample points along its own sunset bearing, which
// changes slightly day to day. The grid uses today's bearing; the drift over
// three days is well under the model grid spacing.
function buildGrid(todayDate) {
  return LOCATIONS.map((loc) => {
    const sun = sunEvents(loc.lat, loc.lon, todayDate, TZ);
    return {
      location: loc,
      points: [{ lat: loc.lat, lon: loc.lon, distance_km: 0 }, ...samplePoints(loc.lat, loc.lon, sun.azimuth_deg, SCORING.sample_distances_km)],
    };
  });
}

async function fetchAll(grid, now) {
  const allPoints = grid.flatMap((g) => g.points);
  const locationPoints = grid.map((g) => g.points[0]);
  const opts = { storage: safeStorage(), ttlMs: SCORING.cache_ttl_min * 60 * 1000, now: now.getTime() };

  const [hires, global, air] = await Promise.allSettled([
    cachedFetchJson(buildForecastUrl(allPoints, FORECAST.hires_model, FORECAST), opts),
    cachedFetchJson(buildForecastUrl(allPoints, FORECAST.global_model, FORECAST), opts),
    cachedFetchJson(buildAirQualityUrl(locationPoints, FORECAST), opts),
  ]);
  return { hires, global, air };
}

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function seriesFor(result) {
  return result.status === 'fulfilled' ? asSeriesList(result.value.data) : null;
}

function scoreWithModel(series, gridIndex, pointsPerLocation, location, sun, airSeries) {
  if (!series) return null;
  const base = gridIndex * pointsPerLocation;
  const locationSeries = series[base];
  const sampleSeries = series.slice(base + 1, base + pointsPerLocation);
  if (!locationSeries || sampleSeries.length !== SCORING.sample_distances_km.length) return null;
  const atSunset = inputsAt(locationSeries, sampleSeries, SCORING.sample_distances_km, sun.sunset_utc, airSeries);
  if (!hasCloudData(atSunset)) return null;
  const afterglowTime = new Date(sun.sunset_utc.getTime() + SCORING.afterglow_offset_min * 60 * 1000);
  const atAfterglow = inputsAt(locationSeries, sampleSeries, SCORING.sample_distances_km, afterglowTime, airSeries);
  const result = scoreEvening(atSunset, hasCloudData(atAfterglow) ? atAfterglow : null, location, SCORING, LOCATIONS);
  return { ...result, inputs: result.evaluated_at === 'afterglow' ? atAfterglow : atSunset };
}

// Build the SunsetForecast records for one location across the outlook days.
function forecastsForLocation(grid, gridIndex, dates, series, notes) {
  const { location, points } = grid[gridIndex];
  return dates.map((date, dayIndex) => {
    const sun = sunEvents(location.lat, location.lon, date, TZ);
    const airSeries = series.air ? series.air[gridIndex] : null;
    const hires = dayIndex === 0 ? scoreWithModel(series.hires, gridIndex, points.length, location, sun, airSeries) : null;
    const global = scoreWithModel(series.global, gridIndex, points.length, location, sun, airSeries);
    const primary = hires ?? global;
    const conf = confidence(hires?.score ?? null, global?.score ?? null, SCORING);
    if (!primary) {
      return { location_id: location.id, date, model: null, ...sunFields(sun), score: null, label: 'No data', reason: 'Forecast unavailable for this evening.', confidence: conf, samples: [], components: null, notes: [...notes] };
    }
    const dayNotes = [...notes];
    if (dayIndex > 0) dayNotes.push('Global model only');
    else if (!hires) dayNotes.push('High-res model unavailable; global model only');
    if (!primary.inputs.at_location.aod && !series.air) dayNotes.push('Air quality data unavailable');
    return {
      location_id: location.id,
      date,
      model: hires ? FORECAST.hires_model : FORECAST.global_model,
      ...sunFields(sun),
      components: primary.components,
      samples: points.slice(1).map((p, i) => ({ ...p, ...primary.inputs.samples[i] })),
      at_location: primary.inputs.at_location,
      blocks: primary.detail.lightPath.blocks,
      score: primary.score,
      label: primary.label,
      reason: primary.reason,
      evaluated_at: primary.evaluated_at,
      confidence: conf,
      notes: dayNotes,
    };
  });
}

function sunFields(sun) {
  return { sunset_utc: sun.sunset_utc, azimuth_deg: sun.azimuth_deg, golden_start: sun.golden_start, blue_end: sun.blue_end };
}

export async function load({ now = new Date() } = {}) {
  const dates = outlookDates(now);
  const grid = buildGrid(dates[0]);
  const fetched = await fetchAll(grid, now);
  const series = { hires: seriesFor(fetched.hires), global: seriesFor(fetched.global), air: seriesFor(fetched.air) };

  if (!series.hires && !series.global) {
    const reason = fetched.global.reason?.message ?? fetched.hires.reason?.message ?? 'unknown error';
    throw new Error(`Could not reach Open-Meteo (${reason}) and nothing is cached yet.`);
  }

  const notes = [];
  const anyStale = [fetched.hires, fetched.global, fetched.air].some((r) => r.status === 'fulfilled' && r.value.stale);
  if (anyStale) notes.push('Offline: showing the last saved forecast');
  if (!series.global) notes.push('Global model unavailable');

  const fetchedAt = [fetched.hires, fetched.global]
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value.fetched_at)
    .reduce((a, b) => Math.max(a, b), 0);

  const byLocation = grid.map((_, i) => forecastsForLocation(grid, i, dates, series, notes));
  return { dates, fetched_at: new Date(fetchedAt), locations: LOCATIONS, forecasts: byLocation, stale: anyStale };
}

async function main() {
  const root = document.getElementById('app');
  const refresh = document.getElementById('refresh');
  const run = async () => {
    refresh.disabled = true;
    try {
      const model = await load();
      renderPage(root, model, { timeZone: TZ, config: SCORING });
    } catch (err) {
      renderError(root, err);
    } finally {
      refresh.disabled = false;
    }
  };
  refresh.addEventListener('click', run);
  await run();
}

if (typeof document !== 'undefined') main();
