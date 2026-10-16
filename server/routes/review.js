import express from 'express';
import { MOCK_GEMINI } from '../config.js';
import { askGemini, source } from '../gemini.js';
import { sendError } from '../helpers.js';
import { rateLimit } from '../rate-limit.js';

export const router = express.Router();

// =====================================================
// POST /api/review — two-sentence review of a look made in "Create your own"
//   body: { outfitName, items: [{ role, category, color, name }] }
//   reply: { ok, source, review }   (exactly one Gemini call, no 503 fallback)
// =====================================================
router.post('/review', rateLimit, async (req, res) => {
  try {
    const items = (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 8);
    if (!items.length) return res.status(400).json({ ok: false, error: 'no_items', message: 'Add items to your outfit first.' });
    const summary = items
      .map((it) => `- ${String(it.role || it.category || '').slice(0, 20)}: ${String(it.color || '').slice(0, 20)} ${String(it.name || it.category || '').slice(0, 40)}`)
      .join('\n');

    const review = MOCK_GEMINI
      ? 'These pieces share an easy, balanced palette that feels put together. (Test mode: this is a mock answer, not a real Gemini response.)'
      : await askGemini({
          allowFallback: false, // reviews are optional: exactly one call, no retries
          contents:
            `You are a friendly personal stylist. Review this outfit called "${String(req.body?.outfitName || 'My look').slice(0, 40)}":\n${summary}\n\n` +
            'Write exactly two sentences: first, a compliment on how the pieces work together; second, a quick styling tip. No greetings or bullet points.',
        });
    res.json({ ok: true, source: source(), review: String(review).slice(0, 400) });
  } catch (err) {
    sendError(res, '/api/review', err);
  }
});
