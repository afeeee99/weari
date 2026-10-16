import express from 'express';
import { Type } from '@google/genai';
import { buyingBrain, buyingBrainRules } from '../../shared/buying-brain.js';
import { CATEGORIES, COLORS, MOCK_GEMINI, OCCASIONS } from '../config.js';
import { askGemini, source } from '../gemini.js';
import { CHAT_COLUMNS, cleanPreferences, describeItem, firstSentences, parseCompactWardrobe, sendError, wearSummary } from '../helpers.js';
import { rateLimit } from '../rate-limit.js';
import { mockStyle } from './style.js';

export const router = express.Router();

// =====================================================
// POST /api/chat — the Style me chat
//   body: {
//     message: "What's the vibe today?",
//     history: [{ role: "user" | "stylist", text }]   (last 4 messages, text only)
//     image: "data:image/jpeg;base64,..."             (optional, resized to 512px)
//     wardrobe: "id | category | color | occasions | wears | days since worn" (one per line)
//     preferences: { goal, styles, occasions }        (only these three are used)
//   }
//   reply: { ok, source, kind, reply, outfit_item_ids, missing_pieces, verdict }
//     kind: "outfit" | "reference_match" | "purchase_check" | "chat"
//     verdict: "skip" | "swap_first" | "buy" (purchase checks only, otherwise null)
//   Exactly one Gemini call, no retries and no fallback model.
// =====================================================
const CHAT_KINDS = ['outfit', 'reference_match', 'purchase_check', 'chat'];
const VERDICTS = ['skip', 'swap_first', 'buy'];

const CHAT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    kind: { type: Type.STRING, enum: CHAT_KINDS },
    reply: { type: Type.STRING, description: 'At most 3 short sentences, naming pieces the user owns (e.g. "your navy blazer")' },
    outfit_item_ids: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Only exact ids from the wardrobe list' },
    missing_pieces: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Short names of pieces the user does not own, e.g. "white sneakers"' },
    verdict: { type: Type.STRING, enum: [...VERDICTS, 'none'] },
    purchase_item: {
      type: Type.OBJECT,
      description: 'For purchase checks: the item being considered',
      properties: {
        category: { type: Type.STRING, enum: CATEGORIES },
        color: { type: Type.STRING, enum: COLORS },
      },
    },
  },
  required: ['kind', 'reply'],
};

function mockChat({ message, hasImage, items }) {
  const text = message.toLowerCase();
  const occasion = OCCASIONS.find((o) => text.includes(o)) || 'casual';
  const findIn = (list) => list.find((x) => text.includes(x));

  if (/\b(buy|purchase|worth it|should i get)\b/.test(text)) {
    const candidate = { category: findIn(CATEGORIES) || 'top', color: findIn(COLORS) || 'black' };
    const brain = buyingBrain(candidate, items);
    const similar = items.filter((it) => brain.similarIds.includes(it.id)).slice(0, 2);
    const owned = similar.length ? ` You could restyle your ${similar.map(describeItem).join(' and your ')} instead.` : '';
    return {
      kind: 'purchase_check',
      reply: `${brain.reason}${owned} (Test mode: mock answer.)`,
      outfit_item_ids: similar.map((it) => it.id),
      missing_pieces: brain.verdict === 'buy' ? [`${candidate.color} ${candidate.category}`] : [],
      verdict: brain.verdict,
    };
  }

  const look = mockStyle(occasion, items.map((it) => ({ ...it, name: describeItem(it) })), []);
  if (hasImage || /screenshot|this look|recreate/.test(text)) {
    const [missing, phrase] = items.some((it) => it.category === 'accessory')
      ? [['statement earrings'], 'a pair of statement earrings']
      : [['gold necklace'], 'a simple gold necklace'];
    return {
      kind: 'reference_match',
      reply: look.canFormOutfit
        ? `Here's how to recreate that look with what you own. Your pieces match the shape and colors closely, and ${phrase} would finish it. (Test mode: mock answer.)`
        : `I can't recreate this one yet. ${look.missing} (Test mode: mock answer.)`,
      outfit_item_ids: (look.outfit || []).map((p) => p.itemId),
      missing_pieces: look.canFormOutfit ? missing : [],
      verdict: null,
    };
  }

  if (/vibe|wear|outfit|style|look|today/.test(text) || OCCASIONS.some((o) => text.includes(o))) {
    if (!look.canFormOutfit) return { kind: 'chat', reply: `${look.missing} (Test mode: mock answer.)`, outfit_item_ids: [], missing_pieces: [], verdict: null };
    const names = look.outfit.map((p) => items.find((it) => it.id === p.itemId)).map(describeItem);
    return {
      kind: 'outfit',
      reply: `Today feels ${occasion === 'casual' ? 'easy and relaxed' : `ready for ${occasion}`}: try your ${names.slice(0, 2).join(' with your ')}. It's a balanced mix you already own. (Test mode: mock answer.)`,
      outfit_item_ids: look.outfit.map((p) => p.itemId),
      missing_pieces: [],
      verdict: null,
    };
  }

  return {
    kind: 'chat',
    reply: `I'm your Weari stylist! Ask me what to wear, send a screenshot of a look you love, or check a purchase before you buy. (Test mode: mock answer.)`,
    outfit_item_ids: [],
    missing_pieces: [],
    verdict: null,
  };
}

