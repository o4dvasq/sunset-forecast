SPEC: Sunset Forecast v1 | Project: sunset-forecast | Date: 2026-11-09 | Status: Implemented 2026-11-09 (v1 on main)

# 1. Objective

Build a small personal web app that tells Oscar, each afternoon, whether tonight's sunset is worth shooting at his usual San Francisco and Marin locations, and why.

The core problem: high cloud is necessary for a great sunset but not sufficient. Some high-cloud evenings light up; others just fade to grey. The difference is almost always whether low-angle sunlight can reach the clouds from underneath. At sunset that light travels nearly horizontally, passing over a strip of ground roughly 50 to 400 km out along the sun's bearing. If that strip is clouded over (or the local horizon is blocked by marine layer), the overhead clouds never get lit.

So the app must look at two places, not one:

1. Overhead: is there a canvas (mid/high cloud) to light up?
2. Upstream along the sunset bearing: is the light path open?

Output is a 0 to 100 score per location per evening, a label, and a one-sentence plain-English reason, for today plus the next two evenings.

# 2. Scope

## In scope (v1)

1. Static, mobile-first single page. No backend, no accounts, no API keys.
2. Four preset locations (see Business Rules 4.1).
3. Sunset time, sunset azimuth, and golden/blue hour times for each location.
4. Forecast fetch from Open-Meteo for the location point and for sample points along the sunset bearing.
5. Physics-based scoring (Business Rules 4.3), with weights in a single config file.
6. Today plus two-day outlook.
7. A "light path" strip per location showing low/mid/high cloud cover at each sample distance, so Oscar can see why the score is what it is.
8. Model agreement indicator (HRRR vs. a global model) as a confidence signal.
9. Client-side response cache (30 minutes) to avoid hammering the API.
10. Unit tests for geometry and scoring.

## Out of scope (v1), planned later

1. Ratings and learning loop. Oscar rates each sunset 1 to 5; weights tune over time. Phase 2. The data model in section 4 reserves the shape so v1 output can be logged later without a rewrite.
2. Backtest against past shoot dates (pull EXIF dates from Lightroom, fetch Open-Meteo historical forecasts for those dates, check whether the score would have called it). Phase 1.5, and the fastest way to validate weights before Phase 2.
3. Push notifications or email alerts. Can be added later as a scheduled job calling the same scoring module.
4. Sunrise scoring. Same math with the azimuth flipped; trivial to add after v1 is trusted.
5. Custom/arbitrary locations via map pick.

# 3. Business Rules

## 3.1 Locations (preset)

| ID | Name | Lat | Lon | Notes |
|---|---|---|---|---|
| ocean-beach | Ocean Beach | 37.7594 | -122.5107 | Sea level. Marine layer is the main risk. |
| lands-end | Lands End / Sutro Baths | 37.7800 | -122.5130 | Sea level. Same risk profile as Ocean Beach. |
| twin-peaks | Twin Peaks | 37.7544 | -122.4477 | ~280 m. Can sit above a shallow marine layer. |
| hawk-hill | Hawk Hill, Marin Headlands | 37.8255 | -122.4990 | ~280 m. Bridge and city foreground; ocean horizon to the W/SW. |

Coordinates are approximate and live in `config.js`. Oscar should adjust them to his actual shooting spots.

## 3.2 Sun geometry

1. Compute sunset time and sunset azimuth per location per date using SunCalc.
2. Golden hour = sun altitude +6 deg to 0 deg. Blue hour = 0 deg to -6 deg (civil twilight). Display both.
3. Evaluation time for cloud data is the sunset time. Interpolate linearly between the two bracketing hourly values. Also evaluate sunset +20 min, because high cloud often peaks in color after the sun is down (afterglow); the displayed score is the max of the two.

## 3.3 Light path sampling

1. Sample points along the sunset azimuth at 25, 50, 100, 150, 200, 300 and 400 km from the location, using the great-circle destination formula.
2. Fetch low/mid/high cloud cover for the location plus all seven sample points in one Open-Meteo request (the API accepts comma-separated coordinate lists).
3. Distance weighting: nearer points matter more for low cloud (local horizon), farther points matter more for high cloud (because high cloud intercepts the grazing ray farther out). Weights live in config.

## 3.4 Score components

All component values are 0 to 1. Score is multiplicative, because any one blocker kills the sunset regardless of how good the rest looks.

