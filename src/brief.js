// Pure: compose the plain-text brief for one session. No DOM, no network.
import { compassPoint } from './sun.js';

function clock(date, timeZone) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date).replace(' ', '').toLowerCase();
}

function dayName(dateString, timeZone) {
  const [y, m, d] = dateString.split('-').map(Number);
  const middle = new Date(Date.UTC(y, m - 1, d, 20, 0, 0));
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(middle);
}

function fahrenheit(celsius) {
  return Math.round((celsius * 9) / 5 + 32);
}

function siteName(model, siteId) {
  const site = model.locations.find((l) => l.id === siteId);
  return site ? site.name.split(',')[0].split(' / ')[0] : siteId;
}

function weatherLine(local) {
  if (!local) return null;
  const parts = [];
  if (local.temperature_c != null) parts.push(`${fahrenheit(local.temperature_c)}°F`);
  if (local.wind_mph != null) {
    const direction = local.wind_direction_deg != null ? `${compassPoint(local.wind_direction_deg)} ` : '';
    parts.push(`wind ${direction}${Math.round(local.wind_mph)} mph`);
  }
  return parts.length ? parts.join(', ') : null;
}

function sunLine(session, timeZone) {
  const { sun } = session;
  if (session.session === 'morning') {
    return `First light ${clock(sun.first_light, timeZone)}, sunrise ${clock(sun.event_utc, timeZone)} (bearing ${Math.round(sun.azimuth_deg)}°), golden light until ${clock(sun.last_light, timeZone)}`;
  }
  return `Golden light from ${clock(sun.first_light, timeZone)}, sunset ${clock(sun.event_utc, timeZone)} (bearing ${Math.round(sun.azimuth_deg)}°), blue hour until ${clock(sun.last_light, timeZone)}`;
}

function verdictLine(session) {
  const label = session.rating_label.toUpperCase();
  const lead = session.suggestions[0]?.title ?? session.phenomena[0]?.title ?? 'nothing notable';
  return `${label} (${session.rating ?? '–'}): ${lead}`;
}

function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function nextLine(model, session, timeZone) {
  const index = model.sessions.indexOf(session);
  const next = model.sessions[index + 1];
  if (!next) return null;
  const lead = next.suggestions[0]?.title ?? next.phenomena[0]?.title ?? 'nothing notable';
  const eventWord = next.session === 'morning' ? 'Sunrise' : 'Sunset';
  const when = next.date === session.date ? 'Tonight' : 'Tomorrow morning';
  return `${when}: ${next.rating_label} (${next.rating ?? '–'}), ${lead.toLowerCase()}. ${eventWord} ${clock(next.sun.event_utc, timeZone)}.`;
}

// Which session a run at `now` should describe: today's morning before the
// cut-off hour, today's evening after it.
export function editionFor(now, timeZone, cutoffHour) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now));
  return hour < cutoffHour ? 'morning' : 'evening';
}

function localMinutes(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const value = (type) => Number(parts.find((p) => p.type === type).value);
  return value('hour') * 60 + value('minute');
}

// Should this run send the edition? The schedule fires at both the
// daylight-time and standard-time hour, so one of the two runs is an hour
// early; it must stay quiet, and the later one must not send twice.
export function shouldSend({ now, edition, date, timeZone, cfg, lastSentKey }) {
  const key = `${date}:${edition}`;
  if (lastSentKey === key) return { send: false, key, reason: 'already sent' };
  const [hour, minute] = cfg.send_at[edition].split(':').map(Number);
  const target = hour * 60 + minute;
  const current = localMinutes(now, timeZone);
  if (current < target - cfg.send_lead_min) return { send: false, key, reason: 'too early' };
  if (current > target + cfg.send_tail_min) return { send: false, key, reason: 'too late' };
  return { send: true, key, reason: 'in window' };
}

export function composeBrief(model, { edition, timeZone, cfg, now = null }) {
  const session = model.sessions.find((s) => s.date === model.dates[0] && s.session === edition);
  if (!session) throw new Error(`No ${edition} session for ${model.dates[0]}`);
  const lines = [];
  lines.push(`${dayName(session.date, timeZone)}, ${session.session}`);
  lines.push(verdictLine(session));
  lines.push(sunLine(session, timeZone));
  const weather = weatherLine(session.anchor_local);
  if (weather) lines.push(`At ${siteName(model, 'twin-peaks')}: ${weather}`);

  const conditions = session.phenomena.slice(0, cfg.conditions);
  if (conditions.length) {
    lines.push('', 'WEATHER');
    for (const p of conditions) lines.push(`- ${p.title}. ${p.text}`);
  }

  const ideas = session.suggestions.slice(0, cfg.suggestions);
  if (ideas.length) {
    lines.push('', 'SHOOT');
    ideas.forEach((idea, i) => {
      // A window that has already opened starts now.
      const from = now && now > idea.from && now < idea.to ? now : idea.from;
      const when = from === now ? `now to ${clock(idea.to, timeZone)}` : `${clock(from, timeZone)} to ${clock(idea.to, timeZone)}`;
      const note = idea.note ? ` ${idea.note}` : '';
      lines.push(`${i + 1}. ${capitalize(idea.place)}, ${when}. ${idea.shot}${note} Lens: ${idea.kit}. Sim: ${idea.sim}.`);
    });
  } else {
    lines.push('', 'Nothing worth a special trip this session.');
  }

  const next = nextLine(model, session, timeZone);
  if (next) lines.push('', next);
  if (model.notes?.length) lines.push(`(${model.notes.join('; ')})`);
  lines.push(cfg.url);
  return lines.join('\n');
}
