// Every tunable number for the app lives here. Scoring code reads this file
// and contains no magic numbers of its own.

// Sites. `faces` lists the sessions whose low sun each site looks towards;
// the colour score only runs for those. `water` marks sites at the ocean edge.
export const LOCATIONS = [
  { id: 'ocean-beach', name: 'Ocean Beach', lat: 37.7594, lon: -122.5107, elevation_m: 5, fog_sensitivity: 1.0, faces: ['evening'], water: true },
  { id: 'lands-end', name: 'Lands End / Sutro Baths', lat: 37.7800, lon: -122.5130, elevation_m: 10, fog_sensitivity: 1.0, faces: ['evening'], water: true },
  { id: 'twin-peaks', name: 'Twin Peaks', lat: 37.7544, lon: -122.4477, elevation_m: 280, fog_sensitivity: 0.6, faces: ['morning', 'evening'] },
  { id: 'hawk-hill', name: 'Hawk Hill, Marin Headlands', lat: 37.8255, lon: -122.4990, elevation_m: 280, fog_sensitivity: 0.6, faces: ['morning', 'evening'] },
  { id: 'baker-beach', name: 'Baker Beach', lat: 37.7936, lon: -122.4836, elevation_m: 5, fog_sensitivity: 1.0, faces: ['evening'], water: true },
  { id: 'grand-view', name: 'Grand View Park', lat: 37.7563, lon: -122.4717, elevation_m: 200, fog_sensitivity: 0.7, faces: ['morning', 'evening'] },
  { id: 'mount-tam', name: 'Mount Tamalpais, East Peak', lat: 37.9292, lon: -122.5778, elevation_m: 760, fog_sensitivity: 0.2, faces: ['morning', 'evening'] },
  { id: 'embarcadero', name: 'Embarcadero, Pier 14', lat: 37.7936, lon: -122.3915, elevation_m: 3, fog_sensitivity: 1.0, faces: ['morning'], water: true },
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

  // The glow is scored this many minutes before sunrise as well.
  preglow_offset_min: 20,

  cache_ttl_min: 30,
  outlook_days: 3,
};

// Session windows, in minutes relative to the sun event.
export const SESSIONS = {
  morning: { label: 'Morning', event: 'sunrise', lead_min: 30, tail_min: 150 },
  evening: { label: 'Evening', event: 'sunset', lead_min: 180, tail_min: 30 },
  step_min: 30, // local weather is read at this spacing across the window
  prior_rain_hours: 6, // how far back a clearing storm looks for rain
};

// Thresholds for the phenomena detectors. Heights in metres, wind in mph,
// precipitation in mm per hour, visibility in metres.
export const PHENOMENA = {
  min_strength: 0.3, // weaker than this is not reported

  fog: {
    deck_cover_pct: 60, // low cloud at or above this is a deck
    saturated_rh_pct: 92, // a pressure level this humid is inside the deck
    profile_ceiling_m: 1600, // ignore saturated air above this
    in_fog_visibility_m: 1500,
    surface_rh_pct: 96, // near-saturated air at 2 m means the deck reaches the ground
    above_margin_m: 40, // a site must clear the deck top by this much
    bridge_road_m: 67,
    bridge_tower_m: 227,
    deep_top_m: 650, // deeper than this and no site near the city gets above it
    upper_cloud_limit_pct: 75, // mid or high cloud above this hides the light on a fog sea
    change_points: 35, // low-cover change across the window that counts as burning off or rolling in
    round_to_m: 50,
    reference_sites: ['ocean-beach', 'baker-beach', 'embarcadero'], // sea-level columns that define the marine layer
    forest_sites: ['grand-view', 'twin-peaks'],
    bay_site: 'embarcadero',
    bay_calm_mph: 7,
  },

  rain: {
    wet_mm_per_h: 0.2,
    steady_fraction: 0.6, // share of the window that is wet
    shower_fraction: [0.1, 0.6],
    shower_probability_pct: [25, 85],
    shower_codes: [80, 81, 82, 85, 86],
    rainbow_cloud_limit_pct: 85, // low cloud above this hides the sun
    rainbow_max_sun_altitude_deg: 42,
    clearing_prior_mm: 1.0, // rain in the hours before the event
    clearing_event_mm_per_h: 0.1,
    clearing_cloud_drop_points: 20,
  },

  thunder: { codes: [95, 96, 99], cape_j_per_kg: 600 },

  wind: { strong_gust_mph: 30, severe_gust_mph: 45, calm_mph: 5, calm_gust_mph: 9 },

  surf: { big_wave_m: 3.0, huge_wave_m: 5.0, long_period_s: 14, swell_m: 2.2 },

  // Sea level is relative to mean sea level; at San Francisco mean lower low
  // water sits about 0.95 m below it.
  tide: { low_m: -0.6, very_low_m: -0.95, high_m: 0.85 },

  clarity: { crystal_visibility_m: 40000, crystal_rh_pct: 65, crystal_aod: 0.12, smoke_aod: 0.4, heavy_smoke_aod: 0.8 },

  moon: {
    full_fraction: 0.95,
    near_full_fraction: 0.88,
    rise_window_min: 70, // moonrise this close to sunset, or moonset this close to sunrise
    crescent_fraction: 0.12,
    crescent_min_altitude_deg: 4,
    sky_cloud_limit_pct: 60,
  },

  snow: { level_below_freezing_m: 300, prior_mm: 2.0, peaks: [{ name: 'Mount Tamalpais', m: 784 }, { name: 'Mount Diablo', m: 1173 }, { name: 'Mount Hamilton', m: 1284 }] },

  light: {
    rays_cover_pct: [30, 75],
    rays_visibility_m: [6000, 30000],
    overcast_pct: 85,
    clear_pct: 15,
  },
};

// The camera bag the suggestions draw on.
export const KIT = {
  body: 'X-E5',
  tele: 'XC 50-230mm',
  wide: '18mm f/2.8',
  normal: '27mm f/1.2',
  compact: '23mm f/2.8',
  short_tele: '56mm f/1.7',
  portrait_tele: '75mm',
};

export const BRIEF = {
  url: 'https://o4dvasq.github.io/sunset-forecast/',
  suggestions: 3,
  conditions: 4,
  morning_edition_before_hour: 11, // local hour; later runs write the evening edition
};

export const FORECAST = {
  base_url: 'https://api.open-meteo.com/v1/forecast',
  air_quality_url: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  // Verified against the live API on 2026-11-09. HRRR reaches about 48 h.
  hires_model: 'gfs_hrrr',
  global_model: 'gfs_global',
  marine_url: 'https://marine-api.open-meteo.com/v1/marine',
  hourly: ['cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'visibility', 'relative_humidity_2m', 'precipitation'],
  // Local weather, requested for the site points only.
  local_hourly: [
    'temperature_2m', 'dew_point_2m', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m',
    'precipitation_probability', 'weather_code', 'cape', 'freezing_level_height',
  ],
  pressure_levels_hpa: [1000, 975, 950, 925, 900, 850],
  air_quality_hourly: ['aerosol_optical_depth'],
  marine_hourly: ['wave_height', 'wave_period', 'swell_wave_height', 'swell_wave_period', 'sea_level_height_msl'],
  marine_point: { lat: 37.76, lon: -122.52 }, // just off Ocean Beach
  forecast_days: 4, // UTC days; day-3 sunset in Pacific time falls on UTC day 4
  past_days: 1, // keeps this morning's hours available after 00:00 UTC
  display_timezone: 'America/Los_Angeles',
};
