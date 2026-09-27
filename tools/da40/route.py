"""Поиск трассы шланга или жгута в тесном месте.

A* по сетке с шагом `step`: клетка годится, если до ближайшей поверхности
(обшивка, отделка, соседние системы) не меньше r + margin и, когда нужно
скрыть трассу, её не видно ни из одной точки обзора в кабине. Путь потом
спрямляется: от каждой точки берётся самый дальний прямой участок, который
ещё проходит проверку, — остаются несколько опорных точек под `fillet`.

Отделка салона — «мягкое» препятствие: сквозь внутренние панели шланг
идти может (в настоящем самолёте там вырезы), но только там, где это не
видно из кабины, и за это начисляется штраф.

    rt = Router([shell_bvh, systems_bvh], [shell_bvh, trim_bvh], eyes, soft=[trim_bvh])
    pts = rt.route(a, b, r=0.016, lo=(...), hi=(...))
"""
import heapq
import math

from mathutils import Vector as V


AXES = ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))


class Router:
    def __init__(self, solids, occluders, eyes, soft=(), step=0.012):
        self.solids = solids          # BVH, до которых меряется зазор
        self.soft = soft              # отделка: пересекать можно со штрафом, если не видно
        self.occluders = occluders    # BVH, которые закрывают вид из кабины
        self.eyes = [V(e) for e in eyes]
        self.step = step
        self.extra = None             # уже проложенные шланги этого же слоя
        self._free = {}
        self._soft = {}
        self._seen = {}

    def set_extra(self, bvh):
        """Добавить уже построенные детали слоя как препятствие (кеш зазоров сбрасывается)."""
        self.extra = bvh
        self._free = {}

    @staticmethod
    def _near(bvhs, q):
        m = 9.0
        for b in bvhs:
            h = b.find_nearest(q, 0.25)
            if h[0] is not None and h[3] < m:
                m = h[3]
        return m

    def free(self, q):
        k = (round(q.x, 3), round(q.y, 3), round(q.z, 3))
        if k not in self._free:
            self._free[k] = self._near(list(self.solids) + ([self.extra] if self.extra else []), q)
        return self._free[k]

    def soft_free(self, q):
        k = (round(q.x, 3), round(q.y, 3), round(q.z, 3))
        if k not in self._soft:
            self._soft[k] = self._near(self.soft, q)
        return self._soft[k]

    def seen(self, q, r=0.0):
        """Видна ли поверхность трубы радиуса r с центром в q хоть из одной точки обзора
        (проверяются шесть точек на поверхности по осям)."""
        k = (round(q.x, 3), round(q.y, 3), round(q.z, 3), round(r, 3))
        if k not in self._seen:
            vis = False
            pts = [q] if r <= 0 else [q + V(d) * r for d in AXES]
            for e in self.eyes:
                for t in pts:
                    d = t - e
                    L = d.length - 0.003
                    if L <= 0 or all(b.ray_cast(e, d.normalized(), L)[0] is None for b in self.occluders):
                        vis = True
                        break
                if vis:
                    break
            self._seen[k] = vis
        return self._seen[k]

    def ok(self, q, r, margin, hidden, relax):
        for c, rad in relax:
            if (q - c).length < rad:
                return True
        if self.free(q) < r + margin:
            return False
        if hidden and self.seen(q, r):
            return False
        return True

    def seg_ok(self, a, b, r, margin, hidden, relax, ds=0.005):
        n = max(1, int((b - a).length / ds))
        return all(self.ok(a.lerp(b, i / n), r, margin, hidden, relax) for i in range(n + 1))

    def route(self, a, b, r, lo, hi, margin=0.003, hidden=True, relax=(), prefer=0.012, max_nodes=400000):
        """Опорные точки трассы от a до b (включая концы) или None."""
        a, b = V(a), V(b)
        relax = [(V(c), rad) for c, rad in relax] + [(a, r + 0.02), (b, r + 0.02)]
        s = self.step
        lo, hi = V(lo), V(hi)

        def pos(k):
            return a + V(k) * s

        def inside(q):
            return all(lo[i] <= q[i] <= hi[i] for i in range(3))

        dirs = [(i, j, k) for i in (-1, 0, 1) for j in (-1, 0, 1) for k in (-1, 0, 1) if (i, j, k) != (0, 0, 0)]
        start = (0, 0, 0)
        g = {start: 0.0}
        came = {}
        h0 = (b - a).length
        heap = [(h0, 0.0, start)]
        done = set()
        goal = None
        while heap and len(done) < max_nodes:
            _, gc, k = heapq.heappop(heap)
            if k in done:
                continue
            done.add(k)
            q = pos(k)
            if (q - b).length <= s * 1.5:
                goal = k
                break
            for d in dirs:
                nk = (k[0] + d[0], k[1] + d[1], k[2] + d[2])
                if nk in done:
                    continue
                nq = pos(nk)
                if not inside(nq) or not self.ok(nq, r, margin, hidden, relax):
                    continue
                step_len = s * math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2])
                # держаться середины прохода: штраф за клетки у самой стенки
                fr = min(self.free(nq), self.soft_free(nq) if self.soft else 9.0)
                pen = max(0.0, (r + margin + prefer) - fr) / prefer if prefer else 0.0
                if self.soft and self.soft_free(nq) < r:
                    pen += 1.0          # сквозь внутреннюю панель отделки (там вырез)
                ng = gc + step_len * (1.0 + 1.0 * pen)
                if ng < g.get(nk, 1e9):
                    g[nk] = ng
                    came[nk] = k
                    heapq.heappush(heap, (ng + (nq - b).length, ng, nk))
        if goal is None:
            print(f'ROUTE FAIL {tuple(round(v, 3) for v in a)} -> {tuple(round(v, 3) for v in b)}: {len(done)} nodes')
            return None
        path = [b]
        k = goal
        while k in came:
            path.append(pos(k))
            k = came[k]
        path.append(a)
        path.reverse()
        # спрямление: самый дальний прямой участок от каждой точки
        out = [path[0]]
        i = 0
        while i < len(path) - 1:
            j = len(path) - 1
            while j > i + 1 and not self.seg_ok(path[i], path[j], r, margin, hidden, relax):
                j -= 1
            out.append(path[j])
            i = j
        return self.smooth(out, r, margin, hidden, relax)

    def smooth(self, pts, r, margin, hidden, relax, iters=40):
        """«Резинка»: промежуточные точки тянутся к середине соседей, лишние выбрасываются,
        пока каждый участок проходит проверку."""
        pts = [V(p) for p in pts]
        for _ in range(iters):
            moved = False
            for i in range(1, len(pts) - 1):
                target = (pts[i - 1] + pts[i + 1]) / 2
                for f in (0.5, 0.25):
                    cand = pts[i].lerp(target, f)
                    if (cand - pts[i]).length < 1e-4:
                        break
                    if self.seg_ok(pts[i - 1], cand, r, margin, hidden, relax) and \
                            self.seg_ok(cand, pts[i + 1], r, margin, hidden, relax):
                        pts[i] = cand
                        moved = True
                        break
            i = 1
            while i < len(pts) - 1:
                if self.seg_ok(pts[i - 1], pts[i + 1], r, margin, hidden, relax):
                    del pts[i]
                    moved = True
                else:
                    i += 1
            if not moved:
                break
        return pts
