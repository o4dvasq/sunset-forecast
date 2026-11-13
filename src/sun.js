// SunCalc wrapper. Sunrise and sunset times and bearings, golden and blue
// hour, session windows, and the moon.
import SunCalc from '../vendor/suncalc.js';

const GOLDEN_HOUR_START_DEG = 6;
const BLUE_HOUR_END_DEG = -6;

// Registered once: the morning names are when the sun climbs through the
// angle, the evening names when it sinks through it.
SunCalc.addTime(GOLDEN_HOUR_START_DEG, 'goldenStartRise', 'goldenStart');
SunCalc.addTime(BLUE_HOUR_END_DEG, 'blueEndRise', 'blueEnd');

// SunCalc measures azimuth from south, positive towards west. Convert to a
// compass bearing (0 = north, 90 = east, 270 = west).
export function azimuthToBearing(azimuthRad) {
  return (((azimuthRad * 180) / Math.PI + 180) % 360 + 360) % 360;
}

// Local civil date for a timezone, as 'YYYY-MM-DD'.
export function localDateString(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// Noon on the given local date in the given timezone, as a Date. SunCalc wants
// a Date on the day of interest; local noon keeps it unambiguous.
export function localNoon(dateString, timeZone) {
  const [y, m, d] = dateString.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).formatToParts(guess);
  const localHour = Number(parts.find((p) => p.type === 'hour').value);
  return new Date(guess.getTime() + (12 - localHour) * 3600 * 1000);
}

const SUNSET_ALTITUDE_DEG = -0.833; // refraction plus solar semidiameter, same as SunCalc
const REFINE_WINDOW_MS = 20 * 60 * 1000;

// SunCalc.getTimes is a closed-form approximation that runs one to two minutes
// late at this latitude. SunCalc.getPosition is accurate, so each event time is
// refined by bisection until the sun's altitude matches the target.
export function refineTime(approx, targetAltitudeDeg, lat, lon) {
  if (!(approx instanceof Date) || Number.isNaN(approx.getTime())) return approx;
  const target = (targetAltitudeDeg * Math.PI) / 180;
  const f = (ms) => SunCalc.getPosition(new Date(ms), lat, lon).altitude - target;
  let lo = approx.getTime() - REFINE_WINDOW_MS;
  let hi = approx.getTime() + REFINE_WINDOW_MS;
  let fLo = f(lo);
  const fHi = f(hi);
  if (Math.sign(fLo) === Math.sign(fHi)) return approx; // no crossing in the window; keep the estimate
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (Math.sign(fMid) === Math.sign(fLo)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
    if (hi - lo < 500) break;
  }
  return new Date(Math.round((lo + hi) / 2));
}

// Sun events for a location on a local date: sunrise and sunset with their
// bearings, the golden hour on each side and the blue hour limits.
export function sunEvents(lat, lon, dateString, timeZone) {
  const noon = localNoon(dateString, timeZone);
  const times = SunCalc.getTimes(noon, lat, lon);
  const sunset = refineTime(times.sunset, SUNSET_ALTITUDE_DEG, lat, lon);
  const sunrise = refineTime(times.sunrise, SUNSET_ALTITUDE_DEG, lat, lon);
  return {
    date: dateString,
    sunset_utc: sunset,
    golden_start: refineTime(times.goldenStart, GOLDEN_HOUR_START_DEG, lat, lon),
    blue_end: refineTime(times.blueEnd, BLUE_HOUR_END_DEG, lat, lon),
    azimuth_deg: azimuthToBearing(SunCalc.getPosition(sunset, lat, lon).azimuth),
    sunrise_utc: sunrise,
    blue_start: refineTime(times.blueEndRise, BLUE_HOUR_END_DEG, lat, lon),
    golden_end: refineTime(times.goldenStartRise, GOLDEN_HOUR_START_DEG, lat, lon),
    sunrise_azimuth_deg: azimuthToBearing(SunCalc.getPosition(sunrise, lat, lon).azimuth),
  };
}

// One session's view of the sun: the event, its bearing, the twilight and
// golden limits in time order, and the window the weather is read across.
export function sessionSun(events, session, sessionsCfg) {
  const cfg = sessionsCfg[session];
  const morning = session === 'morning';
  const event = morning ? events.sunrise_utc : events.sunset_utc;
  const minutes = (m) => new Date(event.getTime() + m * 60 * 1000);
  return {
    session,
    date: events.date,
    event_utc: event,
    azimuth_deg: morning ? events.sunrise_azimuth_deg : events.azimuth_deg,
    first_light: morning ? events.blue_start : events.golden_start,
    last_light: morning ? events.golden_end : events.blue_end,
    window_start: minutes(-cfg.lead_min),
    window_end: minutes(cfg.tail_min),
  };
}

export function sunAltitudeDeg(date, lat, lon) {
  return (SunCalc.getPosition(date, lat, lon).altitude * 180) / Math.PI;
}

function moonAltitudeRad(ms, lat, lon) {
  return SunCalc.getMoonPosition(new Date(ms), lat, lon).altitude;
}

// Moonrise and moonset inside a window, found by scanning the moon's altitude
// and bisecting each sign change. SunCalc.getMoonTimes depends on the system
// timezone, which differs between a phone and a build server.
export function moonCrossings(lat, lon, start, end, stepMin = 10) {
  const crossings = [];
  const stepMs = stepMin * 60 * 1000;
  let t0 = start.getTime();
  let a0 = moonAltitudeRad(t0, lat, lon);
  while (t0 < end.getTime()) {
    const t1 = Math.min(t0 + stepMs, end.getTime());
    const a1 = moonAltitudeRad(t1, lat, lon);
    if (Math.sign(a0) !== Math.sign(a1)) {
      let lo = t0;
      let hi = t1;
      const rising = a1 > a0;
      for (let i = 0; i < 20; i += 1) {
        const mid = (lo + hi) / 2;
        const above = moonAltitudeRad(mid, lat, lon) > 0;
        if (above === rising) hi = mid;
        else lo = mid;
      }
      const when = new Date(Math.round((lo + hi) / 2));
      crossings.push({
        type: rising ? 'rise' : 'set',
        time: when,
        azimuth_deg: azimuthToBearing(SunCalc.getMoonPosition(when, lat, lon).azimuth),
      });
    }
    t0 = t1;
    a0 = a1;
  }
  return crossings;
}

// Everything the moon detectors need for one session.
export function moonInfo(lat, lon, sun) {
  const illumination = SunCalc.getMoonIllumination(sun.event_utc);
  const position = SunCalc.getMoonPosition(sun.event_utc, lat, lon);
  return {
    fraction: illumination.fraction,
    waxing: illumination.phase < 0.5,
    altitude_deg: (position.altitude * 180) / Math.PI,
    azimuth_deg: azimuthToBearing(position.azimuth),
    crossings: moonCrossings(lat, lon, new Date(sun.window_start.getTime() - 60 * 60 * 1000), new Date(sun.window_end.getTime() + 60 * 60 * 1000)),
  };
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compassPoint(bearingDeg) {
  return COMPASS[Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8];
}

export function formatLocalTime(date, timeZone) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date);
}
