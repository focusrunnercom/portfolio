/**
 * FocusRunner AI — Standalone Chatbot Widget
 *
 * Embed on any site with:
 *   <script src="https://focusrunner.io/chat-widget.js" data-api-base="https://focusrunner.io"></script>
 *
 * Self-contained IIFE. Injects its own CSS + HTML.
 * Calls /api/chat on the data-api-base host (defaults to embedding page origin).
 */
(function() {
  'use strict';

  var script = document.currentScript || document.querySelector('script[src*="chat-widget"]');
  var API_BASE = script ? (script.getAttribute('data-api-base') || window.location.origin) : window.location.origin;

  // ─── Inject CSS ──────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '#focusrunner-chat-fab {',
    '  position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;',
    '  width: 56px; height: 56px; border-radius: 0; border: 1px solid #6eff8a;',
    '  background: #0f0f13; color: #6eff8a;',
    '  font-size: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center;',
    '  transition: transform .15s, box-shadow .15s; font-family: "JetBrains Mono", monospace;',
    '}',
    '#focusrunner-chat-fab:hover { transform: scale(1.05); box-shadow: 0 0 20px rgba(110,255,138,0.15); }',
    '#focusrunner-chat-fab .fr-dot {',
    '  position: absolute; top: -4px; right: -4px; width: 12px; height: 12px;',
    '  background: #6eff8a; animation: fr-pulse 2s infinite;',
    '}',
    '@keyframes fr-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }',
    '#focusrunner-chat-window {',
    '  position: fixed; bottom: 92px; right: 24px; z-index: 2147483646;',
    '  width: 340px; max-height: 480px; background: #0f0f13;',
    '  border: 1px solid #2a2a30; display: none; flex-direction: column;',
    '  box-shadow: 0 8px 32px rgba(0,0,0,0.5); font-family: "JetBrains Mono", monospace;',
    '}',
    '#focusrunner-chat-window.open { display: flex; }',
    '#focusrunner-chat-header {',
    '  padding: 14px 16px; border-bottom: 1px solid #1e1e24;',
    '  display: flex; align-items: center; justify-content: space-between;',
    '  font-size: 13px; font-weight: 700; color: #6eff8a;',
    '}',
    '#focusrunner-chat-close { background: none; border: none; color: #4a4a52; cursor: pointer; font-size: 18px; font-family: "JetBrains Mono", monospace; }',
    '#focusrunner-chat-close:hover { color: #ff5c4d; }',
    '#focusrunner-chat-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; max-height: 300px; }',
    '.fr-chat-msg { font-size: 12px; line-height: 1.5; max-width: 85%; padding: 10px 14px; }',
    '.fr-chat-msg.bot { background: #1a1a1e; color: #d4d4dc; align-self: flex-start; border: 1px solid #1e1e24; }',
    '.fr-chat-msg.user { background: rgba(110,255,138,0.08); color: #d4d4dc; align-self: flex-end; }',
    '#focusrunner-chat-input-area { padding: 12px; border-top: 1px solid #1e1e24; display: none; gap: 8px; }',
    '#focusrunner-chat-input { flex: 1; background: #1a1a1e; border: 1px solid #1e1e24; color: #d4d4dc; padding: 10px 12px; font-family: "JetBrains Mono", monospace; font-size: 12px; outline: none; }',
    '#focusrunner-chat-input:focus { border-color: #6eff8a; }',
    '#focusrunner-chat-send { background: #6eff8a; color: #000; border: none; padding: 10px 16px; cursor: pointer; font-family: "JetBrains Mono", monospace; font-size: 12px; font-weight: 700; }',
    '#focusrunner-chat-send:hover { background: #8affa0; }',
    '.fr-chat-option { display: block; width: 100%; text-align: left; background: #1a1a1e; border: 1px solid #1e1e24; color: #d4d4dc; padding: 10px 14px; margin: 4px 0; cursor: pointer; font-family: "JetBrains Mono", monospace; font-size: 11px; transition: border-color .15s; }',
    '.fr-chat-option:hover { border-color: #6eff8a; color: #6eff8a; }',
    '@media (max-width: 480px) {',
    '  #focusrunner-chat-window { right: 8px; bottom: 80px; width: calc(100vw - 16px); max-width: 360px; }',
    '}',
  ].join('\n');
  document.head.appendChild(style);

  // ─── Inject HTML ─────────────────────────────────────────────────────────
  var container = document.createElement('div');
  container.innerHTML = [
    '<div id="focusrunner-chat-window">',
    '  <div id="focusrunner-chat-header">',
    '    &gt;_ Free Practice Audit',
    '    <button id="focusrunner-chat-close">&times;</button>',
    '  </div>',
    '  <div id="focusrunner-chat-messages"></div>',
    '  <div id="focusrunner-chat-input-area">',
    '    <input type="text" id="focusrunner-chat-input" placeholder="Type your answer..." />',
    '    <button id="focusrunner-chat-send">&rarr;</button>',
    '  </div>',
    '</div>',
    '<button id="focusrunner-chat-fab">\uD83D\uDCAC<span class="fr-dot"></span></button>',
  ].join('\n');
  document.body.appendChild(container);

  // ─── State ───────────────────────────────────────────────────────────────
  var _active = false, _qualified = false, _leadData = {};
  var _msgs = document.getElementById('focusrunner-chat-messages');
  var _window = document.getElementById('focusrunner-chat-window');
  var _fab = document.getElementById('focusrunner-chat-fab');
  var _close = document.getElementById('focusrunner-chat-close');
  var _inputArea = document.getElementById('focusrunner-chat-input-area');
  var _input = document.getElementById('focusrunner-chat-input');
  var _send = document.getElementById('focusrunner-chat-send');

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
        if (o.next) o.next();
      };
      _msgs.appendChild(btn);
    });
    _msgs.scrollTop = _msgs.scrollHeight;
  }

  function startChat() {
    _active = true;
    addMsg('Hey \u2014 I\'m FocusRunner\'s AI acquisition consultant. Let\'s run a quick audit on your patient pipeline. Ready?', 'bot');
    addOptions([
      { label: 'Yes \u2014 let\'s do this', field: 'started', value: true, next: askNiche },
      { label: 'Just browsing', field: 'started', value: false, next: function() {
        addMsg('No worries \u2014 ping us when you\'re ready to scale.', 'bot');
      }}
    ]);
  }

  function askNiche() {
    addMsg('What type of practice do you run?', 'bot');
    addOptions([
      { label: '\uD83D\uDC89 Med Spa', field: 'niche', value: 'med_spa', next: askVolume },
      { label: '\uD83E\uDDB7 Cosmetic Dentistry', field: 'niche', value: 'cosmetic_dentistry', next: askVolume },
      { label: '\uD83D\uDD2A Plastic Surgery', field: 'niche', value: 'plastic_surgery', next: askVolume },
      { label: '\uD83D\uDC87 Hair Transplant', field: 'niche', value: 'hair_transplant', next: askVolume },
      { label: 'Other', field: 'niche', value: 'other', next: askVolume },
    ]);
  }

  function askVolume() {
    addMsg('Roughly how many new patients do you see per month?', 'bot');
    addOptions([
      { label: 'Under 10', field: 'volume', value: 'under_10', next: askName },
      { label: '10\u201330', field: 'volume', value: '10_30', next: askName },
      { label: '30\u201360', field: 'volume', value: '30_60', next: askName },
      { label: '60+', field: 'volume', value: '60_plus', next: askName },
    ]);
  }

  function askName() {
    _inputArea.style.display = 'flex';
    addMsg('Great \u2014 what\'s your name?', 'bot');
  }

  function handleName(text) {
    _leadData.name = text;
    addMsg('And your best phone number? We\'ll text you the audit results.', 'bot');
  }

  function handlePhone(text) {
    _leadData.phone = text;
    addMsg('Last one \u2014 what\'s your practice called?', 'bot');
  }

  function handlePractice(text) {
    _leadData.practice = text;
    _inputArea.style.display = 'none';
    addMsg('Perfect. Give me a moment \u2014 I\'m analyzing your market position...', 'bot');
    sendToAI();
  }

  function sendToAI() {
    var convo = [{
      role: 'user',
      content: 'My name is ' + _leadData.name + '. I run ' + _leadData.practice + ', a ' + (_leadData.niche || '').replace(/_/g, ' ') + ' practice seeing ' + (_leadData.volume || '').replace(/_/g, ' ') + ' patients/month.'
    }];

    var xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + '/api/chat', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
      var data;
      try { data = JSON.parse(xhr.responseText); } catch(e) { data = null; }
      if (!data || data.error) {
        addMsg('Hmm, hit a snag. Try refreshing or email hello@focusrunner.ai.', 'bot');
        return;
      }
      addMsg(data.reply || data.text || 'Thanks!', 'bot');

      if (data.qualification && data.qualification.classification === 'qualified') {
        _qualified = true;
        addMsg('\uD83C\uDFAF You\'re a strong fit for our AI Patient Acquisition System!', 'bot');
        addMsg('\u2192 Book your free audit: ' + API_BASE, 'bot');
      }

      // Submit lead
      var payload = JSON.stringify({
        name: _leadData.name,
        phone: _leadData.phone,
        practice: _leadData.practice,
        niche: _leadData.niche,
        volume: _leadData.volume,
        qualification: data.qualification,
        source: 'chat_widget'
      });
      var h2 = new XMLHttpRequest();
      h2.open('POST', API_BASE + '/api/webhook', true);
      h2.setRequestHeader('Content-Type', 'application/json');
      h2.send(payload);

      addMsg('1. Our AI analyzes your market within 24 hours.\n2. We\'ll text you a personalized audit.\n3. You\'ll see exactly how many patients you\'re missing \u2014 and what it would cost to capture them.\n\nNo commitment. Just data.', 'bot');
      addMsg('In the meantime, check out our case studies at ' + API_BASE, 'bot');
    };
    xhr.onerror = function() {
      addMsg('Connection issue. Your info is saved \u2014 we\'ll reach out within 24 hours.', 'bot');
    };
    xhr.send(JSON.stringify({ messages: convo, userData: _leadData }));
  }

  function sendMessage() {
    var text = _input.value.trim();
    if (!text) return;
    addMsg(text, 'user');
    _input.value = '';

    if (!_leadData.name) {
      handleName(text);
    } else if (!_leadData.phone) {
      handlePhone(text);
    } else if (!_leadData.practice) {
      handlePractice(text);
    }
  }

  // ─── Event wiring ────────────────────────────────────────────────────────
  _fab.onclick = function() {
    var isOpen = _window.classList.contains('open');
    if (isOpen) { _window.classList.remove('open'); }
    else { _window.classList.add('open'); if (!_active) startChat(); }
  };

  _close.onclick = function() {
    _window.classList.remove('open');
  };

  _send.onclick = sendMessage;

  _input.onkeydown = function(e) {
    if (e.key === 'Enter') sendMessage();
  };

})();
