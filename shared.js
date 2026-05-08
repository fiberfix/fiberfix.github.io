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
  var COUNT = 38, MAX_DIST = 160, NODE_R = 2.2;
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

  function draw() {
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
      var grad  = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 4);
      grad.addColorStop(0, BLUE + (0.18 * pulse) + ')');
      grad.addColorStop(1, BLUE + '0)');
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * 4, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = CYAN + (0.55 * pulse) + ')';
      ctx.fill();

      /* move */
      n.x += n.vx; n.y += n.vy;
      if (n.x < -20) n.x = W + 20;
      if (n.x > W + 20) n.x = -20;
      if (n.y < -20) n.y = H + 20;
      if (n.y > H + 20) n.y = -20;
    });

    RAF = requestAnimationFrame(draw);
  }

  window.addEventListener('resize', function () { resize(); createNodes(); });
  window.addEventListener('pagehide', function () { cancelAnimationFrame(RAF); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(RAF); }
    else { RAF = requestAnimationFrame(draw); }
  });

  resize();
  createNodes();
  draw();
})();
