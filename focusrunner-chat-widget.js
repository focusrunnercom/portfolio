/**
 * FocusRunner Lead Qualification Chat Widget
 * Self-contained — paste the <script src="..."> tag and it works.
 * No framework, no dependencies, no HTML changes needed.
 *
 * Usage:
 *   <script src="focusrunner-chat-widget.js"></script>
 *
 * Config (set before the script tag):
 *   <script>window.FR_CHAT_CONFIG = { primaryColor: '#00D4AA', apiUrl: '...' };</script>
 */
(function() {
  'use strict';

  // ─── CONFIG ───────────────────────────────────────────
  var cfg = window.FR_CHAT_CONFIG || {};
  var PRIMARY = cfg.primaryColor || '#00D4AA';
  var API_URL = cfg.apiUrl || 'https://focusrunner.vercel.app/api/lead';
  var BRAND = cfg.brandName || 'FocusRunner';

  // ─── INJECT STYLES ────────────────────────────────────
  var styleId = 'fr-widget-styles';
  if (!document.getElementById(styleId)) {
    var s = document.createElement('style');
    s.id = styleId;
    s.textContent = [
      '@keyframes frSlideUp{from{opacity:0;transform:translateY(16px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '@keyframes frMsgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',
      '@keyframes frTyping{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}',
      '.fr-hidden{display:none!important}',
      '.fr-msg-in{animation:frMsgIn .3s ease-out}',
      '#fr-widget ::-webkit-scrollbar{width:4px}',
      '#fr-widget ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:4px}',
      '@media(max-width:480px){#fr-widget{width:calc(100vw-24px)!important;right:12px!important;bottom:88px!important;max-height:75vh!important}}'
    ].join('');
    document.head.appendChild(s);
  }

  // ─── CREATE BUTTON ────────────────────────────────────
  var btn = document.createElement('div');
  btn.id = 'fr-btn';
  btn.setAttribute('aria-label', 'Open FocusRunner chat');
  btn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  Object.assign(btn.style, {
    position:'fixed', bottom:'28px', right:'28px', width:'62px', height:'62px',
    borderRadius:'50%', background:'linear-gradient(135deg,'+PRIMARY+' 0%, #009B7D 100%)',
    border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
    boxShadow:'0 6px 28px rgba(0,212,170,0.35)', transition:'transform 0.25s, box-shadow 0.25s',
    zIndex:'999999'
  });
  btn.onmouseover = function(){ this.style.transform = 'scale(1.08)'; };
  btn.onmouseout  = function(){ this.style.transform = 'scale(1)'; };

  // ─── CREATE WIDGET ────────────────────────────────────
  var w = document.createElement('div');
  w.id = 'fr-widget';
  w.className = 'fr-hidden';
  Object.assign(w.style, {
    position:'fixed', bottom:'100px', right:'28px', width:'380px',
    maxHeight:'600px', background:'#14141e', borderRadius:'18px',
    border:'1px solid rgba(255,255,255,0.08)',
    boxShadow:'0 20px 60px rgba(0,0,0,0.6)',
    display:'flex', flexDirection:'column', overflow:'hidden',
    zIndex:'999998', animation:'frSlideUp 0.35s ease-out',
    fontFamily:'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  });

  // Header
  var hdr = document.createElement('div');
  Object.assign(hdr.style, {
    background:'linear-gradient(135deg,'+PRIMARY+' 0%, #009B7D 100%)',
    padding:'18px 20px 14px', flexShrink:0
  });
  hdr.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:2px">'+
    '<span style="font-size:22px">🤖</span>'+
    '<span style="font-weight:700;font-size:1rem;color:#fff">'+BRAND+' AI</span>'+
    '</div>'+
    '<div style="font-size:0.76rem;color:rgba(255,255,255,0.8);margin-left:32px">We reply in ~2 min</div>';
  w.appendChild(hdr);

  // Messages area
  var body = document.createElement('div');
  body.id = 'fr-body';
  Object.assign(body.style, {
    flex:1, overflowY:'auto', padding:'16px 18px 10px',
    display:'flex', flexDirection:'column', gap:'10px', minHeight:'260px'
  });

  // Typing indicator
  var typingEl = document.createElement('div');
  typingEl.id = 'fr-typing';
  typingEl.innerHTML = '<div style="display:flex;gap:4px;padding:12px 16px;align-self:flex-start;max-width:88%">'+
    '<div class="fr-typing-dot" style="width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,0.3);animation:frTyping 1.4s infinite"></div>'+
    '<div class="fr-typing-dot" style="width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,0.3);animation:frTyping 1.4s infinite 0.2s"></div>'+
    '<div class="fr-typing-dot" style="width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,0.3);animation:frTyping 1.4s infinite 0.4s"></div>'+
    '</div>';
  typingEl.style.display = 'none';
  body.appendChild(typingEl);
  w.appendChild(body);

  // Input bar
  var inpWrap = document.createElement('div');
  Object.assign(inpWrap.style, {
    display:'flex', alignItems:'center', padding:'10px 14px 14px',
    gap:'10px', borderTop:'1px solid rgba(255,255,255,0.06)', flexShrink:0
  });
  inpWrap.innerHTML = '<input id="fr-input" type="text" placeholder="Type your answer…" style="flex:1;background:#1a1a28;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:11px 14px;color:rgba(255,255,255,0.9);font-size:0.88rem;outline:none">'+
    '<button id="fr-send" style="background:'+PRIMARY+';border:none;width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;flexShrink:0;transition:background 0.2s">'+
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>';
  w.appendChild(inpWrap);

  document.body.appendChild(btn);
  document.body.appendChild(w);

  // ─── STATE ─────────────────────────────────────────────
  var state = {
    open: false,
    step: 0,      // 0=closed, 1=interest, 2=name, 3=email, 4=phone, 5=time, 55=custom time, 6=confirm, 7=done
    name: '',
    email: '',
    phone: '',
    time: '',
    interest: '',
    waitingForInput: false,
    skipPhone: false
  };

  var inputEl = document.getElementById('fr-input');
  var sendEl  = document.getElementById('fr-send');
  var msgBody = document.getElementById('fr-body');
  var typing  = document.getElementById('fr-typing');

  // ─── HELPERS ───────────────────────────────────────────
  function addMsg(text, type, isHTML) {
    var el = document.createElement('div');
    el.className = 'fr-msg-in';
    var st = {
      maxWidth: '88%', padding: '11px 15px', borderRadius: '14px',
      fontSize: '0.88rem', lineHeight: 1.5, wordBreak: 'break-word'
    };
    if (type === 'bot') {
      st.alignSelf = 'flex-start';
      st.background = '#1e1e2e';
      st.color = 'rgba(255,255,255,0.92)';
      st.borderBottomLeftRadius = '4px';
    } else {
      st.alignSelf = 'flex-end';
      st.background = 'linear-gradient(135deg,'+PRIMARY+' 0%, #009B7D 100%)';
      st.color = '#fff';
      st.borderBottomRightRadius = '4px';
    }
    Object.assign(el.style, st);
    if (isHTML) el.innerHTML = text;
    else el.textContent = text;
    msgBody.insertBefore(el, typing);
    msgBody.scrollTop = msgBody.scrollHeight;
  }

  function showTyping() { typing.style.display = 'block'; msgBody.scrollTop = msgBody.scrollHeight; }
  function hideTyping() { typing.style.display = 'none'; }

  function after(ms) { return new Promise(function(r){ setTimeout(r,ms); }); }

  function botMsg(text, html) {
    showTyping();
    after(300).then(function(){
      hideTyping();
      addMsg(text, 'bot', html);
    });
    return after(400);
  }

  function setInputMode(active, placeholder) {
    state.waitingForInput = active;
    if (active) {
      inputEl.style.display = '';
      sendEl.style.display = '';
      inputEl.placeholder = placeholder || 'Type your answer…';
      setTimeout(function(){ inputEl.focus(); }, 100);
    } else {
      inputEl.style.display = 'none';
      sendEl.style.display = 'none';
    }
  }
  function hideInput() { setInputMode(false); }

  function showOptions(opts) {
    hideInput();
    var wrap = document.createElement('div');
    Object.assign(wrap.style, {
      display:'flex', flexWrap:'wrap', gap:'8px', marginTop:'2px', alignSelf:'flex-start', maxWidth:'100%'
    });
    opts.forEach(function(opt){
      var el = document.createElement('button');
      el.textContent = opt;
      Object.assign(el.style, {
        background:'transparent', border:'1px solid rgba(0,212,170,0.35)',
        color:'#00D4AA', padding:'9px 16px', borderRadius:'20px',
        fontSize:'0.82rem', cursor:'pointer', transition:'all 0.2s',
        whiteSpace:'nowrap'
      });
      el.onmouseover = function(){ el.style.background = 'rgba(0,212,170,0.1)'; };
      el.onmouseout  = function(){ el.style.background = 'transparent'; };
      el.onclick = function(){ handleOptionClick(opt); };
      wrap.appendChild(el);
    });
    msgBody.insertBefore(wrap, typing);
    msgBody.scrollTop = msgBody.scrollHeight;
  }

  function clearOptions() {
    var qsa = msgBody.querySelectorAll.bind(msgBody);
    qsa('div > button').forEach(function(b){
      if (b.parentElement && b.parentElement.parentElement === msgBody) b.parentElement.remove();
    });
  }

  // ─── CONVERSATION FLOW ───────────────────────────────
  function startConversation() {
    state.step = 1;
    addMsg('Hey there! I\'m the <strong>'+BRAND+' AI</strong> assistant 👋', 'bot', true);
    after(600).then(function(){
      addMsg('I\'ll help figure out how AI automation can level up your marketing. It\'ll take about 2 minutes ⏱️', 'bot', true);
      return after(500);
    }).then(function(){
      addMsg('What brings you here today?', 'bot');
      showOptions(['📞 See AI lead gen in action', '🚀 AEO / SEO case studies', '💬 Just browsing, have questions']);
    });
  }

  function askName() {
    state.step = 2;
    botMsg('First — <strong>what\'s your name?</strong> 😄', true);
    setInputMode(true, 'Your name…');
  }

  function askEmail() {
    state.step = 3;
    botMsg('Nice to meet you, <strong>' + state.name + '</strong>!', true).then(function(){
      return after(200);
    }).then(function(){
      botMsg('What\'s your email? I\'ll send over a <strong>short demo</strong> of how FocusRunner AI helps businesses grow.', true);
      setInputMode(true, 'your@email.com');
    });
  }

  function askPhone() {
    state.step = 4;
    botMsg('And what\'s your <strong>phone number</strong>? Our team usually calls to discuss your specific situation — way more useful than generic emails ☎️', true);
    showOptions(['📱 I\'ll share my number', '⏭ Skip — email is enough']);
  }

  function askTime() {
    state.step = 5;
    botMsg('Almost done! When\'s the <strong>best time</strong> for our manager to reach you?', true);
    showOptions(['☀️ Morning (9–12)', '🌤 Afternoon (12–18)', '🌙 Evening (18–21)', '⏰ Other — type it']);
  }

  function confirmData() {
    state.step = 6;
    var p = state.phone || '— skipped —';
    botMsg('<strong>Awesome! Let me confirm everything:</strong>', true).then(function(){
      return after(200);
    }).then(function(){
      addMsg('👤 <strong>Name:</strong> ' + state.name + '<br>📧 <strong>Email:</strong> ' + state.email + '<br>📞 <strong>Phone:</strong> ' + p + '<br>⏰ <strong>Time:</strong> ' + state.time, 'bot', true);
      return after(300);
    }).then(function(){
      botMsg('<strong>Is everything correct?</strong>', true);
      showOptions(['✅ Yes, send it!', '🔄 Let me fix something']);
    });
  }

  function resetConversation() {
    state.step = 1;
    state.name = ''; state.email = ''; state.phone = ''; state.time = '';
    botMsg('No problem! Let\'s start over 😊');
    after(400).then(function(){
      addMsg('What brings you here today?', 'bot');
      showOptions(['📞 See AI lead gen in action', '🚀 AEO / SEO case studies', '💬 Just browsing, have questions']);
    });
  }

  // ─── OPTION CLICK HANDLER ──────────────────────────────
  function handleOptionClick(opt) {
    addMsg(opt, 'user');
    clearOptions();
    hideInput();

    if (state.step === 1) {
      state.interest = opt;
      botMsg('Awesome choice! Let\'s get you set up 😊').then(function(){ askName(); });
    } else if (state.step === 4) {
      if (opt.indexOf('Skip') !== -1) {
        state.phone = '';
        state.skipPhone = true;
        after(200).then(function(){ askTime(); });
      } else {
        setInputMode(true, 'Your phone number…');
      }
    } else if (state.step === 5) {
      var timeMap = {
        '☀️ Morning (9–12)': 'Morning (9–12)',
        '🌤 Afternoon (12–18)': 'Afternoon (12–18)',
        '🌙 Evening (18–21)': 'Evening (18–21)'
      };
      if (opt.indexOf('Other') !== -1) {
        state.step = 55;
        botMsg('Got it! What time works best for you? Just type it in — e.g. \'Friday 3pm\' 📅', true);
        setInputMode(true, 'e.g. Friday 3pm');
        return;
      }
      state.time = timeMap[opt] || opt;
      after(200).then(function(){ confirmData(); });
    } else if (state.step === 6) {
      if (opt.indexOf('Yes') !== -1) {
        submitLead();
      } else {
        resetConversation();
      }
    }
  }

  // ─── SUBMIT ──────────────────────────────────────────────
  function submitLead() {
    state.step = 7;
    addMsg('Your info has been sent to the <strong>'+BRAND+' team</strong>! 🚀', 'bot', true);
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', API_URL, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({
        name: state.name, email: state.email,
        phone: state.phone || '', time: state.time,
        page_url: window.location.href
      }));
    } catch(e) { console.warn('[FocusRunner Chat] Backend unreachable:', e); }
    after(600).then(function(){
      addMsg('A manager will reach out at <strong>' + state.time + '</strong>. Meanwhile, here\'s a bonus read: a case study on how AI agents <strong>tripled conversion rates</strong> for one of our clients 📈', 'bot', true);
    });
  }

  // ─── FREE TEXT INPUT ─────────────────────────────────
  function handleSend() {
    if (!state.waitingForInput) return;
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    addMsg(text, 'user');
    hideInput();

    if (state.step === 2) {
      state.name = text;
      after(300).then(function(){ askEmail(); });
    } else if (state.step === 3) {
      if (text.indexOf('@') !== -1) {
        state.email = text;
        after(300).then(function(){
          botMsg('Perfect! Let me grab your <strong>phone number</strong> too 📱', true);
          askPhone();
        });
      } else {
        addMsg('Hmm, that doesn\'t look like an email 😅 Could you double-check? Like `name@company.com`', 'bot');
        setInputMode(true, 'your@email.com');
      }
    } else if (state.step === 4) {
      state.phone = text;
      after(300).then(function(){ askTime(); });
    } else if (state.step === 55) {
      state.time = text;
      after(300).then(function(){ confirmData(); });
    }
  }

  // ─── TOGGLE ──────────────────────────────────────────
  btn.onclick = function(){
    state.open = !state.open;
    w.classList.toggle('fr-hidden');
    if (state.open && state.step === 0) {
      after(200).then(function(){ startConversation(); });
    }
    if (state.open) {
      msgBody.scrollTop = msgBody.scrollHeight;
      setTimeout(function(){ if(state.waitingForInput) inputEl.focus(); }, 300);
    }
  };

  inputEl.onkeydown = function(e){ if (e.key === 'Enter') handleSend(); };
  sendEl.onclick = handleSend;

})();
