/**
 * Vercel Serverless Function: /api/direct-qualify
 * DeepSeek-independent lead qualification endpoint.
 *
 * Zero external API calls. Zero dependencies. Zero AI.
 * Rules-based qualification powered by:
 *   - Chat flow: practice + volume → hot/warm/cold (3-question state machine)
 *   - Form flow: ad_spend + booking_rate + timeline → 0-100 numeric score
 *
 * Features:
 * - File-based lead storage in /tmp/leads.json (zero infra)
 * - Email notification via Resend for hot/warm leads (fire-and-forget)
 * - CORS for any origin
 * - <500ms response on every path
 */

// =============================================================================
// Scoring Engine — Chat Mode (practice + volume)
// =============================================================================

const SCORE_THRESHOLDS = {
  hot: { minVolume: 50 },
  warm: { minVolume: 10 },
};

const STEP_MESSAGES = {
  greeting: "Hey — I see you're checking out FocusRunner. Quick 3 questions to see if we can help you grow.",
  ask_practice:
    "First — what's your practice name and what services do you offer? (e.g., 'Miami Rejuvenation Spa — Botox, fillers, laser')",
  ask_volume:
    "How many new patients do you get per month? Rough estimate is fine.",
  ask_spend:
    "What are you currently spending on ads & marketing per month?",
  hot: "You're a great fit. Our team will reach out to book a strategy call within 24 hours.",
  warm:
    "You look like a solid prospect. Sending info to your email with case studies from similar practices.",
  cold:
    "Thanks for your interest. We've noted your details. When you're ready to scale, reach out anytime at hello@focusrunner.com.",
};

function qualify(lead) {
  const volume = parseInt(String(lead.volume || '0'), 10) || 0;
  const hasPractice = !!(lead.practice || '').trim();

  if (hasPractice && volume >= SCORE_THRESHOLDS.hot.minVolume) {
    return { score: 'hot', next_action: 'book_call', numericScore: 85 };
  }
  if (hasPractice && volume >= SCORE_THRESHOLDS.warm.minVolume) {
    return { score: 'warm', next_action: 'send_info', numericScore: 45 };
  }
  return { score: 'cold', next_action: 'drip', numericScore: 10 };
}

// =============================================================================
// Scoring Engine — Form Mode (ad_spend + booking_rate + timeline)
// =============================================================================

const SPEND_SCORES = { 'Under $3K': 5, '$3K-$5K': 20, '$5K-$10K': 30, '$10K+': 35 };
const BOOKING_SCORES = { 'Under 10%': 35, '10-15%': 25, '15-20%': 10, '20%+': 5 };
const TIMELINE_SCORES = { 'ASAP — ready now': 30, 'ASAP \u2014 ready now': 30, 'This quarter': 20, 'Just researching': 5 };

function calcFormScore(adSpend, bookingRate, timeline) {
  return (SPEND_SCORES[adSpend] ?? 5) + (BOOKING_SCORES[bookingRate] ?? 5) + (TIMELINE_SCORES[timeline] ?? 5);
}

function classifyNumeric(score) {
  if (score >= 65) return 'hot';
  if (score >= 30) return 'warm';
  return 'cold';
}

// =============================================================================
// Conversation State Machine
// =============================================================================

function processMessage(message, state) {
  const step = (state && state.step) || 'greeting';
  const practice = (state && state.practice) || '';
  const volume = (state && state.volume) || '';
  const input = (message || '').trim();

  switch (step) {
    case 'greeting':
      return {
        response: STEP_MESSAGES.greeting + '\n\n' + STEP_MESSAGES.ask_practice,
        next_step: 'ask_volume', requires_input: true, field: 'practice',
      };
    case 'ask_volume':
      return {
        response: STEP_MESSAGES.ask_volume,
        next_step: 'ask_spend', requires_input: true, field: 'volume',
      };
    case 'ask_spend':
      return {
        response: STEP_MESSAGES.ask_spend,
        next_step: 'done', requires_input: true, field: 'spend',
      };
    case 'done': {
      const result = qualify({ practice, volume, spend: input });
      return {
        response: STEP_MESSAGES[result.score],
        score: result.score, next_action: result.next_action,
        next_step: 'complete', requires_input: false,
      };
    }
    case 'complete':
      return {
        response: 'Already submitted! Our team will reach out.',
        score: 'cold', next_action: 'drip',
        next_step: 'complete', requires_input: false,
      };
    default:
      return {
        response: STEP_MESSAGES.greeting,
        next_step: 'ask_volume', requires_input: true, field: 'practice',
      };
  }
}

function buildFormReply(name, classification, ad_spend, booking_rate) {
  const tierMsg = {
    hot: `Great fit — ${ad_spend || 'your level'} in ad spend, ${booking_rate || 'current'} booking rate. We'll get you on a free strategy call.`,
    warm: `Good fit. A lot of med spas at this stage see a big jump when they fix response times. Let's send you a case study.`,
    cold: `Thanks. We'll send resources on med spa lead generation. When you're ready to scale, you know where to find us.`,
  };
  return `Hey ${name} — ${tierMsg[classification] || tierMsg.cold}`;
}

// =============================================================================
// Lead Storage
// =============================================================================

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

const STORAGE_PATH = '/tmp/leads.json';
const MAX_LEADS = 500;

function readLeads() {
  try {
    if (!existsSync(STORAGE_PATH)) return [];
    return JSON.parse(readFileSync(STORAGE_PATH, 'utf-8')).leads || [];
  } catch (_) { return []; }
}

