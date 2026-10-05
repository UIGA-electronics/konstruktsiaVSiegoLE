/* Окружение для 3D-моделей.

   Scenery.showroom — тёмный демонстрационный зал для самолёта: графитовый
   фон с мягким светом сверху, матовый пол с тонкой метровой сеткой, которая
   растворяется к краям, и тень под самолётом. Без нарисованных пейзажей:
   крупные растровые картинки в 3D всегда выглядят мыльно, а ровный градиент
   и тонкие линии остаются чёткими на любом экране.

   Scenery.studio — такой же тёмный фон для отдельных механизмов.

   Размеры задаются в долях габарита модели r (у DA 40 r ≈ 12 м — размах). */
(function () {
  'use strict';

  var BG_TOP = '#262a30', BG_MID = '#16191d', BG_LOW = '#0e1013';
  var FOG = 0x101215;

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
    gr.addColorStop(0, BG_TOP);
    gr.addColorStop(0.55, BG_MID);
    gr.addColorStop(1, BG_LOW);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    grain(g, W, H, 3);
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  /* Пол: тёмный круг, к краю уходит в цвет фона; поверх — сетка через
     1 м и более заметные линии через 5 м, тоже гаснут к краю. */
  /* На планшете и телефоне пол 1024: видеопамять там дороже резкости разметки. */
  var FLOOR_PX = (window.matchMedia && window.matchMedia('(hover: none)').matches) ? 1024 : 2048;
  function floorCanvas(R, meter) {
    var S = FLOOR_PX, c = canvas(S, S), g = c.getContext('2d'), h = S / 2;
    var gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(42,45,50,1)');
    gr.addColorStop(0.35, 'rgba(31,34,38,1)');
    gr.addColorStop(0.8, 'rgba(20,22,26,1)');
    gr.addColorStop(1, 'rgba(16,18,21,1)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    var px = S / (2 * R) * meter;                 /* пикселей на метр */
    var n = Math.ceil(h / px);
    for (var k = -n; k <= n; k++) {
      var major = k % 5 === 0;
      var x = h + k * px;
      g.strokeStyle = major ? 'rgba(170,178,188,0.12)' : 'rgba(150,158,168,0.055)';
      g.lineWidth = major ? 2 : 1;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke();
      g.beginPath(); g.moveTo(0, x); g.lineTo(S, x); g.stroke();
    }
    /* гасим сетку к краю: накладываем фон с радиальной прозрачностью */
    var fade = g.createRadialGradient(h, h, h * 0.25, h, h, h);
    fade.addColorStop(0, 'rgba(16,18,21,0)');
    fade.addColorStop(1, 'rgba(16,18,21,1)');
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
    scene.fog = new THREE.Fog(FOG, r * 2.2, r * 7);
    var R = r * 6;
    var t = new THREE.CanvasTexture(floorCanvas(R, meter));
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
    var floor = new THREE.Mesh(new THREE.CircleGeometry(R, 96),
      new THREE.MeshStandardMaterial({ map: t, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.25 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = gy;
    floor.receiveShadow = true;
    floor.name = 'scenery-floor';
    scene.add(floor);
    return roomEnv(THREE, renderer);
  }

  function studio(THREE) { return backdrop(THREE); }

  window.Scenery = { showroom: showroom, studio: studio };
})();
