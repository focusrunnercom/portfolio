/**
 * Vercel Edge Function: /api/chat
 * Multi-tenant DeepSeek-powered lead qualification for med spa patient acquisition.
 *
 * Input:  POST { messages, userData: {name, phone, practice, niche, volume} }
 *         Header: X-Client-Id (optional — defaults to 'client_default')
 * Output: { reply, qualification, booking_link, clientId }
 *
 * CONFIG RESOLUTION:
 *   1. If X-Client-Id header provided → read config from Vercel KV
 *   2. If KV not found or no header → fallback to env vars (backward compat)
 */
export const config = {
  runtime: 'edge',
};

import { resolveClient } from './kv.js';
import { logAnalyticsEvent } from './lib/analytics-lib.js';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const API_BASE = process.env.OPENAI_API_BASE || 'https://api.deepseek.com/v1';

/**
 * Build the system prompt for a given client config and user data.
 * Uses per-client prompt if configured, otherwise builds dynamically.
 * This is the critical per-client customization point.
 */
function buildSystemPrompt(config, userData) {
  const clientPrompt = config.ai?.system_prompt;

  if (clientPrompt) {
    // Inject dynamic user data into the client's custom prompt
    return clientPrompt
      .replace(/\${name}/g, userData.name || 'there')
      .replace(/\${phone}/g, userData.phone || 'unknown')
      .replace(/\${practice}/g, userData.practice || 'unknown')
      .replace(/\${niche}/g, userData.niche || 'med spa')
      .replace(/\${volume}/g, userData.volume || 'unknown');
  }

  // Default prompt — same as original but templated
  const name = userData.name || 'there';
  const phone = userData.phone || 'unknown';
  const practice = userData.practice || 'unknown';
  const niche = userData.niche || 'med spa';
  const volume = userData.volume || 'unknown';

  return `You are a senior patient acquisition consultant for FocusRunner, an AI marketing agency serving medical aesthetics practices. Your role is to qualify med spa OWNERS by understanding their practice's lead flow, conversion challenges, and growth goals through natural conversation.

SERVICES WE OFFER: AI Patient Acquisition System ($2,500 setup + $2,500/mo), AI Chatbot Lead Qualification, Automated Follow-Up Sequences, GoHighLevel CRM Setup, Google/Meta Ad Management, AI Voice Agent for Intake Calls

QUALIFICATION RULES:
- Budget: Can they afford $2,500+ setup + $2,500/mo retainer? (30 points)
- Pain: Are they frustrated with lead quality or volume from current marketing? (40 points)
- Commitment: Ready to change their patient acquisition process? (30 points)

CONVERSATION FLOW:
1. Friendly greeting — thank them for reaching out
2. Ask about their practice — what they offer, how many locations
3. Understand their current lead generation — what's working, what's not
4. Ask about their current patient volume and conversion rate
5. Ask what they've tried before (Facebook ads, SEO, referrals?)
6. Gently ask about monthly marketing budget
7. If qualified, offer a Free Patient Acquisition Audit
8. If not, thank them and let them know about future offers

TONE: Direct, consultative, peer-to-peer. Speak to them as a colleague in business, not a patient. Never pitch features — diagnose problems.
RULES: Never promise specific results. Route technical questions to the FocusRunner engineering team. Keep responses under 3 sentences unless explaining a concept.

At the END of the conversation (when you have enough to score), append a JSON block wrapped in \`\`\`json:
\`\`\`json
{
  "score": <0-100>,
  "classification": "qualified|nurture|not_a_fit",
  "budget_tier": "premium|mid|budget",
  "practice_size": "single|multi|chain",
  "timeline": "immediate|within_month|exploring",
  "summary": "<1-sentence practice summary for sales team>"
}
\`\`\`

The user is a med spa owner or practice manager who reached out for help with patient acquisition. Here's what we already know:
- Name: ${name}
- Phone: ${phone}
- Practice: ${practice}
- Niche: ${niche}
- Current patient volume: ${volume} per month

IMPORTANT: This person OWNS or runs a medical aesthetics practice. They are looking for a patient acquisition SYSTEM, not a treatment. Treat them as a business owner evaluating a vendor. Adapt your questions accordingly — ask about their practice's lead flow, conversion rate, ad spend, and growth goals. Do NOT treat them as a patient seeking treatment.`;
}

function parseQualification(text) {
  const jsonMatch = text.match(/```json\s*(\{.*?\})\s*```/s);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch (e) { /* ignore */ }
  }
  const bareMatch = text.match(/\{[^{}]*"score"[\s:0-9,.\"'a-z_\-]*\}/i);
  if (bareMatch) {
    try {
      return JSON.parse(bareMatch[0]);
    } catch (e) { /* ignore */ }
  }
  return null;
}

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
    const { clientId } = await import('./kv.js').then(m => m.resolveClientId(request));
    return new Response(JSON.stringify({
      status: 'ok',
      endpoint: '/api/chat',
      model: process.env.CHAT_MODEL || 'deepseek-chat',
      clientId,
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

  if (!DEEPSEEK_API_KEY) {
    return new Response(JSON.stringify({ error: 'API key not configured.' }), {
      status: 500,
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

  const messages = body.messages || [];
  const userData = body.userData || {};

  if (!messages.length) {
    return new Response(JSON.stringify({ error: 'messages array is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // === MULTI-TENANT: resolve client config ===
  const { config: clientConfig, clientId, fromKV } = await resolveClient(request);

  if (!clientConfig || !clientConfig.active) {
    return new Response(JSON.stringify({ error: 'Client not found or inactive' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
  // ============================================

  // Build per-client system prompt
  const systemPrompt = buildSystemPrompt(clientConfig, userData);
  const model = clientConfig.ai?.model || process.env.CHAT_MODEL || 'deepseek-chat';
  const temperature = clientConfig.ai?.temperature ?? 0.7;
  const maxTokens = clientConfig.ai?.max_tokens ?? 500;

  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  try {
    const aiResponse = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      return new Response(JSON.stringify({
        error: `AI API error ${aiResponse.status}: ${errorText.slice(0, 500)}`,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const aiData = await aiResponse.json();
    const aiText = aiData.choices[0]?.message?.content || '';

    const qualification = parseQualification(aiText);

    // Strip JSON block from visible reply
    let reply = aiText.replace(/```json\s*\{.*?\}\s*```/gs, '').trim();
    if (!reply) reply = aiText.trim();

    const bookingLink = qualification?.classification === 'qualified'
      ? (clientConfig.booking_url || 'https://focusrunner.com')
      : null;

    // === ANALYTICS: log lead event ===
    if (qualification) {
      logAnalyticsEvent(clientId, {
        type: 'lead_captured',
        name: userData.name,
        phone: userData.phone,
        practice: userData.practice,
        niche: userData.niche,
        volume: userData.volume,
        qualification,
        bookingLink,
      }).catch(() => {});
    }
    // ================================

    const responseData = {
      reply,
      qualification,
      booking_link: bookingLink,
      clientId,
    };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Client-Id': clientId,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: `AI API call failed: ${err.message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
