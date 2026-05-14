/**
 * Vercel Edge Function: /api/notify-status
 *
 * Diagnostic endpoint to verify notification configuration without triggering a real lead.
 * Checks RESEND_API_KEY presence and attempts a test email to the configured recipient.
 *
 * GET  /api/notify-status  → returns current config state (no email sent)
 * POST /api/notify-status  → sends a test email to verify the pipeline works
 *
 * Env vars:
 *   RESEND_API_KEY  — required for POST (test send)
 *   NOTIFY_EMAIL    — optional test recipient (default: hello@focusrunner.com)
 */

const DEFAULT_RECIPIENT = 'hello@focusrunner.com';
const FROM_EMAIL = 'FocusRunner Leads <leads@focusrunner.io>';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(),
  });
}

async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.NOTIFY_EMAIL || DEFAULT_RECIPIENT;

  if (request.method === 'GET') {
    return jsonResponse({
      resend_key: apiKey ? 'configured' : 'missing',
      resend_key_prefix: apiKey ? apiKey.slice(0, 8) + '...' : null,
      recipient,
      notification_email: process.env.NOTIFY_EMAIL || 'not set (using default)',
      classification_filter: ['hot', 'warm', 'qualified'],
      timestamp: new Date().toISOString(),
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!apiKey) {
    return jsonResponse({ error: 'RESEND_API_KEY not configured' }, 500);
  }

  // Send a test email
  const testLead = {
    name: 'Test Lead',
    phone: '+15551234567',
    email: 'test@example.com',
    practice: 'FocusRunner Test Practice',
    niche: 'Med Spa',
    volume: '15-30',
    qualification: {
      score: 85,
      classification: 'hot',
      summary: 'Test lead for notification pipeline verification',
    },
    source: 'notify_diagnostics',
  };

  const timestamp = new Date().toISOString();

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
        subject: `[TEST] Notification Pipeline — ${timestamp.slice(0, 19).replace('T', ' ')}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; }
  .container { max-width: 560px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .header { background: #059669; color: #ffffff; padding: 24px 32px; }
  .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
  .header p { margin: 4px 0 0; opacity: 0.7; font-size: 13px; }
  .body { padding: 24px 32px; }
  .field { margin-bottom: 16px; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: 600; margin-bottom: 2px; }
  .value { font-size: 15px; color: #111827; font-weight: 500; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; background: #dc2626; color: #ffffff; font-weight: 600; font-size: 13px; text-transform: uppercase; }
  .footer { padding: 16px 32px 24px; font-size: 11px; color: #9ca3af; text-align: center; }
</style></head>
<body>
  <div class="container">
    <div class="header">
      <h1>Test Notification</h1>
      <p>focusrunner.io &middot; Pipeline verification</p>
      <div class="badge">TEST</div>
    </div>
    <div class="body">
      <div class="field"><div class="label">Status</div><div class="value">Notification pipeline is working</div></div>
      <div class="field"><div class="label">Recipient</div><div class="value">${recipient}</div></div>
      <div class="field"><div class="label">Timestamp</div><div class="value">${timestamp}</div></div>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
      <p style="font-size: 13px; color: #6b7280;">
        This is an automated test from the FocusRunner notification pipeline diagnostic endpoint.
        Real lead notifications will include prospect name, practice, qualification score, and classification.
      </p>
    </div>
    <div class="footer">
      FocusRunner AI &middot; Patient acquisition for medical aesthetics
    </div>
  </div>
</body>
</html>`,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '(no body)');
      return jsonResponse({ error: `Resend API error ${res.status}: ${errText}` }, 502);
    }

    const data = await res.json();
    return jsonResponse({
      status: 'test_email_sent',
      email_id: data.id,
      recipient,
      timestamp,
    });
  } catch (err) {
    return jsonResponse({ error: `Failed to send test email: ${err.message}` }, 502);
  }
}

module.exports = handler;
