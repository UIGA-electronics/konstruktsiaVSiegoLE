/* Окружение для 3D-моделей.

   Scenery.showroom — бесшовная студия серого бетона, как у фото машин в каталоге:
   серый фон средней светлоты без горизонта, пол того же тона уходит в фон, на полу —
   только мягкая тень от самолёта, без сетки. Белый самолёт читается формой
   и тенью, а цветом выделяются только системы. Без нарисованных пейзажей:
   крупные растровые картинки в 3D всегда выглядят мыльно.

   Scenery.studio — такой же светлый фон для отдельных механизмов.

   Размеры задаются в долях габарита модели r (у DA 40 r ≈ 12 м — размах). */
(function () {
  'use strict';

  /* Серый бетон средней светлоты: белый самолёт и цвет систем читаются
     на нём контрастом, а не теряются в белом (на почти белом фоне всё сливалось). */
  /* В тёмной теме — графит: белый самолёт на нём ещё контрастнее, а цвета
     систем остаются насыщенными. Палитра выбирается при каждой перекраске. */
  var PAL = {
    light: { top: '#d3d6db', mid: '#c6cad0', low: '#b9bec5', fog: 0xc2c6cc,
      f: ['rgba(220,223,227,1)', 'rgba(212,215,220,1)', 'rgba(198,202,208,1)', [194, 198, 204]], shadow: 0.32 },
    dark: { top: '#2b3039', mid: '#22262e', low: '#1a1d23', fog: 0x1f2228,
      f: ['rgba(58,63,72,1)', 'rgba(48,52,60,1)', 'rgba(36,39,45,1)', [31, 34, 40]], shadow: 0.5 }
  };
  function isDark() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function pal() { return PAL[isDark() ? 'dark' : 'light']; }

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* Лёгкое зерно против полос на градиентах тёмных тонов. */
  function grain(g, w, h, amount) {
    var img = g.getImageData(0, 0, w, h), d = img.data, s = 1234567;
    for (var i = 0; i < d.length; i += 4) {
      s = (s * 16807) % 2147483647;
      var n = ((s / 2147483647) - 0.5) * amount;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  }

  /* Фон кадра: вертикальный градиент, светлее у верха. */
  function backdrop(THREE) {
    var W = 16, H = 1024, c = canvas(W, H), g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, 0, H);
    var P = pal();
    gr.addColorStop(0, P.top);
    gr.addColorStop(0.55, P.mid);
    gr.addColorStop(1, P.low);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    grain(g, W, H, 3);
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  /* Пол: светлый круг, к краю незаметно уходит в цвет фона — горизонта нет.
     Сетки нет: на светлом полу её линии спорили бы с тонкими деталями систем. */
  /* На планшете и телефоне пол 1024: видеопамять там дороже резкости. */
  var FLOOR_PX = (window.matchMedia && window.matchMedia('(hover: none)').matches) ? 1024 : 2048;
  function floorCanvas() {
    var S = FLOOR_PX, c = canvas(S, S), g = c.getContext('2d'), h = S / 2;
    var P = pal().f, e = 'rgba(' + P[3].join(',') + ',';
    var gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, P[0]);
    gr.addColorStop(0.35, P[1]);
    gr.addColorStop(0.8, P[2]);
    gr.addColorStop(1, e + '1)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    /* край пола растворяем в фон */
    var fade = g.createRadialGradient(h, h, h * 0.25, h, h, h);
    fade.addColorStop(0, e + '0)');
    fade.addColorStop(1, e + '1)');
    g.fillStyle = fade;
    g.fillRect(0, 0, S, S);
    grain(g, S, S, 2.5);
    return c;
  }

  function roomEnv(THREE, renderer) {
    if (!THREE.RoomEnvironment || !THREE.PMREMGenerator) return null;
    var pm = new THREE.PMREMGenerator(renderer);
    var env = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    pm.dispose();
    return env;
  }

  /* Студийное окружение для отражений вместо RoomEnvironment: у той белые
     лампы-кубы и светлые стены — белая краска отражала их всем бортом и
     самолёт выглядел пересвеченным. Здесь тёмный зал, сверху — большой
     тёплый софтбокс (как свет под потолком ангара), сбоку — холодный
     контровой, спереди низко — слабый заполняющий. Блики мягкие, борт
     держит форму. */
  function studioEnv(THREE, renderer) {
    if (!THREE.PMREMGenerator) return null;
    var es = new THREE.Scene();
    var sph = new THREE.SphereGeometry(10, 32, 16), col = [], pos = sph.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i) / 10, c = y > 0 ? 0.10 + 0.16 * y : 0.10 + 0.07 * y;
      col.push(c, c * 1.02, c * 1.08);
    }
    sph.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    es.add(new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    function box(w, h, x, y, z, r, g, b) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      m.material.color.setRGB(r, g, b);
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      es.add(m);
    }
    box(9, 6, 1.5, 8.5, 2.5, 2.6, 2.45, 2.2);     /* потолочный софтбокс, тёплый */
    box(3, 6, -8.5, 2.5, -3, 0.9, 1.05, 1.3);     /* контровой, холодный */
    box(6, 1.5, 3, 1.2, 8.5, 0.5, 0.5, 0.52);     /* заполняющий спереди */
    var pm = new THREE.PMREMGenerator(renderer);
    var env = pm.fromScene(es, 0.02).texture;
    pm.dispose();
    es.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    return env;
  }

  /* Окружение, снятое в Blender: вечерний ангар (DA40 project/scripts/
     env_hangar.py → models/env/hangar.hdr, панорама 512×256 из Cycles).
     Тёплые потолочные лампы, бра у стены, холодные сумерки из ворот —
     от них рассеянный свет и блики на краске и стекле, как на эталонном
     рендере. Читаем в 8-битном RGBE: так PMREM работает и на телефонах
     без плавающих текстур. gain — сдвиг экспоненты, ×2 на единицу. */
  function hangarEnv(THREE, renderer, url, gain) {
    return new Promise(function (res, rej) {
      if (!THREE.RGBELoader || !THREE.PMREMGenerator) return rej(new Error('нет RGBELoader'));
      new THREE.RGBELoader().setDataType(THREE.UnsignedByteType).load(url, function (t) {
        var d = t.image && t.image.data;
        if (gain && d) for (var i = 3; i < d.length; i += 4) if (d[i]) d[i] = Math.max(1, Math.min(255, d[i] + gain));
        var pm = new THREE.PMREMGenerator(renderer);
        var env = pm.fromEquirectangular(t).texture;
        pm.dispose();
        t.dispose();
        res(env);
      }, null, rej);
    });
  }

  /* r — габарит модели, gy — высота пола; meter — метр в единицах модели. */
  /* noEnv — окружение уже есть (панорама ангара), студийную карту не считать */
  function showroom(THREE, scene, renderer, r, gy, meter, noEnv) {
    meter = meter || 1;
    scene.background = backdrop(THREE);
    scene.fog = new THREE.Fog(pal().fog, r * 2.2, r * 7);
    var R = r * 6;
    var t = new THREE.CanvasTexture(floorCanvas());
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
    /* Пол не освещается: освещённый светлый пол под ключевым светом
       выгорал в белый, и белый самолёт на нём пропадал. Цвет пола —
       ровно цвет текстуры, а тень ложится отдельной прозрачной плоскостью. */
    var floor = new THREE.Mesh(new THREE.CircleGeometry(R, 96),
      new THREE.MeshBasicMaterial({ map: t, fog: true }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = gy;
    floor.name = 'scenery-floor';
    scene.add(floor);
    var catcher = new THREE.Mesh(new THREE.CircleGeometry(R, 96),
      new THREE.ShadowMaterial({ opacity: pal().shadow }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = gy + meter * 0.002;
    catcher.receiveShadow = true;
    catcher.name = 'scenery-shadow';
    scene.add(catcher);
    scene.userData.scenery = { floor: floor, catcher: catcher };
    return noEnv ? null : (studioEnv(THREE, renderer) || roomEnv(THREE, renderer));
  }

  /* Перекраска при смене темы: фон, туман, пол и плотность тени. */
  function retheme(THREE, scene) {
    if (scene.background && scene.background.isTexture) {
      scene.background.dispose();
      scene.background = backdrop(THREE);
    }
    if (scene.fog) scene.fog.color.setHex(pal().fog);
    var sc = scene.userData.scenery;
    if (sc) {
      var t = new THREE.CanvasTexture(floorCanvas());
      t.encoding = THREE.sRGBEncoding;
      t.anisotropy = sc.floor.material.map ? sc.floor.material.map.anisotropy : 1;
      if (sc.floor.material.map) sc.floor.material.map.dispose();
      sc.floor.material.map = t;
      sc.floor.material.needsUpdate = true;
      sc.catcher.material.opacity = pal().shadow;
    }
  }

  function studio(THREE) { return backdrop(THREE); }

  window.Scenery = { showroom: showroom, studio: studio, retheme: retheme, isDark: isDark, hangar: hangarEnv };
})();
