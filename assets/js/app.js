/* ═══════════════════════════════════════════════════════════
   app.js — оглавление, хэш-роутер, отметки о прочитанном.
   Каждый экран имеет постоянный адрес (#fc-booster и т.п.),
   чтобы на него можно было сделать отдельный QR-код.

   Три вида страниц:
     главная        — титул, план DA 40 NG с перечнем систем, глава 6, курс;
     раздел главы   — колонка текста, слева указатель разделов и заголовков;
     раздел практикума — рабочее место: модель слева (не уходит при чтении),
                      текст и состав системы справа, мини-план — выбор системы.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var main = document.getElementById('main');
  var btnToc = document.getElementById('btn-toc');
  var drawer = document.getElementById('toc-drawer');
  var tocBody = document.getElementById('toc-body');
  var nav = document.getElementById('nav');
  var progress = document.getElementById('reading-progress').firstElementChild;

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
  var esc = function (s) { return Render.esc(s); };

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
    var cur = id === 'home' ? 'home' : isLab(t) ? 'lab' : t ? 'ch' : '';
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

  /* ── Прогресс чтения и «наверх» ────────────────────────── */

  function updateProgress() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    progress.style.width = ((max > 40 ? Math.min(1, h.scrollTop / max) : 0) * 100).toFixed(1) + '%';
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);

  var toTop = el('button', 'to-top', ICON.up);
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

  function head(data, extra) {
    var crumbs = String(data.crumb || '').split(' · ').filter(Boolean);
    var h = el('header', 'doc-head');
    h.innerHTML =
      '<p class="eyebrow">' + crumbs.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</p>' +
      '<h1>' + esc(data.title) + '</h1>' +
      (data.lead ? '<p class="lead">' + Render.inline(data.lead) + '</p>' : '');
    var cells = (extra || []).filter(function (c) { return c && c[1]; });
    if (data.source) cells.push(['Источник', Render.inline(data.source)]);
    if (cells.length) {
      var m = el('div', 'meta');
      if (cells.length === 2) m.style.gridTemplateColumns = 'auto 1fr';
      m.innerHTML = cells.map(function (c) { return '<div><span class="label">' + c[0] + '</span>' + c[1] + '</div>'; }).join('');
      h.appendChild(m);
    }
    return h;
  }

  function doneBar(data) {
    var bar = el('div', 'done-bar');
    var on = isRead(data.id);
    bar.innerHTML = '<p>Отметка хранится только в этом браузере.</p>';
    var btn = el('button', 'done-btn' + (on ? ' is-on' : ''), ICON.check + '<span>' + (on ? 'Раздел прочитан' : 'Отметить как прочитанный') + '</span>');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.addEventListener('click', function () {
      on = !on;
      setRead(data.id, on);
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.querySelector('span').textContent = on ? 'Раздел прочитан' : 'Отметить как прочитанный';
      refreshTocMarks();
      var r = document.querySelector('.rail a[data-screen="' + data.id + '"]');
      if (r) r.classList.toggle('is-read', on);
    });
    bar.appendChild(btn);
    return bar;
  }

  function pager(data) {
    var html = '';
    if (data.prev) {
      html += '<a class="p-prev" href="#' + data.prev.id + '"><span class="pager-ic">' + ICON.chevL + '</span>' +
        '<span class="pager-tx"><small>Назад</small><b>' + esc(data.prev.title) + '</b></span></a>';
    }
    html += data.next
      ? '<a class="p-next" href="#' + data.next.id + '"><span class="pager-tx"><small>Дальше</small><b>' + esc(data.next.title) + '</b></span>' +
        '<span class="pager-ic">' + ICON.chevR + '</span></a>'
      : '<a class="p-next" href="#home"><span class="pager-tx"><small>Дальше</small><b>На главную</b></span>' +
        '<span class="pager-ic">' + ICON.chevR + '</span></a>';
    return el('nav', 'pager', html);
  }

  /* ── Главная ───────────────────────────────────────────── */

  function entry(href, k, t, m) {
    return '<a class="entry" href="' + href + '"><span class="entry-k">' + k + '</span><span class="entry-t">' + t + '</span>' +
      '<span class="entry-m">' + m + '</span>' + ICON.arrowR + '</a>';
  }

  function viewHome() {
    var page = el('div', 'home');
    var ch = chapter(), lb = lab();

    var cover = el('section', 'cover');
    var entries = '';
    if (ch) {
      var done = readCount(ch), n = ch.screens.length;
      entries += entry('#' + (done && done < n ? firstUnread(ch) : ch.screens[0].id), 'Глава ' + esc(ch.num), esc(ch.title),
        n + ' разделов · ' + minutes(ch) + ' мин' + (done ? ' · прочитано ' + done + ' из ' + n : ''));
    }
    if (lb) entries += entry('#' + lb.screens[0].id, 'Практикум', 'DA 40 NG по системам', systems().length + ' систем в 3D · по AMM и AFM');
    var quiz = ch && ch.screens.filter(function (s) { return /quiz/.test(s.id); })[0];
    if (quiz) entries += entry('#' + quiz.id, 'Проверка', 'Тесты с разбором ответов', 'по главе 6 и по практикуму');
    cover.innerHTML =
      '<div class="cover-in">' +
      '<div class="cover-text">' +
      '<p class="eyebrow"><span>Учебное пособие</span><span>УИ ГА им. Б. П. Бугаева</span><span>2026</span></p>' +
      '<h1>' + esc(MENU.title1) + ' ' + esc(MENU.title2) + '</h1>' +
      '<p class="lead">' + esc(MENU.lead) + '</p>' +
      '</div>' +
      '<nav class="entries" aria-label="С чего начать"><span class="label">С чего начать</span>' + entries + '</nav>' +
      '</div>';
    page.appendChild(cover);

    /* Практикум: план самолёта с системами */
    if (lb) {
      var sec = el('section', 'sec');
      sec.id = 'lab';
      sec.innerHTML = '<header class="sec-h"><span class="sec-k">Практикум · DA 40 NG</span>' +
        '<h2>Системы самолёта на виде сверху</h2>' +
        '<p>Наведите на систему в перечне или на чертеже — она подсветится. Щелчок открывает раздел с 3D-моделью.</p></header>';
      planBox(sec, null, { dims: true, caption: '<span>Контуры и системы сняты с 3D-модели, нос — вверх. Размеры — по РЛЭ, разд. 1.</span>' +
        '<a class="go" href="#' + lb.screens[0].id + '">Самолёт целиком ' + ICON.arrowR + '</a>' });
      var specs = el('dl', 'specs');
      specs.innerHTML = [['Размах', '11,63', 'м'], ['Длина', '8,06', 'м'], ['Взлётная масса', '1 280', 'кг'],
        ['Мощность', '123,5', 'кВт'], ['V<sub>NE</sub>', '172', 'уз'], ['Топливо', '2 × 56,8', 'л']]
        .map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '<span>' + r[2] + '</span></dd></div>'; }).join('');
      sec.appendChild(specs);
      sec.appendChild(el('p', 'specs-src', 'DA 40 NG · данные РЛЭ, разд. 1 и 2'));
      page.appendChild(sec);
    }

    /* Глава 6 */
    if (ch) {
      var cs = el('section', 'sec');
      var d2 = readCount(ch);
      var rows = ch.screens.map(function (s, i) {
        return '<li><a href="#' + s.id + '"' + (isRead(s.id) ? ' class="is-read"' : '') + '>' +
          '<span class="no">' + esc(screenNo(s, i) || '—') + '</span>' +
          '<span class="t">' + esc(s.title) + '</span>' +
          '<span class="m">' + (s.min ? s.min + ' мин' : '') + '<span class="tick">' + ICON.check + '</span></span></a></li>';
      }).join('');
      cs.innerHTML = '<header class="sec-h"><span class="sec-k">Глава ' + esc(ch.num) + '</span><h2>' + esc(ch.title) + '</h2>' +
        '<p>' + ch.screens.length + ' разделов, ' + minutes(ch) + ' мин чтения' + (d2 ? '. Прочитано ' + d2 + ' из ' + ch.screens.length : '') + '.</p></header>' +
        (d2 && d2 < ch.screens.length ? '<div class="resume"><span>Вы остановились на разделе «' + esc(screenOf(firstUnread(ch)).title) + '»</span>' +
          '<a class="go" href="#' + firstUnread(ch) + '">Продолжить ' + ICON.arrowR + '</a></div>' : '') +
        '<ol class="rows">' + rows + '</ol>';
      page.appendChild(cs);
    }

    /* Курс целиком */
    var cc = el('section', 'sec');
    var parts = MENU.parts.filter(function (p) { return !p.topics.some(isLab); });
    cc.innerHTML = '<header class="sec-h"><span class="sec-k">Курс</span><h2>Содержание пособия</h2>' +
      '<p>Темы курса по учебному пособию. Готовые открываются, остальные — в работе.</p></header>' +
      '<div class="cols2">' + parts.map(function (p) {
        return '<div><div class="part-h label">' + esc(p.name) + '</div><ol class="rows">' + p.topics.map(function (t) {
          var ready = t.status === 'ready';
          var inner = '<span class="no">' + esc(t.num) + '</span><span class="t">' + esc(t.title) + '</span>' +
            '<span class="flag">' + (ready ? 'Открыть' : 'В работе') + '</span>';
          return '<li>' + (ready ? '<a href="#' + (t.screens ? t.screens[0].id : t.id) + '">' + inner + '</a>'
            : '<a href="#' + t.id + '" class="row is-soon">' + inner + '</a>') + '</li>';
        }).join('') + '</ol></div>';
      }).join('') + '</div>';
    page.appendChild(cc);
    return page;
  }

  /* ── Тема «скоро» ──────────────────────────────────────── */

  function viewSoon(t) {
    var wrap = el('div', 'doc');
    var mainCol = el('div', 'doc-main');
    mainCol.appendChild(head({ crumb: 'Тема ' + t.num, title: t.title, lead: '' }));
    var items = (t.sub || '').split(';').map(function (s) { return s.trim(); })
      .filter(Boolean).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var ch = chapter();
    mainCol.appendChild(el('div', 'soon',
      '<h2>Раздел в работе</h2>' +
      '<p>Тема входит в программу курса, но ещё не наполнена. Как будет выглядеть каждый раздел, показывает глава 6' +
      (ch ? ' «' + esc(ch.title) + '»' : '') + '.</p>' +
      (items ? '<ul>' + items + '</ul>' : '')));
    mainCol.appendChild(pager({ next: ch ? { id: ch.screens[0].id, title: 'Глава 6. ' + ch.title } : null, prev: { id: 'home', title: 'На главную' } }));
    wrap.appendChild(mainCol);
    return wrap;
  }

  /* ── Раздел главы (и тест практикума): текст и указатель ─ */

  function rail(topic, curId) {
    var r = el('div', 'rail');
    var lb = isLab(topic);
    var html = '<span class="label">' + (lb ? 'Практикум DA 40 NG' : 'Глава ' + esc(topic.num)) + '</span><ol>';
    topic.screens.forEach(function (s, i) {
      var no = lb ? (s.ata ? s.ata.split(',')[0] : '—') : (screenNo(s, i) || '—');
      html += '<li><a href="#' + s.id + '" data-screen="' + s.id + '" class="' + (s.id === curId ? 'is-cur' : '') + (isRead(s.id) ? ' is-read' : '') + '"' +
        (s.id === curId ? ' aria-current="page"' : '') + '><i>' + esc(no) + '</i><span>' +
        esc(lb ? s.title : (s.short || s.title).replace(/^[\d.]+\s*·\s*/, '')) + '</span></a></li>';
    });
    r.innerHTML = html + '</ol>';
    return r;
  }

  /* «На странице»: заголовки h2 раздела, текущий отмечается при прокрутке */
  function pageToc(r, art) {
    var hs = art.querySelectorAll('h2');
    if (hs.length < 2) return;
    var html = '<span class="label">На странице</span><ol class="toc-page">';
    hs.forEach(function (h, i) {
      h.id = h.id || 'h-' + (i + 1);
      html += '<li><a href="#' + routeId() + '" data-h="' + h.id + '">' + esc(h.textContent) + '</a></li>';
    });
    r.insertAdjacentHTML('beforeend', html + '</ol>');
    var links = r.querySelectorAll('[data-h]');
    links.forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var h = document.getElementById(a.dataset.h);
        if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    if (!window.IntersectionObserver) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle('is-here', a.dataset.h === en.target.id); });
      });
    }, { rootMargin: '-15% 0px -70% 0px' });
    hs.forEach(function (h) { io.observe(h); });
    offPage.push(function () { io.disconnect(); });
  }

  function viewDoc(data, topic) {
    var wrap = el('div', 'doc');
    var aside = el('aside', 'doc-rail');
    var r = topic ? rail(topic, data.id) : null;
    if (r) aside.appendChild(r);
    wrap.appendChild(aside);

    var col = el('div', 'doc-main');
    var s = screenOf(data.id);
    var idx = topic ? topic.screens.indexOf(s) : -1;
    col.appendChild(head(data, [
      ['Чтение', s && s.min ? s.min + ' мин' : ''],
      ['Раздел', idx >= 0 ? (idx + 1) + ' из ' + topic.screens.length : '']
    ]));
    var art = el('article', 'article');
    Render.blocks(data.blocks || [], art);
    col.appendChild(art);
    col.appendChild(doneBar(data));
    col.appendChild(pager(data));
    wrap.appendChild(col);
    if (r) pageToc(r, art);
    return wrap;
  }

  /* ── Раздел практикума: рабочее место ──────────────────── */

  function systemsPanel(cur) {
    var p = el('div', 'systems');
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'Системы DA 40 NG');
    var inn = el('div', 'systems-in');
    inn.innerHTML = '<div class="systems-h"><h2>Системы DA 40 NG</h2>' +
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
      ['ATA', s && s.ata ? esc(s.ata) : ''],
      ['Чтение', s && s.min ? s.min + ' мин' : '']
    ]));
    /* обзор: перечень систем с планом вместо состава */
    if (data.id === 'model-da40') {
      var sec = el('div', 'legend');
      sec.innerHTML = '<span class="label"><span>Системы самолёта</span><span>' + systems().length + '</span></span>';
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

  function show(node, title, cls) {
    clearMain();
    main.className = 'main' + (cls ? ' ' + cls : '');
    main.appendChild(node);
    document.title = title;
    Figures.mountAll(main);
    window.scrollTo(0, 0);
    updateProgress();
    updateToTop();
  }

  function fail(id, err) {
    show(el('div', 'doc', '<div class="doc-main"><div class="soon" style="margin-top:52px">' +
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
      show(viewSoon(topic), topic.title + ' — КиЛЭ ВС');
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
      show(viewPage(data), data.title + ' — КиЛЭ ВС', isLab(t) ? 'is-lab' : 'is-doc');
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
