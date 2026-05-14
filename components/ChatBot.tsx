import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ──────────────────────────────────
type Step =
  | 0      // closed / initial
  | 1      // greeting + ask interest
  | 2      // ask name
  | 3      // ask email
  | 4      // ask phone
  | 5      // ask time
  | 55     // custom time input
  | 6      // confirmation
  | 7      // done

interface LeadData {
  name: string;
  email: string;
  phone: string;
  time: string;
}

// ─── Styles (inline CSS-in-JS) ──────────────
const STYLES = {
  btn: {
    position: 'fixed' as const,
    bottom: 28,
    right: 28,
    width: 62,
    height: 62,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #00D4AA 0%, #009B7D 100%)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 28px rgba(0, 212, 170, 0.35)',
    transition: 'transform 0.25s ease, box-shadow 0.25s ease',
    zIndex: 9999,
  },
  widget: {
    position: 'fixed' as const,
    bottom: 100,
    right: 28,
    width: 380,
    maxHeight: 600,
    background: '#14141e',
    borderRadius: 18,
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    zIndex: 9998,
    animation: 'frSlideUp 0.35s ease-out',
  },
  header: {
    background: 'linear-gradient(135deg, #00D4AA 0%, #009B7D 100%)',
    padding: '20px 22px 16px',
    flexShrink: 0,
  },
  headerTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: '1rem',
    color: '#fff',
  },
  headerSub: {
    fontSize: '0.78rem',
    color: 'rgba(255,255,255,0.8)',
    marginLeft: 32,
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '18px 20px 10px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  msgBot: {
    maxWidth: '88%',
    padding: '12px 16px',
    borderRadius: 14,
    fontSize: '0.88rem',
    lineHeight: 1.5,
    alignSelf: 'flex-start' as const,
    background: '#1e1e2e',
    color: 'rgba(255,255,255,0.92)',
    borderBottomLeftRadius: 4,
  },
  msgUser: {
    maxWidth: '88%',
    padding: '12px 16px',
    borderRadius: 14,
    fontSize: '0.88rem',
    lineHeight: 1.5,
    alignSelf: 'flex-end' as const,
    background: 'linear-gradient(135deg, #00D4AA 0%, #009B7D 100%)',
    color: '#fff',
    borderBottomRightRadius: 4,
  },
  typing: {
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start' as const,
    maxWidth: '88%',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.35)',
  },
  optionsWrap: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 4,
    alignSelf: 'flex-start' as const,
    maxWidth: '100%',
  },
  optBtn: {
    background: 'transparent',
    border: '1px solid rgba(0, 212, 170, 0.35)',
    color: '#00D4AA',
    padding: '9px 16px',
    borderRadius: 20,
    fontSize: '0.82rem',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap' as const,
  },
  inputWrap: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px 16px',
    gap: 10,
    borderTop: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: '#1a1a28',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: '12px 16px',
    color: 'rgba(255,255,255,0.9)',
    fontSize: '0.88rem',
    outline: 'none',
  },
  sendBtn: {
    background: '#00D4AA',
    border: 'none',
    width: 44,
    height: 44,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.2s, transform 0.15s',
    flexShrink: 0,
  },
  status: {
    background: 'rgba(0, 212, 170, 0.08)',
    border: '1px solid rgba(0, 212, 170, 0.15)',
    borderRadius: 10,
    padding: '14px 16px',
    margin: '6px 20px',
    fontSize: '0.82rem',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center' as const,
    flexShrink: 0,
  },
} as const;

const STYLE_TAG_ID = 'fr-chatbot-keyframes';

function injectKeyframes() {
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = `
    @keyframes frSlideUp {
      from { opacity: 0; transform: translateY(16px) scale(0.96); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes frMsgIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes frTyping {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-5px); background: rgba(255,255,255,0.7); }
    }
    .fr-msg-in { animation: frMsgIn 0.3s ease-out; }
    .fr-typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .fr-typing-dot:nth-child(3) { animation-delay: 0.4s; }
    .fr-body::-webkit-scrollbar { width: 4px; }
    .fr-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
    @media (max-width: 480px) {
      .fr-widget { width: calc(100vw - 24px) !important; right: 12px !important; bottom: 88px !important; max-height: 80vh !important; }
      .fr-btn { bottom: 20px !important; right: 20px !important; width: 56px !important; height: 56px !important; }
    }
  `;
  document.head.appendChild(style);
}

// ─── Messages ───────────────────────────────
interface Msg {
  text: string;
  type: 'bot' | 'user';
  html?: boolean;
}

