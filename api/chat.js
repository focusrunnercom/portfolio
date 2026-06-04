/**
 * Vercel Serverless Function: /api/chat
 * Lead qualification chat endpoint — Schwartz framework, server-side.
 * CJS for Vercel Node 18.x Hobby compat.
 *
 * Features:
 *   4-question Schwartz state machine (name → volume → spend → aspiration)
 *   Stores leads to /tmp/leads.json (shared with /api/direct-qualify)
 *   Scores hot/warm/cold based on volume + spend
 *   Forwards to GHL via /api/webhook logic on completion
 *   Sends email notification for hot/warm leads
 *
 * POST /api/chat  { message, state?, name?, practice?, volume?, spend?, email?, phone? }
 * GET  /api/chat  health check
 */

const { readFileSync, writeFileSync, existsSync } = require('fs');
const { randomUUID } = require('crypto');
const { rateLimit, corsHeaders, parseBody } = require('./_middleware');

// ─── Schwartz Framework Questions ──────────────────────────────────────────

const QUESTIONS = [
  null,  // Q0: practice name — asked in initial render
  {
    text: "How many new patients are you bringing in per month?",
    reason: "IDENTIFIED → Volume tells us the size of the leak.",
  },
  {
    text: "What are you currently spending per month on ads or marketing?",
    reason: "DESIRE → We compare their spend to our $41 CPA benchmark.",
  },
  {
    text: "If you could double your new patients without increasing ad spend, what would that mean for your practice?",
    reason: "CREDIBILITY → Tests readiness. Strong answers = hot lead.",
  },
];

const STEP_MESSAGES = {
  hot: "You're qualified. Your free Patient Acquisition Audit is being prepared. A specialist will text you within 24 hours.",
  warm: "You're a great prospect. One of our specialists will reach out with personalized case studies for your practice.",
  cold: "Thanks for your interest. We've noted your details. When you're ready to scale, reach out anytime at hello@focusrunner.com.",
};

// ─── Scoring Engine ────────────────────────────────────────────────────────

const SCORE_THRESHOLDS = {
  hot: { minVolume: 50 },
  warm: { minVolume: 10 },
};

function qualify(practice, volume, spend) {
  const hasPractice = !!(practice || '').trim();
  const vol = parseInt(String(volume || '0').replace(/[,\+]/g, ''), 10) || 0;

  if (hasPractice && vol >= SCORE_THRESHOLDS.hot.minVolume) {
    return { score: 'hot', numericScore: 85, next_action: 'book_call' };
  }
  if (hasPractice && vol >= SCORE_THRESHOLDS.warm.minVolume) {
    return { score: 'warm', numericScore: 45, next_action: 'send_info' };
  }
  return { score: 'cold', numericScore: 10, next_action: 'drip' };
}

// ─── State Machine ─────────────────────────────────────────────────────────

function processMessage(message, state) {
  state = state || {};
  const step = state.step || 0;
  const practice = state.practice || '';
  const q1_volume = state.q1_volume || '';
  const q2_spend = state.q2_spend || '';
  const email = state.email || '';
  const phone = state.phone || '';

  if (step === 0) {
    // Received practice name
    return {
      reply: QUESTIONS[1].text,
      reason: QUESTIONS[1].reason,
      state: { step: 1, practice: message, q1_volume: '', q2_spend: '', email: '', phone: '' },
      next_field: 'volume',
      requires_input: true,
      step_complete: false,
    };
  }

  if (step === 1) {
    return {
      reply: QUESTIONS[2].text,
      reason: QUESTIONS[2].reason,
      state: { step: 2, practice, q1_volume: message, q2_spend: '', email: '', phone: '' },
      next_field: 'spend',
      requires_input: true,
      step_complete: false,
    };
  }

  if (step === 2) {
    return {
      reply: QUESTIONS[3].text,
      reason: QUESTIONS[3].reason,
      state: { step: 3, practice, q1_volume, q2_spend: message, email: '', phone: '' },
      next_field: 'aspiration',
      requires_input: true,
      step_complete: false,
    };
  }

  if (step === 3) {
    // All questions answered; ask for contact info
    return {
      reply: "One last thing — what's the best email and phone to reach you at?",
      reason: null,
      state: { step: 4, practice, q1_volume, q2_spend, q3_aspiration: message, email: '', phone: '' },
      next_field: 'contact',
      requires_input: true,
      step_complete: false,
    };
  }

  if (step === 4) {
    // Received contact info — extract email + phone
    const emailMatch = message.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi);
    const phoneMatch = message.match(/([\+\d][\d\s\-\(\)\.]{7,20})/);
    const parsedEmail = emailMatch ? emailMatch[0] : email;
    const parsedPhone = phoneMatch ? phoneMatch[0].replace(/[\s\-\(\)\.]/g, '') : phone;

    // Score
    const result = qualify(practice, q1_volume, q2_spend);

    // Build lead
    const lead = {
      name: practice,
      email: parsedEmail || 'no-email@submitted',
      phone: parsedPhone || 'no-phone',
      practice: practice,
      practiceName: practice,
      volume: q1_volume,
      q1_volume: q1_volume,
      ad_spend: q2_spend,
      q2_spend: q2_spend,
      aspiration: message,
      q3_aspiration: message,
      qualification: {
        score: result.numericScore,
        classification: result.score,
        summary: `Practice: ${practice} · Volume: ${q1_volume}/mo · Spend: ${q2_spend} → ${result.score}`,
      },
      source: 'lead_capture_ai_chat',
      qualified_by: 'ai_chat',
      referral_source: '',
      timestamp: new Date().toISOString(),
    };

    // Store lead
    const leadId = storeLead(lead);

    // Fire-and-forget: forward to webhook-like destinations
    forwardToDestinations(lead, result.score);

    // Fire-and-forget: email notification for hot/warm
    if (result.score !== 'cold') {
      notifyLeadEmail(lead, result);
    }

    return {
      reply: STEP_MESSAGES[result.score],
      reason: null,
      state: { step: 'complete', practice, q1_volume, q2_spend, email: parsedEmail, phone: parsedPhone },
      next_field: null,
      requires_input: false,
      step_complete: true,
      qualification: lead.qualification,
      lead_id: leadId,
      // Include rendered completion data for the frontend
      end_screen: {
        title: result.score === 'hot'
          ? "You Qualify — Here's What Happens Next"
          : "Thanks — Here's What Happens Next",
        message: result.score === 'hot'
          ? "One of our patient acquisition specialists will review your responses and text your personalized ROI audit within 24 hours."
          : "We'll send resources and case studies to your email. Our team may follow up if there's a good fit.",
      },
    };
  }

  // Complete or unknown step
  return {
    reply: "Already submitted! Our team will reach out.",
    state: { step: 'complete' },
    requires_input: false,
    step_complete: true,
  };
}

