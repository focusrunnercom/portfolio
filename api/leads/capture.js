/**
 * POST /api/leads/capture — Capture lead and send welcome email
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, practice, message } = req.body;
  const apiKey = process.env.RESEND_API_KEY;

  if (!email) return res.status(400).json({ error: 'Email required' });

  // 1. Send welcome email to lead
  const welcomeHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="background:#0f172a;color:#e2e8f0;font-family:Arial,sans-serif;padding:40px">
<div style="max-width:600px;margin:0 auto">
  <h1 style="color:#6eff8a">Welcome to FocusRunner</h1>
  <p>Hi ${name || 'there'},</p>
  <p>Thanks for reaching out. We help med spa owners acquire practices using AI-powered automation.</p>
  <p><strong>Here's what happens next:</strong></p>
  <ol>
    <li>Our team reviews your inquiry within 24 hours</li>
    <li>We'll send you a personalized acquisition strategy</li>
    <li>Schedule a call to discuss your goals</li>
  </ol>
  <p style="margin-top:30px;padding:20px;background:#1e293b;border-radius:8px">
    <strong>FocusRunner AI</strong><br>
    $2.5K setup · $2.5K/mo · 15 leads/30 day guarantee
  </p>
  <p style="color:#94a3b8;font-size:12px;margin-top:30px">
    FocusRunner AI · Miami, FL<br>
    <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#94a3b8">Unsubscribe</a>
  </p>
</div></body></html>`;

  const welcomePayload = {
    from: 'FocusRunner <leads@focusrunner.io>',
    to: [email],
    subject: 'Welcome to FocusRunner — Your Med Spa Acquisition Journey',
    html: welcomeHtml,
    tags: [{ name: 'type', value: 'welcome' }, { name: 'source', value: 'landing-page' }]
  };

  // 2. Notify agency owner
  const notifyPayload = {
    from: 'FocusRunner <leads@focusrunner.io>',
    to: ['focusrunnercom@gmail.com'],
    subject: `New Lead: ${name || email} — ${practice || 'No practice'}`,
    html: `<p><strong>New lead captured:</strong></p>
      <p>Name: ${name || 'N/A'}<br>Email: ${email}<br>Practice: ${practice || 'N/A'}<br>Message: ${message || 'N/A'}</p>`,
    tags: [{ name: 'type', value: 'lead-notification' }]
  };

  try {
    // Send both emails
    const [welcomeRes, notifyRes] = await Promise.all([
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'focusrunner/1.0' },
        body: JSON.stringify(welcomePayload)
      }),
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'focusrunner/1.0' },
        body: JSON.stringify(notifyPayload)
      })
    ]);

    const welcomeData = await welcomeRes.json();
    const notifyData = await notifyRes.json();

    return res.status(200).json({
      success: true,
      welcomeId: welcomeData.id,
      message: 'Check your inbox for next steps'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}