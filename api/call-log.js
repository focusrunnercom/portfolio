/**
 * Vercel Serverless Function: /api/call-log
 * GET  -> Return call log (from in-memory store)
 * POST -> Query call log by lead name or date
 *
 * CJS for Vercel Node 18.x Hobby compat.
 * Single-file — zero imports from lib/*.
 */

var fs = require('fs');
var { rateLimit, corsHeaders, parseBody } = require('./_middleware');

function sendJson(res, data, status) {
  status = status || 200;
  res.writeHead(status, corsHeaders());
  return res.end(JSON.stringify(data, null, 2));
}

function readLog() {
  try {
    var raw = fs.readFileSync('/tmp/call-log.ndjson', 'utf-8');
    return raw.trim().split('\n').filter(Boolean).map(function(line) {
      try { return JSON.parse(line); } catch(e) { return null; }
    }).filter(Boolean);
  } catch(e) {
    return [];
  }
}

module.exports = async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  if (req.method === 'GET') {
    var entries = readLog();
    return sendJson(res, {
      count: entries.length,
      entries: entries.reverse(), // newest first
    });
  }

  if (req.method === 'POST') {
    parseBody(req).then(function(data) {
      try {
        var entries = readLog();

        // Filter by lead name
        if (data.lead) {
          entries = entries.filter(function(e) {
            return e.lead && e.lead.toLowerCase().includes(data.lead.toLowerCase());
          });
        }

        // Filter by outcome
        if (data.outcome) {
          entries = entries.filter(function(e) {
            return e.outcome === data.outcome;
          });
        }

        return sendJson(res, {
          count: entries.length,
          entries: entries.reverse(),
        });
      } catch(e) {
        return sendJson(res, { error: 'Invalid JSON: ' + e.message }, 400);
      }
    }).catch(function() {
      return sendJson(res, { error: 'Invalid JSON body' }, 400);
    });
    return;
  }

  return sendJson(res, { error: 'Method not allowed' }, 405);
};
