import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { buyingBrain, buyingBrainRules, SHOP_VERDICTS, pairsWith, shopCheck } from './buying-brain.js';

// =====================================================
// Settings — change these in one place
// =====================================================
const GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash-lite'; // tried once, only when GEMINI_MODEL answers 503 (busy)
const FALLBACK_WAIT_MS = 2000;
// Shared by every AI endpoint (tag, style, review, chat, buycheck): one counter per visitor and one for the app
const PER_VISITOR_DAILY_LIMIT = 40; // AI requests per visitor (IP address) per day
const GLOBAL_DAILY_CAP = 600; // AI requests for the whole app per day

// The app's own lists (must match app.js)
const CATEGORIES = ['top', 'bottom', 'dress', 'shoes', 'outerwear', 'accessory'];
const COLORS = ['black', 'white', 'grey', 'beige', 'brown', 'red', 'pink', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple', 'multi'];
const OCCASIONS = ['casual', 'work', 'party', 'wedding', 'date night', 'formal', 'sport', 'travel', 'beach'];
const ROLES = ['Top', 'Bottom', 'Dress', 'Shoes', 'Outerwear', 'Accessory'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env (local development only — never committed). Cloud Run sets env vars directly.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = process.env.PORT || 8080;
const MOCK_GEMINI = process.env.MOCK_GEMINI === 'true';
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const ai = GEMINI_API_KEY && !MOCK_GEMINI ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const app = express();
app.set('trust proxy', 1); // Cloud Run sits behind one Google proxy; this gives the real visitor IP
app.use(express.json({ limit: '1mb' }));

// Serve only the app's public files (not server.js, package.json, node_modules, .env…)
// buying-brain.js is shared: the server uses it, and the app uses it to re-check edited items locally
const PUBLIC_FILES = ['index.html', 'styles.css', 'app.js', 'stylist.js', 'swap-data.js', 'buying-brain.js'];
app.get(['/', ...PUBLIC_FILES.map((f) => `/${f}`)], (req, res) => {
  const file = req.path === '/' ? 'index.html' : req.path.slice(1);
  res.sendFile(path.join(__dirname, file));
});

// =====================================================
// Daily limits (kept in memory: they reset at midnight UTC or when the server restarts)
// =====================================================
let usageDay = '';
let globalCount = 0;
const visitorCounts = new Map();

function rateLimit(req, res, next) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== usageDay) {
    usageDay = today;
    globalCount = 0;
    visitorCounts.clear();
  }
  const visitor = req.ip || 'unknown';
  const used = visitorCounts.get(visitor) || 0;
  if (used >= PER_VISITOR_DAILY_LIMIT) {
    return res.status(429).json({ ok: false, error: 'daily_limit', message: 'You have used today’s AI requests.' });
  }
  if (globalCount >= GLOBAL_DAILY_CAP) {
    return res.status(429).json({ ok: false, error: 'global_cap', message: 'The stylist is fully booked today.' });
  }
  visitorCounts.set(visitor, used + 1);
  globalCount++;
  next();
}

// One Gemini call per request. The only exception: if the main model is busy (503),
// wait 2 seconds and try the lighter fallback model once. Never on 429 or any other error.
async function callModel(model, contents, schema) {
  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      ...(schema && { responseMimeType: 'application/json', responseSchema: schema }),
    },
  });
  const text = (response?.text || '').trim();
  if (!text) throw new Error('Empty response from Gemini');
  return schema ? JSON.parse(text) : text;
}

async function askGemini({ contents, schema, allowFallback = true }) {
  if (!ai) throw Object.assign(new Error('Gemini API key is not configured'), { status: 503 });
  try {
    return await callModel(GEMINI_MODEL, contents, schema);
  } catch (err) {
    if (!allowFallback || err?.status !== 503) throw err;
    console.warn(`${GEMINI_MODEL} is busy (503); trying ${GEMINI_FALLBACK_MODEL} once in ${FALLBACK_WAIT_MS / 1000}s`);
    await new Promise((r) => setTimeout(r, FALLBACK_WAIT_MS));
    return callModel(GEMINI_FALLBACK_MODEL, contents, schema);
  }
}

