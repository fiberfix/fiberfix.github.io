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

/* ── 3. Starfield background — "Quiet Network" v3 (SCROLL-DECOUPLED) ──
   The site's single background animation (all pages).

   WHY v3 (2026-07-04): v2 painted the canvas at FULL PAGE height so stars
   were glued to the page → giant GPU texture re-uploaded each redraw → scroll
   jank. FIX: honour the CSS (#networkCanvas is position:fixed, 100%×100%).
   Viewport-sized & screen-anchored → scrolling is composited on the GPU at
   native 60/120Hz, decoupled from the animation. Delta-time motion (constant
   speed at 60Hz AND 120Hz), ~1 screen of stars, pre-baked sprites.

   v3.2 (2026-07-04): flyby bodies overhauled — THREE pre-baked objects
   (muted ringed planet, irregular asteroid, cratered moon), realistic
   day/night terminator shading (no bright neon glow), slow tumble on the
   rocky bodies, and a randomised NATURAL path every time (varied entry edge,
   angle, height, speed, size) so a pass never repeats identically. Each is a
   single drawImage/frame → negligible cost. */
(function () {
  var canvas = document.getElementById('networkCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d', { alpha: true });
  var W, H, nodes = [], RAF, running = false;

  var IS_MOB = window.innerWidth < 768;
  var COUNT = IS_MOB ? 60 : 110;           /* one screen's worth of stars */
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* prominence: override the per-page CSS opacity (0.6) from one place */
  canvas.style.opacity = '0.95';

  /* star colour families: ice-white, cyan, soft violet, warm gold */
  var FAMS = [
    { w: 0.52, core: 'rgba(224,242,254,', glow: 'rgba(148,200,255,' },
    { w: 0.26, core: 'rgba(125,211,252,', glow: 'rgba(56,189,248,'  },
    { w: 0.13, core: 'rgba(216,180,254,', glow: 'rgba(168,85,247,'  },
    { w: 0.09, core: 'rgba(253,230,168,', glow: 'rgba(245,185,90,'  }
  ];

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = W;    /* backing store = viewport, DPR 1 (cheapest) */
    canvas.height = H;
  }

  /* ── 3D: perspective with continuous depth travel toward the viewer ── */
  var PERSP = 300, Z_NEAR = -120, Z_FAR = 520;

  function mkNode() {
    var tier = Math.random();
    var r = tier < 0.70 ? 0.8 + Math.random() * 0.9
          : tier < 0.95 ? 1.7 + Math.random() * 1.1
          :               2.9 + Math.random() * 1.2;
    var fr = Math.random(), acc = 0, fam = FAMS[0];
    for (var q = 0; q < FAMS.length; q++) { acc += FAMS[q].w; if (fr <= acc) { fam = FAMS[q]; break; } }
    return {
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.12,
      r: r, fam: fam, hero: r > 2.9,
      z: Z_NEAR + Math.random() * (Z_FAR - Z_NEAR),
      vz: 0.35 + Math.random() * 0.6,
      tw: 0.8 + Math.random() * 1.8,
      pulse: Math.random() * Math.PI * 2,
      px: 0, py: 0, s: 1, fade: 1
    };
  }
  function createNodes() { nodes = []; for (var i = 0; i < COUNT; i++) nodes.push(mkNode()); }

  /* pre-baked star glow sprites (no per-frame gradients) */
  var GLOW_SIZE = 64;
  function bakeGlow(colorPrefix, alpha) {
    var oc = document.createElement('canvas');
    oc.width = oc.height = GLOW_SIZE;
    var octx = oc.getContext('2d'), c = GLOW_SIZE / 2;
    var g = octx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, colorPrefix + alpha + ')');
    g.addColorStop(1, colorPrefix + '0)');
    octx.fillStyle = g; octx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
    return oc;
  }
  FAMS.forEach(function (f) { f.sprite = bakeGlow(f.glow, '0.42'); });

  /* 4-point cross flare for the brightest stars */
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

  /* ── shared realism helper: day/night terminator ──
     Darkens the side of a spherical body away from the light (top-left),
     clipped to the body circle. Gives a real lit/shadow phase — no glow. */
  function paintTerminator(o, cx, cy, R, strength) {
    o.save();
    o.beginPath(); o.arc(cx, cy, R, 0, Math.PI * 2); o.clip();
    var sg = o.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    sg.addColorStop(0.00, 'rgba(2,4,10,0)');
    sg.addColorStop(0.52, 'rgba(2,4,10,' + (strength * 0.10) + ')');
    sg.addColorStop(0.78, 'rgba(2,4,10,' + (strength * 0.45) + ')');
    sg.addColorStop(1.00, 'rgba(2,4,10,' + strength + ')');
    o.fillStyle = sg; o.fillRect(cx - R, cy - R, R * 2, R * 2);
    o.restore();
  }
  /* subtle rim light on the lit limb (thin, not neon) */
  function paintRim(o, cx, cy, R, rgb, a) {
    o.save();
    o.beginPath(); o.arc(cx, cy, R, 0, Math.PI * 2); o.clip();
    var rim = o.createRadialGradient(cx, cy, R * 0.86, cx, cy, R);
    rim.addColorStop(0, 'rgba(' + rgb + ',0)');
    rim.addColorStop(1, 'rgba(' + rgb + ',' + a + ')');
    o.fillStyle = rim; o.fillRect(cx - R, cy - R, R * 2, R * 2);
    o.restore();
  }

  /* ── OBJECT 1: ringed planet (muted steel-blue gas giant) ── */
  var spritePlanet = (function () {
    var S = 620, R = 132, cx = S / 2, cy = S / 2;
    var oc = document.createElement('canvas'); oc.width = oc.height = S;
    var o = oc.getContext('2d');
    var ri = R * 1.42, ro = R * 1.94, tilt = 0.38;

    /* faint atmosphere (subtle, not glowing) */
    var halo = o.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 1.4);
    halo.addColorStop(0, 'rgba(96,132,186,0.12)');
    halo.addColorStop(1, 'rgba(96,132,186,0)');
    o.fillStyle = halo; o.beginPath(); o.arc(cx, cy, R * 1.4, 0, Math.PI * 2); o.fill();

    function ring(half) {
      o.save();
      o.beginPath();
      if (half === 'back') o.rect(0, 0, S, cy); else o.rect(0, cy, S, S - cy);
      o.clip();
      o.translate(cx, cy); o.scale(1, tilt);
      var rg = o.createRadialGradient(0, 0, ri, 0, 0, ro);
      rg.addColorStop(0.00, 'rgba(150,160,178,0.04)');
      rg.addColorStop(0.32, 'rgba(196,205,220,0.46)');
      rg.addColorStop(0.55, 'rgba(150,165,190,0.34)');
      rg.addColorStop(0.80, 'rgba(120,135,165,0.22)');
      rg.addColorStop(1.00, 'rgba(120,135,165,0.01)');
      o.fillStyle = rg;
      o.beginPath(); o.arc(0, 0, ro, 0, Math.PI * 2); o.arc(0, 0, ri, 0, Math.PI * 2, true);
      o.fill('evenodd');
      o.restore();
    }
    ring('back');

    /* body — muted steel blue, lit top-left */
    var lx = cx - R * 0.34, ly = cy - R * 0.34;
    var pg = o.createRadialGradient(lx, ly, R * 0.1, cx, cy, R * 1.05);
    pg.addColorStop(0.00, 'rgba(168,190,214,1)');
    pg.addColorStop(0.40, 'rgba(84,112,152,1)');
    pg.addColorStop(0.75, 'rgba(44,64,98,1)');
    pg.addColorStop(1.00, 'rgba(22,32,58,1)');
    o.fillStyle = pg; o.beginPath(); o.arc(cx, cy, R, 0, Math.PI * 2); o.fill();

    /* subtle cloud bands */
    o.save(); o.beginPath(); o.arc(cx, cy, R, 0, Math.PI * 2); o.clip();
    var bands = [[-0.40, 0.05, 'rgba(206,220,238,0.06)'],
                 [-0.08, 0.08, 'rgba(20,34,64,0.12)'],
                 [ 0.22, 0.06, 'rgba(200,214,234,0.05)'],
                 [ 0.50, 0.09, 'rgba(16,28,56,0.14)']];
    bands.forEach(function (b) {
      o.beginPath(); o.ellipse(cx, cy + R * b[0], R * 1.02, R * b[1], 0, 0, Math.PI * 2);
      o.fillStyle = b[2]; o.fill();
    });
    o.restore();

    paintRim(o, cx, cy, R, '150,178,214', 0.30);
    paintTerminator(o, cx, cy, R, 0.72);
    ring('front');

    return { img: oc, S: S, spin: 0 };
  })();

  /* ── OBJECT 2: irregular rocky asteroid ── */
  var spriteAsteroid = (function () {
    var S = 300, cx = S / 2, cy = S / 2, R = 96;
    var oc = document.createElement('canvas'); oc.width = oc.height = S;
    var o = oc.getContext('2d');

    /* irregular silhouette */
    var N = 15, pts = [];
    for (var i = 0; i < N; i++) {
      var ang = i / N * Math.PI * 2;
      var rad = R * (0.72 + Math.random() * 0.34);
      pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
    }
    o.beginPath();
    o.moveTo(pts[0][0], pts[0][1]);
    for (i = 1; i < N; i++) {
      var mx = (pts[i][0] + pts[(i + 1) % N][0]) / 2;
      var my = (pts[i][1] + pts[(i + 1) % N][1]) / 2;
      o.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    o.closePath();
    o.save(); o.clip();

    /* rocky fill, lit top-left */
    var lx = cx - R * 0.4, ly = cy - R * 0.4;
    var rg = o.createRadialGradient(lx, ly, R * 0.15, cx, cy, R * 1.25);
    rg.addColorStop(0.00, 'rgba(156,146,132,1)');
    rg.addColorStop(0.45, 'rgba(104,95,84,1)');
    rg.addColorStop(0.80, 'rgba(58,51,45,1)');
    rg.addColorStop(1.00, 'rgba(28,24,22,1)');
    o.fillStyle = rg; o.fillRect(0, 0, S, S);

    /* craters */
    for (i = 0; i < 9; i++) {
      var crx = cx + rnd(-R * 0.7, R * 0.7), cry = cy + rnd(-R * 0.7, R * 0.7);
      var cr = rnd(5, 15);
      o.beginPath(); o.arc(crx, cry, cr, 0, Math.PI * 2);
      o.fillStyle = 'rgba(28,24,20,0.5)'; o.fill();
      o.beginPath(); o.arc(crx - cr * 0.25, cry - cr * 0.25, cr * 0.8, 0, Math.PI * 2);
      o.fillStyle = 'rgba(170,158,142,0.16)'; o.fill();
    }
    o.restore();

    /* shadow across the whole rock (light top-left → dark bottom-right) */
    o.save();
    o.beginPath();
    o.moveTo(pts[0][0], pts[0][1]);
    for (i = 1; i < N; i++) {
      var mx2 = (pts[i][0] + pts[(i + 1) % N][0]) / 2;
      var my2 = (pts[i][1] + pts[(i + 1) % N][1]) / 2;
      o.quadraticCurveTo(pts[i][0], pts[i][1], mx2, my2);
    }
    o.closePath(); o.clip();
    var sg = o.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    sg.addColorStop(0.0, 'rgba(2,3,6,0)');
    sg.addColorStop(0.55, 'rgba(2,3,6,0.12)');
    sg.addColorStop(1.0, 'rgba(2,3,6,0.62)');
    o.fillStyle = sg; o.fillRect(0, 0, S, S);
    o.restore();

    return { img: oc, S: S, spin: 1 };
  })();

  /* ── OBJECT 3: cratered grey moon ── */
  var spriteMoon = (function () {
    var S = 340, cx = S / 2, cy = S / 2, R = 118;
    var oc = document.createElement('canvas'); oc.width = oc.height = S;
    var o = oc.getContext('2d');

    var lx = cx - R * 0.36, ly = cy - R * 0.36;
    var pg = o.createRadialGradient(lx, ly, R * 0.12, cx, cy, R * 1.05);
    pg.addColorStop(0.00, 'rgba(206,206,210,1)');
    pg.addColorStop(0.45, 'rgba(140,140,148,1)');
    pg.addColorStop(0.80, 'rgba(78,78,86,1)');
    pg.addColorStop(1.00, 'rgba(34,34,42,1)');
    o.fillStyle = pg; o.beginPath(); o.arc(cx, cy, R, 0, Math.PI * 2); o.fill();

    o.save(); o.beginPath(); o.arc(cx, cy, R, 0, Math.PI * 2); o.clip();
    /* maria (dark plains) */
    var maria = [[-0.3, -0.2, 0.42], [0.28, 0.16, 0.5], [-0.12, 0.4, 0.34]];
    maria.forEach(function (m) {
      o.beginPath(); o.ellipse(cx + R * m[0], cy + R * m[1], R * m[2], R * m[2] * 0.78, rnd(0, 3), 0, Math.PI * 2);
      o.fillStyle = 'rgba(66,66,74,0.38)'; o.fill();
    });
    /* craters with lit rims */
    for (var i = 0; i < 16; i++) {
      var crx = cx + rnd(-R * 0.82, R * 0.82), cry = cy + rnd(-R * 0.82, R * 0.82);
      if ((crx - cx) * (crx - cx) + (cry - cy) * (cry - cy) > R * R * 0.86) continue;
      var cr = rnd(4, 14);
      o.beginPath(); o.arc(crx, cry, cr, 0, Math.PI * 2);
      o.fillStyle = 'rgba(40,40,46,0.42)'; o.fill();
      o.beginPath(); o.arc(crx - cr * 0.22, cry - cr * 0.22, cr * 0.82, 0, Math.PI * 2);
      o.fillStyle = 'rgba(220,220,226,0.14)'; o.fill();
    }
    o.restore();

    paintRim(o, cx, cy, R, '210,214,224', 0.22);
    paintTerminator(o, cx, cy, R, 0.85);   /* strong phase — airless body */

    return { img: oc, S: S, spin: 1 };
  })();

  var SPRITES = [
    { sp: spritePlanet,   frac: 0.44 },   /* fraction of sprite that is "visual body" for sizing */
    { sp: spriteAsteroid, frac: 0.66 },
    { sp: spriteMoon,     frac: 0.72 }
  ];

  var flyer = null;
  var nextFlyerAt = Date.now() + rnd(11000, 17000);   /* first pass soon */
  /* the flyby shares the STARS' depth model: it travels in z from far to
     past-the-camera, so it emerges tiny from the vanishing point (centre),
     grows and drifts outward as it approaches — same direction as the dust
     stars → real 3D cohesion. */
  var FLY_Z0 = 780, FLY_ZE = -140;

  function spawnFlyer() {
    var pick = SPRITES[(Math.random() * SPRITES.length) | 0];
    var sp = pick.sp;
    /* visual body diameter AT s=1 (z=0). Actual size = this × perspective
       scale, so it starts small (deep) and passes large (near). */
    var baseBody = (sp === spritePlanet ? Math.min(W, H) * 0.22
                  : sp === spriteMoon   ? Math.min(W, H) * 0.15
                  :                       Math.min(W, H) * 0.11) * rnd(0.85, 1.15);
    var cross = rnd(28, 44);            /* seconds to travel the whole depth */
    flyer = {
      sp: sp, frac: pick.frac, baseBody: baseBody,
      ox: (Math.random() < 0.5 ? -1 : 1) * rnd(0.12, 0.5) * W,  /* world offset from centre (like a star's x-cx) */
      oy: (Math.random() < 0.5 ? -1 : 1) * rnd(0.10, 0.5) * H,
      z: FLY_Z0, vz: (FLY_Z0 - FLY_ZE) / (cross * 60),
      ang: rnd(0, Math.PI * 2),
      spin: sp.spin ? rnd(-0.0016, 0.0016) : 0,
      alpha: sp === spritePlanet ? 0.9 : 0.96
    };
  }

  var meteor = null;

  /* ── frame pacing ──
     Cap the ambient animation at 30fps: it's a slow drifting backdrop, so
     30fps looks smooth while leaving plenty of GPU/main-thread budget for
     the compositor to scroll at the display's native refresh. The animation
     keeps running continuously during scroll (no freeze). */
  var FRAME_MS = 1000 / 30, lastFrame = 0;

  function draw(now) {
    RAF = requestAnimationFrame(draw);
    var elapsed = now - lastFrame;
    if (elapsed < FRAME_MS) return;               /* 30fps cap */
    lastFrame = now;
    var dt = elapsed / 16.6667;                    /* real elapsed → constant speed */
    if (dt > 4) dt = 4;                            /* clamp after stalls */
    render(dt);
  }

  function render(dt) {
    ctx.clearRect(0, 0, W, H);
    var t = Date.now() / 1000;

    /* ── flyby body — same 3D depth flow as the stars (emerges from the
       vanishing point, grows + drifts outward, passes the camera) ── */
    if (!flyer && Date.now() > nextFlyerAt) spawnFlyer();
    if (flyer) {
      var fsc = PERSP / (PERSP + flyer.z);
      var fx = W / 2 + flyer.ox * fsc;
      var fy = H / 2 + flyer.oy * fsc;
      var fprog = (FLY_Z0 - flyer.z) / (FLY_Z0 - FLY_ZE);
      var fpf = Math.max(0, Math.min(1, fprog / 0.12, (1 - fprog) / 0.15));
      var fdw = (flyer.baseBody / flyer.frac) * fsc;
      ctx.save();
      ctx.globalAlpha = flyer.alpha * fpf;
      ctx.translate(fx, fy);
      if (flyer.spin) ctx.rotate(flyer.ang);
      ctx.drawImage(flyer.sp.img, -fdw / 2, -fdw / 2, fdw, fdw);
      ctx.restore();
      flyer.z -= flyer.vz * dt;
      flyer.ang += flyer.spin * dt;
      if (fprog >= 1) {
        flyer = null;
        nextFlyerAt = Date.now() + rnd(60000, 105000);   /* ~1-1.75 min */
      }
    }

    /* ── stars ── */
    var cx = W / 2, cy = H / 2;
    var i, n, s, twinkle, a, gr, fs;
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      s = PERSP / (PERSP + n.z);
      n.px = cx + (n.x - cx) * s;
      n.py = cy + (n.y - cy) * s;
      n.fade = Math.min(1, (n.z - Z_NEAR) / 90, (Z_FAR - n.z) / 140);

      twinkle = 0.68 + 0.32 * Math.sin(t * n.tw + n.pulse);
      a = twinkle * (0.30 + 0.70 * Math.min(1, s)) * n.fade;

      if (a > 0.015) {
        gr = n.r * 6 * s;
        ctx.globalAlpha = Math.min(1, a);
        ctx.drawImage(n.fam.sprite, n.px - gr, n.py - gr, gr * 2, gr * 2);
        if (n.hero) {
          fs = n.r * 11 * s * (0.8 + 0.35 * twinkle);
          ctx.globalAlpha = Math.min(1, a * 0.85);
          ctx.drawImage(flareSprite, n.px - fs, n.py - fs, fs * 2, fs * 2);
        }
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(n.px, n.py, Math.max(0.4, n.r * s * (0.75 + 0.25 * twinkle)), 0, Math.PI * 2);
        ctx.fillStyle = n.fam.core + Math.min(1, 0.85 * a + 0.1) + ')';
        ctx.fill();
      }

      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.z -= n.vz * dt;
      if (n.z < Z_NEAR) { n.z = Z_FAR; n.x = Math.random() * W; n.y = Math.random() * H; }
      if (n.x < -20) n.x = W + 20; else if (n.x > W + 20) n.x = -20;
      if (n.y < -20) n.y = H + 20; else if (n.y > H + 20) n.y = -20;
    }

    /* ── shooting star ── */
    if (!meteor && Math.random() < 0.0065 * dt) {
      meteor = {
        x: W * 0.15 + Math.random() * W * 0.7,
        y: Math.random() * H * 0.5,
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
      ctx.strokeStyle = mg; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(meteor.x, meteor.y); ctx.lineTo(tailX, tailY); ctx.stroke();
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      meteor.life -= 0.025 * dt;
      if (meteor.life <= 0) meteor = null;
    }
  }

  function start() { if (running) return; running = true; lastFrame = 0; RAF = requestAnimationFrame(draw); }
  function stop() { running = false; cancelAnimationFrame(RAF); }

  var _lastW = window.innerWidth, _rzT;
  window.addEventListener('resize', function () {
    clearTimeout(_rzT);
    _rzT = setTimeout(function () {
      var widthChanged = window.innerWidth !== _lastW;
      _lastW = window.innerWidth;
      resize();
      if (widthChanged) createNodes();
      if (!running && !document.hidden) start();
    }, 150);
  });

  window.addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  resize();
  createNodes();
  start();
})();
