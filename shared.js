/* ─────────────────────────────────────────────
   FiberFix – shared.js
   קוד משותף לכל דפי האתר
   ───────────────────────────────────────────── */

/* ── 1. Hamburger menu ── */
(function () {
  var hamburger = document.getElementById('hamburger');
  var navLinks  = document.getElementById('navLinks');
  if (!hamburger || !navLinks) return;

  hamburger.addEventListener('click', function () {
    var open = navLinks.classList.toggle('active');
    hamburger.textContent = open ? '✕' : '☰';
    hamburger.setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('.navbar-links a').forEach(function (a) {
    a.addEventListener('click', function () {
      navLinks.classList.remove('active');
      hamburger.textContent = '☰';
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });
})();

/* ── 2. Social buttons — מניעת hover בטעינה מחדש ── */
(function () {
  function resetSocialBtns() {
    document.querySelectorAll('.social-btn').forEach(function (btn) {
      btn.classList.add('no-hover');
      setTimeout(function () { btn.classList.remove('no-hover'); }, 350);
    });
  }
  window.addEventListener('pageshow', resetSocialBtns);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) resetSocialBtns();
  });
})();

/* ── 3. Network canvas animation — "Quiet Network" v2 ──
   The site's single background animation (all pages).
   Design: drifting network of glowing nodes with depth layers,
   rare violet accents, and a soft cursor response on desktop.
   Perf: pre-baked glow sprites, 30fps cap, width-only resize. */
(function () {
  var canvas = document.getElementById('networkCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W, H, nodes = [], RAF;
  /* perf: far fewer nodes on mobile — weak GPUs */
  var IS_MOB = window.innerWidth < 768;
  var COUNT = IS_MOB ? 22 : 52, MAX_DIST = IS_MOB ? 150 : 190, NODE_R = 2.6;
  /* prominence: override the per-page CSS opacity (0.6) from one place */
  canvas.style.opacity = '0.95';
  var BLUE = 'rgba(14,165,233,', CYAN = 'rgba(56,189,248,';
  var VIOLET = 'rgba(168,85,247,', LILAC = 'rgba(196,145,255,';

  /* cursor response — desktop only, read in draw (O(n), trivial) */
  var mouseX = -9999, mouseY = -9999;
  if (!IS_MOB) {
    document.addEventListener('mousemove', function (e) {
      mouseX = e.clientX; mouseY = e.clientY;
    }, { passive: true });
  }

  /* WORLD-SPACE MODE v2 — 120Hz-smooth scrolling.
     The canvas is ABSOLUTE and spans the WHOLE page height, painted in
     page coordinates. Scrolling it is done by the browser's compositor
     (native 60/120Hz, zero JS) — the animation is glued to the page and
     can never jump during scroll. The 30fps redraw only advances the
     slow drift, which is imperceptible. */
  var worldH = 0;

  function resize() {
    H = window.innerHeight;                        /* viewport height   */
    worldH = Math.max(document.documentElement.scrollHeight, H);
    W = canvas.width  = window.innerWidth;
    canvas.height = worldH;                        /* full page height  */
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = W + 'px';
    canvas.style.height = worldH + 'px';
  }

  function targetCount() {
    var screens = Math.max(1, worldH / H);
    return Math.min(IS_MOB ? 110 : 240, Math.round(COUNT * screens * 0.85));
  }

  function mkNode(yMin, yMax) {
    var depth = 0.45 + Math.random() * 0.55;        /* 0.45 far … 1 near */
    return {
      x: Math.random() * W,
      y: yMin + Math.random() * (yMax - yMin),
      vx: (Math.random() - 0.5) * 0.35 * depth,     /* near = faster (parallax) */
      vy: (Math.random() - 0.5) * 0.35 * depth,
      r: (NODE_R + Math.random() * 1.2) * depth,
      depth: depth,
      violet: Math.random() < 0.15,                 /* rare violet accent */
      pulse: Math.random() * Math.PI * 2,
      sy: 0
    };
  }

  function createNodes() {
    nodes = [];
    var total = targetCount();
    for (var i = 0; i < total; i++) nodes.push(mkNode(0, worldH));
  }

  /* continuity-preserving adjustment — existing nodes keep their positions;
     only the grown/shrunk area gains/loses nodes. NO visual reset. */
  function adjustNodes(oldWorldH) {
    var total = targetCount();
    if (worldH < oldWorldH) nodes = nodes.filter(function (n) { return n.y <= worldH + 20; });
    while (nodes.length > total) nodes.pop();
    var yMin = worldH > oldWorldH ? oldWorldH : 0;
    while (nodes.length < total) nodes.push(mkNode(yMin, worldH));
  }

  /* perf: pre-baked glow sprites — the old code created a new
     createRadialGradient PER NODE PER FRAME (38 gradients × 60fps).
     Now each glow is drawn once to an offscreen canvas and stamped
     with drawImage + globalAlpha. Visually identical. */
  var GLOW_SIZE = 64;
  function bakeGlow(colorPrefix, alpha) {
    var oc = document.createElement('canvas');
    oc.width = oc.height = GLOW_SIZE;
    var octx = oc.getContext('2d');
    var c = GLOW_SIZE / 2;
    var g = octx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, colorPrefix + alpha + ')');
    g.addColorStop(1, colorPrefix + '0)');
    octx.fillStyle = g;
    octx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
    return oc;
  }
  var glowBlue   = bakeGlow(BLUE, '0.30');
  var glowViolet = bakeGlow(VIOLET, '0.26');

  /* perf: background ambience — capped at 30fps (it's a subtle
     backdrop; halves its cost, imperceptible) */
  var FRAME_MS = 1000 / 30;
  var lastFrame = 0;

  function draw(now) {
    RAF = requestAnimationFrame(draw);
    if (now - lastFrame < FRAME_MS) return;
    lastFrame = now;
    render();
  }

  function render() {
    ctx.clearRect(0, 0, W, worldH);
    var t = Date.now() / 1000;
    /* mouse in page coordinates */
    var mWX = mouseX, mWY = mouseY + (window.scrollY || 0);

    /* connections — quick |dy| pre-filter avoids most sqrt calls */
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var dy = nodes[i].y - nodes[j].y;
        if (dy > MAX_DIST || dy < -MAX_DIST) continue;
        var dx = nodes[i].x - nodes[j].x;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_DIST) {
          var alpha = (1 - dist / MAX_DIST) * 0.34;
          ctx.beginPath();
          ctx.strokeStyle = BLUE + alpha + ')';
          ctx.lineWidth   = 1.1;
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }

    /* nodes */
    nodes.forEach(function (n) {
      var pulse = 0.7 + 0.3 * Math.sin(t * 1.4 + n.pulse);

      /* cursor response: nodes near the mouse glow a touch brighter */
      var near = 0;
      if (mouseX > -999) {
        var mdx = n.x - mWX, mdy = n.y - mWY;
        var md2 = mdx * mdx + mdy * mdy;
        if (md2 < 32400) near = 1 - Math.sqrt(md2) / 180;   /* 180px radius */
      }
      var a = (pulse + near * 0.6) * n.depth;

      var gr = n.r * 4 * (1 + near * 0.5);
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(n.violet ? glowViolet : glowBlue, n.x - gr, n.y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = (n.violet ? LILAC : CYAN) + Math.min(1, 0.72 * a + near * 0.3) + ')';
      ctx.fill();

      /* move — ×2 compensates for 30fps (same visual speed) */
      n.x += n.vx * 2; n.y += n.vy * 2;
      if (n.x < -20) n.x = W + 20;
      if (n.x > W + 20) n.x = -20;
      if (n.y < -20) n.y = worldH + 20;
      if (n.y > worldH + 20) n.y = -20;
    });
  }

  /* BUG FIX (iOS): mobile Safari/Chrome fire `resize` every time the URL bar
     collapses/expands DURING SCROLLING. The old handler reset the canvas and
     re-randomized all nodes on every scroll — visible "breaking" on phones.
     Now: debounced + only react to WIDTH changes (height-only = URL bar). */
  var _lastW = window.innerWidth, _rzT;
  window.addEventListener('resize', function () {
    clearTimeout(_rzT);
    _rzT = setTimeout(function () {
      var widthChanged = window.innerWidth !== _lastW;
      _lastW = window.innerWidth;
      var oldH = worldH;
      /* always keep the canvas sized to the FULL page (world) height —
         a height-only resize must never collapse it to viewport height */
      resize();
      /* re-randomize positions only on real width changes,
         never on mobile URL-bar show/hide */
      if (widthChanged) createNodes(); else adjustNodes(oldH);
      render();   /* repaint immediately — no blank flash */
    }, 150);
  });
  window.addEventListener('pagehide', function () { cancelAnimationFrame(RAF); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(RAF); }
    else { RAF = requestAnimationFrame(draw); }
  });

  /* page height can change (images load, FAQ opens) — refresh the world
     bounds occasionally; rebuild only on a significant change */
  /* page height changes (fonts/images load, FAQ opens): update bounds
     CONTINUOUSLY — never re-randomize, repaint immediately (no flash) */
  function syncWorld() {
    var h = Math.max(document.documentElement.scrollHeight, H);
    if (h === worldH) return;
    var oldH = worldH;
    resize();
    adjustNodes(oldH);
    render();
  }
  setInterval(function () { if (!document.hidden) syncWorld(); }, 3000);
  window.addEventListener('load', syncWorld);

  resize();
  createNodes();
  RAF = requestAnimationFrame(draw);
})();