// ─── Component ──────────────────────────────
const CHAT_URL = '/api/chat';
const FALLBACK_URL = '/api/direct-qualify';
const API_TIMEOUT_MS = 3000;

const ChatBot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>(0);
  const [data, setData] = useState<LeadData>({ name: '', email: '', phone: '', time: '' });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [typing, setTyping] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  // Inject keyframes on mount
  useEffect(() => {
    injectKeyframes();
  }, []);

  // Scroll to bottom
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, typing, showOptions]);

  // Focus input when waiting
  useEffect(() => {
    if (waitingForInput && isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [waitingForInput, isOpen]);

  // Start conversation when opened
  useEffect(() => {
    if (isOpen && step === 0 && !mountedRef.current) {
      mountedRef.current = true;
      const timer = setTimeout(() => startConversation(), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, step]);

  // ─── Helpers ───────────────────────────────
  const addMsg = useCallback((text: string, type: 'bot' | 'user', html = false) => {
    setMessages(prev => [...prev, { text, type, html }]);
  }, []);

  const doAfterDelay = useCallback((fn: () => void, delay: number) => {
    return new Promise<void>(resolve => {
      setTimeout(() => { fn(); resolve(); }, delay);
    });
  }, []);

  const showTyping = useCallback(() => {
    setTyping(true);
  }, []);

  const hideTyping = useCallback(() => {
    setTyping(false);
  }, []);

  const showOpts = useCallback((opts: string[]) => {
    setOptions(opts);
    setShowOptions(true);
    setWaitingForInput(false);
  }, []);

  const hideOpts = useCallback(() => {
    setShowOptions(false);
    setOptions([]);
  }, []);

  // ─── Conversation Flow ─────────────────────
  const startConversation = useCallback(() => {
    setStep(1);
    addMsg("Hey there! I'm the <strong>FocusRunner AI</strong> assistant 👋", 'bot', true);
    setTimeout(() => {
      addMsg("I'll help figure out how AI automation can level up your marketing. It'll take about 2 minutes ⏱️", 'bot', true);
      setTimeout(() => {
        addMsg("What brings you here today?", 'bot');
        showOpts(["📞 See AI lead gen in action", "🚀 AEO / SEO case studies", "💬 Just browsing, have questions"]);
      }, 500);
    }, 600);
  }, [addMsg, showOpts]);

  const askName = useCallback(() => {
    setStep(2);
    addMsg("First — <strong>what's your name?</strong> 😄", 'bot', true);
    setWaitingForInput(true);
  }, [addMsg]);

  const askEmail = useCallback(() => {
    setStep(3);
    addMsg(`Nice to meet you, <strong>${data.name}</strong>!`, 'bot', true);
    setTimeout(() => {
      addMsg("What's your email? I'll send over a <strong>short demo</strong> of how FocusRunner AI helps businesses grow.", 'bot', true);
      setWaitingForInput(true);
    }, 500);
  }, [addMsg, data.name]);

  const askPhone = useCallback(() => {
    setStep(4);
    addMsg("And what's your <strong>phone number</strong>? Our team usually calls to discuss your specific situation — way more useful than generic emails ☎️", 'bot', true);
    showOpts(["📱 I'll share my number", "⏭ Skip — email is enough"]);
  }, [addMsg, showOpts]);

  const askTime = useCallback(() => {
    setStep(5);
    addMsg("Almost done! When's the <strong>best time</strong> for our manager to reach you?", 'bot', true);
    showOpts(["☀️ Morning (9–12)", "🌤 Afternoon (12–18)", "🌙 Evening (18–21)", "⏰ Other — type it"]);
  }, [addMsg, showOpts]);

  const confirmData = useCallback(() => {
    setStep(6);
    const p = data.phone || '— skipped —';
    addMsg("<strong>Awesome! Let me confirm everything:</strong>", 'bot', true);
    setTimeout(() => {
      addMsg(`👤 <strong>Name:</strong> ${data.name}<br>📧 <strong>Email:</strong> ${data.email}<br>📞 <strong>Phone:</strong> ${p}<br>⏰ <strong>Time:</strong> ${data.time}`, 'bot', true);
      setTimeout(() => {
        addMsg("<strong>Is everything correct?</strong>", 'bot', true);
        showOpts(["✅ Yes, send it!", "🔄 Let me fix something"]);
      }, 400);
    }, 300);
  }, [addMsg, showOpts, data]);

  const submitLead = useCallback(async () => {
    const payload = {
      message: 'Lead from chatbot',
      name: data.name,
      email: data.email,
      phone: data.phone || '',
      time: data.time,
      page_url: window.location.href,
    };

    // Try primary endpoint with timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (resp.ok) {
        console.log('[lead] Submitted via /api/chat');
        return;
      }
      console.warn('[lead] /api/chat returned', resp.status, '— falling back');
    } catch (err) {
      console.warn('[lead] /api/chat failed:', err.message, '— falling back');
    } finally {
      clearTimeout(timer);
    }

    // Fallback to direct-qualify (no external deps, always works)
    try {
      const fallbackResp = await fetch(FALLBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          phone: data.phone || '',
          practice: 'Med Spa',
          volume: '1',
          spend: '0',
        }),
      });
      const fb = await fallbackResp.json();
      console.log('[lead] Fallback submitted via /api/direct-qualify:', fb.score);
    } catch (err2) {
      console.warn('[lead] Fallback also failed:', err2.message);
    }
  }, [data]);

  const handleConfirmation = useCallback((correct: boolean) => {
    addMsg(correct ? "✅ Yes, send it!" : "🔄 Let me fix something", 'user');
    hideOpts();
    if (correct) {
      setStep(7);
      setShowStatus(true);
      addMsg("Your info has been sent to the <strong>FocusRunner team</strong>! 🚀", 'bot', true);
      submitLead();
      setTimeout(() => {
        addMsg('A manager will reach out at <strong>' + data.time + '</strong>. Meanwhile, here\'s a bonus read: a case study on how AI agents <strong>tripled conversion rates</strong> for one of our clients 📈', 'bot', true);
        setWaitingForInput(false);
      }, 600);
    } else {
      resetConversation();
    }
  }, [addMsg, hideOpts, submitLead, data.time]);

  const resetConversation = useCallback(() => {
    setStep(1);
    setData({ name: '', email: '', phone: '', time: '' });
    addMsg("No problem! Let's start over 😊", 'bot');
    setTimeout(() => {
      addMsg("What brings you here today?", 'bot');
      showOpts(["📞 See AI lead gen in action", "🚀 AEO / SEO case studies", "💬 Just browsing, have questions"]);
    }, 400);
  }, [addMsg, showOpts]);

  // ─── Option Click ──────────────────────────
  const handleOptionClick = useCallback((opt: string) => {
    hideOpts();
    addMsg(opt, 'user');

    if (step === 1) {
      setTimeout(() => {
        addMsg("Awesome choice! Let's get you set up 😊", 'bot');
        setTimeout(() => askName(), 500);
      }, 400);
    } else if (step === 5) {
      if (opt === "⏰ Other — type it") {
        setStep(55);
        addMsg("Got it! What time works best for you? Just type it in — e.g. 'Friday 3pm' 📅", 'bot');
        setWaitingForInput(true);
        return;
      }
      const timeMap: Record<string, string> = {
        "☀️ Morning (9–12)": "Morning (9–12)",
        "🌤 Afternoon (12–18)": "Afternoon (12–18)",
        "🌙 Evening (18–21)": "Evening (18–21)",
      };
      setData(prev => ({ ...prev, time: timeMap[opt] || opt }));
      setTimeout(() => confirmData(), 300);
    }
  }, [step, addMsg, hideOpts, askName, confirmData]);

  // ─── Option handlers with special overrides ──
  const handlePhoneGive = useCallback(() => {
    hideOpts();
    addMsg("📱 I'll share my number", 'user');
    setStep(4);
    addMsg("Go ahead — what's your number?", 'bot');
    setWaitingForInput(true);
  }, [addMsg, hideOpts]);

  const handlePhoneSkip = useCallback(() => {
    setData(prev => ({ ...prev, phone: '' }));
    hideOpts();
    addMsg("⏭ Skip — email is enough", 'user');
    setTimeout(() => askTime(), 300);
  }, [addMsg, hideOpts, askTime]);

  // ─── Free Text Input ──────────────────────
  const handleUserInput = useCallback(() => {
    if (!waitingForInput || !inputRef.current) return;
    const text = inputRef.current.value.trim();
    if (!text) return;

    inputRef.current.value = '';
    addMsg(text, 'user');
    setWaitingForInput(false);

    if (step === 2) {
      setData(prev => ({ ...prev, name: text }));
      setTimeout(() => askEmail(), 400);
    } else if (step === 3) {
      if (text.includes('@')) {
        setData(prev => ({ ...prev, email: text }));
        setTimeout(() => {
          addMsg("Perfect! Let me grab your <strong>phone number</strong> too 📱", 'bot', true);
          showOpts(["📱 I'll share my number", "⏭ Skip — email is enough"]);
        }, 400);
      } else {
        addMsg("Hmm, that doesn't look like an email 😅 Could you double-check? Like `name@company.com`", 'bot');
        setWaitingForInput(true);
      }
    } else if (step === 4) {
      setData(prev => ({ ...prev, phone: text }));
      setTimeout(() => askTime(), 300);
    } else if (step === 55) {
      setData(prev => ({ ...prev, time: text }));
      setTimeout(() => confirmData(), 300);
    }
  }, [waitingForInput, step, addMsg, askEmail, askTime, confirmData, showOpts]);

  // ─── Keyboard handler ──────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleUserInput();
  }, [handleUserInput]);

  // ─── Toggle ────────────────────────────────
  const toggleChat = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  // ─── Render helper: message element ────────
  const renderMessage = (msg: Msg, i: number) => {
    if (msg.html) {
      return (
        <div
          key={i}
          className="fr-msg-in"
          style={msg.type === 'bot' ? STYLES.msgBot : STYLES.msgUser}
          dangerouslySetInnerHTML={{ __html: msg.text }}
        />
      );
    }
    return (
      <div
        key={i}
        className="fr-msg-in"
        style={msg.type === 'bot' ? STYLES.msgBot : STYLES.msgUser}
      >
        {msg.text}
      </div>
    );
  };

  // ─── Render ────────────────────────────────
  return (
    <>
      {/* Chat button */}
      <button
        className="fr-btn"
        style={STYLES.btn}
        onClick={toggleChat}
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" style={{ width: 28, height: 28, fill: '#fff' }}>
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" style={{ width: 28, height: 28, fill: '#fff' }}>
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
            <path d="M7 9h10v2H7zm0-3h10v2H7z" />
          </svg>
        )}
      </button>

      {/* Chat widget */}
      <div
        className="fr-widget"
        style={{ ...STYLES.widget, display: isOpen ? 'flex' : 'none' }}
      >
        {/* Header */}
        <div style={STYLES.header}>
          <div style={STYLES.headerTop}>
            <svg viewBox="0 0 24 24" style={{ width: 22, height: 22, fill: '#fff' }}>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
            <span style={STYLES.headerTitle}>FocusRunner AI</span>
          </div>
          <div style={STYLES.headerSub}>Ask how AI can automate your growth 🚀</div>
        </div>

        {/* Messages */}
        <div ref={bodyRef} className="fr-body" style={STYLES.body}>
          {messages.map(renderMessage)}
          {typing && (
            <div style={STYLES.typing}>
              <span className="fr-typing-dot" style={STYLES.dot} />
              <span className="fr-typing-dot" style={STYLES.dot} />
              <span className="fr-typing-dot" style={STYLES.dot} />
            </div>
          )}
          {showOptions && (
            <div style={STYLES.optionsWrap}>
              {options.map((opt, i) => {
                let onClick: () => void;
                if (opt === "📱 I'll share my number") {
                  onClick = handlePhoneGive;
                } else if (opt === "⏭ Skip — email is enough") {
                  onClick = handlePhoneSkip;
                } else if (opt === "✅ Yes, send it!") {
                  onClick = () => handleConfirmation(true);
                } else if (opt === "🔄 Let me fix something") {
                  onClick = () => handleConfirmation(false);
                } else {
                  onClick = () => handleOptionClick(opt);
                }
                return (
                  <button key={i} style={STYLES.optBtn} onClick={onClick}>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Status */}
        {showStatus && (
          <div style={STYLES.status}>
            ✅ Your details have been sent to the FocusRunner team!<br />
            <strong style={{ color: '#00D4AA' }}>A specialist will reach out at your preferred time.</strong>
          </div>
        )}

        {/* Input */}
        <div style={STYLES.inputWrap}>
          <input
            ref={inputRef}
            style={STYLES.input}
            type="text"
            placeholder={waitingForInput ? "Type your message..." : ""}
            disabled={!waitingForInput}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
          <button
            style={{ ...STYLES.sendBtn, opacity: waitingForInput ? 1 : 0.4, cursor: waitingForInput ? 'pointer' : 'not-allowed' }}
            disabled={!waitingForInput}
            onClick={handleUserInput}
          >
            <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: '#fff' }}>
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
};

export default ChatBot;
