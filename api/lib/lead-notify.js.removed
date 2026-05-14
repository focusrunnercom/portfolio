/**
 * Lead Notification Library — email lead alerts via Resend API.
 * CJS-style for Vercel Hobby Node 18.x compatibility.
 *
 * Fire-and-forget: all errors are caught and logged, never throw.
 *
 * Env vars:
 *   RESEND_API_KEY  — required, Resend API key
 *   NOTIFY_EMAIL    — optional, recipient override (default: hello@focusrunner.com)
 */

const DEFAULT_RECIPIENT = 'hello@focusrunner.com';
const FROM_EMAIL = 'FocusRunner Leads <leads@focusrunner.io>';

async function notifyLead(lead, opts) {
  opts = opts || {};
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[lead-notify] RESEND_API_KEY not set \u2014 skipping notification');
    return null;
  }

  const recipient = opts.recipient || process.env.NOTIFY_EMAIL || DEFAULT_RECIPIENT;
  const timestamp = opts.timestamp || new Date().toISOString();

  const name = (lead && lead.name) || 'Unknown';
  const phone = (lead && lead.phone) || '';
  const email = (lead && lead.email) || '';
  const practice = (lead && (lead.practice || lead.spa_name)) || '';
  const classification = (lead && lead.qualification && lead.qualification.classification) || 'unknown';
  const score = (lead && lead.qualification && lead.qualification.score) || 0;

  const badgeColor = { hot: '#dc2626', warm: '#ea580c', cold: '#2563eb', qualified: '#16a34a', nurture: '#ca8a04', not_a_fit: '#6b7280' }[classification.toLowerCase()] || '#6b7280';

  function esc(s) {
    if (typeof s !== 'string') return String(s || '');
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const html = [
    '<div style="font-family:sans-serif;max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden">',
    '<div style="background:#0f172a;color:#fff;padding:24px 32px">',
    '<h1 style="margin:0;font-size:20px">New Lead</h1>',
    '<p style="opacity:.7;margin:4px 0 0">' + new Date(timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</p>',
    '<div style="display:inline-block;padding:4px 12px;border-radius:20px;color:#fff;background:' + badgeColor + ';font-weight:600;font-size:13px;margin-top:8px">' + classification.toUpperCase() + ' &middot; ' + score + '/100</div>',
    '</div>',
    '<div style="padding:24px 32px">',
    '<div style="margin-bottom:16px"><div style="font-size:11px;color:#6b7280;font-weight:600">Name</div><div>' + esc(name) + '</div></div>',
    (phone ? '<div style="margin-bottom:16px"><div style="font-size:11px;color:#6b7280;font-weight:600">Phone</div><div>' + esc(phone) + '</div></div>' : ''),
    (email ? '<div style="margin-bottom:16px"><div style="font-size:11px;color:#6b7280;font-weight:600">Email</div><div>' + esc(email) + '</div></div>' : ''),
    (practice ? '<div style="margin-bottom:16px"><div style="font-size:11px;color:#6b7280;font-weight:600">Practice</div><div>' + esc(practice) + '</div></div>' : ''),
    '</div>',
    '<div style="padding:16px 32px 24px;font-size:11px;color:#9ca3af;text-align:center">FocusRunner AI</div>',
    '</div>',
  ].join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: recipient,
        subject: 'New Lead: ' + esc(name) + ' \u2014 ' + classification.toUpperCase(),
        html: html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(function() { return '(no body)'; });
      console.error('[lead-notify] Resend error ' + res.status + ': ' + errText);
      return null;
    }

    const data = await res.json();
    console.log('[lead-notify] Email sent: id=' + data.id);
    return data;
  } catch (err) {
    console.error('[lead-notify] Failed to send email:', err.message);
    return null;
  }
}

module.exports = { notifyLead: notifyLead };
