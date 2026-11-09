# Sunset Forecast

Is tonight's sunset worth shooting? A static, phone-first page that scores the
evening at four San Francisco and Marin spots from Open-Meteo cloud forecasts,
and says why in one sentence.

Live: https://o4dvasq.github.io/sunset-forecast/

## How the score works

A great sunset needs a canvas and a light path. The canvas is mid or high
cloud overhead. The light path is the strip of sky the sun's last rays cross
to reach that canvas from underneath: they travel nearly horizontally, grazing
the Earth 250 to 320 km out along the sunset bearing and climbing towards the
observer. Cloud along that strip, or a marine layer on the local horizon,
leaves the overhead cloud grey.

Four components, each 0 to 1, multiplied together, then scaled to 0 to 100:

- **Canvas (C).** `max(high, 0.8 * mid)` cover at the location, run through a
  curve: 0% cover gives 0.15, 30 to 70% gives 1.0, 100% gives 0.7. Low cloud
  overhead (scaled by the spot's fog sensitivity) caps it at 0.2.
- **Light path (L).** Low, mid, and high cover at 25, 50, 100, 150, 200, 300,
  and 400 km along the bearing. Each layer's cover is averaged with its own
  distance weights and opacity (low 1.0, mid 0.8, high 0.5); the layers combine
  as independent blockers and the blocked fraction runs through a steep curve.
- **Horizon (H).** `1 - fog_sensitivity * max(low here, low at 25 km)`.
  Fog sensitivity is 1.0 at sea level, 0.6 at Twin Peaks and Hawk Hill. Rain
  at sunset sets H to 0.1.
- **Clarity (A).** Visibility, humidity, and aerosol optical depth. 0.6 to 1.1.
  Heavy aerosol is flagged as smoke in the reason text.

The score is computed at sunset and 20 minutes after; the higher one shows.
Labels: 0 to 24 Skip, 25 to 49 Maybe, 50 to 74 Go, 75 and up Don't miss.

Today is scored with two models, HRRR (`gfs_hrrr`) and GFS global
(`gfs_global`). If they disagree by more than 25 points the card shows a
low-confidence badge with both numbers. Days 2 and 3 use the global model only.

### Where this departs from the spec

The spec's light-path rule said nearer sample points matter more for low
cloud. Ray geometry says otherwise: a ray headed for a cirrus canvas 8 km
above the observer is still 5 km up at 50 km out, so a low deck only
intercepts it 100 km or more away. The local marine layer is already the
horizon component, so the low-cloud distance weights in `src/config.js` lean
towards 100 to 300 km. The canvas cap for low cloud is also scaled by fog
sensitivity so an elevated spot is not written off by a shallow layer. Both
are config values; change them if the backtest disagrees.

## Tuning

Everything tunable is in `src/config.js`:

- `LOCATIONS`: coordinates, elevation, fog sensitivity. Adjust to the actual
  shooting spots.
- `SCORING`: sample distances, distance weights, layer opacities, the canvas
  and light-path curves, clarity thresholds, labels, afterglow offset, the
  confidence threshold, cache TTL.
- `FORECAST`: model identifiers, hourly variables, API URLs.

`src/score.js` is pure (no DOM, no network) and runs in Node, so a backtest
or an alert job can import it directly. A `SunsetForecast` record is plain
JSON; see the spec in `docs/specs/implemented/` for the shape.

## Running

```
cd ~/code/sunset-forecast
npm test
```

```
cd ~/code/sunset-forecast
python3 -m http.server 8797
```

Then open http://localhost:8797. There is no build step; the page loads ES
modules directly. Hosting is GitHub Pages from `main`, root folder.

## Data

Weather data by [Open-Meteo.com](https://open-meteo.com/), CC BY 4.0. Model
identifiers and the multi-coordinate request format were verified against the
live API on 2026-11-09. Sun times from a vendored copy of
[SunCalc](https://github.com/mourner/suncalc) (BSD-2), with sunset, golden hour,
and blue hour refined by bisection on `getPosition` because `getTimes` runs one
to two minutes late at this latitude.
