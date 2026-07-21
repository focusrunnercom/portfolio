/**
 * Vercel Serverless Function: /api/chat
 * Lead qualification chat — OpenRouter (gpt-4o-mini) + deterministic fallback.
 *
 * Widget protocol (v3.x):
 *   POST { messages: [{role,content}], collected: {name,phone,email,practice,type,volume} }
 *   → { reply, collected, complete, mode }
 *
 * Also accepts legacy: { message, state } Schwartz machine.
 * GET → health
 *
 * NEVER route chat through unsub.focusrunner.io
 */
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { randomUUID } = require('crypto');
const { rateLimit, corsHeaders, parseBody } = require('./_middleware');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.CHAT_MODEL || 'openai/gpt-4o-mini';

const SYSTEM_PROMPT = `You are FocusRunner's polite acquisition advisor on focusrunner.io.
Brand: AI patient acquisition for med spas (qualify <2 min → SMS hold → show). Price: free audit, then $2,500 setup + $1,500/mo. We work WITH booking software (Zenoti, Boulevard, etc.) — we don't rip it out.

GOAL: qualify the visitor by collecting fields ONE AT A TIME, conversationally, short replies (1-3 sentences).

Required order (do not skip ahead):
1) type — practice type (med spa / aesthetics / other)
2) volume — monthly new patients (number or range OK)
3) name — first name
4) practice — practice / clinic name
5) email — work email
6) phone — mobile for SMS

Rules:
- Be warm, professional, concise. No walls of text. No "Sure!" / "Got it!" filler.
- Ask only for the NEXT missing field from the order above.
- If they give multiple fields in one message, extract all you can.
- When ALL six fields are present and valid, set complete=true, thank them, say a specialist will text within 24h, offer free audit.
- Never invent contact info. Never claim you booked anything.
- Do not discuss competitors by bashing brands; complementary positioning only.

You MUST respond with ONLY valid JSON (no markdown fences):
{"reply":"string to show user","collected":{"type":"","volume":"","name":"","practice":"","email":"","phone":""},"complete":false}

Merge newly extracted values into collected; keep previous non-empty values.`;

function emptyCollected(c) {
  c = c || {};
  return {
    type: String(c.type || c.niche || '').trim(),
    volume: String(c.volume || c.q1_volume || '').trim(),
    name: String(c.name || '').trim(),
    practice: String(c.practice || '').trim(),
    email: String(c.email || '').trim(),
    phone: String(c.phone || '').trim(),
  };
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');
}
function isPhone(s) {
  const d = String(s || '').replace(/\D/g, '');
  return d.length >= 10;
}
function missingField(c) {
  if (!c.type) return 'type';
  if (!c.volume) return 'volume';
  if (!c.name) return 'name';
  if (!c.practice) return 'practice';
  if (!c.email || !isEmail(c.email)) return 'email';
  if (!c.phone || !isPhone(c.phone)) return 'phone';
  return null;
}
function isComplete(c) {
  return !missingField(c);
}

