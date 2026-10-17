import express from 'express';
import { Type } from '@google/genai';
import { CATEGORIES, COLORS, MOCK_GEMINI, OCCASIONS } from '../config.js';
import { askGemini, source } from '../gemini.js';
import { sendError } from '../helpers.js';
import { rateLimit } from '../rate-limit.js';

export const router = express.Router();

// =====================================================
// POST /api/listing — a resale title and description for one wardrobe item (Rewear → Sell)
//   body: { item: { name, category, color, occasions, wears } }
//   reply: { ok, source, title, description }
//   Exactly one Gemini call, no retries and no fallback model. JSON only.
// =====================================================
const LISTING_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'Short resale title, max 60 characters, e.g. "White linen shirt, relaxed fit"' },
    description: { type: Type.STRING, description: 'Two or three short, honest sentences for a second-hand listing' },
  },
  required: ['title', 'description'],
};

function mockListing(item) {
  const name = item.name || `${item.color} ${item.category}`;
  const occasions = item.occasions.length ? item.occasions.slice(0, 2).join(' and ') : 'everyday';
  return {
    title: `${name.charAt(0).toUpperCase()}${name.slice(1)}, pre-loved`,
    description: `A ${item.color} ${item.category} in good condition, great for ${occasions} wear. Ready for its next wardrobe. (Test mode: this is a mock answer, not a real Gemini response.)`,
  };
}

router.post('/listing', rateLimit, async (req, res) => {
  try {
    const raw = req.body?.item || {};
    const category = CATEGORIES.includes(raw.category) ? raw.category : null;
    if (!category) return res.status(400).json({ ok: false, error: 'no_item', message: 'Send one wardrobe item.' });
    const item = {
      name: String(raw.name || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      category,
      color: COLORS.includes(raw.color) ? raw.color : 'multi',
      occasions: [...new Set((Array.isArray(raw.occasions) ? raw.occasions : []).filter((o) => OCCASIONS.includes(o)))].slice(0, 3),
      wears: Math.max(0, Math.min(999, Number(raw.wears) || 0)),
    };

    const answer = MOCK_GEMINI
      ? mockListing(item)
      : await askGemini({
          allowFallback: false, // listings: exactly one call, no retries
          schema: LISTING_SCHEMA,
          contents:
            'You write second-hand clothing listings for Weari, a rewear and resale app in Sri Lanka.\n' +
            `Item: ${item.name || '(no name)'} | category: ${item.category} | color: ${item.color} | occasions: ${item.occasions.join(', ') || 'casual'} | times worn: ${item.wears}\n\n` +
            'Write a short title (max 60 characters) and an honest, warm description of two or three short sentences. ' +
            'Do not invent brands, sizes, prices or flaws. No emojis, hashtags or contact details.',
        });

    const title = String(answer?.title || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const description = String(answer?.description || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!title || !description) throw new Error('Gemini returned an empty listing');
    res.json({ ok: true, source: source(), title, description });
  } catch (err) {
    sendError(res, '/api/listing', err);
  }
});
