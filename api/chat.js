/**
 * Vercel Serverless Function: /api/chat
 * SINGLE-FILE — zero imports. CJS for Vercel Node 18.x Hobby compat.
 * Lead qualification — rules-based scoring. Stores leads. Email notif on hot/warm.
 */

var fs = require('fs');
var crypto = require('crypto');
var STORE = '/tmp/leads.json';

function readAll() {
  try {
    if (!fs.existsSync(STORE)) return [];
    return JSON.parse(fs.readFileSync(STORE, 'utf-8')).leads || [];
  } catch (e) { return []; }
}

function store(d) {
  try {
    var lead = {
      id: crypto.randomUUID(),
      name: String(d.name || '').slice(0, 200),
      phone: String(d.phone || '').slice(0, 30),
      email: String(d.email || '').slice(0, 254),
      practice: String(d.practice || '').slice(0, 200),
      qualification: d.qualification || null,
      source: d.source || 'chat',
      timestamp: new Date().toISOString()
    };
    var all = readAll();
    all.push(lead);
    if (all.length > 500) all = all.slice(-500);
    fs.writeFileSync(STORE, JSON.stringify({ leads: all }));
    return lead.id;
  } catch (e) { return null; }
}

function qualify(v) {
  var n = parseInt(String(v.volume || '0'), 10) || 0;
  var p = !!(v.practice || '').trim();
  if (p && n >= 50) return { classification: 'hot', score: 85, next_action: 'book_call' };
  if (p && n >= 10) return { classification: 'warm', score: 45, next_action: 'send_info' };
  return { classification: 'cold', score: 10, next_action: 'drip' };
}

function sendNotif(d, cls, score) {
  var k = process.env.RESEND_API_KEY;
  if (!k) return;
  var t = process.env.NOTIFY_EMAIL || 'hello@focusrunner.com';
  var colors = { hot: '#dc2626', warm: '#ea580c', cold: '#2563eb' };
  var bc = colors[cls] || '#6b7280';
  var name = d.name || '';
  var phone = d.phone || '';
  var practice = d.practice || '';
  var html = '<div style="background:#0f172a;padding:24px;color:#fff;border-radius:12px">' +
    '<h1>New Lead</h1>' +
    '<p style="display:inline-block;padding:4px 12px;border-radius:20px;background:' + bc + '">' +
    cls.toUpperCase() + ' ' + score + '/100</p>' +
    '<p><b>' + name + '</b> ' + phone + ' ' + practice + '</p></div>';
  fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + k, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'FocusRunner <leads@focusrunner.io>',
      to: t,
      subject: 'Lead: ' + name + ' - ' + cls.toUpperCase(),
      html: html
    })
  }).catch(function() {});
}

var MSGS = {
  greeting: 'Hey, I see you are checking out FocusRunner. Quick 3 questions.',
  ask_practice: 'What is your practice name?',
  ask_volume: 'How many new patients per month?',
  ask_spend: 'What is your monthly ad spend?',
  hot: 'Great fit! Our team will reach out within 24h.',
  warm: 'Solid prospect. We will send case studies.',
  cold: 'Thanks. Reach out anytime at hello@focusrunner.com.'
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

module.exports = function(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors()); return res.end(); }
  if (req.method === 'GET') { res.writeHead(200, cors()); return res.end(JSON.stringify({ status: 'ok', endpoint: '/api/chat' })); }
  if (req.method !== 'POST') { res.writeHead(405, cors()); return res.end(JSON.stringify({ error: 'Method not allowed' })); }

  var body = '';
  req.on('data', function(chunk) { body += chunk; });
  req.on('end', function() {
    var d;
    try { d = JSON.parse(body); } catch (e) { res.writeHead(400, cors()); return res.end(JSON.stringify({ error: 'Invalid JSON' })); }

    var name = d.name || '', email = d.email || '', phone = d.phone || '';
    var practice = d.practice || '', volume = d.volume || '', spend = d.spend || '';
    var state = d.state || {}, step = state.step || 'greeting';

    if (practice && volume) {
      var q = qualify({ practice: practice, volume: volume, spend: spend });
      var qo = { score: q.score, classification: q.classification, next_action: q.next_action };
      var id = store({ name: name, email: email, phone: phone, practice: practice, source: 'chat', qualification: qo });
      if (q.classification !== 'cold') sendNotif({ name: name, phone: phone, practice: practice }, q.classification, q.score);
      return res.end(JSON.stringify({ response: MSGS[q.classification], score: q.classification, next_action: q.next_action, qualification: qo, lead_id: id }));
    }

    if (step === 'greeting') return res.end(JSON.stringify({ response: MSGS.greeting + '\n\n' + MSGS.ask_practice, next_step: 'ask_volume', requires_input: true, field: 'practice' }));
    if (step === 'ask_volume') return res.end(JSON.stringify({ response: MSGS.ask_volume, next_step: 'ask_spend', requires_input: true, field: 'volume' }));
    if (step === 'ask_spend') return res.end(JSON.stringify({ response: MSGS.ask_spend, next_step: 'done', requires_input: true, field: 'spend' }));
    if (step === 'done') {
      var q = qualify({ practice: state.practice || '', volume: state.volume || '' });
      return res.end(JSON.stringify({ response: MSGS[q.classification], score: q.classification, next_action: q.next_action, next_step: 'complete' }));
    }
    res.end(JSON.stringify({ response: MSGS.greeting, next_step: 'ask_volume', requires_input: true, field: 'practice' }));
  });
};