const source = () => (MOCK_GEMINI ? 'mock' : 'gemini');
const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

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

app.post('/api/tag', rateLimit, async (req, res) => {
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

// Turn the compact wardrobe text back into items so we can check Gemini's answer
function parseWardrobe(text) {
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

const asList = (v, allowed, max) =>
  (Array.isArray(v) ? v : []).map(String).filter((x) => !allowed || allowed.includes(x)).slice(0, max);

// Only goal, styles and occasions are ever passed on — nothing else from the profile
function cleanPreferences(p) {
  return {
    goal: typeof p?.goal === 'string' ? p.goal.slice(0, 80) : null,
    styles: asList(p?.styles, null, 5).map((s) => s.slice(0, 30)),
    occasions: asList(p?.occasions, OCCASIONS, 9),
  };
}

const roleFor = (category) =>
  ({ top: 'Top', bottom: 'Bottom', dress: 'Dress', shoes: 'Shoes', outerwear: 'Outerwear', accessory: 'Accessory' })[category];

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

function mockStyle(occasion, items, previousIds) {
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

app.post('/api/style', rateLimit, async (req, res) => {
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

// =====================================================
// POST /api/review — two-sentence review of a look made in "Create your own"
//   body: { outfitName, items: [{ role, category, color, name }] }
//   reply: { ok, source, review }   (exactly one Gemini call, no 503 fallback)
// =====================================================
app.post('/api/review', rateLimit, async (req, res) => {
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

// Read compact wardrobe text ("a | b | c" per line) into items. Each endpoint names its own columns:
//   chat:     id | category | color | occasions | wears | days since worn ("-" = never)
//   buycheck: id | name | category | color | occasions | wears
const CHAT_COLUMNS = ['id', 'category', 'color', 'occasions', 'wears', 'days'];
const BUYCHECK_COLUMNS = ['id', 'name', 'category', 'color', 'occasions', 'wears'];

function parseCompactWardrobe(text, columns) {
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

const describeItem = (it) => `${it.color} ${it.category}`;
// Keep the first n sentences (a sentence ends with . ! or ? followed by a space, so "2.0" stays intact)
const firstSentences = (text, n) => String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?]["')]?)\s+/).slice(0, n).join(' ');

// Short per-category summary of how the user actually wears their clothes (for Gemini)
function wearSummary(items) {
  return CATEGORIES.map((cat) => {
    const list = items.filter((it) => it.category === cat);
    if (!list.length) return `${cat}: none owned`;
    const avg = list.reduce((s, it) => s + it.wears, 0) / list.length;
    const idle = list.filter((it) => it.daysSinceWorn === null || it.daysSinceWorn > 30).length;
    return `${cat}: ${list.length} owned, ${avg.toFixed(1)} wears on average, ${idle} not worn in 30+ days`;
  }).join('\n');
}

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

app.post('/api/chat', rateLimit, async (req, res) => {
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

app.post('/api/buycheck', rateLimit, async (req, res) => {
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

// Always answer with JSON on errors. The browser falls back to basic rules.
function sendError(res, route, err) {
  console.error(`${route} failed:`, err?.message || err);
  const status = err?.status === 429 ? 429 : 503;
  res.status(status).json({ ok: false, error: status === 429 ? 'rate_limited' : 'unavailable', message: 'The stylist needs a short break.' });
}

// Unknown API routes and broken request bodies also get JSON
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'not_found' }));
app.use((err, req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(err.status || 400).json({ ok: false, error: 'bad_request', message: 'Could not read that request.' });
  }
  next(err);
});

// Anything else: send the app
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
  console.log(`Weari running on http://localhost:${PORT}`);
  console.log(MOCK_GEMINI ? 'MOCK_GEMINI=true: using fake AI answers (no quota used)' : ai ? `Gemini model: ${GEMINI_MODEL} (fallback on 503: ${GEMINI_FALLBACK_MODEL})` : 'No GEMINI_API_KEY set: the app will use basic rules');
});
