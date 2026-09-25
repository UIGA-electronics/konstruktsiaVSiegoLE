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

  /* Схемы широкие: на узком экране они не сжимаются до нечитаемости,
     а прокручиваются вбок внутри своей рамки. */
  function svg(vb, inner) {
    /* Минимальная ширина — почти ширина viewBox: схема сжимается не больше
       чем на 12 %, подписи остаются читаемыми. Уже этого на телефоне
       появляется прокрутка вбок, а в колонке компьютера схема помещается. */
    var w = parseFloat(vb.split(/\s+/)[2]) || 520;
    return '<div class="figure-svg"><svg viewBox="' + vb +
      '" style="min-width:' + Math.round(w * 0.88) + 'px" ' +
      'role="img" preserveAspectRatio="xMidYMid meet">' + inner + '</svg></div>';
  }

  function controls(frame, html) {
    var c = document.createElement('div');
    c.className = 'fig-controls';
    c.innerHTML = html;
    frame.appendChild(c);
    return c;
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* Бесконечная анимация, которая сама себя выключает:
     когда схема ушла с экрана — пауза, когда узел удалён из DOM — стоп.
     Без этого при переходе между страницами оставались бы работать
     невидимые циклы rAF (лишний расход батареи на телефоне). */
  function loop(frame, step) {
    if (reduced) { step(0); return; }
    var visible = true, raf = null, t = 0;

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start();
      }, { rootMargin: '80px' }).observe(frame);
    }

    function frameFn() {
      if (!frame.isConnected) { raf = null; return; }
      if (!visible) { raf = null; return; }
      t += 1;
      step(t);
      raf = requestAnimationFrame(frameFn);
    }
    function start() { if (!raf) raf = requestAnimationFrame(frameFn); }
    start();
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

  /* Пружина зигзагом между двумя точками. */
  function zig(x1, y1, x2, y2, n, amp) {
    var dx = x2 - x1, dy = y2 - y1, L = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / L, ny = dx / L, out = [[x1, y1]];
    for (var i = 1; i < n; i++) {
      var k = i / n, s = (i % 2 ? 1 : -1) * amp;
      out.push([x1 + dx * k + nx * s, y1 + dy * k + ny * s]);
    }
    out.push([x2, y2]);
    return 'M' + poly(out);
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
     1. Общая цепочка «команда → поверхность» в трёх вариантах
     ═══════════════════════════════════════════════════════ */
  reg.chain = function (frame) {
    var X = [8, 166, 324, 482], W = 132, Y = 44, H = 82;
    var TITLE = ['Орган управления', 'Проводка', 'Привод', 'Поверхность'];
    var s = '';
    X.forEach(function (x, i) {
      s += '<rect class="f-body" x="' + x + '" y="' + Y + '" width="' + W + '" height="' + H +
        '" rx="10"/>' +
        '<text x="' + (x + W / 2) + '" y="' + (Y + 60) + '" text-anchor="middle">' + TITLE[i] +
        '</text><text class="t-sm" id="ch-s' + i + '" x="' + (x + W / 2) + '" y="' + (Y + 75) +
        '" text-anchor="middle"></text>';
      if (i < 3) {
        var a = x + W + 2, b = X[i + 1] - 3;
        s += '<path id="ch-c' + i + '" stroke-width="2.5" d="M' + a + ' 72H' + b + '"/>' +
          '<path class="f-dim" stroke-width="2" d="M' + (b - 5) + ' 68l5 4-5 4"/>';
      }
    });
    s +=
      /* значки внутри блоков */
      '<path class="f-dim" d="M52 88h44"/>' +
      '<g id="ch-stick"><path class="f-ink" stroke-width="4" d="M74 88V62"/>' +
      '<circle class="f-ink" cx="74" cy="57" r="6" fill="#fff"/></g>' +
      '<circle class="f-metal" cx="74" cy="88" r="3.5"/>' +
      '<g id="ch-rod"><path class="f-ink" stroke-width="3.5" d="M192 72H272"/>' +
      '<circle class="f-metal" cx="192" cy="72" r="4"/><circle class="f-metal" cx="272" cy="72" r="4"/></g>' +
      '<path id="ch-wire" class="f-sig f-flow" stroke-width="2.5" d="M186 72H278"/>' +
      '<g id="ch-crank"><path class="f-metal" d="M372 60H408L390 86Z"/>' +
      '<circle class="f-ink" cx="390" cy="68" r="3"/></g>' +
      '<g id="ch-cyl"><rect class="f-body" x="350" y="62" width="62" height="20" rx="4"/>' +
      '<g id="ch-pis"><rect class="f-metal" x="376" y="64" width="8" height="16"/>' +
      '<path class="f-ink" stroke-width="3" d="M384 72h42"/></g></g>' +
      '<path class="f-fix" d="M498 72q0-9 14-9h40v18h-40q-14 0-14-9z"/>' +
      '<g id="ch-surf"><path class="f-mov" d="M552 63l44 9-44 9z"/></g>' +
      '<circle class="f-metal" cx="552" cy="72" r="3"/>' +

      /* вычислитель ЭДСУ: сигнал идёт через него */
      '<g id="ch-cpu"><path class="f-sig f-flow" stroke-width="2.5" d="M232 44V20H250M370 20H390V42"/>' +
      '<rect class="f-body" x="250" y="6" width="120" height="28" rx="6"/>' +
      '<text id="ch-cput" x="310" y="24" text-anchor="middle">Вычислители</text></g>' +

      /* источник мощности */
      '<g id="ch-pow"><path class="f-blue f-flow" stroke-width="2.5" d="M390 156V128"/>' +
      '<rect class="f-body" x="316" y="156" width="148" height="26" rx="6"/>' +
      '<text class="t-sm" id="ch-pt" x="390" y="173" text-anchor="middle"></text></g>' +
      '<g id="ch-mus"><path class="f-red f-flow" stroke-width="2.5" d="M120 128V160H350V128"/>' +
      '<text class="t-sm" x="235" y="153" text-anchor="middle">мощность даёт сам пилот</text></g>' +

      /* обратная связь по усилию */
      '<path id="ch-fb" stroke-width="2.5" d="M548 128V194H60V128"/>' +
      '<text class="t-sm" id="ch-fbt" x="304" y="210" text-anchor="middle"></text>';

    frame.innerHTML = svg('0 0 622 218', s);
    controls(frame,
      '<button class="fig-btn is-on" data-ch="direct" type="button">Прямое</button>' +
      '<button class="fig-btn" data-ch="booster" type="button">Бустерное</button>' +
      '<button class="fig-btn" data-ch="fbw" type="button">ЭДСУ</button>' +
      '<span class="fig-readout" id="ch-out"></span>');

    var q = function (id) { return frame.querySelector('#' + id); };
    var MODES = {
      direct: {
        s: ['ручка, педали', 'тяги, качалки, тросы', 'мышцы пилота', 'руль, элерон'],
        c: ['f-ink', 'f-ink', 'f-ink'], cpu: false, pow: '', fb: true,
        fbt: 'шарнирный момент руля передаётся обратно в руку пилота',
        k: 1, lim: 1,
        note: 'пилот сам отклоняет поверхность, связь двусторонняя'
      },
      booster: {
        s: ['штурвал, педали', 'тяги к золотнику', 'гидроусилитель', 'руль, элерон'],
        c: ['f-ink', 'f-ink', 'f-ink'], cpu: false, pow: 'гидросистема', fb: false,
        fbt: 'обратного усилия от руля нет, его имитирует пружинный загружатель',
        k: 0.08, lim: 1,
        note: 'пилот задаёт положение, отклоняет поверхность гидравлика'
      },
      fbw: {
        s: ['боковая ручка', 'электрические провода', 'электрогидропривод', 'руль, элерон'],
        c: ['f-sig f-flow', 'f-dim', 'f-ink'], cpu: true, pow: 'гидро- и электросистемы',
        fb: false, fbt: 'усилие на ручке создаёт пружина внутри неё',
        k: 0.07, lim: 0.72,
        note: 'вычислитель пересчитывает команду и при опасности ограничивает её'
      }
    };
    var mode = 'direct', surf = 0;

    function setMode(id) {
      var m = MODES[mode = id];
      m.s.forEach(function (t, i) { q('ch-s' + i).textContent = t; });
      m.c.forEach(function (c, i) {
        q('ch-c' + i).setAttribute('class', c);
        q('ch-c' + i).style.opacity = (i === 1 && m.cpu) ? 0.15 : 1;
      });
      q('ch-rod').style.display = m.cpu ? 'none' : '';
      q('ch-wire').style.display = m.cpu ? '' : 'none';
      q('ch-crank').style.display = m.pow ? 'none' : '';
      q('ch-cyl').style.display = m.pow ? '' : 'none';
      q('ch-cpu').style.display = m.cpu ? '' : 'none';
      q('ch-pow').style.display = m.pow ? '' : 'none';
      q('ch-mus').style.display = m.pow ? 'none' : '';
      q('ch-pt').textContent = m.pow;
      q('ch-fb').setAttribute('class', m.fb ? 'f-red f-flow' : 'f-dim');
      q('ch-fb').setAttribute('stroke-dasharray', m.fb ? '' : '5 6');
      q('ch-fbt').textContent = m.fbt;
      q('ch-out').textContent = m.note;
    }
    pick(frame, 'data-ch', setMode);
    setMode('direct');

    var stick = q('ch-stick'), rod = q('ch-rod'), crank = q('ch-crank');
    var pis = q('ch-pis'), surfG = q('ch-surf'), cpuT = q('ch-cput');
    loop(frame, function (t) {
      var m = MODES[mode];
      var v = Math.sin(t * 0.03);
      var cmd = clamp(v, -m.lim, m.lim);
      surf += (cmd - surf) * m.k;
      stick.setAttribute('transform', 'rotate(' + r1(v * 18) + ' 74 88)');
      rod.setAttribute('transform', 'translate(' + r1(v * 8) + ' 0)');
      crank.setAttribute('transform', 'rotate(' + r1(v * 22) + ' 390 68)');
      pis.setAttribute('transform', 'translate(' + r1(surf * 10) + ' 0)');
      surfG.setAttribute('transform', 'rotate(' + r1(surf * 22) + ' 552 72)');
      var lim = m.cpu && Math.abs(v) > m.lim;
      cpuT.textContent = lim ? 'ограничение' : 'Вычислители';
      cpuT.setAttribute('class', lim ? 't-red' : '');
    });
  };

  /* ═══════════════════════════════════════════════════════
     1б. Поверхности управления: вид сверху + сечение в движении
     ═══════════════════════════════════════════════════════ */
  reg.surfaces = function (frame) {
    /* Вид сверху, нос слева. Крыло и стабилизатор рисуются в верхней
       половине и зеркалятся вниз. Киль в проекции сверху не виден,
       поэтому он «отогнут» вверх — обычная условность для таких схем.
       k — как поверхность движется в сечении справа, g — группа. */
    var PARTS = [
      { id: 'ail', n: 'Элерон', k: 'hinge', g: 'main',
        t: 'Основная система. Управление по крену.',
        d: 'M243 49L256 34L261 39L248 54Z', m: 1 },
      { id: 'flap', n: 'Закрылок', k: 'fowler', g: 'aux',
        t: 'Вспомогательная. Увеличивает подъёмную силу на взлёте и посадке.',
        d: 'M213 85L241 51L246 56L218 90Z', m: 1 },
      { id: 'slat', n: 'Предкрылок', k: 'slat', g: 'aux',
        t: 'Вспомогательная. Увеличивает критический угол атаки, не даёт потоку сорваться.',
        d: 'M189 61L236 30L240 36L193 67Z', m: 1 },
      { id: 'krug', n: 'Щиток Крюгера', k: 'krug', g: 'aux',
        t: 'Вспомогательная. Пластинчатый предкрылок в корневой части крыла.',
        d: 'M150 84L187 62L191 68L154 89Z', m: 1 },
      { id: 'spl', n: 'Спойлер (интерцептор)', k: 'spoiler', g: 'aux',
        t: 'Вспомогательная. Гасит подъёмную силу, тормозит, помогает элеронам по крену.',
        d: 'M207 77L219 63L225 67L213 81ZM222 61L234 47L240 51L228 65Z', m: 1 },
      { id: 'brk', n: 'Тормозной щиток', k: 'brake', g: 'aux',
        t: 'Вспомогательная. Работает только на земле: сокращает пробег после посадки.',
        d: 'M193 81L203 69L209 73L199 85Z', m: 1 },
      { id: 'elev', n: 'Руль высоты', k: 'hinge', g: 'main',
        t: 'Основная система. Управление по тангажу.',
        d: 'M317 89L352 62L357 67L322 94Z', m: 1 },
      { id: 'rud', n: 'Руль направления', k: 'hinge', g: 'main', sym: 1,
        t: 'Основная система. Управление по курсу.',
        d: 'M330 52L356 26L362 31L336 57Z', m: 0 }
    ];
    var FIXED = [
      { id: 'stab', n: 'Стабилизатор', k: 'stab', g: 'aux',
        t: 'Переставной стабилизатор: продольная балансировка самолёта.',
        d: 'M302 86L340 56L352 61L316 89Z', m: 1 },
      { id: 'fin', n: 'Киль', k: 'fixed', g: '', sym: 1,
        t: 'Неподвижная часть вертикального оперения. Здесь показан отогнутым вверх.',
        d: 'M310 55L348 22L356 26L330 53Z', m: 0 }
    ];
    var MOVE = {
      hinge: 'отклоняется вверх и вниз на шарнирах',
      fowler: 'выдвигается назад и отклоняется вниз',
      slat: 'выдвигается вперёд и вниз, открывая щель',
      krug: 'откидывается с нижней поверхности вперёд',
      spoiler: 'поднимается над верхней поверхностью',
      brake: 'на земле поднимается на большой угол',
      stab: 'поворачивается целиком на небольшой угол',
      fixed: 'неподвижен'
    };

    function mirror(d) {
      return '<g transform="translate(0 192) scale(1 -1)">' + d + '</g>';
    }

    var inner =
      '<path class="f-fix" d="M28 96Q36 84 80 84H332Q352 87 362 96Q352 105 332 108H80Q36 108 28 96Z"/>' +
      '<path class="f-fix" d="M146 84L236 30L256 34L212 84Z"/>' +
      mirror('<path class="f-fix" d="M146 84L236 30L256 34L212 84Z"/>') +
      '<path class="f-dim" stroke-dasharray="4 4" d="M306 84h56"/>' +
      '<path class="f-dim" stroke-dasharray="5 5" d="M24 96h344"/>';

    FIXED.concat(PARTS).forEach(function (p) {
      var cls = PARTS.indexOf(p) >= 0 ? 'sf' : 'sf sf-fix';
      var g = '<path class="' + cls + '" data-p="' + p.id + '" d="' + p.d + '"/>';
      inner += g + (p.m ? mirror(g) : '');
    });
    var ALL = FIXED.concat(PARTS);

    inner += '<text class="t-sm" x="366" y="14" text-anchor="end">киль отогнут вверх</text>' +
      '<text class="t-sm" x="34" y="126">вид сверху, нос слева</text>' +
      /* окно сечения */
      '<rect class="f-body" x="392" y="6" width="240" height="180" rx="10"/>' +
      '<text id="sf-t" x="512" y="28" text-anchor="middle"></text>' +
      '<path class="f-air f-flow" d="M400 64H626M400 150H626"/>' +
      '<g id="sf-sec"></g>' +
      '<text class="t-sm" id="sf-m" x="512" y="176" text-anchor="middle"></text>';

    frame.innerHTML = svg('0 0 640 192', inner);
    controls(frame,
      '<button class="fig-btn" data-g="main" type="button">Основные</button>' +
      '<button class="fig-btn" data-g="aux" type="button">Вспомогательные</button>' +
      '<span class="fig-readout" id="sf-out">—</span>');

    var out = frame.querySelector('#sf-out');
    var sec = frame.querySelector('#sf-sec');
    var title = frame.querySelector('#sf-t');
    var mv = frame.querySelector('#sf-m');
    var cur = PARTS[0];

    function select(p) {
      cur = p;
      frame.querySelectorAll('.sf').forEach(function (x) {
        x.classList.toggle('is-on', x.dataset.p === p.id);
      });
      out.innerHTML = '<b>' + p.n + '</b> — ' + p.t;
      title.textContent = 'сечение: ' + p.n.toLowerCase();
      mv.textContent = MOVE[p.k];
    }
    frame.querySelectorAll('.sf').forEach(function (el) {
      el.addEventListener('click', function () {
        ALL.forEach(function (x) { if (x.id === el.dataset.p) select(x); });
      });
    });
    frame.querySelectorAll('[data-g]').forEach(function (b) {
      b.addEventListener('click', function () {
        var on = !b.classList.contains('is-on');
        frame.querySelectorAll('[data-g]').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.toggle('is-on', on);
        frame.querySelectorAll('.sf').forEach(function (x) {
          var p = null;
          ALL.forEach(function (y) { if (y.id === x.dataset.p) p = y; });
          x.classList.toggle('is-grp', on && p && p.g === b.dataset.g);
        });
      });
    });
    select(cur);

    /* Сечение: хорда 180 px, носок слева */
    var SX = 410, SY = 108, SC = 180;
    function sh(list, cls) { return '<path class="' + cls + '" d="' + closed(list) + '"/>'; }
    function panel(u1, u2, upper, deg) {
      var side = foilSide(SX, SY, SC, 0.12, 0.03, u1, u2, upper, 6);
      var a = side[0], b = rot(side[6][0], side[6][1], a[0], a[1], deg);
      return '<path class="f-blue" stroke-width="4.5" d="M' + poly([a, b]) + '"/>';
    }
    function draw(t) {
      var p = cur, m = p.sym ? 0 : 0.03;
      var e = (1 - Math.cos(t * 0.035)) / 2, sw = Math.sin(t * 0.035);
      var full = foilPts(SX, SY, SC, 0.12, m, 0, 1);
      var hx, hy, s = '';
      switch (p.k) {
        case 'hinge':
          hx = SX + 0.75 * SC; hy = camY(SY, SC, m, 0.75);
          s = sh(move(foilPts(SX, SY, SC, 0.12, m, 0.73, 1), hx, hy, sw * 20), 'f-mov') +
            sh(foilPts(SX, SY, SC, 0.12, m, 0, 0.76), 'f-fix');
          break;
        case 'fowler':
          hx = SX + 0.73 * SC; hy = camY(SY, SC, m, 0.73);
          s = sh(move(foilPts(SX, SY, SC, 0.12, m, 0.73, 1), hx, hy, e * 30,
            e * 0.18 * SC, e * 0.05 * SC), 'f-mov') +
            sh(foilPts(SX, SY, SC, 0.12, m, 0, 0.76), 'f-fix');
          break;
        case 'slat':
          hx = SX + 0.13 * SC; hy = camY(SY, SC, m, 0.13);
          s = sh(foilPts(SX, SY, SC, 0.12, m, 0.1, 1), 'f-fix') +
            sh(move(foilPts(SX, SY, SC, 0.12, m, 0, 0.13), hx, hy, -e * 22,
              -e * 0.07 * SC, e * 0.03 * SC), 'f-mov');
          break;
        case 'krug':
          s = sh(full, 'f-fix') + panel(0.04, 0.22, false, e * 125);
          break;
        case 'spoiler':
          s = sh(full, 'f-fix') + panel(0.58, 0.74, true, -e * 40);
          break;
        case 'brake':
          s = sh(full, 'f-fix') + panel(0.56, 0.72, true, -e * 60);
          break;
        case 'stab':
          s = sh(move(full, SX + 0.3 * SC, SY, sw * 5), 'f-mov');
          break;
        default:
          s = sh(full, 'f-fix');
      }
      sec.innerHTML = s;
    }
    loop(frame, draw);
    frame.querySelectorAll('.sf').forEach(function (el) {
      el.addEventListener('click', function () { if (reduced) draw(40); });
    });
  };

  /* ═══════════════════════════════════════════════════════
     1в. Три вида проводки в движении
     ═══════════════════════════════════════════════════════ */
  reg.wiring = function (frame) {
    /* Сечение троса 7×19: семь прядей, в каждой 19 проволок */
    function cable719() {
      var s = '<circle class="f-dim" cx="110" cy="98" r="58"/>';
      var centres = [[0, 0]];
      for (var i = 0; i < 6; i++) {
        centres.push([36 * Math.cos(i * Math.PI / 3), 36 * Math.sin(i * Math.PI / 3)]);
      }
      centres.forEach(function (c) {
        s += '<circle class="f-metal" cx="' + r1(110 + c[0]) + '" cy="' + r1(98 + c[1]) + '" r="18"/>';
        var w = [[0, 0]];
        for (var k = 0; k < 6; k++) w.push([5.6 * Math.cos(k * Math.PI / 3), 5.6 * Math.sin(k * Math.PI / 3)]);
        for (var k2 = 0; k2 < 12; k2++) w.push([11.4 * Math.cos(k2 * Math.PI / 6), 11.4 * Math.sin(k2 * Math.PI / 6)]);
        w.forEach(function (p) {
          s += '<circle fill="#aeb7c1" stroke="#8d97a3" stroke-width=".6" cx="' +
            r1(110 + c[0] + p[0]) + '" cy="' + r1(98 + c[1] + p[1]) + '" r="2.5"/>';
        });
      });
      return s;
    }

    /* Наконечники тяги крупно */
    var ENDS =
      '<path class="f-metal" d="M96 86h188v24H96z"/>' +
      '<text class="t-sm" x="190" y="80" text-anchor="middle">труба тяги</text>' +
      '<circle class="f-metal" cx="46" cy="98" r="18"/>' +
      '<circle class="f-body" cx="46" cy="98" r="8"/>' +
      '<path class="f-metal" d="M64 92h32v12H64z"/>' +
      '<path class="f-ink" stroke-width="2" d="M70 92v12M76 92v12M82 92v12"/>' +
      '<text class="t-sm" x="46" y="132" text-anchor="middle">торцевой</text>' +
      '<text class="t-sm" x="46" y="144" text-anchor="middle">подшипник</text>' +
      '<path class="f-metal" d="M88 86h10v24H88z"/>' +
      '<text class="t-sm" x="104" y="62">зажимная гайка</text>' +
      '<path class="f-dim" d="M100 66v16"/>' +
      '<circle class="f-red" cx="112" cy="98" r="4"/>' +
      '<path class="f-red" d="M112 122v-18"/>' +
      '<text class="t-sm" x="112" y="136" text-anchor="middle">контрольное</text>' +
      '<text class="t-sm" x="112" y="148" text-anchor="middle">отверстие</text>' +
      '<path class="f-metal" d="M284 88h22v8h-22zM284 100h22v8h-22z"/>' +
      '<circle class="f-metal" cx="316" cy="98" r="14"/>' +
      '<circle class="f-body" cx="316" cy="98" r="6"/>' +
      '<text class="t-sm" x="316" y="132" text-anchor="middle">вильчатый</text>' +
      '<text class="t-sm" x="316" y="144" text-anchor="middle">наконечник</text>';

    var BOW = 'M70 90C160 90 170 150 260 150S430 110 520 110';

    var VIEWS = {
      rod: {
        svg:
          '<path class="f-dim" d="M20 112H580"/>' +
          '<g id="wr-stick"><path class="f-ink" stroke-width="5" d="M50 112V42"/>' +
          '<circle class="f-ink" cx="50" cy="36" r="8"/></g>' +
          '<circle class="f-metal" cx="50" cy="112" r="5"/>' +
          '<text class="t-sm" x="50" y="128" text-anchor="middle">рычаг</text>' +
          '<path id="wr-rod1" stroke="#98a3ae" stroke-width="9"/>' +
          '<path id="wr-rod2" stroke="#e1e6ec" stroke-width="5"/>' +
          '<g id="wr-crank"><path class="f-ink" stroke-width="5" d="M520 68V90H556"/></g>' +
          '<circle class="f-metal" cx="520" cy="90" r="5"/>' +
          '<text class="t-sm" x="540" y="128" text-anchor="middle">качалка → к рулю</text>' +
          '<g id="wr-f"></g>' +
          '<text class="t-sm" id="wr-ft" x="290" y="52" text-anchor="middle"></text>' +
          '<text class="t-sm" x="24" y="156">наконечники</text>' +
          '<text class="t-sm" x="24" y="168">(крупно)</text>' +
          '<g transform="translate(130 76)">' + ENDS + '</g>',
        paint: function (v) {
          var th = v * 16;
          var S = rot(50, 68, 50, 112, th);
          var phi = Math.asin(clamp((S[0] - 50) / 22, -1, 1)) / DEG;
          var T = rot(520, 68, 520, 90, phi);
          var d = 'M' + poly([S, T]);
          q('wr-rod1').setAttribute('d', d);
          q('wr-rod2').setAttribute('d', d);
          q('wr-stick').setAttribute('transform', 'rotate(' + r1(th) + ' 50 112)');
          q('wr-crank').setAttribute('transform', 'rotate(' + r1(phi) + ' 520 90)');
          var L = Math.abs(v) * 34, f = '';
          if (L > 3) {
            var inw = v > 0;   /* толкаем — тяга сжата, тянем — растянута */
            var y = S[1] + (T[1] - S[1]) * 0.5;
            f = inw
              ? arrow(S[0] + 18 + L, y - 12, S[0] + 18, y - 12, 'f-red') +
                arrow(T[0] - 18 - L, y - 12, T[0] - 18, y - 12, 'f-red')
              : arrow(S[0] + 18, y - 12, S[0] + 18 + L, y - 12, 'f-red') +
                arrow(T[0] - 18, y - 12, T[0] - 18 - L, y - 12, 'f-red');
          }
          q('wr-f').innerHTML = f;
          q('wr-ft').textContent = Math.abs(v) < 0.08 ? 'нейтраль'
            : v > 0 ? 'рычаг толкает — тяга работает на сжатие'
              : 'рычаг тянет — тяга работает на растяжение';
        }
      },
      cable: {
        svg:
          '<path class="f-ink" stroke-width="1.6" d="M80 60A40 40 0 0 0 80 140M520 60A40 40 0 0 1 520 140"/>' +
          '<g id="wc-dl"><circle class="f-metal" cx="80" cy="100" r="38"/>' +
          '<path class="f-dim" d="M80 64V136M44 100H116"/>' +
          '<path class="f-ink" stroke-width="5" d="M80 100H24"/>' +
          '<circle class="f-ink" cx="24" cy="100" r="7"/></g>' +
          '<g id="wc-dr"><circle class="f-metal" cx="520" cy="100" r="38"/>' +
          '<path class="f-dim" d="M520 64V136M484 100H556"/>' +
          '<path class="f-ink" stroke-width="5" d="M520 100H576"/></g>' +
          '<circle class="f-body" cx="80" cy="100" r="6"/><circle class="f-body" cx="520" cy="100" r="6"/>' +
          '<path id="wc-up" stroke-width="2.4" stroke-dasharray="3 11"/>' +
          '<path id="wc-lo" stroke-width="2.4" stroke-dasharray="3 11"/>' +
          '<g id="wc-tu"><rect class="f-metal" x="280" y="55" width="40" height="10" rx="3"/>' +
          '<path class="f-ink" stroke-width="1.2" d="M288 55v10M296 55v10M304 55v10M312 55v10"/></g>' +
          '<g id="wc-tl"><rect class="f-metal" x="280" y="135" width="40" height="10" rx="3"/>' +
          '<path class="f-ink" stroke-width="1.2" d="M288 135v10M296 135v10M304 135v10M312 135v10"/></g>' +
          '<text class="t-sm" x="24" y="40">от рычага</text>' +
          '<text class="t-sm" x="576" y="40" text-anchor="end">к рулю</text>' +
          '<text class="t-sm" x="300" y="46" text-anchor="middle">тандер</text>' +
          '<text class="t-sm" id="wc-t" x="300" y="170" text-anchor="middle"></text>' +
          '<g transform="translate(20 150) scale(.42)">' + cable719() + '</g>' +
          '<text class="t-sm" x="100" y="200">сечение троса 7×19:</text>' +
          '<text class="t-sm" x="100" y="213">7 прядей по 19 проволок</text>' +
          '<text class="t-sm" x="580" y="200" text-anchor="end">тандер: натяжение троса</text>' +
          '<text class="t-sm" x="580" y="213" text-anchor="end">и компенсация его вытяжки</text>',
        paint: function (v) {
          var th = v * 28, disp = 40 * th * DEG;
          q('wc-dl').setAttribute('transform', 'rotate(' + r1(th) + ' 80 100)');
          q('wc-dr').setAttribute('transform', 'rotate(' + r1(th) + ' 520 100)');
          var sag = Math.abs(v) * 9, tight = Math.abs(v) > 0.06;
          var loT = v > 0;   /* ведущий диск тянет ту ветвь, которую наматывает */
          function branch(id, y, isT, dir) {
            var el = q(id), sg = isT || !tight ? 0 : sag * (y < 100 ? 1 : -1);
            el.setAttribute('d', 'M80 ' + y + 'Q300 ' + r1(y + sg * 2) + ' 520 ' + y);
            el.setAttribute('class', isT && tight ? 'f-red' : 'f-ink');
            el.setAttribute('stroke-dashoffset', r1(dir * disp));
          }
          branch('wc-up', 60, !loT, -1);
          branch('wc-lo', 140, loT, 1);
          q('wc-tu').setAttribute('transform', 'translate(' + r1(disp) + ' ' + r1(loT && tight ? sag : 0) + ')');
          q('wc-tl').setAttribute('transform', 'translate(' + r1(-disp) + ' ' + r1(!loT && tight ? -sag : 0) + ')');
          q('wc-t').textContent = !tight ? 'обе ветви под одинаковым предварительным натяжением'
            : (loT ? 'нижняя' : 'верхняя') + ' ветвь натянута и передаёт усилие, вторая ослаблена';
        }
      },
      bowden: {
        svg:
          '<path d="' + BOW + '" stroke="#aab4bf" stroke-width="17"/>' +
          '<path d="' + BOW + '" stroke="#e6eaee" stroke-width="12"/>' +
          '<path id="wb-core" class="f-blue" d="' + BOW + '" stroke-width="2.6" stroke-dasharray="4 8"/>' +
          '<path id="wb-l" class="f-blue" stroke-width="2.6"/>' +
          '<g id="wb-h"><rect class="f-ink" x="-5" y="78" width="10" height="24" rx="3" fill="#414d59"/></g>' +
          '<path id="wb-r" class="f-blue" stroke-width="2.6"/>' +
          '<g id="wb-e"><rect class="f-metal" x="0" y="103" width="18" height="14" rx="3"/></g>' +
          '<path class="f-dim" d="M30 116v10M70 116v10M30 121h40"/>' +
          '<text class="t-sm" x="50" y="140" text-anchor="middle">рабочий ход</text>' +
          '<text class="t-sm" x="150" y="76">жёсткая оболочка</text>' +
          '<text class="t-sm" x="560" y="96" text-anchor="middle">к заслонке</text>' +
          '<text class="t-sm" x="300" y="190" text-anchor="middle">' +
          'трос ходит внутри оболочки вперёд и назад без бокового смещения,</text>' +
          '<text class="t-sm" x="300" y="203" text-anchor="middle">' +
          'а саму оболочку можно плавно изогнуть в обход препятствия</text>',
        paint: function (v) {
          var d = v * 20, xl = 50 - d, xr = 554 - d;
          q('wb-core').setAttribute('stroke-dashoffset', r1(d));
          q('wb-l').setAttribute('d', 'M70 90H' + r1(xl));
          q('wb-h').setAttribute('transform', 'translate(' + r1(xl) + ' 0)');
          q('wb-r').setAttribute('d', 'M520 110H' + r1(xr));
          q('wb-e').setAttribute('transform', 'translate(' + r1(xr) + ' 0)');
        }
      }
    };

    var NOTE = {
      rod: 'жёсткая: работает и на сжатие, и на растяжение',
      cable: 'гибкая: трос работает только на растяжение, поэтому ветвей две',
      bowden: 'смешанная: гибкость троса при жёсткости оболочки'
    };

    frame.innerHTML = svg('0 0 600 238', VIEWS.rod.svg);
    controls(frame,
      '<div class="fig-row">' +
      '<button class="fig-btn is-on" data-w="rod" type="button">Жёсткая тяга</button>' +
      '<button class="fig-btn" data-w="cable" type="button">Трос</button>' +
      '<button class="fig-btn" data-w="bowden" type="button">Боуден</button>' +
      '<span class="fig-readout" id="wr-out">' + NOTE.rod + '</span></div>' +
      '<span class="fig-label">Ход рычага</span>' +
      '<input class="fig-range" id="wr-in" type="range" min="-100" max="100" value="0" ' +
      'aria-label="Ход рычага">' + AUTO);

    var host = frame.querySelector('.figure-svg svg');
    var q = function (id) { return host.querySelector('#' + id); };
    var view = 'rod', val = 0;
    var out = frame.querySelector('#wr-out');
    var drv = driver(frame.querySelector('#wr-in'), function (x) {
      val = x / 100;
      VIEWS[view].paint(val);
    }, 240, frame.querySelector('.fig-auto'));
    pick(frame, 'data-w', function (id) {
      view = id;
      host.innerHTML = VIEWS[id].svg;
      out.textContent = NOTE[id];
      VIEWS[id].paint(val);
    });
    loop(frame, drv.tick);
  };

  /* ═══════════════════════════════════════════════════════
     1г. Три способа стопорения рулей: порыв ветра и стопор
     ═══════════════════════════════════════════════════════ */
  reg.locks = function (frame) {
    var WX = 60, WY = 112, WC = 420, HU = 0.77;
    var hx = WX + HU * WC, hy = camY(WY, WC, 0.02, HU);
    var EH = [298, 100], LOCK = 14, AMAX = 18;
    var hole = rot(EH[0], EH[1] + 34, EH[0], EH[1], LOCK);

    var WIND = '<path id="lk-w" class="f-air f-flow" d="M0 30H600M0 46H600M0 172H600M0 188H600"/>';

    var VIEWS = {
      clamp:
        WIND +
        '<g id="lk-surf"><path class="f-mov" d="' +
        closed(foilPts(WX, WY, WC, 0.12, 0.02, HU - 0.02, 1)) + '"/></g>' +
        '<path class="f-fix" d="' + closed(foilPts(WX, WY, WC, 0.12, 0.02, 0, HU + 0.01)) + '"/>' +
        '<circle class="f-metal" cx="' + r1(hx) + '" cy="' + r1(hy) + '" r="3.5"/>' +
        '<circle id="lk-hit" class="f-red" stroke-width="3" cx="' + r1(hx) + '" cy="' + r1(hy) +
        '" r="16" opacity="0"/>' +
        '<text class="t-sm" x="220" y="140" text-anchor="middle">крыло</text>' +
        '<text class="t-sm" x="440" y="150" text-anchor="middle">элерон</text>' +
        '<g id="lk-lock"><path class="f-red-fill" d="M356 80h80v10h-70v44h70v10h-80z"/>' +
        '<path class="f-red" stroke-width="2.5" d="M398 144v22"/>' +
        '<path class="f-red-fill" d="M398 166l40 8-40 8z"/>' +
        '<text class="t-sm t-red" x="444" y="182">снять перед полётом</text></g>',
      gust:
        '<rect class="f-body" x="90" y="30" width="420" height="160" rx="12"/>' +
        '<text class="t-sm" x="300" y="22" text-anchor="middle">кабина, вид спереди</text>' +
        '<path class="f-ink" stroke-width="5" d="M220 170H380"/>' +
        '<g id="lk-s1"><path class="f-ink" stroke-width="6" d="M220 170v-56"/>' +
        '<circle class="f-ink" cx="220" cy="108" r="9"/></g>' +
        '<g id="lk-s2"><path class="f-ink" stroke-width="6" d="M380 170v-56"/>' +
        '<circle class="f-ink" cx="380" cy="108" r="9"/></g>' +
        '<circle class="f-metal" cx="220" cy="170" r="6"/><circle class="f-metal" cx="380" cy="170" r="6"/>' +
        '<text class="t-sm" x="300" y="184" text-anchor="middle">общий вал ручек</text>' +
        '<path class="f-fix" d="M14 150h50v8H14zM536 150h50v8h-50z"/>' +
        '<g id="lk-a1"><path class="f-mov" d="M64 150h22v8H64z"/></g>' +
        '<g id="lk-a2"><path class="f-mov" d="M514 150h22v8h-22z"/></g>' +
        '<text class="t-sm" x="50" y="176" text-anchor="middle">элерон</text>' +
        '<text class="t-sm" x="550" y="176" text-anchor="middle">элерон</text>' +
        '<g id="lk-lock"><path stroke="#a92920" stroke-width="10" d="M206 122L394 98"/>' +
        '<text class="t-sm t-red" x="300" y="84" text-anchor="middle">Gust Lock</text></g>',
      electro:
        WIND +
        '<g id="lk-surf">' +
        '<path class="f-mov" d="' + closed(foilPts(40, 100, 330, 0.12, 0, 0.76, 1)) + '"/>' +
        '<path class="f-mov" d="M292 100h12v40h-12z"/>' +
        '<circle class="f-body" cx="298" cy="134" r="4"/></g>' +
        '<path class="f-fix" d="' + closed(foilPts(40, 100, 330, 0.12, 0, 0, 0.785)) + '"/>' +
        '<circle class="f-metal" cx="298" cy="100" r="3.5"/>' +
        '<text class="t-sm" x="316" y="160">нервюра руля</text>' +
        '<text class="t-sm" x="360" y="78">руль</text>' +
        '<path id="lk-pin" class="f-ink" stroke-width="6"/>' +
        '<rect class="f-body" x="180" y="' + r1(hole[1] - 9) + '" width="56" height="18" rx="4"/>' +
        '<text class="t-sm" x="208" y="' + r1(hole[1] + 24) + '" text-anchor="middle">электромеханизм</text>' +
        '<path class="f-sig" stroke-width="2" stroke-dasharray="5 4" d="M90 58V' + r1(hole[1]) + 'H180"/>' +
        '<rect class="f-body" x="20" y="16" width="140" height="42" rx="6"/>' +
        '<text class="t-sm" x="90" y="30" text-anchor="middle">панель стопорения</text>' +
        '<rect id="lk-lamp" x="28" y="36" width="124" height="16" rx="3" fill="#e3e7ec"/>' +
        '<text id="lk-lampt" class="t-sm" x="90" y="48" text-anchor="middle">стопоры сняты</text>' +
        '<text id="lk-near" class="t-sm" x="500" y="150" text-anchor="middle"></text>' +
        '<text id="lk-near2" class="t-sm" x="500" y="163" text-anchor="middle"></text>'
    };
    var NOTE = {
      clamp: 'лёгкие ВС · ставит техник после полёта, снимает перед полётом',
      gust: 'лёгкие ВС · ставит экипаж в кабине, видно с места пилота',
      electro: 'магистральные ВС · стопор входит в отверстие нервюры по команде пилота'
    };

    frame.innerHTML = svg('0 0 600 206', VIEWS.clamp);
    controls(frame,
      '<div class="fig-row">' +
      '<button class="fig-btn is-on" data-l="clamp" type="button">Струбцина</button>' +
      '<button class="fig-btn" data-l="gust" type="button">Gust Lock</button>' +
      '<button class="fig-btn" data-l="electro" type="button">Электромеханическое</button></div>' +
      '<button class="fig-btn" id="lk-btn" type="button">Поставить стопор</button>' +
      '<span class="fig-readout" id="lk-out">' + NOTE.clamp + '</span>');

    var host = frame.querySelector('.figure-svg svg');
    var q = function (id) { return host.querySelector('#' + id); };
    var btn = frame.querySelector('#lk-btn');
    var out = frame.querySelector('#lk-out');
    var view = 'clamp', locked = false, p = 0, last = 0;

    function paint(t) {
      last = t;
      var g = 0.55 + 0.45 * Math.sin(t * 0.017) * Math.sin(t * 0.0071 + 1);
      var a = clamp(AMAX * 1.25 * g * (0.65 * Math.sin(t * 0.19) + 0.35 * Math.sin(t * 0.31 + 2)),
        -AMAX, AMAX);
      var w = q('lk-w');
      if (w) w.style.opacity = r1(0.25 + 0.75 * g);
      var lk = q('lk-lock');
      if (view === 'clamp') {
        var ang = a * (1 - p);
        q('lk-surf').setAttribute('transform', 'rotate(' + r1(ang) + ' ' + r1(hx) + ' ' + r1(hy) + ')');
        q('lk-hit').setAttribute('opacity', Math.abs(ang) > AMAX * 0.93 ? 0.8 : 0);
        lk.setAttribute('transform', 'translate(0 ' + r1(-90 * (1 - p)) + ')');
        lk.style.opacity = p;
      } else if (view === 'gust') {
        var s = a * 0.7 * (1 - p);
        q('lk-s1').setAttribute('transform', 'rotate(' + r1(s) + ' 220 170)');
        q('lk-s2').setAttribute('transform', 'rotate(' + r1(s) + ' 380 170)');
        q('lk-a1').setAttribute('transform', 'rotate(' + r1(-s * 1.4) + ' 64 154)');
        q('lk-a2').setAttribute('transform', 'rotate(' + r1(-s * 1.4) + ' 536 154)');
        lk.setAttribute('transform', 'translate(0 ' + r1(-40 * (1 - p)) + ')');
        lk.style.opacity = p;
      } else {
        var k1 = clamp(p * 2, 0, 1), k2 = clamp(p * 2 - 1, 0, 1);
        var e = a * (1 - k1) + LOCK * k1;
        q('lk-surf').setAttribute('transform', 'rotate(' + r1(e) + ' 298 100)');
        q('lk-pin').setAttribute('d', 'M236 ' + r1(hole[1]) + 'H' + r1(236 + k2 * (hole[0] - 236)));
        var on = p > 0.98;
        q('lk-lamp').setAttribute('fill', on ? '#f3c46b' : '#e3e7ec');
        q('lk-lampt').textContent = on ? 'РУЛИ ЗАСТОПОРЕНЫ' : 'стопоры сняты';
        q('lk-near').textContent = p > 0.4 ? 'руль стопорится у положения,' : '';
        q('lk-near2').textContent = p > 0.4 ? 'близкого к крайнему' : '';
      }
    }

    function setLock(on) {
      locked = on;
      btn.textContent = on ? 'Снять стопор' : 'Поставить стопор';
      btn.classList.toggle('is-on', on);
      if (reduced) { p = on ? 1 : 0; paint(last); }
    }
    btn.addEventListener('click', function () { setLock(!locked); });
    pick(frame, 'data-l', function (id) {
      view = id;
      host.innerHTML = VIEWS[id];
      out.textContent = NOTE[id];
      paint(last);
    });

    loop(frame, function (t) {
      p = clamp(p + (locked ? 0.025 : -0.025), 0, 1);
      paint(t);
    });
  };

  /* ═══════════════════════════════════════════════════════
     2. Прямое механическое управление элероном
     ═══════════════════════════════════════════════════════ */
  reg.direct = function (frame) {
    var WX = 330, WY = 92, WC = 240, WM = 0.02, HU = 0.76;
    var hx = WX + HU * WC, hy = camY(WY, WC, WM, HU);
    var AIL = foilPts(WX, WY, WC, 0.12, WM, HU - 0.02, 1);
    var TE0 = [WX + WC, camY(WY, WC, WM, 1)];
    var HORN = [hx - 12, hy + 28];
    var AIR = [[54, 0.35, -1], [70, 0.7, -1], [118, 0.7, 1], [134, 0.35, 1]];

    var s =
      '<text class="t-sm" x="40" y="12">усилие на ручке по крену (условная модель: растёт как V²·δ)</text>' +
      '<rect class="f-body" x="40" y="20" width="260" height="12" rx="6"/>' +
      '<rect id="d-bar" x="40" y="20" width="0" height="12" rx="6"/>' +
      '<path class="f-ink" stroke-width="1.5" d="M78 16v20M239 16v20"/>' +
      '<text class="t-sm" x="78" y="48" text-anchor="middle">2,2 кгс — длительно</text>' +
      '<text class="t-sm" x="239" y="48" text-anchor="middle">11,5 кгс — кратковременно</text>' +
      AIR.map(function (a, i) { return '<path id="d-a' + i + '" class="f-air f-flow"/>'; }).join('') +
      '<path class="f-dim" d="M30 206H300"/>' +
      '<text class="t-sm" x="34" y="224">кабина</text>' +
      '<g id="d-stick"><path class="f-ink" stroke-width="5" d="M80 206V120"/>' +
      '<circle class="f-ink" cx="80" cy="112" r="9"/></g>' +
      '<circle class="f-metal" cx="80" cy="206" r="5"/>' +
      '<g id="d-hf"></g>' +
      '<path id="d-rod" class="f-blue" stroke-width="4"/>' +
      '<text class="t-sm" x="270" y="144" text-anchor="middle">жёсткая тяга</text>' +
      '<g id="d-crank"><path class="f-ink" stroke-width="5" d="M470 154V180H500"/></g>' +
      '<circle class="f-metal" cx="470" cy="180" r="5"/>' +
      '<text class="t-sm" x="470" y="202" text-anchor="middle">качалка</text>' +
      '<path id="d-push" class="f-blue" stroke-width="3"/>' +
      '<g id="d-ail"></g>' +
      '<path class="f-fix" d="' + closed(foilPts(WX, WY, WC, 0.12, WM, 0, HU + 0.01)) + '"/>' +
      '<circle class="f-metal" cx="' + r1(hx) + '" cy="' + r1(hy) + '" r="3"/>' +
      '<text class="t-sm" x="420" y="96" text-anchor="middle">крыло</text>' +
      '<text class="t-sm" x="596" y="176" text-anchor="middle">элерон</text>' +
      '<g id="d-hm"></g>';

    frame.innerHTML = svg('0 0 640 232', s);
    controls(frame,
      '<div class="fig-row"><span class="fig-label">Ручка</span>' +
      '<input class="fig-range" id="d-in" type="range" min="-100" max="100" value="0" ' +
      'aria-label="Ход ручки">' + AUTO + '</div>' +
      '<span class="fig-label">Скорость</span>' +
      '<input class="fig-range" id="d-v" type="range" min="100" max="300" value="200" ' +
      'aria-label="Скорость полёта">' +
      '<button class="fig-btn" id="d-gust" type="button">Порыв</button>' +
      '<span class="fig-readout" id="d-out"></span>');

    var q = function (id) { return frame.querySelector('#' + id); };
    var stickV = 0, V = 200, gT = 999;

    function setSpeed() {
      AIR.forEach(function (a, i) { q('d-a' + i).style.animationDuration = r1(170 / V) + 's'; });
    }

    function paint() {
      var gv = gT < 260 ? 0.55 * Math.exp(-gT / 55) * Math.sin(gT * 0.2) : 0;
      var v = clamp(stickV + gv, -1.2, 1.2);
      var th = v * 12;
      var S = rot(80, 156, 80, 206, th);
      var phi = Math.asin(clamp((S[0] - 80) / 26, -1, 1)) / DEG;
      var A1 = rot(470, 154, 470, 180, phi), A2 = rot(500, 180, 470, 180, phi);
      var del = -phi * 0.7;
      var Ht = rot(HORN[0], HORN[1], hx, hy, del);
      var TE = rot(TE0[0], TE0[1], hx, hy, del);

      q('d-stick').setAttribute('transform', 'rotate(' + r1(th) + ' 80 206)');
      q('d-rod').setAttribute('d', 'M' + poly([S, A1]));
      q('d-crank').setAttribute('transform', 'rotate(' + r1(phi) + ' 470 180)');
      q('d-push').setAttribute('d', 'M' + poly([A2, Ht]));
      q('d-ail').innerHTML = '<path class="f-mov" d="' + closed(move(AIL, hx, hy, del)) + '"/>' +
        '<path class="f-ink" stroke-width="3" d="M' + poly([[hx, hy], Ht]) + '"/>';

      var off = TE[1] - TE0[1];
      AIR.forEach(function (a, i) {
        var y = a[0], w = a[1], b = a[2] < 0 ? 8 * w : -3 * w, o = off * w;
        q('d-a' + i).setAttribute('d', 'M310 ' + y + 'C390 ' + r1(y - b) + ' 470 ' + r1(y - b) +
          ' 540 ' + r1(y + o * 0.5) + 'S600 ' + r1(y + o) + ' 640 ' + r1(y + o));
      });

      /* шарнирный момент: поток стремится вернуть элерон в нейтраль */
      var qd = Math.pow(V / 250, 2), L = 46 * qd * Math.abs(del) / 25;
      var M = rot(hx + 34, hy, hx, hy, del), hm = '';
      if (L > 4) {
        hm = del > 0
          ? arrow(M[0], M[1] + 12 + L, M[0], M[1] + 8, 'f-red')
          : arrow(M[0], M[1] - 12 - L, M[0], M[1] - 8, 'f-red');
        hm += '<text class="t-sm t-red" x="' + r1(M[0] - 8) + '" y="' +
          r1(del > 0 ? M[1] + 20 + L : M[1] - 14 - L) + '" text-anchor="end">шарнирный момент</text>';
      }
      q('d-hm').innerHTML = hm;

      var F = 12 * qd * Math.abs(v);
      var Kn = rot(80, 112, 80, 206, th), sg = v >= 0 ? 1 : -1;
      q('d-hf').innerHTML = F > 0.3
        ? arrow(Kn[0] + sg * 12, Kn[1], Kn[0] + sg * (12 + 3 * F), Kn[1], 'f-red', 3) : '';
      var bar = q('d-bar');
      bar.setAttribute('width', r1(Math.min(F, 15) / 15 * 260));
      bar.setAttribute('class', F > 11.5 ? 'f-red-fill' : F > 2.2 ? 'f-amber-fill' : 'f-green-fill');
      q('d-out').textContent = 'элерон ' + (del > 0.5 ? 'вниз ' : del < -0.5 ? 'вверх ' : '') +
        Math.abs(del).toFixed(0) + '° · усилие ≈ ' + F.toFixed(1).replace('.', ',') + ' кгс' +
        (gT < 140 ? ' · порыв сместил ручку в руке' : '');
    }

    q('d-v').addEventListener('input', function () { V = +q('d-v').value; setSpeed(); if (reduced) paint(); });
    q('d-gust').addEventListener('click', function () { gT = 0; if (reduced) paint(); });
    var drv = driver(q('d-in'), function (x) { stickV = x / 100; if (reduced) paint(); },
      320, frame.querySelector('.fig-auto'));
    setSpeed();
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
    var PX = 168, PY = 108;
    var AIR = [[58, 0.5], [76, 1], [140, 1], [158, 0.5]];

    var s =
      AIR.map(function (a, i) { return '<path id="c-a' + i + '" class="f-air f-flow"/>'; }).join('') +
      '<path class="f-fix" d="M16 86h136q14 0 14 22t-14 22H16z"/>' +
      '<text class="t-sm" x="72" y="112" text-anchor="middle">неподвижная часть</text>' +
      '<g id="c-cav"><rect x="126" y="94" width="42" height="28" rx="4" fill="#fbfbf8" stroke="#9aa7b6"/>' +
      '<text class="t-sm t-blue" id="c-pu" x="140" y="90"></text>' +
      '<text class="t-sm t-blue" id="c-pl" x="140" y="136"></text></g>' +
      '<g id="c-surf">' +
      '<path id="c-nose" class="f-mov" d="M168 93l-21 15 21 15z"/>' +
      '<path id="c-horn" class="f-mov" d="M168 93l-20 8 20 6z"/>' +
      '<path class="f-mov" d="M168 93l112 15-112 15z"/>' +
      '<g id="c-tab"><path class="f-mov2" d="M276 102l40 6-40 6z"/></g>' +
      '</g>' +
      '<path id="c-dia" class="f-ink" stroke-width="2"/>' +
      '<circle class="f-metal" cx="168" cy="108" r="6"/>' +
      '<text class="t-sm" x="168" y="80" text-anchor="middle">ось вращения</text>' +
      '<path id="c-link" class="f-blue" stroke-width="2" stroke-dasharray="5 4"/>' +
      '<g id="c-arr"></g>' +
      '<text class="t-sm" x="396" y="28" text-anchor="middle">шарнирный момент</text>' +
      '<rect id="c-b0" x="360" y="180" width="28" height="0" rx="3" fill="none" ' +
      'stroke="#a3adb6" stroke-dasharray="4 3"/>' +
      '<rect id="c-b1" x="404" y="180" width="28" height="0" rx="3" fill="#a92920"/>' +
      '<path class="f-dim" d="M350 180H442"/>' +
      '<text class="t-sm" x="374" y="194" text-anchor="middle">без</text>' +
      '<text class="t-sm" x="418" y="194" text-anchor="middle">с ней</text>';

    frame.innerHTML = svg('0 0 452 200', s);
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
      '<input class="fig-range" id="c-in" type="range" min="-100" max="100" value="40" ' +
      'aria-label="Отклонение руля">' + AUTO +
      '<span class="fig-readout" id="c-out"></span>');

    var q = function (id) { return frame.querySelector('#' + id); };
    var MODES = {
      axis: { nose: 1, k: function () { return 0.45; },
        note: 'часть площади вынесена вперёд от оси — поток помогает отклонять руль' },
      horn: { horn: 1, k: function (a) { return 0.95 - 0.5 * a; },
        note: 'рог у края руля: чем больше отклонение, тем сильнее он помогает' },
      inner: { nose: 1, cav: 1, k: function () { return 0.5; },
        note: 'носок в закрытой камере с диафрагмой: помогает перепад давлений, щелей нет' },
      servo: { tab: -0.9, k: function () { return 0.35; },
        note: 'сервокомпенсатор отклоняется против руля и уменьшает шарнирный момент' },
      anti: { tab: 0.9, k: function () { return 1.35; },
        note: 'антисервокомпенсатор отклоняется вместе с рулём и утяжеляет управление' },
      srv: { tab: -1.5, link: 1, k: function () { return 0.12; },
        note: 'пилот двигает только серворуль, руль отклоняет сила потока на нём' },
      trim: { tab: -1.1, k: function () { return 0; },
        note: 'триммер управляется отдельно и снимает усилие полностью' }
    };
    var mode = 'axis', val = 0.4;

    function paint() {
      var m = MODES[mode], v = val, a = Math.abs(v), ang = v * 22;
      var tabRel = m.tab ? clamp(m.tab * ang, -32, 32) : 0;
      q('c-surf').setAttribute('transform', 'rotate(' + r1(ang) + ' ' + PX + ' ' + PY + ')');
      q('c-nose').style.display = m.nose ? '' : 'none';
      q('c-horn').style.display = m.horn ? '' : 'none';
      q('c-cav').style.display = m.cav ? '' : 'none';
      q('c-tab').style.display = m.tab ? '' : 'none';
      q('c-tab').setAttribute('transform', 'rotate(' + r1(tabRel) + ' 276 108)');

      var tip = rot(147, 108, PX, PY, ang);
      q('c-dia').setAttribute('d', m.cav ? 'M128 108Q' + r1((128 + tip[0]) / 2) + ' ' +
        r1(tip[1] + 3) + ' ' + r1(tip[0]) + ' ' + r1(tip[1]) : '');
      q('c-pu').textContent = m.cav ? (ang > 1 ? '−' : ang < -1 ? '+' : '') : '';
      q('c-pl').textContent = m.cav ? (ang > 1 ? '+' : ang < -1 ? '−' : '') : '';

      var root = rot(276, 114, PX, PY, ang);
      q('c-link').setAttribute('d', m.link ? 'M16 150H240L' + r1(root[0]) + ' ' + r1(root[1]) : '');

      /* стрелки аэродинамических сил */
      var sM = ang >= 0 ? -1 : 1, L = 30 * a, arr = '';
      function force(pt, len, dir, cls) {
        if (len < 3) return '';
        return arrow(pt[0], pt[1] - dir * (7 + len), pt[0], pt[1] - dir * 7, cls);
      }
      arr += force(rot(224, 108, PX, PY, ang), L, sM, 'f-red');
      if (m.nose) arr += force(rot(155, 108, PX, PY, ang), L * 0.8, sM, 'f-green');
      if (m.horn) arr += force(rot(158, 100, PX, PY, ang), L * (0.2 + 0.8 * a), sM, 'f-green');
      if (m.tab) {
        var tm = rot(rot(298, 108, 276, 108, tabRel)[0], rot(298, 108, 276, 108, tabRel)[1], PX, PY, ang);
        var sT = tabRel >= 0 ? -1 : 1;
        arr += force(tm, 20 * Math.abs(tabRel) / 22, sT, sT === sM ? 'f-amber' : 'f-green');
      }
      q('c-arr').innerHTML = arr;

      var te = m.tab ? rot(rot(316, 108, 276, 108, tabRel)[0], rot(316, 108, 276, 108, tabRel)[1], PX, PY, ang)
        : rot(280, 108, PX, PY, ang);
      var off = te[1] - 108;
      AIR.forEach(function (x, i) {
        var y = x[0], o = off * x[1];
        q('c-a' + i).setAttribute('d', 'M0 ' + y + 'H140C210 ' + y + ' 250 ' + r1(y + o * 0.5) +
          ' 336 ' + r1(y + o));
      });

      var k = m.k(a), h0 = 130 * a, h1 = Math.min(150, 130 * a * k);
      q('c-b0').setAttribute('height', r1(h0)); q('c-b0').setAttribute('y', r1(180 - h0));
      q('c-b1').setAttribute('height', r1(h1)); q('c-b1').setAttribute('y', r1(180 - h1));
      q('c-out').innerHTML = m.note + (a < 0.03 ? '' : '<br><b>усилие ' + Math.round(k * 100) +
        ' %</b> от усилия без компенсации');
    }

    pick(frame, 'data-c', function (id) { mode = id; paint(); });
    var drv = driver(q('c-in'), function (x) { val = x / 100; paint(); }, 300,
      frame.querySelector('.fig-auto'));
    loop(frame, drv.tick);
  };

  /* ═══════════════════════════════════════════════════════
     2в. Закрылки: простой, щелевой, Фаулера, двухщелевой
     ═══════════════════════════════════════════════════════ */
  reg.flap = function (frame) {
    var X0 = 36, Y0 = 122, C = 300, T = 0.12, M = 0.03;
    var TYPES = {
      plain: { slot: 0, rail: 0, k: 0.55, cut: 0.74,
        parts: [{ a: 0.74, b: 1, dx: 0, dy: 0, d: 40 }] },
      slot: { slot: 1, rail: 0, k: 0.75, cut: 0.72,
        parts: [{ a: 0.72, b: 1, dx: 0.03, dy: 0.035, d: 40 }] },
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
      '<text class="t-sm" x="150" y="126" text-anchor="middle">крыло</text>' +
      '<text class="t-sm" id="fl-lbl" x="240" y="236" text-anchor="middle"></text>' +
      ['хорда профиля', 'отклонение закрылка', 'подъёмная сила (условно)'].map(function (t, i) {
        var y = 60 + i * 50;
        return '<text class="t-sm" x="486" y="' + (y - 6) + '">' + t + '</text>' +
          '<rect class="f-body" x="486" y="' + y + '" width="140" height="12" rx="6"/>' +
          '<rect id="fl-b' + i + '" class="' + (i === 2 ? 'f-green-fill' : 'f-blue-fill') +
          '" x="486" y="' + y + '" width="0" height="12" rx="6"/>' +
          '<text class="t-mono" id="fl-v' + i + '" x="626" y="' + (y + 26) + '" text-anchor="end"></text>';
      }).join('');

    frame.innerHTML = svg('0 0 640 246', s);
    controls(frame,
      '<div class="fig-row">' +
      '<button class="fig-btn" data-f="plain" type="button">Простой</button>' +
      '<button class="fig-btn" data-f="slot" type="button">Щелевой</button>' +
      '<button class="fig-btn is-on" data-f="fowler" type="button">Фаулера</button>' +
      '<button class="fig-btn" data-f="double" type="button">Двухщелевой</button></div>' +
      '<span class="fig-label">Выпуск</span>' +
      '<input class="fig-range" id="fl-in" type="range" min="0" max="100" value="0" ' +
      'aria-label="Выпуск закрылка">' + AUTO +
      '<span class="fig-readout" id="fl-out">0 %</span>');

    var q = function (id) { return frame.querySelector('#' + id); };
    var type = 'fowler', val = 0;

    function paint() {
      var tp = TYPES[type], e = val, parts = '', jets = '', te = null, rail = '';
      var last = null;
      tp.parts.forEach(function (p) {
        var sh = partPts(p.a, p.b), pl = place(tp, p, e);
        var pts = move(sh.pts, sh.le[0], sh.le[1], pl.rot, pl.dx, pl.dy);
        parts += '<path class="f-mov" d="' + closed(pts) + '"/>';
        te = pts[pts.length - 1];
        var le = [sh.le[0] + pl.dx, sh.le[1] + pl.dy];
        if (tp.rail) {
          var end = place(tp, p, 1);
          var b = [sh.le[0] + end.dx, sh.le[1] + end.dy];
          rail += 'M' + poly([sh.le]) + 'Q' + r1((sh.le[0] + b[0]) / 2) + ' ' + r1(b[1] + 6) + ' ' +
            r1(b[0]) + ' ' + r1(b[1]);
          parts += '<circle class="f-metal" cx="' + r1(le[0]) + '" cy="' + r1(le[1] + 4) + '" r="3.5"/>';
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
      var gain = lp.dx * last.slide, deg = lp.d * last.turn;
      var cl = tp.k * (0.4 * gain / 0.28 + 0.6 * deg / 45);
      q('fl-b0').setAttribute('width', r1(140 * (1 + gain) / 1.3));
      q('fl-b1').setAttribute('width', r1(140 * deg / 45));
      q('fl-b2').setAttribute('width', r1(140 * cl));
      q('fl-v0').textContent = gain < 0.005 ? 'исходная' : '+' + Math.round(gain * 100) + ' %';
      q('fl-v1').textContent = Math.round(deg) + '°';
      q('fl-v2').textContent = Math.round(cl * 100) + ' %';
      q('fl-out').textContent = Math.round(e * 100) + ' %';
      q('fl-lbl').textContent = e < 0.04 ? 'закрылок убран — профиль крыла целый'
        : type === 'plain' ? 'поворот увеличивает кривизну профиля, щели нет'
          : type === 'slot' ? 'щель подаёт воздух с нижней поверхности на верхнюю'
            : e < 0.6 ? 'выдвижение назад по рельсу: растёт площадь, открывается щель'
              : type === 'double' ? 'звенья разошлись: две щели затягивают срыв потока'
                : 'отклонение вниз: растёт кривизна профиля';
    }

    pick(frame, 'data-f', function (id) { type = id; paint(); });
    var drv = driver(q('fl-in'), function (x) { val = x / 100; paint(); }, 420,
      frame.querySelector('.fig-auto'));
    loop(frame, drv.tick);
  };

  /* ═══════════════════════════════════════════════════════
     3. Гидроусилитель со следящим золотником
     ═══════════════════════════════════════════════════════ */
  reg.booster = function (frame) {
    var PRESS = '#c3d8f2', RET = '#eef1f4', LOCK = '#dbe5f0';
    var s =
      '<path id="b-P" stroke-width="3" d="M300 8V30"/>' +
      '<path id="b-T1" stroke-width="3" d="M232 30V8"/>' +
      '<path id="b-T2" stroke-width="3" d="M368 30V8"/>' +
      '<text class="t-mono" x="308" y="12">P</text>' +
      '<text class="t-mono" x="240" y="12">T</text><text class="t-mono" x="376" y="12">T</text>' +
      '<rect class="f-body" x="200" y="30" width="200" height="50" rx="7"/>' +
      '<rect id="b-portL" x="258" y="80" width="14" height="8" rx="2"/>' +
      '<rect id="b-portR" x="328" y="80" width="14" height="8" rx="2"/>' +
      '<g id="b-spool"><path class="f-ink" stroke-width="4" d="M186 55H351"/>' +
      '<rect class="f-metal" x="240" y="38" width="22" height="34" rx="3"/>' +
      '<rect class="f-metal" x="284" y="38" width="32" height="34" rx="3"/>' +
      '<rect class="f-metal" x="338" y="38" width="22" height="34" rx="3"/></g>' +
      '<text class="t-sm" x="412" y="40">золотниковый</text>' +
      '<text class="t-sm" x="412" y="53">распределитель</text>' +
      '<text class="t-sm" x="14" y="118">P — питание от насоса</text>' +
      '<text class="t-sm" x="14" y="132">T — слив в бак</text>' +

      '<path id="b-A" stroke-width="3" d="M265 88V100H226V121"/>' +
      '<path id="b-B" stroke-width="3" d="M335 88V100H374V121"/>' +
      '<path class="f-dim" stroke-width="2" d="M212 116V180M204 126l8-8M204 138l8-8M204 150l8-8' +
      'M204 162l8-8M204 174l8-8"/>' +
      '<rect class="f-body" x="220" y="120" width="160" height="56" rx="6"/>' +
      '<rect id="b-cL" x="223" y="123" height="50"/>' +
      '<rect id="b-cR" y="123" height="50"/>' +
      '<g id="b-piston"><rect class="f-metal" x="290" y="122" width="20" height="52" rx="2"/>' +
      '<path class="f-ink" stroke-width="6" d="M310 148H470"/></g>' +
      '<text class="t-sm" x="300" y="192" text-anchor="middle">силовой цилиндр</text>' +

      '<path class="f-fix" d="M412 70h50q8 0 8 8t-8 8h-50z"/>' +
      '<g id="b-surf"><path class="f-mov" d="M470 70l110 8-110 8z"/>' +
      '<path class="f-ink" stroke-width="5" d="M470 78V146"/></g>' +
      '<circle class="f-metal" cx="470" cy="78" r="5"/>' +
      '<path id="b-link" class="f-ink" stroke-width="3"/>' +
      '<text class="t-sm" x="560" y="124" text-anchor="middle">руль</text>' +

      '<path id="b-inl" class="f-blue" stroke-width="3"/>' +
      '<text class="t-sm" x="16" y="22">от ручки пилота</text>' +
      '<path id="b-lever" class="f-blue" stroke-width="4"/>' +
      '<path id="b-splink" class="f-ink" stroke-width="3"/>' +
      '<path id="b-rock" class="f-green" stroke-width="4"/>' +
      '<circle class="f-metal" cx="160" cy="147" r="5"/>' +
      '<path id="b-fb1" class="f-green" stroke-width="3"/>' +
      '<path id="b-fb2" class="f-green" stroke-width="3"/>' +
      '<circle id="b-pin-in" class="f-blue-fill" cy="30" r="5"/>' +
      '<circle id="b-pin-sp" class="f-amber-fill" cy="55" r="5"/>' +
      '<circle id="b-pin-fb" class="f-green-fill" cy="80" r="5"/>' +
      '<text class="t-sm" x="300" y="232" text-anchor="middle">' +
      'обратная связь: шток через качалку возвращает золотник в нейтраль</text>';

    frame.innerHTML = svg('0 0 600 240', s);
    controls(frame,
      '<span class="fig-label">Ручка</span>' +
      '<input class="fig-range" id="b-in" type="range" min="-100" max="100" value="0" ' +
      'aria-label="Положение ручки">' +
      '<button class="fig-btn" id="b-step" type="button">Резко отклонить</button>' +
      '<span class="fig-readout" id="b-read">рассогласование 0 %</span>');

    var q = function (id) { return frame.querySelector('#' + id); };
    var input = q('b-in');
    var target = 0, pos = 0;

    function paint() {
      var err = clamp(target - pos, -1, 1), open = Math.abs(err) > 0.01, dir = err > 0;
      var sp = err * 15, d = pos * 30;
      var top = 120 + target * 30, bot = 120 - pos * 30, mid = (top + bot) / 2;

      q('b-spool').setAttribute('transform', 'translate(' + r1(sp) + ' 0)');
      q('b-splink').setAttribute('d', 'M' + r1(mid) + ' 55H' + r1(186 + sp));
      q('b-inl').setAttribute('d', 'M16 30H' + r1(top));
      q('b-lever').setAttribute('d', 'M' + r1(top) + ' 30L' + r1(bot) + ' 80');
      q('b-pin-in').setAttribute('cx', r1(top));
      q('b-pin-sp').setAttribute('cx', r1(mid));
      q('b-pin-fb').setAttribute('cx', r1(bot));
      q('b-rock').setAttribute('d', 'M' + r1(160 - d) + ' 80L' + r1(160 + d) + ' 214');
      q('b-fb1').setAttribute('d', 'M' + r1(bot) + ' 80H' + r1(160 - d));
      q('b-fb2').setAttribute('d', 'M' + r1(160 + d) + ' 214H' + r1(420 + d) + 'V148');

      q('b-piston').setAttribute('transform', 'translate(' + r1(d) + ' 0)');
      var del = Math.asin(clamp(d / 68, -1, 1)) / DEG;
      q('b-surf').setAttribute('transform', 'rotate(' + r1(-del) + ' 470 78)');
      var tip = rot(470, 146, 470, 78, -del);
      q('b-link').setAttribute('d', 'M' + r1(470 + d) + ' 148L' + r1(tip[0]) + ' ' + r1(tip[1]));

      q('b-cL').setAttribute('width', r1(67 + d));
      q('b-cR').setAttribute('x', r1(310 + d));
      q('b-cR').setAttribute('width', r1(67 - d));
      q('b-cL').setAttribute('fill', open ? (dir ? PRESS : RET) : LOCK);
      q('b-cR').setAttribute('fill', open ? (dir ? RET : PRESS) : LOCK);

      q('b-P').setAttribute('class', open ? 'f-blue f-flow' : 'f-blue');
      q('b-A').setAttribute('class', !open ? 'f-dim' : dir ? 'f-blue f-flow' : 'f-ret f-flow rev');
      q('b-B').setAttribute('class', !open ? 'f-dim' : dir ? 'f-ret f-flow rev' : 'f-blue f-flow');
      q('b-T1').setAttribute('class', open && !dir ? 'f-ret f-flow' : 'f-ret');
      q('b-T2').setAttribute('class', open && dir ? 'f-ret f-flow' : 'f-ret');
      q('b-portL').setAttribute('fill', !open ? '#c9ced4' : dir ? '#1d5fb8' : '#9aabbd');
      q('b-portR').setAttribute('fill', !open ? '#c9ced4' : dir ? '#9aabbd' : '#1d5fb8');

      q('b-read').textContent = 'рассогласование ' + Math.round(err * 100) + ' %' +
        (open ? ' — жидкость идёт в полость' : ' — золотник закрыт, шток заперт жидкостью');
    }

    var raf = null;
    function tick() {
      var err = target - pos;
      if (Math.abs(err) < 0.004) { pos = target; paint(); raf = null; return; }
      pos += clamp(err * 0.06, -0.025, 0.025);   /* расход ограничен открытием окна */
      paint();
      raf = requestAnimationFrame(tick);
    }
    function run() {
      if (reduced) { pos = target; paint(); return; }
      if (!raf) raf = requestAnimationFrame(tick);
    }
    input.addEventListener('input', function () { target = +input.value / 100; run(); });
    q('b-step').addEventListener('click', function () {
      target = target > 0 ? -1 : 1;
      input.value = target * 100;
      run();
    });
    paint();
  };

  /* ═══════════════════════════════════════════════════════
     4. Загрузочное устройство, МЭТ и механизм Kш
     ═══════════════════════════════════════════════════════ */
  reg.feel = function (frame) {
    var GX = 530, GY = 120;
    function phiOf(v, r) { return Math.asin(clamp(40 * Math.sin(v * 16 * DEG) / r, -1, 1)); }
    var FMAX = 30 * Math.sin(phiOf(1, 20)) * 30 / 20;

    var s =
      '<path class="f-dim" d="M20 214H410"/>' +
      '<path id="fe-out" class="f-blue" stroke-width="3"/>' +
      '<text class="t-sm" x="200" y="114">к бустеру</text>' +
      '<g id="fe-stick"><path class="f-ink" stroke-width="5" d="M60 214V100"/>' +
      '<circle class="f-ink" cx="60" cy="94" r="9"/></g>' +
      '<circle class="f-metal" cx="60" cy="214" r="5"/>' +
      '<text class="t-sm" x="60" y="232" text-anchor="middle">рычаг пилота</text>' +
      '<g id="fe-hf"></g>' +
      '<path id="fe-rod" class="f-blue" stroke-width="4"/>' +
      '<g id="fe-rk"><path class="f-ink" stroke-width="6" d="M220 126V204"/></g>' +
      '<rect id="fe-blk" class="f-metal" width="14" height="10" rx="2"/>' +
      '<circle class="f-metal" cx="220" cy="174" r="5"/>' +
      '<text class="t-sm" x="232" y="160">качалка</text>' +
      '<path id="fe-kl" class="f-sig" stroke-width="2" stroke-dasharray="4 3"/>' +
      '<rect class="f-body" x="262" y="96" width="92" height="24" rx="5"/>' +
      '<text class="t-sm" x="308" y="112" text-anchor="middle">механизм Kш</text>' +
      '<path id="fe-spr" class="f-red" stroke-width="2.6"/>' +
      '<path id="fe-met" class="f-ink" stroke-width="4"/>' +
      '<rect id="fe-anc" class="f-metal" y="196" width="8" height="16" rx="2"/>' +
      '<rect class="f-body" x="356" y="194" width="46" height="20" rx="4"/>' +
      '<text class="t-sm" x="379" y="208" text-anchor="middle">МЭТ</text>' +
      '<text class="t-sm" x="290" y="232" text-anchor="middle">пружина загружателя</text>' +
      /* график усилия */
      '<rect class="f-body" x="440" y="26" width="180" height="188" rx="6"/>' +
      '<path class="f-dim" d="M440 120H620M530 26V214"/>' +
      '<text class="t-sm" x="440" y="18">усилие на рычаге</text>' +
      '<text class="t-sm" x="616" y="134" text-anchor="end">ход рычага</text>' +
      '<path id="fe-g0" class="f-dim" stroke-width="2" stroke-dasharray="5 4"/>' +
      '<path id="fe-g1" class="f-blue" stroke-width="2.6"/>' +
      '<circle id="fe-pt" class="f-red-fill" r="5"/>' +
      '<text class="t-sm" x="630" y="232" text-anchor="end">пунктир: малая скорость, МЭТ в нейтрали</text>';

    frame.innerHTML = svg('0 0 640 240', s);
    controls(frame,
      '<div class="fig-row"><span class="fig-label">Рычаг</span>' +
      '<input class="fig-range" id="fe-in" type="range" min="-100" max="100" value="0" ' +
      'aria-label="Отклонение рычага">' + AUTO + '</div>' +
      '<div class="fig-row"><span class="fig-label">Скорость полёта</span>' +
      '<input class="fig-range" id="fe-v" type="range" min="0" max="100" value="30" ' +
      'aria-label="Скорость полёта"></div>' +
      '<button class="fig-btn" id="fe-trim" type="button">МЭТ: снять усилие</button>' +
      '<button class="fig-btn" id="fe-zero" type="button">МЭТ в нейтраль</button>' +
      '<button class="fig-btn" id="fe-off" type="button">Без загружателя</button>' +
      '<span class="fig-readout" id="fe-read"></span>');

    var q = function (id) { return frame.querySelector('#' + id); };
    var v = 0, sp = 0.3, tr = 0, trT = 0, loader = true;

    function arm() { return 44 - 24 * sp; }
    function force(x, r, t) {
      return loader ? (t + 30 * Math.sin(phiOf(x, r))) * 30 / r : 0;
    }
    function graph(r, t, on) {
      var pts = [];
      for (var i = 0; i <= 24; i++) {
        var x = -1 + i / 12;
        var f = on ? force(x, r, t) : 0;
        pts.push([GX + x * 84, clamp(GY - f / FMAX * 88, 28, 212)]);
      }
      return 'M' + poly(pts);
    }

    function paint() {
      var r = arm(), th = v * 16, phi = phiOf(v, r) / DEG;
      var S = rot(60, 174, 60, 214, th), O = rot(60, 110, 60, 214, th);
      var A = rot(220, 174 - r, 220, 174, phi), B = rot(220, 204, 220, 174, phi);
      q('fe-stick').setAttribute('transform', 'rotate(' + r1(th) + ' 60 214)');
      q('fe-out').setAttribute('d', 'M' + poly([O, [O[0] + 116, O[1]]]));
      q('fe-rod').setAttribute('d', 'M' + poly([S, A]));
      q('fe-rk').setAttribute('transform', 'rotate(' + r1(phi) + ' 220 174)');
      q('fe-blk').setAttribute('x', r1(A[0] - 7));
      q('fe-blk').setAttribute('y', r1(A[1] - 5));
      q('fe-kl').setAttribute('d', 'M262 108L' + r1(A[0] + 7) + ' ' + r1(A[1]));

      var anc = 330 + tr;
      q('fe-spr').setAttribute('d', zig(B[0], 204, anc, 204, 12, 6));
      q('fe-spr').style.opacity = loader ? 1 : 0.2;
      q('fe-anc').setAttribute('x', r1(anc));
      q('fe-met').setAttribute('d', 'M' + r1(anc + 8) + ' 204H356');

      var F = force(v, r, tr), pct = Math.round(F / FMAX * 100);
      var Kn = rot(60, 94, 60, 214, th), sg = F >= 0 ? 1 : -1;
      q('fe-hf').innerHTML = Math.abs(pct) > 3
        ? arrow(Kn[0] + sg * 12, Kn[1], Kn[0] + sg * (12 + Math.abs(pct) * 0.5), Kn[1], 'f-red', 3) : '';
      q('fe-g0').setAttribute('d', graph(44, 0, true));
      q('fe-g1').setAttribute('d', graph(r, tr, loader));
      q('fe-pt').setAttribute('cx', r1(GX + v * 84));
      q('fe-pt').setAttribute('cy', r1(clamp(GY - F / FMAX * 88, 28, 212)));
      q('fe-read').textContent = !loader ? 'без загружателя рычаг не сопротивляется: усилие 0 %'
        : 'усилие ' + Math.abs(pct) + ' % · плечо качалки ' +
        (r > 36 ? 'большое' : r > 28 ? 'среднее' : 'малое');
    }

    q('fe-v').addEventListener('input', function () { sp = +q('fe-v').value / 100; paint(); });
    q('fe-trim').addEventListener('click', function () {
      drv.stop();
      trT = -30 * Math.sin(phiOf(v, arm()));
      if (reduced) { tr = trT; paint(); }
    });
    q('fe-zero').addEventListener('click', function () { trT = 0; if (reduced) { tr = 0; paint(); } });
    q('fe-off').addEventListener('click', function () {
      loader = !loader;
      q('fe-off').classList.toggle('is-on', !loader);
      paint();
    });
    var drv = driver(q('fe-in'), function (x) { v = x / 100; paint(); }, 360,
      frame.querySelector('.fig-auto'));
    loop(frame, function () {
      drv.tick();
      if (Math.abs(trT - tr) > 0.05) { tr += (trT - tr) * 0.08; paint(); }
    });
  };

  /* ═══════════════════════════════════════════════════════
     5. ЭДСУ: путь сигнала и защиты в трёх законах
     ═══════════════════════════════════════════════════════ */
  reg.fbw = function (frame) {
    var s =
      '<rect class="f-body" x="10" y="92" width="110" height="70" rx="8"/>' +
      '<text x="65" y="108" text-anchor="middle">Side Stick</text>' +
      '<path class="f-dim" d="M44 150h42"/>' +
      '<g id="w-stick"><path class="f-ink" stroke-width="4" d="M65 150V126"/>' +
      '<circle class="f-ink" cx="65" cy="121" r="5"/></g>' +
      '<circle class="f-metal" cx="65" cy="150" r="3"/>' +
      '<text class="t-sm" x="65" y="178" text-anchor="middle">датчики положения</text>' +

      '<g id="w-laws"><rect class="f-body" x="160" y="16" width="140" height="56" rx="8"/>' +
      '<text x="230" y="38" text-anchor="middle">Законы и защиты</text>' +
      '<text class="t-sm" id="w-prot" x="230" y="56" text-anchor="middle"></text></g>' +
      '<rect class="f-body" x="160" y="110" width="140" height="50" rx="8"/>' +
      '<text x="230" y="132" text-anchor="middle">Вычислители</text>' +
      '<text class="t-sm" x="230" y="148" text-anchor="middle">ELAC · SEC</text>' +
      '<g id="w-sens"><rect class="f-body" x="340" y="16" width="130" height="56" rx="8"/>' +
      '<text x="405" y="38" text-anchor="middle">Датчики</text>' +
      '<text class="t-sm" x="405" y="56" text-anchor="middle">скорость, α, перегрузка</text></g>' +
      '<rect class="f-body" x="340" y="110" width="120" height="50" rx="8"/>' +
      '<text x="400" y="132" text-anchor="middle">Привод</text>' +
      '<text class="t-sm" x="400" y="148" text-anchor="middle">золотник и шток</text>' +
      '<rect class="f-body" x="500" y="110" width="130" height="50" rx="8"/>' +
      '<path class="f-fix" d="M514 135q0-6 10-6h40v12h-40q-10 0-10-6z"/>' +
      '<g id="w-surf"><path class="f-mov" d="M564 129l52 6-52 6z"/></g>' +
      '<circle class="f-metal" cx="564" cy="135" r="3"/>' +
      '<text class="t-sm" x="565" y="178" text-anchor="middle">руль высоты</text>' +

      '<path id="w-p1" stroke-width="3" d="M120 112H140V44H160"/>' +
      '<path id="w-p2" stroke-width="3" d="M230 72V110"/>' +
      '<path id="w-p3" stroke-width="3" d="M120 140H160"/>' +
      '<path class="f-sig f-flow" stroke-width="3" d="M300 135H340"/>' +
      '<path id="w-p6" stroke-width="3" d="M340 44H300"/>' +
      '<path class="f-blue f-flow" stroke-width="3" d="M460 135H500"/>' +
      '<path class="f-green f-flow" stroke-width="2.5" d="M565 160V196H400V160"/>' +
      '<text class="t-sm" x="482" y="212" text-anchor="middle">обратная связь по положению штока</text>' +

      '<text class="t-sm" x="500" y="30">угол атаки (условно)</text>' +
      '<rect class="f-body" x="500" y="40" width="130" height="14" rx="7"/>' +
      '<rect id="w-aoa" x="500" y="40" width="0" height="14" rx="7"/>' +
      '<path class="f-red" stroke-width="2" d="M607 34v26"/>' +
      '<text class="t-sm t-red" x="607" y="74" text-anchor="middle">предел</text>' +
      '<text id="w-mode" x="320" y="236" text-anchor="middle"></text>';

    frame.innerHTML = svg('0 0 640 244', s);
    controls(frame,
      '<div class="fig-row"><span class="fig-label">Закон</span>' +
      '<button class="fig-btn is-on" data-m="0" type="button">Normal</button>' +
      '<button class="fig-btn" data-m="1" type="button">Alternate</button>' +
      '<button class="fig-btn" data-m="2" type="button">Direct</button></div>' +
      '<span class="fig-label">Ручка на себя</span>' +
      '<input class="fig-range" id="w-in" type="range" min="-100" max="100" value="0" ' +
      'aria-label="Отклонение ручки">' + AUTO +
      '<span class="fig-readout" id="w-out"></span>');

    var q = function (id) { return frame.querySelector('#' + id); };
    var MODES = [
      { via: true, lim: 0.72, prot: 'α, перегрузка, крен, скорость',
        text: 'Normal Law — работают все защиты' },
      { via: true, lim: 0.9, prot: 'часть защит отключена',
        text: 'Alternate Law — часть защит отключена, управление ближе к классическому' },
      { via: false, lim: 9, prot: 'не используются',
        text: 'Direct Law — ручка прямо задаёт отклонение руля, защит нет' }
    ];
    var mode = 0, v = 0, surf = 0;

    function setMode(i) {
      var m = MODES[mode = i];
      ['w-p1', 'w-p2', 'w-p6'].forEach(function (id) {
        q(id).setAttribute('class', m.via ? 'f-sig f-flow' : 'f-dim');
      });
      q('w-p3').setAttribute('class', m.via ? 'f-dim' : 'f-sig f-flow');
      q('w-laws').style.opacity = m.via ? 1 : 0.35;
      q('w-sens').style.opacity = m.via ? 1 : 0.35;
      q('w-mode').textContent = m.text;
    }

    function paint() {
      var m = MODES[mode];
      var cmd = m.via ? clamp(v, -m.lim, m.lim) : v;
      surf += (cmd - surf) * (reduced ? 1 : 0.12);
      q('w-stick').setAttribute('transform', 'rotate(' + r1(-v * 20) + ' 65 150)');
      q('w-surf').setAttribute('transform', 'rotate(' + r1(-surf * 22) + ' 564 135)');
      var aoa = clamp(0.3 + 0.7 * surf, 0, 1), over = aoa > 0.82;
      var bar = q('w-aoa');
      bar.setAttribute('width', r1(130 * aoa));
      bar.setAttribute('class', over ? 'f-red-fill' : 'f-blue-fill');
      var lim = m.via && Math.abs(v) > m.lim;
      q('w-prot').textContent = lim ? 'команда ограничена' : m.prot;
      q('w-prot').setAttribute('class', lim ? 't-sm t-red' : 't-sm');
      q('w-out').textContent = 'ручка ' + Math.round(v * 100) + ' % · руль ' +
        Math.round(surf * 100) + ' %' + (over ? ' · угол атаки за пределом' : '');
    }

    pick(frame, 'data-m', function (i) { setMode(+i); paint(); });
    setMode(0);
    var drv = driver(q('w-in'), function (x) { v = x / 100; if (reduced) paint(); }, 300,
      frame.querySelector('.fig-auto'));
    loop(frame, function () { drv.tick(); paint(); });
  };

  /* ═══════════════════════════════════════════════════════
     5б. Сервопривод элерона A320: активный режим и демпфирование
     ═══════════════════════════════════════════════════════ */
  reg.servo320 = function (frame) {
    var PRESS = '#c3d8f2', RET = '#eef1f4', LOCK = '#dbe5f0';
    var s =
      '<rect class="f-body" x="14" y="20" width="90" height="40" rx="7"/>' +
      '<text x="59" y="38" text-anchor="middle">ELAC</text>' +
      '<text class="t-sm" x="59" y="52" text-anchor="middle">компьютер</text>' +
      '<path id="v-e1" class="f-sig" stroke-width="2.5" d="M104 40H130"/>' +
      '<path id="v-e2" class="f-sig" stroke-width="2.5" d="M59 20V8H300V20"/>' +
      '<rect id="v-sol" x="130" y="20" width="84" height="40" rx="7"/>' +
      '<text class="t-sm" x="172" y="36" text-anchor="middle">электромагн.</text>' +
      '<text class="t-sm" x="172" y="50" text-anchor="middle">клапан</text>' +
      '<path id="v-solP" stroke-width="3" d="M150 76V60"/>' +
      '<text class="t-mono" x="150" y="88" text-anchor="middle">P</text>' +
      '<path id="v-pil" stroke-width="3" d="M190 60V110H226"/>' +

      '<rect class="f-body" x="250" y="20" width="100" height="40" rx="7"/>' +
      '<text x="300" y="44" text-anchor="middle">сервоклапан</text>' +
      '<path id="v-P" stroke-width="3" d="M392 32H350"/>' +
      '<path id="v-R" stroke-width="3" d="M350 48H392"/>' +
      '<text class="t-mono" x="398" y="36">P</text><text class="t-mono" x="398" y="52">R</text>' +
      '<g id="v-shut"><path class="f-red" stroke-width="2.5" d="M372 26l8 12M380 26l-8 12M372 42l8 12M380 42l-8 12"/>' +
      '<text class="t-sm t-red" x="412" y="44">запорные клапаны</text></g>' +
      '<path id="v-s1" stroke-width="3" d="M270 60V96"/>' +
      '<path id="v-s2" stroke-width="3" d="M330 60V96"/>' +

      '<rect class="f-body" x="226" y="96" width="204" height="28" rx="5"/>' +
      '<text class="t-sm" x="236" y="92">селектор режимов</text>' +
      '<g id="v-act"><path class="f-blue" stroke-width="3" d="M270 96V124M330 96V124"/></g>' +
      '<g id="v-dmp"><path class="f-ink" stroke-width="3" d="M270 118H292M308 118H330M270 124V118M330 124V118"/>' +
      '<path class="f-ink" stroke-width="2" d="M292 112q8 6 0 12M308 112q-8 6 0 12"/>' +
      '<path class="f-dim" stroke-width="2" d="M264 100l12 10M276 100l-12 10M324 100l12 10M336 100l-12 10"/></g>' +
      '<path id="v-byp" stroke-width="2.4" d="M272 116H328"/>' +
      '<path id="v-spr" class="f-ink" stroke-width="2"/>' +
      '<path class="f-dim" stroke-width="2" d="M466 92V128"/>' +
      '<text class="t-sm" x="444" y="146" text-anchor="middle">пружина</text>' +

      '<path id="v-c1" stroke-width="3" d="M270 124V138H252V151"/>' +
      '<path id="v-c2" stroke-width="3" d="M330 124V138H408V151"/>' +
      '<rect class="f-body" x="240" y="150" width="180" height="46" rx="6"/>' +
      '<rect id="v-cL" x="243" y="153" height="40"/>' +
      '<rect id="v-cR" y="153" height="40"/>' +
      '<g id="v-pis"><rect class="f-metal" x="322" y="152" width="16" height="42" rx="2"/>' +
      '<path class="f-ink" stroke-width="5" d="M338 173H540"/></g>' +
      '<rect class="f-body" x="440" y="164" width="40" height="18" rx="3"/>' +
      '<text class="t-sm" x="460" y="200" text-anchor="middle">LVDT</text>' +
      '<path id="v-fb" class="f-sig" stroke-width="2.5" d="M460 182V222H59V60"/>' +
      '<text class="t-sm" x="260" y="236" text-anchor="middle">сигнал положения штока возвращается в ELAC</text>' +

      '<g id="v-res"><rect class="f-body" x="120" y="150" width="70" height="36" rx="5"/>' +
      '<text class="t-sm" x="155" y="166" text-anchor="middle">резервный</text>' +
      '<text class="t-sm" x="155" y="179" text-anchor="middle">резервуар</text>' +
      '<path id="v-rl" stroke-width="2.4" d="M190 168H240"/>' +
      '<circle class="f-body" cx="215" cy="168" r="7"/><path class="f-ink" stroke-width="1.6" d="M211 163v10l8-5z"/></g>' +

      '<path class="f-fix" d="M500 126h54q8 0 8 7t-8 7h-54z"/>' +
      '<g id="v-ail"><path class="f-mov" d="M562 126l66 7-66 7z"/>' +
      '<path class="f-ink" stroke-width="4" d="M562 133V172"/></g>' +
      '<circle class="f-metal" cx="562" cy="133" r="4"/>' +
      '<path id="v-link" class="f-ink" stroke-width="3"/>' +
      '<text class="t-sm" x="596" y="160" text-anchor="middle">элерон</text>';

    frame.innerHTML = svg('0 0 640 244', s);
    controls(frame,
      '<button class="fig-btn is-on" data-v="act" type="button">Активный</button>' +
      '<button class="fig-btn" data-v="dmp" type="button">Демпфирование</button>' +
      '<button class="fig-btn" data-v="fail" type="button">Отказ гидравлики</button>' +
      '<span class="fig-readout" id="v-out"></span>');

    var q = function (id) { return frame.querySelector('#' + id); };
    var NOTE = {
      act: 'клапан под питанием · селектор в активном положении · камеры подключены к сервоклапану',
      dmp: 'клапан обесточен · пружина сдвинула селектор · камеры соединены через жиклёр',
      fail: 'запорные клапаны отсекли привод · резерв удерживает жидкость в камерах'
    };
    var mode = 'act', pos = 0, prev = 0;

    function setMode(id) {
      mode = id;
      var act = id === 'act', fail = id === 'fail';
      q('v-sol').setAttribute('fill', act ? '#fdf2e0' : '#f3f3ee');
      q('v-sol').setAttribute('stroke', act ? '#a8660a' : '#d2d2c9');
      q('v-e1').setAttribute('class', act ? 'f-sig f-flow' : 'f-dim');
      q('v-e2').setAttribute('class', act ? 'f-sig f-flow' : 'f-dim');
      q('v-solP').setAttribute('class', fail ? 'f-dim' : 'f-blue');
      q('v-pil').setAttribute('class', act ? 'f-blue' : 'f-dim');
      q('v-P').setAttribute('class', fail ? 'f-dim' : 'f-blue');
      q('v-R').setAttribute('class', fail ? 'f-dim' : 'f-ret');
      q('v-shut').style.display = fail ? '' : 'none';
      q('v-act').style.display = act ? '' : 'none';
      q('v-dmp').style.display = act ? 'none' : '';
      q('v-spr').setAttribute('d', zig(430, 110, 466, 110, 8, act ? 4 : 7));
      q('v-res').style.opacity = fail ? 1 : 0.45;
      q('v-out').textContent = NOTE[id];
    }

    function paint(t) {
      var act = mode === 'act';
      var goal = act ? 0.8 * Math.sin(t * 0.02)
        : 0.6 * Math.sin(t * 0.011) * Math.sin(t * 0.037 + 1);
      pos += (goal - pos) * (act ? 0.12 : 0.02);
      var vel = pos - prev, moving = Math.abs(vel) > 0.0008, right = vel > 0;
      prev = pos;
      var d = pos * 20;
      q('v-pis').setAttribute('transform', 'translate(' + r1(d) + ' 0)');
      q('v-cL').setAttribute('width', r1(79 + d));
      q('v-cR').setAttribute('x', r1(338 + d));
      q('v-cR').setAttribute('width', r1(79 - d));
      var del = Math.asin(clamp(d / 39, -1, 1)) / DEG;
      q('v-ail').setAttribute('transform', 'rotate(' + r1(-del) + ' 562 133)');
      var tip = rot(562, 172, 562, 133, -del);
      q('v-link').setAttribute('d', 'M' + r1(540 + d) + ' 173L' + r1(tip[0]) + ' ' + r1(tip[1]));

      if (act) {
        q('v-cL').setAttribute('fill', moving ? (right ? PRESS : RET) : LOCK);
        q('v-cR').setAttribute('fill', moving ? (right ? RET : PRESS) : LOCK);
        q('v-s1').setAttribute('class', !moving ? 'f-dim' : right ? 'f-blue f-flow' : 'f-ret f-flow rev');
        q('v-s2').setAttribute('class', !moving ? 'f-dim' : right ? 'f-ret f-flow rev' : 'f-blue f-flow');
        q('v-c1').setAttribute('class', !moving ? 'f-dim' : right ? 'f-blue f-flow' : 'f-ret f-flow rev');
        q('v-c2').setAttribute('class', !moving ? 'f-dim' : right ? 'f-ret f-flow rev' : 'f-blue f-flow');
        q('v-byp').setAttribute('class', 'f-dim');
        q('v-byp').style.opacity = 0;
        q('v-rl').setAttribute('class', 'f-dim');
      } else {
        q('v-cL').setAttribute('fill', LOCK);
        q('v-cR').setAttribute('fill', LOCK);
        q('v-s1').setAttribute('class', 'f-dim');
        q('v-s2').setAttribute('class', 'f-dim');
        /* шток толкает поток: из сжимаемой камеры через жиклёр в другую */
        q('v-c1').setAttribute('class', !moving ? 'f-dim' : right ? 'f-ret f-flow rev' : 'f-ret f-flow');
        q('v-c2').setAttribute('class', !moving ? 'f-dim' : right ? 'f-ret f-flow' : 'f-ret f-flow rev');
        q('v-byp').setAttribute('class', moving ? 'f-blue f-flow' + (right ? ' rev' : '') : 'f-dim');
        q('v-byp').style.opacity = 1;
        q('v-rl').setAttribute('class', mode === 'fail' ? 'f-blue' : 'f-dim');
      }
      q('v-fb').setAttribute('class', act ? 'f-sig f-flow' : 'f-dim');
    }

    pick(frame, 'data-v', setMode);
    setMode('act');
    loop(frame, paint);
  };

  /* ═══════════════════════════════════════════════════════
     5в. Боковые ручки: раздельный и связанный режим
     ═══════════════════════════════════════════════════════ */
  reg.sidestick = function (frame) {
    function stickSvg(id, x, who) {
      return '<rect class="f-body" x="' + (x - 70) + '" y="150" width="140" height="40" rx="8"/>' +
        '<g id="' + id + '"><path class="f-ink" stroke-width="7" d="M' + x + ' 160V88"/>' +
        '<rect class="f-ink" x="' + (x - 10) + '" y="70" width="20" height="26" rx="8" fill="#e3e7ec"/>' +
        '<circle id="' + id + 'b" cx="' + (x + 5) + '" cy="76" r="3.5" fill="#c9ced4"/></g>' +
        '<circle class="f-metal" cx="' + x + '" cy="160" r="6"/>' +
        '<text class="t-sm" x="' + x + '" y="206" text-anchor="middle">' + who + '</text>' +
        '<text class="t-mono" id="' + id + 'v" x="' + x + '" y="182" text-anchor="middle"></text>';
    }
    var s =
      stickSvg('ss-l', 110, 'командир (левая консоль)') +
      stickSvg('ss-r', 330, 'второй пилот (правая)') +
      '<path id="ss-link" stroke-width="2.5" d="M180 170H260"/>' +
      '<text class="t-sm" id="ss-lt" x="220" y="142" text-anchor="middle"></text>' +
      '<path class="f-sig f-flow" stroke-width="2.5" d="M110 190V222H460V150"/>' +
      '<path class="f-sig f-flow" stroke-width="2.5" d="M330 190V222"/>' +
      '<rect class="f-body" x="420" y="30" width="206" height="120" rx="10"/>' +
      '<text x="523" y="50" text-anchor="middle">Команда в систему</text>' +
      '<rect class="f-body" x="440" y="62" width="166" height="12" rx="6"/>' +
      '<path class="f-dim" d="M523 58v20"/>' +
      '<rect id="ss-bar" class="f-blue-fill" y="62" height="12" rx="3"/>' +
      '<path class="f-fix" d="M466 104q0-6 10-6h40v12h-40q-10 0-10-6z"/>' +
      '<g id="ss-surf"><path class="f-mov" d="M516 98l56 6-56 6z"/></g>' +
      '<text class="t-sm" id="ss-why" x="523" y="138" text-anchor="middle"></text>' +
      '<text class="t-sm t-red" id="ss-shk" x="220" y="30" text-anchor="middle"></text>';

    frame.innerHTML = svg('0 0 640 232', s);
    controls(frame,
      '<div class="fig-row">' +
      '<button class="fig-btn is-on" data-s="sep" type="button">Раздельный</button>' +
      '<button class="fig-btn" data-s="cpl" type="button">Связанный</button>' +
      '<button class="fig-btn" id="ss-tl" type="button">TAKE OVER слева</button>' +
      '<button class="fig-btn" id="ss-tr" type="button">TAKE OVER справа</button>' +
      '<button class="fig-btn" id="ss-sh" type="button">Угроза сваливания</button></div>' +
      '<div class="fig-row"><span class="fig-label">Левая</span>' +
      '<input class="fig-range" id="ss-inl" type="range" min="-100" max="100" value="0" ' +
      'aria-label="Левая ручка">' + AUTO + '</div>' +
      '<span class="fig-label">Правая</span>' +
      '<input class="fig-range" id="ss-inr" type="range" min="-100" max="100" value="0" ' +
      'aria-label="Правая ручка">');

    var q = function (id) { return frame.querySelector('#' + id); };
    var L = 0, R = 0, coupled = false, prio = '', shake = 0;
    var inl = q('ss-inl'), inr = q('ss-inr');

    function logic() {
      if (coupled) return { out: L, why: 'ручки движутся синхронно' };
      if (prio === 'l') return { out: L, why: 'приоритет у левой ручки, правая отключена' };
      if (prio === 'r') return { out: R, why: 'приоритет у правой ручки, левая отключена' };
      var a = Math.abs(L) > 0.04, b = Math.abs(R) > 0.04;
      if (a && b && L * R < 0) return { out: 0, why: 'в разные стороны — сигнал не проходит' };
      if (a && b) return { out: Math.abs(L) > Math.abs(R) ? L : R, why: 'в одну сторону — берётся большее отклонение' };
      return { out: a ? L : R, why: a || b ? 'работает одна ручка' : 'ручки в нейтрали' };
    }

    function paint(t) {
      var j = shake > 0 ? Math.sin(t * 1.9) * 3 : 0;
      q('ss-l').setAttribute('transform', 'rotate(' + r1(-L * 20 + j) + ' 110 160)');
      q('ss-r').setAttribute('transform', 'rotate(' + r1(-R * 20 + j) + ' 330 160)');
      q('ss-lv').textContent = Math.round(L * 100) + ' %';
      q('ss-rv').textContent = Math.round(R * 100) + ' %';
      q('ss-lb').setAttribute('fill', prio === 'l' ? '#a92920' : '#c9ced4');
      q('ss-rb').setAttribute('fill', prio === 'r' ? '#a92920' : '#c9ced4');
      q('ss-l').style.opacity = prio === 'r' ? 0.45 : 1;
      q('ss-r').style.opacity = prio === 'l' ? 0.45 : 1;
      q('ss-link').setAttribute('class', coupled ? 'f-sig f-flow' : 'f-dim');
      q('ss-lt').textContent = coupled ? 'электрическая связь ручек' : 'механической связи нет';
      var r = logic();
      var w = r.out * 83;
      q('ss-bar').setAttribute('x', r1(w >= 0 ? 523 : 523 + w));
      q('ss-bar').setAttribute('width', r1(Math.abs(w)));
      q('ss-surf').setAttribute('transform', 'rotate(' + r1(-r.out * 20) + ' 516 104)');
      q('ss-why').textContent = r.why;
      q('ss-shk').textContent = shake > 0 ? 'вибрация ручек: угроза сваливания' : '';
    }

    function setL(v) { L = v / 100; if (coupled) { R = L; inr.value = v; } }
    var drv = driver(inl, setL, 300, frame.querySelector('.fig-auto'));
    inr.addEventListener('input', function () {
      R = +inr.value / 100;
      if (coupled) { drv.stop(); L = R; inl.value = inr.value; }
    });
    pick(frame, 'data-s', function (id) {
      coupled = id === 'cpl';
      if (coupled) { prio = ''; R = L; inr.value = L * 100; }
      q('ss-tl').classList.remove('is-on'); q('ss-tr').classList.remove('is-on');
    });
    function takeover(side, btn, other) {
      if (coupled) return;
      prio = prio === side ? '' : side;
      btn.classList.toggle('is-on', prio === side);
      other.classList.remove('is-on');
    }
    q('ss-tl').addEventListener('click', function () { takeover('l', q('ss-tl'), q('ss-tr')); });
    q('ss-tr').addEventListener('click', function () { takeover('r', q('ss-tr'), q('ss-tl')); });
    q('ss-sh').addEventListener('click', function () { shake = 150; });
    loop(frame, function (t) {
      drv.tick();
      if (shake > 0) shake--;
      paint(t);
    });
  };

  /* ═══════════════════════════════════════════════════════
     6. Трансмиссия механизации и защита от рассинхронизации
     ═══════════════════════════════════════════════════════ */
  reg.flapsync = function (frame) {
    var STEPS = ['1. срабатывает сигнализация экипажу',
      '2. привод закрылков останавливается',
      '3. тормоза WTB фиксируют вал трансмиссии',
      '4. крен от рассогласования парируется элеронами'];
    var FL = [[60, 160], [170, 290]], FR = [[350, 470], [480, 580]];
    var s =
      '<path class="f-fix" d="M40 96H290V140H40z"/><path class="f-fix" d="M350 96H600V140H350z"/>' +
      '<rect class="f-fix" x="290" y="14" width="60" height="226" rx="28"/>' +
      '<text class="t-sm" x="166" y="90" text-anchor="middle">левое крыло</text>' +
      '<text class="t-sm" x="474" y="90" text-anchor="middle">правое крыло</text>' +
      '<rect class="f-body" x="298" y="30" width="44" height="22" rx="4"/>' +
      '<text class="t-sm" x="320" y="45" text-anchor="middle">FLAPS</text>' +
      '<rect class="f-body" x="298" y="58" width="44" height="22" rx="4"/>' +
      '<text class="t-sm" x="320" y="73" text-anchor="middle">SFCC</text>' +
      '<g id="fs-fl"></g><g id="fs-fr"></g>' +
      '<path id="fs-shL" stroke-width="3" d="M300 132H52"/>' +
      '<path id="fs-shR" stroke-width="3" d="M340 132H588"/>' +
      [110, 230, 410, 530].map(function (x) {
        return '<rect class="f-metal" x="' + (x - 6) + '" y="126" width="12" height="12" rx="2"/>';
      }).join('') +
      '<rect class="f-body" x="298" y="118" width="44" height="30" rx="4"/>' +
      '<text class="t-sm" x="320" y="137" text-anchor="middle">PCU</text>' +
      '<rect id="fs-wl" x="42" y="125" width="10" height="14" rx="2"/>' +
      '<rect id="fs-wr" x="588" y="125" width="10" height="14" rx="2"/>' +
      '<circle class="f-amber-fill" cx="36" cy="132" r="4"/><circle class="f-amber-fill" cx="604" cy="132" r="4"/>' +
      '<text class="t-sm" x="16" y="116">WTB</text><text class="t-sm" x="624" y="116" text-anchor="end">WTB</text>' +
      '<rect class="f-body" x="16" y="182" width="250" height="56" rx="6"/>' +
      '<text class="t-mono" id="fs-l" x="28" y="200"></text>' +
      '<text class="t-mono" id="fs-r" x="28" y="216"></text>' +
      '<text class="t-mono" id="fs-d" x="28" y="232"></text>' +
      STEPS.map(function (t, i) {
        return '<text class="t-sm" id="fs-s' + i + '" x="370" y="' + (196 + i * 14) + '">' + t + '</text>';
      }).join('');

    frame.innerHTML = svg('0 0 640 246', s);
    controls(frame,
      '<div class="fig-row"><span class="fig-label">Рукоятка</span>' +
      [0, 10, 15, 20, 35].map(function (a, i) {
        return '<button class="fig-btn' + (i ? '' : ' is-on') + '" data-a="' + a + '" type="button">' + a + '°</button>';
      }).join('') + '</div>' +
      '<button class="fig-btn" id="fs-brk" type="button">Обрыв вала справа</button>' +
      '<button class="fig-btn" id="fs-rst" type="button">Сброс</button>' +
      '<span class="fig-readout" id="fs-out">выберите положение закрылков</span>');

    var q = function (id) { return frame.querySelector('#' + id); };
    var target = 0, L = 0, R = 0, broken = false, locked = false, stage = 0;

    function flaps(list, a) {
      var h = 10 + a * 0.85;
      return list.map(function (f) {
        return '<rect class="f-mov" x="' + f[0] + '" y="140" width="' + (f[1] - f[0]) + '" height="' + r1(h) + '" rx="2"/>';
      }).join('');
    }
    function paint(moving) {
      q('fs-fl').innerHTML = flaps(FL, L);
      q('fs-fr').innerHTML = flaps(FR, R);
      q('fs-shL').setAttribute('class', moving && !locked ? 'f-ink f-flow' : 'f-ink');
      q('fs-shR').setAttribute('class', moving && !locked && !broken ? 'f-ink f-flow' : 'f-ink');
      q('fs-shR').setAttribute('stroke-dasharray', broken ? '26 6' : '');
      q('fs-wl').setAttribute('fill', locked ? '#a92920' : '#c9ced4');
      q('fs-wr').setAttribute('fill', locked ? '#a92920' : '#c9ced4');
      var diff = Math.abs(L - R);
      q('fs-l').textContent = 'левые:   ' + L.toFixed(1).replace('.', ',') + '°';
      q('fs-r').textContent = 'правые:  ' + R.toFixed(1).replace('.', ',') + '°';
      q('fs-d').textContent = 'разница: ' + diff.toFixed(1).replace('.', ',') + '°' + (locked ? '  FLAPS LOCKED' : '');
      q('fs-d').setAttribute('class', locked ? 't-mono t-red' : 't-mono');
      STEPS.forEach(function (x, i) {
        q('fs-s' + i).setAttribute('class', locked && stage > i ? 't-sm t-red' : 't-sm');
      });
    }

    pick(frame, 'data-a', function (a) {
      if (locked) return;
      target = +a;
      q('fs-out').textContent = 'команда: ' + a + '° — привод вращает вал трансмиссии';
      if (reduced) { L = target; if (!broken) R = target; paint(false); }
    });
    q('fs-brk').addEventListener('click', function () {
      broken = true;
      q('fs-brk').classList.add('is-on');
      q('fs-out').textContent = 'вал справа оборван — выберите другое положение закрылков';
    });
    q('fs-rst').addEventListener('click', function () {
      broken = locked = false; stage = 0; target = L = R = 0;
      q('fs-brk').classList.remove('is-on');
      frame.querySelectorAll('[data-a]').forEach(function (b) { b.classList.toggle('is-on', b.dataset.a === '0'); });
      q('fs-out').textContent = 'система исправна, закрылки убраны';
      paint(false);
    });

    var tl = 0;
    loop(frame, function () {
      var moving = false;
      if (!locked) {
        var sp = 0.12;
        if (Math.abs(target - L) > 0.01) { L += clamp(target - L, -sp, sp); moving = true; }
        if (!broken && Math.abs(target - R) > 0.01) { R += clamp(target - R, -sp, sp); moving = true; }
        if (Math.abs(L - R) >= 1.8) {
          locked = true; stage = 0; tl = 0;
          q('fs-out').textContent = 'рассогласование достигло порога — механизация заблокирована';
        }
      } else if (stage < 4 && ++tl % 40 === 0) {
        stage++;
      }
      paint(moving);
    });
  };

  /* ═══════════════════════════════════════════════════════
     6б. Винтовой подъёмник переставного стабилизатора
     ═══════════════════════════════════════════════════════ */
  reg.jack = function (frame) {
    var PV = [470, 124], AT = [350, 124], SX = 350;
    var clipId = 'jk-clip-' + Math.random().toString(36).slice(2, 8);
    var STAB = foilPts(318, 124, 230, 0.1, 0, 0, 1);
    var stripes = '';
    for (var y = -20; y < 220; y += 8) {
      stripes += '<path d="M340 ' + y + 'l20 -6" stroke="#8d97a3" stroke-width="2"/>';
    }
    var s =
      '<defs><clipPath id="' + clipId + '"><rect x="342" y="40" width="16" height="170"/></clipPath></defs>' +
      '<path class="f-dim" stroke-width="2" d="M20 64Q320 52 620 96M20 214Q320 212 620 150"/>' +
      '<text class="t-sm" x="30" y="232">хвостовая часть фюзеляжа (вид сбоку)</text>' +
      '<rect class="f-body" x="318" y="12" width="64" height="28" rx="5"/>' +
      '<text class="t-sm" x="350" y="30" text-anchor="middle">редуктор</text>' +
      '<rect class="f-body" x="272" y="14" width="40" height="24" rx="5"/>' +
      '<rect class="f-body" x="388" y="14" width="40" height="24" rx="5"/>' +
      '<g id="jk-m1"><circle class="f-metal" cx="292" cy="26" r="8"/><path class="f-ink" d="M292 18v16M284 26h16"/></g>' +
      '<g id="jk-m2"><circle class="f-metal" cx="408" cy="26" r="8"/><path class="f-ink" d="M408 18v16M400 26h16"/></g>' +
      '<text class="t-sm" x="292" y="52" text-anchor="middle">мотор</text>' +
      '<text class="t-sm" x="408" y="52" text-anchor="middle">мотор</text>' +
      '<rect x="342" y="40" width="16" height="170" fill="#dfe4ea" stroke="#98a3ae"/>' +
      '<g clip-path="url(#' + clipId + ')"><g id="jk-str">' + stripes + '</g></g>' +
      '<path id="jk-tie" stroke-width="2.4" d="M350 42V208"/>' +
      '<path class="f-ink" stroke-width="3" d="M336 60h28M336 192h28"/>' +
      '<text class="t-sm" x="370" y="64">упор</text><text class="t-sm" x="370" y="196">упор</text>' +
      '<path id="jk-crack" class="f-red" stroke-width="3" d="M340 176l6 -5 4 7 5 -6 5 5"/>' +
      '<g id="jk-stab"><path class="f-mov" d="' + closed(STAB) + '"/>' +
      '<path class="f-ink" stroke-width="3" d="M350 124v14"/></g>' +
      '<circle class="f-metal" cx="470" cy="124" r="5"/>' +
      '<text class="t-sm" x="486" y="112">шарнир</text>' +
      '<g id="jk-nut"><rect class="f-metal" x="334" y="130" width="32" height="16" rx="3"/></g>' +
      '<text class="t-sm" id="jk-nt" x="300" y="150" text-anchor="end">гайка</text>' +
      '<text class="t-sm" x="560" y="96" text-anchor="middle">стабилизатор</text>' +
      '<text class="t-sm" id="jk-self" x="20" y="88"></text>' +
      '<text class="t-sm t-red" id="jk-tt" x="20" y="102"></text>';

    frame.innerHTML = svg('0 0 640 240', s);
    controls(frame,
      '<span class="fig-label">Перестановка</span>' +
      '<input class="fig-range" id="jk-in" type="range" min="-100" max="100" value="0" ' +
      'aria-label="Положение стабилизатора">' + AUTO +
      '<button class="fig-btn" id="jk-brk" type="button">Поломка винта</button>' +
      '<span class="fig-readout" id="jk-out"></span>');

    var q = function (id) { return frame.querySelector('#' + id); };
    var val = 0, prev = 0, broken = false, still = 0;

    function paint() {
      var th = -val * 12;   /* на кабрирование носок стабилизатора опускается */
      var at = rot(AT[0], AT[1], PV[0], PV[1], th);
      var ny = at[1];
      q('jk-stab').setAttribute('transform', 'rotate(' + r1(th) + ' ' + PV[0] + ' ' + PV[1] + ')');
      q('jk-nut').setAttribute('transform', 'translate(0 ' + r1(ny - 124) + ')');
      q('jk-str').setAttribute('transform', 'translate(0 ' + r1(((ny - 124) * 3) % 8) + ')');
      q('jk-nt').setAttribute('y', r1(ny + 20));
      var turn = (ny - 124) * 12;
      q('jk-m1').setAttribute('transform', 'rotate(' + r1(turn % 360) + ' 292 26)');
      q('jk-m2').setAttribute('transform', 'rotate(' + r1(-turn % 360) + ' 408 26)');
      q('jk-tie').setAttribute('class', broken ? 'f-red' : 'f-dim');
      q('jk-tie').setAttribute('stroke-dasharray', broken ? '' : '5 4');
      q('jk-crack').style.display = broken ? '' : 'none';
      q('jk-tt').textContent = broken ? 'винт сломан: нагрузку несёт стяжной стержень внутри' : '';
      var moving = Math.abs(val - prev) > 0.0005;
      prev = val;
      still = moving ? 0 : still + 1;
      q('jk-self').textContent = still > 20 ? 'мотор стоит — винтовая пара держит стабилизатор' : '';
      q('jk-out').textContent = (val > 0.02 ? 'на кабрирование ' : val < -0.02 ? 'на пикирование ' : 'нейтраль ') +
        Math.round(Math.abs(val) * 100) + ' % хода';
    }
    q('jk-brk').addEventListener('click', function () {
      broken = !broken;
      q('jk-brk').classList.toggle('is-on', broken);
      if (broken) drv.stop();
      paint();
    });
    var drv = driver(q('jk-in'), function (x) { if (!broken) val = x / 100; }, 520,
      frame.querySelector('.fig-auto'));
    loop(frame, function () { drv.tick(); paint(); });
  };

  /* ═══════════════════════════════════════════════════════
     6. Поворот колёс носовой опоры
     ═══════════════════════════════════════════════════════ */
  reg.nws = function (frame) {
    var inner =
      '<rect class="f-body" x="196" y="12" width="208" height="44" rx="8"/>' +
      '<text x="300" y="32" text-anchor="middle">Блок управления (LGSCU)</text>' +
      '<text class="t-sm" x="300" y="48" text-anchor="middle">' +
      'сравнивает заданный угол с фактическим</text>' +

      '<path class="f-blue" stroke-width="3" d="M120 34H192"/>' +
      '<text class="t-sm" x="112" y="30" text-anchor="end">педали / ручка N/W STRG</text>' +
      '<path class="f-blue" stroke-width="3" d="M408 34H470V96"/>' +
      '<text class="t-sm" x="484" y="30">команда на клапан</text>' +

      /* стойка сверху */
      '<circle class="f-metal" cx="300" cy="160" r="10"/>' +
      '<g id="n-wheel">' +
      '<rect class="f-metal" x="286" y="122" width="28" height="76" rx="13"/>' +
      '<path class="f-ink" stroke-width="2" d="M300 122v76"/>' +
      '</g>' +
      '<text class="t-sm" x="300" y="216" text-anchor="middle">колёса передней опоры (вид сверху)</text>' +

      /* гидроцилиндры */
      '<g id="n-cylL">' +
      '<rect class="f-body" x="150" y="146" width="76" height="28" rx="6"/>' +
      '<path class="f-ink" stroke-width="5" d="M226 160h58"/>' +
      '</g>' +
      '<g id="n-cylR">' +
      '<rect class="f-body" x="374" y="146" width="76" height="28" rx="6"/>' +
      '<path class="f-ink" stroke-width="5" d="M374 160h-58"/>' +
      '</g>' +
      '<text class="t-sm" x="188" y="140" text-anchor="middle">гидроцилиндр</text>' +
      '<text class="t-sm" x="412" y="140" text-anchor="middle">гидроцилиндр</text>' +

      '<path class="f-green" stroke-width="3" stroke-dasharray="5 4" ' +
      'd="M300 198V236H130V56"/>' +
      '<text class="t-sm" x="216" y="250" text-anchor="middle">' +
      'датчик фактического угла — обратная связь</text>';

    frame.innerHTML = svg('0 0 600 262', inner);
    controls(frame,
      '<span class="fig-label">Заданный угол</span>' +
      '<input class="fig-range" id="n-in" type="range" min="-65" max="65" value="0" ' +
      'aria-label="Заданный угол поворота колёс">' +
      '<span class="fig-readout" id="n-read">0°</span>');

    var wheel = frame.querySelector('#n-wheel');
    var cylL = frame.querySelector('#n-cylL');
    var cylR = frame.querySelector('#n-cylR');
    var read = frame.querySelector('#n-read');
    var input = frame.querySelector('#n-in');

    var target = 0, pos = 0, raf = null;

    function paint() {
      wheel.setAttribute('transform', 'rotate(' + pos + ' 300 160)');
      var d = Math.sin(pos * Math.PI / 180) * 22;
      cylL.setAttribute('transform', 'translate(' + d + ' 0)');
      cylR.setAttribute('transform', 'translate(' + d + ' 0)');
      read.textContent = Math.round(pos) + '° (задано ' + Math.round(target) + '°)';
    }
    function tick() {
      var err = target - pos;
      if (Math.abs(err) < 0.3) { pos = target; paint(); raf = null; return; }
      pos += err * 0.12;
      paint();
      raf = requestAnimationFrame(tick);
    }
    input.addEventListener('input', function () {
      target = +input.value;
      if (reduced) { pos = target; paint(); return; }
      if (!raf) raf = requestAnimationFrame(tick);
    });
    paint();
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
  var M3_HINT = (window.matchMedia && window.matchMedia('(hover: none)').matches)
    ? 'палец — поворот · два пальца — сдвиг и приближение'
    : 'перетащить — поворот · правая кнопка — сдвиг · колесо — приближение';

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
  reg.model3d = function (frame, opts) {
    opts = opts || {};
    var baseSrc = [].concat(opts.src || []);
    var layerDefs = opts.layers || [];
    if (!baseSrc.length && !layerDefs.length) { console.warn('model3d без opts.src'); return; }
    var multi = baseSrc.length + layerDefs.length > 1;

    var box = document.createElement('div');
    box.className = 'model3d';
    box.innerHTML = '<div class="model3d-note">Загрузка модели…</div>';
    frame.appendChild(box);

    var bar = controls(frame, '<span class="fig-readout m3-info">—</span>');
    var info = bar.querySelector('.m3-info');

    ensureThree().then(function () {
      var THREE = window.THREE;
      /* На телефоне кадр 16:10 делает модель крошечной: ширина 343 px даёт
         высоту 213 px, и механизм не разглядеть. На узком экране берём почти
         квадрат, на широком оставляем привычную пропорцию. */
      function ratio(cw) {
        if (opts.tall) return cw < 520 ? 1.15 : 0.74;
        return cw < 520 ? 0.95 : 0.62;
      }
      var w = box.clientWidth || 600, h = Math.round(w * ratio(w));

      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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

      /* Свет ставит сайт — модель приходит без запечённого освещения */
      scene.add(new THREE.HemisphereLight(0xffffff, 0xb8bcc2, 0.55));
      var key = new THREE.DirectionalLight(0xffffff, 1.15);
      key.position.set(3, 5, 4);
      scene.add(key);
      var fill = new THREE.DirectionalLight(0xffffff, 0.35);
      fill.position.set(-4, 2, -3);
      scene.add(fill);

      /* Общая группа всех файлов. Её сдвигаем при кадрировании, поэтому
         слои, подгруженные позже, встают туда же, куда и основа. */
      var root = new THREE.Group();
      scene.add(root);

      var ctrl = null;
      function render() { renderer.render(scene, camera); }

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
        ? fetch(opts.labelsSrc).then(function (r) { return r.json(); })
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
      function isShellMesh(o) {
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
      baseSrc.forEach(function (s) { files.push({ src: s, layer: false, on: true, title: opts.srcTitle }); });
      layerDefs.forEach(function (d) {
        files.push({ src: d.src, layer: true, on: !!d.on, title: d.title, hint: d.hint,
          plain: !!d.plain });
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
        if (!a || !a.normalized || a.isInterleavedBufferAttribute) return;
        var k = NORM[a.array.constructor.name];
        if (!k) return;
        var src = a.array, dst = new Float32Array(src.length);
        for (var i = 0; i < src.length; i++) dst[i] = Math.max(src[i] / k, -1);
        g.setAttribute('position', new THREE.BufferAttribute(dst, a.itemSize));
      }

      function adopt(f, sceneNode) {
        sceneNode.traverse(function (o) {
          if (!o.isMesh) return;
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
          o.__ei = o.material && o.material.emissiveIntensity != null
            ? o.material.emissiveIntensity : 1;
          o.__env = o.material && o.material.envMapIntensity != null
            ? o.material.envMapIntensity : 1;
          (isShellMesh(o) ? shells : parts).push(o);
        });
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
          loader.load(f.src, function (gltf) {
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
      var sysRe = null, glow = opts.glow === 'on', sb = null;

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
      }
      function setLevel(n) {
        level = n;
        if (sb) {
          sb.textContent = LEVELS[level].t;
          sb.classList.toggle('is-on', level === 0);
        }
        applyShell();
        render();
      }

      /* Разбор по системам (opts.systems — регулярные выражения по именам):
         выбранная остаётся в цвете, остальные гаснут до призрака — так видно,
         где система проходит относительно других.
         Подсветка (glow) красит детали слоёв: тяга в крыле — труба в два
         сантиметра на одиннадцать метров размаха, в общем виде это меньше
         пикселя, на светлом фоне её не найти. */
      function applyParts() {
        parts.forEach(function (o) {
          var on = !sysRe || sysRe.test(chainName(o));
          /* Тихая трасса видна только когда выбрана её система. */
          if (o.__quiet) {
            o.visible = !!(sysRe && on);
            o.__dim = !o.visible;
            if (!o.visible) return;
          }
          o.__dim = !on;
          if (!o.material) return;
          /* plain — слой-окружение (колёса, фотоскан двигателя): его не
             красим, иначе шина или двигатель превращаются в синее пятно. */
          var lit = (sysRe && on) || (glow && o.__file && o.__file.layer && !o.__file.plain);
          if (on) {
            o.material.transparent = o.__tr;
            o.material.opacity = o.__op;
            o.material.depthWrite = true;
          } else {
            o.material.transparent = true;
            o.material.opacity = 0.05;
            o.material.depthWrite = false;
          }
          if (o.material.emissive) {
            if (lit) {
              o.material.emissive.setHex(0x1f4ea8);
              o.material.emissiveIntensity = 0.85;
            } else if (o.__em !== null) {
              o.material.emissive.setHex(o.__em);
              o.material.emissiveIntensity = o.__ei;
            }
          }
          /* Полированный алюминий (баки, трубки) отражает белую студию
             и сливается с белой обшивкой — на время подсветки гасим блики. */
          if (o.material.envMapIntensity != null) {
            o.material.envMapIntensity = lit ? 0.2 : o.__env;
          }
        });
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

        if (layerDefs.length) {
          var lh = '<span class="fig-label">' + Render.esc(opts.layersLabel || 'Системы') + '</span>';
          files.forEach(function (f, i) {
            if (!f.layer) return;
            lh += '<button class="fig-btn' + (f.on ? ' is-on' : '') + '" data-layer="' + i +
              '" type="button" aria-pressed="' + (f.on ? 'true' : 'false') + '">' +
              Render.esc(f.title) + '</button>';
          });
          bar.insertAdjacentHTML('afterbegin', '<div class="fig-row">' + lh + '</div>');
          bar.querySelectorAll('[data-layer]').forEach(function (b) {
            b.addEventListener('click', function () { toggleLayer(files[+b.dataset.layer], b); });
          });
        }

        if (opts.systems && opts.systems.length) {
          var sh = '<span class="fig-label">Система</span>';
          opts.systems.forEach(function (sysDef, i) {
            sh += '<button class="fig-btn' + (i ? '' : ' is-on') +
              '" data-sys="' + i + '" type="button">' + Render.esc(sysDef.title) + '</button>';
          });
          bar.insertAdjacentHTML('afterbegin', '<div class="fig-row">' + sh + '</div>');
          bar.querySelectorAll('[data-sys]').forEach(function (b) {
            b.addEventListener('click', function () {
              bar.querySelectorAll('[data-sys]').forEach(function (x) { x.classList.remove('is-on'); });
              b.classList.add('is-on');
              var def = opts.systems[+b.dataset.sys];
              sysRe = def.match ? new RegExp(def.match, 'i') : null;
              applyParts();
              render();
              info.textContent = def.hint || def.title;
            });
          });
        }

        if (names && names.length) {
          var ch = '<span class="fig-label">Сценарий</span>';
          names.forEach(function (s, i) {
            ch += '<button class="fig-btn' + (i || multi ? '' : ' is-on') +
              '" data-clip="' + Render.esc(s.clip) + '" type="button">' + Render.esc(s.title) + '</button>';
          });
          bar.insertAdjacentHTML('afterbegin', '<div class="fig-row">' + ch + '</div>');
          bar.querySelectorAll('[data-clip]').forEach(function (b) {
            b.addEventListener('click', function () {
              var again = b.classList.contains('is-on');
              bar.querySelectorAll('[data-clip]').forEach(function (x) { x.classList.remove('is-on'); });
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

        if (shells.length) {
          sb = document.createElement('button');
          sb.type = 'button';
          sb.className = 'fig-btn' + (level === 0 ? ' is-on' : '');
          sb.textContent = LEVELS[level].t;
          sb.title = 'Прозрачность планера по кругу';
          sb.addEventListener('click', function () { setLevel((level + 1) % LEVELS.length); });
          bar.appendChild(sb);
        }

        if (layerDefs.length && opts.glow !== false) {
          var gb = document.createElement('button');
          gb.type = 'button';
          gb.className = 'fig-btn' + (glow ? ' is-on' : '');
          gb.textContent = 'Подсветка';
          gb.title = 'Подсветить детали включённых систем';
          gb.setAttribute('aria-pressed', glow ? 'true' : 'false');
          gb.addEventListener('click', function () {
            glow = !glow;
            gb.classList.toggle('is-on', glow);
            gb.setAttribute('aria-pressed', glow ? 'true' : 'false');
            applyParts();
            render();
          });
          bar.appendChild(gb);
        }

        /* Правая кнопка и Shift+ЛКМ двигают сцену и без этого, но про них
           никто не догадается — тем более на телефоне. Явный режим «Сдвиг»
           переводит обычное перетаскивание и одно касание в перемещение. */
        var pb = document.createElement('button');
        pb.type = 'button';
        pb.className = 'fig-btn';
        pb.textContent = 'Сдвиг';
        pb.title = 'Перетаскивание двигает сцену вместо поворота';
        pb.addEventListener('click', function () {
          var on = !pb.classList.contains('is-on');
          pb.classList.toggle('is-on', on);
          ctrl.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
          ctrl.touches.ONE = on ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
          info.textContent = on
            ? 'режим сдвига: перетащите, чтобы подвинуть сцену'
            : M3_HINT;
        });
        bar.appendChild(pb);

        /* Приближение кнопками: на телефоне колеса нет, а щипок двумя
           пальцами попадает не всем. Кнопка работает одним касанием. */
        function dolly(k) {
          var v = camera.position.clone().sub(ctrl.target);
          var len = clamp(v.length() * k, ctrl.minDistance, ctrl.maxDistance);
          camera.position.copy(ctrl.target).add(v.setLength(len));
          ctrl.update();
          render();
        }
        ['+', '–'].forEach(function (sign, i) {
          var zb = document.createElement('button');
          zb.type = 'button';
          zb.className = 'fig-btn fig-zoom';
          zb.textContent = sign;
          zb.setAttribute('aria-label', i ? 'Отдалить' : 'Приблизить');
          var step = i ? 1.35 : 0.74;
          zb.addEventListener('click', function () { dolly(step); });
          bar.appendChild(zb);
        });

        /* Запоминаем исходный вид, чтобы из любого положения вернуться */
        var home = { pos: camera.position.clone(), tgt: ctrl.target.clone() };
        var rb = document.createElement('button');
        rb.type = 'button';
        rb.className = 'fig-btn';
        rb.textContent = 'Сброс вида';
        rb.addEventListener('click', function () {
          camera.position.copy(home.pos);
          ctrl.target.copy(home.tgt);
          ctrl.update();
          render();
        });
        bar.appendChild(rb);

        /* Во весь экран. В ленте страницы модель всегда мелкая, особенно
           на телефоне; разворачиваем кадр целиком — вместе с кнопками,
           иначе в полноэкранном режиме нечем переключать сценарии. */
        var rfs = frame.requestFullscreen || frame.webkitRequestFullscreen;
        if (rfs) {
          var fsb = document.createElement('button');
          fsb.type = 'button';
          fsb.className = 'fig-btn';
          fsb.textContent = 'Во весь экран';
          fsb.addEventListener('click', function () {
            if (document.fullscreenElement === frame) {
              (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            } else {
              rfs.call(frame);
            }
          });
          bar.appendChild(fsb);
          document.addEventListener('fullscreenchange', function () {
            var on = document.fullscreenElement === frame;
            fsb.textContent = on ? 'Свернуть' : 'Во весь экран';
            fsb.classList.toggle('is-on', on);
            /* Размеры приходят не сразу — даём браузеру разложить кадр. */
            setTimeout(fit, 60);
          });
        }

        applyShell();
        applyParts();

        /* Клик по детали — подпись по словарю, иначе имя из модели. */
        var ray = new THREE.Raycaster(), pt = new THREE.Vector2();
        function shown(o) {
          while (o) { if (!o.visible) return false; o = o.parent; }
          return true;
        }
        renderer.domElement.addEventListener('click', function (e) {
          var b = renderer.domElement.getBoundingClientRect();
          pt.x = ((e.clientX - b.left) / b.width) * 2 - 1;
          pt.y = -((e.clientY - b.top) / b.height) * 2 + 1;
          ray.setFromCamera(pt, camera);
          /* Оболочка перехватывает каждый луч — кликать надо по механизму
             внутри, поэтому из выборки она исключена всегда. Приглушённые
             и выключенные узлы тоже пропускаем: иначе выбранную систему
             не ткнуть сквозь висящий перед ней призрак. */
          var all = ray.intersectObject(root, true), hit = null;
          for (var i = 0; i < all.length; i++) {
            var o = all[i].object;
            if (!isShellMesh(o) && !o.__dim && shown(o)) { hit = all[i]; break; }
          }
          if (!hit) return;
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
          info.innerHTML = Render.esc(label || name || '—') +
            (mtn ? ' <i>· ' + Render.esc(mtn) + '</i>' : '') +
            (layer && multi ? ' <i>· ' + Render.esc(layer) + '</i>' : '');
        });

        info.textContent = opts.hint || M3_HINT;
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
        if (ctrl) ctrl.update();
        render();
      });

      /* Размер берём у самого элемента, а не у окна: схема может смонтироваться,
         пока страница ещё не разложена (скрытая вкладка, свёрнутая панель,
         поворот телефона) — тогда ширина нулевая и canvas залипает крошечным. */
      function fit() {
        var nw = Math.round(box.clientWidth);
        if (nw < 40) return;              /* ещё нет раскладки — ждём */
        var nh = document.fullscreenElement === frame
          ? Math.max(200, frame.clientHeight - bar.offsetHeight - 26)
          : Math.round(nw * ratio(nw));
        renderer.setSize(nw, nh);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        render();
      }
      if (window.ResizeObserver) new ResizeObserver(fit).observe(box);
      window.addEventListener('resize', fit);
      fit();
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

  return { mountAll: mountAll, register: function (k, f) { reg[k] = f; } };
})();