function extractFromText(text, collected) {
  const c = emptyCollected(collected);
  const t = String(text || '').trim();
  if (!t) return c;

  const emailM = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (emailM) c.email = emailM[0];

  const phoneM = t.match(/(\+?1?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
  if (phoneM) c.phone = phoneM[1].trim();

  const low = t.toLowerCase();
  if (!c.type) {
    if (/med\s*spa|medical spa|aesthetics|botox|inject/.test(low)) c.type = 'med spa';
    else if (/dentist|dental/.test(low)) c.type = 'cosmetic dentistry';
    else if (/plastic/.test(low)) c.type = 'plastic surgery';
  }

  // volume-ish
  if (!c.volume && /(\d+)\s*(\+|–|-|to)?\s*(\d+)?/.test(t) && /(patient|lead|month|mo\b|\/mo)/i.test(t)) {
    c.volume = t;
  } else if (!c.volume && /^(under\s*)?\d{1,3}(\s*[-–to]+\s*\d{1,3})?(\+)?$/i.test(t)) {
    c.volume = t;
  }

  return c;
}

// ─── Deterministic fallback (no LLM) ───────────────────────────────────────
function fallbackReply(messages, collected) {
  const c = emptyCollected(collected);
  const lastUser = [...(messages || [])].reverse().find((m) => m.role === 'user');
  const text = (lastUser && lastUser.content) || '';

  // merge extract
  Object.assign(c, extractFromText(text, c));
  // field assignment by next missing if still empty
  const miss = missingField(c);
  if (miss === 'type' && text && text.length < 40 && !isEmail(text) && !isPhone(text)) {
    c.type = text;
  } else if (miss === 'volume' && text) {
    c.volume = text;
  } else if (miss === 'name' && text && !isEmail(text) && !isPhone(text) && text.length < 40) {
    c.name = text;
  } else if (miss === 'practice' && text && !isEmail(text) && !isPhone(text)) {
    c.practice = text;
  } else if (miss === 'email' && isEmail(text)) {
    c.email = text;
  } else if (miss === 'phone' && (isPhone(text) || text.replace(/\D/g, '').length >= 7)) {
    c.phone = text;
  }

  if (isComplete(c)) {
    return {
      reply:
        'Thanks ' +
        (c.name.split(' ')[0] || '') +
        ' — you\'re set. A specialist will text within 24 hours about your free Patient Acquisition Audit. We work next to your booking software, not instead of it.',
      collected: c,
      complete: true,
      mode: 'fallback',
    };
  }

  const next = missingField(c);
  const prompts = {
    type: 'Quick start — what type of practice do you run? (e.g. med spa, aesthetics, other)',
    volume: 'Roughly how many new patients per month are you bringing in right now?',
    name: 'What\'s your first name?',
    practice: 'What\'s the practice / clinic name?',
    email: 'Best email to send the audit notes?',
    phone: 'Mobile number for a quick text follow-up?',
  };

  // greeting if no real progress and first msg
  if (!c.type && !c.volume && !c.name && (messages || []).length <= 1) {
    return {
      reply:
        'Hi — I\'m the FocusRunner acquisition advisor. We help med spas fill the calendar after hours without ripping out booking software. What type of practice do you run?',
      collected: c,
      complete: false,
      mode: 'fallback',
    };
  }

  return {
    reply: prompts[next] || 'Tell me a bit more about your practice.',
    collected: c,
    complete: false,
    mode: 'fallback',
  };
}

// ─── OpenRouter ────────────────────────────────────────────────────────────
async function openRouterChat(messages, collected) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;

  const c0 = emptyCollected(collected);
  const userMessages = (messages || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-16)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

  if (userMessages.length === 0) {
    userMessages.push({ role: 'user', content: 'Hi' });
  }

  const body = {
    model: MODEL,
    temperature: 0.4,
    max_tokens: 400,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: 'Current collected JSON: ' + JSON.stringify(c0),
      },
      ...userMessages,
    ],
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://focusrunner.io',
        'X-Title': 'FocusRunner Chat Widget',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      console.warn('[chat] openrouter', res.status, errTxt.slice(0, 200));
      return null;
    }
    const data = await res.json();
    const raw = (((data || {}).choices || [])[0] || {}).message?.content || '';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // try extract json object
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) return null;
      try {
        parsed = JSON.parse(m[0]);
      } catch (e2) {
        return null;
      }
    }
    const merged = emptyCollected({ ...c0, ...(parsed.collected || {}) });
    // re-extract from last user msg as safety
    const lastUser = [...userMessages].reverse().find((m) => m.role === 'user');
    Object.assign(merged, extractFromText(lastUser && lastUser.content, merged));
    // prefer non-empty from either side
    for (const k of Object.keys(c0)) {
      if (!merged[k] && c0[k]) merged[k] = c0[k];
    }
    const complete = parsed.complete === true && isComplete(merged);
    let reply = String(parsed.reply || '').trim();
    if (!reply) {
      const fb = fallbackReply(messages, merged);
      reply = fb.reply;
    }
    if (complete && !/24/.test(reply)) {
      reply += ' A specialist will text within 24 hours.';
    }
    return {
      reply: reply.slice(0, 1200),
      collected: merged,
      complete,
      mode: 'openrouter',
    };
  } catch (e) {
    clearTimeout(t);
    console.warn('[chat] openrouter error', e.message);
    return null;
  }
}

