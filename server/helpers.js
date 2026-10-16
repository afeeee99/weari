import { CATEGORIES, COLORS, OCCASIONS } from './config.js';

// Shared helpers for the AI routes: reading the compact wardrobe text the browser sends,
// cleaning preferences, and always answering errors with JSON.

// Turn the compact wardrobe text back into items so we can check Gemini's answer
export function parseWardrobe(text) {
  return String(text || '')
    .split('\n')
    .slice(0, 300)
    .map((line) => line.split('|').map((s) => s.trim()))
    .filter((p) => p.length >= 5 && p[0])
    .map(([id, name, category, color, occasions]) => ({
      id: id.slice(0, 80),
      name: name.slice(0, 40),
      category,
      color,
      occasions: occasions.split(',').map((o) => o.trim()).filter(Boolean),
    }));
}

export const asList = (v, allowed, max) =>
  (Array.isArray(v) ? v : []).map(String).filter((x) => !allowed || allowed.includes(x)).slice(0, max);

// Only goal, styles and occasions are ever passed on — nothing else from the profile
export function cleanPreferences(p) {
  return {
    goal: typeof p?.goal === 'string' ? p.goal.slice(0, 80) : null,
    styles: asList(p?.styles, null, 5).map((s) => s.slice(0, 30)),
    occasions: asList(p?.occasions, OCCASIONS, 9),
  };
}

export const roleFor = (category) =>
  ({ top: 'Top', bottom: 'Bottom', dress: 'Dress', shoes: 'Shoes', outerwear: 'Outerwear', accessory: 'Accessory' })[category];

// Read compact wardrobe text ("a | b | c" per line) into items. Each endpoint names its own columns:
//   chat:     id | category | color | occasions | wears | days since worn ("-" = never)
//   buycheck: id | name | category | color | occasions | wears
export const CHAT_COLUMNS = ['id', 'category', 'color', 'occasions', 'wears', 'days'];
export const BUYCHECK_COLUMNS = ['id', 'name', 'category', 'color', 'occasions', 'wears'];

export function parseCompactWardrobe(text, columns) {
  return String(text || '')
    .split('\n')
    .slice(0, 300)
    .map((line) => {
      const parts = line.split('|').map((s) => s.trim());
      return parts.length >= columns.length ? Object.fromEntries(columns.map((c, i) => [c, parts[i]])) : null;
    })
    .filter((r) => r && r.id && CATEGORIES.includes(r.category))
    .map((r) => ({
      id: r.id.slice(0, 80),
      ...(r.name !== undefined && { name: r.name.slice(0, 40) }),
      category: r.category,
      color: COLORS.includes(r.color) ? r.color : 'multi',
      occasions: r.occasions.split(',').map((o) => o.trim()).filter((o) => OCCASIONS.includes(o)),
      wears: Math.max(0, parseInt(r.wears, 10) || 0),
      ...(r.days !== undefined && { daysSinceWorn: /^\d+$/.test(r.days) ? parseInt(r.days, 10) : null }),
    }));
}

export const describeItem = (it) => `${it.color} ${it.category}`;
// Keep the first n sentences (a sentence ends with . ! or ? followed by a space, so "2.0" stays intact)
export const firstSentences = (text, n) => String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?]["')]?)\s+/).slice(0, n).join(' ');

// Short per-category summary of how the user actually wears their clothes (for Gemini)
export function wearSummary(items) {
  return CATEGORIES.map((cat) => {
    const list = items.filter((it) => it.category === cat);
    if (!list.length) return `${cat}: none owned`;
    const avg = list.reduce((s, it) => s + it.wears, 0) / list.length;
    const idle = list.filter((it) => it.daysSinceWorn === null || it.daysSinceWorn > 30).length;
    return `${cat}: ${list.length} owned, ${avg.toFixed(1)} wears on average, ${idle} not worn in 30+ days`;
  }).join('\n');
}

// Always answer with JSON on errors. The browser falls back to basic rules.
export function sendError(res, route, err) {
  console.error(`${route} failed:`, err?.message || err);
  const status = err?.status === 429 ? 429 : 503;
  res.status(status).json({ ok: false, error: status === 429 ? 'rate_limited' : 'unavailable', message: 'The stylist needs a short break.' });
}
