/**
 * Vercel Edge Function: /api/webhook
 * Receives lead data from the chat widget and forwards to GoHighLevel CRM.
 *
 * Input:  POST { name, phone, practice, niche, volume, qualification, source }
 */
export const config = {
  runtime: 'edge',
};

const GHL_API_KEY = process.env.GHL_API_KEY || '';
const GHL_WEBHOOK_URL = process.env.GHL_WEBHOOK_URL || '';

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

  // Log the lead
  console.log('Lead captured:', JSON.stringify(body));

  // Forward to GoHighLevel if configured
  if (GHL_WEBHOOK_URL || GHL_API_KEY) {
    try {
      const ghlHeaders = { 'Content-Type': 'application/json' };
      if (GHL_API_KEY) {
        ghlHeaders['Authorization'] = `Bearer ${GHL_API_KEY}`;
      }

      await fetch(GHL_WEBHOOK_URL || 'https://rest.gohighlevel.com/v1/contacts/', {
        method: 'POST',
        headers: ghlHeaders,
        body: JSON.stringify({
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
        }),
      });
    } catch (err) {
      console.error('GHL webhook error:', err.message);
      // Don't fail the request — just log
    }
  }

  return new Response(JSON.stringify({ status: 'received', lead: body.name || 'anonymous' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
