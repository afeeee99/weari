import express from 'express';
import { Type } from '@google/genai';
import { MOCK_GEMINI, OCCASIONS, ROLES } from '../config.js';
import { askGemini, source } from '../gemini.js';
import { asList, cleanPreferences, parseWardrobe, roleFor, sendError } from '../helpers.js';
import { rateLimit } from '../rate-limit.js';

export const router = express.Router();

// =====================================================
// POST /api/style — occasion + compact wardrobe in, outfit out
//   body: {
//     occasion: "work",
//     wardrobe: "id | name | category | color | occasions" (one item per line, no photos),
//     preferences: { goal, styles, occasions },   (only these three are used)
//     previousOutfitIds: [...], mustIncludeItemId: "..."
//   }
//   reply: { ok, source, canFormOutfit, missing, outfit: [{ itemId, role }], explanation }
// =====================================================
const STYLE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    canFormOutfit: { type: Type.BOOLEAN },
    missing: { type: Type.STRING, description: 'If no outfit is possible, what piece to add (one short sentence)' },
    outfit: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          itemId: { type: Type.STRING, description: 'Exact id from the wardrobe list' },
          role: { type: Type.STRING, enum: ROLES },
        },
        required: ['itemId', 'role'],
      },
    },
    explanation: { type: Type.STRING, description: 'Exactly two sentences on why the pieces work for the occasion' },
  },
  required: ['canFormOutfit', 'explanation'],
};

// Make sure the outfit only uses real wardrobe ids and is complete (dress, or top + bottom)
function checkOutfit(raw, items) {
  if (!raw?.canFormOutfit) {
    return { canFormOutfit: false, missing: String(raw?.missing || 'Add a few more pieces for this occasion.').slice(0, 200), outfit: [] };
  }
  const byId = new Map(items.map((it) => [it.id, it]));
  const seen = new Set();
  const outfit = (raw.outfit || [])
    .filter((p) => byId.has(p.itemId) && !seen.has(p.itemId) && seen.add(p.itemId))
    .map((p) => ({ itemId: p.itemId, role: roleFor(byId.get(p.itemId).category) }));
  const roles = outfit.map((p) => p.role);
  if (!(roles.includes('Dress') || (roles.includes('Top') && roles.includes('Bottom')))) {
    throw new Error('Gemini returned an incomplete outfit');
  }
  return { canFormOutfit: true, outfit, explanation: String(raw.explanation || '').slice(0, 400) };
}

export function mockStyle(occasion, items, previousIds) {
  const fits = items.filter((it) => it.occasions.includes(occasion));
  const pool = fits.length ? fits : items;
  const fresh = (cat) => {
    const list = pool.filter((it) => it.category === cat);
    return list.find((it) => !previousIds.includes(it.id)) || list[0];
  };
  const dress = fresh('dress');
  const top = fresh('top');
  const bottom = fresh('bottom');
  const base = dress && Math.random() < 0.5 ? [dress] : top && bottom ? [top, bottom] : dress ? [dress] : null;
  if (!base) {
    const need = top ? 'a bottom' : bottom ? 'a top' : 'a dress, or a top and a bottom,';
    return { canFormOutfit: false, missing: `Add ${need} tagged '${occasion}' to get a suggestion.` };
  }
  const extras = [fresh('shoes'), fresh('outerwear'), fresh('accessory')].filter(Boolean);
  const outfit = [...base, ...extras].map((it) => ({ itemId: it.id, role: roleFor(it.category) }));
  const lead = base.map((it) => it.name.toLowerCase()).join(' with the ');
  return {
    canFormOutfit: true,
    outfit,
    explanation: `The ${lead} keeps this look polished and easy for ${occasion}. (Test mode: this is a mock answer, not a real Gemini response.)`,
  };
}

router.post('/style', rateLimit, async (req, res) => {
  try {
    const occasion = String(req.body?.occasion || '');
    if (!OCCASIONS.includes(occasion)) {
      return res.status(400).json({ ok: false, error: 'bad_occasion', message: 'Pick one of the app’s occasions.' });
    }
    const items = parseWardrobe(req.body?.wardrobe);
    if (!items.length) {
      return res.json({ ok: true, source: source(), canFormOutfit: false, missing: 'Add some pieces to your wardrobe first.', outfit: [] });
    }
    const prefs = cleanPreferences(req.body?.preferences);
    const previousIds = asList(req.body?.previousOutfitIds, null, 10);
    const mustInclude = items.some((it) => it.id === req.body?.mustIncludeItemId) ? req.body.mustIncludeItemId : null;

    let raw;
    if (MOCK_GEMINI) {
      raw = mockStyle(occasion, items, previousIds);
    } else {
      const prefLines = [
        prefs.goal && `- Wardrobe goal: ${prefs.goal}`,
        prefs.styles.length && `- Preferred styles: ${prefs.styles.join(', ')}`,
        prefs.occasions.length && `- Usually dresses for: ${prefs.occasions.join(', ')}`,
      ].filter(Boolean);
      raw = await askGemini({
        schema: STYLE_SCHEMA,
        contents: [
          `You are a friendly personal stylist. Build ONE outfit for the occasion "${occasion}" using ONLY items from this wardrobe.`,
          `Wardrobe (id | name | category | color | occasions):\n${items
            .map((it) => `${it.id} | ${it.name} | ${it.category} | ${it.color} | ${it.occasions.join(', ')}`)
            .join('\n')}`,
          prefLines.length ? `User preferences:\n${prefLines.join('\n')}` : '',
          previousIds.length ? `They just saw an outfit with ids ${previousIds.join(', ')}; suggest a different combination if possible.` : '',
          mustInclude ? `The outfit MUST include the item with id "${mustInclude}".` : '',
          'Rules: an outfit is either one dress, or one top plus one bottom. Add shoes if available, and outerwear or an accessory only if it fits the occasion. ' +
            'Prefer items tagged for this occasion. If no complete outfit is possible, set canFormOutfit to false and say in "missing" what to add. ' +
            'The explanation must be exactly two sentences, warm and specific.',
        ]
          .filter(Boolean)
          .join('\n\n'),
      });
    }
    res.json({ ok: true, source: source(), ...checkOutfit(raw, items) });
  } catch (err) {
    sendError(res, '/api/style', err);
  }
});
