/**
 * Vercel Edge Function: /api/admin/client
 * CRUD for per-client configurations stored in Vercel KV.
 *
 * Protected by X-Admin-Key header matching ADMIN_API_KEY env var.
 *
 * POST   /api/admin/client              → Create new client config
 * GET    /api/admin/client/:clientId    → Read full client config (including secrets)
 * PUT    /api/admin/client/:clientId    → Replace full config
 * PATCH  /api/admin/client/:clientId    → Partial update (merge)
 * DELETE /api/admin/client/:clientId    → Deactivate (set active=false, don't delete)
 * GET    /api/admin/clients             → List all active client IDs
 */
export const config = {
  runtime: 'edge',
};

import { kvGet, kvSet, kvDel } from '../kv.js';

const ADMIN_KEY = process.env.ADMIN_API_KEY || '';

function unauthorized(message = 'Unauthorized') {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Validate a client config object.
 * Returns null if valid, or an error message string if invalid.
 */
function validateConfig(config) {
  if (!config) return 'Config object is required';
  if (!config.clientId) return 'clientId is required';
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(config.clientId)) {
    return 'clientId must be 3-64 alphanumeric characters, underscores, or hyphens';
  }
  if (!config.name) config.name = config.clientId;
  if (config.active === undefined) config.active = true;
  return null;
}

export default async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
      },
    });
  }

  // Auth check
  const authHeader = request.headers.get('x-admin-key');
  if (ADMIN_KEY && authHeader !== ADMIN_KEY) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // Path: api/admin/client/{clientId?}
  const isListEndpoint = pathParts.length === 3 && pathParts[2] === 'clients';
  const clientId = !isListEndpoint && pathParts.length >= 4 ? pathParts[3] : null;

  try {
    switch (request.method) {
      // === CREATE ===
      case 'POST': {
        let config;
        try {
          config = await request.json();
        } catch {
          return jsonResponse({ error: 'Invalid JSON body' }, 400);
        }

        const validationError = validateConfig(config);
        if (validationError) {
          return jsonResponse({ error: validationError }, 400);
        }

        // Check if already exists
        const existing = await kvGet(`config:${config.clientId}`);
        if (existing) {
          return jsonResponse({ error: `Client ${config.clientId} already exists. Use PUT to update.` }, 409);
        }

        config.created = new Date().toISOString();
        config.updated = config.created;
        await kvSet(`config:${config.clientId}`, config);

        return jsonResponse({ status: 'created', clientId: config.clientId }, 201);
      }

      // === LIST ===
      case 'GET': {
        if (isListEndpoint) {
          // Scan for all config keys
          let configKeys = [];
          try {
            const res = await fetch(
              `${process.env.KV_REST_API_URL}/keys?prefix=config:`,
              { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
            );
            if (res.ok) {
              const data = await res.json();
              configKeys = data.result || [];
            }
          } catch {
            return jsonResponse({ error: 'KV scan failed. KV may not be provisioned.' }, 500);
          }

          // Fetch each config (include name and active status only)
          const clients = [];
          for (const key of configKeys) {
            const config = await kvGet(key);
            if (config) {
              clients.push({
                clientId: config.clientId,
                name: config.name,
                active: config.active,
                created: config.created,
                updated: config.updated,
              });
            }
          }

          return jsonResponse({ clients, total: clients.length });
        }

        // === READ single ===
        if (!clientId) {
          return jsonResponse({ error: 'Client ID required' }, 400);
        }
        const config = await kvGet(`config:${clientId}`);
        if (!config) {
          return jsonResponse({ error: `Client ${clientId} not found` }, 404);
        }
        return jsonResponse({ config });
      }

      // === UPDATE (replace) ===
      case 'PUT': {
        if (!clientId) {
          return jsonResponse({ error: 'Client ID required' }, 400);
        }

        let updates;
        try {
          updates = await request.json();
        } catch {
          return jsonResponse({ error: 'Invalid JSON body' }, 400);
        }

        const existing = await kvGet(`config:${clientId}`);
        if (!existing) {
          return jsonResponse({ error: `Client ${clientId} not found. Use POST to create.` }, 404);
        }

        updates.clientId = clientId; // prevent clientId change
        updates.updated = new Date().toISOString();
        updates.created = existing.created;

        await kvSet(`config:${clientId}`, updates);

        return jsonResponse({ status: 'updated', clientId });
      }

      // === PARTIAL UPDATE (merge) ===
      case 'PATCH': {
        if (!clientId) {
          return jsonResponse({ error: 'Client ID required' }, 400);
        }

        let updates;
        try {
          updates = await request.json();
        } catch {
          return jsonResponse({ error: 'Invalid JSON body' }, 400);
        }

        const existing = await kvGet(`config:${clientId}`);
        if (!existing) {
          return jsonResponse({ error: `Client ${clientId} not found` }, 404);
        }

        // Merge: existing is base, updates override
        const merged = { ...existing, ...updates };
        merged.clientId = clientId; // immutable
        merged.updated = new Date().toISOString();

        await kvSet(`config:${clientId}`, merged);

        return jsonResponse({ status: 'patched', clientId });
      }

      // === DELETE (deactivate) ===
      case 'DELETE': {
        if (!clientId) {
          return jsonResponse({ error: 'Client ID required' }, 400);
        }

        const existing = await kvGet(`config:${clientId}`);
        if (!existing) {
          return jsonResponse({ error: `Client ${clientId} not found` }, 404);
        }

        // Soft delete: set active=false and add deactivated timestamp
        existing.active = false;
        existing.deactivated = new Date().toISOString();
        existing.updated = existing.deactivated;
        await kvSet(`config:${clientId}`, existing);

        return jsonResponse({ status: 'deactivated', clientId });
      }

      default:
        return jsonResponse({ error: `Method ${request.method} not allowed` }, 405);
    }
  } catch (err) {
    return jsonResponse({ error: `Admin error: ${err.message}` }, 500);
  }
}
