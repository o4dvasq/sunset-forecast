# Sunset Forecast (Light Forecast)

What is the weather offering a photographer this morning and this evening? A
static, phone-first page for San Francisco and Marin that reads Open-Meteo
forecasts and reports, for each session:

- what the weather is doing: fog and its depth, rain, rainbows, clearing
  storms, thunder, wind, surf, tide, clear air, smoke, the moon
- a sunrise or sunset colour score at each viewpoint, with the reason
- what to shoot: where to stand, when, what to frame, which lens and film
  simulation

It also writes a short text brief twice a day (see "The texted brief").

Live: https://o4dvasq.github.io/sunset-forecast/

## Sessions and sites

Each day has a morning session (first light to two and a half hours after
sunrise) and an evening session (three hours before sunset to the end of blue
hour). The page shows three days of both. The number on each session is the
strength of the best thing on offer, 0 to 100, with the same labels as the
colour score.

Eight sites, each marked in `src/config.js` with the sessions it faces: Ocean
Beach, Lands End, Baker Beach, Twin Peaks, Hawk Hill, Grand View Park, Mount
Tamalpais and the Embarcadero.

## Phenomena

`src/phenomena.js` is a set of pure detectors over local weather at each site
across the session window. Thresholds are in the `PHENOMENA` block of
`src/config.js`.

- **Fog.** The deck top is estimated from relative humidity at six pressure
  levels (1000 to 850 hPa, about 220 m apart) and interpolated to where it
  drops through 92%. A top between the bridge roadway (67 m) and the tower tops
  (227 m) is "low fog under the bridge towers". Sites are classed as above, in
  or under the deck. Low cloud under a rain band is not counted as fog.
- **Rain.** Steady rain, showers with sun breaks (rainbow, opposite the sun), a
  clearing storm (rain in the six hours before and cloud breaking at the
  event), thunderstorms (weather code or CAPE).
- **Wind and sea.** Strong or dangerous gusts, calm air at the water sites, big
  surf and low tide from the Open-Meteo marine model off Ocean Beach.
- **Air.** Exceptionally clear air, and smoke from aerosol optical depth.
- **Moon.** A full or nearly full moon rising within 70 minutes of sunset or
  setting within 70 minutes of sunrise, with time and bearing; thin crescents.
- **Snow.** A low freezing level after rain, against the heights of Tamalpais,
  Diablo and Hamilton.
- **Light.** Colour (the score below), light rays, soft overcast, clean light.

The fog top and the tide are model estimates, not measurements.

## Shot ideas

`src/catalog.js` is the list of ideas, each tied to the phenomena that make it
worth doing. `src/suggest.js` ranks them by the phenomenon's strength times the
idea's weight, keeps one idea per site, and fills in lenses from `KIT` in
`src/config.js`. Edit the catalog and the kit freely; `npm test` checks that
every idea names a known site and lens.

## The texted brief

`.github/workflows/brief.yml` runs `scripts/brief.mjs` about 35 minutes before
5:00 am and 3:30 pm Pacific and force-pushes the result as a single commit to
the `brief` branch:

- `latest.txt`: the newest edition, the file the phone reads
- `morning.txt`, `evening.txt`: the newest of each edition
- `latest.json`: the same content as data

An iPhone Shortcuts automation at 5:00 am and 3:30 pm fetches
`https://raw.githubusercontent.com/o4dvasq/sunset-forecast/brief/latest.txt`
and sends the contents as a message. The phone sends the text because a cloud
SMS sender needs carrier registration.

```
cd ~/code/sunset-forecast
node scripts/brief.mjs --edition morning
```

## How the colour score works

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

The score is computed at the sun event and 20 minutes into the glow (after
sunset, before sunrise); the higher one shows. In the morning the light path
runs along the sunrise bearing.
Labels: 0 to 24 Skip, 25 to 49 Maybe, 50 to 74 Go, 75 and up Don't miss.

Wherever HRRR (`gfs_hrrr`) reaches, about 40 hours, it is scored alongside
GFS global (`gfs_global`). If they disagree by more than 25 points the card
shows a low-confidence badge with both numbers. Beyond that the global model
is used alone.

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

- `LOCATIONS`: coordinates, elevation, fog sensitivity, the sessions each site
  faces. Adjust to the actual shooting spots.
- `SCORING`: sample distances, distance weights, layer opacities, the canvas
  and light-path curves, clarity thresholds, labels, afterglow offset, the
  confidence threshold, cache TTL.
- `SESSIONS`: how far each session window reaches around the sun event.
- `PHENOMENA`: every detector threshold.
- `KIT`: the lenses the shot ideas name.
- `BRIEF`: how many conditions and ideas the text carries, and the hour that
  splits the morning edition from the evening one.
- `FORECAST`: model identifiers, hourly variables, API URLs.

`src/score.js`, `src/phenomena.js`, `src/suggest.js` and `src/brief.js` are
pure (no DOM, no network). `src/pipeline.js` does the fetching and is shared by
the page and the brief script. A `SunsetForecast` record is plain
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
live API on 2026-11-09; the local, pressure-level and marine variables on
2026-11-12. Sun times from a vendored copy of
[SunCalc](https://github.com/mourner/suncalc) (BSD-2), with sunset, golden hour,
and blue hour refined by bisection on `getPosition` because `getTimes` runs one
to two minutes late at this latitude.
