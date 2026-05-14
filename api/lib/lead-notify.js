     1|/**
     2| * Lead Notification Library — email lead alerts via Resend API.
     3| *
     4| * Fire-and-forget: all errors are caught and logged, never throw.
     5| * Works on Vercel Edge Runtime (no NPM dependencies, pure fetch()).
     6| *
     7| * Env vars:
     8| *   RESEND_API_KEY  — required, Resend API key
     9| *   NOTIFY_EMAIL    — optional, recipient override (default: hello@focusrunner.com)
    10| */
    11|
    12|const DEFAULT_RECIPIENT = 'hello@focusrunner.com';
    13|const FROM_EMAIL = 'FocusRunner Leads <leads@focusrunner.io>';
    14|
    15|/**
    16| * Send an email notification for a captured lead.
    17| * Respects classification filter — only sends for allowed classifications.
    18| *
    19| * @param {object} lead  — lead data { name, phone, email, practice, niche, volume, qualification, source }
    20| * @param {object} [opts]
    21| * @param {string} [opts.recipient]  — email recipient override
    22| * @param {string} [opts.timestamp]  — ISO timestamp override (for testing)
    23| * @param {string[]} [opts.onClassification]  — only send if lead.classification is in this list (default: ['hot', 'warm', 'qualified'])
    24| * @returns {Promise<object|null>} — Resend API response or null on failure/skip
    25| */
    26|async function notifyLead(lead, opts) {
    27|  const apiKey = process.env.RESEND_API_KEY;
    28|  if (!apiKey) {
    29|    console.warn('[lead-notify] RESEND_API_KEY not set — skipping notification');
    30|    return null;
    31|  }
    32|
    33|  const classification = (lead.qualification?.classification || 'unknown').toLowerCase();
    34|  const allowedClasses = opts.onClassification || ['hot', 'warm', 'qualified'];
    35|
    36|  // Classification filter: skip cold/unqualified leads
    37|  if (!allowedClasses.includes(classification)) {
    38|    console.log(`[lead-notify] Skipping email for classification "${classification}" (allowed: ${allowedClasses.join(', ')})`);
    39|    return null;
    40|  }
    41|
    42|  const recipient = opts.recipient || process.env.NOTIFY_EMAIL || DEFAULT_RECIPIENT;
    43|  const timestamp = opts.timestamp || new Date().toISOString();
    44|  const score = lead.qualification?.score ?? 0;
    45|  const source = lead.source || 'chat_widget';
    46|
    47|  const subject = `New Lead: ${lead.name || 'Anonymous'} — ${classification.toUpperCase()}`;
    48|
    49|  const html = buildEmailHtml({
    50|    name: lead.name || '—',
    51|    phone: lead.phone || '—',
    52|    email: lead.email || '—',
    53|    practice: lead.practice || '—',
    54|    niche: lead.niche || '—',
    55|    volume: lead.volume || '—',
    56|    classification,
    57|    score,
    58|    source,
    59|    timestamp,
    60|  });
    61|
    62|  try {
    63|    const res = await fetch('https://api.resend.com/emails', {
    64|      method: 'POST',
    65|      headers: {
    66|        'Authorization': `Bearer ${apiKey}`,
    67|        'Content-Type': 'application/json',
    68|      },
    69|      body: JSON.stringify({
    70|        from: FROM_EMAIL,
    71|        to: recipient,
    72|        subject,
    73|        html,
    74|      }),
    75|    });
    76|
    77|    if (!res.ok) {
    78|      const errText = await res.text().catch(() => '(no body)');
    79|      console.error(`[lead-notify] Resend error ${res.status}: ${errText}`);
    80|      return null;
    81|    }
    82|
    83|    const data = await res.json();
    84|    console.log(`[lead-notify] Email sent: id=${data.id} to=${recipient} subject="${subject}"`);
    85|    return data;
    86|  } catch (err) {
    87|    console.error('[lead-notify] Failed to send email:', err.message);
    88|    return null;
    89|  }
    90|}
    91|
    92|/**
    93| * Build a clean, mobile-friendly HTML email body.
    94| */
    95|function buildEmailHtml(lead) {
    96|  const badgeColor = {
    97|    hot: '#dc2626',
    98|    warm: '#ea580c',
    99|    cold: '#2563eb',
   100|  }[lead.classification.toLowerCase()] || '#6b7280';
   101|
   102|  return `
   103|<!DOCTYPE html>
   104|<html>
   105|<head>
   106|  <meta charset="utf-8">
   107|  <meta name="viewport" content="width=device-width, initial-scale=1.0">
   108|  <style>
   109|    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; }
   110|    .container { max-width: 560px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
   111|    .header { background: #0f172a; color: #ffffff; padding: 24px 32px; }
   112|    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
   113|    .header p { margin: 4px 0 0; opacity: 0.7; font-size: 13px; }
   114|    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; color: #ffffff; font-weight: 600; font-size: 13px; text-transform: uppercase; margin-top: 8px; }
   115|    .body { padding: 24px 32px; }
   116|    .field { margin-bottom: 16px; }
   117|    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: 600; margin-bottom: 2px; }
   118|    .value { font-size: 15px; color: #111827; font-weight: 500; }
   119|    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
   120|    .footer { padding: 16px 32px 24px; font-size: 11px; color: #9ca3af; text-align: center; }
   121|  </style>
   122|</head>
   123|<body>
   124|  <div class="container">
   125|    <div class="header">
   126|      <h1>New Lead Captured</h1>
   127|      <p>focusrunner.io &middot; ${new Date(lead.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
   128|      <div class="badge" style="background: ${badgeColor};">${lead.classification.toUpperCase()}</div>
   129|    </div>
   130|    <div class="body">
   131|      <div class="field">
   132|        <div class="label">Name</div>
   133|        <div class="value">${escapeHtml(lead.name)}</div>
   134|      </div>
   135|      <div class="field">
   136|        <div class="label">Phone</div>
   137|        <div class="value">${escapeHtml(lead.phone)}</div>
   138|      </div>
   139|      <div class="field">
   140|        <div class="label">Email</div>
   141|        <div class="value">${escapeHtml(lead.email)}</div>
   142|      </div>
   143|      <hr class="divider">
   144|      <div class="field">
   145|        <div class="label">Practice</div>
   146|        <div class="value">${escapeHtml(lead.practice)}</div>
   147|      </div>
   148|      <div class="field">
   149|        <div class="label">Niche</div>
   150|        <div class="value">${escapeHtml(lead.niche)}</div>
   151|      </div>
   152|      <div class="field">
   153|        <div class="label">Patient Volume</div>
   154|        <div class="value">${escapeHtml(lead.volume)}</div>
   155|      </div>
   156|      <hr class="divider">
   157|      <div class="field">
   158|        <div class="label">Qualification Score</div>
   159|        <div class="value">${lead.score}/10</div>
   160|      </div>
   161|      <div class="field">
   162|        <div class="label">Source</div>
   163|        <div class="value">${escapeHtml(lead.source)}</div>
   164|      </div>
   165|    </div>
   166|    <div class="footer">
   167|      FocusRunner AI &middot; Patient acquisition for medical aesthetics
   168|    </div>
   169|  </div>
   170|</body>
   171|</html>`.trim();
   172|}
   173|
   174|/**
   175| * Minimal HTML escaping for user-provided values.
   176| */
   177|function escapeHtml(str) {
   178|  if (typeof str !== 'string') return String(str || '');
   179|  return str
   180|    .replace(/&/g, '&amp;')
   181|    .replace(/</g, '&lt;')
   182|    .replace(/>/g, '&gt;')
   183|    .replace(/"/g, '&quot;')
   184|    .replace(/'/g, '&#039;');
   185|}
   186|
   187|
   188|
module.exports = { notifyLead: notifyLead };
