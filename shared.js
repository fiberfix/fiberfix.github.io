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

/* ── 3. Network canvas animation ── */
(function () {
  var canvas = document.getElementById('networkCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W, H, nodes = [], RAF;
  /* perf: far fewer nodes on mobile — weak GPUs */
  var IS_MOB = window.innerWidth < 768;
  var COUNT = IS_MOB ? 16 : 38, MAX_DIST = 160, NODE_R = 2.2;
  var BLUE = 'rgba(14,165,233,', CYAN = 'rgba(56,189,248,';

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createNodes() {
    nodes = [];
    for (var i = 0; i < COUNT; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: NODE_R + Math.random() * 1.2,
        pulse: Math.random() * Math.PI * 2
      });
    }
  }

  /* perf: pre-baked glow sprite — the old code created a new
     createRadialGradient PER NODE PER FRAME (38 gradients × 60fps).
     Now the glow is drawn once to an offscreen canvas and stamped
     with drawImage + globalAlpha. Visually identical. */
  var GLOW_SIZE = 64;
  var glowSprite = (function () {
    var oc = document.createElement('canvas');
    oc.width = oc.height = GLOW_SIZE;
    var octx = oc.getContext('2d');
    var c = GLOW_SIZE / 2;
    var g = octx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, BLUE + '0.18)');
    g.addColorStop(1, BLUE + '0)');
    octx.fillStyle = g;
    octx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
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

    ctx.clearRect(0, 0, W, H);
    var t = Date.now() / 1000;

    /* connections */
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var dx   = nodes[i].x - nodes[j].x;
        var dy   = nodes[i].y - nodes[j].y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_DIST) {
          var alpha = (1 - dist / MAX_DIST) * 0.22;
          ctx.beginPath();
          ctx.strokeStyle = BLUE + alpha + ')';
          ctx.lineWidth   = 0.8;
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }

    /* nodes */
    nodes.forEach(function (n) {
      var pulse = 0.7 + 0.3 * Math.sin(t * 1.4 + n.pulse);
      var gr = n.r * 4;
      ctx.globalAlpha = pulse;
      ctx.drawImage(glowSprite, n.x - gr, n.y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = CYAN + (0.55 * pulse) + ')';
      ctx.fill();

      /* move — ×2 compensates for 30fps (same visual speed as before) */
      n.x += n.vx * 2; n.y += n.vy * 2;
      if (n.x < -20) n.x = W + 20;
      if (n.x > W + 20) n.x = -20;
      if (n.y < -20) n.y = H + 20;
      if (n.y > H + 20) n.y = -20;
    });
  }

  window.addEventListener('resize', function () { resize(); createNodes(); });
  window.addEventListener('pagehide', function () { cancelAnimationFrame(RAF); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(RAF); }
    else { RAF = requestAnimationFrame(draw); }
  });

  resize();
  createNodes();
  RAF = requestAnimationFrame(draw);
})();
