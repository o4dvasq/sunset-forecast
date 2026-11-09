// Every tunable number for the app lives here. Scoring code reads this file
// and contains no magic numbers of its own.

export const LOCATIONS = [
  { id: 'ocean-beach', name: 'Ocean Beach', lat: 37.7594, lon: -122.5107, elevation_m: 5, fog_sensitivity: 1.0 },
  { id: 'lands-end', name: 'Lands End / Sutro Baths', lat: 37.7800, lon: -122.5130, elevation_m: 10, fog_sensitivity: 1.0 },
  { id: 'twin-peaks', name: 'Twin Peaks', lat: 37.7544, lon: -122.4477, elevation_m: 280, fog_sensitivity: 0.6 },
  { id: 'hawk-hill', name: 'Hawk Hill, Marin Headlands', lat: 37.8255, lon: -122.4990, elevation_m: 280, fog_sensitivity: 0.6 },
];

export const SCORING = {
  // Distances along the sunset bearing where cloud is sampled.
  sample_distances_km: [25, 50, 100, 150, 200, 300, 400],

  // How much each sample distance matters, per cloud layer. The last light that
  // reaches an overhead canvas grazes the Earth about 250 to 320 km out and
  // climbs towards the observer, so a low deck only intercepts it when it sits
  // roughly 100 km or more out; mid cloud intercepts from about 70 km; high
  // cloud (thin, weight 0.5) anywhere. Low cloud right at the location is the
  // horizon component, not this one. Each row is normalized in code.
  distance_weights: {
    low: [0.02, 0.04, 0.12, 0.20, 0.24, 0.24, 0.14],
    mid: [0.04, 0.08, 0.16, 0.18, 0.18, 0.18, 0.18],
    high: [0.08, 0.10, 0.14, 0.16, 0.16, 0.18, 0.18],
  },

  // How opaque each layer is to the low-angle light, as a fraction of its cover.
  block_weights: { low: 1.0, mid: 0.8, high: 0.5 },

  // Maps the weighted blocked fraction (0 to 1) to the light-path component L.
  // Steeper than linear because a deck across most of the path kills the light
  // even when the first 50 km are clear.
  light_path_curve: [[0, 1.0], [0.15, 0.95], [0.35, 0.6], [0.5, 0.3], [0.65, 0.1], [1, 0]],

  // Sample points whose blocking exceeds this are named in the reason text.
  path_block_report_threshold: 0.4,

  // Canvas: overhead cover (%) to component C. Clear sky gives some color but is
  // rarely special; 30 to 70% is ideal; a full deck is riskier.
  canvas_curve: [[0, 0.15], [30, 1.0], [70, 1.0], [100, 0.7]],
  canvas_mid_factor: 0.8, // mid cloud counts as 80% of a high-cloud canvas
  canvas_low_cap: { cover_threshold: 0.6, cap: 0.2 }, // low cover above the threshold hides the canvas

  // Horizon blocker: marine layer, fog, rain.
  horizon: {
    precip_mm_per_h_threshold: 0.2,
    precip_component: 0.1,
  },

  // Clarity: haze, humidity, smoke. Range 0.6 to 1.1.
  clarity: {
    floor: 0.6,
    ceiling: 1.1,
    visibility_km: { poor: 10, bonus_from: 40, poor_penalty: 0.3, bonus: 0.1 },
    humidity_pct: { from: 80, max_penalty: 0.1 },
    aod: { from: 0.3, heavy: 0.8, max_penalty: 0.4, flag_from: 0.4 },
  },

  // Score to label.
  label_thresholds: [25, 50, 75],
  labels: ['Skip', 'Maybe', 'Go', "Don't miss"],

  // Evaluate cloud at sunset and again this many minutes later (afterglow);
  // the displayed score is the higher of the two.
  afterglow_offset_min: 20,

  // Two models disagreeing by more than this many points means low confidence.
  confidence_disagreement_points: 25,

  cache_ttl_min: 30,
  outlook_days: 3,
};

export const FORECAST = {
  base_url: 'https://api.open-meteo.com/v1/forecast',
  air_quality_url: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  // Verified against the live API on 2026-11-09. HRRR reaches about 48 h.
  hires_model: 'gfs_hrrr',
  global_model: 'gfs_global',
  hourly: ['cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'visibility', 'relative_humidity_2m', 'precipitation'],
  air_quality_hourly: ['aerosol_optical_depth'],
  forecast_days: 4, // UTC days; day-3 sunset in Pacific time falls on UTC day 4
  display_timezone: 'America/Los_Angeles',
};
