import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.static(__dirname));

function getGeminiApiKey() {
  // 1. Try process.env if set and not a placeholder
  const envKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  if (envKey && envKey !== 'MY_GEMINI_API_KEY' && envKey !== 'undefined' && envKey !== 'null') {
    return envKey;
  }

  // 2. Check AI Studio dev secrets file (/app/.dev.env.json or relative paths)
  const devEnvPaths = [
    '/app/.dev.env.json',
    path.resolve(__dirname, '../.dev.env.json'),
    path.resolve(__dirname, '.dev.env.json'),
  ];
  for (const p of devEnvPaths) {
    try {
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        const fileKey = (data.GEMINI_API_KEY || data.API_KEY || data.GOOGLE_API_KEY || '').trim();
        if (fileKey && fileKey !== 'MY_GEMINI_API_KEY') {
          return fileKey;
        }
      }
    } catch {
      // ignore read/parse errors
    }
  }

  // 3. Check for standard .env files
  const dotEnvPaths = [
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '.env.local'),
  ];
  for (const p of dotEnvPaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        const match = content.match(/^\s*(?:GEMINI_API_KEY|API_KEY|GOOGLE_API_KEY)\s*=\s*(.*)$/m);
        if (match && match[1]) {
          const parsed = match[1].trim().replace(/^['"]|['"]$/g, '');
          if (parsed && parsed !== 'MY_GEMINI_API_KEY') {
            return parsed;
          }
        }
      }
    } catch {}
  }

  return envKey;
}

// POST /api/tag — Gemini vision auto-tagging for wardrobe pieces
app.post('/api/tag', async (req, res) => {
  try {
    const apiKey = getGeminiApiKey();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return res.status(500).json({
        success: false,
        error: "Couldn't auto-tag this one, please fill it in yourself",
      });
    }

    const { image } = req.body;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({
        success: false,
        error: "Couldn't auto-tag this one, please fill it in yourself",
      });
    }

    let mimeType = 'image/jpeg';
    let base64Data = image;

    const match = image.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = `You are tagging a single clothing item for a wardrobe app. Look at the main garment in the photo, ignore the background, hanger and any people. Choose the closest category and color from the allowed lists. Pick 1 to 3 occasions that fit. If you are unsure, choose the closest option and set confidence to low.`;

    // Exactly one Gemini call with no automatic retries or fallback models
    // Using gemini-3.1-flash-lite with thinking disabled (thinkingBudget: 0) for fastest response
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: {
              type: Type.STRING,
              description: 'A short, natural item name like "White linen shirt"',
            },
            category: {
              type: Type.STRING,
              enum: ['top', 'bottom', 'dress', 'shoes', 'outerwear', 'accessory'],
              description: 'Closest category from the allowed list',
            },
            color: {
              type: Type.STRING,
              enum: [
                'black', 'white', 'grey', 'beige', 'brown', 'red',
                'pink', 'orange', 'yellow', 'green', 'blue', 'navy',
                'purple', 'multi',
              ],
              description: 'Closest main color from the allowed list',
            },
            occasions: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
                enum: [
                  'casual', 'work', 'party', 'wedding', 'date night',
                  'formal', 'sport', 'travel', 'beach',
                ],
              },
              description: '1 to 3 fitting occasions from the allowed list',
            },
            confidence: {
              type: Type.STRING,
              enum: ['high', 'low'],
              description: 'Confidence in the tags: "high" if clear, "low" if ambiguous or unsure',
            },
          },
          required: ['name', 'category', 'color', 'occasions', 'confidence'],
        },
      },
    });

    const jsonStr = response.text ? response.text.trim() : '{}';
    const parsed = JSON.parse(jsonStr);

    return res.json({
      success: true,
      data: parsed,
    });
  } catch (err) {
    console.error('Error in /api/tag from Gemini:', err.message || err);
    const statusCode = err.status === 429 ? 429 : 500;
    return res.status(statusCode).json({
      success: false,
      error: "Couldn't auto-tag this one, please fill it in yourself",
    });
  }
});

