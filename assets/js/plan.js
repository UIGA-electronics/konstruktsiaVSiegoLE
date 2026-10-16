/* ═══════════════════════════════════════════════════════════
   plan.js — DA 40 NG сверху: схема выбора систем.

   Чертёж — assets/img/da40-plan.svg, его строят из модели
   tools/da40/planview.py и planview_svg.py: линии планера —
   контуры деталей обшивки, «пятна» систем — силуэты деталей
   раздела сверху. Поэтому топливные баки, тяги и жгуты на плане
   стоят там же, где в 3D.

   Plan.mount(host, opts):
     opts.cur    — раздел, чья система отмечена (страница практикума);
     opts.live   — наведение на пятно подсвечивает систему, клик — переход;
     opts.dims   — размерные линии по РЛЭ (размах, длина);
     opts.titles — { id: { t: 'Топливная система', ata: '28' } } для подписи;
     opts.onHot  — функция(id) при наведении (синхронизация со списком).
   ═══════════════════════════════════════════════════════════ */
var Plan = (function () {
  'use strict';

  var SRC = 'assets/img/da40-plan.svg?v=51';
  var text = null;

  function load() {
    if (!text) {
      text = fetch(SRC).then(function (r) {
        if (!r.ok) throw new Error(r.status + ' ' + SRC);
        return r.text();
      });
      text.catch(function () { text = null; });
    }
    return text;
  }

  var NS = 'http://www.w3.org/2000/svg';
  function node(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }

  /* Размерные линии, как на трёхвидовом чертеже: размах — под самолётом,
     длина — справа от правого крыла. Значения — из РЛЭ, концы — по контуру. */
  function dims(svg, bb) {
    var m = +svg.getAttribute('data-m') || 100;
    var vb = svg.viewBox.baseVal;
    var padR = 0.85 * m, padB = 1.15 * m, padT = 0.12 * m;
    svg.setAttribute('viewBox', [vb.x - 0.12 * m, vb.y - padT, vb.width + 0.12 * m + padR, vb.height + padT + padB].join(' '));
    var g = node('g', { 'class': 'pl-dim', 'aria-hidden': 'true' }, svg);
    var arr = 14, gap = 8;

    function arrow(x, y, dx, dy) {
      var px = -dy, py = dx;
      node('path', { 'class': 'arw', d: 'M' + x + ' ' + y + 'L' + (x - dx * arr + px * 4.5) + ' ' + (y - dy * arr + py * 4.5) +
        'L' + (x - dx * arr - px * 4.5) + ' ' + (y - dy * arr - py * 4.5) + 'Z' }, g);
    }
    function label(x, y, s, rot) {
      var t = node('text', { x: x, y: y, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
      if (rot) t.setAttribute('transform', 'rotate(-90 ' + x + ' ' + y + ')');
      t.textContent = s;
      return t;
    }

    /* размах */
    var yd = bb.y + bb.height + 0.62 * m;
    var yWing = bb.y + 0.30 * bb.height;
    node('line', { x1: bb.x, y1: yWing, x2: bb.x, y2: yd + gap }, g);
    node('line', { x1: bb.x + bb.width, y1: yWing, x2: bb.x + bb.width, y2: yd + gap }, g);
    var cx = bb.x + bb.width / 2, half = 1.15 * m;
    node('line', { x1: bb.x, y1: yd, x2: cx - half, y2: yd }, g);
    node('line', { x1: cx + half, y1: yd, x2: bb.x + bb.width, y2: yd }, g);
    arrow(bb.x, yd, -1, 0);
    arrow(bb.x + bb.width, yd, 1, 0);
    label(cx, yd, 'размах 11,63 м');

    /* длина */
    var xd = bb.x + bb.width + 0.42 * m;
    var xNose = bb.x + bb.width / 2 + 0.05 * m;
    node('line', { x1: xNose, y1: bb.y, x2: xd + gap, y2: bb.y }, g);
    node('line', { x1: bb.x + bb.width * 0.64, y1: bb.y + bb.height, x2: xd + gap, y2: bb.y + bb.height }, g);
    var cy = bb.y + bb.height / 2, h2 = 0.95 * m;
    node('line', { x1: xd, y1: bb.y, x2: xd, y2: cy - h2 }, g);
    node('line', { x1: xd, y1: cy + h2, x2: xd, y2: bb.y + bb.height }, g);
    arrow(xd, bb.y, 0, -1);
    arrow(xd, bb.y + bb.height, 0, 1);
    label(xd, cy, 'длина 8,06 м', true);

    /* масштабная линейка: 0–2 м */
    var sx = bb.x, sy = yd + 0.5 * m;
    for (var i = 0; i < 2; i++) {
      node('rect', { x: sx + i * m, y: sy - 4, width: m, height: 8, 'class': i ? '' : 'arw',
        style: i ? 'fill:none;stroke:var(--ink-3);stroke-width:.7' : '' }, g);
    }
    var t0 = label(sx, sy + 24, '0'); t0.setAttribute('class', 'sm');
    var t2 = label(sx + 2 * m, sy + 24, '2 м'); t2.setAttribute('class', 'sm');
  }

  function mount(host, opts) {
    opts = opts || {};
    var fig = document.createElement('div');
    fig.className = 'plan' + (opts.live ? ' is-live' : '');
    host.appendChild(fig);
    var tag = null;
    var api = { el: fig, hot: hot };

    function paths() { return fig.querySelectorAll('.pl-sys path'); }
    function hot(id) {
      [].forEach.call(paths(), function (p) { p.classList.toggle('is-hot', !!id && p.getAttribute('data-sys') === id); });
      fig.classList.toggle('has-hot', !!id);
    }

    api.ready = load().then(function (t) {
      fig.innerHTML = t;
      var svg = fig.querySelector('svg');
      if (!svg) return api;
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'DA 40 NG, вид сверху' + (opts.cur && opts.titles && opts.titles[opts.cur] ? ': ' + opts.titles[opts.cur].t : ''));
      var g = svg.querySelector('.pl-sys');
      /* на странице бывает два плана — id внутри svg не нужны */
      [].forEach.call(svg.querySelectorAll('[id]'), function (n) { n.removeAttribute('id'); });
      /* крупные системы — вниз, мелкие — поверх: тогда наведение попадает в мелкую */
      var list = [].slice.call(g.querySelectorAll('path'));
      list.forEach(function (p) {
        var b = { width: 0, height: 0 };
        try { b = p.getBBox(); } catch (e) { /* узел скрыт */ }
        p.__a = b.width * b.height;
      });
      list.sort(function (a, b) { return b.__a - a.__a; }).forEach(function (p) { g.appendChild(p); });
      if (opts.cur) {
        var c = g.querySelector('[data-sys="' + opts.cur + '"]');
        if (c) c.classList.add('is-cur');
      }
      if (opts.dims) {
        var bb = svg.querySelector('.pl-outline path').getBBox();
        dims(svg, bb);
      }
      if (opts.live) {
        tag = document.createElement('div');
        tag.className = 'plan-tag';
        tag.hidden = true;
        fig.appendChild(tag);
        g.addEventListener('pointerover', function (e) {
          var p = e.target.closest('[data-sys]');
          if (!p) return;
          var id = p.getAttribute('data-sys');
          hot(id);
          if (opts.onHot) opts.onHot(id);
          var ti = opts.titles && opts.titles[id];
          if (ti) {
            tag.innerHTML = (ti.ata ? '<i>ATA ' + ti.ata + '</i>' : '') + '<b>' + ti.t + '</b>';
            tag.hidden = false;
          }
        });
        fig.addEventListener('pointermove', function (e) {
          if (tag.hidden) return;
          var r = fig.getBoundingClientRect();
          var x = e.clientX - r.left, y = e.clientY - r.top;
          tag.style.left = Math.min(x + 14, r.width - tag.offsetWidth - 4) + 'px';
          tag.style.top = Math.max(y - tag.offsetHeight - 10, 0) + 'px';
        });
        g.addEventListener('pointerout', function (e) {
          if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.pl-sys [data-sys]')) return;
          hot(null);
          tag.hidden = true;
          if (opts.onHot) opts.onHot(null);
        });
        g.addEventListener('click', function (e) {
          var p = e.target.closest('[data-sys]');
          if (p) location.hash = '#' + p.getAttribute('data-sys');
        });
      }
      return api;
    }).catch(function (e) {
      fig.innerHTML = '';
      console.warn('план:', e);
      return api;
    });
    return api;
  }

  return { mount: mount, load: load };
})();
