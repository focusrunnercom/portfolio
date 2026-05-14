/**
 * Vercel Serverless Function: /api/client-config
 * Per-client CRM and AI configuration stored in Vercel KV.
 *
 * GET  /api/client-config?clientId=client_miami  — returns the client config
 * POST /api/client-config                          — creates/updates client config
 *                                                     body: { clientId, config }
 *                                                     header: X-Admin-Key required
 * DELETE /api/client-config?clientId=client_miami  — deletes client config
 *                                                     header: X-Admin-Key required
 *
 * Protected endpoints (POST, DELETE) require X-Admin-Key header
 * matching the ADMIN_API_KEY env var.
 *
 * Reference config structure:
 *   {
 *     "active": true,
 *     "name": "Miami Med Spa (Glow Aesthetics)",
 *     "crm": {
 *       "webhook_url": "https://...",
 *       "api_key": "ghl_..."
 *     },
 *     "booking_url": "https://focusrunner.com",
 *     "ai": {
 *       "model": "deepseek-chat",
 *       "temperature": 0.7,
 *       "max_tokens": 500
 *     }
 *   }
 */

const { kvGet, kvSet, kvDel } = require('./kv.js');

// =============================================================================
// Constants
// =============================================================================

const KV_PREFIX = 'client:';
const ADMIN_KEY = process.env.ADMIN_API_KEY || '';

// =============================================================================
// Validation
// =============================================================================

const VALID_CLIENT_ID_RE = /^[a-zA-Z0-9_-]+$/;

function validateClientId(clientId) {
  if (!clientId || typeof clientId !== 'string') {
    return 'clientId is required and must be a string';
  }
  if (clientId.length < 1 || clientId.length > 100) {
    return 'clientId must be between 1 and 100 characters';
  }
  if (!VALID_CLIENT_ID_RE.test(clientId)) {
    return 'clientId must only contain letters, numbers, hyphens, and underscores';
  }
  return null;
}

function requireAdminKey(req) {
  if (!ADMIN_KEY) {
    console.warn('[client-config] ADMIN_API_KEY not set — admin endpoints disabled');
    return { allowed: false, reason: 'Admin API not configured' };
  }
  const clientKey = req.headers['x-admin-key'] || '';
  if (clientKey !== ADMIN_KEY) {
    return { allowed: false, reason: 'Invalid or missing X-Admin-Key' };
  }
  return { allowed: true };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key, X-Client-Id',
    'Content-Type': 'application/json',
  };
}

// =============================================================================
// Body parser for CJS (req stream)
// =============================================================================

