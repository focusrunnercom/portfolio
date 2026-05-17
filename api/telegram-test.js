/**
 * Debug endpoint: test Telegram notification directly from Vercel.
 * GET /api/telegram-test → tests Telegram send, returns result.
 */
module.exports = async function handler(req, res) {
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  var botToken = process.env.TELEGRAM_BOT_TOKEN;
  var chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    res.writeHead(500, headers);
    return res.end(JSON.stringify({
      error: 'Missing env vars',
      hasToken: !!botToken,
      hasChat: !!chatId,
    }));
  }

  try {
    var tgRes = await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '[PIPELINE TEST] Vercel → Telegram is working.',
        disable_web_page_preview: true,
      }),
    });

    var data = await tgRes.json();
    res.writeHead(tgRes.ok ? 200 : 502, headers);
    return res.end(JSON.stringify({
      ok: tgRes.ok,
      status: tgRes.status,
      telegram: data,
    }));
  } catch (err) {
    res.writeHead(502, headers);
    return res.end(JSON.stringify({ error: err.message }));
  }
};
