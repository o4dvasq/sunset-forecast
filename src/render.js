// DOM rendering: header status, location cards, outlook rows, light path strip.
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
  return `<svg class="strip" viewBox="0 0 ${width} ${h}" role="img" aria-label="Cloud cover along the sunset line, 0 to ${maxKm} km">${cells}${ticks}</svg>`;
}

function componentBar(name, value) {
  const pctv = Math.round(Math.min(1, value) * 100);
  return `<div class="comp"><span class="comp-name">${name}</span><span class="comp-bar"><span style="width:${pctv}%"></span></span><span class="comp-val">${value.toFixed(2)}</span></div>`;
}

function detailBlock(f, opts) {
  const comps = f.components
    ? `<div class="comps">${componentBar('Canvas', f.components.canvas)}${componentBar('Light path', f.components.light_path)}${componentBar('Horizon', f.components.horizon)}${componentBar('Clarity', f.components.clarity)}</div>`
    : '';
  const strip = f.samples.length ? lightPathStrip(f, opts.config) : '';
  const notes = f.notes?.length ? `<p class="notes">${f.notes.map(esc).join(' · ')}</p>` : '';
  return `<p class="reason">${esc(f.reason)}</p>
    <dl class="times">
      <div><dt>Golden</dt><dd>${formatLocalTime(f.golden_start, opts.timeZone)}</dd></div>
      <div><dt>Sunset</dt><dd>${formatLocalTime(f.sunset_utc, opts.timeZone)}</dd></div>
      <div><dt>Blue end</dt><dd>${formatLocalTime(f.blue_end, opts.timeZone)}</dd></div>
      <div><dt>Bearing</dt><dd>${Math.round(f.azimuth_deg)}°</dd></div>
    </dl>
    ${strip}${comps}${notes}`;
}

function confidenceBadge(c) {
  if (!c || c.level !== 'low') return '';
  return `<span class="badge badge-low" title="High-res ${c.hires} vs global ${c.global}">Low confidence · ${c.hires} / ${c.global}</span>`;
}

function scoreBlock(f) {
  const score = f.score == null ? '–' : f.score;
  return `<div class="score ${labelClass(f.label)}"><span class="score-num">${score}</span><span class="score-label">${esc(f.label)}</span></div>`;
}

export function renderCard(location, forecasts, opts) {
  const today = forecasts[0];
  const outlook = forecasts.slice(1).map((f, i) => `
    <details class="outlook">
      <summary><span class="outlook-day">${formatDay(f.date, opts.timeZone)}</span>${scoreBlock(f)}</summary>
      ${detailBlock(f, opts)}
    </details>`).join('');
  return `<article class="card" data-location="${esc(location.id)}">
    <header class="card-head">
      <h2>${esc(location.name)}</h2>
      ${scoreBlock(today)}
    </header>
    ${confidenceBadge(today.confidence)}
    ${detailBlock(today, opts)}
    <div class="outlook-row">${outlook}</div>
  </article>`;
}

export function renderPage(root, model, opts) {
  const updated = document.getElementById('updated');
  if (updated) {
    updated.textContent = `${model.stale ? 'Saved ' : 'Updated '}${formatLocalTime(model.fetched_at, opts.timeZone)}`;
    updated.classList.toggle('stale', Boolean(model.stale));
  }
  const dateEl = document.getElementById('today');
  if (dateEl) dateEl.textContent = formatDay(model.dates[0], opts.timeZone);

  const cards = model.locations
    .map((loc, i) => ({ loc, forecasts: model.forecasts[i] }))
    .sort((a, b) => (b.forecasts[0].score ?? -1) - (a.forecasts[0].score ?? -1))
    .map(({ loc, forecasts }) => renderCard(loc, forecasts, opts))
    .join('');
  root.innerHTML = cards;
}

export function renderError(root, err) {
  root.innerHTML = `<div class="error"><strong>Could not load the forecast.</strong><p>${esc(err.message)}</p><p>Check the connection and hit refresh.</p></div>`;
}
