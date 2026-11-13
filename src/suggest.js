// Pure: turn a session's phenomena into ranked shot ideas. No DOM, no network.
import { IDEAS, COLOR_FRAMES } from './catalog.js';

const MINUTE = 60 * 1000;

function fillKit(text, kit) {
  return text.replace(/\{(\w+)\}/g, (match, key) => kit[key] ?? match);
}

// The time range an idea is worth being there for.
export function timingRange(timing, sun, phenomenon) {
  const event = sun.event_utc.getTime();
  const morning = sun.session === 'morning';
  const range = (from, to) => ({ from: new Date(from), to: new Date(to) });
  if (timing === 'phenomenon' && phenomenon?.time) {
    const at = phenomenon.time.getTime();
    return range(at - 30 * MINUTE, at + 30 * MINUTE);
  }
  if (timing === 'glow') return morning ? range(event - 30 * MINUTE, event + 10 * MINUTE) : range(event - 15 * MINUTE, event + 25 * MINUTE);
  if (timing === 'golden') return morning ? range(event, sun.last_light) : range(sun.first_light, event);
  if (timing === 'blue') return morning ? range(sun.first_light, event - 5 * MINUTE) : range(event + 10 * MINUTE, sun.last_light);
  return morning ? range(sun.first_light, sun.window_end) : range(sun.window_start, sun.last_light);
}

function colorIdeas(colorPhenomenon, sites, sun, kit, minScore) {
  if (!colorPhenomenon) return [];
  const eventWord = sun.session === 'morning' ? 'Sunrise' : 'Sunset';
  return Object.entries(colorPhenomenon.scores)
    .filter(([, score]) => score >= minScore)
    .map(([siteId, score]) => {
      const frame = COLOR_FRAMES[siteId]?.[sun.session];
      const site = sites.find((s) => s.id === siteId);
      if (!frame || !site) return null;
      return {
        id: `color-${siteId}`,
        site: siteId,
        because: 'color',
        rank: score / 100,
        title: `${eventWord} colour at ${site.name.split(',')[0]} (${score})`,
        place: site.name,
        shot: frame.shot,
        kit: fillKit(frame.kit, kit),
        sim: frame.sim,
        ...timingRange('glow', sun, null),
      };
    })
    .filter(Boolean);
}

// Ranked ideas for one session. `phenomena` is the detectPhenomena() output.
export function suggest(phenomena, sun, sites, kit, { limit = 6, minColorScore = 40, perSite = 1 } = {}) {
  const byId = new Map(phenomena.map((p) => [p.id, p]));
  const candidates = [];

  for (const idea of IDEAS) {
    if (!idea.sessions.includes(sun.session)) continue;
    if (idea.avoid.some((id) => byId.has(id))) continue;
    const triggers = idea.needs
      .map((id) => byId.get(id))
      .filter(Boolean)
      .filter((p) => idea.site == null || !p.sites.length || p.sites.includes(idea.site));
    if (!triggers.length) continue;
    const trigger = triggers.reduce((a, b) => (b.strength > a.strength ? b : a));
    candidates.push({
      id: idea.id,
      site: idea.site,
      because: trigger.id,
      rank: idea.weight * trigger.strength,
      title: trigger.title,
      place: idea.place,
      shot: idea.shot,
      kit: fillKit(idea.kit, kit),
      sim: idea.sim,
      note: trigger.bearing_deg != null ? `Bearing ${trigger.bearing_deg}°.` : null,
      ...timingRange(idea.timing, sun, trigger),
    });
  }

  candidates.push(...colorIdeas(byId.get('color'), sites, sun, kit, minColorScore));
  candidates.sort((a, b) => b.rank - a.rank);

  // Keep the list varied: a limited number per site and one per phenomenon
  // for roaming ideas.
  const perSiteCount = new Map();
  const seenBecause = new Set();
  const picked = [];
  for (const candidate of candidates) {
    if (candidate.site) {
      const count = perSiteCount.get(candidate.site) ?? 0;
      if (count >= perSite) continue;
      perSiteCount.set(candidate.site, count + 1);
    } else {
      if (seenBecause.has(candidate.because)) continue;
      seenBecause.add(candidate.because);
    }
    picked.push(candidate);
    if (picked.length >= limit) break;
  }
  return picked;
}
