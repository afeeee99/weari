import express from 'express';
import fs from 'fs';
import path from 'path';
import { FIREBASE_CONFIG, GEMINI_FALLBACK_MODEL, GEMINI_MODEL, MOCK_GEMINI, PORT, ROOT_DIR } from './config.js';
import { ai } from './gemini.js';
import { router as buycheckRouter } from './routes/buycheck.js';
import { router as chatRouter } from './routes/chat.js';
import { router as reviewRouter } from './routes/review.js';
import { router as styleRouter } from './routes/style.js';
import { router as tagRouter } from './routes/tag.js';

// =====================================================
// Weari web server
//   npm run dev   -> Vite dev server inside Express (live reload), one port
//   npm start     -> serves the built app from dist/ (run `npm run build` first)
// The Gemini key only lives here, never in the browser.
// =====================================================
const DEV = process.argv.includes('--dev');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const app = express();
app.set('trust proxy', 1); // Cloud Run sits behind one Google proxy; this gives the real visitor IP
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '1mb' }));

// ---------- API ----------
// Public app settings for the browser. Firebase web config is not secret (security comes from
// the Firestore/Storage rules), but it lives in env vars so each environment picks its own project.
app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, firebase: FIREBASE_CONFIG });
});
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', tagRouter, styleRouter, reviewRouter, chatRouter, buycheckRouter);

// Unknown API routes and broken request bodies also get JSON
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'not_found' }));
app.use((err, req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(err.status || 400).json({ ok: false, error: 'bad_request', message: 'Could not read that request.' });
  }
  next(err);
});

// ---------- The web app ----------
if (DEV) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: ROOT_DIR, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    console.error('dist/ is missing. Run "npm run build" first (or "npm run dev" while developing).');
    process.exit(1);
  }
  // Hashed files (assets/*) never change, so browsers may cache them for a year
  app.use('/assets', express.static(path.join(DIST_DIR, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
  // Any other page: send the app (it shows the right screen itself)
  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Weari running on http://localhost:${PORT}${DEV ? ' (dev mode, live reload)' : ''}`);
  console.log(
    MOCK_GEMINI
      ? 'MOCK_GEMINI=true: using fake AI answers (no quota used)'
      : ai
        ? `Gemini model: ${GEMINI_MODEL} (fallback on 503: ${GEMINI_FALLBACK_MODEL})`
        : 'No GEMINI_API_KEY set: the app will use basic rules'
  );
  console.log(FIREBASE_CONFIG ? `Firebase project: ${FIREBASE_CONFIG.projectId}` : 'No FIREBASE_* settings: sign-in and cloud sync are off (on-device mode)');
});