function storeLead(data) {
  try {
    const lead = {
      id: randomUUID(), timestamp: new Date().toISOString(), notified: false,
      ...data,
    };
    let leads = readLeads();
    leads.push(lead);
    if (leads.length > MAX_LEADS) leads = leads.slice(-MAX_LEADS);
    writeFileSync(STORAGE_PATH, JSON.stringify({ leads }, null, 2), 'utf-8');
    console.log(`[direct-qualify] Lead stored: ${lead.id} — ${lead.name || 'anon'}`);
    return lead.id;
  } catch (err) {
    console.error('[direct-qualify] Store failed:', err.message);
    return null;
  }
}

// =============================================================================
// Email Notification (fire-and-forget)
// =============================================================================

async function notifyLead(lead, classification, score) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn('[direct-qualify] RESEND_API_KEY not set — skipping notif'); return; }
  const recipient = process.env.NOTIFY_EMAIL || 'hello@focusrunner.com';
  const badgeColor = { hot: '#dc2626', warm: '#ea580c', cold: '#2563eb' }[classification] || '#6b7280';
  const name = lead.name || '—';
  const phone = lead.phone || '—';
  const email = lead.email || '—';
  const practice = lead.practice || lead.spa_name || '—';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'FocusRunner Leads <leads@focusrunner.io>',
        to: recipient,
        subject: `New Lead: ${name} — ${classification.toUpperCase()} (${score}/100)`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:24px auto;background:#fff;border-radius:12px">
<div style="background:#0f172a;color:#fff;padding:24px 32px"><h1 style="margin:0">New Lead Captured</h1>
<p style="opacity:.7">direct-qualify &middot; ${new Date().toLocaleString('en-US', { month:'short', day:'numeric' })}</p>
<div style="display:inline-block;padding:4px 12px;border-radius:20px;color:#fff;background:${badgeColor};font-weight:600;font-size:13px">
${classification.toUpperCase()} &middot; ${score}/100</div></div>
<div style="padding:24px 32px">
<div style="margin-bottom:12px"><div style="font-size:11px;color:#6b7280;font-weight:600">Name</div><div>${name}</div></div>
<div style="margin-bottom:12px"><div style="font-size:11px;color:#6b7280;font-weight:600">Phone</div><div>${phone}</div></div>
<div style="margin-bottom:12px"><div style="font-size:11px;color:#6b7280;font-weight:600">Email</div><div>${email}</div></div>
<div style="margin-bottom:12px"><div style="font-size:11px;color:#6b7280;font-weight:600">Practice</div><div>${practice}</div></div>
</div>
<div style="padding:8px 32px 24px;font-size:11px;color:#9ca3af;text-align:center">FocusRunner AI</div></div>`,
      }),
    });
    if (!res.ok) console.error('[direct-qualify] Notif error:', res.status, await res.text().catch(()=>''));
  } catch (err) { console.error('[direct-qualify] Notif failed:', err.message); }
}

// =============================================================================
// HTTP Helpers
// =============================================================================

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

// =============================================================================
// Handler
// =============================================================================

export default async function handler(request) {
  const start = Date.now();

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method === 'GET') {
    return jsonResponse({
      status: 'ok',
      endpoint: '/api/direct-qualify',
      version: '2.0.0',
      modes: {
        chat: { fields: ['message', 'name', 'practice', 'volume', 'spend'] },
        form: { fields: ['name', 'email', 'phone', 'spa_name', 'ad_spend', 'booking_rate', 'timeline'] },
      },
      runtime_ms: Date.now() - start,
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body;
  try { body = await request.json(); } catch (_) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { message, name, email, phone, practice, volume, spend, spa_name, ad_spend, booking_rate, timeline, page_url } = body || {};

  // ─── MODE DETECTION ───────────────────────────────
  // Form mode: has ad_spend or booking_rate or timeline
  // Chat mode: has message, or practice+volume, or bare name
  const isFormMode = !!(ad_spend || booking_rate || timeline);

  if (isFormMode) {
    // ─── FORM MODE ──────────────────────────────────
    const score = calcFormScore(ad_spend, booking_rate, timeline);
    const classification = classifyNumeric(score);
    const qualification = {
      score, classification,
      summary: `${name || 'Prospect'} — ${classification}. Score ${score}/100. Ad spend: ${ad_spend || 'n/a'}`,
    };
    const leadId = storeLead({
      name, email, phone, practice: spa_name || practice,
      ad_spend, booking_rate, timeline, qualification,
      source: 'direct_qualify', mode: 'form', referral_source: page_url || '',
    });
    if (classification !== 'cold') notifyLead(body, classification, score);

    return jsonResponse({
      qualification,
      reply: buildFormReply(name || 'there', classification, ad_spend, booking_rate),
      lead_id: leadId, lead_received: true, runtime_ms: Date.now() - start, mode: 'form',
    });
  }

  // ─── CHAT MODE ────────────────────────────────────
  const hasAllFields = !!(practice && volume);

  if (hasAllFields) {
    // Direct submission — all data in one shot
    const result = qualify({ practice, volume, spend });
    const qualification = {
      score: result.numericScore,
      classification: result.score,
      summary: `Practice: ${practice}, volume: ${volume}/mo → ${result.score}`,
      next_action: result.next_action,
    };
    const leadId = storeLead({
      name, email, phone, practice, volume, spend, qualification,
      source: 'direct_qualify', mode: 'chat', referral_source: page_url || '',
    });
    if (result.score !== 'cold') notifyLead(body, result.score, result.numericScore);

    return jsonResponse({
      response: STEP_MESSAGES[result.score],
      score: result.score,
      next_action: result.next_action,
      qualification,
      lead_id: leadId, lead_received: true, runtime_ms: Date.now() - start, mode: 'chat',
    });
  }

  // Conversational flow
  const state = body.state || {};
  const result = processMessage(message || '', state);
  return jsonResponse({ ...result, runtime_ms: Date.now() - start });
}
