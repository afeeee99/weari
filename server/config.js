import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// =====================================================
// Settings — change these in one place
// =====================================================
export const GEMINI_MODEL = 'gemini-3.8-flash';
export const GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash-lite'; // tried once, only when GEMINI_MODEL answers 503 (busy)
export const FALLBACK_WAIT_MS = 2000;
// Shared by every AI endpoint (tag, style, review, chat, buycheck, listing): one counter per visitor and one for the app
export const PER_VISITOR_DAILY_LIMIT = 40; // AI requests per visitor (IP address) per day
export const GLOBAL_DAILY_CAP = 600; // AI requests for the whole app per day

// The app's own lists (must match src/core/constants.js)
export const CATEGORIES = ['top', 'bottom', 'dress', 'shoes', 'outerwear', 'accessory'];
export const COLORS = ['black', 'white', 'grey', 'beige', 'brown', 'red', 'pink', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple', 'multi'];
export const OCCASIONS = ['casual', 'work', 'party', 'wedding', 'date night', 'formal', 'sport', 'travel', 'beach'];
export const ROLES = ['Top', 'Bottom', 'Dress', 'Shoes', 'Outerwear', 'Accessory'];

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load .env (local development only — never committed). Cloud Run sets env vars directly.
const envFile = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

export const PORT = process.env.PORT || 8080;
export const MOCK_GEMINI = process.env.MOCK_GEMINI === 'true';
export const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();

// Firebase web config (public values, but kept out of git so each environment can use its own project).
// The browser fetches these from GET /api/config. If FIREBASE_API_KEY is empty, the app runs in
// on-device mode only (no sign-in, no cloud sync).
export const FIREBASE_CONFIG = (process.env.FIREBASE_API_KEY || '').trim()
  ? {
      apiKey: process.env.FIREBASE_API_KEY.trim(),
      authDomain: (process.env.FIREBASE_AUTH_DOMAIN || '').trim(),
      projectId: (process.env.FIREBASE_PROJECT_ID || '').trim(),
      storageBucket: (process.env.FIREBASE_STORAGE_BUCKET || '').trim(),
      messagingSenderId: (process.env.FIREBASE_MESSAGING_SENDER_ID || '').trim(),
      appId: (process.env.FIREBASE_APP_ID || '').trim(),
      ...(process.env.FIREBASE_MEASUREMENT_ID && { measurementId: process.env.FIREBASE_MEASUREMENT_ID.trim() }),
    }
  : null;
