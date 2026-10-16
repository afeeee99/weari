import express from 'express';
import { Type } from '@google/genai';
import { buyingBrain, buyingBrainRules, pairsWith, SHOP_VERDICTS, shopCheck } from '../../shared/buying-brain.js';
import { CATEGORIES, COLORS, MOCK_GEMINI, OCCASIONS } from '../config.js';
import { askGemini, source } from '../gemini.js';
import { BUYCHECK_COLUMNS, firstSentences, parseCompactWardrobe, sendError } from '../helpers.js';
import { rateLimit } from '../rate-limit.js';

export const router = express.Router();

// =====================================================
// POST /api/buycheck — Buying Brain shop scan
//   body: {
//     image: "data:image/jpeg;base64,..."   (one photo, resized to 512px by the browser)
//     price: 49.99                           (optional)
//     wardrobe: "id | name | category | color | occasions | wears" (one per line)
//   }
//   reply: { ok, source, item_name, category, color, confidence, occasions,
//            verdict, reason, similar_item_ids, pairs_with_ids }
//     category: one of the app's categories or "unknown"; confidence: "high" | "medium" | "low"
//     verdict: "skip" | "real gap" | "try rewear first", or null when category is "unknown"
//              or confidence is "low" (the app then asks for a better photo)
//   Exactly one Gemini call, no retries and no fallback model.
//   Reuses buying-brain.js (rules, verdict, pairing) — the same logic as Chat purchase checks.
// =====================================================
const SHOP_VERDICT_LIST = Object.values(SHOP_VERDICTS);
const CONFIDENCE_LEVELS = ['high', 'medium', 'low'];

const BUYCHECK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    item_name: { type: Type.STRING, description: 'Short name of the item in the photo, e.g. "White linen shirt"' },
    category: { type: Type.STRING, enum: [...CATEGORIES, 'unknown'], description: '"unknown" if it is not clearly one clothing item' },
    color: { type: Type.STRING, enum: [...COLORS, 'unknown'] },
    confidence: { type: Type.STRING, enum: CONFIDENCE_LEVELS, description: 'How sure you are about the item, category and color' },
    occasions: { type: Type.ARRAY, items: { type: Type.STRING, enum: OCCASIONS } },
    verdict: { type: Type.STRING, enum: SHOP_VERDICT_LIST },
    reason: { type: Type.STRING, description: 'Exactly two sentences naming pieces they own by name' },
    similar_item_ids: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Up to 3 owned pieces that are similar' },
    pairs_with_ids: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Up to 3 owned pieces it would pair with' },
  },
  required: ['item_name', 'category', 'color', 'confidence'],
};

// Rotating sample items so mock mode shows every verdict, plus an unclear photo
const MOCK_SHOP_ITEMS = [
  { item_name: 'White linen shirt', category: 'top', color: 'white', confidence: 'high', occasions: ['casual', 'work'] },
  { item_name: 'Black leather loafers', category: 'shoes', color: 'black', confidence: 'high', occasions: ['work', 'formal'] },
  { item_name: 'Green satin slip dress', category: 'dress', color: 'green', confidence: 'high', occasions: ['party', 'wedding'] },
  { item_name: 'Beige trench coat', category: 'outerwear', color: 'beige', confidence: 'medium', occasions: ['work', 'travel'] },
  { item_name: '', category: 'unknown', color: 'unknown', confidence: 'low', occasions: [] },
];
let mockShopTurn = 0;

function mockBuycheck(items) {
  const item = MOCK_SHOP_ITEMS[mockShopTurn++ % MOCK_SHOP_ITEMS.length];
  return item.category === 'unknown' ? item : { ...item, ...shopCheck(item, items) };
}

// Keep only valid ids, labels and verdicts; fill gaps from the Buying Brain.
// No verdict when the item is unknown or Gemini isn't confident — the app asks for a better photo.
function cleanBuycheck(raw, items) {
  const validIds = new Set(items.map((it) => it.id));
  const pickIds = (list) => [...new Set((list || []).map(String).filter((id) => validIds.has(id)))].slice(0, 3);
  const category = CATEGORIES.includes(raw?.category) ? raw.category : 'unknown';
  const color = COLORS.includes(raw?.color) ? raw.color : 'unknown';
  const confidence = CONFIDENCE_LEVELS.includes(raw?.confidence) ? raw.confidence : 'low';
  const occasions = (raw?.occasions || []).filter((o) => OCCASIONS.includes(o));
  const itemName =
    String(raw?.item_name || '').replace(/\s+/g, ' ').trim().slice(0, 40) || (category !== 'unknown' ? `${color === 'unknown' ? '' : `${color} `}${category}` : 'Unknown item');
  const detected = { item_name: itemName, category, color, confidence, occasions };

  if (category === 'unknown' || confidence === 'low') {
    return { ...detected, verdict: null, reason: '', similar_item_ids: [], pairs_with_ids: [] };
  }

  const item = { category, color, occasions };
  const brain = buyingBrain(item, items);
  const verdict = SHOP_VERDICT_LIST.includes(raw?.verdict) ? raw.verdict : SHOP_VERDICTS[brain.verdict];

  let similar = pickIds(raw?.similar_item_ids);
  if (!similar.length) similar = brain.similarIds.slice(0, 3);
  let pairs = pickIds(raw?.pairs_with_ids).filter((id) => !similar.includes(id));
  if (!pairs.length) pairs = pairsWith(item, items).filter((id) => !similar.includes(id));

  return {
    ...detected,
    verdict,
    reason: firstSentences(String(raw?.reason || brain.reason).slice(0, 600), 2),
    similar_item_ids: similar,
    pairs_with_ids: pairs.slice(0, 3),
  };
}

router.post('/buycheck', rateLimit, async (req, res) => {
  try {
    const imageMatch = String(req.body?.image || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!imageMatch) return res.status(400).json({ ok: false, error: 'bad_image', message: 'Send one photo as a data URL.' });
    const price = Number(req.body?.price);
    const hasPrice = Number.isFinite(price) && price > 0 && price < 100000;
    const items = parseCompactWardrobe(req.body?.wardrobe, BUYCHECK_COLUMNS);

    let raw;
    if (MOCK_GEMINI) {
      raw = mockBuycheck(items);
    } else {
      raw = await askGemini({
        allowFallback: false, // shop scan: exactly one call, no retries
        schema: BUYCHECK_SCHEMA,
        contents: [
          { inlineData: { mimeType: imageMatch[1], data: imageMatch[2] } },
          {
            text: [
              "You are Weari's Buying Brain: a stylist who helps people rewear and swap before buying new. The photo shows an item they are thinking of buying in a shop.",
              `Their wardrobe (id | name | category | color | occasions | times worn):\n${
                items.map((it) => `${it.id} | ${it.name} | ${it.category} | ${it.color} | ${it.occasions.join(', ')} | ${it.wears}`).join('\n') || '(empty)'
              }`,
              hasPrice ? `Price: ${price}` : '',
              'Identify the item: item_name, category, color and likely occasions, plus your confidence ("high", "medium" or "low"). ' +
                'If the photo does not clearly show one clothing item, set category to "unknown" and skip the verdict.',
              buyingBrainRules(SHOP_VERDICTS),
              'similar_item_ids: up to 3 owned pieces that are similar. pairs_with_ids: up to 3 owned pieces it would go with. Only use ids from the wardrobe list.',
              '"reason" is exactly two short, warm sentences that name pieces they own by their names.',
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
        ],
      });
    }
    res.json({ ok: true, source: source(), ...cleanBuycheck(raw, items) });
  } catch (err) {
    sendError(res, '/api/buycheck', err);
  }
});