function parseBody(req) {
  return new Promise(function(resolve, reject) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', function() {
      try { resolve(JSON.parse(body)); }
      catch(e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// =============================================================================
// Handlers
// =============================================================================

/**
 * GET /api/client-config?clientId=client_miami
 * Returns the client config, or 404 if not found.
 */
async function handleGet(req, res) {
  const url = new URL(req.url, 'https://focusrunner.io');
  const clientId = url.searchParams.get('clientId');

  const err = validateClientId(clientId);
  if (err) {
    res.writeHead(400, corsHeaders());
    res.end(JSON.stringify({ error: err }));
    return;
  }

  const key = `${KV_PREFIX}${clientId}`;
  const config = await kvGet(key);

  if (!config) {
    res.writeHead(404, corsHeaders());
    res.end(JSON.stringify({
      error: 'Client not found',
      clientId,
    }));
    return;
  }

  res.writeHead(200, corsHeaders());
  res.end(JSON.stringify({
    clientId,
    config,
  }));
}

/**
 * POST /api/client-config
 * Body: { clientId, config }
 * Creates or updates a client config.
 */
async function handlePost(req, res) {
  // Check admin auth
  const auth = requireAdminKey(req);
  if (!auth.allowed) {
    res.writeHead(401, corsHeaders());
    res.end(JSON.stringify({ error: auth.reason }));
    return;
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    res.writeHead(400, corsHeaders());
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const { clientId, config } = body || {};

  // Validate clientId
  const idErr = validateClientId(clientId);
  if (idErr) {
    res.writeHead(400, corsHeaders());
    res.end(JSON.stringify({ error: idErr }));
    return;
  }

  // Validate config
  if (!config || typeof config !== 'object') {
    res.writeHead(400, corsHeaders());
    res.end(JSON.stringify({ error: 'config must be a JSON object' }));
    return;
  }

  // Normalize config with defaults
  const normalized = {
    active: config.active !== false, // defaults to true
    name: config.name || clientId,
    crm: {
      webhook_url: config.crm?.webhook_url || '',
      api_key: config.crm?.api_key || '',
    },
    booking_url: config.booking_url || '',
    ai: {
      model: config.ai?.model || 'deepseek-chat',
      temperature: config.ai?.temperature ?? 0.7,
      max_tokens: config.ai?.max_tokens ?? 500,
    },
  };

  // Ensure at least one of webhook_url or api_key is present if crm is configured
  if (config.crm && !normalized.crm.webhook_url && !normalized.crm.api_key) {
    res.writeHead(400, corsHeaders());
    res.end(JSON.stringify({
      error: 'At least one of crm.webhook_url or crm.api_key is required',
    }));
    return;
  }

  // Validate AI params
  if (normalized.ai.temperature < 0 || normalized.ai.temperature > 2) {
    res.writeHead(400, corsHeaders());
    res.end(JSON.stringify({ error: 'ai.temperature must be between 0 and 2' }));
    return;
  }
  if (normalized.ai.max_tokens < 10 || normalized.ai.max_tokens > 10000) {
    res.writeHead(400, corsHeaders());
    res.end(JSON.stringify({ error: 'ai.max_tokens must be between 10 and 10000' }));
    return;
  }

  const key = `${KV_PREFIX}${clientId}`;
  await kvSet(key, normalized);

  console.log(`[client-config] Saved config for ${clientId}: name=${normalized.name}`);

  res.writeHead(200, corsHeaders());
  res.end(JSON.stringify({
    success: true,
    clientId,
    config: normalized,
  }));
}

/**
 * DELETE /api/client-config?clientId=client_miami
 * Deletes a client config.
 */
async function handleDelete(req, res) {
  const auth = requireAdminKey(req);
  if (!auth.allowed) {
    res.writeHead(401, corsHeaders());
    res.end(JSON.stringify({ error: auth.reason }));
    return;
  }

  const url = new URL(req.url, 'https://focusrunner.io');
  const clientId = url.searchParams.get('clientId');

  const err = validateClientId(clientId);
  if (err) {
    res.writeHead(400, corsHeaders());
    res.end(JSON.stringify({ error: err }));
    return;
  }

  const key = `${KV_PREFIX}${clientId}`;
  const existing = await kvGet(key);

  if (!existing) {
    res.writeHead(404, corsHeaders());
    res.end(JSON.stringify({
      error: 'Client not found',
      clientId,
    }));
    return;
  }

  await kvDel(key);
  console.log(`[client-config] Deleted config for ${clientId}`);

  res.writeHead(200, corsHeaders());
  res.end(JSON.stringify({
    success: true,
    clientId,
    deleted: true,
  }));
}

// =============================================================================
// Main handler
// =============================================================================

module.exports = async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET') {
    const reqUrl = new URL(req.url, 'https://focusrunner.io');
    if (!reqUrl.searchParams.has('clientId')) {
      res.writeHead(200, corsHeaders());
      res.end(JSON.stringify({
        status: 'ok',
        endpoint: '/api/client-config',
        version: '1.0.0',
        kv_configured: !!process.env.KV_REST_API_URL,
      }));
      return;
    }
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    case 'DELETE':
      return handleDelete(req, res);
    default:
      res.writeHead(405, corsHeaders());
      res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
};
