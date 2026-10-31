/* ═══════════════════════════════════════════════════════
   Garmin G1000 DA 40 NG: PFD и MFD, кнопки нажимаются, страницы листаются
   ═══════════════════════════════════════════════════════
   Рамка GDU — из Diamond DA40 G1000 Trainer (ресурсы CDUSIMv2.exe; сборка —
   Desktop\x\DA-40\g1000_trainer_assets). Страницы и переходы между ними —
   из самого G1000 MSFS 2024 (WTG1000, panel.xml DA40NG), набранные шрифтом
   тренажёра: стенд g1000_capture обошёл прибор по кнопкам (explore.js) и
   записал, какая кнопка с какой страницы куда ведёт — models/da40/g1000/
   graph.json и снимки состояний pfd/sNN.webp, mfd/sNN.webp. Здесь — только
   этот граф: нажатие ищет переход из текущего состояния; если его нет,
   прибор, как настоящий, ничего не делает.

   Ручка FMS: середина — малая ручка (страница в группе, курсор), кольцо —
   большая (группа страниц); левая половина — против часовой, правая — по
   часовой; колесо мыши над ручкой тоже крутит её. Экраны в 3D-кабине
   (cockpit.js) показывают то же, что здесь: событие g1000:screen. */
(function () {
  'use strict';
  if (!window.Figures) return;
  var U = Figures.util;
  var BASE = 'models/da40/g1000/';
  var W = 1268, H = 903;
  var SCR = [122, 41, 1024, 768];
  /* кнопки правой боковины: действие, центр x, y, ширина, высота, подпись */
  var KEYS = [
    ['DIRECTTO', 1193, 546, 32, 22, 'Direct-To'], ['MENU_Push', 1236, 546, 32, 22, 'MENU'],
    ['FPL_Push', 1193, 580, 32, 22, 'FPL'], ['PROC_Push', 1236, 580, 32, 22, 'PROC'],
    ['CLR', 1193, 614, 32, 22, 'CLR'], ['ENT_Push', 1236, 614, 32, 22, 'ENT']
  ];
  var FMS = [1215, 677, 31];
  var SOFT = { y: 842, w: 50, h: 32, x0: 122, step: 1024 / 12 };

  var graphP = null;
  function graph() {
    if (!graphP) graphP = fetch(U.withV(BASE + 'graph.json')).then(function (r) { return r.json(); });
    return graphP;
  }
  function pct(v, of) { return (v / of * 100).toFixed(3) + '%'; }
  function box(el, x, y, w, h) {
    el.style.left = pct(x - w / 2, W); el.style.top = pct(y - h / 2, H);
    el.style.width = pct(w, W); el.style.height = pct(h, H);
  }

  function gdu(kind, G, host) {
    var st = { cur: G.start };
    var wrap = document.createElement('div');
    wrap.className = 'g1k-gdu';
    wrap.innerHTML = '<div class="g1k-head"><b>' + kind.toUpperCase() + '</b><span class="g1k-page"></span>' +
      '<button type="button" class="g1k-reset">Сброс</button></div>' +
      '<div class="g1k-face"><img class="g1k-scr" alt="" draggable="false"><img class="g1k-bezel" src="' + U.withV(BASE + 'bezel.webp') + '" alt="" draggable="false"></div>';
    host.appendChild(wrap);
    var face = wrap.querySelector('.g1k-face'), scr = wrap.querySelector('.g1k-scr'), page = wrap.querySelector('.g1k-page');
    scr.style.left = pct(SCR[0], W); scr.style.top = pct(SCR[1], H); scr.style.width = pct(SCR[2], W); scr.style.height = pct(SCR[3], H);
    scr.alt = kind.toUpperCase();
    var cache = {};
    function src(id) { return U.withV(BASE + kind + '/' + id + '.webp'); }
    function preload(id) {
      Object.keys(G.edges[id] || {}).forEach(function (a) {
        var t = G.edges[id][a];
        if (!cache[t]) { cache[t] = new Image(); cache[t].src = src(t); }
      });
    }
    function show(id) {
      st.cur = id;
      scr.src = src(id);
      var s = G.states[id] || {};
      page.textContent = s.title || '';
      softLabels(s.sk || []);
      preload(id);
      window.dispatchEvent(new CustomEvent('g1000:screen', { detail: { kind: kind, src: scr.src } }));
    }
    function press(act, el) {
      if (el) { el.classList.remove('is-press'); void el.offsetWidth; el.classList.add('is-press'); }
      var to = (G.edges[st.cur] || {})[act];
      if (to) show(to);
    }
    /* программные кнопки: подпись — что сейчас на экране над ней */
    var softs = [];
    for (var i = 0; i < 12; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'g1k-key g1k-soft';
      box(b, SOFT.x0 + SOFT.step * (i + 0.5), SOFT.y, SOFT.w, SOFT.h);
      (function (n, el) { el.addEventListener('click', function () { press('SK' + n, el); }); })(i + 1, b);
      face.appendChild(b);
      softs.push(b);
    }
    function softLabels(sk) {
      softs.forEach(function (b, i) {
        var l = sk[i] || '';
        b.setAttribute('aria-label', l ? 'Программная кнопка ' + (i + 1) + ': ' + l : 'Программная кнопка ' + (i + 1));
        b.disabled = !l;
      });
    }
    KEYS.forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'g1k-key';
      b.setAttribute('aria-label', k[5]);
      b.title = k[5];
      box(b, k[1], k[2], k[3], k[4]);
      b.addEventListener('click', function () { press(k[0], b); });
      face.appendChild(b);
    });
    /* ручка FMS */
    var knob = document.createElement('button');
    knob.type = 'button';
    knob.className = 'g1k-key g1k-knob';
    knob.setAttribute('aria-label', 'Ручка FMS: кольцо — группа страниц, середина — страница; левая половина — назад, правая — вперёд');
    knob.title = 'FMS: кольцо — группа страниц, середина — страница в группе. Левая половина — назад, правая — вперёд.';
    box(knob, FMS[0], FMS[1], FMS[2] * 2, FMS[2] * 2);
    function turn(inner, up) { press('FMS_' + (inner ? 'Upper' : 'Lower') + (up ? '_INC' : '_DEC'), knob); }
    knob.addEventListener('click', function (e) {
      var r = knob.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      var inner = Math.sqrt(dx * dx + dy * dy) < r.width * 0.26;
      if (!e.clientX && !e.clientY) inner = false;            /* с клавиатуры — большая ручка вперёд */
      turn(inner, dx >= 0);
    });
    knob.addEventListener('wheel', function (e) {
      e.preventDefault();
      turn(e.shiftKey, e.deltaY < 0);
    }, { passive: false });
    face.appendChild(knob);
    wrap.querySelector('.g1k-reset').addEventListener('click', function () { show(G.start); });
    show(G.start);
    return { show: show };
  }

  Figures.register('g1000', function (frame, opts) {
    var box0 = document.createElement('div');
    box0.className = 'g1k';
    box0.innerHTML = '<div class="g1k-note">Загрузка G1000…</div>';
    frame.appendChild(box0);
    graph().then(function (G) {
      if (!frame.isConnected) return;
      box0.textContent = '';
      ['pfd', 'mfd'].forEach(function (k) { if (G[k]) gdu(k, G[k], box0); });
      var hint = document.createElement('p');
      hint.className = 'g1k-hint';
      hint.textContent = U.TOUCH
        ? 'касание кнопки — нажатие · ручка FMS: кольцо — группы страниц, середина — страницы, левая половина — назад'
        : 'щелчок по кнопке — нажатие · ручка FMS: кольцо — группы страниц, середина — страницы; левая половина — назад, правая — вперёд; колесо мыши крутит кольцо, с Shift — середину';
      box0.appendChild(hint);
    }).catch(function (e) {
      box0.innerHTML = '<div class="g1k-note">G1000 не загрузился</div>';
      console.warn('g1000:', e);
    });
  });
})();
