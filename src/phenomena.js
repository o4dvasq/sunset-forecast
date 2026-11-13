// Pure detectors: what is the weather offering this session? No DOM, no
// network. Takes local weather already interpolated across the session window
// and returns a list of phenomena, strongest first. Every threshold comes from
// the PHENOMENA block in config.js.
//
// Context shape:
//   session        'morning' | 'evening'
//   sun            sessionSun() result
//   sites          [{ site, hours: [local...], at_event: local, color: { score, label, reason } | null }]
//   marine         [marineAt() ...] across the window, possibly empty
//   moon           moonInfo() result, or null
//   prior_rain_mm  rain in the hours before the event, or null

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const known = (values) => values.filter((v) => v != null && Number.isFinite(v));
const maxOf = (values) => (known(values).length ? Math.max(...known(values)) : null);
const minOf = (values) => (known(values).length ? Math.min(...known(values)) : null);
const meanOf = (values) => (known(values).length ? known(values).reduce((a, b) => a + b, 0) / known(values).length : null);

function median(values) {
  const sorted = known(values).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function roundTo(value, step) {
  return Math.round(value / step) * step;
}

// Where the low cloud deck sits in one column: its base and top, from the
// humidity profile. Heights are metres above sea level. The top is null when
// the deck is thinner than the spacing between pressure levels.
export function deckProfile(local, cfg) {
  const fog = cfg.fog;
  const inFogByVisibility = local.visibility_m != null && local.visibility_m < fog.in_fog_visibility_m;
  const present = (local.low != null && local.low >= fog.deck_cover_pct) || inFogByVisibility;
  if (!present) return { present: false, top_m: null, base_m: null };

  const levels = (local.profile ?? []).filter((level) => level.height_m <= fog.profile_ceiling_m);
  const first = levels.findIndex((level) => level.rh >= fog.saturated_rh_pct);
  const surfaceSaturated = inFogByVisibility || (local.relative_humidity != null && local.relative_humidity >= fog.surface_rh_pct);
  if (first === -1) {
    return { present: true, top_m: null, base_m: surfaceSaturated ? 0 : null };
  }
  let last = first;
  while (last + 1 < levels.length && levels[last + 1].rh >= fog.saturated_rh_pct) last += 1;

  // Top: where humidity falls through the threshold above the last saturated level.
  let top = levels[last].height_m;
  const above = levels[last + 1];
  if (above && levels[last].rh > above.rh) {
    const fraction = (levels[last].rh - fog.saturated_rh_pct) / (levels[last].rh - above.rh);
    top += clamp01(fraction) * (above.height_m - levels[last].height_m);
  }

  // Base: the ground if the surface air is saturated, otherwise where humidity
  // climbs through the threshold below the first saturated level.
  let base = 0;
  if (!surfaceSaturated) {
    const below = first > 0 ? levels[first - 1] : { height_m: 0, rh: local.relative_humidity ?? fog.saturated_rh_pct };
    const span = levels[first].rh - below.rh;
    const fraction = span > 0 ? (fog.saturated_rh_pct - below.rh) / span : 0;
    base = below.height_m + clamp01(fraction) * (levels[first].height_m - below.height_m);
  }
  return { present: true, top_m: top, base_m: base };
}

// How one site sits relative to the deck in its own column.
export function siteFogState(site, local, cfg) {
  const deck = deckProfile(local, cfg);
  if (!deck.present) return { state: 'clear', deck };
  if (deck.top_m != null && site.elevation_m >= deck.top_m + cfg.fog.above_margin_m) return { state: 'above', deck };
  const baseReachesSite = deck.base_m != null && deck.base_m <= site.elevation_m;
  if (baseReachesSite) return { state: 'in', deck };
  return { state: 'under', deck };
}

// The marine layer as the sea-level reference columns see it at the event.
export function marineLayer(ctx, cfg) {
  const reference = ctx.sites.filter((entry) => cfg.fog.reference_sites.includes(entry.site.id) && entry.at_event && (entry.at_event.precipitation ?? 0) <= cfg.rain.wet_mm_per_h);
  const decks = reference.map((entry) => deckProfile(entry.at_event, cfg));
  const present = decks.filter((deck) => deck.present);
  return {
    coverage: reference.length ? present.length / reference.length : 0,
    top_m: median(present.map((deck) => deck.top_m)),
    base_m: median(present.map((deck) => deck.base_m)),
  };
}

function names(siteEntries) {
  return siteEntries.map((entry) => entry.site.name.split(',')[0].split(' / ')[0]);
}

function joinNames(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

function formatClock(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date).replace(' ', '').toLowerCase();
}

function fogPhenomena(ctx, cfg, out) {
  const fog = cfg.fog;
  const layer = marineLayer(ctx, cfg);
  // Low cloud under a rain band is not fog, so wet columns are left out.
  const dry = (entry) => entry.at_event && (entry.at_event.precipitation ?? 0) <= cfg.rain.wet_mm_per_h;
  const states = ctx.sites.filter(dry).map((entry) => ({ entry, ...siteFogState(entry.site, entry.at_event, cfg) }));
  const anyDeck = states.some((s) => s.state !== 'clear');
  if (!anyDeck) return;

  // Fall back to every column when the sea-level ones are clear but hills are not.
  const top = layer.top_m ?? median(states.filter((s) => s.deck.present).map((s) => s.deck.top_m));
  const coverage = Math.max(layer.coverage, states.filter((s) => s.state !== 'clear').length / states.length);
  const topText = top != null ? `about ${roundTo(top, fog.round_to_m)} m` : null;
  const above = states.filter((s) => s.state === 'above' || (top != null && s.state === 'clear' && s.entry.site.elevation_m >= top + fog.above_margin_m));
  const hawk = states.find((s) => s.entry.site.id === 'hawk-hill');
  const upperCloud = maxOf([hawk?.entry.at_event.mid, hawk?.entry.at_event.high]) ?? 0;
  const lightFactor = upperCloud > fog.upper_cloud_limit_pct ? 0.6 : 1;
  let headline = false;

  if (top != null && top <= fog.deep_top_m && layer.coverage > 0) {
    const towersClear = top >= fog.bridge_road_m && top <= fog.bridge_tower_m;
    if (towersClear && hawk && above.includes(hawk)) {
      out.push({
        id: 'fog-under-bridge',
        title: 'Low fog under the bridge towers',
        strength: clamp01(0.95 * lightFactor * (0.6 + 0.4 * layer.coverage)),
        sites: ['hawk-hill'],
        text: `Marine layer top ${topText}, below the tops of the Golden Gate Bridge towers. From the Marin Headlands the towers should stand clear of the fog.`,
        top_m: top,
      });
      headline = true;
    }
    if (above.length) {
      out.push({
        id: 'fog-sea',
        title: 'Sea of fog below the high ground',
        strength: clamp01(0.8 * lightFactor * (0.6 + 0.4 * coverage)),
        sites: above.map((s) => s.entry.site.id),
        text: `Fog top ${topText}. ${joinNames(names(above.map((s) => s.entry)))} ${above.length === 1 ? 'sits' : 'sit'} above it.`,
        top_m: top,
      });
      headline = true;
    }
  }

  if (top != null && top > fog.deep_top_m && coverage >= 0.5) {
    out.push({
      id: 'socked-in',
      title: 'Deep marine layer',
      strength: 0.6,
      sites: states.filter((s) => s.state !== 'clear').map((s) => s.entry.site.id),
      text: `Low cloud top ${topText}, too deep to get above near the city. Grey, soft and quiet light.`,
      top_m: top,
    });
    headline = true;
  }

  const inTrees = states.filter((s) => s.state === 'in' && fog.forest_sites.includes(s.entry.site.id));
  if (inTrees.length) {
    out.push({
      id: 'fog-in-trees',
      title: 'Fog on the hills and in the trees',
      strength: 0.7,
      sites: inTrees.map((s) => s.entry.site.id),
      text: `The deck reaches the ground at ${joinNames(names(inTrees.map((s) => s.entry)))}. Fog drifting through the hilltop forests.`,
    });
    headline = true;
  }

  const bay = states.find((s) => s.entry.site.id === fog.bay_site);
  if (bay && bay.state === 'in' && (bay.entry.at_event.wind_mph ?? 0) <= fog.bay_calm_mph) {
    out.push({
      id: 'bay-fog',
      title: 'Fog on the Bay',
      strength: 0.7,
      sites: [fog.bay_site],
      text: 'Fog at water level on the Bay with light wind. The Bay Bridge should fade into it.',
    });
    headline = true;
  }

  if (!headline && layer.coverage > 0) {
    const under = states.filter((s) => s.state !== 'clear');
    out.push({
      id: 'marine-layer',
      title: 'Marine layer',
      strength: 0.45,
      sites: under.map((s) => s.entry.site.id),
      text: topText ? `Low cloud at ${joinNames(names(under.map((s) => s.entry)))}, top ${topText}.` : `Low cloud at ${joinNames(names(under.map((s) => s.entry)))}; the model does not resolve its depth.`,
      top_m: top,
    });
  }
}

// Burning off or rolling in: the trend in low cloud across the window at the
// sea-level columns. Runs even when the event itself is clear.
function fogTrend(ctx, cfg, out) {
  const fog = cfg.fog;
  const wet = (hour) => (hour.precipitation ?? 0) > cfg.rain.wet_mm_per_h;
  const reference = ctx.sites
    .filter((entry) => fog.reference_sites.includes(entry.site.id) && entry.hours.length >= 2)
    .filter((entry) => !wet(entry.hours[0]) && !wet(entry.hours[entry.hours.length - 1]));
  const startLow = meanOf(reference.map((entry) => entry.hours[0].low));
  const endLow = meanOf(reference.map((entry) => entry.hours[entry.hours.length - 1].low));
  if (startLow != null && endLow != null) {
    const change = endLow - startLow;
    if (change <= -fog.change_points) {
      out.push({ id: 'fog-clearing', title: 'Fog burning off', strength: 0.55, sites: [], text: `Low cloud at the coast drops from ${Math.round(startLow)}% to ${Math.round(endLow)}% through the session. Watch the edges as it breaks.` });
    } else if (change >= fog.change_points) {
      out.push({ id: 'fog-arriving', title: 'Fog rolling in', strength: 0.6, sites: ['hawk-hill', 'twin-peaks'], text: `Low cloud at the coast builds from ${Math.round(startLow)}% to ${Math.round(endLow)}% through the session. Fog pushing in through the Golden Gate.` });
    }
  }
}

function rainPhenomena(ctx, cfg, out) {
  const rain = cfg.rain;
  const allHours = ctx.sites.flatMap((entry) => entry.hours);
  const withPrecip = allHours.filter((h) => h.precipitation != null);
  if (!withPrecip.length) return;
  const wetFraction = withPrecip.filter((h) => h.precipitation > rain.wet_mm_per_h).length / withPrecip.length;
  const maxProbability = maxOf(allHours.map((h) => h.precipitation_probability)) ?? 0;
  const codes = new Set(allHours.map((h) => h.weather_code).filter((c) => c != null));
  const maxCape = maxOf(allHours.map((h) => h.cape)) ?? 0;
  const eventPrecip = maxOf(ctx.sites.map((entry) => entry.at_event?.precipitation)) ?? 0;

  const thunderByCode = cfg.thunder.codes.some((code) => codes.has(code));
  if (thunderByCode || (maxCape >= cfg.thunder.cape_j_per_kg && wetFraction > 0)) {
    out.push({
      id: 'thunder',
      title: 'Thunderstorms possible',
      strength: thunderByCode ? 0.85 : 0.6,
      sites: [],
      text: 'Thunderstorms in the forecast. Lightning is possible; stay off ridges and beaches.',
    });
  }

  if (wetFraction >= rain.steady_fraction) {
    out.push({ id: 'rain', title: 'Steady rain', strength: 0.6, sites: [], text: `Rain through most of the session (${Math.round(wetFraction * 100)}% of it wet). Wet streets and reflections; no sky.` });
  }

  const showery = (wetFraction >= rain.shower_fraction[0] && wetFraction < rain.shower_fraction[1])
    || (maxProbability >= rain.shower_probability_pct[0] && maxProbability <= rain.shower_probability_pct[1] && wetFraction < rain.steady_fraction)
    || rain.shower_codes.some((code) => codes.has(code));
  const lowAtEvent = minOf(ctx.sites.map((entry) => entry.at_event?.low)) ?? 0;
  if (showery && lowAtEvent < rain.rainbow_cloud_limit_pct) {
    const sunBreak = 1 - lowAtEvent / 100;
    const lookTowards = ctx.session === 'morning' ? 'west' : 'east';
    out.push({
      id: 'rainbow',
      title: 'Showers with sun breaks',
      strength: clamp01(0.4 + 0.35 * sunBreak),
      sites: ['twin-peaks', 'grand-view'],
      text: `Passing showers with a low sun. A rainbow is possible; it will be to the ${lookTowards}, opposite the sun.`,
      look: lookTowards,
    });
  }

  if (ctx.prior_rain_mm != null && ctx.prior_rain_mm >= rain.clearing_prior_mm && eventPrecip <= rain.clearing_event_mm_per_h) {
    const first = meanOf(ctx.sites.map((entry) => (entry.hours[0] ? Math.max(entry.hours[0].low ?? 0, entry.hours[0].mid ?? 0) : null)));
    const atEvent = meanOf(ctx.sites.map((entry) => (entry.at_event ? Math.max(entry.at_event.low ?? 0, entry.at_event.mid ?? 0) : null)));
    const bestColor = maxOf(ctx.sites.map((entry) => entry.color?.score)) ?? 0;
    const breaking = first != null && atEvent != null && first - atEvent >= rain.clearing_cloud_drop_points;
    if (breaking || bestColor >= 40) {
      out.push({
        id: 'clearing-storm',
        title: 'Clearing storm',
        strength: clamp01(0.7 + bestColor / 400),
        sites: [],
        text: `About ${ctx.prior_rain_mm.toFixed(1)} mm of rain earlier and the cloud is breaking near ${ctx.session === 'morning' ? 'sunrise' : 'sunset'}. Clean air, dramatic cloud, wet ground.`,
      });
    }
  }
}

function windPhenomena(ctx, cfg, out) {
  const wind = cfg.wind;
  const allHours = ctx.sites.flatMap((entry) => entry.hours);
  const maxGust = maxOf(allHours.map((h) => h.gust_mph));
  if (maxGust != null && maxGust >= wind.strong_gust_mph) {
    const severe = maxGust >= wind.severe_gust_mph;
    out.push({
      id: 'wind',
      title: severe ? 'Dangerous wind' : 'Strong wind',
      strength: severe ? 0.8 : 0.5,
      sites: [],
      text: `Gusts to ${Math.round(maxGust)} mph. ${severe ? 'Stay off exposed ridges and cliffs.' : 'Hold the tripod down on ridges; expect spray at the beaches.'}`,
      gust_mph: maxGust,
    });
    return;
  }
  const waterSites = ctx.sites.filter((entry) => entry.site.water && entry.at_event);
  const calmSites = waterSites.filter((entry) => (entry.at_event.wind_mph ?? Infinity) <= wind.calm_mph && (entry.at_event.gust_mph ?? Infinity) <= wind.calm_gust_mph);
  if (calmSites.length) {
    out.push({ id: 'calm', title: 'Calm air', strength: 0.5, sites: calmSites.map((e) => e.site.id), text: `Wind under ${wind.calm_mph} mph at ${joinNames(names(calmSites))}. Still water and clean reflections.` });
  }
}

function seaPhenomena(ctx, cfg, out, timeZone) {
  if (!ctx.marine?.length) return;
  const maxWave = maxOf(ctx.marine.map((m) => m.wave_m));
  const maxSwell = maxOf(ctx.marine.map((m) => m.swell_m));
  const period = maxOf(ctx.marine.map((m) => m.swell_period_s ?? m.wave_period_s));
  const longSwell = maxSwell != null && period != null && maxSwell >= cfg.surf.swell_m && period >= cfg.surf.long_period_s;
  if ((maxWave != null && maxWave >= cfg.surf.big_wave_m) || longSwell) {
    const huge = maxWave != null && maxWave >= cfg.surf.huge_wave_m;
    const feet = Math.round((maxWave ?? maxSwell) * 3.28);
    out.push({
      id: 'big-surf',
      title: huge ? 'Very large surf' : 'Big surf',
      strength: huge ? 0.85 : 0.6,
      sites: ['ocean-beach', 'lands-end'],
      text: `Waves about ${feet} ft${period ? ` at ${Math.round(period)} s` : ''} off Ocean Beach.${huge ? ' Dangerous: sneaker waves; stay well back from the water.' : ' Keep back from the wash.'}`,
    });
  }

  const levels = ctx.marine.filter((m) => m.sea_level_m != null);
  if (levels.length >= 3) {
    const lowest = levels.reduce((a, b) => (b.sea_level_m < a.sea_level_m ? b : a));
    if (lowest.sea_level_m <= cfg.tide.low_m) {
      const veryLow = lowest.sea_level_m <= cfg.tide.very_low_m;
      out.push({
        id: 'low-tide',
        title: veryLow ? 'Very low tide' : 'Low tide',
        strength: veryLow ? 0.6 : 0.45,
        sites: ['lands-end', 'baker-beach', 'ocean-beach'],
        text: `Low water around ${formatClock(lowest.time, timeZone)}. Wet sand, exposed rock and tide pools.`,
        time: lowest.time,
      });
    }
  }
}

function airPhenomena(ctx, cfg, out) {
  const c = cfg.clarity;
  const atEvent = ctx.sites.map((entry) => entry.at_event).filter(Boolean);
  const aod = maxOf(atEvent.map((l) => l.aod));
  if (aod != null && aod >= c.smoke_aod) {
    const heavy = aod >= c.heavy_smoke_aod;
    out.push({ id: 'smoke', title: heavy ? 'Heavy smoke' : 'Smoke or haze aloft', strength: heavy ? 0.8 : 0.6, sites: [], text: 'Aerosols are high. Muted colour, but the sun goes down as a clean red disc.' });
    return;
  }
  const visibility = median(atEvent.map((l) => l.visibility_m));
  const humidity = median(atEvent.map((l) => l.relative_humidity));
  const anyDeck = atEvent.some((l) => (l.low ?? 0) >= cfg.fog.deck_cover_pct);
  const cleanAir = aod == null || aod <= c.crystal_aod;
  if (!anyDeck && cleanAir && visibility != null && visibility >= c.crystal_visibility_m && humidity != null && humidity <= c.crystal_rh_pct) {
    out.push({ id: 'crystal-air', title: 'Exceptionally clear air', strength: 0.55, sites: [], text: `Visibility about ${Math.round(visibility / 1609)} miles and dry air. Distant detail will be sharp.` });
  }
}

function moonPhenomena(ctx, cfg, out, timeZone) {
  const moon = ctx.moon;
  if (!moon) return;
  const m = cfg.moon;
  const reference = ctx.sites.find((entry) => entry.site.id === 'twin-peaks') ?? ctx.sites[0];
  const cloud = reference?.at_event ? Math.max(reference.at_event.low ?? 0, reference.at_event.mid ?? 0) : 0;
  const skyFactor = cloud > m.sky_cloud_limit_pct ? 0.5 : 1;
  const wanted = ctx.session === 'evening' ? 'rise' : 'set';
  const crossing = moon.crossings.find((c) => c.type === wanted && Math.abs(c.time - ctx.sun.event_utc) <= m.rise_window_min * 60 * 1000);

  if (crossing && moon.fraction >= m.near_full_fraction) {
    const full = moon.fraction >= m.full_fraction;
    const bearing = Math.round(crossing.azimuth_deg);
    const phase = `${full ? 'Full' : 'Nearly full'} moon (${Math.round(moon.fraction * 100)}%)`;
    out.push({
      id: wanted === 'rise' ? 'moonrise' : 'moonset',
      title: wanted === 'rise' ? 'Moonrise at dusk' : 'Moonset at dawn',
      strength: clamp01((full ? 0.8 : 0.6) * skyFactor),
      sites: ['twin-peaks', 'hawk-hill'],
      text: `${phase} ${wanted === 'rise' ? 'rises' : 'sets'} at ${formatClock(crossing.time, timeZone)}, bearing ${bearing}°, while the sky still has colour.`,
      time: crossing.time,
      bearing_deg: bearing,
    });
    return;
  }

  const crescentSide = (ctx.session === 'evening' && moon.waxing) || (ctx.session === 'morning' && !moon.waxing);
  if (crescentSide && moon.fraction <= m.crescent_fraction && moon.altitude_deg >= m.crescent_min_altitude_deg) {
    out.push({
      id: 'crescent',
      title: 'Thin crescent moon',
      strength: clamp01(0.45 * skyFactor),
      sites: [],
      text: `A ${Math.round(moon.fraction * 100)}% crescent hangs ${Math.round(moon.altitude_deg)}° up, bearing ${Math.round(moon.azimuth_deg)}°, in the ${ctx.session === 'evening' ? 'afterglow' : 'dawn sky'}.`,
      bearing_deg: Math.round(moon.azimuth_deg),
    });
  }
}

function snowPhenomena(ctx, cfg, out) {
  const allHours = ctx.sites.flatMap((entry) => entry.hours);
  const freezing = minOf(allHours.map((h) => h.freezing_level_m));
  if (freezing == null || ctx.prior_rain_mm == null || ctx.prior_rain_mm < cfg.snow.prior_mm) return;
  const snowLevel = freezing - cfg.snow.level_below_freezing_m;
  const peaks = cfg.snow.peaks.filter((peak) => peak.m >= snowLevel);
  if (!peaks.length) return;
  out.push({
    id: 'snow',
    title: 'Snow on the peaks',
    strength: 0.7,
    sites: ['twin-peaks', 'grand-view'],
    text: `Snow level near ${roundTo(snowLevel, 50)} m after rain. A dusting is likely on ${joinNames(peaks.map((p) => p.name))}.`,
  });
}

function lightPhenomena(ctx, cfg, out) {
  const light = cfg.light;
  const eventWord = ctx.session === 'morning' ? 'Sunrise' : 'Sunset';
  const scored = ctx.sites.filter((entry) => entry.color?.score != null);
  if (scored.length) {
    const best = scored.reduce((a, b) => (b.color.score > a.color.score ? b : a));
    const scores = Object.fromEntries(scored.map((entry) => [entry.site.id, entry.color.score]));
    out.push({
      id: 'color',
      title: `${eventWord} colour`,
      strength: clamp01(best.color.score / 100),
      sites: scored.filter((entry) => entry.color.score >= best.color.score - 15).map((entry) => entry.site.id),
      text: `Best at ${names([best])[0]}: ${best.color.score} (${best.color.label}). ${best.color.reason}`,
      scores,
      best_site: best.site.id,
    });
  }

  const reference = ctx.sites.find((entry) => entry.site.id === 'twin-peaks' && entry.at_event) ?? ctx.sites.find((entry) => entry.at_event);
  if (!reference) return;
  const local = reference.at_event;
  const raining = (local.precipitation ?? 0) > cfg.rain.wet_mm_per_h;
  const deck = (local.low ?? 0) >= cfg.fog.deck_cover_pct;
  const broken = Math.max(local.low ?? 0, local.mid ?? 0);
  const upper = Math.max(local.mid ?? 0, local.high ?? 0);
  const visibility = local.visibility_m;

  const sunBlockedAloft = (local.high ?? 0) >= light.overcast_pct;
  if (!raining && !sunBlockedAloft && broken >= light.rays_cover_pct[0] && broken <= light.rays_cover_pct[1] && visibility != null && visibility >= light.rays_visibility_m[0] && visibility <= light.rays_visibility_m[1]) {
    out.push({ id: 'rays', title: 'Light rays through broken cloud', strength: 0.4, sites: ['twin-peaks', 'grand-view'], text: 'Broken cloud with some haze in the air. Shafts of light are likely while the sun is low.' });
  }
  if (!raining && !deck && upper >= light.overcast_pct) {
    out.push({ id: 'soft-light', title: 'Soft overcast light', strength: 0.35, sites: [], text: 'High overcast, no shadows. Even light for colour, detail and faces.' });
  }
  if (!raining && !deck && upper < light.clear_pct) {
    out.push({ id: 'clean-light', title: 'Clear sky, clean low light', strength: 0.45, sites: [], text: 'Clear sky. Warm low side-light and long shadows, then a clean blue hour.' });
  }
}

export function detectPhenomena(ctx, cfg, timeZone = 'America/Los_Angeles') {
  const out = [];
  fogPhenomena(ctx, cfg, out);
  fogTrend(ctx, cfg, out);
  rainPhenomena(ctx, cfg, out);
  windPhenomena(ctx, cfg, out);
  seaPhenomena(ctx, cfg, out, timeZone);
  airPhenomena(ctx, cfg, out);
  moonPhenomena(ctx, cfg, out, timeZone);
  snowPhenomena(ctx, cfg, out);
  lightPhenomena(ctx, cfg, out);
  return out
    .filter((p) => p.strength >= cfg.min_strength || p.id === 'color')
    .sort((a, b) => b.strength - a.strength);
}
