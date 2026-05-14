/**
 * Vercel Edge Function: /api/webhook
 * Receives lead data from the chat widget and forwards to GoHighLevel CRM.
 * Includes retry logic, response validation, and rate-limit awareness.
 *
 * Input:  POST { name, phone, practice, niche, volume, qualification, source }
 */
export const config = {
  runtime: 'edge',
};

const GHL_API_KEY = process.env.GHL_API_KEY || '';
const GHL_WEBHOOK_URL = process.env.GHL_WEBHOOK_URL || '';
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * POST to GHL with retries and rate-limit backoff.
 * Returns { ok, status, statusText } on each attempt.
 */
async function forwardToGHL(body, attempt = 1) {
  const url = GHL_WEBHOOK_URL || 'https://rest.gohighlevel.com/v1/contacts/';
  const ghlHeaders = { 'Content-Type': 'application/json' };
  if (GHL_API_KEY) {
    ghlHeaders['Authorization'] = `Bearer ${GHL_API_KEY}`;
  }

  const ghlPayload = {
    name: body.name || '',
    phone: body.phone || '',
    email: body.email || '',
    customField: {
      practice_name: body.practice || '',
      niche: body.niche || '',
      patient_volume: body.volume || '',
      source: body.source || 'focusrunner_chat',
      qualification_score: body.qualification?.score ?? 0,
      qualification_class: body.qualification?.classification || 'unknown',
      budget_tier: body.qualification?.budget_tier || 'unknown',
      service_interest: body.qualification?.service_interest || '',
      timeline: body.qualification?.timeline || 'unknown',
      lead_summary: body.qualification?.summary || '',
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: ghlHeaders,
    body: JSON.stringify(ghlPayload),
  });

  const result = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
  };

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    result.body = body;

    // Rate-limited (429) — backoff and retry
    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
      const delay = Math.max(retryAfter * 1000, RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
      console.log(`GHL rate limited (429). Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
      await sleep(delay);
      return forwardToGHL(body, attempt + 1);
    }

    // Server error (5xx) — retry with backoff
    if (response.status >= 500 && attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`GHL server error (${response.status}). Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
      await sleep(delay);
      return forwardToGHL(body, attempt + 1);
    }
  }

  return result;
}

export default async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Health check
  if (request.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok', endpoint: '/api/webhook' }), {
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

  // Validate required fields
  const requiredFields = ['name', 'phone'];
  const missing = requiredFields.filter(f => !body[f]);
  if (missing.length) {
    return new Response(JSON.stringify({
      error: `Missing required fields: ${missing.join(', ')}`,
      status: 'rejected',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Log the lead
  console.log('Lead captured:', JSON.stringify({ name: body.name, phone: body.phone?.slice(0, 6) + '***', source: body.source }));

  // Forward to GoHighLevel if configured
  let ghlResult = null;
  if (GHL_WEBHOOK_URL || GHL_API_KEY) {
    try {
      ghlResult = await forwardToGHL(body);
      if (ghlResult.ok) {
        console.log('GHL forward success');
      } else {
        console.error(`GHL forward failed (${ghlResult.status}): ${ghlResult.body?.slice(0, 200)}`);
      }
    } catch (err) {
      console.error('GHL forward error:', err.message);
      ghlResult = { ok: false, status: 0, error: err.message };
    }
  }

  const responseData = {
    status: 'received',
    lead: body.name,
    ghl: ghlResult ? { delivered: ghlResult.ok, status: ghlResult.status } : null,
  };

  // Return 202 if GHL failed but we got the lead — don't drop data
  const respStatus = ghlResult && !ghlResult.ok ? 202 : 200;

  return new Response(JSON.stringify(responseData), {
    status: respStatus,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