app.post('/api/style', async (req, res) => {
  try {
    const apiKey = getGeminiApiKey();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return res.status(500).json({
        error: 'Gemini API key is not configured. Please add your key in Settings > Secrets.',
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const { occasion, items, previousOutfitIds, mustIncludeItemId, userPreferences } = req.body;

    if (!occasion || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Occasion and wardrobe items array are required.' });
    }

    if (items.length === 0) {
      return res.json({
        canFormOutfit: false,
        missing: 'Your wardrobe is empty. Add pieces first to get an outfit recommendation.',
        outfit: [],
        explanation: 'Add your clothes first so I can style an outfit for you.',
      });
    }

    const previousNote =
      Array.isArray(previousOutfitIds) && previousOutfitIds.length > 0
        ? `The user already saw an outfit with item IDs: ${previousOutfitIds.join(', ')}. Please suggest a DIFFERENT outfit combination if possible.`
        : '';

    const mustIncludeNote = mustIncludeItemId
      ? `CRITICAL: The user wants an outfit specifically styling the wardrobe piece with ID "${mustIncludeItemId}". You MUST include this item in the outfit.`
      : '';

    let preferenceNote = '';
    if (userPreferences && typeof userPreferences === 'object') {
      const parts = [];
      if (userPreferences.goal) {
        parts.push(`- Wardrobe goal: "${userPreferences.goal}"`);
      }
      if (Array.isArray(userPreferences.styles) && userPreferences.styles.length > 0) {
        parts.push(`- Preferred style aesthetics: ${userPreferences.styles.join(', ')}`);
      }
      if (Array.isArray(userPreferences.occasions) && userPreferences.occasions.length > 0) {
        parts.push(`- Regular dressing occasions: ${userPreferences.occasions.join(', ')}`);
      }
      if (parts.length > 0) {
        preferenceNote = `
User style preferences:
${parts.join('\n')}
Please tailor the outfit combination and your two-sentence explanation to reflect their personal style preferences and goal.
`.trim();
      }
    }

    const prompt = `
You are an expert personal fashion stylist.
The user wants an outfit recommendation for the occasion: "${occasion}".

${preferenceNote}

Here are the items available in their wardrobe:
${JSON.stringify(items, null, 2)}

${previousNote}
${mustIncludeNote}

Rules:
1. Build one flattering, cohesive outfit using ONLY items from the wardrobe list provided above.
   A complete outfit must consist of:
   - A "dress" (plus optional shoes, outerwear, or accessory), OR
   - A "top" AND a "bottom" (plus optional shoes, outerwear, or accessory).
2. If the user's wardrobe lacks the necessary pieces to form a complete outfit for this occasion (e.g. no dress, or missing a top or bottom), set canFormOutfit to false and in 'missing' describe what type of item they need to add.
3. If an outfit can be formed, set canFormOutfit to true. Include each chosen item in the 'outfit' array with:
   - itemId: the exact 'id' from the wardrobe list
   - role: "Top", "Bottom", "Dress", "Shoes", "Outerwear", or "Accessory"
4. In 'explanation': Provide EXACTLY two sentences explaining why these specific pieces work together for the chosen occasion ("${occasion}"). Keep the tone helpful, encouraging, and stylish.
`.trim();

    const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
    let response = null;
    let lastError = null;

    for (const model of candidateModels) {
      const isGemini3 = model.startsWith('gemini-3');
      const modelConfig = {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            canFormOutfit: {
              type: Type.BOOLEAN,
              description: 'True if an outfit can be formed from the wardrobe, false otherwise',
            },
            missing: {
              type: Type.STRING,
              description: 'Explanation of what piece is needed if canFormOutfit is false',
            },
            outfit: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  itemId: {
                    type: Type.STRING,
                    description: 'The exact id of the item from the wardrobe list',
                  },
                  role: {
                    type: Type.STRING,
                    description: 'The outfit role (e.g. Top, Bottom, Dress, Shoes, Outerwear, Accessory)',
                  },
                },
                required: ['itemId', 'role'],
              },
            },
            explanation: {
              type: Type.STRING,
              description: 'Exactly 2 sentences explaining why the pieces work together for the occasion',
            },
          },
          required: ['canFormOutfit', 'explanation'],
        },
      };

      if (isGemini3) {
        modelConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }

      // Retry up to 3 times with a short wait between attempts
      let succeeded = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: modelConfig,
          });
          if (response && response.text) {
            succeeded = true;
            break;
          }
        } catch (err) {
          lastError = err;
          console.warn(`Model ${model} attempt ${attempt}/3 failed:`, err.message || err);

          // If model is unsupported/not found, break immediately to next model
          if (err.status === 404 || err.message?.includes('not found') || err.message?.includes('no longer available')) {
            break;
          }

          if (attempt < 3) {
            // Short wait between attempts (1s, 2s)
            await new Promise((r) => setTimeout(r, attempt * 1000));
          }
        }
      }

      if (succeeded && response) {
        break;
      }
    }

    if (!response || !response.text) {
      return res.status(503).json({
        error: 'Our stylist is busy, tap Try again',
      });
    }

    const jsonStr = response.text.trim();
    const parsed = JSON.parse(jsonStr);
    return res.json(parsed);
  } catch (err) {
    console.error('Error generating outfit from Gemini:', err);
    return res.status(503).json({
      error: 'Our stylist is busy, tap Try again',
    });
  }
});

// POST /api/review — Optional Gemini review for a user-created outfit
app.post('/api/review', async (req, res) => {
  try {
    const apiKey = getGeminiApiKey();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return res.status(503).json({
        success: false,
        error: "Our stylist is busy right now, but your outfit looks great! Tap to ask again.",
      });
    }

    const { items, outfitName } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Please add items to your outfit before asking for a review.",
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const itemsSummary = items
      .map((it) => `- ${it.role || it.category}: ${it.color || ''} ${it.name || it.category}`.trim())
      .join('\n');

    const prompt = `You are an expert personal fashion stylist. A user put together this outfit:
Outfit name: "${outfitName || 'My Look'}"
Pieces included:
${itemsSummary}

Provide EXACTLY a two-sentence stylish review of this look.
Sentence 1: Compliment how these specific pieces, silhouettes, or colors coordinate with each other.
Sentence 2: Offer a quick, flattering styling tip on where or how to wear this outfit best.
Keep the tone encouraging, chic, and concise. Do NOT include bullet points, greetings, or more than two sentences.`;

    // Exactly one Gemini call with no automatic retries
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const reviewText = response && response.text ? response.text.trim() : '';
    if (!reviewText) {
      return res.status(503).json({
        success: false,
        error: "Our stylist is busy right now, but your outfit looks great! Tap to ask again.",
      });
    }

    return res.json({
      success: true,
      review: reviewText,
    });
  } catch (err) {
    console.error('Error in /api/review from Gemini:', err.message || err);
    return res.status(503).json({
      success: false,
      error: "Our stylist is busy right now, but your outfit looks great! Tap to ask again.",
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
