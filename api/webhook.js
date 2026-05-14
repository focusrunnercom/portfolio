/**
 * Vercel Edge Function: /api/webhook
 * Multi-tenant lead forwarding to per-client GoHighLevel CRM.
 *
 * Input:  POST { name, phone, email, practice, niche, volume, qualification, source }
 *         Header: X-Client-Id (optional — defaults to 'client_default')
 *
 * CONFIG RESOLUTION:
 *   1. If X-Client-Id header provided → read config from KV, use per-client GHL URL
 *   2. If KV not found or no header → fallback to env vars (backward compat)
 */
export const config = {
  runtime: 'edge',
};

import { resolveClient } from './kv.js';
import { logAnalyticsEvent } from './lib/analytics-lib.js';

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
    const resolved = await resolveClient(request);
    return new Response(JSON.stringify({
      status: 'ok',
      endpoint: '/api/webhook',
      clientId: resolved.clientId,
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

      await fetch(ghlUrl || 'https://rest.gohighlevel.com/v1/contacts/', {
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
