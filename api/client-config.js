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

const { kvGet, kvSet, kvDel } = require('./kv');

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

function requireAdminKey(request) {
  if (!ADMIN_KEY) {
    console.warn('[client-config] ADMIN_API_KEY not set — admin endpoints disabled');
    return { allowed: false, reason: 'Admin API not configured' };
  }
  const clientKey = request.headers.get('x-admin-key') || '';
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

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(),
  });
}

// =============================================================================
// Handlers
// =============================================================================

/**
 * GET /api/client-config?clientId=client_miami
 * Returns the client config, or 404 if not found.
 */
async function handleGet(request) {
  const url = request.url.startsWith('http') ? new URL(request.url) : new URL(request.url, 'https://focusrunner.io');
  const clientId = url.searchParams.get('clientId');

  const err = validateClientId(clientId);
  if (err) return jsonResponse({ error: err }, 400);

  const key = `${KV_PREFIX}${clientId}`;
  const config = await kvGet(key);

  if (!config) {
    return jsonResponse({
      error: 'Client not found',
      clientId,
    }, 404);
  }

  return jsonResponse({
    clientId,
    config,
  });
}

/**
 * POST /api/client-config
 * Body: { clientId, config }
 * Creates or updates a client config.
 */
async function handlePost(request) {
  // Check admin auth
  const auth = requireAdminKey(request);
  if (!auth.allowed) {
    return jsonResponse({ error: auth.reason }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { clientId, config } = body || {};

  // Validate clientId
  const idErr = validateClientId(clientId);
  if (idErr) return jsonResponse({ error: idErr }, 400);

  // Validate config
  if (!config || typeof config !== 'object') {
    return jsonResponse({ error: 'config must be a JSON object' }, 400);
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
    return jsonResponse({
      error: 'At least one of crm.webhook_url or crm.api_key is required',
    }, 400);
  }

  // Validate AI params
  if (normalized.ai.temperature < 0 || normalized.ai.temperature > 2) {
    return jsonResponse({ error: 'ai.temperature must be between 0 and 2' }, 400);
  }
  if (normalized.ai.max_tokens < 10 || normalized.ai.max_tokens > 10000) {
    return jsonResponse({ error: 'ai.max_tokens must be between 10 and 10000' }, 400);
  }

  const key = `${KV_PREFIX}${clientId}`;
  await kvSet(key, normalized);

  console.log(`[client-config] Saved config for ${clientId}: name=${normalized.name}`);

  return jsonResponse({
    success: true,
    clientId,
    config: normalized,
  });
}

/**
 * DELETE /api/client-config?clientId=client_miami
 * Deletes a client config.
 */
async function handleDelete(request) {
  const auth = requireAdminKey(request);
  if (!auth.allowed) {
    return jsonResponse({ error: auth.reason }, 401);
  }

  const url = request.url.startsWith('http') ? new URL(request.url) : new URL(request.url, 'https://focusrunner.io');
  const clientId = url.searchParams.get('clientId');

  const err = validateClientId(clientId);
  if (err) return jsonResponse({ error: err }, 400);

  const key = `${KV_PREFIX}${clientId}`;
  const existing = await kvGet(key);

  if (!existing) {
    return jsonResponse({
      error: 'Client not found',
      clientId,
    }, 404);
  }

  await kvDel(key);
  console.log(`[client-config] Deleted config for ${clientId}`);

  return jsonResponse({
    success: true,
    clientId,
    deleted: true,
  });
}

// =============================================================================
// Main handler
// =============================================================================

async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  // Health check
  if (request.method === 'GET') {
    const reqUrl = request.url.startsWith('http') ? new URL(request.url) : new URL(request.url, 'https://focusrunner.io');
    if (!reqUrl.searchParams.has('clientId')) {
      return jsonResponse({
        status: 'ok',
        endpoint: '/api/client-config',
        version: '1.0.0',
        kv_configured: !!process.env.KV_REST_API_URL,
      });
    }
  }

  switch (request.method) {
    case 'GET':
      return handleGet(request);
    case 'POST':
      return handlePost(request);
    case 'DELETE':
      return handleDelete(request);
    default:
      return jsonResponse({ error: 'Method not allowed' }, 405);
  }
}

module.exports = handler;
