import { GLOBAL_DAILY_CAP, PER_VISITOR_DAILY_LIMIT } from './config.js';

// =====================================================
// Daily limits (kept in memory: they reset at midnight UTC or when the server restarts)
// =====================================================
let usageDay = '';
let globalCount = 0;
const visitorCounts = new Map();

export function rateLimit(req, res, next) {
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
