// Builders for phenomena and suggestion tests.
import { LOCATIONS, SESSIONS } from '../src/config.js';
import { sunEvents, sessionSun } from '../src/sun.js';

export const TZ = 'America/Los_Angeles';

// A dry, clear, mild column. Override any field.
export function local(overrides = {}) {
  return {
    low: 0, mid: 0, high: 0, visibility_m: 24000, relative_humidity: 60, precipitation: 0, precipitation_probability: 0,
    temperature_c: 14, dew_point_c: 8, wind_mph: 8, gust_mph: 12, wind_direction_deg: 270, weather_code: 1, cape: 0,
    freezing_level_m: 3200, aod: 0.1, profile: profile([50, 45, 40, 35, 30, 25]), ...overrides,
  };
}

// Humidity at the six pressure levels, lowest first, at typical heights.
export function profile(rh) {
  const heights = [65, 280, 500, 725, 955, 1435];
  return rh.map((value, i) => ({ height_m: heights[i], rh: value }));
}

// A marine layer whose top sits between two levels.
export function deckColumn(rh, overrides = {}) {
  return local({ low: 95, relative_humidity: 97, visibility_m: 6000, profile: profile(rh), ...overrides });
}

export function sunFor(session, date = '2026-11-13') {
  const anchor = LOCATIONS.find((l) => l.id === 'twin-peaks');
  return sessionSun(sunEvents(anchor.lat, anchor.lon, date, TZ), session, SESSIONS);
}

// A context where every site sees the same column unless `perSite` overrides it.
export function context(session, { column = local(), perSite = {}, hours = null, marine = [], moon = null, priorRain = 0, colors = {} } = {}) {
  return {
    session,
    sun: sunFor(session),
    sites: LOCATIONS.map((site) => {
      const atEvent = perSite[site.id] ?? column;
      const score = colors[site.id];
      return { site, at_event: atEvent, hours: hours?.[site.id] ?? hours?.all ?? [atEvent, atEvent, atEvent], color: score == null ? null : { score, label: 'Go', reason: 'Test reason.' } };
    }),
    marine,
    moon,
    prior_rain_mm: priorRain,
  };
}
