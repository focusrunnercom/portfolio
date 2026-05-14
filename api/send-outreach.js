/**
 * Vercel Serverless Function: /api/send-outreach
 * 
 * CEO ORDER — Sends personalized outreach emails via Resend API
 * to the Miami med spa target list.
 * 
 * Env vars:
 *   RESEND_API_KEY  — required (set in Vercel production)
 * 
 * POST /api/send-outreach
 * Body: {
 *   target?: { name, email, practice },
 *   targets?: [...],
 *   dryRun?: boolean
 * }
 * 
 * Uses built-in https module — no external deps.
 */

var https = require('https');
var FROM_EMAIL = 'FocusRunner AI <hello@focusrunner.io>';
var DEFAULT_SUBJECT = 'Your free Patient Acquisition Audit — personalized for your med spa';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function personalIntroHtml(name, practice) {
  var n = escapeHtml(name);
  var p = escapeHtml(practice);
  return '<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"></head>\n<body style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a1a;">\n  <div style="border-bottom:3px solid #7c3aed;padding-bottom:15px;margin-bottom:20px;">\n    <h1 style="color:#7c3aed;margin:0;">FocusRunner AI</h1>\n    <p style="color:#666;margin:5px 0 0;">AI-Powered Patient Acquisition</p>\n  </div>\n  <p>Hi ' + n + ',</p>\n  <p>I run a team that builds AI patient acquisition systems for med spas. We help practices like <strong>' + p + '</strong> recover the 70% of leads that go cold within 24 hours.</p>\n  <p>Here\'s what we do:</p>\n  <ul>\n    <li><strong>24/7 AI Chatbot</strong> that qualifies leads while you sleep</li>\n    <li><strong>Automated follow-up</strong> — SMS + email sequences that warm cold leads</li>\n    <li><strong>Lead scoring</strong> so your front desk knows who to call first</li>\n    <li><strong>Booking integration</strong> — qualified leads book directly</li>\n  </ul>\n  <p>I\'d love to offer you a <strong>free Patient Acquisition Audit</strong> — we\'ll analyze your current lead flow and show you exactly where patients are falling through the cracks.</p>\n  <div style="text-align:center;margin:30px 0;">\n    <a href="https://focusrunner.io/lead-capture" style="background:#7c3aed;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;display:inline-block;">Claim Your Free Audit →</a>\n  </div>\n  <p>No catch. Just a data-backed audit of your acquisition pipeline.</p>\n  <p>— CEO, FocusRunner AI</p>\n  <div style="border-top:1px solid #e5e5e5;padding-top:15px;margin-top:20px;font-size:12px;color:#999;">\n    <p>FocusRunner AI · 15 qualified leads in 30 days or it\'s free</p>\n    <p><a href="https://focusrunner.io" style="color:#7c3aed;">focusrunner.io</a></p>\n  </div>\n</body>\n</html>';
}

function resendSend(apiKey, email, subject, html) {
  return new Promise(function(resolve, reject) {
    var data = JSON.stringify({
      from: FROM_EMAIL,
      to: [email],
      subject: subject,
      html: html,
    });
    var opts = {
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    var req = https.request(opts, function(res) {
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        var parsed;
        try { parsed = JSON.parse(body); } catch(e) { parsed = { raw: body }; }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: parsed });
      });
    });
    req.on('error', function(err) { reject(err); });
    req.write(data);
    req.end();
  });
}

module.exports = function handler(req, res) {
  var headers = corsHeaders();

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, headers);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  var apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.writeHead(500, headers);
    res.end(JSON.stringify({ error: 'RESEND_API_KEY not configured' }));
    return;
  }

  var body = '';
  req.on('data', function(chunk) { body += chunk; });
  req.on('end', function() {
    var parsed;
    try { parsed = JSON.parse(body); }
    catch(e) {
      res.writeHead(400, headers);
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }

    var dryRun = parsed.dryRun === true;
    var targets = parsed.targets || (parsed.target ? [parsed.target] : []);

    if (!targets.length) {
      res.writeHead(400, headers);
      res.end(JSON.stringify({ error: 'No targets provided. Send {target: {name, email, practice}} or {targets: [...]}' }));
      return;
    }

    var results = [];
    var pending = 0;
    var hasError = false;

    function finalize() {
      if (hasError) return;
      var sent = results.filter(function(r) { return r.status === 'sent'; }).length;
      var failed = results.filter(function(r) { return r.status === 'failed'; }).length;
      var skipped = results.filter(function(r) { return r.status === 'skipped'; }).length;
      var dryRunCount = results.filter(function(r) { return r.status === 'dry-run'; }).length;

      res.writeHead(200, headers);
      res.end(JSON.stringify({
        summary: { total: targets.length, sent: sent, failed: failed, skipped: skipped, dryRun: dryRunCount },
        results: results,
      }));
    }

    targets.forEach(function(t) {
      var name = t.name || 'Friend';
      var practice = t.practice || name;
      var email = t.email || '';

      if (!email || !email.includes('@')) {
        results.push({ name: name, email: email, status: 'skipped', reason: 'no valid email' });
        if (results.length === targets.length) finalize();
        return;
      }

      var html = personalIntroHtml(name, practice);
      var subject = t.subject || DEFAULT_SUBJECT;

      if (dryRun) {
        results.push({ name: name, email: email, practice: practice, status: 'dry-run' });
        if (results.length === targets.length) finalize();
        return;
      }

      pending++;

      resendSend(apiKey, email, subject, html)
        .then(function(result) {
          if (!result.ok) {
            results.push({ name: name, email: email, status: 'failed', error: 'Resend error ' + result.status, detail: result.data });
          } else {
            results.push({ name: name, email: email, status: 'sent', id: result.data.id });
          }
          pending--;
          if (pending === 0 && results.length === targets.length) finalize();
        })
        .catch(function(err) {
          results.push({ name: name, email: email, status: 'failed', error: err.message });
          pending--;
          if (pending === 0 && results.length === targets.length) finalize();
        });
    });
  });
};
