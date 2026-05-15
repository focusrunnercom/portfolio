/**
 * Vercel Serverless Function: /api/call-log
 * GET  -> Return call log (from in-memory store)
 * POST -> Query call log by lead name or date
 *
 * CJS for Vercel Node 18.x Hobby compat.
 * Single-file — zero imports from lib/*.
 */

var fs = require('fs');

var HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function sendJson(res, data, status) {
  status = status || 200;
  res.writeHead(status, HEADERS);
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

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, HEADERS);
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
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        var data = JSON.parse(body);
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
    });
    return;
  }

  return sendJson(res, { error: 'Method not allowed' }, 405);
};
