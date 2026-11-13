# sunset-forecast

Personal static web app: for each morning and evening session at eight SF and
Marin sites, reports the weather phenomena on offer (fog, rain, wind, surf,
moon, colour), scores sunrise and sunset colour, and suggests shots. A
scheduled workflow writes a text brief twice a day. Solo repo, no backend, no
build step. The page title is "Light Forecast"; the repo keeps its name.

## Repo

- Canonical remote: `origin` = https://github.com/o4dvasq/sunset-forecast
- Hosting: GitHub Pages from `main`, root folder (same as sf-stairways).
- Solo repo: commit and push to `main`, no PR ceremony.

## Layout

- `index.html`, `styles.css`: the page.
- `src/config.js`: every tunable number (locations, weights, curves, models).
- `src/sun.js`: SunCalc wrapper with bisection-refined event times.
- `src/geo.js`: great-circle sample points along the sunset bearing.
- `src/forecast.js`: Open-Meteo URLs, parsing, interpolation, localStorage cache.
- `src/score.js`: pure colour scoring. No DOM, no network. Keep it that way.
- `src/phenomena.js`: pure weather detectors (fog top, rain, wind, sea, moon).
- `src/catalog.js`, `src/suggest.js`: shot ideas (data) and their ranking (pure).
- `src/brief.js`: pure composer for the texted brief.
- `src/pipeline.js`: fetch and assemble every session; shared by page and script.
- `src/render.js`, `src/app.js`: DOM and wiring.
- `scripts/brief.mjs`: Node entry that prints and writes the brief.
- `.github/workflows/brief.yml`: runs the script before 5:00 am and 3:30 pm
  Pacific and force-pushes one commit to the `brief` branch. Never merge that
  branch; it holds generated text only.
- `vendor/suncalc.js`: SunCalc 1.9.0 as an ES module.
- `tests/`: `node --test`, no dependencies. Fixtures in `tests/fixtures/`.

## Run

- Tests: `npm test`
- Local: `python3 -m http.server 8797`, then http://localhost:8797
- Brief: `node scripts/brief.mjs --edition morning` (or `evening`)

## Rules

- No magic numbers in `src/score.js` or `src/phenomena.js`; put them in `src/config.js`.
- This repo is public. No home address, phone number or other personal detail in code, catalog text or the brief.
- Specs live in `docs/specs/` (pending) and `docs/specs/implemented/` (done).
- `docs/cc-output/` is gitignored scratch for session deliverables.
