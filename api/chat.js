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
// Vercel Serverless Function (local ESM imports supported natively)
import { resolveClient } from './kv.js';
import { logAnalyticsEvent } from './lib/analytics-lib.js';
import { createGHLContact } from './lib/ghl-sync.js';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const API_BASE = process.env.OPENAI_API_BASE || 'https://api.deepseek.com/v1';
const AI_TIMEOUT_MS = 15000; // 15s timeout for AI calls

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

  return `You are a business development consultant for FocusRunner, an AI marketing agency serving medical aesthetics practice OWNERS. Your only job: determine if this practice owner is a fit for our $2,500 setup / $2,500/mo AI Patient Acquisition System.

YOU ARE TALKING TO A BUSINESS OWNER — NEVER A PATIENT. This person owns or operates a med spa, cosmetic dentistry practice, plastic surgery clinic, or similar. They want MORE PATIENTS, not treatment. Every question must be from a business-owner perspective.

CORE QUALIFICATION (score each 1-100):
1. Revenue Range: $500K–$2M+ annual? Can they afford $5K/mo on acquisition? (25 pts)
2. New Patients/Mo: How many new patients do they see monthly? Under 30 = high need. (25 pts)
3. Current Ad Spend: What's their monthly marketing budget? Spending $0? $1K? $5K+? (25 pts)
4. Pain Level: Is lead volume or quality a problem? Do they feel they're leaving money on the table? (25 pts)

CONVERSATION FLOW (owner-to-owner, not consultant-to-client):
1. "Hey, thanks for reaching out. Give me a quick sense of your practice — what's your niche, how long you've been operating?"
2. "How many new patients are you seeing per month right now? What's your conversion rate look like?"
3. "What's your current monthly spend on marketing / patient acquisition?"
4. "What's been the biggest pain point — not enough leads, bad leads, or leaky follow-up?"
5. "Are you running ads? Social? Referral program? SEO?"
6. "If we could deliver 15+ qualified leads in your first 30 days, what would that do for your business?"
7. Qualified → "Let me show you the numbers. Free Patient Acquisition Audit — takes 24 hours, shows you exactly what you're missing."
8. Not a fit → "Fair enough. Check out our case studies anytime."

TONE: Peer-level, direct, no fluff. Speak business-to-business. Never pitch features — diagnose their funnel. No patient-facing language. No clinical terminology. Keep responses under 3 sentences.

RULES: Never promise specific results. Route technical questions to engineering team. You are qualifying a BUYER, not treating a PATIENT.

At the END, output JSON:
\`\`\`json
{
  "score": <0-100>,
  "classification": "qualified|nurture|not_a_fit",
  "budget_tier": "premium|mid|budget",
  "practice_size": "single|multi|chain",
  "monthly_ad_spend": "<amount or unknown>",
  "timeline": "immediate|within_month|exploring",
  "summary": "<1-sentence practice assessment for sales>"
}
\`\`\`

Known about this practice owner:
- Name: ${name}
- Phone: ${phone}
- Practice: ${practice}
- Niche: ${niche}
- Current patients/mo: ${volume}

CRITICAL: This is a BUSINESS OWNER evaluating a vendor. Do NOT say "you should try this treatment" or "how long have you had this concern." Ask about lead flow, ad spend, conversion rates, and growth goals. Treat them as a CEO, not a patient.`;
}

/**
 * Extract JSON qualification block from AI response.
 * Handles: ```json ... ```, bare JSON with leading whitespace, partial fragments.
 * Returns null if no valid JSON found.
 */
function parseQualification(text) {
  if (!text || typeof text !== 'string') return null;

  // Strategy 1: ```json ... ``` block (most common)
  const fencedMatch = text.match(/```(?:json)?\s*(\{[^`]*?\})\s*```/s);
  if (fencedMatch) {
    try {
      const parsed = JSON.parse(fencedMatch[1]);
      if (parsed && typeof parsed.score === 'number') return parsed;
    } catch (e) { /* fallthrough */ }
  }

  // Strategy 2: Bare JSON anywhere in text with a "score" field
  const bareMatch = text.match(/\{\s*"[^"]*"\s*:[\s\S]*?"score"\s*:\s*\d+[\s\S]*?\}/);
  if (bareMatch) {
    try {
      const parsed = JSON.parse(bareMatch[0]);
      if (parsed && typeof parsed.score === 'number') return parsed;
    } catch (e) { /* fallthrough */ }
  }

  // Strategy 3: Multi-line JSON fragment (model sometimes splits across lines)
  const lines = text.split('\n');
  let braceDepth = 0;
  let jsonStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      if (line[j] === '{') {
        if (braceDepth === 0) jsonStart = i;
        braceDepth++;
      } else if (line[j] === '}') {
        braceDepth--;
        if (braceDepth === 0 && jsonStart >= 0) {
          const candidate = lines.slice(jsonStart, i + 1).join('\n');
          try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed.score === 'number') return parsed;
          } catch (e) { /* not valid — keep looking */ }
          jsonStart = -1;
        }
      }
    }
  }

  return null;
}

/**
 * Fetch with an AbortController timeout.
 */
async function fetchWithTimeout(url, options, timeoutMs = AI_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
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
    const aiResponse = await fetchWithTimeout(`${API_BASE}/chat/completions`, {
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

      // === GHL SYNC: auto-create GoHighLevel contact ===
      createGHLContact(userData, qualification, clientId).catch(() => {});
    // ================================
    }

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
