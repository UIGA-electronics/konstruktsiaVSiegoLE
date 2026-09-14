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
    /* Минимальная ширина = ширине viewBox: схема никогда не сжимается
       до нечитаемых подписей, вместо этого появляется прокрутка вбок. */
    var w = parseFloat(vb.split(/\s+/)[2]) || 520;
    return '<div class="figure-svg"><svg viewBox="' + vb +
      '" style="min-width:' + Math.round(w) + 'px" ' +
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
     1. Общая цепочка «команда → поверхность»
     ═══════════════════════════════════════════════════════ */
  reg.chain = function (frame) {
    var boxes = [
      ['Орган управления', 'штурвал, ручка, педали'],
      ['Проводка', 'тяги, тросы, провода'],
      ['Привод', 'мышцы, гидравлика, электромотор'],
      ['Поверхность', 'элерон, руль, стабилизатор']
    ];
    var w = 138, gap = 16, y = 40, h = 74;
    var inner = '';
    boxes.forEach(function (b, i) {
      var x = i * (w + gap) + 4;
      inner +=
        '<rect class="f-body" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
        '" rx="10"/>' +
        '<text x="' + (x + w / 2) + '" y="' + (y + 30) + '" text-anchor="middle">' + b[0] + '</text>' +
        '<text class="t-sm" x="' + (x + w / 2) + '" y="' + (y + 50) + '" text-anchor="middle">' +
        b[1] + '</text>';
      if (i < boxes.length - 1) {
        var ax = x + w + 2;
        inner += '<path class="f-dim" d="M' + ax + ' ' + (y + h / 2) + 'h' + (gap - 4) + '"/>' +
          '<path class="f-dim" d="M' + (ax + gap - 9) + ' ' + (y + h / 2 - 4) + 'l4 4-4 4"/>';
      }
    });
    inner +=
      '<circle id="ch-dot" class="f-blue-fill" cx="72" cy="' + (y + h / 2) + '" r="6"/>' +
      '<text class="t-sm" x="308" y="24" text-anchor="middle">' +
      'одна и та же цепочка — на любом самолёте</text>';

    frame.innerHTML = svg('0 0 616 140', inner);

    var dot = frame.querySelector('#ch-dot');
    var xs = [72, 226, 380, 534];
    loop(frame, function (t) {
      var p = ((t * 0.006) % 1) * 3;
      var i = Math.floor(p);
      dot.setAttribute('cx', xs[i] + (xs[i + 1] - xs[i]) * (p - i));
    });
  };

  /* ═══════════════════════════════════════════════════════
     2. Прямое механическое управление (DA 40 NG)
     ═══════════════════════════════════════════════════════ */
  reg.direct = function (frame) {
    var inner =
      /* фюзеляж / крыло условно */
      '<path class="f-dim" d="M40 150h520"/>' +
      '<text class="t-sm" x="40" y="170">кабина</text>' +
      '<text class="t-sm" x="470" y="170">крыло</text>' +

      /* ручка */
      '<g id="d-stick">' +
      '<path class="f-ink" stroke-width="5" d="M90 150V92"/>' +
      '<circle class="f-ink" cx="90" cy="86" r="9" fill="#fff"/>' +
      '</g>' +
      '<circle class="f-metal" cx="90" cy="150" r="5"/>' +
      '<text class="t-sm" x="90" y="66" text-anchor="middle">ручка</text>' +

      /* тяга-толкатель */
      '<g id="d-rod">' +
      '<path class="f-blue" stroke-width="4" d="M90 120H430"/>' +
      '<circle class="f-blue-fill" cx="430" cy="120" r="4"/>' +
      '</g>' +
      '<text class="t-sm" x="255" y="110" text-anchor="middle">' +
      'стальная тяга-толкатель (жёсткая связь)</text>' +

      /* качалка и кабанчик */
      '<circle class="f-metal" cx="452" cy="120" r="6"/>' +
      '<text class="t-sm" x="452" y="104" text-anchor="middle">качалка</text>' +

      /* элерон */
      '<g id="d-surf">' +
      '<path class="f-body" stroke-width="2" d="M452 120l86-16v32z" fill="#e9eef4"/>' +
      '</g>' +
      '<text class="t-sm" x="530" y="150" text-anchor="middle">элерон</text>' +

      /* усилие */
      '<g id="d-force">' +
      '<path class="f-red" stroke-width="3" d="M90 200v-26"/>' +
      '<path class="f-red" stroke-width="3" d="M84 180l6-6 6 6"/>' +
      '</g>' +
      '<text class="t-sm" x="150" y="205" id="d-flabel">усилие на ручке — только от мышц пилота</text>';

    frame.innerHTML = svg('0 0 600 220', inner);
    controls(frame,
      '<span class="fig-label">Ход ручки</span>' +
      '<input class="fig-range" id="d-in" type="range" min="-100" max="100" value="0" ' +
      'aria-label="Ход ручки">' +
      '<span class="fig-readout" id="d-out">элерон 0°</span>');

    var stick = frame.querySelector('#d-stick');
    var rod = frame.querySelector('#d-rod');
    var surf = frame.querySelector('#d-surf');
    var force = frame.querySelector('#d-force');
    var out = frame.querySelector('#d-out');
    var input = frame.querySelector('#d-in');

    function paint() {
      var v = +input.value / 100;
      stick.setAttribute('transform', 'rotate(' + (v * 14) + ' 90 150)');
      rod.setAttribute('transform', 'translate(' + (v * 26) + ' 0)');
      surf.setAttribute('transform', 'rotate(' + (-v * 20) + ' 452 120)');
      var f = Math.abs(v);
      force.setAttribute('transform', 'scale(1 ' + (0.3 + f * 1.6) + ') translate(0 ' +
        (150 * (1 - 1 / (0.3 + f * 1.6))) + ')');
      force.style.opacity = 0.25 + f * 0.75;
      out.textContent = 'элерон ' + (v * 20).toFixed(0) + '°';
    }
    input.addEventListener('input', paint);
    paint();
  };

  /* ═══════════════════════════════════════════════════════
     2б. Способы компенсации аэродинамической нагрузки
     ═══════════════════════════════════════════════════════ */
  reg.comp = function (frame) {
    var PX = 168, PY = 108;   /* ось вращения руля */

    var inner =
      '<path class="f-body" d="M16 86h136q14 0 14 22t-14 22H16z" fill="#eef0f2"/>' +
      '<text class="t-sm" x="86" y="113" text-anchor="middle">неподвижная часть</text>' +

      '<g id="c-surf">' +
      '<path id="c-main" class="f-body" fill="#e4eaf1" d="M168 93l112 15-112 15z"/>' +
      '<path id="c-nose" class="f-body" fill="#cfdae7" d="M168 93l-21 15 21 15z"/>' +
      '<path id="c-horn" class="f-body" fill="#cfdae7" d="M168 93l-20 8 20 6z"/>' +
      '<g id="c-tab"></g>' +
      '</g>' +
      '<circle id="c-pivot" class="f-metal" cx="168" cy="108" r="6"/>' +
      '<text class="t-sm" id="c-pivlbl" x="168" y="82" text-anchor="middle">ось вращения</text>' +

      /* индикатор усилия на рычаге */
      '<path class="f-dim" d="M352 40v132"/>' +
      '<rect id="c-bar" fill="#a92920" stroke="none" x="344" y="162" width="16" height="10" rx="3"/>' +
      '<text class="t-sm" x="352" y="32" text-anchor="middle">усилие</text>' +
      '<text class="t-sm" id="c-note" x="186" y="192" text-anchor="middle"></text>';

    frame.innerHTML = svg('0 0 380 204', inner);
    controls(frame,
      '<button class="fig-btn is-on" data-c="axis" type="button">Осевая</button>' +
      '<button class="fig-btn" data-c="horn" type="button">Роговая</button>' +
      '<button class="fig-btn" data-c="servo" type="button">Сервокомп.</button>' +
      '<button class="fig-btn" data-c="anti" type="button">Антисерво</button>' +
      '<button class="fig-btn" data-c="trim" type="button">Триммер</button>' +
      '<span class="fig-label">Отклонение</span>' +
      '<input class="fig-range" id="c-in" type="range" min="-100" max="100" value="40" ' +
      'aria-label="Отклонение руля">');

    var surf = frame.querySelector('#c-surf');
    var nose = frame.querySelector('#c-nose');
    var horn = frame.querySelector('#c-horn');
    var tabG = frame.querySelector('#c-tab');
    var pivot = frame.querySelector('#c-pivot');
    var pivlbl = frame.querySelector('#c-pivlbl');
    var bar = frame.querySelector('#c-bar');
    var note = frame.querySelector('#c-note');
    var input = frame.querySelector('#c-in');

    var MODES = {
      axis:  { nose: 1, horn: 0, tab: 0, k: 0.45,
        note: 'часть площади вынесена вперёд от оси — поток помогает отклонять руль' },
      horn:  { nose: 0, horn: 1, tab: 0, k: 0.55,
        note: 'рог выходит в поток на большом отклонении: помогает, но растит сопротивление' },
      servo: { nose: 0, horn: 0, tab: -1, k: 0.35,
        note: 'отклоняется против руля — шарнирный момент уменьшается' },
      anti:  { nose: 0, horn: 0, tab: 1, k: 1.35,
        note: 'отклоняется вместе с рулём — специально утяжеляет управление' },
      trim:  { nose: 0, horn: 0, tab: -1, k: 0,
        note: 'отдельная команда: снимает усилие полностью, руль остаётся отклонённым' }
    };
    var mode = 'axis';

    function paint() {
      var v = +input.value / 100;
      var m = MODES[mode];
      var ang = v * 22;

      surf.setAttribute('transform', 'rotate(' + ang + ' ' + PX + ' ' + PY + ')');
      nose.style.display = m.nose ? '' : 'none';
      horn.style.display = m.horn ? '' : 'none';

      /* ось при осевой компенсации сдвинута назад — показываем это явно */
      var px = m.nose ? PX : PX - 11;
      pivot.setAttribute('cx', px);
      pivlbl.setAttribute('x', px);

      if (m.tab) {
        tabG.style.display = '';
        tabG.innerHTML = '<path class="f-body" fill="' +
          (m.tab > 0 ? '#efdcc9' : '#d9e6dd') + '" d="M276 102l40 6-40 6z"/>';
        tabG.setAttribute('transform',
          'rotate(' + (m.tab * ang * 0.9) + ' 276 108)');
      } else {
        tabG.style.display = 'none';
      }

      var f = Math.min(1, Math.abs(v) * m.k + (mode === 'trim' ? 0 : 0.06));
      var h = 4 + f * 124;
      bar.setAttribute('height', h);
      bar.setAttribute('y', 172 - h);
      note.textContent = m.note;
    }

    frame.querySelectorAll('[data-c]').forEach(function (b) {
      b.addEventListener('click', function () {
        frame.querySelectorAll('[data-c]').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        mode = b.dataset.c;
        paint();
      });
    });
    input.addEventListener('input', paint);
    paint();
  };

  /* ═══════════════════════════════════════════════════════
     2в. Закрылок Фаулера
     ═══════════════════════════════════════════════════════ */
  reg.flap = function (frame) {
    var HX = 258, HY = 84;   /* точка, вокруг которой поворачивается закрылок */

    var inner =
      /* траектория движения закрылка «назад и вниз» */
      '<path class="f-dim" stroke-dasharray="3 5" d="M262 88q30 5 46 22"/>' +

      /* основная часть крыла */
      '<path class="f-body" fill="#e9edf2" ' +
      'd="M34 80C96 58 176 56 258 72L258 96C176 108 96 104 34 80Z"/>' +
      '<text class="t-sm" x="132" y="86" text-anchor="middle">профиль крыла</text>' +

      /* закрылок */
      '<g id="fl-flap">' +
      '<path class="f-body" fill="#cfdce9" d="M256 70L332 86L256 98Z"/>' +
      '</g>' +

      /* щель */
      '<path id="fl-slot" class="f-blue" stroke-width="2.5" stroke-dasharray="4 4" ' +
      'd="M244 100q16 4 26 -6"/>' +

      '<text class="t-sm" id="fl-lbl" x="180" y="172" text-anchor="middle">' +
      'закрылок убран — профиль крыла целый</text>';

    frame.innerHTML = svg('0 0 380 184', inner);
    controls(frame,
      '<span class="fig-label">Выпуск</span>' +
      '<input class="fig-range" id="fl-in" type="range" min="0" max="100" value="0" ' +
      'aria-label="Выпуск закрылка">' +
      '<span class="fig-readout" id="fl-out">0 %</span>');

    var flap = frame.querySelector('#fl-flap');
    var slot = frame.querySelector('#fl-slot');
    var lbl = frame.querySelector('#fl-lbl');
    var out = frame.querySelector('#fl-out');
    var input = frame.querySelector('#fl-in');

    function paint() {
      var v = +input.value / 100;
      /* движение «назад и вниз» по дуге + поворот */
      flap.setAttribute('transform',
        'translate(' + (v * 20) + ' ' + (v * v * 16) + ') rotate(' + (v * 28) +
        ' ' + HX + ' ' + HY + ')');
      slot.style.opacity = v < 0.08 ? 0 : Math.min(1, v * 2.2);
      out.textContent = Math.round(v * 100) + ' %';
      lbl.textContent = v < 0.08
        ? 'закрылок убран — профиль крыла целый'
        : v < 0.55
          ? 'сначала растёт площадь крыла, щель открывается'
          : 'затем растёт кривизна профиля — максимум подъёмной силы';
    }
    input.addEventListener('input', paint);
    paint();
  };

  /* ═══════════════════════════════════════════════════════
     3. Гидроусилитель со следящим золотником — ядро темы
     ═══════════════════════════════════════════════════════ */
  reg.booster = function (frame) {
    var CX = 300;          /* центр поршня при нейтрали */
    var SPAN = 92;         /* максимальный ход поршня, px */
    var SX = 300;          /* центр золотника */

    var inner =
      /* ── гидроблок сверху ── */
      '<rect class="f-body" x="196" y="26" width="208" height="54" rx="7"/>' +
      '<text class="t-sm" x="300" y="20" text-anchor="middle">золотниковый распределитель</text>' +

      /* каналы питания и слива */
      '<path class="f-dim" d="M232 26V8M300 26V8M368 26V8"/>' +
      '<text class="t-mono" x="232" y="5" text-anchor="middle">T</text>' +
      '<text class="t-mono" x="300" y="5" text-anchor="middle">P</text>' +
      '<text class="t-mono" x="368" y="5" text-anchor="middle">T</text>' +

      /* окна: подсветка потока */
      '<rect id="b-portL" x="256" y="80" width="18" height="34" rx="3" fill="#dfe3e8"/>' +
      '<rect id="b-portR" x="326" y="80" width="18" height="34" rx="3" fill="#dfe3e8"/>' +

      /* золотник */
      '<g id="b-spool">' +
      '<rect class="f-metal" x="284" y="36" width="32" height="34" rx="3"/>' +
      '<rect class="f-metal" x="240" y="36" width="22" height="34" rx="3"/>' +
      '<rect class="f-metal" x="338" y="36" width="22" height="34" rx="3"/>' +
      '<path class="f-ink" stroke-width="4" d="M251 53h98"/>' +
      '</g>' +

      /* ── цилиндр ── */
      '<rect class="f-body" x="180" y="114" width="240" height="62" rx="8"/>' +
      '<g id="b-piston">' +
      '<rect class="f-metal" x="288" y="118" width="24" height="54" rx="2"/>' +
      '<path class="f-ink" stroke-width="6" d="M312 145h108"/>' +
      '</g>' +
      '<text class="t-sm" x="300" y="192" text-anchor="middle">силовой цилиндр</text>' +

      /* поверхность справа */
      '<circle class="f-metal" cx="448" cy="145" r="6"/>' +
      '<g id="b-surf"><path class="f-body" d="M448 145l84-16v32z" fill="#e9eef4"/></g>' +
      '<text class="t-sm" x="500" y="182" text-anchor="middle">руль</text>' +

      /* ── рычаг суммирования слева ── */
      '<g id="b-lever">' +
      '<path class="f-blue" stroke-width="4" d="M120 40V160"/>' +
      '</g>' +
      '<circle id="b-pin-in" class="f-blue-fill" cx="120" cy="40" r="5"/>' +
      '<circle id="b-pin-sp" class="f-amber-fill" cx="120" cy="100" r="5"/>' +
      '<circle id="b-pin-fb" class="f-green-fill" cx="120" cy="160" r="5"/>' +

      '<path class="f-blue" stroke-width="3" d="M40 40h76"/>' +
      '<text class="t-sm" x="40" y="32">от ручки пилота</text>' +
      '<path id="b-link-sp" class="f-dim" stroke-width="3" stroke-dasharray="4 3" ' +
      'd="M124 100H300V36"/>' +
      '<path id="b-link-fb" class="f-green" stroke-width="3" d="M124 160H160"/>' +
      '<path id="b-fb2" class="f-green" stroke-width="3" stroke-dasharray="5 4" ' +
      'd="M160 160V206H420V176"/>' +
      '<text class="t-sm" x="290" y="220" text-anchor="middle">' +
      'обратная связь: шток «докладывает» рычагу, куда он уже дошёл</text>';

    frame.innerHTML = svg('0 0 600 232', inner);
    controls(frame,
      '<span class="fig-label">Ручка</span>' +
      '<input class="fig-range" id="b-in" type="range" min="-100" max="100" value="0" ' +
      'aria-label="Положение ручки">' +
      '<button class="fig-btn" id="b-step" type="button">Резко отклонить</button>' +
      '<span class="fig-readout" id="b-read">рассогласование 0 %</span>');

    var spool = frame.querySelector('#b-spool');
    var piston = frame.querySelector('#b-piston');
    var surf = frame.querySelector('#b-surf');
    var lever = frame.querySelector('#b-lever');
    var pinIn = frame.querySelector('#b-pin-in');
    var pinSp = frame.querySelector('#b-pin-sp');
    var pinFb = frame.querySelector('#b-pin-fb');
    var portL = frame.querySelector('#b-portL');
    var portR = frame.querySelector('#b-portR');
    var read = frame.querySelector('#b-read');
    var input = frame.querySelector('#b-in');

    var target = 0;   /* куда просит пилот, -1..1 */
    var pos = 0;      /* где реально шток,     -1..1 */

    function paint() {
      var err = clamp(target - pos, -1, 1);

      /* золотник смещается пропорционально рассогласованию */
      var s = err * 26;
      spool.setAttribute('transform', 'translate(' + s + ' 0)');

      /* поршень и руль */
      piston.setAttribute('transform', 'translate(' + (pos * SPAN) + ' 0)');
      surf.setAttribute('transform', 'rotate(' + (-pos * 22) + ' 448 145)');

      /* рычаг: верх — вход, низ — обратная связь */
      var topX = 120 + target * 30;
      var botX = 120 + pos * 30;
      lever.innerHTML = '<path class="f-blue" stroke-width="4" d="M' + topX +
        ' 40L' + botX + ' 160"/>';
      pinIn.setAttribute('cx', topX);
      pinFb.setAttribute('cx', botX);
      pinSp.setAttribute('cx', (topX + botX) / 2);

      /* окна: синее = давление, серое = слив */
      var open = Math.min(1, Math.abs(err) * 3.2);
      portL.setAttribute('fill', err > 0.01 ? '#1f5c9e' : err < -0.01 ? '#c9ced4' : '#dfe3e8');
      portR.setAttribute('fill', err < -0.01 ? '#1f5c9e' : err > 0.01 ? '#c9ced4' : '#dfe3e8');
      portL.style.opacity = 0.35 + open * 0.65;
      portR.style.opacity = 0.35 + open * 0.65;

      read.textContent = 'рассогласование ' + Math.round(err * 100) + ' %' +
        (Math.abs(err) < 0.01 ? ' — золотник закрыт' : ' — жидкость идёт');
    }

    var raf = null;
    function tick() {
      var err = target - pos;
      if (Math.abs(err) < 0.004) { pos = target; paint(); raf = null; return; }
      pos += err * 0.09;          /* расход пропорционален открытию окна */
      paint();
      raf = requestAnimationFrame(tick);
    }
    function run() {
      if (reduced) { pos = target; paint(); return; }
      if (!raf) raf = requestAnimationFrame(tick);
    }

    input.addEventListener('input', function () { target = +input.value / 100; run(); });
    frame.querySelector('#b-step').addEventListener('click', function () {
      target = target > 0 ? -1 : 1;
      input.value = target * 100;
      run();
    });
    paint();
  };

  /* ═══════════════════════════════════════════════════════
     4. Загрузочный механизм (искусственное усилие)
     ═══════════════════════════════════════════════════════ */
  reg.feel = function (frame) {
    var inner =
      '<rect class="f-body" x="30" y="60" width="250" height="96" rx="10"/>' +
      '<text class="t-sm" x="155" y="52" text-anchor="middle">' +
      'без загружателя: ручка «пустая»</text>' +
      '<g id="fe-stick1"><path class="f-ink" stroke-width="5" d="M155 146V86"/>' +
      '<circle class="f-ink" cx="155" cy="80" r="8" fill="#fff"/></g>' +
      '<text class="t-sm" x="155" y="174" text-anchor="middle">' +
      'усилие не зависит от отклонения</text>' +

      '<rect class="f-body" x="320" y="60" width="250" height="96" rx="10"/>' +
      '<text class="t-sm" x="445" y="52" text-anchor="middle">' +
      'с пружинным загружателем</text>' +
      '<g id="fe-stick2"><path class="f-ink" stroke-width="5" d="M445 146V86"/>' +
      '<circle class="f-ink" cx="445" cy="80" r="8" fill="#fff"/></g>' +
      '<path id="fe-spring" class="f-red" stroke-width="3" d="M445 120h0"/>' +
      '<text class="t-sm" x="445" y="174" text-anchor="middle">' +
      'чем дальше от нейтрали — тем тяжелее</text>';

    frame.innerHTML = svg('0 0 600 188', inner);
    controls(frame,
      '<span class="fig-label">Отклонение</span>' +
      '<input class="fig-range" id="fe-in" type="range" min="-100" max="100" value="0" ' +
      'aria-label="Отклонение ручки">' +
      '<span class="fig-readout" id="fe-read">усилие 0 %</span>');

    var s1 = frame.querySelector('#fe-stick1');
    var s2 = frame.querySelector('#fe-stick2');
    var spring = frame.querySelector('#fe-spring');
    var read = frame.querySelector('#fe-read');
    var input = frame.querySelector('#fe-in');

    function paint() {
      var v = +input.value / 100;
      s1.setAttribute('transform', 'rotate(' + (v * 18) + ' 155 146)');
      s2.setAttribute('transform', 'rotate(' + (v * 18) + ' 445 146)');
      var zig = '';
      var n = 7, len = Math.abs(v) * 70 + 4, dir = v >= 0 ? -1 : 1;
      for (var i = 0; i <= n; i++) {
        zig += (i ? 'L' : 'M') + (445 + dir * (len * i / n)) + ' ' +
          (120 + (i % 2 ? 7 : -7)) + ' ';
      }
      spring.setAttribute('d', zig);
      spring.style.opacity = 0.2 + Math.abs(v) * 0.8;
      read.textContent = 'усилие ' + Math.round(Math.abs(v) * 100) + ' %';
    }
    input.addEventListener('input', paint);
    paint();
  };

  /* ═══════════════════════════════════════════════════════
     5. ЭДСУ: три режима работы контура
     ═══════════════════════════════════════════════════════ */
  reg.fbw = function (frame) {
    var inner =
      '<rect class="f-body" x="10" y="72" width="104" height="56" rx="8"/>' +
      '<text x="62" y="96" text-anchor="middle">Side Stick</text>' +
      '<text class="t-sm" x="62" y="114" text-anchor="middle">датчики положения</text>' +

      '<rect id="w-pfcu" class="f-body" x="160" y="16" width="128" height="52" rx="8"/>' +
      '<text x="224" y="38" text-anchor="middle">Законы и защиты</text>' +
      '<text class="t-sm" x="224" y="56" text-anchor="middle">угол атаки, перегрузка, крен</text>' +

      '<rect class="f-body" x="160" y="132" width="128" height="52" rx="8"/>' +
      '<text x="224" y="154" text-anchor="middle">Вычислители</text>' +
      '<text class="t-sm" x="224" y="172" text-anchor="middle">ELAC / SEC · управление приводами</text>' +

      '<rect class="f-body" x="336" y="72" width="118" height="56" rx="8"/>' +
      '<text x="395" y="96" text-anchor="middle">Привод</text>' +
      '<text class="t-sm" x="395" y="114" text-anchor="middle">золотник + шток</text>' +

      '<rect class="f-body" x="500" y="72" width="90" height="56" rx="8"/>' +
      '<text x="545" y="96" text-anchor="middle">Руль</text>' +
      '<text class="t-sm" x="545" y="114" text-anchor="middle">поверхность</text>' +

      '<path id="w-p1" class="f-dim" stroke-width="3" d="M114 92H140V42H156"/>' +
      '<path id="w-p2" class="f-dim" stroke-width="3" d="M288 42H310V100H332"/>' +
      '<path id="w-p3" class="f-dim" stroke-width="3" d="M114 108H140V158H156"/>' +
      '<path id="w-p4" class="f-dim" stroke-width="3" d="M288 158H310V100"/>' +
      '<path class="f-dim" stroke-width="3" d="M454 100h42"/>' +

      '<path class="f-green" stroke-width="2.5" stroke-dasharray="5 4" ' +
      'd="M545 128V196H395V132"/>' +
      '<text class="t-sm" x="470" y="212" text-anchor="middle">' +
      'обратная связь по положению штока — тот же принцип, что в бустере</text>' +

      '<text class="t-sm" x="300" y="8" text-anchor="middle" id="w-mode">' +
      'Normal Law — сигнал проходит через законы и защиты</text>';

    frame.innerHTML = svg('0 0 600 222', inner);
    controls(frame,
      '<span class="fig-label">Режим</span>' +
      '<button class="fig-btn is-on" data-m="0" type="button">Normal</button>' +
      '<button class="fig-btn" data-m="1" type="button">Alternate</button>' +
      '<button class="fig-btn" data-m="2" type="button">Direct</button>');

    var p1 = frame.querySelector('#w-p1'), p2 = frame.querySelector('#w-p2');
    var p3 = frame.querySelector('#w-p3'), p4 = frame.querySelector('#w-p4');
    var pfcu = frame.querySelector('#w-pfcu');
    var label = frame.querySelector('#w-mode');

    var MODES = [
      { via: true,  text: 'Normal Law — работают все защиты: угол атаки, перегрузка, скорость, крен' },
      { via: true,  text: 'Alternate Law — часть защит отключена, управление ближе к классическому' },
      { via: false, text: 'Direct Law — сигнал идёт от ручки прямо на приводы, защиты не активны' }
    ];

    function setMode(i) {
      var m = MODES[i];
      [p1, p2].forEach(function (p) {
        p.setAttribute('class', m.via ? 'f-blue' : 'f-dim');
        p.style.opacity = m.via ? 1 : 0.25;
      });
      [p3, p4].forEach(function (p) {
        p.setAttribute('class', m.via ? 'f-dim' : 'f-blue');
        p.style.opacity = 1;
      });
      pfcu.style.opacity = m.via ? 1 : 0.35;
      label.textContent = m.text;
    }

    frame.querySelectorAll('[data-m]').forEach(function (b) {
      b.addEventListener('click', function () {
        frame.querySelectorAll('[data-m]').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        setMode(+b.dataset.m);
      });
    });
    setMode(0);
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
          loadScript(THREE_BASE + 'examples/js/controls/OrbitControls.js')
        ]);
      });
    return threeReady;
  }

  reg.model3d = function (frame, opts) {
    if (!opts || !opts.src) { console.warn('model3d без opts.src'); return; }

    var box = document.createElement('div');
    box.className = 'model3d';
    box.innerHTML = '<div class="model3d-note">Загрузка модели…</div>';
    frame.appendChild(box);

    var bar = controls(frame, '<span class="fig-label">Сценарий</span>' +
      '<span class="fig-readout" id="m3-info">—</span>');

    ensureThree().then(function () {
      var THREE = window.THREE;
      var w = box.clientWidth || 600, h = Math.round(w * 0.62);

      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(w, h);
      renderer.outputEncoding = THREE.sRGBEncoding;

      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(42, w / h, 0.01, 200);

      /* Свет ставит сайт — модель приходит без запечённого освещения */
      scene.add(new THREE.HemisphereLight(0xffffff, 0xb8bcc2, 1.1));
      var key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(3, 5, 4);
      scene.add(key);
      var fill = new THREE.DirectionalLight(0xffffff, 0.5);
      fill.position.set(-4, 2, -3);
      scene.add(fill);

      box.textContent = '';
      box.appendChild(renderer.domElement);

      var ctrl = new THREE.OrbitControls(camera, renderer.domElement);
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
      ctrl.addEventListener('change', function () { renderer.render(scene, camera); });

      var mixer = null, clips = {}, current = null;
      var info = frame.querySelector('#m3-info');

      /* «Оболочка» — обшивка, фонарь, остекление. Её можно спрятать кнопкой,
         а из кликов она исключена всегда: иначе до механизма не добраться.
         Список задаётся в opts.shell, иначе узнаём по имени. */
      var SHELL_RE = /fuselage|canopy|cowl|skin|shell|glass|window|fairing|^fin$|^wing|^stabilizer/i;
      var shellSet = null;
      function isShell(o) {
        while (o) {
          if (shellSet && shellSet[o.name]) return true;
          if (!shellSet && o.name && SHELL_RE.test(o.name)) return true;
          o = o.parent;
        }
        return false;
      }
      if (opts.shell && opts.shell.length) {
        shellSet = {};
        opts.shell.forEach(function (n) { shellSet[n] = 1; });
      }

      new THREE.GLTFLoader().load(opts.src, function (gltf) {
        var root = gltf.scene;
        scene.add(root);

        /* Кнопка «Оболочка» — показать или убрать обшивку */
        var shells = [];
        root.traverse(function (o) { if (o.isMesh && isShell(o)) shells.push(o); });
        if (shells.length) {
          var sb = document.createElement('button');
          sb.type = 'button';
          sb.className = 'fig-btn is-on';
          sb.textContent = 'Оболочка';
          sb.addEventListener('click', function () {
            var on = !sb.classList.contains('is-on');
            sb.classList.toggle('is-on', on);
            shells.forEach(function (o) { o.visible = on; });
            renderer.render(scene, camera);
          });
          bar.appendChild(sb);
        }

        /* Кадрируем модель: камера сама встаёт так, чтобы она влезла целиком */
        var bb = new THREE.Box3().setFromObject(root);
        var size = bb.getSize(new THREE.Vector3());
        var mid = bb.getCenter(new THREE.Vector3());
        var r = Math.max(size.x, size.y, size.z) || 1;
        root.position.sub(mid);
        camera.position.set(r * 1.2, r * 0.7, r * 1.6);
        camera.near = r / 100;
        camera.far = r * 40;
        camera.updateProjectionMatrix();
        ctrl.minDistance = r * 0.08;    /* можно подойти вплотную к узлу */
        ctrl.maxDistance = r * 6;
        ctrl.target.set(0, 0, 0);
        ctrl.update();

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
            : 'перетащить — поворот · двумя пальцами — сдвиг · колесо — приближение';
        });
        bar.appendChild(pb);

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
          renderer.render(scene, camera);
        });
        bar.appendChild(rb);

        if (gltf.animations && gltf.animations.length) {
          mixer = new THREE.AnimationMixer(root);
          gltf.animations.forEach(function (c) { clips[c.name] = c; });
          var names = opts.scenarios || gltf.animations.map(function (c) {
            return { clip: c.name, title: c.name };
          });
          var html = '';
          names.forEach(function (s, i) {
            html += '<button class="fig-btn' + (i ? '' : ' is-on') +
              '" data-clip="' + s.clip + '" type="button">' + Render.esc(s.title) + '</button>';
          });
          bar.insertAdjacentHTML('afterbegin', html);
          bar.querySelectorAll('[data-clip]').forEach(function (b) {
            b.addEventListener('click', function () {
              bar.querySelectorAll('[data-clip]').forEach(function (x) {
                x.classList.remove('is-on');
              });
              b.classList.add('is-on');
              play(b.dataset.clip);
            });
          });
          play(names[0].clip);
        }

        /* Клик по узлу — подпись из opts.labels по имени меша */
        var ray = new THREE.Raycaster(), pt = new THREE.Vector2();
        renderer.domElement.addEventListener('click', function (e) {
          var b = renderer.domElement.getBoundingClientRect();
          pt.x = ((e.clientX - b.left) / b.width) * 2 - 1;
          pt.y = -((e.clientY - b.top) / b.height) * 2 + 1;
          ray.setFromCamera(pt, camera);
          /* Оболочка перехватывает каждый луч — кликать надо по механизму
             внутри, поэтому из выборки она исключена всегда. */
          var all = ray.intersectObject(root, true), hit = null;
          for (var i = 0; i < all.length; i++) {
            if (!isShell(all[i].object)) { hit = all[i]; break; }
          }
          if (!hit) return;
          /* Кликнуть можно по вложенному мешу, у которого своего имени в словаре
             нет, — поднимаемся по родителям до первого известного узла. */
          var n = hit.object, label = null, name = n.name;
          while (n && n !== root) {
            if (opts.labels && opts.labels[n.name]) { label = opts.labels[n.name]; break; }
            n = n.parent;
          }
          info.textContent = label || name || '—';
        });

        info.textContent = opts.hint ||
          'перетащить — поворот · двумя пальцами — сдвиг · колесо — приближение';
      }, null, function (err) {
        box.innerHTML = '<div class="model3d-note">Не удалось загрузить модель ' +
          '<code>' + Render.esc(opts.src) + '</code></div>';
        console.error(err);
      });

      function play(name) {
        if (!mixer || !clips[name]) return;
        if (current) current.fadeOut(0.25);
        current = mixer.clipAction(clips[name]);
        current.reset().fadeIn(0.25).play();
      }

      var clock = new THREE.Clock();
      loop(frame, function () {
        if (mixer) mixer.update(clock.getDelta());
        ctrl.update();
        renderer.render(scene, camera);
      });

      /* Размер берём у самого элемента, а не у окна: схема может смонтироваться,
         пока страница ещё не разложена (скрытая вкладка, свёрнутая панель,
         поворот телефона) — тогда ширина нулевая и canvas залипает крошечным. */
      function fit() {
        var nw = Math.round(box.clientWidth);
        if (nw < 40) return;              /* ещё нет раскладки — ждём */
        var nh = Math.round(nw * 0.62);
        renderer.setSize(nw, nh);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
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
