# sunset-forecast

Personal static web app: scores tonight's sunset at four SF and Marin spots from
Open-Meteo cloud data. Solo repo, no backend, no build step.

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
- `src/score.js`: pure scoring. No DOM, no network. Keep it that way.
- `src/render.js`, `src/app.js`: DOM and wiring.
- `vendor/suncalc.js`: SunCalc 1.9.0 as an ES module.
- `tests/`: `node --test`, no dependencies. Fixtures in `tests/fixtures/`.

## Run

- Tests: `npm test`
- Local: `python3 -m http.server 8797`, then http://localhost:8797

## Rules

- No magic numbers in `src/score.js`; put them in `src/config.js`.
- Specs live in `docs/specs/` (pending) and `docs/specs/implemented/` (done).
- `docs/cc-output/` is gitignored scratch for session deliverables.
