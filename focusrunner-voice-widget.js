/**
 * FocusRunner Voice Agent — COMPLETELY SELF-CONTAINED WIDGET
 * 
 * No backend required. No API keys. No server.
 * Just drop this single file onto any page.
 * 
 * Voice Input:  Web Speech API (Chrome/Edge/Safari)
 * Voice Output: Web Speech Synthesis (built into browser)
 * Text Input:   Fallback when voice isn't available
 * Lead Storage: Webhook (configurable) + console + custom event
 * 
 * Integration — add ONE line before </body>:
 *   <script src="focusrunner-voice-widget.js" 
 *           data-webhook="https://your-crm.com/api/leads">
 *   </script>
 * 
 * @license MIT — FocusRunner Labs
 */
(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════
  const script = document.currentScript;
  const ACCENT   = script?.getAttribute('data-accent')  || '#7C3AED';
  const WEBHOOK  = script?.getAttribute('data-webhook') || '';
  const VOICE    = script?.getAttribute('data-voice')   || 'en-US-AriaNeural';  // Edge voices
  const RATE     = parseFloat(script?.getAttribute('data-rate') || '1.0');
  const PITCH    = parseFloat(script?.getAttribute('data-pitch') || '1.0');
  const AGENT    = 'Aria';
  const BRAND    = 'FocusRunner';
  const EMAIL    = 'focusrunnerai@gmail.com';

  // ═══════════════════════════════════════════════════════════
  // SURVEY SCRIPT
  // ═══════════════════════════════════════════════════════════
  const SURVEY = [
    { id:'greeting', field:null,
      say:"Hi there! I'm {agent}, {brand}'s AI assistant. I help businesses figure out if our AI growth infrastructure is the right fit. This'll take about two minutes — mind if I ask you a few quick questions?" },
    { id:'name', field:'contact_name',
      say:"Great! First, what's your name?" },
    { id:'company', field:'company_name',
      say:"Nice to meet you, {contact_name}! And what company are you with?" },
    { id:'role', field:'role',
      say:"Got it. And what's your role at {company_name}? Are you the founder, a marketing lead, or something else?" },
    { id:'industry', field:'industry',
      say:"What industry is {company_name} in? For example — SaaS, e-commerce, healthcare, fintech, real estate…" },
    { id:'size', field:'company_size',
      say:"Roughly how big is your team? Under ten people, ten to fifty, fifty to two hundred, or larger?" },
    { id:'challenge', field:'primary_challenge',
      say:"What's the biggest marketing or growth challenge you're facing right now? The thing that keeps you up at night." },
    { id:'interest', field:'service_interest',
      say:"We offer AI-powered SEO, voice and chat agents for lead qualification, workflow automation, behavioral email campaigns, and full AI marketing strategy. Which sounds most relevant to you?" },
    { id:'budget', field:'budget_range',
      say:"Just to make sure we're in the right ballpark — what's your monthly budget for marketing and growth? Under five thousand, five to twenty, or above twenty?" },
    { id:'timeline', field:'timeline',
      say:"And your timeline? Looking to get started right away, in the next month, or just exploring for now?" },
    { id:'email', field:'email',
      say:"Almost done! What's the best email to reach you at? We'll send a personalized summary for {company_name}." },
    { id:'closing', field:null,
      say:"Awesome, {contact_name} — thank you! I've captured everything. Someone from {brand} will review your info and reach out within one business day with a tailored proposal. Have a great day!" }
  ];

  // ═══════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════
  let idx = 0;                // current question index
  let collected = {};         // {contact_name, company_name, ...}
  let sessionId = '';
  let isOpen = false;
  let isListening = false;
  let isSpeaking = false;
  let isProcessing = false;
  let recognition = null;
  let synth = window.speechSynthesis;
  let currentUtterance = null;

  // ═══════════════════════════════════════════════════════════
  // INJECT STYLES
  // ═══════════════════════════════════════════════════════════
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
.frv-header{padding:16px 20px;background:linear-gradient(135deg,var(--fr-a),#5B21B6);display:flex;align-items:center;gap:12px;flex-shrink:0}
.frv-avatar{width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:20px}
.frv-header h3{margin:0;font-size:15px;font-weight:600;color:white}
.frv-header span{font-size:11px;color:rgba(255,255,255,.7);display:flex;align-items:center;gap:4px}
.frv-status{width:6px;height:6px;border-radius:50%;background:#34D399;display:inline-block}
.frv-close{margin-left:auto;background:none;border:none;color:rgba(255,255,255,.7);font-size:22px;cursor:pointer;padding:4px;line-height:1}
.frv-close:hover{color:white}
.frv-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;min-height:200px;max-height:340px;scroll-behavior:smooth}
.frv-msg{max-width:85%;padding:10px 14px;border-radius:14px;font-size:13.5px;line-height:1.45;animation:frv-mi .25s ease-out;word-wrap:break-word}
@keyframes frv-mi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.frv-msg.agent{background:rgba(124,58,237,.15);border:1px solid rgba(124,58,237,.2);align-self:flex-start;border-bottom-left-radius:4px}
.frv-msg.user{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);align-self:flex-end;border-bottom-right-radius:4px}
.frv-msg.system{background:none;align-self:center;font-size:12px;color:var(--fr-td);text-align:center;padding:6px 10px}
.frv-ctrls{padding:12px 16px;border-top:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:10px;flex-shrink:0}
.frv-mic{width:44px;height:44px;border-radius:50%;background:var(--fr-a);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s}
.frv-mic:hover{background:#8B5CF6;box-shadow:0 0 16px rgba(124,58,237,.4)}
.frv-mic.recording{background:#EF4444 !important;animation:frv-rec 1.2s infinite}
@keyframes frv-rec{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.5)}50%{box-shadow:0 0 0 14px rgba(239,68,68,0)}}
.frv-mic svg{width:20px;height:20px;fill:white}
.frv-inp{flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:22px;padding:10px 16px;color:var(--fr-t);font-size:13px;outline:none}
.frv-inp:focus{border-color:var(--fr-a)}
.frv-inp::placeholder{color:var(--fr-td)}
.frv-progress{height:2px;background:rgba(255,255,255,.08);flex-shrink:0}
.frv-progress-bar{height:100%;background:var(--fr-a);transition:width .4s ease;width:0%}
.frv-dots{display:flex;gap:4px;padding:8px 14px}
.frv-dots span{width:6px;height:6px;border-radius:50%;background:var(--fr-a);animation:frv-b 1.2s infinite}
.frv-dots span:nth-child(2){animation-delay:.15s}
.frv-dots span:nth-child(3){animation-delay:.3s}
@keyframes frv-b{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}
@media(max-width:480px){.frv-panel{width:calc(100vw - 32px);right:16px;bottom:88px;max-height:480px}.frv-fab{bottom:16px;right:16px;width:54px;height:54px}}`;

  document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);

  // ═══════════════════════════════════════════════════════════
  // BUILD DOM
  // ═══════════════════════════════════════════════════════════
  const fab = document.createElement('button');
  fab.className = 'frv-fab';
  fab.title = 'Talk to Aria — FocusRunner AI';
  fab.setAttribute('aria-label', 'Open voice assistant');
  fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>';

  const panel = document.createElement('div');
  panel.className = 'frv-panel';
  panel.innerHTML = `
    <div class="frv-header">
      <div class="frv-avatar">🎙️</div>
      <div><h3>${AGENT}</h3><span><span class="frv-status"></span> ${BRAND} AI</span></div>
      <button class="frv-close" aria-label="Close">&times;</button>
    </div>
    <div class="frv-progress"><div class="frv-progress-bar" id="frvProg"></div></div>
    <div class="frv-msgs" id="frvMsgs"></div>
    <div class="frv-ctrls">
      <button class="frv-mic" id="frvMic" aria-label="Voice input">
        <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
      </button>
      <input class="frv-inp" id="frvInp" placeholder="Type or tap mic to speak..." autocomplete="off">
    </div>`;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  // Refs
  const msgs   = document.getElementById('frvMsgs');
  const mic    = document.getElementById('frvMic');
  const inp    = document.getElementById('frvInp');
  const close  = panel.querySelector('.frv-close');
  const prog   = document.getElementById('frvProg');

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════
  const $ = (s,t,r) => {
    const d = document.createElement('div');
    d.className = `frv-msg ${r}`;
    d.textContent = t;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  };

  const dots = (show) => {
    const el = msgs.querySelector('.frv-dots');
    if (el) el.remove();
    if (show) {
      const d = document.createElement('div');
      d.className = 'frv-msg agent frv-dots';
      d.innerHTML = '<span></span><span></span><span></span>';
      msgs.appendChild(d);
      msgs.scrollTop = msgs.scrollHeight;
    }
  };

  const fmt = (tpl, data) => tpl.replace(/\{(\w+)\}/g, (_,k) => data[k] || `{${k}}`);

  const progress = () => {
    prog.style.width = Math.round((idx / (SURVEY.length - 1)) * 100) + '%';
  };

  const genId = () => Math.random().toString(36).slice(2,10);

  // ═══════════════════════════════════════════════════════════
  // SPEECH SYNTHESIS (voice output)
  // ═══════════════════════════════════════════════════════════
  function speak(text) {
    if (!synth) return;
    synth.cancel(); // Stop any current speech

    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = RATE;
    u.pitch = PITCH;

    // Try to find the configured voice
    const voices = synth.getVoices();
    const match = voices.find(v => v.name === VOICE) ||
                  voices.find(v => v.lang === 'en-US' && v.name.includes('Neural')) ||
                  voices.find(v => v.lang === 'en-US' && v.name.includes('Female')) ||
                  voices.find(v => v.lang === 'en-US');
    if (match) u.voice = match;

    u.onstart = () => { isSpeaking = true; };
    u.onend = u.onerror = () => { isSpeaking = false; currentUtterance = null; };

    currentUtterance = u;
    isSpeaking = true;
    synth.speak(u);
  }

  // Preload voices
  if (synth) synth.getVoices();
  if (synth && synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = () => synth.getVoices();
  }

  // ═══════════════════════════════════════════════════════════
  // SPEECH RECOGNITION (voice input)
  // ═══════════════════════════════════════════════════════════
  function initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.lang = 'en-US';
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = e => {
      const t = e.results[0][0].transcript.trim();
      if (t) { inp.value = t; processResponse(t); }
    };
    r.onerror = e => { console.debug('Speech:', e.error); stopListening(); };
    r.onend = () => stopListening();
    return r;
  }

  function startListening() {
    if (isListening || isProcessing || isSpeaking) return;

    // Pause speech if speaking
    if (synth && isSpeaking) synth.cancel();

    recognition = initRecognition();
    if (!recognition) { $('msgs', '🎤 Voice input not supported. Please type your answers.', 'system'); return; }

    isListening = true;
    mic.classList.add('recording');
    fab.classList.add('listening');
    inp.placeholder = 'Listening...';
    recognition.start();
  }

  function stopListening() {
    isListening = false;
    mic.classList.remove('recording');
    fab.classList.remove('listening');
    inp.placeholder = 'Type or tap mic to speak...';
    if (recognition) { try { recognition.stop(); } catch(e) {}; recognition = null; }
  }

  // ═══════════════════════════════════════════════════════════
  // SURVEY LOGIC
  // ═══════════════════════════════════════════════════════════
  function askQuestion() {
    if (idx >= SURVEY.length) return finishSurvey();

    const step = SURVEY[idx];
    const text = fmt(step.say, { ...collected, agent: AGENT, brand: BRAND });

    dots(false);
    $(null, text, 'agent');
    progress();

    // Speak the question
    speak(text);
  }

  function processResponse(userText) {
    if (isProcessing || idx >= SURVEY.length) return;
    isProcessing = true;
    inp.disabled = true;
    stopListening();

    const step = SURVEY[idx];

    // Save user's response
    $(null, userText, 'user');

    // Extract field value
    if (step.field) {
      let val = userText.trim();
      if (step.field === 'email') {
        const m = val.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
        if (m) val = m[0];
      }
      collected[step.field] = val;
    }

    // Move to next question
    idx++;
    inp.value = '';

    if (idx >= SURVEY.length) {
      finishSurvey();
    } else {
      // Small pause before next question
      setTimeout(() => {
        askQuestion();
        isProcessing = false;
        inp.disabled = false;
        if (isOpen) inp.focus();
      }, 600);
    }
  }

  function finishSurvey() {
    dots(false);
    progress();
    prog.style.width = '100%';

    const closeStep = SURVEY[SURVEY.length - 1];
    const closeText = fmt(closeStep.say, { ...collected, agent: AGENT, brand: BRAND });
    $(null, closeText, 'agent');
    speak(closeText);

    $(null, '✅ Thanks! Our team will review your info and reach out within 1 business day.', 'system');

    // Build lead object
    const lead = {
      lead_id: sessionId || genId(),
      timestamp: new Date().toISOString(),
      source: 'voice_agent_website',
      agent_version: '2.0.0',
      ...collected,
    };

    console.log('🎯 FocusRunner Lead:', lead);

    // Fire custom event — parent page can listen
    try {
      window.dispatchEvent(new CustomEvent('focusrunner:lead', { detail: lead }));
    } catch(e) {}

    // POST to webhook if configured
    if (WEBHOOK) {
      fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead),
      }).then(r => console.log('📤 Lead sent:', r.status))
        .catch(e => console.warn('⚠️ Webhook failed:', e));
    }

    // Reset state for next survey (after 5 seconds)
    setTimeout(() => {
      if (!isOpen) {
        idx = 0;
        collected = {};
        sessionId = genId();
        msgs.innerHTML = '';
        prog.style.width = '0%';
      }
    }, 5000);

    isProcessing = false;
    inp.disabled = false;
  }

  function startSurvey() {
    idx = 0;
    collected = {};
    sessionId = genId();
    msgs.innerHTML = '';
    prog.style.width = '0%';
    $(null, `👋 Hi! I'm ${AGENT}, ${BRAND}'s AI assistant. I'll ask a few quick questions to see how we can help your business grow.`, 'system');
    setTimeout(() => askQuestion(), 800);
  }

  // ═══════════════════════════════════════════════════════════
  // PANEL OPEN / CLOSE
  // ═══════════════════════════════════════════════════════════
  function openPanel() {
    isOpen = true;
    panel.classList.add('open');
    fab.style.display = 'none';
    if (idx === 0 && msgs.children.length === 0) startSurvey();
    inp.focus();
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('open');
    fab.style.display = 'flex';
    stopListening();
    if (synth) synth.cancel();
  }

  // ═══════════════════════════════════════════════════════════
  // EVENT LISTENERS
  // ═══════════════════════════════════════════════════════════
  fab.addEventListener('click', () => isOpen ? closePanel() : openPanel());
  close.addEventListener('click', closePanel);

  // Mic button — click to toggle, hold to talk
  mic.addEventListener('click', () => {
    if (isProcessing) return;
    isListening ? stopListening() : startListening();
  });

  // Hold-to-talk on desktop
  mic.addEventListener('mousedown', e => {
    if (!isListening && !isProcessing && !isSpeaking) startListening();
  });
  mic.addEventListener('mouseup', () => { if (isListening) stopListening(); });
  mic.addEventListener('mouseleave', () => { if (isListening) stopListening(); });

  // Hold-to-talk on mobile
  mic.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!isListening && !isProcessing && !isSpeaking) startListening();
  });
  mic.addEventListener('touchend', e => {
    e.preventDefault();
    if (isListening) stopListening();
  });

  // Text input
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && inp.value.trim() && !isProcessing) {
      const text = inp.value.trim();
      inp.value = '';
      processResponse(text);
    }
  });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) closePanel();
  });

  // ═══════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════
  console.log(`%c🎙️ ${BRAND} Voice Agent %cready`,
    'color:#A78BFA;font-weight:bold', 'color:#9CA3AF');
  console.log(`   Agent: ${AGENT} | Voice: ${VOICE}`);
  console.log(`   Webhook: ${WEBHOOK || '(not configured)'}`);
  console.log(`   Click the mic button to start!`);

  // Check browser support
  if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
    console.info('ℹ️ Voice input not supported — text fallback active.');
  }
  if (!window.speechSynthesis) {
    console.info('ℹ️ Voice output not supported — text-only mode.');
  }

})();

// v2.0.0 — Self-contained voice widget

// v2.0.0 — Self-contained voice widget | deploy trigger
