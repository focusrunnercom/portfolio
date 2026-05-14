/**
 * FocusRunner GHL Lead Widget — Self-Contained
 * 
 * One-line embed for any website:
 *   <script src="https://focusrunner.io/ghl-widget.js" 
 *           data-webhook="https://focusrunner.io/api/webhook"
 *           data-client="client_miami">
 *   </script>
 *
 * Optional config via data-* attributes on the script tag:
 *   data-webhook  — webhook endpoint (default: /api/webhook on same origin)
 *   data-client   — X-Client-Id header value (default: client_default)
 *   data-cta      — CTA text (default: "Get More Patients")
 *   data-accent   — primary color hex (default: #6eff8a)
 *   data-position — "right" or "left" (default: right)
 *
 * No dependencies. No framework. No build step.
 */
(function() {
  'use strict';

  var SCRIPT = document.currentScript;
  var BASE   = SCRIPT ? SCRIPT.src.replace(/\/[^/]+\.js.*$/, '') : '';
  var WEBHOOK = SCRIPT ? SCRIPT.getAttribute('data-webhook') || BASE + '/api/webhook' : BASE + '/api/webhook';
  var CLIENT  = SCRIPT ? SCRIPT.getAttribute('data-client') || 'client_default' : 'client_default';
  var CTA_TEXT   = SCRIPT ? SCRIPT.getAttribute('data-cta') || 'Get More Patients' : 'Get More Patients';
  var ACCENT     = SCRIPT ? SCRIPT.getAttribute('data-accent') || '#6eff8a' : '#6eff8a';
  var POSITION   = SCRIPT ? SCRIPT.getAttribute('data-position') || 'right' : 'right';
  var BRAND      = 'FocusRunner';

  // ─── INJECT STYLES ──────────────────────────────────
  (function injectStyles() {
    var id = 'fr-ghl-styles';
    if (document.getElementById(id)) return;
    var s = document.createElement('style');
    s.id = id;
    s.textContent = [
      '@keyframes frModalIn{from{opacity:0;transform:translateY(20px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '@keyframes frBtnPulse{0%,100%{box-shadow:0 4px 20px '+ACCENT+'40}50%{box-shadow:0 4px 28px '+ACCENT+'80}}',
      '.fr-ghl *{box-sizing:border-box}',
      '.fr-ghl-hidden{display:none!important}',
      '.fr-ghl-btn{cursor:pointer;transition:all 0.25s;user-select:none;-webkit-user-select:none}',
      '.fr-ghl-btn:hover{transform:scale(1.06)}',
      '.fr-ghl-btn:active{transform:scale(0.95)}',
      '.fr-ghl-input{width:100%;padding:12px 14px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;background:rgba(255,255,255,0.06);color:#fff;font-size:14px;outline:none;transition:border-color 0.2s}',
      '.fr-ghl-input:focus{border-color:'+ACCENT+';background:rgba(255,255,255,0.09)}',
      '.fr-ghl-input::placeholder{color:rgba(255,255,255,0.35)}',
      '.fr-ghl-select{width:100%;padding:12px 14px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;background:rgba(30,30,45,1);color:#fff;font-size:14px;outline:none;cursor:pointer}',
      '.fr-ghl-submit{width:100%;padding:14px;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.2s}',
      '.fr-ghl-submit:hover{filter:brightness(1.1)}',
      '.fr-ghl-step{animation:frModalIn 0.3s ease-out}',
      '.fr-ghl-error{color:#ef4444;font-size:12px;margin-top:4px}',
      '@media(max-width:480px){.fr-ghl-modal{width:calc(100vw - 32px)!important;max-height:85vh!important}}',
    ].join('');
    document.head.appendChild(s);
  })();

  // ─── FLOATING BUTTON ────────────────────────────────
  var btn = document.createElement('div');
  btn.className = 'fr-ghl fr-ghl-btn';
  var isRight = POSITION === 'right';
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '24px',
    [isRight ? 'right' : 'left']: '24px',
    zIndex: '999999',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 22px',
    background: 'linear-gradient(135deg, ' + ACCENT + ' 0%, #009B7D 100%)',
    color: '#0a0a1a',
    fontWeight: '700',
    fontSize: '15px',
    borderRadius: '40px',
    boxShadow: '0 4px 20px ' + ACCENT + '40',
    animation: 'frBtnPulse 2.5s ease-in-out infinite',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    letterSpacing: '-0.01em',
  });
  btn.innerHTML = '<span style="font-size:20px;line-height:1">📋</span> ' + CTA_TEXT;

  // ─── MODAL ──────────────────────────────────────────
  var overlay = document.createElement('div');
  overlay.className = 'fr-ghl fr-ghl-hidden';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '999998',
    background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
  });

  var modal = document.createElement('div');
  modal.className = 'fr-ghl-modal';
  Object.assign(modal.style, {
    width: '420px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
    background: '#1a1a2e', borderRadius: '18px',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    position: 'relative', animation: 'frModalIn 0.3s ease-out',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  });

  // Close X
  var closeX = document.createElement('button');
  closeX.innerHTML = '&times;';
  Object.assign(closeX.style, {
    position: 'absolute', top: '12px', right: '14px',
    background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
    fontSize: '24px', cursor: 'pointer', lineHeight: '1', padding: '4px',
    zIndex: '10',
  });
  modal.appendChild(closeX);

  // ─── HEADER ─────────────────────────────────────────
  var header = document.createElement('div');
  Object.assign(header.style, {
    padding: '28px 28px 8px', color: '#fff',
  });
  header.innerHTML = '<div style="font-size:20px;font-weight:700;letter-spacing:-0.02em">' + BRAND + ' AI</div>' +
    '<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:2px">Patient acquisition qualification</div>';
  modal.appendChild(header);

  // ─── FORM ───────────────────────────────────────────
  var form = document.createElement('div');
  form.style.padding = '12px 28px 28px';

  var step = 1;
  var totalSteps = 3;

  function showStep(n) {
    step = n;
    form.innerHTML = '';
    var el = document.createElement('div');
    el.className = 'fr-ghl-step';
    el.style.color = '#fff';

    if (n === 1) {
      el.innerHTML = [
        '<div style="font-size:12px;color:rgba(255,255,255,0.35);margin-bottom:6px">Step 1 of ' + totalSteps + '</div>',
        '<div style="font-size:15px;font-weight:600;margin-bottom:18px">Your contact info</div>',
        '<label style="font-size:12px;color:rgba(255,255,255,0.55);margin-bottom:4px;display:block">Full name *</label>',
        '<input class="fr-ghl-input" id="fr-ghl-name" placeholder="Dr. Sarah Chen" style="margin-bottom:14px">',
        '<label style="font-size:12px;color:rgba(255,255,255,0.55);margin-bottom:4px;display:block">Phone number *</label>',
        '<input class="fr-ghl-input" id="fr-ghl-phone" type="tel" placeholder="(305) 555-0123" style="margin-bottom:14px">',
        '<label style="font-size:12px;color:rgba(255,255,255,0.55);margin-bottom:4px;display:block">Email (optional)</label>',
        '<input class="fr-ghl-input" id="fr-ghl-email" type="email" placeholder="sarah@glowmiami.com" style="margin-bottom:20px">',
        '<button class="fr-ghl-submit fr-ghl-btn" style="background:' + ACCENT + ';color:#0a0a1a">Continue →</button>',
      ].join('');
      el.querySelector('button').onclick = function(e) {
        e.preventDefault();
        var name = document.getElementById('fr-ghl-name').value.trim();
        var phone = document.getElementById('fr-ghl-phone').value.trim();
        if (!name) { showError('fr-ghl-name', 'Name is required'); return; }
        if (!phone) { showError('fr-ghl-phone', 'Phone is required'); return; }
        showStep(2);
      };
    } else if (n === 2) {
      el.innerHTML = [
        '<div style="font-size:12px;color:rgba(255,255,255,0.35);margin-bottom:6px">Step 2 of ' + totalSteps + '</div>',
        '<div style="font-size:15px;font-weight:600;margin-bottom:18px">Your practice</div>',
        '<label style="font-size:12px;color:rgba(255,255,255,0.55);margin-bottom:4px;display:block">Practice name *</label>',
        '<input class="fr-ghl-input" id="fr-ghl-practice" placeholder="Glow Aesthetics Miami" style="margin-bottom:14px">',
        '<label style="font-size:12px;color:rgba(255,255,255,0.55);margin-bottom:4px;display:block">Specialty</label>',
        '<select class="fr-ghl-select" id="fr-ghl-niche" style="margin-bottom:14px">',
          '<option value="">Select...</option>',
          '<option value="med_spa">Med Spa</option>',
          '<option value="cosmetic_dentistry">Cosmetic Dentistry</option>',
          '<option value="plastic_surgery">Plastic Surgery</option>',
          '<option value="dermatology">Dermatology</option>',
          '<option value="wellness">Wellness / IV Therapy</option>',
          '<option value="other">Other</option>',
        '</select>',
        '<label style="font-size:12px;color:rgba(255,255,255,0.55);margin-bottom:4px;display:block">New patients per month</label>',
        '<select class="fr-ghl-select" id="fr-ghl-volume" style="margin-bottom:20px">',
          '<option value="">Select...</option>',
          '<option value="under_15">Under 15</option>',
          '<option value="15_30">15–30</option>',
          '<option value="31_60">31–60</option>',
          '<option value="over_60">60+</option>',
        '</select>',
        '<div style="display:flex;gap:10px">',
          '<button class="fr-ghl-btn" id="fr-ghl-back-2" style="flex:1;padding:14px;border:1px solid rgba(255,255,255,0.15);border-radius:10px;background:none;color:#fff;font-size:14px;font-weight:500;cursor:pointer">← Back</button>',
          '<button class="fr-ghl-submit fr-ghl-btn" style="background:' + ACCENT + ';color:#0a0a1a;flex:2">Continue →</button>',
        '</div>',
      ].join('');
      el.querySelector('#fr-ghl-back-2').onclick = function() { showStep(1); };
      el.querySelector('button.fr-ghl-submit').onclick = function(e) {
        e.preventDefault();
        var practice = document.getElementById('fr-ghl-practice').value.trim();
        if (!practice) { showError('fr-ghl-practice', 'Practice name is required'); return; }
        showStep(3);
      };
    } else if (n === 3) {
      el.innerHTML = [
        '<div style="font-size:12px;color:rgba(255,255,255,0.35);margin-bottom:6px">Step 3 of ' + totalSteps + '</div>',
        '<div style="font-size:15px;font-weight:600;margin-bottom:18px">One last thing</div>',
        '<div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:18px;line-height:1.5">We build AI patient acquisition systems for med spa owners. A quick audit shows you exactly what your funnel is missing.</div>',
        '<label style="font-size:12px;color:rgba(255,255,255,0.55);margin-bottom:4px;display:block">Monthly ad spend</label>',
        '<select class="fr-ghl-select" id="fr-ghl-adspend" style="margin-bottom:20px">',
          '<option value="">Select...</option>',
          '<option value="0">$0 — not yet running ads</option>',
          '<option value="1k">$1K–$3K/month</option>',
          '<option value="3k">$3K–$10K/month</option>',
          '<option value="10k">$10K+/month</option>',
        '</select>',
        '<div style="display:flex;gap:10px">',
          '<button class="fr-ghl-btn" id="fr-ghl-back-3" style="flex:1;padding:14px;border:1px solid rgba(255,255,255,0.15);border-radius:10px;background:none;color:#fff;font-size:14px;font-weight:500;cursor:pointer">← Back</button>',
          '<button class="fr-ghl-submit fr-ghl-btn" id="fr-ghl-final" style="background:' + ACCENT + ';color:#0a0a1a;flex:2">Submit →</button>',
        '</div>',
      ].join('');
      el.querySelector('#fr-ghl-back-3').onclick = function() { showStep(2); };
      el.querySelector('#fr-ghl-final').onclick = function() {
        submitLead();
      };
    }

    form.appendChild(el);
  }

  function showError(id, msg) {
    var inp = document.getElementById(id);
    if (!inp) return;
    inp.style.borderColor = '#ef4444';
    var existing = inp.parentNode.querySelector('.fr-ghl-error');
    if (existing) existing.remove();
    var err = document.createElement('div');
    err.className = 'fr-ghl-error';
    err.textContent = msg;
    inp.parentNode.insertBefore(err, inp.nextSibling);
    inp.focus();
    inp.addEventListener('input', function fix() {
      inp.style.borderColor = '';
      var e = inp.parentNode.querySelector('.fr-ghl-error');
      if (e) e.remove();
      inp.removeEventListener('input', fix);
    }, { once: true });
  }

  function submitLead() {
    var name = document.getElementById('fr-ghl-name').value.trim();
    var phone = document.getElementById('fr-ghl-phone').value.trim();
    var email = document.getElementById('fr-ghl-email') ? document.getElementById('fr-ghl-email').value.trim() : '';
    var practice = document.getElementById('fr-ghl-practice').value.trim();
    var niche = document.getElementById('fr-ghl-niche') ? document.getElementById('fr-ghl-niche').value : '';
    var volume = document.getElementById('fr-ghl-volume') ? document.getElementById('fr-ghl-volume').value : '';
    var adspendSelect = document.getElementById('fr-ghl-adspend');

    var payload = {
      name: name,
      phone: phone,
      email: email || undefined,
      practice: practice,
      niche: niche || undefined,
      volume: volume ? volume.replace(/_/g, '-') : undefined,
      source: 'ghl_widget',
      qualification: {
        score: 0,
        classification: 'new',
        budget_tier: adspendSelect && adspendSelect.value ? 
          (adspendSelect.value === '0' ? 'budget' : 
           adspendSelect.value === '1k' ? 'mid' : 'premium') : 'unknown',
        timeline: 'immediate',
        summary: practice + ' — ' + phone,
      },
    };

    var submitBtn = document.getElementById('fr-ghl-final');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
      submitBtn.style.opacity = '0.6';
    }

    var xhr = new XMLHttpRequest();
    xhr.open('POST', WEBHOOK, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-Client-Id', CLIENT);
    xhr.timeout = 15000;

    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        showSuccess();
      } else {
        showErrorState('Server error. Please try again.');
      }
    };
    xhr.onerror = function() {
      showErrorState('Network error. Please try again.');
    };
    xhr.ontimeout = function() {
      showErrorState('Request timed out. Please try again.');
    };
    xhr.send(JSON.stringify(payload));
  }

  function showSuccess() {
    form.innerHTML = '';
    var el = document.createElement('div');
    el.className = 'fr-ghl-step';
    el.style.cssText = 'text-align:center;padding:20px 0;color:#fff';
    el.innerHTML = [
      '<div style="font-size:48px;margin-bottom:12px">✅</div>',
      '<div style="font-size:18px;font-weight:700;margin-bottom:6px">You\'re on our list!</div>',
      '<div style="font-size:13px;color:rgba(255,255,255,0.55);line-height:1.5">A FocusRunner specialist will reach out within 24 hours to schedule your free audit.</div>',
    ].join('');
    form.appendChild(el);
    // Close after 4s
    setTimeout(hide, 4000);
  }

  function showErrorState(msg) {
    var submitBtn = document.getElementById('fr-ghl-final');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Try Again';
      submitBtn.style.opacity = '1';
    }
    form.insertAdjacentHTML('beforeend',
      '<div style="color:#ef4444;font-size:13px;margin-top:8px;text-align:center">' + msg + '</div>');
  }

  // ─── SHOW / HIDE ────────────────────────────────────
  function show() {
    overlay.classList.remove('fr-ghl-hidden');
    showStep(1);
  }

  function hide() {
    overlay.classList.add('fr-ghl-hidden');
  }

  btn.onclick = show;
  closeX.onclick = hide;
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) hide();
  });

  // Keyboard escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && !overlay.classList.contains('fr-ghl-hidden')) hide();
  });

  // ─── MOUNT ──────────────────────────────────────────
  document.body.appendChild(btn);
  modal.appendChild(form);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
})();
