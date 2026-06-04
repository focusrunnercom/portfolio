/**
 * Vercel Serverless Function: /api/direct-qualify
 * DeepSeek-independent lead qualification endpoint.
 * CJS-style for Vercel Hobby Node 18.x compatibility.
 *
 * Zero external API calls. Zero dependencies. Zero AI.
 * Rules-based qualification powered by:
 *   - Chat flow: practice + volume -> hot/warm/cold (3-question state machine)
 *   - Form flow: ad_spend + booking_rate + timeline -> 0-100 numeric score
 *
 * Features:
 * - File-based lead storage in /tmp/leads.json (zero infra)
 * - Email notification via Resend for hot/warm leads (fire-and-forget)
 * - CORS for any origin
 * - <500ms response on every path
 */

const { readFileSync, writeFileSync, existsSync } = require('fs');
const { randomUUID } = require('crypto');
const { rateLimit, requireAuth, corsHeaders, parseBody } = require('./_middleware');

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
const TIMELINE_SCORES = { 'ASAP \u2014 ready now': 30, 'This quarter': 20, 'Just researching': 5 };

function calcFormScore(adSpend, bookingRate, timeline) {
  return (SPEND_SCORES[adSpend] || 5) + (BOOKING_SCORES[bookingRate] || 5) + (TIMELINE_SCORES[timeline] || 5);
}

function classifyNumeric(score) {
  if (score >= 65) return 'hot';
  if (score >= 30) return 'warm';
  return 'cold';
}

// =============================================================================
// Lead Storage
// =============================================================================

const STORAGE_PATH = '/tmp/leads.json';
const MAX_LEADS = 500;

function readLeads() {
  try {
    if (!existsSync(STORAGE_PATH)) return [];
    const raw = readFileSync(STORAGE_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data.leads) ? data.leads : [];
  } catch (_) { return []; }
}

function storeLead(data) {
  try {
    const lead = { id: randomUUID(), timestamp: new Date().toISOString(), notified: false, ...data };
    let leads = readLeads();
    leads.push(lead);
    if (leads.length > MAX_LEADS) leads = leads.slice(-MAX_LEADS);
    writeFileSync(STORAGE_PATH, JSON.stringify({ leads }, null, 2), 'utf-8');
    console.log('[direct-qualify] Lead stored:', lead.id, '-', lead.name || 'anon');
    return lead.id;
  } catch (err) {
    console.error('[direct-qualify] Store failed:', err.message);
    return null;
  }
}

// =============================================================================
// Email Notification (fire-and-forget via Resend)
// =============================================================================

async function notifyLead(lead, classification, score) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn('[direct-qualify] RESEND_API_KEY not set — skipping notif'); return; }
  const recipient = process.env.NOTIFY_EMAIL || 'hello@focusrunner.com';
  const badgeColor = { hot: '#dc2626', warm: '#ea580c', cold: '#2563eb' }[classification] || '#6b7280';
  const name = lead.name || '\u2014';
  const phone = lead.phone || '\u2014';
  const email = lead.email || '\u2014';
  const practice = lead.practice || lead.spa_name || '\u2014';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'User-Agent': 'FocusRunner/1.0' },
      body: JSON.stringify({
        from: 'FocusRunner Leads <leads@focusrunner.io>',
        to: recipient,
        subject: 'New Lead: ' + name + ' \u2014 ' + classification.toUpperCase() + ' (' + score + '/100)',
        html: '<div style="font-family:sans-serif;max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden">' +
          '<div style="background:#0f172a;color:#fff;padding:24px 32px"><h1 style="margin:0">New Lead Captured</h1>' +
          '<p style="opacity:.7">direct-qualify</p>' +
          '<div style="display:inline-block;padding:4px 12px;border-radius:20px;color:#fff;background:' + badgeColor + ';font-weight:600;font-size:13px">' +
          classification.toUpperCase() + ' &middot; ' + score + '/100</div></div>' +
          '<div style="padding:24px 32px">' +
          '<div style="margin-bottom:12px"><div style="font-size:11px;color:#6b7280;font-weight:600">Name</div><div>' + name + '</div></div>' +
          '<div style="margin-bottom:12px"><div style="font-size:11px;color:#6b7280;font-weight:600">Phone</div><div>' + phone + '</div></div>' +
          '<div style="margin-bottom:12px"><div style="font-size:11px;color:#6b7280;font-weight:600">Email</div><div>' + email + '</div></div>' +
          '<div style="margin-bottom:12px"><div style="font-size:11px;color:#6b7280;font-weight:600">Practice</div><div>' + practice + '</div></div>' +
          '</div></div>',
      }),
    });
    if (!res.ok) console.error('[direct-qualify] Notif error:', res.status);
  } catch (err) { console.error('[direct-qualify] Notif failed:', err.message); }
}

