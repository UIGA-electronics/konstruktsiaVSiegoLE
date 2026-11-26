/* ═══════════════════════════════════════════════════════════
   exam.js — зачётные тесты: вход, открытые тесты, прохождение,
   кабинет преподавателя. Данные — в Supabase (проект kile-tests),
   схема и права — tools/supabase/schema.sql.

   Здесь только публичный ключ (publishable): он нужен любому
   посетителю и сам по себе ничего не открывает. Что кому можно,
   решает база (RLS и функции start_test / submit_test / set_role).
   Правильных ответов в браузере студента нет: их отдаёт сервер
   только после сдачи и только если преподаватель включил разбор.

   Адреса:  #exam        — вход / список открытых тестов
            #exam-<id>   — прохождение теста
            #staff       — кабинет преподавателя
   ═══════════════════════════════════════════════════════════ */
window.Exam = (function () {
  'use strict';

  var URL_ = 'https://dljcyiwbciiehriklvym.supabase.co';
  var KEY = 'sb_publishable_xNFQSu7gMTz6dn0MpFcQQA_1qtZXX6a';
  var LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.min.js';
  var LIB_SRI = 'sha384-dl/4LkSyQ4uEucc48NM6VDZLAjLLq9yMzZ5JLXumBq7Ld33XBof73hseOqPhO89+';

  var sb = null, libP = null;
  var me = null;                /* профиль вошедшего: {id,email,full_name,group_name,role} */
  var show = null;              /* show(node, title) из app.js */
  var timer = null;

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) { return Render.esc(s == null ? '' : String(s)); }
  function inl(s) { return Render.inline(s == null ? '' : String(s)); }
  var LET = 'АБВГДЕ';

  function lib() {
    if (libP) return libP;
    libP = new Promise(function (ok, bad) {
      var s = document.createElement('script');
      s.src = LIB; s.integrity = LIB_SRI; s.crossOrigin = 'anonymous';
      s.onload = function () {
        sb = window.supabase.createClient(URL_, KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'kile-auth' }
        });
        ok(sb);
      };
      s.onerror = function () { libP = null; bad(new Error('Не удалось загрузить модуль входа — проверьте связь')); };
      document.head.appendChild(s);
    });
    return libP;
  }

  function errText(e) {
    var m = (e && (e.message || e.error_description || e.msg)) || String(e);
    if (/Invalid login credentials/i.test(m)) return 'Неверная почта или пароль';
    if (/User already registered/i.test(m)) return 'Эта почта уже зарегистрирована — войдите';
    if (/Password should be at least/i.test(m)) return 'Пароль слишком короткий';
    if (/weak|pwned|leaked/i.test(m)) return 'Пароль слишком простой — придумайте другой';
    if (/Unable to validate email|invalid format/i.test(m)) return 'Проверьте адрес почты';
    if (/Invalid TOTP|invalid.*code/i.test(m)) return 'Неверный код';
    if (/rate limit|too many/i.test(m)) return 'Слишком много попыток — подождите минуту';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Нет связи с сервером';
    return m;
  }
  function must(r) { if (r.error) throw r.error; return r.data; }

  /* ── Сессия и профиль ─────────────────────────────────── */

  function loadMe() {
    return sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (!s) { me = null; return null; }
      return sb.from('profiles').select('id,email,full_name,group_name,role').eq('id', s.user.id).maybeSingle()
        .then(function (p) { me = must(p) || { id: s.user.id, email: s.user.email, role: 'student' }; return me; });
    });
  }
  function isStaff() { return me && (me.role === 'admin' || me.role === 'teacher'); }

  /* Нужен ли код из приложения: у пользователя есть подтверждённый фактор, а сессия ещё aal1 */
  function needCode() {
    return sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function (r) {
      var d = must(r);
      return d.nextLevel === 'aal2' && d.currentLevel !== 'aal2';
    });
  }

  /* ── Каркас страницы ──────────────────────────────────── */

  function frame(title, lead, cap) {
    var page = el('div', 'doc exam');
    var band = el('div', 'doc-band');
    var bin = el('div', 'doc-band-in');
    bin.appendChild(el('header', 'doc-head',
      '<ol class="crumbs"><li><a href="#home">Главная</a></li><li><a href="#exam">Зачёт</a></li></ol>' +
      (cap ? '<p class="dh-cap">' + cap + '</p>' : '') +
      '<h1>' + esc(title) + '</h1>' + (lead ? '<p class="lead">' + lead + '</p>' : '')));
    band.appendChild(bin);
    page.appendChild(band);
    var body = el('div', 'page');
    var col = el('div', 'ex-col');
    body.appendChild(col);
    page.appendChild(body);
    return { page: page, col: col };
  }

  function userBar(col, inStaff) {
    if (!me) return;
    var who = (me.full_name || me.email) + (me.group_name ? ', ' + me.group_name : '');
    var role = me.role === 'admin' ? 'разработчик' : me.role === 'teacher' ? 'преподаватель' : 'студент';
    var bar = el('div', 'ex-user',
      '<span>' + esc(who) + ' · <i>' + role + '</i></span>' +
      (isStaff() ? (inStaff ? '<a class="fig-btn" href="#exam">Как видят студенты</a>' : '<a class="fig-btn" href="#staff">Кабинет преподавателя</a>') : '') +
      '<button class="fig-btn" type="button" data-out>Выйти</button>');
    bar.querySelector('[data-out]').addEventListener('click', function () {
      sb.auth.signOut().then(function () { me = null; location.hash = '#exam'; route('exam'); });
    });
    col.appendChild(bar);
  }

  function msg(host, text, bad) {
    var m = host.querySelector('.ex-msg');
    if (!m) { m = el('p', 'ex-msg'); host.appendChild(m); }
    m.className = 'ex-msg' + (bad ? ' is-bad' : '');
    m.textContent = text || '';
  }

  function busy(btn, on) { if (btn) { btn.disabled = on; btn.classList.toggle('is-busy', on); } }

  /* ── Вход и регистрация ───────────────────────────────── */

  function viewLogin(after) {
    var f = frame('Зачёт', 'Тесты по курсу открывает преподаватель. Войдите, чтобы увидеть открытые тесты и свои результаты.');
    var col = f.col;
    var tabs = el('div', 'ex-tabs',
      '<button type="button" class="is-on" data-t="in">Вход</button><button type="button" data-t="up">Регистрация</button>');
    col.appendChild(tabs);
    var form = el('form', 'ex-form');
    form.innerHTML =
      '<label data-up hidden><span>Фамилия и имя</span><input name="full_name" autocomplete="name" maxlength="120"></label>' +
      '<label data-up hidden><span>Группа</span><input name="group_name" maxlength="40" placeholder="П-XX-X"></label>' +
      '<label><span>Почта</span><input name="email" type="email" autocomplete="username" required></label>' +
      '<label><span>Пароль</span><input name="password" type="password" autocomplete="current-password" minlength="8" required></label>' +
      '<p class="hint" data-up hidden>Пароль — не короче 8 знаков. Восстановить его по почте нельзя: запишите.</p>' +
      '<button class="btn" type="submit">Войти</button>';
    col.appendChild(form);
    var mode = 'in';
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      mode = b.dataset.t;
      tabs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-on', x === b); });
      form.querySelectorAll('[data-up]').forEach(function (x) { x.hidden = mode !== 'up'; });
      form.full_name.required = form.group_name.required = mode === 'up';
      form.password.autocomplete = mode === 'up' ? 'new-password' : 'current-password';
      form.querySelector('[type=submit]').textContent = mode === 'up' ? 'Зарегистрироваться' : 'Войти';
      msg(form, '');
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('[type=submit]');
      var email = form.email.value.trim(), pw = form.password.value;
      busy(btn, true); msg(form, '');
      var p = mode === 'up'
        ? sb.auth.signUp({ email: email, password: pw, options: { data: {
            full_name: form.full_name.value.trim(), group_name: form.group_name.value.trim() } } })
        : sb.auth.signInWithPassword({ email: email, password: pw });
      p.then(function (r) {
        must(r);
        if (mode === 'up' && !(r.data && r.data.session)) throw new Error('Регистрация принята, но вход не выполнен — попробуйте войти');
        return enter(after);
      }).catch(function (err) { busy(btn, false); msg(form, errText(err), true); });
    });
    return f.page;
  }

  /* После пароля: если включён второй фактор — спросить код */
  function enter(after) {
    return needCode().then(function (need) {
      if (need) { show(viewCode(after), 'Код подтверждения — КиЛЭ ВС'); return; }
      return loadMe().then(function () { route(after || 'exam'); });
    });
  }

  function viewCode(after) {
    var f = frame('Код подтверждения', 'Откройте приложение-аутентификатор на телефоне и введите шестизначный код для «КиЛЭ ВС».');
    var form = el('form', 'ex-form',
      '<label><span>Код</span><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>' +
      '<button class="btn" type="submit">Подтвердить</button> <button class="fig-btn" type="button" data-out>Выйти</button>');
    f.col.appendChild(form);
    setTimeout(function () { form.code.focus(); }, 50);
    form.querySelector('[data-out]').addEventListener('click', function () {
      sb.auth.signOut().then(function () { route('exam'); });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('[type=submit]');
      busy(btn, true); msg(form, '');
      sb.auth.mfa.listFactors().then(function (r) {
        var fac = (must(r).totp || [])[0];
        if (!fac) throw new Error('Фактор не найден');
        return sb.auth.mfa.challengeAndVerify({ factorId: fac.id, code: form.code.value.trim() });
      }).then(function (r) { must(r); return loadMe(); })
        .then(function () { route(after || 'exam'); })
        .catch(function (err) { busy(btn, false); msg(form, errText(err), true); });
    });
    return f.page;
  }

  /* ── Список открытых тестов ───────────────────────────── */

  function viewList() {
    var f = frame('Зачёт', 'Здесь появляются тесты, которые открыл преподаватель.');
    userBar(f.col);
    var box = el('div', 'ex-list', '<p class="hint">Загрузка…</p>');
    f.col.appendChild(box);
    Promise.all([
      sb.from('tests').select('id,title,topic,description,max_attempts,time_limit_min,is_open,sort').eq('is_open', true).order('sort').order('id'),
      sb.from('attempts').select('id,test_id,score,total,finished_at').eq('user_id', me.id).order('started_at', { ascending: false })
    ]).then(function (rs) {
      var tests = must(rs[0]) || [], att = must(rs[1]) || [];
      box.textContent = '';
      if (!tests.length) {
        box.appendChild(el('div', 'ex-empty', '<b>Открытых тестов сейчас нет.</b><span>Когда преподаватель откроет тест, он появится здесь — обновите страницу.</span>'));
      }
      tests.forEach(function (t) {
        var mine = att.filter(function (a) { return a.test_id === t.id; });
        var done = mine.filter(function (a) { return a.finished_at; });
        var best = done.reduce(function (b, a) { return !b || a.score / Math.max(a.total, 1) > b.score / Math.max(b.total, 1) ? a : b; }, null);
        var left = t.max_attempts == null ? null : Math.max(0, t.max_attempts - done.length);
        var going = mine.some(function (a) { return !a.finished_at; });
        var meta = [t.topic, t.time_limit_min ? t.time_limit_min + ' мин' : '',
          left == null ? '' : 'попыток осталось: ' + left].filter(Boolean).map(esc).join(' · ');
        var card = el('div', 'ex-card',
          '<div><h3>' + esc(t.title) + '</h3>' + (meta ? '<p class="hint">' + meta + '</p>' : '') +
          (t.description ? '<p>' + inl(t.description) + '</p>' : '') +
          (best ? '<p class="ex-best">Лучший результат: <b>' + best.score + ' из ' + best.total + '</b>' +
            ' · <a href="#exam-r' + best.id + '">разбор</a></p>' : '') + '</div>');
        if (left !== 0 || going) {
          var a = el('a', 'btn', going ? 'Продолжить' : done.length ? 'Пройти ещё раз' : 'Начать');
          a.href = '#exam-' + t.id;
          card.appendChild(a);
        } else card.appendChild(el('span', 'hint', 'Попытки закончились'));
        box.appendChild(card);
      });
    }).catch(function (e) { box.innerHTML = ''; msg(box, errText(e), true); });
    return f.page;
  }

  /* ── Прохождение ──────────────────────────────────────── */

  function viewTake(testId) {
    var f = frame('Тест', '', 'Зачёт');
    var col = f.col;
    col.appendChild(el('p', 'hint', 'Загрузка…'));
    sb.rpc('start_test', { p_test: testId }).then(function (r) {
      var d = must(r);
      col.textContent = '';
      f.page.querySelector('h1').textContent = d.test.title;
      document.title = d.test.title + ' — Зачёт — КиЛЭ ВС';
      if (d.test.description) f.page.querySelector('.doc-head').appendChild(el('p', 'lead', inl(d.test.description)));
      var key = 'kile-ans-' + d.attempt;
      var ans = {};
      try { ans = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { ans = {}; }
      function save() { try { localStorage.setItem(key, JSON.stringify(ans)); } catch (e) {} }

      var head = el('div', 'ex-take-bar');
      var count = el('span', 'ex-count');
      var clock = el('span', 'ex-clock');
      head.appendChild(count); head.appendChild(clock);
      col.appendChild(head);

      var qs = d.questions;
      function recount() {
        var n = qs.filter(function (q) { return ans[q.id] != null; }).length;
        count.textContent = 'Отвечено ' + n + ' из ' + qs.length;
      }
      qs.forEach(function (q, qi) {
        var card = el('div', 'q');
        card.innerHTML = '<div class="q-n">Вопрос ' + (qi + 1) + ' из ' + qs.length + '</div>' +
          '<div class="q-text">' + inl(q.q) + '</div>' +
          (q.fig ? '<a class="ex-fig" href="#' + esc(q.fig) + '" target="_blank" rel="noopener">Открыть раздел на сайте ↗</a>' : '');
        var opts = el('div', 'q-opts');
        q.options.forEach(function (text, oi) {
          var b = el('button', 'q-opt' + (ans[q.id] === oi ? ' is-pick' : ''),
            '<span class="q-mark">' + LET[oi] + '</span><span>' + inl(text) + '</span>');
          b.type = 'button';
          b.setAttribute('aria-pressed', ans[q.id] === oi ? 'true' : 'false');
          b.addEventListener('click', function () {
            ans[q.id] = oi; save();
            opts.querySelectorAll('.q-opt').forEach(function (x, xi) {
              x.classList.toggle('is-pick', xi === oi);
              x.setAttribute('aria-pressed', xi === oi ? 'true' : 'false');
            });
            recount();
          });
          opts.appendChild(b);
        });
        card.appendChild(opts);
        col.appendChild(card);
      });
      recount();

      var send = el('button', 'btn', 'Сдать тест');
      send.type = 'button';
      var foot = el('div', 'ex-foot');
      foot.appendChild(send);
      col.appendChild(foot);

      function submit(force) {
        var n = qs.filter(function (q) { return ans[q.id] != null; }).length;
        if (!force && n < qs.length && !confirm('Отвечено ' + n + ' из ' + qs.length + '. Сдать тест?')) return;
        busy(send, true);
        if (timer) { clearInterval(timer); timer = null; }
        sb.rpc('submit_test', { p_attempt: d.attempt, p_answers: ans }).then(function (r2) {
          var res = must(r2);
          try { localStorage.removeItem(key); } catch (e) {}
          showResult(col, res, qs);
        }).catch(function (e) { busy(send, false); msg(foot, errText(e), true); });
      }
      send.addEventListener('click', function () { submit(false); });

      if (d.test.time_limit_min) {
        var skew = Date.now() - new Date(d.now).getTime();
        var end = new Date(d.started_at).getTime() + d.test.time_limit_min * 60000 + skew;
        var tick = function () {
          var s = Math.max(0, Math.round((end - Date.now()) / 1000));
          clock.textContent = 'Осталось ' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2);
          clock.classList.toggle('is-low', s < 120);
          if (s === 0) { clearInterval(timer); timer = null; submit(true); }
        };
        tick(); timer = setInterval(tick, 1000);
      }
    }).catch(function (e) {
      col.textContent = '';
      msg(col, errText(e), true);
      col.appendChild(el('p', null, '<a href="#exam">К списку тестов</a>'));
    });
    return f.page;
  }

  function showResult(col, res, qs) {
    col.textContent = '';
    var pct = res.total ? res.score / res.total : 0;
    var word = pct === 1 ? 'Отлично.' : pct >= 0.85 ? 'Хорошо.' : pct >= 0.6 ? 'Удовлетворительно.' : 'Стоит повторить материал.';
    col.appendChild(el('div', 'quiz-score', '<b>' + res.score + ' из ' + res.total + '</b><span>' + word +
      ' Результат сохранён — его видит преподаватель.</span><br><a class="fig-btn" href="#exam">К списку тестов</a>'));
    if (res.review) reviewList(col, res.review.map(function (r) {
      var q = qs.filter(function (x) { return x.id === r.id; })[0] || {};
      return { q: q.q, options: q.options || [], answer: r.answer, chosen: r.chosen, why: r.why, fig: q.fig };
    }));
    else col.appendChild(el('p', 'hint', 'Разбор ответов преподаватель откроет позже.'));
    window.scrollTo(0, 0);
  }

  function reviewList(col, items) {
    col.appendChild(el('h2', null, 'Разбор'));
    items.forEach(function (it, i) {
      var card = el('div', 'q');
      card.innerHTML = '<div class="q-n">Вопрос ' + (i + 1) + (it.chosen == null ? ' · без ответа' : '') + '</div>' +
        '<div class="q-text">' + inl(it.q) + '</div>';
      var opts = el('div', 'q-opts');
      (it.options || []).forEach(function (text, oi) {
        var b = el('div', 'q-opt' + (oi === it.answer ? ' is-right' : oi === it.chosen ? ' is-wrong' : ' is-dim'),
          '<span class="q-mark">' + LET[oi] + '</span><span>' + inl(text) + '</span>');
        opts.appendChild(b);
      });
      card.appendChild(opts);
      if (it.why) card.appendChild(el('div', 'q-why', '<b>' + (it.chosen === it.answer ? 'Верно. ' : 'Правильно — ' + LET[it.answer] + '. ') + '</b>' + inl(it.why)));
      col.appendChild(card);
    });
  }

  function viewReview(attemptId) {
    var f = frame('Разбор попытки', '', 'Зачёт');
    f.col.appendChild(el('p', 'hint', 'Загрузка…'));
    sb.rpc('attempt_review', { p_attempt: attemptId }).then(function (r) {
      var d = must(r);
      f.col.textContent = '';
      f.col.appendChild(el('div', 'quiz-score', '<b>' + d.score + ' из ' + d.total + '</b><br><a class="fig-btn" href="#' + (isStaff() ? 'staff' : 'exam') + '">Назад</a>'));
      reviewList(f.col, d.questions || []);
    }).catch(function (e) { f.col.textContent = ''; msg(f.col, errText(e), true); });
    return f.page;
  }

  /* ── Кабинет преподавателя ────────────────────────────── */

  function viewStaff() {
    var f = frame('Кабинет преподавателя', 'Открывайте и закрывайте тесты, правьте вопросы, смотрите результаты.', 'Зачёт');
    userBar(f.col, true);
    var col = f.col;
    var tabs = el('div', 'ex-tabs',
      '<button type="button" class="is-on" data-t="tests">Тесты</button>' +
      '<button type="button" data-t="res">Результаты</button>' +
      '<button type="button" data-t="sec">Защита входа</button>' +
      (me.role === 'admin' ? '<button type="button" data-t="roles">Роли</button>' : ''));
    col.appendChild(tabs);
    var pane = el('div', 'ex-pane');
    col.appendChild(pane);
    var cur = 'tests';
    try { cur = sessionStorage.getItem('kile-staff-tab') || 'tests'; } catch (e) {}
    function open(t) {
      cur = t;
      try { sessionStorage.setItem('kile-staff-tab', t); } catch (e) {}
      tabs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-on', x.dataset.t === t); });
      pane.textContent = '';
      ({ tests: paneTests, res: paneResults, sec: paneSecurity, roles: paneRoles })[t](pane);
    }
    tabs.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) open(b.dataset.t); });
    if (!tabs.querySelector('[data-t="' + cur + '"]')) cur = 'tests';
    open(cur);
    return f.page;
  }

  /* Тесты: открыть/закрыть, настройки, вопросы */
  function paneTests(pane) {
    pane.appendChild(el('p', 'hint', 'Загрузка…'));
    Promise.all([
      sb.from('tests').select('*').order('sort').order('id'),
      sb.from('questions').select('test_id')
    ]).then(function (rs) {
      var tests = must(rs[0]) || [], qn = {};
      (must(rs[1]) || []).forEach(function (q) { qn[q.test_id] = (qn[q.test_id] || 0) + 1; });
      pane.textContent = '';
      tests.forEach(function (t) {
        var row = el('div', 'ex-trow' + (t.is_open ? ' is-open' : ''));
        row.innerHTML =
          '<label class="ex-switch"><input type="checkbox"' + (t.is_open ? ' checked' : '') + '><i></i>' +
          '<span>' + (t.is_open ? 'Открыт' : 'Закрыт') + '</span></label>' +
          '<div class="ex-tinfo"><b>' + esc(t.title) + '</b><span class="hint">' +
          [t.topic, (qn[t.id] || 0) + ' вопр.', t.time_limit_min ? t.time_limit_min + ' мин' : 'без лимита времени',
           t.max_attempts ? 'попыток: ' + t.max_attempts : 'попыток без ограничения',
           t.show_answers ? 'разбор после сдачи' : 'разбор скрыт'].filter(Boolean).map(esc).join(' · ') + '</span></div>' +
          '<button class="fig-btn" type="button" data-edit>Изменить</button>';
        var cb = row.querySelector('input');
        cb.addEventListener('change', function () {
          cb.disabled = true;
          sb.from('tests').update({ is_open: cb.checked }).eq('id', t.id).then(function (r) {
            must(r); t.is_open = cb.checked;
            row.classList.toggle('is-open', t.is_open);
            row.querySelector('.ex-switch span').textContent = t.is_open ? 'Открыт' : 'Закрыт';
          }).catch(function (e) { cb.checked = !cb.checked; alert(errText(e)); })
            .then(function () { cb.disabled = false; });
        });
        row.querySelector('[data-edit]').addEventListener('click', function () { editTest(pane, t); });
        pane.appendChild(row);
      });
      if (!tests.length) pane.appendChild(el('p', 'hint', 'Тестов пока нет.'));
      var add = el('button', 'btn is-ghost', '+ Новый тест');
      add.type = 'button';
      add.addEventListener('click', function () {
        var title = prompt('Название теста');
        if (!title) return;
        sb.from('tests').insert({ title: title.trim(), sort: tests.length * 10 }).select().single()
          .then(function (r) { editTest(pane, must(r)); }).catch(function (e) { alert(errText(e)); });
      });
      pane.appendChild(el('div', 'ex-foot')).appendChild(add);
    }).catch(function (e) { pane.textContent = ''; msg(pane, errText(e), true); });
  }

  function editTest(pane, t) {
    pane.textContent = '';
    var back = el('button', 'fig-btn', '← Все тесты');
    back.type = 'button';
    back.addEventListener('click', function () { pane.textContent = ''; paneTests(pane); });
    pane.appendChild(back);

    var form = el('form', 'ex-form ex-wide');
    form.innerHTML =
      '<label><span>Название</span><input name="title" required></label>' +
      '<label><span>Тема (раздел курса)</span><input name="topic"></label>' +
      '<label><span>Описание для студентов</span><textarea name="description" rows="2"></textarea></label>' +
      '<div class="ex-row">' +
      '<label><span>Лимит времени, мин</span><input name="time_limit_min" type="number" min="1" placeholder="нет"></label>' +
      '<label><span>Попыток</span><input name="max_attempts" type="number" min="1" placeholder="без ограничения"></label>' +
      '<label><span>Порядок в списке</span><input name="sort" type="number"></label></div>' +
      '<label class="ex-check"><input name="show_answers" type="checkbox"> <span>Показывать разбор с правильными ответами после сдачи</span></label>' +
      '<div class="ex-foot"><button class="btn" type="submit">Сохранить тест</button>' +
      '<button class="fig-btn ex-danger" type="button" data-del>Удалить тест</button></div>';
    ['title', 'topic', 'description', 'time_limit_min', 'max_attempts', 'sort'].forEach(function (k) {
      form[k].value = t[k] == null ? '' : t[k];
    });
    form.show_answers.checked = !!t.show_answers;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var num = function (v) { v = parseInt(v, 10); return isNaN(v) || v < 1 ? null : v; };
      var patch = {
        title: form.title.value.trim(), topic: form.topic.value.trim(), description: form.description.value.trim(),
        time_limit_min: num(form.time_limit_min.value), max_attempts: num(form.max_attempts.value),
        sort: parseInt(form.sort.value, 10) || 0, show_answers: form.show_answers.checked
      };
      sb.from('tests').update(patch).eq('id', t.id).then(function (r) {
        must(r); Object.assign(t, patch); msg(form, 'Сохранено');
      }).catch(function (e2) { msg(form, errText(e2), true); });
    });
    form.querySelector('[data-del]').addEventListener('click', function () {
      if (!confirm('Удалить тест «' + t.title + '» вместе с вопросами и результатами? Это необратимо.')) return;
      sb.from('tests').delete().eq('id', t.id).then(function (r) { must(r); pane.textContent = ''; paneTests(pane); })
        .catch(function (e) { alert(errText(e)); });
    });
    pane.appendChild(form);

    pane.appendChild(el('h2', null, 'Вопросы'));
    pane.appendChild(el('p', 'hint', 'Варианты — по одному в строке. Правильный выбирается ниже. «Раздел сайта» — адрес страницы без #, например da40-gear: студент сможет открыть её во время теста.'));
    var list = el('div', 'ex-qlist');
    pane.appendChild(list);
    sb.from('questions').select('*').eq('test_id', t.id).order('ord').order('id').then(function (r) {
      var qs = must(r) || [];
      qs.forEach(function (q) { list.appendChild(qEditor(q, t)); });
      var add = el('button', 'btn is-ghost', '+ Вопрос');
      add.type = 'button';
      add.addEventListener('click', function () {
        var ord = (qs.length ? qs[qs.length - 1].ord : 0) + 10;
        var q = { test_id: t.id, ord: ord, q: '', options: ['', '', '', ''], answer: 0, why: '', fig: '' };
        qs.push(q);
        var ed = qEditor(q, t);
        list.appendChild(ed);
        ed.querySelector('textarea').focus();
      });
      pane.appendChild(el('div', 'ex-foot')).appendChild(add);
    }).catch(function (e) { msg(list, errText(e), true); });
  }

  function qEditor(q, t) {
    var f = el('form', 'ex-form ex-q');
    f.innerHTML =
      '<label><span>Вопрос</span><textarea name="q" rows="2" required></textarea></label>' +
      '<label><span>Варианты ответа (по одному в строке, 2–6)</span><textarea name="options" rows="4" required></textarea></label>' +
      '<div class="ex-row"><label><span>Правильный</span><select name="answer"></select></label>' +
      '<label><span>Раздел сайта</span><input name="fig" placeholder="da40-gear"></label>' +
      '<label><span>Порядок</span><input name="ord" type="number"></label></div>' +
      '<label><span>Объяснение (видно в разборе)</span><textarea name="why" rows="2"></textarea></label>' +
      '<div class="ex-foot"><button class="fig-btn" type="submit">Сохранить</button>' +
      '<button class="fig-btn ex-danger" type="button" data-del>Удалить</button></div>';
    f.q.value = q.q; f.options.value = (q.options || []).join('\n'); f.why.value = q.why || '';
    f.fig.value = q.fig || ''; f.ord.value = q.ord;
    function fillSel() {
      var n = f.options.value.split('\n').filter(function (s) { return s.trim(); }).length;
      var cur = f.answer.value === '' ? q.answer : +f.answer.value;
      f.answer.innerHTML = '';
      for (var i = 0; i < Math.max(n, 1); i++) f.answer.appendChild(new Option(LET[i] || String(i + 1), i));
      f.answer.value = Math.min(cur, Math.max(n - 1, 0));
    }
    fillSel();
    f.options.addEventListener('input', fillSel);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var opts = f.options.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (opts.length < 2 || opts.length > 6) { msg(f, 'Нужно от 2 до 6 вариантов', true); return; }
      var row = { test_id: t.id, q: f.q.value.trim(), options: opts, answer: +f.answer.value,
        why: f.why.value.trim(), fig: f.fig.value.trim().replace(/^#/, ''), ord: parseInt(f.ord.value, 10) || 0 };
      var p = q.id ? sb.from('questions').update(row).eq('id', q.id).select().single()
                   : sb.from('questions').insert(row).select().single();
      p.then(function (r) { Object.assign(q, must(r)); msg(f, 'Сохранено'); })
        .catch(function (e2) { msg(f, errText(e2), true); });
    });
    f.querySelector('[data-del]').addEventListener('click', function () {
      if (!q.id) { f.remove(); return; }
      if (!confirm('Удалить вопрос?')) return;
      sb.from('questions').delete().eq('id', q.id).then(function (r) { must(r); f.remove(); })
        .catch(function (e) { alert(errText(e)); });
    });
    return f;
  }

  /* Результаты */
  function paneResults(pane) {
    pane.appendChild(el('p', 'hint', 'Загрузка…'));
    Promise.all([
      sb.from('tests').select('id,title').order('sort').order('id'),
      sb.from('attempts').select('id,test_id,user_id,started_at,finished_at,score,total').order('started_at', { ascending: false }).limit(2000),
      sb.from('profiles').select('id,email,full_name,group_name,role')
    ]).then(function (rs) {
      var tests = must(rs[0]) || [], att = must(rs[1]) || [], people = {};
      (must(rs[2]) || []).forEach(function (p) { people[p.id] = p; });
      pane.textContent = '';
      var bar = el('div', 'ex-row ex-filter',
        '<label><span>Тест</span><select name="t"><option value="">все</option>' +
        tests.map(function (t) { return '<option value="' + t.id + '">' + esc(t.title) + '</option>'; }).join('') + '</select></label>' +
        '<label><span>Группа</span><select name="g"><option value="">все</option></select></label>' +
        '<label class="ex-check"><input type="checkbox" name="best" checked> <span>только лучшая попытка</span></label>' +
        '<button class="fig-btn" type="button" data-csv>Скачать таблицу (CSV)</button>');
      var groups = {};
      Object.keys(people).forEach(function (k) { if (people[k].group_name) groups[people[k].group_name] = 1; });
      Object.keys(groups).sort().forEach(function (g) { bar.querySelector('[name=g]').appendChild(new Option(g, g)); });
      pane.appendChild(bar);
      var table = el('div', 'ex-table');
      pane.appendChild(table);
      var tName = {}; tests.forEach(function (t) { tName[t.id] = t.title; });
      var rows = [];
      function draw() {
        var tf = bar.querySelector('[name=t]').value, gf = bar.querySelector('[name=g]').value;
        var best = bar.querySelector('[name=best]').checked;
        rows = att.filter(function (a) {
          var p = people[a.user_id] || {};
          return a.finished_at && (!tf || a.test_id === +tf) && (!gf || p.group_name === gf) && p.role === 'student';
        });
        if (best) {
          var by = {};
          rows.forEach(function (a) {
            var k = a.user_id + ':' + a.test_id, b = by[k];
            if (!b || a.score / Math.max(a.total, 1) > b.score / Math.max(b.total, 1)) by[k] = a;
          });
          rows = Object.keys(by).map(function (k) { return by[k]; });
        }
        rows.sort(function (x, y) {
          var px = people[x.user_id] || {}, py = people[y.user_id] || {};
          return (px.group_name || '').localeCompare(py.group_name || '') || (px.full_name || '').localeCompare(py.full_name || '') || x.test_id - y.test_id;
        });
        var going = att.filter(function (a) { return !a.finished_at && (!tf || a.test_id === +tf); }).length;
        table.innerHTML = '<table><thead><tr><th>Студент</th><th>Группа</th><th>Тест</th><th>Балл</th><th>Сдан</th><th></th></tr></thead><tbody>' +
          rows.map(function (a) {
            var p = people[a.user_id] || {};
            var pct = Math.round(100 * a.score / Math.max(a.total, 1));
            return '<tr><td>' + esc(p.full_name || p.email) + '</td><td>' + esc(p.group_name) + '</td><td>' + esc(tName[a.test_id]) +
              '</td><td class="' + (pct >= 60 ? 'ok' : 'bad') + '"><b>' + a.score + '/' + a.total + '</b> ' + pct + '%</td><td>' +
              new Date(a.finished_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) +
              '</td><td><a href="#exam-r' + a.id + '">разбор</a> · <button type="button" class="ex-link" data-reset="' + a.id + '">дать пересдачу</button></td></tr>';
          }).join('') + '</tbody></table>' +
          (rows.length ? '' : '<p class="hint">Сданных попыток нет.</p>') +
          (going ? '<p class="hint">Сейчас проходят: ' + going + '</p>' : '');
      }
      bar.addEventListener('change', draw);
      table.addEventListener('click', function (e) {
        var b = e.target.closest('[data-reset]'); if (!b) return;
        if (!confirm('Удалить эту попытку? Студент сможет пройти тест заново (если есть ограничение попыток).')) return;
        sb.from('attempts').delete().eq('id', +b.dataset.reset).then(function (r) {
          must(r); att = att.filter(function (a) { return a.id !== +b.dataset.reset; }); draw();
        }).catch(function (e2) { alert(errText(e2)); });
      });
      bar.querySelector('[data-csv]').addEventListener('click', function () {
        var q = function (s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; };
        var csv = '﻿Студент;Почта;Группа;Тест;Балл;Из;Сдан\n' + rows.map(function (a) {
          var p = people[a.user_id] || {};
          return [p.full_name, p.email, p.group_name, tName[a.test_id], a.score, a.total,
            new Date(a.finished_at).toLocaleString('ru-RU')].map(q).join(';');
        }).join('\n');
        var link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        link.download = 'результаты.csv';
        link.click();
        setTimeout(function () { URL.revokeObjectURL(link.href); }, 2000);
      });
      draw();
    }).catch(function (e) { pane.textContent = ''; msg(pane, errText(e), true); });
  }

  /* Второй фактор: приложение-аутентификатор */
  function paneSecurity(pane) {
    pane.appendChild(el('p', null, 'Код из приложения на телефоне (Google Authenticator, Яндекс Ключ, Microsoft Authenticator) ' +
      'защищает кабинет, даже если пароль узнают. После включения при каждом входе сайт спросит шестизначный код, ' +
      'а без кода права преподавателя не работают — это проверяет сервер.'));
    var box = el('div');
    pane.appendChild(box);
    sb.auth.mfa.listFactors().then(function (r) {
      var all = must(r).all || [];
      var ok = all.filter(function (x) { return x.status === 'verified'; });
      all.filter(function (x) { return x.status !== 'verified'; }).forEach(function (x) { sb.auth.mfa.unenroll({ factorId: x.id }); });
      if (ok.length) {
        box.appendChild(el('p', 'ex-ok', '<b>Защита включена.</b> Вход — по паролю и коду из приложения.'));
        return;
      }
      var go = el('button', 'btn', 'Включить защиту кодом');
      go.type = 'button';
      box.appendChild(go);
      go.addEventListener('click', function () {
        busy(go, true);
        sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'КиЛЭ ВС ' + new Date().toISOString().slice(0, 10) }).then(function (r2) {
          var d = must(r2);
          box.textContent = '';
          box.appendChild(el('ol', null,
            '<li>Отсканируйте QR-код приложением-аутентификатором.</li><li>Введите шестизначный код, который оно покажет.</li>'));
          var qr = el('div', 'ex-qr');
          var img = new Image(); img.src = d.totp.qr_code; img.alt = 'QR-код для приложения-аутентификатора';
          qr.appendChild(img);
          qr.appendChild(el('p', 'hint', 'Если сканировать нечем — ключ вручную: <code>' + esc(d.totp.secret) + '</code>'));
          box.appendChild(qr);
          var form = el('form', 'ex-form',
            '<label><span>Код из приложения</span><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>' +
            '<button class="btn" type="submit">Подтвердить</button>');
          box.appendChild(form);
          form.addEventListener('submit', function (e) {
            e.preventDefault();
            sb.auth.mfa.challengeAndVerify({ factorId: d.id, code: form.code.value.trim() }).then(function (r3) {
              must(r3);
              box.textContent = '';
              box.appendChild(el('p', 'ex-ok', '<b>Готово — защита включена.</b> Со следующего входа сайт будет спрашивать код.'));
            }).catch(function (e2) { msg(form, errText(e2), true); });
          });
        }).catch(function (e) { busy(go, false); msg(box, errText(e), true); });
      });
    }).catch(function (e) { msg(box, errText(e), true); });
  }

  /* Роли — только разработчики */
  function paneRoles(pane) {
    pane.appendChild(el('p', null, 'Человек сначала регистрируется на сайте (вкладка «Регистрация» на странице «Зачёт»), ' +
      'потом здесь ему выдаётся роль. Преподаватель — тесты, вопросы и результаты; разработчик — то же плюс роли.'));
    var form = el('form', 'ex-form ex-row',
      '<label><span>Почта</span><input name="email" type="email" required></label>' +
      '<label><span>Роль</span><select name="role"><option value="teacher">преподаватель</option>' +
      '<option value="admin">разработчик</option><option value="student">студент</option></select></label>' +
      '<button class="btn" type="submit">Назначить</button>');
    pane.appendChild(form);
    var list = el('div', 'ex-table');
    pane.appendChild(list);
    function load() {
      sb.from('profiles').select('email,full_name,group_name,role,created_at').in('role', ['admin', 'teacher']).order('role').then(function (r) {
        var ps = must(r) || [];
        list.innerHTML = '<table><thead><tr><th>Кто</th><th>Почта</th><th>Роль</th></tr></thead><tbody>' +
          ps.map(function (p) {
            return '<tr><td>' + esc(p.full_name) + '</td><td>' + esc(p.email) + '</td><td>' +
              (p.role === 'admin' ? 'разработчик' : 'преподаватель') + '</td></tr>';
          }).join('') + '</tbody></table>';
      }).catch(function (e) { msg(list, errText(e), true); });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      sb.rpc('set_role', { p_email: form.email.value.trim(), p_role: form.role.value }).then(function (r) {
        must(r); msg(form, 'Готово'); form.email.value = ''; load();
      }).catch(function (e2) { msg(form, errText(e2), true); });
    });
    load();
  }

  /* ── Роутер раздела ───────────────────────────────────── */

  function route(id) {
    if (timer) { clearInterval(timer); timer = null; }
    if (!show) return;
    var loading = el('div', 'loading', 'Загрузка…');
    show(loading, 'Зачёт — КиЛЭ ВС');
    lib().then(loadMe).then(function () {
      if (!me) { show(viewLogin(id), 'Вход — Зачёт — КиЛЭ ВС'); return; }
      return needCode().then(function (need) {
        if (need) { show(viewCode(id), 'Код подтверждения — КиЛЭ ВС'); return; }
        var m;
        if (id === 'staff') {
          if (!isStaff()) { show(viewList(), 'Зачёт — КиЛЭ ВС'); return; }
          show(viewStaff(), 'Кабинет преподавателя — КиЛЭ ВС');
        } else if ((m = /^exam-r(\d+)$/.exec(id))) show(viewReview(+m[1]), 'Разбор — Зачёт — КиЛЭ ВС');
        else if ((m = /^exam-(\d+)$/.exec(id))) show(viewTake(+m[1]), 'Тест — Зачёт — КиЛЭ ВС');
        else show(viewList(), 'Зачёт — КиЛЭ ВС');
      });
    }).catch(function (e) {
      var f = frame('Зачёт', '');
      msg(f.col, errText(e), true);
      show(f.page, 'Зачёт — КиЛЭ ВС');
    });
  }

  function handles(id) { return id === 'exam' || id === 'staff' || /^exam-r?\d+$/.test(id); }

  return {
    handles: handles,
    mount: function (id, showFn) { show = showFn; route(id); }
  };
})();
