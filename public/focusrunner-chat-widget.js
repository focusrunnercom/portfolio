/**
 * FocusRunner Med Spa Lead Qualification Chat Widget
 * Self-contained — paste the <script src="..."> tag and it works.
 * No framework, no dependencies, no HTML changes needed.
 *
 * SPEAKS DIRECTLY TO MED SPA OWNERS — not generic business visitors.
 * Qualification engine: ad spend + booking rate + timeline scoring.
 *
 * Usage:
 *   <script src="focusrunner-chat-widget.js"></script>
 *
 * Config (set before the script tag):
 *   <script>window.FR_CHAT_CONFIG = { primaryColor: "#6eff8a", apiUrl: "..." };</script>
 */
(function() {
  "use strict";

  // ─── CONFIG ───────────────────────────────────────────
  var cfg = window.FR_CHAT_CONFIG || {};
  var PRIMARY = cfg.primaryColor || "#6eff8a";
  var API_URL = cfg.apiUrl || "https://focusrunner.vercel.app/api/lead";
  var BRAND = cfg.brandName || "FocusRunner";

  // ─── INJECT STYLES ────────────────────────────────────
  var styleId = "fr-widget-styles";
  if (!document.getElementById(styleId)) {
    var s = document.createElement("style");
    s.id = styleId;
    s.textContent = [
      "@keyframes frSlideUp{from{opacity:0;transform:translateY(16px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}",
      "@keyframes frMsgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}",
      "@keyframes frTyping{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}",
      ".fr-hidden{display:none!important}",
      ".fr-msg-in{animation:frMsgIn .3s ease-out}",
      "#fr-widget ::-webkit-scrollbar{width:4px}",
      "#fr-widget ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:4px}",
      "@media(max-width:480px){#fr-widget{width:calc(100vw-24px)!important;right:12px!important;bottom:88px!important;max-height:75vh!important}}"
    ].join("");
    document.head.appendChild(s);
  }

  // ─── CREATE BUTTON ────────────────────────────────────
  var btn = document.createElement("div");
  btn.id = "fr-btn";
  btn.setAttribute("aria-label", "Open FocusRunner chat");
  btn.innerHTML = "<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"white\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\"/></svg>";
  Object.assign(btn.style, {
    position:"fixed", bottom:"28px", right:"28px", width:"62px", height:"62px",
    borderRadius:"50%", background:"linear-gradient(135deg,"+PRIMARY+" 0%, #2a6b38 100%)",
    border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
    boxShadow:"0 6px 28px rgba(110,255,138,0.35)", transition:"transform 0.25s, box-shadow 0.25s",
    zIndex:"999999"
  });
  btn.onmouseover = function(){ this.style.transform = "scale(1.08)"; };
  btn.onmouseout  = function(){ this.style.transform = "scale(1)"; };

  // ─── CREATE WIDGET ────────────────────────────────────
  var w = document.createElement("div");
  w.id = "fr-widget";
  w.className = "fr-hidden";
  Object.assign(w.style, {
    position:"fixed", bottom:"100px", right:"28px", width:"380px",
    maxHeight:"600px", background:"#0d120f", borderRadius:"18px",
    border:"1px solid rgba(110,255,138,0.08)",
    boxShadow:"0 20px 60px rgba(0,0,0,0.6)",
    display:"flex", flexDirection:"column", overflow:"hidden",
    zIndex:"999998", animation:"frSlideUp 0.35s ease-out",
    fontFamily:"JetBrains Mono, -apple-system, BlinkMacSystemFont, Segoe UI, monospace"
  });

  // Header — med spa owner focused
  var hdr = document.createElement("div");
  Object.assign(hdr.style, {
    background:"linear-gradient(135deg,"+PRIMARY+" 0%, #1a2620 100%)",
    padding:"16px 20px 12px", flexShrink:0
  });
  hdr.innerHTML = "<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:2px\">"+
    "<span style=\"color:"+PRIMARY+";font-size:18px\">⏣</span>"+
    "<span style=\"font-weight:700;font-size:0.85rem;color:#d4e5d8\">"+BRAND+" | Med Spa Acquisition</span>"+
    "</div>"+
    "<div style=\"font-size:0.7rem;color:#7a8c7e;margin-left:28px\">85% of ad leads go cold. We fix that.</div>";
  w.appendChild(hdr);

  // Messages area
  var body = document.createElement("div");
  body.id = "fr-body";
  Object.assign(body.style, {
    flex:1, overflowY:"auto", padding:"16px 18px 10px",
    display:"flex", flexDirection:"column", gap:"10px", minHeight:"260px"
  });

  // Typing indicator
  var typingEl = document.createElement("div");
  typingEl.id = "fr-typing";
  typingEl.innerHTML = "<div style=\"display:flex;gap:4px;padding:12px 16px;align-self:flex-start;max-width:88%\">"+
    "<div class=\"fr-typing-dot\" style=\"width:7px;height:7px;border-radius:50%;background:"+PRIMARY+";opacity:0.4;animation:frTyping 1.4s infinite\"></div>"+
    "<div class=\"fr-typing-dot\" style=\"width:7px;height:7px;border-radius:50%;background:"+PRIMARY+";opacity:0.4;animation:frTyping 1.4s infinite 0.2s\"></div>"+
    "<div class=\"fr-typing-dot\" style=\"width:7px;height:7px;border-radius:50%;background:"+PRIMARY+";opacity:0.4;animation:frTyping 1.4s infinite 0.4s\"></div>"+
    "</div>";
  typingEl.style.display = "none";
  body.appendChild(typingEl);
  w.appendChild(body);

  // Input bar
  var inpWrap = document.createElement("div");
  Object.assign(inpWrap.style, {
    display:"flex", alignItems:"center", padding:"10px 14px 14px",
    gap:"10px", borderTop:"1px solid rgba(110,255,138,0.06)", flexShrink:0
  });
  inpWrap.innerHTML = "<input id=\"fr-input\" type=\"text\" placeholder=\"Type your answer...\" style=\"flex:1;background:#0f1412;border:1px solid rgba(110,255,138,0.08);border-radius:8px;padding:11px 14px;color:#d4e5d8;font-size:0.82rem;font-family:JetBrains Mono,monospace;outline:none\">"+
    "<button id=\"fr-send\" style=\"background:"+PRIMARY+";border:none;width:44px;height:44px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;flexShrink:0;transition:background 0.2s\">"+
    "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#0d120f\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"22\" y1=\"2\" x2=\"11\" y2=\"13\"/><polygon points=\"22 2 15 22 11 13 2 9 22 2\"/></svg></button>";
  w.appendChild(inpWrap);

  document.body.appendChild(btn);
  document.body.appendChild(w);

  // ─── STATE ─────────────────────────────────────────────
  var state = {
    open: false,
    step: 0,
    name: "",
    email: "",
    phone: "",
    spaName: "",
    services: "",
    adSpend: "",
    bookingRate: "",
    timeline: "",
    score: 0,
    waitingForInput: false,
    skipPhone: false,
    customTime: false
  };

  var inputEl = document.getElementById("fr-input");
  var sendEl  = document.getElementById("fr-send");
  var msgBody = document.getElementById("fr-body");
  var typing  = document.getElementById("fr-typing");

  // ─── HELPERS ───────────────────────────────────────────
  function addMsg(text, type, isHTML) {
    var el = document.createElement("div");
    el.className = "fr-msg-in";
    var st = {
      maxWidth: "88%", padding: "11px 15px", borderRadius: "10px",
      fontSize: "0.82rem", lineHeight: 1.5, wordBreak: "break-word"
    };
    if (type === "bot") {
      st.alignSelf = "flex-start";
      st.background = "#0f1412";
      st.color = "#d4e5d8";
      st.borderBottomLeftRadius = "2px";
      st.border = "1px solid rgba(110,255,138,0.06)";
    } else {
      st.alignSelf = "flex-end";
      st.background = "linear-gradient(135deg,"+PRIMARY+" 0%, #2a6b38 100%)";
      st.color = "#0d120f";
      st.borderBottomRightRadius = "2px";
    }
    Object.assign(el.style, st);
    if (isHTML) el.innerHTML = text;
    else el.textContent = text;
    msgBody.insertBefore(el, typing);
    msgBody.scrollTop = msgBody.scrollHeight;
  }

  function showTyping() { typing.style.display = "block"; msgBody.scrollTop = msgBody.scrollHeight; }
  function hideTyping() { typing.style.display = "none"; }

  function after(ms) { return new Promise(function(r){ setTimeout(r,ms); }); }

  function botMsg(text, html) {
    showTyping();
    after(300).then(function(){
      hideTyping();
      addMsg(text, "bot", html);
    });
    return after(400);
  }

  function setInputMode(active, placeholder) {
    state.waitingForInput = active;
    if (active) {
      inputEl.style.display = "";
      sendEl.style.display = "";
      inputEl.placeholder = placeholder || "Type your answer...";
      setTimeout(function(){ inputEl.focus(); }, 100);
    } else {
      inputEl.style.display = "none";
      sendEl.style.display = "none";
    }
  }
  function hideInput() { setInputMode(false); }

  function showOptions(opts) {
    hideInput();
    var wrap = document.createElement("div");
    Object.assign(wrap.style, {
      display:"flex", flexWrap:"wrap", gap:"6px", marginTop:"2px", alignSelf:"flex-start", maxWidth:"100%"
    });
    opts.forEach(function(opt){
      var el = document.createElement("button");
      el.textContent = opt;
      Object.assign(el.style, {
        background:"transparent", border:"1px solid rgba(110,255,138,0.25)",
        color:"#6eff8a", padding:"8px 14px", borderRadius:"6px",
        fontSize:"0.75rem", cursor:"pointer", transition:"all 0.2s",
        whiteSpace:"nowrap", fontFamily:"JetBrains Mono,monospace"
      });
      el.onmouseover = function(){ el.style.background = "rgba(110,255,138,0.08)"; };
      el.onmouseout  = function(){ el.style.background = "transparent"; };
      el.onclick = function(){ handleOptionClick(opt); };
      wrap.appendChild(el);
    });
    msgBody.insertBefore(wrap, typing);
    msgBody.scrollTop = msgBody.scrollHeight;
  }

  function clearOptions() {
    var qsa = msgBody.querySelectorAll.bind(msgBody);
    qsa("div > button").forEach(function(b){
      if (b.parentElement && b.parentElement.parentElement === msgBody) b.parentElement.remove();
    });
  }

  // ─── CALCULATE SCORE ─────────────────────────────────
  function calcScore(adSpend, bookingRate, timeline) {
    var spendMap = {
      "Under $3K": 5,
      "$3K-$5K": 20,
      "$5K-$10K": 30,
      "$10K+": 35
    };
    var bookingMap = {
      "Under 10%": 35,
      "10-15%": 25,
      "15-20%": 10,
      "20%+": 5
    };
    var timelineMap = {
      "ASAP \u2014 ready now": 30,
      "This quarter": 20,
      "Just researching": 5
    };
    return (spendMap[adSpend] || 5) + (bookingMap[bookingRate] || 5) + (timelineMap[timeline] || 5);
  }

  function getClassification(score) {
    if (score >= 65) return "qualified";
    if (score >= 30) return "warm";
    return "cold";
  }

  // ─── CONVERSATION FLOW — MED SPA OWNER TARGETED ──────
  function startConversation() {
    state.step = 1;
    addMsg("Hey \u2014 I see you are checking out <strong>"+BRAND+"</strong>.", "bot", true);
    after(500).then(function(){
      addMsg("We help <strong>med spa owners</strong> turn cold ad traffic into booked appointments. Our clients average <strong>55-65% booking rates</strong> on qualified leads.", "bot", true);
      return after(400);
    }).then(function(){
      addMsg("Quick one \u2014 what services does your spa specialize in?", "bot");
      showOptions(["\uD83D\uDC89 Botox / Fillers", "\u2728 Laser / Skin", "\uD83D\uDD0C Body Contouring", "\uD83D\uDCA7 IV Therapy", "\u2695\uFE0F Multi-service"]);
    });
  }

  function askAdSpend() {
    state.step = 2;
    botMsg("Got it. Next \u2014 what is your current monthly <strong>ad spend</strong> on patient acquisition?", true);
    after(400).then(function(){
      showOptions(["Under $3K", "$3K-$5K", "$5K-$10K", "$10K+"]);
    });
  }

  function askBookingRate() {
    state.step = 3;
    botMsg("And what is your current <strong>booking rate</strong>? Out of every 100 leads, how many actually book?", true);
    after(400).then(function(){
      showOptions(["Under 10%", "10-15%", "15-20%", "20%+"]);
    });
  }

  function askTimeline() {
    state.step = 4;
    botMsg("Last question \u2014 what is your <strong>timeline</strong> to start a new system?", true);
    after(400).then(function(){
      showOptions(["ASAP \u2014 ready now", "This quarter", "Just researching"]);
    });
  }

  function askName() {
    state.step = 5;
    var score = calcScore(state.adSpend, state.bookingRate, state.timeline);
    state.score = score;
    var cls = getClassification(score);

    if (cls === "qualified") {
      botMsg("<strong>Score: " + score + "/100</strong> \u2014 you are a strong fit. Let us get you a free strategy session. What is your name?", true);
    } else if (cls === "warm") {
      botMsg("<strong>Score: " + score + "/100</strong> \u2014 we can definitely help. Let me grab your details and send over a case study from a similar spa. Your name?", true);
    } else {
      botMsg("Appreciate the context. Let me grab your details \u2014 I will send over some resources on how spas turn around their booking rates. Your name?", true);
    }
    setInputMode(true, "Your name...");
  }

  function askSpaName() {
    state.step = 6;
    botMsg("Great, <strong>" + state.name + "</strong>! What is the name of your spa?", true);
    setInputMode(true, "Spa / clinic name");
  }

  function askEmail() {
    state.step = 7;
    botMsg("What is your email? I will send over the <strong>" + (getClassification(state.score) === "qualified" ? "strategy session link" : "case study + overview") + "</strong>.", true);
    setInputMode(true, "your@spa.com");
  }

  function askPhone() {
    state.step = 8;
    botMsg("And your <strong>phone number</strong>? Our team usually calls for a 10-minute chat \u2014 way more useful than email ping-pong.", true);
    showOptions(["\uD83D\uDCF1 I will share it", "\u23ED Skip for now"]);
  }

  function showScoreAndRoute() {
    var cls = getClassification(state.score);
    var outcome;

    if (cls === "qualified") {
      outcome = "<strong>Score: " + state.score + "/100 \u2014 QUALIFIED</strong><br><br>"+
        "Here is what we deliver:<br>"+
        "\u2022 <strong>15 qualified leads</strong> in 30 days or it is free<br>"+
        "\u2022 Full funnel: Meta Ads \u2192 AI Chatbot \u2192 CRM \u2192 Booking<br>"+
        "\u2022 $2,500 setup / $2,500 monthly<br><br>"+
        "Let us get you on a <strong>15-min strategy call</strong> to map out your setup. A manager will reach out at the time you picked.";
    } else if (cls === "warm") {
      outcome = "<strong>Score: " + state.score + "/100 \u2014 WARM</strong><br><br>"+
        "A lot of spas at your stage see the biggest jump when they fix lead response time. Here is what a recent client went through:<br>"+
        "\u2022 <strong>8% \u2192 62% booking rate</strong> in 30 days<br>"+
        "\u2022 Same ad spend, smarter pipeline<br><br>"+
        "I will send the case study + overview to your email. When the timing is right, you know where to find us.";
    } else {
      outcome = "<strong>Score: " + state.score + "/100 \u2014 EXPLORING</strong><br><br>"+
        "No pressure. We will send over some useful content on med spa patient acquisition. When you are ready to scale, we are here.<br><br>"+
        "In the meantime \u2014 most spas that start with a <strong>free strategy session</strong> walk away with 2-3 actionable insights they implement same week. The link will be in your email.";
    }

    botMsg(outcome, true);
  }

  function confirmData() {
    state.step = 9;
    var p = state.phone || "\u2014 skipped \u2014";
    botMsg("<strong>Let me confirm everything:</strong>", true).then(function(){
      return after(200);
    }).then(function(){
      addMsg("\uD83D\uDC64 <strong>Name:</strong> " + state.name +
        "<br>\uD83C\uDFE5 <strong>Spa:</strong> " + (state.spaName || "\u2014") +
        "<br>\uD83D\uDCE7 <strong>Email:</strong> " + state.email +
        "<br>\uD83D\uDCDE <strong>Phone:</strong> " + p +
        "<br>\uD83D\uDCCA <strong>Score:</strong> " + state.score + "/100",
        "bot", true);
      return after(300);
    }).then(function(){
      botMsg("<strong>Everything correct?</strong>", true);
      showOptions(["\u2705 Yes, send it!", "\uD83D\uDD04 Let me fix something"]);
    });
  }

  function resetConversation() {
    state.step = 1;
    state.name = ""; state.email = ""; state.phone = ""; state.spaName = "";
    state.adSpend = ""; state.bookingRate = ""; state.timeline = ""; state.score = 0;
    botMsg("No problem. Let us start over.");
    after(400).then(function(){
      addMsg("What services does your spa specialize in?", "bot");
      showOptions(["\uD83D\uDC89 Botox / Fillers", "\u2728 Laser / Skin", "\uD83D\uDD0C Body Contouring", "\uD83D\uDCA7 IV Therapy", "\u2695\uFE0F Multi-service"]);
    });
  }

  // ─── OPTION CLICK HANDLER ──────────────────────────────
  function handleOptionClick(opt) {
    addMsg(opt, "user");
    clearOptions();
    hideInput();

    // Step 1: Services
    if (state.step === 1) {
      state.services = opt;
      after(300).then(function(){ askAdSpend(); });
    }
    // Step 2: Ad Spend
    else if (state.step === 2) {
      state.adSpend = opt;
      after(300).then(function(){ askBookingRate(); });
    }
    // Step 3: Booking Rate
    else if (state.step === 3) {
      state.bookingRate = opt;
      after(300).then(function(){ askTimeline(); });
    }
    // Step 4: Timeline
    else if (state.step === 4) {
      state.timeline = opt;
      after(300).then(function(){ askName(); });
    }
    // Step 8: Phone
    else if (state.step === 8) {
      if (opt.indexOf("Skip") !== -1) {
        state.phone = "";
        state.skipPhone = true;
        after(200).then(function(){ showScoreAndRoute(); });
      } else {
        setInputMode(true, "Your phone number...");
      }
    }
    // Step 9: Confirm
    else if (state.step === 9) {
      if (opt.indexOf("Yes") !== -1) {
        submitLead();
      } else {
        resetConversation();
      }
    }
  }

  // ─── SUBMIT ──────────────────────────────────────────────
  function submitLead() {
    state.step = 10;
    addMsg("Your info has been sent to the <strong>"+BRAND+" team</strong>. \uD83D\uDE80", "bot", true);
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", API_URL, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(JSON.stringify({
        name: state.name,
        email: state.email,
        phone: state.phone || "",
        spa_name: state.spaName || "",
        services: state.services,
        ad_spend: state.adSpend,
        booking_rate: state.bookingRate,
        timeline: state.timeline,
        score: state.score,
        classification: getClassification(state.score),
        page_url: window.location.href
      }));
    } catch(e) { console.warn("[FocusRunner Chat] Backend unreachable:", e); }
    after(600).then(function(){
      if (getClassification(state.score) === "qualified") {
        addMsg("A manager will reach out soon. Meanwhile \u2014 here is a stat: our last med spa client went from <strong>8% to 62% booking rate</strong> in 30 days with the same ad budget. \uD83D\uDCC8", "bot", true);
      } else {
        addMsg("Check your email for the case study. If you have questions \u2014 just come back here and start a new chat. We are always on. \uD83D\uDCAC", "bot", true);
      }
    });
  }

  // ─── FREE TEXT INPUT ─────────────────────────────────
  function handleSend() {
    if (!state.waitingForInput) return;
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";
    addMsg(text, "user");
    hideInput();

    if (state.step === 5) {
      state.name = text;
      after(300).then(function(){ askSpaName(); });
    } else if (state.step === 6) {
      state.spaName = text;
      after(300).then(function(){ askEmail(); });
    } else if (state.step === 7) {
      if (text.indexOf("@") !== -1) {
        state.email = text;
        after(300).then(function(){ askPhone(); });
      } else {
        addMsg("Does not look like an email. Try something like <strong>name@spa.com</strong>", "bot", true);
        setInputMode(true, "your@spa.com");
      }
    } else if (state.step === 8) {
      state.phone = text;
      after(300).then(function(){ showScoreAndRoute(); });
    }
  }

  // ─── TOGGLE ──────────────────────────────────────────
  btn.onclick = function(){
    state.open = !state.open;
    w.classList.toggle("fr-hidden");
    if (state.open && state.step === 0) {
      after(200).then(function(){ startConversation(); });
    }
    if (state.open) {
      msgBody.scrollTop = msgBody.scrollHeight;
      setTimeout(function(){ if(state.waitingForInput) inputEl.focus(); }, 300);
    }
  };

  inputEl.onkeydown = function(e){ if (e.key === "Enter") handleSend(); };
  sendEl.onclick = handleSend;

})();
