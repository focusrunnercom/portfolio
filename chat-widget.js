/**
 * FocusRunner AI — Standalone Chatbot Widget
 *
 * v3.2 — LEAD CAPTURE FIXED + smooth typing animation
 */
(function() {
  'use strict';

  var script = document.currentScript || document.querySelector('script[src*="chat-widget"]');
  var API_BASE = script ? (script.getAttribute('data-api-base') || window.location.origin) : window.location.origin;
  var AI_API = 'https://unsub.focusrunner.io/api/chat';
  var LEAD_API_ENDPOINT = API_BASE + '/api/webhook';
  var LEAD_DUPLICATE_API_ENDPOINT = 'https://unsub.focusrunner.io/api/capture-lead';

  var CONFIG = { maxRetries: 3, retryBaseDelay: 500, retryMaxDelay: 3000, storageKey: 'fr_lead_queue', version: '3.2' };

  function getQueue() { try { return JSON.parse(localStorage.getItem(CONFIG.storageKey) || '[]'); } catch(e) { return []; } }
  function saveToQueue(payload) { var q = getQueue(); q.push({ payload: payload, ts: Date.now(), retries: 0 }); try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(q)); } catch(e) {} }
  function removeFromQueue(idx) { var q = getQueue(); q.splice(idx, 1); try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(q)); } catch(e) {} }
  function flushQueue() {
    var q = getQueue(); if (q.length === 0) return;
    q.forEach(function(item, idx) {
      fetch(LEAD_API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.payload) })
        .then(function(r) { if (r.ok) removeFromQueue(idx); else item.retries++; }).catch(function() { item.retries++; });
    });
    try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(q)); } catch(e) {}
  }
  setTimeout(flushQueue, 1000);

  function retryFetch(url, options, maxRetries) {
    maxRetries = maxRetries || CONFIG.maxRetries; var lastError; var attempt = 1;
    function tryFetch() {
      return fetch(url, options).then(function(res) {
        if (res.ok) return res;
        if (res.status === 429 || res.status >= 500) {
          lastError = 'HTTP ' + res.status;
          if (attempt < maxRetries) { var delay = Math.min(CONFIG.retryBaseDelay * Math.pow(2, attempt-1), CONFIG.retryMaxDelay); attempt++; return new Promise(function(r) { setTimeout(r, delay); }).then(tryFetch); }
        }
        return res;
      }).catch(function(err) {
        lastError = err.message;
        if (attempt < maxRetries) { var delay = Math.min(CONFIG.retryBaseDelay * Math.pow(2, attempt-1), CONFIG.retryMaxDelay); attempt++; return new Promise(function(r) { setTimeout(r, delay); }).then(tryFetch); }
        throw new Error('All retries failed: ' + lastError);
      });
    }
    return tryFetch();
  }

  function submitLead(leadData) {
    var payload = JSON.stringify({ name: leadData.name, phone: leadData.phone, email: leadData.email || '', practice: leadData.practice, source: 'chat_widget' });
    retryFetch(LEAD_API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
      .then(function(r) { if (!r.ok) saveToQueue(JSON.parse(payload)); }).catch(function() { saveToQueue(JSON.parse(payload)); });
    fetch(LEAD_DUPLICATE_API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead: leadData, history: _conversation }) }).catch(function() {});
  }

  // ─── Smooth CSS ──────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '#fr-chat-fab { position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; width: 56px; height: 56px; border-radius: 0; border: 1px solid #6eff8a; background: #0f0f13; color: #6eff8a; font-size: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.2s ease, box-shadow 0.2s ease; font-family: "JetBrains Mono", monospace; }',
    '#fr-chat-fab:hover { transform: scale(1.08); box-shadow: 0 0 24px rgba(110,255,138,0.25); }',
    '#fr-chat-fab .fr-dot { position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; background: #6eff8a; animation: fr-pulse 2s infinite; }',
    '@keyframes fr-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }',
    '@keyframes fr-border-glow { 0%,100% { box-shadow: 0 0 12px rgba(110,255,138,0.3), 0 0 24px rgba(110,255,138,0.1), 0 8px 32px rgba(0,0,0,0.5); border-color: #6eff8a; } 50% { box-shadow: 0 0 20px rgba(110,255,138,0.5), 0 0 40px rgba(110,255,138,0.2), 0 8px 32px rgba(0,0,0,0.5); border-color: #8affa0; } }',
    '#fr-chat-window { position: fixed; bottom: 92px; right: 24px; z-index: 2147483646; width: 340px; max-height: 500px; background: #0f0f13; border: 1px solid #2a2a30; display: none; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.5); font-family: "JetBrains Mono", monospace; opacity: 0; transform: translateY(10px) scale(0.96); transition: opacity 0.25s ease, transform 0.25s ease, border-color 0.25s ease; }',
    '#fr-chat-window.open { display: flex; opacity: 1; transform: translateY(0) scale(1); animation: fr-border-glow 2.5s ease-in-out infinite; }',
    '#fr-chat-header { padding: 14px 16px; border-bottom: 1px solid #1e1e24; display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 700; color: #6eff8a; }',
    '#fr-chat-close { background: none; border: none; color: #4a4a52; cursor: pointer; font-size: 18px; font-family: "JetBrains Mono", monospace; transition: color 0.15s; }',
    '#fr-chat-close:hover { color: #ff5c4d; }',
    '#fr-chat-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; max-height: 300px; }',
    '.fr-chat-msg { font-size: 12px; line-height: 1.5; max-width: 85%; padding: 10px 14px; animation: fr-fadeIn 0.3s ease; }',
    '.fr-chat-msg.bot { background: #1a1a1e; color: #d4d4dc; align-self: flex-start; border: 1px solid #1e1e24; }',
    '.fr-chat-msg.user { background: rgba(110,255,138,0.08); color: #d4d4dc; align-self: flex-end; }',
    '@keyframes fr-fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }',
    '#fr-chat-input-area { padding: 12px; border-top: 1px solid #1e1e24; display: none; gap: 8px; }',
    '#fr-chat-input { flex: 1; background: #1a1a1e; border: 1px solid #1e1e24; color: #d4d4dc; padding: 10px 12px; font-family: "JetBrains Mono", monospace; font-size: 12px; outline: none; transition: border-color 0.15s; }',
    '#fr-chat-input:focus { border-color: #6eff8a; }',
    '#fr-chat-send { background: #6eff8a; color: #000; border: none; padding: 10px 16px; cursor: pointer; font-family: "JetBrains Mono", monospace; font-size: 12px; font-weight: 700; transition: background 0.15s; }',
    '#fr-chat-send:hover { background: #8affa0; }',
    '.fr-chat-option { display: block; width: 100%; text-align: left; background: #1a1a1e; border: 1px solid #1e1e24; color: #d4d4dc; padding: 10px 14px; margin: 4px 0; cursor: pointer; font-family: "JetBrains Mono", monospace; font-size: 11px; transition: border-color 0.15s, background 0.15s; }',
    '.fr-chat-option:hover { border-color: #6eff8a; color: #6eff8a; background: rgba(110,255,138,0.05); }',
    '.fr-chat-error { font-size: 11px; color: #ff5c4d; padding: 8px 14px; text-align: center; }',
    '@media (max-width: 480px) { #fr-chat-fab { bottom: 20px; right: 16px; } #fr-chat-window { right: 8px; bottom: 80px; width: calc(100vw - 16px); max-width: 360px; } }'
  ].join('\n');
  document.head.appendChild(style);

  // ─── HTML ────────────────────────────────────────────────────
  var container = document.createElement('div');
  container.innerHTML = [
    '<div id="fr-chat-window">',
    '  <div id="fr-chat-header">>_ Free Practice Audit<button id="fr-chat-close">&times;</button></div>',
    '  <div id="fr-chat-messages"></div>',
    '  <div id="fr-chat-input-area">',
    '    <input type="text" id="fr-chat-input" placeholder="Type your message..." />',
    '    <button id="fr-chat-send">&rarr;</button>',
    '  </div>',
    '</div>',
    '<button id="fr-chat-fab">&#128172;<span class="fr-dot"></span></button>'
  ].join('\n');
  document.body.appendChild(container);

  // ─── State ────────────────────────────────────────────────────
  var _active = false, _leadData = {};
  var _msgs = document.getElementById('fr-chat-messages');
  var _window = document.getElementById('fr-chat-window');
  var _fab = document.getElementById('fr-chat-fab');
  var _close = document.getElementById('fr-chat-close');
  var _inputArea = document.getElementById('fr-chat-input-area');
  var _input = document.getElementById('fr-chat-input');
  var _send = document.getElementById('fr-chat-send');
  var _conversation = [], _aiMode = false;

  // ─── Typing effect ────────────────────────────────────────────
  function typeMsg(text, cls, callback) {
    var div = document.createElement('div');
    div.className = 'fr-chat-msg ' + cls;
    _msgs.appendChild(div);
    var i = 0;
    function type() {
      if (i < text.length) {
        div.textContent += text[i];
        i++;
        _msgs.scrollTop = _msgs.scrollHeight;
        setTimeout(type, 15 + Math.random() * 20);
      } else if (callback) { callback(); }
    }
    type();
  }

  function addMsg(text, cls) {
    var div = document.createElement('div');
    div.className = 'fr-chat-msg ' + cls;
    div.textContent = text;
    _msgs.appendChild(div);
    _msgs.scrollTop = _msgs.scrollHeight;
  }

  function addOptions(opts) {
    opts.forEach(function(o) {
      var btn = document.createElement('button');
      btn.className = 'fr-chat-option';
      btn.textContent = o.label;
      btn.onclick = function() {
        var all = _msgs.querySelectorAll('.fr-chat-option');
        for (var i = 0; i < all.length; i++) { all[i].remove(); }
        addMsg(o.label, 'user');
        _leadData[o.field] = o.value || o.label;
        _nextField = o.nextField || _nextField;
        if (o.next) o.next();
      };
      _msgs.appendChild(btn);
    });
    _msgs.scrollTop = _msgs.scrollHeight;
  }

  // ─── Extract lead info from user text ─────────────────────────
  function extractLeadInfo(text) {
    text = text.trim();
    // Phone detection
    var phoneMatch = text.match(/(\+?1?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
    if (phoneMatch && !_leadData.phone) _leadData.phone = phoneMatch[1];

    // If we need name and there's no phone pattern, it's probably a name
    if (!_leadData.name && !phoneMatch && text.length < 50) {
      _leadData.name = text;
      return 'name';
    }
    // If we need phone and there's a phone
    if (!_leadData.phone && phoneMatch) {
      _leadData.phone = phoneMatch[1];
      return 'phone';
    }
    // If we need practice and it's not a phone
    if (!_leadData.practice && !phoneMatch) {
      _leadData.practice = text;
      return 'practice';
    }
    return null;
  }

  // ─── Send to AI ──────────────────────────────────────────────
  function sendToAI() {
    if (_conversation.length === 0) return;
    retryFetch(AI_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: _conversation, collected: _leadData })
    }, 2).then(function(r) {
      if (r.ok) return r.json();
      throw new Error('AI API unreachable');
    }).then(function(data) {
      _conversation.push({ role: 'assistant', content: data.reply });
      var c = data.collected || {};
      if (c.name) _leadData.name = c.name;
      if (c.email) _leadData.email = c.email;
      if (c.phone) _leadData.phone = c.phone;
      if (c.practice) _leadData.practice = c.practice;
      // Submit lead ONLY when server says conversation is complete
      if (data.complete) {
        if (!_leadData.submitted) {
          _leadData.submitted = true;
          submitLead(_leadData);
        }
      }
      typeMsg(data.reply, 'bot', function() { _inputArea.style.display = 'flex'; });
    }).catch(function() { runFallbackChat(); });
  }

  // ─── Fallback ─────────────────────────────────────────────────
  function runFallbackChat() {
    _aiMode = false;
    addMsg('Hey\u2014I\u2019m FocusRunner\u2019s acquisition advisor. Let\u2019s run a quick audit.', 'bot');
    addOptions([
      { label: 'Let\u2019s do it', field: 'started', value: true, next: askNiche },
      { label: 'Just browsing', field: 'started', value: false, next: function() { addMsg('No worries. Ping us when ready to scale.', 'bot'); } }
    ]);
  }

  function askNiche() {
    addMsg('What type of practice?', 'bot');
    addOptions([
      { label: 'Med Spa', field: 'niche', value: 'med_spa', next: askVolume, nextField: 'volume' },
      { label: 'Cosmetic Dent.', field: 'niche', value: 'cosmetic_dentistry', next: askVolume },
      { label: 'Plastic Surgery', field: 'niche', value: 'plastic_surgery', next: askVolume },
      { label: 'Other', field: 'niche', value: 'other', next: askVolume }
    ]);
  }

  function askVolume() {
    addMsg('Monthly new patients?', 'bot');
    addOptions([
      { label: 'Under 10', field: 'volume', value: 'under_10', next: askName, nextField: 'name' },
      { label: '10\u201330', field: 'volume', value: '10_30', next: askName },
      { label: '30\u201360', field: 'volume', value: '30_60', next: askName },
      { label: '60+', field: 'volume', value: '60_plus', next: askName }
    ]);
  }

  function askName() { _inputArea.style.display = 'flex'; addMsg('Great! What\u2019s your name?', 'bot'); _nextField = 'name'; }
  function finishFallback() { _inputArea.style.display = 'none'; submitLead(_leadData); addMsg('Thanks! We\u2019ll text you within 24h. Any questions?', 'bot'); }
  function handleInputFallback(text) {
    if (!_leadData.name) { _leadData.name = text; addMsg('Phone number?', 'bot'); _nextField = 'phone'; }
    else if (!_leadData.phone) { _leadData.phone = text; addMsg('Practice name?', 'bot'); _nextField = 'practice'; }
    else if (!_leadData.practice) { _leadData.practice = text; finishFallback(); }
  }

  // ─── Start ────────────────────────────────────────────────────
  function startChat() {
    _active = true; _aiMode = true;
    retryFetch(AI_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi! I run a med spa. Can you help me get more patients?' }], collected: {} })
    }, 2).then(function(r) {
      if (r.ok) return r.json();
      throw new Error('Failed');
    }).then(function(data) {
      _leadData = {};
      _conversation = [
        { role: 'user', content: 'Hi! I run a med spa. Can you help me get more patients?' },
        { role: 'assistant', content: data.reply }
      ];
      typeMsg(data.reply, 'bot', function() { _inputArea.style.display = 'flex'; });
    }).catch(function() { runFallbackChat(); });
  }

  function sendMessage() {
    var text = _input.value.trim();
    if (!text) return;
    addMsg(text, 'user');
    _input.value = '';
    if (_aiMode) {
      // Smart lead extraction from user messages
      var isPhone = text.match(/(\+?1?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
      var isEmail = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if (isEmail && !_leadData.email) _leadData.email = text;
      else if (!_leadData.name && !isPhone && !isEmail) _leadData.name = text;
      else if (!_leadData.phone && isPhone) _leadData.phone = text.replace(/[^0-9\-\(\)\+\.\s]/g,'');
      else if (!_leadData.phone && text.length > 5 && !isPhone && !isEmail) _leadData.phone = text;
      else if (!_leadData.practice && !isEmail) _leadData.practice = text;
      _conversation.push({ role: 'user', content: text });
      sendToAI();
    } else { handleInputFallback(text); }
  }

  // ─── Events ───────────────────────────────────────────────────
  _fab.onclick = function() {
    var isOpen = _window.classList.contains('open');
    if (isOpen) { _window.classList.remove('open'); }
    else { _window.classList.add('open'); if (!_active) setTimeout(startChat, 350); }
  };
  _close.onclick = function() { _window.classList.remove('open'); };
  _send.onclick = sendMessage;
  _input.onkeydown = function(e) { if (e.key === 'Enter') sendMessage(); };
})();
