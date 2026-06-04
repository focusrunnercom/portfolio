/**
 * Vercel Serverless Function: /api/leads
 * GET  -> list leads (reverse chronological)
 * POST -> add a lead (Auth: Bearer ADMIN_API_KEY)
 * CJS for Vercel Node 18.x Hobby compat.
 */

var fs = require('fs');
var LEADS_PATH = '/tmp/leads.json';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Content-Type': 'application/json'
  };
}

function readLeads() {
  try {
    if (fs.existsSync(LEADS_PATH)) {
      var raw = fs.readFileSync(LEADS_PATH, 'utf-8');
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : (parsed.leads || []);
    }
  } catch (_) { /* corrupt file, start fresh */ }
  return [];
}

function writeLeads(leads) {
  fs.writeFileSync(LEADS_PATH, JSON.stringify({ leads: leads }));
}

function parseBody(req, cb) {
  var body = '';
  req.on('data', function(chunk) { body += chunk; if (body.length > 1e5) req.destroy(); });
  req.on('end', function() {
    try { cb(null, JSON.parse(body)); }
    catch (e) { cb(null, {}); }
  });
  req.on('error', function(e) { cb(e); });
}

var ADMIN_KEY = process.env.ADMIN_API_KEY || '';

module.exports = function handler(req, res) {
  var H = corsHeaders();

  if (req.method === 'OPTIONS') {
    res.writeHead(204, H);
    return res.end();
  }

  // GET — list all leads
  if (req.method === 'GET') {
    var leads = readLeads();
    var sorted = leads.slice().reverse();
    res.writeHead(200, H);
    return res.end(JSON.stringify({ leads: sorted, count: sorted.length }));
  }

  // POST — add a new lead
  if (req.method === 'POST') {
    var auth = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    if (ADMIN_KEY && auth !== ADMIN_KEY) {
      res.writeHead(401, H);
      return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    parseBody(req, function(err, body) {
      if (err) {
        res.writeHead(400, H);
        return res.end(JSON.stringify({ error: 'Invalid body' }));
      }

      var leads = readLeads();
      var lead = {
        name: body.name || 'Anonymous',
        email: body.email || '',
        phone: body.phone || '',
        source: body.source || 'api',
        message: body.message || '',
        qualification: body.qualification || { classification: 'unqualified', score: 0 },
        createdAt: new Date().toISOString(),
        id: 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
      };

      // Merge any extra fields from the client
      Object.keys(body).forEach(function(k) {
        if (!lead.hasOwnProperty(k)) lead[k] = body[k];
      });

      leads.push(lead);
      writeLeads(leads);

      res.writeHead(201, H);
      return res.end(JSON.stringify({ success: true, lead: lead, total: leads.length }));
    });
    return;
  }

  res.writeHead(405, H);
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};
