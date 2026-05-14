/**
 * Vercel Serverless Function: /api/leads
 *
 * Reads in-memory lead store. Returns JSON of captured leads.
 * No external dependencies — works without any API keys.
 *
 * GET  /api/leads[?status=unread&limit=50&offset=0]
 * POST /api/leads/mark-read  Body: { id, status? }
 * GET  /api/leads/export     → text/csv download
 */

import { listLeads, markRead, exportCsv } from './lib/notify.js';

// =============================================================================
// Auth
// =============================================================================

function isAuthenticated(request) {
  const authHeader = request.headers.get('authorization') || '';
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return true; // No key configured = open (dev mode)
  return authHeader === `Bearer ${adminKey}` || authHeader === `Bearer ${process.env.PAPERCLIP_API_KEY}`;
}

// =============================================================================
// CORS
// =============================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// =============================================================================
// Handler
// =============================================================================

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!isAuthenticated(request)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(request.url.startsWith('http') ? request.url : `https://focusrunner.io${request.url}`);
  const path = url.pathname.replace(/\/+$/, '');

  // GET /api/leads — list leads
  if (request.method === 'GET' && (path === '/api/leads' || path === '/api/leads/')) {
    const status = url.searchParams.get('status') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const queryOpts = {};
    if (status) queryOpts.status = status;

    return json(listLeads(limit, offset));
  }

  // GET /api/leads/export — CSV download
  if (request.method === 'GET' && path.endsWith('/export')) {
    const csv = exportCsv();
    return new Response(csv, {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="leads_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  // POST /api/leads/mark-read — mark lead status
  if (request.method === 'POST' && (path.endsWith('/mark-read') || path.endsWith('/read'))) {
    try {
      const body = await request.json();
      if (!body || !body.id) {
        return json({ error: 'id is required' }, 400);
      }
      const ok = markRead(body.id, body.status || 'read');
      return json({ success: ok, id: body.id });
    } catch (e) {
      return json({ error: 'Invalid JSON' }, 400);
    }
  }

  return json({ error: 'Not found' }, 404);
}
