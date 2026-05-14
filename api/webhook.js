/**
 * Vercel Serverless Function: /api/webhook
 * Receives lead data from lead-capture.html form and forwards to destinations.
 * CJS — zero imports, fully self-contained.
 *
 * Input:  POST { name, phone, email, practice, volume, source }
 * Output: { success, lead_id }
 */

// =============================================================================
// Retry helper
// =============================================================================

async function retryFetch(url, options, maxRetries) {
  maxRetries = maxRetries || 3;
  var lastError;
  for (var attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      var res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        lastError = 'HTTP ' + res.status;
        if (attempt < maxRetries) {
          var delay = Math.min(500 * Math.pow(2, attempt - 1), 2000);
          console.warn('[webhook] GHL attempt ' + attempt + '/' + maxRetries + ' failed (' + res.status + '), retrying in ' + delay + 'ms');
          await new Promise(function(r) { setTimeout(r, delay); });
          continue;
        }
      }
      return res;
    } catch (err) {
      lastError = err.message;
      if (attempt < maxRetries) {
        var delay = Math.min(500 * Math.pow(2, attempt - 1), 2000);
        console.warn('[webhook] Network error on attempt ' + attempt + '/' + maxRetries + ', retrying in ' + delay + 'ms');
        await new Promise(function(r) { setTimeout(r, delay); });
      }
    }
  }
  throw new Error('All ' + maxRetries + ' retries failed: ' + lastError);
}

// =============================================================================
// Input validation
// =============================================================================

function validateLeadBody(body) {
  var errors = [];
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
  return { valid: errors.length === 0, errors: errors };
}

// =============================================================================
// GHL Contact Sync
// =============================================================================

var GHL_API_BASE = 'https://rest.gohighlevel.com/v1';
var GHL_TAG = 'focusrunner_webhook';

async function createGHLContact(leadData) {
  var apiKey = process.env.GHL_API_KEY;
  if (!apiKey) {
    console.warn('[webhook] GHL_API_KEY not set — skipping contact sync');
    return null;
  }

  var payload = {
    name: leadData.name || 'Webhook Lead',
    phone: leadData.phone || '',
    email: leadData.email || '',
    tags: [GHL_TAG],
  };

  if (leadData.practice) {
    payload.companyName = leadData.practice;
  }

  try {
    var res = await retryFetch(GHL_API_BASE + '/contacts/', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    var body = await res.json();

    if (!res.ok) {
      console.error('[webhook] GHL API error ' + res.status + ': ' + JSON.stringify(body).slice(0, 300));
      return null;
    }

    console.log('[webhook] GHL contact created: id=' + (body.contact?.id || body.id) + ' name=' + leadData.name);
    return body;
  } catch (err) {
    console.error('[webhook] GHL network error:', err.message);
    return null;
  }
}

// =============================================================================
// In-memory lead storage (survives per warm instance, zero deps)
// =============================================================================

var memoryLeads = [];
var MAX_MEMORY_LEADS = 500;

function appendLead(leadData) {
  try {
    var lead = {
      id: generateId(),
      name: String(leadData.name || '').slice(0, 200),
      phone: String(leadData.phone || '').slice(0, 30),
      email: String(leadData.email || '').slice(0, 254),
      practice: String(leadData.practice || '').slice(0, 200),
      source: leadData.source || 'unknown',
      timestamp: new Date().toISOString(),
    };
    memoryLeads.push(lead);
    if (memoryLeads.length > MAX_MEMORY_LEADS) {
      memoryLeads = memoryLeads.slice(-MAX_MEMORY_LEADS);
    }
    console.log('[webhook] Lead stored: ' + lead.id + ' — ' + lead.name);
    return lead.id;
  } catch (err) {
    console.error('[webhook] Lead storage failed:', err.message);
    return null;
  }
}

function generateId() {
  var chars = 'abcdef0123456789';
  var id = '';
  for (var i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) id += '-';
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// =============================================================================
// CORS headers
// =============================================================================

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function jsonResponse(data, status) {
  status = status || 200;
  return new Response(JSON.stringify(data), {
    status: status,
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
      version: '1.1',
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // Parse body
  var body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  // Validate
  var validation = validateLeadBody(body);
  if (!validation.valid) {
    return jsonResponse({ error: 'Validation failed', details: validation.errors }, 400);
  }

  var leadData = {
    name: body.name,
    phone: body.phone,
    email: body.email || '',
    practice: body.practice || '',
    volume: body.volume || '',
    source: body.source || 'lead_capture',
  };

  console.log('[webhook] Received lead: name=' + leadData.name + ' phone=' + leadData.phone + ' source=' + leadData.source);

  // Store in memory
  appendLead(leadData);

  // Forward to GHL
  var ghlResult = null;
  try {
    ghlResult = await createGHLContact(leadData);
  } catch (err) {
    console.error('[webhook] GHL forward failed:', err.message);
  }

  var ghlSuccess = ghlResult !== null;
  var httpStatus = ghlSuccess ? 200 : 202;

  return jsonResponse({
    success: ghlSuccess,
    lead_id: ghlResult?.contact?.id || ghlResult?.id || null,
    message: ghlSuccess
      ? 'Lead received and forwarded'
      : 'Lead received but GHL forwarding failed',
  }, httpStatus);
}
