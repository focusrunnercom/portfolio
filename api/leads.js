/**
 * Vercel Serverless Function: /api/leads
 * GET  -> list leads (reverse chronological)
 * POST -> add a lead with validation (Auth: Bearer ADMIN_API_KEY)
 * CJS for Vercel Node 18.x Hobby compat.
 */

var fs = require('fs');
var { rateLimit, requireAuth, corsHeaders } = require('./_middleware');
var LEADS_PATH = '/tmp/leads.json';

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

var ADMIN_KEY = process.env.ADMIN_API_KEY || '';

module.exports = function handler(req, res) {
  if (!rateLimit(req, res)) return;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  // GET — list all leads
  if (req.method === 'GET') {
    var leads = readLeads();
    var sorted = leads.slice().reverse();
    res.writeHead(200, corsHeaders());
    return res.end(JSON.stringify({ leads: sorted, count: sorted.length }));
  }

  // POST — add a new lead with validation
  if (req.method === 'POST') {
    if (!requireAuth(req, res)) return;

    var body = '';
    req.on('data', function(chunk) { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', function() {
      // Parse JSON body
      try { var data = JSON.parse(body); }
      catch (e) {
        res.writeHead(400, corsHeaders());
        return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }

      // Required field validation: name, email, phone, clinic_name
      var required = ['name', 'email', 'phone', 'clinic_name'];
      var missing = [];
      for (var i = 0; i < required.length; i++) {
        var field = required[i];
        if (!data[field] || (typeof data[field] === 'string' && !data[field].trim())) {
          missing.push(field);
        }
      }
      if (missing.length > 0) {
        res.writeHead(400, corsHeaders());
        return res.end(JSON.stringify({
          error: 'Missing required fields',
          fields: missing
        }));
      }

      // Email format validation
      var email = data.email.trim();
      if (email.indexOf('@') === -1 || email.indexOf('.', email.indexOf('@')) === -1) {
        res.writeHead(400, corsHeaders());
        return res.end(JSON.stringify({ error: 'Invalid email format' }));
      }

      // Phone basic validation (digits, spaces, dashes, parens, plus; 7-20 chars)
      var phone = data.phone.trim();
      if (!/^[\d\s\-\+\(\)]{7,20}$/.test(phone)) {
        res.writeHead(400, corsHeaders());
        return res.end(JSON.stringify({ error: 'Invalid phone format' }));
      }

      var leads = readLeads();
      var lead = {
        name: data.name.trim(),
        email: email,
        phone: phone,
        clinic_name: data.clinic_name.trim(),
        source: data.source || 'api',
        message: data.message || '',
        qualification: data.qualification || { classification: 'unqualified', score: 0 },
        createdAt: new Date().toISOString(),
        id: 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
      };

      // Merge any extra fields from the client (not overwriting core fields)
      Object.keys(data).forEach(function(k) {
        if (!lead.hasOwnProperty(k)) lead[k] = data[k];
      });

      leads.push(lead);
      writeLeads(leads);

      res.writeHead(201, corsHeaders());
      return res.end(JSON.stringify({ success: true, lead: lead, total: leads.length }));
    });
    req.on('error', function() {
      res.writeHead(400, corsHeaders());
      return res.end(JSON.stringify({ error: 'Invalid body' }));
    });
    return;
  }

  res.writeHead(405, corsHeaders());
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};
