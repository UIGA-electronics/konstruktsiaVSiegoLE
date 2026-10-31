/* ═══════════════════════════════════════════════════════════
   figures.js — интерактивные 2D-схемы (inline SVG).
   Каждая схема регистрируется по имени и вызывается из JSON
   блоком {"t":"figure","name":"booster"}.

   Когда появятся .glb-модели из GPT Astra 6, сюда же добавится
   рендер Three.js: имя фигуры «model3d» + путь к файлу в opts.
   Структура контента при этом не меняется.
   ═══════════════════════════════════════════════════════════ */
var Figures = (function () {
  'use strict';

  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var reg = {};

  /* Версия ресурсов берётся из ?v= этого скрипта в index.html и дописывается
     к адресам моделей и подписей: имя .glb при перестройке не меняется,
     и без метки браузер показывал бы модель из своего кеша. */
  var ASSET_V = (function () {
    var s = document.currentScript;
    var m = s && /[?&]v=([^&]+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  function withV(u) {
    return ASSET_V ? u + (u.indexOf('?') < 0 ? '?' : '&') + 'v=' + ASSET_V : u;
  }

  /* Схемы широкие: на узком экране они не сжимаются до нечитаемости,
     а прокручиваются вбок внутри своей рамки. */
  function svg(vb, inner) {
    /* Минимальная ширина — почти ширина viewBox: схема сжимается не больше
       чем на 12 %, подписи остаются читаемыми. Уже этого на телефоне
       появляется прокрутка вбок, а в колонке компьютера схема помещается. */
    var w = parseFloat(vb.split(/\s+/)[2]) || 520;
    return '<div class="figure-svg"><svg viewBox="' + vb +
      '" style="--minw:' + Math.round(w * 0.88) + 'px" ' +
      'role="img" preserveAspectRatio="xMidYMid meet">' + inner + '</svg></div>';
  }

  function controls(frame, html) {
    var c = document.createElement('div');
    c.className = 'fig-controls';
    c.innerHTML = html;
    frame.appendChild(c);
    fitText(frame);
    scrub(frame, c.querySelector('.fig-range'));
    return c;
  }

  /* Рисунок тянется пальцем или мышью: горизонтальный ход по схеме двигает
     главный ползунок. Клик по кнопке или поверхности (короче 5 px) остаётся
     кликом; вертикальный жест на телефоне прокручивает страницу. */
  function scrub(frame, range) {
    var svgEl = frame.querySelector('.figure-svg svg');
    if (!range || !svgEl) return;
    frame.classList.add('is-scrub');
    var x0 = null, v0 = 0, live = false, id = null;
    svgEl.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      x0 = e.clientX; v0 = +range.value; live = false; id = e.pointerId;
    });
    svgEl.addEventListener('pointermove', function (e) {
      if (x0 === null || e.pointerId !== id) return;
      var dx = e.clientX - x0;
      if (!live) {
        if (Math.abs(dx) < 5) return;
        live = true;
        try { svgEl.setPointerCapture(id); } catch (err) { /* указатель уже отпущен */ }
      }
      var w = svgEl.getBoundingClientRect().width || 1;
      var span = +range.max - +range.min;
      range.value = clamp(v0 + dx / w * span * 1.6, +range.min, +range.max);
      range.dispatchEvent(new Event('input', { bubbles: true }));
    });
    function end() { x0 = null; live = false; }
    svgEl.addEventListener('pointerup', end);
    svgEl.addEventListener('pointercancel', end);
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* Подписи схем на телефоне: схема сжата под ширину экрана, и шрифт в
     единицах viewBox пропорционально мельчает. Множитель --zs возвращает
     подписям читаемый размер (не больше чем в полтора раза — дальше они
     начинают наезжать на детали). */
  var fitObs = window.ResizeObserver ? new ResizeObserver(function (list) {
    list.forEach(function (e) {
      var el = e.target, vb = el.viewBox && el.viewBox.baseVal;
      var w = el.getBoundingClientRect().width;
      if (!vb || !w) return;
      var z = window.innerWidth <= 720 ? clamp(vb.width / w * (el.closest('.amm-view') ? 0.9 : 0.72), 1, 1.5) : 1;
      el.style.setProperty('--zs', z.toFixed(2));
    });
  }) : null;
  function fitText(frame) {
    if (!fitObs) return;
    frame.querySelectorAll('.figure-svg svg, .amm-view svg').forEach(function (el) {
      if (!el.__fit) { el.__fit = 1; fitObs.observe(el); }
    });
  }

  /* Бесконечная анимация, которая сама себя выключает:
     когда схема ушла с экрана — пауза, когда узел удалён из DOM — стоп.
     Без этого при переходе между страницами оставались бы работать
     невидимые циклы rAF (лишний расход батареи на телефоне). */
  function loop(frame, step) {
    fitText(frame);
    if (reduced) { step(0); return; }
    var visible = true, raf = null, t = 0, io = null, dead = false;

    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start();
      }, { rootMargin: '80px' });
      io.observe(frame);
    }
    function stop() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      if (io) { io.disconnect(); io = null; }
    }
    onUnmount(frame, stop);

    function frameFn() {
      if (dead || !frame.isConnected) { stop(); return; }
      if (!visible) { raf = null; return; }
      t += 1;
      step(t);
      raf = requestAnimationFrame(frameFn);
    }
    function start() { if (!raf && !dead) raf = requestAnimationFrame(frameFn); }
    start();
  }

  /* Уборка при уходе со страницы: роутер очищает main, но WebGL-контекст,
     геометрия и текстуры сами не освобождаются — на них держатся обработчики
     окна. На планшете после нескольких разделов видеопамять кончалась:
     текстуры приходили чёрными, вкладка падала. app.js зовёт unmountAll
     перед тем, как показать следующий раздел. */
  var disposers = [];
  function onUnmount(frame, fn) { disposers.push({ frame: frame, fn: fn }); }
  /* Один рисунок целиком: скрытый вариант живой 3D-схемы отдаёт WebGL и память
     (на старом телефоне контекстов мало); при показе монтируется заново. */
  function unmountFrame(frame) {
    disposers = disposers.filter(function (d) {
      if (d.frame !== frame && !frame.contains(d.frame)) return true;
      try { d.fn(); } catch (e) { console.warn('уборка схемы:', e); }
      return false;
    });
    frame.innerHTML = '';
    frame.classList.remove('is-live3d', 'is-plate', 'is-kin', 'is-scrub');
    delete frame.dataset.mounted;
  }
  function unmountAll(root) {
    disposers = disposers.filter(function (d) {
      if (root && d.frame.isConnected && !root.contains(d.frame)) return true;
      try { d.fn(); } catch (e) { console.warn('уборка схемы:', e); }
      return false;
    });
  }

  /* ═══════════════════════════════════════════════════════
     Общие помощники для схем главы 6
     ═══════════════════════════════════════════════════════ */

  var DEG = Math.PI / 180;

  function r1(v) { return Math.round(v * 10) / 10; }

  /* Вход схемы, который сам плавно ходит туда-обратно, пока читатель его
     не тронул: так схема живая с первой секунды, а не ждёт действия.
     Первое касание ползунка отдаёт управление руке, кнопка «Авто»
     возвращает автопрогон. */
  function driver(input, set, period, autoBtn) {
    var lo = +input.min, hi = +input.max, auto = !reduced, ph;
    function phase() { ph = Math.acos(clamp(1 - 2 * (+input.value - lo) / (hi - lo), -1, 1)); }
    function sync() { if (autoBtn) autoBtn.classList.toggle('is-on', auto); }
    input.addEventListener('input', function () { auto = false; sync(); set(+input.value); });
    if (autoBtn) {
      autoBtn.addEventListener('click', function () { auto = !auto; phase(); sync(); });
    }
    phase(); sync(); set(+input.value);
    return {
      tick: function () {
        if (!auto) return;
        ph += 2 * Math.PI / period;
        var v = lo + (hi - lo) * (1 - Math.cos(ph)) / 2;
        input.value = v;
        set(v);
      },
      stop: function () { auto = false; sync(); }
    };
  }

  var AUTO = '<button class="fig-btn fig-auto" type="button">Авто</button>';

  /* ═══════════════════════════════════════════════════════
     7. Просмотр 3D-модели (.glb) — Three.js подгружается лениво,
        только если на странице реально есть такая схема.
     ═══════════════════════════════════════════════════════ */

  var THREE_BASE = 'https://cdn.jsdelivr.net/npm/three@0.128.0/';
  var threeReady = null;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = function () { rej(new Error('не загрузился ' + src)); };
      document.head.appendChild(s);
    });
  }

  function ensureThree() {
    if (threeReady) return threeReady;
    threeReady = loadScript(THREE_BASE + 'build/three.min.js')
      .then(function () {
        return Promise.all([
          loadScript(THREE_BASE + 'examples/js/loaders/GLTFLoader.js'),
          /* Декодер сжатой геометрии EXT_meshopt_compression: так сжаты
             файлы систем DA 40 NG в models/da40 (tools/split-da40.js). */
          loadScript(THREE_BASE + 'examples/js/libs/meshopt_decoder.js'),
          loadScript(THREE_BASE + 'examples/js/controls/OrbitControls.js'),
          loadScript(THREE_BASE + 'examples/js/environments/RoomEnvironment.js'),
          /* панорама ангара из Blender (Scenery.hangar) */
          loadScript(THREE_BASE + 'examples/js/loaders/RGBELoader.js')
        ]);
      });
    return threeReady;
  }

  /* Подсказка по управлению зависит от того, чем читатель управляет:
     на телефоне нет ни колеса, ни правой кнопки, и старый текст врал. */
  var TOUCH = !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
  var M3_HINT = TOUCH
    ? 'палец — поворот · два пальца — сдвиг и приближение · касание детали — что это'
    : 'перетащить — поворот · правая кнопка — сдвиг · колесо — приближение';

  /* Планшеты и телефоны: видеопамяти мало и её делят все вкладки. Им —
     облегчённые копии моделей с текстурами вдвое меньше (tools/lite-textures.js),
     пиксели не плотнее 1,5 и тень 1024. На iPad раздел с салоном просил
     больше гигабайта, текстуры приходили чёрными, вкладка падала. */
  var LITE = TOUCH || !!(navigator.deviceMemory && navigator.deviceMemory <= 4);
  /* Яркость панорамы ангара (Scenery.hangar): шаг экспоненты RGBE, ×2 на единицу. */
  var HDR_GAIN = -1;
  var LITE_FILES = { 'models/da40/da40-airframe.glb': 1, 'models/da40/da40-cabin.glb': 1, 'models/da40/da40-wheels.glb': 1 };
  function liteSrc(src) {
    return LITE && LITE_FILES[src] ? src.replace(/\.glb$/, '-lite.glb') : src;
  }

  /* Освободить всё, что объект держит на видеокарте. */
  function disposeTree(obj) {
    obj.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      var mm = !o.material ? [] : Array.isArray(o.material) ? o.material : [o.material];
      mm.forEach(function (m) {
        Object.keys(m).forEach(function (k) {
          if (m[k] && m[k].isTexture) m[k].dispose();
        });
        m.dispose();
      });
    });
  }

  /* Сцена собирается из одного или нескольких .glb.

       opts.src     — файл или список файлов, которые грузятся сразу (основа);
       opts.layers  — слои с кнопками: [{ src, title, on, hint }]. Слой
                      грузится только при первом включении — телефон не
                      тянет лишние мегабайты;
       opts.labelsSrc — общий словарь подписей (JSON: labels, rules,
                      materials, strip), чтобы не повторять его на каждой
                      странице.

     Все файлы одной модели лежат в общей системе координат (так режет
     tools/split-da40.js), поэтому просто складываются в одну группу.
     Клип с одним именем может быть разрезан по файлам — тяги в одном,
     поверхность в другом. Такие куски запускаются вместе и с нуля. */
  /* ═══════════════════════════════════════════════════════
     Лист: подлинный рисунок учебника, альбома или руководства
     ═══════════════════════════════════════════════════════
     Рисунок не перерисовывается, а берётся как есть (assets/plates):
     растровые листы альбома A320 и методички, векторизованные контуры
     (.json — контуры potrace, чёткие на любом экране). Поверх — номерные
     метки на деталях; касание метки или строки перечня выделяет деталь
     и показывает её назначение. На векторном листе деталь выделяется
     цветом сама (её контуры собраны по рамке box). «Пошагово» ведёт по
     пути от органа управления к поверхности.
       opts.sheets — [{ t, src | vec, spots: [{ n, x, y, t, d, box }] }],
         x, y и box — в процентах ширины и высоты листа;
       opts.steps  — [{ sheet, on: [n…], t }]. */
  reg.plate = function (frame, opts) {
    opts = opts || {};
    var sheets = opts.sheets || [], cur = 0, sel = [], vecCache = {};
    frame.classList.add('is-plate');
    frame.innerHTML =
      '<div class="pl-stage"><div class="pl-art"></div><div class="pl-spots"></div>' +
      '<button class="pl-full" type="button" aria-label="Во весь экран">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button></div>' +
      '<div class="pl-info" aria-live="polite"></div><ul class="pl-list"></ul>';
    var stage = frame.querySelector('.pl-stage'), art = frame.querySelector('.pl-art'),
      spotsEl = frame.querySelector('.pl-spots'), info = frame.querySelector('.pl-info'), list = frame.querySelector('.pl-list');
    var bar = controls(frame,
      (sheets.length > 1 ? '<div class="fig-cams">' + sheets.map(function (s, i) {
        return '<button class="fig-cam' + (i ? '' : ' is-on') + '" type="button" data-s="' + i + '">' + s.t + '</button>';
      }).join('') + '</div>' : '') +
      (opts.steps ? '<button class="fig-btn" id="pl-prev" type="button" aria-label="Предыдущий шаг">←</button>' +
        '<button class="fig-btn" id="pl-step" type="button">Пошагово</button>' +
        '<button class="fig-btn" id="pl-next" type="button" aria-label="Следующий шаг">→</button>' : '') +
      '<span class="fig-readout pl-src">' + (opts.source || '') + '</span>');

    function sheet() { return sheets[cur]; }
    function show(i) {
      cur = i;
      var s = sheet();
      [].forEach.call(bar.querySelectorAll('[data-s]'), function (b) { b.classList.toggle('is-on', +b.dataset.s === i); });
      stage.style.setProperty('--ar', s.w && s.h ? s.w / s.h : 2);
      if (s.vec) {
        art.innerHTML = '';
        (vecCache[s.vec] || (vecCache[s.vec] = fetch(withV(s.vec)).then(function (r) { return r.json(); }))).then(function (v) {
          if (cur !== i) return;
          stage.style.setProperty('--ar', v.w / v.h);
          /* Весь рисунок — один контур с правилом чётности: контуры potrace
             бывают внешними и «дырками», порознь дырки залились бы чёрным.
             Деталь выделяется слоем поверх: её внешние контуры целиком внутри
             рамки box и дырки, лежащие внутри них. */
          var big = v.p.reduce(function (a, p) { var ar = (p.b[2] - p.b[0]) * (p.b[3] - p.b[1]); return ar > a[0] ? [ar, p.o] : a; }, [0, 1]);
          var outerSign = big[1];
          function pct(p) { return [p.b[0] / v.w * 100, p.b[1] / v.h * 100, p.b[2] / v.w * 100, p.b[3] / v.h * 100]; }
          var html = '<path class="pl-ink" fill-rule="evenodd" d="' + v.p.map(function (p) { return p.d; }).join('') + '"/>';
          (s.spots || []).forEach(function (sp) {
            if (!sp.box) return;
            var bx = sp.box, outs = v.p.filter(function (p) {
              var b = pct(p);
              return p.o === outerSign && b[0] >= bx[0] && b[2] <= bx[2] && b[1] >= bx[1] && b[3] <= bx[3];
            });
            if (!outs.length) return;
            var holes = v.p.filter(function (p) {
              return p.o !== outerSign && outs.some(function (o) { return p.b[0] >= o.b[0] && p.b[2] <= o.b[2] && p.b[1] >= o.b[1] && p.b[3] <= o.b[3]; });
            });
            html += '<path class="pl-part" data-n="' + sp.n + '" fill-rule="evenodd" d="' + outs.concat(holes).map(function (p) { return p.d; }).join('') + '"/>';
          });
          art.innerHTML = '<svg viewBox="0 0 ' + v.w + ' ' + v.h + '" role="img" aria-label="' + s.t + '">' + html + '</svg>';
          paint();
        });
      } else {
        art.innerHTML = '<img src="' + withV(s.src) + '" alt="' + s.t + '" loading="lazy" decoding="async">';
        var img = art.querySelector('img');
        img.addEventListener('load', function () { stage.style.setProperty('--ar', img.naturalWidth / img.naturalHeight); });
      }
      spotsEl.innerHTML = (s.spots || []).map(function (sp) {
        return '<button class="pl-spot" type="button" data-n="' + sp.n + '" style="left:' + sp.x + '%;top:' + sp.y + '%" aria-label="' + sp.n + '. ' + sp.t + '">' + sp.n + '</button>';
      }).join('');
      list.innerHTML = (s.spots || []).map(function (sp) {
        return '<li><button type="button" data-n="' + sp.n + '"><b>' + sp.n + '</b>' + sp.t + '</button></li>';
      }).join('');
      sel = [];
      paint();
    }
    function spot(n) { return (sheet().spots || []).filter(function (sp) { return String(sp.n) === String(n); })[0]; }
    function paint(text) {
      [].forEach.call(frame.querySelectorAll('[data-n]'), function (el) {
        el.classList.toggle('is-on', sel.indexOf(String(el.getAttribute('data-n'))) >= 0);
      });
      stage.classList.toggle('has-sel', sel.length > 0);
      if (text) { info.innerHTML = text; return; }
      var sp = sel.length === 1 ? spot(sel[0]) : null;
      info.innerHTML = sp ? '<b>' + sp.n + '. ' + sp.t + '</b>' + (sp.d ? ' — ' + sp.d : '')
        : '<span class="pl-hint">' + (TOUCH ? 'Коснитесь номера на рисунке или строки перечня' : 'Нажмите на номер на рисунке или строку перечня') + '</span>';
    }
    frame.addEventListener('click', function (e) {
      var t = e.target.closest('[data-n]');
      if (!t || !frame.contains(t)) return;
      var n = String(t.getAttribute('data-n'));
      sel = sel.length === 1 && sel[0] === n ? [] : [n];
      step = -1;
      paint();
    });
    [].forEach.call(bar.querySelectorAll('[data-s]'), function (b) {
      b.addEventListener('click', function () { step = -1; show(+b.dataset.s); });
    });
    /* пошагово: шаг выбирает лист, выделяет детали и пишет, что происходит */
    var step = -1, steps = opts.steps || [];
    function goStep(k) {
      if (!steps.length) return;
      step = (k + steps.length) % steps.length;
      var st = steps[step];
      if ((st.sheet || 0) !== cur) show(st.sheet || 0);
      sel = (st.on || []).map(String);
      paint('<span class="pl-stepn">' + (step + 1) + ' / ' + steps.length + '</span> ' + st.t);
    }
    if (steps.length) {
      frame.querySelector('#pl-step').addEventListener('click', function () { goStep(step + 1); });
      frame.querySelector('#pl-next').addEventListener('click', function () { goStep(step + 1); });
      frame.querySelector('#pl-prev').addEventListener('click', function () { goStep(step - 1); });
    }
    /* во весь экран: на телефоне мелкий лист рассматривают крупно и щипком */
    frame.querySelector('.pl-full').addEventListener('click', function () {
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      if (stage.requestFullscreen) stage.requestFullscreen().catch(function () {});
    });
    show(0);
  };

  /* ═══════════════════════════════════════════════════════
     Рисунок «как в AMM» из настоящей геометрии DA 40 NG
     ═══════════════════════════════════════════════════════
     Детали берутся из модели системы (models/da40/da40-controls.glb):
     те же тяги, качалки и кронштейны, что в 3D практикума, с их именами
     и анимациями. Рисуются как в руководстве по ТО: белые детали, чёрный
     контур по рёбрам, параллельная проекция, выноски с названиями. Ход
     системы — ползунком или пальцем прямо по рисунку (прокрутка клипа).
       opts.src    — файл модели;
       opts.match  — какие детали показать (регулярное выражение по имени);
       opts.clip   — анимация хода; opts.from/opts.to — доли клипа для краёв хода;
       opts.views  — ракурсы [{ t, view:[x,y,z], focus:'regex' }];
       opts.labels — выноски [{ m:'regex', t:'текст' }];
       opts.input  — подпись ползунка; opts.ends — подписи краёв хода;
       opts.half   — ход в одну сторону (закрылки: 0…1), opts.scale — значение
                     в конце хода и единица, например [42, '°']. */
  /* Одна загрузка модели на все чертежи страницы: каждому — своя копия
     сцены (геометрия общая), рёбра одной геометрии считаются один раз. */
  var ammGltf = {}, ammEdges = {};
  function ammLoad(THREE, loader, url) {
    if (!ammGltf[url]) {
      ammGltf[url] = new Promise(function (res, rej) { loader.load(withV(url), res, null, rej); });
      ammGltf[url].catch(function () { delete ammGltf[url]; });
    }
    return ammGltf[url].then(function (g) { return { scene: g.scene.clone(true), animations: g.animations }; });
  }
  reg.amm3d = function (frame, opts) {
    opts = opts || {};
    var box = document.createElement('div');
    box.className = 'amm3d';
    box.innerHTML = '<div class="model3d-note">Загрузка чертежа…</div>';
    frame.appendChild(box);
    var views = opts.views || [{ t: 'Общий вид', view: [-0.6, 0.55, -0.8] }];
    var bar = controls(frame,
      '<div class="fig-cams">' + views.map(function (v, i) {
        return '<button class="fig-cam' + (i ? '' : ' is-on') + '" type="button" data-v="' + i + '">' + v.t + '</button>';
      }).join('') + '</div>' +
      '<span class="fig-label">' + (opts.input || 'Ход') + '</span>' +
      '<input class="fig-range" type="range" min="-100" max="100" value="0" aria-label="' + (opts.input || 'Ход') + '">' + AUTO +
      '<span class="fig-readout amm3d-out"></span>');
    var rng = bar.querySelector('.fig-range'), outEl = bar.querySelector('.amm3d-out');
    var legend = document.createElement('div');
    legend.className = 'amm3d-legend';
    frame.appendChild(legend);

    ensureThree().then(function () {
      if (!frame.isConnected) return;
      var THREE = window.THREE;
      var W = box.clientWidth || 640, H = Math.round(W * (opts.ratio || 0.62));
      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.setSize(W, H);
      renderer.setClearColor(0xffffff, 1);
      var scene = new THREE.Scene();
      var cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
      var loader = new THREE.GLTFLoader();
      if (window.MeshoptDecoder) loader.setMeshoptDecoder(window.MeshoptDecoder);
      var re = opts.match ? new RegExp(opts.match, 'i') : null;
      var dead = false;
      onUnmount(frame, function () {
        dead = true;
        /* геометрия и рёбра общие для всех чертежей — их не освобождаем */
        scene.traverse(function (o) {
          if (o.material) [].concat(o.material).forEach(function (m) { m.dispose(); });
        });
        renderer.dispose();
        if (renderer.forceContextLoss) renderer.forceContextLoss();
      });

      ammLoad(THREE, loader, opts.src).then(function (gltf) {
        if (dead) return;
        box.innerHTML = '';
        box.appendChild(renderer.domElement);
        var over = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        over.setAttribute('class', 'amm3d-over');
        box.appendChild(over);

        var root = gltf.scene;
        scene.add(root);
        var clip = (gltf.animations || []).filter(function (c) { return c.name === opts.clip; })[0];
        var moving = {};
        if (clip) clip.tracks.forEach(function (t) { moving[t.name.split('.')[0]] = 1; });
        function movingNode(o) {
          for (var p = o; p; p = p.parent) if (moving[p.name]) return true;
          return false;
        }
        /* имя детали — ближайшее осмысленное имя вверх по дереву */
        function nameOf(o) {
          for (var p = o; p; p = p.parent) if (p.name && !/^(mesh|node|object|cube|cylinder)?_?\d*$/i.test(p.name)) return p.name.replace(/_/g, ' ');
          return '';
        }
        var FILL = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
        var accent = (getComputedStyle(frame).getPropertyValue('--c3d') || '#3d6bd8').trim();
        var MOVE = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).lerp(new THREE.Color(0xffffff), 0.62),
          polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
        var LINE = new THREE.LineBasicMaterial({ color: 0x141a26 });
        /* Силуэт: обратные грани, раздвинутые по нормали на 1,2 px экрана.
           Рёбра по излому не дают контура у гладкой трубы — тяга без силуэта
           превращалась в бледную полосу. Ширина пересчитывается при каждом виде. */
        var SIL = new THREE.ShaderMaterial({
          uniforms: { w: { value: 0.001 } },
          side: THREE.BackSide,
          vertexShader: 'uniform float w; void main(){ vec4 p = modelMatrix * vec4(position, 1.0);' +
            ' vec3 n = normalize(mat3(modelMatrix) * normal); p.xyz += n * w; gl_Position = projectionMatrix * viewMatrix * p; }',
          fragmentShader: 'void main(){ gl_FragColor = vec4(0.078, 0.102, 0.149, 1.0); }'
        });
        /* Файлы сжаты (KHR_mesh_quantization): координаты — целые со
           знаком нормализации, а r128 считает габарит и рёбра по сырым числам.
           Раскодируем позиции в float, тогда и рёбра, и габарит верные. */
        function edges(g, ang) {
          var key = g.uuid + ':' + ang;
          if (!ammEdges[key]) {
            var gq = deq(g);
            ammEdges[key] = new THREE.EdgesGeometry(gq, ang);
            if (gq !== g) gq.dispose();
          }
          return ammEdges[key];
        }
        function deq(g) {
          var a = g.attributes.position;
          if (!a.normalized) return g;
          var arr = a.array || (a.data && a.data.array);
          var k = arr instanceof Int16Array ? 1 / 32767 : arr instanceof Uint16Array ? 1 / 65535
            : arr instanceof Int8Array ? 1 / 127 : arr instanceof Uint8Array ? 1 / 255 : 1;
          var out = new Float32Array(a.count * 3);
          for (var i = 0; i < a.count; i++) {
            out[i * 3] = Math.max(-1, a.getX(i) * k); out[i * 3 + 1] = Math.max(-1, a.getY(i) * k); out[i * 3 + 2] = Math.max(-1, a.getZ(i) * k);
          }
          var g2 = new THREE.BufferGeometry();
          g2.setAttribute('position', new THREE.BufferAttribute(out, 3));
          if (g.index) g2.setIndex(g.index);
          g2.computeBoundingBox(); g2.computeBoundingSphere();
          g.boundingBox = g2.boundingBox.clone(); g.boundingSphere = g2.boundingSphere.clone();
          return g2;
        }
        var shown = [];
        root.traverse(function (o) {
          if (!o.isMesh || o.__sil) return;
          var nm = nameOf(o);
          if (re && !re.test(nm)) { o.visible = false; return; }
          o.material = movingNode(o) ? MOVE : FILL;
          o.add(new THREE.LineSegments(edges(o.geometry, 28), LINE));
          if (o.geometry.attributes.normal) {
            var sil = new THREE.Mesh(o.geometry, SIL);
            sil.__sil = true;
            sil.renderOrder = -1;
            o.add(sil);
          }
          o.__nm = nm;
          shown.push(o);
        });

        /* Контекст — точный контур нашего DA 40 из модели планера: только
           рёбра, светло-серым, без заливки: видно, где проходит система */
        if (opts.context) {
          ammLoad(THREE, loader, opts.context).then(function (g2) {
            if (dead) return;
            var CL = new THREE.LineBasicMaterial({ color: 0xc9cfd8 });
            g2.scene.traverse(function (o) {
              if (!o.isMesh) return;
              var l = new THREE.LineSegments(edges(o.geometry, opts.contextAngle || 55), CL);
              o.parent.add(l);
              l.position.copy(o.position); l.quaternion.copy(o.quaternion); l.scale.copy(o.scale);
              o.visible = false;
            });
            scene.add(g2.scene);
            draw();
          }).catch(function (e) { console.warn('amm3d контекст:', e); });
        }
        var mixer = clip ? new THREE.AnimationMixer(root) : null, act = null;
        if (mixer) { act = mixer.clipAction(clip); act.play(); act.paused = true; }
        var f0 = opts.from != null ? opts.from : 0, f1 = opts.to != null ? opts.to : 1, half = !!opts.half;
        var live = !!clip;
        if (!live) {
          /* без анимации — только виды: ползунок не нужен */
          [].forEach.call(bar.querySelectorAll('.fig-label, .fig-range, .fig-auto, .amm3d-out'), function (el) { el.hidden = true; el.style.display = 'none'; });
        }
        if (half) rng.min = 0;
        function pose(v) {
          if (!mixer) return;
          act.time = clip.duration * (f0 + (f1 - f0) * (half ? v : (v + 1) / 2));
          mixer.update(0);
          root.updateMatrixWorld(true);
        }

        /* выноски: якорь — центр габарита детали */
        var labels = (opts.labels || []).map(function (l, i) {
          var r = new RegExp(l.m, 'i'), objs = shown.filter(function (o) { return r.test(o.__nm); });
          return { t: l.t, objs: objs, n: i + 1 };
        }).filter(function (l) { return l.objs.length; });
        var tmpBox = new THREE.Box3(), tmpV = new THREE.Vector3();
        function anchor(l) {
          tmpBox.makeEmpty();
          l.objs.forEach(function (o) { tmpBox.expandByObject(o); });
          return tmpBox.getCenter(tmpV).clone();
        }

        var curView = 0;
        function setView(i) {
          curView = i;
          var v = views[i], dir = new THREE.Vector3(v.view[0], v.view[1], v.view[2]).normalize();
          pose(0);
          var fr = v.focus ? new RegExp(v.focus, 'i') : null, bb = new THREE.Box3();
          shown.forEach(function (o) { if (!fr || fr.test(o.__nm)) bb.expandByObject(o); });
          var c = bb.getCenter(new THREE.Vector3()), dg = bb.getSize(new THREE.Vector3()).length() || 1;
          /* единицы модели бывают любыми — камера и отсечение по габариту */
          var all = new THREE.Box3();
          shown.forEach(function (o) { all.expandByObject(o); });
          var D = (all.getSize(new THREE.Vector3()).length() || dg) * 2;
          cam.near = -D * 2; cam.far = D * 4;
          cam.position.copy(c).add(dir.multiplyScalar(D));
          cam.up.set(0, 1, 0);
          cam.lookAt(c);
          cam.updateMatrixWorld(true);
          /* вписываем габарит в середину кадра: по краям — колонки выносок */
          var pts = [], mn = [1e9, 1e9], mx = [-1e9, -1e9];
          [bb.min.x, bb.max.x].forEach(function (x) { [bb.min.y, bb.max.y].forEach(function (y) { [bb.min.z, bb.max.z].forEach(function (z) {
            var p = new THREE.Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse);
            mn[0] = Math.min(mn[0], p.x); mn[1] = Math.min(mn[1], p.y); mx[0] = Math.max(mx[0], p.x); mx[1] = Math.max(mx[1], p.y);
          }); }); });
          var narrow = W < 560, side = narrow ? 0.12 : 0.21;
          var aw = W * (1 - 2 * side), ah = H * 0.86, k = Math.min(aw / (mx[0] - mn[0]), ah / (mx[1] - mn[1]));
          var cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2;
          cam.left = cx - W / 2 / k; cam.right = cx + W / 2 / k; cam.top = cy + H / 2 / k; cam.bottom = cy - H / 2 / k;
          cam.updateProjectionMatrix();
          SIL.uniforms.w.value = 1.2 / k;
          pose(val);
          draw();
          [].forEach.call(bar.querySelectorAll('.fig-cam'), function (b, j) { b.classList.toggle('is-on', j === i); });
        }

        /* колонки выносок слева и справа, по высоте якорей — без наложений */
        function place() {
          var narrow = W < 560, items = labels.map(function (l) {
            var p = anchor(l).project(cam);
            return { l: l, x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H };
          }).filter(function (it) { return it.x > 4 && it.x < W - 4 && it.y > 4 && it.y < H - 4; });  /* деталь вне кадра — без выноски */
          items.sort(function (a, b) { return a.l.n - b.l.n; });
          legend.innerHTML = items.map(function (it) { return '<p><b>' + it.l.n + '</b>' + it.l.t + '</p>'; }).join('');
          var cols = [items.filter(function (it) { return it.x < W / 2; }), items.filter(function (it) { return it.x >= W / 2; })];
          var s = '', GAP = narrow ? 22 : 21;
          cols.forEach(function (col, ci) {
            col.sort(function (a, b) { return a.y - b.y; });
            var ys = col.map(function (it) { return it.y; });
            for (var i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + GAP);
            var over = ys.length ? ys[ys.length - 1] - (H - 10) : 0;
            if (over > 0) for (var j = ys.length - 1; j >= 0; j--) { ys[j] -= over; if (j && ys[j] - ys[j - 1] >= GAP) break; over = Math.max(0, ys[j - 1] + GAP - ys[j]); }
            col.forEach(function (it, i) {
              var y = Math.max(12, ys[i]), left = ci === 0;
              var tx = left ? 10 : W - 10, ex = left ? (narrow ? 30 : W * 0.25) : (narrow ? W - 30 : W * 0.75);
              s += '<path class="a-ld" d="M' + r1(ex) + ' ' + r1(y) + 'L' + r1(it.x) + ' ' + r1(it.y) + '"/>' +
                '<circle class="a-dot" cx="' + r1(it.x) + '" cy="' + r1(it.y) + '" r="2"/>';
              if (narrow) {
                s += '<circle class="a-num" cx="' + r1(left ? 20 : W - 20) + '" cy="' + r1(y) + '" r="9"/>' +
                  '<text class="a-numt" x="' + r1(left ? 20 : W - 20) + '" y="' + r1(y + 4) + '" text-anchor="middle">' + it.l.n + '</text>';
              } else {
                s += '<path class="a-ld" d="M' + r1(left ? tx + it.l.t.length * 6.6 + 4 : tx - it.l.t.length * 6.6 - 4) + ' ' + r1(y) + 'H' + r1(ex) + '"/>' +
                  '<text class="a-tx" x="' + r1(tx) + '" y="' + r1(y + 4) + '" text-anchor="' + (left ? 'start' : 'end') + '">' + it.l.t + '</text>';
              }
            });
          });
          over.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
          over.innerHTML = s;
          legend.classList.toggle('is-on', narrow);
        }
        function draw() { renderer.render(scene, cam); place(); }

        var val = 0;
        function setVal(x) {
          val = clamp(x, half ? 0 : -1, 1);
          pose(val);
          draw();
          var e = opts.ends || ['', ''];
          outEl.textContent = opts.scale ? (opts.mid || '') + Math.round(val * opts.scale[0]) + opts.scale[1]
            : Math.abs(val) < 0.04 ? (opts.mid || 'нейтраль') : (val < 0 ? e[0] : e[1]) + ' · ' + Math.round(Math.abs(val) * 100) + ' %';
        }
        var drv = driver(rng, function (x) { setVal(x / 100); }, 360, bar.querySelector('.fig-auto'));
        [].forEach.call(bar.querySelectorAll('.fig-cam'), function (b) {
          b.addEventListener('click', function () { setView(+b.dataset.v); });
        });
        /* тянем по рисунку: горизонтальный ход пальца — ход системы */
        var x0 = null, v0 = 0;
        renderer.domElement.style.touchAction = 'pan-y';
        renderer.domElement.addEventListener('pointerdown', function (e) { if (!live) return; x0 = e.clientX; v0 = val; drv.stop(); });
        renderer.domElement.addEventListener('pointermove', function (e) {
          if (x0 === null) return;
          var x = clamp(v0 + (e.clientX - x0) / (W * (half ? 0.8 : 0.4)), half ? 0 : -1, 1);
          rng.value = Math.round(x * 100);
          setVal(x);
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) {
          renderer.domElement.addEventListener(n, function () { x0 = null; });
        });
        /* размер: перестраиваем кадр под ширину колонки */
        if (window.ResizeObserver) {
          var ro = new ResizeObserver(function () {
            var w = box.clientWidth;
            if (!w || Math.abs(w - W) < 2) return;
            W = w; H = Math.round(W * (W < 560 ? (opts.ratioPhone || 0.9) : (opts.ratio || 0.62)));
            renderer.setSize(W, H);
            setView(curView);
          });
          ro.observe(box);
          onUnmount(frame, function () { ro.disconnect(); });
        }
        if (W < 560) { H = Math.round(W * (opts.ratioPhone || 0.9)); renderer.setSize(W, H); }
        if (!live) { drv.stop(); renderer.domElement.style.cursor = 'default'; }
        setView(0);
        setVal(0);
        loop(frame, function () { if (live) drv.tick(); });
      }).catch(function (e) {
        box.innerHTML = '<div class="model3d-note">Чертёж не загрузился</div>';
        console.warn('amm3d:', e);
      });
    });
  };

  reg.model3d = function (frame, opts) {
    opts = opts || {};
    /* Сцена раздела закреплена за разделом: читатель меняет только вид
       (прозрачность, подсветку, салон), а не набор систем.
         opts.src     — основа: планер и колёса;
         opts.system  — система раздела [{ src, title, plain, match }]: видна
                        всегда; с match — только совпавшие детали файла;
         opts.context — соседние детали для привязки [{ src, title, match }]:
                        видны всегда, серые, только совпавшие с match;
         opts.extras  — то, что можно включить для наглядности ([{ src, title }],
                        например салон с педалями), грузится по кнопке;
         opts.elements — элементы системы [{ title, files | match, hint }]:
                        выбранный в цвете, остальное приглушено;
         opts.sections — ссылки на разделы (обзорная страница). */
    var baseSrc = [].concat(opts.src || []);
    var sysDefs = opts.system || [], ctxDefs = opts.context || [];
    var layerDefs = opts.extras || [];
    if (!baseSrc.length && !sysDefs.length) { console.warn('model3d без opts.src'); return; }
    var multi = baseSrc.length + sysDefs.length + ctxDefs.length + layerDefs.length > 1;

    var box = document.createElement('div');
    box.className = 'model3d';
    box.innerHTML = '<div class="model3d-note">Загрузка модели…</div>';
    frame.appendChild(box);

    var bar = controls(frame, '<span class="fig-readout m3-info">—</span>');
    var info = bar.querySelector('.m3-info');
    /* Страницу закрыли — всё, что ещё грузится, по приходу сразу освобождаем. */
    var dead = false, cleanup = null;
    onUnmount(frame, function () { dead = true; if (cleanup) cleanup(); });
    /* Разделы практикума для кнопки «Другая система» — их кладёт app.js. */
    var pageNav = window.__pageNav || null;

    ensureThree().then(function () {
      if (dead) return;
      var THREE = window.THREE;
      /* Обработчики окна и документа держат сцену живой — снимаем их при уборке. */
      var offs = [];
      function listen(t, type, fn, o) {
        t.addEventListener(type, fn, o);
        offs.push(function () { t.removeEventListener(type, fn, o); });
      }
      /* На телефоне кадр 16:10 делает модель крошечной: ширина 343 px даёт
         высоту 213 px, и механизм не разглядеть. На узком экране берём почти
         квадрат, на широком оставляем привычную пропорцию. */
      function ratio(cw) {
        if (opts.tall) return cw < 520 ? 1.15 : 0.74;
        return cw < 520 ? 0.95 : 0.62;
      }
      /* На странице практикума окно модели — колонка во всю высоту экрана
         (app.js, .ws-view): высоту задаёт раскладка, а не пропорция. */
      var inPane = !!frame.closest('.ws-view');
      var w = box.clientWidth || 600;
      var h = inPane ? (box.clientHeight || Math.round(w * 0.75)) : Math.round(w * ratio(w));

      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, LITE ? 1.5 : 2));
      renderer.setSize(w, h);
      renderer.outputEncoding = THREE.sRGBEncoding;
      /* Самолёт белый, и при линейной кривой светлые борта выбивает в лист
         бумаги — форма пропадает. ACES держит светлые тона в тоне. */
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;

      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(42, w / h, 0.01, 200);

      /* Окружение для отражений. Без него металлу и стеклу отражать нечего:
         полированный шток выглядит серой краской, а фонарь — мутной плёнкой.
         Карта считается один раз и затем отдаётся сцене. */
      /* Зал: окружение — панорама ангара, её начинаем грузить сразу, вместе
         с моделями (240 КБ против мегабайт планера — приходит раньше). Тогда
         шейдеры компилируются один раз: каждая смена карты окружения
         (комната → студия → ангар) перекомпилировала все материалы, и на
         телефоне страница замирала на секунды. */
      var apron0 = opts.scene === 'showroom' || opts.scene === 'apron', hangarEnv = null, hangarP = null;
      if (apron0) hangarP = Scenery.hangar(THREE, renderer, withV('models/env/hangar.hdr'), HDR_GAIN)
        .then(function (h) { if (dead) { h.dispose(); return null; } hangarEnv = h; return h; })
        .catch(function (e) { console.warn('ангар:', e); return null; });
      if (!apron0 && THREE.RoomEnvironment && THREE.PMREMGenerator) {
        var pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
      }

      /* Свет ставит сайт — модель приходит без запечённого освещения.
         Зал (самолёт) и мастерская (механизмы) — тёмные: белая обшивка
         читается формой, а не пересвеченным пятном. Ключевой свет сверху
         спереди, холодный контровой сзади обводит силуэт. */
      var apron = opts.scene === 'showroom' || opts.scene === 'apron';
      /* Зал: свет как под потолком ангара — тёплый ключевой сверху-спереди,
         слабый небесный и холодный контровой. Белая краска в нём читается
         белой, но не выбивается в лист (раньше экспозиция и яркое окружение
         пересвечивали борт). */
      /* Ангар нейтральный (панорама из Blender, env_hangar.py: лампы ~5000 K,
         сзади холодные сумерки из ворот). Тёплый свет — только штатный свет
         самолёта в кабине (cockpit.js). */
      var hemi = new THREE.HemisphereLight(0xdfe6f0, 0x1c1f24, apron ? 0.16 : 0.4);
      scene.add(hemi);
      /* Вечер: ангар приглушён, чтобы был виден штатный свет кабины. */
      var key = new THREE.DirectionalLight(apron ? 0xfff6ec : 0xfff0dc, apron ? 0.8 : 1.1);
      renderer.toneMappingExposure = apron ? 0.82 : 0.95;
      key.position.set(3, 5, 4);
      scene.add(key);
      scene.add(key.target);
      var fill = new THREE.DirectionalLight(apron ? 0x93ade0 : 0x9fb8d6, apron ? 0.36 : 0.4);
      fill.position.set(-4, 2.5, -5);
      scene.add(fill);
      if (!apron) scene.background = Scenery.studio(THREE);
      if (apron) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.autoUpdate = false;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        key.castShadow = true;
        key.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048);
        key.shadow.bias = -0.0004;
        key.shadow.normalBias = 0.02;
      }

      /* Цвета подсветки — из палитры раздела (style.css, --c3d: вариант
         цвета для тёмного окна). Элемент системы светится цветом системы,
         выбранная деталь — противоположным по кругу оттенков, чтобы не
         сливаться с ним. У бесцветного тона (обзор самолёта) — прежние
         синий и оранжевый. */
      var LIT = new THREE.Color(0x1f4ea8), PICK = new THREE.Color(0xff8f2e), PICK_EM = new THREE.Color(0xff6a00);
      var toneHex = (getComputedStyle(frame).getPropertyValue('--c3d') || '').trim();
      if (/^#[0-9a-f]{6}$/i.test(toneHex)) {
        var tone = new THREE.Color(toneHex), hsl = {};
        tone.getHSL(hsl);
        if (hsl.s > 0.25) {
          /* палитра записана в sRGB, а сцена считает свет в линейных
             величинах (outputEncoding = sRGB): без перевода шафран
             на выходе выцветает до кремового */
          PICK = tone.clone().offsetHSL(0.5, 0, 0).convertSRGBToLinear();
          LIT = tone.convertSRGBToLinear();
          PICK_EM = PICK.clone();
        }
      }

      /* Общая группа всех файлов. Её сдвигаем при кадрировании, поэтому
         слои, подгруженные позже, встают туда же, куда и основа. */
      var root = new THREE.Group();
      scene.add(root);

      var ctrl = null, floorY = null;
      /* смена темы перекрашивает студию: тёмная тема — графитовый фон */
      var themeObs = new MutationObserver(function () { Scenery.retheme(THREE, scene); render(); });
      themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      var mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      function onScheme() { Scenery.retheme(THREE, scene); render(); }
      if (mqDark && mqDark.addEventListener) mqDark.addEventListener('change', onScheme);
      onUnmount(frame, function () {
        themeObs.disconnect();
        if (mqDark && mqDark.removeEventListener) mqDark.removeEventListener('change', onScheme);
      });
      /* Мелочь вдали не рисуем. В салоне сотни кнопок, винтов и ручек —
         на общем виде меньше пикселя, а каждая деталь — отдельный вызов
         отрисовки (на телефоне их было 1100 за кадр). Деталь меньше 8 см
         (на телефоне — 15 см) прячем, пока на экране она мельче полутора
         пикселей (на телефоне — двух); подлетели — появляется. Прячем через слои (layers), а не visible: видимость
         деталей ведут слои, обшивка и подсветка систем. */
      var tiny = [], lodAt = new THREE.Vector3(1e9, 0, 0), lodC = new THREE.Vector3(), lodS = new THREE.Vector3();
      function collectTiny(node) {
        node.updateMatrixWorld(true);
        node.traverse(function (o) {
          if (!o.isMesh || !o.geometry || o.name === 'glow') return;
          var g = o.geometry;
          if (!g.boundingSphere) g.computeBoundingSphere();
          o.getWorldScale(lodS);
          var rr = g.boundingSphere.radius * Math.max(lodS.x, lodS.y, lodS.z);
          if (rr < (LITE ? 0.15 : 0.08)) { o.__lodR = rr; tiny.push(o); }
        });
        lodAt.set(1e9, 0, 0);
      }
      function lod() {
        if (!tiny.length || camera.position.distanceToSquared(lodAt) < 1e-6) return;
        lodAt.copy(camera.position);
        var k = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
        for (var i = 0; i < tiny.length; i++) {
          var o = tiny[i];
          lodC.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
          var on = o.__lodR / Math.max(1e-3, lodC.distanceTo(lodAt)) * k > (LITE ? 2 : 1.5);
          if (on === !!o.__far) { o.__far = !on; if (on) o.layers.enable(0); else o.layers.disable(0); }
        }
      }
      /* экраны G1000 в кабине сменились (g1000.js → cockpit.js) — перерисовать */
      listen(window, 'g1000:redraw', function () { render(); });
      function render() {
        lod();
        /* Под пол камеру не пускаем: снизу пол прозрачен, и вид
           получается не с земли, а из-под земли. */
        if (floorY !== null && ctrl && camera.position.y < floorY) {
          camera.position.y = floorY;
          camera.lookAt(ctrl.target);
        }
        renderer.render(scene, camera);
      }
      /* Тень от самолёта считаем не каждый кадр, а когда сцена меняется:
         слой включили, обшивку сняли, идёт сценарий. */
      function reshadow() { if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true; }

      /* ── Подписи ─────────────────────────────────────────── */

      /* GLTFLoader прогоняет имена через sanitizeNodeName: пробелы
         становятся подчёркиваниями, символы [ ] . : / пропадают, одинаковые
         имена получают хвост _1, инстансы — _instance_0. Сравнивать и искать
         подписи нужно по приведённому виду, иначе не совпадает ничего. */
      function norm(v) {
        return String(v || '')
          .replace(/_instance_\d+$/i, '')
          .replace(/[\[\]./:]/g, '')
          .replace(/[\s_]+/g, ' ')
          .trim()
          .toLowerCase();
      }
      /* То же, но для показа читателю: подчёркивания обратно в пробелы. */
      function pretty(v) {
        return String(v || '')
          .replace(/_instance_\d+$/i, '')
          .replace(/_/g, ' ')
          .trim();
      }

      var dict = { labels: {}, rules: [], materials: {}, strip: [], hide: null };
      function addDict(d) {
        if (!d) return;
        if (d.materialsHide) dict.hide = new RegExp(d.materialsHide, 'i');
        Object.keys(d.labels || {}).forEach(function (k) { dict.labels[norm(k)] = d.labels[k]; });
        Object.keys(d.materials || {}).forEach(function (k) { dict.materials[norm(k)] = d.materials[k]; });
        (d.rules || []).forEach(function (r) { dict.rules.push([new RegExp(r[0], 'i'), r[1]]); });
        (d.strip || []).forEach(function (s) { dict.strip.push(new RegExp(s, 'ig')); });
      }
      addDict({ labels: opts.labels, rules: opts.labelRules, materials: opts.materialLabels });
      var dictReady = opts.labelsSrc
        ? fetch(withV(opts.labelsSrc)).then(function (r) { return r.json(); })
          .then(addDict).catch(function (e) { console.warn('подписи:', e); })
        : Promise.resolve();

      /* Хвосты, которые к детали отношения не имеют: _1 у одноимённых узлов,
         «.001» от Blender (после чистки имени — просто «001» в конце слова)
         и служебные пометки из словаря. */
      function clean(n) {
        dict.strip.forEach(function (re) { n = n.replace(re, ''); });
        return n.replace(/\s+/g, ' ').trim();
      }
      function lookup(n) {
        return dict.labels[n] || dict.labels[n.replace(/ \d+$/, '')] ||
          dict.labels[n.replace(/([a-zа-я)])\d{3}$/, '$1')] || null;
      }
      /* Правило: регулярное выражение по приведённому имени и шаблон.
         {1} — подпись для первой скобки (ищется тем же словарём, так что
         «контргайка наконечника» собирается из подписи самой тяги),
         $1 — скобка как есть, $^1 — она же заглавными (имена приведены
         к строчным, а «наконечник A» пишется с заглавной). */
      function labelFor(v, depth) {
        var n = clean(norm(v));
        var hit = lookup(n);
        if (hit || (depth || 0) > 3) return hit;
        for (var i = 0; i < dict.rules.length; i++) {
          var m = n.match(dict.rules[i][0]);
          if (!m) continue;
          return dict.rules[i][1].replace(/\{(\d)\}/g, function (_, k) {
            return labelFor(m[+k] || '', (depth || 0) + 1) || m[+k] || '';
          }).replace(/\$\^(\d)/g, function (_, k) { return (m[+k] || '').toUpperCase(); })
            .replace(/\$(\d)/g, function (_, k) { return m[+k] || ''; });
        }
        return null;
      }
      /* Материал показываем по-русски; служебные имена из исходника
         (Material.018, Screw) читателю ничего не говорят — прячем. */
      function materialName(mt) {
        var n = mt ? (mt.__baseName || mt.name || '') : '';
        var k = norm(n);
        if (dict.materials[k]) return dict.materials[k];
        return dict.hide && dict.hide.test(k) ? '' : n;
      }

      /* ── Файлы и слои ────────────────────────────────────── */

      /* «Оболочка» — обшивка, фонарь, остекление. Её можно спрятать кнопкой,
         а из кликов она исключена всегда: иначе до механизма не добраться.
         Список задаётся в opts.shell, иначе узнаём по имени. */
      var SHELL_RE = /fuselage|canopy|cowl|skin|shell|glass|window|fairing|^fin$|^wing|^stabilizer/i;
      var shellSet = null;
      if (opts.shell && opts.shell.length) {
        shellSet = {};
        opts.shell.forEach(function (n) { shellSet[n] = 1; });
      }
      function isShell(o) {
        while (o && o !== root) {
          if (shellSet && shellSet[o.name]) return true;
          if (!shellSet && o.name && SHELL_RE.test(o.name)) return true;
          o = o.parent;
        }
        return false;
      }
      /* На больших моделях из Blender у обшивки имена вида Cube.014, зато
         материалы названы по делу: Fuselage, Wings, DA40 Glass. Поэтому
         обшивку можно задать и списком материалов. */
      var shellMat = null;
      if (opts.shellMaterials && opts.shellMaterials.length) {
        shellMat = {};
        opts.shellMaterials.forEach(function (n) { shellMat[n] = 1; });
      }
      /* opts.shellKeep — что из основы остаётся при снятой обшивке (шасси,
         винт). Всё прочее в основе — заклёпки, надписи, рамки остекления,
         огни — висит на обшивке и уходит вместе с ней: без обшивки эта
         мелочь висит в воздухе и сбивает с толку. Слои систем не трогаем. */
      var keepRe = opts.shellKeep ? new RegExp(opts.shellKeep, 'i') : null;
      /* opts.shellDrop — узлы основы, которые уходят с обшивкой, хотя их
         материал подходит под shellKeep: в модели MSFS «шасси» (Gear.003)
         покрашены и воздухозаборники капота, днище, детали моторного отсека. */
      var dropRe = opts.shellDrop ? new RegExp(opts.shellDrop) : null;
      /* opts.shellKeepWith — оставленное из основы показывается без обшивки
         только вместе со своим слоем: винт — с двигателем, колёса и стойки —
         с узлами шасси. Иначе при выключенных слоях они висят в пустоте.
         [{ match: 'по материалу', with: ['models/…glb', …] }] */
      var keepWith = (opts.shellKeepWith || []).map(function (r) {
        return { re: new RegExp(r.match, 'i'), srcs: r.with || [] };
      });
      function keptShown(o) {
        if (!keepWith.length || !o.__file || o.__file.role !== 'base') return true;
        var km = Array.isArray(o.material) ? o.material[0] : o.material;
        var mn = (km && (km.__baseName || km.name)) || '';
        for (var i = 0; i < keepWith.length; i++) {
          if (!keepWith[i].re.test(mn)) continue;
          return keepWith[i].srcs.some(function (s) {
            /* соседний слой, показанный частично (моторама из двигателя), не в счёт */
            return files.some(function (f) {
              return f.src === s && f.on && (f.role !== 'extra' || !!f.scene) &&
                !((f.role === 'context' || f.role === 'system') && f.match);
            });
          });
        }
        return true;
      }
      function isShellMesh(o) {
        if (o.__shell != null) return o.__shell;
        if (keepRe && o.__file && o.__file.role === 'base') {
          if (dropRe && (dropRe.test(o.name) || (o.parent && dropRe.test(o.parent.name)))) return true;
          var km = Array.isArray(o.material) ? o.material[0] : o.material;
          return !keepRe.test((km && (km.__baseName || km.name)) || '');
        }
        if (shellMat && o.material) {
          var mm = Array.isArray(o.material) ? o.material : [o.material];
          for (var i = 0; i < mm.length; i++) {
            if (mm[i] && shellMat[mm[i].__baseName || mm[i].name]) return true;
          }
        }
        return isShell(o);
      }
      /* Имя узла вместе с именами родителей: сами меши часто безымянные
         (Cube.014), а осмысленное имя висит на группе выше. */
      function chainName(o) {
        var s = '';
        while (o && o !== root) { if (o.name) s += o.name + ' | '; o = o.parent; }
        return s;
      }
      /* Трассы, которые в общем виде только мешают: тонкие шланги и провода
         через всю кабину. Прячем по умолчанию, показываем вместе с системой. */
      var quietRe = opts.quiet ? new RegExp(opts.quiet, 'i') : null;
      var GENERIC = /^(cube|plane|cylinder|circle|sphere|torus|beziercurve|nurbspath|mesh|object|empty)\b[\s\d_]*/i;

      var files = [];
      /* Лампы кабины заводим сразу, погашенными: салон приходит позже планера,
         и новые источники света заставили бы перекомпилировать шейдеры всех
         уже показанных материалов. Число ламп в сцене с начала то же —
         при загрузке салона cockpit.js только ставит и зажигает их. Лампы —
         в общей группе модели: её сдвигают при кадрировании вместе с салоном. */
      var cabinPool = window.Cockpit && JSON.stringify(opts).indexOf('da40-cabin') >= 0 ? Cockpit.pool(THREE, root, LITE) : null;
      /* Основа — строка (файл) или { src, title }: колёса стоят в основе
         у каждой страницы с залом, и подписываться «Планером» им незачем. */
      baseSrc.forEach(function (s) {
        var o = typeof s === 'string' ? { src: s } : s;
        files.push({ src: o.src, role: 'base', on: true, title: o.title || opts.srcTitle });
      });
      sysDefs.forEach(function (d) {
        /* match — из чужого слоя берём только свои детали: нервюры центроплана,
           построенные вместе с воздуховодами или с узлами шасси */
        files.push({ src: d.src, role: 'system', on: true, title: d.title, plain: !!d.plain,
          match: d.match ? new RegExp(d.match, 'i') : null });
      });
      ctxDefs.forEach(function (d) {
        files.push({ src: d.src, role: 'context', on: true, title: d.title, plain: true,
          match: d.match ? new RegExp(d.match, 'i') : null,
          opacity: d.opacity != null ? d.opacity : null });
      });
      layerDefs.forEach(function (d) {
        var on = !!d.on && !(LITE && d.lite === false), members = [];
        [].concat(d.src).forEach(function (src, k) {
          var f = { src: src, role: 'extra', layer: !k, on: on, title: d.title, hint: d.hint, plain: true };
          members.push(f); files.push(f);
        });
        members[0].members = members;
      });

      var shells = [], parts = [];
      var loader = new THREE.GLTFLoader();
      if (window.MeshoptDecoder) loader.setMeshoptDecoder(window.MeshoptDecoder);

      /* Свой материал каждому мешу: иначе приглушить один узел нельзя —
         материалы в модели общие, «стальная тяга» одна на всю проводку,
         и вместе с элеронной погаснет и рулевая. Текстуры при клонировании
         не копируются, а переиспользуются по ссылке. */
      /* Сжатые координаты (KHR_mesh_quantization: целые 8/16 бит с флагом
         normalized) видеокарта разворачивает сама, а Raycaster в r128 читает
         массив как есть — и промахивается мимо всего. Для кликов держим
         обычную копию во float; видимых отличий нет. */
      var NORM = { Int8Array: 127, Uint8Array: 255, Int16Array: 32767, Uint16Array: 65535 };
      function dequantize(g) {
        var a = g && g.attributes && g.attributes.position;
        if (!a || !a.normalized) return;
        /* Слои после pack.js приходят чередованными (interleaved): позиция,
           нормаль и UV в одном буфере. Читаем поэлементно. */
        var arr = a.isInterleavedBufferAttribute ? a.data.array : a.array;
        var k = NORM[arr.constructor.name];
        if (!k) return;
        var n = a.count, dst = new Float32Array(n * 3);
        for (var i = 0; i < n; i++) {
          dst[i * 3] = Math.max(a.getX(i) / k, -1);
          dst[i * 3 + 1] = Math.max(a.getY(i) / k, -1);
          dst[i * 3 + 2] = Math.max(a.getZ(i) / k, -1);
        }
        g.setAttribute('position', new THREE.BufferAttribute(dst, 3));
        g.computeBoundingSphere();
        g.computeBoundingBox();
      }

      function adopt(f, sceneNode) {
        sceneNode.traverse(function (o) {
          /* ореолы кабины (cockpit.js) — не детали: не выбираются и не отбрасывают тень */
          if (!o.isMesh || o.name === 'glow') return;
          /* Из слоя, взятого частично (match), лишние детали не входят ни в систему,
             ни в обшивку: воздуховоды с материалом «Fuselage» иначе считались бы
             обшивкой и просвечивали вместе с ней. */
          if (f.match && !f.match.test(nameOf(o))) { o.visible = false; o.__dim = true; return; }
          dequantize(o.geometry);
          if (o.material && !Array.isArray(o.material)) {
            var base = o.material;
            o.material = base.clone();
            o.material.__baseName = base.name;
          }
          o.__file = f;
          o.__quiet = !!(quietRe && o.material && !Array.isArray(o.material) &&
            quietRe.test(o.material.__baseName || o.material.name || ''));
          o.__op = o.material && o.material.opacity != null ? o.material.opacity : 1;
          o.__tr = !!(o.material && o.material.transparent);
          o.__em = o.material && o.material.emissive ? o.material.emissive.getHex() : null;
          o.__col = o.material && o.material.color ? o.material.color.getHex() : null;
          o.__ei = o.material && o.material.emissiveIntensity != null
            ? o.material.emissiveIntensity : 1;
          if (apron && o.material && /^(Fuselage2?|Wings)$/.test(o.material.__baseName || '')) o.material.envMapIntensity = 0.6;
          o.__env = o.material && o.material.envMapIntensity != null
            ? o.material.envMapIntensity : 1;
          o.__shell = isShellMesh(o);
          (o.__shell ? shells : parts).push(o);
          if (renderer.shadowMap.enabled) o.castShadow = true;
        });
        reshadow();
      }

      /* Процент загрузки по всем файлам сразу. Сервер не всегда отдаёт
         Content-Length (сжатие на лету) — тогда показываем мегабайты. */
      var noteEl = box.querySelector('.model3d-note');
      var prog = {};
      function onProgress(src, e) {
        prog[src] = { l: e.loaded, t: e.lengthComputable ? e.total : 0 };
        if (!noteEl || !noteEl.isConnected) return;
        var l = 0, t = 0, known = true;
        Object.keys(prog).forEach(function (k) {
          l += prog[k].l; t += prog[k].t; if (!prog[k].t) known = false;
        });
        noteEl.textContent = 'Загрузка модели… ' + (known && t
          ? Math.round((l / t) * 100) + ' %'
          : (l / 1048576).toFixed(1) + ' МБ');
      }

      function loadFile(f) {
        if (f.promise) return f.promise;
        f.promise = new Promise(function (res, rej) {
          loader.load(withV(liteSrc(f.src)), function (gltf) {
            if (dead) { disposeTree(gltf.scene); rej(new Error('страница закрыта')); return; }
            f.scene = gltf.scene;
            f.scene.visible = f.on;
            root.add(f.scene);
            if (/da40-cabin/.test(f.src) && window.Cockpit) {
              try { Cockpit.live(THREE, f.scene, { lite: LITE, withV: withV, pool: cabinPool }); } catch (e) { console.warn('кабина:', e); }
            }
            adopt(f, f.scene);
            collectTiny(f.scene);
            f.clips = {};
            (gltf.animations || []).forEach(function (c) { f.clips[c.name] = c; });
            if (gltf.animations && gltf.animations.length) {
              f.mixer = new THREE.AnimationMixer(f.scene);
            }
            f.animations = gltf.animations || [];
            res(f);
          }, function (e) { onProgress(f.src, e); }, rej);
        });
        return f.promise;
      }

      var first = files.filter(function (f) { return f.on; });
      Promise.all(first.map(loadFile).concat([dictReady])).then(function () {
        box.textContent = '';
        box.appendChild(renderer.domElement);
        build();
      }).catch(function (err) {
        if (dead) return;
        box.innerHTML = '<div class="model3d-note">Не удалось загрузить модель ' +
          '<code>' + Render.esc(first.map(function (f) { return f.src; }).join(', ')) +
          '</code></div>';
        console.error(err);
      });

      /* ── Состояние сцены ─────────────────────────────────── */

      /* Уровень прозрачности обшивки: от непрозрачной до снятой.
         Полупрозрачная обшивка — главный приём разбора: механизм видно
         внутри, но понятно, где он стоит. */
      var LEVELS = opts.shellLevels || [
        { t: 'Обшивка: видна',   o: 1 },
        { t: 'Обшивка: 40 %',  o: 0.4 },
        { t: 'Обшивка: 15 %',  o: 0.15 },
        { t: 'Обшивка: снята',   o: 0 }
      ];
      var level = Math.max(0, Math.min(LEVELS.length - 1, opts.shellLevel || 0));
      var elDef = null, glow = opts.glow === 'on', sb = null;
      var elDefs = (opts.elements || []).map(function (d) {
        return { title: d.title, hint: d.hint, files: d.files || null, re: d.match ? new RegExp(d.match, 'i') : null };
      });

      function applyShell() {
        var lv = LEVELS[level];
        shells.forEach(function (o) {
          o.visible = lv.o > 0;
          if (!o.material) return;
          if (lv.o >= 1) {
            o.material.transparent = o.__tr;
            o.material.opacity = o.__op;
            o.material.depthWrite = true;
          } else {
            o.material.transparent = true;
            o.material.opacity = lv.o * o.__op;
            /* Без этого сквозь стекло не видно то, что за ним. */
            o.material.depthWrite = false;
          }
        });
        if (keepWith.length) {
          parts.forEach(function (o) {
            if (o.__file && o.__file.role === 'base') o.visible = lv.o > 0 || keptShown(o);
          });
        }
        reshadow();
      }
      /* «Обшивка» и её прозрачность отдельной цифрой: кнопка-переключатель по кругу */
      function shellLabel() {
        var o = LEVELS[level].o;
        return '<span>Обшивка</span><i>' + (o >= 1 ? '100 %' : o <= 0 ? 'нет' : Math.round(o * 100) + ' %') + '</i>';
      }
      function setLevel(n) {
        level = n;
        if (sb) {
          sb.innerHTML = shellLabel();
          sb.classList.toggle('is-on', level === 0);
        }
        applyShell();
        render();
      }

      /* Элементы системы раздела (opts.elements): выбранный остаётся в цвете,
         остальная система гаснет до призрака — видно, где он проходит
         относительно соседей. Основа и соседние детали не гаснут.
         Подсветка (glow) красит систему раздела: тяга в крыле — труба в два
         сантиметра на одиннадцать метров размаха, на светлом фоне её не найти. */
      function nameOf(o) { return norm(chainName(o)); }
      function inElement(def, o) {
        if (def.files && def.files.indexOf(o.__file.src) < 0) return false;
        return !def.re || def.re.test(nameOf(o));
      }
      function applyParts() {
        parts.forEach(function (o) {
          var f = o.__file || {};
          if ((f.role === 'context' || f.role === 'system') && f.match && !f.match.test(nameOf(o))) {
            o.visible = false; o.__dim = true; return;
          }
          var on = !(elDef && f.role === 'system') || inElement(elDef, o);
          o.__dim = !on;
          if (!o.material) return;
          var lit = f.role === 'system' && !f.plain && on && (glow || !!elDef);
          if (on && f.role === 'context' && f.opacity != null) {
            /* соседние детали, которые иначе закрывают систему (перегородка) */
            o.material.transparent = true;
            o.material.opacity = f.opacity;
            o.material.depthWrite = false;
          } else if (on) {
            o.material.transparent = o.__tr;
            o.material.opacity = o.__op;
            o.material.depthWrite = true;
          } else {
            o.material.transparent = true;
            o.material.opacity = 0.06;
            o.material.depthWrite = false;
          }
          if (o.material.emissive && !o.__sel) {
            if (lit) {
              /* слабое свечение: сильное выбеливает цвет до пастели */
              o.material.emissive.copy(LIT);
              o.material.emissiveIntensity = 0.16;
            } else if (o.__em !== null) {
              o.material.emissive.setHex(o.__em);
              o.material.emissiveIntensity = o.__ei;
            }
          }
          /* Свечение поверх белой детали выбеливает светлые цвета (шафран
             топлива, небо вентиляции) — на время подсветки красим и саму деталь. */
          if (o.material.color && o.__col != null) {
            if (lit) o.material.color.copy(LIT);
            else o.material.color.setHex(o.__col);
          }
          /* Полированный алюминий (баки, трубки) отражает небо
             и сливается с белой обшивкой — на время подсветки гасим блики. */
          if (o.material.envMapIntensity != null) {
            o.material.envMapIntensity = lit ? 0.2 : o.__env;
          }
        });
        reshadow();
      }

      /* ── Анимация ────────────────────────────────────────── */

      var current = null;
      function play(name) {
        current = name;
        files.forEach(function (f) {
          if (!f.mixer) return;
          f.mixer.stopAllAction();
          var c = f.clips[name];
          if (!c) return;
          var a = f.mixer.clipAction(c);
          /* Туда и обратно. Обычное зацикливание отыгрывает клип вперёд
             и прыжком возвращает в начало: закрылки выпускаются плавно,
             а убираются мгновенно — движение выглядит рваным. */
          a.setLoop(THREE.LoopPingPong, Infinity);
          a.clampWhenFinished = false;
          a.reset().play();
        });
      }

      function build() {
        /* Кадрируем по тому, что загружено сразу: камера встаёт так, чтобы
           модель влезла целиком. Слои потом добавляются в ту же группу. */
        var bb = new THREE.Box3().setFromObject(root);
        var size = bb.getSize(new THREE.Vector3());
        var mid = bb.getCenter(new THREE.Vector3());
        var r = Math.max(size.x, size.y, size.z) || 1;
        root.position.sub(mid);

        /* Зал: пол — под колёсами, то есть по низу габарита основы. */
        if (apron) {
          /* Земля — под шинами. Шины бывают в слое («Колёса»), а не в основе,
             поэтому высоту земли задаёт opts.groundY в координатах модели;
             без неё — низ основы. */
          var gy = (opts.groundY != null ? opts.groundY : bb.min.y) - mid.y;
          /* панорама уже пришла — студийную карту не считаем вовсе */
          var env = Scenery.showroom(THREE, scene, renderer, r, gy, 1, !!hangarEnv);
          floorY = gy + r * 0.02;
          if (hangarEnv) env = hangarEnv;
          if (env) {
            if (scene.environment && scene.environment !== env) scene.environment.dispose();
            scene.environment = env;
          }
          /* редкий случай: модель пришла раньше панорамы — подменим, когда придёт */
          if (!hangarEnv && hangarP) hangarP.then(function (h) {
            if (!h || dead) return;
            if (scene.environment) scene.environment.dispose();
            scene.environment = h;
            render();
          });
          var sc = key.shadow.camera, sr = r * 0.62;
          key.position.set(3, 5, 4).setLength(r * 3);
          sc.left = -sr; sc.right = sr; sc.top = sr; sc.bottom = -sr;
          sc.near = r * 1.5; sc.far = r * 4.5;
          sc.updateProjectionMatrix();
          reshadow();
        }

        ctrl = new THREE.OrbitControls(camera, renderer.domElement);
        ctrl.enableDamping = true;
        /* Свободное перемещение по сцене: одним пальцем (или ЛКМ) вращаем,
           двумя пальцами (ПКМ, Shift+ЛКМ) — двигаем точку обзора.
           Без этого камера намертво привязана к центру модели. */
        ctrl.enablePan = true;
        ctrl.screenSpacePanning = true;
        ctrl.panSpeed = 0.9;
        ctrl.zoomSpeed = 0.9;
        ctrl.rotateSpeed = 0.85;
        /* Чтобы модель отзывалась на вращение и когда постоянный цикл
           отключён (prefers-reduced-motion или схема ушла с экрана). */
        ctrl.addEventListener('change', render);

        /* Стартовый ракурс в долях габарита. Размах у самолёта втрое больше
           высоты, и в высоком кадре модель встаёт далеко — такому случаю
           ракурс задаётся из JSON. */
        var vm = opts.view || [0.85, 0.5, 1.15];
        /* Точка, куда смотрит камера, — в долях габарита от центра: на
           странице двигателя незачем целиться в середину крыла.
           zoom < 1 подводит камеру ближе. */
        var fc = opts.focus || [0, 0, 0], zm = opts.zoom || 1;
        /* Ракурсы из JSON подобраны под кадр 16:10. Колонка практикума выше и
           уже: отводим камеру так, чтобы по ширине влезало столько же. */
        if (inPane) {
          var aw = box.clientWidth || w, ah = box.clientHeight || h;
          zm *= Math.max(1, (1 / ratio(aw)) / (aw / ah));
        }
        var tgt = new THREE.Vector3(size.x * fc[0], size.y * fc[1], size.z * fc[2]);
        camera.position.set(tgt.x + r * vm[0] * zm, tgt.y + r * vm[1] * zm, tgt.z + r * vm[2] * zm);
        camera.near = r / 100;
        camera.far = r * 40;
        camera.updateProjectionMatrix();
        ctrl.minDistance = r * 0.012;   /* можно подойти вплотную к отдельному болту */
        ctrl.maxDistance = r * 9;
        ctrl.target.copy(tgt);
        ctrl.update();

        /* Сценарии. В одиночном файле кнопки строятся из его клипов, в сборке
           из нескольких — только из opts.scenarios: у планера свои клипы
           закрылков, и на странице топлива они ни к чему. */
        var names = opts.scenarios;
        if (!names && !multi && files[0].animations.length) {
          names = files[0].animations.map(function (c) { return { clip: c.name, title: c.name }; });
        }

        /* Состав системы — позиции с номерами в колонке текста (app.js кладёт
           туда пустой .legend и пишет его id в data-legend), как перечень
           к рисунку в каталоге деталей. Без колонки — строка кнопок, как раньше. */
        var legendHost = frame.dataset.legend ? document.getElementById(frame.dataset.legend) : null;
        function pickEl(i) {
          elDef = i < 0 ? null : elDefs[i];
          select(null);
          hideCard();
          applyParts();
          render();
          info.textContent = elDef ? (elDef.hint || elDef.title) : (opts.hint || M3_HINT);
        }
        if (elDefs.length && legendHost) {
          var lh = '<span class="label"><span>Состав системы</span><span>' + elDefs.length + ' поз.</span></span><ol>' +
            '<li><button type="button" class="is-all is-on" data-el="-1" aria-pressed="true"><span class="no">—</span><span class="t">Вся система</span>' +
            '<span class="h">' + Render.esc(opts.hint || 'Все детали системы раздела в цвете; соседние — серые, для привязки.') + '</span></button></li>';
          elDefs.forEach(function (d, i) {
            lh += '<li><button type="button" data-el="' + i + '" aria-pressed="false"><span class="no">' + (i + 1) + '</span>' +
              '<span class="t">' + Render.esc(d.title) + '</span>' + (d.hint ? '<span class="h">' + Render.esc(d.hint) + '</span>' : '') + '</button></li>';
          });
          legendHost.innerHTML = lh + '</ol>';
          legendHost.querySelectorAll('[data-el]').forEach(function (b) {
            b.addEventListener('click', function () {
              legendHost.querySelectorAll('[data-el]').forEach(function (x) {
                x.classList.remove('is-on');
                x.setAttribute('aria-pressed', 'false');
              });
              b.classList.add('is-on');
              b.setAttribute('aria-pressed', 'true');
              pickEl(+b.dataset.el);
            });
          });
        } else if (elDefs.length) {
          var eh = '<span class="fig-label">Элементы</span>' +
            '<button class="fig-btn is-on" data-el="-1" type="button">Вся система</button>';
          elDefs.forEach(function (d, i) {
            eh += '<button class="fig-btn" data-el="' + i + '" type="button">' + Render.esc(d.title) + '</button>';
          });
          bar.insertAdjacentHTML('afterbegin', '<div class="fig-row fig-row-el">' + eh + '</div>');
          bar.querySelectorAll('[data-el]').forEach(function (b) {
            b.addEventListener('click', function () {
              bar.querySelectorAll('[data-el]').forEach(function (x) { x.classList.remove('is-on'); });
              b.classList.add('is-on');
              pickEl(+b.dataset.el);
            });
          });
        }

        if (names && names.length) {
          var ch = '<span class="fig-label">Сценарий</span>';
          names.forEach(function (s, i) {
            ch += '<button class="fig-btn' + (i || multi ? '' : ' is-on') +
              '" data-clip="' + Render.esc(s.clip) + '" type="button">' + Render.esc(s.title) + '</button>';
          });
          if (legendHost) {
            legendHost.insertAdjacentHTML('beforeend', '<div class="acts">' + ch.replace('Сценарий', 'Показать работу') + '</div>');
          } else {
            bar.insertAdjacentHTML('afterbegin', '<div class="fig-row">' + ch + '</div>');
          }
          var clipRoot = legendHost || bar;
          clipRoot.querySelectorAll('[data-clip]').forEach(function (b) {
            b.addEventListener('click', function () {
              var again = b.classList.contains('is-on');
              clipRoot.querySelectorAll('[data-clip]').forEach(function (x) { x.classList.remove('is-on'); });
              /* В сборке повторное нажатие останавливает сценарий: иначе
                 закрылки качаются всё время, пока читаешь про топливо. */
              if (again && multi) {
                current = null;
                files.forEach(function (f) { if (f.mixer) f.mixer.stopAllAction(); });
                render();
                return;
              }
              b.classList.add('is-on');
              /* Механизм внутри: если обшивка ещё непрозрачная, убавляем её,
                 иначе сценарий не видно. Дальше читатель волен вернуть. */
              if (level === 0 && shells.length) setLevel(2);
              play(b.dataset.clip);
            });
          });
          /* Одиночная модель — сразу показываем первый сценарий, как раньше.
             Сборку не трогаем, пока читатель сам не попросит. */
          if (!multi) play(names[0].clip);
        }

        /* Обзорная страница: вместо систем — ссылки на разделы, где каждая
           система показана отдельно. */
        if (opts.sections && opts.sections.length && !inPane) {
          var sh2 = '<span class="fig-label">Разделы</span>';
          opts.sections.forEach(function (d) {
            sh2 += '<a class="fig-btn fig-link" href="' + Render.esc(d.href) + '">' + Render.esc(d.title) + '</a>';
          });
          bar.insertAdjacentHTML('afterbegin', '<div class="fig-row fig-row-sec">' + sh2 + '</div>');
        }

        /* Панель: слева — что показано (слои), справа — как смотреть (иконки вида). */
        var layers = document.createElement('div');
        layers.className = 'fig-layers';
        bar.appendChild(layers);
        var tools = document.createElement('div');
        tools.className = 'fig-tools';
        bar.appendChild(tools);
        function iconBtn(path, label) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'fig-btn fig-icon';
          b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '"/></svg>';
          b.setAttribute('aria-label', label);
          b.title = label;
          return b;
        }

        if (shells.length) {
          sb = document.createElement('button');
          sb.type = 'button';
          sb.className = 'fig-btn fig-shell' + (level === 0 ? ' is-on' : '');
          sb.innerHTML = shellLabel();
          sb.title = 'Прозрачность планера по кругу';
          sb.addEventListener('click', function () { setLevel((level + 1) % LEVELS.length); });
          layers.appendChild(sb);
        }

        /* Дополнительно для наглядности (салон с педалями и т. п.) — вид,
           а не другая система. */
        files.forEach(function (f) {
          if (!f.layer) return;
          var xb = document.createElement('button');
          xb.type = 'button';
          xb.className = 'fig-btn' + (f.on ? ' is-on' : '');
          xb.textContent = f.title;
          if (f.hint) xb.title = f.hint;
          xb.setAttribute('aria-pressed', f.on ? 'true' : 'false');
          xb.addEventListener('click', function () { toggleLayer(f, xb); });
          layers.appendChild(xb);
        });

        if (sysDefs.length && opts.glow !== false) {
          var gb = document.createElement('button');
          gb.type = 'button';
          gb.className = 'fig-btn' + (glow ? ' is-on' : '');
          gb.textContent = 'Подсветка';
          gb.title = 'Подсветить систему раздела';
          gb.setAttribute('aria-pressed', glow ? 'true' : 'false');
          gb.addEventListener('click', function () {
            glow = !glow;
            gb.classList.toggle('is-on', glow);
            gb.setAttribute('aria-pressed', glow ? 'true' : 'false');
            applyParts();
            render();
          });
          layers.appendChild(gb);
        }

        /* Правая кнопка и Shift+ЛКМ двигают сцену и без этого, но про них
           никто не догадается — тем более на телефоне. Явный режим «Сдвиг»
           переводит обычное перетаскивание и одно касание в перемещение. */
        var pb = iconBtn('M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5',
          'Сдвиг: перетаскивание двигает сцену вместо поворота');
        pb.addEventListener('click', function () {
          var on = !pb.classList.contains('is-on');
          pb.classList.toggle('is-on', on);
          ctrl.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
          ctrl.touches.ONE = on ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
          info.textContent = on
            ? 'режим сдвига: перетащите, чтобы подвинуть сцену'
            : M3_HINT;
        });
        tools.appendChild(pb);

        /* Приближение кнопками: на телефоне колеса нет, а щипок двумя
           пальцами попадает не всем. Кнопка работает одним касанием. */
        function dolly(k) {
          var v = camera.position.clone().sub(ctrl.target);
          var len = clamp(v.length() * k, ctrl.minDistance, ctrl.maxDistance);
          camera.position.copy(ctrl.target).add(v.setLength(len));
          ctrl.update();
          render();
        }
        [['M12 5v14M5 12h14', 'Приблизить', 0.74], ['M5 12h14', 'Отдалить', 1.35]].forEach(function (z) {
          var zb = iconBtn(z[0], z[1]);
          zb.addEventListener('click', function () { dolly(z[2]); });
          tools.appendChild(zb);
        });

        /* Запоминаем исходный вид, чтобы из любого положения вернуться */
        var home = { pos: camera.position.clone(), tgt: ctrl.target.clone() };
        var rb = iconBtn('M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4', 'Сброс вида');
        rb.addEventListener('click', function () {
          camera.position.copy(home.pos);
          ctrl.target.copy(home.tgt);
          ctrl.update();
          render();
        });
        tools.appendChild(rb);

        /* Готовые ракурсы по основным узлам: курсант одним нажатием переносит
           камеру к двигателю, шасси, кабине, оперению. Точка обзора — в долях
           габарита (как opts.focus), направление и удаление — как opts.view и
           opts.zoom; +z — нос, +x — правое крыло, +y — вверх. Полёт камеры
           плавный, чтобы было видно, откуда и куда она переместилась. */
        if (apron && opts.cams !== false) {
          var paneK = zm / (opts.zoom || 1);
          var CAMS = [
            ['Общий вид', null],
            ['Двигатель', [0, 0.02, 0.45], [0.65, 0.35, 0.6], 0.3],
            ['Кабина', [0, 0.08, 0.16], [0.55, 0.75, -0.35], 0.34],
            /* между креслами, на высоте глаз, на приборную доску: экраны G1000 и подсветка */
            ['Приборы', [0, 0.107, 0.288], [0, 0.3, -0.95], 0.07],
            ['Носовая стойка', [0, -0.22, 0.3], [0.8, 0.12, 0.6], 0.3],
            ['Основная стойка', [0.14, -0.22, 0.02], [0.85, 0.12, 0.4], 0.3],
            ['Крыло', [0.24, 0.02, 0.02], [0.35, 0.75, 0.45], 0.5],
            ['Оперение', [0, 0.22, -0.4], [0.8, 0.35, -0.75], 0.5],
            ['Сверху', [0, 0, 0], [0.001, 1.25, 0.02], 0.85]
          ];
          var camRow = document.createElement('div');
          camRow.className = 'fig-cams';
          camRow.setAttribute('role', 'group');
          camRow.setAttribute('aria-label', 'Ракурсы камеры');
          var flight = null;
          function flyTo(pos, tgt) {
            var p0 = camera.position.clone(), t0 = ctrl.target.clone(), st = performance.now(), D = reduced ? 0 : 650;
            if (flight) cancelAnimationFrame(flight);
            (function step() {
              var k = D ? Math.min(1, (performance.now() - st) / D) : 1, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
              camera.position.lerpVectors(p0, pos, e);
              ctrl.target.lerpVectors(t0, tgt, e);
              ctrl.update();
              render();
              flight = k < 1 ? requestAnimationFrame(step) : null;
            })();
          }
          CAMS.forEach(function (c, i) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'fig-cam' + (i === 0 ? ' is-on' : '');
            b.textContent = c[0];
            b.addEventListener('click', function () {
              [].forEach.call(camRow.children, function (x) { x.classList.toggle('is-on', x === b); });
              if (!c[1]) { flyTo(home.pos.clone(), home.tgt.clone()); return; }
              var t = new THREE.Vector3(size.x * c[1][0], size.y * c[1][1], size.z * c[1][2]);
              var d = new THREE.Vector3(c[2][0], c[2][1], c[2][2]).multiplyScalar(r * c[3] * paneK);
              flyTo(t.clone().add(d), t);
            });
            camRow.appendChild(b);
          });
          /* ручное вращение снимает отметку с ракурса */
          ctrl.addEventListener('start', function () {
            if (flight) return;
            [].forEach.call(camRow.children, function (x) { x.classList.remove('is-on'); });
          });
          bar.insertBefore(camRow, bar.firstChild);
        }

        /* Другая система: список разделов практикума прямо у модели — не нужно
           листать к оглавлению, и работает во весь экран. */
        if (pageNav && pageNav.length > 1) {
          var nb = document.createElement('button');
          nb.type = 'button';
          nb.className = 'fig-btn fig-nav-btn';
          nb.textContent = 'Другая система';
          nb.setAttribute('aria-expanded', 'false');
          var navBox = document.createElement('div');
          navBox.className = 'fig-row fig-nav';
          navBox.hidden = true;
          navBox.innerHTML = pageNav.map(function (n) {
            return '<a class="fig-btn' + (n.cur ? ' is-on" aria-current="page' : '') + '" href="#' + Render.esc(n.id) + '">' +
              Render.esc(n.title) + '</a>';
          }).join('');
          nb.addEventListener('click', function () {
            navBox.hidden = !navBox.hidden;
            nb.classList.toggle('is-on', !navBox.hidden);
            nb.setAttribute('aria-expanded', navBox.hidden ? 'false' : 'true');
          });
          navBox.addEventListener('click', function (e) {
            if (!e.target.closest('a')) return;
            var fe = document.fullscreenElement || document.webkitFullscreenElement;
            if (fe) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
          });
          bar.appendChild(nb);
        }

        /* Во весь экран. В ленте страницы модель всегда мелкая, особенно
           на телефоне; разворачиваем кадр целиком — вместе с кнопками,
           иначе в полноэкранном режиме нечем переключать сценарии. */
        var rfs = frame.requestFullscreen || frame.webkitRequestFullscreen;
        if (rfs) {
          var FS_IN = 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', FS_OUT = 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5';
          var fsb = iconBtn(FS_IN, 'Во весь экран');
          fsb.addEventListener('click', function () {
            if (document.fullscreenElement === frame) {
              (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            } else {
              rfs.call(frame);
            }
          });
          tools.appendChild(fsb);
          listen(document, 'fullscreenchange', function () {
            var on = document.fullscreenElement === frame;
            fsb.querySelector('path').setAttribute('d', on ? FS_OUT : FS_IN);
            fsb.setAttribute('aria-label', on ? 'Свернуть' : 'Во весь экран');
            fsb.title = on ? 'Свернуть' : 'Во весь экран';
            fsb.classList.toggle('is-on', on);
            /* Размеры приходят не сразу — даём браузеру разложить кадр. */
            setTimeout(fit, 60);
          });
        }

        /* список разделов — отдельной строкой в конце панели */
        if (navBox) bar.appendChild(navBox);

        applyShell();
        applyParts();

        /* Клик по детали — подпись по словарю, иначе имя из модели. */
        var ray = new THREE.Raycaster(), pt = new THREE.Vector2();
        function shown(o) {
          while (o) { if (!o.visible) return false; o = o.parent; }
          return true;
        }
        /* Деталь под курсором: подпись по словарю, иначе имя из модели. */
        function pick(cx, cy) {
          var b = renderer.domElement.getBoundingClientRect();
          pt.x = ((cx - b.left) / b.width) * 2 - 1;
          pt.y = -((cy - b.top) / b.height) * 2 + 1;
          ray.setFromCamera(pt, camera);
          /* Оболочка перехватывает каждый луч — кликать надо по механизму
             внутри, поэтому из выборки она исключена всегда. Приглушённые
             и выключенные узлы тоже пропускаем: иначе выбранную систему
             не ткнуть сквозь висящий перед ней призрак. Земля и небо
             зала лежат вне root и в выборку не попадают. */
          var cand = parts.filter(function (o) { return !o.__dim && shown(o); });
          var hit = ray.intersectObjects(cand, false)[0];
          if (!hit) return null;
          /* Кликнуть можно по вложенному мешу, у которого своего имени в словаре
             нет, — поднимаемся по родителям до первого известного узла. */
          var n = hit.object, label = null;
          var name = clean(pretty(hit.object.name).replace(/(\D)\d{3}$/, '$1'));
          /* Безымянные детали исходника («Cube 014», «Plane») называем
             по файлу, из которого они пришли: «Планер», «Кабина». */
          var from = hit.object.__file || {};
          if (GENERIC.test(name)) name = from.title || opts.srcTitle || 'Деталь';
          while (n && n !== root) {
            var got = labelFor(n.name);
            if (got) { label = got; break; }
            n = n.parent;
          }
          /* Материалы в модели названы по делу («DA40 steel control cable
             7x19», «turnbuckle (brass)»), поэтому показываем и их: читатель
             сразу видит, из чего деталь. */
          var mt = hit.object.material;
          var mtn = mt && !Array.isArray(mt) ? materialName(mt) : '';
          var layer = from.title && from.title !== (label || name) ? from.title : '';
          return { title: label || name || '—', mat: mtn, layer: layer && multi ? layer : '',
            el: elementOf(hit.object, label ? n : null) };
        }
        /* Деталь целиком: узел с подписью (шланг вместе со штуцерами и
           хомутами), иначе группа примитивов одного меша, иначе сам меш. */
        function meshCount(n) { var k = 0; n.traverse(function (o) { if (o.isMesh) k++; }); return k; }
        function elementOf(m, labelled) {
          if (labelled && labelled !== root && meshCount(labelled) <= 60) return labelled;
          var p = m.parent;
          if (p && p !== root && p !== (m.__file || {}).scene && p.children.length <= 12 &&
              p.children.every(function (c) { return c.isMesh; })) return p;
          return m;
        }
        /* Выбранная деталь: цветом пары к системе (у обзора — оранжевая) и видна
           насквозь — поверх обшивки и соседних деталей, чтобы было понятно,
           где и через что она проходит. */
        var xray = new THREE.MeshBasicMaterial({ color: PICK, transparent: true, opacity: 0.42,
          depthTest: false, depthWrite: false });
        xray.toneMapped = false;
        var selEl = null, selMeshes = [], overlays = [];
        function select(el) {
          selMeshes.forEach(function (o) { o.__sel = false; });
          overlays.forEach(function (x) { if (x.parent) x.parent.remove(x); });
          selMeshes = []; overlays = [];
          selEl = el;
          if (el) {
            var ms = [];
            el.traverse(function (o) { if (o.isMesh && !o.__xray && !o.__shell && o.material) ms.push(o); });
            ms.forEach(function (o) {
              o.__sel = true;
              selMeshes.push(o);
              if (o.material.emissive) {
                o.material.emissive.copy(PICK_EM);
                o.material.emissiveIntensity = 0.9;
              }
              var x = new THREE.Mesh(o.geometry, xray);
              x.__xray = true;
              x.renderOrder = 999;
              x.raycast = function () {};
              o.add(x);
              overlays.push(x);
            });
          }
          applyParts();
          render();
        }
        function frameOn(el) {
          var bb = new THREE.Box3().setFromObject(el);
          if (bb.isEmpty()) return;
          var c = bb.getCenter(new THREE.Vector3());
          var d = Math.max(bb.getSize(new THREE.Vector3()).length() * 1.6, ctrl.minDistance * 4);
          var from = { p: camera.position.clone(), t: ctrl.target.clone() };
          var dir = camera.position.clone().sub(ctrl.target).normalize();
          var to = { p: c.clone().add(dir.multiplyScalar(d)), t: c };
          var t0 = performance.now();
          (function step() {
            var k = Math.min(1, (performance.now() - t0) / 450), e = k * k * (3 - 2 * k);
            camera.position.lerpVectors(from.p, to.p, e);
            ctrl.target.lerpVectors(from.t, to.t, e);
            ctrl.update();
            render();
            if (k < 1) requestAnimationFrame(step);
          })();
        }
        /* Карточка выбранной детали поверх модели — для касаний: строка
           под моделью на планшете далеко от пальца, а в полноэкранном режиме
           её не видно вовсе. */
        var card = document.createElement('div');
        card.className = 'm3-card';
        card.hidden = true;
        box.appendChild(card);
        function hideCard() { card.hidden = true; }
        function showCard(h) {
          /* «Название: пояснение» — название крупно, пояснение строкой ниже */
          var k = h.title.indexOf(': ');
          card.innerHTML = '<button class="m3-card-x" type="button" aria-label="Закрыть">×</button>' +
            (k > 0 ? '<b>' + Render.esc(h.title.slice(0, k)) + '</b><p>' + Render.esc(h.title.slice(k + 2)) + '</p>'
                   : '<b>' + Render.esc(h.title) + '</b>') +
            (h.mat || h.layer ? '<span>' + Render.esc([h.mat, h.layer].filter(Boolean).join(' · ')) + '</span>' : '') +
            '<small>двойное касание — показать крупно</small>';
          card.hidden = false;
        }
        card.addEventListener('click', function (e) {
          if (!e.target.closest('.m3-card-x')) return;
          select(null);
          hideCard();
          info.textContent = opts.hint || M3_HINT;
        });

        /* Выбор детали: щелчок мышью или короткое касание без сдвига. */
        function choose(cx, cy, touch) {
          var h = pick(cx, cy);
          if (!h || h.el === selEl) {
            if (selEl) select(null);
            hideCard();
            info.textContent = opts.hint || M3_HINT;
            return;
          }
          select(h.el);
          info.innerHTML = '<b class="m3-sel">' + Render.esc(h.title) + '</b>' +
            (h.mat ? ' <i>· ' + Render.esc(h.mat) + '</i>' : '') +
            (h.layer ? ' <i>· ' + Render.esc(h.layer) + '</i>' : '') +
            ' <i class="m3-how">— ' + (touch ? 'двойное касание' : 'двойной щелчок') + ': показать крупно</i>';
          if (touch) showCard(h);
        }
        var cv = renderer.domElement;
        var down = null, tap = null, fingers = 0, tapAt = 0, lastTap = null;
        /* время самого касания, а не обработки: пока планшет считает кадр
           после первого касания, второе ждёт в очереди и иначе «опаздывает» */
        function stamp(e) { return e.timeStamp || performance.now(); }
        cv.addEventListener('pointerdown', function (e) {
          down = [e.clientX, e.clientY];
          if (e.pointerType === 'mouse') return;
          fingers++;
          if (fingers === 1) tap = { x: e.clientX, y: e.clientY, t: stamp(e), multi: false };
          else if (tap) tap.multi = true;
        });
        /* OrbitControls гасит touchstart (preventDefault), и браузер не
           присылает click после касания — касание ловим по pointerup сами. */
        function fingerUp(e) {
          if (e.pointerType === 'mouse') return;
          fingers = Math.max(0, fingers - 1);
          var t = tap;
          if (!fingers) tap = null;
          if (e.type !== 'pointerup' || !t || t.multi) return;
          var now = stamp(e);
          if (Math.abs(e.clientX - t.x) + Math.abs(e.clientY - t.y) > 12 || now - t.t > 500) return;
          tapAt = performance.now();
          if (lastTap && selEl && now - lastTap.t < 380 &&
              Math.abs(e.clientX - lastTap.x) + Math.abs(e.clientY - lastTap.y) < 36) {
            lastTap = null;
            frameOn(selEl);
            return;
          }
          lastTap = { x: e.clientX, y: e.clientY, t: now };
          choose(e.clientX, e.clientY, true);
        }
        cv.addEventListener('pointerup', fingerUp);
        cv.addEventListener('pointercancel', fingerUp);
        cv.addEventListener('click', function (e) {
          if (performance.now() - tapAt < 700) return;          /* касание уже обработано */
          /* после поворота мышью клик не считается выбором */
          if (down && Math.abs(e.clientX - down[0]) + Math.abs(e.clientY - down[1]) > 6) return;
          choose(e.clientX, e.clientY, false);
        });
        cv.addEventListener('dblclick', function (e) {
          if (performance.now() - tapAt < 700) return;
          var h = pick(e.clientX, e.clientY);
          if (!h) return;
          if (h.el !== selEl) select(h.el);
          frameOn(h.el);
        });
        frame.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' && selEl) { select(null); hideCard(); info.textContent = opts.hint || M3_HINT; }
        });

        /* Во весь экран подпись всплывает у курсора: кадр большой, и
           бегать глазами к строке под моделью неудобно. Пока кнопка мыши
           нажата (вращают), подпись не показываем. */
        var tip = document.createElement('div');
        tip.className = 'm3-tip';
        tip.hidden = true;
        box.appendChild(tip);
        /* Луч по всей сборке — десятки миллисекунд, поэтому деталь ищем,
           когда курсор остановился, а следом за ним только двигаем подпись. */
        var tipQ = null, tipT = 0, tipKey = '';
        function hideTip() { tip.hidden = true; tipKey = ''; clearTimeout(tipT); }
        function placeTip(e) {
          var bx = box.getBoundingClientRect();
          var x = e.clientX - bx.left + 16, y = e.clientY - bx.top + 18;
          var tw = tip.offsetWidth, th = tip.offsetHeight;
          if (x + tw > bx.width - 8) x = e.clientX - bx.left - tw - 12;
          if (y + th > bx.height - 8) y = e.clientY - bx.top - th - 12;
          tip.style.transform = 'translate(' + Math.max(4, x) + 'px,' + Math.max(4, y) + 'px)';
        }
        function showTip() {
          var e = tipQ;
          if (!e || document.fullscreenElement !== frame) { hideTip(); return; }
          var h = pick(e.clientX, e.clientY);
          if (!h) { hideTip(); return; }
          var k = h.title + '|' + h.mat + '|' + h.layer;
          if (k !== tipKey) {
            tipKey = k;
            tip.innerHTML = '<b>' + Render.esc(h.title) + '</b>' +
              (h.mat || h.layer ? '<span>' + Render.esc([h.mat, h.layer].filter(Boolean).join(' · ')) + '</span>' : '');
          }
          tip.hidden = false;
          placeTip(e);
        }
        renderer.domElement.addEventListener('pointermove', function (e) {
          if (e.pointerType === 'touch' || e.buttons) { hideTip(); return; }
          if (document.fullscreenElement !== frame) { if (!tip.hidden) hideTip(); return; }
          tipQ = e;
          if (!tip.hidden) placeTip(e);
          clearTimeout(tipT);
          tipT = setTimeout(showTip, 90);
        });
        renderer.domElement.addEventListener('pointerleave', hideTip);
        renderer.domElement.addEventListener('pointerdown', hideTip);
        renderer.domElement.addEventListener('wheel', hideTip, { passive: true });
        listen(document, 'fullscreenchange', hideTip);

        info.textContent = opts.hint || M3_HINT;
        /* Для проверки из консоли и автотестов: камера, управление, сцена. */
        frame.__m3 = { THREE: THREE, camera: camera, ctrl: ctrl, root: root, render: render };
        render();
      }

      /* Слой по кнопке. Первое включение грузит файл; пока он идёт, кнопка
         это показывает — на телефоне пара мегабайт занимает секунды. */
      function toggleLayer(f, btn) {
        /* слой из нескольких файлов: все переключаются вместе */
        if (f.members && f.members.length > 1) {
          var to = !f.on;
          f.members.forEach(function (m) { if (m.on !== to) { m.on = to; if (m.scene) m.scene.visible = to; } });
          btn.classList.toggle('is-on', to);
          btn.setAttribute('aria-pressed', to ? 'true' : 'false');
          var need = f.members.filter(function (m) { return to && !m.scene; });
          if (!need.length) { applyShell(); applyParts(); render(); return; }
          btn.classList.add('is-busy');
          info.textContent = 'Загрузка: ' + f.title + '…';
          Promise.all(need.map(loadFile)).then(function () {
            btn.classList.remove('is-busy');
            need.forEach(function (m) { m.scene.visible = m.on; });
            applyShell(); applyParts();
            if (current) play(current);
            info.textContent = f.hint || f.title;
            render();
          }).catch(function (err) { btn.classList.remove('is-busy'); console.error(err); });
          return;
        }
        f.on = !f.on;
        btn.classList.toggle('is-on', f.on);
        btn.setAttribute('aria-pressed', f.on ? 'true' : 'false');
        if (f.scene) {
          f.scene.visible = f.on;
          applyShell();
          render();
          return;
        }
        if (!f.on) return;
        btn.classList.add('is-busy');
        info.textContent = 'Загрузка: ' + f.title + '…';
        loadFile(f).then(function () {
          btn.classList.remove('is-busy');
          f.scene.visible = f.on;
          applyShell();
          applyParts();
          /* Новый кусок идущего сценария: перезапускаем всё с нуля, иначе
             он отстанет от остальных. */
          if (current) play(current);
          info.textContent = f.hint || f.title;
          render();
        }).catch(function (err) {
          btn.classList.remove('is-busy');
          f.on = false;
          f.promise = null;
          btn.classList.remove('is-on');
          info.textContent = 'Не удалось загрузить: ' + f.title;
          console.error(err);
        });
      }

      var clock = new THREE.Clock();
      loop(frame, function () {
        var dt = clock.getDelta();
        files.forEach(function (f) { if (f.mixer) f.mixer.update(dt); });
        if (current) reshadow();
        if (ctrl) ctrl.update();
        render();
      });

      /* Размер берём у самого элемента, а не у окна: схема может смонтироваться,
         пока страница ещё не разложена (скрытая вкладка, свёрнутая панель,
         поворот телефона) — тогда ширина нулевая и canvas залипает крошечным. */
      function fit() {
        var nw = Math.round(box.clientWidth);
        if (nw < 40) return;              /* ещё нет раскладки — ждём */
        var nh = inPane ? Math.max(200, Math.round(box.clientHeight))
          : document.fullscreenElement === frame
            ? Math.max(200, frame.clientHeight - bar.offsetHeight - 1)
            : Math.round(nw * ratio(nw));
        renderer.setSize(nw, nh);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        render();
      }
      var ro = null;
      if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(box); }
      listen(window, 'resize', fit);
      fit();

      cleanup = function () {
        cleanup = null;
        offs.forEach(function (off) { off(); });
        if (ro) ro.disconnect();
        files.forEach(function (f) {
          if (f.mixer) { f.mixer.stopAllAction(); if (f.scene) f.mixer.uncacheRoot(f.scene); }
        });
        if (ctrl) ctrl.dispose();
        disposeTree(scene);
        if (scene.environment) scene.environment.dispose();
        if (scene.background && scene.background.dispose) scene.background.dispose();
        renderer.renderLists.dispose();
        renderer.dispose();
        if (renderer.forceContextLoss) renderer.forceContextLoss();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        frame.__m3 = null;
      };
      if (dead) cleanup();
    }).catch(function (e) {
      box.innerHTML = '<div class="model3d-note">Не удалось загрузить Three.js. ' +
        'Проверьте подключение к сети.</div>';
      console.error(e);
    });
  };

  /* ═══════════════════════════════════════════════════════
     Кинематическая схема — упрощённый вид рисунка
     ═══════════════════════════════════════════════════════
     Схема по ГОСТ 2.770: звенья — линии, шарниры — кружки, неподвижные
     опоры — со штриховкой основания. Механизм решается как система
     жёстких связей (позиционная релаксация): тяги и рычаги сохраняют
     длину, опоры стоят на месте. Поэтому тянуть можно любую деталь —
     ручку, тягу, элерон, — а остальные звенья идут за ней так, как
     пошли бы в самолёте; ход ограничен упорами ведущего звена.
       opts.scheme — имя схемы в KIN. */
  /* Схемы лежат в kin-schemes.js (window.KIN): там только геометрия и тексты,
     здесь — решатель, отрисовка и управление. Вид схемы:
       nodes {id:[x,y]}, fixed [id] — неподвижные точки, supports {id:угол} —
       опоры со штриховкой, joints [id] — шарниры-кружки;
       bodies [{id, nodes, draw:[{l:[узлы]}|{d,cls}|{knob}], t, d}] — жёсткие звенья;
       rods [{id, a, b, cable}] — тяги (и тросы, если трос всегда натянут);
       cables [{id, a, b, via:[[x,y]…]}] — трос через ролики, длина постоянна;
       slides [{n, a:[x,y], b:[x,y]}] — точка ходит по прямой (поршень, золотник);
       guides [{id, at, dir}] — роликовые направляющие; pulleys [{id, at, r}];
       driver {body, pivot, node, range} — поворотное ведущее звено (градусы),
         или {body, lin:[dx,dy], node, range} — поступательное (единицы чертежа);
       dyn {init(st), tick(st, api, dt)} — звено, которое догоняет команду само
         (гидропривод): точки из st.pins держатся на месте, решатель — каждый кадр;
       buttons [{id, t, group}] — режимы; live(api) — то, что меняется (жидкость,
         сигналы, стрелки усилий), строкой SVG; readout(api) — показания;
       labels [{n, k, at|t|p, o}] — номера деталей; items {id:{t,d}} — подписи
         для того, что не звено; steps [{a, on, btn, t}] — «Пошагово»;
       tabs [{t, s}] — несколько схем под вкладками. */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  var FULL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';

  reg.kin = function (frame, opts) {
    var S = window.KIN && window.KIN[opts.scheme];
    if (!S) { console.warn('Нет кинематической схемы:', opts.scheme); return; }
    frame.classList.add('is-plate', 'is-kin');
    if (!S.tabs) { onUnmount(frame, kinMount(frame, S, opts.scheme)); return; }
    /* вкладки: каждая — своя схема; при переключении прежняя убирается целиком */
    frame.innerHTML = '<div class="fig-cams k-tabs">' + S.tabs.map(function (t, i) {
      return '<button class="fig-cam' + (i ? '' : ' is-on') + '" type="button" data-tab="' + i + '">' + t.t + '</button>';
    }).join('') + '</div><div class="k-host"></div>';
    var host = frame.querySelector('.k-host'), off = null;
    function open(i) {
      if (off) off();
      host.innerHTML = '';
      frame.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.toggle('is-on', +b.dataset.tab === i); });
      off = kinMount(host, S.tabs[i].s, opts.scheme + '/' + i);
    }
    frame.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { open(+b.dataset.tab); }); });
    onUnmount(frame, function () { if (off) off(); });
    open(0);
  };

  function kinMount(box, S, name) {
    /* crop — рабочая часть листа без пустых полей: схема крупнее на любом экране */
    var C = S.crop || [0, 0, S.vb[0], S.vb[1]], X0 = C[0], Y0 = C[1], W = C[2], H = C[3];
    var nodes = S.nodes || {}, P = {}, P0 = {}, fixed = {}, inDrv = {}, pins = {};
    Object.keys(nodes).forEach(function (k) { P[k] = nodes[k].slice(); P0[k] = nodes[k].slice(); });
    (S.fixed || []).forEach(function (k) { fixed[k] = 1; });
    function d0(a, b) { return Math.hypot(P0[a][0] - P0[b][0], P0[a][1] - P0[b][1]); }
    function plen(a, via, b) {
      var pts = [P[a]].concat(via, [P[b]]), L = 0;
      for (var i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      return L;
    }
    /* связи: звено — жёсткий треугольник из всех пар своих точек, тяга — отрезок */
    var bars = [], items = {}, bodies = S.bodies || [], rods = S.rods || [], cables = S.cables || [], slides = S.slides || [];
    Object.keys(S.items || {}).forEach(function (k) { items[k] = S.items[k]; });
    /* звено держит форму целиком (подгонка жёсткого поворота), тяги — длину;
       пары точек звена нужны только для проверки таблицы */
    var check = [];
    bodies.forEach(function (b) {
      items[b.id] = b;
      for (var i = 0; i < b.nodes.length; i++) for (var j = i + 1; j < b.nodes.length; j++) check.push([b.nodes[i], b.nodes[j], d0(b.nodes[i], b.nodes[j])]);
    });
    rods.forEach(function (r) { items[r.id] = r; bars.push([r.a, r.b, d0(r.a, r.b)]); });
    check = check.concat(bars);
    cables.forEach(function (c) { items[c.id] = c; c.L0 = plen(c.a, c.via, c.b); });
    (S.guides || []).forEach(function (g) { items[g.id] = g; });
    (S.pulleys || []).forEach(function (g) { items[g.id] = g; });
    var D = S.driver, lin = D && D.lin, dPiv = D && !lin ? P0[D.pivot] : null;
    if (D) items[D.body].nodes.forEach(function (n) { if (n !== D.pivot) inDrv[n] = 1; });
    var u = 0, st = { btn: {}, pins: pins };
    (S.buttons || []).forEach(function (b) { if (b.on) st.btn[b.id] = true; });
    function rot(p, c, a) {
      var cs = Math.cos(a * DEG), sn = Math.sin(a * DEG);
      return [c[0] + (p[0] - c[0]) * cs - (p[1] - c[1]) * sn, c[1] + (p[0] - c[0]) * sn + (p[1] - c[1]) * cs];
    }
    function poseDriver(a) {
      Object.keys(inDrv).forEach(function (n) { P[n] = lin ? [P0[n][0] + lin[0] * a, P0[n][1] + lin[1] * a] : rot(P0[n], dPiv, a); });
    }
    function held(n) { return fixed[n] || inDrv[n] || pins[n]; }
    /* ведущее звено стоит в положении u, опоры и закреплённые точки — на месте,
       остальные точки сдвигаются, пока все связи не вернут свою длину */
    function relax(iters) {
      var pk = Object.keys(pins);
      for (var it = 0; it < iters; it++) {
        if (D) poseDriver(u);
        for (var q = 0; q < pk.length; q++) P[pk[q]] = pins[pk[q]].slice();
        for (q = 0; q < bars.length; q++) {
          var c = bars[it % 2 ? bars.length - 1 - q : q], a = P[c[0]], b = P[c[1]];
          var wa = held(c[0]) ? 0 : 1, wb = held(c[1]) ? 0 : 1;
          if (!(wa + wb)) continue;
          var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-6, k = (L - c[2]) / L / (wa + wb);
          a[0] += dx * k * wa; a[1] += dy * k * wa; b[0] -= dx * k * wb; b[1] -= dy * k * wb;
        }
        /* трос: лишняя длина выбирается с обоих концов вдоль своих ветвей */
        cables.forEach(function (cb) {
          var e = plen(cb.a, cb.via, cb.b) - cb.L0, wa = held(cb.a) ? 0 : 1, wb = held(cb.b) ? 0 : 1;
          if (!(wa + wb) || Math.abs(e) < 1e-6) return;
          [[cb.a, cb.via.length ? cb.via[0] : P[cb.b], wa], [cb.b, cb.via.length ? cb.via[cb.via.length - 1] : P[cb.a], wb]].forEach(function (s) {
            if (!s[2]) return;
            var p = P[s[0]], dx = s[1][0] - p[0], dy = s[1][1] - p[1], L = Math.hypot(dx, dy) || 1e-6, m = e / (wa + wb) / L;
            p[0] += dx * m; p[1] += dy * m;
          });
        });
        bodies.forEach(rigid);
        slides.forEach(function (sl) {
          if (held(sl.n)) return;
          var p = P[sl.n], dx = sl.b[0] - sl.a[0], dy = sl.b[1] - sl.a[1], L2 = dx * dx + dy * dy, t = ((p[0] - sl.a[0]) * dx + (p[1] - sl.a[1]) * dy) / L2;
          p[0] = sl.a[0] + dx * t; p[1] = sl.a[1] + dy * t;
        });
      }
    }
    /* Жёсткая подгонка звена: поворот (и сдвиг), лучше всего совмещающий
       исходную форму с текущими точками. Если у звена есть закреплённая
       точка — поворот вокруг неё. Так держат форму и рычаги «в линию»,
       у которых попарные расстояния почти не мешают изгибу. */
    function rigid(b) {
      var ns = b.nodes, piv = null, i;
      for (i = 0; i < ns.length; i++) if (held(ns[i])) { if (piv) return; piv = ns[i]; }
      var c0 = [0, 0], c = [0, 0];
      if (piv) { c0 = P0[piv]; c = P[piv]; }
      else {
        ns.forEach(function (n) { c0 = [c0[0] + P0[n][0] / ns.length, c0[1] + P0[n][1] / ns.length]; c = [c[0] + P[n][0] / ns.length, c[1] + P[n][1] / ns.length]; });
      }
      var sc = 0, sd = 0;
      ns.forEach(function (n) {
        var ax = P0[n][0] - c0[0], ay = P0[n][1] - c0[1], bx = P[n][0] - c[0], by = P[n][1] - c[1];
        sd += ax * bx + ay * by; sc += ax * by - ay * bx;
      });
      var a = Math.atan2(sc, sd), cs = Math.cos(a), sn = Math.sin(a);
      ns.forEach(function (n) {
        if (held(n)) return;
        var ax = P0[n][0] - c0[0], ay = P0[n][1] - c0[1];
        P[n][0] = c[0] + ax * cs - ay * sn; P[n][1] = c[1] + ax * sn + ay * cs;
      });
    }
    /* Механизм с одной степенью свободы просчитывается заранее по всему ходу
       ведущего звена; любое положение — интерполяция таблицы: точно и дёшево
       на телефоне. Потянуть деталь — найти угол, при котором она ближе всего
       к пальцу. У схем с гидроприводом (dyn) степеней свободы больше — там
       решатель работает каждый кадр от прошлого положения. */
    var keys = Object.keys(P), TAB = [], STEP = D ? (lin ? (D.range[1] - D.range[0]) / 120 : 0.5) : 1;
    function snap() { var o = {}; keys.forEach(function (n) { o[n] = P[n].slice(); }); return o; }
    if (D && !S.dyn) {
      [1, -1].forEach(function (dir) {
        keys.forEach(function (n) { P[n] = P0[n].slice(); });
        u = 0;
        var lim = dir > 0 ? D.range[1] : D.range[0], i0 = Math.round(-D.range[0] / STEP);
        TAB[i0] = snap();
        for (var i = i0 + dir; dir > 0 ? i <= Math.round((D.range[1] - D.range[0]) / STEP) : i >= 0; i += dir) {
          var target = D.range[0] + i * STEP;
          for (var h = 1; h <= 4; h++) { u = u + (target - u) / (5 - h); relax(60); }
          u = target; relax(60);
          TAB[i] = snap();
        }
      });
      var worst = 0, where = '';
      TAB.forEach(function (T, i) {
        check.forEach(function (c) {
          var e = Math.abs(Math.hypot(T[c[1]][0] - T[c[0]][0], T[c[1]][1] - T[c[0]][1]) - c[2]);
          if (e > worst) { worst = e; where = c[0] + '–' + c[1] + ' при ' + (D.range[0] + i * STEP).toFixed(1); }
        });
      });
      if (worst > 0.5) console.warn('Схема ' + name + ': связь ' + where + ' не держит длину, ошибка ' + worst.toFixed(2));
      u = 0;
    }
    function poseAt(t) {
      var x = (clamp(t, D.range[0], D.range[1]) - D.range[0]) / STEP, i = Math.min(TAB.length - 2, Math.floor(x)), f = x - i, A = TAB[i], B = TAB[i + 1];
      var o = {};
      keys.forEach(function (n) { o[n] = [A[n][0] + (B[n][0] - A[n][0]) * f, A[n][1] + (B[n][1] - A[n][1]) * f]; });
      return o;
    }
    function setU(t) {
      if (!D) { draw(); return; }
      /* стопор: пока он стоит, ведущее звено держится в своём положении */
      var lk = S.locked ? S.locked(st) : null;
      t = clamp(lk != null ? lk : t, D.range[0], D.range[1]);
      if (S.dyn) {
        var n = Math.max(1, Math.ceil(Math.abs(t - u) / (lin ? 1 : 1.5)));
        for (var i = 0; i < n; i++) { u += (t - u) / (n - i); relax(30); }
        wake();
      } else { u = t; P = poseAt(u); }
      draw();
    }
    /* тянем любую точку: ведущее звено идёт вслед, у упора деталь дальше не
       идёт; из двух одинаково близких положений берётся ближайшее к текущему */
    function dragTo(node, p) {
      if (inDrv[node] || S.dyn) {
        if (lin) setU((p[0] - P0[node][0]) * lin[0] + (p[1] - P0[node][1]) * lin[1]);
        else {
          var a = (Math.atan2(p[1] - dPiv[1], p[0] - dPiv[0]) - Math.atan2(P0[node][1] - dPiv[1], P0[node][0] - dPiv[0])) / DEG;
          setU(a > 180 ? a - 360 : a < -180 ? a + 360 : a);
        }
        return;
      }
      var best = u, bd = Infinity;
      TAB.forEach(function (T, i) {
        var d = Math.hypot(T[node][0] - p[0], T[node][1] - p[1]) + Math.abs(D.range[0] + i * STEP - u) * 0.02 / STEP * 0.5;
        if (d < bd) { bd = d; best = D.range[0] + i * STEP; }
      });
      var lo = best - STEP, hi = best + STEP;
      for (var n = 0; n < 16; n++) {
        var m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3, p1 = poseAt(m1)[node], p2 = poseAt(m2)[node];
        if (Math.hypot(p1[0] - p[0], p1[1] - p[1]) < Math.hypot(p2[0] - p[0], p2[1] - p[1])) hi = m2; else lo = m1;
      }
      setU((lo + hi) / 2);
    }

    /* ── вёрстка ── */
    box.innerHTML = (S.view ? '<div class="k-view">' + S.view + '</div>' : '') +
      '<div class="pl-stage kin-stage" style="--ar:' + (W / H) + '"><div class="pl-art"></div><div class="pl-spots"></div>' +
      '<button class="pl-full" type="button" aria-label="Во весь экран">' + FULL_ICON + '</button></div>' +
      '<div class="pl-info" aria-live="polite"></div><ol class="pl-list"></ol>';
    var stage = box.querySelector('.pl-stage'), art = box.querySelector('.pl-art'), spotsEl = box.querySelector('.pl-spots'),
      info = box.querySelector('.pl-info'), list = box.querySelector('.pl-list');
    var root = sv('svg', { viewBox: C.join(' '), role: 'img', 'aria-label': S.title || 'Кинематическая схема' }, art);
    var gCtx = sv('g', { class: 'k-ctx' }, root), gUnder = sv('g', {}, root), gGuide = sv('g', {}, root), gRod = sv('g', {}, root),
      gBody = sv('g', {}, root), gLive = sv('g', { class: 'k-live' }, root), gFix = sv('g', {}, root), gJ = sv('g', {}, root),
      gLead = sv('g', { class: 'k-lead' }, root), gHand = sv('g', {}, root);
    (S.ctx || []).forEach(function (c) { sv('path', { d: c.d || c, class: c.cls || '' }, gCtx); });
    (S.text || []).forEach(function (t) { var e = sv('text', { x: t.x, y: t.y, class: 'k-t' + (t.cls ? ' ' + t.cls : ''), 'text-anchor': t.a || 'start' }, gCtx); e.textContent = t.t; });
    /* ролики: стоят на месте, трос огибает их */
    (S.pulleys || []).forEach(function (pu) {
      var g = sv('g', { 'data-k': pu.id, class: 'k-pulley' }, gGuide);
      sv('circle', { cx: pu.at[0], cy: pu.at[1], r: pu.r || 8 }, g);
      sv('circle', { cx: pu.at[0], cy: pu.at[1], r: 1.6, class: 'k-axle' }, g);
    });
    /* звенья рисуются в исходном положении и поворачиваются целиком */
    var bodyEls = bodies.map(function (b) {
      var g = sv('g', { 'data-k': b.id, class: 'k-body' + (b.cls ? ' ' + b.cls : '') }, b.under ? gUnder : gBody);
      (b.draw || []).forEach(function (s) {
        if (s.d) sv('path', { d: s.d, class: 'k-surf' + (s.cls ? ' ' + s.cls : '') }, g);
        if (s.l) sv('polyline', { points: s.l.map(function (n) { return P0[n].join(','); }).join(' '), class: 'k-link' + (s.cls ? ' ' + s.cls : '') }, g);
        if (s.knob) sv('circle', { cx: P0[s.knob][0], cy: P0[s.knob][1], r: 7, class: 'k-knob', 'data-knob': 1 }, g);
      });
      return g;
    });
    var rodEls = rods.map(function (r) { return sv('line', { 'data-k': r.id, class: 'k-rod' + (r.cable ? ' is-cable' : '') + (r.cls ? ' ' + r.cls : '') }, gRod); });
    var cabEls = cables.map(function (c) { return sv('polyline', { 'data-k': c.id, class: 'k-rod is-cable' + (c.cls ? ' ' + c.cls : '') }, gRod); });
    /* роликовая направляющая: два ролика по сторонам тяги, стоят на месте */
    var guideEls = (S.guides || []).map(function (g) {
      var e = sv('g', { 'data-k': g.id, class: 'k-guide' }, gGuide);
      sv('circle', { cx: g.at[0], cy: g.at[1] }, e); sv('circle', { cx: g.at[0], cy: g.at[1] }, e);
      return e;
    });
    var sup = S.supports || {};
    var fixEls = Object.keys(sup).map(function (n) { return { n: n, dir: sup[n], g: sv('g', { class: 'k-fix' }, gFix) }; });
    var joints = S.joints || [];
    var jEls = joints.map(function (n) { return sv('circle', { class: 'k-joint' + (fixed[n] ? ' is-fix' : '') }, gJ); });
    var labels = S.labels || [];
    var leads = labels.map(function (l) { return sv('line', { 'data-k': l.k }, gLead); });
    var handEls = (S.grab || []).map(function (n) {
      return sv('circle', { class: 'k-hand' + (D && n === D.node ? ' is-main' : ''), 'data-n': n }, gHand);
    });
    spotsEl.innerHTML = labels.map(function (l) {
      return '<button class="pl-spot" type="button" data-k="' + l.k + '" aria-label="' + l.n + '. ' + items[l.k].t + '">' + l.n + '</button>';
    }).join('');
    list.innerHTML = labels.map(function (l) {
      return '<li><button type="button" data-k="' + l.k + '"><b>' + l.n + '</b>' + items[l.k].t + '</button></li>';
    }).join('');
    var spotEls = spotsEl.querySelectorAll('.pl-spot');

    (S.sliders || []).forEach(function (sl) { st.sl = st.sl || {}; st.sl[sl.id] = sl.v != null ? sl.v : sl.min; });
    var slHtml = (S.sliders || []).map(function (sl) {
      return '<label class="k-sl"><span class="fig-readout">' + sl.t + '</span><input class="fig-range" type="range" data-sl="' + sl.id + '" min="' + sl.min + '" max="' + sl.max + '" step="' + (sl.step || (sl.max - sl.min) / 100) + '" value="' + st.sl[sl.id] + '" aria-label="' + sl.t + '"></label>';
    }).join('');
    var btnHtml = (S.buttons || []).map(function (b) {
      return '<button class="fig-btn k-mode" type="button" data-b="' + b.id + '">' + b.t + '</button>';
    }).join('');
    var bar = controls(box,
      (D ? '<span class="fig-readout k-in">' + (D.input || 'Ход') + '</span>' +
        '<input class="fig-range" type="range" min="' + D.range[0] + '" max="' + D.range[1] + '" step="' + (lin ? (D.range[1] - D.range[0]) / 200 : 0.5) + '" value="0" aria-label="' + (D.input || 'Ход') + '">' : '') +
      slHtml + (btnHtml ? '<span class="k-modes">' + btnHtml + '</span>' : '') +
      (S.steps ? '<span class="k-steps"><button class="fig-btn" data-act="prev" type="button" aria-label="Предыдущий шаг">←</button>' +
        '<button class="fig-btn" data-act="step" type="button">Пошагово</button>' +
        '<button class="fig-btn" data-act="next" type="button" aria-label="Следующий шаг">→</button></span>' : '') +
      '<span class="fig-readout k-out"></span>' +
      (S.source ? '<span class="fig-readout pl-src">' + S.source + '</span>' : ''));
    var range = D ? bar.querySelector('.fig-range') : null, out = bar.querySelector('.k-out');
    bar.querySelectorAll('[data-sl]').forEach(function (r) {
      r.addEventListener('input', function () {
        st.sl[r.dataset.sl] = +r.value;
        if (S.press) S.press('sl:' + r.dataset.sl, st);
        wake(); draw();
      });
    });

    /* размер значков — в пикселях экрана: на телефоне схема ужата, но
       шарниры и ролики не превращаются в точки */
    var k = 1;
    function sizeK() { var w = root.getBoundingClientRect().width || W; k = clamp(W / w, 1, 2.4); root.style.setProperty('--k', k.toFixed(2)); }
    function mid(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    function anchor(l) {
      var it = items[l.k];
      if (l.p) return l.p;
      if (l.at) return P[l.at];
      if (it.a && P[it.a]) return mid(P[it.a], P[it.b], l.t == null ? 0.5 : l.t);
      if (it.at) return it.at;
      return it.nodes ? P[it.nodes[1] || it.nodes[0]] : [0, 0];
    }
    /* угол звена относительно исходного — для показаний */
    function angleOf(id) {
      var b = items[id], p = b.nodes[0], r = b.nodes[1];
      var a = (Math.atan2(P[r][1] - P[p][1], P[r][0] - P[p][0]) - Math.atan2(P0[r][1] - P0[p][1], P0[r][0] - P0[p][0])) / DEG;
      return a > 180 ? a - 360 : a < -180 ? a + 360 : a;
    }
    function shift(n, a, b) {
      /* смещение точки n от исходного по направлению a→b (или по x) */
      if (!a) return P[n][0] - P0[n][0];
      var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      return ((P[n][0] - P0[n][0]) * dx + (P[n][1] - P0[n][1]) * dy) / L;
    }
    var api = { P: P, P0: P0, st: st, angle: angleOf, shift: shift, k: 1, u: 0 };
    box.__kin = api;                                      /* для отладки из консоли */
    function draw() {
      api.P = P; api.u = u; api.k = k;
      bodies.forEach(function (b, i) {
        var p = b.nodes[0], r = b.nodes[1] || b.nodes[0];
        var a = r === p ? 0 : Math.atan2(P[r][1] - P[p][1], P[r][0] - P[p][0]) - Math.atan2(P0[r][1] - P0[p][1], P0[r][0] - P0[p][0]);
        bodyEls[i].setAttribute('transform', 'translate(' + P[p][0].toFixed(2) + ' ' + P[p][1].toFixed(2) + ') rotate(' + (a / DEG).toFixed(3) + ') translate(' + -P0[p][0] + ' ' + -P0[p][1] + ')');
      });
      rods.forEach(function (r, i) {
        var e = rodEls[i];
        e.setAttribute('x1', P[r.a][0].toFixed(2)); e.setAttribute('y1', P[r.a][1].toFixed(2));
        e.setAttribute('x2', P[r.b][0].toFixed(2)); e.setAttribute('y2', P[r.b][1].toFixed(2));
      });
      cables.forEach(function (c, i) {
        cabEls[i].setAttribute('points', [P[c.a]].concat(c.via, [P[c.b]]).map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' '));
      });
      joints.forEach(function (n, i) { jEls[i].setAttribute('cx', P[n][0].toFixed(2)); jEls[i].setAttribute('cy', P[n][1].toFixed(2)); jEls[i].setAttribute('r', 3.4 * k); });
      gBody.querySelectorAll('[data-knob]').forEach(function (e) { e.setAttribute('r', 6 * k); });
      handEls.forEach(function (e) { var n = e.getAttribute('data-n'); e.setAttribute('cx', P[n][0]); e.setAttribute('cy', P[n][1]); e.setAttribute('r', 15 * k); });
      if (S.live) { gLive.innerHTML = S.live(api); mark(gLive); }
      labels.forEach(function (l, i) {
        var a = anchor(l), x = a[0] + l.o[0], y = a[1] + l.o[1];
        leads[i].setAttribute('x1', a[0]); leads[i].setAttribute('y1', a[1]); leads[i].setAttribute('x2', x); leads[i].setAttribute('y2', y);
        spotEls[i].style.left = ((x - X0) / W * 100) + '%'; spotEls[i].style.top = ((y - Y0) / H * 100) + '%';
      });
      if (range) range.value = u.toFixed(2);
      if (S.readout) out.innerHTML = S.readout(api);
      bar.querySelectorAll('[data-b]').forEach(function (b) { b.classList.toggle('is-on', !!st.btn[b.dataset.b]); });
    }
    function sizeStatic() {
      fixEls.forEach(function (f) {
        var p = P0[f.n], s = 9 * k, y = p[1] + s * 1.3, h = '';
        for (var x = -s * 1.4; x < s * 1.4; x += s * .45) h += 'M' + (p[0] + x) + ' ' + (y + s * .55) + 'l' + s * .45 + ' ' + -s * .55;
        f.g.innerHTML = '<path class="k-stand" d="M' + (p[0] - s * .7) + ' ' + y + 'L' + p[0] + ' ' + p[1] + 'L' + (p[0] + s * .7) + ' ' + y + '"/>' +
          '<path class="k-base" d="M' + (p[0] - s * 1.4) + ' ' + y + 'H' + (p[0] + s * 1.4) + '"/><path class="k-hatch" d="' + h + '"/>';
        /* основание нарисовано снизу; dir — куда оно смотрит (90 — вниз) */
        f.g.setAttribute('transform', 'rotate(' + (f.dir - 90) + ' ' + p[0] + ' ' + p[1] + ')');
      });
      guideEls.forEach(function (e, i) {
        var g = S.guides[i], r = 3.2 * k, o = r + 1.2 * k, v = g.dir === 'v';
        e.children[0].setAttribute('r', r); e.children[1].setAttribute('r', r);
        e.children[0].setAttribute(v ? 'cx' : 'cy', (v ? g.at[0] : g.at[1]) - o);
        e.children[1].setAttribute(v ? 'cx' : 'cy', (v ? g.at[0] : g.at[1]) + o);
      });
    }

    /* ── выделение и перечень ── */
    var sel = [], note = null;
    function mark(scope) {
      scope.querySelectorAll('[data-k]').forEach(function (e) { e.classList.toggle('is-on', sel.indexOf(e.getAttribute('data-k')) >= 0); });
    }
    function paint(text) {
      mark(box);
      stage.classList.toggle('has-sel', sel.length > 0);
      if (text) { note = text; info.innerHTML = text; return; }
      note = null;
      var it = sel.length === 1 ? items[sel[0]] : null, l = it && labels.filter(function (x) { return x.k === sel[0]; })[0];
      info.innerHTML = it ? '<b>' + (l ? l.n + '. ' : '') + it.t + '</b>' + (it.d ? ' — ' + it.d : '')
        : '<span class="pl-hint">' + (S.hint || (D ? (TOUCH ? 'Тяните ' + (D.what || 'рычаг') + ' или другую деталь пальцем' : 'Тяните ' + (D.what || 'рычаг') + ' или другую деталь мышью') + '; номер или строка перечня покажут назначение'
          : 'Нажмите на номер или строку перечня — появится назначение')) + '</span>';
    }
    box.addEventListener('click', function (e) {
      var t = e.target.closest('.pl-spot[data-k], .pl-list [data-k], [data-pick]');
      if (!t || !box.contains(t)) return;
      var id = t.getAttribute('data-k') || t.getAttribute('data-pick');
      if (t.hasAttribute('data-pick') && S.pick) { S.pick(id, st); wake(); draw(); }
      if (!items[id]) return;
      sel = sel.length === 1 && sel[0] === id ? [] : [id];
      step = -1;
      paint();
    });
    bar.querySelectorAll('[data-b]').forEach(function (b) {
      b.addEventListener('click', function () {
        var def = (S.buttons || []).filter(function (x) { return x.id === b.dataset.b; })[0];
        /* кнопка-положение: найти ход ведущего, при котором звено повёрнуто на нужный угол */
        if (def.goto && TAB.length) {
          var best = 0, bd = Infinity, bb = items[def.goto.body], p0 = bb.nodes[0], r0 = bb.nodes[1];
          TAB.forEach(function (T, i) {
            var a = (Math.atan2(T[r0][1] - T[p0][1], T[r0][0] - T[p0][0]) - Math.atan2(P0[r0][1] - P0[p0][1], P0[r0][0] - P0[p0][0])) / DEG;
            if (Math.abs(a - def.goto.deg) < bd) { bd = Math.abs(a - def.goto.deg); best = D.range[0] + i * STEP; }
          });
          sel = []; paint(def.d ? '<b>' + def.t + '</b> — ' + def.d : null);
          glide(best);
          return;
        }
        if (def.group) (S.buttons || []).forEach(function (x) { if (x.group === def.group) st.btn[x.id] = x.id === def.id; });
        else st.btn[def.id] = !st.btn[def.id];
        if (S.press) S.press(def.id, st);
        wake(); setU(u);
      });
    });

    /* ── перетаскивание: за захват — точно, по пустому месту — ход ведущего ── */
    function toVB(e) { var r = root.getBoundingClientRect(); return [X0 + (e.clientX - r.left) / r.width * W, Y0 + (e.clientY - r.top) / r.height * H]; }
    var drag = null;
    root.addEventListener('pointerdown', function (e) {
      if (e.button > 0 || !D) return;
      var h = e.target.closest('.k-hand');
      stopAnim();
      if (h) {
        drag = { n: h.getAttribute('data-n'), id: e.pointerId };
        try { root.setPointerCapture(e.pointerId); } catch (err) { /* уже отпущен */ }
        box.classList.add('is-drag');
        e.preventDefault();
      } else drag = { x0: e.clientX, a0: u, id: e.pointerId, live: false };
    });
    root.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.n) { dragTo(drag.n, toVB(e)); return; }
      var dx = e.clientX - drag.x0;
      if (!drag.live) { if (Math.abs(dx) < 5) return; drag.live = true; try { root.setPointerCapture(drag.id); } catch (err) { /* уже отпущен */ } }
      var w = root.getBoundingClientRect().width || 1;
      setU(drag.a0 + dx / w * (D.range[1] - D.range[0]) * 1.4 * (D.sense || 1));
    });
    function end() { drag = null; box.classList.remove('is-drag'); }
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    if (range) range.addEventListener('input', function () { stopAnim(); setU(+range.value); });

    /* ── гидропривод и прочее, что движется само: цикл кадров, пока движется ── */
    var raf = null, tPrev = 0, dead = false;
    function wake() {
      if (!S.dyn || raf || dead) return;
      tPrev = performance.now();
      raf = requestAnimationFrame(frameFn);
    }
    function frameFn(now) {
      raf = null;
      if (dead || !box.isConnected) return;
      var dt = Math.min(0.05, (now - tPrev) / 1000); tPrev = now;
      var moving = S.dyn.tick(st, api, reduced ? 1 : dt);
      relax(30);
      draw();
      if (moving) raf = requestAnimationFrame(frameFn);
    }
    if (S.dyn && S.dyn.init) S.dyn.init(st, api);
    api.tick = function (dt) { if (S.dyn) { S.dyn.tick(st, api, dt); relax(30); draw(); } };   /* шаг без анимации — для проверки */

    /* ── пошагово: шаг выделяет звенья, ставит механизм в нужное положение,
       включает режимы и плавно доводит до положения ── */
    var step = -1, steps = S.steps || [], anim = null;
    function stopAnim() { if (anim) cancelAnimationFrame(anim); anim = null; }
    function glide(t) {
      stopAnim();
      if (reduced) { setU(t); return; }
      var a0 = u, t0 = performance.now();
      (function f(now) {
        var x = Math.min(1, (now - t0) / 700), e = x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
        setU(a0 + (t - a0) * e);
        if (x < 1 && box.isConnected) anim = requestAnimationFrame(f); else anim = null;
      })(t0);
    }
    function goStep(n) {
      if (!steps.length) return;
      step = (n + steps.length) % steps.length;
      var s = steps[step];
      sel = (s.on || []).slice();
      if (s.btn) { Object.keys(s.btn).forEach(function (b) { st.btn[b] = s.btn[b]; }); if (S.press) S.press(null, st); wake(); }
      if (s.sl) Object.keys(s.sl).forEach(function (id) {
        st.sl[id] = s.sl[id];
        var r = bar.querySelector('[data-sl="' + id + '"]'); if (r) r.value = s.sl[id];
        wake();
      });
      if (s.a != null && D) glide(s.a); else draw();
      paint('<span class="pl-stepn">' + (step + 1) + ' / ' + steps.length + '</span> ' + s.t);
    }
    bar.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () { goStep(step + (b.dataset.act === 'prev' ? -1 : 1)); });
    });
    box.querySelector('.pl-full').addEventListener('click', function () {
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      if (stage.requestFullscreen) stage.requestFullscreen().catch(function () {});
    });
    var ro = window.ResizeObserver ? new ResizeObserver(function () { sizeK(); sizeStatic(); draw(); }) : null;
    if (ro) ro.observe(root);
    sizeK(); sizeStatic();
    if (D && S.dyn) relax(60);
    setU(0); paint();
    return function () { dead = true; if (ro) ro.disconnect(); stopAnim(); if (raf) cancelAnimationFrame(raf); };
  }
  /* ═══════════════════════════════════════════════════════
     Монтаж
     ═══════════════════════════════════════════════════════ */
  function mountAll(root) {
    var nodes = (root || document).querySelectorAll('[data-figure]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.dataset.mounted) continue;
      var fn = reg[n.dataset.figure];
      if (!fn) { console.warn('Нет схемы:', n.dataset.figure); continue; }
      n.dataset.mounted = '1';
      try {
        fn(n, n.dataset.opts ? JSON.parse(n.dataset.opts) : {});
      } catch (e) {
        console.error('Схема ' + n.dataset.figure + ':', e);
      }
    }
  }

  return {
    mountAll: mountAll, unmountAll: unmountAll, unmountFrame: unmountFrame, register: function (k, f) { reg[k] = f; },
    /* общие помощники для схем из отдельных файлов (live3d.js) */
    util: { ensureThree: ensureThree, controls: controls, driver: driver, loop: loop, onUnmount: onUnmount,
      withV: withV, clamp: clamp, TOUCH: TOUCH, LITE: LITE, AUTO: AUTO }
  };
})();
