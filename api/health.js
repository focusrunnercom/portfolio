/**
 * Vercel Serverless Function: /api/health
 * Diagnostic endpoint — tests DeepSeek reachability from Vercel us-east.
 *
 * GET /api/health          → { status, timestamp, env checks }
 * GET /api/health?test=deepseek → also attempts DeepSeek API call
 *
 * Node.js Serverless Runtime — uses (req, res) callback style.
 */
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function sendJson(res, data, status = 200) {
  res.writeHead(status, headers);
  return res.end(JSON.stringify(data, null, 2));
}

module.exports = async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    return res.end();
  }

  if (req.method !== 'GET') {
    return sendJson(res, { error: 'Method not allowed' }, 405);
  }

  const env = {
    hasDeepSeekKey: DEEPSEEK_API_KEY.length > 0,
    hasKvUrl: !!process.env.KV_URL,
    hasKvToken: !!process.env.KV_REST_API_TOKEN,
    hasOpenaiBase: !!process.env.OPENAI_API_BASE,
    hasResendKey: !!process.env.RESEND_API_KEY,
    hasAdminKey: !!process.env.ADMIN_API_KEY,
    nodeVersion: process.version || 'unknown',
    vercelRegion: process.env.VERCEL_REGION || 'unknown',
    vercelEnv: process.env.VERCEL_ENV || 'unknown',
  };

  const result = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    endpoint: '/api/health',
    env,
  };

  // DeepSeek connectivity test
  if (req.url && req.url.includes('test=deepseek')) {
    if (!DEEPSEEK_API_KEY) {
      result.deepseek = {
        reachable: false,
        reason: 'DEEPSEEK_API_KEY not configured in Vercel env',
      };
      return sendJson(res, result);
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

      const dsRes = await fetch('https://api.deepseek.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      const latencyMs = Date.now() - start;
      let body = null;
      try { body = await dsRes.json(); }
      catch (e) { body = { error: 'Failed to parse response body' }; }

      result.deepseek = {
        reachable: dsRes.ok,
        statusCode: dsRes.status,
        latencyMs,
        error: dsRes.ok ? null : `HTTP ${dsRes.status}: ${JSON.stringify(body).slice(0, 200)}`,
        modelCount: dsRes.ok && body?.data ? body.data.length : null,
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      result.deepseek = {
        reachable: false,
        statusCode: null,
        latencyMs,
        error: err.name === 'AbortError'
          ? 'Request timed out after 10s'
          : `Network error: ${err.message}`,
      };
    }
  }

  return sendJson(res, result);
};
