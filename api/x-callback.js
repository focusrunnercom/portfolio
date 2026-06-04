// X.com OAuth 2.0 callback handler
// Called after user authorizes the app — exchanges code for token

const { rateLimit, corsHeaders } = require('./_middleware');

module.exports = async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  const { code, state, error, error_description } = req.query;

  // OAuth error response from X
  if (error) {
    return res.status(400).json({ error, description: error_description });
  }

  // Authorization code received — display it for CLI copy
  if (code) {
    return res.status(200).send(`
      <html><body style="font-family:monospace;background:#111;color:#6eff8a;padding:40px;">
        <h2>Authorization Code</h2>
        <p>Copy this code and paste it back in your terminal:</p>
        <textarea readonly style="width:100%;height:60px;background:#000;color:#6eff8a;border:1px solid #6eff8a;padding:10px;font-size:14px;">${code}</textarea>
        <p style="color:#888;margin-top:20px;">state: ${state || 'none'}</p>
        <script>navigator.clipboard.writeText("${code}")</script>
      </body></html>
    `);
  }

  // No code — show status
  return res.status(200).json({
    status: 'ok',
    service: 'x.com OAuth callback',
    usage: 'GET /api/x-callback?code=...&state=...'
  });
}
