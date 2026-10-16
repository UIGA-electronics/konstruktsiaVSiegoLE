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
    lead=lib.mat('DA40 balance weight (lead, grey primer)', (0.42, 0.43, 0.44), 0.2, 0.6, ru='свинец, грунт'),
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
        p = P(f'Flap horn {tag}', f'Кабанчик {gen} закрылка: к нему короткая тяга от качалки закрылка в крыле', 'alu', 'AMM 27-50 рис. 2')
        foot = sd.hc + V((0, -0.01, -0.02))
        box(p, (foot + sd.h0) / 2, (0.006, 0.03, (sd.h0 - foot).length + 0.016), basis(sd.h0 - foot), 0, bevel=0.002)
        cyl(p, sd.h0 - V((0.012, 0, 0)), sd.h0 + V((0.012, 0, 0)), 0.004, p.m(M['steel']), segs=10)
        objs[('horn', s)] = pivot_obj(p, sd.hc)
        # качалка на нервюре управления закрылком
        p = P(f'Flap bellcrank {tag}', f'Качалка {gen} закрылка на нервюре крепления качалки закрылка: длинная тяга вдоль размаха → короткая тяга назад к кабанчику',
              'alu', 'AMM 27-50 2.B, рис. 2')
        pb = [sd.B, sd.B + sd.a2, sd.B + sd.a1]
        c = sum(pb, V()) / 3
        for q in pb:
            if (q - c).length > 1e-4:
                box(p, (c + q) / 2, (0.02, (q - c).length + 0.018, 0.005), frame(q - c, sd.nb), 0, bevel=0.002)
        for q in pb:
            cyl(p, q - sd.nb * 0.008, q + sd.nb * 0.008, 0.0065, p.m(M['steel']), segs=12)
        objs[('bc', s)] = pivot_obj(p, sd.B)
        p = P(f'Flap bellcrank bracket (flap control rib) {tag}', f'Кронштейн качалки {gen} закрылка на нервюре крепления качалки закрылка (x = {X_RIB:.2f} м)',
              'black', 'AMM 27-50 рис. 2, 57-10')
        lo, hi = R.wing_section(s * X_RIB, sd.B.y)          # в высоте профиля: у задней кромки он тонкий
        z0 = max(sd.B.z - 0.029, (lo if lo is not None else -9) + 0.005)
        z1 = min(sd.B.z + 0.021, (hi if hi is not None else 9) - 0.005)
        box(p, V((s * X_RIB, sd.B.y, (z0 + z1) / 2)), (0.004, 0.06, z1 - z0), Matrix.Identity(3), 0, bevel=0.002)
        box(p, sd.B - sd.nb * 0.012 + V((s * 0.008, 0, 0)), (0.02, 0.03, 0.004), Matrix.Identity(3), 0, bevel=0.001)
        p.done()
        # тяги
        f0 = frames[0][s]
        objs[('short', s)] = rod(f'Flap short push rod {tag}', f'Короткая тяга {gen} закрылка: качалка — кабанчик закрылка',
                                 f0['a2'], f0['horn'], 0.0065, 'AMM 27-50 рис. 2')
        objs[('long', s)] = rod(f'Flap long push rod {tag}', f'Длинная тяга {gen} закрылка в крыле: от корневой нервюры к качалке закрылка',
                                f0['e'], f0['a1'], 0.009, 'AMM 27-50 2.B')
        objs[('fus', s)] = rod(f'Flap push rod in the fuselage {tag}', f'Тяга {gen} закрылка в фюзеляже: промежуточный рычаг — корневая нервюра',
                               idler_pin(s, frames[0]['ps']), f0['e'], 0.009, 'AMM 27-50 2.B, рис. 1')
        d = (f0['a1'] - f0['e']).normalized()
        roller_guide(f'Flap push rod guide (root rib) {tag}', f'Ролики тяги {gen} закрылка на корневой нервюре', s * X_ROOT, sd.G, d,
                     'AMM 27-50 рис. 2')
    # направляющие тяг элеронов на нервюре управления закрылком (AMM 27-10 2.): вместо висевших на x = 2,46
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        c, d = V((s * X_RIB, 0.553, 0.048)), V((s * 0.995, -0.03, 0.072))
        roller_guide(f'Aileron push rod guide 2 (flap control rib) {tag}', f'Направляющая № 2 тяги {"левого" if s > 0 else "правого"} элерона — на нервюре крепления качалки закрылка',
                     s * X_RIB, c, d, 'AMM 27-10 2., рис. 2')
    # промежуточная качалка
    p = P('Flap idler lever', 'Промежуточный рычаг закрылков на заднем лонжероне центроплана: тяга исполнительного механизма и тяги к обоим крыльям', 'alu', 'AMM 27-50 рис. 1, 3')
    cyl(p, IDLER - V((0, 0, 0.032)), IDLER + V((0, 0, 0.010)), 0.011, 0, segs=18)
    box(p, IDLER, (0.026, 2 * IDLER_D + 0.024, 0.006), Matrix.Identity(3), 0, bevel=0.002)
    box(p, IDLER - V((0, 0, 0.016)) + V((0, -IDLER_D, 0)), (0.02, 0.02, 0.005), Matrix.Identity(3), 0, bevel=0.002)
    for s in (1, -1):
        q = idler_pin(s, 0.0)
        cyl(p, q - V((0, 0, 0.024)), q + V((0, 0, 0.008)), 0.004, p.m(M['steel']), segs=10)
    objs['idler'] = pivot_obj(p, IDLER)
    p = P('Flap idler lever bearing brackets', 'Кронштейны оси промежуточного рычага закрылков на заднем лонжероне центроплана', 'black', 'AMM 27-50 рис. 1')
    for dz in (-0.036, 0.014):
        box(p, IDLER + V((0, -0.035, dz)), (0.03, 0.07, 0.005), Matrix.Identity(3), 0, bevel=0.001)
    box(p, IDLER + V((0, -0.07, -0.011)), (0.05, 0.004, 0.06), Matrix.Identity(3), 0, bevel=0.001)
    p.done()
    # электропривод: мотор с редуктором на кронштейне левой задней замыкающей нервюры, корпус винта, шток
    pa0 = idler_pin(1, frames[0]['ps']) + V((0, 0, 0.016))
    d0 = (pa0 - SWIVEL).normalized()
    p = P('Flap actuator (motor, gearbox, spindle tube)', 'Исполнительный механизм (электропривод) закрылков: электродвигатель с редуктором и винтом, печатная плата с пятью микровыключателями; под левым пассажирским креслом',
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
    objs['act_rod'] = rod('Flap actuator control rod', 'Тяга исполнительного механизма закрылков с кулачком микровыключателей: к промежуточному рычагу',
                          pa0, pa0 - d0 * 0.30, 0.007, 'AMM 27-50 рис. 3')
    p = P('Flap actuator mounting bracket (LH rear closing rib)', 'Монтажный кронштейн исполнительного механизма закрылков на задней части левой бортовой (замыкающей) нервюры, ось поворотного блока',
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
    hd = P('Rudder pedal adjuster handles', 'Ручки регулировки положения педалей на задней поверхности педальных узлов: потянуть — задвижка '
           'расцепляется с нижней направляющей трубкой, узел смещается к креслу; отпустить и нажать на обе педали — задвижка фиксирует узел', 'black', 'AMM 27-20 2.A, рис. 2')
    cb = P('Rudder pedal adjuster cables', 'Тросики от ручек регулировки к задвижкам педальных узлов', 'black', 'AMM 27-20 рис. 2')
    lt = P('Rudder pedal adjuster latches', 'Регулирующие задвижки педальных узлов: подпружиненный штырь каретки входит в отверстие нижней направляющей трубки', 'steel', 'AMM 27-20 рис. 2')
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


# Длинная тяга руля высоты (исходник): оси наконечников; три роликовые направляющие — на шпангоуте крепления
# багажного отсека и кольцевых шпангоутах 1 и 2 (AMM 27-30 2., рис. 2; structure.py: BAGGAGE_Y, RING_Y)
ELEV_ROD_A, ELEV_ROD_B, ELEV_ROD_R = V((0.1065, 0.058, -0.075)), V((0.0, 4.8928, 0.133)), 0.010   # ушки: промежуточный рычаг — верхнее плечо качалки киля
ELEV_GUIDES = ((1.745, 'baggage compartment frame', 'на шпангоуте крепления багажного отсека'),
               (2.250, 'ring frame 1', 'на кольцевом шпангоуте 1'),
               (3.150, 'ring frame 2', 'на кольцевом шпангоуте 2'))


def elevator_rod_guides():
    d = (ELEV_ROD_B - ELEV_ROD_A).normalized()
    for y, tag, ru in ELEV_GUIDES:
        c = ELEV_ROD_A + d * ((y - ELEV_ROD_A.y) / d.y)
        face = y + 0.0025                                      # задняя грань стенки шпангоута
        p = P(f'Elevator push rod guide ({tag}, 3 rollers)',
              f'Роликовая направляющая длинной тяги руля высоты {ru}: пластина на задней стороне стенки с окном под тягу, '
              'три капроновых ролика через 120° держат тягу по оси и дают ей ход вперёд-назад', 'alu', 'AMM 27-30 2., рис. 2')
        q = V((c.x, face + 0.002, c.z))
        # пластина с окном (рамка из четырёх полос)
        for dx, dz, w, h in ((0, 0.026, 0.07, 0.018), (0, -0.026, 0.07, 0.018), (0.026, 0, 0.018, 0.034), (-0.026, 0, 0.018, 0.034)):
            box(p, q + V((dx, 0, dz)), (w, 0.004, h), Matrix.Identity(3), 0, bevel=0.001)
        up = (V((0, 0, 1)) - d * d.z).normalized()
        side = d.cross(up).normalized()
        rr = 0.0075
        for k in range(3):
            a = math.radians(90 + 120 * k)
            rad = (up * math.sin(a) + side * math.cos(a)).normalized()
            ax = d.cross(rad).normalized()                      # ось ролика: поперёк тяги и радиуса
            rc = c + d * ((face + 0.016 - c.y) / d.y) + rad * (ELEV_ROD_R + rr + 0.0005)
            cyl(p, rc - ax * 0.006, rc + ax * 0.006, rr, p.m(M['nylon']), segs=16)
            cyl(p, rc - ax * 0.010, rc + ax * 0.010, 0.0022, p.m(M['steel']), segs=8)
            # вилка ролика: две щёки от пластины назад до оси ролика
            foot = V((c.x, face + 0.004, c.z)) + rad * 0.026
            for sg in (-1, 1):
                a0, a1 = foot + ax * sg * 0.0095, rc + ax * sg * 0.0095
                cyl(p, a0, a1, 0.0035, 0, segs=6)
        p.done()


# ── Ручки, вал и проводка элеронов и руля высоты (AMM 27-10, 27-30) ─────────
# В исходнике ручки качались вокруг оси вала, а тяги, качалки и вал были нарисованы
# отдельно и в клипах тянулись и проворачивались вокруг своих осей: короткие тяги меняли
# длину на десятки миллиметров, длинная тяга в крыле только вращалась, у задней качалки
# и качалок в крыле плечи стояли так, что тяги их не могли повернуть. Здесь цепь
# собрана заново по AMM 27-10 рис. 1–2 и 27-30 рис. 1–2 (места тяг — по исходнику) и
# решается на каждом кадре от угла ручек (tools/da40/controls-clips.json, снят с клипов):
# ручка → тяги к передней качалке → тяга под центральным пультом → промежуточный рычаг →
# тяга к задней качалке → тяги в центроплане → длинные тяги в крыле → качалка элерона →
# короткая тяга → кабанчик; вал → рычаг руля высоты → короткая тяга → промежуточный рычаг →
# длинная тяга → качалка в низу киля → вертикальная тяга → кабанчик руля высоты.
# Последняя тяга каждой ветви встречает поверхность, повёрнутую клипом исходника;
# плечи качалок в крыле и кабанчика руля подобраны так, чтобы её длина менялась на 1–2 мм.

with open(os.path.join(HERE, 'controls-clips.json')) as f:
    CLIPS = json.load(f)
AIL, ELV = CLIPS['aileron'], CLIPS['elevator']
FLAP_CLIP = 'Закрылки UP → LDG'

TT_Y, TT_Z = -0.3401, 0.0667                      # ось вала: ручки качаются по тангажу вокруг неё (клип MSFS)
TTC = V((0.0, TT_Y, TT_Z))
TT_R = 0.0125                                     # вал Ø25
AX_X = V((1, 0, 0))
AX_ROLL = V((0, 0.9995, -0.0332)).normalized()    # ось крена ручек проходит через центр вала
UP_STICK = V((0, 0.0332, 0.9995)).normalized()
STICK = {1: V((0.2674, TT_Y, TT_Z)), -1: V((-0.266, TT_Y, TT_Z))}
Z_FB = -0.190                                     # пластина передней качалки (в «шляпе», посередине её стенок)
STICK_D = (TT_Z - (Z_FB + 0.007)) / UP_STICK.z     # от оси вала до ушка тяги на нижнем конце ручки
STICK_BOT = {s: STICK[s] - UP_STICK * STICK_D for s in (1, -1)}
STICK_FLOOR_Z = -0.119                            # пол кабины MSFS (Plane.378) у ручек

# передняя качалка: ось вертикальная, плечо к тягам ручек — вперёд (поперечный ход),
# плечо к тяге под пультом — вправо (продольный ход)
FB_C = V((0.0, STICK_BOT[1].y + 0.127, Z_FB))
FB_STICK = V((0.0, STICK_BOT[1].y, Z_FB))
FB_AFT = FB_C + V((-0.060, 0, 0))
EYE = 0.007                                       # ушки наконечников над и под пластиной качалки
EYE_OFF = 0.0065                                  # ушко наконечника рядом с пластиной рычага (на пальце)
# промежуточный рычаг элеронов в переднем лонжероне центроплана (ось поперёк, вверху): обе тяги ниже оси,
# поэтому тяга под пультом и тяга к задней качалке идут в одну сторону (AMM 27-10 3.); рычаг сдвинут к оси
# самолёта — у исходника он стоял на правом тросе руля направления
AI_C, AI_LO, AI_HI = V((-0.030, 0.0572, -0.030)), V((-0.030, 0.0542, -0.2107)), V((-0.030, 0.058, -0.092))
AI_LOe, AI_HIe = AI_LO + V((EYE_OFF, 0, 0)), AI_HI + V((EYE_OFF, 0, 0))
# задняя качалка на монтажном кронштейне задней поверхности заднего лонжерона (structure.py)
RB_C = V((0.0, 0.630, -0.098))
RB_CS = V((0.0, 0.592, -0.098))                   # тяги к крыльям: плечо вперёд — ход поперёк
RB_2 = V((0.025, 0.630, -0.098))                  # тяга от промежуточного рычага: плечо влево
RB_2e = RB_2 - V((0, 0, EYE))
CS_EYE = {1: 0.007, -1: -0.007}
_MSFS_R = {s: V((s * 1.2, 0.6002, -0.0685)) for s in (1, -1)}       # внутренний конец длинной тяги исходника
_MSFS_W = {s: V((s * 3.82, 0.5237, 0.1218)) for s in (1, -1)}
LONG_D = {s: (_MSFS_W[s] - _MSFS_R[s]).normalized() for s in (1, -1)}
# стык тяги центроплана с длинной тягой — на той же линии, но в центроплане (x 1,12), а не в зазоре
# между наружной нервюрой центроплана (1,19) и корневой нервюрой крыла (1,205): обе нервюры тяга проходит в вырезах
ROOT_END = {s: _MSFS_R[s] + LONG_D[s] * ((s * 1.12 - _MSFS_R[s].x) / LONG_D[s].x) for s in (1, -1)}
X_AIL_BC = 3.94                                   # качалка элерона снаружи от нервюры её крепления (x 3,88)
AIL_A1, AIL_A2 = 0.030, 0.0425                    # плечи качалки элерона: к длинной тяге, к короткой (между задним
                                                  # лонжероном, y 0,48, и задней стенкой, y 0,56)
AIL_HORN_X, AIL_HORN_R, AIL_HORN_FWD = 4.012, 0.055, -0.012
# руль высоты
EL_LEVER = V((0.10, -0.3499, -0.2273))            # ушко короткой тяги на рычаге вала (исходник)
EI_C, EI_LO, EI_HI = V((0.10, 0.0572, -0.022)), V((0.10, 0.0542, -0.2107)), V((0.10, 0.058, -0.075))   # ось вверху (AMM 27-30 3.)
EI_LOe, EI_HIe = EI_LO + V((EYE_OFF, 0, 0)), EI_HI + V((EYE_OFF, 0, 0))
FE_C = V((0.0, 4.8928, 0.0981))                   # ось качалки в низу киля (кронштейн — structure.py)
FE_LONG = V((0.0, 4.8928, 0.133))                 # плечо вверх: длинная тяга назад — качалка поворачивается, переднее плечо
                                                  # поднимает вертикальную тягу (руль высоты вниз)
ELEV_HINGE = V((0.0, 5.3307, 1.2879))             # ось руля высоты (клип MSFS)


def rot_about(c, ax, ang, p):
    return c + rot(ax, ang) @ (p - c)


def frame_nb(n, a):
    """Поворот, у которого Z — по нормали n, а X — вдоль a (ортогонализованной)."""
    n = V(n).normalized()
    a = V(a) - n * V(a).dot(n)
    a.normalize()
    return Matrix((a, n.cross(a), n)).transposed()


def surf_angle(c, ax, p0, p):
    """Угол поворота вокруг оси (c, ax), переводящий p0 в p."""
    ax = ax.normalized()
    r0 = p0 - c
    r0 -= ax * r0.dot(ax)
    r = p - c
    r -= ax * r.dot(ax)
    return math.atan2(ax.dot(r0.cross(r)), r0.dot(r))


def bone_axis(name):
    m = bpy.data.objects[name].matrix_world
    return m.translation.copy(), (m.to_3x3() @ V((0, 0, 1))).normalized()


class WingChain:
    """Качалка элерона и кабанчик одной стороны."""

    def __init__(self, s, a2=AIL_A2, hr=AIL_HORN_R, hz=AIL_HORN_FWD):
        self.s = s
        d = LONG_D[s]
        self.d = d
        self.W0 = ROOT_END[s] + d * ((s * X_AIL_BC - ROOT_END[s].x) / d.x)
        self.n = V((-s * 0.085, 0, 0.996)).normalized()
        m = self.n.cross(d).normalized()
        self.m = -m if m.y > 0 else m                                 # в плоскости крыла, вперёд
        self.P = self.W0 + self.m * AIL_A1
        self.S0 = self.P + d * a2
        self.W0e = self.W0 + self.n * EYE_OFF                         # ушко длинной тяги — над пластиной
        self.S0e = self.S0 - self.n * EYE_OFF                         # короткой — под ней
        self.L_long = (self.W0e - ROOT_END[s]).length
        p, ax = bone_axis('Bone2_l' if s > 0 else 'Bone2_r')
        self.hax = ax
        self.hc = p + ax * ((s * AIL_HORN_X - p.x) / ax.x)
        up = V((0, 0, 1)) - ax * ax.z
        up.normalize()
        fwd = ax.cross(up).normalized()
        fwd = -fwd if fwd.y > 0 else fwd
        self.H0 = self.hc + up * hr + fwd * hz
        self.up = up
        self.H0e = self.H0 + ax * EYE_OFF                             # ушко короткой тяги — с внутренней стороны кабанчика
        pins = [V(q) for q in AIL['horn_L' if s > 0 else 'horn_R']]
        rest = pins[AIL['stick_deg'].index(0.0)] if 0.0 in AIL['stick_deg'] else pins[len(pins) // 2]
        self.ang = [surf_angle(p, ax, rest, q) for q in pins]          # угол элерона по кадрам (клип MSFS)
        self.L_short = (self.S0e - self.H0e).length

    def short_var(self, slide):
        """Насколько короткой тяге пришлось бы менять длину на всём клипе (подбор плеча и пальца)."""
        ph, ls = 0.0, []
        for k, x in enumerate(slide):
            ph, _, sw = self.solve(ROOT_END[self.s] + LONG_D[self.s] * x, ph, 60)
            ls.append((sw - self.horn(k)).length)
        return max(ls) - min(ls)

    def horn(self, k):
        return rot_about(self.hc, self.hax, self.ang[k], self.H0e)

    def solve(self, E, prev, n=200):
        ph = bisect(lambda a: (rot_about(self.P, self.n, a, self.W0e) - E).length - self.L_long, prev, -1.0, 1.0, n)
        return ph, rot_about(self.P, self.n, ph, self.W0e), rot_about(self.P, self.n, ph, self.S0e)


def solve_aileron():
    """Кадры клипа элеронов: положения узлов цепи."""
    L_st = (FB_STICK + V((0, 0, EYE)) - STICK_BOT[1]).length
    L_uc = (AI_LOe - (FB_AFT + V((0, 0, EYE)))).length
    L_2 = (RB_2e - AI_HIe).length
    L_cs = {s: (ROOT_END[s] - (RB_CS + V((0, 0, CS_EYE[s])))).length for s in (1, -1)}
    out, ph_f, ph_i, ph_r = [], 0.0, 0.0, 0.0
    slide, ph_w = {1: 0.0, -1: 0.0}, {1: 0.0, -1: 0.0}
    slides = {1: [], -1: []}
    for k, deg in enumerate(AIL['stick_deg']):
        th = math.radians(deg)
        st = {'roll': th}
        bot = {s: rot_about(STICK[s], AX_ROLL, th, STICK_BOT[s]) for s in (1, -1)}
        ph_f = bisect(lambda a: (rot_about(FB_C, (0, 0, 1), a, FB_STICK) + V((0, 0, EYE)) - bot[1]).length - L_st, ph_f, -1.2, 1.2)
        fb_s = rot_about(FB_C, (0, 0, 1), ph_f, FB_STICK)
        fb_a = rot_about(FB_C, (0, 0, 1), ph_f, FB_AFT) + V((0, 0, EYE))
        ph_i = bisect(lambda a: (rot_about(AI_C, AX_X, a, AI_LOe) - fb_a).length - L_uc, ph_i, -1.2, 1.2)
        ai_hi = rot_about(AI_C, AX_X, ph_i, AI_HIe)
        ph_r = bisect(lambda a: (rot_about(RB_C, (0, 0, 1), a, RB_2e) - ai_hi).length - L_2, ph_r, -1.2, 1.2)
        cs = rot_about(RB_C, (0, 0, 1), ph_r, RB_CS)
        st.update(bot=bot, fb=ph_f, fb_s=fb_s, fb_a=fb_a, ai=ph_i, ai_lo=rot_about(AI_C, AX_X, ph_i, AI_LOe), ai_hi=ai_hi,
                  rb=ph_r, rb2=rot_about(RB_C, (0, 0, 1), ph_r, RB_2e), cs=cs)
        for s in (1, -1):
            c = cs + V((0, 0, CS_EYE[s]))
            slide[s] = bisect(lambda x: (ROOT_END[s] + LONG_D[s] * x - c).length - L_cs[s], slide[s], -0.12, 0.12)
            slides[s].append(slide[s])
        out.append(st)
    # плечо качалки элерона к короткой тяге и палец кабанчика: короткая тяга должна меньше всего менять длину
    best = None
    for a2 in [0.030 + 0.0025 * i for i in range(13)]:
        for hr in (0.050, 0.055):
            for hz in (-0.012, -0.006, 0.0):
                var = max(WingChain(s, a2, hr, hz).short_var(slides[s]) for s in (1, -1))
                if best is None or var < best[0]:
                    best = (var, a2, hr, hz)
    _, a2, hr, hz = best
    print(f'AIL качалка элерона: плечо к короткой тяге {a2 * 1000:.1f} мм, палец кабанчика {hr * 1000:.0f} мм над осью, {hz * 1000:+.0f} мм вперёд')
    wings = {s: WingChain(s, a2, hr, hz) for s in (1, -1)}
    for k, st in enumerate(out):
        for s in (1, -1):
            E = ROOT_END[s] + LONG_D[s] * slides[s][k]
            ph_w[s], W, Sw = wings[s].solve(E, ph_w[s])
            st[s] = dict(E=E, W=W, Sw=Sw, ph=ph_w[s], horn=wings[s].horn(k), ang=wings[s].ang[k])
    for s in (1, -1):
        ls = [(st[s]['Sw'] - st[s]['horn']).length for st in out]
        print(f'AIL {"L" if s > 0 else "R"}: качалка {math.degrees(min(st[s]["ph"] for st in out)):.1f}…{math.degrees(max(st[s]["ph"] for st in out)):.1f}°, '
              f'ход длинной тяги {min(st[s]["E"].x for st in out) * 1000:.0f}…{max(st[s]["E"].x for st in out) * 1000:.0f} мм по x, '
              f'короткая тяга меняет длину на {(max(ls) - min(ls)) * 1000:.1f} мм')
    print(f'AIL передняя качалка ±{math.degrees(max(abs(st["fb"]) for st in out)):.1f}°, промежуточный рычаг ±{math.degrees(max(abs(st["ai"]) for st in out)):.1f}°, '
          f'задняя качалка ±{math.degrees(max(abs(st["rb"]) for st in out)):.1f}°')
    return wings, out


def elevator_horn_design():
    """Палец кабанчика руля высоты и плечо качалки киля: вертикальная тяга должна меньше всего менять длину."""
    stick = [math.radians(d) for d in ELV['stick_deg']]
    elev = [math.radians(d) for d in ELV['elevator_deg']]
    L_s = (EI_LOe - EL_LEVER).length
    L_l = (FE_LONG - EI_HIe).length
    lev, ei, fe = [], [], []
    pi = pf = 0.0
    for th in stick:
        lv = rot_about(TTC, AX_X, th, EL_LEVER)
        pi = bisect(lambda a: (rot_about(EI_C, AX_X, a, EI_LOe) - lv).length - L_s, pi, -1.2, 1.2)
        hi = rot_about(EI_C, AX_X, pi, EI_HIe)
        pf = bisect(lambda a: (rot_about(FE_C, AX_X, a, FE_LONG) - hi).length - L_l, pf, -1.2, 1.2)
        lev.append(lv)
        ei.append(pi)
        fe.append(pf)
    best = None
    for yh in [5.225 + 0.005 * i for i in range(5)]:
        for zh in [1.262 + 0.004 * i for i in range(6)]:
            H0 = V((0.0, yh, zh))
            for av in [0.035 + 0.005 * i for i in range(9)]:
                d = (H0 - FE_C).normalized()
                arm = V((0, -d.z, d.y))                               # поперёк тяги
                arm = arm if arm.y < 0 else -arm                      # вперёд: верхнее плечо назад — переднее вверх; сзади
                                                                      # вертикальной тяге мешают нижний кронштейн руля направления и задняя стенка киля
                V0 = FE_C + arm * av
                L_v = (H0 - V0).length
                H0e = H0 + V((EYE_OFF, 0, 0))
                ls = [(rot_about(ELEV_HINGE, AX_X, e, H0e) - rot_about(FE_C, AX_X, f, V0)).length for e, f in zip(elev, fe)]
                var = max(ls) - min(ls)
                if best is None or var < best[0]:
                    best = (var, H0, V0, av)
    var, H0, V0, av = best
    print(f'ELV кабанчик: палец {tuple(round(c, 4) for c in H0)}, плечо качалки к вертикальной тяге {av * 1000:.0f} мм, '
          f'вертикальная тяга меняет длину на {var * 1000:.1f} мм; промежуточный рычаг ±{math.degrees(max(abs(a) for a in ei)):.1f}°, '
          f'качалка киля {math.degrees(min(fe)):.1f}…{math.degrees(max(fe)):.1f}°')
    return dict(stick=stick, elev=elev, lev=lev, ei=ei, fe=fe, H0=H0, V0=V0)


# ── Детали цепи ─────────────────────────────────────────────────────────────

def rod2(name, ru, a, b, r, doc, eye=V((0, 0, 1))):
    """Тяга, у которой ушки наконечников поперёк оси eye (ось пальца)."""
    ob = rod(name, ru, a, b, r, doc)
    ob['eye'] = list(eye)
    q = basis(b - a, up=V(eye).cross((b - a).normalized())).to_quaternion()
    ob.rotation_quaternion = q
    # меш тяги построен с ушком вдоль локальной X: basis(d, up=eye×d) кладёт X по ±eye
    return ob


def key_rod2(ob, a, b, fr):
    d = b - a
    eye = V(ob['eye'])
    ob.location = a
    ob.rotation_quaternion = basis(d, up=eye.cross(d.normalized())).to_quaternion()
    ob.scale = (1, 1, d.length / ob['len0'])
    for path in ('location', 'rotation_quaternion', 'scale'):
        ob.keyframe_insert(path, frame=fr)


def plate_poly(p, pts, n, t, mi=0):
    """Плоская пластина толщины t по контуру pts (выпуклый многоугольник) с нормалью n."""
    n = V(n).normalized()
    bm = p.bm
    top = [bm.verts.new(q + n * t / 2) for q in pts]
    bot = [bm.verts.new(q - n * t / 2) for q in pts]
    f = bm.faces.new(top)
    f.material_index = mi
    f = bm.faces.new(list(reversed(bot)))
    f.material_index = mi
    k = len(pts)
    for i in range(k):
        f = bm.faces.new((top[i], bot[i], bot[(i + 1) % k], top[(i + 1) % k]))
        f.material_index = mi


def link_bar(p, a, b, w, n, t, mi=0):
    """Плечо рычага от a до b шириной w в плоскости с нормалью n, со скруглёнными концами."""
    d = (b - a)
    L = d.length
    box(p, (a + b) / 2, (w, L, t), frame_nb(n, d.cross(n)), mi, bevel=min(0.002, t * 0.3))
    for q in (a, b):
        cyl(p, q - n * t / 2, q + n * t / 2, w / 2, mi, segs=16)


def bellcrank_part(name, ru, doc, c, pins, n, t=0.005, w=0.018, mat='alu', rig=None):
    """Качалка: плечи от оси c к пальцам pins в плоскости с нормалью n; rig — точка отверстия под стопорный штифт."""
    p = P(name, ru, mat, doc)
    for q in pins:
        link_bar(p, c, q, w, n, t)
    cyl(p, c - n * 0.012, c + n * 0.012, 0.009, p.m(M['steel']), segs=16)            # втулка оси
    for q in pins:
        cyl(p, q - n * 0.013, q + n * 0.013, 0.0035, p.m(M['steel']), segs=10)        # палец
        hexa(p, q + n * 0.012, q + n * 0.016, 0.009, p.m(M['steel']))
    if rig is not None:
        ring_tube(p, rig, n, 0.0055, 0.0028, t + 0.002, p.m(M['steel']), segs=14)     # втулка отверстия под штифт
    return pivot_obj(p, c)


def build_sticks_and_chains():
    wings, A = solve_aileron()
    E = elevator_horn_design()
    rest_k_ail = AIL['stick_deg'].index(0.0)
    objs = {}

    # вал в сборе: труба с изгибом назад в обход вала топливного крана, приварные детали
    p = P('Control stick torque tube assembly', 'Вал в сборе (torque tube assy): поперечная труба под передней кромкой кресел на осях качания ручек по тангажу; '
          'в середине выгнута назад в обход вала топливного крана; на ней приварены втулки осей крена ручек и гайки регулируемых '
          'ограничителей хода элеронов', 'steel', 'AMM 27-10 рис. 1, 27-30 рис. 1')
    path = lib.fillet([V((0.335, TT_Y, TT_Z)), V((0.052, TT_Y, TT_Z)), V((0.026, TT_Y + 0.048, TT_Z)), V((-0.026, TT_Y + 0.048, TT_Z)),
                       V((-0.052, TT_Y, TT_Z)), V((-0.335, TT_Y, TT_Z))], 0.016)
    lib.sweep(p, path, TT_R, 0, segs=20)
    for s, c in STICK.items():
        cyl(p, c - V((0.0, 0.018, 0)), c + V((0.0, 0.018, 0)), 0.0105, 0, segs=18)              # втулка оси крена поперёк вала
        cyl(p, c - V((0.0, 0.027, 0)), c + V((0.0, 0.027, 0)), 0.004, p.m(M['steel']), segs=10)   # болт оси крена
        for dy in (-0.027, 0.027):
            hexa(p, c + V((0, dy, 0)), c + V((0, dy + (0.004 if dy > 0 else -0.004), 0)), 0.010, p.m(M['steel']))
    objs['tt'] = pivot_obj(p, TTC)

    # монтажные рамы ручек: подшипниковые опоры вала на шпангоуте крепления ручек
    p = P('Control stick mounting blocks', 'Монтажные рамы ручек управления (control stick mounting blocks): четыре подшипниковые опоры вала на задней '
          'стороне шпангоута крепления ручек управления; в наружных — отверстия под стопорный штифт нейтрали по тангажу', 'black', 'AMM 27-10 рис. 1, 27-30 рис. 1')
    wall_y = -0.373
    for x in (0.335, 0.150, -0.150, -0.335):
        c = V((x, TT_Y, TT_Z))
        ring_tube(p, c, AX_X, 0.022, TT_R + 0.0008, 0.020, 0, segs=24)
        box(p, V((x, (wall_y + TT_Y) / 2 - 0.006, TT_Z)), (0.020, TT_Y - wall_y - 0.012, 0.030), None, 0, bevel=0.002)
        box(p, V((x, wall_y + 0.003, TT_Z)), (0.050, 0.006, 0.060), None, 0, bevel=0.0015)        # фланец на шпангоуте
        for dz in (-0.020, 0.020):
            q = V((x, wall_y + 0.006, TT_Z + dz))
            hexa(p, q, q + V((0, 0.005, 0)), 0.009, p.m(M['steel']))
        if abs(x) > 0.3:
            ring_tube(p, c + V((0, 0, 0.030)), V((0, 1, 0)), 0.006, 0.0028, 0.020, p.m(M['steel']), segs=14)   # отверстие под штифт
    p.done()

    # рычаг руля высоты на валу и ограничители хода элеронов
    p = P('Elevator control lever (torque tube)', 'Рычаг руля высоты (elevator lever), приваренный к валу снизу: к нижнему концу — короткая тяга к '
          'промежуточному рычагу; ручки от себя — рычаг идёт назад', 'steel', 'AMM 27-30 рис. 1')
    top = V((EL_LEVER.x, TT_Y, TT_Z))
    link_bar(p, top, EL_LEVER, 0.022, AX_X, 0.008)
    cyl(p, EL_LEVER - V((0.012, 0, 0)), EL_LEVER + V((0.012, 0, 0)), 0.0035, p.m(M['steel']), segs=10)
    ring_tube(p, top, AX_X, TT_R + 0.004, TT_R, 0.016, 0, segs=24)
    objs['el_lever'] = pivot_obj(p, TTC)

    p = P('Adjustable aileron stops', 'Регулируемые ограничители хода элеронов: гайка приварена к валу, в ней болт с контргайкой; головка болта упирается в нижнюю '
          'часть ручки — слева от ручки левого пилота (ход вправо: правый элерон вверх, левый вниз) и справа от ручки правого пилота (ход влево)',
          'steel', 'AMM 27-10 2., рис. 1')
    d_st = 0.075                                                      # высота упора под осью вала
    for s, c in STICK.items():
        z = TT_Z - d_st
        x_head = c.x + s * (d_st * math.sin(math.radians(10.0)) + 0.0105)    # при полном отклонении ручка касается головки
        x_nut = c.x + s * 0.050
        box(p, V((x_nut + s * 0.004, TT_Y, (TT_Z + z) / 2 - 0.004)), (0.006, 0.016, TT_Z - z + 0.012), None, 0, bevel=0.001)   # косынка от вала
        hexa(p, V((x_nut, TT_Y, z)), V((x_nut + s * 0.008, TT_Y, z)), 0.012, 0)                                                    # приварная гайка
        cyl(p, V((x_head, TT_Y, z)), V((x_nut + s * 0.016, TT_Y, z)), 0.004, 0, segs=10)                                            # болт
        hexa(p, V((x_head, TT_Y, z)), V((x_head + s * 0.005, TT_Y, z)), 0.010, 0)                                                   # головка
        hexa(p, V((x_nut - s * 0.001, TT_Y, z)), V((x_nut - s * 0.005, TT_Y, z)), 0.011, p.m(M['varnish']))                         # контргайка
    objs['stops'] = pivot_obj(p, TTC)

    # нижние части ручек: вилка на оси крена и труба до ушка тяги
    for s, c in STICK.items():
        tag, gen = ('LH', 'левого') if s > 0 else ('RH', 'правого')
        p = P(f'Control stick lower part {tag}', f'Нижняя часть ручки управления {gen} пилота: вилка на болте вала (ось крена), ниже — труба через прорезь в полу '
              'до ушка тяги-толкателя к передней качалке', 'steel', 'AMM 27-10 рис. 1')
        for dy in (-0.0195, 0.0195):
            box(p, c + V((0, dy, -0.002)), (0.026, 0.004, 0.070), None, 0, bevel=0.0015)          # щёки вилки
        box(p, c + V((0, 0, 0.0255)), (0.026, 0.035, 0.017), None, 0, bevel=0.002)                  # верхняя проставка: в неё входит ручка
        box(p, c + V((0, 0, -0.028)), (0.026, 0.035, 0.016), None, 0, bevel=0.002)                  # нижняя перемычка
        bot = STICK_BOT[s]
        cyl(p, c - UP_STICK * 0.034, bot + UP_STICK * 0.014, 0.0095, 0, segs=18)
        for dy in (-0.0075, 0.0075):
            box(p, bot + V((0, dy, 0.004)), (0.018, 0.004, 0.030), None, 0, bevel=0.001)           # проушины под наконечник
        cyl(p, bot - V((0, 0.012, 0)), bot + V((0, 0.012, 0)), 0.0035, p.m(M['steel']), segs=10)
        objs[('stick', s)] = pivot_obj(p, c)
        # чехол на прорези в полу
        p = P(f'Control stick floor boot {tag}', f'Резиновый чехол на прорези пола под ручкой {gen} пилота: закрывает прорезь, в которой ручка ходит по крену и тангажу',
              'black', 'AMM 27-10 рис. 1')
        q = c + (bot - c) * ((c.z - STICK_FLOOR_Z) / (c.z - bot.z))
        ring_tube(p, V((q.x, q.y, STICK_FLOOR_Z + 0.003)), (0, 0, 1), 0.030, 0.011, 0.006, 0, segs=32)
        cyl(p, V((q.x, q.y, STICK_FLOOR_Z + 0.006)), V((q.x, q.y, STICK_FLOOR_Z + 0.024)), 0.026, 0, segs=28, r1=0.013)
        p.done()

    # тяги к ручкам и передняя качалка
    for s in (1, -1):
        tag, gen = ('LH', 'левой') if s > 0 else ('RH', 'правой')
        objs[('st_rod', s)] = rod2(f'Aileron push rod to {tag} stick', f'Тяга-толкатель к {gen} ручке управления: от нижнего конца ручки к передней качалке',
                                   STICK_BOT[s], FB_STICK + V((0, 0, s * EYE)), 0.008, 'AMM 27-10 рис. 1')
    objs['fb'] = bellcrank_part('Aileron front bellcrank', 'Передняя качалка управления элеронами на кронштейне шпангоута крепления ручек управления: '
                                'тяги от ручек — вперёд, тяга под центральным пультом — вправо; отверстие под стопорный штифт нейтрали',
                                'AMM 27-10 2., рис. 1', FB_C, [FB_STICK, FB_AFT], V((0, 0, 1)), w=0.022,
                                rig=FB_C + (FB_STICK - FB_C) * 0.45)
    p = P('Aileron front bellcrank bracket', 'Кронштейн передней качалки элеронов на нижней части шпангоута крепления ручек управления, в тоннеле: '
          'ось качалки вертикальная', 'black', 'AMM 27-10 рис. 1')
    h = R.hit((FB_C.x, FB_C.y, -0.15), (0, 0, -1), 0.2)[0]
    zb = (h.z + 0.002) if h is not None else -0.231         # днище тоннеля
    box(p, V((FB_C.x, FB_C.y, zb + 0.002)), (0.040, 0.040, 0.004), None, 0, bevel=0.001)
    for dx in (-0.016, 0.016):
        box(p, V((FB_C.x + dx, FB_C.y, (zb + FB_C.z - 0.015) / 2)), (0.004, 0.030, FB_C.z - 0.015 - zb), None, 0)
    box(p, V((FB_C.x, FB_C.y, FB_C.z - 0.013)), (0.036, 0.030, 0.004), None, 0)
    cyl(p, FB_C - V((0, 0, 0.022)), FB_C + V((0, 0, 0.016)), 0.004, p.m(M['steel']), segs=10)
    p.done()
    objs['uc_rod'] = rod2('Aileron push rod under the centre console', 'Короткая тяга под центральным пультом: передняя качалка — промежуточный рычаг',
                          FB_AFT + V((0, 0, EYE)), AI_LOe, 0.008, 'AMM 27-10 2., рис. 1', eye=AX_X)
    # промежуточный рычаг элеронов
    objs['ai'] = bellcrank_part('Aileron idler lever', 'Промежуточный рычаг управления элеронами в переднем лонжероне центроплана (front main bulkhead): '
                                'ось поперёк; снизу тяга от передней качалки, сверху — тяга к задней качалке', 'AMM 27-10 2., рис. 1',
                                AI_C, [AI_LO, AI_HI], AX_X, w=0.020, rig=AI_C + (AI_HI - AI_C) * 0.5)
    objs['rod2'] = rod2('Aileron push rod: idler lever to rear bellcrank', 'Тяга-толкатель от промежуточного рычага к задней качалке: сквозь передний и задний '
                        'лонжероны центроплана', AI_HIe, RB_2e, 0.009, 'AMM 27-10 2., рис. 1')
    objs['rb'] = bellcrank_part('Aileron rear bellcrank', 'Задняя качалка управления элеронами на монтажном кронштейне задней поверхности заднего лонжерона '
                                'центроплана: тяга от промежуточного рычага — слева, тяги к крыльям — спереди; отверстие под стопорный штифт',
                                'AMM 27-10 2., рис. 1', RB_C, [RB_CS, RB_2], V((0, 0, 1)), w=0.022, rig=RB_C + (RB_2 - RB_C) * 0.5)
    for s in (1, -1):
        tag, gen = ('LH', 'левому') if s > 0 else ('RH', 'правому')
        objs[('cs', s)] = rod2(f'Aileron push rod to {tag} wing (centre section)', f'Тяга-толкатель к {gen} крылу в центроплане: задняя качалка — длинная тяга у корневой нервюры',
                               RB_CS + V((0, 0, CS_EYE[s])), ROOT_END[s], 0.009, 'AMM 27-10 2., рис. 1')
    # крыло: длинная тяга, качалка, короткая тяга, кабанчик
    for s, w in wings.items():
        tag, gen, gen2 = ('LH', 'левого', 'левом') if s > 0 else ('RH', 'правого', 'правом')
        objs[('long', s)] = rod2(f'Aileron long push rod in the {tag} wing', f'Длинная тяга {gen} элерона в крыле: через направляющие ролики корневой нервюры, '
                                 'нервюры крепления качалки закрылка и малой нервюры', ROOT_END[s], w.W0e, 0.010, 'AMM 27-10 2., рис. 2')
        objs[('wbc', s)] = bellcrank_part(f'Aileron bellcrank {tag}', f'Качалка {gen} элерона на опорном кронштейне нервюры крепления качалки элерона: '
                                          'длинная тяга — сзади, короткая — снаружи; отверстие под стопорный штифт', 'AMM 27-10 2., рис. 2',
                                          w.P, [w.W0, w.S0], w.n, w=0.020, rig=w.P + (w.S0 - w.P) * 0.5)
        p = P(f'Aileron bellcrank support bracket {tag}', f'Опорный кронштейн качалки {gen} элерона на нервюре крепления качалки элерона (x = 3,88)',
              'black', 'AMM 27-10 рис. 2, 57-10')
        xr = s * 3.886
        for dz in (-0.012, 0.012):                                   # узкие щёки: выше — верхний пояс заднего лонжерона
            a = V((xr, w.P.y, w.P.z + dz))
            b = w.P + w.n * dz
            link_bar(p, a, b, 0.016, w.n, 0.004)
        lo, hi = R.wing_section(xr, w.P.y)
        z0 = max(w.P.z - 0.03, (lo or -9) + 0.004)
        z1 = min(w.P.z + 0.03, (hi or 9) - 0.004)
        box(p, V((xr, w.P.y, (z0 + z1) / 2)), (0.004, 0.040, z1 - z0), None, 0, bevel=0.001)
        cyl(p, w.P - w.n * 0.02, w.P + w.n * 0.02, 0.004, p.m(M['steel']), segs=10)
        p.done()
        objs[('short', s)] = rod2(f'Aileron short push rod {tag}', f'Короткая тяга: качалка — кабанчик {gen} элерона; регулировкой длины смещают диапазон '
                                  'отклонения элерона вверх или вниз', w.S0e, w.H0e, 0.0065, 'AMM 27-10 2., рис. 2')
        p = P(f'Aileron control horn {tag}', f'Кабанчик {gen} элерона: пластина на трёх болтах к корневой части элерона, проходит в прорезь задней стенки '
              'крыла; палец короткой тяги — над осью навески', 'alu', 'AMM 27-10 рис. 2, 57-60')
        n = w.hax
        root = w.hc + w.up * 0.012                                 # ось навески — у нижней обшивки: пластина начинается выше
        link_bar(p, root, w.H0, 0.018, n, 0.006)
        aft = n.cross(w.H0 - w.hc).normalized()
        aft = aft if aft.y > 0 else -aft
        link_bar(p, root, root + aft * 0.050, 0.014, n, 0.006)                                   # полка вдоль корня элерона
        for k in range(3):
            q = root + aft * (0.012 + 0.017 * k) + n * 0.004
            hexa(p, q, q + n * 0.004, 0.008, p.m(M['steel']))
        cyl(p, w.H0 - n * 0.012, w.H0 + n * 0.012, 0.0035, p.m(M['steel']), segs=10)
        objs[('horn', s)] = pivot_obj(p, w.hc)

    # руль высоты: короткая тяга, промежуточный рычаг, длинная тяга, качалка киля, вертикальная тяга, кабанчик
    objs['el_short'] = rod2('Elevator short push rod', 'Короткая тяга руля высоты: рычаг вала — промежуточный рычаг на переднем лонжероне центроплана',
                            EL_LEVER, EI_LOe, 0.008, 'AMM 27-30 2., рис. 1', eye=AX_X)
    objs['ei'] = bellcrank_part('Elevator idler lever', 'Промежуточный рычаг руля высоты в переднем лонжероне центроплана: ось поперёк; снизу короткая '
                                'тяга, сверху длинная тяга; отверстие под стопорный штифт', 'AMM 27-30 2., рис. 1',
                                EI_C, [EI_LO, EI_HI], AX_X, w=0.020, rig=EI_C + (EI_HI - EI_C) * 0.5)
    objs['el_long'] = rod2('Elevator long push rod', 'Длинная тяга руля высоты: промежуточный рычаг — качалка в нижней части киля; держат три роликовые '
                           'направляющие', EI_HIe, FE_LONG, ELEV_ROD_R, 'AMM 27-30 2., рис. 2', eye=AX_X)
    objs['fe'] = bellcrank_part('Elevator bellcrank (bottom of the fin)', 'Качалка руля высоты в нижней части киля: длинная тяга — к верхнему плечу, '
                                'вертикальная тяга — к переднему; отверстие под стопорный штифт', 'AMM 27-30 2., рис. 2',
                                FE_C, [FE_LONG, E['V0']], AX_X, t=0.008, w=0.022, rig=FE_C + (E['V0'] - FE_C) * 0.45)
    objs['el_vert'] = rod2('Elevator vertical push rod', 'Вертикальная тяга руля высоты в киле: качалка — кабанчик руля высоты',
                           E['V0'], E['H0'] + V((EYE_OFF, 0, 0)), 0.009, 'AMM 27-30 2., рис. 2', eye=AX_X)
    p = P('Elevator control horn with balance weight', 'Кабанчик руля высоты на средней нервюре руля: передний выступ с балансировочным грузом входит '
          'в стабилизатор и упирается в ограничители хода (вверх — болт с втулкой на кронштейне механизма триммера, вниз — колодка под '
          'верхней обшивкой); снизу — палец вертикальной тяги', 'alu', 'AMM 27-30 2., рис. 2, 55-20')
    hc, H0 = ELEV_HINGE, E['H0']
    # выступ — узкая полоса высотой 8 мм (link_bar: ширина — в плоскости кабанчика), толщиной 20 мм поперёк:
    # между упорным болтом снизу и колодкой сверху; подшипник оси — в средней опоре (structure.py)
    tongue = [hc, V((0, 5.279, 1.296)), V((0, 5.222, 1.296))]                        # над упорным болтом (y 5,279)
    for a, b in zip(tongue, tongue[1:]):
        link_bar(p, a, b, 0.008, AX_X, 0.020)
    link_bar(p, V((0, 5.240, 1.293)), H0, 0.016, AX_X, 0.010)                        # проушина вертикальной тяги
    ring_tube(p, hc, AX_X, 0.014, 0.0095, 0.020, 0, segs=20)                        # ступица на подшипнике средней опоры
    box(p, V((0, 5.211, 1.293)), (0.050, 0.026, 0.010), None, p.m(M['lead']), bevel=0.002)          # балансировочный груз
    cyl(p, H0 - V((0.013, 0, 0)), H0 + V((0.013, 0, 0)), 0.0035, p.m(M['steel']), segs=10)
    objs['e_horn'] = pivot_obj(p, hc)

    lines = {'aileron_cs_RH': [RB_CS + V((0, 0, CS_EYE[-1])), ROOT_END[-1]], 'aileron_cs_LH': [RB_CS + V((0, 0, CS_EYE[1])), ROOT_END[1]],
             'elevator_long': [EI_HIe, FE_LONG], 'aileron_under_console': [FB_AFT + V((0, 0, EYE)), AI_LOe]}
    with open(os.path.join(HERE, 'controls-lines.json'), 'w') as f:
        json.dump({k: [[round(c, 4) for c in q] for q in v] for k, v in lines.items()}, f, indent=1)
        f.write('\n')

    # ── анимация: два клипа, каждый — своя дорожка NLA
    animated = [o for o in objs.values()]
    rest = {o.name: (o.location.copy(), o.rotation_quaternion.copy(), o.scale.copy()) for o in animated}

    # клип элеронов
    for k, fr in enumerate(AIL['frames']):
        st = A[k]
        qr = rot(AX_ROLL, st['roll'])
        for s in (1, -1):
            key_rot(objs[('stick', s)], qr, fr)
            key_rod2(objs[('st_rod', s)], st['bot'][s], st['fb_s'] + V((0, 0, s * EYE)), fr)
            key_rod2(objs[('cs', s)], st['cs'] + V((0, 0, CS_EYE[s])), st[s]['E'], fr)
            key_rod2(objs[('long', s)], st[s]['E'], st[s]['W'], fr)
            key_rot(objs[('wbc', s)], rot(wings[s].n, st[s]['ph']), fr)
            key_rod2(objs[('short', s)], st[s]['Sw'], st[s]['horn'], fr)
            key_rot(objs[('horn', s)], rot(wings[s].hax, st[s]['ang']), fr)
        key_rot(objs['fb'], rot((0, 0, 1), st['fb']), fr)
        key_rod2(objs['uc_rod'], st['fb_a'], st['ai_lo'], fr)
        key_rot(objs['ai'], rot(AX_X, st['ai']), fr)
        key_rod2(objs['rod2'], st['ai_hi'], st['rb2'], fr)
        key_rot(objs['rb'], rot((0, 0, 1), st['rb']), fr)
    push_clip(animated, AIL['name'], rest)

    # клип руля высоты
    L_v = (E['H0'] - E['V0']).length
    for k, fr in enumerate(ELV['frames']):
        th, e, pi, pf = E['stick'][k], E['elev'][k], E['ei'][k], E['fe'][k]
        q = rot(AX_X, th)
        for key in ('tt', 'el_lever', 'stops'):
            key_rot(objs[key], q, fr)
        for s in (1, -1):
            key_rot(objs[('stick', s)], q, fr)
            bot = rot_about(STICK[s], AX_X, th, STICK_BOT[s])
            key_rod2(objs[('st_rod', s)], bot, FB_STICK + V((0, 0, s * EYE)), fr)
        key_rod2(objs['el_short'], E['lev'][k], rot_about(EI_C, AX_X, pi, EI_LOe), fr)
        key_rot(objs['ei'], rot(AX_X, pi), fr)
        key_rod2(objs['el_long'], rot_about(EI_C, AX_X, pi, EI_HIe), rot_about(FE_C, AX_X, pf, FE_LONG), fr)
        key_rot(objs['fe'], rot(AX_X, pf), fr)
        key_rod2(objs['el_vert'], rot_about(FE_C, AX_X, pf, E['V0']), rot_about(ELEV_HINGE, AX_X, e, E['H0'] + V((EYE_OFF, 0, 0))), fr)
        key_rot(objs['e_horn'], rot(AX_X, e), fr)
    push_clip(animated, ELV['name'], rest)
    return objs


def push_clip(objs, name, rest=None):
    """Ключи клипа — в отдельную (выключенную) дорожку NLA с именем клипа; детали возвращаются в нейтраль.
    ref.export(mode='NLA_TRACKS') выгружает каждую дорожку отдельным клипом, split-da40.js вливает их
    в одноимённые клипы исходника."""
    for ob in objs:
        ad = ob.animation_data
        if not ad or not ad.action:
            continue
        a = ad.action
        a.name = name
        tr = ad.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, int(a.frame_range[0]), a)
        tr.mute = True
        ad.action = None
        if rest and ob.name in rest:
            ob.location, ob.rotation_quaternion, ob.scale = rest[ob.name]


def set_clip(name):
    """Включить для проверки действие клипа name у всех деталей (остальные — нейтраль)."""
    for ob in COL.all_objects:
        ad = ob.animation_data
        if not ad:
            continue
        ad.action = None
        for tr in ad.nla_tracks:
            for st in tr.strips:
                if st.action and st.action.name.split('.')[0] == name:
                    ad.action = st.action


def inside_shell(q):
    """Точка внутри обшивки: и вверх, и вниз луч упирается в обшивку изнутри."""
    up = R.shell.ray_cast(q, V((0, 0, 1)), 3.0)
    dn = R.shell.ray_cast(q, V((0, 0, -1)), 3.0)
    return up[0] is not None and dn[0] is not None and up[1].z > 0 and dn[1].z < 0


def owner_bvh(objs):
    """BVH всех граней objs и имя детали для каждой грани."""
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    vs, fs, own = [], [], []
    for o in objs:
        m = o.evaluated_get(dg).to_mesh()
        m.calc_loop_triangles()
        base = len(vs)
        mw = o.matrix_world
        vs += [mw @ v.co for v in m.vertices]
        for t in m.loop_triangles:
            fs.append(tuple(base + i for i in t.vertices))
            own.append(o.name)
        o.evaluated_get(dg).to_mesh_clear()
    return BVHTree.FromPolygons(vs, fs), own


def check():
    """Зазоры деталей слоя в начале, середине и конце каждого клипа: до отделки салона, деталей
    управления исходника и соседних слоёв (LAYERS); детали снаружи обшивки."""
    trim = [o for o in bpy.data.collections['DA40 Interior'].all_objects if o.type == 'MESH' and o.name not in ref.REPLACED and
            not any(m and 'Glass' in m.name for m in o.data.materials)]
    src = [o for o in bpy.data.collections['Flight controls'].all_objects if o.type == 'MESH' and o.name not in ref.REPLACED]
    before = set(bpy.data.objects)
    layers = os.environ.get('LAYERS', '/home/user/da40src/out2')
    for g in ('fuel', 'brakes', 'pitot', 'air', 'wing', 'electrical', 'structure', 'radio', 'instruments', 'equipment', 'bonding', 'gear'):
        f = os.path.join(layers, f'da40-{g}-raw.glb')
        if os.path.exists(f):
            bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location.z -= R.lift
    bpy.context.view_layer.update()
    others = {'trim': owner_bvh(trim), 'controls': owner_bvh(src), 'layers': owner_bvh([o for o in new if o.type == 'MESH'])}
    mine = [o for o in COL.all_objects if o.type == 'MESH']
    seen = set()
    for clip, frames in ((FLAP_CLIP, FRAMES), (AIL['name'], AIL['frames']), (ELV['name'], ELV['frames'])):
        set_clip(clip)
        for fr in (frames[0], frames[len(frames) // 2], frames[-1]):
            bpy.context.scene.frame_set(fr)
            bpy.context.view_layer.update()
            for o in mine:
                if not (o.animation_data and o.animation_data.action) and fr != frames[0]:
                    continue                                   # неподвижные детали — один раз
                vs = [o.matrix_world @ v.co for v in o.data.vertices][::2]
                worst = (9.0, None, None)
                for tag, (b, own) in others.items():
                    for q in vs:
                        h = b.find_nearest(q, 0.03)
                        if h[0] is not None and h[3] < worst[0]:
                            worst = (h[3], tag, own[h[2]])
                if worst[0] < 0.002:
                    key = (o.name, worst[2])
                    if key not in seen:
                        seen.add(key)
                        print(f'NEAR {clip[:8]} f{fr} {o.name}: {worst[0] * 1000:.1f} мм до {worst[1]}: {worst[2]}')
                if fr == frames[0] and clip == FLAP_CLIP or (o.animation_data and o.animation_data.action):
                    out = sum(1 for q in vs if not inside_shell(q))
                    if out:
                        print(f'OUTSIDE {clip[:8]} f{fr} {o.name}: {out}/{len(vs)} вершин снаружи обшивки')
    set_clip(None)
    bpy.context.scene.frame_set(FRAMES[0])


objs, frames = build()
bpy.context.scene.frame_set(FRAMES[0])
push_clip(list(COL.all_objects), FLAP_CLIP)          # закрылки убраны — нейтраль
pedal_adjusters()
elevator_rod_guides()
build_sticks_and_chains()
if os.environ.get('CHECK'):
    check()
dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift, anim=True, mode='NLA_TRACKS')
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'CONTROLS_OK {OUT} {size / 1e6:.2f} MB, parts {len(COL.all_objects) - 1}')
