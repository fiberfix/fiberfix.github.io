/* ─────────────────────────────────────────────
   FiberFix – shared.js
   קוד משותף לכל דפי האתר
   ───────────────────────────────────────────── */

/* ── 1. Hamburger menu ── */
(function () {
  var hamburger = document.getElementById('hamburger');
  var navLinks  = document.getElementById('navLinks');
  if (!hamburger || !navLinks) return;

  function closeMenu() {
    navLinks.classList.remove('active');
    hamburger.textContent = '☰';
    hamburger.setAttribute('aria-expanded', 'false');
  }

  hamburger.addEventListener('click', function () {
    var open = navLinks.classList.toggle('active');
    hamburger.textContent = open ? '✕' : '☰';
    hamburger.setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('.navbar-links a').forEach(function (a) {
    a.addEventListener('click', closeMenu);
  });

  /* close the drawer when tapping anywhere outside it (the uncovered
     half of the screen) — also on Escape */
  document.addEventListener('click', function (e) {
    if (!navLinks.classList.contains('active')) return;
    if (navLinks.contains(e.target) || hamburger.contains(e.target)) return;
    closeMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navLinks.classList.contains('active')) closeMenu();
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
  var DENSITY = IS_MOB ? 52 : 92;        /* stars per screen-height        */
  var MAX_TOTAL = IS_MOB ? 230 : 430;    /* hard cap                       */
  /* prominence: override the per-page CSS opacity (0.6) from one place */
  canvas.style.opacity = '0.95';

  /* star colour families: ice-white, cyan, soft violet, warm gold */
  var FAMS = [
    { w: 0.52, core: 'rgba(224,242,254,', glow: 'rgba(148,200,255,' },
    { w: 0.26, core: 'rgba(125,211,252,', glow: 'rgba(56,189,248,'  },
    { w: 0.13, core: 'rgba(216,180,254,', glow: 'rgba(168,85,247,'  },
    { w: 0.09, core: 'rgba(253,230,168,', glow: 'rgba(245,185,90,'  }
  ];

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
    return Math.min(MAX_TOTAL, Math.round(DENSITY * screens * 0.9));
  }

  /* ── 3D: true perspective with continuous depth travel ──
     Each node lives at depth z and slowly floats TOWARD the viewer
     (starfield motion): it grows, brightens, then respawns deep in the
     background. scale = PERSP/(PERSP+z). Pure math, 2D-canvas cost. */
  var PERSP = 300, Z_NEAR = -120, Z_FAR = 520;

  function mkNode(yMin, yMax) {
    /* size tiers: 70% dust, 25% mid, 5% bright "hero" stars */
    var tier = Math.random();
    var r = tier < 0.70 ? 0.8 + Math.random() * 0.9
          : tier < 0.95 ? 1.7 + Math.random() * 1.1
          :               2.9 + Math.random() * 1.2;
    var fr = Math.random(), acc = 0, fam = FAMS[0];
    for (var q = 0; q < FAMS.length; q++) { acc += FAMS[q].w; if (fr <= acc) { fam = FAMS[q]; break; } }
    return {
      x: Math.random() * W,
      y: yMin + Math.random() * (yMax - yMin),
      vx: (Math.random() - 0.5) * 0.12,             /* stars barely drift in x/y */
      vy: (Math.random() - 0.5) * 0.12,
      r: r, fam: fam, hero: r > 2.9,
      z: Z_NEAR + Math.random() * (Z_FAR - Z_NEAR), /* start anywhere in depth */
      vz: 0.35 + Math.random() * 0.6,               /* travel speed toward viewer */
      tw: 0.8 + Math.random() * 1.8,                /* twinkle rate */
      pulse: Math.random() * Math.PI * 2,
      px: 0, py: 0, s: 1, fade: 1                   /* projection cache */
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
  FAMS.forEach(function (f) { f.sprite = bakeGlow(f.glow, '0.42'); });

  /* 4-point cross flare — pre-baked, used by the brightest stars */
  var flareSprite = (function () {
    var oc = document.createElement('canvas');
    oc.width = oc.height = 96;
    var o = oc.getContext('2d'), c = 48;
    var g1 = o.createLinearGradient(0, c, 96, c);
    g1.addColorStop(0, 'rgba(210,235,255,0)');
    g1.addColorStop(0.5, 'rgba(230,245,255,0.9)');
    g1.addColorStop(1, 'rgba(210,235,255,0)');
    o.fillStyle = g1; o.fillRect(0, c - 0.9, 96, 1.8);
    var g2 = o.createLinearGradient(c, 0, c, 96);
    g2.addColorStop(0, 'rgba(210,235,255,0)');
    g2.addColorStop(0.5, 'rgba(230,245,255,0.9)');
    g2.addColorStop(1, 'rgba(210,235,255,0)');
    o.fillStyle = g2; o.fillRect(c - 0.9, 0, 1.8, 96);
    return oc;
  })();

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

  var meteor = null;

  function render() {
    ctx.clearRect(0, 0, W, worldH);
    var t = Date.now() / 1000;

    /* ── 3D pass: perspective projection around the viewport centre ── */
    var cx = W / 2;
    var cy = (window.scrollY || 0) + H / 2;
    for (var p = 0; p < nodes.length; p++) {
      var np = nodes[p];
      var s  = PERSP / (PERSP + np.z);
      np.s   = s;
      np.px  = cx + (np.x - cx) * s;
      np.py  = cy + (np.y - cy) * s;
      /* fade in when deep, fade out when passing the camera — no pops */
      np.fade = Math.min(1, (np.z - Z_NEAR) / 90, (Z_FAR - np.z) / 140);
    }

    /* ── stars: twinkle + perspective size/brightness ── */
    nodes.forEach(function (n) {
      var twinkle = 0.68 + 0.32 * Math.sin(t * n.tw + n.pulse);
      var s = n.s;
      var a = twinkle * (0.30 + 0.70 * Math.min(1, s)) * n.fade;

      if (a > 0.015) {
        var gr = n.r * 6 * s;
        ctx.globalAlpha = Math.min(1, a);
        ctx.drawImage(n.fam.sprite, n.px - gr, n.py - gr, gr * 2, gr * 2);
        if (n.hero) {
          /* bright star: 4-point cross flare that breathes with the twinkle */
          var fs = n.r * 11 * s * (0.8 + 0.35 * twinkle);
          ctx.globalAlpha = Math.min(1, a * 0.85);
          ctx.drawImage(flareSprite, n.px - fs, n.py - fs, fs * 2, fs * 2);
        }
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(n.px, n.py, Math.max(0.4, n.r * s * (0.75 + 0.25 * twinkle)), 0, Math.PI * 2);
        ctx.fillStyle = n.fam.core + Math.min(1, 0.85 * a + 0.1) + ')';
        ctx.fill();
      }

      /* motion: gentle x/y drift + CONTINUOUS DEPTH TRAVEL toward the
         viewer (×2 compensates for 30fps) */
      n.x += n.vx * 2; n.y += n.vy * 2;
      n.z -= n.vz * 2;
      if (n.z < Z_NEAR) {                 /* passed the camera → respawn deep */
        n.z = Z_FAR;
        n.x = Math.random() * W;
        n.y = Math.random() * worldH;
      }
      if (n.x < -20) n.x = W + 20;
      if (n.x > W + 20) n.x = -20;
      if (n.y < -20) n.y = worldH + 20;
      if (n.y > worldH + 20) n.y = -20;
    });

    /* ── shooting star: frequent, inside the current viewport ── */
    if (!meteor && Math.random() < 0.013) {          /* ≈ every 2.5-4s */
      meteor = {
        x: W * 0.15 + Math.random() * W * 0.7,
        y: (window.scrollY || 0) + Math.random() * H * 0.5,
        vx: (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 4),
        vy: 4 + Math.random() * 3,
        life: 1
      };
    }
    if (meteor) {
      var tailX = meteor.x - meteor.vx * 24, tailY = meteor.y - meteor.vy * 24;
      var mg = ctx.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
      mg.addColorStop(0, 'rgba(235,247,255,' + (0.85 * meteor.life) + ')');
      mg.addColorStop(1, 'rgba(120,190,255,0)');
      ctx.strokeStyle = mg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(meteor.x, meteor.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      meteor.x += meteor.vx * 2;
      meteor.y += meteor.vy * 2;
      meteor.life -= 0.05;
      if (meteor.life <= 0) meteor = null;
    }
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
