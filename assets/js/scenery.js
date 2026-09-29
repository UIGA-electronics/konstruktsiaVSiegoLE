/* Окружение для 3D-моделей.

   Scenery.apron — перрон аэродрома Баратаевка (Ульяновск): бетонные плиты,
   жёлтая осевая линия заруливания, трава за краем перрона, по горизонту
   лесополоса, аэровокзал с буквами «УЛЬЯНОВСК», КДП, ангары и Ту-144
   у музея гражданской авиации. Всё рисуется на canvas при открытии
   страницы: ни одной картинки грузить не надо.

   Scenery.studio — тёмный фон мастерской для отдельных механизмов.

   Размеры задаются в долях габарита модели r (у DA 40 r ≈ 12 м — размах),
   поэтому одна и та же сцена подходит к любому самолёту. */
(function () {
  'use strict';

  /* Детерминированный генератор: рисунок плит и деревьев не меняется
     от загрузки к загрузке. */
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function tex(THREE, c, rep) {
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    if (rep) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep[0], rep[1]);
    }
    return t;
  }

  var HORIZON = '#dfe3dc';

  /* ── Небо: равнопромежуточная развёртка, верх — зенит ─────────── */
  function skyCanvas() {
    var W = 2048, H = 1024, c = canvas(W, H), g = c.getContext('2d');
    var sky = g.createLinearGradient(0, 0, 0, H / 2);
    sky.addColorStop(0, '#4f7fb6');
    sky.addColorStop(0.45, '#86a9cf');
    sky.addColorStop(0.8, '#c3d3de');
    sky.addColorStop(1, HORIZON);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H / 2);
    /* ниже горизонта — земля: в отражениях снизу должен быть бетон и трава */
    var gr = g.createLinearGradient(0, H / 2, 0, H);
    gr.addColorStop(0, '#c9cbc0');
    gr.addColorStop(0.08, '#9a998e');
    gr.addColorStop(1, '#6d6c63');
    g.fillStyle = gr;
    g.fillRect(0, H / 2, W, H / 2);

    /* солнце — там же, откуда светит основной источник (3, 5, 4) */
    var sx = 0.3524 * W, sy = 0.25 * H;
    g.save();
    g.translate(sx, sy); g.scale(1.41, 1);
    var sun = g.createRadialGradient(0, 0, 0, 0, 0, 170);
    sun.addColorStop(0, 'rgba(255,252,240,1)');
    sun.addColorStop(0.06, 'rgba(255,248,228,0.95)');
    sun.addColorStop(0.25, 'rgba(255,244,220,0.35)');
    sun.addColorStop(1, 'rgba(255,244,220,0)');
    g.fillStyle = sun;
    g.fillRect(-170, -170, 340, 340);
    g.restore();

    /* кучевые облака хорошей погоды — плоское основание, пухлый верх;
       к горизонту мельче и бледнее */
    var R = rng(7);
    for (var k = 0; k < 46; k++) {
      var cy = H * (0.18 + R() * 0.29);
      var near = (cy / (H / 2));                  /* 0 — зенит, 1 — горизонт */
      var cx = R() * W, sc = (1.25 - near) * (0.7 + R() * 0.8);
      var n = 5 + Math.floor(R() * 7), alpha = 0.55 - near * 0.25;
      for (var j = 0; j < n; j++) {
        var px = cx + (R() - 0.5) * 150 * sc, py = cy - R() * 26 * sc;
        var pr = (20 + R() * 34) * sc;
        var b = g.createRadialGradient(px, py - pr * 0.2, 0, px, py, pr);
        b.addColorStop(0, 'rgba(255,255,255,' + alpha + ')');
        b.addColorStop(0.6, 'rgba(250,251,252,' + alpha * 0.6 + ')');
        b.addColorStop(1, 'rgba(245,247,250,0)');
        g.fillStyle = b;
        g.beginPath(); g.ellipse(px, py, pr * 1.5, pr, 0, 0, Math.PI * 2); g.fill();
      }
      /* серое плоское донце */
      g.fillStyle = 'rgba(170,180,192,' + alpha * 0.28 + ')';
      g.beginPath(); g.ellipse(cx, cy + 6 * sc, 120 * sc, 9 * sc, 0, 0, Math.PI * 2); g.fill();
    }
    /* дымка у самого горизонта */
    var hz = g.createLinearGradient(0, H * 0.44, 0, H * 0.5);
    hz.addColorStop(0, 'rgba(223,227,220,0)');
    hz.addColorStop(1, HORIZON);
    g.fillStyle = hz;
    g.fillRect(0, H * 0.44, W, H * 0.06);
    return c;
  }

  /* ── Бетон перрона: 4×4 плиты на плитку текстуры ─────────────── */
  function concreteCanvas() {
    var S = 1024, c = canvas(S, S), g = c.getContext('2d'), R = rng(11);
    g.fillStyle = '#85837b';
    g.fillRect(0, 0, S, S);
    var cell = S / 4;
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j < 4; j++) {
        var v = Math.round((R() - 0.5) * 16);
        g.fillStyle = 'rgb(' + (132 + v) + ',' + (130 + v) + ',' + (122 + v) + ')';
        g.fillRect(i * cell, j * cell, cell, cell);
        /* пятна: следы шин, масло, заплатки */
        for (var k = 0; k < 3; k++) {
          if (R() < 0.45) continue;
          var ex = i * cell + R() * cell, ey = j * cell + R() * cell, er = 10 + R() * 50;
          var sp = g.createRadialGradient(ex, ey, 0, ex, ey, er);
          sp.addColorStop(0, 'rgba(60,58,52,' + (0.05 + R() * 0.1) + ')');
          sp.addColorStop(1, 'rgba(60,58,52,0)');
          g.fillStyle = sp;
          g.fillRect(ex - er, ey - er, er * 2, er * 2);
        }
      }
    }
    /* зерно */
    var img = g.getImageData(0, 0, S, S), d = img.data;
    for (var p = 0; p < d.length; p += 4) {
      var n = (R() - 0.5) * 22;
      d[p] += n; d[p + 1] += n; d[p + 2] += n;
    }
    g.putImageData(img, 0, 0);
    /* швы с герметиком и сколы по краям */
    g.strokeStyle = 'rgba(62,60,55,0.6)';
    g.lineWidth = 2;
    for (var s = 0; s <= 4; s++) {
      g.beginPath(); g.moveTo(s * cell, 0); g.lineTo(s * cell, S); g.stroke();
      g.beginPath(); g.moveTo(0, s * cell); g.lineTo(S, s * cell); g.stroke();
    }
    g.strokeStyle = 'rgba(210,208,200,0.35)';
    g.lineWidth = 1;
    for (s = 0; s <= 4; s++) {
      g.beginPath(); g.moveTo(s * cell + 2.5, 0); g.lineTo(s * cell + 2.5, S); g.stroke();
      g.beginPath(); g.moveTo(0, s * cell + 2.5); g.lineTo(S, s * cell + 2.5); g.stroke();
    }
    /* тонкие трещины */
    g.strokeStyle = 'rgba(70,68,62,0.35)';
    for (k = 0; k < 14; k++) {
      var x = R() * S, y = R() * S;
      g.beginPath(); g.moveTo(x, y);
      for (var q = 0; q < 6; q++) { x += (R() - 0.5) * 40; y += (R() - 0.3) * 30; g.lineTo(x, y); }
      g.stroke();
    }
    return c;
  }

  function grassCanvas() {
    var S = 512, c = canvas(S, S), g = c.getContext('2d'), R = rng(5);
    g.fillStyle = '#66703f';
    g.fillRect(0, 0, S, S);
    var cols = ['#5f6a3b', '#7b8350', '#84804f', '#667140', '#737a4a'];
    for (var k = 0; k < 2600; k++) {
      g.fillStyle = cols[k % cols.length];
      g.globalAlpha = 0.25 + R() * 0.4;
      var x = R() * S, y = R() * S, rr = 1 + R() * 5;
      g.beginPath(); g.ellipse(x, y, rr * 1.6, rr, R() * 3, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    return c;
  }

  /* ── Горизонт: круговая панорама ───────────────────────────────
     Холст 4096×512 на цилиндре радиусом BR и высотой BH. Рисуем в метрах
     панорамы: X(м) по окружности, Y(м) вверх от земли. u — доля оборота,
     слева направо, как видит зритель из центра. */
  function horizonCanvas(BR, BH, lift) {
    var W = 4096, H = 512, c = canvas(W, H), g = c.getContext('2d'), R = rng(3);
    var mx = W / (2 * Math.PI * BR), my = H / BH;         /* пикселей на метр */
    var base = H - lift * my;                              /* линия земли на холсте */
    function X(u) { return u * W; }
    function Y(m) { return base - m * my; }
    function box(u, w, h0, h1, col) {
      g.fillStyle = col;
      g.fillRect(X(u) - w * mx / 2, Y(h1), w * mx, (h1 - h0) * my);
    }

    /* дальний лес: в два ряда, дальний бледнее */
    [['#8c9a8a', 1.0, 11, 7], ['#62725d', 0.85, 8, 6]].forEach(function (row, ri) {
      g.fillStyle = row[0];
      for (var x = -20; x < W + 20; x += 4 + R() * 7) {
        var hh = row[2] + R() * row[3];
        if (ri === 1 && R() < 0.08) { x += 30 + R() * 90; continue; }   /* просеки */
        var cw = (3 + R() * 5) * mx;
        g.beginPath();
        g.ellipse(x, Y(hh * 0.62), cw, hh * 0.42 * my, 0, 0, Math.PI * 2);
        g.fill();
        g.fillRect(x - cw, Y(hh * 0.62), cw * 2, hh * 0.62 * my + 4);
      }
    });

    /* ангары: арочные, с рёбрами, у ворот светлее */
    [[0.265, 58, 15], [0.305, 46, 13]].forEach(function (a) {
      var u = a[0], w = a[1], hh = a[2], cx = X(u), hw = w * mx / 2;
      g.fillStyle = '#9aa3a8';
      g.beginPath();
      g.moveTo(cx - hw, Y(0));
      g.lineTo(cx - hw, Y(hh * 0.55));
      g.quadraticCurveTo(cx, Y(hh * 1.35), cx + hw, Y(hh * 0.55));
      g.lineTo(cx + hw, Y(0));
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(80,90,96,0.35)'; g.lineWidth = 1;
      for (var i = 1; i < 12; i++) {
        var xx = cx - hw + i * (2 * hw / 12);
        g.beginPath(); g.moveTo(xx, Y(0)); g.lineTo(xx, Y(hh * 0.8)); g.stroke();
      }
      box(u, w * 0.7, 0, hh * 0.55, '#7f8a91');
      g.fillStyle = 'rgba(40,46,50,0.35)';
      g.fillRect(cx - 0.02 * hw, Y(hh * 0.55), 0.04 * hw, hh * 0.55 * my);
    });

    /* аэровокзал: длинный двухэтажный корпус, в середине объём выше,
       на крыше буквы «УЛЬЯНОВСК» */
    var tu = 0.39;
    box(tu, 120, 0, 9, '#c8c4b8');
    box(tu, 120, 3.2, 6.4, '#6f7d86');                      /* лента окон */
    box(tu, 120, 8.4, 9.2, '#b1ada2');                      /* парапет */
    box(tu, 34, 0, 15, '#d3cfc3');
    box(tu, 30, 2.4, 13, '#7a8993');                        /* витраж */
    g.strokeStyle = 'rgba(205,210,212,0.7)'; g.lineWidth = 1;
    for (var i = 0; i <= 12; i++) {
      var vx = X(tu) - 15 * mx + i * 30 * mx / 12;
      g.beginPath(); g.moveTo(vx, Y(2.4)); g.lineTo(vx, Y(13)); g.stroke();
    }
    for (i = 0; i <= 40; i++) {
      var wx = X(tu) - 60 * mx + i * 120 * mx / 40;
      if (Math.abs(wx - X(tu)) < 17 * mx) continue;
      g.beginPath(); g.moveTo(wx, Y(3.2)); g.lineTo(wx, Y(6.4)); g.stroke();
    }
    box(tu, 124, 0, 0.9, '#8f8b82');                        /* цоколь и тень */
    /* буквы на каркасе */
    g.fillStyle = '#9a9a96';
    g.fillRect(X(tu) - 15 * mx, Y(15.6), 30 * mx, 0.3 * my);
    g.save();
    g.translate(X(tu), Y(15.5));
    g.scale(mx / my, 1);                                    /* буквы в метрах: не растянуть по вертикали */
    g.fillStyle = '#b3342c';
    g.font = '700 ' + Math.round(3.4 * my) + 'px "PT Sans", "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText('УЛЬЯНОВСК', 0, 0);
    g.restore();

    /* командно-диспетчерский пункт */
    var ku = 0.438;
    box(ku, 7, 0, 26, '#cfcbbf');
    box(ku, 12, 26, 27, '#b8b4a9');
    box(ku, 11, 27, 31, '#3f4d56');
    g.strokeStyle = 'rgba(190,200,205,0.8)';
    for (i = 0; i <= 6; i++) {
      var kx = X(ku) - 5.5 * mx + i * 11 * mx / 6;
      g.beginPath(); g.moveTo(kx, Y(27)); g.lineTo(kx, Y(31)); g.stroke();
    }
    box(ku, 13, 31, 32, '#e4e1d8');
    box(ku, 0.4, 32, 40, '#8a8a88');
    box(ku + 0.0008, 1.4, 38.6, 39.2, '#b3342c');

    /* Ту-144 у музея гражданской авиации: вид сбоку */
    (function () {
      var u0 = 0.505, L = 65;
      function P(x, y) { return [X(u0) + (x - L / 2) * mx, Y(y)]; }
      g.fillStyle = '#e2e2dc';
      g.beginPath();
      var nose = P(0, 4.6), pts = [P(3, 5.6), P(10, 6.4), P(58, 6.4), P(64, 6.1), P(65, 5.4), P(60, 4.3), P(12, 4.1), P(4, 4.2)];
      g.moveTo(nose[0], nose[1]);
      pts.forEach(function (p) { g.lineTo(p[0], p[1]); });
      g.closePath(); g.fill();
      /* киль */
      g.beginPath();
      [P(47, 6.4), P(58, 12.6), P(62, 12.6), P(63.5, 6.3)].forEach(function (p, k) { k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
      g.closePath(); g.fill();
      /* крыло — тонкий клин, мотогондолы под ним */
      g.fillStyle = '#c9c9c2';
      g.beginPath();
      [P(22, 4.3), P(62, 4.3), P(60, 3.6), P(30, 3.9)].forEach(function (p, k) { k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
      g.closePath(); g.fill();
      g.fillStyle = '#9da09f';
      g.fillRect(X(u0) + 11 * mx, Y(3.8), 22 * mx, 1.3 * my);
      /* полоса по борту */
      g.fillStyle = '#3d5f93';
      g.fillRect(X(u0) - 26 * mx, Y(5.25), 50 * mx, 0.3 * my);
      /* стойки шасси */
      g.fillStyle = '#6d6f70';
      [8, 36, 44].forEach(function (x) { g.fillRect(X(u0) + (x - L / 2) * mx, Y(3.8), 0.9 * mx, 3.8 * my); });
    })();

    /* мачты освещения перрона */
    [0.2, 0.34, 0.47, 0.57, 0.66, 0.95].forEach(function (u) {
      box(u, 0.6, 0, 24, '#7d8185');
      box(u, 4.2, 24, 25.2, '#6d7175');
      g.fillStyle = '#f2efe4';
      for (var i = 0; i < 4; i++) g.fillRect(X(u) - 1.8 * mx + i * 1.1 * mx, Y(24.8), 0.7 * mx, 0.5 * my);
    });

    /* ближняя полоса травы и ограждение по периметру */
    g.fillStyle = '#7b8252';
    g.fillRect(0, Y(0.3), W, H - Y(0.3));
    g.strokeStyle = 'rgba(96,100,102,0.8)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, Y(2.2)); g.lineTo(W, Y(2.2)); g.stroke();
    g.strokeStyle = 'rgba(96,100,102,0.35)';
    g.beginPath(); g.moveTo(0, Y(1.3)); g.lineTo(W, Y(1.3)); g.stroke();
    for (var fx = 0; fx < W; fx += 3 * mx) {
      g.fillStyle = 'rgba(90,94,96,0.8)';
      g.fillRect(fx, Y(2.4), 1, 2.4 * my);
    }
    return c;
  }

  /* Полоса разметки по ломаной на земле: ширина w, высота над землёй y. */
  function ribbon(THREE, pts, w, y, mat) {
    var pos = [], idx = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      var dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      var nx = -dz / l * w / 2, nz = dx / l * w / 2;
      pos.push(pts[i][0] + nx, y, pts[i][1] + nz, pts[i][0] - nx, y, pts[i][1] - nz);
      if (i) { var k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    var m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    return m;
  }
  function arc(cx, cz, rad, a0, a1, n) {
    var out = [];
    for (var i = 0; i <= n; i++) {
      var t = a0 + (a1 - a0) * i / n;
      out.push([cx + Math.cos(t) * rad, cz + Math.sin(t) * rad]);
    }
    return out;
  }

  function apron(THREE, scene, renderer, r, gy) {
    var group = new THREE.Group();
    group.name = 'scenery';
    scene.add(group);
    scene.fog = new THREE.Fog(HORIZON, r * 9, r * 34);

    /* небо */
    var skyTex = tex(THREE, skyCanvas());
    var skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false });
    skyMat.toneMapped = false;
    var sky = new THREE.Mesh(new THREE.SphereGeometry(r * 30, 48, 24), skyMat);
    sky.renderOrder = -10;
    group.add(sky);

    /* отражения: то же небо и серая земля, свёрнутые PMREM */
    var envTex = null;
    if (THREE.PMREMGenerator) {
      var envScene = new THREE.Scene();
      var envMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
      envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), envMat));
      var pm = new THREE.PMREMGenerator(renderer);
      envTex = pm.fromScene(envScene, 0.02).texture;
      pm.dispose();
    }

    /* трава до горизонта */
    var aniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
    var grassTex = tex(THREE, grassCanvas(), [r * 3.2, r * 3.2]);
    grassTex.anisotropy = aniso;
    var grass = new THREE.Mesh(new THREE.CircleGeometry(r * 29, 64),
      new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, metalness: 0 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = gy - r * 0.004;
    grass.receiveShadow = true;
    group.add(grass);

    /* перрон: квадрат 9r × 9r, плита — около r/2 (≈ 6 м у DA 40) */
    var A = r * 9;
    var conTex = tex(THREE, concreteCanvas(), [A / (r * 2), A / (r * 2)]);
    conTex.anisotropy = aniso;
    var apronMat = new THREE.MeshStandardMaterial({ map: conTex, roughness: 0.92, metalness: 0 });
    var pad = new THREE.Mesh(new THREE.PlaneGeometry(A, A), apronMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, gy, -r * 1.2);
    pad.receiveShadow = true;
    group.add(pad);

    /* разметка: осевая линия заруливания подходит к носовому колесу
       с рулёжной дорожки перед самолётом, у колеса — стоп-линия */
    var yel = new THREE.MeshStandardMaterial({ color: 0xd89a0c, roughness: 0.75, metalness: 0, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    var wl = r * 0.014, y = gy + r * 0.0006;
    var zt = r * 2.9, rt = r * 0.9;
    var lead = [[0, r * 0.24]].concat([[0, zt - rt]]).concat(arc(-rt, zt - rt, rt, 0, Math.PI / 2, 16));
    group.add(ribbon(THREE, lead, wl, y, yel));
    group.add(ribbon(THREE, [[-A / 2, zt], [A / 2, zt]], wl, y, yel));
    group.add(ribbon(THREE, [[-r * 0.09, r * 0.24], [r * 0.09, r * 0.24]], wl * 2.2, y, yel));
    /* край перрона — сплошная двойная */
    var ez = -r * 1.2 + A / 2 - r * 0.05;
    [0, wl * 2.2].forEach(function (d) {
      group.add(ribbon(THREE, [[-A / 2, ez - d], [A / 2, ez - d]], wl * 0.8, y, yel));
    });

    /* горизонт */
    var BR = r * 17, BH = r * 3.4, lift = r * 0.05;
    var hTex = tex(THREE, horizonCanvas(BR, BH, lift));
    hTex.wrapS = THREE.RepeatWrapping;
    hTex.repeat.x = -1;                 /* изнутри цилиндра — чтобы надпись читалась */
    hTex.anisotropy = aniso;
    var hMat = new THREE.MeshBasicMaterial({ map: hTex, transparent: true, side: THREE.BackSide, depthWrite: false });
    hMat.toneMapped = false;
    var band = new THREE.Mesh(new THREE.CylinderGeometry(BR, BR, BH, 160, 1, true), hMat);
    band.position.y = gy - lift + BH / 2;
    band.renderOrder = -5;
    group.add(band);

    return envTex;
  }

  function studio(THREE) {
    var c = canvas(4, 512), g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#4a4f53');
    gr.addColorStop(0.62, '#2f3336');
    gr.addColorStop(1, '#232628');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 512);
    return tex(THREE, c);
  }

  window.Scenery = { apron: apron, studio: studio };
})();