// ─── Legacy Schwartz path ──────────────────────────────────────────────────
function processLegacy(message, state) {
  state = state || {};
  const step = state.step || 0;
  const practice = state.practice || '';
  const q1_volume = state.q1_volume || '';
  const q2_spend = state.q2_spend || '';

  if (step === 0) {
    return {
      reply: 'How many new patients are you bringing in per month?',
      state: { step: 1, practice: message, q1_volume: '', q2_spend: '', email: '', phone: '' },
      collected: emptyCollected({ practice: message }),
      complete: false,
      mode: 'legacy',
    };
  }
  if (step === 1) {
    return {
      reply: 'What are you currently spending per month on ads or marketing?',
      state: { step: 2, practice, q1_volume: message, q2_spend: '', email: '', phone: '' },
      collected: emptyCollected({ practice, volume: message }),
      complete: false,
      mode: 'legacy',
    };
  }
  if (step === 2) {
    return {
      reply: 'If you could double new patients without raising ad spend, what would that mean for the practice?',
      state: { step: 3, practice, q1_volume, q2_spend: message, email: '', phone: '' },
      collected: emptyCollected({ practice, volume: q1_volume }),
      complete: false,
      mode: 'legacy',
    };
  }
  if (step === 3) {
    return {
      reply: "One last thing — what's the best email and phone to reach you?",
      state: { step: 4, practice, q1_volume, q2_spend, q3_aspiration: message, email: '', phone: '' },
      collected: emptyCollected({ practice, volume: q1_volume }),
      complete: false,
      mode: 'legacy',
    };
  }
  // contact parse
  const emailM = String(message).match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const phoneM = String(message).match(/(\+?1?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
  const email = (emailM && emailM[0]) || state.email || '';
  const phone = (phoneM && phoneM[1]) || state.phone || '';
  const collected = emptyCollected({
    practice,
    volume: q1_volume,
    email,
    phone,
    name: practice,
    type: 'med spa',
  });
  const done = isComplete(collected) || (email && phone);
  return {
    reply: done
      ? "You're set — a specialist will text within 24 hours about your free audit."
      : 'Please share both email and phone so we can follow up.',
    state: { step: done ? 'complete' : 4, practice, q1_volume, q2_spend, email, phone },
    collected,
    complete: !!done,
    mode: 'legacy',
  };
}

// ─── Persist + notify ──────────────────────────────────────────────────────
function storeLead(lead) {
  try {
    const path = '/tmp/leads.json';
    let arr = [];
    if (existsSync(path)) {
      try {
        arr = JSON.parse(readFileSync(path, 'utf8'));
      } catch (e) {
        arr = [];
      }
    }
    if (!Array.isArray(arr)) arr = [];
    arr.push(lead);
    writeFileSync(path, JSON.stringify(arr.slice(-500), null, 2));
    console.log('[chat] stored', lead.id);
  } catch (e) {
    console.warn('[chat] store fail', e.message);
  }
}

function notifyTelegram(lead) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || '5926797455';
  if (!botToken) return;
  const text =
    '💬 SITE CHAT LEAD\n' +
    'Name: ' + (lead.name || '—') + '\n' +
    'Practice: ' + (lead.practice || '—') + '\n' +
    'Type: ' + (lead.type || '—') + '\n' +
    'Volume: ' + (lead.volume || '—') + '\n' +
    'Email: ' + (lead.email || '—') + '\n' +
    'Phone: ' + (lead.phone || '—') + '\n' +
    'Mode: ' + (lead.mode || '—') + '\n' +
    '— focusrunner.io chat';
  fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 3500), disable_web_page_preview: true }),
  }).catch((e) => console.warn('[chat] tg', e.message));
}

