/**
 * FocusRunner Med Spa Lead Qualification Chat Widget
 * Self-contained — paste <script src="/chat-widget.js"></script> and it works.
 * Style: Matches focusrunner.io terminal-native design (JetBrains Mono, phosphor green).
 */
(function() {
  "use strict";

  var PRIMARY = "#6eff8a";
  var BG = "#0d120f";
  var INK = "#d4e5d8";
  var INK_DIM = "#7a8c7e";
  var INK_FAINT = "#3f4a43";
  var LINE = "#1a2620";
  var LINE_BRIGHT = "#2a3f33";
  var DANGER = "#ff5c4d";
  var API_URL = "https://focusrunner.io/api/webhook";

  var styleId = "fr-widget-styles";
  if (!document.getElementById(styleId)) {
    var s = document.createElement("style");
    s.id = styleId;
    s.textContent = [
      "@keyframes frSlideUp{from{opacity:0;transform:translateY(16px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}",
      "@keyframes frMsgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}",
      ".fr-hidden{display:none!important}",
      ".fr-msg-in{animation:frMsgIn .3s ease-out}",
      "#fr-widget ::-webkit-scrollbar{width:4px}",
      "#fr-widget ::-webkit-scrollbar-thumb{background:rgba(110,255,138,.15);border-radius:4px}",
      "@media(max-width:480px){#fr-widget{width:calc(100vw-24px)!important;right:12px!important;bottom:88px!important;max-height:75vh!important}}"
    ].join("");
    document.head.appendChild(s);
  }

  function qs(sel) { return document.querySelector(sel); }
  function ce(tag) { return document.createElement(tag); }

  // Data store (does NOT use sessionStorage — fresh every open)
  var lead = { score: 0, step: 0 };
  var msgs;

  // ─── WIDGET DOM ────────────────────────────────────
  var w = ce("div"); w.id = "fr-widget"; w.className = "fr-hidden";
  Object.assign(w.style, {
    position:"fixed", bottom:"92px", right:"24px", width:"360px",
    maxHeight:"520px", background:BG, border:"1px solid "+LINE_BRIGHT,
    display:"flex", flexDirection:"column", overflow:"hidden",
    zIndex:"999998", animation:"frSlideUp 0.35s ease-out",
    fontFamily:"'JetBrains Mono', monospace", fontSize:"12px", boxShadow:"0 8px 32px rgba(0,0,0,0.6)"
  });

  // Header
  var hdr = ce("div");
  Object.assign(hdr.style, {
    padding:"14px 16px", borderBottom:"1px solid "+LINE,
    display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0
  });
  hdr.innerHTML = '<span style="font-weight:700;color:'+PRIMARY+';">&gt;_ Free Practice Audit</span>'+
    '<button id="fr-close" style="background:none;border:none;color:'+INK_FAINT+';cursor:pointer;font-size:18px;font-family:\'JetBrains Mono\',monospace;">&times;</button>';

  // Messages
  msgs = ce("div");
  Object.assign(msgs.style, {
    flex:"1", overflowY:"auto", padding:"12px", display:"flex",
    flexDirection:"column", gap:"8px", maxHeight:"260px"
  });

  // Input area
  var inputArea = ce("div");
  Object.assign(inputArea.style, {
    padding:"10px 12px", borderTop:"1px solid "+LINE, display:"flex", gap:"8px", flexShrink:0
  });
  var input = ce("input");
  Object.assign(input.style, {
    flex:"1", background:LINE, border:"1px solid "+LINE_BRIGHT, color:INK,
    padding:"8px 10px", fontFamily:"'JetBrains Mono',monospace", fontSize:"11px", outline:"none"
  });
  input.placeholder = "Type your answer...";
  input.onkeydown = function(e) { if (e.key === "Enter") sendMsg(); };
  var sendBtn = ce("button");
  sendBtn.textContent = "→";
  Object.assign(sendBtn.style, {
    background:PRIMARY, color:"#000", border:"none", padding:"8px 14px",
    cursor:"pointer", fontFamily:"'JetBrains Mono',monospace", fontSize:"12px", fontWeight:"700"
  });
  sendBtn.onclick = sendMsg;
  inputArea.appendChild(input); inputArea.appendChild(sendBtn);

  w.appendChild(hdr); w.appendChild(msgs); w.appendChild(inputArea);

  // Options container (for button-based choices)
  var optsContainer = ce("div");
  optsContainer.id = "fr-opts";
  Object.assign(optsContainer.style, { padding:"0 12px 8px", display:"none", flexShrink:0 });
  w.insertBefore(optsContainer, inputArea);

  // ─── BUTTON ────────────────────────────────────
  var btn = ce("div"); btn.id = "fr-btn";
  btn.setAttribute("aria-label", "Open FocusRunner chat");
  btn.innerHTML = '<span style="font-size:22px;">&gt;_</span>';
  Object.assign(btn.style, {
    position:"fixed", bottom:"24px", right:"24px", width:"56px", height:"56px",
    background:BG, border:"1px solid "+PRIMARY, color:PRIMARY,
    cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
    fontFamily:"'JetBrains Mono',monospace", transition:"transform .15s, box-shadow .15s",
    zIndex:"999999"
  });
  btn.onmouseover = function(){ this.style.transform="scale(1.05)"; this.style.boxShadow="0 0 20px rgba(110,255,138,0.15)"; };
  btn.onmouseout  = function(){ this.style.transform="scale(1)"; this.style.boxShadow="none"; };

  // ─── ACTIONS ────────────────────────────────────
  function toggle() {
    var open = !w.classList.contains("fr-hidden");
    w.classList.toggle("fr-hidden");
    if (!open && lead.step === 0) start();
  }
  btn.onclick = toggle;
  qs("#fr-close") && (qs("#fr-close").onclick = toggle);

  function addMsg(text, cls) {
    var div = ce("div");
    div.style.cssText = "font-size:11px;line-height:1.5;max-width:85%;padding:8px 12px;"+
      (cls==="bot" ? "background:"+LINE+";color:"+INK+";align-self:flex-start;border:1px solid "+LINE_BRIGHT+";" :
       "background:rgba(110,255,138,0.08);color:"+INK+";align-self:flex-end;");
    div.textContent = text;
    div.className = "fr-msg-in";
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function addOptions(opts) {
    optsContainer.innerHTML = "";
    opts.forEach(function(o) {
      var b = ce("button");
      b.textContent = o.label;
      Object.assign(b.style, {
        display:"block", width:"100%", textAlign:"left", background:LINE,
        border:"1px solid "+LINE_BRIGHT, color:INK, padding:"8px 12px", margin:"3px 0",
        cursor:"pointer", fontFamily:"'JetBrains Mono',monospace", fontSize:"11px",
        transition:"border-color .15s"
      });
      b.onmouseover = function(){ this.style.borderColor=PRIMARY; this.style.color=PRIMARY; };
      b.onmouseout  = function(){ this.style.borderColor=LINE_BRIGHT; this.style.color=INK; };
      b.onclick = function() {
        optsContainer.style.display = "none";
        addMsg(o.label, "user");
        if (o.field) lead[o.field] = o.value || o.label;
        if (o.next) o.next();
      };
      optsContainer.appendChild(b);
    });
    optsContainer.style.display = "block";
  }

  function start() {
    lead = { score: 0, step: 1 };
    addMsg("Hey — I'm FocusRunner's AI acquisition consultant. Quick audit on your patient pipeline. Ready?", "bot");
    addOptions([
      {label: "Yes — let's do this", field: "started", value: true, next: askNiche},
      {label: "Just browsing", field: "started", value: false, next: function(){
        addMsg("No worries. Check the case studies above — they show exactly what we deliver. Ping us when ready.", "bot");
      }}
    ]);
  }

  function askNiche() {
    addMsg("What type of practice?", "bot");
    addOptions([
      {label: "💉 Med Spa", field: "niche", value: "med_spa", next: askVolume},
      {label: "🦷 Cosmetic Dentistry", field: "niche", value: "cosmetic_dentistry", next: askVolume},
      {label: "🔪 Plastic Surgery", field: "niche", value: "plastic_surgery", next: askVolume},
      {label: "💇 Hair Transplant", field: "niche", value: "hair_transplant", next: askVolume},
      {label: "Other", field: "niche", value: "other", next: askVolume}
    ]);
  }

  function askVolume() {
    addMsg("Patients per month?", "bot");
    addOptions([
      {label: "Under 10", field: "volume", value: "under_10", next: askAdSpend},
      {label: "10–30", field: "volume", value: "10_30", next: askAdSpend},
      {label: "30–60", field: "volume", value: "30_60", next: askAdSpend},
      {label: "60+", field: "volume", value: "60_plus", next: askAdSpend}
    ]);
  }

  function askAdSpend() {
    addMsg("Monthly marketing spend?", "bot");
    addOptions([
      {label: "$0 – organic only", field: "ad_spend", value: "0", next: askName},
      {label: "$1K–$3K", field: "ad_spend", value: "1k_3k", next: askName},
      {label: "$3K–$10K", field: "ad_spend", value: "3k_10k", next: askName},
      {label: "$10K+", field: "ad_spend", value: "10k_plus", next: askName}
    ]);
  }

  function askName() {
    inputArea.style.display = "flex";
    addMsg("What's your name?", "bot");
    lead.step = 2;
  }

  function askPhone() {
    addMsg("Best phone number? We'll text you the audit.", "bot");
    lead.step = 3;
  }

  function askPractice() {
    addMsg("Practice name?", "bot");
    lead.step = 4;
  }

  function finish() {
    inputArea.style.display = "none";
    addMsg("Perfect. Analyzing your market position...", "bot");

    // Score the lead
    if (lead.volume === "under_10" || lead.volume === "10_30") lead.score += 30;
    if (lead.ad_spend === "3k_10k" || lead.ad_spend === "10k_plus") lead.score += 25;
    if (lead.niche === "med_spa") lead.score += 20;
    lead.score = Math.min(100, lead.score);

    fetch(API_URL, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        name: lead.name, phone: lead.phone, practice: lead.practice,
        niche: lead.niche, volume: lead.volume, ad_spend: lead.ad_spend,
        score: lead.score, source: "chat_widget"
      })
    }).catch(function(){});

    setTimeout(function() {
      addMsg("Based on your responses, you're spending real money on acquisition but losing leads to slow response times. That's fixable.", "bot");
      addMsg("Here's what happens next:", "bot");
      addMsg("1. We audit your market within 24h\n2. Text you a personalized Patient Acquisition Audit\n3. You see exactly how many patients you're missing — and what it costs to capture them.\n\nNo commitment. No pressure. Just data.", "bot");
      addMsg("→ Book your free audit call: https://focusrunner.com", "bot");
    }, 1200);
  }

  function sendMsg() {
    var text = input.value.trim();
    if (!text) return;
    addMsg(text, "user");
    input.value = "";

    if (lead.step === 2) { lead.name = text; askPhone(); }
    else if (lead.step === 3) { lead.phone = text; askPractice(); }
    else if (lead.step === 4) { lead.practice = text; finish(); }
  }

  document.body.appendChild(w);
  document.body.appendChild(btn);
})();
