/**
 * Vercel Edge Function: /api/lead-notify
 * Standalone lead notification endpoint — accepts POST with lead data,
 * sends email alert via Resend, returns 200 OK.
 *
 * No local ESM imports — fully self-contained for Vercel Edge Runtime.
 * Pure fetch() — no NPM dependencies.
 *
 * Env vars:
 *   RESEND_API_KEY  — required, Resend API key
 *   NOTIFY_EMAIL    — optional, recipient override (default: hello@focusrunner.com)
 */

const config = {
  runtime: 'edge',
};

const DEFAULT_RECIPIENT = 'hello@focusrunner.com';
const FROM_EMAIL = 'FocusRunner Leads <leads@focusrunner.io>';

async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const lead = body.lead || body;
  const recipient = body.recipient || process.env.NOTIFY_EMAIL || DEFAULT_RECIPIENT;

  // Validate: we need at least a name or phone
  if (!lead.name && !lead.phone) {
    return new Response(JSON.stringify({ error: 'At least lead.name or lead.phone required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Check Resend API key
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Build notification data
  const classification = lead.qualification?.classification || 'unknown';
  const score = lead.qualification?.score ?? 0;
  const source = lead.source || 'api_direct';

  const subject = `New Lead: ${lead.name || 'Anonymous'} — ${classification.toUpperCase()}`;

  // Build email HTML
  const badgeColor = {
    hot: '#dc2626',
    warm: '#ea580c',
    cold: '#2563eb',
  }[classification.toLowerCase()] || '#6b7280';

  const timestamp = new Date().toISOString();
  const displayTime = new Date(timestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; }
    .container { max-width: 560px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { background: #0f172a; color: #ffffff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 4px 0 0; opacity: 0.7; font-size: 13px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; color: #ffffff; font-weight: 600; font-size: 13px; text-transform: uppercase; margin-top: 8px; }
    .body { padding: 24px 32px; }
    .field { margin-bottom: 16px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: 600; margin-bottom: 2px; }
    .value { font-size: 15px; color: #111827; font-weight: 500; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
    .footer { padding: 16px 32px 24px; font-size: 11px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Lead Captured</h1>
      <p>focusrunner.io &middot; ${displayTime}</p>
      <div class="badge" style="background: ${badgeColor};">${classification.toUpperCase()}</div>
    </div>
    <div class="body">
      <div class="field">
        <div class="label">Name</div>
        <div class="value">${escapeHtml(lead.name || '—')}</div>
      </div>
      <div class="field">
        <div class="label">Phone</div>
        <div class="value">${escapeHtml(lead.phone || '—')}</div>
      </div>
      <div class="field">
        <div class="label">Email</div>
        <div class="value">${escapeHtml(lead.email || '—')}</div>
      </div>
      <hr class="divider">
      <div class="field">
        <div class="label">Practice</div>
        <div class="value">${escapeHtml(lead.practice || '—')}</div>
      </div>
      <div class="field">
        <div class="label">Niche</div>
        <div class="value">${escapeHtml(lead.niche || '—')}</div>
      </div>
      <div class="field">
        <div class="label">Patient Volume</div>
        <div class="value">${escapeHtml(lead.volume || '—')}</div>
      </div>
      <hr class="divider">
      <div class="field">
        <div class="label">Qualification Score</div>
        <div class="value">${score}/10</div>
      </div>
      <div class="field">
        <div class="label">Source</div>
        <div class="value">${escapeHtml(source)}</div>
      </div>
    </div>
    <div class="footer">
      FocusRunner AI &middot; Patient acquisition for medical aesthetics
    </div>
  </div>
</body>
</html>`.trim();

  // Send via Resend API
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: recipient,
        subject,
        html,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return new Response(JSON.stringify({
        error: `Resend error ${res.status}`,
        detail: data,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    return new Response(JSON.stringify({
      status: 'sent',
      lead: lead.name || 'anonymous',
      email_id: data.id,
      recipient,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: `Notification failed: ${err.message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

module.exports = handler;
module.exports.config = config;

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
