/**
 * Shared middleware for Vercel Serverless API endpoints.
 * CJS for Vercel Node.js runtime compatibility.
 *
 * Usage:
 *   const { rateLimit, requireAuth, corsHeaders, parseBody } = require('./_middleware');
 */

// ─── Rate Limiter (in-memory token bucket) ────────────────────────────────
// Max 100 requests per minute per IP. Exceeding returns 429.
// In-memory only — resets on cold start (acceptable for MVP).

const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 100;    // requests per window
const RATE_LIMIT_WINDOW = 60000; // 1 minute in ms

// Periodic cleanup every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateLimitMap) {
    if (now - bucket.windowStart > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 300000).unref && setInterval(() => {}, 300000).unref();

function rateLimit(req, res) {
  const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown')
    .toString().split(',')[0].trim();

  const now = Date.now();
  let bucket = rateLimitMap.get(ip);

  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW) {
    bucket = { tokens: RATE_LIMIT_MAX, windowStart: now };
    rateLimitMap.set(ip, bucket);
  }

  bucket.tokens--;

  const remaining = Math.max(0, bucket.tokens);
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil((bucket.windowStart + RATE_LIMIT_WINDOW) / 1000));

  if (bucket.tokens < 0) {
    res.writeHead(429, {
      ...corsHeaders(),
      'Retry-After': Math.ceil((bucket.windowStart + RATE_LIMIT_WINDOW - now) / 1000).toString(),
    });
    res.end(JSON.stringify({ error: 'Too many requests. Slow down.', retry_after_seconds: Math.ceil((bucket.windowStart + RATE_LIMIT_WINDOW - now) / 1000) }));
    return false;
  }

  return true;
}

// ─── Auth Middleware ────────────────────────────────────────────────────────
// Checks Authorization: Bearer <ADMIN_API_KEY> from env.
// Returns 401 if missing or wrong.

function requireAuth(req, res) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    // No admin key configured — allow all requests (dev mode)
    return true;
  }

  const authHeader = (req.headers['authorization'] || '').trim();
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token || token !== adminKey) {
    res.writeHead(401, { ...corsHeaders(), 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized — valid API key required' }));
    return false;
  }

  return true;
}

// ─── CORS Headers ──────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}

// ─── Body Parser ───────────────────────────────────────────────────────────
// Reads and JSON-parses the request body with error handling.
// Returns a Promise that resolves to the parsed body object.

function parseBody(req) {
  return new Promise((resolve, reject) => {
    // Vercel may already parse body for some runtimes
    if (typeof req.body === 'object' && req.body !== null && Object.keys(req.body).length > 0) {
      return resolve(req.body);
    }

    let chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
      // Safety limit: 1MB max body size
      const total = chunks.reduce((sum, c) => sum + c.length, 0);
      if (total > 1_000_000) {
        req.destroy();
        reject(new Error('Request body too large (max 1MB)'));
      }
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = { rateLimit, requireAuth, corsHeaders, parseBody };
