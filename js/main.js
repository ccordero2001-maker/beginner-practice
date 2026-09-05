/* ============================================================
   BOLD — main.js
   Theme + motion modes, the scroll-driven swing, and the page.

   The swing is not a scroll-mapped animation curve: scroll sets a
   TARGET angle and a damped spring chases it, with the reader's
   scroll velocity injected into angular velocity. That lag is what
   gives the bell mass.
   ============================================================ */
(function () {
  'use strict';

  var html = document.documentElement;

  /* ---- sequence timing, as fractions of the stage's scroll length ---- */
  var MORPH_IN = 0.09, MORPH_OUT = 0.17;
  var SWING_FROM = 0.16, SWING_PEAK = 0.60;
  var BURST_FROM = 0.58, BURST_TO = 0.76;
  var REVEAL_FROM = 0.70, REVEAL_TO = 0.96;
  var PEAK_ANGLE = 1.18, BACK_ANGLE = -0.62;
  var BELL_H = 2.97;
  var PEAK_SCREEN = { x: 0.56, y: 0.30 };

  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function clamp01(v){ return clamp(v,0,1); }
  function range(v,a,b){ return clamp01((v-a)/(b-a)); }
  function easeInOut(t){ return t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }
  function easeOut(t){ return 1-Math.pow(1-t,3); }
  function band(v,a,b,edge){
    if (v<=a||v>=b) return 0;
    var e = edge||0.18, t = (v-a)/(b-a);
    return clamp01(Math.min(t/e,(1-t)/e));
  }

  function store(k,v){ try { if (v===undefined) return localStorage.getItem(k); localStorage.setItem(k,v); } catch(e){ return null; } }
  function prefersReduced(){ return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function webglOK(){
    try { var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); }
    catch(e){ return false; }
  }

  /* ============================================================
     Theme
     ============================================================ */
  var themeBtn = document.getElementById('themeToggle');
  var themeLabel = document.getElementById('themeLabel');
  var metaTheme = document.querySelector('meta[name="theme-color"]');

  function applyTheme(t, persist) {
    html.setAttribute('data-theme', t);
    if (themeBtn) {
      themeBtn.setAttribute('aria-pressed', String(t === 'dark'));
      themeLabel.textContent = t === 'dark' ? 'Light' : 'Dark';
      themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
    if (metaTheme) {
      metaTheme.setAttribute('content',
        getComputedStyle(html).getPropertyValue('--bg').trim() || (t === 'dark' ? '#10171A' : '#FFFFFF'));
    }
    if (persist) store('bold:theme', t);
    if (window.SwingScene && window.SwingScene.isReady()) window.SwingScene.refreshPalette();
  }
  if (themeBtn) themeBtn.addEventListener('click', function () {
    applyTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
  });
  /* follow the OS only while the reader hasn't made an explicit choice */
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq,'change') : mq.addListener.bind(mq))(function (e) {
      if (!store('bold:theme')) applyTheme(e.matches ? 'dark' : 'light', false);
    });
  }
  applyTheme(html.getAttribute('data-theme') || 'light', false);

  /* ============================================================
     Mobile navigation
     ============================================================ */
  var burger = document.getElementById('navBurger');
  var panel = document.getElementById('navPanel');
  var nav = document.getElementById('nav');

  function setMenu(open) {
    if (!panel || !burger) return;
    panel.setAttribute('data-open', String(open));
    burger.setAttribute('aria-expanded', String(open));
    if (open) html.style.setProperty('--nav-h', nav.offsetHeight + 'px');
  }
  if (burger) {
    burger.addEventListener('click', function () {
      setMenu(panel.getAttribute('data-open') !== 'true');
    });
    panel.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.getAttribute('data-open') === 'true') { setMenu(false); burger.focus(); }
    });
    window.addEventListener('resize', function () { if (innerWidth > 1000) setMenu(false); }, { passive: true });
  }

  /* ============================================================
     Motion mode — and the lazy load of Three.js.
     Reduced-motion readers must not pay 589KB for a scene that is
     never built, so the library is only fetched on demand.
     ============================================================ */
  var motionBtn = document.getElementById('motionToggle');
  var motionLabel = document.getElementById('motionLabel');
  var mode = html.getAttribute('data-motion') === 'reduced' ? 'reduced' : 'full';
  if (!webglOK()) mode = 'reduced';

  var threeLoading = null;
  function loadThree() {
    if (window.THREE) return Promise.resolve(true);
    if (threeLoading) return threeLoading;
    threeLoading = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'js/vendor/three.min.js';
      s.onload = function () {
        var s2 = document.createElement('script');
        s2.src = 'js/swing-scene.js';
        s2.onload = function () { resolve(!!window.SwingScene); };
        s2.onerror = function () { resolve(false); };
        document.head.appendChild(s2);
      };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
    return threeLoading;
  }

  function applyMode(next, persist) {
    mode = next;
    html.setAttribute('data-motion', mode);
    if (motionBtn) {
      motionBtn.setAttribute('aria-pressed', String(mode === 'full'));
      motionLabel.textContent = mode === 'full' ? 'Motion' : 'Static';
      motionBtn.setAttribute('aria-label', mode === 'full' ? 'Turn the intro animation off' : 'Turn the intro animation on');
    }
    if (persist) store('bold:motion', mode);
    if (mode === 'full') boot(); else teardown();
  }
  if (motionBtn) motionBtn.addEventListener('click', function () {
    applyMode(mode === 'full' ? 'reduced' : 'full', true);
    window.scrollTo({ top: 0, behavior: 'auto' });
  });

  /* ============================================================
     The stage
     ============================================================ */
  var stage = document.getElementById('stage');
  var tilt = document.getElementById('stageTilt');
  var glCanvas = document.getElementById('gl');
  var trailEl = document.getElementById('trail');
  var mark = document.getElementById('legacyMark');
  var heroCopy = document.getElementById('heroCopy');
  var heroMini = document.getElementById('heroMini');
  var stageBar = document.getElementById('stageBar');
  var hooks = [].slice.call(document.querySelectorAll('.hook'));
  var wipe = document.getElementById('stageWipe');
  var streams = document.getElementById('streams');
  var streamPath = [].slice.call(document.querySelectorAll('.streams__path'));
  var cta = document.getElementById('exploreCta');

  var running = false, rafId = 0, booted = false;
  var angle = 0, angVel = 0, lastY = pageYOffset, lastT = 0, energy = 0, smoothDScroll = 0;
  var restAnchor = { x: 0, y: 0 }, restScale = 0.62, framed = false;

  /* Closed-form step for a damped harmonic oscillator: x'' + c*x' + k*x = 0,
     where x = angle - target (target held fixed over the step). This
     replaces the old semi-implicit Euler update (angVel += ...*dt), which
     can ring or blow up when dt spikes on a dropped frame or a fast flick.
     The analytic solution is exact and stable for any dt, so the swing
     settles the same way regardless of frame rate. */
  function springStep(x0, v0, k, c, dt) {
    var alpha = c / 2;
    var wd2 = k - alpha * alpha;
    var decay = Math.exp(-alpha * dt);
    if (wd2 <= 1e-6) {
      /* critically/over-damped fallback; not hit with this k/c, kept for safety */
      var b = v0 + alpha * x0;
      return { x: decay * (x0 + b * dt), v: decay * (b - alpha * (x0 + b * dt)) };
    }
    var wd = Math.sqrt(wd2);
    var A = x0, B = (v0 + alpha * x0) / wd;
    var cosW = Math.cos(wd * dt), sinW = Math.sin(wd * dt);
    return {
      x: decay * (A * cosW + B * sinW),
      v: decay * ((-alpha * A + B * wd) * cosW + (-alpha * B - A * wd) * sinW)
    };
  }

  function stageProgress() {
    if (!stage) return 0;
    var travel = stage.offsetHeight - innerHeight;
    if (travel <= 0) return 0;
    return clamp01(-stage.getBoundingClientRect().top / travel);
  }

  /* At rest the 3D bell must sit exactly where the outlined mark sits,
     at exactly its on-screen size — that is what makes the morph read as
     one object rather than a swap. */
  function measureRest() {
    if (!mark || !window.SwingScene || !window.SwingScene.isReady()) return;
    var r = mark.getBoundingClientRect();
    if (!r.height) return;
    var v = window.SwingScene.viewSize();
    restAnchor.x = ((r.left + r.width / 2) / innerWidth * 2 - 1) * v.halfW;
    restAnchor.y = -((r.top + r.height / 2) / innerHeight * 2 - 1) * v.halfH;
    restScale = (r.height / (innerHeight / (2 * v.halfH))) / BELL_H;
    framed = true;
  }

  /* The anchor drifts so the top of the arc lands on PEAK_SCREEN at any
     aspect ratio, instead of sailing off the top of the window. */
  function anchorFor(p) {
    var v = window.SwingScene.viewSize(), ARM = window.SwingScene.ARM;
    var offX = ARM * Math.sin(PEAK_ANGLE), offY = ARM - ARM * Math.cos(PEAK_ANGLE);
    var peak = {
      x: (PEAK_SCREEN.x * 2 - 1) * v.halfW - offX,
      y: -(PEAK_SCREEN.y * 2 - 1) * v.halfH - offY
    };
    var t = easeInOut(range(p, MORPH_IN + 0.01, 0.34));
    return { x: restAnchor.x + (peak.x - restAnchor.x) * t, y: restAnchor.y + (peak.y - restAnchor.y) * t };
  }

  function targetAngle(p) {
    if (p < SWING_FROM) return 0;
    var u = clamp01((p - SWING_FROM) / (SWING_PEAK - SWING_FROM));
    if (u < 0.3) return BACK_ANGLE * easeInOut(u / 0.3);
    return BACK_ANGLE + (PEAK_ANGLE - BACK_ANGLE) * easeInOut((u - 0.3) / 0.7);
  }

  function paint(p) {
    if (stageBar) stageBar.style.width = (p * 100).toFixed(1) + '%';

    var markOut = range(p, MORPH_IN, MORPH_OUT);
    if (mark) {
      mark.style.opacity = String(1 - markOut);
      mark.style.transform = 'translate(-50%,-50%) scale(' + (1 + markOut * 0.35) + ')';
    }

    /* the full hero hands over to the mini rail — it never goes blank */
    var handoff = range(p, 0.10, 0.22);
    if (heroCopy) {
      heroCopy.style.opacity = String(1 - handoff);
      heroCopy.style.transform = 'translateY(' + (-handoff * 34) + 'px)';
      heroCopy.style.visibility = handoff >= 1 ? 'hidden' : '';
    }
    if (heroMini) {
      var miniIn = handoff * (1 - range(p, 0.93, 1));
      heroMini.style.opacity = String(miniIn);
      heroMini.style.transform = 'translateY(' + ((1 - miniIn) * 14) + 'px)';
      heroMini.setAttribute('aria-hidden', miniIn < 0.5 ? 'true' : 'false');
      var miniBtn = heroMini.querySelector('a');
      if (miniBtn) miniBtn.tabIndex = miniIn > 0.5 ? 0 : -1;
    }

    var bands = [band(p, 0.19, 0.42), band(p, 0.42, 0.62), band(p, 0.72, 0.99, 0.22)];
    for (var i = 0; i < hooks.length; i++) {
      var a = bands[i] || 0;
      hooks[i].style.opacity = String(a);
      hooks[i].style.transform = 'translate(-50%,calc(-50% + ' + ((1 - a) * 26) + 'px))';
    }

    var rev = range(p, REVEAL_FROM, REVEAL_TO);
    if (wipe) {
      wipe.style.opacity = String(Math.sin(rev * Math.PI) * 0.95);
      wipe.style.transform = 'translate(-50%,-50%) scale(' + (rev * 260) + ')';
    }
    if (streams) {
      var s = range(p, 0.74, 0.94);
      streams.style.opacity = String(s * (1 - range(p, 0.97, 1)));
      for (var k = 0; k < streamPath.length; k++) {
        streamPath[k].style.strokeDashoffset = String(1 - easeOut(clamp01(s * 1.25 - k * 0.08)));
      }
    }

    if (tilt) {
      var lean = clamp(angle, -1.4, 1.4);
      tilt.style.transform =
        'perspective(1400px) rotateZ(' + (lean * 2.1) + 'deg) rotateX(' + (-lean * 1.5) + 'deg) ' +
        'translate3d(' + (-lean * 12) + 'px,' + (Math.abs(lean) * 6) + 'px,0)';
    }
  }

  function frame(now) {
    if (!running) return;
    var dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0.016;
    lastT = now;

    var p = stageProgress();
    var y = pageYOffset, dScroll = y - lastY;
    lastY = y;

    var target = targetAngle(p);
    var k = 26 + p * 22;

    /* smooth the raw scroll delta before it drives the spring — native
       wheel/trackpad deltas arrive in noisy, uneven bursts, and feeding
       that straight into angular velocity is what made the swing feel
       jittery rather than heavy */
    smoothDScroll += (dScroll - smoothDScroll) * Math.min(1, dt * 24);

    var step = springStep(angle - target, angVel, k, 5.4, dt);
    angle = target + step.x;
    angVel = step.v + smoothDScroll * 0.0010;
    angVel = clamp(angVel, -14, 14);

    /* speed rides on top of a floor that lasts the whole swing, so a slow
       scroller still sees the arc */
    var eTarget = Math.min(1, Math.max(band(p, 0.15, 0.68, 0.12) * 0.42, clamp01(Math.abs(angVel) / 5.5)));
    energy += (eTarget - energy) * Math.min(1, dt * 8);

    paint(p);

    if (window.SwingScene && window.SwingScene.isReady()) {
      if (!framed || p < 0.03) measureRest();
      window.SwingScene.update({
        p: p, angle: angle, angVel: angVel, energy: energy,
        anchor: anchorFor(p), scale: restScale,
        appear: range(p, MORPH_IN, MORPH_OUT + 0.04),
        burstT: range(p, BURST_FROM, BURST_TO),
        visible: p > MORPH_IN - 0.02 && p < 0.995
      });
    }

    if (nav) {
      nav.classList.toggle('is-scrolled', y > 40);
      nav.classList.toggle('is-over-stage', stage.getBoundingClientRect().bottom > nav.offsetHeight);
    }
    rafId = requestAnimationFrame(frame);
  }

  function boot() {
    if (mode !== 'full') return;
    if (!booted) {
      loadThree().then(function (ok) {
        if (!ok || !window.SwingScene.init(glCanvas, trailEl)) { applyMode('reduced', false); return; }
        booted = true;
        addEventListener('resize', onResize, { passive: true });
        start();
      });
      return;
    }
    start();
  }
  function start() {
    if (running) return;
    running = true; lastT = 0; lastY = pageYOffset;
    rafId = requestAnimationFrame(frame);
  }
  function teardown() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (window.SwingScene && window.SwingScene.isReady()) window.SwingScene.clearTrail();
    if (nav) nav.classList.remove('is-over-stage');
  }

  var resizeTimer;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (window.SwingScene && window.SwingScene.isReady()) { window.SwingScene.resize(); framed = false; }
    }, 120);
  }

  if (cta && mark) {
    ['mouseenter','focus'].forEach(function (ev) { cta.addEventListener(ev, function(){ mark.classList.add('is-hot'); }); });
    ['mouseleave','blur'].forEach(function (ev) { cta.addEventListener(ev, function(){ mark.classList.remove('is-hot'); }); });
  }

  /* ============================================================
     Below the fold
     ============================================================ */
  var revealables = [].slice.call(document.querySelectorAll(
    '.section-head, .who, .pillar, .step, .metric, .matrix__scroll, .matrix__cards, .voice, .plan, .qa, .cta__inner, .contact-card'
  ));
  revealables.forEach(function (el, i) { el.classList.add('reveal'); el.style.transitionDelay = (i % 4) * 70 + 'ms'; });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    revealables.forEach(function (el) { io.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* Demo form. Deliberately not wired to anything — and it says so. */
  var form = document.getElementById('ctaForm');
  var status = document.getElementById('ctaStatus');
  var ICON_BAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5" stroke-linecap="round"/></svg>';
  var ICON_OK  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.5 2.5L16 9.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  if (form) {
    var email = form.querySelector('#email');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
        email.setAttribute('aria-invalid', 'true');
        status.dataset.state = 'error';
        status.innerHTML = ICON_BAD + '<span>That email address doesn’t look right — could you check it?</span>';
        email.focus();
        return;
      }
      email.removeAttribute('aria-invalid');
      status.dataset.state = 'ok';
      status.innerHTML = ICON_OK + '<span>This is a demo build, so nothing was actually sent. On the real site a coach would reply within one working day.</span>';
      form.reset();
    });
    email.addEventListener('input', function () {
      if (email.getAttribute('aria-invalid') === 'true' && email.value.trim()) {
        email.removeAttribute('aria-invalid'); status.dataset.state = ''; status.innerHTML = '';
      }
    });
  }

  applyMode(mode, false);
})();
