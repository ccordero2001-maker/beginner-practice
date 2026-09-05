/* ============================================================
   BOLD — main.js
   Scroll driver, phase state machine, palette shift, and the
   full/reduced motion switch.

   The swing is not a scroll-mapped animation curve: scroll sets a
   TARGET angle, and a damped spring chases it. That is what gives
   the bell mass — flick the wheel and it overshoots, ease down
   and it lags behind you.
   ============================================================ */
(function () {
  'use strict';

  var html = document.documentElement;

  /* ---------- sequence timing, in stage progress (0 → 1) ---------- */
  var MORPH_IN   = 0.09;   // 3D bell starts resolving out of the outline
  var MORPH_OUT  = 0.17;   // outline fully gone
  var SWING_FROM = 0.16;
  var SWING_PEAK = 0.60;   // maximum elevation
  var BURST_FROM = 0.58;
  var BURST_TO   = 0.76;
  var REVEAL_FROM= 0.70;
  var REVEAL_TO  = 0.96;
  var PEAK_ANGLE = 1.18;   // radians at the top of the arc
  var BACK_ANGLE = -0.62;  // the hike back
  var BELL_H     = 2.97;   // the 3D bell's height in world units
  var PEAK_SCREEN= { x: 0.56, y: 0.30 };   // where the burst should land, in viewport fractions

  /* ---------- helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return clamp(v, 0, 1); }
  function range(v, a, b) { return clamp01((v - a) / (b - a)); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  /* fade in then out across [a,b] with soft shoulders */
  function band(v, a, b, edge) {
    if (v <= a || v >= b) return 0;
    var e = edge || 0.18, w = b - a, t = (v - a) / w;
    return clamp01(Math.min(t / e, (1 - t) / e));
  }
  function hexToRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function mixHex(a, b, t) {
    var A = hexToRgb(a), B = hexToRgb(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
                    Math.round(A[1] + (B[1] - A[1]) * t) + ',' +
                    Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  /* three-stop ramp: legacy → transitional → BOLD */
  function ramp(t, c0, c1, c2) {
    return t < 0.5 ? mixHex(c0, c1, t / 0.5) : mixHex(c1, c2, (t - 0.5) / 0.5);
  }

  /* ============================================================
     Motion mode
     ============================================================ */
  var STORE_KEY = 'bold:motion';
  var toggle = document.getElementById('motionToggle');

  function prefersReduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function webglOK() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }
  function stored() {
    try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; }
  }
  function remember(v) {
    try { localStorage.setItem(STORE_KEY, v); } catch (e) { /* private mode — fine */ }
  }

  var saved = stored();
  var mode = saved === 'full' || saved === 'reduced'
    ? saved
    : (prefersReduced() || !webglOK() || !window.THREE ? 'reduced' : 'full');

  function applyMode(next, persist) {
    mode = next;
    html.setAttribute('data-motion', mode);
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(mode === 'full'));
      toggle.querySelector('.motion-toggle__label').textContent = mode === 'full' ? 'Motion' : 'Static';
      toggle.title = mode === 'full' ? 'Switch to the static version' : 'Switch to the animated version';
    }
    if (persist) remember(mode);
    if (mode === 'full') boot(); else teardown();
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      applyMode(mode === 'full' ? 'reduced' : 'full', true);
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
  }

  /* ============================================================
     The stage
     ============================================================ */
  var stage      = document.getElementById('stage');
  var tilt       = document.getElementById('stageTilt');
  var glCanvas   = document.getElementById('gl');
  var trailEl    = document.getElementById('trail');
  var mark       = document.getElementById('legacyMark');
  var heroCopy   = document.getElementById('heroCopy');
  var hooks      = [].slice.call(document.querySelectorAll('.hook'));
  var wipe       = document.getElementById('stageWipe');
  var streams    = document.getElementById('streams');
  var streamPath = [].slice.call(document.querySelectorAll('.streams__path'));
  var nav        = document.getElementById('nav');
  var cta        = document.getElementById('exploreCta');

  var running = false, rafId = 0, booted = false;
  var angle = 0, angVel = 0, lastY = window.pageYOffset, lastT = 0, energy = 0;

  /* ------------------------------------------------------------
     Framing. At rest the 3D bell must sit exactly where the
     outlined mark sits, at exactly its on-screen size — that is
     what makes the morph read as one object rather than a swap.
     From there the anchor drifts so the top of the arc lands on
     PEAK_SCREEN instead of sailing off the top of the window.
     ------------------------------------------------------------ */
  var restAnchor = { x: 0, y: 0 }, restScale = 0.62, framed = false;

  function measureRest() {
    if (!mark || !window.SwingScene || !window.SwingScene.isReady()) return;
    var r = mark.getBoundingClientRect();
    if (!r.height) return;
    var v = window.SwingScene.viewSize();
    var w = window.innerWidth, h = window.innerHeight;
    restAnchor.x = ((r.left + r.width / 2) / w * 2 - 1) * v.halfW;
    restAnchor.y = -((r.top + r.height / 2) / h * 2 - 1) * v.halfH;
    restScale = (r.height / (h / (2 * v.halfH))) / BELL_H;
    framed = true;
  }

  function anchorFor(p) {
    var v = window.SwingScene.viewSize();
    var ARM = window.SwingScene.ARM;
    /* where the bell sits relative to its anchor at full extension */
    var offX = ARM * Math.sin(PEAK_ANGLE);
    var offY = ARM - ARM * Math.cos(PEAK_ANGLE);
    var peakAnchor = {
      x: (PEAK_SCREEN.x * 2 - 1) * v.halfW - offX,
      y: -(PEAK_SCREEN.y * 2 - 1) * v.halfH - offY
    };
    var t = easeInOut(range(p, MORPH_IN + 0.01, 0.34));
    return {
      x: restAnchor.x + (peakAnchor.x - restAnchor.x) * t,
      y: restAnchor.y + (peakAnchor.y - restAnchor.y) * t
    };
  }

  function stageProgress() {
    if (!stage) return 0;
    var travel = stage.offsetHeight - window.innerHeight;
    if (travel <= 0) return 0;
    return clamp01(-stage.getBoundingClientRect().top / travel);
  }

  /* Where the scroll *wants* the bell to be. The spring decides
     where it actually is. */
  function targetAngle(p) {
    if (p < SWING_FROM) return 0;
    var u = clamp01((p - SWING_FROM) / (SWING_PEAK - SWING_FROM));
    if (u < 0.3) return BACK_ANGLE * easeInOut(u / 0.3);
    var b = (u - 0.3) / 0.7;
    return BACK_ANGLE + (PEAK_ANGLE - BACK_ANGLE) * easeInOut(b);
  }

  function paint(p) {
    /* ---- palette shift ---- */
    var bg     = ramp(p, '#0a0c10', '#150f0a', '#0a0818');
    var accent = ramp(p, '#c9ced8', '#ff9a1f', '#ffd24a');
    html.style.setProperty('--bg', bg);
    html.style.setProperty('--accent', accent);

    html.setAttribute('data-phase', p < MORPH_IN ? 'legacy' : (p < REVEAL_FROM ? 'swing' : 'bold'));

    /* ---- Phase 1: the heritage mark hands off ---- */
    var markOut = range(p, MORPH_IN, MORPH_OUT);
    if (mark) {
      mark.style.opacity = String(1 - markOut);
      mark.style.transform = 'translate(-50%,-50%) scale(' + (1 + markOut * 0.35) + ')';
    }
    if (heroCopy) {
      var out = range(p, 0.04, 0.16);
      heroCopy.style.opacity = String(1 - out);
      heroCopy.style.transform = 'translateY(' + (-out * 40) + 'px)';
      heroCopy.style.pointerEvents = out > 0.5 ? 'none' : '';
    }

    /* ---- Phase 2 + 3: the hooks ---- */
    var bands = [band(p, 0.19, 0.42), band(p, 0.42, 0.62), band(p, 0.72, 0.99, 0.22)];
    for (var i = 0; i < hooks.length; i++) {
      var a = bands[i] || 0;
      hooks[i].style.opacity = String(a);
      hooks[i].style.transform = 'translate(-50%,calc(-50% + ' + ((1 - a) * 26) + 'px))';
    }

    /* ---- Phase 3: the energy arc opens the page ---- */
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

    /* ---- the inertia-driven page tilt ---- */
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
    var y = window.pageYOffset;
    var dScroll = y - lastY;
    lastY = y;

    /* damped spring toward the scroll-set target, with the user's
       scroll velocity injected straight into angular velocity */
    var target = targetAngle(p);
    var k = 26 + p * 22, damp = 5.4;
    angVel += (target - angle) * k * dt - angVel * damp * dt;
    angVel += dScroll * 0.0010;
    angVel = clamp(angVel, -14, 14);
    angle += angVel * dt;

    /* the trail is a motion artefact, but a slow scroller still deserves
       to see the arc — so speed rides on top of a floor that exists for
       the whole swing rather than replacing it */
    var floor = band(p, 0.15, 0.68, 0.12) * 0.42;
    var eTarget = Math.min(1, Math.max(floor, clamp01(Math.abs(angVel) / 5.5)));
    energy += (eTarget - energy) * Math.min(1, dt * 8);

    paint(p);

    if (window.SwingScene && window.SwingScene.isReady()) {
      if (!framed || p < 0.03) measureRest();
      window.SwingScene.update({
        p: p,
        anchor: anchorFor(p),
        scale: restScale,
        angle: angle,
        angVel: angVel,
        energy: energy,
        appear: range(p, MORPH_IN, MORPH_OUT + 0.04),
        burstT: range(p, BURST_FROM, BURST_TO),
        visible: p > MORPH_IN - 0.02 && p < 0.995
      });
    }

    if (nav) nav.classList.toggle('is-scrolled', y > 40);
    rafId = requestAnimationFrame(frame);
  }

  function boot() {
    if (mode !== 'full') return;
    if (!booted) {
      var ok = window.SwingScene && window.THREE && window.SwingScene.init(glCanvas, trailEl);
      if (!ok) {                       // no THREE (CDN blocked) or no WebGL
        applyMode('reduced', false);
        return;
      }
      booted = true;
      window.addEventListener('resize', onResize, { passive: true });
    }
    if (!running) {
      running = true;
      lastT = 0;
      lastY = window.pageYOffset;
      rafId = requestAnimationFrame(frame);
    }
  }

  function teardown() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (window.SwingScene && window.SwingScene.isReady()) window.SwingScene.clearTrail();
    html.style.setProperty('--bg', '#0a0c10');
    html.style.setProperty('--accent', '#c9ced8');
  }

  var resizeTimer;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (window.SwingScene && window.SwingScene.isReady()) {
        window.SwingScene.resize();
        framed = false;
      }
    }, 120);
  }

  /* CTA hover ignites the outline early — the promise of the swing */
  if (cta && mark) {
    cta.addEventListener('mouseenter', function () { mark.classList.add('is-hot'); });
    cta.addEventListener('mouseleave', function () { mark.classList.remove('is-hot'); });
    cta.addEventListener('focus', function () { mark.classList.add('is-hot'); });
    cta.addEventListener('blur', function () { mark.classList.remove('is-hot'); });
  }

  /* ============================================================
     Below the fold
     ============================================================ */
  var revealables = [].slice.call(document.querySelectorAll(
    '.section-head, .pillar, .metric, .matrix__scroll, .voice, .plan, .cta__inner'
  ));
  revealables.forEach(function (el, i) {
    el.classList.add('reveal');
    el.style.transitionDelay = (i % 4) * 70 + 'ms';
  });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        if (e.target.classList.contains('metric')) countUp(e.target.querySelector('.metric__num'));
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
    revealables.forEach(function (el) { io.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* DEMO DATA: these are placeholder figures — the counter only
     animates whatever text is already in the markup. */
  function countUp(el) {
    if (!el || mode !== 'full' || prefersReduced()) return;
    var m = /^(\D*)([\d,]+)(.*)$/.exec(el.textContent.trim());
    if (!m) return;
    var pre = m[1], target = parseInt(m[2].replace(/,/g, ''), 10), post = m[3];
    var start = performance.now(), dur = 1100;
    (function step(now) {
      var t = clamp01((now - start) / dur);
      var v = Math.round(target * easeOut(t));
      el.textContent = pre + v.toLocaleString('en-US') + post;
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }

  /* Demo form — deliberately not wired to anything. */
  var form = document.getElementById('ctaForm');
  var status = document.getElementById('ctaStatus');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.querySelector('#email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        status.textContent = 'That email doesn’t look right — mind checking it?';
        return;
      }
      status.textContent = 'Demo build: this form isn’t connected to a backend yet. Nothing was sent.';
      form.reset();
    });
  }

  /* Smooth in-page nav that respects the motion setting */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href');
    if (id === '#' || id === '#top') { e.preventDefault(); window.scrollTo({ top: 0, behavior: mode === 'full' ? 'smooth' : 'auto' }); return; }
    var t = document.querySelector(id);
    if (!t) return;
    e.preventDefault();
    t.scrollIntoView({ behavior: mode === 'full' && !prefersReduced() ? 'smooth' : 'auto', block: 'start' });
  });

  applyMode(mode, false);
})();