function notifyEmail(lead, history) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const to = process.env.LEAD_NOTIFY_EMAIL || 'hello@focusrunner.io';
  const hist = (history || [])
    .map((m) => '<div><b>' + (m.role || '') + ':</b> ' + String(m.content || '').replace(/</g, '&lt;') + '</div>')
    .join('');
  fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'FocusRunner Leads <leads@focusrunner.io>',
      to: [to],
      subject: 'Site chat lead: ' + (lead.name || lead.practice || 'Unknown'),
      html:
        '<h2>New chat lead</h2>' +
        '<p><b>Name:</b> ' + (lead.name || '') + '</p>' +
        '<p><b>Practice:</b> ' + (lead.practice || '') + '</p>' +
        '<p><b>Type:</b> ' + (lead.type || '') + '</p>' +
        '<p><b>Volume:</b> ' + (lead.volume || '') + '</p>' +
        '<p><b>Email:</b> ' + (lead.email || '') + '</p>' +
        '<p><b>Phone:</b> ' + (lead.phone || '') + '</p>' +
        '<hr/><h3>Transcript</h3>' +
        hist,
    }),
  }).catch((e) => console.warn('[chat] email', e.message));
}

function finalizeLead(collected, messages, mode) {
  const c = emptyCollected(collected);
  if (!isComplete(c)) return;
  const lead = {
    id: randomUUID(),
    ...c,
    source: 'chat_widget',
    mode: mode || 'unknown',
    created_at: new Date().toISOString(),
    history: (messages || []).slice(-30),
  };
  storeLead(lead);
  notifyTelegram(lead);
  notifyEmail(lead, messages);
}

// ─── Handler ───────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  const start = Date.now();

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  if (req.method === 'GET') {
    res.writeHead(200, corsHeaders());
    return res.end(
      JSON.stringify({
        status: 'ok',
        endpoint: '/api/chat',
        version: '3.3.0',
        mode: process.env.OPENROUTER_API_KEY ? 'openrouter+fallback' : 'fallback',
        model: MODEL,
        runtime_ms: Date.now() - start,
      })
    );
  }

  if (req.method !== 'POST') {
    res.writeHead(405, corsHeaders());
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    res.writeHead(400, corsHeaders());
    return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
  }

  // Widget protocol
  if (Array.isArray(body.messages) || body.collected || body.start) {
    const messages = body.messages || [];
    const collected = emptyCollected(body.collected);

    // Opening: pure greeting — no fake prior user turn
    const userTurns = messages.filter((m) => m && m.role === 'user' && String(m.content || '').trim());
    if (body.start === true || userTurns.length === 0) {
      const greet = {
        reply:
          "Hi — I'm FocusRunner's acquisition advisor. We help med spas fill the calendar after hours (works with your booking software, doesn't replace it). What type of practice do you run — med spa, aesthetics, or something else?",
        collected: emptyCollected(collected),
        complete: false,
        mode: 'greeting',
      };
      greet.runtime_ms = Date.now() - start;
      res.writeHead(200, corsHeaders());
      return res.end(JSON.stringify(greet));
    }

    let result = await openRouterChat(messages, collected);
    if (!result) {
      result = fallbackReply(messages, collected);
    }

    // force complete only when fields valid
    if (result.complete && !isComplete(result.collected)) {
      result.complete = false;
    }
    if (!result.complete && isComplete(result.collected)) {
      // LLM forgot flag but we have everything
      result.complete = true;
      if (!/24/.test(result.reply || '')) {
        result.reply =
          (result.reply ? result.reply + ' ' : '') +
          'You\'re all set — a specialist will text within 24 hours about your free audit.';
      }
    }

    if (result.complete) {
      finalizeLead(result.collected, messages, result.mode);
    }

    result.runtime_ms = Date.now() - start;
    res.writeHead(200, corsHeaders());
    return res.end(JSON.stringify(result));
  }

  // Legacy { message, state }
  const message = body.message || '';
  const state = body.state || {};
  const legacy = processLegacy(message, state);
  if (legacy.complete) {
    finalizeLead(legacy.collected, [{ role: 'user', content: message }], 'legacy');
  }
  legacy.runtime_ms = Date.now() - start;
  res.writeHead(200, corsHeaders());
  return res.end(JSON.stringify(legacy));
};