1. Canvas (C), from overhead cover at the location.
   - `canvas_cover = max(high, 0.8 * mid)`
   - Piecewise: 0% gives 0.15 (clear sky, some color but rarely special); 30 to 70% gives 1.0; 100% gives 0.7 (a full deck can be spectacular when its western edge is close, but is riskier).
   - If low cover at the location is above 60%, C is capped at 0.2 (you can't see the canvas).

2. Light path (L), from the upstream samples.
   - For each sample point i: `block_i = max(w_low * low_i, w_mid * mid_i, w_high * high_i)`, with default `w_low = 1.0, w_mid = 0.8, w_high = 0.5`.
   - `L = 1 - weighted_mean(block_i)` using the distance weights from 3.3.
   - This is the component that separates "glorious" from "goes grey." It should dominate the reason text whenever L < 0.5.

3. Horizon blocker (H), marine layer and fog.
   - `H = 1 - fog_sensitivity * max(low at location, low at 25 km)`.
   - `fog_sensitivity` is per location: 1.0 for Ocean Beach and Lands End, 0.6 for Twin Peaks and Hawk Hill (they can sit above shallow fog). Tunable.
   - Precipitation at the location at sunset > 0.2 mm/h sets H to 0.1.

4. Clarity (A), air quality and haze.
   - Inputs: visibility (km), relative humidity at 2 m, aerosol optical depth (Open-Meteo Air Quality API).
   - Range 0.6 to 1.1. Clean, dry air after a front can push above 1.0. Heavy haze or smoke floors at 0.6.
   - Note: moderate smoke can produce vivid reds; v1 treats high AOD as a penalty and flags it in the reason text rather than guessing.

5. Final score: `score = round(100 * clamp(C * L * H * A, 0, 1))`.

## 3.5 Labels

| Score | Label |
|---|---|
| 0 to 24 | Skip |
| 25 to 49 | Maybe |
| 50 to 74 | Go |
| 75 to 100 | Don't miss |

Thresholds live in config.

## 3.6 Reason text

One sentence, generated from rules, not an LLM. Lead with the limiting factor (the lowest component). Examples:

1. "High cirrus overhead, but a solid deck 150 to 300 km offshore will block the light."
2. "Patchy high cloud and a clear western horizon. Good setup; watch 10 to 20 minutes after sunset."
3. "Marine layer at the beach. Twin Peaks may clear it."
4. "Clear sky. Clean light, little color."

## 3.7 Confidence

1. Fetch the light-path cloud data from two models: HRRR (high-res, ~48 h) and a global model (ECMWF IFS or GFS).
2. Score with each. If the scores differ by more than 25 points, show "Low confidence" and both numbers.
3. Days 2 and 3 use the global model only (HRRR does not reach that far) and are labeled as such.

# 4. Data Model / Schema Changes

New project, no existing schema. All in-memory plus a small localStorage cache.

## 4.1 Location (config)

```
{ id, name, lat, lon, elevation_m, fog_sensitivity }
```

## 4.2 ScoringConfig (config)

```
{
  sample_distances_km: [25, 50, 100, 150, 200, 300, 400],
  distance_weights: { low: [...7], mid: [...7], high: [...7] },
  block_weights: { low: 1.0, mid: 0.8, high: 0.5 },
  canvas_curve: [[0, 0.15], [30, 1.0], [70, 1.0], [100, 0.7]],
  clarity: { ... },
  label_thresholds: [25, 50, 75],
  afterglow_offset_min: 20,
  cache_ttl_min: 30
}
```

## 4.3 SunsetForecast (computed, per location per date)

```
{
  location_id, date, model,
  sunset_utc, azimuth_deg, golden_start, blue_end,
  components: { canvas, light_path, horizon, clarity },
  samples: [{ distance_km, lat, lon, low, mid, high }],
  score, label, reason, confidence
}
```

## 4.4 Rating (reserved for Phase 2, not built in v1)

```
{ date, location_id, predicted_score, components, rating_1_5, notes, photo_url }
```

v1 should make `SunsetForecast` serializable to JSON so Phase 2 can log it next to a rating without changes.

# 5. UI / Interface

Mobile first. Oscar checks it on his phone in the afternoon.

1. Header: today's date, "Updated HH:MM" timestamp, refresh button.
2. Location cards, sorted by today's score (highest first). Each card shows:
   - Location name and the big score with its label.
   - Reason sentence.
   - Sunset time, golden hour start, blue hour end (Pacific Time).
   - Light path strip: a small horizontal chart with distance on the x-axis (0 to 400 km) and three stacked bands for low/mid/high cover. The blocking region should be visually obvious.
   - Confidence badge if low.
3. Outlook row under each card: tomorrow and the day after, score and label only. Tap to expand to the same detail.
4. Dark theme by default (it will be used near dusk). Respect `prefers-color-scheme`.
5. No horizontal scroll at 375 px width.
6. Footer: data source credit to Open-Meteo (required by their terms) and a link to a short "how the score works" section on the same page.

# 6. Integration Points

1. Open-Meteo Forecast API (`api.open-meteo.com/v1/forecast`). Hourly variables: `cloud_cover_low`, `cloud_cover_mid`, `cloud_cover_high`, `visibility`, `relative_humidity_2m`, `precipitation`. Multiple coordinates per request. Use the `models` parameter to request HRRR and one global model. Confirm the exact model identifiers in the Open-Meteo docs at implementation time; I did not verify them for this spec.
2. Open-Meteo Air Quality API (`air-quality-api.open-meteo.com/v1/air-quality`). Variable: `aerosol_optical_depth` (confirm name at implementation). If unavailable, clarity falls back to visibility and humidity only.
3. SunCalc (npm `suncalc`) for sunset time and azimuth. Vendor it as a single file so there is no build step.
4. Hosting: same approach as sf-stairways. I don't know how sf-stairways is hosted (GitHub Pages, Netlify, other); Claude Code should check that repo and match it.

Open-Meteo is free for non-commercial use without a key and supports CORS, so the browser can call it directly. Personal use at four locations, a few refreshes a day, is far below their limits.

# 7. Constraints

1. Static site. Vanilla JS modules, no framework, no build step. One vendored dependency (SunCalc).
2. Scoring logic lives in a pure module (`score.js`) with no DOM or network access, so Phase 1.5 (backtest) and a future alert job can reuse it in Node.
3. All tunable numbers in `config.js`. No magic numbers in scoring code.
4. All displayed times in Pacific Time. Internally UTC.
5. Fail soft: if one model or the air quality call fails, score with what's available and say so on the card. Never show a blank page.
6. No analytics, no tracking, no cookies.

# 8. Acceptance Criteria

1. Page loads on a phone and shows all four locations with a score, label, reason, sunset time, and golden/blue hour times for today.
2. Sunset times are within 1 minute and azimuths within 1 degree of a reference source (NOAA solar calculator or PhotoPills) for at least two test dates.
3. Sample points land where expected: for Ocean Beach on 2026-12-21 the 400 km point is over the Pacific to the WSW, and the geometry test asserts its coordinates within 1 km.
4. Scoring unit tests pass for these fixture scenarios:
   - Clear sky everywhere: score 10 to 25, label Skip or Maybe, reason mentions clear sky.
   - 50% high cloud overhead, clear light path, no low cloud: score 75 or higher.
   - 50% high cloud overhead, 90% mid/high cloud along 100 to 400 km: score below 25, reason names the offshore deck. (This is the "goes grey" case.)
   - Good canvas and light path, 90% low cloud at Ocean Beach: Ocean Beach scores below 25, Twin Peaks scores meaningfully higher than Ocean Beach.
   - Rain at sunset: score below 10.
5. Light path strip renders and visibly shows where along the bearing the cloud is.
6. Days 2 and 3 display and are labeled as global-model only.
7. Low-confidence badge appears when HRRR and the global model disagree by more than 25 points (test with fixture).
8. Turning off network after one load still shows the cached forecast with its timestamp.
9. No horizontal scroll at 375 px.
10. Feedback loop prompt has been run.

# 9. Files Likely Touched

New repository `sunset-forecast`:

```
index.html
styles.css
src/config.js          locations, weights, thresholds
src/sun.js             SunCalc wrapper: sunset time, azimuth, golden/blue hour
src/geo.js             great-circle destination points along the bearing
src/forecast.js        Open-Meteo fetch, multi-coordinate request, interpolation, cache
src/score.js           pure scoring: components, final score, label, reason, confidence
src/render.js          cards, outlook row, light path strip
src/app.js             wiring
vendor/suncalc.js
tests/geo.test.js
tests/sun.test.js
tests/score.test.js
tests/fixtures/*.json  canned Open-Meteo responses for the scenarios in section 8
README.md              how the score works, how to tune config, how to run tests
docs/specs/SPEC_sunset-forecast.md
```

Tests run with Node's built-in test runner (`node --test`), no extra dependencies.
