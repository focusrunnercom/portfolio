/**
 * Vercel Serverless Function: /api/health
 * GET -> { status, timestamp, env checks }
 * Uses (req, res) callback style for Node.js Serverless Runtime.
 */
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const { rateLimit, corsHeaders } = require('./_middleware');

function sendJson(res, data, status) {
  status = status || 200;
  res.writeHead(status, corsHeaders());
  return res.end(JSON.stringify(data, null, 2));
}

module.exports = function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    return res.end();
  }
  if (req.method !== 'GET') {
    return sendJson(res, { error: 'Method not allowed' }, 405);
  }

  const result = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    endpoint: '/api/health',
    env: {
      hasDeepSeekKey: DEEPSEEK_API_KEY.length > 0,
      hasKvUrl: !!process.env.KV_URL,
      hasKvToken: !!process.env.KV_REST_API_TOKEN,
      hasOpenaiBase: !!process.env.OPENAI_API_BASE,
      hasResendKey: !!process.env.RESEND_API_KEY,
      hasAdminKey: !!process.env.ADMIN_API_KEY,
      hasGhlKey: !!process.env.GHL_API_KEY,
      nodeVersion: process.version || 'unknown',
      vercelRegion: process.env.VERCEL_REGION || 'unknown',
      vercelEnv: process.env.VERCEL_ENV || 'unknown',
    },
  };

  return sendJson(res, result);
};
