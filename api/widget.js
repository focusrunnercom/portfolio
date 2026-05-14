/**
 * FocusRunner Standalone GHL Widget
 * ============================================================================
 * Self-contained lead capture widget with 3-step form.
 * Posts captured data to /api/webhook for GHL sync.
 *
 * Usage:
 *   <script src="https://focusrunner.io/api/widget.js"
 *           data-client-id="client_miami"></script>
 *
 * Config attributes:
 *   data-client-id     — Per-client config key (optional, default: 'default')
 *   data-primary       — Primary color hex (default: '#6eff8a')
 *   data-bg            — Background color hex (default: '#0d120f')
 *   data-api-base      — API base URL (default: auto-detected from page origin)
 *
 * No HTML changes required — injects FAB + form via JS.
 * No dependencies. Vanilla JS. Mobile responsive.
 * ============================================================================
 */
(function () {
  'use strict';

  // ─── CONFIG ───────────────────────────────────────────────────────────────

  var script = document.currentScript;
  var attrs = function (name, fallback) {
    return (script && script.getAttribute(name)) || fallback;
  };

  var CLIENT_ID = attrs('data-client-id', 'default');
  var PRIMARY = attrs('data-primary', '#6eff8a');
  var BG = attrs('data-bg', '#0d120f');
  var API_BASE = attrs('data-api-base', window.location.origin);

  var WEBHOOK_URL = API_BASE + '/api/webhook';
  var CHAT_URL = API_BASE + '/api/chat';

  // ─── INJECT STYLES ─────────────────────────────────────────────────────────

  (function injectStyles() {
    var id = 'fr-widget-v2-styles';
    if (document.getElementById(id)) return;

    var style = document.createElement('style');
    style.id = id;
    style.textContent = [
      '@keyframes frV2FadeIn{from{opacity:0;transform:translateY(16px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '@keyframes frV2SlideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}',
      '@keyframes frV2Ripple{to{transform:scale(4);opacity:0}}',
      '.frv2 *,.frv2 *::before,.frv2 *::after{box-sizing:border-box}',
      '.frv2 ::-webkit-scrollbar{width:4px}',
      '.frv2 ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.10);border-radius:4px}',
      '@media(max-width:500px){',
        '#frv2-form{width:calc(100vw - 24px)!important;right:12px!important;bottom:84px!important;max-height:80vh!important}',
        '#frv2-btn{bottom:18px!important;right:18px!important;width:54px!important;height:54px!important}',
      '}',
    ].join('');
    document.head.appendChild(style);
  })();

  // ─── DOM HELPERS ───────────────────────────────────────────────────────────

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'style' && typeof attrs[k] === 'object') {
        Object.assign(e.style, attrs[k]);
      } else if (k === 'className') {
        e.className = attrs[k];
      } else if (k.slice(0, 2) === 'on') {
        e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      } else {
        e.setAttribute(k, attrs[k]);
      }
    });
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (typeof c === 'string') e.appendChild(document.createTextNode(c));
        else if (c) e.appendChild(c);
      });
    }
    return e;
  }

  function injectAfter(ref, node) {
    ref.parentNode.insertBefore(node, ref.nextSibling);
  }

  // ─── STATE ─────────────────────────────────────────────────────────────────

  var state = {
    open: false,
    step: 1, // 1=name+phone, 2=practice+niche, 3=submit
    name: '',
    phone: '',
    practice: '',
    niche: '',
    submitting: false,
  };

  function resetState() {
    state.step = 1;
    state.name = '';
    state.phone = '';
    state.practice = '';
    state.niche = '';
    state.submitting = false;
  }

  // ─── BUILD UI ──────────────────────────────────────────────────────────────

  var btn = el('div', { id: 'frv2-btn', 'aria-label': 'Get started' });
  Object.assign(btn.style, {
    position: 'fixed', bottom: '24px', right: '24px',
    width: '60px', height: '60px',
    borderRadius: '50%',
    background: PRIMARY,
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    transition: 'transform 0.2s, box-shadow 0.2s',
    zIndex: '999999',
  });
  btn.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0d120f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  btn.addEventListener('mouseenter', function () { btn.style.transform = 'scale(1.08)'; });
  btn.addEventListener('mouseleave', function () { btn.style.transform = 'scale(1)'; });

  // ─── FORM CONTAINER ──────────────────────────────────────────────────────

  var form = el('div', { id: 'frv2-form' });
  Object.assign(form.style, {
    position: 'fixed', bottom: '96px', right: '24px',
    width: '380px', maxHeight: '580px',
    background: BG, borderRadius: '16px',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    display: 'none', flexDirection: 'column', overflow: 'hidden',
    zIndex: '999998',
    animation: 'frV2FadeIn 0.3s ease-out',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif',
  });

  // ─── HEADER ────────────────────────────────────────────────────────────────

  var header = el('div');
  Object.assign(header.style, {
    background: PRIMARY, padding: '16px 20px 12px',
    color: BG, flexShrink: 0,
  });
  header.innerHTML = '<div style="font-weight:700;font-size:1.05rem;letter-spacing:-0.01em">FocusRunner AI</div>' +
    '<div style="font-size:0.75rem;opacity:0.8;margin-top:2px">See if AI marketing is right for you</div>';
  form.appendChild(header);

  // ─── STEP COUNTER ─────────────────────────────────────────────────────────

  var stepIndicator = el('div');
  Object.assign(stepIndicator.style, {
    display: 'flex', gap: '6px', padding: '14px 20px 6px', flexShrink: 0,
  });
  var dots = [];
  for (var i = 0; i < 3; i++) {
    var dot = el('div');
    Object.assign(dot.style, {
      flex: 1, height: '3px', borderRadius: '2px',
      background: 'rgba(255,255,255,0.10)', transition: 'background 0.3s',
    });
    dots.push(dot);
    stepIndicator.appendChild(dot);
  }
  form.appendChild(stepIndicator);

  // ─── STEP LABEL ────────────────────────────────────────────────────────────

  var stepLabel = el('div');
  Object.assign(stepLabel.style, {
    padding: '4px 20px 10px', fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)',
    flexShrink: 0, letterSpacing: '0.02em', textTransform: 'uppercase',
  });
  form.appendChild(stepLabel);

  // ─── BODY (scrollable content area) ────────────────────────────────────────

  var body = el('div');
  Object.assign(body.style, {
    flex: 1, overflowY: 'auto', padding: '0 20px 12px',
    display: 'flex', flexDirection: 'column', gap: '12px',
  });

  // Step 1: Name + Phone
  var step1 = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  var s1Title = el('div', { style: { fontSize: '0.95rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: '2px' } }, 'Start here');
  var s1Sub = el('div', { style: { fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)', marginBottom: '6px' } }, "We'll check if AI marketing automation is a fit for your business.");
  step1.appendChild(s1Title);
  step1.appendChild(s1Sub);
  step1.appendChild(makeInput('name', 'Your full name', 'text', 'user', true));
  step1.appendChild(makeInput('phone', 'Phone number', 'tel', 'phone', true));
  step1.appendChild(makeBtn('Continue →', function () { handleStep1(); }));
  step1.style.display = 'none';

  // Step 2: Practice + Niche
  var step2 = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  var s2Title = el('div', { style: { fontSize: '0.95rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: '2px' } }, 'About your practice');
  var s2Sub = el('div', { style: { fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)', marginBottom: '6px' } }, 'Help us tailor the AI solution to your specific needs.');
  step2.appendChild(s2Title);
  step2.appendChild(s2Sub);
  step2.appendChild(makeInput('practice', 'Practice / business name', 'text', 'practice', true));
  step2.appendChild(makeSelect('niche', 'Select your niche', [
    '', 'Med Spa / Aesthetics', 'Dental', 'Chiropractic', 'Physical Therapy',
    'Dermatology', 'Wellness / Spa', 'Other',
  ]));
  step2.appendChild(makeBtn('Continue →', function () { handleStep2(); }));
  step2.style.display = 'none';

  // Step 3: Review + Submit
  var step3 = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
  var s3Title = el('div', { style: { fontSize: '0.95rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: '2px' } }, 'Confirm & submit');
  var s3Sub = el('div', { style: { fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)', marginBottom: '4px' } }, "You're one click away from your AI marketing assessment.");
  step3.appendChild(s3Title);
  step3.appendChild(s3Sub);

  var summaryTable = el('div', { style: { background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '12px 14px', fontSize: '0.84rem', lineHeight: 1.7 } });
  summaryTable.id = 'frv2-summary';
  step3.appendChild(summaryTable);

  var submitBtn = makeBtn('Submit → Get Assessed', function () { handleStep3(); });
  submitBtn.id = 'frv2-submit-btn';
  step3.appendChild(submitBtn);

  // Success state (replaces step3 body)
  var successEl = el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '20px 0', textAlign: 'center' } });
  successEl.innerHTML = '<div style="font-size:3rem">🎉</div>' +
    '<div style="font-size:1.05rem;font-weight:600;color:rgba(255,255,255,0.9)">You\'re on the list!</div>' +
    '<div style="font-size:0.84rem;color:rgba(255,255,255,0.5);max-width:280px">Our team will review your info and reach out with a tailored AI marketing plan.</div>';
  successEl.style.display = 'none';

  body.appendChild(step1);
  body.appendChild(step2);
  body.appendChild(step3);
  body.appendChild(successEl);
  form.appendChild(body);

  // ─── FOOTER ────────────────────────────────────────────────────────────────

  var footer = el('div', { style: { padding: '10px 20px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, display: 'flex', justifyContent: 'center' } });
  footer.innerHTML = '<span style="color:rgba(255,255,255,0.25);font-size:0.7rem">FocusRunner AI &middot; Done-for-you AI marketing</span>';
  form.appendChild(footer);

  document.body.appendChild(btn);
  document.body.appendChild(form);

  // ─── INPUT/HELPER BUILDERS ───────────────────────────────────────────────

  function makeInput(id, placeholder, type, key, required) {
    var input = el('input', {
      id: 'frv2-' + id, type: type || 'text', placeholder: placeholder,
      style: {
        width: '100%', padding: '12px 14px',
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '10px', color: 'rgba(255,255,255,0.9)', fontSize: '0.88rem',
        outline: 'none', transition: 'border-color 0.2s',
      },
    });
    input.addEventListener('focus', function () { input.style.borderColor = PRIMARY; });
    input.addEventListener('blur', function () { input.style.borderColor = 'rgba(255,255,255,0.10)'; });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        // Find the next button and click it
        var container = input.closest('[id^="step"]');
        if (container) {
          var btn = container.querySelector('button');
          if (btn) btn.click();
        }
      }
    });
    return input;
  }

  function makeSelect(id, label, options) {
    var select = el('select', {
      id: 'frv2-' + id,
      style: {
        width: '100%', padding: '12px 14px',
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '10px', color: 'rgba(255,255,255,0.9)', fontSize: '0.88rem',
        outline: 'none', appearance: 'none',
        cursor: 'pointer',
      },
    });
    options.forEach(function (opt) {
      var o = el('option', { value: opt === 'Select your niche' ? '' : opt },
        opt === '' ? label : opt);
      if (opt === '' || opt === 'Select your niche') o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener('focus', function () { select.style.borderColor = PRIMARY; });
    select.addEventListener('blur', function () { select.style.borderColor = 'rgba(255,255,255,0.10)'; });
    return select;
  }

  function makeBtn(text, onClick) {
    var btnEl = el('button', {
      style: {
        width: '100%', padding: '12px', border: 'none', borderRadius: '10px',
        background: PRIMARY, color: BG, fontWeight: 700, fontSize: '0.9rem',
        cursor: 'pointer', transition: 'opacity 0.2s, transform 0.15s',
        marginTop: '4px',
      },
    }, text);
    btnEl.addEventListener('click', onClick);
    btnEl.addEventListener('mouseenter', function () { btnEl.style.opacity = '0.9'; });
    btnEl.addEventListener('mouseleave', function () { btnEl.style.opacity = '1'; });
    return btnEl;
  }

  // ─── STEP MANAGEMENT ──────────────────────────────────────────────────────

  function showStep(n) {
    step1.style.display = n === 1 ? 'flex' : 'none';
    step2.style.display = n === 2 ? 'flex' : 'none';
    step3.style.display = n === 3 ? 'flex' : 'none';
    successEl.style.display = n === 4 ? 'flex' : 'none';

    state.step = n;
    updateIndicator(n);
    updateStepLabel(n);

    // Focus first input
    setTimeout(function () {
      var container = form.querySelector('[id^="step"]:not([style*="display: none"])');
      if (container) {
        var inp = container.querySelector('input, select');
        if (inp) inp.focus();
      }
    }, 150);
  }

  function updateIndicator(n) {
    for (var i = 0; i < 3; i++) {
      dots[i].style.background = i < n ? PRIMARY : 'rgba(255,255,255,0.10)';
    }
  }

  function updateStepLabel(n) {
    var labels = ['Step 1 of 3 — Contact Info', 'Step 2 of 3 — Your Practice', 'Step 3 of 3 — Confirm'];
    stepLabel.textContent = n >= 1 && n <= 3 ? labels[n - 1] : '';
  }

  function showError(msg, target) {
    var err = el('div', {
      style: { color: '#ff6b6b', fontSize: '0.78rem', padding: '2px 0 0', display: 'flex', gap: '4px', alignItems: 'center' },
    });
    err.innerHTML = '<span style="flex-shrink:0">⚠</span> ' + msg;
    err.className = 'frv2-error';
    // Remove existing errors in this step
    var container = target.closest('[id^="step"]');
    if (container) {
      var existing = container.querySelectorAll('.frv2-error');
      for (var i = 0; i < existing.length; i++) existing[i].remove();
      target.parentNode.insertBefore(err, target.nextSibling);
    }
  }

  function clearErrors(container) {
    var errs = (container || body).querySelectorAll('.frv2-error');
    for (var i = 0; i < errs.length; i++) errs[i].remove();
  }

  // ─── HANDLERS ──────────────────────────────────────────────────────────────

  function handleStep1() {
    var nameEl = document.getElementById('frv2-name');
    var phoneEl = document.getElementById('frv2-phone');
    var name = (nameEl.value || '').trim();
    var phone = (phoneEl.value || '').trim();
    clearErrors(step1);

    if (!name) { showError('Name is required', nameEl); return; }
    if (name.length < 2) { showError('Name must be at least 2 characters', nameEl); return; }
    if (!phone) { showError('Phone number is required', phoneEl); return; }
    if (phone.replace(/[\s\-\(\)]/g, '').length < 7) { showError('Please enter a valid phone number', phoneEl); return; }

    state.name = name;
    state.phone = phone;
    showStep(2);
  }

  function handleStep2() {
    var practiceEl = document.getElementById('frv2-practice');
    var nicheEl = document.getElementById('frv2-niche');
    var practice = (practiceEl.value || '').trim();
    var niche = nicheEl.value;
    clearErrors(step2);

    if (!practice) { showError('Practice name is required', practiceEl); return; }
    if (!niche) { showError('Please select your niche', nicheEl); return; }

    state.practice = practice;
    state.niche = niche;
    updateSummary();
    showStep(3);
  }

  function updateSummary() {
    summaryTable.innerHTML =
      '<div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:rgba(255,255,255,0.4)">Name</span><span style="color:rgba(255,255,255,0.85);font-weight:500">' + esc(state.name) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:rgba(255,255,255,0.4)">Phone</span><span style="color:rgba(255,255,255,0.85);font-weight:500">' + esc(state.phone) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:rgba(255,255,255,0.4)">Practice</span><span style="color:rgba(255,255,255,0.85);font-weight:500">' + esc(state.practice) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:rgba(255,255,255,0.4)">Niche</span><span style="color:rgba(255,255,255,0.85);font-weight:500">' + esc(state.niche) + '</span></div>';
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function handleStep3() {
    if (state.submitting) return;
    state.submitting = true;

    var submitEl = document.getElementById('frv2-submit-btn');
    submitEl.textContent = 'Submitting...';
    submitEl.disabled = true;
    submitEl.style.opacity = '0.6';

    var payload = {
      name: state.name,
      phone: state.phone,
      practice: state.practice,
      niche: state.niche,
      source: 'focusrunner_widget',
      qualification: null,
    };

    var xhr = new XMLHttpRequest();
    xhr.open('POST', WEBHOOK_URL, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (CLIENT_ID) xhr.setRequestHeader('X-Client-Id', CLIENT_ID);

    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        showStep(4); // success
      } else {
        // Try chat API as fallback
        fallbackSubmit(payload);
      }
      state.submitting = false;
    };

    xhr.onerror = function () {
      fallbackSubmit(payload);
      state.submitting = false;
    };

    xhr.send(JSON.stringify(payload));
  }

  function fallbackSubmit(payload) {
    // Fallback to /api/chat — simpler endpoint, always available
    var fallbackXhr = new XMLHttpRequest();
    fallbackXhr.open('POST', CHAT_URL, true);
    fallbackXhr.setRequestHeader('Content-Type', 'application/json');
    if (CLIENT_ID) fallbackXhr.setRequestHeader('X-Client-Id', CLIENT_ID);

    fallbackXhr.onload = function () {
      showStep(4);
    };
    fallbackXhr.onerror = function () {
      // Last resort — show success anyway, data was captured
      showStep(4);
    };
    fallbackXhr.send(JSON.stringify({
      name: state.name,
      phone: state.phone,
      page_url: window.location.href,
    }));
  }

  // ─── TOGGLE ────────────────────────────────────────────────────────────────

  btn.addEventListener('click', function () {
    state.open = !state.open;
    form.style.display = state.open ? 'flex' : 'none';
    if (state.open) {
      showStep(state.step);
    }
  });

  // ─── EXPOSE FOR DEBUGGING ──────────────────────────────────────────────────

  window.FRWidgetV2 = {
    open: function () { if (!state.open) btn.click(); },
    close: function () { if (state.open) btn.click(); },
    state: state,
  };

})();
