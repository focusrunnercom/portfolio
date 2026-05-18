/**
 * Notification Library — email lead alerts via Resend API.
 *
 * Fire-and-forget: all errors are caught and logged, never throw.
 * Works on Vercel Edge Runtime (no NPM dependencies, pure fetch()).
 *
 * Env vars:
 *   RESEND_API_KEY  — required, Resend API key
 *   NOTIFY_EMAIL    — optional, recipient override (default: hello@focusrunner.com)
 */

const DEFAULT_RECIPIENT = 'hello@focusrunner.com';
const FROM_EMAIL = 'FocusRunner Leads <leads@focusrunner.io>';

/**
 * Send an email notification for a captured lead.
 *
 * @param {object} lead  — lead data from the webhook body
 * @param {object} [opts]
 * @param {string} [opts.recipient]  — email recipient override
 * @param {string} [opts.timestamp]  — ISO timestamp override (for testing)
 * @returns {Promise<object|null>} — Resend API response or null on failure
 */
async function notifyLead(lead, opts = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[notify] RESEND_API_KEY not set — skipping notification');
    return null;
  }

  const recipient = opts.recipient || process.env.NOTIFY_EMAIL || DEFAULT_RECIPIENT;
  const timestamp = opts.timestamp || new Date().toISOString();
  const classification = lead.qualification?.classification || 'unknown';
  const score = lead.qualification?.score ?? 0;
  const source = lead.source || 'chat_widget';

  const subject = `New Lead: ${lead.name || 'Anonymous'} — ${classification.toUpperCase()}`;

  // Build a clean, mobile-friendly HTML email
  const html = buildEmailHtml({
    name: lead.name || '—',
    phone: lead.phone || '—',
    email: lead.email || '—',
    practice: lead.practice || '—',
    niche: lead.niche || '—',
    volume: lead.volume || '—',
    classification,
    score,
    source,
    timestamp,
  });

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'FocusRunner/1.0',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: recipient,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '(no body)');
      console.error(`[notify] Resend error ${res.status}: ${errText}`);
      return null;
    }

    const data = await res.json();
    console.log(`[notify] Email sent: id=${data.id}`);
    return data;
  } catch (err) {
    console.error('[notify] Failed to send email:', err.message);
    return null;
  }
}

/**
 * Build a clean, mobile-friendly HTML email body.
 */
function buildEmailHtml(lead) {
  const badgeColor = {
    hot: '#dc2626',
    warm: '#ea580c',
    cold: '#2563eb',
  }[lead.classification.toLowerCase()] || '#6b7280';

  return `
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
      <p>focusrunner.io &middot; ${new Date(lead.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      <div class="badge" style="background: ${badgeColor};">${lead.classification.toUpperCase()}</div>
    </div>
    <div class="body">
      <div class="field">
        <div class="label">Name</div>
        <div class="value">${escapeHtml(lead.name)}</div>
      </div>
      <div class="field">
        <div class="label">Phone</div>
        <div class="value">${escapeHtml(lead.phone)}</div>
      </div>
      <div class="field">
        <div class="label">Email</div>
        <div class="value">${escapeHtml(lead.email)}</div>
      </div>
      <hr class="divider">
      <div class="field">
        <div class="label">Practice</div>
        <div class="value">${escapeHtml(lead.practice)}</div>
      </div>
      <div class="field">
        <div class="label">Niche</div>
        <div class="value">${escapeHtml(lead.niche)}</div>
      </div>
      <div class="field">
        <div class="label">Patient Volume</div>
        <div class="value">${escapeHtml(lead.volume)}</div>
      </div>
      <hr class="divider">
      <div class="field">
        <div class="label">Qualification Score</div>
        <div class="value">${lead.score}/10</div>
      </div>
      <div class="field">
        <div class="label">Source</div>
        <div class="value">${escapeHtml(lead.source)}</div>
      </div>
    </div>
    <div class="footer">
      FocusRunner AI &middot; Patient acquisition for medical aesthetics
    </div>
  </div>
</body>
</html>`.trim();
}

/**
 * Minimal HTML escaping for user-provided values.
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = { notifyLead };
