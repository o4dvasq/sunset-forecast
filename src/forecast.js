// Open-Meteo fetch, multi-coordinate requests, interpolation, and a small
// localStorage cache. Network and storage are injectable so tests run in Node.

export function buildForecastUrl(points, model, cfg) {
  const p = new URLSearchParams({
    latitude: points.map((pt) => pt.lat.toFixed(4)).join(','),
    longitude: points.map((pt) => pt.lon.toFixed(4)).join(','),
    hourly: cfg.hourly.join(','),
    models: model,
    forecast_days: String(cfg.forecast_days),
    timezone: 'UTC',
  });
  return `${cfg.base_url}?${p.toString()}`;
}

export function buildAirQualityUrl(points, cfg) {
  const p = new URLSearchParams({
    latitude: points.map((pt) => pt.lat.toFixed(4)).join(','),
    longitude: points.map((pt) => pt.lon.toFixed(4)).join(','),
    hourly: cfg.air_quality_hourly.join(','),
    forecast_days: String(cfg.forecast_days),
    timezone: 'UTC',
  });
  return `${cfg.air_quality_url}?${p.toString()}`;
}

// Open-Meteo returns an object for one coordinate and an array for several.
export function asSeriesList(response) {
  const list = Array.isArray(response) ? response : [response];
  return list.map((r) => ({
    times: r.hourly.time.map((t) => Date.parse(t.endsWith('Z') ? t : `${t}Z`)),
    hourly: r.hourly,
  }));
}

// Linear interpolation of one hourly variable at a UTC instant. Nulls on one
// side fall back to the other side; nulls on both sides give null.
export function interpolate(series, variable, when) {
  const values = series.hourly[variable];
  if (!values) return null;
  const t = when instanceof Date ? when.getTime() : when;
  const { times } = series;
  if (t < times[0] || t > times[times.length - 1]) return null;
  let i = 0;
  while (i < times.length - 1 && times[i + 1] < t) i += 1;
  const t0 = times[i];
  const t1 = times[Math.min(i + 1, times.length - 1)];
  const v0 = values[i];
  const v1 = values[Math.min(i + 1, times.length - 1)];
  if (v0 == null && v1 == null) return null;
  if (v0 == null) return v1;
  if (v1 == null || t1 === t0) return v0;
  const f = (t - t0) / (t1 - t0);
  return v0 + f * (v1 - v0);
}

// Scoring inputs for one location at one instant, from the series for the
// location point (index 0) and its sample points (indices 1..n).
export function inputsAt(locationSeries, sampleSeries, sampleDistances, when, airSeries) {
  const at = (s, v) => interpolate(s, v, when);
  return {
    at_location: {
      low: at(locationSeries, 'cloud_cover_low'),
      mid: at(locationSeries, 'cloud_cover_mid'),
      high: at(locationSeries, 'cloud_cover_high'),
      visibility_m: at(locationSeries, 'visibility'),
      relative_humidity: at(locationSeries, 'relative_humidity_2m'),
      precipitation: at(locationSeries, 'precipitation'),
      aod: airSeries ? at(airSeries, 'aerosol_optical_depth') : null,
    },
    samples: sampleSeries.map((s, i) => ({
      distance_km: sampleDistances[i],
      low: at(s, 'cloud_cover_low'),
      mid: at(s, 'cloud_cover_mid'),
      high: at(s, 'cloud_cover_high'),
    })),
  };
}

export function hasCloudData(inputs) {
  const a = inputs.at_location;
  return a.low != null || a.mid != null || a.high != null;
}

// Fetch JSON with a time-limited cache. On network failure, return the stale
// cached copy if there is one and mark it stale.
export async function cachedFetchJson(url, { fetchImpl = globalThis.fetch, storage = null, ttlMs, now = Date.now() } = {}) {
  const key = `sunset-forecast:${url}`;
  let cached = null;
  if (storage) {
    try {
      const raw = storage.getItem(key);
      if (raw) cached = JSON.parse(raw);
    } catch {
      cached = null;
    }
  }
  if (cached && now - cached.fetched_at < ttlMs) {
    return { data: cached.data, fetched_at: cached.fetched_at, from_cache: true, stale: false };
  }
  try {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (storage) {
      try {
        storage.setItem(key, JSON.stringify({ fetched_at: now, data }));
      } catch {
        // Storage full or unavailable; the page still works without the cache.
      }
    }
    return { data, fetched_at: now, from_cache: false, stale: false };
  } catch (err) {
    if (cached) return { data: cached.data, fetched_at: cached.fetched_at, from_cache: true, stale: true, error: err };
    throw err;
  }
}
