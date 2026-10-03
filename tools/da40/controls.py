"""Управление DA 40 NG: привод закрылков по AMM 27-50, направляющие тяг элеронов и механизм
регулировки педалей по AMM 27-20 рис. 2.

    python3 tools/da40/controls.py [out.glb]        # CHECK=1 — зазоры по кадрам

Остальное управление (элероны, руль высоты, руль направления, триммер) взято
из исходника вместе с анимацией: по составу и трассам оно совпадает с AMM
27-10…27-38. Этот скрипт строит то, чего там не было или было не так, и
отдаёт отдельный GLB; tools/split-da40.js вливает его в da40-controls.glb, а
анимацию — в клип «Закрылки UP → LDG» (детали исходника, которые заменены,
перечислены в replaced.json).

AMM 27-50 рис. 1–3: электропривод лежит поперёк под полом за задней главной
переборкой, кронштейн мотора — на левой задней замыкающей нервюре; шток
привода — к промежуточной качалке (вертикальная ось); от неё две тяги к
корневым нервюрам крыльев; в крыле длинная тяга идёт через ролики корневой
нервюры к качалке на нервюре управления закрылком (x = 2,80), короткая тяга —
к кронштейну закрылка. AMM 27-10: второй роликовый узел тяги элерона стоит на
нервюре управления закрылком (в исходнике висел на x = 2,46, где нервюры нет).

Кинематика решается на каждом кадре клипа: угол закрылка (tools/da40/flap-angle.json,
снят с клипа планера) → кронштейн → короткая тяга → качалка в крыле → длинная
тяга → тяга в фюзеляже → промежуточная качалка → шток привода.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Matrix, Quaternion, Vector as V  # noqa: E402

import lib  # noqa: E402
import ref  # noqa: E402
from lib import Part, basis, box, cyl, hexa, ring_tube  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-controls-addon-raw.glb'
HERE = os.path.dirname(os.path.abspath(__file__))

ref.open_source()
R = ref.Ref()
COL = lib.collection('DA40 Flight controls rebuilt (AMM 27-10, 27-50)')

M = dict(
    alu=lib.mat('DA40 aluminium', (0.80, 0.81, 0.83), 1.0, 0.32, ru='алюминиевый сплав'),
    rod=lib.mat('DA40 push rod (aluminium tube)', (0.74, 0.75, 0.77), 1.0, 0.3, ru='алюминиевая труба'),
    steel=lib.mat('DA40 stainless steel', (0.62, 0.63, 0.65), 1.0, 0.28, ru='нержавеющая сталь'),
    black=lib.mat('DA40 black anodised', (0.05, 0.05, 0.06), 0.6, 0.4, ru='алюминий, чёрное анодирование'),
    motor=lib.mat('DA40 flap actuator housing (grey)', (0.30, 0.31, 0.33), 0.4, 0.5, ru='корпус привода, окрашенный алюминий'),
    nylon=lib.mat('DA40 guide roller (white nylon)', (0.92, 0.92, 0.90), 0.0, 0.5, ru='капроновый ролик'),
    gfrp=lib.mat('DA40 GFRP moulding', (0.83, 0.84, 0.74), 0.0, 0.55, ru='стеклопластик'),
    varnish=lib.mat('DA40 locking varnish (red)', (0.75, 0.10, 0.08), 0.0, 0.4, ru='контровочный лак'),
)

FPS = 24
with open(os.path.join(HERE, 'flap-angle.json')) as f:
    _s = json.load(f)['samples']
FRAMES = list(range(1, 26))            # клип 1,04 с при 24 к/с: кадры 1…25


def theta_at(frame):
    t = frame / FPS
    if t <= _s[0][0]:
        return 0.0
    for (t0, a0), (t1, a1) in zip(_s, _s[1:]):
        if t0 <= t <= t1:
            return math.radians(a0 + (a1 - a0) * (t - t0) / (t1 - t0))
    return math.radians(_s[-1][1])


# ось закрылка — с узла Bone_l / Bone_r клипа планера (glTF → Blender: x, −z, y; минус подъём)
HINGE = {1: (V((4.3032, 0.6005, 1.0277 - R.lift)), V((-0.995, 0.044, -0.085)).normalized()),
         -1: (V((-4.3033, 0.6005, 1.0269 - R.lift)), V((-0.995, -0.044, 0.085)).normalized())}
X_RIB, X_ROOT = 2.80, 1.205           # нервюра управления закрылком, корневая нервюра (wing.py)
IDLER = V((0.0, 0.66, -0.212))         # промежуточная качалка: под полом за задней главной переборкой
IDLER_D = 0.050                        # плечи качалки (к тягам левого и правого крыла)
MOTOR = V((0.60, 0.650, -0.192))       # мотор привода у левой задней замыкающей нервюры
SWIVEL = V((0.555, 0.635, -0.200))     # поворотный узел привода (ось вертикальная)
REAR_CLOSING_RIB_X = 0.660            # у корня закрылка, где кончается торсионная труба


def frame(yv, zv):
    """Поворот, у которого ось Y идёт вдоль yv, а Z — по zv (ортогонализованной)."""
    yv = V(yv).normalized()
    zv = V(zv) - yv * V(zv).dot(yv)
    zv.normalize()
    return Matrix((yv.cross(zv), yv, zv)).transposed()


def rot(axis, ang):
    return Quaternion(V(axis).normalized(), ang)


def hinge_point(s, x):
    p0, d = HINGE[s]
    k = (x - p0.x) / d.x
    return p0 + d * k


def mirror(v, s):
    return V((s * v.x, v.y, v.z))


class Side:
    """Геометрия одной стороны в покое (для правой — зеркально)."""

    def __init__(self, s):
        self.s = s
        self.axis = HINGE[s][1]
        xh = s * (X_RIB + 0.025)
        self.hc = hinge_point(s, xh)                              # ось закрылка у кронштейна
        self.h0 = self.hc + V((0, -0.035, 0.035))                 # палец кронштейна в покое
        self.B = V((s * (X_RIB - 0.030), 0.555, -0.012))          # ось качалки на нервюре
        self.nb = V((-s * 0.085, 0, 0.996)).normalized()          # ось качалки ⟂ плоскости крыла
        self.a2 = V((s * 0.058, 0, 0))                            # плечо к короткой тяге
        self.a1 = V((0, 0.040, 0))                                # плечо к длинной тяге
        self.G = V((s * X_ROOT, 0.625, -0.155))                   # ролики корневой нервюры
        a1p = self.B + self.a1
        d = (self.G - a1p).normalized()
        self.E0 = self.G + d * 0.06                               # внутренний конец длинной тяги
        self.L_long = (self.E0 - a1p).length
        self.L_short = (self.B + self.a2 - self.h0).length
        self.P0 = IDLER + V((0, -s * IDLER_D, 0))                 # палец качалки: левое крыло — впереди оси
        self.L_fus = (self.E0 - self.P0).length

    def horn(self, th):
        return self.hc + rot(self.axis, th) @ (self.h0 - self.hc)

    def arms(self, ph):
        q = rot(self.nb, ph)
        return self.B + q @ self.a2, self.B + q @ self.a1

    def solve_phi(self, th, prev):
        h = self.horn(th)

        def f(ph):
            return (self.arms(ph)[0] - h).length - self.L_short
        return bisect(f, prev, math.radians(-85), math.radians(85))

    def long_rod(self, ph):
        _, a1 = self.arms(ph)
        d = (self.G - a1).normalized()
        return a1, a1 + d * self.L_long


def idler_pin(s, ps):
    return IDLER + rot((0, 0, 1), ps) @ V((0, -s * IDLER_D, 0))


def bisect(f, prev, lo, hi, n=200):
    """Корень f, ближайший к prev: сканирование и уточнение."""
    xs = [lo + (hi - lo) * i / n for i in range(n + 1)]
    roots = []
    for a, b in zip(xs, xs[1:]):
        fa, fb = f(a), f(b)
        if fa == 0 or fa * fb < 0:
            for _ in range(60):
                m = (a + b) / 2
                if f(a) * f(m) <= 0:
                    b = m
                else:
                    a = m
            roots.append((a + b) / 2)
    if not roots:
        raise SystemExit(f'кинематика не сходится: f({math.degrees(lo):.0f}°)={f(lo):.4f}, f(0)={f(0.0):.4f}, f({math.degrees(hi):.0f}°)={f(hi):.4f}')
    return min(roots, key=lambda r: abs(r - prev))


def solve():
    L, Rt = Side(1), Side(-1)
    frames = []
    ph = {1: 0.0, -1: 0.0}
    ps = 0.0
    for fr in FRAMES:
        th = theta_at(fr)
        st = {'th': th}
        for sd in (L, Rt):
            ph[sd.s] = sd.solve_phi(th, ph[sd.s])
            a1, e = sd.long_rod(ph[sd.s])
            st[sd.s] = dict(ph=ph[sd.s], horn=sd.horn(th), a2=sd.arms(ph[sd.s])[0], a1=a1, e=e)
        e = st[1]['e']
        ps = bisect(lambda x: (idler_pin(1, x) - e).length - L.L_fus, ps, math.radians(-80), math.radians(80))
        st['ps'] = ps
        frames.append(st)
    return L, Rt, frames


# ── Детали ──────────────────────────────────────────────────────────────────

def P(name, ru, m, doc):
    return Part(name, ru, M[m], COL, True, doc)


def pivot_obj(p, pivot):
    """Готовая деталь с началом координат в оси поворота."""
    ob = p.done()
    ob.data.transform(Matrix.Translation(-pivot))
    ob.location = pivot
    ob.rotation_mode = 'QUATERNION'
    return ob


def rod(name, ru, a, b, r, doc, ends=True):
    """Тяга: труба с наконечниками, в своей системе (ось Z от a к b)."""
    L = (b - a).length
    p = P(name, ru, 'rod', doc)
    o, z = V((0, 0, 0)), V((0, 0, 1))
    if ends:
        cyl(p, o + z * 0.03, o + z * (L - 0.03), r, 0, segs=16)
        for c, d in ((o, z), (o + z * L, -z)):
            cyl(p, c + d * 0.012, c + d * 0.034, r * 0.55, p.m(M['steel']), segs=12)          # резьбовой хвостовик
            hexa(p, c + d * 0.024, c + d * 0.030, r * 1.6, p.m(M['varnish']))                # контргайка
            ring_tube(p, c, V((1, 0, 0)), 0.0085, 0.0035, 0.008, p.m(M['steel']), segs=16)   # ушко шарнира
    else:
        cyl(p, o, o + z * L, r, 0, segs=16)
    ob = p.done()
    ob.location = a
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = basis(b - a).to_quaternion()
    ob['len0'] = L
    return ob


def key_rod(ob, a, b, fr):
    d = b - a
    q0 = basis(d).to_quaternion()
    ob.location = a
    ob.rotation_quaternion = q0
    ob.scale = (1, 1, d.length / ob['len0'])
    for path in ('location', 'rotation_quaternion', 'scale'):
        ob.keyframe_insert(path, frame=fr)


def key_rot(ob, q, fr):
    ob.rotation_quaternion = q
    ob.keyframe_insert('rotation_quaternion', frame=fr)


def roller_guide(name, ru, x, c, d, doc, nrm=(1, 0, 0)):
    """Роликовая направляющая: пластина на нервюре и два ролика над и под тягой."""
    d = V(d).normalized()
    up = V((0, 0, 1)) - d * d.z
    up.normalize()
    p = P(name, ru, 'alu', doc)
    lo, hi = R.wing_section(x - (0.01 if x > 0 else -0.01), c.y)
    lo = max(lo if lo is not None else c.z - 0.045, c.z - 0.045) + 0.006
    hi = min(hi if hi is not None else c.z + 0.045, c.z + 0.045) - 0.006
    box(p, V((x, c.y, (lo + hi) / 2)), (0.004, 0.06, hi - lo), Matrix.Identity(3), 0, bevel=0.002)   # пластина по высоте нервюры
    side = d.cross(up).normalized()
    for k in (1, -1):
        rc = c + up * k * 0.017
        cyl(p, rc - side * 0.009, rc + side * 0.009, 0.0085, p.m(M['nylon']), segs=16)
        cyl(p, rc - side * 0.013, rc + side * 0.013, 0.003, p.m(M['steel']), segs=8)
    p.done()


def build():
    L, Rt, frames = solve()
    objs = {}
    for sd in (L, Rt):
        s, tag = sd.s, ('LH' if sd.s > 0 else 'RH')
        gen = 'левого' if s > 0 else 'правого'
        # кронштейн закрылка
        p = P(f'Flap horn {tag}', f'Кронштейн (качалка) {gen} закрылка: к нему короткая тяга от качалки в крыле', 'alu', 'AMM 27-50 рис. 2')
        foot = sd.hc + V((0, -0.01, -0.02))
        box(p, (foot + sd.h0) / 2, (0.006, 0.03, (sd.h0 - foot).length + 0.016), basis(sd.h0 - foot), 0, bevel=0.002)
        cyl(p, sd.h0 - V((0.012, 0, 0)), sd.h0 + V((0.012, 0, 0)), 0.004, p.m(M['steel']), segs=10)
        objs[('horn', s)] = pivot_obj(p, sd.hc)
        # качалка на нервюре управления закрылком
        p = P(f'Flap bellcrank {tag}', f'Качалка {gen} закрылка на нервюре управления: длинная тяга вдоль размаха → короткая тяга назад к закрылку',
              'alu', 'AMM 27-50 2.B, рис. 2')
        pb = [sd.B, sd.B + sd.a2, sd.B + sd.a1]
        c = sum(pb, V()) / 3
        for q in pb:
            if (q - c).length > 1e-4:
                box(p, (c + q) / 2, (0.02, (q - c).length + 0.018, 0.005), frame(q - c, sd.nb), 0, bevel=0.002)
        for q in pb:
            cyl(p, q - sd.nb * 0.008, q + sd.nb * 0.008, 0.0065, p.m(M['steel']), segs=12)
        objs[('bc', s)] = pivot_obj(p, sd.B)
        p = P(f'Flap bellcrank bracket (flap control rib) {tag}', f'Кронштейн качалки {gen} закрылка на нервюре управления закрылком (x = {X_RIB:.2f} м)',
              'black', 'AMM 27-50 рис. 2, 57-10')
        lo, hi = R.wing_section(s * X_RIB, sd.B.y)          # в высоте профиля: у задней кромки он тонкий
        z0 = max(sd.B.z - 0.029, (lo if lo is not None else -9) + 0.005)
        z1 = min(sd.B.z + 0.021, (hi if hi is not None else 9) - 0.005)
        box(p, V((s * X_RIB, sd.B.y, (z0 + z1) / 2)), (0.004, 0.06, z1 - z0), Matrix.Identity(3), 0, bevel=0.002)
        box(p, sd.B - sd.nb * 0.012 + V((s * 0.008, 0, 0)), (0.02, 0.03, 0.004), Matrix.Identity(3), 0, bevel=0.001)
        p.done()
        # тяги
        f0 = frames[0][s]
        objs[('short', s)] = rod(f'Flap short push rod {tag}', f'Короткая тяга {gen} закрылка: качалка — кронштейн закрылка',
                                 f0['a2'], f0['horn'], 0.0065, 'AMM 27-50 рис. 2')
        objs[('long', s)] = rod(f'Flap long push rod {tag}', f'Длинная тяга {gen} закрылка в крыле: от корневой нервюры к качалке на нервюре управления',
                                f0['e'], f0['a1'], 0.009, 'AMM 27-50 2.B')
        objs[('fus', s)] = rod(f'Flap push rod in the fuselage {tag}', f'Тяга {gen} закрылка в фюзеляже: промежуточная качалка — корневая нервюра',
                               idler_pin(s, frames[0]['ps']), f0['e'], 0.009, 'AMM 27-50 2.B, рис. 1')
        d = (f0['a1'] - f0['e']).normalized()
        roller_guide(f'Flap push rod guide (root rib) {tag}', f'Ролики тяги {gen} закрылка на корневой нервюре', s * X_ROOT, sd.G, d,
                     'AMM 27-50 рис. 2')
    # направляющие тяг элеронов на нервюре управления закрылком (AMM 27-10 2.): вместо висевших на x = 2,46
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        c, d = V((s * X_RIB, 0.553, 0.048)), V((s * 0.995, -0.03, 0.072))
        roller_guide(f'Aileron push rod guide 2 (flap control rib) {tag}', f'Второй роликовый узел тяги {"левого" if s > 0 else "правого"} элерона — на нервюре управления закрылком',
                     s * X_RIB, c, d, 'AMM 27-10 2., рис. 2')
    # промежуточная качалка
    p = P('Flap idler lever', 'Промежуточная качалка закрылков на задней главной переборке: шток привода и тяги к обоим крыльям', 'alu', 'AMM 27-50 рис. 1, 3')
    cyl(p, IDLER - V((0, 0, 0.032)), IDLER + V((0, 0, 0.010)), 0.011, 0, segs=18)
    box(p, IDLER, (0.026, 2 * IDLER_D + 0.024, 0.006), Matrix.Identity(3), 0, bevel=0.002)
    box(p, IDLER - V((0, 0, 0.016)) + V((0, -IDLER_D, 0)), (0.02, 0.02, 0.005), Matrix.Identity(3), 0, bevel=0.002)
    for s in (1, -1):
        q = idler_pin(s, 0.0)
        cyl(p, q - V((0, 0, 0.024)), q + V((0, 0, 0.008)), 0.004, p.m(M['steel']), segs=10)
    objs['idler'] = pivot_obj(p, IDLER)
    p = P('Flap idler lever bearing brackets', 'Кронштейны оси промежуточной качалки на задней главной переборке', 'black', 'AMM 27-50 рис. 1')
    for dz in (-0.036, 0.014):
        box(p, IDLER + V((0, -0.035, dz)), (0.03, 0.07, 0.005), Matrix.Identity(3), 0, bevel=0.001)
    box(p, IDLER + V((0, -0.07, -0.011)), (0.05, 0.004, 0.06), Matrix.Identity(3), 0, bevel=0.001)
    p.done()
    # электропривод: мотор с редуктором на кронштейне левой задней замыкающей нервюры, корпус винта, шток
    pa0 = idler_pin(1, frames[0]['ps']) + V((0, 0, 0.016))
    d0 = (pa0 - SWIVEL).normalized()
    p = P('Flap actuator (motor, gearbox, spindle tube)', 'Электропривод закрылков: мотор с редуктором, корпус винта, плата с пятью микровыключателями; под левым пассажирским креслом',
          'motor', 'AMM 27-50 2.A, рис. 3')
    cyl(p, MOTOR - V((0, 0, 0.020)), MOTOR + V((0, 0, 0.020)), 0.034, 0, segs=32)
    cyl(p, MOTOR + V((0, 0, 0.020)), MOTOR + V((0, 0, 0.028)), 0.020, 0, segs=24)
    box(p, SWIVEL + V((0.0, 0.0, 0.012)), (0.05, 0.05, 0.04), Matrix.Identity(3), 0, bevel=0.004)
    cyl(p, SWIVEL, SWIVEL + d0 * 0.34, 0.014, p.m(M['alu']), segs=20)
    for k in range(3):
        ring_tube(p, SWIVEL + d0 * (0.10 + 0.08 * k), d0, 0.0185, 0.015, 0.006, p.m(M['steel']), segs=20)       # червячные хомуты платы
    side = d0.cross(V((0, 0, 1))).normalized()
    box(p, SWIVEL + d0 * 0.2 + side * 0.022, (0.012, 0.012, 0.22), basis(d0), p.m(M['gfrp']), bevel=0.001)       # плата микровыключателей
    objs['act'] = pivot_obj(p, SWIVEL)
    objs['act_rod'] = rod('Flap actuator control rod', 'Шток привода закрылков с кулачком микровыключателей: к промежуточной качалке',
                          pa0, pa0 - d0 * 0.30, 0.007, 'AMM 27-50 рис. 3')
    p = P('Flap actuator mounting bracket (LH rear closing rib)', 'Кронштейн привода закрылков на левой задней замыкающей нервюре, ось поворота привода',
          'black', 'AMM 27-50 2.A, рис. 3')
    lo = R.skin(REAR_CLOSING_RIB_X - 0.003, SWIVEL.y, 'lower')[0]
    z0 = max(SWIVEL.z - 0.025, (lo.z if lo is not None else -9) + 0.006)   # не ниже обшивки: нижний край выходил наружу
    box(p, V((REAR_CLOSING_RIB_X - 0.003, SWIVEL.y, (z0 + SWIVEL.z + 0.045) / 2)), (0.005, 0.07, SWIVEL.z + 0.045 - z0), Matrix.Identity(3), 0, bevel=0.002)
    box(p, V(((REAR_CLOSING_RIB_X + SWIVEL.x) / 2, SWIVEL.y, SWIVEL.z - 0.016)), (REAR_CLOSING_RIB_X - SWIVEL.x, 0.04, 0.005), Matrix.Identity(3), 0, bevel=0.001)
    cyl(p, SWIVEL - V((0, 0, 0.02)), SWIVEL + V((0, 0, 0.035)), 0.004, p.m(M['steel']), segs=10)
    p.done()

    # анимация
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = FRAMES[0], FRAMES[-1]
    for fr, st in zip(FRAMES, frames):
        for sd in (L, Rt):
            s, v = sd.s, st[sd.s]
            key_rot(objs[('horn', s)], rot(sd.axis, st['th']), fr)
            key_rot(objs[('bc', s)], rot(sd.nb, v['ph']), fr)
            key_rod(objs[('short', s)], v['a2'], v['horn'], fr)
            key_rod(objs[('long', s)], v['e'], v['a1'], fr)
            key_rod(objs[('fus', s)], idler_pin(s, st['ps']), v['e'], fr)
        key_rot(objs['idler'], rot((0, 0, 1), st['ps']), fr)
        pa = idler_pin(1, st['ps']) + V((0, 0, 0.016))
        d = (pa - SWIVEL).normalized()
        key_rot(objs['act'], d0.rotation_difference(d), fr)
        ob = objs['act_rod']
        ob.location = pa
        ob.rotation_quaternion = basis(-d).to_quaternion()
        ob.keyframe_insert('location', frame=fr)
        ob.keyframe_insert('rotation_quaternion', frame=fr)
    for ob in COL.all_objects:
        ad = ob.animation_data
        if ad and ad.action:
            ad.action.name = 'Закрылки UP → LDG'
    st, en = frames[0], frames[-1]
    print(f'KIN θ {math.degrees(en["th"]):.1f}°  φ {math.degrees(en[1]["ph"]):.1f}°  ψ {math.degrees(en["ps"]):.1f}°  '
          f'ход тяги {(en[1]["e"] - st[1]["e"]).length * 1000:.0f} мм  '
          f'правая тяга в фюзеляже меняет длину на {abs((idler_pin(-1, en["ps"]) - en[-1]["e"]).length - (idler_pin(-1, 0) - st[-1]["e"]).length) * 1000:.1f} мм')
    return objs, frames


# ── Регулировка педалей (AMM 27-20 рис. 2) ─────────────────────────────────
# Педальный узел каждого пилота — в салоне MSFS: салазки (верхняя труба и нижняя
# балка), передняя и задняя опоры, каретка с осью педалей. Не хватает механизма
# регулировки: ручки на заднем торце узла с тросиком к фиксатору на нижней
# салазке, возвратных пружин каретки и опорных пластин с болтами крепления к полу.
PEDAL_X = {1: 0.2575, -1: -0.258}       # ось верхней салазки узла MSFS (Cylinder.121 / .119)
FLOOR_Z = lambda y: -0.094 - 0.033 * (y + 1.10)   # пол MSFS (Plane.378) у педалей


def coil(p, a, b, R_, wire, pitch, mi=0):
    """Витая пружина растяжения от a до b с крючками на концах."""
    a, b = V(a), V(b)
    ax = (b - a)
    L = ax.length
    Rm = basis(ax.normalized())
    turns = max(3, int((L - 0.012) / pitch))
    pts = []
    for k in range(turns * 12 + 1):
        t = k / 12
        ang = 2 * math.pi * t
        pts.append(a + ax.normalized() * (0.006 + (L - 0.012) * t / turns) + Rm @ V((R_ * math.cos(ang), R_ * math.sin(ang), 0)))
    lib.sweep(p, pts, wire, mi, segs=6)
    for q, d in ((a, ax.normalized()), (b, -ax.normalized())):
        lib.torus(p, q + d * 0.003, Rm.col[0], 0.003, wire, mi, segs=12, rsegs=5)      # крючок


def pedal_adjusters():
    hd = P('Rudder pedal adjuster handles', 'Ручки регулировки педалей на заднем торце педальных узлов: потянуть — фиксатор выходит '
           'из нижней салазки, узел едет по салазкам к пилоту; отпустить и нажать на обе педали — фиксатор встаёт на место', 'black', 'AMM 27-20 2.A, рис. 2')
    cb = P('Rudder pedal adjuster cables', 'Тросики от ручек регулировки к фиксаторам педальных узлов', 'black', 'AMM 27-20 рис. 2')
    lt = P('Rudder pedal adjuster latches', 'Фиксаторы педальных узлов: подпружиненный штырь каретки входит в отверстие нижней салазки', 'steel', 'AMM 27-20 рис. 2')
    sp = P('Rudder pedal adjuster return springs', 'Возвратные пружины кареток педальных узлов (по две на узел, между передней опорой и кареткой)', 'steel', 'AMM 27-20 рис. 2')
    ft = P('Rudder pedal assembly floor attachments', 'Опорные пластины передней и задней опор педальных узлов; каждый узел крепится к полу шестью болтами', 'black', 'AMM 27-20 2., рис. 2')
    for s, xc in PEDAL_X.items():
        # ручка: короткий рычаг от задней пластины каретки назад-вверх, поперечная рукоятка
        r0, r1 = V((xc, -0.884, 0.019)), V((xc, -0.800, 0.046))
        cyl(hd, r0, r1, 0.004, hd.m(M['steel']), segs=10)
        cyl(hd, r1 + V((-0.032, 0, 0)), r1 + V((0.032, 0, 0)), 0.009, 0, segs=16)
        cyl(hd, r0 + V((0, -0.004, 0)), r0 + V((0, 0.006, 0)), 0.008, 0, segs=14)        # втулка на каретке
        # тросик: от основания ручки вниз по задней пластине каретки к фиксатору
        q0 = V((xc + s * 0.026, -0.878, 0.016))
        path = lib.fillet([q0, q0 + V((0, 0.004, -0.02)), V((xc + s * 0.026, -0.874, -0.040)), V((xc + s * 0.026, -0.900, -0.052)),
                           V((xc + s * 0.015, -0.915, -0.052))], 0.008)
        lib.sweep(cb, path, 0.0022, 0, segs=8)
        # фиксатор: корпус на нижней салазке между пластинами каретки, штырь вниз в салазку
        lc = V((xc, -0.922, -0.052))
        box(lt, lc, (0.030, 0.022, 0.018), Matrix.Identity(3), 0, bevel=0.002)
        cyl(lt, lc - V((0, 0, 0.009)), lc - V((0, 0, 0.020)), 0.004, 0, segs=10)
        # возвратные пружины: над нижней салазкой по бокам верхней трубы, от передней опоры к каретке
        for dx in (-0.020, 0.020):
            coil(sp, V((xc + dx, -1.021, -0.035)), V((xc + dx, -0.966, -0.035)), 0.0055, 0.0011, 0.0032)
        # опорные пластины на полу и шесть болтов (четыре спереди, два сзади)
        for y, w, xs in ((-1.0435, 0.096, (-0.040, 0.040)), (-0.782, 0.084, (-0.035, 0.035))):
            z = FLOOR_Z(y) + 0.002
            box(ft, V((xc, y, z)), (w, 0.034, 0.004), Matrix.Identity(3), 0, bevel=0.001)
            for dx in xs:
                for dy in ((-0.010, 0.010) if y < -1.0 else (0.0,)):
                    q = V((xc + dx, y + dy, z + 0.002))
                    hexa(ft, q, q + V((0, 0, 0.005)), 0.010, ft.m(M['steel']))
    for p in (hd, cb, lt, sp, ft):
        p.done()


def inside_shell(q):
    """Точка внутри обшивки: и вверх, и вниз луч упирается в обшивку изнутри."""
    up = R.shell.ray_cast(q, V((0, 0, 1)), 3.0)
    dn = R.shell.ray_cast(q, V((0, 0, -1)), 3.0)
    return up[0] is not None and dn[0] is not None and up[1].z > 0 and dn[1].z < 0


def check(objs):
    """Зазоры каждой новой детали в трёх положениях закрылков."""
    trim = [o for o in bpy.data.collections['DA40 Interior'].all_objects if o.type == 'MESH' and
            not any(m and 'Glass' in m.name for m in o.data.materials)]
    drop = ('Flap actuator push rod', 'Flap drive', 'Flap L push rod', 'Flap R push rod', 'push rod guide 2 (flap control rib)', 'Flap torsion tube (steel)')
    src = [o for o in bpy.data.collections['Flight controls'].all_objects if o.type == 'MESH' and not any(k in o.name for k in drop)]
    before = set(bpy.data.objects)
    for g in ('fuel', 'brakes', 'pitot', 'air', 'wing'):
        f = f'/home/user/da40src/out2/da40-{g}-raw.glb'
        if os.path.exists(f):
            bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location.z -= R.lift
    bvhs = {'shell': R.shell, 'trim': ref._bvh(trim), 'controls': ref._bvh(src),
            'layers': ref._bvh([o for o in new if o.type == 'MESH'])}
    mine = [o for o in COL.all_objects if o.type == 'MESH']
    for fr in (FRAMES[0], FRAMES[len(FRAMES) // 2], FRAMES[-1]):
        bpy.context.scene.frame_set(fr)
        bpy.context.view_layer.update()
        for o in mine:
            vs = [o.matrix_world @ v.co for v in o.data.vertices][::3]
            worst = (9.0, None)
            for tag, b in bvhs.items():
                for q in vs:
                    h = b.find_nearest(q, 0.05)
                    if h[0] is not None and h[3] < worst[0]:
                        worst = (h[3], tag)
            out = sum(1 for q in vs if not inside_shell(q))
            if out:
                print(f'OUTSIDE f{fr} {o.name}: {out}/{len(vs)} вершин снаружи обшивки')
            if worst[0] < 0.002 and worst[1] != 'shell':
                print(f'NEAR f{fr} {o.name}: {worst[0] * 1000:.1f} мм до {worst[1]}')
    bpy.context.scene.frame_set(FRAMES[0])


objs, frames = build()
pedal_adjusters()
if os.environ.get('CHECK'):
    check(objs)
dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift, anim=True)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'CONTROLS_OK {OUT} {size / 1e6:.2f} MB, parts {len(COL.all_objects) - 1}')
