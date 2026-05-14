/**
 * Vercel Edge Function: /api/webhook
 * Multi-tenant lead forwarding to per-client GoHighLevel CRM.
 *
 * Input:  POST { name, phone, email, practice, niche, volume, qualification, source }
 *         Header: X-Client-Id (optional — defaults to 'client_default')
 *
 * SELF-CONTAINED: All KV, analytics, and notification logic is inlined.
 * No external file imports (Vercel Edge Function safe).
 */

// =============================================================================
// KV Client — inlined from kv.js
// =============================================================================

const PREFIX_CLIENT = 'client:';
const PREFIX_ANALYTICS = 'analytics:';
const PREFIX_LEADS = 'leads:';
const PREFIX_COUNTERS = 'counters:';

async function tryKV() {
  try {
    const { kv } = await import('@vercel/kv');
    return {
      kvGet: async (key) => kv.get(key),
      kvSet: async (key, value) => kv.set(key, typeof value === 'string' ? value : JSON.stringify(value)),
      kvDel: async (key) => kv.del(key),
      kvLpush: async (key, value) => kv.lpush(key, typeof value === 'string' ? value : JSON.stringify(value)),
      kvIncr: async (key) => kv.incr(key),
      kvLrange: async (key, start, stop) => kv.lrange(key, start, stop),
      kvLlen: async (key) => kv.llen(key),
    };
  } catch (e) {
    throw new Error('KV not available: ' + e.message);
  }
}

let kvInstance = null;

async function getKV() {
  if (!kvInstance) {
    kvInstance = await tryKV();
  }
  return kvInstance;
}

async function kvGet(key) {
  const k = await getKV();
  return k.kvGet(key);
}

async function kvSet(key, value) {
  const k = await getKV();
  return k.kvSet(key, value);
}

async function kvDel(key) {
  const k = await getKV();
  return k.kvDel(key);
}

async function kvLpush(key, value) {
  const k = await getKV();
  return k.kvLpush(key, value);
}

async function kvIncr(key) {
  const k = await getKV();
  return k.kvIncr(key);
}

async function kvLrange(key, start = 0, stop = -1) {
  const k = await getKV();
  return k.kvLrange(key, start, stop);
}

async function kvLlen(key) {
  const k = await getKV();
  return k.kvLlen(key);
}

function resolveClientId(request) {
  const clientId = request.headers.get('X-Client-Id') || 'client_default';
  return { clientId };
}

async function resolveClient(request) {
  const { clientId } = resolveClientId(request);

  try {
    const config = await kvGet(`${PREFIX_CLIENT}${clientId}`);
    if (config) {
      return { config: typeof config === 'string' ? JSON.parse(config) : config, clientId, fromKV: true };
    }
  } catch (e) {
    // KV not available — fall through to env var defaults
  }

  return {
    config: {
      active: true,
      name: 'Default Client',
      crm: {
        webhook_url: process.env.GHL_WEBHOOK_URL || '',
        api_key: process.env.GHL_API_KEY || '',
        custom_fields_map: {},
      },
      booking_url: process.env.BOOKING_URL || 'https://focusrunner.io',
    },
    clientId,
    fromKV: false,
  };
}

// =============================================================================
// Analytics Library — inlined from lib/analytics-lib.js
// =============================================================================

async function logAnalyticsEvent(clientId, event) {
  if (!clientId) return;

  const timestamp = new Date().toISOString();
  const dateKey = timestamp.slice(0, 10).replace(/-/g, '');
  const eventKey = `analytics:${clientId}:events`;
  const dailyPrefix = `analytics:${clientId}:daily:${dateKey}`;

  const enriched = {
    ...event,
    clientId,
    timestamp,
  };

  await kvLpush(eventKey, enriched).catch(() => {});

  const type = event.type || 'unknown';
  await kvIncr(`${dailyPrefix}:total`).catch(() => {});
  await kvIncr(`${dailyPrefix}:${type}`).catch(() => {});

  if (type === 'lead_captured' && event.qualification) {
    const cls = event.qualification.classification || 'unknown';
    await kvIncr(`${dailyPrefix}:classification:${cls}`).catch(() => {});
  }

  if (type === 'lead_submitted' && event.source) {
    const source = event.source.replace(/[^a-zA-Z0-9_-]/g, '_');
    await kvIncr(`${dailyPrefix}:source:${source}`).catch(() => {});
  }
}

// =============================================================================
// Notification Library — inlined from lib/notify.js
// =============================================================================

const DEFAULT_RECIPIENT = 'hello@focusrunner.com';
const FROM_EMAIL = 'FocusRunner Leads <leads@focusrunner.io>';

async function notifyLead(lead, opts = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[webhook] RESEND_API_KEY not set — skipping notification');
    return null;
  }

  const recipient = opts.recipient || process.env.NOTIFY_EMAIL || DEFAULT_RECIPIENT;
  const timestamp = opts.timestamp || new Date().toISOString();
  const classification = lead.qualification?.classification || 'unknown';
  const score = lead.qualification?.score ?? 0;
  const source = lead.source || 'chat_widget';

  const subject = `New Lead: ${lead.name || 'Anonymous'} — ${classification.toUpperCase()}`;

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
      console.error(`[webhook] Resend error ${res.status}: ${errText}`);
      return null;
    }

    const data = await res.json();
    console.log(`[webhook] Email sent: id=${data.id}`);
    return data;
  } catch (err) {
    console.error('[webhook] Failed to send email:', err.message);
    return null;
  }
}

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

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =============================================================================
// Retry helper (FOC-190)
// =============================================================================

