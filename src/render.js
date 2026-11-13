// DOM rendering: header status, session strip, conditions, shot ideas, site
// cards and the light path strip.
import { formatLocalTime } from './sun.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function labelClass(label) {
  return `label-${String(label).toLowerCase().replace(/[^a-z]+/g, '-')}`;
}

function formatDay(dateString, timeZone) {
  const [y, m, d] = dateString.split('-').map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 20, 0, 0));
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(noonUtc);
}

// Horizontal strip: distance 0 to 400 km on x, three rows (high, mid, low),
// each cell shaded by cover. Cells that block the light get a warm outline.
export function lightPathStrip(forecast, config) {
  const maxKm = config.sample_distances_km[config.sample_distances_km.length - 1];
  const width = 320;
  const rowH = 14;
  const padL = 30;
  const padT = 4;
  const layers = ['high', 'mid', 'low'];
  const edges = [0, ...config.sample_distances_km.map((d, i, arr) => (i < arr.length - 1 ? (d + arr[i + 1]) / 2 : maxKm))];
  const x = (km) => padL + ((width - padL) * km) / maxKm;
  const blockByDistance = new Map((forecast.blocks ?? []).map((b) => [b.distance_km, b]));
  let cells = '';
  layers.forEach((layer, row) => {
    const y = padT + row * rowH;
    cells += `<text x="0" y="${y + rowH - 3}" class="strip-label">${layer}</text>`;
    forecast.samples.forEach((s, i) => {
      const cover = s[layer];
      const x0 = x(edges[i]);
      const x1 = x(edges[i + 1]);
      const op = cover == null ? 0 : Math.max(0.04, cover / 100);
      const block = blockByDistance.get(s.distance_km);
      const blocking = block && block.layer === layer && block.block > config.path_block_report_threshold;
      cells += `<rect x="${x0.toFixed(1)}" y="${y}" width="${(x1 - x0).toFixed(1)}" height="${rowH - 1}" class="strip-cell${blocking ? ' blocking' : ''}${cover == null ? ' missing' : ''}" style="fill-opacity:${op.toFixed(2)}"><title>${layer} cloud ${cover == null ? 'n/a' : Math.round(cover) + '%'} at ${s.distance_km} km</title></rect>`;
    });
  });
  const axisY = padT + layers.length * rowH + 10;
  let ticks = '';
  for (const km of [0, 100, 200, 300, 400]) {
    ticks += `<text x="${x(km).toFixed(1)}" y="${axisY}" class="strip-tick" text-anchor="${km === 0 ? 'start' : km === maxKm ? 'end' : 'middle'}">${km}</text>`;
  }
  const h = axisY + 4;
  return `<svg class="strip" viewBox="0 0 ${width} ${h}" role="img" aria-label="Cloud cover along the light path, 0 to ${maxKm} km">${cells}${ticks}</svg>`;
}

function componentBar(name, value) {
  const pctv = Math.round(Math.min(1, value) * 100);
  return `<div class="comp"><span class="comp-name">${name}</span><span class="comp-bar"><span style="width:${pctv}%"></span></span><span class="comp-val">${value.toFixed(2)}</span></div>`;
}

const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);
const fahrenheit = (celsius) => Math.round((celsius * 9) / 5 + 32);

const FOG_WORDS = { above: 'Above the fog', in: 'In the fog', under: 'Under low cloud', clear: 'No low cloud' };

function localLine(f) {
  if (!f.local) return '';
  const parts = [];
  if (f.fog) parts.push(FOG_WORDS[f.fog.state]);
  if (f.local.temperature_c != null) parts.push(`${fahrenheit(f.local.temperature_c)}°F`);
  if (f.local.wind_mph != null) parts.push(`wind ${Math.round(f.local.wind_mph)} mph${f.local.gust_mph != null ? `, gusts ${Math.round(f.local.gust_mph)}` : ''}`);
  return parts.length ? `<p class="local">${parts.map(esc).join(' · ')}</p>` : '';
}

function detailBlock(f, opts) {
  const comps = f.components
    ? `<div class="comps">${componentBar('Canvas', f.components.canvas)}${componentBar('Light path', f.components.light_path)}${componentBar('Horizon', f.components.horizon)}${componentBar('Clarity', f.components.clarity)}</div>`
    : '';
  const strip = f.samples.length ? lightPathStrip(f, opts.config) : '';
  const notes = f.notes?.length ? `<p class="notes">${f.notes.map(esc).join(' · ')}</p>` : '';
  const morning = f.session === 'morning';
  const times = morning
    ? [['First light', f.first_light], ['Sunrise', f.event_utc], ['Golden end', f.last_light]]
    : [['Golden', f.first_light], ['Sunset', f.event_utc], ['Blue end', f.last_light]];
  return `<p class="reason">${esc(f.reason)}</p>
    ${localLine(f)}
    <dl class="times">
      ${times.map(([name, time]) => `<div><dt>${name}</dt><dd>${formatLocalTime(time, opts.timeZone)}</dd></div>`).join('')}
      <div><dt>Bearing</dt><dd>${Math.round(f.azimuth_deg)}°</dd></div>
    </dl>
    ${strip}${comps}${notes}`;
}

