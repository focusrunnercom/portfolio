/**
 * FocusRunner Voice Agent — Embeddable Widget
 * 
 * Add this single script tag to any page on focusrunner.com:
 * 
 *   <script src="focusrunner-voice-widget.js" 
 *           data-endpoint="https://your-server.com"
 *           data-agent="Aria"
 *           data-brand="FocusRunner"
 *           data-accent="#7C3AED">
 *   </script>
 * 
 * Dependencies: none (vanilla JS, no framework required).
 * ~8 KB gzipped.
 */
(function() {
  'use strict';

  // ═══════════════ CONFIG (from data attributes or defaults) ═══════════════
  const script = document.currentScript;
  const API = script?.getAttribute('data-endpoint') || 'http://localhost:8000';
  const AGENT = script?.getAttribute('data-agent') || 'Aria';
  const BRAND = script?.getAttribute('data-brand') || 'FocusRunner';
  const ACCENT = script?.getAttribute('data-accent') || '#7C3AED';

  // ═══════════════ STATE ═══════════════
  let sessionId = null;
  let isOpen = false;
  let isRecording = false;
  let isProcessing = false;
  let recognition = null;

  // ═══════════════ INJECT STYLES ═══════════════
  const css = `
:root{--fr-a:${ACCENT};--fr-ag:${ACCENT}CC;--fr-d:#0F0A1A;--fr-s:#1A1530;--fr-t:#F5F3FF;--fr-td:#9CA3AF}
.frv-fab{position:fixed;bottom:24px;right:24px;z-index:2147483647;width:60px;height:60px;border-radius:50%;background:var(--fr-a);border:none;cursor:pointer;box-shadow:0 8px 32px rgba(124,58,237,.25),0 0 24px var(--fr-ag);display:flex;align-items:center;justify-content:center;transition:all .3s;animation:frv-pulse 2s infinite}
.frv-fab:hover{transform:scale(1.08);box-shadow:0 12px 40px rgba(124,58,237,.4),0 0 36px var(--fr-ag)}
.frv-fab:active{transform:scale(.96)}
.frv-fab svg{width:28px;height:28px;fill:white}
.frv-fab.listening svg{animation:frv-listen .6s infinite alternate}
@keyframes frv-pulse{0%,100%{box-shadow:0 8px 32px rgba(124,58,237,.25),0 0 16px var(--fr-ag)}50%{box-shadow:0 8px 32px rgba(124,58,237,.25),0 0 32px var(--fr-ag)}}
@keyframes frv-listen{from{transform:scale(1)}to{transform:scale(1.12)}}
.frv-panel{position:fixed;bottom:100px;right:24px;z-index:2147483646;width:380px;max-height:560px;background:var(--fr-s);border:1px solid rgba(124,58,237,.3);border-radius:18px;box-shadow:0 8px 32px rgba(124,58,237,.25);display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--fr-t);animation:frv-in .35s cubic-bezier(.16,1,.3,1)}
.frv-panel.open{display:flex}
@keyframes frv-in{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
.frv-header{padding:16px 20px;background:linear-gradient(135deg,var(--fr-a),#5B21B6);display:flex;align-items:center;gap:12px}
.frv-avatar{width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:20px}
.frv-header h3{margin:0;font-size:15px;font-weight:600}
.frv-header span{font-size:11px;color:rgba(255,255,255,.7);display:flex;align-items:center;gap:4px}
.frv-status{width:6px;height:6px;border-radius:50%;background:#34D399;display:inline-block}
.frv-close{margin-left:auto;background:none;border:none;color:rgba(255,255,255,.7);font-size:20px;cursor:pointer;padding:4px;line-height:1}
.frv-close:hover{color:white}
.frv-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;min-height:200px;max-height:340px}
.frv-msg{max-width:85%;padding:10px 14px;border-radius:14px;font-size:13.5px;line-height:1.45;animation:frv-mi .25s ease-out}
@keyframes frv-mi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.frv-msg.agent{background:rgba(124,58,237,.15);border:1px solid rgba(124,58,237,.2);align-self:flex-start;border-bottom-left-radius:4px}
.frv-msg.user{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);align-self:flex-end;border-bottom-right-radius:4px}
.frv-msg.system{background:none;align-self:center;font-size:11px;color:var(--fr-td);text-align:center}
.frv-ctrls{padding:12px 16px;border-top:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:10px}
.frv-mic{width:44px;height:44px;border-radius:50%;background:var(--fr-a);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.frv-mic:hover{background:#8B5CF6;box-shadow:0 0 16px rgba(124,58,237,.4)}
.frv-mic.rec{background:#EF4444;animation:frv-rec 1.2s infinite}
@keyframes frv-rec{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.5)}50%{box-shadow:0 0 0 12px rgba(239,68,68,0)}}
.frv-mic svg{width:20px;height:20px;fill:white}
.frv-inp{flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:22px;padding:10px 16px;color:var(--fr-t);font-size:13px;outline:none}
.frv-inp:focus{border-color:var(--fr-a)}
.frv-inp::placeholder{color:var(--fr-td)}
.frv-dots{display:flex;gap:4px;padding:8px 14px}
.frv-dots span{width:6px;height:6px;border-radius:50%;background:var(--fr-a);animation:frv-b 1.2s infinite}
.frv-dots span:nth-child(2){animation-delay:.15s}
.frv-dots span:nth-child(3){animation-delay:.3s}
@keyframes frv-b{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}
@media(max-width:480px){.frv-panel{width:calc(100vw - 32px);right:16px;bottom:88px;max-height:480px}.frv-fab{bottom:16px;right:16px;width:54px;height:54px}}`;

  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ═══════════════ BUILD DOM ═══════════════
  const fab = document.createElement('button');
  fab.className = 'frv-fab';
  fab.title = `Talk to ${AGENT} — ${BRAND} AI`;
  fab.setAttribute('aria-label', 'Open voice assistant');
  fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>';

  const panel = document.createElement('div');
  panel.className = 'frv-panel';
  panel.innerHTML = `
    <div class="frv-header">
      <div class="frv-avatar">🎙️</div><div><h3>${AGENT}</h3><span><span class="frv-status"></span>${BRAND} AI</span></div>
      <button class="frv-close" aria-label="Close">×</button>
    </div>
    <div class="frv-msgs"><div class="frv-msg system">👋 Welcome! I'm ${AGENT}, ${BRAND}'s AI assistant.</div></div>
    <div class="frv-ctrls">
      <button class="frv-mic" aria-label="Voice input"><svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg></button>
      <input class="frv-inp" placeholder="Type or tap mic to speak..." autocomplete="off">
    </div>`;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  // ═══════════════ DOM REFS ═══════════════
  const msgs = panel.querySelector('.frv-msgs');
  const mic = panel.querySelector('.frv-mic');
  const inp = panel.querySelector('.frv-inp');
  const close = panel.querySelector('.frv-close');

  // ═══════════════ HELPERS ═══════════════
  function msg(text, role) {
    const d = document.createElement('div');
    d.className = 'frv-msg ' + role;
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function typing(show) {
    if (show) {
      const d = document.createElement('div');
      d.className = 'frv-msg agent frv-dots';
      d.id = 'frvTyping';
      d.innerHTML = '<span></span><span></span><span></span>';
      msgs.appendChild(d);
      msgs.scrollTop = msgs.scrollHeight;
    } else {
      const el = document.getElementById('frvTyping');
      if (el) el.remove();
    }
  }

  async function api(path, body) {
    const r = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return r.json();
  }

  function playAudioHex(hex) {
    if (!hex) return;
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    const blob = new Blob([bytes], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.play().catch(() => {});
    a.onended = () => URL.revokeObjectURL(url);
  }

  // ═══════════════ API ═══════════════
  async function start() {
    typing(true);
    try {
      const d = await api('/voice-agent/start');
      typing(false);
      sessionId = d.session_id;
      if (d.text) { msg(d.text, 'agent'); playAudioHex(d.audio_hex); }
    } catch (e) {
      typing(false);
      msg("Sorry, I can't connect right now. Try again in a moment.", 'agent');
    }
  }

  async function respond(text) {
    if (isProcessing || !sessionId) return;
    isProcessing = true;
    msg(text, 'user');
    typing(true);
    try {
      const d = await api('/voice-agent/respond', { session_id: sessionId, text });
      typing(false);
      if (d.text) { msg(d.text, 'agent'); playAudioHex(d.audio_hex); }
      if (d.is_complete) {
        msg('✅ Thanks! Our team will reach out within 1 business day.', 'system');
        sessionId = null;
      }
    } catch (e) {
      typing(false);
      msg("Hmm, something went wrong. Try again?", 'agent');
    }
    isProcessing = false;
  }

  // ═══════════════ SPEECH ═══════════════
  function initSR() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.lang = 'en-US';
    r.interimResults = false;
    r.continuous = false;
    r.onresult = e => {
      const t = e.results[0][0].transcript.trim();
      if (t) { inp.value = t; respond(t); }
    };
    r.onerror = () => stopRec();
    r.onend = () => stopRec();
    return r;
  }

  function startRec() {
    if (isRecording) return;
    recognition = initSR();
    if (!recognition) { msg('Voice input not supported. Please type.', 'system'); return; }
    isRecording = true;
    mic.classList.add('rec');
    fab.classList.add('listening');
    recognition.start();
  }

  function stopRec() {
    isRecording = false;
    mic.classList.remove('rec');
    fab.classList.remove('listening');
    if (recognition) { try { recognition.stop(); } catch(e) {}; recognition = null; }
  }

  // ═══════════════ EVENTS ═══════════════
  fab.onclick = () => { isOpen ? closeP() : openP(); };
  close.onclick = closeP;
  function openP() { isOpen = true; panel.classList.add('open'); fab.style.display = 'none'; inp.focus(); if (!sessionId) start(); }
  function closeP() { isOpen = false; panel.classList.remove('open'); fab.style.display = 'flex'; stopRec(); }

  mic.onclick = () => { if (!isProcessing) isRecording ? stopRec() : startRec(); };
  ['mousedown','touchstart'].forEach(ev => mic.addEventListener(ev, e => { e.preventDefault(); if (!isRecording && !isProcessing) startRec(); }));
  ['mouseup','mouseleave','touchend'].forEach(ev => mic.addEventListener(ev, e => { e.preventDefault(); if (isRecording) stopRec(); }));

  inp.onkeydown = e => { if (e.key === 'Enter' && inp.value.trim() && !isProcessing) { const t = inp.value.trim(); inp.value = ''; respond(t); }};

  console.log(`🎙️ ${BRAND} Voice Agent ready → ${API}`);
})();
