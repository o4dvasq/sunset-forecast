// Pure scoring. No DOM, no network. Takes cloud/clarity inputs already
// interpolated to the evaluation time and returns components, score, label,
// reason, and confidence. Reusable from Node for backtests and alerts.

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const pct = (x) => (x == null ? null : clamp01(x / 100));

// Linear interpolation over a sorted piecewise table [[x, y], ...].
export function piecewise(curve, x) {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i += 1) {
    const [x0, y0] = curve[i - 1];
    const [x1, y1] = curve[i];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return curve[curve.length - 1][1];
}

function normalize(weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / sum);
}

// C: is there something overhead to light up?
export function canvasComponent(atLocation, location, cfg) {
  const high = pct(atLocation.high) ?? 0;
  const mid = pct(atLocation.mid) ?? 0;
  const low = pct(atLocation.low) ?? 0;
  const canvasCover = Math.max(high, cfg.canvas_mid_factor * mid);
  let value = piecewise(cfg.canvas_curve, canvasCover * 100);
  // An elevated spot can look over a shallow layer, so the low cover is scaled
  // by the location's fog sensitivity before the cap applies.
  const effectiveLow = low * location.fog_sensitivity;
  const hiddenByLow = effectiveLow > cfg.canvas_low_cap.cover_threshold;
  if (hiddenByLow) value = Math.min(value, cfg.canvas_low_cap.cap);
  return { value, canvas_cover: canvasCover, hidden_by_low: hiddenByLow };
}

// L: can low-angle light reach the canvas from upstream? Each layer's cover is
// averaged along the path with that layer's distance weights, then the three
// layers combine as independent blockers: blocked = 1 - prod(1 - B_layer).
export function lightPathComponent(samples, cfg) {
  const layers = ['low', 'mid', 'high'];
  let transmission = 1;
  const perLayer = {};
  for (const name of layers) {
    const dw = normalize(cfg.distance_weights[name]);
    let weighted = 0;
    let weightSum = 0;
    samples.forEach((s, i) => {
      const cover = pct(s[name]);
      if (cover == null) return;
      weighted += dw[i] * cfg.block_weights[name] * cover;
      weightSum += dw[i];
    });
    const blocked = weightSum > 0 ? weighted / weightSum : 0;
    perLayer[name] = blocked;
    transmission *= 1 - blocked;
  }
  const blockedFraction = 1 - transmission;
  const value = piecewise(cfg.light_path_curve, blockedFraction);

  // Per-point blocking, for the strip and the reason text.
  const blocks = samples.map((s) => {
    let block = 0;
    let layer = 'low';
    for (const name of layers) {
      const cover = pct(s[name]);
      if (cover == null) continue;
      const b = cfg.block_weights[name] * cover;
      if (b > block) {
        block = b;
        layer = name;
      }
    }
    return { distance_km: s.distance_km, block, layer };
  });
  const blocking = blocks.filter((b) => b.block > cfg.path_block_report_threshold);
  return {
    value,
    blocked_fraction: blockedFraction,
    per_layer: perLayer,
    blocking_range_km: blocking.length ? [blocking[0].distance_km, blocking[blocking.length - 1].distance_km] : null,
    blocking_layer: blocking.length ? dominantLayer(blocking) : null,
    blocks,
  };
}

