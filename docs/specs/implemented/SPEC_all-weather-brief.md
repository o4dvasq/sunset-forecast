# SPEC: all-weather light forecast, morning and evening, with a texted brief

Status: implemented 2026-11-12. Builds on `SPEC_sunset-forecast.md`.

## Why

v1 answers one question: will tonight's sunset light up. Good photographs in
San Francisco and Marin come from far more than sunset colour: fog under the
bridge, a clearing storm, a rainbow over the city, a full moon at dusk, big
surf, glassy water, crystal air. And half of them happen at dawn. The app
should name what the weather is offering in the next shooting session, say what
to shoot and where, and send that as a text before each session.

## What changes

1. **Two sessions a day.** Every day has a morning session (first light through
   two and a half hours after sunrise) and an evening session (three hours
   before sunset through dusk). The colour score from v1 runs for both, along
   the sunrise bearing in the morning and the sunset bearing in the evening.
2. **Sites.** Eight sites, each marked with the sessions it faces:
   - Ocean Beach (evening)
   - Lands End / Sutro Baths (evening)
   - Baker Beach (evening)
   - Twin Peaks (both)
   - Hawk Hill (both)
   - Grand View Park (both)
   - Mount Tamalpais, East Peak (both)
   - Embarcadero, Pier 14 (morning)
3. **Phenomena.** A pure detector layer (`src/phenomena.js`) reads local
   weather at each site across the session and reports what is on offer, each
   with a strength from 0 to 1, the sites it applies to and a plain sentence:
   - Sky colour at sunrise or sunset (the v1 score)
   - Marine layer, with an estimated top height from the humidity profile
   - Low fog under the bridge towers, and a sea of fog below the high sites
   - Fog in the trees, fog on the water, a deck burning off or rolling in
   - Socked in (deck too deep to get above)
   - Steady rain, showers with rainbow potential, a clearing storm
   - Thunderstorms
   - Strong wind, and calm air for reflections
   - Big surf, and low tide
   - Exceptionally clear air, and smoke or heavy haze
   - Full moon rising at dusk, moon setting at dawn, a thin crescent
   - Low snow level on the regional peaks
   - Light rays through broken cloud, soft overcast light, clean golden light
4. **Photo suggestions.** `src/suggest.js` turns phenomena into ranked shot
   ideas from a catalog (`src/catalog.js`): where to stand, when, what to
   frame, which lens from the kit and which film simulation. The catalog
   includes street options for rain and fog, not only viewpoints.
5. **The brief.** `src/brief.js` composes a short plain-text message for one
   session: verdict, sun times, what the weather is doing, the top three shot
   ideas, a one-line look at the following session, and the link.
6. **Delivery.** `.github/workflows/brief.yml` runs `scripts/brief.mjs` before
   5:00 am and before 3:30 pm Pacific and publishes the text to the `brief`
   branch (one commit, force-pushed, so `main` history stays clean):
   - `morning.txt`, `evening.txt`, `latest.txt`, `latest.json`
   An iPhone Shortcuts automation at 5:00 am and 3:30 pm fetches the file and
   sends it as a message. The phone sends the text because a cloud SMS sender
   needs carrier registration; the phone needs none.
7. **Page.** A strip of six session buttons (three days, morning and evening)
   replaces the per-card outlook rows. Selecting one shows that session's
   conditions, shot ideas and site cards.

## Data

All from Open-Meteo, no key:

- Cloud layers along the light path (unchanged), both models.
- Local weather at each site, both models: temperature, dew point, wind, gusts,
  precipitation and its probability, weather code, CAPE, freezing level,
  visibility, and relative humidity plus geopotential height at 1000, 975, 950,
  925, 900 and 850 hPa (for the fog top).
- Marine: wave height, swell height and period, sea level (tide) off Ocean Beach.
- Air quality: aerosol optical depth (unchanged).
- Moon position and phase from SunCalc.

`past_days=1` is requested so a session earlier today still has data after
00:00 UTC.

## Rules

- `score.js`, `phenomena.js`, `suggest.js` and `brief.js` stay pure: no DOM, no
  network. Every threshold lives in `src/config.js`.
- The fog top is an estimate from six pressure levels roughly 220 m apart; text
  rounds it to 50 m and says "about".
- The tide comes from a model, not a tide table. The brief gives the time of low
  water and no height.
- High-resolution model first wherever it has data for the instant; the global
  model otherwise.
- The brief never fails silently: if the forecast cannot be fetched the workflow
  fails and the previous file stays in place with its own date on the first line.

## Out of scope

- Ratings and the Lightroom backtest (v1 phases 1.5 and 2) remain unbuilt.
- No cloud SMS provider.
