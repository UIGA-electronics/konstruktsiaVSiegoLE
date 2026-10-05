/* ═══════════════════════════════════════════════════════════
   app.js — меню, хэш-роутер, отметки о прочитанном.
   Каждый экран имеет постоянный адрес (#fc-booster и т.п.),
   чтобы на него можно было сделать отдельный QR-код.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var main = document.getElementById('main');
  var btnBack = document.getElementById('btn-back');
  var btnToc = document.getElementById('btn-toc');
  var drawer = document.getElementById('toc-drawer');
  var tocBody = document.getElementById('toc-body');
  var progress = document.getElementById('reading-progress').firstElementChild;

  var MENU = null;
  var cache = {};

  var ICON = {
    arrowR: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    chevR:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    chevL:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    check:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>',
    clock:  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    book:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/></svg>',
    spark:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2 6.5L20.5 12 14 14l-2 6.5L10 14 3.5 12 10 9.5z"/></svg>',
    up:     '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>'
  };

  /* ── Утилиты ───────────────────────────────────────────── */

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
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

  /* Главная кнопка ведёт в ПЕРВУЮ готовую тему. Раньше побеждала последняя,
     и с появлением «Практикума» герой на главной стал звать в 3D-разбор
     вместо главы 6. */
  function readyTopic() {
    var found = null;
    MENU.parts.forEach(function (p) {
      p.topics.forEach(function (t) {
        if (t.status === 'ready' && !found) found = t;
      });
    });
    return found;
  }

  function findTopic(id) {
    var found = null;
    MENU.parts.forEach(function (p) {
      p.topics.forEach(function (t) { if (t.id === id) found = t; });
    });
    return found;
  }

  function readCount(topic) {
    if (!topic || !topic.screens) return 0;
    var s = readSet(), n = 0;
    topic.screens.forEach(function (x) { if (s[x.id]) n++; });
    return n;
  }

  /* ── Оглавление ────────────────────────────────────────── */

  function buildToc() {
    tocBody.textContent = '';
    MENU.parts.forEach(function (part) {
      tocBody.appendChild(el('div', 'toc-part', part.name));
      part.topics.forEach(function (t) {
        var a = el('a', 'toc-link' + (t.status === 'soon' ? ' is-soon' : ''));
        a.href = '#' + (t.status === 'ready' && t.screens ? t.screens[0].id : t.id);
        a.dataset.route = t.id;
        a.innerHTML = '<em>' + t.num + '</em><span>' + t.title + '</span>';
        tocBody.appendChild(a);
        if (t.screens) {
          t.screens.forEach(function (s) {
            var b = el('a', 'toc-sub');
            b.href = '#' + s.id;
            b.dataset.route = s.id;
            b.dataset.screen = s.id;
            b.innerHTML = '<i class="dot"></i><span>' + (s.short || s.title) + '</span>';
            tocBody.appendChild(b);
          });
        }
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

  function markToc(id) {
    tocBody.querySelectorAll('[data-route]').forEach(function (n) {
      n.classList.toggle('is-active', n.dataset.route === id);
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

  /* ── Прогресс чтения страницы ──────────────────────────── */

  function updateProgress() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    progress.style.width = ((max > 40 ? Math.min(1, h.scrollTop / max) : 0) * 100).toFixed(1) + '%';
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);

  /* «Наверх». Раздел 6.2 читается двенадцать минут, и с телефона возврат
     к оглавлению — это десятки свайпов. Кнопка появляется, только когда
     уходить наверх действительно далеко. */
  var toTop = el('button', 'to-top', ICON.up);
  toTop.type = 'button';
  toTop.setAttribute('aria-label', 'Вернуться к началу раздела');
  toTop.hidden = true;
  toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.body.appendChild(toTop);

  function updateToTop() {
    toTop.hidden = window.scrollY < 900;
  }
  window.addEventListener('scroll', updateToTop, { passive: true });

  /* ── Экран: главная ────────────────────────────────────── */

  function viewHome() {
    var page = el('div', 'home');
    var topic = readyTopic();
    var lab = null;
    MENU.parts.forEach(function (p) { p.topics.forEach(function (t) { if (t.num === '3D') lab = t; }); });

    /* Титул: слева заголовок, справа студийный снимок DA 40 NG с выносками,
       как на листе технического описания. Под ним — цифры из РЛЭ. */
    var hero = el('section', 'hero');
    var go = topic ? '#' + topic.screens[0].id : '#home';
    hero.innerHTML =
      '<div class="hero-in">' +
      '<div class="hero-text">' +
      '<div class="hero-kicker"><span>УИ ГА им. Б. П. Бугаева</span><span>учебное пособие</span><span>2026</span></div>' +
      '<h1>' + MENU.title1 + ' <em>' + MENU.title2 + '</em></h1>' +
      '<p class="hero-lead">' + MENU.lead + '</p>' +
      '<div class="hero-actions">' +
      (topic ? '<a class="btn btn-primary" href="' + go + '">' + topic.readyLabel + ICON.arrowR + '</a>' : '') +
      (lab ? '<a class="btn" href="#' + lab.screens[0].id + '">3D-практикум DA 40 NG</a>' : '') +
      '</div></div>' +
      '<figure class="hero-plane">' +
      '<img src="assets/img/da40-hero.webp" width="1600" height="617" alt="Самолёт DA 40 NG, студийный снимок 3D-модели">' +
      '<span class="callout is-r" style="--x:25.2%;--y:36%"><i></i><b>Двигатель E4-A</b><small>123,5 кВт · дизель</small></span>' +
      '<span class="callout" style="--x:40.7%;--y:24.4%"><i></i><b>Кабина</b><small>G1000 · 4 места</small></span>' +
      '<span class="callout" style="--x:65.5%;--y:22%"><i></i><b>Т-образное оперение</b><small>РВ — тяги, РН — тросы</small></span>' +
      '<span class="callout is-r" style="--x:94.1%;--y:34.4%"><i></i><b>Крыло</b><small>размах 11,63 м</small></span>' +
      '</figure></div>' +
      '<dl class="specs">' +
      [['Размах', '11,63', 'м'], ['Длина', '8,06', 'м'], ['Взлётная масса', '1 280', 'кг'],
       ['Мощность', '123,5', 'кВт'], ['V<sub>NE</sub>', '172', 'уз'], ['Топливо', '2 × 56,8', 'л']]
        .map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '<span>' + r[2] + '</span></dd></div>'; }).join('') +
      '</dl>' +
      '<p class="specs-src">DA 40 NG · данные РЛЭ, разд. 1 и 2</p>';
    page.appendChild(hero);

    var wrap = el('div', 'wrap');
    page.appendChild(wrap);

    if (topic) {
      var done = readCount(topic);
      var total = topic.screens.reduce(function (a, s) { return a + (s.min || 0); }, 0);
      var box = el('section', 'screens');
      var html = '<header class="sec-head"><span class="sec-no">Гл. ' + topic.num + '</span>' +
        '<h2>' + topic.title + '</h2>' +
        '<span class="sec-meta">' + done + ' / ' + topic.screens.length +
        (total ? ' · ' + total + ' мин' : '') + '</span></header>';
      if (done && done < topic.screens.length) {
        html += '<a class="resume" href="#' + firstUnread(topic) + '"><span>Продолжить с места остановки</span>' + ICON.arrowR + '</a>';
      }
      html += '<div class="screens-grid">';
      topic.screens.forEach(function (s, i) {
        html += '<a href="#' + s.id + '"' + (isRead(s.id) ? ' class="is-read"' : '') + '>' +
          '<span class="n">' + String(i + 1).padStart(2, '0') + '</span>' +
          '<span class="t">' + (s.short || s.title) + '</span>' +
          '<span class="mins">' + (s.min ? s.min + ' мин' : '') + '<span class="tick">' + ICON.check + '</span></span></a>';
      });
      box.innerHTML = html + '</div>';
      wrap.appendChild(box);
    }

    var toc = el('section', 'contents');
    var th = '<header class="sec-head"><span class="sec-no">Курс</span><h2>Содержание</h2>' +
      '<span class="sec-meta">14 тем · практикум</span></header>';
    MENU.parts.forEach(function (part) {
      th += '<div class="part-head">' + part.name + '</div><div class="topic-list">';
      part.topics.forEach(function (t) {
        var ready = t.status === 'ready';
        th += (ready ? '<a class="topic is-ready" href="#' + (t.screens ? t.screens[0].id : t.id) + '">'
          : '<div class="topic is-soon" aria-disabled="true">') +
          '<span class="topic-num">' + t.num + '</span>' +
          '<span class="topic-body"><span class="topic-title">' + t.title + '</span>' +
          '<span class="topic-sub">' + t.sub + '</span></span>' +
          '<span class="topic-flag">' + (ready ? 'готово' : 'в работе') + '</span>' +
          (ready ? '</a>' : '</div>');
      });
      th += '</div>';
    });
    toc.innerHTML = th;
    wrap.appendChild(toc);
    return page;
  }

  function firstUnread(topic) {
    var s = readSet(), id = topic.screens[0].id;
    for (var i = 0; i < topic.screens.length; i++) {
      if (!s[topic.screens[i].id]) return topic.screens[i].id;
    }
    return id;
  }

  /* ── Экран: тема «скоро» ───────────────────────────────── */

  function viewSoon(t) {
    var wrap = el('div', 'wrap');
    wrap.appendChild(el('div', 'page-head',
      '<div class="crumb"><i></i>Тема ' + t.num + '</div><h1>' + t.title + '</h1>' +
      '<p class="page-lead">' + t.sub + '</p>'));

    var items = (t.sub || '').split(';').map(function (s) { return s.trim(); })
      .filter(Boolean).map(function (s) { return '<li>' + s + '</li>'; }).join('');
    wrap.appendChild(el('div', 'soon',
      '<div class="soon-ic">' + ICON.clock + '</div>' +
      '<h2>Раздел в работе</h2>' +
      '<p>Тема входит в карту курса, но пока не наполнена. Полностью готова тема 6 ' +
      '«Системы управления полётом» — она показывает, как будет выглядеть каждый раздел.</p>' +
      (items ? '<ul>' + items + '</ul>' : '')));

    wrap.appendChild(el('div', 'pager',
      '<a href="#home"><span class="pager-ic">' + ICON.chevL + '</span>' +
      '<span class="pager-tx"><small>Назад</small><b>Ко всем темам</b></span></a>'));
    return wrap;
  }

  /* ── Экран: страница контента ──────────────────────────── */

  /* Тема, в которую входит экран (по списку экранов темы). */
  function topicOf(id) {
    var hit = null;
    MENU.parts.forEach(function (p) {
      p.topics.forEach(function (t) {
        (t.screens || []).forEach(function (s) { if (s.id === id) hit = t; });
      });
    });
    return hit;
  }

  function viewPage(data) {
    var wrap = el('div', 'wrap');

    wrap.appendChild(el('div', 'page-head',
      '<div class="crumb"><i></i>' + (data.crumb || '') + '</div>' +
      '<h1>' + data.title + '</h1>' +
      (data.lead ? '<p class="page-lead">' + Render.inline(data.lead) + '</p>' : '') +
      (data.source ? '<div class="page-src">' + Render.inline(data.source) + '</div>' : '')));

    /* 3D-практикум: разделы-системы одной строкой над моделью — другую систему
       выбирают одним касанием, не возвращаясь к оглавлению. Тот же список
       получает кнопка «Другая система» у модели (window.__pageNav). */
    var topic = topicOf(data.id);
    window.__pageNav = null;
    if (topic && topic.num === '3D') {
      window.__pageNav = topic.screens.map(function (s) {
        return { id: s.id, title: s.short || s.title, cur: s.id === data.id };
      });
      var nav = el('nav', 'sys-nav', window.__pageNav.map(function (n) {
        return '<a href="#' + n.id + '"' + (n.cur ? ' class="is-cur" aria-current="page"' : '') + '>' + Render.esc(n.title) + '</a>';
      }).join(''));
      nav.setAttribute('aria-label', 'Разделы практикума');
      wrap.appendChild(nav);
      /* текущий раздел — в поле зрения, если строка шире экрана */
      setTimeout(function () {
        var cur = nav.querySelector('.is-cur');
        if (cur) nav.scrollLeft = cur.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2;
      }, 0);
    }

    var art = el('article', 'article');
    Render.blocks(data.blocks || [], art);
    wrap.appendChild(art);

    /* Отметка «прочитано» */
    var bar = el('div', 'done-bar');
    var on = isRead(data.id);
    bar.innerHTML = '<p>Отмечайте разделы, чтобы не терять место при подготовке.</p>';
    var btn = el('button', 'done-btn' + (on ? ' is-on' : ''),
      ICON.check + '<span>' + (on ? 'Прочитано' : 'Отметить') + '</span>');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      on = !on;
      setRead(data.id, on);
      btn.classList.toggle('is-on', on);
      btn.querySelector('span').textContent = on ? 'Прочитано' : 'Отметить';
      refreshTocMarks();
    });
    bar.appendChild(btn);
    wrap.appendChild(bar);

    var html = '';
    if (data.prev) {
      html += '<a class="p-prev" href="#' + data.prev.id + '">' +
        '<span class="pager-ic">' + ICON.chevL + '</span>' +
        '<span class="pager-tx"><small>Назад</small><b>' + data.prev.title + '</b></span></a>';
    }
    html += data.next
      ? '<a class="p-next" href="#' + data.next.id + '">' +
        '<span class="pager-tx"><small>Дальше</small><b>' + data.next.title + '</b></span>' +
        '<span class="pager-ic">' + ICON.chevR + '</span></a>'
      : '<a class="p-next" href="#home">' +
        '<span class="pager-tx"><small>Дальше</small><b>Ко всем темам</b></span>' +
        '<span class="pager-ic">' + ICON.chevR + '</span></a>';
    wrap.appendChild(el('div', 'pager', html));

    return wrap;
  }

  /* ── Роутер ────────────────────────────────────────────── */

  /* Перед сменой раздела освобождаем схемы старого: 3D-сцена держит
     видеопамять, пока её не отпустить явно. */
  function clearMain() {
    Figures.unmountAll(main);
    main.textContent = '';
  }

  function show(node, title) {
    clearMain();
    main.appendChild(node);
    document.title = title;
    Figures.mountAll(main);
    window.scrollTo(0, 0);
    updateProgress();
    updateToTop();
  }

  function fail(id, err) {
    show(el('div', 'wrap',
      '<div class="soon" style="margin-top:52px">' +
      '<div class="soon-ic">' + ICON.clock + '</div>' +
      '<h2>Страница не найдена</h2>' +
      '<p>Адрес <code>#' + Render.esc(id) + '</code> не соответствует ни одному разделу.</p>' +
      '<p><a href="#home">Вернуться к оглавлению</a></p></div>'),
      'Не найдено — КиЛЭ ВС');
    if (err) console.warn(err);
  }

  function route() {
    var id = routeId();
    markToc(id);
    btnBack.hidden = (id === 'home');

    if (id === 'home') { show(viewHome(), MENU.title1 + ' ' + MENU.title2); return; }

    var topic = findTopic(id);
    if (topic && topic.status !== 'ready') {
      show(viewSoon(topic), topic.title + ' — КиЛЭ ВС');
      return;
    }
    /* Адрес темы (#t06, #t3d) — под этим кодом тема напечатана в методичке
       целиком. Своей страницы у темы нет, поэтому отправляем на первый
       экран. Без этого QR на всю главу вёл в «страница не найдена».
       replace, а не присваивание: иначе кнопка «назад» упирается в редирект. */
    if (topic && topic.screens && topic.screens.length) {
      location.replace('#' + topic.screens[0].id);
      return;
    }

    clearMain();
    main.appendChild(el('div', 'loading', 'Загрузка…'));

    getJSON('content/' + id + '.json').then(function (data) {
      if (routeId() !== id) return;
      markToc(id);
      show(viewPage(data), data.title + ' — КиЛЭ ВС');
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
      '<div class="wrap"><div class="soon" style="margin-top:52px">' +
      '<h2>Не удалось загрузить оглавление</h2>' +
      '<p>Если вы открыли <code>index.html</code> прямо из папки, браузер блокирует чтение ' +
      'файлов <code>content/*.json</code>. Запустите локальный сервер ' +
      '(<code>python -m http.server</code>) или откройте опубликованную версию сайта.</p>' +
      '</div></div>';
    console.error(e);
  });

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
