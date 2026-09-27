"""Сечения внутри крыла: контур между лонжеронами по внутренней поверхности
обшивки. Общие для бака (fuel.py) и нервюр (wing.py), чтобы вырез нервюры
и бак совпадали по построению, а не по подгонке."""
import math

from mathutils import Vector as V

T_SKIN = 0.010      # сэндвич обшивки: углепластик, пенопласт, стеклопластик (AMM 57-10 2.A)
Y_F = 0.112         # за полкой переднего лонжерона
TANK_CLR = 0.0083   # зазор бака до обшивки: даёт 56,8 л (подбирается в fuel.py и сверяется)
RC = 0.045          # радиус скругления рёбер бака (сечение почти «стадион», AMM 05-25 рис. 7 вид A)


class Sections:
    def __init__(self, R):
        self.R = R

    def up_in(self, X, y):
        return self.R.skin(X, y, 'upper')[0].z - T_SKIN

    def lo_in(self, X, y):
        return self.R.skin(X, y, 'lower')[0].z + T_SKIN

    def rear_y(self, X):
        """Передняя грань стенки заднего лонжерона минус полка пояса."""
        X = math.copysign(max(abs(X), 1.33), X)
        lo, up = self.R.wing_section(X, 0.28)
        return self.R.spar_faces(X, (lo + up) / 2)[1] - 0.034

    def raw(self, X, off, y0=None, y1=None, K=9):
        y0 = Y_F if y0 is None else y0
        y1 = self.rear_y(X) if y1 is None else y1
        ys = [y0 + (y1 - y0) * i / (K - 1) for i in range(K)]
        bot = [V((X, y, self.lo_in(X, y) + off)) for y in ys]
        top = [V((X, y, self.up_in(X, y) - off)) for y in reversed(ys)]
        return bot, top

    def ring(self, X, off, n=56, rc=RC, y0=None, y1=None, K=12):
        """Замкнутый контур из n точек, старт с середины днища.

        Углы — честные дуги радиуса rc (не больше половины местной высоты:
        при большом rc сечение становится «стадионом»), верх и низ идут по
        внутренней поверхности обшивки."""
        y0 = Y_F if y0 is None else y0
        y1 = self.rear_y(X) if y1 is None else y1
        zb = lambda y: self.lo_in(X, y) + off  # noqa: E731
        zt = lambda y: self.up_in(X, y) - off  # noqa: E731
        r = min(rc, (y1 - y0) * 0.49, (zt(y0) - zb(y0)) * 0.49, (zt(y1) - zb(y1)) * 0.49)
        pts = []

        def arc(cy, cz, a0, a1, m=8):
            for i in range(m + 1):
                a = math.radians(a0 + (a1 - a0) * i / m)
                pts.append(V((X, cy + r * math.cos(a), cz + r * math.sin(a))))

        ym = (y0 + y1) / 2
        for i in range(K + 1):                      # низ: от середины назад
            y = ym + (y1 - r - ym) * i / K
            pts.append(V((X, y, zb(y))))
        arc(y1 - r, zb(y1 - r) + r, -90, 0)
        arc(y1 - r, zt(y1 - r) - r, 0, 90)
        for i in range(2 * K + 1):                  # верх: назад → вперёд
            y = (y1 - r) + ((y0 + r) - (y1 - r)) * i / (2 * K)
            pts.append(V((X, y, zt(y))))
        arc(y0 + r, zt(y0 + r) - r, 90, 180)
        arc(y0 + r, zb(y0 + r) + r, 180, 270)
        for i in range(K + 1):                      # низ: спереди к середине
            y = (y0 + r) + (ym - (y0 + r)) * i / K
            pts.append(V((X, y, zb(y))))
        clean = [pts[0]]
        for q in pts[1:]:
            if (q - clean[-1]).length > 1e-6:
                clean.append(q)
        return resample_open(clean, n)


def resample_open(f, n):
    L = [0.0]
    for i in range(1, len(f)):
        L.append(L[-1] + (f[i] - f[i - 1]).length)
    tot = L[-1]
    out, j = [], 0
    for i in range(n):
        s = tot * i / n
        while j < len(L) - 2 and L[j + 1] < s:
            j += 1
        t = 0 if L[j + 1] == L[j] else (s - L[j]) / (L[j + 1] - L[j])
        out.append(f[j].lerp(f[j + 1], t))
    return out


def resample_closed(poly, n):
    return resample_open(poly + [poly[0]], n)


def shrink(ring, d):
    c = sum(ring, V()) / len(ring)
    return [c + (p - c) * max(0.0, 1 - d / max(1e-6, (p - c).length)) for p in ring]


def loft(p, rings, mi, caps=True, smooth=True):
    bm = p.bm
    vs = [[bm.verts.new(q) for q in r] for r in rings]
    n = len(rings[0])
    for a, b in zip(vs, vs[1:]):
        for i in range(n):
            f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
            f.material_index = mi
            f.smooth = smooth
    if caps:
        for r, vr, flip in ((rings[0], vs[0], True), (rings[-1], vs[-1], False)):
            c = bm.verts.new(sum(r, V()) / len(r))
            for i in range(n):
                tri = (c, vr[i], vr[(i + 1) % n]) if not flip else (c, vr[(i + 1) % n], vr[i])
                f = bm.faces.new(tri)
                f.material_index = mi
                f.smooth = False


def plate_with_hole(p, outer, inner, axis, t, mi, mi_rim=None):
    """Плоская деталь толщиной t: наружный контур outer, вырез inner (оба по n точек)."""
    axis = V(axis).normalized()
    h = axis * (t / 2)
    bm = p.bm
    of = [bm.verts.new(q - h) for q in outer]
    ob = [bm.verts.new(q + h) for q in outer]
    n = len(outer)
    rim = mi if mi_rim is None else mi_rim
    if inner is None:
        f = bm.faces.new(of[::-1]); f.material_index = mi; f.smooth = False
        f = bm.faces.new(ob); f.material_index = mi; f.smooth = False
    else:
        inf = [bm.verts.new(q - h) for q in inner]
        inb = [bm.verts.new(q + h) for q in inner]
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((of[j], of[i], inf[i], inf[j])); f.material_index = mi; f.smooth = False
            f = bm.faces.new((ob[i], ob[j], inb[j], inb[i])); f.material_index = mi; f.smooth = False
            f = bm.faces.new((inf[i], inb[i], inb[j], inf[j])); f.material_index = rim; f.smooth = True
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new((of[i], of[j], ob[j], ob[i])); f.material_index = rim; f.smooth = True


def ellipse(c, ay, az, n, phase=-math.pi / 2):
    """Эллипс в плоскости YZ, старт снизу — как у ring()."""
    return [V((c.x, c.y + ay * math.cos(phase + 2 * math.pi * i / n), c.z + az * math.sin(phase + 2 * math.pi * i / n)))
            for i in range(n)]
