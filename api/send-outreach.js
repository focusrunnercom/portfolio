/**
 * Vercel Serverless Function: /api/send-outreach
 * 
 * CEO ORDER — Sends personalized outreach emails via Resend API
 * to the Miami med spa target list.
 * 
 * Env vars:
 *   RESEND_API_KEY  — required (already set in production)
 * 
 * POST /api/send-outreach
 * Body: {
 *   target?: { name, email, practice },   // single target
 *   targets?: [...],                       // batch
 *   dryRun?: boolean                      // preview only
 * }
 */

const FROM_EMAIL = 'FocusRunner AI <hello@focusrunner.io>';
const DEFAULT_SUBJECT = 'Your free Patient Acquisition Audit — personalized for your med spa';

function parseBody(req) {
  return new Promise(function(resolve, reject) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', function() {
      try { resolve(JSON.parse(body)); }
      catch(e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function personalIntroHtml(name, practice) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a1a;">
  <div style="border-bottom:3px solid #7c3aed;padding-bottom:15px;margin-bottom:20px;">
    <h1 style="color:#7c3aed;margin:0;">FocusRunner AI</h1>
    <p style="color:#666;margin:5px 0 0;">AI-Powered Patient Acquisition</p>
  </div>
  <p>Hi ${escapeHtml(name)},</p>
  <p>I run a team that builds AI patient acquisition systems for med spas. We help practices like <strong>${escapeHtml(practice)}</strong> recover the 70% of leads that go cold within 24 hours.</p>
  <p>Here's what we do:</p>
  <ul>
    <li><strong>24/7 AI Chatbot</strong> that qualifies leads while you sleep</li>
    <li><strong>Automated follow-up</strong> — SMS + email sequences that warm cold leads</li>
    <li><strong>Lead scoring</strong> so your front desk knows who to call first</li>
    <li><strong>Booking integration</strong> — qualified leads book directly</li>
  </ul>
  <p>I'd love to offer you a <strong>free Patient Acquisition Audit</strong> — we'll analyze your current lead flow and show you exactly where patients are falling through the cracks.</p>
  <div style="text-align:center;margin:30px 0;">
    <a href="https://focusrunner.io/lead-capture" style="background:#7c3aed;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;display:inline-block;">Claim Your Free Audit →</a>
  </div>
  <p>No catch. Just a data-backed audit of your acquisition pipeline.</p>
  <p>— CEO, FocusRunner AI</p>
  <div style="border-top:1px solid #e5e5e5;padding-top:15px;margin-top:20px;font-size:12px;color:#999;">
    <p>FocusRunner AI · 15 qualified leads in 30 days or it's free</p>
    <p><a href="https://focusrunner.io" style="color:#7c3aed;">focusrunner.io</a></p>
  </div>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders());
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, corsHeaders());
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.writeHead(500, corsHeaders());
    res.end(JSON.stringify({ error: 'RESEND_API_KEY not configured' }));
    return;
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    res.writeHead(400, corsHeaders());
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const dryRun = body.dryRun === true;
  const targets = body.targets || (body.target ? [body.target] : []);
  
  if (!targets.length) {
    res.writeHead(400, corsHeaders());
    res.end(JSON.stringify({ error: 'No targets provided. Send {target: {name, email, practice}} or {targets: [...]}' }));
    return;
  }

  const results = [];

  for (const t of targets) {
    const name = t.name || 'Friend';
    const practice = t.practice || name;
    const email = t.email || '';
    
    if (!email || !email.includes('@')) {
      results.push({ name, email, status: 'skipped', reason: 'no valid email' });
      continue;
    }

    const html = personalIntroHtml(name, practice);
    const subject = t.subject || DEFAULT_SUBJECT;

    if (dryRun) {
      results.push({ name, email, practice, status: 'dry-run' });
      continue;
    }

    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [email],
          subject,
          html,
        }),
      });

      const data = await resendRes.json().catch(() => ({}));

      if (!resendRes.ok) {
        results.push({ name, email, status: 'failed', error: `Resend error ${resendRes.status}`, detail: data });
      } else {
        results.push({ name, email, status: 'sent', id: data.id });
      }
    } catch (err) {
      results.push({ name, email, status: 'failed', error: err.message });
    }
  }

  const sent = results.filter(r => r.status === 'sent').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const dryRunCount = results.filter(r => r.status === 'dry-run').length;

  res.writeHead(200, corsHeaders());
  res.end(JSON.stringify({
    summary: { total: targets.length, sent, failed, skipped, dryRun: dryRunCount },
    results,
  }));
};

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
