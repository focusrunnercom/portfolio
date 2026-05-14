/**
 * Vercel Serverless Function: /api/webhook
 * Receives lead data from Make.com / GHL webhook and forwards to destinations.
 *
 * Input:  POST { name, phone, email, practice, niche, volume, qualification, source }
 *         Header: X-Client-Id — optional, resolves per-client CRM config from KV
 * Output: { success, lead_id, forward_results }
 *
 * Features:
 * - Per-client CRM config via KV (webhook_url, api_key per client)
 * - 3x retry with exponential backoff (500ms, 1s, 2s) on GHL 429/5xx errors
 * - Required field validation (name, phone) — returns 400 if missing
 * - Returns 202 (not 200) on GHL failure — data received but not forwardable
 * - Forward to GHL API, email notification, SMS followup
 * - Per-client CRM config via X-Client-Id header (resolved from Vercel KV)
 */

import { kvGet } from './kv.js';
import { record as storeLead } from './lib/notify.js';
import { notifyLead } from './lib/lead-notify.js';

// =============================================================================
// Retry helper
// =============================================================================

/**
 * Fetch with retry. Retries on HTTP 429 (rate limit) and 5xx errors only.
 * Uses exponential backoff: 500ms, 1s, 2s.
 */
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
          const delay = Math.min(500 * Math.pow(2, attempt - 1), 2000);
          console.warn(`[webhook] GHL attempt ${attempt}/${maxRetries} failed (${res.status}), retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      // 4xx (non-429) — not retryable, return as-is
      return res;
    } catch (err) {
      lastError = err.message;
      if (attempt < maxRetries) {
        const delay = Math.min(500 * Math.pow(2, attempt - 1), 2000);
        console.warn(`[webhook] Network error on attempt ${attempt}/${maxRetries}, retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw new Error(`All ${maxRetries} retries failed: ${lastError}`);
}

// =============================================================================
// Input validation
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
    if (body.qualification.classification && !['qualified', 'nurture', 'not_a_fit', 'unknown', 'warm', 'cold'].includes(body.qualification.classification)) {
      errors.push('qualification.classification must be one of: qualified, nurture, not_a_fit, unknown, warm, cold');
    }
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// GHL Contact Sync
// =============================================================================

const GHL_API_BASE = 'https://rest.gohighlevel.com/v1';
const GHL_TAG = 'focusrunner_webhook';