function dominantLayer(blocks) {
  const counts = {};
  for (const b of blocks) counts[b.layer] = (counts[b.layer] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// H: is the local horizon open? Marine layer, fog, rain.
export function horizonComponent(atLocation, nearSample, location, cfg) {
  const precip = atLocation.precipitation ?? 0;
  if (precip > cfg.horizon.precip_mm_per_h_threshold) {
    return { value: cfg.horizon.precip_component, raining: true, fog_cover: pct(atLocation.low) ?? 0 };
  }
  const lowHere = pct(atLocation.low) ?? 0;
  const lowNear = pct(nearSample?.low) ?? 0;
  const fogCover = Math.max(lowHere, lowNear);
  return { value: clamp01(1 - location.fog_sensitivity * fogCover), raining: false, fog_cover: fogCover };
}

// A: how clean is the air? 0.6 to 1.1.
export function clarityComponent(atLocation, cfg) {
  const c = cfg.clarity;
  let value = 1.0;
  const notes = [];
  const visKm = atLocation.visibility_m != null ? atLocation.visibility_m / 1000 : null;
  if (visKm != null) {
    if (visKm < c.visibility_km.poor) {
      value -= c.visibility_km.poor_penalty * (1 - visKm / c.visibility_km.poor);
      notes.push('haze');
    } else if (visKm >= c.visibility_km.bonus_from) {
      value += c.visibility_km.bonus;
    }
  }
  const rh = atLocation.relative_humidity;
  if (rh != null && rh > c.humidity_pct.from) {
    value -= c.humidity_pct.max_penalty * Math.min(1, (rh - c.humidity_pct.from) / (100 - c.humidity_pct.from));
  }
  const aod = atLocation.aod;
  let smokeFlag = false;
  if (aod != null && aod > c.aod.from) {
    value -= c.aod.max_penalty * Math.min(1, (aod - c.aod.from) / (c.aod.heavy - c.aod.from));
    smokeFlag = aod >= c.aod.flag_from;
  }
  value = Math.min(c.ceiling, Math.max(c.floor, value));
  return { value, smoke_flag: smokeFlag, haze: notes.includes('haze'), inputs_available: visKm != null || rh != null || aod != null };
}

export function labelFor(score, cfg) {
  let idx = 0;
  for (const t of cfg.label_thresholds) if (score >= t) idx += 1;
  return cfg.labels[idx];
}

function describeCanvas(canvas, atLocation) {
  const cover = canvas.canvas_cover * 100;
  const high = atLocation.high ?? 0;
  const mid = atLocation.mid ?? 0;
  if (cover < 10) return 'Clear sky';
  const kind = high >= 0.8 * mid ? 'high cloud' : 'mid-level cloud';
  if (cover >= 85) return `A solid deck of ${kind}`;
  if (cover >= 60) return `Thick ${kind}`;
  if (kind === 'high cloud') return 'Patchy high cirrus';
  return 'Patchy mid-level cloud';
}

const SESSION_WORDS = {
  evening: { event: 'sunset', side: 'western', line: 'sunset line', watch: 'watch 10 to 20 minutes after sunset' },
  morning: { event: 'sunrise', side: 'eastern', line: 'sunrise line', watch: 'be in place 20 minutes before sunrise' },
};

// One rules-based sentence, led by the limiting factor.
export function reasonText({ canvas, lightPath, horizon, clarity }, atLocation, location, allLocations, session = 'evening') {
  const words = SESSION_WORDS[session];
  const sentences = [];
  if (horizon.raining) {
    sentences.push(`Rain at ${words.event}.`);
  } else if (horizon.value < 0.5 || canvas.hidden_by_low) {
    const elevated = allLocations.filter((l) => l.fog_sensitivity < location.fog_sensitivity).map((l) => l.name.split(',')[0]).slice(0, 2);
    if (location.fog_sensitivity >= 1) {
      let s = location.id.includes('beach') ? 'Marine layer at the beach.' : 'Marine layer at this spot.';
      if (elevated.length && horizon.value < 0.5) s += ` ${elevated.join(' or ')} may clear it.`;
      sentences.push(s);
    } else {
      sentences.push('Marine layer below; this spot may sit above it, but the horizon is a gamble.');
    }
  } else if (canvas.canvas_cover * 100 < 10) {
    sentences.push('Clear sky. Clean light, little color.');
  } else if (lightPath.value < 0.5) {
    const [from, to] = lightPath.blocking_range_km ?? [null, null];
    const deck = lightPath.blocking_layer === 'low' ? 'low deck' : lightPath.blocking_layer === 'mid' ? 'mid-level deck' : 'high deck';
    const range = from != null ? (from === to ? `about ${from} km` : `${from} to ${to} km`) : 'well';
    sentences.push(`${describeCanvas(canvas, atLocation)} overhead, but a ${deck} ${range} out along the ${words.line} will block the light.`);
  } else if (canvas.canvas_cover * 100 >= 85) {
    sentences.push(`${describeCanvas(canvas, atLocation)} overhead with an open light path; it lights up only if the ${words.side} edge is close.`);
  } else {
    sentences.push(`${describeCanvas(canvas, atLocation)} and a clear ${words.side} horizon. Good setup; ${words.watch}.`);
  }
  if (clarity.smoke_flag) sentences.push('Smoke or heavy haze in the air; color may be muted or deep red.');
  else if (clarity.haze && !horizon.raining && horizon.value >= 0.5) sentences.push('Hazy air will soften the color.');
  return sentences.join(' ');
}

// Score one evaluation instant. `inputs` is { at_location, samples } with cover
// in percent, visibility in metres, humidity in percent, precipitation in mm/h,
// aod unitless. Any field may be null.
export function scoreInstant(inputs, location, cfg, allLocations = [location], session = 'evening') {
  const canvas = canvasComponent(inputs.at_location, location, cfg);
  const lightPath = lightPathComponent(inputs.samples, cfg);
  const horizon = horizonComponent(inputs.at_location, inputs.samples[0], location, cfg);
  const clarity = clarityComponent(inputs.at_location, cfg);
  const raw = canvas.value * lightPath.value * horizon.value * clarity.value;
  const score = Math.round(100 * clamp01(raw));
  return {
    score,
    label: labelFor(score, cfg),
    components: { canvas: canvas.value, light_path: lightPath.value, horizon: horizon.value, clarity: clarity.value },
    detail: { canvas, lightPath, horizon, clarity },
    reason: reasonText({ canvas, lightPath, horizon, clarity }, inputs.at_location, location, allLocations, session),
  };
}

// Score at the sun event and at the glow on its dark side (after sunset,
// before sunrise); keep the better one.
export function scoreSession(inputsAtEvent, inputsAtGlow, location, cfg, allLocations, session = 'evening') {
  const eventName = SESSION_WORDS[session].event;
  const glowName = session === 'morning' ? 'preglow' : 'afterglow';
  const a = scoreInstant(inputsAtEvent, location, cfg, allLocations, session);
  if (!inputsAtGlow) return { ...a, evaluated_at: eventName };
  const b = scoreInstant(inputsAtGlow, location, cfg, allLocations, session);
  return b.score > a.score ? { ...b, evaluated_at: glowName } : { ...a, evaluated_at: eventName };
}

export function scoreEvening(inputsAtSunset, inputsAtAfterglow, location, cfg, allLocations) {
  return scoreSession(inputsAtSunset, inputsAtAfterglow, location, cfg, allLocations, 'evening');
}

// Compare two models' scores.
export function confidence(hiresScore, globalScore, cfg) {
  if (hiresScore == null || globalScore == null) return { level: 'single-model', hires: hiresScore, global: globalScore };
  const diff = Math.abs(hiresScore - globalScore);
  return { level: diff > cfg.confidence_disagreement_points ? 'low' : 'normal', hires: hiresScore, global: globalScore, diff };
}
