/* ═══════════════════════════════════════════════════════
   Кабина DA 40 NG «на стоянке»: питание включено, двигатель не запущен
   ═══════════════════════════════════════════════════════
   В модели салона экраны G1000 — пустые светящиеся прямоугольники (в MSFS
   на них рисует симулятор). Здесь на них — кадры самого G1000 из MSFS 2024
   (WTG1000), отрисованные стендом Desktop\x\DA-40\g1000_capture: родной
   код приборов, panel.xml и плагины модели DA40NG, шрифты MSFS.
   Самолёт стоит в Баратаевке (UWLL), на стоянке малой авиации к востоку от
   ВПП 03/21: на карте MFD — аэродром UWLL (стенд отдаёт приборам аэродромы
   из OurAirports, make_navdb.py). Полосу G1000 сам не рисует — в MSFS её
   видно только на подложке местности, а её рисует движок симулятора.
   Состояние — предполётная проверка: аккумулятор и авионика включены,
   ENGINE MASTER включён (ECU под током), двигатель не запущен. Поэтому на
   CAS горят FUEL PRES, ALTN FAIL, OIL PRESS и PITOT HT OFF — по условиям
   panel.xml модели. Кадры: models/da40/g1000-pfd.webp и g1000-mfd.webp
   (обновить: node capture.js на стенде).

   Свет — «ламповый» вечерний: подсветка приборов (dimmer), тёплый поток от
   козырька на доску и плафон салона. Cockpit.live(THREE, scene, opts)
   вызывается из figures.js до разбора материалов слоя «Салон». */