async function retryFetch(url, options, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      // 429/5xx — retryable
      if (res.status === 429 || res.status >= 500) {
        lastError = `HTTP ${res.status}`;
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.warn(`[webhook] GHL attempt ${attempt}/${maxRetries} failed (${res.status}), retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      // 4xx (non-429) — not retryable
      return res;
    } catch (err) {
      lastError = err.message;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.warn(`[webhook] Network error on attempt ${attempt}/${maxRetries}, retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw new Error(`All ${maxRetries} retries failed: ${lastError}`);
}

// =============================================================================
// Input validation (FOC-190)
// =============================================================================

function validateLeadBody(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }

  if (!body.name && !body.phone) {
    errors.push('At least one of name or phone is required');
  }

  if (body.name && (typeof body.name !== 'string' || body.name.length > 200)) {
    errors.push('name must be a string of max 200 characters');
  }

  if (body.phone && (typeof body.phone !== 'string' || body.phone.length > 30)) {
    errors.push('phone must be a string of max 30 characters');
  }

  if (body.email && (typeof body.email !== 'string' || body.email.length > 254)) {
    errors.push('email must be a string of max 254 characters');
  }

  if (body.practice && typeof body.practice !== 'string') {
    errors.push('practice must be a string');
  }

  if (body.qualification && typeof body.qualification === 'object') {
    if (body.qualification.score != null && typeof body.qualification.score !== 'number') {
      errors.push('qualification.score must be a number');
    }
    if (body.qualification.classification && !['qualified', 'nurture', 'not_a_fit', 'unknown'].includes(body.qualification.classification)) {
      errors.push(`qualification.classification must be one of: qualified, nurture, not_a_fit, unknown`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// Handler
// =============================================================================

export default async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
        'Access-Control-Allow-Headers': 'Content-Type, X-Client-Id',
      },
    });
  }

  // Health check
  if (request.method === 'GET') {
    return new Response(JSON.stringify({
      status: 'ok',
      endpoint: '/api/webhook',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // === INPUT VALIDATION (FOC-190) ===
  const validation = validateLeadBody(body);
  if (!validation.valid) {
    return new Response(JSON.stringify({ error: 'Validation failed', details: validation.errors }), {
      status: 422,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
  // ==================================

  // === MULTI-TENANT: resolve client config ===
  const { config: clientConfig, clientId, fromKV } = await resolveClient(request);
  // ============================================

  // Determine GHL destination
  const ghlUrl = clientConfig.crm?.webhook_url || process.env.GHL_WEBHOOK_URL || '';
  const ghlApiKey = clientConfig.crm?.api_key || process.env.GHL_API_KEY || '';
  const crmFieldMap = clientConfig.crm?.custom_fields_map || {};
  const bookingUrl = clientConfig.booking_url || 'https://focusrunner.com';

  console.log(`[webhook] clientId=${clientId} ghlUrl=${ghlUrl ? 'configured' : 'not_configured'}`);

  // Forward to GoHighLevel if configured
  if (ghlUrl || ghlApiKey) {
    try {
      const ghlHeaders = { 'Content-Type': 'application/json' };
      if (ghlApiKey) {
        ghlHeaders['Authorization'] = `Bearer ${ghlApiKey}`;
      }

      const payload = {
        name: body.name || '',
        phone: body.phone || '',
        email: body.email || '',
        customField: {
          practice_name: body.practice || '',
          niche: body.niche || '',
          patient_volume: body.volume || '',
          source: body.source || 'focusrunner_chat',
          qualification_score: body.qualification?.score || 0,
          qualification_class: body.qualification?.classification || 'unknown',
          budget_tier: body.qualification?.budget_tier || 'unknown',
          service_interest: body.qualification?.service_interest || '',
          timeline: body.qualification?.timeline || 'unknown',
          lead_summary: body.qualification?.summary || '',
        },
      };

      // Apply per-client custom field mapping
      if (crmFieldMap.score) payload.customField[crmFieldMap.score] = payload.customField.qualification_score;
      if (crmFieldMap.classification) payload.customField[crmFieldMap.classification] = payload.customField.qualification_class;
      if (crmFieldMap.budget_tier) payload.customField[crmFieldMap.budget_tier] = payload.customField.budget_tier;
      if (crmFieldMap.service_interest) payload.customField[crmFieldMap.service_interest] = payload.customField.service_interest;
      if (crmFieldMap.timeline) payload.customField[crmFieldMap.timeline] = payload.customField.timeline;
      if (crmFieldMap.summary) payload.customField[crmFieldMap.summary] = payload.customField.lead_summary;

      // Use retryFetch for GHL call
      await retryFetch(ghlUrl || 'https://rest.gohighlevel.com/v1/contacts/', {
        method: 'POST',
        headers: ghlHeaders,
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error(`[webhook] GHL error for client ${clientId}:`, err.message);
      // Don't fail the request — leads are logged in analytics
    }
  }

  // === ANALYTICS: log lead submission event ===
  logAnalyticsEvent(clientId, {
    type: 'lead_submitted',
    name: body.name,
    phone: body.phone,
    practice: body.practice,
    niche: body.niche,
    volume: body.volume,
    qualification: body.qualification,
    source: body.source || 'chat_widget',
  }).catch(() => {});
  // ===========================================

  // === EMAIL NOTIFICATION: alert the team ===
  notifyLead(body, { timestamp: new Date().toISOString() }).catch(() => {});
  // ===========================================

  return new Response(JSON.stringify({
    status: 'received',
    lead: body.name || 'anonymous',
    clientId,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Client-Id': clientId,
    },
  });
}
