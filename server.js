import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

// =====================================================
// Settings — change these in one place
// =====================================================
const GEMINI_MODEL = 'gemini-3.8-flash';
const PER_VISITOR_DAILY_LIMIT = 15; // AI requests per visitor (IP address) per day
const GLOBAL_DAILY_CAP = 500; // AI requests for the whole app per day

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
const PUBLIC_FILES = ['index.html', 'styles.css', 'app.js', 'stylist.js', 'swap-data.js'];
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

// One Gemini call, no retries. Returns parsed JSON (or text when no schema is given).
async function askGemini({ contents, schema }) {
  if (!ai) throw Object.assign(new Error('Gemini API key is not configured'), { status: 503 });
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
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
// POST /api/review — optional two-sentence review of a user-made outfit
//   body: { outfitName, items: [{ role, category, color, name }] }
//   reply: { ok, source, review }
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
          contents:
            `You are a friendly personal stylist. Review this outfit called "${String(req.body?.outfitName || 'My look').slice(0, 40)}":\n${summary}\n\n` +
            'Write exactly two sentences: first, a compliment on how the pieces work together; second, a quick styling tip. No greetings or bullet points.',
        });
    res.json({ ok: true, source: source(), review: String(review).slice(0, 400) });
  } catch (err) {
    sendError(res, '/api/review', err);
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
  console.log(MOCK_GEMINI ? 'MOCK_GEMINI=true: using fake AI answers (no quota used)' : ai ? `Gemini model: ${GEMINI_MODEL}` : 'No GEMINI_API_KEY set: the app will use basic rules');
});
