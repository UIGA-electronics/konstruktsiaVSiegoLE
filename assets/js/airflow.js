/* ═══════════════════════════════════════════════════════
   Обтекание профиля с отклонённым рулём — расчёт для живых схем главы 6
   ═══════════════════════════════════════════════════════
   Панельный метод Хесса — Смита: контур профиля разбит на панели, на
   каждой — постоянный источник, на всех — общий вихрь; условие
   непротекания в серединах панелей и условие Жуковского на задней кромке.
   Это потенциальный поток без вязкости: распределение давления и
   приращение подъёмной силы от руля он даёт верно, срыв не показывает.

   Всё в долях хорды: передняя кромка в (0, 0), задняя — в (1, 0),
   набегающий поток — единичный, под углом атаки alpha к хорде.
   Руль — часть профиля за осью xh, повёрнутая на delta (плюс — вниз).
   Ось лежит на средней линии; поворот сглажен на ±0,03 хорды, чтобы
   контур не перехлёстывался у оси. */
(function (root) {
  'use strict';
  var TWO_PI = 2 * Math.PI, DEG = Math.PI / 180;

  /* Координаты в формате Селига (от задней кромки по верху к носу и по
     низу назад) или двумя ветвями от носа — приводим к верхней и нижней
     ветви от носа к задней кромке. */
  function branches(pts) {
    var iLe = 0;
    for (var i = 1; i < pts.length; i++) if (pts[i][0] < pts[iLe][0]) iLe = i;
    var a = pts.slice(0, iLe + 1).reverse(), b = pts.slice(iLe);
    var up = (a[Math.min(3, a.length - 1)][1] > b[Math.min(3, b.length - 1)][1]) ? a : b;
    var lo = up === a ? b : a;
    return { up: up, lo: lo };
  }
  function interp(br, x) {
    for (var i = 1; i < br.length; i++) {
      if (br[i][0] >= x) {
        var p = br[i - 1], q = br[i], t = (x - p[0]) / ((q[0] - p[0]) || 1e-9);
        return p[1] + (q[1] - p[1]) * t;
      }
    }
    return br[br.length - 1][1];
  }

  /* Профиль на n точек каждой ветви с косинусным сгущением к кромкам;
     thick — масштаб толщины относительно исходника (средняя линия та же). */
  function foil(pts, n, thick) {
    var br = branches(pts), up = [], lo = [];
    var k = thick || 1;
    /* толстую заднюю кромку (у суперкритических профилей) сводим в точку:
       панельному методу нужна острая кромка для условия Жуковского */
    var hTe = (interp(br.up, 1) - interp(br.lo, 1)) / 2;
    function cam(x) { return (interp(br.up, x) + interp(br.lo, x)) / 2; }
    function half(x) { return ((interp(br.up, x) - interp(br.lo, x)) / 2 - hTe * x) * k; }
    for (var i = 0; i <= n; i++) {
      var x = (1 - Math.cos(Math.PI * i / n)) / 2, c = cam(x), h = half(x);
      up.push([x, c + h]); lo.push([x, c - h]);
    }
    return { up: up, lo: lo, camber: cam,
      yu: function (x) { return cam(x) + half(x); }, yl: function (x) { return cam(x) - half(x); } };
  }

  /* Симметричный профиль NACA 00tt (t — толщина в процентах хорды) в формате
     двух ветвей от носа — для оперения, у которого профиль на модели симметричный. */
  function naca(t) {
    var pts = [], n = 60, k = t / 100, i;
    function yt(x) { return 5 * k * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x); }
    for (i = n; i >= 0; i--) { var x = (1 - Math.cos(Math.PI * i / n)) / 2; pts.push([x, yt(x)]); }
    for (i = 1; i <= n; i++) { var x2 = (1 - Math.cos(Math.PI * i / n)) / 2; pts.push([x2, -yt(x2)]); }
    return pts;
  }

  /* Контур по часовой стрелке: задняя кромка → низ → нос → верх → задняя кромка.
     hinges — [{ xh, delta }] в долях хорды (delta — относительно руля, на
     котором стоит этот шарнир: триммер на руле высоты). Сначала поворачивается
     самый задний, потом всё, что за осью следующего, — вместе с ним.
     scale > 1 — хорда длиннее основной (вкладка триммера выступает за
     заднюю кромку руля): профиль растягивается, оси остаются на месте. */
  function contour(f, hinges, scale) {
    if (typeof hinges === 'number') hinges = [{ xh: hinges, delta: arguments[2] || 0 }], scale = 1;
    var k = scale || 1, i;
    var pts = [];
    for (i = f.lo.length - 1; i >= 0; i--) pts.push([f.lo[i][0] * k, f.lo[i][1] * k]);
    for (i = 1; i < f.up.length; i++) pts.push([f.up[i][0] * k, f.up[i][1] * k]);
    hinges.slice().sort(function (a, b) { return b.xh - a.xh; }).forEach(function (h) {
      var xh = h.xh, zh = f.camber(Math.min(1, xh / k)) * k, d = (h.delta || 0) * DEG;
      var W = Math.min(0.03, (k - xh) * 0.25);
      if (!d) return;
      pts = pts.map(function (p) {
        var t = (p[0] - (xh - W)) / (2 * W);
        var a = t <= 0 ? 0 : t >= 1 ? d : d * t * t * (3 - 2 * t);
        if (!a) return p;
        var dx = p[0] - xh, dy = p[1] - zh, c = Math.cos(a), s = Math.sin(a);
        /* поворот вниз: задняя кромка уходит в минус по y */
        return [xh + dx * c + dy * s, zh - dx * s + dy * c];
      });
    });
    return pts;
  }

  /* Шарнирный момент руля с осью (xh, zh) от давления на его панелях,
     в долях q·b·c_р² (c_р — хорда руля от оси до кромки); плюс — тянет
     заднюю кромку вниз. */
  function hingeMoment(s, xh, k) {
    var zh = s.foilCamber(Math.min(1, xh / (k || 1))) * (k || 1), m = 0, cf = (k || 1) - xh;
    for (var i = 0; i < s.cp.length; i++) {
      if (s.xc[i] <= xh + 1e-4) continue;
      var p1 = s.pts[i], p2 = s.pts[i + 1], l = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      var nx = -(p2[1] - p1[1]) / l, ny = (p2[0] - p1[0]) / l;
      var fx = -s.cp[i] * nx * l, fy = -s.cp[i] * ny * l;
      /* момент вокруг оси (против часовой — плюс), кромка вниз — это по часовой */
      m += (s.xc[i] - xh) * fy - (s.yc[i] - zh) * fx;
    }
    return -m / (cf * cf);
  }

  /* Скорость в точке (x, y) от панели j с единичным источником (us, vs)
     и единичным вихрем (uv, vv) — в глобальных осях. */
  function panelVel(px, py, x1, y1, x2, y2, out, self) {
    var dx = x2 - x1, dy = y2 - y1, l = Math.sqrt(dx * dx + dy * dy), cx = dx / l, cy = dy / l;
    var rx = px - x1, ry = py - y1;
    var xp = rx * cx + ry * cy, yp = -rx * cy + ry * cx;      /* в осях панели, y' — внешняя нормаль слева */
    var r1 = xp * xp + yp * yp, r2 = (xp - l) * (xp - l) + yp * yp;
    var lnr = 0.5 * Math.log(r1 / r2);
    var beta = self ? Math.PI : Math.atan2(yp, xp - l) - Math.atan2(yp, xp);
    if (!self && beta > Math.PI) beta -= TWO_PI; else if (!self && beta < -Math.PI) beta += TWO_PI;
    var us = lnr / TWO_PI, vs = beta / TWO_PI;              /* источник */
    var uv = -vs, vv = us;                                  /* вихрь (против часовой) */
    out[0] = us * cx - vs * cy; out[1] = us * cy + vs * cx;
    out[2] = uv * cx - vv * cy; out[3] = uv * cy + vv * cx;
  }

  function solveLinear(A, b) {
    var n = b.length, i, j, k;
    for (k = 0; k < n; k++) {
      var p = k, m = Math.abs(A[k][k]);
      for (i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > m) { m = Math.abs(A[i][k]); p = i; }
      if (p !== k) { var t = A[k]; A[k] = A[p]; A[p] = t; var tb = b[k]; b[k] = b[p]; b[p] = tb; }
      for (i = k + 1; i < n; i++) {
        var f = A[i][k] / A[k][k];
        if (!f) continue;
        for (j = k; j < n; j++) A[i][j] -= f * A[k][j];
        b[i] -= f * b[k];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = b[i];
      for (j = i + 1; j < n; j++) s -= A[i][j] * x[j];
      x[i] = s / A[i][i];
    }
    return x;
  }

  /* Решение для одного положения руля.
     o: { foil, xh, delta, alpha } → { pts, q, g, cp[], xc[], yc[], up[], cl, field(x,y,out) } */
  function solve(o) {
    var pts = o.hinges ? contour(o.foil, o.hinges, o.scale) : contour(o.foil, [{ xh: o.xh, delta: o.delta }], 1), N = pts.length - 1;
    var a = (o.alpha || 0) * DEG, Ux = Math.cos(a), Uy = Math.sin(a);
    var xc = [], yc = [], nx = [], ny = [], tx = [], ty = [], i, j, tmp = [0, 0, 0, 0];
    for (i = 0; i < N; i++) {
      var dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], l = Math.sqrt(dx * dx + dy * dy);
      xc.push((pts[i][0] + pts[i + 1][0]) / 2); yc.push((pts[i][1] + pts[i + 1][1]) / 2);
      tx.push(dx / l); ty.push(dy / l); nx.push(-dy / l); ny.push(dx / l);
    }
    /* матрицы влияния: An/At — источники, Bn/Bt — вихрь (сумма по панелям) */
    var A = [], b = [], At = [], Bt = new Array(N);
    for (i = 0; i < N; i++) {
      var row = new Array(N + 1), rowT = new Array(N), bn = 0, bt = 0;
      for (j = 0; j < N; j++) {
        panelVel(xc[i], yc[i], pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1], tmp, i === j);
        row[j] = tmp[0] * nx[i] + tmp[1] * ny[i];
        rowT[j] = tmp[0] * tx[i] + tmp[1] * ty[i];
        bn += tmp[2] * nx[i] + tmp[3] * ny[i];
        bt += tmp[2] * tx[i] + tmp[3] * ty[i];
      }
      row[N] = bn; A.push(row); At.push(rowT); Bt[i] = bt;
      b.push(-(Ux * nx[i] + Uy * ny[i]));
    }
    /* Жуковский: касательные скорости на первой и последней панелях равны по
       модулю и противоположны по направлению обхода */
    var kr = new Array(N + 1);
    for (j = 0; j < N; j++) kr[j] = At[0][j] + At[N - 1][j];
    kr[N] = Bt[0] + Bt[N - 1];
    A.push(kr);
    b.push(-(Ux * (tx[0] + tx[N - 1]) + Uy * (ty[0] + ty[N - 1])));
    var sol = solveLinear(A, b), q = sol.slice(0, N), g = sol[N];
    var cp = new Array(N), vt = new Array(N), cl = 0, cm = 0;
    for (i = 0; i < N; i++) {
      var v = Ux * tx[i] + Uy * ty[i] + g * Bt[i];
      for (j = 0; j < N; j++) v += q[j] * At[i][j];
      vt[i] = v; cp[i] = 1 - v * v;
      /* сила на панели: −Cp·n·l, проекция на нормаль к потоку */
      var l2 = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      var fx = -cp[i] * nx[i] * l2, fy = -cp[i] * ny[i] * l2;
      cl += -fx * Uy + fy * Ux;
      cm += -(fy * (xc[i] - 0.25) - fx * yc[i]);
    }
    /* верх — точки после носа (обход: низ, нос, верх) */
    var iLe = 0;
    for (i = 1; i <= N; i++) if (pts[i][0] < pts[iLe][0]) iLe = i;
    var up = xc.map(function (_, k) { return k >= iLe; });
    function field(x, y, out) {
      var u = Ux, w = Uy;
      for (var jj = 0; jj < N; jj++) {
        panelVel(x, y, pts[jj][0], pts[jj][1], pts[jj + 1][0], pts[jj + 1][1], tmp, false);
        u += q[jj] * tmp[0] + g * tmp[2];
        w += q[jj] * tmp[1] + g * tmp[3];
      }
      out[0] = u; out[1] = w;
      return out;
    }
    return { pts: pts, q: q, g: g, cp: cp, vt: vt, xc: xc, yc: yc, up: up, iLe: iLe, cl: cl, cm: cm, alpha: o.alpha, delta: o.delta,
      field: field, foilCamber: o.foil.camber, scale: o.scale || 1 };
  }

  function inside(pts, x, y) {
    var c = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  /* Поле скоростей на сетке: u, v (в долях скорости набегающего потока)
     и маска «внутри профиля». Сетка — прямоугольник в долях хорды. */
  function grid(s, g) {
    var nx = g.nx, ny = g.ny, n = nx * ny, u = new Float32Array(n), v = new Float32Array(n), m = new Uint8Array(n);
    var out = [0, 0], i, j;
    for (j = 0; j < ny; j++) {
      var y = g.y0 + (g.y1 - g.y0) * j / (ny - 1);
      for (i = 0; i < nx; i++) {
        var x = g.x0 + (g.x1 - g.x0) * i / (nx - 1), k = j * nx + i;
        if (x > -0.02 && x < s.scale + 0.05 && y > -0.25 && y < 0.25 && inside(s.pts, x, y)) { m[k] = 1; continue; }
        s.field(x, y, out);
        u[k] = out[0]; v[k] = out[1];
      }
    }
    /* у самой стенки особенность панелей даёт выбросы — ограничиваем */
    for (i = 0; i < n; i++) {
      var sp = Math.sqrt(u[i] * u[i] + v[i] * v[i]);
      if (sp > 2.6) { u[i] *= 2.6 / sp; v[i] *= 2.6 / sp; }
    }
    return { u: u, v: v, m: m, nx: nx, ny: ny, x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1 };
  }

  /* Скорость в точке по сетке (билинейно); null — внутри профиля или вне сетки */
  function sample(G, x, y, out) {
    var fx = (x - G.x0) / (G.x1 - G.x0) * (G.nx - 1), fy = (y - G.y0) / (G.y1 - G.y0) * (G.ny - 1);
    if (fx < 0 || fy < 0 || fx >= G.nx - 1 || fy >= G.ny - 1) return null;
    var i = fx | 0, j = fy | 0, a = fx - i, b = fy - j, k = j * G.nx + i;
    if (G.m[k] || G.m[k + 1] || G.m[k + G.nx] || G.m[k + G.nx + 1]) return null;
    out[0] = (G.u[k] * (1 - a) + G.u[k + 1] * a) * (1 - b) + (G.u[k + G.nx] * (1 - a) + G.u[k + G.nx + 1] * a) * b;
    out[1] = (G.v[k] * (1 - a) + G.v[k + 1] * a) * (1 - b) + (G.v[k + G.nx] * (1 - a) + G.v[k + G.nx + 1] * a) * b;
    return out;
  }

  /* Cp по доле хорды для верха и низа (n отсчётов) — для окраски обшивки */
  function cpTable(s, n) {
    var up = new Float32Array(n), lo = new Float32Array(n);
    function fill(arr, isUp) {
      var xs = [], cs = [];
      for (var i = 0; i < s.cp.length; i++) if (s.up[i] === isUp) { xs.push(s.xc[i]); cs.push(s.cp[i]); }
      var order = xs.map(function (_, i) { return i; }).sort(function (a, b) { return xs[a] - xs[b]; });
      xs = order.map(function (i) { return xs[i]; }); cs = order.map(function (i) { return cs[i]; });
      for (var k = 0; k < n; k++) {
        var x = k / (n - 1) * (s.scale || 1), j = 1;
        while (j < xs.length - 1 && xs[j] < x) j++;
        var t = (x - xs[j - 1]) / ((xs[j] - xs[j - 1]) || 1e-9);
        arr[k] = cs[j - 1] + (cs[j] - cs[j - 1]) * Math.max(0, Math.min(1, t));
      }
    }
    fill(up, true); fill(lo, false);
    return { up: up, lo: lo };
  }

  /* ═══ Многозвенное сечение (А320) ═══════════════════════════
     Крыло делится на звенья: предкрылок (0), основная часть (1),
     закрылок Фаулера (2) и спойлер (3) на верхней поверхности над
     закрылком. Убранные, они складываются в исходный профиль; выпущенные
     предкрылок и закрылок — отдельные тела со своей циркуляцией и своим
     условием Жуковского, поток идёт через щели между ними.

     Спойлер в потенциальном потоке не работает: за ним срыв. Его
     показываем моделью «мёртвой зоны»: от кромки спойлера к задней кромке
     идёт граница оторвавшегося потока, под ней — застойная зона с
     постоянным давлением (давление в точке отрыва).

     cut: { slat: [xu, xl], flap: [xu, xl, gap], spoiler: [x0, t] } — где
     режут звенья (доли хорды: по верху и по низу); st — положение:
     { slat: {deg, dx, dy}, flap: {deg, dx, dy}, spoiler: deg, hinges, rot }.
     Звено поворачивается вокруг точки piv (ось дуговой направляющей; без
     неё — предкрылок вокруг своей задней кромки, закрылок вокруг носка) и
     сдвигается на (dx, dy); плюс — вниз. */
  var EL_MAIN = 0, EL_SLAT = 1, EL_FLAP = 2, EL_SPOIL = 3;
  function cosRange(a, b, n) {
    var out = [];
    for (var i = 0; i <= n; i++) out.push(a + (b - a) * (1 - Math.cos(Math.PI * i / n)) / 2);
    return out;
  }
  function bez(p0, p1, p2, p3, n) {
    var out = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
    }
    return out;
  }
  /* кривые разреза: носок основной части под предкрылком и ниша закрылка */
  function cutCurves(f, cut) {
    var out = {};
    if (cut.slat) {
      var su = cut.slat[0], sl = cut.slat[1];
      var U = [su, f.yu(su)], L = [sl, f.yl(sl)], h = U[1] - L[1];
      /* от нижней точки разреза вперёд-вверх, вокруг носка и назад по касательной к верху */
      var tu = [1, (f.yu(su + 0.005) - f.yu(su - 0.005)) / 0.01], tl = Math.hypot(tu[0], tu[1]);
      out.nose = bez(L, [L[0] - 0.012, L[1] + h * 0.30], [U[0] - 0.05 * tu[0] / tl, U[1] - 0.05 * tu[1] / tl], U, 22);
    }
    if (cut.flap) {
      var fu = cut.flap[0], fl = cut.flap[1];
      var PU = [fu, f.yu(fu)], PL = [fl, f.yl(fl)], hh = PU[1] - PL[1];
      /* ниша: от нижней кромки вверх, выгнута вперёд, к кромке спойлера */
      out.cove = bez(PL, [PL[0] - 0.022, PL[1] + hh * 0.35], [PU[0] - 0.05, PU[1] - hh * 0.25], PU, 20);
    }
    return out;
  }
  function tf(pts, piv, deg, dx, dy) {
    var a = (deg || 0) * DEG, c = Math.cos(a), s = Math.sin(a);
    return pts.map(function (p) {
      var x = p[0] - piv[0], y = p[1] - piv[1];
      /* плюс — по часовой: задняя кромка вниз */
      return [piv[0] + x * c + y * s + (dx || 0), piv[1] - x * s + y * c + (dy || 0)];
    });
  }
  /* Звенья в «домашнем» положении: контур по часовой стрелке от задней
     кромки звена; у каждой точки — звено, доля хорды до перемещения и
     сторона (1 — верх, 0 — низ, −1 — внутренние кривые разреза). */
  function body(pts, el, side) { return { pts: pts, el: pts.map(function () { return el; }), home: pts.map(function (p) { return p[0]; }), side: side }; }
  function cat(list) {
    var o = { pts: [], el: [], home: [], side: [] };
    list.forEach(function (b, k) {
      var from = (k && o.pts.length) ? 1 : 0;
      for (var i = from; i < b.pts.length; i++) {
        o.pts.push(b.pts[i]); o.el.push(b.el[i]); o.home.push(b.home[i]);
        o.side.push(typeof b.side === 'number' ? b.side : b.side[i]);
      }
    });
    return o;
  }
  function seg(f, isUp, a, b, n, el) {
    var xs = cosRange(a, b, n), y = isUp ? f.yu : f.yl;
    return body(xs.map(function (x) { return [x, y(x)]; }), el, isUp ? 1 : 0);
  }
  function rev(b) {
    return { pts: b.pts.slice().reverse(), el: b.el.slice().reverse(), home: b.home.slice().reverse(),
      side: typeof b.side === 'number' ? b.side : b.side.slice().reverse() };
  }
  function elementsHome(f, cut, N) {
    N = N || 1;
    var cc = cutCurves(f, cut), out = {};
    var xsU = cut.slat ? cut.slat[0] : 0, xsL = cut.slat ? cut.slat[1] : 0;
    var xfU = cut.flap ? cut.flap[0] : 1, xfL = cut.flap ? cut.flap[1] : 1;
    var nU = Math.round(46 * N), nL = Math.round(40 * N);
    /* основная часть: кромка звена → низ вперёд → носок → верх назад */
    var parts = [];
    if (cut.flap) parts.push(rev(body(cc.cove, EL_MAIN, -1)));
    parts.push(rev(seg(f, false, xsL, xfL, nL, EL_MAIN)));
    if (cut.slat) parts.push(body(cc.nose, EL_MAIN, -1));
    parts.push(seg(f, true, xsU, xfU, nU, EL_MAIN));
    out.main = cat(parts);
    if (cut.slat) {
      out.slat = cat([rev(body(cc.nose, EL_SLAT, -1)), rev(seg(f, false, 0, xsL, Math.round(16 * N), EL_SLAT)), seg(f, true, 0, xsU, Math.round(18 * N), EL_SLAT)]);
      out.slatPiv = [xsU, f.yu(xsU)];
    }
    if (cut.flap) {
      var g = cut.flap[2] || 0.004;
      var nose = body(cc.cove.map(function (p) { return [p[0] + g, p[1]]; }), EL_FLAP, -1);
      nose.home = cc.cove.map(function (p) { return p[0]; });
      out.flap = cat([rev(seg(f, false, xfL + g, 1, Math.round(26 * N), EL_FLAP)), nose, seg(f, true, xfU + g, 1, Math.round(26 * N), EL_FLAP)]);
      var nx = 1e9, np = null;
      out.flap.pts.forEach(function (p) { if (p[0] < nx) { nx = p[0]; np = p; } });
      out.flapPiv = np.slice();
    }
    return out;
  }
  /* Цельный профиль с метками звеньев (всё убрано): по нему же считается
     сечение без механизации, а звенья красятся каждое своей строкой. */
  function plainTagged(f, cut, N) {
    N = N || 1;
    var xsU = cut.slat ? cut.slat[0] : -1, xsL = cut.slat ? cut.slat[1] : -1;
    var xfU = cut.flap ? cut.flap[0] : 2, xfL = cut.flap ? cut.flap[1] : 2;
    var lo = rev(seg(f, false, 0, 1, Math.round(60 * N), EL_MAIN)), up = seg(f, true, 0, 1, Math.round(64 * N), EL_MAIN);
    lo.el = lo.home.map(function (x) { return x < xsL ? EL_SLAT : x > xfL ? EL_FLAP : EL_MAIN; });
    up.el = up.home.map(function (x) { return x < xsU ? EL_SLAT : x > xfU ? EL_FLAP : EL_MAIN; });
    return cat([lo, up]);
  }
  function hingeRot(b, f, hinges, k) {
    (hinges || []).slice().sort(function (a, c) { return c.xh - a.xh; }).forEach(function (h) {
      var xh = h.xh, zh = f.camber(Math.min(1, xh / k)) * k, d = (h.delta || 0) * DEG, W = Math.min(0.03, (k - xh) * 0.25);
      if (!d) return;
      b.pts = b.pts.map(function (p) {
        var t = (p[0] - (xh - W)) / (2 * W), a = t <= 0 ? 0 : t >= 1 ? d : d * t * t * (3 - 2 * t);
        if (!a) return p;
        var dx = p[0] - xh, dy = p[1] - zh, c = Math.cos(a), s = Math.sin(a);
        return [xh + dx * c + dy * s, zh - dx * s + dy * c];
      });
    });
    return b;
  }
  /* Спойлер поднят: верх от оси спойлера до задней кромки звена заменяется
     спойлером и границей отрыва; под ней — застойная зона (cavity). Зона
     замыкается не на задней кромке, а над следом за ней (точка V): там же
     ставится условие Жуковского. Так поток сходит с профиля вверх, как
     при срыве, и циркуляция падает; положение V подобрано по опытным
     данным для спойлеров (ΔCy ≈ −0,1 при 10°, −0,3 при 20°, −0,55 при 40°). */
  var SPV = { kx: 0.10, ky: function (d) { return 0.12 + 0.36 * (1 - Math.exp(-d / 17)); } };
  function spoil(b, f, cut, deg) {
    var x0 = cut.spoiler[0], xe = cut.flap ? cut.flap[0] : 0.8;
    var i0 = -1, iE = b.pts.length - 1;
    for (var i = 0; i < b.pts.length; i++) if (b.side[i] === 1 && b.home[i] >= x0) { i0 = i; break; }
    if (i0 < 0 || !deg) return b;
    var H = b.pts[i0], E = [xe, f.yu(xe)], L = Math.hypot(E[0] - H[0], E[1] - H[1]);
    var th = Math.atan2(E[1] - H[1], E[0] - H[0]) + deg * DEG, sd = Math.sin(deg * DEG);
    var T = [H[0] + L * Math.cos(th), H[1] + L * Math.sin(th)], TE = b.pts[iE];
    var V = [TE[0] + SPV.kx * sd, TE[1] + SPV.ky(deg) * L * sd];
    var plate = [], lip = [], n1 = 8, n2 = 22, n3 = 6, k;
    for (k = 1; k <= n1; k++) plate.push([H[0] + (T[0] - H[0]) * k / n1, H[1] + (T[1] - H[1]) * k / n1]);
    for (k = 0; k < n3; k++) lip.push([V[0] + (TE[0] - V[0]) * k / n3, V[1] + (TE[1] - V[1]) * k / n3]);
    /* граница отрыва: сходит с кромки спойлера по его направлению и ложится к V */
    var c1 = [T[0] + 0.3 * (V[0] - T[0]), T[1] + 0.06 * sd], c2 = [T[0] + 0.75 * (V[0] - T[0]), V[1] + 0.25 * (T[1] - V[1])];
    var free = bez(T, c1, c2, V, n2).slice(1);
    var o = { pts: [], el: [], home: [], side: [] };
    function add(p, e, h, sdv) { o.pts.push(p); o.el.push(e); o.home.push(h); o.side.push(sdv); }
    lip.forEach(function (p) { add(p, -1, p[0], -2); });
    for (k = 0; k <= i0; k++) add(b.pts[k], b.el[k], b.home[k], b.side[k]);
    plate.forEach(function (p, j) { add(p, EL_SPOIL, x0 + (xe - x0) * (j + 1) / n1, 1); });
    free.forEach(function (p) { add(p, -1, p[0], -2); });
    o.cavity = [H].concat(plate, free, lip.slice().reverse(), b.pts.slice(i0 + 1, iE + 1).reverse());
    o.spoilDeg = deg;
    return o;
  }
  /* Щиток: пластина нижней обшивки от x0 до задней кромки отклоняется вниз.
     Поток снизу сходит с кромки щитка (там условие Жуковского), за щитком —
     застойная зона до задней кромки профиля, как за спойлером. */
  var SPLIT = { k: function (d) { return 0.68 - 0.0048 * d; } };
  /* Срыв за изломом простого закрылка: на больших углах поток отрывается на
     оси, над закрылком — застойная зона; граница отрыва замыкается над задней
     кромкой на высоте h·sin(δ − 26°). Срыв начинается после 26° (до этого
     поток в расчёте прилегает); h подобрана так, что эффективность простого
     закрылка по опытным данным ≈ 0,7 при 30°, 0,62 при 35°, 0,56 при 40°. */
  var SEP = { d0: 26, h: function (d) {
    var T = [[26, 0.6], [30, 0.542], [35, 0.339], [40, 0.246]];
    for (var i = 1; i < T.length; i++) if (d <= T[i][0]) return T[i - 1][1] + (T[i][1] - T[i - 1][1]) * (d - T[i - 1][0]) / (T[i][0] - T[i - 1][0]);
    return T[T.length - 1][1];
  } };
  function separate(b, x0, deg) {
    var i0 = -1, iE = b.pts.length - 1, k, over = deg - SEP.d0;
    /* срыв начинается у задней кромки и с углом доходит до оси */
    var xs = 1 - (1 - x0) * Math.max(0.15, Math.min(1, over / 18));
    for (var i = 0; i < b.pts.length; i++) if (b.side[i] === 1 && b.home[i] >= xs) { i0 = i; break; }
    if (i0 < 0 || over <= 0) return b;
    var H = b.pts[i0], TE = b.pts[iE], L = Math.hypot(TE[0] - H[0], TE[1] - H[1]);
    var t0 = [b.pts[i0][0] - b.pts[i0 - 1][0], b.pts[i0][1] - b.pts[i0 - 1][1]], tl = Math.hypot(t0[0], t0[1]);
    var V = [TE[0] + 0.03, TE[1] + SEP.h(deg) * L * Math.sin(over * DEG)];
    var c1 = [H[0] + t0[0] / tl * 0.4 * L, H[1] + t0[1] / tl * 0.4 * L], c2 = [V[0] - 0.3 * L, V[1]];
    var free = bez(H, c1, c2, V, 20).slice(1), lip = [], n3 = 5;
    for (k = 0; k < n3; k++) lip.push([V[0] + (TE[0] - V[0]) * k / n3, V[1] + (TE[1] - V[1]) * k / n3]);
    var o = { pts: [], el: [], home: [], side: [] };
    function add(p, e, h, sd) { o.pts.push(p); o.el.push(e); o.home.push(h); o.side.push(sd); }
    lip.forEach(function (p) { add(p, -1, p[0], -2); });
    for (k = 0; k <= i0; k++) add(b.pts[k], b.el[k], b.home[k], b.side[k]);
    free.forEach(function (p) { add(p, -1, p[0], -2); });
    o.cavity = [H].concat(free, lip.slice().reverse(), b.pts.slice(i0 + 1, iE + 1).reverse());
    o.spoilDeg = over;
    o.sepX0 = xs;
    return o;
  }

  function splitFlap(b, f, cut, deg) {
    var x0 = cut.split[0], iH = -1, k;
    for (var i = 0; i < b.pts.length; i++) if (b.side[i] === 0 && b.home[i] <= x0) { iH = i; break; }
    if (iH < 1 || !deg) return b;
    var H = b.pts[iH], TE = b.pts[0], L = Math.hypot(TE[0] - H[0], TE[1] - H[1]);
    var th = Math.atan2(TE[1] - H[1], TE[0] - H[0]) - deg * DEG;
    var T = [H[0] + L * Math.cos(th), H[1] + L * Math.sin(th)];
    var o = { pts: [], el: [], home: [], side: [] }, n1 = 10, n2 = 8;
    function add(p, e, h, sd) { o.pts.push(p); o.el.push(e); o.home.push(h); o.side.push(sd); }
    for (k = 0; k < n1; k++) { var t = k / n1; add([T[0] + (H[0] - T[0]) * t, T[1] + (H[1] - T[1]) * t], EL_FLAP, 1 - (1 - x0) * t, 0); }
    for (k = iH; k < b.pts.length; k++) add(b.pts[k], b.el[k], b.home[k], b.side[k]);
    for (k = 1; k <= n2; k++) { var u = k / n2 * SPLIT.k(deg); add([TE[0] + (T[0] - TE[0]) * u, TE[1] + (T[1] - TE[1]) * u], -1, 1, -2); }
    /* условие Жуковского — в точке V между кромками профиля и щитка (её место
       подобрано по продувкам: щиток даёт прирост не больше простого закрылка);
       от V к кромке щитка — граница застойной зоны */
    var V = o.pts[o.pts.length - 1], pre = [];
    for (k = 0; k < n2; k++) { var w = k / n2; pre.push([V[0] + (T[0] - V[0]) * w, V[1] + (T[1] - V[1]) * w]); }
    o.pts = pre.concat(o.pts); o.el = pre.map(function () { return -1; }).concat(o.el);
    o.home = pre.map(function () { return 1; }).concat(o.home); o.side = pre.map(function () { return -2; }).concat(o.side);
    o.cavity = [H, T, TE].concat(b.pts.slice(1, iH));
    o.spoilDeg = deg;
    o.splitX0 = x0;
    return o;
  }

  /* Сечение в положении st → тела для решателя */
  function sectionBodies(f, cut, st, N) {
    st = st || {};
    var k = st.scale || 1, bodies;
    var slatOut = cut.slat && st.slat && (st.slat.deg || st.slat.dx || st.slat.dy);
    var flapOut = cut.flap && st.flap && (st.flap.deg || st.flap.dx || st.flap.dy);
    if (!slatOut && !flapOut) {
      var b = plainTagged(f, cut, N);
      hingeRot(b, f, st.hinges, k);
      if (st.spoiler && cut.spoiler) b = spoil(b, f, cut, st.spoiler);
      if (st.split && cut.split) b = splitFlap(b, f, cut, st.split);
      if (st.sep) b = separate(b, st.sep.x0, st.sep.deg);
      bodies = [b];
    } else {
      var H = elementsHome(f, { slat: slatOut ? cut.slat : null, flap: flapOut ? cut.flap : null, spoiler: cut.spoiler }, N);
      var m = H.main;
      if (!slatOut && cut.slat) m.el = m.el.map(function (e, i) { return m.side[i] === 1 ? (m.home[i] < cut.slat[0] ? EL_SLAT : e) : (m.home[i] < cut.slat[1] ? EL_SLAT : e); });
      if (!flapOut) hingeRot(m, f, st.hinges, k);
      bodies = [m];
      if (slatOut) { var sb = H.slat; sb.pts = tf(sb.pts, st.slat.piv || H.slatPiv, -st.slat.deg, st.slat.dx, st.slat.dy); bodies.unshift(sb); }
      if (flapOut) { var fb = H.flap; fb.pts = tf(fb.pts, st.flap.piv || H.flapPiv, st.flap.deg, st.flap.dx, st.flap.dy); bodies.push(fb); }
    }
    if (st.rot) bodies.forEach(function (b2) { b2.pts = tf(b2.pts, st.rot.piv, st.rot.deg, 0, 0); });
    return bodies;
  }

  /* Хесс — Смит для нескольких тел: у каждого своя циркуляция и своё
     условие Жуковского на первой и последней панели. */
  function solveBodies(bodies, alphaDeg) {
    var a = (alphaDeg || 0) * DEG, Ux = Math.cos(a), Uy = Math.sin(a);
    var P = [], tmp = [0, 0, 0, 0], K = bodies.length;
    bodies.forEach(function (b, bi) {
      b.first = P.length;
      for (var i = 0; i + 1 < b.pts.length; i++) {
        var p1 = b.pts[i], p2 = b.pts[i + 1], dx = p2[0] - p1[0], dy = p2[1] - p1[1], l = Math.sqrt(dx * dx + dy * dy);
        if (l < 1e-7) continue;
        P.push({ b: bi, x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], l: l, xc: (p1[0] + p2[0]) / 2, yc: (p1[1] + p2[1]) / 2,
          tx: dx / l, ty: dy / l, nx: -dy / l, ny: dx / l,
          el: b.el[i] === -1 || b.el[i + 1] === -1 ? -1 : b.el[i], home: (b.home[i] + b.home[i + 1]) / 2,
          side: b.side[i] === b.side[i + 1] ? b.side[i] : (b.side[i] < 0 || b.side[i + 1] < 0 ? Math.min(b.side[i], b.side[i + 1]) : b.side[i + 1]) });
      }
      b.last = P.length - 1;
    });
    var N = P.length, M = N + K, A = [], rhs = [], At = [], Bt = [], i, j;
    for (i = 0; i < N; i++) {
      var row = new Array(M).fill(0), rowT = new Array(M).fill(0), pi = P[i];
      for (j = 0; j < N; j++) {
        var pj = P[j];
        panelVel(pi.xc, pi.yc, pj.x1, pj.y1, pj.x2, pj.y2, tmp, i === j);
        row[j] = tmp[0] * pi.nx + tmp[1] * pi.ny;
        rowT[j] = tmp[0] * pi.tx + tmp[1] * pi.ty;
        row[N + pj.b] += tmp[2] * pi.nx + tmp[3] * pi.ny;
        rowT[N + pj.b] += tmp[2] * pi.tx + tmp[3] * pi.ty;
      }
      A.push(row); At.push(rowT);
      rhs.push(-(Ux * pi.nx + Uy * pi.ny));
    }
    bodies.forEach(function (b) {
      var f0 = b.first, l0 = b.last, kr = new Array(M);
      for (j = 0; j < M; j++) kr[j] = At[f0][j] + At[l0][j];
      A.push(kr);
      rhs.push(-(Ux * (P[f0].tx + P[l0].tx) + Uy * (P[f0].ty + P[l0].ty)));
    });
    var x = solveLinear(A, rhs), cl = 0, cm = 0;
    P.forEach(function (p, ii) {
      var v = Ux * p.tx + Uy * p.ty;
      for (j = 0; j < M; j++) v += x[j] * At[ii][j];
      p.vt = v; p.cp = 1 - v * v;
      var fx = -p.cp * p.nx * p.l, fy = -p.cp * p.ny * p.l;
      cl += -fx * Uy + fy * Ux;
      cm += -(fy * (p.xc - 0.25) - fx * p.yc);
    });
    function field(px, py, out) {
      var u = Ux, w = Uy;
      for (var jj = 0; jj < N; jj++) {
        var q = P[jj];
        panelVel(px, py, q.x1, q.y1, q.x2, q.y2, tmp, false);
        u += x[jj] * tmp[0] + x[N + q.b] * tmp[2];
        w += x[jj] * tmp[1] + x[N + q.b] * tmp[3];
      }
      out[0] = u; out[1] = w;
      return out;
    }
    return { panels: P, bodies: bodies, cl: cl, cm: cm, field: field };
  }

  /* Сечение А320 в положении st: решение, таблицы Cp по звеньям и
     застойная зона спойлера. */
  function solveSection(o) {
    var bodies = sectionBodies(o.foil, o.cut || {}, o.st, o.N);
    var r = solveBodies(bodies, o.alpha);
    var cav = (bodies.filter(function (b) { return b.cavity; })[0] || {}).cavity || null;
    var base = null;
    if (cav) {
      /* давление в застойной зоне — по опытным данным, слабое разрежение */
      var sp = bodies.filter(function (b) { return b.cavity; })[0].spoilDeg;
      base = -0.12 - 0.3 * Math.sin(sp * DEG);
    }
    r.cavity = cav; r.base = base; r.scale = o.st && o.st.scale || 1; r.alpha = o.alpha; r.multi = true;
    r.spoilX0 = o.cut && o.cut.spoiler ? o.cut.spoiler[0] : 0.6;
    r.splitX0 = (bodies.filter(function (b) { return b.splitX0; })[0] || {}).splitX0 || null;
    r.sepX0 = (bodies.filter(function (b) { return b.sepX0; })[0] || {}).sepX0 || null;
    if (r.sepX0) r.spoilX0 = r.sepX0;
    r.isIn = function (x, y) {
      for (var i = 0; i < bodies.length; i++) if (inside(bodies[i].pts, x, y)) return true;
      return !!(cav && inside(cav, x, y));
    };
    r.inCavity = function (x, y) { return !!(cav && inside(cav, x, y)); };
    r.bounds = function () {
      var x0 = 1e9, x1 = -1e9;
      bodies.forEach(function (b) { b.pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }); });
      return [x0, x1];
    };
    return r;
  }
  /* Cp по доле хорды (домашней) для каждого звена: верх и низ.
     Верх за осью поднятого спойлера — давление застойной зоны. */
  function cpTables(s, n, NE) {
    var out = [];
    for (var e = 0; e < NE; e++) {
      var t = { up: new Float32Array(n), lo: new Float32Array(n) };
      [1, 0].forEach(function (side) {
        var arr = side ? t.up : t.lo, xs = [], cs = [];
        s.panels.forEach(function (p) {
          var pe = p.el;
          if (p.side !== side) return;
          if (e === EL_SPOIL ? pe !== EL_SPOIL : (pe !== e)) return;
          xs.push(p.home); cs.push(p.cp);
        });
        /* у спойлера низ — в застойной зоне; у звена без своих панелей — как основная часть */
        if (!xs.length) {
          var src = e === EL_SPOIL && !side && s.base != null ? null : (e ? out[EL_MAIN] : null);
          for (var k = 0; k < n; k++) arr[k] = src ? (side ? src.up : src.lo)[k] : (s.base != null ? s.base : 0);
          if (e === EL_SPOIL && side && !s.base && out[EL_MAIN]) arr.set(out[EL_MAIN].up);
          return;
        }
        var ord = xs.map(function (_, i) { return i; }).sort(function (a, b) { return xs[a] - xs[b]; });
        xs = ord.map(function (i) { return xs[i]; }); cs = ord.map(function (i) { return cs[i]; });
        for (var k2 = 0; k2 < n; k2++) {
          var x = k2 / (n - 1), j = 1;
          while (j < xs.length - 1 && xs[j] < x) j++;
          var tt = (x - xs[j - 1]) / ((xs[j] - xs[j - 1]) || 1e-9);
          arr[k2] = cs[j - 1] + (cs[j] - cs[j - 1]) * Math.max(0, Math.min(1, tt));
        }
      });
      out.push(t);
    }
    if (s.base != null && s.splitX0) {
      /* щиток: ниша над ним и его внутренняя сторона — в застойной зоне */
      for (var k4 = 0; k4 < n; k4++) {
        if (k4 / (n - 1) >= s.splitX0) out[EL_MAIN].lo[k4] = s.base;
        if (out[EL_FLAP]) out[EL_FLAP].up[k4] = s.base;
      }
    } else if (s.base != null) {
      /* верх основной части за спойлером и сам низ спойлера — в застойной зоне */
      var x0 = s.spoilX0 || 0.6;
      for (var k3 = 0; k3 < n; k3++) {
        var xx = k3 / (n - 1);
        if (xx >= x0) { out[EL_MAIN].up[k3] = s.base; out[EL_FLAP] && (out[EL_FLAP].up[k3] = s.base); }
        out[EL_SPOIL].lo[k3] = s.base;
      }
    }
    return out;
  }

  var api = { foil: foil, naca: naca, contour: contour, solve: solve, grid: grid, sample: sample, cpTable: cpTable, inside: inside, hingeMoment: hingeMoment,
    elementsHome: elementsHome, cutCurves: cutCurves, sectionBodies: sectionBodies, solveBodies: solveBodies, solveSection: solveSection, cpTables: cpTables,
    EL: { MAIN: EL_MAIN, SLAT: EL_SLAT, FLAP: EL_FLAP, SPOIL: EL_SPOIL }, SPV: SPV, SPLIT: SPLIT, SEP: SEP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Airflow = api;
})(this);
