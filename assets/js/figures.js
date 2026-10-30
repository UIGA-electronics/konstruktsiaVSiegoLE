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

  /* Поворот точки вокруг (cx, cy) на deg градусов. В SVG ось y смотрит
     вниз, поэтому положительный угол — по часовой стрелке. */
  function rot(x, y, cx, cy, deg) {
    var a = deg * DEG, c = Math.cos(a), s = Math.sin(a);
    return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
  }

  function poly(list) {
    return list.map(function (p) { return r1(p[0]) + ' ' + r1(p[1]); }).join('L');
  }
  function closed(list) { return 'M' + poly(list) + 'Z'; }

  /* Поворот набора точек вокруг (cx, cy), затем сдвиг на (dx, dy). */
  function move(list, cx, cy, deg, dx, dy) {
    return list.map(function (p) {
      var q = rot(p[0], p[1], cx, cy, deg);
      return [q[0] + (dx || 0), q[1] + (dy || 0)];
    });
  }

  /* Профиль NACA четырёхзначной серии: t — относительная толщина,
     m — относительная кривизна (максимум на 40 % хорды). Носок в (x0, y0),
     хорда c пикселей, участок хорды от a до b в долях. */
  function foilSide(x0, y0, c, t, m, a, b, upper, n) {
    n = n || 22;
    var out = [];
    for (var i = 0; i <= n; i++) {
      var u = a + (b - a) * (1 - Math.cos(Math.PI * i / n)) / 2;
      var yt = 5 * t * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u +
        0.2843 * u * u * u - 0.1036 * u * u * u * u);
      out.push([x0 + u * c, camY(y0, c, m, u) - (upper ? yt : -yt) * c]);
    }
    return out;
  }
  function camY(y0, c, m, u) {
    var p = 0.4;
    var yc = u < p ? m / (p * p) * (2 * p * u - u * u)
      : m / ((1 - p) * (1 - p)) * (1 - 2 * p + 2 * p * u - u * u);
    return y0 - yc * c;
  }
  function foilPts(x0, y0, c, t, m, a, b) {
    return foilSide(x0, y0, c, t, m, a, b, true)
      .concat(foilSide(x0, y0, c, t, m, a, b, false).reverse());
  }

  /* Стрелка из (x1, y1) в (x2, y2) одним контуром. */
  function arrow(x1, y1, x2, y2, cls, w) {
    var dx = x2 - x1, dy = y2 - y1, L = Math.sqrt(dx * dx + dy * dy);
    if (L < 3) return '';
    var ux = dx / L, uy = dy / L, h = Math.min(7, L * 0.55);
    var a = [x2 - ux * h - uy * h * 0.6, y2 - uy * h + ux * h * 0.6];
    var b = [x2 - ux * h + uy * h * 0.6, y2 - uy * h - ux * h * 0.6];
    return '<path class="' + cls + '" stroke-width="' + (w || 2.4) + '" d="M' +
      r1(x1) + ' ' + r1(y1) + 'L' + r1(x2) + ' ' + r1(y2) + 'M' + poly([a, [x2, y2], b]) + '"/>';
  }

  /* Группа кнопок-переключателей: одна нажата, остальные отжаты. */
  function pick(frame, attr, cb) {
    var bs = frame.querySelectorAll('[' + attr + ']');
    bs.forEach(function (b) {
      b.addEventListener('click', function () {
        bs.forEach(function (x) { x.classList.toggle('is-on', x === b); });
        cb(b.getAttribute(attr));
      });
    });
  }

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
     1в. Три вида проводки на одном самолёте — DA 40 NG
         (AMM 6.02.15: 27-30 руль высоты, 27-20 руль направления,
         27-38 триммер руля высоты)
     ═══════════════════════════════════════════════════════
     Жёсткая тяга — руль высоты: ручка на торсионе → короткая тяга →
     промежуточный рычаг на переднем главном шпангоуте → длинная тяга в трёх
     роликовых направляющих → качалка внизу киля → вертикальная тяга →
     кабанчик руля высоты (Т-образное оперение).
     Трос — руль направления: педали → тросы кабины (наружный через ролик
     на пультовом шпангоуте) → коромысло под центральным пультом → тросы
     фюзеляжа с тандерами, перекрещенные в хвосте → нижний кронштейн руля.
     Гибкий трос — триммер: штурвальчик → шестерня → зубчатый сектор с
     внутренними зубьями (он же указатель) → сердечник троса в оболочке →
     тяги триммера. Все тяги и тросы считаются нерастяжимыми: каждое следующее
     звено ставится по длине предыдущего. */
  reg.wiring = function (frame) {
    var q = function (id) { return frame.querySelector('#' + id); };
    var mode = 'rod', v = 0, dt = 0.5, grab = 0;

    ammPanels(frame, [
      { id: 'wA', tag: '', w: 440, h: 300, over: '<g id="wA-l"></g><circle class="a-hit" id="w-grab" r="22"/><path class="a-hit" id="w-rud"/>' },
      { id: 'wB', tag: '', w: 260, h: 300, over: '<g id="wB-l"></g><circle class="a-hit" id="w-end" r="26"/>' +
        '<rect class="a-hit" id="w-tb" x="94" y="178" width="72" height="36" rx="8"/>' }
    ]);
    frame.querySelector('.amm-grid').style.setProperty('--a', '1.7fr');
    var tags = frame.querySelectorAll('.amm-tag');
    controls(frame,
      '<div class="fig-row">' +
      '<button class="fig-btn is-on" data-w="rod" type="button">Жёсткая тяга</button>' +
      '<button class="fig-btn" data-w="cable" type="button">Трос</button>' +
      '<button class="fig-btn" data-w="bowden" type="button">Гибкий трос</button></div>' +
      '<span class="fig-label" id="w-lab">Ручка</span>' +
      '<input class="fig-range" id="wr-in" type="range" min="-100" max="100" value="0" aria-label="Ход органа управления">' +
      AUTO + '<span class="fig-readout" id="wr-out"></span>');
    var svgA = q('wA').ownerSVGElement, svgB = q('wB').ownerSVGElement;
    var out = q('wr-out');

    /* ── жёсткая тяга: руль высоты, вид слева ── */
    var T = [64, 206], I = [146, 214], B = [372, 200], E = [404, 54];
    var T_LO = [0, 24], I_S = [0, 18], I_L = [0, 34], B_D = [0, 22], B_A = [20, 0], E_H = [-22, 6];
    var L1 = dist2(tip(T, T_LO, 0), tip(I, I_S, 0));
    var L2 = dist2(tip(I, I_L, 0), tip(B, B_D, 0));
    var L3 = dist2(tip(B, B_A, 0), tip(E, E_H, 0));
    var GUIDES = [212, 262, 312];
    function elev(v) {
      var a = v * 16;
      var lo = tip(T, T_LO, a);
      var ai = follow(I, I_S, lo, L1, -45, 45);
      var il = tip(I, I_L, ai);
      var ab = follow(B, B_D, il, L2, -60, 60);
      var ba = tip(B, B_A, ab);
      var ae = follow(E, E_H, ba, L3, -50, 50);
      return { a: a, lo: lo, ai: ai, is: tip(I, I_S, ai), il: il, ab: ab, bd: tip(B, B_D, ab), ba: ba, ae: ae, eh: tip(E, E_H, ae) };
    }
    function drawRod() {
      var k = elev(v), s = '';
      s += ghost2('M146 150V262M20 226H150');
      s += '<path class="a-ln" d="M352 54Q352 48 362 48H404V60H362Q352 60 352 54Z"/>';
      /* роликовые направляющие на шпангоутах: три ролика вокруг тяги */
      GUIDES.forEach(function (x) {
        var t = (x - k.il[0]) / (k.bd[0] - k.il[0]), y = k.il[1] + (k.bd[1] - k.il[1]) * t;
        s += ghost2('M' + x + ' ' + r1(y + 26) + 'V' + r1(y - 34));
        s += '<circle class="a-ln" cx="' + x + '" cy="' + r1(y - 8.6) + '" r="4.4"/>' +
          '<circle class="a-ln" cx="' + (x - 6) + '" cy="' + r1(y + 7.4) + '" r="4.4"/>' +
          '<circle class="a-ln" cx="' + (x + 6) + '" cy="' + r1(y + 7.4) + '" r="4.4"/>';
      });
      /* ручка на торсионе */
      s += '<g transform="rotate(' + r1(k.a) + ' ' + T[0] + ' ' + T[1] + ')">' +
        '<path class="a-mv" d="M61 206V116h6v90z"/><rect class="a-mv a-grip" x="58" y="96" width="12" height="28" rx="5"/>' +
        '<path class="a-mv" d="M60 206h8v24h-8z"/></g>' +
        '<circle class="a-ln" cx="' + T[0] + '" cy="' + T[1] + '" r="9"/>' + pivot2(T, 3.4);
      s += rod2(k.lo, k.is) + lever2(I, [I_S, I_L], k.ai) + rod2(k.il, k.bd) + lever2(B, [B_D, B_A], k.ab) + rod2(k.ba, k.eh);
      /* руль высоты на шарнире, кабанчик вперёд-вниз */
      s += '<g transform="rotate(' + r1(k.ae) + ' ' + E[0] + ' ' + E[1] + ')">' +
        '<path class="a-mv a-surf" d="M400 49L440 53V55L400 59Q396 54 400 49Z"/>' +
        '<path class="a-mv" d="M404 54L382 58L386 62L404 58Z"/></g>' + pivot2(E, 3);
      /* усилия: тянем ручку — тяги растянуты, толкаем — сжаты */
      s += load2(k.lo, k.is, v, v) + load2(k.il, k.bd, v, v);
      q('wA').innerHTML = s;
      var g = tip(T, [0, -96], k.a);
      hit('w-grab', g);
      leadReset();
      q('wA-l').innerHTML =
        leader(12, 40, g, 'Ручка') +
        leader(12, 290, k.lo, 'Рычаг торсиона') +
        leader(150, 290, I, 'Промежуточный рычаг') +
        leader(206, 140, [262, (k.il[1] + k.bd[1]) / 2 - 8], 'Роликовые направляющие') +
        leader(436, 290, [336, (k.il[1] * 0.17 + k.bd[1] * 0.83)], 'Длинная тяга', 'end') +
        leader(436, 250, B, 'Качалка', 'end') +
        leader(300, 100, [388, 130], 'Вертикальная тяга', 'end') +
        leader(300, 22, k.eh, 'Кабанчик', 'end') +
        leader(436, 22, tip(E, [30, 0], k.ae), 'Руль высоты', 'end');
      var de = -k.ae;
      out.innerHTML = (Math.abs(v) < 0.06 ? 'нейтраль' : v > 0 ? 'ручка на себя — тяги <b>растянуты</b>' : 'ручка от себя — тяги <b>сжаты</b>') +
        ' · руль высоты ' + (Math.round(de) === 0 ? '0°' : (de > 0 ? '↑ ' : '↓ ') + Math.abs(Math.round(de)) + '°');
    }

    /* наконечник крупно: контрольное отверстие в трубе тяги */
    var eng = 0.5;
    function drawEnd() {
      var e = 14 + eng * 50, hole = 112, inner = 150 - e, ok = inner < hole - 4;
      var s = '';
      s += '<path class="a-ln" d="M18 132H150V164H18"/>' + ghost2('M18 136H146M18 160H146');
      s += '<path class="a-ln2" stroke-dasharray="3 3" d="M' + r1(inner) + ' 140H150M' + r1(inner) + ' 156H150M' + r1(inner) + ' 140V156"/>';
      s += '<circle class="' + (ok ? 'a-ln' : 'a-hole') + '" cx="' + hole + '" cy="148" r="3.4"/>';
      s += '<path class="a-mv" d="M150 140H200V156H150Z"/>';
      for (var x = 154; x < 198; x += 5) s += '<path class="a-ln2" stroke-width=".8" d="M' + x + ' 140l3 16"/>';
      s += '<path class="a-ln" d="M156 134H170V162H156Z"/>' +
        '<circle class="a-mv" cx="222" cy="148" r="22"/><circle class="a-ln" cx="222" cy="148" r="11"/><circle class="a-hole" cx="222" cy="148" r="4"/>';
      s += '<path class="' + (ok ? 'f-green' : 'f-red') + '" stroke-width="2" d="M' + r1(inner) + ' 176V168M' + r1(inner) + ' 172H' + hole + 'M' + hole + ' 176V168"/>';
      q('wB').innerHTML = s;
      hit('w-end', [222, 148]); hit('w-tb', null);
      leadReset();
      q('wB-l').innerHTML = leader(12, 100, [60, 132], 'Труба тяги') + leader(160, 100, [163, 134], 'Контргайка') +
        leader(250, 226, [222, 170], 'Шарнирный наконечник', 'end') + leader(12, 200, [hole, 151], 'Контрольное отверстие') +
        '<text class="a-tx ' + (ok ? 't-ok' : 't-red') + '" x="130" y="250" text-anchor="middle">' +
        (ok ? 'резьба закрывает отверстие — можно' : 'резьба не дошла до отверстия — нельзя') + '</text>' +
        '<text class="a-tx a-sm" x="130" y="268" text-anchor="middle">проволока в отверстие пройти не должна</text>';
    }

    /* ── трос: руль направления, вид сверху (нос слева, правый борт вверху) ── */
    var PL = [44, 207], PR = [44, 176], PU = [137, 200], Y = [170, 148], H = [394, 148];
    var PX = [144, 200];   /* трос сходит с ролика вертикально к переднему плечу коромысла */
    var Y_F = [-26, 0], Y_L = [6, 28], Y_R = [6, -28], H_L = [-8, 20], H_R = [-8, -20];
    var CL0 = dist2(PX, tip(Y, Y_F, 0)), CR0 = dist2(PR, tip(Y, Y_L, 0));
    var F10 = dist2(tip(Y, Y_R, 0), tip(H, H_L, 0)), F20 = dist2(tip(Y, Y_L, 0), tip(H, H_R, 0));
    function sagLine(a, b, L0, cls) {
      var L = dist2(a, b), slack = Math.max(0, L0 - L), sg = Math.min(9, Math.sqrt(3 * L * slack / 8));
      var m = [(a[0] + b[0]) / 2 - (b[1] - a[1]) / L * sg, (a[1] + b[1]) / 2 + (b[0] - a[0]) / L * sg];
      return '<path class="' + (slack > 0.2 ? 'a-cab' : cls) + '" d="M' + poly([a]) + 'Q' + r1(m[0]) + ' ' + r1(m[1]) + ' ' + r1(b[0]) + ' ' + r1(b[1]) + '"/>';
    }
    function rud(v) {
      var d = v * 12, pl = [PL[0] - d, PL[1]], pr = [PR[0] + d, PR[1]];
      var ay = v >= 0 ? follow(Y, Y_F, PX, CL0 - d, -60, 0.0001)
        : follow(Y, Y_L, pr, CR0, -0.0001, 60);
      var yr = tip(Y, Y_R, ay), yl = tip(Y, Y_L, ay), yf = tip(Y, Y_F, ay);
      /* вторую педаль оттягивает назад её трос от коромысла (AMM 27-20, п. 3) */
      if (v >= 0) pr = [yl[0] - Math.sqrt(CR0 * CR0 - (yl[1] - PR[1]) * (yl[1] - PR[1])), PR[1]];
      else pl = [PL[0] + (dist2(PX, yf) - CL0), PL[1]];
      var ah = v >= 0 ? follow(H, H_L, yr, F10, -0.0001, 60) : follow(H, H_R, yl, F20, -60, 0.0001);
      return { d: PL[0] - pl[0], pl: pl, pr: pr, ay: ay, yf: yf, yl: yl, yr: yr, ah: ah, hl: tip(H, H_L, ah), hr: tip(H, H_R, ah) };
    }
    function buckle(a, b, f) {
      var p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], ang = Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG;
      return '<g transform="translate(' + r1(p[0]) + ' ' + r1(p[1]) + ') rotate(' + r1(ang) + ')">' +
        '<rect class="a-mv" x="-10" y="-3.4" width="20" height="6.8" rx="2"/><path class="a-ln2" stroke-width=".8" d="M-5 -3.4v6.8M0 -3.4v6.8M5 -3.4v6.8"/></g>';
    }
    function drawCable() {
      var k = rud(v), s = '', pos = v >= 0;
      s += ghost2('M137 88V212');
      s += '<text class="a-tx a-sm" x="16" y="124">правый борт ↑</text>';
      /* тросы кабины */
      s += '<path class="' + (pos ? 'a-cabT' : 'a-cab') + '" d="M' + poly([k.pl, [PU[0], PU[1] + 7]]) + 'A7 7 0 0 0 ' + PX[0] + ' ' + PX[1] + '"/>';
      s += sagLine(PX, k.yf, CL0 - (pos ? k.d : 0), pos ? 'a-cabT' : 'a-cab');
      s += sagLine(k.pr, k.yl, CR0, pos ? 'a-cab' : 'a-cabT');
      s += '<circle class="a-ln" cx="' + PU[0] + '" cy="' + PU[1] + '" r="7"/>' + pivot2(PU, 2.6);
      /* тросы фюзеляжа, перекрещены */
      s += sagLine(k.yr, k.hl, F10, pos ? 'a-cabT' : 'a-cab') + sagLine(k.yl, k.hr, F20, pos ? 'a-cab' : 'a-cabT');
      s += buckle(k.yr, k.hl, 0.18) + buckle(k.yl, k.hr, 0.18);
      /* педали */
      [k.pl, k.pr].forEach(function (p) {
        s += '<rect class="a-mv" x="' + r1(p[0] - 14) + '" y="' + r1(p[1] - 7) + '" width="16" height="14" rx="2"/>';
      });
      s += lever2(Y, [Y_F, Y_L, Y_R], k.ay, 'a-mv', 6);
      /* киль и руль в плане */
      s += '<path class="a-ln" d="M352 148Q352 144 360 144L394 145V151L360 152Q352 152 352 148Z"/>';
      s += '<g transform="rotate(' + r1(k.ah) + ' ' + H[0] + ' ' + H[1] + ')"><path class="a-mv a-surf" d="M394 144.5L432 147.6V148.4L394 151.5Z"/></g>';
      s += lever2(H, [H_L, H_R], k.ah, 'a-mv', 4);
      q('wA').innerHTML = s;
      var rt = tip(H, [38, 0], k.ah);
      hit('w-grab', [k.pl[0] - 6, k.pl[1]]);
      q('w-rud').setAttribute('d', 'M' + poly([[H[0], H[1] - 16], [rt[0] + 8, rt[1] - 16], [rt[0] + 8, rt[1] + 16], [H[0], H[1] + 16]]) + 'Z');
      q('w-rud').style.display = '';
      leadReset();
      q('wA-l').innerHTML =
        leader(12, 290, k.pl, 'Педали') +
        leader(12, 30, PU, 'Ролик на пультовом шпангоуте') +
        leader(150, 290, Y, 'Коромысло') +
        leader(140, 60, [(k.yr[0] * 0.82 + k.hl[0] * 0.18), (k.yr[1] * 0.82 + k.hl[1] * 0.18) - 4], 'Тандеры') +
        leader(300, 268, [300, 162], 'Тросы перекрещены', 'middle') +
        leader(436, 290, k.hl, 'Кронштейн руля', 'end') +
        leader(436, 60, rt, 'Руль направления', 'end');
      var ar = Math.round(k.ah);
      out.innerHTML = (Math.abs(v) < 0.06 ? 'обе ветви натянуты одинаково'
        : (v > 0 ? 'левая педаль вперёд' : 'правая педаль вперёд') + ' — тянет <b class="t-red">одна ветвь</b>, другая провисает') +
        ' · руль ' + (ar === 0 ? '0°' : (ar > 0 ? 'влево ' : 'вправо ') + Math.abs(ar) + '°');
    }

    /* трос 7×19 и тандер крупно */
    var turn = 0.85;
    function drawRope() {
      var s = '<text class="a-tx a-sm" x="130" y="40" text-anchor="middle">сечение троса 7×19</text>';
      var C = [70, 92];
      for (var i = 0; i < 7; i++) {
        var a = i * Math.PI / 3, cx = C[0] + (i ? 22 * Math.cos(a) : 0), cy = C[1] + (i ? 22 * Math.sin(a) : 0);
        s += '<circle class="a-ln" cx="' + r1(cx) + '" cy="' + r1(cy) + '" r="11"/>';
        for (var j = 0; j < 7; j++) {
          var b = j * Math.PI / 3, wx = cx + (j ? 6 * Math.cos(b) : 0), wy = cy + (j ? 6 * Math.sin(b) : 0);
          s += '<circle class="a-ln" stroke-width=".5" cx="' + r1(wx) + '" cy="' + r1(wy) + '" r="2.6"/>';
        }
      }
      s += '<text class="a-tx a-sm" x="110" y="80">7 прядей</text><text class="a-tx a-sm" x="110" y="96">по 19 проволок</text>';
      /* тандер: вращение муфты стягивает или разводит концы */
      var g = 6 + turn * 26, ex = Math.round(10 - turn * 9), ok = ex <= 3;
      s += '<text class="a-tx a-sm" x="130" y="150" text-anchor="middle">тандер</text>';
      s += '<path class="a-cabT" d="M10 196H' + r1(130 - g - 18) + 'M' + r1(130 + g + 18) + ' 196H250"/>';
      s += '<path class="a-mv" d="M' + r1(130 - g - 22) + ' 192H' + r1(130 - 22) + 'V200H' + r1(130 - g - 22) + 'Z"/>' +
        '<path class="a-mv" d="M' + r1(130 + 22) + ' 192H' + r1(130 + g + 22) + 'V200H' + r1(130 + 22) + 'Z"/>';
      s += '<rect class="a-ln" x="98" y="186" width="64" height="20" rx="4"/>';
      for (var t = 0; t < 7; t++) s += '<path class="a-ln2" stroke-width=".8" d="M' + r1(104 + ((t * 9 + turn * 40) % 56)) + ' 186v20"/>';
      q('wB').innerHTML = s;
      hit('w-end', null); hit('w-tb', true);
      leadReset();
      q('wB-l').innerHTML = leader(12, 240, [100, 196], 'Муфта') + leader(250, 240, [130 + g + 12, 196], 'Наконечник', 'end') +
        '<text class="a-tx ' + (ok ? 't-ok' : 't-red') + '" x="130" y="270" text-anchor="middle">' +
        'снаружи ' + ex + ' нит' + (ex === 1 ? 'ка' : ex > 1 && ex < 5 ? 'ки' : 'ок') + ' резьбы — ' + (ok ? 'можно' : 'мало ввёрнуто') + '</text>' +
        '<text class="a-tx a-sm" x="130" y="288" text-anchor="middle">тяните муфту — она вращается</text>';
    }

    /* ── гибкий трос: триммер руля высоты ── */
    var W = [92, 112], RW = 50, RG = 9, S = [128, 240];
    var RS = dist2(S, W) + RG;
    var SEG0 = Math.atan2(W[1] - S[1], W[0] - S[0]);
    /* шаровая опора сидит на самом секторе, ниже штурвальчика: при повороте
       сектора она ходит почти горизонтально — вдоль троса */
    var STUD = [RS * 0.42 * Math.cos(SEG0 + 0.3), RS * 0.42 * Math.sin(SEG0 + 0.3)];
    var AN = [236, Math.round(S[1] + STUD[1])];
    var Th = [190, 112], TH_HORN = [-4, 16], CB = [50, 222];
    var LT = dist2([CB[0], CB[1]], tip(Th, TH_HORN, 0));
    function trim(v) {
      var w = v * 330, sg = w * RG / RS;            /* шестерня и сектор с внутренними зубьями вращаются в одну сторону */
      var st = tip(S, STUD, sg), st0 = tip(S, STUD, 0);
      var ux = AN[0] - st0[0], uy = AN[1] - st0[1], ul = Math.sqrt(ux * ux + uy * uy);
      var ds = ((st[0] - st0[0]) * ux + (st[1] - st0[1]) * uy) / ul;   /* ход сердечника */
      var cb = [CB[0] - ds * 0.45, CB[1]];   /* нос вверх — сердечник тянет, триммер вниз */
      var at = follow(Th, TH_HORN, cb, LT, -40, 40);
      return { w: w, sg: sg, st: st, ds: ds, cb: cb, at: at, th: tip(Th, TH_HORN, at) };
    }
    function drawBowden() {
      var k = trim(v), s = '';
      s += ghost2('M8 60H250M8 270H250M160 60V270');
      /* сектор с внутренними зубьями — он же указатель */
      var a0 = SEG0 - 0.42, a1 = SEG0 + 0.42, seg = '';
      var p0 = [S[0] + RS * Math.cos(a0), S[1] + RS * Math.sin(a0)], p1 = [S[0] + RS * Math.cos(a1), S[1] + RS * Math.sin(a1)];
      seg += '<path class="a-mv" d="M' + poly([S]) + 'L' + poly([[S[0] + (RS + 12) * Math.cos(a0), S[1] + (RS + 12) * Math.sin(a0)]]) +
        'A' + r1(RS + 12) + ' ' + r1(RS + 12) + ' 0 0 1 ' + poly([[S[0] + (RS + 12) * Math.cos(a1), S[1] + (RS + 12) * Math.sin(a1)]]) + 'Z"/>';
      for (var a = a0 + 0.03; a < a1; a += 0.045) {
        seg += '<path class="a-ln2" stroke-width="1" d="M' + poly([[S[0] + RS * Math.cos(a), S[1] + RS * Math.sin(a)],
          [S[0] + (RS + 4) * Math.cos(a), S[1] + (RS + 4) * Math.sin(a)]]) + '"/>';
      }
      var mk = [S[0] + (RS + 12) * Math.cos(SEG0), S[1] + (RS + 12) * Math.sin(SEG0)];
      seg += '<path stroke="#fff" stroke-width="2.2" d="M' + poly([[S[0] + (RS - 2) * Math.cos(SEG0), S[1] + (RS - 2) * Math.sin(SEG0)], mk]) + '"/>';
      s += '<g transform="rotate(' + r1(k.sg) + ' ' + S[0] + ' ' + S[1] + ')">' + seg + '</g>' + pivot2(S, 4);
      /* шкала указателя на крышке */
      [[-0.33, 'нос ↓'], [0, 'взлёт'], [0.33, 'нос ↑']].forEach(function (m) {
        var aa = SEG0 + m[0] * 0.5, r = RS + 20;
        s += '<text class="a-tx a-sm" x="' + r1(S[0] + r * Math.cos(aa)) + '" y="' + r1(S[1] + r * Math.sin(aa)) + '" text-anchor="middle">' + m[1] + '</text>';
      });
      /* штурвальчик с насечкой и шестерня */
      var hw = '<circle class="a-ln" cx="' + W[0] + '" cy="' + W[1] + '" r="' + RW + '"/><circle class="a-ln" cx="' + W[0] + '" cy="' + W[1] + '" r="' + (RW - 8) + '"/>';
      for (var n = 0; n < 36; n++) {
        var b = n * 10 * DEG;
        hw += '<path class="a-ln2" stroke-width=".8" d="M' + poly([[W[0] + (RW - 8) * Math.cos(b), W[1] + (RW - 8) * Math.sin(b)], [W[0] + RW * Math.cos(b), W[1] + RW * Math.sin(b)]]) + '"/>';
      }
      hw += '<circle class="a-mv" cx="' + W[0] + '" cy="' + W[1] + '" r="' + RG + '"/>';
      s += '<g transform="rotate(' + r1(k.w) + ' ' + W[0] + ' ' + W[1] + ')">' + hw + '</g>' + pivot2(W, 3);
      /* сердечник от шаровой опоры до упора оболочки, оболочка уходит в хвост */
      s += '<path class="a-ln2" d="M' + poly([k.st, AN]) + '"/>';
      s += '<path class="a-bow" d="M' + AN[0] + ' ' + AN[1] + 'C300 200 330 150 440 150"/>';
      s += '<path class="a-ln" d="M' + (AN[0] - 4) + ' ' + (AN[1] - 12) + 'h8v24h-8z"/>';
      s += '<circle class="a-mv" cx="' + r1(k.st[0]) + '" cy="' + r1(k.st[1]) + '" r="5"/>';
      q('wA').innerHTML = s;
      hit('w-grab', [W[0], W[1] - RW + 4]);
      leadReset();
      q('wA-l').innerHTML =
        leader(12, 24, [W[0] - 30, W[1] - 40], 'Штурвальчик') +
        leader(12, 290, [S[0] - 40, S[1] - 20], 'Сектор с внутренними зубьями') +
        leader(300, 120, k.st, 'Шаровая опора', 'end') +
        leader(300, 260, [AN[0], AN[1] + 12], 'Упор оболочки', 'middle') +
        leader(436, 120, [380, 157], 'Трос в оболочке', 'end');
      drawTab(k);
      var at = Math.round(k.at);
      out.innerHTML = 'сердечник ' + (Math.abs(k.ds) < 0.5 ? 'в нейтрали' : k.ds > 0 ? '<b>тянет</b>' : '<b>толкает</b>') + ' · триммер ' +
        (at === 0 ? '0°' : (at > 0 ? '↓ ' : '↑ ') + Math.abs(at) + '°') + ' · ' + (Math.abs(v) < 0.06 ? 'взлётное положение' : v > 0 ? 'нос вверх' : 'нос вниз');
    }
    function drawTab(k) {
      var s = '';
      s += '<path class="a-ln" d="M14 108Q14 98 30 98L190 108V116L30 118Q14 118 14 108Z"/>';
      s += '<g transform="rotate(' + r1(k.at) + ' ' + Th[0] + ' ' + Th[1] + ')"><path class="a-mv a-surf" d="M190 108L238 111.4V112.6L190 116Z"/>' +
        '<path class="a-mv" d="M190 112L186 128L192 128L194 114Z"/></g>' + pivot2(Th, 2.6);
      s += '<path class="a-bow" d="M-10 222H' + (CB[0] - 18) + '"/>';
      s += '<path class="a-ln" d="M' + (CB[0] - 22) + ' 212H' + (CB[0] + 30) + 'V232H' + (CB[0] - 22) + 'Z"/>';
      s += '<path class="a-ln2" d="M' + (CB[0] - 18) + ' 222H' + r1(k.cb[0]) + '"/>';
      s += rod2(k.cb, k.th);
      q('wB').innerHTML = s;
      hit('w-end', null); hit('w-tb', null);
      leadReset();
      q('wB-l').innerHTML = leader(12, 60, [60, 106], 'Руль высоты') + leader(250, 60, tip(Th, [30, 0], k.at), 'Триммер', 'end') +
        leader(12, 270, [CB[0], 232], 'Демпфер трения') + leader(250, 270, [(k.cb[0] + k.th[0]) / 2 + 4, (k.cb[1] + k.th[1]) / 2], 'Тяга триммера', 'end');
    }

    var VIEWS = {
      rod: { a: 'А · руль высоты, вид слева', b: 'Б · наконечник', lab: 'Ручка', main: drawRod, side: drawEnd,
        note: 'жёсткая тяга работает и на растяжение, и на сжатие' },
      cable: { a: 'А · руль направления, вид сверху', b: 'Б · трос и тандер', lab: 'Педали', main: drawCable, side: drawRope,
        note: 'трос работает только на растяжение, поэтому ветвей две' },
      bowden: { a: 'А · штурвальчик триммера', b: 'Б · триммер руля высоты', lab: 'Штурвальчик', main: drawBowden, side: function () {},
        note: 'сердечник ходит в оболочке и толкает, и тянет' }
    };
    /* Зоны захвата постоянные: перерисовка вида не трогает элемент под
       пальцем, иначе перетаскивание обрывалось бы на первом кадре. */
    function hit(id, p) {
      var el = q(id);
      if (!p) { el.style.display = 'none'; return; }
      el.style.display = '';
      if (p.length) { el.setAttribute('cx', r1(p[0])); el.setAttribute('cy', r1(p[1])); }
    }
    function grabDir() { return mode === 'rod' ? [96 * Math.sin(16 * DEG), 0] : mode === 'cable' ? [-22, 0] : [RW * 330 * DEG, 0]; }
    function setV(x) { v = clamp(x, -1, 1); rng.value = Math.round(v * 100); paint(); }
    function paint() {
      if (mode !== 'cable') q('w-rud').style.display = 'none';
      VIEWS[mode].main();
    }
    function show(id) {
      mode = id;
      var m = VIEWS[id];
      tags[0].textContent = m.a; tags[1].textContent = m.b;
      q('w-lab').textContent = m.lab;
      m.side();
      paint();
    }
    var rng = q('wr-in');
    var drv = driver(rng, function (x) { v = x / 100; paint(); }, 300, frame.querySelector('.fig-auto'));
    dragAlong(q('w-grab'), svgA, function () { drv.stop(); return v; }, setV, grabDir);
    dragAlong(q('w-rud'), svgA, function () { drv.stop(); return v; }, setV, function () { return [0, 38 * Math.sin(25 * DEG)]; });
    dragAlong(q('w-end'), svgB, function () { return eng * 2 - 1; }, function (x) { eng = (x + 1) / 2; drawEnd(); }, function () { return [-50, 0]; });
    dragAlong(q('w-tb'), svgB, function () { return turn * 2 - 1; }, function (x) { turn = (x + 1) / 2; drawRope(); }, function () { return [60, 0]; });
    pick(frame, 'data-w', show);
    show('rod');
    loop(frame, function () { drv.tick(); });
  };

  /* ═══════════════════════════════════════════════════════
     1г. Три способа стопорения рулей: порыв ветра и стопор
     ═══════════════════════════════════════════════════════ */
  reg.locks = function (frame) {
    /* Три способа стопорения. Порыв ветра раскачивает поверхность, пока
       стопор снят; со стопором она стоит. Тянуть можно саму поверхность или
       ручку — со стопором они лишь вздрагивают.
       Gust lock DA 40 NG — по AMM 10-10: педали до упора назад, замок
       заводится на педали, ручки пристёгиваются ремнями и затягиваются.
       Через жёсткую проводку замок в кабине держит и рули. */
    var q = function (id) { return frame.querySelector('#' + id); };
    ammPanels(frame, [
      { id: 'lkA', tag: '', w: 420, h: 260, over: '<g id="lkA-l"></g><circle class="a-hit" id="lk-grab" r="22"/>' },
      { id: 'lkB', tag: '', w: 300, h: 260, over: '<g id="lkB-l"></g><path class="a-hit" id="lk-surf"/>' }
    ]);
    var grid = frame.querySelector('.amm-grid'), views = frame.querySelectorAll('.amm-view'), tags = frame.querySelectorAll('.amm-tag');
    controls(frame,
      '<div class="fig-row">' +
      '<button class="fig-btn" data-l="clamp" type="button">Струбцина</button>' +
      '<button class="fig-btn is-on" data-l="gust" type="button">Gust lock DA 40 NG</button>' +
      '<button class="fig-btn" data-l="electro" type="button">Электромеханическое</button></div>' +
      '<button class="fig-btn" id="lk-btn" type="button">Поставить стопор</button>' +
      '<span class="fig-readout" id="lk-out"></span>');
    var svgA = q('lkA').ownerSVGElement, svgB = q('lkB').ownerSVGElement;
    var btn = q('lk-btn'), out = q('lk-out');
    var view = 'gust', locked = false, p = 0, hand = null, handT = 0, shake = 0, pin = 0;
    var NOTE = {
      clamp: 'ставит техник на стоянке; флажок «снять перед полётом» видно снаружи',
      gust: 'ставит экипаж в кабине: держит ручки и педали, а через проводку — и рули',
      electro: 'магистральные ВС: штырь входит в отверстие нервюры по команде из кабины'
    };

    /* порыв: медленная огибающая и быстрые толчки */
    function gust(t) {
      var g = 0.55 + 0.45 * Math.sin(t * 0.017) * Math.sin(t * 0.0071 + 1);
      return { g: g, a: g * (0.65 * Math.sin(t * 0.19) + 0.35 * Math.sin(t * 0.31 + 2)) };
    }
    function wind(g, w, h) {
      var s = '';
      [0.16, 0.26, 0.74, 0.84].forEach(function (y) {
        s += '<path class="f-air f-flow" opacity="' + r1(0.25 + 0.75 * g) + '" d="M0 ' + r1(h * y) + 'H' + w + '"/>';
      });
      return s;
    }
    /* профиль с поверхностью на шарнире: nose — носок, c — хорда, hu — доля хорды шарнира */
    function foilHinge(x0, y0, c, hu, a, tint) {
      var hx = x0 + hu * c, hy = camY(y0, c, 0.02, hu);
      return { hx: hx, hy: hy, s: '<g transform="rotate(' + r1(a) + ' ' + r1(hx) + ' ' + r1(hy) + ')"><path class="a-mv ' + (tint || 'a-surf') + '" d="' +
        closed(foilPts(x0, y0, c, 0.12, 0.02, hu - 0.02, 1)) + '"/></g>' +
        '<path class="a-ln" d="' + closed(foilPts(x0, y0, c, 0.12, 0.02, 0, hu + 0.01)) + '"/>' + pivot2([hx, hy], 3) };
    }

    function paint(t) {
      var G = gust(t), free = 1 - p;
      var a = hand !== null ? hand : clamp(G.a * 18, -18, 18) * free;
      if (hand !== null && locked) a = shake;             /* застопорено: только дрожь */
      var sA = '', sB = '', lA = '', lB = '', surfD = '';
      leadReset();
      if (view === 'gust') {
        /* кабина, вид слева: педали, ручка; руль высоты — вид Б */
        var el = a, st = el * 0.9;                         /* ручка ходит с рулём: проводка жёсткая */
        var ped = -16 * p;
        sA += ghost2('M10 222H410M300 222V120Q300 96 330 96H380');
        sA += '<g transform="rotate(' + r1(ped) + ' 74 214)"><path class="a-mv" d="M71 214L66 168h8l3 46z"/><rect class="a-mv" x="58" y="158" width="20" height="12" rx="2"/></g>' + pivot2([74, 214], 3.4);
        sA += '<g transform="rotate(' + r1(st) + ' 210 206)"><path class="a-mv" d="M207 206V112h6v94z"/><rect class="a-mv a-grip" x="204" y="92" width="12" height="28" rx="5"/></g>' +
          '<circle class="a-ln" cx="210" cy="206" r="9"/>' + pivot2([210, 206], 3.4);
        var pp = tip([74, 214], [-6, -50], ped), gk = tip([210, 206], [0, -76], st);
        /* замок: рама от педалей к ручке и ремень вокруг ручки */
        sA += '<g style="opacity:' + r1(p) + '" transform="translate(' + r1(-40 * free) + ' ' + r1(-30 * free) + ')">' +
          '<path class="a-lock" d="M' + poly([pp, [pp[0] + 30, pp[1] - 4], [gk[0] - 10, gk[1] + 6]]) + '"/>' +
          '<path class="a-strap" d="M' + r1(gk[0] - 10) + ' ' + r1(gk[1] - 4) + 'h20v12h-20z"/>' +
          '<path class="a-lock" d="M' + r1(pp[0] - 10) + ' ' + r1(pp[1] - 6) + 'h20"/>' +
          '<text class="a-tx t-red" x="' + r1((pp[0] + gk[0]) / 2 - 10) + '" y="' + r1(Math.min(pp[1], gk[1]) - 22) + '" text-anchor="middle">GUST LOCK</text></g>';
        lA += leader(12, 24, [68, 160], 'Педали') + leader(300, 24, gk, 'Ручка', 'middle');
        var F = foilHinge(20, 130, 260, 0.62, el);
        sB += wind(G.g, 300, 260) + F.s;
        surfD = 'M' + poly(move(foilPts(20, 130, 260, 0.12, 0.02, 0.6, 1), F.hx, F.hy, el)) + 'Z';
        lB += leader(14, 236, [80, 132], 'Стабилизатор') + leader(286, 236, tip([F.hx, F.hy], [80, 0], el), 'Руль высоты', 'end');
        q('lk-grab').setAttribute('cx', r1(gk[0])); q('lk-grab').setAttribute('cy', r1(gk[1]));
      } else if (view === 'clamp') {
        var C = foilHinge(20, 130, 380, 0.72, a, 'a-surf');
        sA += wind(G.g, 420, 260) + C.s;
        /* струбцина обжимает заднюю часть крыла и элерон, флажок свисает вниз */
        var cx = C.hx - 6;
        sA += '<g style="opacity:' + r1(p) + '" transform="translate(0 ' + r1(-80 * free) + ')">' +
          '<path class="a-lock" d="M' + (cx - 34) + ' 112H' + (cx + 52) + 'M' + (cx - 34) + ' 146H' + (cx + 52) + 'M' + (cx + 52) + ' 112V146"/>' +
          '<path class="a-strap" d="M' + (cx - 40) + ' 108h12v8h-12zM' + (cx - 40) + ' 142h12v8h-12z"/>' +
          '<path class="a-ln2" d="M' + (cx + 52) + ' 146V196"/><path class="a-flag" d="M' + (cx + 52) + ' 196h70v18h-70z"/>' +
          '<text class="a-tx" fill="#fff" x="' + (cx + 87) + '" y="209" text-anchor="middle" style="fill:#fff;font-size:9px">REMOVE BEFORE FLIGHT</text></g>';
        surfD = 'M' + poly(move(foilPts(20, 130, 380, 0.12, 0.02, 0.7, 1), C.hx, C.hy, a)) + 'Z';
        lA += leader(14, 236, [120, 132], 'Крыло') + leader(406, 40, tip([C.hx, C.hy], [80, 0], a), 'Элерон', 'end');
      } else {
        /* руль направления, вид сверху: на нервюре отверстие, штырь от электромеханизма */
        var LOCKA = 8;
        if (pin > 0) a = LOCKA + (hand !== null && pin > 0.98 ? shake : 0);   /* штырь вошёл — руль держит */
        var E = foilHinge(20, 110, 380, 0.7, a, 'a-surf');
        var H = [E.hx, E.hy], hole = tip(H, [0, 34], LOCKA);
        sA += wind(G.g, 420, 260) + E.s;
        sA += '<g transform="rotate(' + r1(a) + ' ' + r1(H[0]) + ' ' + r1(H[1]) + ')"><path class="a-mv" d="M' + r1(H[0] - 5) + ' ' + r1(H[1]) + 'h10v40h-10z"/>' +
          '<circle class="a-ln" cx="' + r1(H[0]) + '" cy="' + r1(H[1] + 34) + '" r="4"/></g>';
        var px = hole[0] - 62 + 52 * pin;
        sA += '<rect class="a-ln" x="' + r1(hole[0] - 120) + '" y="' + r1(hole[1] - 10) + '" width="58" height="20"/>' +
          '<path class="a-lock" d="M' + r1(hole[0] - 62) + ' ' + r1(hole[1]) + 'H' + r1(px) + '"/>';
        sA += '<rect class="a-ln" x="14" y="16" width="130" height="38"/><text class="a-tx a-sm" x="79" y="30" text-anchor="middle">панель стопорения</text>' +
          '<rect x="20" y="36" width="118" height="12" fill="' + (pin > 0.98 ? 'var(--green-ink)' : locked ? 'var(--amber-ink)' : '#e3e7ec') + '"/>' +
          '<text class="a-tx a-sm" x="79" y="46" text-anchor="middle" style="fill:' + (pin > 0.02 || locked ? '#fff' : '#5f6a82') + '">' +
          (pin > 0.98 ? 'застопорено' : locked ? 'ждёт совпадения' : 'стопоры сняты') + '</text>';
        surfD = 'M' + poly(move(foilPts(20, 110, 380, 0.12, 0.02, 0.68, 1), H[0], H[1], a)) + 'Z';
        lA += leader(14, 236, [hole[0] - 90, hole[1] + 10], 'Электромеханизм') +
          leader(406, 236, tip(H, [0, 38], a), 'Нервюра руля с отверстием', 'end') +
          leader(406, 40, tip(H, [80, 0], a), 'Руль направления', 'end');
        if (locked && pin < 1 && Math.abs(a - LOCKA) < 2.5) pin = Math.min(1, pin + 0.08);
        if (!locked) pin = Math.max(0, pin - 0.08);
      }
      q('lkA').innerHTML = sA; q('lkA-l').innerHTML = lA;
      q('lkB').innerHTML = sB; q('lkB-l').innerHTML = lB;
      var hit = q('lk-surf');
      if (view === 'gust') { hit.setAttribute('d', surfD); }
      else { svgA.appendChild(hit); hit.setAttribute('d', surfD); }
      var still = view === 'electro' ? pin > 0.98 : p > 0.98;
      out.textContent = (hand !== null && still ? 'застопорено — поверхность не поддаётся · ' : '') + NOTE[view];
    }

    function show(id) {
      view = id;
      var two = id === 'gust';
      views[1].style.display = two ? '' : 'none';
      grid.style.setProperty('--a', two ? '1.3fr' : '1fr');
      grid.style.gridTemplateColumns = two ? '' : 'minmax(0, 620px)';
      grid.style.justifyContent = 'center';
      grid.style.background = two ? '' : '#fff';
      tags[0].textContent = id === 'gust' ? 'А · кабина, вид слева' : id === 'clamp' ? 'Сечение крыла у элерона' : 'Руль направления, вид сверху';
      tags[1].textContent = 'Б · руль высоты на ветру';
      q('lk-grab').style.display = two ? '' : 'none';
      if (two) svgB.appendChild(q('lk-surf'));
    }
    function setLock(on) {
      locked = on;
      btn.textContent = on ? 'Снять стопор' : 'Поставить стопор';
      btn.classList.toggle('is-on', on);
    }
    btn.addEventListener('click', function () { setLock(!locked); });
    pick(frame, 'data-l', function (id) { show(id); setLock(false); p = 0; pin = 0; });

    /* руками: пока стопор снят, поверхность идёт за пальцем; со стопором — дрожь */
    function grabber(el, svgEl, dir) {
      dragger(el, svgEl, function () { hand = 0; handT = 0; },
        function (dx, dy) {
          var x = clamp((dx * dir[0] + dy * dir[1]) / (dir[0] * dir[0] + dir[1] * dir[1]), -1, 1) * 18;
          if (locked && (view !== 'electro' || pin > 0.98)) { shake = clamp(x * 0.04, -0.8, 0.8); hand = shake; }
          else hand = x;
        },
        function () { hand = null; });
    }
    grabber(q('lk-grab'), svgA, [76 * Math.sin(16 * DEG), 0]);
    grabber(q('lk-surf'), svgB, [0, 90 * Math.sin(18 * DEG)]);
    show('gust');
    setLock(false);
    var last = 0;
    loop(frame, function (t) {
      last = t;
      var target = view === 'electro' ? 0 : locked ? 1 : 0;
      p = clamp(p + (target > p ? 0.03 : -0.03), 0, 1);
      if (view === 'electro') p = 0;
      paint(t);
    });
  };

  /* ═══════════════════════════════════════════════════════
     Чертёж «как в AMM»: изометрия по трёхмерным точкам
     ═══════════════════════════════════════════════════════
     Узлы схемы задаются в метрах в осях самолёта (x — вправо по полёту,
     y — вперёд, z — вверх) и проецируются ортографически, как рисунки
     руководства по ТО. Кинематика считается в тех же метрах, поэтому
     качалки и тяги двигаются так, как на самолёте, а не «на глаз».
     Чертёж — несколько панелей-видов; на телефоне они встают в столбик,
     и каждый вид остаётся крупным, без прокрутки вбок. */
  function v3(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function unit3(a) { var l = Math.sqrt(dot3(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  /* Вид: направление на наблюдателя eye, вписывание точек fit в рамку box. */
  function isoView(eye, fit, box) {
    var f = unit3([-eye[0], -eye[1], -eye[2]]);
    var r = unit3(cross3(f, [0, 0, 1])), u = cross3(r, f);
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    fit.forEach(function (p) {
      var a = dot3(p, r), b = -dot3(p, u);
      x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b);
    });
    var k = Math.min(box[2] / (x1 - x0), box[3] / (y1 - y0));
    var ox = box[0] + (box[2] - (x1 - x0) * k) / 2 - x0 * k;
    var oy = box[1] + (box[3] - (y1 - y0) * k) / 2 - y0 * k;
    function P(p) { return [ox + k * dot3(p, r), oy - k * dot3(p, u), dot3(p, f)]; }
    P.k = k;
    return P;
  }

  /* Сборщик кадра: детали рисуются от дальних к ближним (художник). */
  function ammScene(P) {
    var items = [];
    function add(depth, s) { items.push([depth, s]); }
    return {
      P: P,
      /* труба/тяга: контур цилиндра и торцы */
      tube: function (a, b, rad, cls) {
        var A = P(a), B = P(b), dx = B[0] - A[0], dy = B[1] - A[1];
        var L = Math.sqrt(dx * dx + dy * dy) || 1, w = rad * P.k;
        var nx = -dy / L * w, ny = dx / L * w;
        var far = A[2] > B[2] ? A : B, near = far === A ? B : A;
        add((A[2] + B[2]) / 2,
          '<circle class="' + cls + '" cx="' + r1(far[0]) + '" cy="' + r1(far[1]) + '" r="' + r1(w) + '"/>' +
          '<path class="' + cls + '" d="M' + poly([[A[0] + nx, A[1] + ny], [B[0] + nx, B[1] + ny],
            [B[0] - nx, B[1] - ny], [A[0] - nx, A[1] - ny]]) + 'Z"/>' +
          '<path class="a-in" d="M' + poly([[A[0] + nx, A[1] + ny], [B[0] + nx, B[1] + ny]]) + 'M' +
            poly([[A[0] - nx, A[1] - ny], [B[0] - nx, B[1] - ny]]) + '"/>' +
          '<circle class="' + cls + '" cx="' + r1(near[0]) + '" cy="' + r1(near[1]) + '" r="' + r1(w) + '"/>');
      },
      /* тяга: труба с наконечниками-шарнирами на концах */
      rod: function (a, b, cls) {
        var d = unit3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
        var L = Math.sqrt(dot3([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [b[0] - a[0], b[1] - a[1], b[2] - a[2]]));
        var e = Math.min(0.045, L * 0.2);
        this.tube(v3(a, d, e), v3(b, d, -e), 0.011, cls);
        this.tube(a, v3(a, d, e), 0.005, 'a-ln');
        this.tube(b, v3(b, d, -e), 0.005, 'a-ln');
        this.eye(a); this.eye(b);
      },
      /* сферический подшипник наконечника */
      eye: function (p) {
        var Q = P(p), w = 0.016 * P.k;
        add(Q[2] - 0.001, '<circle class="a-ln" cx="' + r1(Q[0]) + '" cy="' + r1(Q[1]) + '" r="' + r1(w) + '"/>' +
          '<circle class="a-hole" cx="' + r1(Q[0]) + '" cy="' + r1(Q[1]) + '" r="' + r1(w * 0.42) + '"/>');
      },
      /* плоская деталь: качалка, кронштейн, кабанчик */
      plate: function (pts, cls, holes) {
        var S = pts.map(P), d = 0;
        S.forEach(function (q) { d += q[2]; });
        var s = '<path class="' + cls + '" d="M' + poly(S) + 'Z"/>';
        (holes || []).forEach(function (h) {
          var Q = P(h);
          s += '<circle class="a-hole" cx="' + r1(Q[0]) + '" cy="' + r1(Q[1]) + '" r="' + r1(0.008 * P.k) + '"/>';
        });
        add(d / S.length, s);
      },
      /* контур конструкции штрихпунктиром, как шпангоуты и нервюры в AMM */
      ghost: function (pts, closedPath) {
        var S = pts.map(P);
        add(99, '<path class="a-st" d="M' + poly(S) + (closedPath ? 'Z' : '') + '"/>');
      },
      raw: function (depth, s) { add(depth, s); },
      svg: function () {
        items.sort(function (a, b) { return b[0] - a[0]; });
        return items.map(function (x) { return x[1]; }).join('');
      }
    };
  }

  /* Перетаскивание в единицах viewBox; работает пальцем и мышью. */
  function dragger(el, svgEl, onStart, onMove, onEnd) {
    var start = null;
    function pt(e) {
      var host = el.ownerSVGElement || svgEl, m = host.getScreenCTM();
      if (!m) return [0, 0];
      var p = host.createSVGPoint();
      p.x = e.clientX; p.y = e.clientY;
      p = p.matrixTransform(m.inverse());
      return [p.x, p.y];
    }
    el.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      e.preventDefault();
      start = pt(e);
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* указатель уже отпущен */ }
      el.classList.add('is-drag');
      onStart(start);
    });
    el.addEventListener('pointermove', function (e) {
      if (!start) return;
      var p = pt(e);
      onMove(p[0] - start[0], p[1] - start[1], p);
    });
    function end() {
      if (!start) return;
      start = null;
      el.classList.remove('is-drag');
      if (onEnd) onEnd();
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /* Панели чертежа: подпись вида в углу, как «Detail A» в AMM. */
  function ammPanels(frame, list) {
    frame.innerHTML = '<div class="amm-grid">' + list.map(function (p) {
      return '<div class="amm-view' + (p.wide ? ' is-wide' : '') + '">' +
        '<div class="amm-tag">' + p.tag + '</div>' +
        '<svg viewBox="0 0 ' + p.w + ' ' + p.h + '" role="img" aria-label="' + p.tag + '">' +
        '<g class="amm-body" id="' + p.id + '"></g>' + (p.over || '') + '</svg></div>';
    }).join('') + '</div>';
    fitText(frame);
  }

  /* Выноски. Каждая подпись ищет свободное место: если её рамка пересекает
     уже поставленную на этом виде, она сдвигается вниз (у нижнего края —
     вверх) шагами по строке. leadReset() вызывается перед подписями вида. */
  var leadBox = [], LEAD_W = 7.1, LEAD_H = 15;
  function leadReset() { leadBox = []; }
  function leader(x, y, to, text, anchor) {
    var a = anchor || 'start', w = text.length * LEAD_W;
    function rect(yy) {
      var tx = a === 'end' ? x - w : a === 'middle' ? x - w / 2 : x;
      return [tx - 2, yy - LEAD_H + 3, tx + w + 2, yy + 4];
    }
    function hit(r) {
      return leadBox.some(function (b) { return r[0] < b[2] && b[0] < r[2] && r[1] < b[3] && b[1] < r[3]; });
    }
    var dir = y > 200 ? -1 : 1, yy = y, n = 0;
    while (hit(rect(yy)) && n < 12) { n++; yy = y + dir * LEAD_H * Math.ceil(n / 1) ; }
    if (hit(rect(yy))) yy = y;
    leadBox.push(rect(yy));
    y = yy;
    var tx = a === 'end' ? x - w : a === 'middle' ? x - w / 2 : x;
    var ex = to[0] < tx ? tx - 3 : to[0] > tx + w ? tx + w + 3 : to[0];
    var ey = to[1] < y - 10 ? y - 13 : y + 4;
    return '<path class="a-ld" d="M' + r1(ex) + ' ' + r1(ey) + 'L' + r1(to[0]) + ' ' + r1(to[1]) + '"/>' +
      '<circle class="a-dot" cx="' + r1(to[0]) + '" cy="' + r1(to[1]) + '" r="1.8"/>' +
      '<text class="a-tx" x="' + r1(x) + '" y="' + r1(y) + '" text-anchor="' + a + '">' + text + '</text>';
  }

  /* ── Плоские виды «как в AMM» (сбоку, сверху): те же правила линии ── */
  function dist2(a, b) { return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1])); }
  /* Угол рычага (pivot + arm, поворот deg), при котором жёсткая тяга длиной L
     от точки A достаёт до конца рычага. Длина тяги монотонна по углу на
     рабочем ходе, поэтому хватает деления пополам. */
  function follow(pivot, arm, A, L, lo, hi) {
    function f(a) { return dist2(rot(pivot[0] + arm[0], pivot[1] + arm[1], pivot[0], pivot[1], a), A) - L; }
    var flo = f(lo);
    for (var i = 0; i < 40; i++) {
      var m = (lo + hi) / 2, fm = f(m);
      if ((fm > 0) === (flo > 0)) { lo = m; flo = fm; } else hi = m;
    }
    return (lo + hi) / 2;
  }
  function tip(pivot, arm, a) { return rot(pivot[0] + arm[0], pivot[1] + arm[1], pivot[0], pivot[1], a); }
  /* тяга: труба и наконечники с подшипником */
  function rod2(a, b, cls, w) {
    w = w || 3.4;
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / L, uy = dy / L, e = Math.min(14, L * 0.22), nx = -uy * w, ny = ux * w;
    var A = [a[0] + ux * e, a[1] + uy * e], B = [b[0] - ux * e, b[1] - uy * e];
    return '<path class="a-ln" d="M' + poly([a, A]) + 'M' + poly([B, b]) + '" stroke-width="2.2"/>' +
      '<path class="' + (cls || 'a-mv') + '" d="M' + poly([[A[0] + nx, A[1] + ny], [B[0] + nx, B[1] + ny],
        [B[0] - nx, B[1] - ny], [A[0] - nx, A[1] - ny]]) + 'Z"/>' +
      eye2(a) + eye2(b);
  }
  function eye2(p) {
    return '<circle class="a-ln" cx="' + r1(p[0]) + '" cy="' + r1(p[1]) + '" r="4.2"/>' +
      '<circle class="a-hole" cx="' + r1(p[0]) + '" cy="' + r1(p[1]) + '" r="1.6"/>';
  }
  /* неподвижная ось: болт в кронштейне */
  function pivot2(p, r) {
    r = r || 4.6;
    return '<circle class="a-ln" cx="' + r1(p[0]) + '" cy="' + r1(p[1]) + '" r="' + r + '"/>' +
      '<path class="a-ln2" stroke-width="1" d="M' + r1(p[0] - r * 0.6) + ' ' + r1(p[1]) + 'h' + r1(r * 1.2) + 'M' +
      r1(p[0]) + ' ' + r1(p[1] - r * 0.6) + 'v' + r1(r * 1.2) + '"/>';
  }
  /* рычаг-пластина вокруг оси по списку точек плеч */
  function lever2(p, arms, a, cls, w) {
    w = w || 6;
    var s = '';
    arms.forEach(function (arm) {
      var t = tip(p, arm, a), L = Math.sqrt(arm[0] * arm[0] + arm[1] * arm[1]) || 1;
      var nx = -(t[1] - p[1]) / L * w, ny = (t[0] - p[0]) / L * w;
      s += '<path class="' + (cls || 'a-mv') + '" d="M' + r1(p[0] + nx) + ' ' + r1(p[1] + ny) + 'L' + r1(t[0] + nx * 0.7) + ' ' +
        r1(t[1] + ny * 0.7) + 'A' + r1(w * 0.7) + ' ' + r1(w * 0.7) + ' 0 0 0 ' + r1(t[0] - nx * 0.7) + ' ' + r1(t[1] - ny * 0.7) +
        'L' + r1(p[0] - nx) + ' ' + r1(p[1] - ny) + 'Z"/>';
    });
    return s + '<circle class="' + (cls || 'a-mv') + '" cx="' + r1(p[0]) + '" cy="' + r1(p[1]) + '" r="' + r1(w * 1.25) + '"/>' +
      '<circle class="a-hole" cx="' + r1(p[0]) + '" cy="' + r1(p[1]) + '" r="1.8"/>';
  }
  /* штрихпунктир конструкции */
  function ghost2(d) { return '<path class="a-st" d="' + d + '"/>'; }
  /* стрелка усилия в тяге: растяжение — от середины к концам, сжатие — к середине */
  function load2(a, b, sign, k) {
    if (Math.abs(k) < 0.08) return '';
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L;
    var nx = -uy * 11, ny = ux * 11, l = 10 + 16 * Math.abs(k);
    var m1 = [a[0] + dx * 0.3 + nx, a[1] + dy * 0.3 + ny], m2 = [a[0] + dx * 0.7 + nx, a[1] + dy * 0.7 + ny];
    return sign > 0
      ? arrow(m1[0], m1[1], m1[0] - ux * l, m1[1] - uy * l, 'f-red', 2) + arrow(m2[0], m2[1], m2[0] + ux * l, m2[1] + uy * l, 'f-red', 2)
      : arrow(m1[0] - ux * l, m1[1] - uy * l, m1[0], m1[1], 'f-red', 2) + arrow(m2[0] + ux * l, m2[1] + uy * l, m2[0], m2[1], 'f-red', 2);
  }
  /* хват по направлению: смещение пальца проецируется на ход детали;
     dir() — куда и на сколько пикселей уходит деталь при полном ходе */
  function dragAlong(el, svgEl, get, set, dir) {
    var g0 = 0, d = [1, 0];
    dragger(el, svgEl, function () { g0 = get(); d = dir(); },
      function (dx, dy) { set(clamp(g0 + (dx * d[0] + dy * d[1]) / (d[0] * d[0] + d[1] * d[1] || 1), -1, 1)); });
  }

  /* ═══════════════════════════════════════════════════════
     2. Прямое механическое управление элеронами DA 40 NG
        (AMM 6.02.15, 27-10-00, рис. 1 и 2)
     ═══════════════════════════════════════════════════════
     Цепочка по AMM: ручки → поперечные тяги → передняя качалка у пультового
     шпангоута → тяга под центральным пультом → промежуточный рычаг на
     переднем главном шпангоуте → короткая тяга → задняя качалка на заднем
     главном шпангоуте → тяги центроплана и длинные тяги в крыльях (по три
     роликовые направляющие) → качалки элеронов → короткие регулируемые
     тяги → кабанчики элеронов. Ручка влево: тяги у ручки идут вправо,
     тяга под пультом — назад, тяги в крыльях — влево, левый элерон
     вверх, правый вниз (AMM 27-10-00, п. 3). */
  reg.direct = function (frame) {
    var TH_MAX = 20 * DEG;                 /* ход ручки по крену */
    var L_ST = 0.62, L_LO = 0.09;          /* ручка над осью торсиона и рычаг под ней */

    function rz(c, v, a) {
      var cs = Math.cos(a), sn = Math.sin(a);
      return [c[0] + v[0] * cs - v[1] * sn, c[1] + v[0] * sn + v[1] * cs, c[2] + v[2]];
    }
    /* поворот вокруг поперечной оси (элерон, промежуточный рычаг): вверх + = задняя кромка вверх */
    function rx(c, v, a) {
      var cs = Math.cos(a), sn = Math.sin(a);
      return [c[0] + v[0], c[1] + v[1] * cs + v[2] * sn, c[2] - v[1] * sn + v[2] * cs];
    }

    /* длина короткой тяги в нейтрали: от качалки элерона до кабанчика */
    var SHORT = (function () {
      var a = rz([-3.5, -0.88, 0], [-0.08, 0, 0], 0), b = rx([-3.58, -1.08, 0], [0, 0.04, -0.09], 0);
      return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2));
    })();
    /* Кинематика всей цепочки по углу ручки th (вправо +) */
    function chain(th) {
      var dLo = -L_LO * Math.sin(th);                      /* поперечные тяги у ручек */
      var phF = Math.asin(clamp(dLo / 0.07, -1, 1));       /* передняя качалка */
      var dC = -0.08 * Math.sin(phF);                      /* тяга под пультом, вперёд + */
      var ps = Math.asin(clamp(-dC / 0.16, -1, 1));        /* промежуточный рычаг */
      var dO = -0.22 * Math.sin(ps);                       /* короткая тяга к задней качалке */
      var phR = Math.asin(clamp(-dO / 0.08, -1, 1));       /* задняя качалка */
      var dX = -0.05 * Math.sin(phR);                      /* тяги в крыльях, вправо + */
      var phW = Math.asin(clamp(-dX / 0.06, -1, 1));       /* качалка левого элерона */
      /* левый элерон (вверх +): угол, при котором короткая тяга от качалки
         до кабанчика сохраняет свою длину — тяга жёсткая, не тянется */
      var wOut = rz([-3.5, -0.88, 0], [-0.08, 0, 0], phW), lo = -0.8, hi = 0.8;
      for (var n = 0; n < 30; n++) {
        var mid = (lo + hi) / 2, hA = rx([-3.58, -1.08, 0], [0, 0.04, -0.09], mid);
        var dl = Math.sqrt(Math.pow(hA[0] - wOut[0], 2) + Math.pow(hA[1] - wOut[1], 2) + Math.pow(hA[2] - wOut[2], 2));
        if (dl > SHORT) hi = mid; else lo = mid;
      }
      return { th: th, phF: phF, ps: ps, phR: phR, dX: dX, phW: phW, del: (lo + hi) / 2 };
    }
    /* ── вид А: фюзеляж ── */
    /* взгляд сзади-слева сверху, как из-за спины пилота: ручка влево —
       и на рисунке влево, левое крыло слева */
    var EYE_A = [-0.55, -1, 0.8];
    var FIT_A = [[-0.5, 0.2, 0.7], [0.5, 0.2, 0.7], [-0.5, 0.2, -0.3], [0.5, -1.0, -0.3],
      [-0.7, -0.95, 0.1], [0.7, -0.95, 0.1], [-0.5, -1.0, 0.2], [0.7, -0.95, -0.1]];
    var PA = isoView(EYE_A, FIT_A, [14, 40, 392, 272]);
    /* ── вид Б: левое крыло у элерона ── */
    var EYE_B = EYE_A;
    var FIT_B = [[-3.1, -0.7, 0.1], [-4.0, -0.7, 0.1], [-3.1, -1.42, -0.12], [-4.0, -1.42, 0.12], [-3.1, -0.7, -0.1]];
    var PB = isoView(EYE_B, FIT_B, [12, 44, 296, 240]);

    ammPanels(frame, [
      { id: 'dA', tag: 'А · в фюзеляже', w: 420, h: 330, span: 1.3,
        over: '<g id="dA-l"></g><circle class="a-hit" id="dA-hit" r="26"/>' +
          '<g class="a-cue" id="dA-cue"><rect x="-46" y="-34" width="92" height="20" rx="10"/>' +
          '<text x="0" y="-20" text-anchor="middle">тяните ручку</text></g>' },
      { id: 'dB', tag: 'Б · левое крыло, у элерона', w: 320, h: 330,
        over: '<g id="dB-l"></g><path class="a-hit" id="dB-hit"/>' },
      { id: 'dC', tag: 'В · вид сзади: что делает самолёт', w: 640, h: 210, wide: true }
    ]);
    controls(frame,
      '<div class="fig-row"><span class="fig-label">Ручка</span>' +
      '<input class="fig-range" id="d-in" type="range" min="-100" max="100" value="0" aria-label="Ход ручки по крену">' +
      AUTO + '</div>' +
      '<span class="fig-label">Скорость</span>' +
      '<input class="fig-range" id="d-v" type="range" min="100" max="300" value="200" aria-label="Скорость полёта">' +
      '<button class="fig-btn" id="d-gust" type="button">Порыв</button>' +
      '<span class="fig-readout" id="d-out"></span>');

    var q = function (id) { return frame.querySelector('#' + id); };
    var svgA = q('dA').ownerSVGElement, svgB = q('dB').ownerSVGElement;
    var stickV = 0, V = 200, gT = 999, grab = null, touched = false;
    var STICKS = [-0.28, 0.28];

    function viewA(c) {
      var S = ammScene(PA), th = c.th;
      /* конструкция: пультовой, передний и задний главные шпангоуты */
      S.ghost([[-0.42, 0.13, -0.28], [0.42, 0.13, -0.28], [0.42, 0.13, 0.04], [-0.42, 0.13, 0.04]], true);
      S.ghost([[-0.6, -0.5, -0.32], [0.6, -0.5, -0.32], [0.6, -0.5, 0.06], [-0.6, -0.5, 0.06]], true);
      S.ghost([[-0.6, -0.88, -0.2], [0.6, -0.88, -0.2], [0.6, -0.88, 0.12], [-0.6, -0.88, 0.12]], true);
      /* ручки на торсионах */
      var lo = [];
      STICKS.forEach(function (x0, i) {
        S.tube([x0, 0.14, 0], [x0, -0.3, 0], 0.02, 'a-ln');
        var top = [x0 + L_ST * Math.sin(th), 0, L_ST * Math.cos(th)];
        var g0 = [x0 + 0.47 * Math.sin(th), 0, 0.47 * Math.cos(th)];
        var low = [x0 - L_LO * Math.sin(th), 0, -L_LO * Math.cos(th)];
        lo.push(low);
        S.tube(low, g0, 0.011, 'a-mv');
        S.tube(g0, top, 0.022, 'a-mv a-grip');
        S.plate([[x0 - 0.035, 0.03, -0.03], [x0 + 0.035, 0.03, -0.03], [x0 + 0.02, 0.03, 0.05], [x0 - 0.02, 0.03, 0.05]], 'a-ln');
      });
      /* передняя качалка: ось вертикальная */
      var F = [0, 0.07, -0.09];
      var fIn = rz(F, [0, -0.07, 0], c.phF), fOut = rz(F, [-0.08, 0, 0], c.phF);
      S.plate([rz(F, [0.02, 0.015, 0], c.phF), fIn, fOut, rz(F, [-0.02, 0.03, 0], c.phF)], 'a-mv', [F]);
      S.rod(lo[0], v3(fIn, [0, 1, 0], 0.012), 'a-mv');
      S.rod(lo[1], v3(fIn, [0, 1, 0], -0.012), 'a-mv');
      /* промежуточный рычаг: ось поперечная */
      var I = [-0.08, -0.5, -0.25];
      /* rx поворачивает верх рычага назад при отрицательном угле — отсюда минус */
      var iIn = rx(I, [0, 0, 0.16], -c.ps), iOut = rx(I, [0, 0, 0.22], -c.ps);
      S.plate([rx(I, [0, 0.025, -0.02], -c.ps), rx(I, [0, 0.02, 0.23], -c.ps), rx(I, [0, -0.02, 0.23], -c.ps),
        rx(I, [0, -0.025, -0.02], -c.ps)], 'a-mv', [I]);
      S.rod(fOut, iIn, 'a-mv');
      /* задняя качалка: вертикальная труба на заднем шпангоуте */
      var R = [0, -0.92, -0.03];
      S.tube([0, -0.92, -0.14], [0, -0.92, 0.09], 0.016, 'a-mv');
      var rIn = rz(R, [-0.08, 0, 0], c.phR), rOut = rz(R, [0, 0.05, 0], c.phR);
      S.plate([rz(R, [0.02, -0.02, 0], c.phR), rIn, rz(R, [-0.02, 0.06, 0], c.phR), rOut, rz(R, [0.03, 0.03, 0], c.phR)], 'a-mv', [R]);
      S.rod(iOut, rIn, 'a-mv');
      /* тяги центроплана к крыльям */
      var wl = [-0.66 + c.dX, -0.87, -0.03], wr = [0.66 + c.dX, -0.87, -0.03];
      S.rod(rOut, wl, 'a-mv');
      S.rod(rOut, wr, 'a-mv');
      q('dA').innerHTML = S.svg();

      /* выноски */
      var Gl = PA([STICKS[0] + L_ST * Math.sin(th), 0, L_ST * Math.cos(th)]);
      leadReset();
      q('dA-l').innerHTML =
        leader(20, 70, PA([STICKS[0] + 0.5 * Math.sin(th), 0, 0.5 * Math.cos(th)]), 'Левая ручка') +
        leader(250, 60, PA([STICKS[1] + 0.5 * Math.sin(th), 0, 0.5 * Math.cos(th)]), 'Правая ручка') +
        leader(20, 214, PA([0, 0.07, -0.09]), 'Передняя качалка') +
        leader(20, 252, PA(v3(fOut, unit3([iIn[0] - fOut[0], iIn[1] - fOut[1], iIn[2] - fOut[2]]), 0.3)), 'Тяга под пультом') +
        leader(300, 322, PA(I), 'Промежуточный рычаг', 'middle') +
        leader(406, 300, PA([0, -0.92, 0.09]), 'Задняя качалка', 'end') +
        leader(406, 228, PA([0.4 + c.dX, -0.88, -0.03]), 'К правому крылу', 'end') +
        leader(14, 322, PA([-0.45 + c.dX, -0.88, -0.03]), '← К левому крылу');
      var hit = q('dA-hit');
      hit.setAttribute('cx', r1(Gl[0])); hit.setAttribute('cy', r1(Gl[1]));
      var cue = q('dA-cue');
      cue.setAttribute('transform', 'translate(' + r1(Gl[0]) + ' ' + r1(Gl[1]) + ')');
      cue.style.opacity = touched ? 0 : 1;
    }

    function viewB(c) {
      var S = ammScene(PB), d = c.del, X0 = -3.18, X1 = -3.98;
      /* конструкция: задний лонжерон и нервюра управления элероном */
      S.ghost([[X0, -0.95, -0.06], [X1, -0.95, -0.06], [X1, -0.95, 0.07], [X0, -0.95, 0.07]], true);
      S.ghost([[-3.5, -0.62, 0.075], [-3.5, -1.0, 0.065], [-3.5, -1.0, -0.055], [-3.5, -0.62, -0.06]], true);
      S.ghost([[X0, -0.62, 0.075], [X1, -0.62, 0.075]], false);
      /* длинная тяга в крыле и роликовая направляющая */
      var tip = rz([-3.5, -0.88, 0], [0, 0.06, 0], c.phW);
      S.rod([X0 + 0.02 + c.dX, -0.82, 0], tip, 'a-mv');
      S.plate([[-3.3, -0.77, -0.06], [-3.24, -0.77, -0.06], [-3.24, -0.87, -0.06], [-3.3, -0.87, -0.06]], 'a-ln');
      S.plate([[-3.27, -0.79, -0.06], [-3.27, -0.79, 0.0], [-3.27, -0.85, 0.0], [-3.27, -0.85, -0.06]], 'a-ln');
      [[-3.27, -0.82, 0.025], [-3.27, -0.82, -0.025]].forEach(function (p) {
        var Q = PB(p);
        S.raw(Q[2] - 0.01, '<circle class="a-ln" cx="' + r1(Q[0]) + '" cy="' + r1(Q[1]) + '" r="' + r1(0.014 * PB.k) + '"/>');
      });
      /* качалка элерона */
      var W = [-3.5, -0.88, 0];
      var wOut = rz(W, [-0.08, 0, 0], c.phW);
      S.plate([rz(W, [0.02, 0.02, 0], c.phW), tip, rz(W, [-0.03, 0.03, 0], c.phW), wOut, rz(W, [-0.02, -0.03, 0], c.phW)], 'a-mv', [W]);
      S.tube([-3.5, -0.88, -0.05], [-3.5, -0.88, 0.03], 0.006, 'a-ln');
      /* элерон: шарнир по оси x, хорда 0,30 м */
      var H = [0, -1.08, 0], c0 = 0.035;
      function A(x, y, z) { return rx([x, H[1], H[2]], [0, y, z], d); }
      var xs = [-3.32, -3.86];
      var le = [A(xs[0], 0, c0), A(xs[1], 0, c0), A(xs[1], 0, -c0), A(xs[0], 0, -c0)];
      var te = [A(xs[0], -0.3, 0.004), A(xs[1], -0.3, 0.004)];
      S.plate([le[0], le[1], te[1], te[0]], 'a-mv a-surf');
      S.plate([le[3], le[2], te[1], te[0]], 'a-mv a-surf2');
      S.plate([le[0], le[1], le[2], le[3]], 'a-ln');
      /* кабанчик и короткая регулируемая тяга */
      var hx = -3.58, hA = A(hx, 0.04, -0.09);
      S.plate([A(hx, 0.02, -0.03), A(hx, -0.04, -0.02), A(hx, 0.02, -0.1), hA], 'a-mv', [hA]);
      S.rod(wOut, hA, 'a-mv');
      q('dB').innerHTML = S.svg();

      var teMid = PB(A(-3.75, -0.3, 0));
      leadReset();
      q('dB-l').innerHTML =
        leader(306, 72, PB([-3.2 + c.dX, -0.82, 0]), 'Тяга в крыле', 'end') +
        leader(306, 94, PB([-3.27, -0.82, -0.03]), 'Роликовая направляющая', 'end') +
        leader(14, 140, PB(W), 'Качалка элерона') +
        leader(14, 196, PB(v3(wOut, unit3([hA[0] - wOut[0], hA[1] - wOut[1], hA[2] - wOut[2]]), 0.08)), 'Регулируемая тяга') +
        leader(14, 238, PB(hA), 'Кабанчик') +
        leader(306, 304, teMid, 'Элерон', 'end');
      /* зона захвата — сам элерон */
      var pts = [le[0], le[1], te[1], te[0]].map(PB);
      q('dB-hit').setAttribute('d', 'M' + poly(pts) + 'Z');

    }
    /* Вид сзади во всю ширину: крыло с поперечным V, элероны у задней
       кромки. Отклонённый элерон виден сзади как сдвиг его задней кромки
       вверх или вниз относительно крыла — крыло при этом не гнётся.
       Стрелки — прирост и потеря подъёмной силы, дуга — крен. */
    function viewC(c, v) {
      var cx = 320, cy = 124, SP = 270, DI = Math.tan(5 * DEG), bank = v * 7, dl = c.del / DEG, s = '';
      function wy(x) { return cy - Math.abs(x) * DI; }
      function wing(side) {
        var tip = cx + side * SP, root = cx + side * 30;
        return '<path class="a-ln" d="M' + poly([[root, wy(30) - 5], [tip, wy(SP) - 3], [tip, wy(SP) + 3], [root, wy(30) + 5]]) + 'Z"/>';
      }
      function ail(side, d) {
        var x1 = cx + side * SP * 0.55, x2 = cx + side * SP * 0.95, k = 30 * Math.sin(Math.abs(d) * DEG) * (d > 0 ? -1 : 1);
        var p1 = [x1, wy(SP * 0.55)], p2 = [x2, wy(SP * 0.95)];
        var out = '<path class="a-mv a-surf2" d="M' + poly([p1, p2, [p2[0], p2[1] + k], [p1[0], p1[1] + k]]) + 'Z"/>' +
          '<path class="a-ln2" stroke-width="2" d="M' + poly([[p1[0], p1[1] + k], [p2[0], p2[1] + k]]) + '"/>';
        var mx = (x1 + x2) / 2, my = wy(SP * 0.75), L = 34 * Math.abs(d) / 25;
        if (L > 4) out += d < 0 ? arrow(mx, my - 14, mx, my - 14 - L, 'f-green', 2.6) : arrow(mx, my + 14, mx, my + 14 + L, 'f-red', 2.6);
        return out;
      }
      s += '<g transform="rotate(' + r1(bank) + ' ' + cx + ' ' + cy + ')">' +
        wing(-1) + wing(1) + ail(-1, dl) + ail(1, -dl) +
        '<path class="a-ln" d="M' + (cx - 78) + ' ' + (cy - 92) + 'h156v6h-156z"/>' +
        '<path class="a-ln" d="M' + (cx - 4) + ' ' + (cy - 86) + 'h8v60h-8z"/>' +
        '<ellipse class="a-ln" cx="' + cx + '" cy="' + cy + '" rx="34" ry="30"/>' +
        '<ellipse class="a-ln" cx="' + cx + '" cy="' + (cy - 10) + '" rx="24" ry="14"/>' +
        '</g>';
      if (Math.abs(v) > 0.06) {
        /* дуга крена над фюзеляжем: верх самолёта уходит в сторону крена */
        var sg = v < 0 ? -1 : 1, r = 58;
        var a0 = (-90 + sg * 50) * DEG, a1 = (-90 - sg * 50) * DEG;
        var p0 = [cx + r * Math.cos(a0), cy + 10 + r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), cy + 10 + r * Math.sin(a1)];
        s += '<path class="a-roll" d="M' + poly([p1]) + 'A' + r + ' ' + r + ' 0 0 ' + (sg < 0 ? 0 : 1) + ' ' + poly([p0]) + '"/>' +
          arrow(p0[0] - sg * 9, p0[1] - 7, p0[0], p0[1], 'a-rollA', 2.4);
      }
      leadReset();
      var lab = '<text class="a-tx a-sm" x="16" y="196">левое крыло</text><text class="a-tx a-sm" x="624" y="196" text-anchor="end">правое крыло</text>' +
        '<text class="a-tx" x="' + cx + '" y="196" text-anchor="middle">' + (Math.abs(v) < 0.06 ? 'ручка в нейтрали — крена нет'
          : v < 0 ? 'ручка влево → левый элерон вверх, правый вниз → <tspan class="t-blue">крен влево</tspan>'
            : 'ручка вправо → левый элерон вниз, правый вверх → <tspan class="t-blue">крен вправо</tspan>') + '</text>' +
        '<text class="a-tx" x="' + r1(cx - SP * 0.75) + '" y="22" text-anchor="middle">элерон ' + fmt(dl) + '</text>' +
        '<text class="a-tx" x="' + r1(cx + SP * 0.75) + '" y="22" text-anchor="middle">элерон ' + fmt(-dl) + '</text>';
      q('dC').innerHTML = s + lab;
    }
    function fmt(a) {
      var n = Math.round(Math.abs(a));
      return n === 0 ? '0°' : (a > 0 ? '↑ ' : '↓ ') + n + '°';
    }

    function setSpeed() { V = +q('d-v').value; }
    function paint() {
      var gv = gT < 260 ? 0.55 * Math.exp(-gT / 55) * Math.sin(gT * 0.2) : 0;
      var v = clamp(stickV + gv, -1.2, 1.2);
      var c = chain(v * TH_MAX);
      viewA(c);
      viewB(c);
      viewC(c, v);
      var qd = Math.pow(V / 250, 2), F = 12 * qd * Math.abs(v);
      var del = c.del / DEG;
      q('d-out').innerHTML = 'левый элерон <b>' + fmt(del) + '</b>, правый <b>' + fmt(-del) + '</b> · усилие ≈ <b>' +
        F.toFixed(1).replace('.', ',') + ' кгс</b>' +
        (gT < 140 ? ' · <span class="t-red">порыв толкнул ручку</span>' : '');
    }

    /* хват за ручку: ход ручки по горизонтали в пикселях вида */
    var rng = q('d-in');
    var drv = driver(rng, function (x) { stickV = x / 100; if (reduced) paint(); },
      320, frame.querySelector('.fig-auto'));
    function setStick(v) {
      stickV = clamp(v, -1, 1);
      rng.value = Math.round(stickV * 100);
      if (reduced) paint();
    }
    /* Хват переводит смещение пальца в ход ручки по проекции: на сколько
       пикселей и куда уходит деталь при полном ходе ручки. */
    function along(P0, P1) {
      var gx = P1[0] - P0[0], gy = P1[1] - P0[1], gg = gx * gx + gy * gy || 1;
      return function (dx, dy) { return (dx * gx + dy * gy) / gg; };
    }
    var byGrip = along(PA([STICKS[0], 0, L_ST]),
      PA([STICKS[0] + L_ST * Math.sin(TH_MAX), 0, L_ST * Math.cos(TH_MAX)]));
    var dFull = chain(TH_MAX).del;
    var byTE = along(PB(rx([-3.75, -1.08, 0], [0, -0.3, 0], 0)), PB(rx([-3.75, -1.08, 0], [0, -0.3, 0], dFull)));
    dragger(q('dA-hit'), svgA, function () { drv.stop(); grab = stickV; touched = true; },
      function (dx, dy) { setStick(grab + byGrip(dx, dy)); });
    /* хват за элерон: тянем заднюю кромку вверх-вниз — ручка ходит в ответ,
       так видна двусторонняя связь прямого управления */
    dragger(q('dB-hit'), svgB, function () { drv.stop(); grab = stickV; touched = true; },
      function (dx, dy) { setStick(grab + byTE(dx, dy)); });

    q('d-v').addEventListener('input', function () { setSpeed(); if (reduced) paint(); });
    q('d-gust').addEventListener('click', function () { gT = 0; if (reduced) paint(); });
    setSpeed();
    paint();
    loop(frame, function () {
      drv.tick();
      if (gT < 999) gT++;
      paint();
    });
  };

  /* ═══════════════════════════════════════════════════════
     2б. Способы компенсации аэродинамической нагрузки
     ═══════════════════════════════════════════════════════ */
  reg.comp = function (frame) {
    /* Сечение руля за неподвижной частью (симметричный профиль). Для каждого
       способа компенсации меняется устройство руля: носок впереди оси, рог,
       камера с диафрагмой или компенсатор на задней кромке. Компенсатор
       связан тягой с неподвижной частью, и его угол не задан, а следует из
       длины тяги — поэтому он отклоняется против руля (сервокомпенсатор) или
       вместе с ним (антисервокомпенсатор) сам, как на самолёте. */
    var X0 = 20, Y0 = 112, C = 400, TH = 0.12, HU = 0.62, TU = 0.9;
    var H = [X0 + HU * C, Y0], TB = [X0 + TU * C, Y0];
    var q = function (id) { return frame.querySelector('#' + id); };

    function side(a, b, up) { return foilSide(X0, Y0, C, TH, 0, a, b, up, 16); }
    /* кусок профиля со скруглённым носком в точке a */
    function piece(a, b) {
      var up = side(a, b, true), lo = side(a, b, false), r = Math.abs(lo[0][1] - up[0][1]) / 2, nose = [];
      for (var i = 1; i < 10; i++) {
        var t = (90 + 180 * i / 10) * DEG;
        nose.push([up[0][0] + r * Math.cos(t), Y0 + r * Math.sin(t)]);
      }
      return lo.slice().reverse().concat(nose, up);
    }
    /* неподвижная часть с вогнутым «гнездом» под носок руля */
    function fixedPart(end) {
      var up = side(0, end, true), lo = side(0, end, false).reverse(), r = Math.abs(up[up.length - 1][1] - Y0);
      return 'M' + poly(up) + 'A' + r1(r) + ' ' + r1(r) + ' 0 0 0 ' + poly([lo[0]]) + 'L' + poly(lo.slice(1)) + 'Z';
    }

    var MODES = {
      axis: { nose: HU - 0.07, fix: HU - 0.085, k: 0.45, note: 'носок руля вынесен вперёд от оси — поток на нём помогает отклонять руль' },
      horn: { nose: HU, fix: HU - 0.01, horn: 1, k: 0.6, note: 'рог на конце руля выступает вперёд оси; чем больше отклонение, тем сильнее помогает' },
      inner: { nose: HU - 0.07, fix: HU - 0.01, cav: 1, k: 0.5, note: 'носок в закрытой камере с диафрагмой: помогает перепад давлений, щели снаружи нет' },
      servo: { nose: HU, fix: HU - 0.01, tab: 'servo', k: 0.35, note: 'сервокомпенсатор связан тягой с неподвижной частью и сам отклоняется против руля' },
      anti: { nose: HU, fix: HU - 0.01, tab: 'anti', k: 1.35, note: 'антисервокомпенсатор отклоняется вместе с рулём и утяжеляет управление' },
      srv: { nose: HU, fix: HU - 0.01, tab: 'srv', k: 0.12, note: 'пилот двигает только серворуль, а руль отклоняет сила потока на нём' },
      trim: { nose: HU, fix: HU - 0.01, tab: 'trim', k: 0, note: 'триммер ставится отдельно (на DA 40 — гибким тросом) и снимает усилие' }
    };
    /* узлы тяг компенсатора: кабанчик под осью компенсатора, опора на неподвижной части */
    var HORN = [-4, 16];
    var ANCH = { servo: [X0 + 0.5 * C, Y0 + 26], anti: [X0 + 0.5 * C, Y0 - 26] };
    var HORN_A = { servo: [-4, 16], anti: [-4, -16] };
    var LEN = {};
    ['servo', 'anti'].forEach(function (k) { LEN[k] = dist2(ANCH[k], [TB[0] + HORN_A[k][0], TB[1] + HORN_A[k][1]]); });

    ammPanels(frame, [
      { id: 'cA', tag: 'Сечение: неподвижная часть и руль', w: 460, h: 230, over: '<path class="a-hit" id="c-hit"/>' },
      { id: 'cB', tag: 'Шарнирный момент', w: 170, h: 230 }
    ]);
    frame.querySelector('.amm-grid').style.setProperty('--a', '2.6fr');
    controls(frame,
      '<div class="fig-row">' +
      '<button class="fig-btn is-on" data-c="axis" type="button">Осевая</button>' +
      '<button class="fig-btn" data-c="horn" type="button">Роговая</button>' +
      '<button class="fig-btn" data-c="inner" type="button">Внутренняя</button>' +
      '<button class="fig-btn" data-c="servo" type="button">Сервокомпенсатор</button>' +
      '<button class="fig-btn" data-c="anti" type="button">Антисервокомп.</button>' +
      '<button class="fig-btn" data-c="srv" type="button">Серворуль</button>' +
      '<button class="fig-btn" data-c="trim" type="button">Триммер</button></div>' +
      '<span class="fig-label">Отклонение</span>' +
      '<input class="fig-range" id="c-in" type="range" min="-100" max="100" value="40" aria-label="Отклонение руля">' + AUTO +
      '<span class="fig-readout" id="c-out"></span>');
    var mode = 'axis', val = 0.4;

    function paint() {
      var m = MODES[mode], v = val, a = Math.abs(v), ang = v * 22, tabRel = 0, s = '', lab = '';
      leadReset();
      if (m.tab === 'srv') { tabRel = -v * 28; ang = v * 18; }
      if (m.tab === 'trim') tabRel = -v * 20;
      var tb = rot(TB[0], TB[1], H[0], H[1], ang);
      if (m.tab === 'servo' || m.tab === 'anti') {
        var arm = rot(HORN_A[m.tab][0], HORN_A[m.tab][1], 0, 0, ang);
        tabRel = follow(tb, arm, ANCH[m.tab], LEN[m.tab], -60, 60);
      }
      /* воздух огибает профиль и уходит за заднюю кромку */
      var te = m.tab ? rot(tb[0] + (X0 + C - TB[0]), tb[1], tb[0], tb[1], ang + tabRel) : rot(X0 + C, Y0, H[0], H[1], ang);
      [[-56, 0.5], [-38, 1], [38, 1], [56, 0.5]].forEach(function (x) {
        var y = Y0 + x[0], o = (te[1] - Y0) * x[1];
        s += '<path class="f-air f-flow" d="M0 ' + y + 'H' + r1(H[0] - 40) + 'C' + r1(H[0] + 40) + ' ' + y + ' ' + r1(H[0] + 90) + ' ' + r1(y + o * 0.5) + ' 460 ' + r1(y + o) + '"/>';
      });
      if (m.cav) s += '<path class="a-ln" d="M' + r1(X0 + (m.nose - 0.02) * C) + ' ' + r1(Y0 - 13) + 'H' + r1(H[0] - 2) + 'M' + r1(X0 + (m.nose - 0.02) * C) + ' ' + r1(Y0 + 13) + 'H' + r1(H[0] - 2) + '"/>';
      /* руль с компенсатором */
      var rud = '<path class="a-mv a-surf" d="' + closed(piece(m.nose, m.tab ? TU : 1)) + '"/>';
      if (m.horn) rud += '<path class="a-mv a-surf" stroke-dasharray="4 3" d="' + closed(piece(HU - 0.11, HU + 0.02).map(function (p) { return [p[0], Y0 + (p[1] - Y0) * 0.7]; })) + '"/>';
      s += '<g transform="rotate(' + r1(ang) + ' ' + H[0] + ' ' + H[1] + ')">' + rud + '</g>';
      if (m.tab) {
        s += '<g transform="rotate(' + r1(ang + tabRel) + ' ' + r1(tb[0]) + ' ' + r1(tb[1]) + ')" >' +
          '<g transform="translate(' + r1(tb[0] - TB[0]) + ' ' + r1(tb[1] - TB[1]) + ')"><path class="a-mv a-surf2" d="' + closed(piece(TU, 1)) + '"/>' +
          (m.tab === 'servo' || m.tab === 'anti' || m.tab === 'srv' || m.tab === 'trim' ? '<path class="a-mv" d="M' + TB[0] + ' ' + TB[1] + 'L' + (TB[0] + (m.tab === 'anti' ? -4 : -4)) + ' ' + (TB[1] + (m.tab === 'anti' ? -16 : 16)) + 'L' + (TB[0] + 3) + ' ' + TB[1] + 'Z"/>' : '') +
          '</g></g>' + pivot2(tb, 2.4);
        var hornTip = rot(tb[0] + HORN_A[m.tab === 'anti' ? 'anti' : 'servo'][0], tb[1] + HORN_A[m.tab === 'anti' ? 'anti' : 'servo'][1], tb[0], tb[1], ang + tabRel);
        if (m.tab === 'servo' || m.tab === 'anti') s += rod2(ANCH[m.tab], hornTip) + pivot2(ANCH[m.tab], 3);
        if (m.tab === 'srv') s += '<path class="f-sig" stroke-width="2" stroke-dasharray="5 4" d="M0 ' + (Y0 + 70) + 'H' + r1(hornTip[0] - 40) + 'L' + r1(hornTip[0]) + ' ' + r1(hornTip[1]) + '"/>' +
          '<text class="a-tx a-sm" x="10" y="' + (Y0 + 64) + '">тяга от пилота</text>';
        if (m.tab === 'trim') s += '<path class="a-bow" stroke-width="4" d="M120 ' + (Y0 + 70) + 'H' + r1(hornTip[0] - 50) + '"/><path class="a-ln2" d="M' + r1(hornTip[0] - 50) + ' ' + (Y0 + 70) + 'L' + r1(hornTip[0]) + ' ' + r1(hornTip[1]) + '"/>' +
          '<text class="a-tx a-sm" x="120" y="' + (Y0 + 64) + '">гибкий трос от штурвальчика</text>';
      }
      s += '<path class="a-ln" d="' + fixedPart(m.fix) + '"/>' + pivot2(H, 3.4);
      if (m.cav) {
        var dt = rot(X0 + m.nose * C - 4, Y0, H[0], H[1], ang);
        s += '<path class="a-ln2" stroke-width="1.6" d="M' + r1(X0 + (m.nose - 0.06) * C) + ' ' + Y0 + 'Q' + r1((X0 + (m.nose - 0.06) * C + dt[0]) / 2) + ' ' + r1(dt[1] + 3) + ' ' + r1(dt[0]) + ' ' + r1(dt[1]) + '"/>' +
          '<text class="a-tx t-blue" x="' + r1(X0 + (m.nose - 0.04) * C) + '" y="' + (Y0 - 4) + '">' + (ang > 1 ? '−' : ang < -1 ? '+' : '') + '</text>' +
          '<text class="a-tx t-blue" x="' + r1(X0 + (m.nose - 0.04) * C) + '" y="' + (Y0 + 12) + '">' + (ang > 1 ? '+' : ang < -1 ? '−' : '') + '</text>';
      }
      /* силы: красная — на руле, зелёная помогает пилоту, жёлтая мешает */
      var sM = ang >= 0 ? -1 : 1, L = 30 * a;
      function force(pt, len, dir, cls) { return len < 3 ? '' : arrow(pt[0], pt[1] - dir * (8 + len), pt[0], pt[1] - dir * 8, cls); }
      s += force(rot(H[0] + 70, Y0, H[0], H[1], ang), L, sM, 'f-red');
      if (m.nose < HU - 0.01 && !m.cav) s += force(rot(H[0] - 14, Y0, H[0], H[1], ang), L * 0.8, sM, 'f-green');
      if (m.horn) s += force(rot(H[0] - 22, Y0, H[0], H[1], ang), L * (0.2 + 0.8 * a), sM, 'f-green');
      if (m.tab) {
        var tm = rot(tb[0] + 22, tb[1], tb[0], tb[1], ang + tabRel), sT = (ang + tabRel) >= 0 ? -1 : 1;
        s += force(tm, 20 * Math.abs(tabRel) / 22, sT, sT === sM ? 'f-amber' : 'f-green');
      }
      lab += leader(14, 22, [X0 + 0.3 * C, Y0 - 14], m.horn || m.tab ? 'Неподвижная часть' : 'Стабилизатор (киль)') +
        leader(300, 22, H, 'Ось руля', 'middle') +
        leader(446, 22, rot(H[0] + 90, Y0, H[0], H[1], ang), 'Руль', 'end');
      if (m.tab) lab += leader(446, 220, rot(tb[0] + 20, tb[1], tb[0], tb[1], ang + tabRel), mode === 'trim' ? 'Триммер' : mode === 'srv' ? 'Серворуль' : 'Компенсатор', 'end');
      if (m.cav) lab += leader(14, 220, [X0 + (m.nose - 0.05) * C, Y0 + 2], 'Камера с диафрагмой');
      if (m.horn) lab += leader(14, 220, [H[0] - 26, Y0 + 4], 'Рог (на конце руля)');
      q('cA').innerHTML = s;
      q('c-lab').innerHTML = lab;
      var rp = piece(m.nose, m.tab ? TU : 1).map(function (p) { return rot(p[0], p[1], H[0], H[1], ang); });
      q('c-hit').setAttribute('d', closed(rp));

      var k = m.k * (mode === 'horn' ? (1.5 - a) : 1), h0 = 150 * a, h1 = Math.min(170, 150 * a * k);
      q('cB').innerHTML = '<path class="a-ln2" stroke-width="1" d="M14 200H160"/>' +
        '<rect class="a-ln" stroke-dasharray="4 3" fill="none" x="30" y="' + r1(200 - h0) + '" width="40" height="' + r1(h0) + '"/>' +
        '<rect class="' + (k > 1 ? 'f-red-fill' : 'a-bar') + '" x="96" y="' + r1(200 - h1) + '" width="40" height="' + r1(h1) + '"/>' +
        '<text class="a-tx a-sm" x="50" y="218" text-anchor="middle">без</text><text class="a-tx a-sm" x="116" y="218" text-anchor="middle">с ней</text>';
      q('c-out').innerHTML = m.note + (a < 0.03 ? '' : '<br><b>усилие ' + Math.round(k * 100) + ' %</b> от усилия без компенсации');
    }

    q('cA').ownerSVGElement.insertAdjacentHTML('beforeend', '<g id="c-lab"></g>');
    pick(frame, 'data-c', function (id) { mode = id; paint(); });
    var drv = driver(q('c-in'), function (x) { val = x / 100; paint(); }, 300, frame.querySelector('.fig-auto'));
    dragAlong(q('c-hit'), q('cA').ownerSVGElement, function () { drv.stop(); return val; },
      function (x) { val = x; q('c-in').value = Math.round(x * 100); paint(); },
      function () { return [0, 0.38 * C * Math.sin(22 * DEG)]; });
    loop(frame, drv.tick);
  };

  /* ═══════════════════════════════════════════════════════
     2в. Закрылки: простой, щелевой, Фаулера, двухщелевой
     ═══════════════════════════════════════════════════════ */
  reg.flap = function (frame) {
    var X0 = 36, Y0 = 122, C = 300, T = 0.12, M = 0.03;
    var TYPES = {
      plain: { slot: 0, rail: 0, k: 0.55, cut: 0.74, piv: [0.745, 0.035],
        parts: [{ a: 0.74, b: 1, d: 40 }] },
      /* щелевой на опущенном кронштейне: ось ниже профиля и чуть впереди
         носка закрылка — при повороте носок уходит назад-вниз и открывает щель */
      slot: { slot: 1, rail: 0, k: 0.75, cut: 0.72, piv: [0.715, 0.055],
        parts: [{ a: 0.72, b: 1, d: 40 }] },
      /* DA 40 NG, AMM 27-50: тот же щелевой закрылок на внешних кронштейнах,
         электропривод, положения UP 0°, T/O 20°, LDG 42° */
      da40: { slot: 1, rail: 0, k: 0.8, cut: 0.72, piv: [0.715, 0.06], da: 1,
        parts: [{ a: 0.72, b: 1, d: 42 }] },
      fowler: { slot: 1, rail: 1, k: 0.9, cut: 0.72,
        parts: [{ a: 0.72, b: 1, dx: 0.24, dy: 0.06, d: 35 }] },
      double: { slot: 1, rail: 1, k: 1, cut: 0.70,
        parts: [{ a: 0.70, b: 0.80, dx: 0.13, dy: 0.05, d: 20 },
          { a: 0.78, b: 1, dx: 0.28, dy: 0.085, d: 45 }] }
    };
    var UP = [[-36, 1], [-52, 0.75], [-70, 0.5], [-90, 0.3]];
    var LO = [[22, 0.9], [40, 0.6], [58, 0.35]];

    /* Звено закрылка — кусок того же профиля со скруглённым носком */
    function partPts(a, b) {
      var up = foilSide(X0, Y0, C, T, M, a, b, true, 14);
      var lo = foilSide(X0, Y0, C, T, M, a, b, false, 14);
      if (b < 1) {
        [up, lo].forEach(function (list) {
          list.forEach(function (p, i) {
            var u = a + (b - a) * (1 - Math.cos(Math.PI * i / 14)) / 2;
            var cy = camY(Y0, C, M, u), k = 1 - 0.75 * Math.pow((u - a) / (b - a), 2);
            p[1] = cy + (p[1] - cy) * k;
          });
        });
      }
      var mid = [(up[0][0] + lo[0][0]) / 2, (up[0][1] + lo[0][1]) / 2];
      var r = Math.abs(lo[0][1] - up[0][1]) / 2, nose = [];
      for (var i = 1; i < 8; i++) {
        var t = (90 + 180 * i / 8) * DEG;
        nose.push([mid[0] + r * Math.cos(t), mid[1] + r * Math.sin(t)]);
      }
      return { pts: lo.slice().reverse().concat(nose, up), le: [mid[0] - r * 0.3, mid[1]] };
    }
    function mainPath(tp) {
      var c = tp.cut;
      if (!tp.slot) return closed(foilPts(X0, Y0, C, T, M, 0, c + 0.005));
      var up = foilSide(X0, Y0, C, T, M, 0, c + 0.08, true, 26);
      var lo = foilSide(X0, Y0, C, T, M, 0, c - 0.02, false, 26).reverse();
      var ctl = [X0 + c * C, camY(Y0, C, M, c) - 2];
      return 'M' + poly(up) + 'Q' + r1(ctl[0]) + ' ' + r1(ctl[1]) + ' ' + poly([lo[0]]) +
        'L' + poly(lo.slice(1)) + 'Z';
    }
    function place(tp, part, e) {
      if (tp.piv) return { piv: [X0 + tp.piv[0] * C, Y0 + tp.piv[1] * C], rot: part.d * e, slide: 0, turn: e };
      var slide = tp.rail ? Math.min(1, e / 0.6) : e;
      var turn = tp.rail ? Math.max(0, (e - 0.25) / 0.75) : e;
      return { dx: part.dx * C * slide, dy: part.dy * C * slide, rot: 3 + part.d * turn,
        slide: slide, turn: turn };
    }

    var s =
      UP.concat(LO).map(function (a, i) { return '<path id="fl-a' + i + '" class="f-air f-flow"/>'; }).join('') +
      '<path id="fl-rail" class="f-dim" stroke-width="2" stroke-dasharray="3 4"/>' +
      '<g id="fl-parts"></g>' +
      '<path id="fl-main" class="f-fix"/>' +
      '<g id="fl-jet"></g>' +
      '<g id="fl-mech"></g>' +
      '<text class="a-tx" x="150" y="126" text-anchor="middle">крыло</text>' +
      '<text class="a-tx a-sm" id="fl-lbl" x="235" y="240" text-anchor="middle"></text>';
    var bars = ['хорда профиля', 'отклонение', 'подъёмная сила'].map(function (t, i) {
      var y = 52 + i * 62;
      return '<text class="a-tx" x="20" y="' + (y - 8) + '">' + t + '</text>' +
        '<rect class="a-ln" x="20" y="' + y + '" width="160" height="10"/>' +
        '<rect id="fl-b' + i + '" class="' + (i === 2 ? 'f-green-fill' : 'a-bar') + '" x="20" y="' + y + '" width="0" height="10"/>' +
        '<text class="a-tx" id="fl-v' + i + '" x="180" y="' + (y - 8) + '" text-anchor="end"></text>';
    }).join('') + '<g id="fl-det"></g>';

    ammPanels(frame, [
      { id: 'flA', tag: 'Сечение крыла у закрылка', w: 470, h: 250, over: '<path class="a-hit" id="fl-hit"/>' },
      { id: 'flB', tag: 'Что меняется', w: 200, h: 250 }
    ]);
    frame.querySelector('.amm-grid').style.setProperty('--a', '2.35fr');
    frame.querySelector('#flA').innerHTML = s;
    frame.querySelector('#flB').innerHTML = bars;
    controls(frame,
      '<div class="fig-row">' +
      '<button class="fig-btn" data-f="plain" type="button">Простой</button>' +
      '<button class="fig-btn" data-f="slot" type="button">Щелевой</button>' +
      '<button class="fig-btn is-on" data-f="fowler" type="button">Фаулера</button>' +
      '<button class="fig-btn" data-f="double" type="button">Двухщелевой</button>' +
      '<button class="fig-btn" data-f="da40" type="button">DA 40 NG</button></div>' +
      '<div class="fig-row" id="fl-sel" hidden><span class="fig-label">Переключатель</span>' +
      '<button class="fig-btn" data-p="0" type="button">UP 0°</button>' +
      '<button class="fig-btn" data-p="20" type="button">T/O 20°</button>' +
      '<button class="fig-btn" data-p="42" type="button">LDG 42°</button></div>' +
      '<span class="fig-label">Выпуск</span>' +
      '<input class="fig-range" id="fl-in" type="range" min="0" max="100" value="0" ' +
      'aria-label="Выпуск закрылка">' + AUTO +
      '<span class="fig-readout" id="fl-out">0 %</span>');

    var q = function (id) { return frame.querySelector('#' + id); };
    var type = 'fowler', val = 0;

    function paint() {
      var tp = TYPES[type], e = val, parts = '', jets = '', te = null, rail = '', flapPts = null;
      var last = null;
      tp.parts.forEach(function (p) {
        var sh = partPts(p.a, p.b), pl = place(tp, p, e);
        var pts = pl.piv ? move(sh.pts, pl.piv[0], pl.piv[1], pl.rot)
          : move(sh.pts, sh.le[0], sh.le[1], pl.rot, pl.dx, pl.dy);
        if (pl.piv) { sh.le = rot(sh.le[0], sh.le[1], pl.piv[0], pl.piv[1], pl.rot); pl.dx = 0; pl.dy = 0; }
        parts += '<path class="f-mov" d="' + closed(pts) + '"/>';
        if (p === tp.parts[tp.parts.length - 1]) flapPts = pts;
        te = pts[pts.length - 1];
        var le = [sh.le[0] + pl.dx, sh.le[1] + pl.dy];
        if (tp.rail) {
          var end = place(tp, p, 1);
          var b = [sh.le[0] + end.dx, sh.le[1] + end.dy];
          rail += 'M' + poly([sh.le]) + 'Q' + r1((sh.le[0] + b[0]) / 2) + ' ' + r1(b[1] + 6) + ' ' +
            r1(b[0]) + ' ' + r1(b[1]);
          /* каретка на рельсе: два ролика */
          parts += '<rect class="a-ln" x="' + r1(le[0] - 7) + '" y="' + r1(le[1] + 2) + '" width="14" height="6"/>' +
            '<circle class="a-ln" cx="' + r1(le[0] - 5) + '" cy="' + r1(le[1] + 9) + '" r="3"/>' +
            '<circle class="a-ln" cx="' + r1(le[0] + 5) + '" cy="' + r1(le[1] + 9) + '" r="3"/>';
        }
        if (tp.slot) {
          var g = clamp((e - 0.05) * 4, 0, 1);
          var tgt = pts[Math.round(pts.length * 0.62)];
          jets += '<path class="f-blue f-flow" stroke-width="2.2" opacity="' + r1(g) + '" d="M' +
            r1(X0 + (p.a - 0.1) * C) + ' ' + r1(Y0 + 16) + 'Q' + r1(le[0] - 6) + ' ' + r1(le[1] + 14) +
            ' ' + r1(tgt[0]) + ' ' + r1(tgt[1] - 4) + '"/>';
        }
        last = pl;
      });
      q('fl-parts').innerHTML = parts;
      q('fl-mech').innerHTML = mech(tp, e);
      q('fl-hit').setAttribute('d', closed(flapPts));
      q('fl-jet').innerHTML = jets;
      q('fl-rail').setAttribute('d', rail);
      q('fl-main').setAttribute('d', mainPath(tp));

      var te0 = [X0 + C, camY(Y0, C, M, 1)];
      var off = te[1] - te0[1];
      var lift = tp.k * e;
      UP.forEach(function (a, i) {
        var y = Y0 + a[0], w = a[1], b = (6 + 16 * lift) * w, o = off * w;
        q('fl-a' + i).setAttribute('d', 'M0 ' + y + 'C110 ' + r1(y - b) + ' 250 ' + r1(y - b * 1.1) +
          ' 340 ' + r1(y + o * 0.45) + 'S440 ' + r1(y + o) + ' 470 ' + r1(y + o));
      });
      LO.forEach(function (a, i) {
        var y = Y0 + a[0], o = off * a[1];
        q('fl-a' + (UP.length + i)).setAttribute('d', 'M0 ' + y + 'C120 ' + y + ' 250 ' + (y + 2) +
          ' 340 ' + r1(y + o * 0.6) + 'S440 ' + r1(y + o) + ' 470 ' + r1(y + o));
      });

      var lp = tp.parts[tp.parts.length - 1];
      var gain = (lp.dx || 0) * last.slide, deg = lp.d * last.turn;
      var cl = tp.k * (0.4 * gain / 0.28 + 0.6 * deg / 45);
      q('fl-b0').setAttribute('width', r1(160 * (1 + gain) / 1.3));
      q('fl-b1').setAttribute('width', r1(160 * deg / 45));
      q('fl-b2').setAttribute('width', r1(160 * cl));
      q('fl-det').innerHTML = tp.da ? [0, 20, 42].map(function (d, i) {
        var x = 20 + 160 * d / 45;
        return '<path class="a-ln2" stroke-width="1" d="M' + r1(x) + ' 110V128"/>' +
          '<text class="a-tx a-sm" x="' + r1(x) + '" y="140" text-anchor="' + (i ? 'middle' : 'start') + '">' + ['UP', 'T/O', 'LDG'][i] + '</text>';
      }).join('') + '<text class="a-tx a-sm" x="20" y="236">AMM 27-50: 0° · 20° · 42°</text>' : '';
      q('fl-v0').textContent = gain < 0.005 ? 'исходная' : '+' + Math.round(gain * 100) + ' %';
      q('fl-v1').textContent = Math.round(deg) + '°';
      q('fl-v2').textContent = Math.round(cl * 100) + ' %';
      q('fl-out').textContent = tp.da ? Math.round(deg) + '°' : Math.round(e * 100) + ' %';
      q('fl-lbl').textContent = tp.da ? (Math.abs(val - aim) > 0.004 ? 'привод ведёт закрылок к положению ' + Math.round(aim * 42) + '°'
          : Math.round(deg) === 0 ? 'UP — закрылок убран' : Math.round(deg) === 20 ? 'T/O — взлётное положение'
            : Math.round(deg) === 42 ? 'LDG — посадочное положение' : 'промежуточное положение')
        : e < 0.04 ? 'закрылок убран — профиль крыла целый'
        : type === 'plain' ? 'поворот увеличивает кривизну профиля, щели нет'
          : type === 'slot' ? 'щель подаёт воздух с нижней поверхности на верхнюю'
            : e < 0.6 ? 'выдвижение назад по рельсу: растёт площадь, открывается щель'
              : type === 'double' ? 'звенья разошлись: две щели затягивают срыв потока'
                : 'отклонение вниз: растёт кривизна профиля';
    }

    /* Узлы навески в сечении: шарнир, внешний кронштейн с тягой к кабанчику
       (DA 40: тяга от качалки в крыле, AMM 27-50 рис. 2). */
    function mech(tp, e) {
      var m = '';
      if (tp.piv) {
        var P = [X0 + tp.piv[0] * C, Y0 + tp.piv[1] * C], lo = camY(Y0, C, M, 0.7) + 0.045 * C;
        if (type !== 'plain') {
          m += '<path class="a-ln" d="M' + r1(P[0] - 16) + ' ' + r1(lo - 4) + 'L' + r1(P[0] + 4) + ' ' + r1(lo - 4) + 'L' + r1(P[0] + 5) + ' ' + r1(P[1] + 2) +
            'L' + r1(P[0] - 5) + ' ' + r1(P[1] + 5) + 'Z"/>';
        }
        if (tp.da) {
          var hn = rot(P[0] + 12, P[1] - 8, P[0], P[1], tp.parts[0].d * e);
          var bc = [X0 + 0.56 * C, camY(Y0, C, M, 0.56) + 6];
          m += '<path class="a-mv" d="M' + poly([P, hn]) + '" stroke-width="5" stroke-linecap="round"/>' + rod2(bc, hn) + pivot2(bc, 3.4);
        }
        m += pivot2(P, 3.2);
      }
      return m;
    }
    /* DA 40: электропривод ведёт закрылок к выбранному положению с постоянной
       скоростью, а не прыжком; ползунок и перетаскивание задают положение сразу */
    var aim = 0;
    var sel = q('fl-sel');
    pick(frame, 'data-f', function (id) {
      type = id; sel.hidden = !TYPES[id].da;
      if (TYPES[id].da) { drv.stop(); aim = val = Math.min(1, Math.round(val * 42 / 20) * 20 / 42); }
      paint();
    });
    frame.querySelectorAll('[data-p]').forEach(function (b) {
      b.addEventListener('click', function () { drv.stop(); aim = +b.dataset.p / 42; });
    });
    var drv = driver(q('fl-in'), function (x) { val = aim = x / 100; paint(); }, 420,
      frame.querySelector('.fig-auto'));
    dragAlong(q('fl-hit'), frame.querySelector('#flA').ownerSVGElement, function () { drv.stop(); return val * 2 - 1; },
      function (x) { val = aim = (x + 1) / 2; q('fl-in').value = Math.round(val * 100); paint(); },
      function () { return [0, 2 * 0.3 * C * Math.sin(40 * DEG)]; });
    loop(frame, function () {
      drv.tick();
      if (TYPES[type].da && Math.abs(val - aim) > 0.001) {
        val += clamp(aim - val, -0.006, 0.006);
        q('fl-in').value = Math.round(val * 100);
        paint();
      }
    });
  };

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
          loadScript(THREE_BASE + 'examples/js/environments/RoomEnvironment.js')
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
  var LITE_FILES = { 'models/da40/da40-airframe.glb': 1, 'models/da40/da40-cabin.glb': 1 };
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
      if (THREE.RoomEnvironment && THREE.PMREMGenerator) {
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
      var hemi = new THREE.HemisphereLight(0xdde5ee, 0x1c1f24, apron ? 0.32 : 0.4);
      scene.add(hemi);
      var key = new THREE.DirectionalLight(0xfff6ea, apron ? 1.25 : 1.1);
      renderer.toneMappingExposure = apron ? 0.9 : 0.95;
      key.position.set(3, 5, 4);
      scene.add(key);
      scene.add(key.target);
      var fill = new THREE.DirectionalLight(0x9fb8d6, apron ? 0.55 : 0.4);
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
      function render() {
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
        files.push({ src: d.src, role: 'extra', layer: true, on: !!d.on, title: d.title, hint: d.hint,
          plain: true });
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
          if (!o.isMesh) return;
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
            adopt(f, f.scene);
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
          var env = Scenery.showroom(THREE, scene, renderer, r, gy, 1);
          floorY = gy + r * 0.02;
          if (env) {
            if (scene.environment) scene.environment.dispose();
            scene.environment = env;
          }
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

  return { mountAll: mountAll, unmountAll: unmountAll, register: function (k, f) { reg[k] = f; } };
})();
