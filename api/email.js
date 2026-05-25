/**
 * /api/email — Catch-all email handler
 * Routes: body.action = "send"|"batch"|"webhook"|"leads"
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.RESEND_API_KEY;

  let body = req.body;
  if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
    try { body = JSON.parse(await readBody(req)); } catch (_) { body = {}; }
  }

  const url = new URL(req.url, 'https://focusrunner.io');
  const path = url.pathname.replace(/\/+$/, '') || '';
  const route = path.split('/').pop();

  if (route === 'send' || body.action === 'send') return handleSend(res, apiKey, body);
  if (route === 'batch' || body.action === 'batch') return handleBatch(res, apiKey, body);
  if (route === 'webhook' || body.action === 'webhook') return handleWebhook(res, body);
  return handleLeads(res, apiKey, body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function handleSend(res, apiKey, body) {
  const { to, subject, html, text, from, template, tags } = body;
  if (!to) return res.status(400).json({ error: 'Missing "to"' });
  const payload = {
    from: from || 'FocusRunner <leads@focusrunner.io>',
    to: Array.isArray(to) ? to : [to],
    subject: subject || 'Message from FocusRunner',
    tags: tags || [{ name: 'source', value: 'agency' }]
  };
  if (template) { payload.template = template; }
  else if (html) { payload.html = html; if (text) payload.text = text; }
  else if (text) { payload.text = text; }
  else return res.status(400).json({ error: 'Missing html, text, or template' });
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'focusrunner/1.0' },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    return r.ok ? res.status(200).json({ success: true, id: d.id }) : res.status(r.status).json({ error: d });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}

async function handleBatch(res, apiKey, body) {
  const { emails } = body;
  if (!emails || !Array.isArray(emails)) return res.status(400).json({ error: 'Missing "emails" array' });
  if (emails.length > 100) return res.status(400).json({ error: 'Max 100 emails' });
  const payload = emails.map(e => ({
    from: e.from || 'FocusRunner <leads@focusrunner.io>',
    to: Array.isArray(e.to) ? e.to : [e.to],
    subject: e.subject || 'Message from FocusRunner',
    html: e.html, text: e.text,
    tags: e.tags || [{ name: 'source', value: 'agency-batch' }]
  }));
  try {
    const r = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'focusrunner/1.0' },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    return r.ok ? res.status(200).json({ success: true, count: emails.length, data: d }) : res.status(r.status).json({ error: d });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}

async function handleWebhook(res, body) {
  const evt = body;
  console.log('[webhook]', evt?.type, evt?.data?.email_id);
  try {
    await fetch('http://127.0.0.1:3100/api/agents/me/inbox-lite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: `email.${evt?.type}`, emailId: evt?.data?.email_id, from: evt?.data?.from, to: evt?.data?.to, subject: evt?.data?.subject, timestamp: evt?.created_at })
    }).catch(() => {});
  } catch (_) {}
  return res.status(200).json({ received: true, type: evt?.type });
}

// --- Follow-up email templates (Emails 2-6) ---
function followupHtml(step, name) {
  const brand = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d120f;padding:40px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#0f1412;border:1px solid #1a2620;">`;
  const header = (label) => `<tr><td style="padding:24px;border-bottom:1px solid #1a2620;"><span style="color:#6eff8a;font-weight:700;font-size:16px;">&gt;_ FocusRunner</span></td></tr><tr><td style="padding:24px;font-size:14px;line-height:1.8;"><p style="color:#6eff8a;font-size:11px;letter-spacing:1px;margin-bottom:16px;">${label} — STEP ${step} OF 6</p>`;
  const footer = `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td align="center"><a href="https://focusrunner.io/#start" style="display:inline-block;padding:12px 28px;background:#6eff8a;color:#000;text-decoration:none;font-weight:700;font-size:13px;font-family:'JetBrains Mono',monospace;">→ Get Your Free Audit</a></td></tr></table></td></tr><tr><td style="padding:20px 24px;border-top:1px solid #1a2620;text-align:center;"><p style="color:#6eff8a;font-size:12px;font-weight:700;margin-bottom:4px;">&gt;_ FocusRunner AI</p><p style="color:#3f4a43;font-size:11px;margin-bottom:8px;"><a href="https://focusrunner.io" style="color:#6eff8a;text-decoration:none;">focusrunner.io</a></p><p style="color:#3f4a43;font-size:10px;">Daniil from FocusRunner — 15+ leads in 30 days guaranteed</p><p style="color:#3f4a43;font-size:10px;margin-top:8px;"><a href="mailto:leads@focusrunner.io?subject=Unsubscribe" style="color:#3f4a43;">Unsubscribe</a> — one click, instantly</p></td></tr></table></td></tr></table>`;

  const emails = {
    2: {
      label: 'INDUSTRY INSIGHT',
      body: `<h1 style="color:#d4e5d8;font-size:20px;font-weight:700;margin-bottom:12px;">The $14.2B shift most acquirers miss</h1><p style="color:#7a8c7e;margin-bottom:16px;">Hi ${name},</p><p style="color:#7a8c7e;margin-bottom:16px;">Private equity deployed <strong style="color:#d4e5d8;">$14.2B</strong> in healthcare roll-ups in 2025. A big chunk went into med spas.</p><p style="color:#7a8c7e;margin-bottom:16px;">Here's what they know that most independent acquirers don't:</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#0d120f;border-left:3px solid #6eff8a;margin-bottom:24px;"><tr><td style="padding:16px;"><p style="color:#7a8c7e;font-size:13px;margin-bottom:4px;">Practices with AI patient pipelines: <strong style="color:#6eff8a;">3.2–4.5× SDE</strong></p><p style="color:#7a8c7e;font-size:13px;">Practices without: <strong style="color:#d4e5d8;">2.0–2.8× SDE</strong></p></td></tr></table><p style="color:#7a8c7e;margin-bottom:16px;">That's a <strong style="color:#6eff8a;">$400K–$700K difference</strong> on a typical $1.5M revenue practice.</p><p style="color:#7a8c7e;margin-bottom:16px;">→ <a href="https://focusrunner.io/blog/state-of-med-spa-acquisition-2026.html" style="color:#6eff8a;">Read the full research report</a></p><p style="color:#7a8c7e;margin-bottom:8px;">What market are you targeting? Hit reply — I'll send specific comp data.</p>`
    },
    3: {
      label: 'HOW IT WORKS',
      body: `<h1 style="color:#d4e5d8;font-size:20px;font-weight:700;margin-bottom:12px;">20–50 qualified leads/month</h1><p style="color:#7a8c7e;margin-bottom:16px;">Hi ${name},</p><p style="color:#7a8c7e;margin-bottom:16px;">Here's exactly what we build:</p><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td style="padding:8px 0;color:#6eff8a;font-weight:700;font-size:13px;">1. AI Chatbot</td><td style="color:#7a8c7e;font-size:12px;">Qualifies leads 24/7 on your landing page</td></tr><tr><td style="padding:8px 0;color:#6eff8a;font-weight:700;font-size:13px;">2. SMS/Email Nurture</td><td style="color:#7a8c7e;font-size:12px;">Automated follow-ups that book consultations</td></tr><tr><td style="padding:8px 0;color:#6eff8a;font-weight:700;font-size:13px;">3. Ad Optimization</td><td style="color:#7a8c7e;font-size:12px;">AI adjusts spend across channels in real time</td></tr><tr><td style="padding:8px 0;color:#6eff8a;font-weight:700;font-size:13px;">4. Retention Engine</td><td style="color:#7a8c7e;font-size:12px;">Flags at-risk patients before they churn</td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="background:#0d120f;border:1px solid #1a2620;margin-bottom:24px;"><tr><td style="padding:16px;"><p style="color:#6eff8a;font-weight:700;font-size:13px;margin-bottom:8px;">&gt; Real results (Miami Med Spa, 90 days):</p><p style="color:#7a8c7e;font-size:12px;margin-bottom:4px;">→ 287% conversion improvement</p><p style="color:#7a8c7e;font-size:12px;margin-bottom:4px;">→ 78% lower cost per lead</p><p style="color:#7a8c7e;font-size:12px;margin-bottom:4px;">→ 25–40% lead-to-consultation rate (was 8%)</p><p style="color:#7a8c7e;font-size:12px;">→ No-show rate: 25% → 8%</p></td></tr></table><p style="color:#6eff8a;font-weight:700;font-size:13px;margin-bottom:4px;">$2,500 setup + $2,500/mo — 15+ leads in 30 days guaranteed</p><p style="color:#7a8c7e;font-size:12px;margin-bottom:16px;">→ <a href="https://focusrunner.io/#cases" style="color:#6eff8a;">See all case studies</a></p>`
    },
    4: {
      label: 'OBJECTION HANDLING',
      body: `<h1 style="color:#d4e5d8;font-size:20px;font-weight:700;margin-bottom:12px;">"What if it doesn't work for my market?"</h1><p style="color:#7a8c7e;margin-bottom:16px;">Hi ${name},</p><p style="color:#7a8c7e;margin-bottom:16px;">That's the most common question. Fair question.</p><p style="color:#6eff8a;font-weight:700;font-size:14px;margin-bottom:8px;">Here's the honest answer:</p><p style="color:#7a8c7e;margin-bottom:16px;">We guarantee 15+ qualified leads in 30 days. If we don't hit that — you don't pay.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#0d120f;border:1px solid #1a2620;margin-bottom:24px;"><tr><td style="padding:16px;"><p style="color:#6eff8a;font-weight:700;font-size:12px;margin-bottom:8px;">&gt; By market:</p><p style="color:#7a8c7e;font-size:12px;margin-bottom:4px;">Miami: 20–50 leads/month</p><p style="color:#7a8c7e;font-size:12px;margin-bottom:4px;">Dallas: 18–40 leads/month</p><p style="color:#7a8c7e;font-size:12px;margin-bottom:4px;">Phoenix: 15–35 leads/month</p><p style="color:#7a8c7e;font-size:12px;">Smaller markets: 10–20 leads/month</p></td></tr></table><p style="color:#7a8c7e;margin-bottom:16px;">Hit reply with your city. I'll run the comps — 5 minutes, no commitment.</p><p style="color:#3f4a43;font-size:11px;">P.S. We've never had to issue a refund on the guarantee.</p>`
    },
    5: {
      label: 'CLIENT STORY',
      body: `<h1 style="color:#d4e5d8;font-size:20px;font-weight:700;margin-bottom:12px;">"We closed 4 acquisitions in 6 months"</h1><p style="color:#7a8c7e;margin-bottom:16px;">Hi ${name},</p><p style="color:#7a8c7e;margin-bottom:16px;">One of our clients acquired 4 med spas in 6 months. Not because they had more capital — because they had a system.</p><p style="color:#7a8c7e;margin-bottom:16px;">Every acquisition: buy → deploy AI pipeline (7 days) → fill chairs → stabilize → acquire next. By #3, the pipeline fed itself.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#0d120f;border-left:3px solid #6eff8a;margin-bottom:24px;"><tr><td style="padding:16px;"><p style="color:#7a8c7e;font-size:12px;margin-bottom:8px;"><em>"FocusRunner took us from 8 leads/month to 35. Cost per lead dropped from $400 to $110."</em></p><p style="color:#3f4a43;font-size:11px;">— Miami Med Spa Owner</p></td></tr></table><p style="color:#7a8c7e;margin-bottom:16px;">→ <a href="https://focusrunner.io/#cases" style="color:#6eff8a;">See all case studies</a></p>`
    },
    6: {
      label: 'FINAL OFFER',
      body: `<h1 style="color:#d4e5d8;font-size:20px;font-weight:700;margin-bottom:12px;">Final call — your free audit</h1><p style="color:#7a8c7e;margin-bottom:16px;">Hi ${name},</p><p style="color:#7a8c7e;margin-bottom:16px;">I've sent you data, case studies, and the exact playbook. Here's the bottom line:</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#0d120f;border:1px solid #1a2620;margin-bottom:24px;"><tr><td style="padding:16px;"><p style="color:#6eff8a;font-weight:700;font-size:13px;margin-bottom:8px;">&gt; Your free audit includes:</p><p style="color:#7a8c7e;font-size:12px;margin-bottom:4px;">→ Market analysis for your target city</p><p style="color:#7a8c7e;font-size:12px;margin-bottom:4px;">→ Competitor patient acquisition audit</p><p style="color:#7a8c7e;font-size:12px;margin-bottom:4px;">→ Projected lead volume + cost per lead</p><p style="color:#7a8c7e;font-size:12px;">→ Custom deployment timeline</p></td></tr></table><p style="color:#7a8c7e;margin-bottom:16px;">Takes 15 minutes. No commitment.</p><p style="color:#7a8c7e;margin-bottom:8px;">If this isn't the right time — I'll keep sending insights. You can unsubscribe anytime.</p>`
    }
  };

  const e = emails[step] || emails[2];
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#0d120f;font-family:'Courier New',Consolas,monospace;color:#d4e5d8;">${brand}${header(e.label)}${e.body}${footer}</body></html>`;
}

async function handleLeads(res, apiKey, body) {
  const { name, email, practice, message } = body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const nameSafe = escapeHtml(name || 'there');
  const practiceSafe = escapeHtml(practice || 'N/A');
  const messageSafe = escapeHtml(message || 'N/A');
  const now = new Date();
  const sched = (days) => new Date(now.getTime() + days * 86400000).toISOString();

  // Welcome email — dark theme, JetBrains Mono
  const welcomeHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#0d120f;font-family:'Courier New',Consolas,monospace;color:#d4e5d8;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#0d120f;padding:40px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#0f1412;border:1px solid #1a2620;"><tr><td style="padding:24px;border-bottom:1px solid #1a2620;"><span style="color:#6eff8a;font-weight:700;font-size:16px;">&gt;_ FocusRunner</span></td></tr><tr><td style="padding:24px;font-size:14px;line-height:1.8;"><p style="color:#6eff8a;font-size:11px;letter-spacing:1px;margin-bottom:16px;">WELCOME — STEP 1 OF 6</p><h1 style="color:#d4e5d8;font-size:22px;font-weight:700;margin-bottom:12px;">Your Med Spa Acquisition Journey Starts Here</h1><p style="color:#7a8c7e;margin-bottom:16px;">Hi ${nameSafe},</p><p style="color:#7a8c7e;margin-bottom:16px;">You just took the first step toward acquiring a med spa with an AI patient pipeline already built in.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#0d120f;border:1px solid #1a2620;margin-bottom:24px;"><tr><td style="padding:16px;"><p style="color:#6eff8a;font-weight:700;font-size:13px;margin-bottom:8px;">&gt; What to expect (2-3x/week):</p><p style="color:#7a8c7e;font-size:12px;margin-bottom:4px;">&rarr; Acquisition insights from 200+ practice transactions</p><p style="color:#7a8c7e;font-size:12px;margin-bottom:4px;">&rarr; Real valuation multiples and deal structures</p><p style="color:#7a8c7e;font-size:12px;margin-bottom:4px;">&rarr; AI patient pipeline strategies that work</p><p style="color:#7a8c7e;font-size:12px;">&rarr; One-click unsubscribe anytime</p></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="background:#0d120f;border-left:3px solid #6eff8a;margin-bottom:24px;"><tr><td style="padding:16px;"><p style="color:#6eff8a;font-size:24px;font-weight:700;margin-bottom:4px;">62%</p><p style="color:#7a8c7e;font-size:12px;">of acquired med spas lack systematic marketing. That's where the profit lives.</p></td></tr></table><p style="color:#7a8c7e;font-size:13px;margin-bottom:24px;">Two quick questions (hit reply &mdash; real human reads every response):</p><p style="color:#7a8c7e;font-size:12px;margin-bottom:4px;">1. What market are you looking to acquire in?</p><p style="color:#7a8c7e;font-size:12px;margin-bottom:24px;">2. What's your biggest concern about the process?</p><p style="color:#3f4a43;font-size:11px;">Next email: tomorrow &mdash; the $14.2B shift most acquirers miss.</p></td></tr><tr><td style="padding:20px 24px;border-top:1px solid #1a2620;text-align:center;"><p style="color:#6eff8a;font-size:12px;font-weight:700;margin-bottom:4px;">&gt;_ FocusRunner AI</p><p style="color:#3f4a43;font-size:11px;margin-bottom:8px;"><a href="https://focusrunner.io" style="color:#6eff8a;text-decoration:none;">focusrunner.io</a></p><p style="color:#3f4a43;font-size:10px;">Daniil from FocusRunner &mdash; 15+ leads in 30 days guaranteed</p><p style="color:#3f4a43;font-size:10px;margin-top:8px;"><a href="mailto:leads@focusrunner.io?subject=Unsubscribe" style="color:#3f4a43;">Unsubscribe</a> &mdash; one click, instantly</p></td></tr></table></td></tr></table></body></html>`;

  // CEO notification
  const notifyHtml = `<p><strong>New lead:</strong><br>Name: ${nameSafe}<br>Email: ${email}<br>Practice: ${practiceSafe}<br>Message: ${messageSafe}</p>`;

  // 6-email autoresponder — #1 now, #2-6 scheduled via Resend's scheduled_at
  const sequence = [
    { subject: 'Your Med Spa Acquisition Journey Starts Here [Inside]', html: welcomeHtml, scheduled_at: null },
    { subject: 'The $14.2B shift most acquirers miss', html: followupHtml(2, nameSafe), scheduled_at: sched(1) },
    { subject: '20–50 qualified leads/month [How it works]', html: followupHtml(3, nameSafe), scheduled_at: sched(3) },
    { subject: '"What if it doesn\'t work for my market?"', html: followupHtml(4, nameSafe), scheduled_at: sched(5) },
    { subject: '"We closed 4 acquisitions in 6 months" [Client story]', html: followupHtml(5, nameSafe), scheduled_at: sched(7) },
    { subject: 'Final call — your free audit [Last email]', html: followupHtml(6, nameSafe), scheduled_at: sched(10) },
  ];

  try {
    // Send CEO notification + 6 autoresponder emails sequentially (debugging)
    const sendOne = async (payload, label) => {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'focusrunner/1.0' },
          body: JSON.stringify(payload)
        });
        const body = await r.json().catch(() => '');
        return { ok: r.ok, status: r.status, label, id: body?.id, error: body?.message || body?.name || null };
      } catch (err) {
        return { ok: false, status: 0, label, error: err.message };
      }
    };

    const results = [];

    // 1. CEO notification (no delay needed)
    results.push(await sendOne({
      from: 'FocusRunner <leads@focusrunner.io>',
      to: ['focusrunnercom@gmail.com'],
      subject: `New Lead: ${name || email} – ${practice || 'No practice'}`,
      html: notifyHtml,
      tags: [{ name: 'type', value: 'lead-notification' }]
    }, 'CEO notify'));

    // 2-7. Autoresponder sequence — 200ms between each to avoid Resend 5/s rate limit
    for (let i = 0; i < sequence.length; i++) {
      const e = sequence[i];
      if (i > 0) await new Promise(r => setTimeout(r, 200));
      results.push(await sendOne({
        from: 'Daniil from FocusRunner <leads@focusrunner.io>',
        to: [email],
        subject: e.subject,
        html: e.html,
        scheduled_at: e.scheduled_at || undefined,
        headers: {
          'List-Unsubscribe': '<mailto:leads@focusrunner.io>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        tags: [{ name: 'type', value: 'autoresponder' }, { name: 'step', value: String(i + 1) }]
      }, `Email ${i + 1}`));
    }

    const failed = results.filter(r => !r.ok);
    const sent = results.filter(r => r.ok).length - 1; // minus CEO

    return res.status(200).json({
      success: failed.length === 0,
      scheduled: sent,
      total: results.length,
      failed: failed.map(f => ({ label: f.label, status: f.status, error: f.error })),
      message: failed.length === 0 ? `Check your inbox. 6 emails queued — #1 arriving now.` : `${failed.length} email(s) failed. Check details.`
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