// =============================================================================
// HTTP Helpers (delegated to _middleware.js)
// =============================================================================

// =============================================================================
// Handler
// =============================================================================

module.exports = async function directQualifyHandler(req, res) {
  if (!rateLimit(req, res)) return;
  const start = Date.now();

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  if (req.method === 'GET') {
    res.writeHead(200, corsHeaders());
    return res.end(JSON.stringify({
      status: 'ok',
      endpoint: '/api/direct-qualify',
      version: '2.0.0',
      modes: {
        chat: { fields: ['message', 'name', 'practice', 'volume', 'spend'] },
        form: { fields: ['name', 'email', 'phone', 'spa_name', 'ad_spend', 'booking_rate', 'timeline'] },
      },
      runtime_ms: Date.now() - start,
    }));
  }

  if (req.method !== 'POST') {
    res.writeHead(405, corsHeaders());
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  if (!requireAuth(req, res)) return;

  let data;
  try { data = await parseBody(req); } catch (_) {
    res.writeHead(400, corsHeaders());
    return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
  }

  // IIFE block — rest of handler uses data
  (async () => {
    const { message, name, email, phone, practice, volume, spend, spa_name, ad_spend, booking_rate, timeline, page_url } = data;

    // Mode detection: form mode if ad_spend / booking_rate / timeline present
    const isFormMode = !!(ad_spend || booking_rate || timeline);

    if (isFormMode) {
      const score = calcFormScore(ad_spend, booking_rate, timeline);
      const classification = classifyNumeric(score);
      const qualification = { score, classification, summary: (name || 'Prospect') + ' \u2014 ' + classification + '. Score ' + score + '/100. Ad spend: ' + (ad_spend || 'n/a') };
      const leadId = storeLead({ name, email, phone, practice: spa_name || practice, ad_spend, booking_rate, timeline, qualification, source: 'direct_qualify', mode: 'form', referral_source: page_url || '' });
      if (classification !== 'cold') notifyLead(data, classification, score);

      const tierMsg = {
        hot: "Great fit — we'll get you on a free strategy call.",
        warm: "Good fit — let's send you a case study.",
        cold: "Thanks — we'll send resources when you're ready to scale.",
      };

      res.writeHead(200, corsHeaders());
      return res.end(JSON.stringify({
        qualification,
        reply: 'Hey ' + (name || 'there') + ' \u2014 ' + (tierMsg[classification] || tierMsg.cold),
        lead_id: leadId,
        lead_received: true,
        runtime_ms: Date.now() - start,
        mode: 'form',
      }));
    }

    // Chat mode: all fields in one shot
    if (practice && volume) {
      const result = qualify({ practice, volume, spend });
      const qualification = { score: result.numericScore, classification: result.score, summary: 'Practice: ' + practice + ', volume: ' + volume + '/mo \u2192 ' + result.score, next_action: result.next_action };
      const leadId = storeLead({ name, email, phone, practice, volume, spend, qualification, source: 'direct_qualify', mode: 'chat', referral_source: page_url || '' });
      if (result.score !== 'cold') notifyLead(data, result.score, result.numericScore);

      res.writeHead(200, corsHeaders());
      return res.end(JSON.stringify({
        response: STEP_MESSAGES[result.score],
        score: result.score,
        next_action: result.next_action,
        qualification,
        lead_id: leadId,
        lead_received: true,
        runtime_ms: Date.now() - start,
        mode: 'chat',
      }));
    }

    // Conversational
    const state = data.state || {};
    const step = state.step || 'greeting';

    switch (step) {
      case 'greeting':
        return res.end(JSON.stringify({ response: STEP_MESSAGES.greeting + '\n\n' + STEP_MESSAGES.ask_practice, next_step: 'ask_volume', requires_input: true, field: 'practice', runtime_ms: Date.now() - start }));
      case 'ask_volume':
        return res.end(JSON.stringify({ response: STEP_MESSAGES.ask_volume, next_step: 'ask_spend', requires_input: true, field: 'volume', runtime_ms: Date.now() - start }));
      case 'ask_spend':
        return res.end(JSON.stringify({ response: STEP_MESSAGES.ask_spend, next_step: 'done', requires_input: true, field: 'spend', runtime_ms: Date.now() - start }));
      case 'done': {
        const result = qualify({ practice: state.practice || '', volume: state.volume || '', spend: message });
        return res.end(JSON.stringify({ response: STEP_MESSAGES[result.score], score: result.score, next_action: result.next_action, next_step: 'complete', requires_input: false, runtime_ms: Date.now() - start }));
      }
      default:
        return res.end(JSON.stringify({ response: STEP_MESSAGES.greeting, next_step: 'ask_volume', requires_input: true, field: 'practice', runtime_ms: Date.now() - start }));
    }
  })();
};
