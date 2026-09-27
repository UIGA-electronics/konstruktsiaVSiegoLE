"""Детали для процедурной сборки систем DA 40 NG в Blender (bpy).

Всё строится в мировых координатах исходника: X — влево, Y — назад, Z — вверх.
Каждая функция примитива дописывает геометрию в переданный bmesh, так что
деталь из нескольких примитивов остаётся одним объектом с одним именем.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix

V = Vector
UP = V((0, 0, 1))


# ── Коллекции, материалы, объекты ─────────────────────────────────────────

def collection(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


_MATS = {}
MAT_RU = {}


def mat(name, rgb, metal=0.0, rough=0.5, alpha=1.0, emit=None, ru=None):
    if ru:
        MAT_RU[name] = ru
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*rgb, 1.0)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if alpha < 1.0:
        b.inputs['Alpha'].default_value = alpha
        for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
            if hasattr(m, attr):
                try:
                    setattr(m, attr, val)
                except Exception:
                    pass
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1.0)
        b.inputs['Emission Strength'].default_value = 1.0
    m.diffuse_color = (*rgb, alpha)
    _MATS[name] = m
    return m


LABELS = {}


class Part:
    """Одна деталь = один объект. p = Part(name, ru, material); p.bm — bmesh."""

    def __init__(self, name, ru, material, col, smooth=True, doc=None):
        self.name, self.ru, self.col, self.smooth, self.doc = name, ru, col, smooth, doc
        self.mats = [material] if not isinstance(material, (list, tuple)) else list(material)
        self.bm = bmesh.new()

    def m(self, material):
        """Индекс материала для следующих граней (добавляет, если нет)."""
        if material not in self.mats:
            self.mats.append(material)
        return self.mats.index(material)

    def done(self):
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-6)
        self.bm.to_mesh(me)
        self.bm.free()
        for mt in self.mats:
            me.materials.append(mt)
        if self.smooth:
            for p in me.polygons:
                p.use_smooth = True
            try:
                me.set_sharp_from_angle(angle=math.radians(40))
            except Exception:
                pass
        ob = bpy.data.objects.new(self.name, me)
        self.col.objects.link(ob)
        if self.ru:
            label = self.ru + (f' ({self.doc})' if self.doc else '')
            ob['ru'] = label
            LABELS[self.name] = label
        return ob


# ── Базис по направлению ──────────────────────────────────────────────────

def basis(d, up=None):
    """Матрица 3×3, у которой ось Z смотрит вдоль d."""
    d = V(d).normalized()
    ref = V(up) if up is not None else (V((0, 0, 1)) if abs(d.z) < 0.9 else V((1, 0, 0)))
    x = ref.cross(d)
    if x.length < 1e-6:
        x = V((1, 0, 0)).cross(d)
    x.normalize()
    y = d.cross(x)
    return Matrix((x, y, d)).transposed()


def _ring(bm, c, R, segs, r, mi, phase=0.0):
    out = []
    for i in range(segs):
        a = phase + 2 * math.pi * i / segs
        out.append(bm.verts.new(c + R @ V((r * math.cos(a), r * math.sin(a), 0))))
    return out


def _bridge(bm, a, b, mi, smooth=True):
    n = len(a)
    for i in range(n):
        f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
        f.material_index = mi
        f.smooth = smooth


def _cap(bm, ring, mi, flip=False):
    f = bm.faces.new(ring[::-1] if flip else ring)
    f.material_index = mi
    f.smooth = False
    return f


# ── Примитивы ─────────────────────────────────────────────────────────────

def cyl(p, p0, p1, r, mi=0, segs=20, r1=None, caps=True, smooth=True, up=None):
    """Цилиндр/конус от p0 до p1."""
    p0, p1 = V(p0), V(p1)
    R = basis(p1 - p0, up)
    a = _ring(p.bm, p0, R, segs, r, mi)
    b = _ring(p.bm, p1, R, segs, r if r1 is None else r1, mi)
    _bridge(p.bm, a, b, mi, smooth)
    if caps:
        _cap(p.bm, a, mi, flip=True)
        _cap(p.bm, b, mi)
    return a, b


def hexa(p, p0, p1, af, mi=0):
    """Шестигранник «под ключ» af (размер под ключ) от p0 до p1."""
    r = af / 2 / math.cos(math.pi / 6)
    return cyl(p, p0, p1, r, mi, segs=6, smooth=False)


def ring_tube(p, c, axis, r_out, r_in, width, mi=0, segs=28):
    """Кольцо прямоугольного сечения (лента хомута, фланец, шайба)."""
    c, axis = V(c), V(axis).normalized()
    R = basis(axis)
    h = axis * width / 2
    oa = _ring(p.bm, c - h, R, segs, r_out, mi)
    ob = _ring(p.bm, c + h, R, segs, r_out, mi)
    ia = _ring(p.bm, c - h, R, segs, r_in, mi)
    ib = _ring(p.bm, c + h, R, segs, r_in, mi)
    _bridge(p.bm, oa, ob, mi)
    _bridge(p.bm, ib, ia, mi)
    _bridge(p.bm, ob, ib, mi, False)
    _bridge(p.bm, ia, oa, mi, False)


def torus(p, c, axis, R_, r, mi=0, segs=32, rsegs=10):
    c = V(c)
    Rm = basis(axis)
    rings = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        cc = c + Rm @ V((R_ * math.cos(a), R_ * math.sin(a), 0))
        t = Rm @ V((-math.sin(a), math.cos(a), 0))
        rings.append(_ring(p.bm, cc, basis(t, up=Rm @ V((0, 0, 1))), rsegs, r, mi))
    for i in range(segs):
        _bridge(p.bm, rings[i], rings[(i + 1) % segs], mi)


def sphere(p, c, r, mi=0, segs=16, rings=8, zscale=1.0, axis=None):
    c = V(c)
    Rm = basis(axis) if axis else Matrix.Identity(3)
    layers = []
    for j in range(1, rings):
        th = math.pi * j / rings
        z = r * math.cos(th) * zscale
        rr = r * math.sin(th)
        layers.append([p.bm.verts.new(c + Rm @ V((rr * math.cos(2 * math.pi * i / segs),
                                                   rr * math.sin(2 * math.pi * i / segs), z)))
                       for i in range(segs)])
    top = p.bm.verts.new(c + Rm @ V((0, 0, r * zscale)))
    bot = p.bm.verts.new(c + Rm @ V((0, 0, -r * zscale)))
    for i in range(segs):
        f = p.bm.faces.new((top, layers[0][i], layers[0][(i + 1) % segs])); f.material_index = mi; f.smooth = True
        f = p.bm.faces.new((bot, layers[-1][(i + 1) % segs], layers[-1][i])); f.material_index = mi; f.smooth = True
    for j in range(len(layers) - 1):
        _bridge(p.bm, layers[j + 1], layers[j], mi)


def box(p, c, size, R=None, mi=0, bevel=0.0, segs=2):
    """Параллелепипед size=(sx, sy, sz) с центром c и поворотом R (3×3)."""
    R = R or Matrix.Identity(3)
    c = V(c)
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1.0)
    for v in tmp.verts:
        v.co = V((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel > 0:
        bmesh.ops.bevel(tmp, geom=list(tmp.verts) + list(tmp.edges), offset=bevel,
                        segments=segs, affect='EDGES', profile=0.5)
    _merge(p, tmp, lambda co: c + R @ co, mi, smooth=bevel > 0)


def _merge(p, tmp, xf, mi, smooth=False):
    vmap = {}
    for v in tmp.verts:
        vmap[v] = p.bm.verts.new(xf(v.co))
    for f in tmp.faces:
        nf = p.bm.faces.new([vmap[v] for v in f.verts])
        nf.material_index = mi
        nf.smooth = smooth
    tmp.free()


def screw(p, c, n, d=0.005, mi=0):
    """Головка винта с полукруглой шляпкой на поверхности с нормалью n."""
    n = V(n).normalized()
    sphere(p, V(c) + n * 0.0004, d / 2, mi, segs=10, rings=5, zscale=0.45, axis=n)


# ── Трубы по трассе ───────────────────────────────────────────────────────

def fillet(points, radius, step_deg=10):
    """Ломаная → ломаная со скруглёнными углами радиуса radius."""
    pts = [V(q) for q in points]
    if len(pts) < 3 or radius <= 0:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, b, c = pts[i - 1], pts[i], pts[i + 1]
        u1 = (b - a).normalized()
        u2 = (c - b).normalized()
        cosang = max(-1.0, min(1.0, u1.dot(u2)))
        th = math.acos(cosang)
        if th < 1e-3:
            out.append(b)
            continue
        t = radius * math.tan(th / 2)
        lim = min((b - a).length, (c - b).length) * 0.49
        r = radius
        if t > lim:
            t = lim
            r = t / math.tan(th / 2)
        s, e = b - u1 * t, b + u2 * t
        nrm = (u2 - u1).normalized()
        cen = s + nrm * r
        n = max(2, int(math.degrees(th) / step_deg) + 1)
        v0, v1 = s - cen, e - cen
        for k in range(n + 1):
            f = k / n
            out.append(cen + _slerp(v0, v1, f))
    out.append(pts[-1])
    clean = [out[0]]
    for q in out[1:]:
        if (q - clean[-1]).length > 1e-5:
            clean.append(q)
    return clean


def _slerp(a, b, f):
    la, lb = a.length, b.length
    an, bn = a.normalized(), b.normalized()
    d = max(-1.0, min(1.0, an.dot(bn)))
    om = math.acos(d)
    if om < 1e-6:
        return a * (1 - f) + b * f
    s = math.sin(om)
    v = an * (math.sin((1 - f) * om) / s) + bn * (math.sin(f * om) / s)
    return v * (la * (1 - f) + lb * f)



def sweep(p, path, r, mi=0, segs=14, caps=True):
    """Труба радиуса r вдоль готовой (уже скруглённой) ломаной path."""
    P = [V(q) for q in path]
    n = len(P)
    T = []
    for i in range(n):
        if i == 0:
            t = P[1] - P[0]
        elif i == n - 1:
            t = P[-1] - P[-2]
        else:
            t = (P[i + 1] - P[i]).normalized() + (P[i] - P[i - 1]).normalized()
        T.append(t.normalized())
    R = basis(T[0])
    rings = []
    for i in range(n):
        if i > 0:
            # перенос рамки без кручения (двойное отражение)
            v1 = P[i] - P[i - 1]
            c1 = v1.dot(v1)
            x = V(R.col[0])
            y = V(R.col[1])
            tl = T[i - 1]
            xL = x - v1 * (2 / c1 * v1.dot(x))
            tL = tl - v1 * (2 / c1 * v1.dot(tl))
            v2 = T[i] - tL
            c2 = v2.dot(v2)
            xn = xL - v2 * (2 / c2 * v2.dot(xL)) if c2 > 1e-12 else xL
            xn = (xn - T[i] * xn.dot(T[i])).normalized()
            yn = T[i].cross(xn)
            R = Matrix((xn, yn, T[i])).transposed()
        rings.append(_ring(p.bm, P[i], R, segs, r, mi))
    for i in range(n - 1):
        _bridge(p.bm, rings[i], rings[i + 1], mi)
    if caps:
        _cap(p.bm, rings[0], mi, flip=True)
        _cap(p.bm, rings[-1], mi)
    return P, T


def pipe(p, points, r, bend, mi=0, segs=14, caps=True):
    path = fillet(points, bend)
    return sweep(p, path, r, mi, segs, caps)


def path_len(path):
    return sum((V(path[i + 1]) - V(path[i])).length for i in range(len(path) - 1))


def along(path, s):
    """Точка и касательная на расстоянии s от начала ломаной."""
    path = [V(q) for q in path]
    acc = 0.0
    for i in range(len(path) - 1):
        seg = path[i + 1] - path[i]
        L = seg.length
        if acc + L >= s or i == len(path) - 2:
            f = 0 if L == 0 else min(1.0, max(0.0, (s - acc) / L))
            return path[i] + seg * f, seg.normalized()
        acc += L
    return path[-1], (path[-1] - path[-2]).normalized()


# ── Арматура ──────────────────────────────────────────────────────────────

def an_end(p, pos, d, tube_r, mi_nut, mi_sock=None, dash=None):
    """Наконечник шланга/трубки AN: гильза, накидная гайка, ниппель.

    pos — торец шланга, d — направление наружу (от шланга к штуцеру)."""
    d = V(d).normalized()
    pos = V(pos)
    ms = mi_nut if mi_sock is None else mi_sock
    af = max(0.011, tube_r * 2.6)
    cyl(p, pos - d * tube_r * 3.2, pos, tube_r * 1.35, ms, segs=16)
    hexa(p, pos, pos + d * af * 0.7, af, mi_nut)
    cyl(p, pos + d * af * 0.7, pos + d * af * 1.05, tube_r * 0.9, mi_nut, segs=14)


def an_union(p, pos, d, tube_r, mi, length=None):
    """Проходной/переборочный штуцер: шестигранник и два ниппеля."""
    d = V(d).normalized()
    pos = V(pos)
    af = max(0.012, tube_r * 2.8)
    L = length or af * 2.2
    cyl(p, pos - d * L / 2, pos + d * L / 2, tube_r * 0.95, mi, segs=14)
    hexa(p, pos - d * af * 0.3, pos + d * af * 0.3, af, mi)


def worm_clamp(p, c, axis, r, width=0.009, mi=0, screw_dir=None):
    """Червячный хомут: лента и корпус винта."""
    c, axis = V(c), V(axis).normalized()
    ring_tube(p, c, axis, r + 0.0012, r, width, mi, segs=32)
    sd = V(screw_dir) if screw_dir is not None else basis(axis).col[1]
    sd = (sd - axis * sd.dot(axis)).normalized()
    hc = c + sd * (r + 0.004)
    t = axis.cross(sd).normalized()
    box(p, hc, (width * 1.3, 0.012, 0.006), Matrix((axis, t, sd)).transposed(), mi, bevel=0.0008)
    cyl(p, hc - t * 0.009, hc + t * 0.006, 0.0028, mi, segs=10)
    hexa(p, hc + t * 0.006, hc + t * 0.009, 0.007, mi)


def p_clamp(p, pos, d, tube_r, tab_dir, mi_band, mi_cush, bolt_mi=None):
    """Хомут-петля (Adel/MS21919): резиновая подушка, лента, лапка под болт."""
    d, tab = V(d).normalized(), V(tab_dir).normalized()
    tab = (tab - d * tab.dot(d)).normalized()
    ring_tube(p, pos, d, tube_r + 0.0025, tube_r, 0.011, mi_cush, segs=20)
    ring_tube(p, pos, d, tube_r + 0.0033, tube_r + 0.0025, 0.009, mi_band, segs=20)
    s = d.cross(tab).normalized()
    base = V(pos) + tab * (tube_r + 0.003)
    box(p, base + tab * 0.008, (0.009, 0.003, 0.016), Matrix((d, s, tab)).transposed(), mi_band)
    b = base + tab * 0.012
    cyl(p, b - s * 0.004, b + s * 0.004, 0.003, bolt_mi if bolt_mi is not None else mi_band, segs=6)


def bonding_strap(p, a, b, mi, width=0.008):
    """Перемычка металлизации: плоская плетёнка с наконечниками."""
    a, b = V(a), V(b)
    d = (b - a)
    L = d.length
    mid = (a + b) / 2 + V((0, 0, -0.01))
    path = fillet([a, mid, b], 0.02)
    sweep(p, path, 0.0018, mi, segs=6)
    for q in (a, b):
        cyl(p, q + V((0, 0, 0.001)), q - V((0, 0, 0.001)), 0.004, mi, segs=10)
