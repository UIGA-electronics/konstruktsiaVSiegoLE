/* ═══════════════════════════════════════════════════════════
   render.js — превращает блоки из content/*.json в DOM.
   Чтобы наполнять новые темы, код трогать не нужно: достаточно
   добавить JSON с блоками поддерживаемых типов.

   Типы блоков:
     p, h2, h3, ul, ol, steps, table, src
     fact | note | warn | key   — цветные врезки
     figure   — интерактивная схема (см. figures.js)
     compare  — переключатель «DA 40 NG ↔ SSJ-100»
     quiz     — мини-тест с объяснениями
   Разметка внутри текста: **жирный**, *курсив*, `моно`,
   [[термин|всплывающее пояснение]]
   ═══════════════════════════════════════════════════════════ */
var Render = (function () {
  'use strict';

  var ICONS = {
    fact: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
    note: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><path d="M12 3l9.5 16.5h-19z"/><path d="M12 9v4M12 16h.01"/></svg>',
    key:  '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg>'
  };
  var TITLES = { fact: 'А вы знали', note: 'Пояснение', warn: 'Важно', key: 'Главное' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function inline(s) {
    var t = esc(s);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\[\[([^\|\]]+)\|([^\]]+)\]\]/g,
      '<abbr class="dfn" title="$2">$1</abbr>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[\s(«—])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/->/g, '→');
    return t;
  }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  /* ── Отдельные блоки ───────────────────────────────────── */

  function blockBox(b) {
    var kind = b.t;
    var node = el('div', 'box box-' + kind);
    node.innerHTML =
      '<div class="box-t">' + ICONS[kind] + '<span>' +
      esc(b.title || TITLES[kind]) + '</span></div>';
    if (b.text) node.appendChild(el('p', null, inline(b.text)));
    if (b.items) {
      var ul = el('ul');
      b.items.forEach(function (i) { ul.appendChild(el('li', null, inline(i))); });
      node.appendChild(ul);
    }
    return node;
  }

  function blockSteps(b) {
    var node = el('div', 'steps');
    b.items.forEach(function (s) {
      var step = el('div', 'step');
      step.innerHTML =
        '<div class="step-n"></div><div class="step-body">' +
        (s.title ? '<b>' + inline(s.title) + '</b>' : '') +
        '<p>' + inline(s.text) + '</p></div>';
      step.querySelector('.step-n').textContent = b.items.indexOf(s) + 1;
      node.appendChild(step);
    });
    return node;
  }

  function blockTable(b) {
    var node = el('div', 'table-scroll');
    var html = '<table><thead><tr>';
    b.head.forEach(function (h) { html += '<th>' + inline(h) + '</th>'; });
    html += '</tr></thead><tbody>';
    b.rows.forEach(function (r) {
      html += '<tr>';
      r.forEach(function (c) { html += '<td>' + inline(c) + '</td>'; });
      html += '</tr>';
    });
    node.innerHTML = html + '</tbody></table>';
    return node;
  }

  function blockFigure(b) {
    var node = el('figure', 'figure');
    var frame = el('div', 'figure-frame');
    frame.dataset.figure = b.name;
    if (b.opts) frame.dataset.opts = JSON.stringify(b.opts);
    node.appendChild(frame);
    /* Подсказка про горизонтальную прокрутку — только для широких SVG-схем.
       У 3D-модели свои правила управления, там она сбивает с толку. */
    if (b.name !== 'model3d') {
      node.appendChild(el('div', 'figure-hint', 'Схему можно листать вбок →'));
    }
    if (b.caption) {
      node.appendChild(el('figcaption', 'figure-cap', inline(b.caption)));
    }
    return node;
  }

  function blockStats(b) {
    var node = el('div', 'stats');
    b.items.forEach(function (s) {
      node.appendChild(el('div', 'stat',
        '<b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span>'));
    });
    return node;
  }

  function blockTerms(b) {
    var node = el('div', 'terms');
    b.items.forEach(function (t) {
      node.appendChild(el('div', 'term',
        '<b>' + inline(t.term) + '</b>' +
        (t.en ? '<i>' + esc(t.en) + '</i>' : '') +
        '<p>' + inline(t.text) + '</p>'));
    });
    return node;
  }

  /* Слот под будущую визуализацию: пока схемы нет, читатель видит,
     что именно тут появится, а не пустое место. Спецификация для
     подготовки материалов лежит в VISUALS.md. */
  function blockVisual(b) {
    var node = el('div', 'visual');
    node.innerHTML =
      '<div class="visual-h">' +
      '<span class="visual-ic"><svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>' +
      '</svg></span>' +
      '<b>' + esc(b.title) + '</b>' +
      '<span class="visual-kind">' + esc(b.kind || 'схема') + '</span>' +
      '</div>' +
      '<p>' + inline(b.brief) + '</p>' +
      (b.id ? '<span class="visual-id">' + esc(b.id) + '</span>' : '');
    return node;
  }

  function blockCompare(b) {
    var node = el('div', 'compare');
    var sw = el('div', 'compare-switch');
    var body = el('div', 'compare-body');

    b.sides.forEach(function (side, i) {
      var btn = el('button', i === 0 ? 'is-on' : '', esc(side.tab));
      btn.type = 'button';
      btn.addEventListener('click', function () {
        sw.querySelectorAll('button').forEach(function (x) { x.classList.remove('is-on'); });
        btn.classList.add('is-on');
        paint(side);
      });
      sw.appendChild(btn);
    });

    function paint(side) {
      var html = '<h4>' + esc(side.title) + '</h4>' +
        '<p class="cm-sub">' + esc(side.sub || '') + '</p><div class="cm-rows">';
      side.rows.forEach(function (r) {
        html += '<div class="cm-row"><div class="cm-k">' + esc(r[0]) +
          '</div><div class="cm-v">' + inline(r[1]) + '</div></div>';
      });
      body.innerHTML = html + '</div>';
    }
    paint(b.sides[0]);

    node.appendChild(sw);
    node.appendChild(body);
    return node;
  }

  function blockQuiz(b) {
    var node = el('div', 'quiz');
    node.dataset.quiz = '1';
    var state = { answered: 0, right: 0, total: b.questions.length };

    b.questions.forEach(function (q, qi) {
      var card = el('div', 'q');
      card.innerHTML =
        '<div class="q-n">Вопрос ' + (qi + 1) + ' из ' + state.total + '</div>' +
        '<div class="q-text">' + inline(q.q) + '</div>';
      var opts = el('div', 'q-opts');
      var letters = 'АБВГД';

      q.options.forEach(function (text, oi) {
        var btn = el('button', 'q-opt');
        btn.type = 'button';
        btn.innerHTML = '<span class="q-mark">' + letters[oi] + '</span>' +
          '<span>' + inline(text) + '</span>';
        btn.addEventListener('click', function () {
          if (card.dataset.done) return;
          card.dataset.done = '1';
          var correct = oi === q.answer;
          state.answered++;
          if (correct) state.right++;
          opts.querySelectorAll('.q-opt').forEach(function (x, xi) {
            x.disabled = true;
            if (xi === q.answer) x.classList.add('is-right');
            else if (xi === oi) x.classList.add('is-wrong');
          });
          var why = el('div', 'q-why',
            '<b>' + (correct ? 'Верно. ' : 'Не совсем. ') + '</b>' + inline(q.why));
          card.appendChild(why);
          if (state.answered === state.total) showScore();
        });
        opts.appendChild(btn);
      });

      card.appendChild(opts);
      node.appendChild(card);
    });

    var scoreBox = el('div');
    node.appendChild(scoreBox);

    function showScore() {
      var word = state.right === state.total ? 'Отлично — тема усвоена.'
        : state.right >= state.total - 1 ? 'Почти идеально.'
        : state.right * 2 >= state.total ? 'Неплохо, но стоит перечитать разделы.'
        : 'Стоит вернуться к началу темы.';
      scoreBox.innerHTML =
        '<div class="quiz-score"><b>' + state.right + ' из ' + state.total + '</b>' +
        '<span>' + word + '</span><br>' +
        '<button class="fig-btn" type="button">Пройти заново</button></div>';
      scoreBox.querySelector('button').addEventListener('click', function () {
        var fresh = blockQuiz(b);
        node.replaceWith(fresh);
        fresh.scrollIntoView({ block: 'start' });
      });
    }

    return node;
  }

  /* ── Диспетчер ─────────────────────────────────────────── */

  function one(b) {
    switch (b.t) {
      case 'p':    return el('p', null, inline(b.text));
      case 'h2':   return el('h2', null, inline(b.text));
      case 'h3':   return el('h3', null, inline(b.text));
      case 'src':  return el('div', 'src', inline(b.text));
      case 'ul':
      case 'ol': {
        var list = el(b.t);
        b.items.forEach(function (i) { list.appendChild(el('li', null, inline(i))); });
        return list;
      }
      case 'fact':
      case 'note':
      case 'warn':
      case 'key':    return blockBox(b);
      case 'steps':  return blockSteps(b);
      case 'table':  return blockTable(b);
      case 'stats':  return blockStats(b);
      case 'terms':  return blockTerms(b);
      case 'visual': return blockVisual(b);
      case 'figure': return blockFigure(b);
      case 'compare':return blockCompare(b);
      case 'quiz':   return blockQuiz(b);
      default:
        console.warn('Неизвестный тип блока:', b.t);
        return null;
    }
  }

  function blocks(list, parent) {
    list.forEach(function (b) {
      var node = one(b);
      if (node) parent.appendChild(node);
    });
  }

  function mountAll() { /* зарезервировано под будущие блоки */ }

  return { inline: inline, blocks: blocks, mountAll: mountAll, esc: esc };
})();