// Keep only valid ids, kinds and verdicts; apply the Buying Brain when Gemini's verdict is unclear
function cleanChat(raw, items) {
  const validIds = new Set(items.map((it) => it.id));
  const ids = [...new Set((raw?.outfit_item_ids || []).map(String).filter((id) => validIds.has(id)))].slice(0, 6);
  let kind = CHAT_KINDS.includes(raw?.kind) ? raw.kind : 'chat';
  let verdict = VERDICTS.includes(raw?.verdict) ? raw.verdict : null;

  if (kind === 'purchase_check' && !verdict) {
    const item = raw?.purchase_item;
    if (CATEGORIES.includes(item?.category) && COLORS.includes(item?.color)) verdict = buyingBrain(item, items).verdict;
  }
  if (kind !== 'purchase_check') verdict = null;
  if ((kind === 'outfit' || kind === 'reference_match') && !ids.length && !(raw?.missing_pieces || []).length) kind = 'chat';

  return {
    kind,
    reply: firstSentences(String(raw?.reply || '').slice(0, 600), 3) || "I'm here! Ask me what to wear today.",
    outfit_item_ids: kind === 'chat' ? [] : ids,
    missing_pieces: (raw?.missing_pieces || []).map((m) => String(m).trim().slice(0, 40)).filter(Boolean).slice(0, 3),
    verdict,
  };
}

router.post('/chat', rateLimit, async (req, res) => {
  try {
    const message = String(req.body?.message || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    const imageMatch = String(req.body?.image || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!message && !imageMatch) return res.status(400).json({ ok: false, error: 'empty_message', message: 'Type a message or attach a photo.' });

    const items = parseCompactWardrobe(req.body?.wardrobe, CHAT_COLUMNS);
    const prefs = cleanPreferences(req.body?.preferences);
    const history = (Array.isArray(req.body?.history) ? req.body.history : [])
      .slice(-4)
      .map((m) => ({ role: m?.role === 'user' ? 'User' : 'Stylist', text: String(m?.text || '').replace(/\s+/g, ' ').slice(0, 500) }))
      .filter((m) => m.text);

    let raw;
    if (MOCK_GEMINI) {
      raw = mockChat({ message, hasImage: Boolean(imageMatch), items });
    } else {
      const prefLines = [
        prefs.goal && `- Wardrobe goal: ${prefs.goal}`,
        prefs.styles.length && `- Preferred styles: ${prefs.styles.join(', ')}`,
        prefs.occasions.length && `- Usually dresses for: ${prefs.occasions.join(', ')}`,
      ].filter(Boolean);
      const prompt = [
        "You are Weari's personal stylist, chatting in a wardrobe app that encourages rewearing and swapping over buying new.",
        `Wardrobe (id | category | color | occasions | times worn | days since last worn, "-" = never):\n${
          items.map((it) => `${it.id} | ${it.category} | ${it.color} | ${it.occasions.join(', ')} | ${it.wears} | ${it.daysSinceWorn ?? '-'}`).join('\n') || '(empty)'
        }`,
        `How they actually wear their clothes:\n${wearSummary(items)}`,
        prefLines.length ? `User preferences:\n${prefLines.join('\n')}` : '',
        history.length ? `Recent conversation:\n${history.map((m) => `${m.role}: ${m.text}`).join('\n')}` : '',
        `User's new message: ${message || '(no text, see the attached image)'}${imageMatch ? '\nThe user attached an image.' : ''}`,
        'Choose "kind":\n' +
          '- "outfit": they want something to wear. Pick a complete outfit (one dress, or a top plus a bottom, plus shoes if owned) in outfit_item_ids. Favour pieces they rarely wear.\n' +
          '- "reference_match": they sent a look to recreate. Match it with their own pieces in outfit_item_ids and list what they lack in missing_pieces.\n' +
          '- "purchase_check": they are thinking of buying something. Set purchase_item to its category and color. ' +
          `${buyingBrainRules()}\n` +
          '- "chat": anything else.',
        'Rules: only use ids from the wardrobe list. "reply" is at most 3 short, warm sentences and names pieces they own by color and category (e.g. "your navy blazer"). Use verdict "none" unless kind is purchase_check.',
      ]
        .filter(Boolean)
        .join('\n\n');
      raw = await askGemini({
        allowFallback: false, // chat: exactly one call, no retries
        schema: CHAT_SCHEMA,
        contents: imageMatch ? [{ inlineData: { mimeType: imageMatch[1], data: imageMatch[2] } }, { text: prompt }] : prompt,
      });
    }
    res.json({ ok: true, source: source(), ...cleanChat(raw, items) });
  } catch (err) {
    sendError(res, '/api/chat', err);
  }
});