(function () {
  'use strict';
  var SRC = { pfd: 'models/da40/g1000-pfd.webp', mfd: 'models/da40/g1000-mfd.webp' };

  function screenTex(THREE, kind, withV) {
    var t = new THREE.TextureLoader().load(withV ? withV(SRC[kind]) : SRC[kind]);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  /* Развёртка экрана: у прямоугольника в модели её нет — u вправо (к
     правому борту), v вверх по экрану. */
  function screenUV(THREE, mesh, right) {
    var g = mesh.geometry, pos = g.attributes.position, n = pos.count, w = new THREE.Vector3();
    mesh.updateMatrixWorld(true);
    /* Координаты в файле сжаты (meshopt, целые со знаком): figures.js
       переводит их в метры позже, при разборе слоя. Здесь делим сами,
       иначе размеры экрана (для ореола) выходят в тысячах метров. */
    var arr = pos.isInterleavedBufferAttribute ? pos.data.array : pos.array;
    var q = pos.normalized ? ({ Int8Array: 127, Uint8Array: 255, Int16Array: 32767, Uint16Array: 65535 })[arr.constructor.name] || 1 : 1;
    var P = [], c = new THREE.Vector3();
    for (var i = 0; i < n; i++) { w.fromBufferAttribute(pos, i).multiplyScalar(1 / q).applyMatrix4(mesh.matrixWorld); P.push(w.clone()); c.add(w); }
    c.multiplyScalar(1 / n);
    /* нормаль экрана и «вверх» в его плоскости */
    var nrm = new THREE.Vector3().subVectors(P[1], P[0]).cross(new THREE.Vector3().subVectors(P[2], P[0])).normalize();
    var R = right.clone().sub(nrm.clone().multiplyScalar(right.dot(nrm))).normalize();
    var Up = new THREE.Vector3().crossVectors(nrm, R).normalize();
    if (Up.y < 0) Up.negate();
    var us = P.map(function (p) { return p.clone().sub(c).dot(R); }), vs = P.map(function (p) { return p.clone().sub(c).dot(Up); });
    var u0 = Math.min.apply(null, us), u1 = Math.max.apply(null, us), v0 = Math.min.apply(null, vs), v1 = Math.max.apply(null, vs);
    var uv = new Float32Array(n * 2);
    for (var k = 0; k < n; k++) { uv[k * 2] = (us[k] - u0) / (u1 - u0); uv[k * 2 + 1] = (vs[k] - v0) / (v1 - v0); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return { c: c, n: nrm, r: R, up: Up, w: u1 - u0, h: v1 - v0 };
  }

  /* Ореол: мягкое пятно света вокруг светящейся детали — так экран или
     лампа выглядят в темноте глазами и камерой (небольшой «glow», как на
     эталонном рендере из Blender). Канва — светлая рамка вокруг
     прямоугольника (k — доля ореола по краю), внутри почти пусто, чтобы
     не мылить текст на экране. Рисуется сложением, глубину не пишет. */
  var haloCache = {};
  function haloTex(THREE, k, inner) {
    var key = k + ':' + inner;
    if (haloCache[key]) return haloCache[key];
    var S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    var g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
    var a = 0.5 / (1 + 2 * k);   /* полуширина самого прямоугольника в долях канвы */
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var px = Math.abs((x + 0.5) / S - 0.5), py = Math.abs((y + 0.5) / S - 0.5);
      var dx = Math.max(0, px - a), dy = Math.max(0, py - a);
      var dist = Math.sqrt(dx * dx + dy * dy) / (0.5 - a);
      var v = dist === 0 ? inner : Math.exp(-dist * dist * 5) * (1 - dist);
      var i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.round(255 * Math.max(0, v));
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(c);
    return (haloCache[key] = t);
  }
  function halo(THREE, scene, at, n, w, h, color, strength, k) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w * (1 + 2 * k), h * (1 + 2 * k)),
      new THREE.MeshBasicMaterial({ map: haloTex(THREE, k, 0.06), color: color, transparent: true,
        opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.position.copy(at);
    m.lookAt(at.clone().add(n));
    m.renderOrder = 5;
    m.raycast = function () {};
    m.name = 'glow';
    scene.add(m);
    return m;
  }

  function live(THREE, scene, opts) {
    opts = opts || {};
    scene.updateMatrixWorld(true);
    var byName = {};
    scene.traverse(function (o) { if (o.name) byName[o.name] = o; });
    function find(re) { var out = []; scene.traverse(function (o) { if (o.isMesh && re.test(chain(o))) out.push(o); }); return out; }
    function chain(o) { var s = ''; for (var p = o; p; p = p.parent) s += ' ' + (p.name || ''); return s; }

    /* экраны: PFD слева (у командира), MFD справа */
    var s1 = find(/AS1000_PFD_Screen_1/)[0], s2 = find(/AS1000_PFD_Screen_2/)[0];
    if (s1 && s2) {
      var p1 = s1.getWorldPosition(new THREE.Vector3()), p2 = s2.getWorldPosition(new THREE.Vector3());
      var right = p2.clone().sub(p1).normalize();
      var scr = [];
      var dome0 = byName.CABLIGHTB || find(/CABLIGHTB/)[0];
      var seat = dome0 ? dome0.getWorldPosition(new THREE.Vector3()) : null;
      [[s1, 'pfd'], [s2, 'mfd']].forEach(function (x) {
        var f = screenUV(THREE, x[0], right);
        /* ореол экрана: нормаль — к креслам (к плафону), чуть перед стеклом */
        if (seat && seat.clone().sub(f.c).dot(f.n) < 0) f.n.negate();
        var at = scene.worldToLocal(f.c.clone().add(f.n.clone().multiplyScalar(0.004)));
        var nl = scene.worldToLocal(f.c.clone().add(f.n)).sub(scene.worldToLocal(f.c.clone())).normalize();
        f.kind = x[1]; scr.push(f);
        /* ореол — цветом штатного отсвета G1000 (LIGHT_COWS_GARMIN) */
        halo(THREE, scene, at, nl, f.w, f.h, LAMP.garmin.lens, 0.42, 0.3);
        var m = x[0].material = x[0].material.clone();
        m.color && m.color.set(0x000000);
        m.map = null;
        m.emissive && m.emissive.set(0xffffff);
        m.emissiveMap = screenTex(THREE, x[1], opts.withV);
        shown[x[1]] = m;
        m.emissiveIntensity = 1.0;
        m.roughness = 0.25; m.metalness = 0;
        m.needsUpdate = true;
      });
    }
    /* подсветка надписей и шкал доски (дим) — тёплая, неяркая */
    find(/./).forEach(function (o) {
      var m = o.material;
      if (!m || Array.isArray(m)) return;
      if (m.name === 'COCKPITLIT') { m.emissiveIntensity = 1.25; }
    });
    /* лампы положения закрылков: на стоянке закрылки убраны — горит UP */
    [1, 2, 3].forEach(function (k) {
      find(new RegExp('light_flaps_' + k)).forEach(function (o) {
        o.material = o.material.clone();
        o.material.emissiveIntensity = k === 1 ? 2.2 : 0.15;
      });
    });
    /* Свет в кабине — только штатный, как в модели COWS DA40 NG для MSFS
       (systems.cfg, [LIGHTS], и файлы Effects/LIGHT_COWS_*.fx): цвет,
       дальность и направление каждой лампы взяты оттуда.
         плафоны (CockpitSpot, тип 10, три шт.) — RGB 100,60,40, дальность 1,7 м
         заливка из-под козырька (Glareshield, четыре) — 20,255,255, альфа 10, 0,4 м, вниз 15°
         отсвет экранов G1000 (GARMIN, два) — 100,150,255, 0,6 м, назад и вниз 10°
         подсветка компаса (Compass, три) — 100,60,40, 0,1 м
       Положения в systems.cfg — футы от опорной точки COWS (вперёд, вправо,
       вверх). Переводим их в нашу модель по экранам: середина PFD и MFD —
       это середина ламп GARMIN, «вправо» — от PFD к MFD (у COWS между ними
       1,25 фута = 0,38 м, у нас 0,36 м — модели сходятся). Лампы G1000 стоят
       перед стеклом: к креслам на 0,12 м (так плафон COWS ложится на наш
       CABLIGHTB). Плафоны ставим прямо в свои светильники CABLIGHTL/R/B. */
    if (!s1 || !s2) return;
    var up = new THREE.Vector3(0, 1, 0);
    var aft = scr[0].n.clone().add(scr[1].n).setY(0).normalize();      /* от доски к креслам */
    var fwd = aft.clone().negate(), rgt = right.clone().setY(0).normalize();
    var mid = scr[0].c.clone().add(scr[1].c).multiplyScalar(0.5).add(aft.clone().multiplyScalar(0.12));
    var FT = 0.3048, G0 = [-1.60, -0.175, 1.45];
    function at(L, Y, Z) {
      return mid.clone().add(fwd.clone().multiplyScalar((L - G0[0]) * FT))
        .add(rgt.clone().multiplyScalar((Y - G0[1]) * FT)).add(up.clone().multiplyScalar((Z - G0[2]) * FT));
    }
    /* LocalRotation: тангаж (+ вниз), крен, курс (+ вправо); 0 — вперёд по полёту */
    function dir(p, h) {
      p *= Math.PI / 180; h *= Math.PI / 180;
      return fwd.clone().multiplyScalar(Math.cos(h)).add(rgt.clone().multiplyScalar(Math.sin(h)))
        .multiplyScalar(Math.cos(p)).add(up.clone().multiplyScalar(-Math.sin(p))).normalize();
    }
    /* лампы — из заранее заведённых (pool, в мировых координатах сцены
       просмотра), иначе новые в слое салона */
    var P = opts.pool;
    function place(l, pos, d) {
      if (l.parent === scene) { l.position.copy(scene.worldToLocal(pos.clone())); if (d) l.target.position.copy(scene.worldToLocal(pos.clone().add(d))); }
      else { l.position.copy(l.parent.worldToLocal(pos.clone())); if (d) l.target.position.copy(l.parent.worldToLocal(pos.clone().add(d))); }
      if (d) l.target.updateMatrixWorld();
    }
    function lamp(L, pos, d, angle, name) {
      var sp = P && P.spot.length ? P.spot.shift() : null;
      if (!sp) { sp = new THREE.SpotLight(); scene.add(sp); scene.add(sp.target); }
      sp.color.setHex(L.hex); sp.intensity = L.k * K; sp.distance = L.range; sp.angle = angle; sp.penumbra = 0.7; sp.decay = 2;
      sp.name = name;
      place(sp, pos, d);
      return sp;
    }
    function point(L, pos, name) {
      var pl = P && P.point.length ? P.point.shift() : null;
      if (!pl) { pl = new THREE.PointLight(); scene.add(pl); }
      pl.color.setHex(L.hex); pl.intensity = L.k * K; pl.distance = L.range; pl.decay = 2;
      pl.name = name;
      place(pl, pos, null);
    }
    /* ореол линзы горящего плафона (CockpitSpotSurface: дальность 0,15 м) */
    function lens(pos) {
      var g = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(THREE, 0.45, 1), color: LAMP.spot.lens,
        transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      g.position.copy(scene.worldToLocal(pos.clone()));
      g.scale.set(0.12, 0.12, 1);
      g.raycast = function () {};
      g.name = 'glow';
      scene.add(g);
    }

    /* плафоны: 1 и 2 — над передними креслами, 3 — задний; линзы светятся цветом лампы */
    /* имена светильников в нашей модели не совпадают со сторонами COWS: по
       координатам лампа 1 (левее, −0,313 фута) — это наш CABLIGHTR, лампа 2
       (у оси) — CABLIGHTL */
    var spots = [[1, 'CABLIGHTR', -4.34, -0.313, 2.89, 45, 10], [2, 'CABLIGHTL', -4.34, 0.031, 2.89, 35, -10], [3, 'CABLIGHTB', -5.0, 0, 2.90, 60, 0]];
    find(/CABLIGHT[BLR]/).forEach(function (o) {
      o.material = o.material.clone();
      if (o.material.emissive) { o.material.emissive.setHex(LAMP.spot.lens); o.material.emissiveIntensity = 1.6; }
    });
    spots.forEach(function (q) {
      if (opts.lite && q[0] !== 3) return;                 /* на телефоне — только задний */
      var m = byName[q[1]] || find(new RegExp(q[1]))[0];
      var pos = m ? m.getWorldPosition(new THREE.Vector3()).add(up.clone().multiplyScalar(-0.03)) : at(q[2], q[3], q[4]);
      lamp(LAMP.spot, pos, dir(q[5], q[6]), Math.PI / 3.2, 'cabin-spot-' + q[0]);
      lens(pos);
    });
    /* заливка из-под козырька: четыре лампы попарно (у телефона — одна по центру) */
    var gl = opts.lite ? [[0, 2.135, 0]] : [[-0.42, 2.135, -3.5], [0.42, 2.135, 3.5]];
    gl.forEach(function (q, i) {
      lamp(LAMP.glare, at(-1.74, q[0], q[1]), dir(15, q[2]), Math.PI / (opts.lite ? 2.2 : 2.6), 'glareshield-flood-' + i);
    });
    /* отсвет экранов G1000 на кабину: назад и вниз на 10° */
    (opts.lite ? [[-0.175]] : [[-0.80], [0.45]]).forEach(function (q, i) {
      lamp(LAMP.garmin, at(-1.60, q[0], 1.45), dir(10, 180), Math.PI / 2.4, 'g1000-spill-' + i);
    });
    /* подсветка компаса */
    if (!opts.lite) point(LAMP.compass, at(-1.78, 0.634, 1.89), 'compass-light');
  }

  /* Лампы COWS: цвет — RGB из .fx (в долях), k — Intensity × A/255
     (альфа цвета в .fx — доля яркости: у заливки козырька она 10, лампа
     едва светит), range — Range, м. K — общий перевод яркости MSFS
     в яркость сцены three.js, один на все лампы, чтобы соотношения между
     ними остались как в модели. */
  var K = 60;
  function lampDef(r, g, b, a, k, range) {
    k *= a / 255;
    var c = { r: r / 255, g: g / 255, b: b / 255 }, mx = Math.max(c.r, c.g, c.b);
    return { hex: (Math.round(c.r * 255) << 16) | (Math.round(c.g * 255) << 8) | Math.round(c.b * 255),
      lens: (Math.round(c.r / mx * 255) << 16) | (Math.round(c.g / mx * 255) << 8) | Math.round(c.b / mx * 255), k: k, range: range };
  }
  var LAMP = {
    spot: lampDef(100, 60, 40, 255, 0.7, 1.7),
    glare: lampDef(20, 255, 255, 10, 0.3, 0.4),
    garmin: lampDef(100, 150, 255, 255, 0.3, 0.6),
    compass: lampDef(100, 60, 40, 255, 3, 0.1)
  };

  /* Погашенные лампы на всю кабину — столько же, сколько зажжёт live():
     на телефоне три плафона/заливки/отсвета (см. выше), на компьютере семь
     прожекторов и точечная у компаса. */
  function pool(THREE, scene, lite) {
    var P = { spot: [], point: [] }, n = lite ? 3 : 7;
    for (var i = 0; i < n; i++) {
      var sp = new THREE.SpotLight(0xffffff, 0, 1, Math.PI / 3, 0.7, 2);
      scene.add(sp); scene.add(sp.target);
      P.spot.push(sp);
    }
    if (!lite) { var pl = new THREE.PointLight(0xffffff, 0, 0.1, 2); scene.add(pl); P.point.push(pl); }
    return P;
  }

  /* Экраны кабины повторяют прибор на странице (g1000.js): нажали кнопку —
     на экран PFD или MFD ложится тот же снимок. Слушатель один на страницу,
     материалы — последнего загруженного салона. */
  var shown = {};
  window.addEventListener('g1000:screen', function (e) {
    var m = shown[e.detail.kind], THREE = window.THREE;
    if (!m || !THREE) return;
    new THREE.TextureLoader().load(e.detail.src, function (t) {
      t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
      if (m.emissiveMap) m.emissiveMap.dispose();
      m.emissiveMap = t;
      m.needsUpdate = true;
      window.dispatchEvent(new Event('g1000:redraw'));
    });
  });

  window.Cockpit = { live: live, pool: pool };
})();
