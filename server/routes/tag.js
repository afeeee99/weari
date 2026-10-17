import express from 'express';
import { Type } from '@google/genai';
import { CATEGORIES, COLORS, MOCK_GEMINI, OCCASIONS } from '../config.js';
import { askGemini, pickRandom, source } from '../gemini.js';
import { sendError } from '../helpers.js';
import { rateLimit } from '../rate-limit.js';

export const router = express.Router();

// =====================================================
// POST /api/tag — one photo in, tags out
//   body: { image: "data:image/jpeg;base64,..." }  (resized to 512px by the browser)
//   reply: { ok, source, tags: { name, category, color, occasions } }
// =====================================================
const TAG_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: 'Short natural item name, e.g. "White linen shirt"' },
    category: { type: Type.STRING, enum: CATEGORIES },
    color: { type: Type.STRING, enum: COLORS },
    occasions: { type: Type.ARRAY, items: { type: Type.STRING, enum: OCCASIONS } },
  },
  required: ['name', 'category', 'color', 'occasions'],
};

const MOCK_TAGS = [
  { name: 'White linen shirt', category: 'top', color: 'white', occasions: ['casual', 'work', 'travel'] },
  { name: 'Dark wash jeans', category: 'bottom', color: 'navy', occasions: ['casual', 'travel'] },
  { name: 'Black midi dress', category: 'dress', color: 'black', occasions: ['party', 'date night', 'formal'] },
  { name: 'White leather sneakers', category: 'shoes', color: 'white', occasions: ['casual', 'travel', 'sport'] },
  { name: 'Camel wool coat', category: 'outerwear', color: 'brown', occasions: ['work', 'formal'] },
];

function cleanTags(raw) {
  const category = CATEGORIES.includes(raw?.category) ? raw.category : null;
  const color = COLORS.includes(raw?.color) ? raw.color : null;
  const occasions = [...new Set((raw?.occasions || []).filter((o) => OCCASIONS.includes(o)))].slice(0, 3);
  const name = String(raw?.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!category || !color || !occasions.length) throw new Error('Gemini returned tags outside the allowed lists');
  return { name: name || `${color} ${category}`, category, color, occasions };
}

router.post('/tag', rateLimit, async (req, res) => {
  try {
    const match = String(req.body?.image || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return res.status(400).json({ ok: false, error: 'bad_image', message: 'Send one photo as a data URL.' });

    let raw;
    if (MOCK_GEMINI) {
      raw = pickRandom(MOCK_TAGS);
    } else {
      raw = await askGemini({
        schema: TAG_SCHEMA,
        contents: [
          { inlineData: { mimeType: match[1], data: match[2] } },
          {
            text:
              'You are tagging a single clothing item for a wardrobe app. Look at the main garment and ignore the ' +
              'background, hanger and any people. Choose the closest category and main color from the allowed lists, ' +
              'pick 1 to 3 fitting occasions, and give it a short natural name (max 4 words).',
          },
        ],
      });
    }
    res.json({ ok: true, source: source(), tags: cleanTags(raw) });
  } catch (err) {
    sendError(res, '/api/tag', err);
  }
});
