#!/usr/bin/env node
// Write the texted brief. Fetches the forecast, composes the message for the
// morning or evening edition, prints it, and with --out writes the files the
// phone picks up.
//
//   node scripts/brief.mjs                     print the edition for the current time
//   node scripts/brief.mjs --edition evening   force an edition
//   node scripts/brief.mjs --out dist          also write morning|evening.txt, latest.txt, latest.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from '../src/pipeline.js';
import { composeBrief, editionFor } from '../src/brief.js';
import { BRIEF, FORECAST } from '../src/config.js';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1];
}

const timeZone = FORECAST.display_timezone;
const now = new Date();
const edition = argument('edition') ?? editionFor(now, timeZone, BRIEF.morning_edition_before_hour);
if (!['morning', 'evening'].includes(edition)) {
  console.error(`Unknown edition "${edition}". Use morning or evening.`);
  process.exit(2);
}

// The forecast service occasionally times out on connect; retry before failing.
const ATTEMPTS = 4;
const RETRY_WAIT_MS = 5000;
async function fetchWithRetry(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (response.ok || response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS * attempt));
  }
  throw lastError;
}

const model = await load({ now, fetchImpl: fetchWithRetry });
const text = composeBrief(model, { edition, timeZone, cfg: BRIEF, now });
console.log(text);

const outDir = argument('out');
if (outDir) {
  mkdirSync(outDir, { recursive: true });
  const session = model.sessions.find((s) => s.date === model.dates[0] && s.session === edition);
  writeFileSync(join(outDir, `${edition}.txt`), `${text}\n`);
  writeFileSync(join(outDir, 'latest.txt'), `${text}\n`);
  writeFileSync(join(outDir, 'latest.json'), `${JSON.stringify({ generated_at: now.toISOString(), edition, date: session.date, rating: session.rating, rating_label: session.rating_label, phenomena: session.phenomena, suggestions: session.suggestions, text }, null, 2)}\n`);
}