// ─── Lead Storage (shared /tmp/leads.json) ─────────────────────────────────

const STORAGE_PATH = '/tmp/leads.json';
const MAX_LEADS = 500;

function readLeads() {
  try {
    if (!existsSync(STORAGE_PATH)) return [];
    const raw = readFileSync(STORAGE_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data.leads) ? data.leads : [];
  } catch (_) {
    return [];
  }
}

function storeLead(leadData) {
  try {
    const lead = {
      id: randomUUID(),
      name: String(leadData.name || leadData.practiceName || '').slice(0, 200),
      phone: String(leadData.phone || '').slice(0, 30),
      email: String(leadData.email || '').slice(0, 254),
      practice: String(leadData.practice || leadData.practiceName || '').slice(0, 200),
      volume: String(leadData.volume || leadData.q1_volume || ''),
      ad_spend: String(leadData.ad_spend || leadData.q2_spend || ''),
      aspiration: String(leadData.aspiration || leadData.q3_aspiration || ''),
      qualification: leadData.qualification || null,
      source: leadData.source || 'lead_capture_ai_chat',
      referral_source: String(leadData.referral_source || '').slice(0, 100),
      timestamp: new Date().toISOString(),
      notified: false,
    };

    let leads = readLeads();
    leads.push(lead);
    if (leads.length > MAX_LEADS) {
      leads = leads.slice(-MAX_LEADS);
    }
    writeFileSync(STORAGE_PATH, JSON.stringify({ leads }, null, 2), 'utf-8');
    console.log(`[chat] Lead stored: ${lead.id} - ${lead.name}`);
    return lead.id;
  } catch (err) {
    console.error('[chat] Store failed:', err.message);
    return null;
  }
}

// ─── Forward to Destinations (fire-and-forget) ─────────────────────────────

function forwardToDestinations(lead, classification) {
  const ghlApiKey = process.env.GHL_API_KEY;
  const ghlBase = 'https://rest.gohighlevel.com/v1';

  // 1. GHL contact create
  if (ghlApiKey) {
    const ghlPayload = {
      name: lead.name || 'Chat Lead',
      phone: lead.phone || '',
      email: lead.email || '',
      companyName: lead.practice || '',
      tags: ['focusrunner_chat', 'qualified_' + classification],
      customField: {
        patient_volume: lead.volume || '',
        ad_spend: lead.ad_spend || '',
        qualification: classification,
        qualification_score: String(lead.qualification?.score || 0),
      },
    };

    fetch(ghlBase + '/contacts/', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + ghlApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ghlPayload),
    }).then(function(res) {
      if (!res.ok) console.warn('[chat] GHL forward failed:', res.status);
      else console.log('[chat] GHL contact created');
    }).catch(function(err) {
      console.warn('[chat] GHL network error:', err.message);
    });
  }

  // 2. Telegram notification
  notifyTelegram(lead, classification);
}

// ─── Email Notification (fire-and-forget) ──────────────────────────────────

