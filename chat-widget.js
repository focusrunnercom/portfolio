/**
 * FocusRunner AI — Standalone Chatbot Widget
 *
 * v2.1 — PRODUCTION HARDENED
 * - Full CSS isolation (fr- prefix on ALL selectors)
 * - Retry with exponential backoff on API calls
 * - Static fallback questions when AI is unreachable
 * - Offline-first capture with localStorage queue
 * - Graceful degradation at every level
 *
 * Embed on any site with:
 *   <script src="https://focusrunner.io/chat-widget.js" data-api-base="https://focusrunner.io"></script>
 *
 * Self-contained IIFE. Injects its own CSS + HTML.
 */

(function() {
  'use strict';

  var script = document.currentScript || document.querySelector('script[src*="chat-widget"]');
  var API_BASE = script ? (script.getAttribute('data-api-base') || window.location.origin) : window.location.origin;

  // ─── Configuration ──────────────────────────────────────────────────
  var CONFIG = {
    maxRetries: 3,
    retryBaseDelay: 500,
    retryMaxDelay: 3000,
    storageKey: 'fr_lead_queue',
    apiEndpoint: '/api/webhook',
    version: '2.1'
  };

  // ─── Offline queue (localStorage) ───────────────────────────────────
  function getQueue() {
    try { return JSON.parse(localStorage.getItem(CONFIG.storageKey) || '[]'); }
    catch(e) { return []; }
  }

  function saveToQueue(payload) {
    var q = getQueue();
    q.push({ payload: payload, ts: Date.now(), retries: 0 });
    try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(q)); } catch(e) {}
  }

  function removeFromQueue(idx) {
    var q = getQueue();
    q.splice(idx, 1);
    try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(q)); } catch(e) {}
  }

  function flushQueue() {
    var q = getQueue();
    if (q.length === 0) return;
    q.forEach(function(item, idx) {
      fetch(API_BASE + CONFIG.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload)
      }).then(function(r) {
        if (r.ok) removeFromQueue(idx);
        else item.retries++;
      }).catch(function() {
        item.retries++;
      });
    });
    try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(q)); } catch(e) {}
  }

  // Flush any queued leads on page load (with delay for progressive enhancement)
  setTimeout(flushQueue, 1000);

  // ─── Retry-aware fetch ──────────────────────────────────────────────
  function retryFetch(url, options, maxRetries) {
    maxRetries = maxRetries || CONFIG.maxRetries;
    var lastError;
    var attempt = 1;

    function tryFetch() {
      return fetch(url, options).then(function(res) {
        if (res.ok) return res;
        if (res.status === 429 || res.status >= 500) {
          lastError = 'HTTP ' + res.status;
          if (attempt < maxRetries) {
            var delay = Math.min(CONFIG.retryBaseDelay * Math.pow(2, attempt - 1), CONFIG.retryMaxDelay);
            attempt++;
            return new Promise(function(r) { setTimeout(r, delay); }).then(tryFetch);
          }
        }
        return res;
      }).catch(function(err) {
        lastError = err.message;
        if (attempt < maxRetries) {
          var delay = Math.min(CONFIG.retryBaseDelay * Math.pow(2, attempt - 1), CONFIG.retryMaxDelay);
          attempt++;
          return new Promise(function(r) { setTimeout(r, delay); }).then(tryFetch);
        }
        throw new Error('All retries failed: ' + lastError);
      });
    }
    return tryFetch();
  }

  // ─── Submit with offline fallback + retry ───────────────────────────
  function submitLead(leadData) {
    var payload = JSON.stringify({
      name: leadData.name,
      phone: leadData.phone,
      practice: leadData.practice,
      niche: leadData.niche,
      volume: leadData.volume,
      qualification: { score: leadData.score || 0 },
      source: 'chat_widget'
    });

    retryFetch(API_BASE + CONFIG.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    }).then(function(r) {
      if (!r.ok) {
        saveToQueue(JSON.parse(payload));
      }
    }).catch(function() {
      saveToQueue(JSON.parse(payload));
    });
  }

  // ─── Inject CSS (fully prefixed for isolation) ──────────────────────
  var style = document.createElement('style');
  style.textContent = [
    /* FAB button */
    '#fr-chat-fab {',
    '  position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;',
    '  width: 56px; height: 56px; border-radius: 0; border: 1px solid #6eff8a;',
    '  background: #0f0f13; color: #6eff8a;',
    '  font-size: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center;',
    '  transition: transform .15s, box-shadow .15s; font-family: "JetBrains Mono", monospace;',
    '}',
    '#fr-chat-fab:hover { transform: scale(1.05); box-shadow: 0 0 20px rgba(110,255,138,0.15); }',
    '#fr-chat-fab .fr-dot {',
    '  position: absolute; top: -4px; right: -4px; width: 12px; height: 12px;',
    '  background: #6eff8a; animation: fr-pulse 2s infinite;',
    '}',
    '@keyframes fr-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }',

    /* Chat window */
    '#fr-chat-window {',
    '  position: fixed; bottom: 92px; right: 24px; z-index: 2147483646;',
    '  width: 340px; max-height: 480px; background: #0f0f13;',
    '  border: 1px solid #2a2a30; display: none; flex-direction: column;',
    '  box-shadow: 0 8px 32px rgba(0,0,0,0.5); font-family: "JetBrains Mono", monospace;',
    '}',
    '#fr-chat-window.open { display: flex; }',

    /* Header */
    '#fr-chat-header {',
    '  padding: 14px 16px; border-bottom: 1px solid #1e1e24;',
    '  display: flex; align-items: center; justify-content: space-between;',
    '  font-size: 13px; font-weight: 700; color: #6eff8a;',
    '}',
    '#fr-chat-close { background: none; border: none; color: #4a4a52; cursor: pointer; font-size: 18px; font-family: "JetBrains Mono", monospace; }',
    '#fr-chat-close:hover { color: #ff5c4d; }',

    /* Messages area */
    '#fr-chat-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; max-height: 300px; }',
    '.fr-chat-msg { font-size: 12px; line-height: 1.5; max-width: 85%; padding: 10px 14px; }',
    '.fr-chat-msg.bot { background: #1a1a1e; color: #d4d4dc; align-self: flex-start; border: 1px solid #1e1e24; }',
    '.fr-chat-msg.user { background: rgba(110,255,138,0.08); color: #d4d4dc; align-self: flex-end; }',

    /* Input area */
    '#fr-chat-input-area { padding: 12px; border-top: 1px solid #1e1e24; display: none; gap: 8px; }',
    '#fr-chat-input { flex: 1; background: #1a1a1e; border: 1px solid #1e1e24; color: #d4d4dc; padding: 10px 12px; font-family: "JetBrains Mono", monospace; font-size: 12px; outline: none; }',
    '#fr-chat-input:focus { border-color: #6eff8a; }',
    '#fr-chat-send { background: #6eff8a; color: #000; border: none; padding: 10px 16px; cursor: pointer; font-family: "JetBrains Mono", monospace; font-size: 12px; font-weight: 700; }',
    '#fr-chat-send:hover { background: #8affa0; }',

    /* Option buttons */
    '.fr-chat-option { display: block; width: 100%; text-align: left; background: #1a1a1e; border: 1px solid #1e1e24; color: #d4d4dc; padding: 10px 14px; margin: 4px 0; cursor: pointer; font-family: "JetBrains Mono", monospace; font-size: 11px; transition: border-color .15s; }',
    '.fr-chat-option:hover { border-color: #6eff8a; color: #6eff8a; }',

    /* Error state */
    '.fr-chat-error { font-size: 11px; color: #ff5c4d; padding: 8px 14px; text-align: center; }',

    /* Mobile */
    '@media (max-width: 480px) {',
    '  #fr-chat-fab { bottom: 20px; right: 16px; }',
    '  #fr-chat-window { right: 8px; bottom: 80px; width: calc(100vw - 16px); max-width: 360px; }',
    '}',
  ].join('\n');
  document.head.appendChild(style);

  // ─── Inject HTML ───────────────────────────────────────────────────
  var container = document.createElement('div');
  container.innerHTML = [
    '<div id="fr-chat-window">',
    '  <div id="fr-chat-header">',
    '    >_ Free Practice Audit',
    '    <button id="fr-chat-close">&times;</button>',
    '  </div>',
    '  <div id="fr-chat-messages"></div>',
    '  <div id="fr-chat-input-area">',
    '    <input type="text" id="fr-chat-input" placeholder="Type your answer..." />',
    '    <button id="fr-chat-send">&rarr;</button>',
    '  </div>',
    '</div>',
    '<button id="fr-chat-fab">&#128172;<span class="fr-dot"></span></button>',
  ].join('\n');
  document.body.appendChild(container);

  // ─── State ─────────────────────────────────────────────────────────
  var _active = false;
  var _leadData = {};
  var _msgs = document.getElementById('fr-chat-messages');
  var _window = document.getElementById('fr-chat-window');
  var _fab = document.getElementById('fr-chat-fab');
  var _close = document.getElementById('fr-chat-close');
  var _inputArea = document.getElementById('fr-chat-input-area');
  var _input = document.getElementById('fr-chat-input');
  var _send = document.getElementById('fr-chat-send');

  // ─── Helpers ───────────────────────────────────────────────────────
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

  function showError(msg) {
    var div = document.createElement('div');
    div.className = 'fr-chat-error';
    div.textContent = msg;
    _msgs.appendChild(div);
    _msgs.scrollTop = _msgs.scrollHeight;
  }

  // ─── Static fallback (no API dependency) ───────────────────────────
  function runFallbackChat() {
    addMsg('Hey \u2014 I\u2019m FocusRunner\u2019s acquisition advisor.', 'bot');

    addOptions([
      { label: 'Med Spa', field: 'niche', value: 'med_spa', next: function() {
        addMsg('How many new patients per month?', 'bot');
        addOptions([
          { label: 'Under 10', field: 'volume', value: 'under_10', next: askNameFallback },
          { label: '10\u201330', field: 'volume', value: '10_30', next: askNameFallback },
          { label: '30\u201360', field: 'volume', value: '30_60', next: askNameFallback },
          { label: '60+', field: 'volume', value: '60_plus', next: askNameFallback },
        ]);
      }},
      { label: 'Cosmetic Dentistry', field: 'niche', value: 'cosmetic_dentistry', next: function() {
        addMsg('Monthly new patients?', 'bot');
        addOptions([
          { label: 'Under 10', field: 'volume', value: 'under_10', next: askNameFallback },
          { label: '10\u201330', field: 'volume', value: '10_30', next: askNameFallback },
          { label: '30\u201360', field: 'volume', value: '30_60', next: askNameFallback },
          { label: '60+', field: 'volume', value: '60_plus', next: askNameFallback },
        ]);
      }},
      { label: 'Plastic Surgery', field: 'niche', value: 'plastic_surgery', next: function() {
        addMsg('How many new patients monthly?', 'bot');
        addOptions([
          { label: 'Under 10', field: 'volume', value: 'under_10', next: askNameFallback },
          { label: '10\u201330', field: 'volume', value: '10_30', next: askNameFallback },
          { label: '30\u201360', field: 'volume', value: '30_60', next: askNameFallback },
          { label: '60+', field: 'volume', value: '60_plus', next: askNameFallback },
        ]);
      }},
      { label: 'Other', field: 'niche', value: 'other', next: askNameFallback },
    ]);
  }

  function askNameFallback() {
    _inputArea.style.display = 'flex';
    addMsg('Great. What\u2019s your name and best phone?', 'bot');
  }

  function finishFallback() {
    _inputArea.style.display = 'none';
    _leadData.score = 0;
    if (_leadData.volume === 'under_10' || _leadData.volume === '10_30') _leadData.score += 30;
    if (_leadData.niche === 'med_spa') _leadData.score += 20;

    submitLead(_leadData);

    addMsg('Thanks. Our team will analyze and text you within 24 hours.', 'bot');
    addMsg('No commitment. Just data. Check case studies at ' + API_BASE, 'bot');
  }

  // ─── Input flow ────────────────────────────────────────────────────
  function handleInput(text) {
    if (!_leadData.name) {
      _leadData.name = text;
      addMsg('And your best phone number?', 'bot');
    } else if (!_leadData.phone) {
      _leadData.phone = text;
      addMsg('Last \u2014 practice name?', 'bot');
    } else if (!_leadData.practice) {
      _leadData.practice = text;
      finishFallback();
    }
  }

  // ─── Main flow ─────────────────────────────────────────────────────
  function startChat() {
    _active = true;
    // Try retryFetch to API first; fall back to static if unreachable
    retryFetch(API_BASE + '/api/health', { method: 'GET' }, 1)
      .then(function(r) {
        if (r.ok) {
          // API is alive — use full chat (v2.0 flow)
          addMsg('Hey \u2014 I\u2019m FocusRunner\u2019s AI acquisition consultant. Let\u2019s run a quick audit on your patient pipeline. Ready?', 'bot');
          addOptions([
            { label: 'Yes \u2014 let\u2019s do this', field: 'started', value: true, next: askNiche },
            { label: 'Just browsing', field: 'started', value: false, next: function() {
              addMsg('No worries \u2014 ping us when you\u2019re ready to scale.', 'bot');
            }}
          ]);
        } else {
          runFallbackChat();
        }
      })
      .catch(function() {
        // API unreachable — use static fallback
        runFallbackChat();
      });
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
    addMsg('Great \u2014 what\u2019s your name?', 'bot');
  }

  function handleName(text) {
    _leadData.name = text;
    addMsg('And your best phone number? We\u2019ll text you the audit results.', 'bot');
  }

  function handlePhone(text) {
    _leadData.phone = text;
    addMsg('Last one \u2014 what\u2019s your practice called?', 'bot');
  }

  function handlePractice(text) {
    _leadData.practice = text;
    _inputArea.style.display = 'none';
    addMsg('Perfect. Give me a moment \u2014 I\u2019m analyzing your market position...', 'bot');
    finishChat();
  }

  function finishChat() {
    _leadData.score = 0;
    if (_leadData.volume === 'under_10' || _leadData.volume === '10_30') _leadData.score += 30;
    if (_leadData.niche === 'med_spa') _leadData.score += 20;

    submitLead(_leadData);

    addMsg('1. Our AI analyzes your market within 24 hours.\n2. We\u2019ll text you a personalized audit.\n3. You\u2019ll see exactly how many patients you\u2019re missing \u2014 and what it would cost to capture them.\n\nNo commitment. Just data.', 'bot');
    addMsg('In the meantime, check out our case studies at ' + API_BASE, 'bot');
  }

  function sendMessage() {
    var text = _input.value.trim();
    if (!text) return;
    addMsg(text, 'user');
    _input.value = '';

    // Static fallback mode or full mode
    if (_leadData.niche && !_leadData.name) {
      handleInput(text);
    } else if (!_leadData.name) {
      handleName(text);
    } else if (!_leadData.phone) {
      handlePhone(text);
    } else if (!_leadData.practice) {
      handlePractice(text);
    }
  }

  // ─── Event wiring ──────────────────────────────────────────────────
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