async function createGHLContact(leadData, qualification, clientConfig) {
  // Resolve GHL credentials: client-specific or global
  const apiKey = clientConfig?.crm?.api_key || process.env.GHL_API_KEY;
  if (!apiKey) {
    console.warn('[webhook] GHL_API_KEY not set — skipping contact sync');
    return null;
  }

  const payload = {
    name: leadData.name || 'Webhook Lead',
    phone: leadData.phone || '',
    email: leadData.email || '',
    tags: [GHL_TAG],
  };

  if (leadData.practice) {
    payload.companyName = leadData.practice;
  }

  const customFields = {};
  if (leadData.practice) customFields.practice_name = leadData.practice;
  if (leadData.niche) customFields.niche = leadData.niche;
  if (leadData.volume) customFields.patient_volume = leadData.volume;
  customFields.source = 'focusrunner_webhook';

  if (qualification) {
    customFields.qualification_score = String(qualification.score ?? 0);
    customFields.qualification_class = qualification.classification || 'unknown';
    customFields.lead_summary = qualification.summary || '';
  }

  const locationId = process.env.GHL_LOCATION_ID;
  if (locationId) customFields.location_id = locationId;

  if (Object.keys(customFields).length > 0) {
    payload.customField = customFields;
  }

  try {
    const res = await retryFetch(`${GHL_API_BASE}/contacts/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = await res.json();

    if (!res.ok) {
      console.error(`[webhook] GHL API error ${res.status}:`, JSON.stringify(body).slice(0, 300));
      return null;
    }

    console.log(`[webhook] GHL contact created: id=${body.contact?.id || body.id} name=${leadData.name}`);
    return body;
  } catch (err) {
    console.error('[webhook] GHL network error:', err.message);
    return null;
  }
}

// =============================================================================
// Email notification (via Resend)
// =============================================================================

async function notifyLeadEmail(leadData, qualification) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[webhook] RESEND_API_KEY not set — skipping email notification');
    return null;
  }

  const recipient = process.env.NOTIFY_EMAIL || 'hello@focusrunner.com';
  const classification = qualification?.classification || 'unknown';
  const badgeColor = {
    hot: '#dc2626',
    warm: '#ea580c',
    cold: '#2563eb',
    qualified: '#16a34a',
    nurture: '#ca8a04',
    not_a_fit: '#6b7280',
  }[classification.toLowerCase()] || '#6b7280';

  const html = `<!DOCTYPE html>
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
      <h1>New Lead via Webhook</h1>
      <p>focusrunner.io &middot; ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      <div class="badge" style="background: ${badgeColor};">${classification.toUpperCase()}</div>
    </div>
    <div class="body">
      <div class="field"><div class="label">Name</div><div class="value">${escapeHtml(leadData.name || '—')}</div></div>
      <div class="field"><div class="label">Phone</div><div class="value">${escapeHtml(leadData.phone || '—')}</div></div>
      <div class="field"><div class="label">Email</div><div class="value">${escapeHtml(leadData.email || '—')}</div></div>
      ${leadData.source ? `<div class="field"><div class="label">Source</div><div class="value">${escapeHtml(leadData.source)}</div></div>` : ''}
      ${leadData.practice ? `<hr class="divider"><div class="field"><div class="label">Practice</div><div class="value">${escapeHtml(leadData.practice)}</div></div>` : ''}
      ${leadData.niche ? `<div class="field"><div class="label">Niche</div><div class="value">${escapeHtml(leadData.niche)}</div></div>` : ''}
      ${qualification?.summary ? `<hr class="divider"><div class="field"><div class="label">Summary</div><div class="value">${escapeHtml(qualification.summary)}</div></div>` : ''}
    </div>
    <div class="footer">FocusRunner AI &middot; Done-for-you AI marketing services</div>
  </div>
</body>
</html>`.trim();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FocusRunner Leads <leads@focusrunner.io>',
        to: recipient,
        subject: `New Lead: ${leadData.name || 'Anonymous'} — ${classification.toUpperCase()}`,
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

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// =============================================================================
// SMS followup (via Twilio)
// =============================================================================

async function smsFollowup(leadData, qualification) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    console.warn('[webhook] Twilio not configured — skipping SMS');
    return null;
  }

  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const classification = (qualification?.classification || 'unknown').toUpperCase();
  const salesPhone = process.env.SALES_TEAM_PHONE;

  // Sales team notification
  if (salesPhone) {
    const salesBody = [
      `FOCUSRUNNER: New webhook lead!`,
      `Name: ${(leadData.name || '').slice(0, 60)}`,
      `Phone: ${(leadData.phone || '').slice(0, 20)}`,
      `Score: ${qualification?.score || '?'} - ${classification}`,
      `Call NOW — leads convert in <5 min.`,
    ].join('\n');

    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: salesPhone, From: from, Body: salesBody }),
        }
      );
      if (res.ok) console.log('[webhook] SMS sent to sales team');
      else console.warn('[webhook] Sales SMS failed:', await res.text().catch(() => ''));
    } catch (err) {
      console.warn('[webhook] Sales SMS error:', err.message);
    }
  }
}

// =============================================================================
// CORS headers
// =============================================================================

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Client-Id',
    'Content-Type': 'application/json',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(),
  });
}

// =============================================================================
// Handler
// =============================================================================

export default async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  // Health check
  if (request.method === 'GET') {
    return jsonResponse({
      status: 'ok',
      endpoint: '/api/webhook',
      version: '1.0',
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  // Validate
  const validation = validateLeadBody(body);
  if (!validation.valid) {
    return jsonResponse({ error: 'Validation failed', details: validation.errors }, 400);
  }

  const leadData = {
    name: body.name,
    phone: body.phone,
    email: body.email || '',
    practice: body.practice || '',
    niche: body.niche || '',
    volume: body.volume || '',
    source: body.source || 'webhook',
  };
  const qualification = body.qualification || null;

  console.log(`[webhook] Received lead: name=${leadData.name} phone=${leadData.phone} source=${leadData.source}`);

  // Resolve per-client CRM config from X-Client-Id header
  const clientId = request.headers.get('x-client-id') || '';
  let clientConfig = null;
  if (clientId) {
    try {
      clientConfig = await kvGet(`client:${clientId}`);
      if (clientConfig && clientConfig.active !== false) {
        console.log(`[webhook] Using per-client CRM config for ${clientId}: name=${clientConfig.name}`);
      } else {
        clientConfig = null;
      }
    } catch (err) {
      console.warn(`[webhook] Failed to load client config for ${clientId}:`, err.message);
    }
  }

  // --- Forward to GHL ---
  let ghlResult = null;
  try {
    ghlResult = await createGHLContact(leadData, qualification, clientConfig);
  } catch (err) {
    console.error('[webhook] GHL forward failed:', err.message);
  }

  // --- Store to in-memory store ---
  storeLead(leadData);

  // --- Send email notification ---
  let emailResult = null;
  try {
    emailResult = await notifyLeadEmail(leadData, qualification);
  } catch (err) {
    console.error('[webhook] Email notification failed:', err.message);
  }

  // --- SMS followup ---
  if (qualification && qualification.classification !== 'cold' && qualification.classification !== 'not_a_fit') {
    try {
      await smsFollowup(leadData, qualification);
    } catch (err) {
      console.error('[webhook] SMS followup failed:', err.message);
    }
  }

  const ghlSuccess = ghlResult !== null;
  const emailSuccess = emailResult !== null;

  // Return 202 if GHL failed (data received but not forwardable)
  const httpStatus = ghlSuccess ? 200 : 202;

  return jsonResponse({
    success: ghlSuccess,
    lead_id: ghlResult?.contact?.id || ghlResult?.id || null,
    forward_results: {
      ghl: ghlSuccess,
      email: emailSuccess,
    },
    message: ghlSuccess
      ? 'Lead forwarded successfully'
      : 'Lead received but GHL forwarding failed — check API key and retry',
  }, httpStatus);
}
