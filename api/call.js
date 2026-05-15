/**
 * Vercel Serverless Function: /api/call
 * POST -> Initiate a guided call workflow
 * GET  -> Health check
 *
 * CJS for Vercel Node 18.x Hobby compat.
 * Single-file — zero imports from lib/*.
 */

var https = require('https');
var fs = require('fs');

var HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function sendJson(res, data, status) {
  status = status || 200;
  res.writeHead(status, HEADERS);
  return res.end(JSON.stringify(data, null, 2));
}

/**
 * Available call scripts with descriptions.
 * Maps to files in /workspace/sales-scripts/.
 */
var SCRIPTS = [
  { key: 'cold-call',    name: 'Cold Call Script',         desc: 'General cold outreach to med spa owners' },
  { key: 'hot-leads',    name: 'Hot Lead Call Script',     desc: 'Call warm/hot leads who filled out form' },
  { key: 'discovery',    name: 'Discovery Call',           desc: '7-phase discovery call framework' },
  { key: 'objections',   name: 'Objection Playbook',       desc: '17 objection responses' },
  { key: 'close',        name: 'Free Audit Close',         desc: 'Closing angle for free audit leads' },
  { key: 'sarah',        name: 'Sarah Mitchell Close',     desc: 'Dedicated close strategy for hot_95' },
  { key: 'saturday-blitz',name: 'Saturday Blitz Sheet',   desc: '20-dial Saturday execution sheet' },
];

/**
 * Log a call outcome to /tmp/call-log.ndjson
 * (ephemeral on Vercel — survives within a deployment)
 */
function logCall(data) {
  var entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    lead: data.lead || 'unknown',
    phone: data.phone || 'unknown',
    script: data.script || 'unknown',
    outcome: data.outcome || 'unknown',
    notes: data.notes || '',
  });
  try {
    fs.appendFileSync('/tmp/call-log.ndjson', entry + '\n');
  } catch(e) {
    // /tmp may not be writable in some Vercel regions — silent fail
  }
}

function handlePost(req, res) {
  var body = '';
  req.on('data', function(chunk) { body += chunk; });
  req.on('end', function() {
    try {
      var data = JSON.parse(body);

      // If lead+phone+script provided, log the call
      if (data.lead && data.phone) {
        logCall(data);

        return sendJson(res, {
          success: true,
          instruction: 'Dial ' + data.phone + ' for ' + data.lead,
          script_key: data.script || 'none',
          logged: true,
          timestamp: new Date().toISOString(),
        });
      }

      // Return available scripts
      return sendJson(res, {
        success: true,
        scripts: SCRIPTS,
        usage: 'POST with { lead, phone, script, outcome?, notes? }',
      });
    } catch(e) {
      return sendJson(res, { error: 'Invalid JSON: ' + e.message }, 400);
    }
  });
}

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, HEADERS);
    return res.end();
  }

  if (req.method === 'GET') {
    return sendJson(res, {
      name: 'FocusRunner Call Dialer API',
      version: '1.0.0',
      scripts: SCRIPTS,
      usage: 'POST { lead, phone, script, outcome?, notes? }',
    });
  }

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  return sendJson(res, { error: 'Method not allowed' }, 405);
};
