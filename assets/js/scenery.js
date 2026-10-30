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

  /* r — габарит модели, gy — высота пола; meter — метр в единицах модели. */
  function showroom(THREE, scene, renderer, r, gy, meter) {
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
    return roomEnv(THREE, renderer);
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

  window.Scenery = { showroom: showroom, studio: studio, retheme: retheme, isDark: isDark };
})();
