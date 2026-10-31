/* ═══════════════════════════════════════════════════════════
   app.js — оглавление, хэш-роутер, отметки о прочитанном.
   Каждый экран имеет постоянный адрес (#fc-booster и т.п.),
   чтобы на него можно было сделать отдельный QR-код.

   Три вида страниц:
     главная        — титул с палитрой систем, глава 6 спектром разделов,
                      план DA 40 NG с перечнем систем, программа курса;
     раздел главы   — полоса заголовка цвета раздела, колонка текста,
                      справа указатель разделов и заголовков;
     раздел практикума — рабочее место: модель слева (не уходит при чтении),
                      текст и состав системы справа, мини-план — выбор системы.

   Цвет: у каждого раздела своя палитра (style.css, [data-tone]). Тон
   страницы ставится на body, поэтому цвет раздела доходит и до шапки
   (полоса прочитанного), и до 3D-модели (figures.js читает --c3d).
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var main = document.getElementById('main');
  var btnToc = document.getElementById('btn-toc');
  var btnTheme = document.getElementById('btn-theme');
  var drawer = document.getElementById('toc-drawer');
  var tocBody = document.getElementById('toc-body');
  var nav = document.getElementById('nav');
  var progress = document.getElementById('reading-progress').firstElementChild;  /* скрыт в оформлении */

  var MENU = null;
  var cache = {};
  var offPage = [];          /* обработчики текущей страницы — снимаем при уходе */

  var ICON = {
    arrowR: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
    chevR:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    chevL:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    check:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>',
    up:     '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    close:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  /* ── Утилиты ───────────────────────────────────────────── */

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  /* «DA 40 NG» не разрываем между строками */
  var esc = function (s) { return Render.esc(s).replace(/DA 40 NG/g, 'DA&nbsp;40&nbsp;NG'); };

  /* Мягкие переносы по слогам для подписей в узких образцах палитры:
     словаря русских переносов в браузере может не быть, и длинное слово
     («Радиооборудование») ломалось посреди слога. Упрощённые правила:
     после й/ь/ъ, между гласными, на стыке согласных перед гласной;
     одну букву на строке не оставляем. */
  var SHY = (function () {
    var x = '[йьъ]', g = '[аеёиоуыэюя]', s = '[бвгджзклмнпрстфхцчшщ]', l = '[а-яё]';
    return [
      new RegExp('(' + x + ')(' + l + l + ')', 'gi'),
      new RegExp('(' + g + ')(' + g + l + ')', 'gi'),
      new RegExp('(' + g + s + ')(' + s + g + ')', 'gi'),
      new RegExp('(' + s + g + ')(' + s + g + ')', 'gi'),
      new RegExp('(' + g + s + ')(' + s + s + g + ')', 'gi'),
      new RegExp('(' + g + s + s + ')(' + s + s + g + ')', 'gi')
    ];
  })();
  function shy(t) {
    return t.replace(/[а-яё]{7,}/gi, function (w) {
      SHY.forEach(function (re) { w = w.replace(re, '$1­$2'); });
      return w.replace(/^([а-яё])­/i, '$1').replace(/­([а-яё])$/i, '$1');
    });
  }

  function getJSON(url) {
    if (cache[url]) return cache[url];
    cache[url] = fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(r.status + ' ' + url);
      return r.json();
    });
    return cache[url];
  }

  function routeId() {
    return location.hash.replace(/^#/, '').trim() || 'home';
  }

  function listen(t, type, fn, o) {
    t.addEventListener(type, fn, o);
    offPage.push(function () { t.removeEventListener(type, fn, o); });
  }

  /* Отметки «прочитано» живут только в браузере читателя.
     Любая ошибка доступа к localStorage не должна ломать страницу. */
  var READ_KEY = 'kioe-read';
  function readSet() {
    try { return JSON.parse(localStorage.getItem(READ_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function isRead(id) { return !!readSet()[id]; }
  function setRead(id, on) {
    try {
      var s = readSet();
      if (on) s[id] = 1; else delete s[id];
      localStorage.setItem(READ_KEY, JSON.stringify(s));
    } catch (e) { /* приватный режим — просто не сохраняем */ }
  }

  /* ── Оглавление: темы, разделы ─────────────────────────── */

  function topics() {
    var out = [];
    MENU.parts.forEach(function (p) { p.topics.forEach(function (t) { out.push(t); }); });
    return out;
  }
  function findTopic(id) {
    return topics().filter(function (t) { return t.id === id; })[0] || null;
  }
  function topicOf(id) {
    return topics().filter(function (t) {
      return (t.screens || []).some(function (s) { return s.id === id; });
    })[0] || null;
  }
  function screenOf(id) {
    var t = topicOf(id);
    return t ? t.screens.filter(function (s) { return s.id === id; })[0] : null;
  }
  /* глава 6 — первая готовая тема; практикум — тема «3D» */
  function chapter() {
    return topics().filter(function (t) { return t.status === 'ready' && t.num !== '3D'; })[0] || null;
  }
  function lab() {
    return topics().filter(function (t) { return t.num === '3D'; })[0] || null;
  }
  function isLab(t) { return t && t.num === '3D'; }

  function readCount(topic) {
    if (!topic || !topic.screens) return 0;
    var s = readSet(), n = 0;
    topic.screens.forEach(function (x) { if (s[x.id]) n++; });
    return n;
  }
  function firstUnread(topic) {
    var s = readSet();
    for (var i = 0; i < topic.screens.length; i++) {
      if (!s[topic.screens[i].id]) return topic.screens[i].id;
    }
    return topic.screens[0].id;
  }
  function minutes(topic) {
    return topic.screens.reduce(function (a, s) { return a + (s.min || 0); }, 0);
  }
  /* «6.2 · Прямое управление» → номер «6.2» */
  function screenNo(s, i) {
    var m = /^(\d+(?:\.\d+)*)\s*·/.exec(s.short || '');
    return m ? m[1] : '—';
  }
  /* системы практикума: разделы с пятном на плане */
  function systems() {
    var t = lab();
    return t ? t.screens.filter(function (s) { return /^da40-/.test(s.id) && s.ata; }) : [];
  }
  function sysTitles() {
    var o = {};
    systems().forEach(function (s) { o[s.id] = { t: s.title, ata: s.ata }; });
    return o;
  }

  function buildToc() {
    tocBody.textContent = '';
    MENU.parts.forEach(function (part) {
      tocBody.appendChild(el('div', 'toc-part', esc(part.name)));
      part.topics.forEach(function (t) {
        var a = el('a', 'toc-link' + (t.status === 'soon' ? ' is-soon' : ''));
        a.href = '#' + (t.status === 'ready' && t.screens ? t.screens[0].id : t.id);
        a.dataset.route = t.id;
        a.innerHTML = '<em>' + esc(t.num) + '</em><span>' + esc(t.title) + '</span>';
        tocBody.appendChild(a);
        (t.screens || []).forEach(function (s, i) {
          var b = el('a', 'toc-sub');
          b.href = '#' + s.id;
          b.dataset.route = s.id;
          b.dataset.screen = s.id;
          b.dataset.tone = s.id;
          var no = isLab(t) ? (s.ata ? '<i class="ata">' + esc(s.ata.split(',')[0]) + '</i>' : '') : '<i class="ata">' + esc(screenNo(s)) + '</i>';
          b.innerHTML = '<span>' + no + '</span><span>' + esc(isLab(t) ? s.title : (s.short || s.title).replace(/^[\d.]+\s*·\s*/, '')) + '</span><i class="dot"></i>';
          tocBody.appendChild(b);
        });
      });
    });
    refreshTocMarks();
  }

  function refreshTocMarks() {
    var s = readSet();
    tocBody.querySelectorAll('[data-screen]').forEach(function (n) {
      n.classList.toggle('is-read', !!s[n.dataset.screen]);
    });
  }

  function markNav(id) {
    tocBody.querySelectorAll('[data-route]').forEach(function (n) {
      n.classList.toggle('is-active', n.dataset.route === id);
    });
    var t = topicOf(id);
    var cur = id === 'home' ? 'home' : /quiz/.test(id) ? 'quiz' : isLab(t) ? 'lab' : t ? 'ch' : '';
    nav.querySelectorAll('[data-nav]').forEach(function (a) {
      a.classList.toggle('is-cur', a.dataset.nav === cur);
      if (a.dataset.nav === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function openToc(open) {
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    btnToc.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  btnToc.addEventListener('click', function () {
    openToc(drawer.getAttribute('aria-hidden') !== 'false');
  });
  document.getElementById('btn-toc-close').addEventListener('click', function () { openToc(false); });
  document.getElementById('toc-scrim').addEventListener('click', function () { openToc(false); });
  tocBody.addEventListener('click', function (e) { if (e.target.closest('a')) openToc(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') openToc(false); });

  /* ── Тема: светлая или тёмная ──────────────────────────── */

  /* Пока читатель не выбрал сам, тема следует системе. Выбор хранится
     в браузере; index.html применяет его до первой отрисовки. */
  var THEME_KEY = 'kioe-theme';
  var darkMq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function isDark() {
    var t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : !!(darkMq && darkMq.matches);
  }
  function paintTheme() {
    var meta = document.querySelector('meta[name="theme-color"]');
    var bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (meta && bg) meta.setAttribute('content', bg);
    btnTheme.setAttribute('aria-pressed', isDark() ? 'true' : 'false');
  }
  btnTheme.addEventListener('click', function () {
    var t = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* приватный режим — тема до перезагрузки */ }
    paintTheme();
  });
  if (darkMq && darkMq.addEventListener) darkMq.addEventListener('change', paintTheme);
  paintTheme();

  /* ── Прогресс чтения и «наверх» ────────────────────────── */

  function updateProgress() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    progress.style.width = ((max > 40 ? Math.min(1, h.scrollTop / max) : 0) * 100).toFixed(1) + '%';
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);

  var toTop = el('button', 'to-top', ICON.up + '<span>Наверх</span>');
  toTop.type = 'button';
  toTop.setAttribute('aria-label', 'Вернуться к началу раздела');
  toTop.hidden = true;
  toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  document.body.appendChild(toTop);
  function updateToTop() { toTop.hidden = window.scrollY < 900; }
  window.addEventListener('scroll', updateToTop, { passive: true });

  /* ── Общие части страниц ───────────────────────────────── */

  /* Перечень систем: строки ATA · название · что внутри. Наведение
     подсвечивает систему на плане (и наоборот, через plan.onHot). */
  function sysList(cur, compact) {
    var ol = el('ol', 'sys-list' + (compact ? ' is-compact' : ''));
    systems().forEach(function (s) {
      var li = el('li');
      li.innerHTML = '<a href="#' + s.id + '" data-sys="' + s.id + '"' + (s.id === cur ? ' class="is-cur" aria-current="page"' : '') + '>' +
        '<span class="ata">' + esc(s.ata) + '</span><span class="t">' + esc(s.title) + '</span>' +
        (s.note ? '<span class="n">' + esc(s.note) + '</span>' : '') + '</a>';
      ol.appendChild(li);
    });
    return ol;
  }

  /* План и перечень вместе: наведение на одно подсвечивает другое */
  function planBox(host, cur, opts) {
    opts = opts || {};
    var box = el('div', 'planbox');
    var fig = el('figure', 'plan-host');
    var list = sysList(cur, opts.compact);
    box.appendChild(fig);
    box.appendChild(list);
    host.appendChild(box);
    function lightList(id) {
      list.querySelectorAll('a').forEach(function (a) { a.classList.toggle('is-hot', a.dataset.sys === id); });
    }
    var plan = Plan.mount(fig, { cur: cur, live: true, dims: !!opts.dims, titles: sysTitles(), onHot: lightList });
    list.addEventListener('pointerover', function (e) {
      var a = e.target.closest('a[data-sys]');
      if (a) plan.hot(a.dataset.sys);
    });
    list.addEventListener('focusin', function (e) {
      var a = e.target.closest('a[data-sys]');
      if (a) plan.hot(a.dataset.sys);
    });
    list.addEventListener('pointerleave', function () { plan.hot(null); });
    if (opts.caption) {
      fig.appendChild(el('figcaption', 'plan-cap', opts.caption));
    }
    return box;
  }

  /* Лист-разделитель раздела: крошки, где мы (глава и раздел или глава
     ATA), заголовок, вводный абзац и сведения строкой. Цвет — у полосы
     вокруг (style.css, .doc-band и .ws-text .doc-head). */
  function head(data, extra, cap) {
    var t = topicOf(data.id);
    var h = el('header', 'doc-head');
    var crumbs = '<li><a href="#home">Главная</a></li>';
    if (t) crumbs += '<li><a href="#' + t.screens[0].id + '">' + (isLab(t) ? 'Практикум DA&nbsp;40&nbsp;NG' : 'Глава ' + esc(t.num)) + '</a></li>';
    var s = screenOf(data.id);
    if (!cap && t) {
      var no = s ? screenNo(s) : '—';
      cap = isLab(t)
        ? (s && s.ata ? 'Глава ATA <b>' + esc(s.ata) + '</b>' : 'Практикум DA&nbsp;40&nbsp;NG')
        : 'Глава ' + esc(t.num) + (no !== '—' ? ', раздел <b>' + no + '</b>' : '');
    }
    h.innerHTML = '<ol class="crumbs">' + crumbs + '</ol>' +
      (cap ? '<p class="dh-cap">' + cap + '</p>' : '') +
      '<h1>' + esc(shy(data.title)) + '</h1>' +
      (data.lead ? '<p class="lead">' + Render.inline(data.lead) + '</p>' : '');
    var rows = (extra || []).filter(function (c) { return c && c[1]; });
    if (data.source) rows.push(['Источник', Render.inline(data.source)]);
    if (rows.length) {
      var dl = el('dl', 'summary');
      dl.innerHTML = rows.map(function (c) { return '<div><dt>' + c[0] + '</dt><dd>' + c[1] + '</dd></div>'; }).join('');
      h.appendChild(dl);
    }
    return h;
  }

  /* Спектр темы: разделы своими цветами подряд, длина — время чтения.
     Текущий раздел выше остальных; щелчок — переход. */
  function spectrum(topic, curId) {
    return '<nav class="spectrum" aria-label="Разделы темы">' + topic.screens.map(function (s) {
      return '<a href="#' + s.id + '" data-tone="' + s.id + '" style="--w:' + (s.min || 1) + '" title="' + esc(s.title) + '"' +
        (s.id === curId ? ' class="is-cur" aria-current="page"' : '') + '></a>';
    }).join('') + '</nav>';
  }

  function doneBar(data) {
    var bar = el('div', 'done-bar');
    var on = isRead(data.id);
    var btn = el('button', 'done-btn' + (on ? ' is-on' : ''), ICON.check + '<span>Я прочитал этот раздел</span>');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.addEventListener('click', function () {
      on = !on;
      setRead(data.id, on);
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      refreshTocMarks();
    });
    bar.appendChild(btn);
    bar.appendChild(el('p', null, 'Отметка хранится только в этом браузере.'));
    return bar;
  }

  function pager(data) {
    var html = '';
    if (data.prev) html += '<a class="p-prev" href="#' + data.prev.id + '" data-tone="' + esc(data.prev.id) + '"><span class="pager-tx"><small>Предыдущий раздел</small><b>' + esc(data.prev.title) + '</b></span></a>';
    html += data.next
      ? '<a class="p-next" href="#' + data.next.id + '" data-tone="' + esc(data.next.id) + '"><span class="pager-tx"><small>Следующий раздел</small><b>' + esc(data.next.title) + '</b></span></a>'
      : '<a class="p-next" href="#home" data-tone="home"><span class="pager-tx"><small>На главную</small><b>Содержание пособия</b></span></a>';
    return el('nav', 'pager', html);
  }

  /* ── Главная ───────────────────────────────────────────── */

  /* Порядок полос в поле красок — по кругу оттенков: сначала нейтральный
     планер, затем системы от киновари к маджента. Так поле читается как
     палитра, а не как случайный набор цветов. */
  var PALETTE_ORDER = ['da40-fuselage', 'da40-wing', 'da40-cabin', 'da40-powerplant', 'da40-fuel', 'da40-gear',
    'da40-instruments', 'da40-air', 'da40-controls', 'da40-electrical', 'da40-radio'];
  function inPalette(list) {
    return list.slice().sort(function (a, b) {
      var i = PALETTE_ORDER.indexOf(a.id), j = PALETTE_ORDER.indexOf(b.id);
      return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
    });
  }

  /* Жизнь поля на главной.
     Стробы на законцовках срабатывают не постоянно, а раз в 10–30 с.
     Сначала — быстрый «ручеёк»: полосы, как только встали, все вместе
     волной слева направо вспыхивают и подбрасывают подписи (без раскрытия) —
     видно, что они живые. Сразу за ним — показ: полосы по очереди (каждые
     3 с) раздвигаются и показывают превью системы прямо в себе — план
     DA 40 с её трассой и строку о составе. На компьютере любое движение,
     касание, клавиша или прокрутка возвращают поле в обычный вид, а дальше
     показ идёт после ~6 с бездействия; наведение на полосу раскрывает её
     сразу. На телефоне показ идёт, пока поле на экране. */
  function fieldLife(field, sys) {
    var tStrobe = null, tick = null, io = null, seen = true;
    function strobe() {
      if (!field.isConnected) return;
      field.classList.remove('is-strobe');
      void field.offsetWidth;                       /* перезапуск анимации */
      field.classList.add('is-strobe');
      tStrobe = setTimeout(strobe, 10000 + Math.random() * 20000);
    }
    tStrobe = setTimeout(strobe, 3000 + Math.random() * 5000);

    var bandsEl = field.querySelector('.bands'), bands = field.querySelectorAll('.band'), keys = field.querySelectorAll('.field-keys a');
    var last = Date.now(), demo = false, cur = -1, nextAt = 0;
    /* ручеёк: после появления полос (~1 с) волна идёт по ним за ~1,1 с */
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var waveEnd = Date.now() + (calm ? 0 : 2300), tWave = null;
    if (!calm) tWave = setTimeout(function () {
      bandsEl.classList.add('is-wave');
      tWave = setTimeout(function () {
        bandsEl.classList.remove('is-wave');
        /* появление закончилось: без анимации полоса не своя прослойка, и
           превью внутри неё встаёт поверх самолёта */
        bandsEl.classList.add('is-ready');
        last = Date.now() - 6000;                    /* показ — сразу за ручейком */
        [].forEach.call(bands, function (b, i) { preview(i); });
      }, 1300);
    }, 1000);
    else { bandsEl.classList.add('is-ready'); setTimeout(function () { [].forEach.call(bands, function (b, i) { preview(i); }); }, 0); }
    function show(i) {
      [].forEach.call(bands, function (b, j) { b.classList.toggle('is-pv', j === i); if (j !== i) b.classList.remove('is-in'); });
      [].forEach.call(keys, function (k, j) { k.classList.toggle('is-pv', j === i); });
      if (i < 0) return;
      var b = bands[i], s = sys[i];
      preview(i);
      /* телефон: под полем — карточка с названием и составом (касание
         открывает раздел, смахивание листает) */
      card.setAttribute('data-tone', s.id);
      txt.innerHTML = '<b><i>' + esc(s.ata) + '</i> ' + esc(s.title || s.short) + '</b>' + (s.note ? '<p>' + esc(s.note) + '</p>' : '') + '<span class="go">Открыть раздел</span>';
      card.classList.add('is-on');
      card.classList.remove('is-tick'); void card.offsetWidth; card.classList.add('is-tick');
      place(i);
      requestAnimationFrame(function () { requestAnimationFrame(function () { b.classList.add('is-in'); }); });
    }
    var card = el('div', 'field-pv'), txt = el('div', 'pv-text'), tEdge = null;
    /* Превью — внутри самой полосы: план с трассой системы, строка
       о составе и ссылка. План не шире полосы. Собираем все заранее, сразу
       после ручейка: иначе первое наведение ждало загрузки плана. */
    function preview(i) {
      var b = bands[i], s = sys[i];
      if (b.querySelector('.band-pv')) return;
      var pv = el('div', 'band-pv'), pl = el('div', 'pv-plan');
      pv.setAttribute('aria-hidden', 'true');
      pv.appendChild(pl);
      Plan.mount(pl, { cur: s.id });
      pv.insertAdjacentHTML('beforeend', (s.note ? '<p>' + esc(s.note) + '</p>' : '') + '<span class="go">Открыть раздел</span>');
      b.insertBefore(pv, b.firstChild);
    }
    var plane = field.querySelector('.field-plane'), phone = window.matchMedia('(max-width:720px)');
    card.setAttribute('aria-hidden', 'true');
    card.appendChild(txt);
    field.insertBefore(card, field.querySelector('.field-keys'));
    /* Место самолёта. Раскрытая полоса растёт до ×3,6 своей доли, прочие
       сжимаются до ×0,78 (style.css, .bands.is-demo); где она окажется,
       считаем сразу по долям, не дожидаясь конца перехода. Самолёт отходит
       в свободную часть поля (и при нехватке места уменьшается), чтобы не
       закрывать превью в полосе. Двигаются только translate и scale. */
    function place(i) {
      if (phone.matches) { plane.style.translate = plane.style.scale = ''; clearTimeout(tEdge); tEdge = setTimeout(edge, 240); return; }
      var fw = field.clientWidth, g = [], sum = 0;
      [].forEach.call(bands, function (b, j) {
        var w = parseFloat(b.style.getPropertyValue('--w')) || 1, v = w * (j === i ? 3.6 : 0.78);
        g.push(v); sum += v;
      });
      var x0 = 0;
      for (var j = 0; j < i; j++) x0 += g[j] / sum * fw;
      var x1 = x0 + g[i] / sum * fw, left = (x0 + x1) / 2 < fw / 2;
      var room = left ? fw - x1 - 24 : x0 - 24;
      var pw = plane.offsetWidth, sc = Math.min(1, room / pw);
      var dx = (left ? x1 + 12 + room / 2 : 12 + room / 2) - fw / 2;
      plane.style.translate = Math.round(dx) + 'px 0';
      plane.style.scale = sc < 1 ? sc.toFixed(3) : '';
    }
    /* Окошко цвета полосы может лечь на полосу того же или близкого цвета
       (или на фон страницы того же тона) и слиться с ней. Тогда у окошка
       появляется обводка цвета подписи — белая на тёмных красках, тёмная
       на светлых. Цвета сравниваются в пикселях, как их видит глаз. */
    var cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    function rgb(c) { cv.clearRect(0, 0, 1, 1); cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return cv.getImageData(0, 0, 1, 1).data; }
    function near(a, b) {
      var r = (a[0] + b[0]) / 2, d0 = a[0] - b[0], d1 = a[1] - b[1], d2 = a[2] - b[2];
      return Math.sqrt((2 + r / 256) * d0 * d0 + 4 * d1 * d1 + (2 + (255 - r) / 256) * d2 * d2) < 150;
    }
    function edge() {
      if (cur < 0) return;
      var mine = rgb(getComputedStyle(bands[cur]).backgroundColor);
      card.classList.toggle('is-edge', phone.matches && near(mine, rgb(getComputedStyle(document.body).backgroundColor)));
    }
    function stop() {
      if (!demo || phone.matches) return;
      demo = false; cur = -1; want = -1;
      bandsEl.classList.remove('is-demo');
      card.classList.remove('is-on');
      plane.style.translate = plane.style.scale = '';
      show(-1);
    }
    /* на телефоне окошко — карточка под полем: касание открывает раздел,
       смахивание листает системы */
    var tx = null;
    listen(card, 'touchstart', function (e) { tx = e.touches[0].clientX; lastTouch = Date.now(); }, { passive: true });
    listen(card, 'touchend', function (e) {
      if (tx === null) return;
      var dx = e.changedTouches[0].clientX - tx; tx = null;
      if (Math.abs(dx) > 40) { cur = (cur + (dx < 0 ? 1 : bands.length - 1)) % bands.length; show(cur); nextAt = Date.now() + 3500; }
    });
    listen(card, 'click', function () { if (phone.matches && cur >= 0) location.hash = '#' + sys[cur].id; });
    /* Наведение мыши на полосу показывает то же превью. Чтобы раскрытие не
       мерцало, полоса меняется только при настоящем движении мыши и после
       задержки 50 мс: раздвинувшаяся полоса сдвигает соседние, курсор
       «оказывается» над другой, но без движения переключения нет. */
    var hover = false, want = -1, tWant = null, tLeave = null;
    function hoverTo(i) {
      hover = true;
      if (!demo) { demo = true; bandsEl.classList.add('is-demo'); }
      if (i !== cur) { cur = i; show(i); }
    }
    listen(bandsEl, 'pointermove', function (e) {
      if (e.pointerType === 'touch' || (!e.movementX && !e.movementY)) return;
      clearTimeout(tLeave);
      var b = e.target.closest('.band'), i = [].indexOf.call(bands, b);
      if (i < 0 || i === cur || i === want) return;
      want = i;
      clearTimeout(tWant);
      tWant = setTimeout(function () { if (want === i) hoverTo(i); }, 50);
    });
    listen(bandsEl, 'pointerleave', function () {
      want = -1; clearTimeout(tWant);
      tLeave = setTimeout(function () { hover = false; stop(); }, 200);
    });
    var lastTouch = 0;
    listen(field, 'touchstart', function () { lastTouch = Date.now(); card.classList.remove('is-tick'); }, { passive: true });
    function wake(e) {
      if (phone.matches) return;
      last = Date.now();
      /* движение мыши над полосами — это наведение, а не конец показа */
      if (e && e.type === 'pointermove' && bandsEl.contains(e.target)) return;
      stop();
    }
    ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(function (n) {
      listen(window, n, wake, { passive: true });
    });
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function (e) { seen = e[0].isIntersecting; if (!seen) stop(); });
      io.observe(field);
    }
    tick = setInterval(function () {
      if (!field.isConnected) return;
      var now = Date.now();
      if (now < waveEnd) return;                     /* сначала ручеёк */
      /* телефон: карточка под полем видна всегда и листает системы, пока
         поле на экране; касание поля останавливает листание на 8 с */
      if (phone.matches) {
        if (!demo) { demo = true; bandsEl.classList.add('is-demo'); plane.style.translate = plane.style.scale = ''; cur = -1; nextAt = 0; }
        if (cur < 0) { cur = 0; show(0); nextAt = now + 3500; return; }
        if (document.hidden || !seen || now - lastTouch < 8000 || now < nextAt) return;
        cur = (cur + 1) % bands.length; show(cur); nextAt = now + 3500;
        return;
      }
      if (hover || document.hidden || !seen || now - last < 6000) return;
      if (!demo) { demo = true; bandsEl.classList.add('is-demo'); cur = -1; nextAt = 0; }
      if (now >= nextAt) {
        cur = (cur + 1) % bands.length;
        show(cur);
        nextAt = now + 3000;
      }
    }, 500);
    offPage.push(function () { clearTimeout(tStrobe); clearTimeout(tWave); clearInterval(tick); if (io) io.disconnect(); });
  }

  function viewHome() {
    var page = el('div', 'home');
    var ch = chapter(), lb = lab();
    var done = ch ? readCount(ch) : 0;
    var going = !!(ch && done && done < ch.screens.length);
    var startId = ch ? (going ? firstUnread(ch) : ch.screens[0].id) : 'home';

    /* титул: название курса, а под ним — поле красок систем с самолётом */
    var hero = el('section', 'hero');
    hero.innerHTML =
      '<div class="hero-in">' +
        '<h1 class="hero-title">' + esc(MENU.title1) + ' <span>' + esc(MENU.title2) + '</span></h1>' +
        '<div class="hero-copy">' +
          '<p class="hero-lead">' + esc(MENU.lead) + '</p>' +
          '<div class="hero-acts">' +
            (ch ? '<a class="btn" href="#' + startId + '">' + (going ? 'Продолжить чтение' : 'Начать с главы 6') + '</a>' : '') +
            (lb ? '<a class="btn is-ghost" href="#' + lb.screens[0].id + '">Практикум в 3D</a>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    if (lb) {
      var sys = inPalette(systems());
      var field = el('div', 'field');
      field.innerHTML =
        '<nav class="bands" aria-label="Системы DA&nbsp;40&nbsp;NG">' + sys.map(function (s, i) {
          return '<a class="band" href="#' + s.id + '" data-tone="' + s.id + '" style="--w:' + (s.min || 6) + ';--i:' + i + '">' +
            '<b>' + esc(s.ata) + '</b><span>' + esc(shy(s.short || s.title)) + '</span></a>';
        }).join('') + '</nav>' +
        /* огни как на разбеге: навигационные горят (правая законцовка — зелёный,
           левая — красный), стробы на законцовках дают двойную вспышку,
           посадочная и рулёжная фары в левом крыле включены */
        '<div class="field-plane"><img src="assets/img/da40-hero.webp?v=152" width="1600" height="617" alt="Учебный самолёт DA&nbsp;40&nbsp;NG — 3D-модель пособия">' +
        '<span class="lt lt-nav lt-green" style="left:4.1%;top:29.6%"></span>' +
        '<span class="lt lt-nav lt-red" style="left:92.8%;top:43.8%"></span>' +
        '<span class="lt lt-strobe" style="left:4.5%;top:30.2%"></span>' +
        '<span class="lt lt-strobe" style="left:93.3%;top:44.3%"></span>' +
        '<span class="lt lt-land" style="left:80.6%;top:45.7%"></span>' +
        '<span class="lt lt-land" style="left:82.4%;top:45.7%"></span></div>' +
        '<ul class="field-keys">' + sys.map(function (s) {
          return '<li><a href="#' + s.id + '" data-tone="' + s.id + '"><span><i>' + esc(s.ata) + '</i> ' + esc(s.short || s.title) + '</span></a></li>';
        }).join('') + '</ul>';
      hero.appendChild(field);
      /* после show(): роутер снимает обработчики прошлой страницы уже
         после построения новой — таймеры, заведённые сразу, погасли бы */
      setTimeout(function () { if (field.isConnected) fieldLife(field, sys); }, 0);
    }
    page.appendChild(hero);

    /* глава 6: спектр разделов и строки с отметкой о прочитанном */
    if (ch) {
      var sec = el('section', 'home-sec');
      sec.innerHTML =
        '<div class="sec-head"><h2>Глава 6. ' + esc(ch.title) + '</h2>' +
        '<p>Разделы идут от жёсткой проводки DA&nbsp;40&nbsp;NG к электродистанционному управлению A320 и SSJ-100, и цвет раздела меняется вместе с ними: от бирюзы к малиновому.</p></div>' +
        '<div class="ch-grid"><div class="ch-side">' +
          '<p><b>' + ch.screens.length + ' разделов</b>, около ' + minutes(ch) + ' минут чтения. ' +
            (done ? 'Прочитано ' + done + ' из ' + ch.screens.length + '.' : 'Ширина полосы — время чтения раздела.') + '</p>' +
          '<a class="btn' + (going ? '' : ' is-ghost') + '" href="#' + startId + '">' + (going ? 'Продолжить чтение' : 'Открыть главу 6') + '</a>' +
        '</div><div class="ch-main">' + spectrum(ch, null) +
          '<ol class="ch-list">' + ch.screens.map(function (s) {
            var read = isRead(s.id), no = screenNo(s);
            return '<li><a href="#' + s.id + '" data-tone="' + s.id + '"' + (read ? ' class="is-read"' : '') + '>' +
              '<span class="no">' + (no === '—' ? '' : no) + '</span>' +
              '<span class="t">' + esc(s.title) + '</span><span class="m">' + (s.min ? s.min + ' мин' : '') + '</span>' +
              '<span class="st" title="' + (read ? 'Прочитан' : 'Не прочитан') + '">' + ICON.check + '</span></a></li>';
          }).join('') + '</ol>' +
        '</div></div>';
      page.appendChild(sec);
    }

    /* практикум: план с системами в цвете и основные данные */
    if (lb) {
      var ls = el('section', 'home-sec');
      ls.innerHTML = '<div class="sec-head"><h2>Практикум: DA&nbsp;40&nbsp;NG по системам</h2>' +
        '<p>Каждая система показана в 3D-модели, собранной по руководству по технической эксплуатации. Наведите на систему в перечне или на виде сверху — она проявится своим цветом.</p></div>';
      planBox(ls, null, { dims: true, caption: '<span>Вид сверху снят с 3D-модели. Размеры — по РЛЭ, раздел 1.</span>' +
        '<span class="plan-links"><a href="#' + lb.screens[0].id + '">Самолёт целиком</a><a href="#da40-quiz">Тест по практикуму</a></span>' });
      var facts = el('dl', 'facts');
      facts.innerHTML = [['Размах крыла', '11,63 м'], ['Длина', '8,06 м'], ['Максимальная взлётная масса', '1 280 кг'], ['Мощность двигателя', '123,5 кВт'],
        ['Максимально допустимая скорость V<sub>NE</sub>', '172 уз'], ['Топливо, два бака', '2 × 56,8 л']]
        .map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('');
      ls.appendChild(facts);
      ls.appendChild(el('p', 'facts-src', 'Данные — по РЛЭ DA&nbsp;40&nbsp;NG, разделы 1 и 2.'));
      page.appendChild(ls);
    }

    /* программа курса: готовые темы — цветом своего первого раздела */
    var cc = el('section', 'home-sec');
    var parts = MENU.parts.filter(function (p) { return !p.topics.some(isLab); });
    cc.innerHTML = '<div class="sec-head"><h2>Программа курса</h2>' +
      '<p>Готовые темы открываются целиком; остальные входят в программу и наполняются.</p></div>' +
      '<div class="topics">' + parts.map(function (p) {
        return '<div><h3>' + esc(p.name) + '</h3><ol>' + p.topics.map(function (t) {
          var ready = t.status === 'ready';
          var first = t.screens ? t.screens[0].id : t.id;
          return '<li' + (ready ? ' class="is-ready" data-tone="' + first + '"' : '') + '><span class="no">' + esc(t.num) + '</span>' +
            (ready ? '<a class="t" href="#' + first + '">' + esc(t.title) + '</a>' : '<span class="t">' + esc(t.title) + '</span>') +
            '<span class="st">' + (ready ? 'Готово' : 'В работе') + '</span></li>';
        }).join('') + '</ol></div>';
      }).join('') + '</div>';
    page.appendChild(cc);
    return page;
  }

  /* ── Тема «скоро» ──────────────────────────────────────── */

  function viewSoon(t) {
    var page = el('div', 'doc');
    var band = el('div', 'doc-band');
    var bin = el('div', 'doc-band-in');
    bin.appendChild(head({ id: t.id, title: t.title, lead: '' }, null, 'Тема <b>' + esc(t.num) + '</b> · в работе'));
    band.appendChild(bin);
    page.appendChild(band);
    var wrap = el('div', 'page');
    var items = (t.sub || '').split(';').map(function (s) { return s.trim(); })
      .filter(Boolean).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var ch = chapter();
    wrap.appendChild(el('div', 'soon article',
      '<p>Тема входит в программу курса, но ещё не наполнена.' + (ch ? ' Полностью готова <a href="#' + ch.screens[0].id + '">глава 6</a>.' : '') + '</p>' +
      (items ? '<h2>Что войдёт в тему</h2><ul>' + items + '</ul>' : '')));
    page.appendChild(wrap);
    return page;
  }

  /* ── Раздел главы: полоса заголовка, текст, указатель сбоку ─ */

  function viewDoc(data, topic) {
    var page = el('div', 'doc');
    var s = screenOf(data.id);
    var idx = topic ? topic.screens.indexOf(s) : -1;
    var band = el('div', 'doc-band');
    var bin = el('div', 'doc-band-in');
    bin.appendChild(head(data, [
      ['Время чтения', s && s.min ? 'около ' + s.min + ' мин' : ''],
      ['Раздел', idx >= 0 ? (idx + 1) + ' из ' + topic.screens.length : '']
    ]));
    band.appendChild(bin);
    page.appendChild(band);
    /* язычки разделов главы свисают из-под листа; текущий — его продолжение */
    if (topic) page.appendChild(el('div', 'doc-strip', spectrum(topic, data.id)));
    var wrap = el('div', 'page');
    var cols = el('div', 'cols');
    var m = el('div', 'col-main');
    var art = el('article', 'article');
    Render.blocks(data.blocks || [], art);
    m.appendChild(art);
    m.appendChild(doneBar(data));
    m.appendChild(pager(data));
    var side = el('aside', 'col-side');
    if (topic) {
      var hs = art.querySelectorAll('h2');
      var onPage = '';
      if (hs.length > 1) {
        onPage = '<div class="on-page"><h2>На этой странице</h2><ul>';
        hs.forEach(function (h, i) { h.id = 'h-' + (i + 1); onPage += '<li><a href="#' + data.id + '" data-h="' + h.id + '">' + esc(h.textContent) + '</a></li>'; });
        onPage += '</ul></div>';
      }
      side.innerHTML = '<div class="related">' + onPage + '<h2>' + (isLab(topic) ? 'Практикум DA&nbsp;40&nbsp;NG' : 'Глава ' + esc(topic.num)) + '</h2><ul>' +
        topic.screens.map(function (x) {
          return '<li class="' + (x.id === data.id ? 'is-cur' : '') + '"><a href="#' + x.id + '" data-tone="' + x.id + '">' + esc(x.title) + '</a></li>';
        }).join('') + '</ul></div>';
      side.querySelectorAll('[data-h]').forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var h = document.getElementById(a.dataset.h);
          if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }
    cols.appendChild(m); cols.appendChild(side);
    wrap.appendChild(cols);
    page.appendChild(wrap);
    return page;
  }

  /* ── Раздел практикума: рабочее место ──────────────────── */

  function systemsPanel(cur) {
    var p = el('div', 'systems');
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'Системы DA 40 NG');
    var inn = el('div', 'systems-in');
    inn.innerHTML = '<div class="systems-h"><h2>Системы DA&nbsp;40&nbsp;NG</h2>' +
      '<button class="systems-x" type="button">Закрыть' + ICON.close.replace('<svg', '<svg width="18" height="18"') + '</button></div>';
    p.appendChild(inn);
    var built = false;
    function open(on) {
      if (on && !built) { planBox(inn, cur, { caption: '<span>Щелчок по системе на чертеже или в перечне открывает её раздел.</span>' }); built = true; }
      p.classList.toggle('is-open', on);
      document.body.style.overflow = on ? 'hidden' : '';
      if (on) inn.querySelector('.systems-x').focus();
    }
    inn.querySelector('.systems-x').addEventListener('click', function () { open(false); });
    listen(document, 'keydown', function (e) { if (e.key === 'Escape' && p.classList.contains('is-open')) open(false); });
    offPage.push(function () { document.body.style.overflow = ''; });
    p.open = open;
    return p;
  }

  function viewLab(data, topic) {
    var blocks = (data.blocks || []).slice();
    var mi = -1;
    blocks.forEach(function (b, i) { if (mi < 0 && b.t === 'figure' && b.name === 'model3d') mi = i; });
    if (mi < 0) return viewDoc(data, topic);
    var model = blocks.splice(mi, 1)[0];
    var s = screenOf(data.id);
    var page = el('div', 'lab');
    var ws = el('div', 'ws');
    var view = el('div', 'ws-view');
    var text = el('div', 'ws-text');

    /* окно модели: тот же блок figure, что и в тексте; состав системы — справа */
    var legendId = 'legend-' + data.id;
    var fig = el('div');
    Render.blocks([model], fig);
    var frame = fig.querySelector('[data-figure]');
    if (frame) frame.dataset.legend = legendId;
    view.appendChild(fig.firstChild);

    /* мини-план: какая это система и выбор другой */
    var panel = systemsPanel(data.id);
    var map = el('button', 'ws-map');
    map.type = 'button';
    map.setAttribute('aria-label', 'Системы самолёта: выбрать другую');
    map.innerHTML = '<span class="label"><span>Системы</span><i>Выбрать</i></span>';
    Plan.mount(map, { cur: data.id });
    map.addEventListener('click', function () { panel.open(true); });
    if (data.id !== 'model-da40') view.appendChild(map);     /* на обзоре план — в колонке текста */

    text.appendChild(head(data, [
      ['Время чтения', s && s.min ? 'около ' + s.min + ' мин' : '']
    ]));
    /* под листом системы — язычки всего практикума: где она среди остальных */
    text.insertAdjacentHTML('beforeend', spectrum(topic, data.id));
    /* обзор: перечень систем с планом вместо состава */
    if (data.id === 'model-da40') {
      var sec = el('div', 'legend');
      sec.innerHTML = '<span class="label"><span>Системы самолёта</span></span>';
      planBox(sec, null, { compact: true });
      text.appendChild(sec);
    } else {
      var lg = el('div', 'legend');
      lg.id = legendId;
      text.appendChild(lg);
    }
    if (model.caption) text.appendChild(el('p', 'ws-cap', Render.inline(model.caption)));
    var art = el('article', 'article');
    Render.blocks(blocks, art);
    text.appendChild(art);
    text.appendChild(doneBar(data));
    text.appendChild(pager(data));

    ws.appendChild(view);
    ws.appendChild(text);
    page.appendChild(ws);
    page.appendChild(panel);
    return page;
  }

  function viewPage(data) {
    var topic = topicOf(data.id);
    return isLab(topic) ? viewLab(data, topic) : viewDoc(data, topic);
  }

  /* ── Роутер ────────────────────────────────────────────── */

  /* Перед сменой раздела освобождаем схемы старого: 3D-сцена держит
     видеопамять, пока её не отпустить явно. */
  function clearMain() {
    offPage.forEach(function (f) { f(); });
    offPage = [];
    Figures.unmountAll(main);
    main.textContent = '';
  }

  /* tone — палитра страницы (id раздела); body, а не main: цвет нужен
     и шапке с полосой прочитанного, и шторке содержания. */
  function show(node, title, cls, tone) {
    clearMain();
    main.className = 'main' + (cls ? ' ' + cls : '');
    document.body.setAttribute('data-tone', tone || 'home');
    document.body.setAttribute('data-view', cls || '');
    main.appendChild(node);
    document.title = title;
    Figures.mountAll(main);
    window.scrollTo(0, 0);
    updateProgress();
    updateToTop();
  }

  function fail(id, err) {
    show(el('div', 'page', '<div><div class="soon" style="margin-top:40px">' +
      '<h2>Страница не найдена</h2>' +
      '<p>Адрес <code>#' + esc(id) + '</code> не соответствует ни одному разделу.</p>' +
      '<p><a href="#home">На главную</a></p></div></div>'),
      'Не найдено — КиЛЭ ВС');
    if (err) console.warn(err);
  }

  function route() {
    var id = routeId();
    markNav(id);

    if (id === 'home') { show(viewHome(), MENU.title1 + ' ' + MENU.title2, 'is-home'); return; }
    if (id === 'lab' || id === 't3d-map') { location.replace('#home'); return; }

    var topic = findTopic(id);
    if (topic && topic.status !== 'ready') {
      show(viewSoon(topic), topic.title + ' — КиЛЭ ВС', 'is-doc');
      return;
    }
    /* Адрес темы (#t06, #t3d) — под этим кодом тема напечатана в методичке
       целиком. Своей страницы у темы нет, поэтому отправляем на первый экран.
       replace, а не присваивание: иначе кнопка «назад» упирается в редирект. */
    if (topic && topic.screens && topic.screens.length) {
      location.replace('#' + topic.screens[0].id);
      return;
    }

    clearMain();
    main.appendChild(el('div', 'loading', 'Загрузка…'));

    getJSON('content/' + id + '.json').then(function (data) {
      if (routeId() !== id) return;
      markNav(id);
      var t = topicOf(id);
      show(viewPage(data), data.title + ' — КиЛЭ ВС', isLab(t) ? 'is-lab' : 'is-doc', id);
    }).catch(function (e) {
      delete cache['content/' + id + '.json'];
      if (routeId() === id) fail(id, e);
    });
  }

  window.addEventListener('hashchange', route);

  getJSON('content/menu.json').then(function (m) {
    MENU = m;
    buildToc();
    route();
  }).catch(function (e) {
    main.innerHTML =
      '<div class="doc"><div class="doc-main"><div class="soon" style="margin-top:52px">' +
      '<h2>Не удалось загрузить оглавление</h2>' +
      '<p>Если вы открыли <code>index.html</code> прямо из папки, браузер блокирует чтение ' +
      'файлов <code>content/*.json</code>. Запустите локальный сервер ' +
      '(<code>python -m http.server</code>) или откройте опубликованную версию сайта.</p>' +
      '</div></div></div>';
    console.error(e);
  });

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