function notifyLeadEmail(lead, result) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[chat] RESEND_API_KEY not set — skipping notif');
    return;
  }

  const recipient = process.env.NOTIFY_EMAIL || 'hello@focusrunner.com';
  const badgeColor = { hot: '#dc2626', warm: '#ea580c', cold: '#2563eb' }[result.score] || '#6b7280';
  const esc = function(s) {
    if (typeof s !== 'string') return String(s || '');
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  const html = [
    '<div style="font-family:sans-serif;max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden">',
    '<div style="background:#0f172a;color:#fff;padding:24px 32px">',
    '<h1 style="margin:0;font-size:20px">New Chat Lead</h1>',
    '<p style="opacity:.7;margin:4px 0 0">focusrunner.io · ' + new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</p>',
    '<div style="display:inline-block;padding:4px 12px;border-radius:20px;color:#fff;background:' + badgeColor + ';font-weight:600;font-size:13px;margin-top:8px">' + result.score.toUpperCase() + ' · ' + result.numericScore + '/100</div>',
    '</div>',
    '<div style="padding:24px 32px">',
    '<div style="margin-bottom:12px"><div style="font-size:11px;color:#6b7280;font-weight:600">Practice</div><div>' + esc(lead.name || lead.practice || '—') + '</div></div>',
    '<div style="margin-bottom:12px"><div style="font-size:11px;color:#6b7280;font-weight:600">Phone</div><div>' + esc(lead.phone || '—') + '</div></div>',
    '<div style="margin-bottom:12px"><div style="font-size:11px;color:#6b7280;font-weight:600">Email</div><div>' + esc(lead.email || '—') + '</div></div>',
    (lead.volume ? '<div style="margin-bottom:12px"><div style="font-size:11px;color:#6b7280;font-weight:600">Monthly Volume</div><div>' + esc(lead.volume) + '</div></div>' : ''),
    (lead.ad_spend ? '<div style="margin-bottom:12px"><div style="font-size:11px;color:#6b7280;font-weight:600">Ad Spend</div><div>' + esc(lead.ad_spend) + '</div></div>' : ''),
    '</div>',
    '<div style="padding:16px 32px 24px;font-size:11px;color:#9ca3af;text-align:center">FocusRunner AI · Patient acquisition for medical aesthetics</div>',
    '</div>',
  ].join('\n');

  fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'User-Agent': 'FocusRunner/1.0' },
    body: JSON.stringify({
      from: 'FocusRunner Leads <leads@focusrunner.io>',
      to: recipient,
      subject: 'New Chat Lead: ' + esc(lead.name || lead.practice || 'Anonymous') + ' — ' + result.score.toUpperCase(),
      html: html,
    }),
  }).then(function(r) {
    if (!r.ok) console.warn('[chat] Notif failed:', r.status);
  }).catch(function(err) {
    console.warn('[chat] Notif error:', err.message);
  });
}

// ─── Telegram Notification (fire-and-forget) ────────────────────────────────

function notifyTelegram(lead, classification) {
  var botToken = process.env.TELEGRAM_BOT_TOKEN;
  var chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.warn('[chat] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping Telegram');
    return;
  }

  var badge = { hot: '[HOT]', warm: '[WARM]', cold: '[COLD]' }[classification] || '[LEAD]';

  var text = badge + ' NEW LEAD: ' + classification.toUpperCase() + '\n\n' +
    'Practice: ' + (lead.name || lead.practice || 'Unknown') + '\n' +
    'Phone: ' + (lead.phone || '—') + '\n' +
    'Email: ' + (lead.email || '—') + '\n' +
    'Volume: ' + (lead.volume || '—') + ' patients/mo\n' +
    'Ad Spend: ' + (lead.ad_spend || '—') + '\n' +
    'Score: ' + (lead.qualification?.score || '—') + '/100\n\n' +
    '— focusrunner.io chat widget';

  fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      disable_web_page_preview: true,
    }),
  }).then(function(r) {
    if (!r.ok) console.warn('[chat] Telegram failed:', r.status);
    else console.log('[chat] Telegram sent');
  }).catch(function(err) {
    console.warn('[chat] Telegram error:', err.message);
  });
}

// ─── Handler ───────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  var start = Date.now();

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  if (req.method === 'GET') {
    res.writeHead(200, corsHeaders());
    return res.end(JSON.stringify({
      status: 'ok',
      endpoint: '/api/chat',
      version: '1.0.0',
      mode: 'schwartz-state-machine',
      runtime_ms: Date.now() - start,
    }));
  }

  if (req.method !== 'POST') {
    res.writeHead(405, corsHeaders());
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  var body;
  try {
    body = await parseBody(req);
  } catch (e) {
    res.writeHead(400, corsHeaders());
    return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
  }

  var message = body.message || '';
  var state = body.state || {};

  // Process through state machine
  var result = processMessage(message, state);

  result.runtime_ms = Date.now() - start;
  res.writeHead(200, corsHeaders());
  return res.end(JSON.stringify(result));
};
