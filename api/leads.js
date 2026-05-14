/**
 * Vercel Serverless Function: /api/leads
 * GET — returns file-based lead storage content (newest first).
 * POST — purge/reset leads (requires admin auth).
 *
 * This is the visibility layer for the file-based fallback (FOC-238).
 * Works immediately with no external API keys.
 */
import { readLeads } from './lib/lead-store.js';
import { writeFileSync } from 'fs';

const STORAGE_PATH = '/tmp/leads.json';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export default async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  // Health check
  if (request.method === 'GET') {
    const leads = readLeads();
    // Newest first
    leads.reverse();

    const adminKey = process.env.ADMIN_API_KEY || '';
    const authHeader = request.headers.get('authorization') || '';

    if (authHeader === `Bearer ${adminKey}`) {
      // Admin: full data
      return new Response(JSON.stringify({ leads, count: leads.length }), {
        status: 200,
        headers,
      });
    }

    // Public: clean summary (no internal fields)
    const summary = leads.map(l => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      practice: l.practice || '',
      classification: l.qualification?.classification || 'unknown',
      score: l.qualification?.score || 0,
      source: l.source,
      timestamp: l.timestamp,
    }));

    return new Response(JSON.stringify({ leads: summary, count: summary.length }), {
      status: 200,
      headers,
    });
  }

  // Admin: purge all leads
  if (request.method === 'POST') {
    const adminKey = process.env.ADMIN_API_KEY || '';
    const authHeader = request.headers.get('authorization') || '';

    if (authHeader !== `Bearer ${adminKey}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers,
      });
    }

    const { writeFileSync } = await import('fs');
    writeFileSync('/tmp/leads.json', JSON.stringify({ leads: [] }), 'utf-8');
    return new Response(JSON.stringify({ success: true, message: 'Lead store purged' }), {
      status: 200,
      headers,
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers,
  });
}
