/* ═══════════════════════════════════════════════════════════
   exam.js — «Зачёт»: вход, тесты по главам методички, прохождение,
   кабинет преподавателя. Данные — Supabase (проект kile-tests),
   схема и права — tools/supabase/schema.sql (версия 2).

   В браузере только публичный ключ (publishable): что кому можно,
   решает база (RLS и функции exam_*). Правильных ответов у студента
   нет: тест выдаёт exam_start() без них, балл считает exam_submit().

   Адреса:
     #exam          — вход / список тестов
     #exam-<id>     — прохождение теста
     #exam-r<id>    — разбор попытки
     #exam-me       — мой профиль: данные, пароль, код с телефона
     #staff         — кабинет: тесты, открыть / закрыть
     #staff-t<id>   — вопросы и настройки теста
     #staff-l<id>   — кто проходит тест сейчас
     #staff-v[<id>] — ведомость: все тесты или один
     #staff-p       — люди: новые пароли, роли
   ═══════════════════════════════════════════════════════════ */
window.Exam = (function () {
  'use strict';

  const URL_ = 'https://dljcyiwbciiehriklvym.supabase.co';
  const KEY = 'sb_publishable_xNFQSu7gMTz6dn0MpFcQQA_1qtZXX6a';
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.min.js';
  const LIB_SRI = 'sha384-dl/4LkSyQ4uEucc48NM6VDZLAjLLq9yMzZ5JLXumBq7Ld33XBof73hseOqPhO89+';
  const TEMP = 'kile-auth-temp';            /* «чужой компьютер»: вход только до закрытия браузера */
  const LET = 'АБВГДЕ';
  const ROLE = { admin: 'разработчик', teacher: 'преподаватель', student: 'студент' };
  const HOW = { submit: 'сдал(а) сам(а)', timeout: 'вышло время', closed: 'тест закрыли' };
  const LEAD = 'Тесты по курсу «Конструкция и лётная эксплуатация воздушных судов» — по главам методички ' +
    'М.&nbsp;Н.&nbsp;Морозова, в том же порядке. Тест открывает преподаватель.';

  let sb = null, libP = null, me = null, show = null, gen = 0, menuP = null;

  const I = {
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>',
    cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5l10 6.5-10 6.5z"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5"/></svg>',
    users: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-4 3.6-5.8 6.5-5.8s5.7 1.8 6.5 5.8"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M17.5 14.6c2.2.6 3.6 2.3 4 5.4"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h1M4 12h1M4 18h1"/></svg>',
    table: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16"/><path d="M3 9.5h18M3 15h18M9 4v16"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
    out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/></svg>',
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V5M7 10l5-5 5 5M5 20h14"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    key: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/></svg>',
    live: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.5"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V5.5"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4h11l-1.5 4L16 12H5"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12"/><path d="M16 8V4H4v12h4"/></svg>'
  };

  /* ── Мелочи ────────────────────────────────────────────── */

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  /* полное экранирование — и для текста, и для атрибутов */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* разметка текста вопросов (жирный, курсив, код) — Render.inline сначала экранирует */
  function inl(s) { return Render.inline(s == null ? '' : String(s)); }
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    return b === 1 ? one : many;
  }
  function nw(n, one, few, many) { return n + ' ' + plural(n, one, few, many); }
  function pct(s, t) { return t ? Math.round(100 * s / t) : 0; }
  function dt(s) {
    return s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  }
  function hm(s) { return s ? new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''; }
  function ago(s) {
    if (!s) return 'не входил(а)';
    const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
    if (m < 2) return 'только что';
    if (m < 60) return nw(m, 'минуту', 'минуты', 'минут') + ' назад';
    const h = Math.round(m / 60);
    if (h < 24) return nw(h, 'час', 'часа', 'часов') + ' назад';
    const d = Math.round(h / 24);
    return d < 31 ? nw(d, 'день', 'дня', 'дней') + ' назад' : dt(s).slice(0, 10);
  }
  function mmss(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }
  function must(r) { if (r.error) throw r.error; return r.data; }
  function alive(my, node) { return my === gen && (!node || node.isConnected); }

  function errText(e) {
    const m = (e && (e.message || e.error_description || e.msg)) || String(e);
    const map = [
      [/Invalid login credentials/i, 'Неверная почта или пароль'],
      [/already registered|already been registered|already exists/i, 'Эта почта уже зарегистрирована — нажмите «У меня есть аккаунт»'],
      [/Password should be at least|password.*(short|length)/i, 'Пароль слишком короткий — нужно не меньше 8 знаков'],
      [/weak|pwned|leaked|known to be/i, 'Пароль слишком простой — придумайте другой'],
      [/should be different/i, 'Новый пароль совпадает со старым'],
      [/Unable to validate email|invalid format|valid email|email.*invalid/i, 'Проверьте адрес почты'],
      [/Invalid TOTP|invalid.*code|code.*(invalid|expired)/i, 'Неверный или устаревший код — введите новый из приложения'],
      [/rate limit|too many|over_request/i, 'Слишком много попыток подряд — подождите минуту'],
      [/Failed to fetch|NetworkError|Load failed|network error/i, 'Нет связи с сервером — проверьте интернет'],
      [/JWT|token is expired|Auth session missing|refresh token/i, 'Вход устарел — войдите заново'],
      [/permission denied|row-level security/i, 'Нет прав на это действие'],
      [/violates check constraint/i, 'Проверьте значения: что-то слишком длинное или вне допустимых пределов']
    ];
    for (const [re, t] of map) if (re.test(m)) return t;
    return m;
  }

  /* окно с вопросом вместо confirm/prompt/alert */
  function dialog(o) {
    return new Promise(resolve => {
      const d = el('dialog', 'ex-dlg' + (o.wide ? ' is-wide' : ''));
      d.setAttribute('aria-label', o.title);
      d.innerHTML = '<div class="ex-dlg-in"><h2>' + esc(o.title) + '</h2><div class="ex-dlg-body"></div><div class="ex-dlg-acts"></div></div>';
      const body = d.querySelector('.ex-dlg-body');
      if (o.html) body.innerHTML = o.html;
      if (o.node) body.appendChild(o.node);
      let input = null;
      if (o.input) {
        const lab = el('label', 'ex-field', '<span>' + esc(o.input.label) + '</span>');
        input = el('input');
        input.type = o.input.type || 'text';
        input.value = o.input.value || '';
        input.maxLength = o.input.max || 200;
        if (o.input.placeholder) input.placeholder = o.input.placeholder;
        lab.appendChild(input);
        body.appendChild(lab);
      }
      const acts = d.querySelector('.ex-dlg-acts');
      const list = o.actions || [{ label: 'Понятно', value: true, kind: 'primary' }];
      let done = false;
      function close(v) { if (done) return; done = true; d.close(); d.remove(); resolve(v); }
      list.forEach(a => {
        const b = el('button', 'ex-btn ' + (a.kind === 'primary' ? 'is-primary' : a.kind === 'danger' ? 'is-danger' : 'is-ghost'), esc(a.label));
        b.type = 'button';
        b.addEventListener('click', () => {
          if (a.value === true && input) {
            if (!input.value.trim()) { input.focus(); return; }
            close(input.value.trim());
          } else close(a.value);
        });
        acts.appendChild(b);
      });
      d.addEventListener('cancel', e => { e.preventDefault(); close(null); });
      d.addEventListener('click', e => { if (e.target === d) close(null); });
      d.addEventListener('keydown', e => {
        if (e.key === 'Enter' && input && document.activeElement === input) {
          e.preventDefault();
          const p = acts.querySelector('.is-primary, .is-danger');
          if (p) p.click();
        }
      });
      document.body.appendChild(d);
      d.showModal();
      setTimeout(() => {
        const f = input || acts.querySelector('.is-primary') || acts.querySelector('button');
        if (f) f.focus();
      }, 30);
    });
  }
  function ask(title, html, okLabel, danger) {
    return dialog({ title, html, actions: [{ label: 'Отмена', value: false }, { label: okLabel || 'Да', value: true, kind: danger ? 'danger' : 'primary' }] });
  }

  let toastBox = null;
  function toast(text, bad) {
    if (!toastBox || !toastBox.isConnected) {
      toastBox = el('div', 'ex-toasts');
      toastBox.setAttribute('role', 'status');
      toastBox.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastBox);
    }
    const t = el('div', 'ex-toast' + (bad ? ' is-bad' : ''), (bad ? I.info : I.check) + '<span>' + esc(text) + '</span>');
    toastBox.appendChild(t);
    setTimeout(() => t.classList.add('is-out'), bad ? 4200 : 2400);
    setTimeout(() => t.remove(), bad ? 4600 : 2800);
  }

  function busy(btn, on) { if (btn) { btn.disabled = on; btn.classList.toggle('is-busy', on); } }

  /* таймер, который сам останавливается, когда страница ушла */
  function every(ms, fn, node, evenHidden) {
    const id = setInterval(() => {
      if (!node.isConnected) { clearInterval(id); return; }
      if (document.hidden && !evenHidden) return;
      fn();
    }, ms);
    return id;
  }

  async function fetchAll(make) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const r = await make().range(from, from + 999);
      if (r.error) throw r.error;
      out.push(...r.data);
      if (r.data.length < 1000) return out;
    }
  }

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/csv;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  /* ячейка для Excel: формулы из имён студентов не выполняются */
  function csvCell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function csv(rows) { return '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n'); }
  function fileDate() { return new Date().toISOString().slice(0, 10); }

  function siteTitles() {
    if (!menuP) {
      menuP = fetch('content/menu.json').then(r => r.json()).then(m => {
        const o = {};
        m.parts.forEach(p => p.topics.forEach(t => {
          if (t.status === 'ready' && t.screens) t.screens.forEach(s => { o[s.id] = s.title; });
        }));
        return o;
      }).catch(() => ({}));
    }
    return menuP;
  }

  /* ── Библиотека и вход ─────────────────────────────────── */

  function tempMode() { try { return localStorage.getItem(TEMP) === '1'; } catch (e) { return false; } }
  function setTemp(on) { try { if (on) localStorage.setItem(TEMP, '1'); else localStorage.removeItem(TEMP); } catch (e) {} }
  const store = {
    getItem(k) { try { return (tempMode() ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } },
    setItem(k, v) { try { (tempMode() ? sessionStorage : localStorage).setItem(k, v); } catch (e) {} },
    removeItem(k) {
      try { sessionStorage.removeItem(k); } catch (e) {}
      try { localStorage.removeItem(k); } catch (e) {}
    }
  };

  function lib() {
    if (libP) return libP;
    libP = new Promise((ok, bad) => {
      const make = () => {
        sb = window.supabase.createClient(URL_, KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'kile-auth', storage: store }
        });
        return sb;
      };
      if (window.supabase && window.supabase.createClient) { ok(make()); return; }
      const s = document.createElement('script');
      s.src = LIB;
      s.integrity = LIB_SRI;
      s.crossOrigin = 'anonymous';
      s.onload = () => ok(make());
      s.onerror = () => { libP = null; s.remove(); bad(new Error('Не удалось загрузить модуль входа — проверьте интернет и обновите страницу')); };
      document.head.appendChild(s);
    });
    return libP;
  }

  async function loadMe() {
    const s = (await sb.auth.getSession()).data.session;
    if (!s) { me = null; return null; }
    const r = await sb.from('profiles').select('id,email,full_name,group_name,role').eq('id', s.user.id).maybeSingle();
    if (r.error) {
      if (/JWT|expired|session|token/i.test(r.error.message || '')) {
        await sb.auth.signOut({ scope: 'local' }).catch(() => {});
        me = null;
        return null;
      }
      throw r.error;
    }
    me = r.data || { id: s.user.id, email: s.user.email || '', full_name: '', group_name: '', role: 'student' };
    me.mfa = false;
    me.factors = [];
    return me;
  }
  async function needCode() {
    const d = must(await sb.auth.mfa.getAuthenticatorAssuranceLevel());
    return d.nextLevel === 'aal2' && d.currentLevel !== 'aal2';
  }
  async function loadMfa() {
    try {
      const d = must(await sb.auth.mfa.listFactors());
      me.factors = (d.totp || []).filter(f => f.status === 'verified');
      me.mfa = me.factors.length > 0;
    } catch (e) { me.factors = []; me.mfa = false; }
  }
  const isStaff = () => !!me && (me.role === 'admin' || me.role === 'teacher');
  const isAdmin = () => !!me && me.role === 'admin';

  async function signOut(scope) {
    try { await sb.auth.signOut({ scope: scope || 'local' }); } catch (e) {}
    setTemp(false);
    me = null;
    if (location.hash === '#exam') route('exam'); else location.hash = '#exam';
  }

  /* ── Каркас страниц ────────────────────────────────────── */

  function frame(o) {
    const page = el('div', 'doc ex' + (o.cls ? ' ' + o.cls : ''));
    const crumbs = (o.crumbs || []).map(c => '<li><a href="' + c[0] + '">' + esc(c[1]) + '</a></li>').join('');
    const band = el('div', 'doc-band ex-band');
    band.innerHTML = '<div class="doc-band-in"><header class="doc-head">' +
      '<ol class="crumbs"><li><a href="#home">Главная</a></li>' + crumbs + '</ol>' +
      (o.cap ? '<p class="dh-cap">' + o.cap + '</p>' : '') +
      '<h1>' + esc(o.title) + '</h1>' + (o.lead ? '<p class="lead">' + o.lead + '</p>' : '') + '</header></div>';
    page.appendChild(band);
    const body = el('div', 'page ex-page');
    const col = el('div', 'ex-col' + (o.wide ? ' is-wide' : ''));
    body.appendChild(col);
    page.appendChild(body);
    return { page, band, col, h1: band.querySelector('h1') };
  }

  function userBar(col, where) {
    if (!me) return;
    const bar = el('div', 'ex-userbar');
    bar.innerHTML =
      '<span class="ex-who">' + I.user + '<span><b>' + esc(me.full_name || me.email) + '</b>' +
      '<small>' + (me.group_name ? esc(me.group_name) + ' · ' : '') + ROLE[me.role] + '</small></span></span>' +
      '<span class="ex-userbar-acts">' +
      (isStaff() && where !== 'staff' ? '<a class="ex-btn is-primary" href="#staff">' + I.table + 'Кабинет преподавателя</a>' : '') +
      (where === 'staff' ? '<a class="ex-btn is-ghost" href="#exam">' + I.eye + 'Как видят студенты</a>' : '') +
      (where !== 'me' ? '<a class="ex-btn is-ghost" href="#exam-me">' + I.user + 'Мой профиль</a>' : '') +
      '<button class="ex-btn is-ghost" type="button" data-out>' + I.out + 'Выйти</button></span>';
    bar.querySelector('[data-out]').addEventListener('click', () => signOut());
    col.appendChild(bar);
  }

  function problem(text, href, label) {
    return el('div', 'ex-problem', I.info + '<div><b>' + esc(text) + '</b>' +
      (href ? '<a class="ex-btn is-ghost" href="' + href + '">' + I.left + esc(label) + '</a>' : '') + '</div>');
  }
  function sayIn(box, text, bad) {
    box.textContent = text || '';
    box.classList.toggle('is-bad', !!bad);
    box.classList.toggle('is-ok', !!text && !bad);
  }

  /* ── Вход и регистрация ────────────────────────────────── */

  function inputField(name, label, type, ph, ac, upOnly, max) {
    return '<label class="ex-field"' + (upOnly ? ' data-up hidden' : '') + '><span>' + label + '</span>' +
      '<input name="' + name + '" type="' + type + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') +
      ' autocomplete="' + ac + '" maxlength="' + (max || 120) + '"' +
      (type === 'email' ? ' inputmode="email" autocapitalize="off" spellcheck="false"' : '') + '></label>';
  }

  function viewWelcome(after) {
    const f = frame({ title: 'Зачёт', lead: LEAD });
    const grid = el('div', 'ex-welcome');
    const card = el('section', 'ex-panel ex-auth');
    card.innerHTML =
      '<div class="ex-seg" role="tablist" aria-label="Вход или регистрация">' +
        '<button type="button" role="tab" aria-selected="true" data-m="in">' + I.user + '<span>У меня есть аккаунт</span></button>' +
        '<button type="button" role="tab" aria-selected="false" data-m="up">' + I.plus + '<span>Я здесь впервые</span></button>' +
      '</div>' +
      '<form class="ex-form" novalidate>' +
        '<p class="ex-intro" data-in>Войдите почтой и паролем, которые указали при регистрации.</p>' +
        '<p class="ex-intro" data-up hidden>Регистрация — один раз. Потом входите той же почтой и паролем.</p>' +
        inputField('full_name', 'Фамилия и имя', 'text', 'Иванов Иван', 'name', true, 120) +
        inputField('group_name', 'Группа', 'text', 'П-XX-X', 'off', true, 40) +
        inputField('email', 'Почта', 'email', 'name@mail.ru', 'username', false, 160) +
        '<label class="ex-field"><span>Пароль</span><span class="ex-pw">' +
          '<input name="password" type="password" autocomplete="current-password" maxlength="72">' +
          '<button type="button" class="ex-eye" aria-label="Показать пароль" title="Показать пароль">' + I.eye + '</button></span></label>' +
        inputField('password2', 'Пароль ещё раз', 'password', '', 'new-password', true, 72) +
        '<p class="ex-hint" data-up hidden>Пароль — не короче 8 знаков. По почте он не восстанавливается: если забудете, преподаватель выдаст новый.</p>' +
        '<label class="ex-check"><input type="checkbox" name="temp"><span>Чужой компьютер — выйти, когда закрою браузер</span></label>' +
        '<p class="ex-msg" role="alert"></p>' +
        '<button class="ex-btn is-primary is-big is-wide" type="submit">Войти</button>' +
      '</form>';
    const how = el('section', 'ex-how');
    how.innerHTML = '<h2>Как это работает</h2><ol class="ex-steps">' +
      '<li><b>Зарегистрируйтесь один раз</b><span>Фамилия, имя, группа, почта и пароль — минута.</span></li>' +
      '<li><b>Дождитесь, когда тест откроют</b><span>Тесты идут по главам методички. Закрытый помечен замком — его откроет преподаватель.</span></li>' +
      '<li><b>Отвечайте и нажмите «Сдать»</b><span>Ответы сохраняются после каждого щелчка. Результат сразу увидит преподаватель.</span></li>' +
      '</ol><p class="ex-note">' + I.key + '<span>Забыли пароль? Подойдите к преподавателю — он выдаст новый за минуту.</span></p>';
    grid.appendChild(card);
    grid.appendChild(how);
    f.col.appendChild(grid);

    const form = card.querySelector('form');
    const msg = form.querySelector('.ex-msg');
    const btn = form.querySelector('[type=submit]');
    let mode = 'in';
    function setMode(m, focus) {
      mode = m;
      card.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.m === m)));
      form.querySelectorAll('[data-up]').forEach(x => { x.hidden = m !== 'up'; });
      form.querySelectorAll('[data-in]').forEach(x => { x.hidden = m !== 'in'; });
      form.password.autocomplete = m === 'up' ? 'new-password' : 'current-password';
      btn.textContent = m === 'up' ? 'Зарегистрироваться' : 'Войти';
      sayIn(msg, '');
      if (focus) (m === 'up' ? form.full_name : form.email).focus();
    }
    card.querySelector('.ex-seg').addEventListener('click', e => {
      const b = e.target.closest('[data-m]');
      if (b) setMode(b.dataset.m, true);
    });
    card.querySelector('.ex-eye').addEventListener('click', e => {
      const on = form.password.type === 'password';
      form.password.type = form.password2.type = on ? 'text' : 'password';
      e.currentTarget.classList.toggle('is-on', on);
      e.currentTarget.setAttribute('aria-label', on ? 'Скрыть пароль' : 'Показать пароль');
    });
    form.group_name.addEventListener('blur', () => { form.group_name.value = form.group_name.value.toUpperCase().replace(/\s+/g, ''); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = form.email.value.trim();
      const pw = form.password.value;
      const name = form.full_name.value.trim().replace(/\s+/g, ' ');
      const grp = form.group_name.value.toUpperCase().replace(/\s+/g, '');
      if (mode === 'up') {
        if (name.split(' ').length < 2) { sayIn(msg, 'Напишите фамилию и имя', true); form.full_name.focus(); return; }
        if (!grp) { sayIn(msg, 'Напишите группу — например, П-24-4', true); form.group_name.focus(); return; }
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) { sayIn(msg, 'Проверьте адрес почты', true); form.email.focus(); return; }
      if (!pw) { sayIn(msg, 'Введите пароль', true); form.password.focus(); return; }
      if (mode === 'up') {
        if (pw.length < 8) { sayIn(msg, 'Пароль — не короче 8 знаков', true); form.password.focus(); return; }
        if (pw !== form.password2.value) { sayIn(msg, 'Пароли не совпадают', true); form.password2.focus(); return; }
      }
      setTemp(form.temp.checked);
      busy(btn, true);
      sayIn(msg, '');
      try {
        const r = mode === 'up'
          ? await sb.auth.signUp({ email, password: pw, options: { data: { full_name: name, group_name: grp } } })
          : await sb.auth.signInWithPassword({ email, password: pw });
        if (r.error) throw r.error;
        if (mode === 'up' && !(r.data && r.data.session)) throw new Error('Регистрация принята, но войти не удалось — нажмите «У меня есть аккаунт»');
        if (mode === 'up') toast('Готово — вы зарегистрированы');
        route(after && after !== 'exam' ? after : 'exam');
      } catch (err) {
        busy(btn, false);
        sayIn(msg, errText(err), true);
      }
    });
    return f.page;
  }

  /* код с телефона при входе */
  function viewCode(after) {
    const f = frame({ title: 'Код с телефона', lead: 'Для вашего аккаунта включена защита входа. Откройте приложение-аутентификатор и введите шестизначный код «КиЛЭ ВС».' });
    const card = el('section', 'ex-panel ex-narrow');
    card.innerHTML =
      '<form class="ex-form">' +
        '<label class="ex-field"><span>Код из приложения</span>' +
        '<input name="code" class="ex-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"></label>' +
        '<p class="ex-msg" role="alert"></p>' +
        '<button class="ex-btn is-primary is-big is-wide" type="submit">Подтвердить</button>' +
        '<button class="ex-btn is-ghost is-wide" type="button" data-out>' + I.out + 'Выйти</button>' +
        '<p class="ex-hint">Потеряли телефон? Попросите разработчика сбросить защиту: кабинет → «Люди». ' +
        'Разработчик, потерявший телефон, сбрасывает её в панели Supabase.</p>' +
      '</form>';
    f.col.appendChild(card);
    const form = card.querySelector('form'), msg = form.querySelector('.ex-msg'), btn = form.querySelector('[type=submit]');
    setTimeout(() => form.code.focus(), 60);
    form.querySelector('[data-out]').addEventListener('click', () => signOut());
    form.code.addEventListener('input', () => {
      form.code.value = form.code.value.replace(/\D/g, '').slice(0, 6);
      if (form.code.value.length === 6) form.requestSubmit();
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (form.code.value.length !== 6) { sayIn(msg, 'Нужно 6 цифр', true); return; }
      busy(btn, true);
      try {
        const fac = (must(await sb.auth.mfa.listFactors()).totp || []).filter(x => x.status === 'verified')[0];
        if (!fac) throw new Error('Защита не найдена — войдите заново');
        must(await sb.auth.mfa.challengeAndVerify({ factorId: fac.id, code: form.code.value }));
        route(after || 'exam');
      } catch (err) {
        busy(btn, false);
        form.code.value = '';
        form.code.focus();
        sayIn(msg, errText(err), true);
      }
    });
    return f.page;
  }

  /* ── Студент: тесты ────────────────────────────────────── */

  function viewHome() {
    const my = gen;
    const f = frame({ title: 'Зачёт', lead: LEAD });
    userBar(f.col, 'home');
    if (isStaff()) {
      f.col.appendChild(el('div', 'ex-callout is-staff', I.info + '<div><b>Вы видите страницу так, как её видят студенты.</b> ' +
        'Тесты открываются и закрываются в кабинете преподавателя. Ваши пробные попытки в ведомость не попадают.</div>'));
    }
    const head = el('div', 'ex-listhead', '<h2>Тесты</h2><span class="ex-upd"></span>' +
      '<button class="ex-btn is-ghost is-small" type="button" data-ref>' + I.refresh + 'Обновить</button>');
    const list = el('div', 'ex-tests', '<p class="ex-loading">Загружаю тесты…</p>');
    f.col.appendChild(head);
    f.col.appendChild(list);
    f.col.appendChild(el('p', 'ex-hint ex-center', 'Список обновляется сам раз в полминуты — когда преподаватель откроет тест, кнопка «Начать» появится без перезагрузки.'));
    async function load() {
      try {
        const tests = must(await sb.rpc('exam_my_tests'));
        if (!alive(my, list)) return;
        list.textContent = '';
        if (!tests.length) list.appendChild(el('div', 'ex-empty', '<b>Тестов пока нет.</b><span>Преподаватель ещё не добавил тесты.</span>'));
        tests.forEach((t, i) => list.appendChild(testCard(t, i + 1)));
        head.querySelector('.ex-upd').textContent = 'обновлено в ' + hm(new Date());
      } catch (e) {
        if (!alive(my, list)) return;
        list.textContent = '';
        list.appendChild(problem(errText(e)));
      }
    }
    head.querySelector('[data-ref]').addEventListener('click', load);
    load();
    every(30000, load, list);
    return f.page;
  }

  function testCard(t, n) {
    const best = t.best, going = t.going;
    const left = t.allowed == null ? null : Math.max(0, t.allowed - t.used);
    const passed = best && best.percent >= t.pass_percent;
    let cls, icon, state;
    const acts = [];
    if (going) {
      cls = 'is-going'; icon = I.clock;
      state = 'Начат: отвечено ' + going.answered + ' из ' + going.total + (going.deadline ? ' · сдать до ' + hm(going.deadline) : '');
      acts.push(['Продолжить', '#exam-' + t.id, 'primary']);
    } else if (!t.is_open) {
      cls = 'is-locked'; icon = I.lock;
      state = best ? 'Сдан: ' + best.score + ' из ' + best.total + ' (' + best.percent + ' %) — ' + (passed ? 'зачтено' : 'не зачтено') + '. Тест закрыт'
                   : 'Закрыт — откроет преподаватель';
    } else if (best) {
      cls = passed ? 'is-pass' : 'is-fail'; icon = passed ? I.check : I.cross;
      state = 'Сдан: ' + best.score + ' из ' + best.total + ' (' + best.percent + ' %) — ' + (passed ? 'зачтено' : 'не зачтено');
      if (left !== 0) acts.push(['Пройти ещё раз', '#exam-' + t.id, 'ghost']);
    } else if (left === 0) {
      cls = 'is-locked'; icon = I.lock; state = 'Попытки закончились';
    } else {
      cls = 'is-open'; icon = I.play; state = 'Открыт — можно сдавать';
      acts.push(['Начать тест', '#exam-' + t.id, 'primary']);
    }
    if (best && t.show_answers && !going) acts.push(['Разбор ответов', '#exam-r' + best.attempt, 'ghost']);
    const meta = [
      t.topic,
      nw(t.n_questions, 'вопрос', 'вопроса', 'вопросов'),
      t.time_limit_min ? nw(t.time_limit_min, 'минута', 'минуты', 'минут') : 'время не ограничено',
      left == null ? 'попыток сколько угодно' : (t.used ? 'осталось попыток: ' + left : nw(left, 'попытка', 'попытки', 'попыток')),
      'зачёт от ' + t.pass_percent + ' %'
    ].filter(Boolean).map(esc).join(' · ');
    const card = el('article', 'ex-test ' + cls);
    card.innerHTML =
      '<div class="ex-num"><small>Тест</small><b>' + n + '</b></div>' +
      '<div class="ex-test-main"><h3>' + esc(t.title) + '</h3><p class="ex-meta">' + meta + '</p>' +
      (t.description ? '<p class="ex-desc">' + inl(t.description) + '</p>' : '') +
      '<p class="ex-state">' + icon + '<span>' + esc(state) + '</span></p></div>' +
      (acts.length ? '<div class="ex-test-acts">' + acts.map(a => '<a class="ex-btn is-' + a[2] + (a[2] === 'primary' ? ' is-big' : '') + '" href="' + a[1] + '">' +
        (a[2] === 'primary' ? I.play : '') + esc(a[0]) + '</a>').join('') + '</div>' : '');
    return card;
  }

  /* ── Прохождение ───────────────────────────────────────── */

  function viewTake(testId) {
    const my = gen;
    const f = frame({ title: 'Тест', crumbs: [['#exam', 'Зачёт']], cls: 'is-take' });
    const col = f.col;
    col.appendChild(el('p', 'ex-loading', 'Готовлю вопросы…'));
    (async () => {
      let d;
      try { d = must(await sb.rpc('exam_start', { p_test: testId })); }
      catch (e) {
        if (!alive(my, col)) return;
        col.textContent = '';
        col.appendChild(problem(errText(e), '#exam', 'К списку тестов'));
        return;
      }
      if (!alive(my, col)) return;
      runTest(f, d);
    })();
    return f.page;
  }

  function runTest(f, d) {
    const col = f.col;
    const qs = d.questions, N = qs.length;
    const key = 'kile-ans-' + d.attempt;
    f.h1.textContent = d.test.title;
    document.title = d.test.title + ' — Зачёт — КиЛЭ ВС';
    let local = {};
    try { local = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { local = {}; }
    const ans = {};
    qs.forEach(q => {
      const v = local[q.id] != null ? local[q.id] : d.answers[q.id];
      if (v != null && q.options.some(o => o.i === v)) ans[q.id] = v;
    });
    const answered = () => qs.filter(q => ans[q.id] != null).length;
    let cur = Math.max(0, qs.findIndex(q => ans[q.id] == null));
    if (answered() === N) cur = N;
    let dirty = Object.keys(local).length > 0, saving = false, fails = 0, saveTimer = null, finished = false, clockId = null;
    const ac = new AbortController();

    col.textContent = '';
    if (d.staff) col.appendChild(el('div', 'ex-callout is-staff', I.info + '<div>Пробная попытка сотрудника — в ведомость не попадает.</div>'));
    const bar = el('div', 'ex-takebar');
    bar.innerHTML = '<div class="ex-prog" aria-hidden="true"><i></i></div>' +
      '<div class="ex-takebar-row"><span class="ex-count"></span><span class="ex-save"></span><span class="ex-clock"></span></div>';
    const stage = el('div', 'ex-stage');
    const map = el('nav', 'ex-map');
    map.setAttribute('aria-label', 'Вопросы теста');
    col.appendChild(bar);
    col.appendChild(stage);
    col.appendChild(map);

    function keep() { try { localStorage.setItem(key, JSON.stringify(ans)); } catch (e) {} }
    function setSave(s) {
      const box = bar.querySelector('.ex-save');
      box.className = 'ex-save is-' + s;
      box.innerHTML = s === 'ok' ? I.check + 'Ответы сохранены'
        : s === 'saving' ? I.refresh + 'Сохраняю…'
        : s === 'fail' ? I.info + 'Нет связи — ответы на этом устройстве, отправлю позже' : '';
    }
    function drawBar() {
      const n = answered();
      bar.querySelector('.ex-prog i').style.width = (100 * n / N) + '%';
      bar.querySelector('.ex-count').innerHTML = 'Отвечено <b>' + n + '</b> из ' + N;
    }
    function drawMap() {
      map.innerHTML = qs.map((q, k) => '<button type="button" data-k="' + k + '" class="' + (ans[q.id] != null ? 'is-done' : '') + (k === cur ? ' is-cur' : '') +
        '" aria-label="Вопрос ' + (k + 1) + (ans[q.id] != null ? ', отвечен' : ', без ответа') + '">' + (k + 1) + '</button>').join('') +
        '<button type="button" data-k="' + N + '" class="ex-map-end' + (cur === N ? ' is-cur' : '') + '">' + I.flag + 'Сдать</button>';
    }
    function drawQ() {
      if (cur >= N) { drawFinish(); return; }
      const q = qs[cur];
      stage.innerHTML =
        '<div class="ex-q"><p class="ex-qn">Вопрос ' + (cur + 1) + ' из ' + N + '</p>' +
        '<h2 class="ex-qt">' + inl(q.q) + '</h2>' +
        '<div class="ex-opts" role="radiogroup" aria-label="Варианты ответа"></div>' +
        '<p class="ex-hint ex-keys">Можно нажимать клавиши 1–' + q.options.length + ' и стрелки ← →</p></div>' +
        '<div class="ex-qnav"><button class="ex-btn is-ghost is-big" type="button" data-prev' + (cur === 0 ? ' disabled' : '') + '>' + I.left + 'Назад</button>' +
        '<button class="ex-btn is-primary is-big" type="button" data-next>' + (cur === N - 1 ? 'К сдаче' : 'Дальше') + I.right + '</button></div>';
      const box = stage.querySelector('.ex-opts');
      q.options.forEach((o, k) => {
        const on = ans[q.id] === o.i;
        const b = el('button', 'ex-opt' + (on ? ' is-on' : ''), '<span class="ex-let">' + LET[k] + '</span><span class="ex-opt-t">' + inl(o.t) + '</span>');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(on));
        b.addEventListener('click', () => pick(o.i));
        box.appendChild(b);
      });
    }
    function drawFinish() {
      const missing = qs.map((q, k) => ans[q.id] == null ? k + 1 : 0).filter(Boolean);
      stage.innerHTML =
        '<div class="ex-q ex-finish"><p class="ex-qn">Проверка перед сдачей</p>' +
        '<h2 class="ex-qt">Отвечено ' + answered() + ' из ' + N + '</h2>' +
        (missing.length
          ? '<p>Без ответа: ' + missing.map(k => '<button type="button" class="ex-chip" data-k="' + (k - 1) + '">№' + k + '</button>').join(' ') + '</p>' +
            '<p class="ex-hint">Нажмите номер, чтобы вернуться к вопросу. Вопрос без ответа считается неверным.</p>'
          : '<p>Все вопросы отвечены. Можно ещё раз пройтись по ним — кнопки с номерами ниже.</p>') +
        '<p class="ex-warn">' + I.info + '<span>После сдачи ответы изменить нельзя.</span></p></div>' +
        '<div class="ex-qnav"><button class="ex-btn is-ghost is-big" type="button" data-prev>' + I.left + 'К вопросам</button>' +
        '<button class="ex-btn is-primary is-big" type="button" data-submit>' + I.flag + 'Сдать тест</button></div>';
    }
    function draw() { drawQ(); drawMap(); drawBar(); }
    function go(k) {
      cur = Math.max(0, Math.min(N, k));
      draw();
      const top = bar.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.5) bar.scrollIntoView({ block: 'start' });
    }
    function pick(i) {
      if (finished) return;
      const q = qs[cur];
      ans[q.id] = i;
      keep();
      dirty = true;
      drawQ();
      drawMap();
      drawBar();
      plan(250);
    }
    function plan(ms) { clearTimeout(saveTimer); saveTimer = setTimeout(save, ms); }
    async function save() {
      if (!dirty || saving || finished) return;
      saving = true;
      dirty = false;
      setSave('saving');
      try {
        const r = must(await sb.rpc('exam_save', { p_attempt: d.attempt, p_answers: ans }));
        fails = 0;
        if (r.finished) { endedByServer(r.how); return; }
        setSave('ok');
      } catch (e) {
        dirty = true;
        fails++;
        setSave('fail');
        plan(Math.min(15000, 2000 * fails));
      } finally {
        saving = false;
        if (dirty && !finished && !fails) plan(250);
      }
    }
    async function endedByServer(how) {
      if (finished) return;
      finished = true;
      clearInterval(clockId);
      clearTimeout(saveTimer);
      await dialog({ title: how === 'timeout' ? 'Время вышло' : 'Тест закрыт', html: how === 'timeout'
        ? 'Время на тест закончилось. Засчитаны ответы, которые успели сохраниться.'
        : 'Преподаватель закрыл тест. Засчитаны ответы, которые успели сохраниться.' });
      try {
        const res = must(await sb.rpc('exam_submit', { p_attempt: d.attempt, p_answers: ans }));
        try { localStorage.removeItem(key); } catch (e) {}
        if (col.isConnected) showResult(col, res, d);
      } catch (e) { if (col.isConnected) { col.textContent = ''; col.appendChild(problem(errText(e), '#exam', 'К списку тестов')); } }
    }
    async function submit(auto) {
      if (finished) return;
      if (!auto) {
        const n = answered();
        const ok = await ask('Сдать тест?', 'Отвечено <b>' + n + ' из ' + N + '</b>.' +
          (n < N ? ' Вопросы без ответа считаются неверными.' : '') + '<br>После сдачи изменить ответы нельзя.', 'Сдать тест');
        if (!ok || finished) return;
      }
      finished = true;
      clearTimeout(saveTimer);
      clearInterval(clockId);
      stage.innerHTML = '<p class="ex-loading">Отправляю ответы…</p>';
      try {
        const res = must(await sb.rpc('exam_submit', { p_attempt: d.attempt, p_answers: ans }));
        try { localStorage.removeItem(key); } catch (e) {}
        if (col.isConnected) showResult(col, res, d);
      } catch (e) {
        finished = false;
        toast(errText(e) + '. Ответы остались на этом устройстве — нажмите «Сдать тест» ещё раз.', true);
        cur = N;
        draw();
        if (d.deadline) startClock();
      }
    }
    function startClock() {
      const skew = Date.now() - new Date(d.now).getTime();
      const end = new Date(d.deadline).getTime() + skew;
      const box = bar.querySelector('.ex-clock');
      const tick = () => {
        if (!col.isConnected) { clearInterval(clockId); return; }
        const s = (end - Date.now()) / 1000;
        box.innerHTML = I.clock + 'Осталось <b>' + mmss(s) + '</b>';
        box.classList.toggle('is-low', s < 120);
        if (s <= 0 && !finished) { clearInterval(clockId); submit(true); }
      };
      tick();
      clearInterval(clockId);
      clockId = setInterval(tick, 1000);
    }

    stage.addEventListener('click', e => {
      if (e.target.closest('[data-prev]')) go(cur >= N ? N - 1 : cur - 1);
      else if (e.target.closest('[data-next]')) go(cur + 1);
      else if (e.target.closest('[data-submit]')) submit(false);
      else { const c = e.target.closest('[data-k]'); if (c) go(+c.dataset.k); }
    });
    map.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) go(+b.dataset.k); });
    document.addEventListener('keydown', e => {
      if (!col.isConnected) { ac.abort(); return; }
      if (finished || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); }
      else if (cur < N) {
        let k = '123456'.indexOf(e.key);
        if (k < 0 && e.key.length === 1) k = LET.indexOf(e.key.toUpperCase());
        const q = qs[cur];
        if (k >= 0 && k < q.options.length) { e.preventDefault(); pick(q.options[k].i); }
      }
    }, { signal: ac.signal });
    window.addEventListener('beforeunload', e => {
      if (!col.isConnected) { ac.abort(); return; }
      if (!finished && (dirty || saving)) { e.preventDefault(); e.returnValue = ''; }
    }, { signal: ac.signal });
    window.addEventListener('online', () => { if (col.isConnected && dirty) plan(100); }, { signal: ac.signal });

    draw();
    setSave(dirty ? 'saving' : 'ok');
    if (dirty) plan(100);
    if (d.deadline) startClock();
    else bar.querySelector('.ex-clock').innerHTML = I.clock + 'Время не ограничено';
  }

  function showResult(col, res, d) {
    col.textContent = '';
    const pass = res.pass;
    const head = res.how === 'timeout' ? 'Время вышло — засчитаны сохранённые ответы'
      : res.how === 'closed' ? 'Тест закрыт преподавателем — засчитаны сохранённые ответы' : 'Тест сдан';
    const box = el('section', 'ex-result ' + (pass ? 'is-pass' : 'is-fail'));
    box.innerHTML =
      '<p class="ex-result-k">' + esc(head) + '</p>' +
      '<div class="ex-score"><b>' + res.score + '</b><span>из ' + res.total + '</span></div>' +
      '<p class="ex-result-v">' + (pass ? I.check : I.cross) + '<span>' + res.percent + ' % — ' +
      (pass ? 'зачтено' : 'не зачтено (нужно ' + res.pass_percent + ' %)') + '</span></p>' +
      '<p class="ex-result-n">' + (d && d.staff ? 'Пробная попытка сотрудника — в ведомость не попадает.' : 'Результат сохранён — преподаватель его уже видит.') + '</p>' +
      '<div class="ex-acts"><a class="ex-btn is-on-acc is-big" href="#exam">' + I.list + 'К списку тестов</a></div>';
    col.appendChild(box);
    if (res.review) reviewList(col, res.review);
    else col.appendChild(el('div', 'ex-callout', I.info + '<div>Разбор с правильными ответами преподаватель откроет позже — тогда в списке тестов появится кнопка «Разбор ответов».</div>'));
    window.scrollTo(0, 0);
  }

  function reviewList(col, items) {
    const wrong = items.filter(it => it.chosen !== it.answer).length;
    const head = el('div', 'ex-listhead', '<h2>Разбор ответов</h2><span class="ex-upd">ошибок: ' + wrong + ' из ' + items.length + '</span>' +
      (wrong && wrong < items.length ? '<label class="ex-check is-inline"><input type="checkbox" data-only><span>только ошибки</span></label>' : ''));
    const box = el('div', 'ex-review');
    col.appendChild(head);
    col.appendChild(box);
    siteTitles().then(titles => {
      items.forEach((it, k) => {
        const right = it.chosen === it.answer;
        const card = el('article', 'ex-rq ' + (right ? 'is-right' : 'is-wrong'));
        const fig = /^[a-z0-9-]{2,60}$/.test(it.fig || '') ? it.fig : '';
        card.innerHTML =
          '<p class="ex-qn">' + (right ? I.check : I.cross) + '<span>Вопрос ' + (k + 1) + ' — ' + (right ? 'верно' : it.chosen == null ? 'нет ответа' : 'неверно') + '</span></p>' +
          '<h3 class="ex-qt">' + inl(it.q) + '</h3>' +
          '<ul class="ex-ropts">' + (it.options || []).map((o, i) =>
            '<li class="' + (i === it.answer ? 'is-right' : i === it.chosen ? 'is-wrong' : '') + '"><span class="ex-let">' + LET[i] + '</span><span>' + inl(o) + '</span>' +
            (i === it.answer ? '<em>верный ответ</em>' : i === it.chosen ? '<em>ваш ответ</em>' : '') + '</li>').join('') + '</ul>' +
          (it.why ? '<p class="ex-why">' + inl(it.why) + '</p>' : '') +
          (fig ? '<a class="ex-fig" href="#' + fig + '">' + I.book + 'Повторить: ' + esc(titles[fig] || 'раздел пособия') + '</a>' : '');
        box.appendChild(card);
      });
    });
    const only = head.querySelector('[data-only]');
    if (only) only.addEventListener('change', () => box.classList.toggle('is-only-wrong', only.checked));
  }

  function viewReview(attempt) {
    const my = gen;
    const f = frame({ title: 'Разбор ответов', crumbs: [['#exam', 'Зачёт']].concat(isStaff() ? [['#staff-v', 'Ведомость']] : []) });
    f.col.appendChild(el('p', 'ex-loading', 'Загружаю…'));
    (async () => {
      try {
        const r = must(await sb.rpc('exam_review', { p_attempt: attempt }));
        if (!alive(my, f.col)) return;
        f.col.textContent = '';
        f.h1.textContent = 'Разбор: ' + r.title;
        const st = r.student || {};
        const box = el('section', 'ex-result is-small ' + (r.pass ? 'is-pass' : 'is-fail'));
        box.innerHTML =
          (isStaff() && st.full_name ? '<p class="ex-result-k">' + esc(st.full_name) + (st.group_name ? ', ' + esc(st.group_name) : '') + '</p>' : '') +
          '<div class="ex-score"><b>' + r.score + '</b><span>из ' + r.total + '</span></div>' +
          '<p class="ex-result-v">' + r.percent + ' % — ' + (r.pass ? 'зачтено' : 'не зачтено') + ' · ' + dt(r.finished_at) +
          (r.how && HOW[r.how] ? ' · ' + HOW[r.how] : '') + '</p>' +
          '<div class="ex-acts"><a class="ex-btn is-on-acc" href="' + (isStaff() ? '#staff-v' + r.test : '#exam') + '">' + I.left + 'Назад</a></div>';
        f.col.appendChild(box);
        reviewList(f.col, r.review || []);
      } catch (e) {
        if (!alive(my, f.col)) return;
        f.col.textContent = '';
        f.col.appendChild(problem(errText(e), '#exam', 'К списку тестов'));
      }
    })();
    return f.page;
  }

  /* ── Мой профиль ───────────────────────────────────────── */

  function viewProfile() {
    const f = frame({ title: 'Мой профиль', crumbs: [['#exam', 'Зачёт']].concat(isStaff() ? [['#staff', 'Кабинет']] : []),
      lead: 'Имя и группа видны преподавателю в ведомости. Здесь же меняется пароль' + (isStaff() ? ' и включается защита входа кодом с телефона.' : '.') });
    userBar(f.col, 'me');
    const grid = el('div', 'ex-grid2');
    f.col.appendChild(grid);

    const data = el('section', 'ex-panel');
    data.innerHTML = '<h2>' + I.user + 'Мои данные</h2><form class="ex-form">' +
      inputField('full_name', 'Фамилия и имя', 'text', '', 'name', false, 120) +
      inputField('group_name', 'Группа', 'text', 'П-XX-X', 'off', false, 40) +
      '<p class="ex-field is-static"><span>Почта</span><b>' + esc(me.email) + '</b></p>' +
      '<p class="ex-msg" role="alert"></p><button class="ex-btn is-primary" type="submit">Сохранить</button></form>';
    const df = data.querySelector('form');
    df.full_name.value = me.full_name || '';
    df.group_name.value = me.group_name || '';
    df.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = df.querySelector('[type=submit]'), msg = df.querySelector('.ex-msg');
      const name = df.full_name.value.trim().replace(/\s+/g, ' '), grp = df.group_name.value.toUpperCase().replace(/\s+/g, '');
      if (name.split(' ').length < 2) { sayIn(msg, 'Напишите фамилию и имя', true); return; }
      busy(btn, true);
      try {
        const r = must(await sb.from('profiles').update({ full_name: name, group_name: grp }).eq('id', me.id).select('full_name,group_name').single());
        me.full_name = r.full_name;
        me.group_name = r.group_name;
        df.group_name.value = r.group_name;
        sayIn(msg, 'Сохранено');
        const who = f.col.querySelector('.ex-who b');
        if (who) who.textContent = me.full_name;
      } catch (err) { sayIn(msg, errText(err), true); }
      busy(btn, false);
    });
    grid.appendChild(data);

    const pw = el('section', 'ex-panel');
    pw.innerHTML = '<h2>' + I.key + 'Пароль</h2><form class="ex-form">' +
      inputField('p1', 'Новый пароль', 'password', '', 'new-password', false, 72) +
      inputField('p2', 'Новый пароль ещё раз', 'password', '', 'new-password', false, 72) +
      '<p class="ex-hint">Не короче 8 знаков. Если пароль выдал преподаватель — смените его здесь на свой.</p>' +
      '<p class="ex-msg" role="alert"></p><button class="ex-btn is-primary" type="submit">Сменить пароль</button></form>';
    const pf = pw.querySelector('form');
    pf.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = pf.querySelector('[type=submit]'), msg = pf.querySelector('.ex-msg');
      if (pf.p1.value.length < 8) { sayIn(msg, 'Пароль — не короче 8 знаков', true); return; }
      if (pf.p1.value !== pf.p2.value) { sayIn(msg, 'Пароли не совпадают', true); return; }
      busy(btn, true);
      try {
        must(await sb.auth.updateUser({ password: pf.p1.value }));
        pf.reset();
        sayIn(msg, 'Пароль изменён');
      } catch (err) { sayIn(msg, errText(err), true); }
      busy(btn, false);
    });
    grid.appendChild(pw);

    if (isStaff()) {
      const sec = el('section', 'ex-panel ex-span2');
      f.col.appendChild(sec);
      securityPanel(sec);
    }

    const out = el('section', 'ex-panel ex-span2 ex-quiet');
    out.innerHTML = '<h2>' + I.out + 'Выход</h2><p>Вошли на чужом компьютере и забыли выйти? Эта кнопка завершит вход везде — на всех компьютерах и телефонах.</p>' +
      '<button class="ex-btn is-danger" type="button">' + I.out + 'Выйти на всех устройствах</button>';
    out.querySelector('button').addEventListener('click', async () => {
      if (await ask('Выйти на всех устройствах?', 'Вход завершится на всех компьютерах и телефонах, включая этот. Потом войдите заново.', 'Выйти везде', true)) signOut('global');
    });
    f.col.appendChild(out);
    return f.page;
  }

  /* защита входа кодом с телефона */
  function securityPanel(sec) {
    sec.innerHTML = '<h2>' + I.shield + 'Защита входа кодом с телефона</h2><div class="ex-sec"><p class="ex-loading">Проверяю…</p></div>';
    const box = sec.querySelector('.ex-sec');
    (async () => {
      try {
        const all = must(await sb.auth.mfa.listFactors()).all || [];
        for (const x of all.filter(x => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: x.id }).catch(() => {});
        const ok = all.filter(x => x.status === 'verified' && x.factor_type === 'totp');
        me.factors = ok;
        me.mfa = ok.length > 0;
        if (ok.length) {
          box.innerHTML = '<p class="ex-ok">' + I.check + '<span><b>Защита включена.</b> Вход — по паролю и шестизначному коду из приложения на телефоне. ' +
            'Даже если пароль узнают, без телефона войти нельзя: без кода сервер не даёт прав преподавателя.</span></p>' +
            '<button class="ex-btn is-ghost" type="button" data-off>Отключить защиту</button>';
          box.querySelector('[data-off]').addEventListener('click', async () => {
            if (!(await ask('Отключить защиту?', 'Вход снова будет только по паролю. Это менее безопасно.', 'Отключить', true))) return;
            try {
              for (const x of ok) must(await sb.auth.mfa.unenroll({ factorId: x.id }));
              await sb.auth.refreshSession().catch(() => {});
              toast('Защита отключена');
              securityPanel(sec);
            } catch (e) { toast(errText(e), true); }
          });
          return;
        }
        box.innerHTML =
          '<p class="ex-warn">' + I.info + '<span><b>Защита не включена.</b> Сейчас в кабинет можно войти, зная только пароль.</span></p>' +
          '<ol class="ex-steps is-small"><li><b>Поставьте на телефон приложение</b><span>Google Authenticator, Яндекс Ключ или Microsoft Authenticator — бесплатно.</span></li>' +
          '<li><b>Нажмите «Включить» и наведите камеру телефона на QR-код</b><span>Приложение начнёт показывать коды «КиЛЭ ВС», они меняются каждые 30 секунд.</span></li>' +
          '<li><b>Введите код из приложения</b><span>Дальше при каждом входе сайт будет спрашивать такой код.</span></li></ol>' +
          '<button class="ex-btn is-primary is-big" type="button" data-on>' + I.shield + 'Включить защиту</button>';
        box.querySelector('[data-on]').addEventListener('click', e => enroll(box, sec, e.currentTarget));
      } catch (e) { box.textContent = ''; box.appendChild(problem(errText(e))); }
    })();
  }

  async function enroll(box, sec, btn) {
    busy(btn, true);
    try {
      const d = must(await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'КиЛЭ ВС ' + new Date().toISOString().slice(0, 16) }));
      box.innerHTML =
        '<div class="ex-qr"><img alt="QR-код для приложения-аутентификатора"><div>' +
        '<p><b>Наведите камеру телефона на код</b> в приложении-аутентификаторе (кнопка «+» → «Сканировать QR-код»).</p>' +
        '<p class="ex-hint">Нечем сканировать — введите ключ вручную: <code class="ex-secret"></code></p>' +
        '<p class="ex-warn">' + I.info + '<span>Никому не показывайте этот код и не фотографируйте его: по нему можно получать ваши коды. ' +
        'После подтверждения он исчезнет и больше нигде не хранится.</span></p></div></div>' +
        '<form class="ex-form ex-narrow"><label class="ex-field"><span>Код из приложения</span>' +
        '<input name="code" class="ex-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"></label>' +
        '<p class="ex-msg" role="alert"></p><button class="ex-btn is-primary is-big" type="submit">Подтвердить</button>' +
        '<button class="ex-btn is-ghost" type="button" data-cancel>Отмена</button></form>';
      box.querySelector('img').src = d.totp.qr_code;
      box.querySelector('.ex-secret').textContent = d.totp.secret;
      const form = box.querySelector('form'), msg = form.querySelector('.ex-msg');
      form.code.addEventListener('input', () => {
        form.code.value = form.code.value.replace(/\D/g, '').slice(0, 6);
        if (form.code.value.length === 6) form.requestSubmit();
      });
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        await sb.auth.mfa.unenroll({ factorId: d.id }).catch(() => {});
        securityPanel(sec);
      });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const b = form.querySelector('[type=submit]');
        busy(b, true);
        try {
          must(await sb.auth.mfa.challengeAndVerify({ factorId: d.id, code: form.code.value }));
          toast('Защита включена');
          securityPanel(sec);
        } catch (err) { busy(b, false); form.code.value = ''; sayIn(msg, errText(err), true); }
      });
      setTimeout(() => form.code.focus(), 60);
    } catch (e) { busy(btn, false); toast(errText(e), true); }
  }

  /* ── Кабинет: общий каркас ─────────────────────────────── */

  function staffFrame(tab, o) {
    const f = frame(Object.assign({ title: 'Кабинет преподавателя', crumbs: [['#exam', 'Зачёт']], cls: 'is-staff', wide: true }, o || {}));
    userBar(f.col, 'staff');
    if (!me.mfa) {
      const b = el('div', 'ex-callout is-warn', I.shield + '<div><b>Включите защиту входа кодом с телефона.</b> ' +
        'Сейчас в кабинет можно войти, зная только ваш пароль. Две минуты — и без вашего телефона не войдёт никто.</div>' +
        '<a class="ex-btn is-primary" href="#exam-me">Включить</a>');
      f.col.appendChild(b);
    }
    const tabs = [
      ['tests', '#staff', I.list, 'Тесты', 'открыть, закрыть, вопросы'],
      ['sheet', '#staff-v', I.table, 'Ведомость', 'оценки студентов'],
      ['people', '#staff-p', I.users, 'Люди', isAdmin() ? 'пароли и роли' : 'новые пароли'],
      ['me', '#exam-me', I.shield, 'Мой вход', 'пароль и код с телефона']
    ];
    const nav = el('nav', 'ex-tabs');
    nav.setAttribute('aria-label', 'Разделы кабинета');
    nav.innerHTML = tabs.map(t => '<a href="' + t[1] + '"' + (t[0] === tab ? ' aria-current="page" class="is-on"' : '') + '>' + t[2] +
      '<span><b>' + t[3] + '</b><small>' + t[4] + '</small></span></a>').join('');
    f.col.appendChild(nav);
    return f;
  }

  /* ── Кабинет: тесты ────────────────────────────────────── */

  function viewStaffTests() {
    const my = gen;
    const f = staffFrame('tests', { lead: 'Тест виден студентам, только когда он открыт. Включили переключатель — студенты начинают; выключили — начатые попытки засчитываются по сохранённым ответам.' });
    const list = el('div', 'ex-trows', '<p class="ex-loading">Загружаю тесты…</p>');
    const foot = el('div', 'ex-foot');
    foot.innerHTML = '<button class="ex-btn is-ghost" type="button" data-new>' + I.plus + 'Новый тест</button>' +
      '<span class="ex-hint">Тесты стоят в порядке глав методички. Порядок меняется в настройках теста.</span>';
    f.col.appendChild(list);
    f.col.appendChild(foot);
    let tests = [];
    async function load() {
      try {
        tests = must(await sb.rpc('exam_staff_overview'));
        if (!alive(my, list)) return;
        list.textContent = '';
        if (!tests.length) list.appendChild(el('div', 'ex-empty', '<b>Тестов пока нет.</b><span>Нажмите «Новый тест».</span>'));
        tests.forEach((t, i) => list.appendChild(staffRow(t, i + 1, load)));
      } catch (e) {
        if (!alive(my, list)) return;
        list.textContent = '';
        list.appendChild(problem(errText(e)));
      }
    }
    foot.querySelector('[data-new]').addEventListener('click', async () => {
      const title = await dialog({ title: 'Новый тест', input: { label: 'Название', placeholder: 'Например: Шасси', max: 200 },
        actions: [{ label: 'Отмена', value: null }, { label: 'Создать', value: true, kind: 'primary' }] });
      if (!title) return;
      try {
        const sort = tests.reduce((m, t) => Math.max(m, t.sort), 0) + 10;
        const r = must(await sb.from('tests').insert({ title, sort }).select('id').single());
        location.hash = '#staff-t' + r.id;
      } catch (e) { toast(errText(e), true); }
    });
    load();
    every(20000, load, list);
    return f.page;
  }

  function staffRow(t, n, reload) {
    const row = el('article', 'ex-trow' + (t.is_open ? ' is-open' : ''));
    const inAttempt = t.questions_per_attempt ? Math.min(t.questions_per_attempt, t.n_pool) : t.n_pool;
    const meta = [
      t.topic,
      t.n_pool ? nw(inAttempt, 'вопрос', 'вопроса', 'вопросов') + ' в попытке' + (inAttempt < t.n_pool ? ' из ' + t.n_pool : '') : 'вопросов нет',
      t.time_limit_min ? nw(t.time_limit_min, 'минута', 'минуты', 'минут') : 'без лимита времени',
      t.max_attempts ? nw(t.max_attempts, 'попытка', 'попытки', 'попыток') : 'попыток без ограничения',
      'зачёт от ' + t.pass_percent + ' %'
    ].filter(Boolean).map(esc).join(' · ');
    const stats = t.n_students
      ? 'Сдали: <b>' + nw(t.n_students, 'студент', 'студента', 'студентов') + '</b> · зачтено ' + t.n_passed + ' · средний балл ' + (t.avg_percent || 0) + ' %'
      : 'Пока никто не сдавал';
    row.innerHTML =
      '<div class="ex-num"><small>Тест</small><b>' + n + '</b></div>' +
      '<div class="ex-trow-main"><h3>' + esc(t.title) + '</h3><p class="ex-meta">' + meta + '</p><p class="ex-stats">' + stats + '</p></div>' +
      '<div class="ex-trow-side">' +
        '<label class="ex-switch"><input type="checkbox"' + (t.is_open ? ' checked' : '') + ' aria-label="Тест открыт для студентов"><i></i>' +
        '<span><b>' + (t.is_open ? 'Открыт' : 'Закрыт') + '</b><small>' + (t.is_open ? 'студенты сдают' : 'студенты не могут начать') + '</small></span></label>' +
        (t.n_going ? '<a class="ex-live" href="#staff-l' + t.id + '">' + I.live + 'Сейчас проходят: <b>' + t.n_going + '</b></a>' : '') +
      '</div>' +
      '<div class="ex-trow-acts">' +
        '<a class="ex-btn is-ghost" href="#staff-t' + t.id + '">' + I.edit + 'Вопросы и настройки</a>' +
        '<a class="ex-btn is-ghost" href="#staff-v' + t.id + '">' + I.table + 'Ведомость</a>' +
        '<a class="ex-btn is-ghost" href="#exam-' + t.id + '">' + I.play + 'Пройти самому</a>' +
        '<label class="ex-check is-inline"><input type="checkbox" data-rev' + (t.show_answers ? ' checked' : '') + '>' +
        '<span>Студенты видят разбор с ответами</span></label>' +
      '</div>';
    const sw = row.querySelector('.ex-switch input');
    sw.addEventListener('change', async () => {
      const open = sw.checked;
      if (open && !t.n_pool) { sw.checked = false; toast('В тесте нет вопросов — сначала добавьте их', true); return; }
      if (!open && t.n_going && !(await ask('Закрыть тест?', 'Сейчас его проходят: <b>' + t.n_going + '</b>. Их попытки сразу засчитаются по сохранённым ответам.', 'Закрыть тест', true))) {
        sw.checked = true;
        return;
      }
      sw.disabled = true;
      try {
        must(await sb.from('tests').update({ is_open: open }).eq('id', t.id));
        toast(open ? 'Тест открыт — студенты видят кнопку «Начать»' : 'Тест закрыт');
        reload();
      } catch (e) { sw.checked = !open; sw.disabled = false; toast(errText(e), true); }
    });
    const rev = row.querySelector('[data-rev]');
    rev.addEventListener('change', async () => {
      if (rev.checked && t.is_open && !(await ask('Открыть разбор сейчас?', 'Тест ещё открыт: сдавшие увидят правильные ответы и смогут подсказать остальным. Обычно разбор открывают после того, как сдали все.', 'Открыть разбор'))) {
        rev.checked = false;
        return;
      }
      try {
        must(await sb.from('tests').update({ show_answers: rev.checked }).eq('id', t.id));
        t.show_answers = rev.checked;
        toast(rev.checked ? 'Разбор открыт студентам' : 'Разбор скрыт');
      } catch (e) { rev.checked = !rev.checked; toast(errText(e), true); }
    });
    return row;
  }

  /* ── Кабинет: кто проходит сейчас ──────────────────────── */

  function viewLive(testId) {
    const my = gen;
    const f = staffFrame('tests', { title: 'Сейчас проходят', crumbs: [['#exam', 'Зачёт'], ['#staff', 'Кабинет']] });
    const head = el('div', 'ex-listhead', '<h2></h2><span class="ex-upd"></span>');
    const box = el('div', 'ex-table', '<p class="ex-loading">Загружаю…</p>');
    const foot = el('div', 'ex-foot');
    f.col.appendChild(head);
    f.col.appendChild(box);
    f.col.appendChild(foot);
    async function load() {
      try {
        const [tr, lr] = await Promise.all([
          sb.from('tests').select('id,title,is_open').eq('id', testId).single(),
          sb.rpc('exam_staff_live', { p_test: testId })
        ]);
        const test = must(tr);
        const rows = must(lr);
        if (!alive(my, box)) return;
        head.querySelector('h2').textContent = test.title;
        head.querySelector('.ex-upd').textContent = 'обновляется каждые 5 секунд · ' + hm(new Date());
        const students = rows.filter(r => r.role === 'student');
        box.innerHTML = students.length
          ? '<table><thead><tr><th>Студент</th><th>Группа</th><th>Отвечено</th><th>Осталось</th><th>Сохранено</th></tr></thead><tbody>' +
            students.map(r => '<tr><td>' + esc(r.full_name || r.email) + '</td><td>' + esc(r.group_name) + '</td>' +
              '<td><span class="ex-minibar"><i style="width:' + Math.round(100 * r.answered / Math.max(r.total, 1)) + '%"></i></span> ' + r.answered + ' из ' + r.total + '</td>' +
              '<td>' + (r.deadline ? mmss((new Date(r.deadline) - Date.now()) / 1000) : '—') + '</td><td>' + (r.saved_at ? ago(r.saved_at) : 'ещё не отвечал(а)') + '</td></tr>').join('') +
            '</tbody></table>'
          : '<div class="ex-empty"><b>Сейчас никто не проходит.</b><span>' + (test.is_open ? 'Тест открыт — студенты появятся здесь, как только начнут.' : 'Тест закрыт.') + '</span></div>';
        foot.innerHTML = test.is_open
          ? '<button class="ex-btn is-danger" type="button" data-close>' + I.lock + 'Закрыть тест и засчитать все попытки</button>' +
            '<span class="ex-hint">Начатые попытки засчитаются по сохранённым ответам.</span>'
          : '<a class="ex-btn is-ghost" href="#staff-v' + testId + '">' + I.table + 'Открыть ведомость</a>';
        const c = foot.querySelector('[data-close]');
        if (c) c.addEventListener('click', async () => {
          if (!(await ask('Закрыть тест?', 'Все начатые попытки засчитаются по сохранённым ответам. Новые начать будет нельзя.', 'Закрыть тест', true))) return;
          try { must(await sb.from('tests').update({ is_open: false }).eq('id', testId)); toast('Тест закрыт, попытки засчитаны'); load(); }
          catch (e) { toast(errText(e), true); }
        });
      } catch (e) {
        if (!alive(my, box)) return;
        box.textContent = '';
        box.appendChild(problem(errText(e), '#staff', 'К тестам'));
      }
    }
    load();
    every(5000, load, box);
    return f.page;
  }

  /* ── Кабинет: вопросы и настройки ──────────────────────── */

  function viewEditor(testId) {
    const my = gen;
    const f = staffFrame('tests', { title: 'Вопросы и настройки', crumbs: [['#exam', 'Зачёт'], ['#staff', 'Кабинет']] });
    const col = f.col;
    const wait = el('p', 'ex-loading', 'Загружаю тест…');
    col.appendChild(wait);
    (async () => {
      let t, qs, titles;
      try {
        const [tr, qr, ti] = await Promise.all([
          sb.from('tests').select('*').eq('id', testId).single(),
          fetchAll(() => sb.from('questions').select('*').eq('test_id', testId).order('ord').order('id')),
          siteTitles()
        ]);
        t = must(tr); qs = qr; titles = ti;
      } catch (e) {
        if (!alive(my, col)) return;
        wait.remove();
        col.appendChild(problem(errText(e), '#staff', 'К тестам'));
        return;
      }
      if (!alive(my, col)) return;
      wait.remove();
      f.h1.textContent = t.title;
      editorBody(f, t, qs, titles);
    })();
    return f.page;
  }

  function editorBody(f, t, qs, titles) {
    const col = f.col;
    const set = el('section', 'ex-panel');
    set.innerHTML = '<h2>' + I.edit + 'Настройки теста</h2><form class="ex-form ex-wideform">' +
      '<label class="ex-field"><span>Название</span><input name="title" maxlength="200" required></label>' +
      '<label class="ex-field"><span>Подзаголовок — глава, источник</span><input name="topic" maxlength="200" placeholder="Глава 3 · методичка М. Н. Морозова"></label>' +
      '<label class="ex-field"><span>Что сказать студентам перед тестом</span><textarea name="description" rows="2" maxlength="2000"></textarea></label>' +
      '<div class="ex-row">' +
        '<label class="ex-field"><span>Минут на тест</span><input name="time_limit_min" type="number" min="1" max="600" placeholder="без лимита"></label>' +
        '<label class="ex-field"><span>Попыток у студента</span><input name="max_attempts" type="number" min="1" max="50" placeholder="сколько угодно"></label>' +
        '<label class="ex-field"><span>Вопросов в попытке</span><input name="questions_per_attempt" type="number" min="1" max="500" placeholder="все"></label>' +
        '<label class="ex-field"><span>Зачёт — от, %</span><input name="pass_percent" type="number" min="1" max="100"></label>' +
        '<label class="ex-field"><span>Место в списке</span><input name="sort" type="number"></label>' +
      '</div>' +
      '<label class="ex-check"><input type="checkbox" name="shuffle"><span>Перемешивать вопросы и варианты — у соседей разный порядок</span></label>' +
      '<label class="ex-check"><input type="checkbox" name="show_answers"><span>Студенты видят разбор с правильными ответами после сдачи</span></label>' +
      '<p class="ex-hint">Если «вопросов в попытке» меньше, чем вопросов в тесте, каждому студенту достанется свой случайный набор.</p>' +
      '<p class="ex-msg" role="alert"></p>' +
      '<div class="ex-acts"><button class="ex-btn is-primary" type="submit">' + I.check + 'Сохранить настройки</button>' +
      '<button class="ex-btn is-ghost is-danger-text" type="button" data-del>' + I.trash + 'Удалить тест</button></div></form>';
    const sf = set.querySelector('form');
    ['title', 'topic', 'description', 'time_limit_min', 'max_attempts', 'questions_per_attempt', 'pass_percent', 'sort'].forEach(k => { sf[k].value = t[k] == null ? '' : t[k]; });
    sf.shuffle.checked = !!t.shuffle;
    sf.show_answers.checked = !!t.show_answers;
    sf.addEventListener('submit', async e => {
      e.preventDefault();
      const msg = sf.querySelector('.ex-msg'), btn = sf.querySelector('[type=submit]');
      const num = (v, lo, hi) => { const x = parseInt(v, 10); return isNaN(x) ? null : Math.max(lo, Math.min(hi, x)); };
      const patch = {
        title: sf.title.value.trim(), topic: sf.topic.value.trim(), description: sf.description.value.trim(),
        time_limit_min: num(sf.time_limit_min.value, 1, 600), max_attempts: num(sf.max_attempts.value, 1, 50),
        questions_per_attempt: num(sf.questions_per_attempt.value, 1, 500), pass_percent: num(sf.pass_percent.value, 1, 100) || 60,
        sort: num(sf.sort.value, -100000, 100000) || 0, shuffle: sf.shuffle.checked, show_answers: sf.show_answers.checked
      };
      if (!patch.title) { sayIn(msg, 'Нужно название', true); return; }
      busy(btn, true);
      try {
        must(await sb.from('tests').update(patch).eq('id', t.id));
        Object.assign(t, patch);
        f.h1.textContent = t.title;
        sayIn(msg, 'Сохранено');
      } catch (err) { sayIn(msg, errText(err), true); }
      busy(btn, false);
    });
    sf.querySelector('[data-del]').addEventListener('click', async () => {
      const typed = await dialog({ title: 'Удалить тест?', html: 'Удалятся тест «' + esc(t.title) + '», все его вопросы и <b>все результаты студентов</b>. Отменить нельзя.',
        input: { label: 'Чтобы подтвердить, напишите слово УДАЛИТЬ', max: 20 },
        actions: [{ label: 'Отмена', value: null }, { label: 'Удалить навсегда', value: true, kind: 'danger' }] });
      if (!typed) return;
      if (typed.toUpperCase() !== 'УДАЛИТЬ') { toast('Тест не удалён: слово не совпало', true); return; }
      try { must(await sb.from('tests').delete().eq('id', t.id)); toast('Тест удалён'); location.hash = '#staff'; }
      catch (e) { toast(errText(e), true); }
    });
    col.appendChild(set);

    /* вопросы */
    const qhead = el('div', 'ex-listhead', '<h2>Вопросы</h2><span class="ex-upd"></span>' +
      '<span class="ex-listhead-acts">' +
      '<button class="ex-btn is-ghost is-small" type="button" data-exp>' + I.download + 'Скачать тест файлом</button>' +
      '<label class="ex-btn is-ghost is-small">' + I.upload + 'Добавить из файла<input type="file" accept=".json,application/json" hidden data-imp></label>' +
      '</span>');
    const qlist = el('div', 'ex-qlist');
    const qfoot = el('div', 'ex-foot', '<button class="ex-btn is-primary" type="button" data-add>' + I.plus + 'Добавить вопрос</button>');
    const sticky = el('div', 'ex-sticky', '<span></span><button class="ex-btn is-primary" type="button">' + I.check + 'Сохранить всё</button>');
    sticky.hidden = true;
    col.appendChild(qhead);
    col.appendChild(el('p', 'ex-hint', 'Отметьте кружком верный вариант. Вариантов — от 2 до 6. Объяснение студент увидит в разборе, если разбор открыт.'));
    col.appendChild(qlist);
    col.appendChild(qfoot);
    col.appendChild(sticky);

    const eds = [];
    function count() { qhead.querySelector('.ex-upd').textContent = nw(eds.filter(x => x.q.id).length, 'вопрос', 'вопроса', 'вопросов') + ' в тесте'; }
    function dirtyCount() { return eds.filter(x => x.isDirty()).length; }
    function syncSticky() {
      const n = dirtyCount();
      sticky.hidden = !n;
      sticky.querySelector('span').textContent = 'Несохранённых вопросов: ' + n;
    }
    function renumber() { eds.forEach((x, k) => x.setNum(k + 1)); }
    function add(q, focus) {
      const ed = qEditor(q, t, titles, {
        onChange: syncSticky,
        onDelete: () => { eds.splice(eds.indexOf(ed), 1); ed.node.remove(); renumber(); count(); syncSticky(); },
        onMove: dir => move(ed, dir),
        onSaved: () => { count(); syncSticky(); }
      });
      eds.push(ed);
      qlist.appendChild(ed.node);
      renumber();
      if (focus) ed.focus();
    }
    async function move(ed, dir) {
      const i = eds.indexOf(ed), j = i + dir;
      if (j < 0 || j >= eds.length) return;
      eds.splice(i, 1);
      eds.splice(j, 0, ed);
      if (dir < 0) qlist.insertBefore(ed.node, eds[j + 1].node); else qlist.insertBefore(eds[j - 1].node, ed.node);
      renumber();
      const changes = [];
      eds.forEach((x, k) => {
        const ord = (k + 1) * 10;
        if (x.q.ord !== ord) { x.q.ord = ord; if (x.q.id) changes.push(sb.from('questions').update({ ord }).eq('id', x.q.id)); }
      });
      try { (await Promise.all(changes)).forEach(must); } catch (e) { toast(errText(e), true); }
      ed.node.scrollIntoView({ block: 'nearest' });
    }
    qs.forEach(q => add(q));
    count();
    qfoot.querySelector('[data-add]').addEventListener('click', () => {
      add({ test_id: t.id, ord: (eds.length + 1) * 10, q: '', options: ['', '', '', ''], answer: 0, why: '', fig: '' }, true);
      syncSticky();
    });
    sticky.querySelector('button').addEventListener('click', async () => {
      for (const x of eds.filter(x => x.isDirty())) { if (!(await x.save())) return; }
      toast('Все вопросы сохранены');
    });
    qhead.querySelector('[data-exp]').addEventListener('click', () => {
      const out = { format: 'kile-test', version: 1, test: {}, questions: [] };
      ['title', 'topic', 'description', 'time_limit_min', 'max_attempts', 'questions_per_attempt', 'pass_percent', 'shuffle', 'show_answers'].forEach(k => { out.test[k] = t[k]; });
      out.questions = eds.filter(x => x.q.id).map(x => ({ q: x.q.q, options: x.q.options, answer: x.q.answer, why: x.q.why, fig: x.q.fig }));
      download('тест-' + t.title.replace(/[^\wа-яё -]+/gi, '').slice(0, 60) + '-' + fileDate() + '.json', JSON.stringify(out, null, 2), 'application/json');
    });
    qhead.querySelector('[data-imp]').addEventListener('change', async e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        if (file.size > 3e6) throw new Error('Файл слишком большой');
        const data = JSON.parse(await file.text());
        const list = (Array.isArray(data) ? data : data.questions || []).map(x => ({
          q: String(x.q || '').trim().slice(0, 2000),
          options: (Array.isArray(x.options) ? x.options : []).map(o => String(o).trim().slice(0, 600)).filter(Boolean).slice(0, 6),
          answer: parseInt(x.answer, 10), why: String(x.why || '').trim().slice(0, 3000),
          fig: /^[a-z0-9-]{2,60}$/.test(x.fig || '') ? x.fig : ''
        })).filter(x => x.q && x.options.length >= 2 && x.answer >= 0 && x.answer < x.options.length);
        if (!list.length) throw new Error('В файле нет подходящих вопросов');
        if (!(await ask('Добавить вопросы?', 'В файле подходящих вопросов: <b>' + list.length + '</b>. Они добавятся в конец этого теста.', 'Добавить'))) return;
        const base = eds.length;
        const rows = list.map((x, k) => Object.assign({ test_id: t.id, ord: (base + k + 1) * 10 }, x));
        for (let i = 0; i < rows.length; i += 100) {
          const ins = must(await sb.from('questions').insert(rows.slice(i, i + 100)).select('*'));
          ins.forEach(q => add(q));
        }
        count();
        toast('Добавлено вопросов: ' + list.length);
      } catch (err) { toast(err instanceof SyntaxError ? 'Это не файл теста (JSON)' : errText(err), true); }
    });
    const ac = new AbortController();
    window.addEventListener('beforeunload', e => {
      if (!col.isConnected) { ac.abort(); return; }
      if (dirtyCount()) { e.preventDefault(); e.returnValue = ''; }
    }, { signal: ac.signal });
  }

  function qEditor(q, t, titles, cb) {
    const node = el('article', 'ex-qed');
    let snap = '';
    node.innerHTML =
      '<div class="ex-qed-head"><b class="ex-qed-n"></b>' +
      '<span class="ex-qed-state"></span>' +
      '<span class="ex-qed-tools">' +
      '<button class="ex-icon" type="button" data-up title="Выше" aria-label="Переместить выше">' + I.up + '</button>' +
      '<button class="ex-icon" type="button" data-down title="Ниже" aria-label="Переместить ниже">' + I.down + '</button>' +
      '<button class="ex-icon is-danger" type="button" data-del title="Удалить вопрос" aria-label="Удалить вопрос">' + I.trash + '</button></span></div>' +
      '<label class="ex-field"><span>Вопрос</span><textarea name="q" rows="2" maxlength="2000"></textarea></label>' +
      '<div class="ex-field"><span>Варианты ответа — кружком отметьте верный</span><div class="ex-optlist"></div>' +
      '<button class="ex-btn is-ghost is-small" type="button" data-addopt>' + I.plus + 'Вариант</button></div>' +
      '<label class="ex-field"><span>Объяснение для разбора</span><textarea name="why" rows="2" maxlength="3000"></textarea></label>' +
      '<label class="ex-field is-half"><span>Раздел пособия для повторения (необязательно)</span><select name="fig"><option value="">— нет —</option>' +
      Object.keys(titles).map(id => '<option value="' + esc(id) + '">' + esc(titles[id]) + '</option>').join('') + '</select></label>' +
      '<div class="ex-acts"><button class="ex-btn is-primary is-small" type="button" data-save>' + I.check + 'Сохранить вопрос</button><span class="ex-msg"></span></div>';
    const qa = node.querySelector('[name=q]'), why = node.querySelector('[name=why]'), fig = node.querySelector('[name=fig]');
    const optlist = node.querySelector('.ex-optlist'), msg = node.querySelector('.ex-msg');
    const name = 'ans-' + Math.random().toString(36).slice(2);
    qa.value = q.q || '';
    why.value = q.why || '';
    if (q.fig && !titles[q.fig]) fig.appendChild(new Option(q.fig, q.fig));
    fig.value = q.fig || '';
    function letters() {
      [...optlist.children].forEach((r, k) => { r.querySelector('.ex-let').textContent = LET[k]; });
      node.querySelector('[data-addopt]').hidden = optlist.children.length >= 6;
    }
    function optRow(text, on) {
      const r = el('div', 'ex-optrow');
      r.innerHTML = '<label class="ex-radio" title="Верный ответ"><input type="radio" name="' + name + '"' + (on ? ' checked' : '') + ' aria-label="Верный ответ"><i></i></label>' +
        '<span class="ex-let"></span><input type="text" maxlength="600" placeholder="Вариант ответа">' +
        '<button class="ex-icon" type="button" title="Убрать вариант" aria-label="Убрать вариант">' + I.cross + '</button>';
      r.querySelector('input[type=text]').value = text;
      r.querySelector('.ex-icon').addEventListener('click', () => {
        if (optlist.children.length <= 2) { toast('Нужно хотя бы 2 варианта', true); return; }
        const wasOn = r.querySelector('[type=radio]').checked;
        r.remove();
        if (wasOn) optlist.querySelector('[type=radio]').checked = true;
        letters();
        changed();
      });
      optlist.appendChild(r);
    }
    (q.options || []).forEach((o, k) => optRow(o, k === q.answer));
    letters();
    function value() {
      const rows = [...optlist.children];
      return { q: qa.value.trim(), options: rows.map(r => r.querySelector('[type=text]').value.trim()),
        answer: rows.findIndex(r => r.querySelector('[type=radio]').checked), why: why.value.trim(), fig: fig.value };
    }
    function isDirty() { return !q.id || JSON.stringify(value()) !== snap; }
    function state() {
      const s = node.querySelector('.ex-qed-state');
      const d = isDirty();
      node.classList.toggle('is-dirty', d);
      s.textContent = !q.id ? 'новый — не сохранён' : d ? 'есть изменения' : 'сохранено';
    }
    function changed() { state(); cb.onChange(); }
    function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(400, ta.scrollHeight + 2) + 'px'; }
    node.addEventListener('input', e => { if (e.target.tagName === 'TEXTAREA') autosize(e.target); changed(); });
    node.addEventListener('change', changed);
    node.querySelector('[data-addopt]').addEventListener('click', () => { optRow('', false); letters(); optlist.lastElementChild.querySelector('[type=text]').focus(); changed(); });
    node.querySelector('[data-up]').addEventListener('click', () => cb.onMove(-1));
    node.querySelector('[data-down]').addEventListener('click', () => cb.onMove(1));
    node.querySelector('[data-del]').addEventListener('click', async () => {
      if (q.id && !(await ask('Удалить вопрос?', '«' + esc(q.q.slice(0, 120)) + (q.q.length > 120 ? '…' : '') + '»<br>Уже сданные попытки сохранят свои баллы.', 'Удалить', true))) return;
      if (q.id) {
        try { must(await sb.from('questions').delete().eq('id', q.id)); } catch (e) { toast(errText(e), true); return; }
      }
      cb.onDelete();
    });
    function bad(text) { msg.textContent = text; msg.className = 'ex-msg is-bad'; return false; }
    async function save() {
      const v = value();
      const opts = v.options.filter(Boolean);
      if (!v.q) { qa.focus(); return bad('Напишите вопрос'); }
      if (opts.length !== v.options.length) return bad('Заполните или уберите пустые варианты');
      if (opts.length < 2) return bad('Нужно хотя бы 2 варианта');
      if (v.answer < 0) return bad('Отметьте верный вариант');
      const row = { test_id: t.id, ord: q.ord, q: v.q, options: v.options, answer: v.answer, why: v.why, fig: v.fig };
      const b = node.querySelector('[data-save]');
      busy(b, true);
      try {
        const r = must(await (q.id ? sb.from('questions').update(row).eq('id', q.id).select('*').single() : sb.from('questions').insert(row).select('*').single()));
        Object.assign(q, r);
        snap = JSON.stringify(value());
        msg.textContent = 'Сохранено';
        msg.className = 'ex-msg is-ok';
        state();
        cb.onSaved();
        busy(b, false);
        return true;
      } catch (e) {
        busy(b, false);
        return bad(errText(e));
      }
    }
    node.querySelector('[data-save]').addEventListener('click', save);
    snap = JSON.stringify(value());
    state();
    requestAnimationFrame(() => { autosize(qa); autosize(why); });
    return {
      node, q, save, isDirty,
      setNum(n) { node.querySelector('.ex-qed-n').textContent = '№ ' + n; },
      focus() { qa.focus(); node.scrollIntoView({ block: 'center' }); }
    };
  }

  /* ── Кабинет: ведомость ────────────────────────────────── */

  function viewSheet(testId) {
    const my = gen;
    const f = staffFrame('sheet', { title: 'Ведомость', crumbs: [['#exam', 'Зачёт'], ['#staff', 'Кабинет']],
      lead: 'Лучший результат каждого студента по каждому тесту. Щёлкните оценку — увидите все попытки, разбор и кнопку «ещё одна попытка».' });
    const col = f.col;
    const bar = el('div', 'ex-filters');
    const box = el('div', 'ex-table ex-sheet', '<p class="ex-loading">Загружаю результаты…</p>');
    col.appendChild(bar);
    col.appendChild(box);
    let tests = [], people = [], atts = [], retakes = [];
    const st = { group: '', test: testId ? String(testId) : '', q: '' };
    try { st.group = sessionStorage.getItem('kile-sheet-group') || ''; } catch (e) {}

    async function load() {
      try {
        const [tr, pr, ar, rr] = await Promise.all([
          sb.from('tests').select('id,title,sort,pass_percent,max_attempts').order('sort').order('id'),
          fetchAll(() => sb.from('profiles').select('id,email,full_name,group_name,role').eq('role', 'student').order('group_name').order('full_name')),
          fetchAll(() => sb.from('attempts').select('id,test_id,user_id,started_at,finished_at,score,total,finished_how').order('started_at')),
          fetchAll(() => sb.from('retakes').select('test_id,user_id,extra'))
        ]);
        tests = must(tr); people = pr; atts = ar; retakes = rr;
        if (!alive(my, box)) return;
        if (!bar.childElementCount) filters();
        draw();
      } catch (e) {
        if (!alive(my, box)) return;
        box.textContent = '';
        box.appendChild(problem(errText(e)));
      }
    }
    function filters() {
      const groups = [...new Set(people.map(p => p.group_name).filter(Boolean))].sort();
      if (st.group && groups.indexOf(st.group) < 0) st.group = '';
      bar.innerHTML =
        '<label class="ex-field"><span>Группа</span><select data-f="group"><option value="">все группы</option>' +
          groups.map(g => '<option' + (g === st.group ? ' selected' : '') + '>' + esc(g) + '</option>').join('') + '</select></label>' +
        '<label class="ex-field"><span>Тест</span><select data-f="test"><option value="">все тесты</option>' +
          tests.map((t, i) => '<option value="' + t.id + '"' + (String(t.id) === st.test ? ' selected' : '') + '>Тест ' + (i + 1) + '. ' + esc(t.title) + '</option>').join('') + '</select></label>' +
        '<label class="ex-field"><span>Поиск</span><input type="search" data-f="q" placeholder="фамилия или почта"></label>' +
        '<span class="ex-filters-acts">' +
          '<button class="ex-btn is-ghost" type="button" data-csv>' + I.download + 'Ведомость для Excel</button>' +
          '<button class="ex-btn is-ghost" type="button" data-all>' + I.download + 'Все попытки</button>' +
          '<button class="ex-btn is-ghost is-small" type="button" data-ref aria-label="Обновить" title="Обновить">' + I.refresh + '</button></span>';
      bar.querySelector('[data-f=q]').value = st.q;
    }
    bar.addEventListener('input', e => {
      const k = e.target.dataset.f;
      if (!k) return;
      st[k] = e.target.value;
      if (k === 'group') { try { sessionStorage.setItem('kile-sheet-group', st.group); } catch (x) {} }
      draw();
    });
    bar.addEventListener('click', e => {
      if (e.target.closest('[data-ref]')) load();
      else if (e.target.closest('[data-csv]')) exportSheet();
      else if (e.target.closest('[data-all]')) exportAll();
    });
    function visiblePeople() {
      const q = st.q.trim().toLowerCase();
      return people.filter(p => (!st.group || p.group_name === st.group) && (!q || (p.full_name + ' ' + p.email).toLowerCase().indexOf(q) >= 0));
    }
    function visibleTests() { return st.test ? tests.filter(t => String(t.id) === st.test) : tests; }
    function cell(p, t) {
      const mine = atts.filter(a => a.user_id === p.id && a.test_id === t.id);
      const done = mine.filter(a => a.finished_at);
      const going = mine.some(a => !a.finished_at);
      const best = done.reduce((b, a) => !b || pct(a.score, a.total) > pct(b.score, b.total) ? a : b, null);
      const v = best ? pct(best.score, best.total) : null;
      return { mine, done, going, best, p: v, pass: best ? v >= t.pass_percent : false };
    }
    function draw() {
      const ps = visiblePeople(), ts = visibleTests();
      if (!people.length) { box.innerHTML = '<div class="ex-empty"><b>Студентов пока нет.</b><span>Они появятся здесь после регистрации на странице «Зачёт».</span></div>'; return; }
      if (!ps.length) { box.innerHTML = '<div class="ex-empty"><b>Никого не нашлось.</b><span>Измените группу или поиск.</span></div>'; return; }
      const num = t => tests.indexOf(t) + 1;
      const many = ts.length > 1;
      let html = '<table class="' + (many ? 'is-matrix' : 'is-one') + '"><thead><tr><th>Студент</th><th>Группа</th>' +
        ts.map(t => '<th class="ex-c" title="' + esc(t.title) + '">' + (many ? 'Т' + num(t) : 'Лучший результат') + '</th>').join('') +
        (many ? '<th class="ex-c">Зачтено</th>' : '<th class="ex-c">Попыток</th><th>Последняя сдача</th>') + '</tr></thead><tbody>';
      ps.forEach(p => {
        let passed = 0;
        const cells = ts.map(t => {
          const c = cell(p, t);
          if (c.pass) passed++;
          const label = c.best ? c.p + ' %' : c.going ? 'идёт' : '—';
          const cls = c.best ? (c.pass ? 'is-pass' : 'is-fail') : c.going ? 'is-going' : 'is-none';
          return '<td class="ex-c"><button type="button" class="ex-mark ' + cls + '" data-u="' + esc(p.id) + '" data-t="' + t.id + '" title="' +
            esc(c.best ? 'Лучший: ' + c.best.score + ' из ' + c.best.total + ', попыток: ' + c.done.length : c.going ? 'Сейчас проходит' : 'Не сдавал(а)') + '">' +
            (c.going && c.best ? '<i class="ex-dot"></i>' : '') + label + '</button>' + (many && c.done.length > 1 ? '<small>×' + c.done.length + '</small>' : '') + '</td>';
        }).join('');
        let tail;
        if (many) tail = '<td class="ex-c"><b>' + passed + '</b> из ' + ts.length + '</td>';
        else {
          const c = cell(p, ts[0]);
          const last = c.done[c.done.length - 1];
          tail = '<td class="ex-c">' + c.done.length + '</td><td>' + (last ? dt(last.finished_at) : '—') + '</td>';
        }
        html += '<tr><td><b>' + esc(p.full_name || p.email) + '</b></td><td>' + esc(p.group_name) + '</td>' + cells + tail + '</tr>';
      });
      html += '</tbody></table>';
      if (many) html += '<p class="ex-legend"><span class="ex-mark is-pass">85 %</span> зачтено <span class="ex-mark is-fail">40 %</span> не зачтено ' +
        '<span class="ex-mark is-going">идёт</span> проходит сейчас <span class="ex-mark is-none">—</span> не сдавал(а)<br>' +
        ts.map(t => 'Т' + num(t) + ' — ' + esc(t.title)).join(' · ') + '</p>';
      box.innerHTML = html;
    }
    box.addEventListener('click', e => {
      const b = e.target.closest('.ex-mark[data-u]');
      if (b) attemptsDialog(b.dataset.u, +b.dataset.t);
    });
    async function attemptsDialog(uid, tid) {
      const p = people.find(x => x.id === uid), t = tests.find(x => x.id === tid);
      if (!p || !t) return;
      const c = cell(p, t);
      const extra = (retakes.find(r => r.user_id === uid && r.test_id === tid) || {}).extra || 0;
      const node = el('div');
      node.innerHTML = (c.mine.length
        ? '<table class="ex-mini"><thead><tr><th>Начало</th><th>Результат</th><th>Как закончена</th><th></th></tr></thead><tbody>' +
          c.mine.slice().reverse().map(a => '<tr><td>' + dt(a.started_at) + '</td><td>' +
            (a.finished_at ? '<b class="' + (pct(a.score, a.total) >= t.pass_percent ? 'ex-ok-t' : 'ex-bad-t') + '">' + a.score + ' из ' + a.total + '</b> (' + pct(a.score, a.total) + ' %)' : 'идёт сейчас') +
            '</td><td>' + (a.finished_at ? esc(HOW[a.finished_how] || '—') : '—') + '</td><td class="ex-mini-acts">' +
            (a.finished_at ? '<a class="ex-btn is-ghost is-small" href="#exam-r' + a.id + '">' + I.eye + 'Разбор</a>' : '') +
            '<button class="ex-btn is-ghost is-small is-danger-text" type="button" data-del="' + a.id + '">' + I.trash + 'Удалить</button></td></tr>').join('') + '</tbody></table>'
        : '<p>Попыток пока нет.</p>') +
        (t.max_attempts
          ? '<p class="ex-hint">Попыток по настройке теста: ' + t.max_attempts + (extra ? ', дополнительно выдано: ' + extra : '') + '. Использовано: ' + c.mine.length + '.</p>' +
            '<button class="ex-btn is-primary" type="button" data-more>' + I.plus + 'Дать ещё одну попытку</button>'
          : '<p class="ex-hint">У этого теста число попыток не ограничено.</p>');
      const pr = dialog({ title: (p.full_name || p.email) + ' — ' + t.title, node, wide: true, actions: [{ label: 'Закрыть', value: null, kind: 'primary' }] });
      node.addEventListener('click', async e => {
        const del = e.target.closest('[data-del]');
        if (del) {
          if (!(await ask('Удалить попытку?', 'Результат исчезнет из ведомости навсегда. Чтобы просто разрешить пересдачу, лучше нажмите «Дать ещё одну попытку».', 'Удалить', true))) return;
          try {
            must(await sb.from('attempts').delete().eq('id', +del.dataset.del));
            atts = atts.filter(a => a.id !== +del.dataset.del);
            del.closest('tr').remove();
            draw();
            toast('Попытка удалена');
          } catch (err) { toast(errText(err), true); }
        }
        const more = e.target.closest('[data-more]');
        if (more) {
          try {
            const n = must(await sb.rpc('exam_give_retake', { p_test: tid, p_user: uid }));
            const r = retakes.find(x => x.user_id === uid && x.test_id === tid);
            if (r) r.extra = n; else retakes.push({ test_id: tid, user_id: uid, extra: n });
            toast('Готово: ещё одна попытка выдана');
            more.disabled = true;
            more.textContent = 'Выдано (всего дополнительных: ' + n + ')';
          } catch (err) { toast(errText(err), true); }
        }
      });
      await pr;
    }
    function exportSheet() {
      const ps = visiblePeople(), ts = visibleTests();
      const rows = [['Студент', 'Группа', 'Почта'].concat(ts.map(t => 'Тест ' + (tests.indexOf(t) + 1) + '. ' + t.title + ', %')).concat(['Зачтено тестов'])];
      ps.forEach(p => {
        let passed = 0;
        const vals = ts.map(t => { const c = cell(p, t); if (c.pass) passed++; return c.best ? c.p : ''; });
        rows.push([p.full_name, p.group_name, p.email].concat(vals).concat([passed + ' из ' + ts.length]));
      });
      download('ведомость-' + (st.group || 'все') + '-' + fileDate() + '.csv', csv(rows));
    }
    function exportAll() {
      const ps = visiblePeople(), ids = new Set(ps.map(p => p.id)), ts = visibleTests(), tids = new Set(ts.map(t => t.id));
      const byId = {};
      people.forEach(p => { byId[p.id] = p; });
      const rows = [['Студент', 'Группа', 'Почта', 'Тест', 'Начало', 'Конец', 'Балл', 'Из', '%', 'Зачтено', 'Как закончена']];
      atts.filter(a => ids.has(a.user_id) && tids.has(a.test_id) && a.finished_at).forEach(a => {
        const p = byId[a.user_id], t = tests.find(x => x.id === a.test_id), v = pct(a.score, a.total);
        rows.push([p.full_name, p.group_name, p.email, t.title, dt(a.started_at), dt(a.finished_at), a.score, a.total, v, v >= t.pass_percent ? 'да' : 'нет', HOW[a.finished_how] || '']);
      });
      download('попытки-' + (st.group || 'все') + '-' + fileDate() + '.csv', csv(rows));
    }
    load();
    every(30000, load, box);
    return f.page;
  }

  /* ── Кабинет: люди ─────────────────────────────────────── */

  function viewPeople() {
    const my = gen;
    const f = staffFrame('people', { title: 'Люди', crumbs: [['#exam', 'Зачёт'], ['#staff', 'Кабинет']],
      lead: isAdmin()
        ? 'Как дать права: человек сам регистрируется на странице «Зачёт» → найдите его здесь → выберите роль. Убедитесь, что почта — его.'
        : 'Студент забыл пароль — нажмите «Новый пароль» и продиктуйте его. Роли меняют разработчики.' });
    const col = f.col;
    const bar = el('div', 'ex-filters');
    bar.innerHTML = '<label class="ex-field"><span>Поиск</span><input type="search" data-q placeholder="фамилия, почта или группа"></label>' +
      '<label class="ex-field"><span>Кто</span><select data-r><option value="">все</option><option value="student">студенты</option><option value="staff">преподаватели и разработчики</option></select></label>' +
      '<span class="ex-filters-acts"><span class="ex-upd"></span></span>';
    const box = el('div', 'ex-table', '<p class="ex-loading">Загружаю…</p>');
    col.appendChild(bar);
    col.appendChild(box);
    col.appendChild(el('p', 'ex-hint', 'Удалить аккаунт целиком можно только в панели Supabase: Authentication → Users. Вместе с аккаунтом удаляются его результаты.'));
    let people = [];
    async function load() {
      try {
        people = must(await sb.rpc('exam_people'));
        if (!alive(my, box)) return;
        draw();
      } catch (e) {
        if (!alive(my, box)) return;
        box.textContent = '';
        box.appendChild(problem(errText(e)));
      }
    }
    function draw() {
      const q = bar.querySelector('[data-q]').value.trim().toLowerCase(), r = bar.querySelector('[data-r]').value;
      const list = people.filter(p => (!q || (p.full_name + ' ' + p.email + ' ' + p.group_name).toLowerCase().indexOf(q) >= 0) &&
        (!r || (r === 'student' ? p.role === 'student' : p.role !== 'student')));
      bar.querySelector('.ex-upd').textContent = 'всего: ' + people.length + ', студентов: ' + people.filter(p => p.role === 'student').length;
      if (!list.length) { box.innerHTML = '<div class="ex-empty"><b>Никого не нашлось.</b></div>'; return; }
      box.innerHTML = '<table><thead><tr><th>Кто</th><th>Группа</th><th>Почта</th><th>Роль</th><th>Код с телефона</th><th>Входил(а)</th><th></th></tr></thead><tbody>' +
        list.map(p => {
          const self = p.id === me.id;
          const role = isAdmin() && !self
            ? '<select data-role="' + esc(p.id) + '" aria-label="Роль">' + ['student', 'teacher', 'admin'].map(x => '<option value="' + x + '"' + (x === p.role ? ' selected' : '') + '>' + ROLE[x] + '</option>').join('') + '</select>'
            : '<span class="ex-role is-' + p.role + '">' + ROLE[p.role] + (self ? ' (вы)' : '') + '</span>';
          const acts = (p.role === 'student' ? '<button class="ex-btn is-ghost is-small" type="button" data-pw="' + esc(p.id) + '">' + I.key + 'Новый пароль</button>' : '') +
            (isAdmin() && !self && p.role !== 'student' && p.mfa ? '<button class="ex-btn is-ghost is-small" type="button" data-mfa="' + esc(p.id) + '">' + I.shield + 'Сбросить код</button>' : '');
          return '<tr><td><b>' + esc(p.full_name || '—') + '</b></td><td>' + esc(p.group_name) + '</td><td>' + esc(p.email) + '</td><td>' + role + '</td>' +
            '<td>' + (p.role === 'student' ? '<span class="ex-dim">—</span>' : p.mfa ? '<span class="ex-ok-t">' + I.check + 'включена</span>' : '<span class="ex-bad-t">нет</span>') + '</td>' +
            '<td>' + ago(p.last_sign_in_at) + '</td><td class="ex-mini-acts">' + acts + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    bar.addEventListener('input', draw);
    box.addEventListener('change', async e => {
      const s = e.target.closest('[data-role]');
      if (!s) return;
      const p = people.find(x => x.id === s.dataset.role);
      const role = s.value;
      const warn = role === 'admin' ? 'Разработчик может всё, включая роли других. Давайте эту роль только тем, кто делает сайт.'
        : role === 'teacher' ? 'Преподаватель открывает и закрывает тесты, правит вопросы, видит ведомость и выдаёт студентам новые пароли.'
        : 'Человек станет студентом и потеряет доступ к кабинету.';
      if (!(await ask('Сделать «' + ROLE[role] + '»?', '<b>' + esc(p.full_name || p.email) + '</b> (' + esc(p.email) + ')<br>' + warn, 'Да, изменить роль', role === 'admin'))) { s.value = p.role; return; }
      try {
        must(await sb.rpc('exam_set_role', { p_user: p.id, p_role: role }));
        p.role = role;
        toast('Роль изменена: ' + ROLE[role]);
        draw();
      } catch (err) { s.value = p.role; toast(errText(err), true); }
    });
    box.addEventListener('click', async e => {
      const pw = e.target.closest('[data-pw]');
      if (pw) {
        const p = people.find(x => x.id === pw.dataset.pw);
        if (!(await ask('Новый пароль для студента?', '<b>' + esc(p.full_name || p.email) + '</b>, ' + esc(p.group_name || 'без группы') + '<br>Старый пароль перестанет работать, вход на всех устройствах завершится. ' +
          'Убедитесь, что перед вами именно этот студент.', 'Выдать новый пароль'))) return;
        try {
          const np = must(await sb.rpc('exam_reset_password', { p_user: p.id }));
          const node = el('div', 'ex-newpw');
          node.innerHTML = '<p>Продиктуйте студенту:</p><p class="ex-pwbig"><code></code><button class="ex-btn is-ghost is-small" type="button">' + I.copy + 'Копировать</button></p>' +
            '<p>Почта для входа: <b>' + esc(p.email) + '</b></p><p class="ex-hint">Пусть войдёт и сразу сменит пароль на свой: «Мой профиль» → «Пароль». Больше этот пароль нигде не показывается.</p>';
          node.querySelector('code').textContent = np;
          node.querySelector('button').addEventListener('click', () => { navigator.clipboard.writeText(np).then(() => toast('Скопировано'), () => {}); });
          await dialog({ title: 'Новый пароль', node, actions: [{ label: 'Готово', value: true, kind: 'primary' }] });
        } catch (err) { toast(errText(err), true); }
      }
      const mf = e.target.closest('[data-mfa]');
      if (mf) {
        const p = people.find(x => x.id === mf.dataset.mfa);
        if (!(await ask('Сбросить защиту входа?', '<b>' + esc(p.full_name || p.email) + '</b> сможет войти по одному паролю и включить защиту заново с новым телефоном. ' +
          'Делайте это, только если человек сам попросил — например, потерял телефон.', 'Сбросить', true))) return;
        try { must(await sb.rpc('exam_reset_mfa', { p_user: p.id })); toast('Защита сброшена'); load(); }
        catch (err) { toast(errText(err), true); }
      }
    });
    load();
    return f.page;
  }

  /* ── Роутер раздела ────────────────────────────────────── */

  async function route(id) {
    const my = ++gen;
    if (!show) return;
    show(el('div', 'loading', 'Загрузка…'), 'Зачёт — КиЛЭ ВС');
    const put = (node, title) => { if (my === gen) show(node, title + ' — Зачёт — КиЛЭ ВС'); };
    try {
      await lib();
      await loadMe();
      if (my !== gen) return;
      if (!me) { put(viewWelcome(id), 'Вход'); return; }
      if (await needCode()) { put(viewCode(id), 'Код с телефона'); return; }
      if (isStaff()) await loadMfa();
      if (my !== gen) return;
      let m;
      if (id === 'exam') put(viewHome(), 'Тесты');
      else if ((m = /^exam-(\d+)$/.exec(id))) put(viewTake(+m[1]), 'Тест');
      else if ((m = /^exam-r(\d+)$/.exec(id))) put(viewReview(+m[1]), 'Разбор');
      else if (id === 'exam-me') put(viewProfile(), 'Мой профиль');
      else if (/^staff/.test(id)) {
        if (!isStaff()) { location.replace('#exam'); return; }
        if (id === 'staff') put(viewStaffTests(), 'Кабинет преподавателя');
        else if ((m = /^staff-t(\d+)$/.exec(id))) put(viewEditor(+m[1]), 'Вопросы и настройки');
        else if ((m = /^staff-l(\d+)$/.exec(id))) put(viewLive(+m[1]), 'Сейчас проходят');
        else if ((m = /^staff-v(\d*)$/.exec(id))) put(viewSheet(m[1] ? +m[1] : null), 'Ведомость');
        else if (id === 'staff-p') put(viewPeople(), 'Люди');
        else location.replace('#staff');
      } else location.replace('#exam');
    } catch (e) {
      if (my !== gen) return;
      const f = frame({ title: 'Зачёт' });
      f.col.appendChild(problem(errText(e)));
      const again = el('button', 'ex-btn is-primary', I.refresh + 'Попробовать ещё раз');
      again.type = 'button';
      again.addEventListener('click', () => route(id));
      f.col.appendChild(again);
      put(f.page, 'Ошибка');
    }
  }

  function handles(id) { return /^(exam|staff)(-(me|r?\d+|[tlv]\d*|p))?$/.test(id); }

  return {
    handles,
    mount(id, showFn) { show = showFn; route(id); }
  };
})();
