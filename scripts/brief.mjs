#!/usr/bin/env node
// Write the texted brief. Fetches the forecast, composes the message for the
// morning or evening edition, prints it, and with --out writes the files the
// phone picks up.
//
//   node scripts/brief.mjs                     print the edition for the current time
//   node scripts/brief.mjs --edition evening   force an edition
//   node scripts/brief.mjs --out dist          also write morning|evening.txt, latest.txt, latest.json
//   node scripts/brief.mjs --out dist --send   also send it by Telegram, once per edition per day
//   node scripts/brief.mjs --out dist --send --force-send   send regardless of the time window
//
// Sending needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in the environment and
// is skipped without them.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from '../src/pipeline.js';
import { composeBrief, editionFor, shouldSend } from '../src/brief.js';
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
async function fetchWithRetry(url, options = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(45000) });
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

async function sendTelegram(message) {
  const response = await fetchWithRetry(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: message, disable_web_page_preview: true }),
  });
  // Never echo the response body or the URL: the token is in the URL and this log is public.
  if (!response.ok) throw new Error(`Telegram refused the message (HTTP ${response.status})`);
}

// sent.json remembers the last edition sent so the second scheduled run stays quiet.
async function sendIfDue(session) {
  if (!process.argv.includes('--send')) return;
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error('Not sent: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are not set.');
    return;
  }
  const sentPath = join(outDir, 'sent.json');
  const lastSentKey = existsSync(sentPath) ? JSON.parse(readFileSync(sentPath, 'utf8')).key : null;
  const decision = shouldSend({ now, edition, date: session.date, timeZone, cfg: BRIEF, lastSentKey });
  const forced = process.argv.includes('--force-send');
  if (!decision.send && !forced) {
    console.error(`Not sent: ${decision.reason}.`);
    return;
  }
  await sendTelegram(text);
  writeFileSync(sentPath, `${JSON.stringify({ key: decision.key, sent_at: now.toISOString() })}\n`);
  console.error(`Sent ${decision.key} by Telegram.`);
}

const outDir = argument('out');
if (outDir) {
  mkdirSync(outDir, { recursive: true });
  const session = model.sessions.find((s) => s.date === model.dates[0] && s.session === edition);
  writeFileSync(join(outDir, `${edition}.txt`), `${text}\n`);
  writeFileSync(join(outDir, 'latest.txt'), `${text}\n`);
  await sendIfDue(session);
  writeFileSync(join(outDir, 'latest.json'), `${JSON.stringify({ generated_at: now.toISOString(), edition, date: session.date, rating: session.rating, rating_label: session.rating_label, phenomena: session.phenomena, suggestions: session.suggestions, text }, null, 2)}\n`);
}
