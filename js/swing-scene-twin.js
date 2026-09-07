/* ============================================================
   BOLD — swing-scene-twin.js  [EXPERIMENTAL — not wired into any
   shipped page. Loaded only by test-twin-bell.html.]

   A two-bell variant of the swing: the same outlined mark's two
   mirrored bells swing outward in opposite directions, converge
   back toward centre through the second half of the arc, and
   collide at the peak — a wink at the project's two founders —
   bursting into double the data nodes of the single-bell version.

   Same public API as swing-scene.js (init/update/resize/viewSize/
   refreshPalette/clearTrail/ARM/isReady), so main.js drives it with
   zero changes. Everything below that isn't about having two bells
   — the environment map, the bump/weather textures, the trail
   renderer, the particle sprite — is unchanged from swing-scene.js.
   ============================================================ */
(function (global) {
  'use strict';

  var THREE = null;   // resolved in init(), so a blocked CDN degrades quietly

  /* ---------- tunables ---------- */
  var ARM       = 3.2;   // pendulum arm, world units
  var BASE_SCALE= 0.36;  // fallback; main.js locks this to the 2D mark's on-screen size
  var P_COUNT   = 3400;  // data nodes — double the single-bell count, one bell's worth each
  var LINK_COUNT= 260;   // constellation segments — scaled up with the particle count
  var TRAIL_MAX = 130;   // projected trail samples

  /* Two rigs, one per bell. sign flips x-anchor and rotation so B is a
     true mirror image of A rather than an identical clone. */
  var rigA = { sign: 1 }, rigB = { sign: -1 };
  var scene, camera, renderer;
  var keyLight, amberLight, violetLight;
  var points, pointsMat, links, linksMat;
  var pAttr, cAttr, pOrigin, pDir, pSpeed, pBaseCol, pTwinklePhase, pTwinkleSpeed, lPairs;
  var trailCtx, trailCanvas, trail = [];
  var burstOrigin = null, tmp = null;   // built in init(); THREE may not exist yet

  /* The scene takes its colours from the active palette's CSS custom
     properties, so swapping palette or theme re-tints the swing without
     touching this file. */
  var pal = { trail: '255,154,31', glow: '255,210,74', node: '#ffd24a', node2: '#9dc183' };
  function readPalette() {
    var cs = getComputedStyle(document.documentElement);
    function v(name, fb) { var x = cs.getPropertyValue(name).trim(); return x || fb; }
    pal.trail = v('--swing-trail', pal.trail);
    pal.glow  = v('--swing-glow',  pal.glow);
    pal.node  = v('--swing-node',  pal.node);
    pal.node2 = v('--swing-node-2', pal.node2);
  }
  function rgbCss(triplet, a) { return 'rgba(' + triplet + ',' + a + ')'; }
  function rgbHexNum(triplet) {
    var p = triplet.split(',').map(function (n) { return Math.max(0, Math.min(255, parseInt(n, 10) || 0)); });
    return (p[0] << 16) | (p[1] << 8) | p[2];
  }
  var ready = false;
  var dpr = 1;

  /* ------------------------------------------------------------
     Procedural environment: six painted canvas faces. Gives the
     metal something to reflect without shipping an HDR file.
     ------------------------------------------------------------ */
  function faceCanvas(paint) {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    paint(c.getContext('2d'), 128);
    return c;
  }

  function buildEnvMap() {
    function base(ctx, s, top, bottom) {
      var g = ctx.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
    function bar(ctx, x, y, w, h, color, blur) {
      ctx.save();
      ctx.filter = 'blur(' + blur + 'px)';
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }

    var faces = [
      // +X : the key strip. This is the highlight that rakes the bell.
      faceCanvas(function (c, s) { base(c, s, '#2a2f3a', '#090b0f'); bar(c, s * 0.55, s * 0.1, s * 0.16, s * 0.8, '#ffffff', 9); }),
      // -X : cool fill
      faceCanvas(function (c, s) { base(c, s, '#181d27', '#070809'); bar(c, s * 0.2, s * 0.25, s * 0.1, s * 0.5, '#8fa0ff', 12); }),
      // +Y : soft overhead box light
      faceCanvas(function (c, s) { base(c, s, '#262b34', '#161a21'); bar(c, s * 0.22, s * 0.22, s * 0.56, s * 0.56, '#c9cfda', 14); }),
      // -Y : floor bounce
      faceCanvas(function (c, s) { base(c, s, '#0b0d11', '#050608'); }),
      // +Z : low kicker — kept neutral so the metal reads as metal in every
      //      palette; the palette's colour arrives via the lights and emissive
      faceCanvas(function (c, s) { base(c, s, '#16181c', '#08090b'); bar(c, s * 0.1, s * 0.6, s * 0.8, s * 0.14, '#5d626b', 13); }),
      // -Z : rim
      faceCanvas(function (c, s) { base(c, s, '#141419', '#07070a'); bar(c, s * 0.3, s * 0.05, s * 0.4, s * 0.12, '#6a6f78', 11); })
    ];

    var env = new THREE.CubeTexture(faces);
    env.needsUpdate = true;
    if ('sRGBEncoding' in THREE) env.encoding = THREE.sRGBEncoding;
    return env;
  }

  /* Cast-iron micro-texture, so the metal isn't a mirror-smooth blob. */
  function buildBumpMap() {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(256, 256);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = 128 + (Math.random() - 0.5) * 90;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 4);
    return t;
  }

  function clampByte(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }

  /* The vintage competition look: chipped green/teal paint over bare rust
     and black iron, plus a stamped weight number. Painted once onto the
     lathe's own UVs (u = around, v = bottom-to-top), so it wraps the body
     like a real worn label rather than tiling like the bump map does. */
  function buildWeatherMap() {
    var w = 1024, h = 512;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');

    var base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#3a2d24');
    base.addColorStop(0.5, '#241a15');
    base.addColorStop(1, '#170f0c');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    function blotch(x, y, r, stops, alpha) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.55 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // rust blooms — warm rust-orange, bleeding through wherever paint is gone
    for (var i = 0; i < 50; i++) {
      blotch(Math.random() * w, Math.random() * h, 26 + Math.random() * 95, [
        [0, 'rgba(150,86,42,0.9)'], [0.6, 'rgba(94,52,28,0.55)'], [1, 'rgba(94,52,28,0)']
      ], 0.3 + Math.random() * 0.35);
    }

    // surviving paint — muted heritage teal/green, the largest surface patches
    for (var j = 0; j < 22; j++) {
      blotch(Math.random() * w, Math.random() * h, 55 + Math.random() * 150, [
        [0, 'rgba(60,86,74,0.95)'], [0.7, 'rgba(42,62,54,0.6)'], [1, 'rgba(42,62,54,0)']
      ], 0.38 + Math.random() * 0.32);
    }

    // fine grain, so it reads as cast metal up close rather than a flat print
    var img = ctx.getImageData(0, 0, w, h);
    for (var k = 0; k < img.data.length; k += 4) {
      var n = (Math.random() - 0.5) * 24;
      img.data[k] = clampByte(img.data[k] + n);
      img.data[k + 1] = clampByte(img.data[k + 1] + n);
      img.data[k + 2] = clampByte(img.data[k + 2] + n);
    }
    ctx.putImageData(img, 0, 0);

    // the stamped weight number, sitting on the belly like the reference bells
    ctx.save();
    ctx.translate(w * 0.5, h * 0.46);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, 58, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(185,175,155,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-2, -2, 58, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '700 46px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText('24', 1, 3);
    ctx.fillStyle = 'rgba(195,185,165,0.28)';
    ctx.fillText('24', -1, 0);
    ctx.restore();

    var t = new THREE.CanvasTexture(c);
    if ('sRGBEncoding' in THREE) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  /* Flares the tube's radius as a function of t (0..1 along its path),
     so the handle reads as forged with the body at both roots and only
     narrows to a comfortable grip at the top — instead of a uniform-radius
     rod. Displaces each ring of vertices around the path's own centerline,
     so it works on any TubeGeometry regardless of how it curves. */
  function taperTube(geometry, path, tubularSegments, radialSegments, taperFn) {
    var arr = geometry.attributes.position.array;
    var stride = (radialSegments + 1) * 3;
    var center = new THREE.Vector3();
    for (var i = 0; i <= tubularSegments; i++) {
      var s = taperFn(i / tubularSegments);
      path.getPointAt(i / tubularSegments, center);
      var rowStart = i * stride;
      for (var j = 0; j <= radialSegments; j++) {
        var idx = rowStart + j * 3;
        arr[idx]     = center.x + (arr[idx]     - center.x) * s;
        arr[idx + 1] = center.y + (arr[idx + 1] - center.y) * s;
        arr[idx + 2] = center.z + (arr[idx + 2] - center.z) * s;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  function handleTaper(t) {
    var edge = Math.pow(Math.abs(t - 0.5) * 2, 2.4);   // 0 at the grip, 1 at both roots
    return 0.85 + 0.45 * edge;   // moderate flare — the collar spheres carry the rest of the join
  }

  /* ------------------------------------------------------------
     The bell itself: a lathed cast body plus a swept-tube handle.
     ------------------------------------------------------------ */
  function buildKettlebell(env, bump) {
    var group = new THREE.Group();

    /* Proportions follow the 2D heritage mark: body as tall as it is wide,
       handle rising ~0.42 of the body height above it. Radius changes at
       every point — no flat-radius run — so the revolve reads as a curved
       belly rather than a barrel with rounded ends. The final two points
       share a height (2.08) and close to radius 0, capping the neck the
       same way the first two points cap the flat base: without that, a
       LatheGeometry with a non-zero final radius leaves its far end open,
       and you're looking straight through the neck into empty scene. */
    var profile = [
      [0.00, 0.00], [0.52, 0.00], [0.86, 0.06], [0.99, 0.24],
      [1.00, 0.52], [0.99, 0.80], [0.93, 1.08], [0.82, 1.34],
      [0.68, 1.56], [0.54, 1.76], [0.45, 1.94], [0.40, 2.08],
      [0.00, 2.08]
    ].map(function (pt) { return new THREE.Vector2(pt[0], pt[1]); });

    var bellMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: buildWeatherMap(),   // chipped paint over rust — the actual albedo now
      metalness: 0.88,
      roughness: 0.78,
      envMap: env,
      envMapIntensity: 0.75,
      bumpMap: bump,
      bumpScale: 0.012,
      roughnessMap: bump,   // cast-iron speckle, so the highlight breaks up
      emissive: rgbHexNum(pal.trail),
      emissiveIntensity: 0.0,
      transparent: true
    });

    var body = new THREE.Mesh(new THREE.LatheGeometry(profile, 96), bellMat);
    body.position.y = -1.49;              // centre the whole bell on the origin
    group.add(body);

    /* Root x narrowed to sit inside the new, slimmer neck radius (~0.57 at
       y=1.72) so the flared tube base overlaps solid body instead of
       floating outside it with a gap between them. */
    var handlePath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.58, 1.72, 0), new THREE.Vector3(-0.63, 2.15, 0),
      new THREE.Vector3(-0.46, 2.62, 0), new THREE.Vector3(0.00, 2.80, 0),
      new THREE.Vector3(0.46, 2.62, 0),  new THREE.Vector3(0.63, 2.15, 0),
      new THREE.Vector3(0.58, 1.72, 0)
    ]);

    var handleMat = bellMat.clone();
    handleMat.color = new THREE.Color(0xcfcfcf);   // bare-handled from grip wear, not repainted
    handleMat.roughness = 0.88;

    var handleGeo = new THREE.TubeGeometry(handlePath, 120, 0.15, 24, false);
    taperTube(handleGeo, handlePath, 120, 24, handleTaper);   // thick at both roots, slims at the grip
    var handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.y = -1.49;
    group.add(handle);

    /* A tube is a circle swept along the path's own Frenet frame, which
       doesn't line up with the lathe's surface normal at the root — no
       matter how much the tube flares, that mismatch shows up as a hard
       ridge where the two surfaces meet instead of a smooth fillet. Two
       collar spheres, one at each root, bury the seam under solid material
       the way a real casting's shoulder is one continuous piece of iron. */
    var collarGeo = new THREE.SphereGeometry(0.20, 20, 16);
    [handlePath.points[0], handlePath.points[handlePath.points.length - 1]].forEach(function (p) {
      var collar = new THREE.Mesh(collarGeo, handleMat);
      collar.position.set(p.x, p.y - 1.49, p.z);
      collar.scale.set(1.05, 1.15, 0.85);
      group.add(collar);
    });

    group.scale.setScalar(BASE_SCALE);
    group.userData.bellMat = bellMat;
    group.userData.handleMat = handleMat;
    return group;
  }

  /* ------------------------------------------------------------
     Data nodes: where the iron goes when it stops being iron.
     ------------------------------------------------------------ */
  function sprite() {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0.00, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, rgbCss(pal.glow, 0.85));
    g.addColorStop(1.00, rgbCss(pal.trail, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  function buildParticles() {
    var pos = new Float32Array(P_COUNT * 3);
    pBaseCol = new Float32Array(P_COUNT * 3);
    var dispCol = new Float32Array(P_COUNT * 3);
    pDir = new Float32Array(P_COUNT * 3);
    pSpeed = new Float32Array(P_COUNT);
    pOrigin = new Float32Array(P_COUNT * 3);
    pTwinklePhase = new Float32Array(P_COUNT);
    pTwinkleSpeed = new Float32Array(P_COUNT);

    var cA = new THREE.Color(rgbHexNum(pal.trail));
    var cB = new THREE.Color(pal.node);
    var cC = new THREE.Color(pal.node2);
    var c = new THREE.Color();

    for (var i = 0; i < P_COUNT; i++) {
      // even-ish sphere of directions, biased upward and forward
      var th = Math.random() * Math.PI * 2;
      var z = Math.random() * 2 - 1;
      var r = Math.sqrt(1 - z * z);
      pDir[i * 3]     = r * Math.cos(th);
      pDir[i * 3 + 1] = z * 0.9 + 0.22;
      pDir[i * 3 + 2] = r * Math.sin(th) * 0.7;
      pSpeed[i] = 0.6 + Math.pow(Math.random(), 1.7) * 3.0;

      /* each node glints on its own clock, so the burst reads as scattered
         sparkle instead of a flat cloud fading in lockstep */
      pTwinklePhase[i] = Math.random() * Math.PI * 2;
      pTwinkleSpeed[i] = 3 + Math.random() * 7;

      var t = Math.random();
      c.copy(t < 0.5 ? cA : cB).lerp(cC, Math.max(0, t - 0.55) * 2.2);
      pBaseCol[i * 3] = c.r; pBaseCol[i * 3 + 1] = c.g; pBaseCol[i * 3 + 2] = c.b;
      dispCol[i * 3] = c.r; dispCol[i * 3 + 1] = c.g; dispCol[i * 3 + 2] = c.b;
    }

    var geo = new THREE.BufferGeometry();
    pAttr = new THREE.BufferAttribute(pos, 3);
    geo.setAttribute('position', pAttr);
    cAttr = new THREE.BufferAttribute(dispCol, 3);
    geo.setAttribute('color', cAttr);

    pointsMat = new THREE.PointsMaterial({
      size: 0.075,
      map: sprite(),
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    points = new THREE.Points(geo, pointsMat);
    points.frustumCulled = false;

    /* fluid geometric lines between nearby nodes */
    lPairs = new Uint16Array(LINK_COUNT * 2);
    var POOL = 260;
    function disp(i, axis) { return pDir[i * 3 + axis] * pSpeed[i]; }
    for (var k = 0; k < LINK_COUNT; k++) {
      var a = Math.floor(Math.random() * POOL), best = -1, bestD = Infinity;
      for (var probe = 0; probe < 40; probe++) {
        var cand = Math.floor(Math.random() * POOL);
        if (cand === a) continue;
        var dx = disp(a, 0) - disp(cand, 0);
        var dy = disp(a, 1) - disp(cand, 1);
        var dz = disp(a, 2) - disp(cand, 2);
        var d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) { bestD = d; best = cand; }
      }
      lPairs[k * 2] = a;
      lPairs[k * 2 + 1] = best < 0 ? a : best;
    }
    var lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINK_COUNT * 6), 3));
    linksMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(pal.node), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    links = new THREE.LineSegments(lgeo, linksMat);
    links.frustumCulled = false;
  }

  /* ============================================================
     Public API
     ============================================================ */
  function init(glCanvas, trailEl) {
    THREE = global.THREE;
    if (!THREE || !glCanvas) return false;
    readPalette();

    try {
      renderer = new THREE.WebGLRenderer({
        canvas: glCanvas, antialias: true, alpha: true, powerPreference: 'high-performance'
      });
    } catch (e) {
      return false;                       // no WebGL — caller falls back to the static twin
    }

    dpr = Math.min(global.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
    if ('toneMapping' in renderer) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
    }

    burstOrigin = new THREE.Vector3();
    worldA = new THREE.Vector3();
    worldB = new THREE.Vector3();
    tmp = new THREE.Vector3();

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 9);

    var env = buildEnvMap();
    scene.environment = env;

    scene.add(new THREE.AmbientLight(0x3b4250, 0.30));

    keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(3.5, 5, 4);
    scene.add(keyLight);

    amberLight = new THREE.PointLight(rgbHexNum(pal.trail), 0, 14, 2);
    amberLight.position.set(-2.2, 0.6, 2.2);
    scene.add(amberLight);

    violetLight = new THREE.PointLight(rgbHexNum(pal.glow), 0, 22, 2);
    violetLight.position.set(3, -2, 2.5);
    scene.add(violetLight);

    var bump = buildBumpMap();   // shared micro-detail; each bell still gets its own weather map
    [rigA, rigB].forEach(function (rig) {
      rig.pivot = new THREE.Object3D();
      rig.pivot.position.y = ARM;          // rest position = world origin until main.js reframes
      scene.add(rig.pivot);

      rig.bell = buildKettlebell(env, bump);
      rig.bell.position.y = -ARM;
      rig.pivot.add(rig.bell);
      rig.bellMat = rig.bell.userData.bellMat;
      rig.handleMat = rig.bell.userData.handleMat;
    });

    buildParticles();
    scene.add(points);
    scene.add(links);

    trailCanvas = trailEl;
    trailCtx = trailEl ? trailEl.getContext('2d') : null;

    ready = true;
    resize();
    return true;
  }

  function resize() {
    if (!ready) return;
    var w = global.innerWidth, h = global.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    /* keep the bell a constant share of the *height* on wide screens,
       and pull the camera back on narrow ones so it never clips */
    camera.position.z = camera.aspect < 0.8 ? 12.5 : (camera.aspect < 1.25 ? 10.5 : 9);
    camera.updateProjectionMatrix();

    if (trailCanvas) {
      trailCanvas.width = Math.floor(w * dpr);
      trailCanvas.height = Math.floor(h * dpr);
      trailCanvas.style.width = w + 'px';
      trailCanvas.style.height = h + 'px';
    }
    trail.length = 0;
  }

  /* Screen-space glow trail. Drawn in 2D because a projected ribbon
     reads far hotter than a 1px WebGL line, and costs almost nothing. */
  function drawTrail(worldPos, energy, alive) {
    if (!trailCtx) return;
    var w = trailCanvas.width, h = trailCanvas.height;
    trailCtx.clearRect(0, 0, w, h);
    if (!alive) { trail.length = 0; return; }

    tmp.copy(worldPos).project(camera);
    var x = (tmp.x * 0.5 + 0.5) * w, y = (-tmp.y * 0.5 + 0.5) * h;

    /* a teleport (scroll jump, tab switch) is not motion — start a new arc
       rather than drawing a straight chord across the screen */
    var last = trail[trail.length - 1];
    if (last && Math.hypot(x - last.x, y - last.y) > w * 0.22) trail.length = 0;

    if (!last || Math.hypot(x - last.x, y - last.y) > 1.2 * dpr) {
      trail.push({ x: x, y: y });
      if (trail.length > TRAIL_MAX) trail.shift();
    }
    if (trail.length < 4) return;

    /* Drawn as overlapping smoothed chunks: each chunk is a quadratic spline
       through the sample midpoints, so the arc reads as a swept ribbon
       instead of a polyline, and each gets its own width and alpha for taper. */
    var small = w / dpr < 700;
    var CH = small ? 4 : 6, n = trail.length;
    trailCtx.globalCompositeOperation = 'lighter';
    trailCtx.lineCap = 'round';
    trailCtx.lineJoin = 'round';

    for (var pass = 0; pass < 2; pass++) {
      var wide = pass === 0;
      trailCtx.shadowBlur = (wide ? (small ? 24 : 40) : 12) * dpr;
      trailCtx.shadowColor = wide ? rgbCss(pal.trail, 0.9) : rgbCss(pal.glow, 0.95);

      for (var c = 0; c < CH; c++) {
        var a = Math.floor(n * c / CH);
        var b = Math.min(n - 1, Math.floor(n * (c + 1) / CH) + 1);
        if (b - a < 2) continue;
        var f = (c + 1) / CH;                          // 1 = newest chunk
        var alpha = Math.pow(f, 2.2) * (wide ? 0.26 : 0.62) * energy;
        if (alpha < 0.004) continue;

        trailCtx.strokeStyle = wide ? rgbCss(pal.trail, alpha) : rgbCss(pal.glow, alpha);
        trailCtx.lineWidth = (wide ? 30 : 7) * f * dpr * (0.45 + energy * 0.75);

        trailCtx.beginPath();
        trailCtx.moveTo(trail[a].x, trail[a].y);
        for (var i = a + 1; i < b; i++) {
          var mx = (trail[i].x + trail[i + 1].x) / 2;
          var my = (trail[i].y + trail[i + 1].y) / 2;
          trailCtx.quadraticCurveTo(trail[i].x, trail[i].y, mx, my);
        }
        trailCtx.stroke();
      }
    }
    trailCtx.shadowBlur = 0;
    trailCtx.globalCompositeOperation = 'source-over';
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  /* Same closed-form damped-oscillator solver as main.js's springStep —
     copied rather than shared, since this module has no access to
     main.js's closure. Used to give bell B its own physics. */
  function springStep(x0, v0, k, c, dt) {
    var alpha = c / 2;
    var wd2 = k - alpha * alpha;
    var decay = Math.exp(-alpha * dt);
    if (wd2 <= 1e-6) {
      var b = v0 + alpha * x0;
      return { x: decay * (x0 + b * dt), v: decay * (b - alpha * (x0 + b * dt)) };
    }
    var wd = Math.sqrt(wd2);
    var Ax = x0, Bx = (v0 + alpha * x0) / wd;
    var cosW = Math.cos(wd * dt), sinW = Math.sin(wd * dt);
    return {
      x: decay * (Ax * cosW + Bx * sinW),
      v: decay * ((-alpha * Ax + Bx * wd) * cosW + (-alpha * Bx - Ax * wd) * sinW)
    };
  }

  /* Bell A uses main.js's own state.angle/state.angVel directly — it's
     the reference swing, identical to the single-bell page. Bell B runs
     an independent copy of the same spring model with its own timing and
     reach, so at any paused frame the two poses don't line up as an exact
     reflection: it reads as two bodies that happen to meet, not one
     motion and its mirror. */
  var SWING_FROM_B = 0.16, SWING_PEAK_B = 0.64;
  var BACK_ANGLE_B = 0.52, PEAK_ANGLE_B = -1.02;
  var angleB = 0, angVelB = 0, lastTB = 0;

  function targetAngleB(p) {
    if (p < SWING_FROM_B) return 0;
    var u = clamp01((p - SWING_FROM_B) / (SWING_PEAK_B - SWING_FROM_B));
    if (u < 0.3) return BACK_ANGLE_B * easeInOut(u / 0.3);
    return BACK_ANGLE_B + (PEAK_ANGLE_B - BACK_ANGLE_B) * easeInOut((u - 0.3) / 0.7);
  }

  function stepBellB(p) {
    var now = performance.now();
    var dt = lastTB ? Math.min((now - lastTB) / 1000, 0.05) : 0.016;
    lastTB = now;
    var target = targetAngleB(p);
    var k = 22 + p * 18, c = 5.8;   // a touch softer/heavier than bell A's implied k=26+p*22, c=5.4
    var step = springStep(angleB - target, angVelB, k, c, dt);
    angleB = target + step.x;
    angVelB = step.v;
  }

  /* Converge fraction: 0 through the outward swing (each rig sits at its
     own mirrored anchor), 1 by CONVERGE_TO (both rigs collapsed onto the
     shared centre point). Hand-tuned to finish just before BURST_FROM
     (0.58 in main.js) so the collision and the burst land together. This
     part stays shared/synchronised between the two rigs regardless of
     the angle divergence above — both still have to physically arrive at
     the same point at the same time for the collision to read. */
  var CONVERGE_FROM = 0.34, CONVERGE_TO = 0.58;

  /* Bell B's departure from the shared birth point (main.js's MORPH_IN is
     0.09; anchorFor itself starts easing at 0.10). Starting a beat later
     and reaching full spread with a different easing shape (ease-out, not
     A's ease-in-out) than an exact negation of state.anchor.x every frame
     — which read as a reflection appearing in lockstep, not a second body
     leaving the same point on its own. Both still land at the same
     mirrored magnitude by CONVERGE_FROM, so the swing/collision timing
     downstream is unaffected. */
  var SPREAD_FROM_B = 0.13, SPREAD_TO_B = 0.34;

  function positionRig(rig, state) {
    var cv = easeInOut(clamp01((state.p - CONVERGE_FROM) / (CONVERGE_TO - CONVERGE_FROM)));
    var spread = rig.sign > 0 ? 1 : easeOut(clamp01((state.p - SPREAD_FROM_B) / (SPREAD_TO_B - SPREAD_FROM_B)));
    var x = state.anchor.x * rig.sign * spread * (1 - cv);   // slides from its mirrored peak to centre
    rig.pivot.position.set(x, state.anchor.y + ARM, 0);

    var angle, angVel;
    if (rig.sign > 0) {
      angle = state.angle; angVel = state.angVel;
    } else {
      /* B runs its own independent spring while the two are still apart
         (that's the "not a mirror" character from 2.8), but two springs
         with different k/c ring down at different rates — left alone,
         that beats a flickering burst in and out right as they close in,
         since separation stops being monotonic. Blending B's rotation
         into an exact mirror of A over the same cv used for the anchor
         convergence forces zero residual rotational offset by the time
         they actually meet, so contact reads as one clean touch. */
      angle = angleB * (1 - cv) + (-state.angle) * cv;
      angVel = angVelB * (1 - cv) + (-state.angVel) * cv;
    }
    rig.pivot.rotation.z = angle;
    rig.bell.rotation.z = -angle * 0.30;
    rig.bell.rotation.y = rig.sign * (0.42 + state.p * 0.75);
    rig.bell.rotation.x = -0.06 + angVel * 0.035;
  }

  /* B fades in a beat after A (main.js's own appear is range(p, 0.09, 0.21))
     rather than both solidifying from the same mark on the same frame —
     the second body follows the first out, instead of the pair arriving
     together like a stamp and its reflection. */
  var APPEAR_FROM_B = 0.125, APPEAR_TO_B = 0.245;

  function dissolveRig(rig, solid, appear, warmth, eMat, burst, baseScale, p) {
    var ownAppear = rig.sign > 0 ? appear : clamp01((p - APPEAR_FROM_B) / (APPEAR_TO_B - APPEAR_FROM_B));
    rig.bell.scale.setScalar(baseScale * (0.94 + 0.06 * Math.min(1, p / 0.18)) * (0.35 + 0.65 * solid));
    rig.bell.visible = solid > 0.01;
    rig.bellMat.opacity = rig.handleMat.opacity = solid * ownAppear;
    rig.bellMat.emissiveIntensity = rig.handleMat.emissiveIntensity = eMat * 0.10 * warmth + burst * 0.75;
  }

  var worldA = null, worldB = null;   // built in init(); THREE may not exist yet

  /* Sum of the two bells' rendered radii in world units (profile radius
     1.0 x BASE_SCALE, plus a little slack for the handle's reach) — the
     centre-to-centre distance at which their surfaces actually meet. */
  var CONTACT_DIST = BASE_SCALE * 2.05;

  /* The mirror-blend above stops the two springs beating against each
     other, but the swing's own damped spring still legitimately overshoots
     its target before settling (that overshoot is the point of the single-
     bell version too) — so separation can still dip below CONTACT_DIST,
     rise back above it, then finally settle. Taken raw, that reopens the
     bells after they've already dissolved: a pop-back-in, not a clean
     explosion. burstPeak ratchets forward through a single scroll pass —
     once contact is reached the burst can only hold or grow — and only
     resets when scrolling back out before the swing starts, so scrubbing
     to the very top still correctly reforms two solid bells. */
  var burstPeak = 0;

  /* state = { p, angle, angVel, burstT, visible, energy } */
  function update(state) {
    if (!ready) return;

    var appear = state.appear === undefined ? 1 : state.appear;
    var warmth = Math.min(1, Math.max(0, (state.p - 0.18) / 0.22));
    var eMat = Math.min(state.energy, 0.62);
    var baseScale = state.scale || BASE_SCALE;

    if (state.anchor) {
      stepBellB(state.p);
      positionRig(rigA, state);
      positionRig(rigB, state);
    }

    /* World positions first, purely from this frame's pivot/rotation —
       unaffected by scale, so it's safe to read before dissolveRig runs. */
    rigA.bell.updateMatrixWorld();
    rigB.bell.updateMatrixWorld();
    rigA.bell.getWorldPosition(worldA);
    rigB.bell.getWorldPosition(worldB);

    /* Contact-triggered burst: a pure function of how close the two
       bells' actual rendered positions are *right now*, not a fixed
       scroll-percentage schedule borrowed from the single-bell timing.
       They explode exactly when their surfaces meet — scroll back out
       before that and there is no burst at all — and it stays perfectly
       reversible since nothing here is stateful.

       Armed only from CONVERGE_FROM on: both bells morph in from the same
       central mark, so early on they're already close together on their
       way OUT to their mirrored peaks — without this gate that near-zero
       starting separation would itself read as "contact" and burst
       immediately, before the swing-apart even happens. */
    var armed = state.p >= CONVERGE_FROM;
    var separation = worldA.distanceTo(worldB);
    var rawBurst = armed ? clamp01((CONTACT_DIST - separation) / CONTACT_DIST) : 0;
    if (!armed) burstPeak = 0;                        // scrolled back out past the swing — rearm
    burstPeak = Math.max(burstPeak, rawBurst);
    var burst = burstPeak;

    var solid = 1 - easeOut(Math.min(1, burst / 0.45));   // the bells dissolving

    dissolveRig(rigA, solid, appear, warmth, eMat, burst, baseScale, state.p);
    dissolveRig(rigB, solid, appear, warmth, eMat, burst, baseScale, state.p);
    rigA.bell.visible = state.visible && rigA.bell.visible;
    rigB.bell.visible = state.visible && rigB.bell.visible;

    amberLight.intensity = eMat * 3.0 * warmth;
    violetLight.intensity = burst * 5.5;
    camera.position.z += ((camera.aspect < 0.8 ? 12.5 : (camera.aspect < 1.25 ? 10.5 : 9)) - 0.9 * state.p - camera.position.z) * 0.1;

    /* the burst and the trail both originate from the collision point —
       the midpoint of the two bells, which is exactly where they touch */
    burstOrigin.addVectors(worldA, worldB).multiplyScalar(0.5);
    var bellWorld = burstOrigin;

    if (burst <= 0.001) {
      // freeze the origin at the top of the arc; re-arms if you scroll back
      for (var i = 0; i < P_COUNT; i++) {
        pOrigin[i * 3] = bellWorld.x;
        pOrigin[i * 3 + 1] = bellWorld.y;
        pOrigin[i * 3 + 2] = bellWorld.z;
      }
      pointsMat.opacity = 0;
      linksMat.opacity = 0;
    } else {
      var t = easeOut(burst) * 1.15;
      var arr = pAttr.array;
      var cArr = cAttr.array;
      var time = performance.now() * 0.001;
      for (var j = 0; j < P_COUNT; j++) {
        var k = j * 3;
        var sp = pSpeed[j] * t;
        arr[k]     = pOrigin[k]     + pDir[k]     * sp;
        arr[k + 1] = pOrigin[k + 1] + pDir[k + 1] * sp - t * t * 0.55 + Math.sin(t * 3 + j) * 0.05;
        arr[k + 2] = pOrigin[k + 2] + pDir[k + 2] * sp;

        var tw = 0.45 + 0.55 * Math.max(0, Math.sin(time * pTwinkleSpeed[j] + pTwinklePhase[j]));
        cArr[k] = pBaseCol[k] * tw; cArr[k + 1] = pBaseCol[k + 1] * tw; cArr[k + 2] = pBaseCol[k + 2] * tw;
      }
      pAttr.needsUpdate = true;
      cAttr.needsUpdate = true;
      pointsMat.opacity = Math.min(1, burst * 4) * (1 - Math.pow(Math.max(0, burst - 0.55) / 0.45, 1.6));
      pointsMat.size = 0.07 + burst * 0.065;

      var la = links.geometry.attributes.position.array;
      for (var m = 0; m < LINK_COUNT; m++) {
        var a3 = lPairs[m * 2] * 3, b3 = lPairs[m * 2 + 1] * 3;
        la[m * 6]     = arr[a3];     la[m * 6 + 1] = arr[a3 + 1]; la[m * 6 + 2] = arr[a3 + 2];
        la[m * 6 + 3] = arr[b3];     la[m * 6 + 4] = arr[b3 + 1]; la[m * 6 + 5] = arr[b3 + 2];
      }
      links.geometry.attributes.position.needsUpdate = true;
      linksMat.opacity = Math.max(0, Math.sin(Math.min(1, burst / 0.8) * Math.PI)) * 0.34;
    }

    drawTrail(bellWorld, state.energy, state.visible && burst < 0.6);
    renderer.render(scene, camera);
  }

  function clearTrail() {
    if (trailCtx) trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    trail.length = 0;
  }

  /* half-extents of the z=0 plane in world units — lets main.js convert
     a DOM rectangle into a world-space anchor for the morph */
  function viewSize() {
    if (!ready) return { halfW: 4.4, halfH: 2.75 };
    var halfH = Math.tan(camera.fov * Math.PI / 360) * camera.position.z;
    return { halfW: halfH * camera.aspect, halfH: halfH };
  }

  /* Re-tint after a palette or theme change, without rebuilding the scene. */
  function refreshPalette() {
    if (!ready) return;
    readPalette();
    var cA = new THREE.Color(rgbHexNum(pal.trail));
    var cB = new THREE.Color(pal.node);
    var cC = new THREE.Color(pal.node2);
    var c = new THREE.Color();
    var disp = cAttr.array;
    for (var i = 0; i < P_COUNT; i++) {
      var t = (i * 0.6180339887) % 1;                  // stable, not re-randomised
      c.copy(t < 0.5 ? cA : cB).lerp(cC, Math.max(0, t - 0.55) * 2.2);
      var k = i * 3;
      pBaseCol[k] = c.r; pBaseCol[k + 1] = c.g; pBaseCol[k + 2] = c.b;
      disp[k] = c.r; disp[k + 1] = c.g; disp[k + 2] = c.b;
    }
    cAttr.needsUpdate = true;
    pointsMat.map = sprite(); pointsMat.needsUpdate = true;
    linksMat.color.set(pal.node);
    [rigA, rigB].forEach(function (rig) {
      rig.bellMat.emissive.setHex(rgbHexNum(pal.trail));
      rig.handleMat.emissive.setHex(rgbHexNum(pal.trail));
    });
    amberLight.color.setHex(rgbHexNum(pal.trail));
    violetLight.color.setHex(rgbHexNum(pal.glow));
  }

  global.SwingScene = {
    init: init, update: update, resize: resize, clearTrail: clearTrail,
    viewSize: viewSize, ARM: ARM, refreshPalette: refreshPalette,
    isReady: function () { return ready; }
  };
})(window);