function confidenceBadge(c) {
  if (!c || c.level !== 'low') return '';
  return `<span class="badge badge-low" title="High-res ${c.hires} vs global ${c.global}">Low confidence · ${c.hires} / ${c.global}</span>`;
}

function scoreBlock(score, label) {
  return `<div class="score ${labelClass(label)}"><span class="score-num">${score == null ? '–' : score}</span><span class="score-label">${esc(label)}</span></div>`;
}

export function renderCard(location, f, opts) {
  return `<article class="card" data-location="${esc(location.id)}">
    <header class="card-head">
      <h2>${esc(location.name)}</h2>
      ${scoreBlock(f.score, f.label)}
    </header>
    ${confidenceBadge(f.confidence)}
    ${detailBlock(f, opts)}
  </article>`;
}

export function renderSessionStrip(model, selectedKey, opts) {
  const buttons = model.sessions.map((s) => {
    const selected = s.key === selectedKey;
    const classes = ['session', labelClass(s.rating_label), selected ? 'selected' : '', s.past ? 'past' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${classes}" data-session="${esc(s.key)}" aria-pressed="${selected}">
      <span class="session-day">${esc(formatDay(s.date, opts.timeZone).split(',')[0])}</span>
      <span class="session-name">${s.session === 'morning' ? 'AM' : 'PM'}</span>
      <span class="session-num">${s.rating == null ? '–' : s.rating}</span>
    </button>`;
  }).join('');
  return `<nav class="sessions" aria-label="Sessions">${buttons}</nav>`;
}

export function renderConditions(session) {
  if (!session.phenomena.length) return '';
  const items = session.phenomena.map((p) => `<li><strong>${esc(p.title)}.</strong> ${esc(p.text)}</li>`).join('');
  return `<section class="panel"><h2>Conditions</h2><ul class="conditions">${items}</ul></section>`;
}

export function renderSuggestions(session, opts) {
  if (!session.suggestions.length) {
    return '<section class="panel"><h2>What to shoot</h2><p class="reason">Nothing worth a special trip this session.</p></section>';
  }
  const items = session.suggestions.map((idea) => `
    <li class="idea">
      <p class="idea-head"><strong>${esc(idea.title)}</strong><span class="idea-when">${formatLocalTime(idea.from, opts.timeZone)} to ${formatLocalTime(idea.to, opts.timeZone)}</span></p>
      <p class="idea-place">${esc(capitalize(idea.place))}${idea.note ? ` · ${esc(idea.note)}` : ''}</p>
      <p class="idea-shot">${esc(idea.shot)}</p>
      <p class="idea-kit">${esc(idea.kit)} · ${esc(idea.sim)}</p>
    </li>`).join('');
  return `<section class="panel"><h2>What to shoot</h2><ol class="ideas">${items}</ol></section>`;
}

export function renderPage(root, model, selectedKey, opts) {
  const session = model.sessions.find((s) => s.key === selectedKey) ?? model.sessions[0];
  const updated = document.getElementById('updated');
  if (updated) {
    updated.textContent = `${model.stale ? 'Saved ' : 'Updated '}${formatLocalTime(model.fetched_at, opts.timeZone)}`;
    updated.classList.toggle('stale', Boolean(model.stale));
  }
  const dateEl = document.getElementById('today');
  if (dateEl) dateEl.textContent = `${formatDay(session.date, opts.timeZone)} · ${session.label}`;

  const eventWord = session.session === 'morning' ? 'Sunrise' : 'Sunset';
  const cards = model.locations
    .map((loc, i) => ({ loc, forecast: session.sites[i] }))
    .filter(({ forecast }) => forecast.faces)
    .sort((a, b) => (b.forecast.score ?? -1) - (a.forecast.score ?? -1))
    .map(({ loc, forecast }) => renderCard(loc, forecast, opts))
    .join('');
  const verdict = `<section class="verdict ${labelClass(session.rating_label)}">
      ${scoreBlock(session.rating, session.rating_label)}
      <p>${esc(session.suggestions[0]?.title ?? session.phenomena[0]?.title ?? 'No forecast for this session')}</p>
    </section>`;
  const notes = model.notes?.length ? `<p class="notes">${model.notes.map(esc).join(' · ')}</p>` : '';
  root.innerHTML = `${renderSessionStrip(model, session.key, opts)}${verdict}${renderConditions(session)}${renderSuggestions(session, opts)}${notes}
    <h2 class="section-title">${eventWord} colour by viewpoint</h2>${cards}`;
}

export function renderError(root, err) {
  root.innerHTML = `<div class="error"><strong>Could not load the forecast.</strong><p>${esc(err.message)}</p><p>Check the connection and hit refresh.</p></div>`;
}
