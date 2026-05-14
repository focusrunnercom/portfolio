/**
 * Vercel Serverless Function: /api/leads
 * GET — returns file-based lead storage content (newest first).
 * POST — purge/reset leads (requires admin auth).
 * CJS-style for Vercel Hobby Node 18.x compatibility.
 */

const { readLeads } = require('./lib/lead-store.js');
const { writeFileSync } = require('fs');

const STORAGE_PATH = '/tmp/leads.json';
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

module.exports = async function handler(req, res) {
  function json(data, status) {
    status = status || 200;
    res.writeHead(status, headers);
    res.end(JSON.stringify(data));
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    return res.end();
  }

  // Health check
  if (req.method === 'GET') {
    const leads = readLeads();
    leads.reverse(); // newest first

    const adminKey = process.env.ADMIN_API_KEY || '';
    const authHeader = (req.headers['authorization'] || '').trim();

    if (authHeader === 'Bearer ' + adminKey) {
      // Admin: full data
      return json({ leads: leads, count: leads.length });
    }

    // Public: clean summary (no internal fields)
    const summary = leads.map(function(l) {
      var q = l.qualification || {};
      return {
        id: l.id,
        name: l.name,
        phone: l.phone,
        email: l.email,
        practice: l.practice || '',
        classification: q.classification || 'unknown',
        score: q.score || 0,
        source: l.source,
        timestamp: l.timestamp,
      };
    });

    return json({ leads: summary, count: summary.length });
  }

  // Admin: purge all leads
  if (req.method === 'POST') {
    const adminKey = process.env.ADMIN_API_KEY || '';
    const authHeader = (req.headers['authorization'] || '').trim();

    if (authHeader !== 'Bearer ' + adminKey) {
      return json({ error: 'Unauthorized' }, 401);
    }

    writeFileSync(STORAGE_PATH, JSON.stringify({ leads: [] }), 'utf-8');
    return json({ success: true, message: 'Lead store purged' });
  }

  return json({ error: 'Method not allowed' }, 405);
};
