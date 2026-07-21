/**
 * FocusRunner AI — Standalone Chatbot Widget
 *
 * v3.3.1 — same-origin /api/chat, proper opening greeting (no fake user kick),
 * OpenRouter + fallback, typing animation, lead only when complete=true.
 */
(function () {
  'use strict';

  var script = document.currentScript || document.querySelector('script[src*="chat-widget"]');
  var API_BASE = script
    ? script.getAttribute('data-api-base') || window.location.origin
    : window.location.origin;
  // ALWAYS same-origin portfolio chat — never unsub.focusrunner.io
  var AI_API = API_BASE + '/api/chat';
  var LEAD_API_ENDPOINT = API_BASE + '/api/webhook';

  var CONFIG = {
    maxRetries: 3,
    retryBaseDelay: 500,
    retryMaxDelay: 3000,
    storageKey: 'fr_lead_queue',
    version: '3.3.1',
  };

  function getQueue() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.storageKey) || '[]');
    } catch (e) {
      return [];
    }
  }
  function saveToQueue(payload) {
    var q = getQueue();
    q.push({ payload: payload, ts: Date.now(), retries: 0 });
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(q));
    } catch (e) {}
  }
  function removeFromQueue(idx) {
    var q = getQueue();
    q.splice(idx, 1);
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(q));
    } catch (e) {}
  }
  function flushQueue() {
    var q = getQueue();
    if (q.length === 0) return;
    q.forEach(function (item, idx) {
      fetch(LEAD_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      })
        .then(function (r) {
          if (r.ok) removeFromQueue(idx);
          else item.retries++;
        })
        .catch(function () {
          item.retries++;
        });
    });
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(q));
    } catch (e) {}
  }
  setTimeout(flushQueue, 1000);

  function retryFetch(url, options, maxRetries) {
    maxRetries = maxRetries || CONFIG.maxRetries;
    var lastError;
    var attempt = 1;
    function tryFetch() {
      return fetch(url, options)
        .then(function (res) {
          if (res.ok) return res;
          if (res.status === 429 || res.status >= 500) {
            lastError = 'HTTP ' + res.status;
            if (attempt < maxRetries) {
              var delay = Math.min(CONFIG.retryBaseDelay * Math.pow(2, attempt - 1), CONFIG.retryMaxDelay);
              attempt++;
              return new Promise(function (r) {
                setTimeout(r, delay);
              }).then(tryFetch);
            }
          }
          return res;
        })
        .catch(function (err) {
          lastError = err.message;
          if (attempt < maxRetries) {
            var delay = Math.min(CONFIG.retryBaseDelay * Math.pow(2, attempt - 1), CONFIG.retryMaxDelay);
            attempt++;
            return new Promise(function (r) {
              setTimeout(r, delay);
            }).then(tryFetch);
          }
          throw new Error('All retries failed: ' + lastError);
        });
    }
    return tryFetch();
  }

  function submitLead(leadData) {
    var payload = {
      name: leadData.name || '',
      phone: leadData.phone || '',
      email: leadData.email || '',
      practice: leadData.practice || '',
      type: leadData.type || '',
      volume: leadData.volume || '',
      source: 'chat_widget',
      history: _conversation,
    };
    retryFetch(LEAD_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        if (!r.ok) saveToQueue(payload);
      })
      .catch(function () {
        saveToQueue(payload);
      });
  }

  // ─── Smooth CSS ──────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '#fr-chat-fab { position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; width: 56px; height: 56px; border-radius: 0; border: 1px solid #6eff8a; background: #0d120f; color: #6eff8a; font-size: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.2s ease, box-shadow 0.2s ease; font-family: "JetBrains Mono", monospace; }',
    '#fr-chat-fab:hover { transform: scale(1.08); box-shadow: 0 0 24px rgba(110,255,138,0.25); }',
    '#fr-chat-fab .fr-dot { position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; background: #6eff8a; animation: fr-pulse 2s infinite; }',
    '@keyframes fr-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }',
    '@keyframes fr-border-glow { 0%,100% { box-shadow: 0 0 12px rgba(110,255,138,0.3), 0 0 24px rgba(110,255,138,0.1), 0 8px 32px rgba(0,0,0,0.5); border-color: #6eff8a; } 50% { box-shadow: 0 0 20px rgba(110,255,138,0.5), 0 0 40px rgba(110,255,138,0.2), 0 8px 32px rgba(0,0,0,0.5); border-color: #8affa0; } }',
    '#fr-chat-window { position: fixed; bottom: 92px; right: 24px; z-index: 2147483646; width: 340px; max-height: 520px; background: #0d120f; border: 1px solid #2a3f33; display: none; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.5); font-family: "JetBrains Mono", monospace; opacity: 0; transform: translateY(10px) scale(0.96); transition: opacity 0.25s ease, transform 0.25s ease, border-color 0.25s ease; }',
    '#fr-chat-window.open { display: flex; opacity: 1; transform: translateY(0) scale(1); animation: fr-border-glow 2.5s ease-in-out infinite; }',
    '#fr-chat-header { padding: 14px 16px; border-bottom: 1px solid #1a2620; display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 700; color: #6eff8a; }',
    '#fr-chat-close { background: none; border: none; color: #7a8c7e; cursor: pointer; font-size: 18px; font-family: "JetBrains Mono", monospace; transition: color 0.15s; }',
    '#fr-chat-close:hover { color: #ff5c4d; }',
    '#fr-chat-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; max-height: 340px; }',
    '.fr-chat-msg { font-size: 12px; line-height: 1.5; max-width: 85%; padding: 10px 14px; animation: fr-fadeIn 0.3s ease; }',
    '.fr-chat-msg.bot { background: #0f1412; color: #d4e5d8; align-self: flex-start; border: 1px solid #1a2620; }',
    '.fr-chat-msg.user { background: rgba(110,255,138,0.08); color: #d4e5d8; align-self: flex-end; border: 1px solid rgba(110,255,138,0.15); }',
    '@keyframes fr-fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }',
    '#fr-chat-input-area { padding: 12px; border-top: 1px solid #1a2620; display: none; gap: 8px; }',
    '#fr-chat-input { flex: 1; background: #0f1412; border: 1px solid #1a2620; color: #d4e5d8; padding: 10px 12px; font-family: "JetBrains Mono", monospace; font-size: 12px; outline: none; transition: border-color 0.15s; }',
    '#fr-chat-input:focus { border-color: #6eff8a; }',
    '#fr-chat-send { background: #6eff8a; color: #000; border: none; padding: 10px 16px; cursor: pointer; font-family: "JetBrains Mono", monospace; font-size: 12px; font-weight: 700; transition: background 0.15s; }',
    '#fr-chat-send:hover { background: #8affa0; }',
    '#fr-chat-send:disabled { opacity: 0.5; cursor: wait; }',
    '.fr-chat-option { display: block; width: 100%; text-align: left; background: #0f1412; border: 1px solid #1a2620; color: #d4e5d8; padding: 10px 14px; margin: 4px 0; cursor: pointer; font-family: "JetBrains Mono", monospace; font-size: 11px; transition: border-color 0.15s, background 0.15s; }',
    '.fr-chat-option:hover { border-color: #6eff8a; color: #6eff8a; background: rgba(110,255,138,0.05); }',
    '.fr-chat-error { font-size: 11px; color: #ff5c4d; padding: 8px 14px; text-align: center; }',
    '.fr-typing { align-self: flex-start; color: #7a8c7e; font-size: 11px; padding: 4px 8px; }',
    '@media (max-width: 480px) { #fr-chat-fab { bottom: 20px; right: 16px; } #fr-chat-window { right: 8px; bottom: 80px; width: calc(100vw - 16px); max-width: 360px; } }',
  ].join('\n');
  document.head.appendChild(style);

  // ─── HTML ────────────────────────────────────────────────────
  var container = document.createElement('div');
  container.innerHTML = [
    '<div id="fr-chat-window">',
    '  <div id="fr-chat-header">>_ Free Practice Audit<button id="fr-chat-close" type="button">&times;</button></div>',
    '  <div id="fr-chat-messages"></div>',
    '  <div id="fr-chat-input-area">',
    '    <input type="text" id="fr-chat-input" placeholder="Type your message..." autocomplete="off" />',
    '    <button id="fr-chat-send" type="button">&rarr;</button>',
    '  </div>',
    '</div>',
    '<button id="fr-chat-fab" type="button" aria-label="Open FocusRunner chat">&#128172;<span class="fr-dot"></span></button>',
  ].join('\n');
  document.body.appendChild(container);

  // ─── State ────────────────────────────────────────────────────
  var _active = false;
  var _leadData = {};
  var _msgs = document.getElementById('fr-chat-messages');
  var _window = document.getElementById('fr-chat-window');
  var _fab = document.getElementById('fr-chat-fab');
  var _close = document.getElementById('fr-chat-close');
  var _inputArea = document.getElementById('fr-chat-input-area');
  var _input = document.getElementById('fr-chat-input');
  var _send = document.getElementById('fr-chat-send');
  var _conversation = [];
  var _aiMode = false;
  var _busy = false;
  var _done = false;
  var _nextField = null;

  function setBusy(b) {
    _busy = b;
    _send.disabled = !!b;
    _input.disabled = !!b;
  }

  // ─── Typing effect ────────────────────────────────────────────
  function typeMsg(text, cls, callback) {
    var div = document.createElement('div');
    div.className = 'fr-chat-msg ' + cls;
    _msgs.appendChild(div);
    var i = 0;
    function type() {
      if (i < text.length) {
        div.textContent += text.charAt(i);
        i++;
        _msgs.scrollTop = _msgs.scrollHeight;
        setTimeout(type, 12 + Math.random() * 18);
      } else if (callback) {
        callback();
      }
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

  function showTyping() {
    var el = document.createElement('div');
    el.className = 'fr-typing';
    el.id = 'fr-typing';
    el.textContent = 'typing…';
    _msgs.appendChild(el);
    _msgs.scrollTop = _msgs.scrollHeight;
  }
  function hideTyping() {
    var el = document.getElementById('fr-typing');
    if (el) el.remove();
  }

  function addOptions(opts) {
    opts.forEach(function (o) {
      var btn = document.createElement('button');
      btn.className = 'fr-chat-option';
      btn.type = 'button';
      btn.textContent = o.label;
      btn.onclick = function () {
        var all = _msgs.querySelectorAll('.fr-chat-option');
        for (var i = 0; i < all.length; i++) all[i].remove();
        addMsg(o.label, 'user');
        _leadData[o.field] = o.value || o.label;
        if (o.nextField) _nextField = o.nextField;
        if (o.next) o.next();
      };
      _msgs.appendChild(btn);
    });
    _msgs.scrollTop = _msgs.scrollHeight;
  }

  function mergeCollected(c) {
    if (!c) return;
    ['type', 'volume', 'name', 'practice', 'email', 'phone'].forEach(function (k) {
      if (c[k]) _leadData[k] = c[k];
    });
  }

  // ─── Send to AI ──────────────────────────────────────────────
  function sendToAI() {
    if (_conversation.length === 0 || _done) return;
    setBusy(true);
    showTyping();
    retryFetch(
      AI_API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: _conversation, collected: _leadData }),
      },
      2
    )
      .then(function (r) {
        if (r.ok) return r.json();
        throw new Error('AI API unreachable ' + r.status);
      })
      .then(function (data) {
        hideTyping();
        setBusy(false);
        var reply = (data && data.reply) || '';
        mergeCollected(data && data.collected);
        _conversation.push({ role: 'assistant', content: reply });
        if (data && data.complete) {
          _done = true;
          if (!_leadData.submitted) {
            _leadData.submitted = true;
            submitLead(_leadData);
          }
        }
        typeMsg(reply, 'bot', function () {
          if (!_done) _inputArea.style.display = 'flex';
          else _inputArea.style.display = 'none';
        });
      })
      .catch(function () {
        hideTyping();
        setBusy(false);
        runFallbackChat();
      });
  }

  // ─── Fallback (local option flow if API down) ─────────────────
  function runFallbackChat() {
    _aiMode = false;
    addMsg("Hey—I'm FocusRunner's acquisition advisor. Let's run a quick audit.", 'bot');
    addOptions([
      { label: "Let's do it", field: 'started', value: true, next: askType },
      {
        label: 'Just browsing',
        field: 'started',
        value: false,
        next: function () {
          addMsg('No worries. Ping us when ready to scale.', 'bot');
        },
      },
    ]);
  }

  function askType() {
    addMsg('What type of practice?', 'bot');
    addOptions([
      { label: 'Med Spa', field: 'type', value: 'med spa', next: askVolume },
      { label: 'Cosmetic Dent.', field: 'type', value: 'cosmetic dentistry', next: askVolume },
      { label: 'Plastic Surgery', field: 'type', value: 'plastic surgery', next: askVolume },
      { label: 'Other', field: 'type', value: 'other', next: askVolume },
    ]);
  }

  function askVolume() {
    addMsg('Monthly new patients?', 'bot');
    addOptions([
      { label: 'Under 10', field: 'volume', value: 'under 10', next: askName },
      { label: '10–30', field: 'volume', value: '10-30', next: askName },
      { label: '30–60', field: 'volume', value: '30-60', next: askName },
      { label: '60+', field: 'volume', value: '60+', next: askName },
    ]);
  }

  function askName() {
    _inputArea.style.display = 'flex';
    addMsg("What's your first name?", 'bot');
    _nextField = 'name';
  }

  function finishFallback() {
    _inputArea.style.display = 'none';
    _done = true;
    if (!_leadData.submitted) {
      _leadData.submitted = true;
      submitLead(_leadData);
    }
    addMsg("Thanks! We'll text you within 24h. Any questions — hello@focusrunner.io", 'bot');
  }

  function handleInputFallback(text) {
    if (!_leadData.name) {
      _leadData.name = text;
      addMsg('Practice / clinic name?', 'bot');
      _nextField = 'practice';
    } else if (!_leadData.practice) {
      _leadData.practice = text;
      addMsg('Best email?', 'bot');
      _nextField = 'email';
    } else if (!_leadData.email) {
      _leadData.email = text;
      addMsg('Mobile for SMS?', 'bot');
      _nextField = 'phone';
    } else if (!_leadData.phone) {
      _leadData.phone = text;
      finishFallback();
    }
  }

  // ─── Start ────────────────────────────────────────────────────
  function startChat() {
    _active = true;
    _aiMode = true;
    _done = false;
    _leadData = {};
    _conversation = [];
    setBusy(true);
    showTyping();
    // Open with start:true → server returns real greeting (no fake user message)
    retryFetch(
      AI_API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: true, messages: [], collected: {} }),
      },
      2
    )
      .then(function (r) {
        if (r.ok) return r.json();
        throw new Error('Failed ' + r.status);
      })
      .then(function (data) {
        hideTyping();
        setBusy(false);
        mergeCollected(data && data.collected);
        var reply =
          (data && data.reply) ||
          "Hi — I'm FocusRunner's acquisition advisor. What type of practice do you run?";
        // History starts with assistant greeting only — first real user msg is first user turn
        _conversation = [{ role: 'assistant', content: reply }];
        typeMsg(reply, 'bot', function () {
          _inputArea.style.display = 'flex';
          try {
            _input.focus();
          } catch (e) {}
        });
      })
      .catch(function () {
        hideTyping();
        setBusy(false);
        // Local greeting if API down
        var localGreet =
          "Hi — I'm FocusRunner's acquisition advisor. We help med spas fill the calendar after hours. What type of practice do you run?";
        _conversation = [{ role: 'assistant', content: localGreet }];
        typeMsg(localGreet, 'bot', function () {
          _inputArea.style.display = 'flex';
          _aiMode = true; // still try API on next send; fallback options if that fails
        });
      });
  }

  function sendMessage() {
    var text = _input.value.trim();
    if (!text || _busy || _done) return;
    addMsg(text, 'user');
    _input.value = '';
    if (_aiMode) {
      _conversation.push({ role: 'user', content: text });
      sendToAI();
    } else {
      handleInputFallback(text);
    }
  }

  // ─── Events ───────────────────────────────────────────────────
  _fab.onclick = function () {
    var isOpen = _window.classList.contains('open');
    if (isOpen) {
      _window.classList.remove('open');
    } else {
      _window.classList.add('open');
      if (!_active) setTimeout(startChat, 280);
    }
  };
  _close.onclick = function () {
    _window.classList.remove('open');
  };
  _send.onclick = sendMessage;
  _input.onkeydown = function (e) {
    if (e.key === 'Enter') sendMessage();
  };
})();
