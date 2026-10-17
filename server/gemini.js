import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { FALLBACK_WAIT_MS, GEMINI_API_KEY, GEMINI_FALLBACK_MODEL, GEMINI_MODEL, MOCK_GEMINI } from './config.js';

export const ai = GEMINI_API_KEY && !MOCK_GEMINI ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

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

export async function askGemini({ contents, schema, allowFallback = true }) {
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

export const source = () => (MOCK_GEMINI ? 'mock' : 'gemini');
export const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];
