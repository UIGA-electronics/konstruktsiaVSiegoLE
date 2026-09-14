/* ═══════════════════════════════════════════════════════════
   app.js — загрузка меню, хэш-роутер, отрисовка экранов.
   Каждый экран имеет постоянный адрес (#servo-booster и т.п.),
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
    var h = location.hash.replace(/^#/, '').trim();
    return h || 'home';
  }

  /* ── Оглавление (шторка) ───────────────────────────────── */

  function buildToc() {
    tocBody.textContent = '';
    MENU.parts.forEach(function (part) {
      tocBody.appendChild(el('div', 'toc-part', part.name));
      part.topics.forEach(function (t) {
        var a = el('a', 'toc-link' + (t.status === 'soon' ? ' is-soon' : ''));
        a.href = '#' + t.id;
        a.dataset.route = t.id;
        a.innerHTML = '<em>' + t.num + '</em><span>' + t.title + '</span>';
        tocBody.appendChild(a);
        if (t.screens) {
          t.screens.forEach(function (s) {
            var b = el('a', 'toc-sub');
            b.href = '#' + s.id;
            b.dataset.route = s.id;
            b.textContent = s.short || s.title;
            tocBody.appendChild(b);
          });
        }
      });
    });
  }

  function markToc(id) {
    var nodes = tocBody.querySelectorAll('[data-route]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('is-active', nodes[i].dataset.route === id);
    }
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
  tocBody.addEventListener('click', function (e) {
    if (e.target.closest('a')) openToc(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') openToc(false);
  });

  /* ── Прогресс чтения ───────────────────────────────────── */

  function updateProgress() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    var p = max > 40 ? Math.min(1, h.scrollTop / max) : 0;
    progress.style.width = (p * 100).toFixed(1) + '%';
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);

  /* ── Экран: главная ────────────────────────────────────── */

  function viewHome() {
    var wrap = el('div', 'wrap');

    var hero = el('div', 'hero');
    hero.innerHTML =
      '<span class="hero-kicker">Учебное пособие</span>' +
      '<h1>' + MENU.title + '</h1>' +
      '<p>' + MENU.lead + '</p>' +
      '<p class="hero-author">' + MENU.author + '</p>';
    wrap.appendChild(hero);

    var ready = null;
    MENU.parts.forEach(function (p) {
      p.topics.forEach(function (t) { if (t.status === 'ready') ready = t; });
    });

    if (ready) {
      var cta = el('a', 'hero-cta');
      cta.href = '#' + (ready.screens ? ready.screens[0].id : ready.id);
      cta.innerHTML =
        '<span class="hero-cta-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M5 12h14M13 6l6 6-6 6"/></svg></span>' +
        '<span class="hero-cta-text"><b>' + ready.readyLabel + '</b>' +
        '<span>' + ready.readyHint + '</span></span>' +
        '<span class="hero-cta-arrow"><svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M9 6l6 6-6 6"/></svg></span>';
      wrap.appendChild(cta);

      if (ready.screens) {
        var rs = el('div', 'ready-screens');
        var html = '<b>Разделы темы</b><ol>';
        ready.screens.forEach(function (s) {
          html += '<li><a href="#' + s.id + '">' + (s.short || s.title) + '</a></li>';
        });
        rs.innerHTML = html + '</ol>';
        wrap.appendChild(rs);
      }
    }

    MENU.parts.forEach(function (part) {
      var ph = el('div', 'part-head');
      ph.innerHTML = '<b>' + part.name + '</b><i></i>';
      wrap.appendChild(ph);

      var list = el('div', 'topic-list');
      part.topics.forEach(function (t) {
        var isReady = t.status === 'ready';
        var node = el(isReady ? 'a' : 'div', 'topic ' + (isReady ? 'is-ready' : 'is-soon'));
        if (isReady) node.href = '#' + (t.screens ? t.screens[0].id : t.id);
        else node.setAttribute('aria-disabled', 'true');
        node.innerHTML =
          '<span class="topic-num">' + t.num + '</span>' +
          '<span class="topic-body">' +
          '<span class="topic-title">' + t.title + '</span>' +
          '<span class="topic-sub">' + t.sub + '</span>' +
          '</span>' +
          '<span class="topic-flag">' + (isReady ? 'готово' : 'скоро') + '</span>';
        list.appendChild(node);
      });
      wrap.appendChild(list);
    });

    return wrap;
  }

  /* ── Экран: тема «скоро» ───────────────────────────────── */

  function findTopic(id) {
    var found = null;
    MENU.parts.forEach(function (p) {
      p.topics.forEach(function (t) { if (t.id === id) found = t; });
    });
    return found;
  }

  function viewSoon(t) {
    var wrap = el('div', 'wrap');
    var head = el('div', 'page-head');
    head.innerHTML =
      '<div class="crumb">Тема ' + t.num + '</div><h1>' + t.title + '</h1>' +
      '<p class="page-lead">' + t.sub + '</p>';
    wrap.appendChild(head);

    var soon = el('div', 'soon');
    var items = (t.sub || '').split(';').map(function (s) { return s.trim(); })
      .filter(Boolean).map(function (s) { return '<li>' + s + '</li>'; }).join('');
    soon.innerHTML =
      '<div class="soon-ic"><svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>' +
      '<h2>Раздел в работе</h2>' +
      '<p>Эта тема входит в карту курса, но пока не наполнена. ' +
      'Полностью готова тема «Сервоприводы» — она показывает, как будет выглядеть каждый раздел.</p>' +
      (items ? '<ul>' + items + '</ul>' : '');
    wrap.appendChild(soon);

    var pager = el('div', 'pager');
    pager.innerHTML =
      '<a href="#home"><span class="pager-ic"><svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M15 6l-6 6 6 6"/></svg></span><span class="pager-tx">' +
      '<small>Назад</small><b>Ко всем темам</b></span></a>';
    wrap.appendChild(pager);
    return wrap;
  }

  /* ── Экран: страница контента ──────────────────────────── */

  function viewPage(data) {
    var wrap = el('div', 'wrap');

    var head = el('div', 'page-head');
    head.innerHTML =
      '<div class="crumb">' + (data.crumb || '') + '</div>' +
      '<h1>' + data.title + '</h1>' +
      (data.lead ? '<p class="page-lead">' + Render.inline(data.lead) + '</p>' : '');
    wrap.appendChild(head);

    var art = el('article', 'article');
    Render.blocks(data.blocks || [], art);
    wrap.appendChild(art);

    var pager = el('div', 'pager');
    var html = '';
    if (data.prev) {
      html += '<a class="p-prev" href="#' + data.prev.id + '">' +
        '<span class="pager-ic"><svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M15 6l-6 6 6 6"/></svg></span>' +
        '<span class="pager-tx"><small>Назад</small><b>' + data.prev.title + '</b></span></a>';
    }
    if (data.next) {
      html += '<a class="p-next" href="#' + data.next.id + '">' +
        '<span class="pager-tx"><small>Дальше</small><b>' + data.next.title + '</b></span>' +
        '<span class="pager-ic"><svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M9 6l6 6-6 6"/></svg></span></a>';
    } else {
      html += '<a class="p-next" href="#home">' +
        '<span class="pager-tx"><small>Дальше</small><b>Ко всем темам</b></span>' +
        '<span class="pager-ic"><svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M9 6l6 6-6 6"/></svg></span></a>';
    }
    pager.innerHTML = html;
    wrap.appendChild(pager);

    return wrap;
  }

  /* ── Роутер ────────────────────────────────────────────── */

  function show(node, title) {
    main.textContent = '';
    main.appendChild(node);
    document.title = title;
    Figures.mountAll(main);
    Render.mountAll(main);
    window.scrollTo(0, 0);
    updateProgress();
  }

  function fail(id, err) {
    var wrap = el('div', 'wrap');
    wrap.innerHTML =
      '<div class="soon" style="margin-top:48px">' +
      '<div class="soon-ic"><svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg></div>' +
      '<h2>Страница не найдена</h2>' +
      '<p>Адрес <code>#' + id + '</code> не соответствует ни одному разделу.</p>' +
      '<p><a href="#home">Вернуться к оглавлению</a></p></div>';
    show(wrap, 'Не найдено — КиОЭ ЛА');
    if (err) console.warn(err);
  }

  function route() {
    var id = routeId();
    markToc(id);
    btnBack.hidden = (id === 'home');

    if (id === 'home') {
      show(viewHome(), MENU.title);
      return;
    }

    var topic = findTopic(id);
    if (topic && topic.status !== 'ready') {
      show(viewSoon(topic), topic.title + ' — КиОЭ ЛА');
      return;
    }

    main.textContent = '';
    main.appendChild(el('div', 'loading', 'Загрузка…'));

    getJSON('content/' + id + '.json').then(function (data) {
      if (routeId() !== id) return;
      show(viewPage(data), data.title + ' — КиОЭ ЛА');
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
      '<div class="wrap"><div class="soon" style="margin-top:48px">' +
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
