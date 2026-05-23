/**
 * /api/email — Catch-all email handler
 * Routes: POST /send, /batch, /webhook, /leads
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.RESEND_API_KEY;
  const url = new URL(req.url, 'https://focusrunner.io');
  const path = url.pathname.replace(/\/+$/, '') || '';
  const route = path.split('/').pop();

  if (route === 'send') return handleSend(req, res, apiKey);
  if (route === 'batch') return handleBatch(req, res, apiKey);
  if (route === 'webhook') return handleWebhook(req, res);
  if (route === 'leads') return handleLeads(req, res, apiKey);
  if (route === 'email') return handleLeads(req, res, apiKey);

  // Query-based routing: /api/email?type=send|batch|webhook|leads
  const type = url.searchParams.get('type');
  if (type === 'send') return handleSend(req, res, apiKey);
  if (type === 'batch') return handleBatch(req, res, apiKey);
  if (type === 'webhook') return handleWebhook(req, res);
  if (type === 'leads') return handleLeads(req, res, apiKey);

  // Default: POST to /api/email = lead capture
  return handleLeads(req, res, apiKey);
}

async function handleSend(req, res, apiKey) {
  const { to, subject, html, text, from, template, tags } = req.body;
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
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'focusrunner/1.0' },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    return r.ok ? res.status(200).json({ success: true, id: d.id }) : res.status(r.status).json({ error: d });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}

async function handleBatch(req, res, apiKey) {
  const { emails } = req.body;
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
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'focusrunner/1.0' },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    return r.ok ? res.status(200).json({ success: true, count: emails.length, data: d }) : res.status(r.status).json({ error: d });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}

async function handleWebhook(req, res) {
  const evt = req.body;
  console.log('[webhook]', evt?.type, evt?.data?.email_id);
  try {
    await fetch('http://127.0.0.1:3100/api/agents/me/inbox-lite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: `email.${evt?.type}`, emailId: evt?.data?.email_id, from: evt?.data?.from, to: evt?.data?.to, subject: evt?.data?.subject, timestamp: evt?.created_at })
    }).catch(() => {});
  } catch (_) {}
  return res.status(200).json({ received: true, type: evt?.type });
}

async function handleLeads(req, res, apiKey) {
  const { name, email, practice, message } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const welcomeHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background:#0f172a;color:#e2e8f0;font-family:Arial,sans-serif;padding:40px"><div style="max-width:600px;margin:0 auto"><h1 style="color:#6eff8a">Welcome to FocusRunner</h1><p>Hi ${name || 'there'},</p><p>Thanks for reaching out. We help med spa owners acquire practices using AI-powered automation.</p><p><strong>What happens next:</strong></p><ol><li>Our team reviews your inquiry within 24 hours</li><li>We'll send you a personalized acquisition strategy</li><li>Schedule a call to discuss your goals</li></ol><p style="margin-top:30px;padding:20px;background:#1e293b;border-radius:8px"><strong>FocusRunner AI</strong><br>$2.5K setup · $2.5K/mo · 15 leads/30 day guarantee</p><p style="color:#94a3b8;font-size:12px;margin-top:30px">FocusRunner AI · Miami, FL<br><a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#94a3b8">Unsubscribe</a></p></div></body></html>`;

  const notifyHtml = `<p><strong>New lead:</strong><br>Name: ${name||'N/A'}<br>Email: ${email}<br>Practice: ${practice||'N/A'}<br>Message: ${message||'N/A'}</p>`;

  try {
    const [w, n] = await Promise.all([
      fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'focusrunner/1.0' },
        body: JSON.stringify({ from: 'FocusRunner <leads@focusrunner.io>', to: [email], subject: 'Welcome to FocusRunner – Your Med Spa Acquisition Journey', html: welcomeHtml, tags: [{ name: 'type', value: 'welcome' }, { name: 'source', value: 'landing' }] })
      }),
      fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'focusrunner/1.0' },
        body: JSON.stringify({ from: 'FocusRunner <leads@focusrunner.io>', to: ['focusrunnercom@gmail.com'], subject: `New Lead: ${name||email} – ${practice||'No practice'}`, html: notifyHtml, tags: [{ name: 'type', value: 'lead-notification' }] })
      })
    ]);
    const wj = await w.json(), nj = await n.json();
    return res.status(200).json({ success: true, welcomeId: wj.id, message: 'Check your inbox for next steps' });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}
