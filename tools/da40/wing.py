"""Силовой набор крыла DA 40 NG — отдельный слой сайта.

    python3 tools/da40/wing.py [out.glb]

AMM 6.02.15 Rev. 3 разд. 57-10 (рис. 1–3), Корнеев 2012 разд. 2.2.
Нервюры баков стоят там, где бак из fuel.py опирается резиной, а вырез в них —
тот же контур бака с зазором под резину: всё считается одной функцией
sections.Sections, поэтому слои совпадают без подгонки.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402  (bmesh и mathutils появляются только после bpy)
from mathutils import Matrix, Vector as V  # noqa: E402

import lib  # noqa: E402
import ref  # noqa: E402
from lib import Part, box, cyl, hexa, ring_tube, screw  # noqa: E402
from sections import TANK_CLR, Sections, ellipse, loft, plate_with_hole, plate_with_holes, resample_closed  # noqa: E402
import stub  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-wing-raw.glb'

ref.open_source()
R = ref.Ref()
S = Sections(R)
OLD = 'Wing structure'
COL = lib.collection('DA40 Wing structure (AMM 57-10)')

M = dict(
    cfrp=lib.mat('DA40 CFRP spar cap (unidirectional carbon)', (0.07, 0.07, 0.08), 0.25, 0.35,
                 ru='углепластик, однонаправленные ленты'),
    gfrp=lib.mat('DA40 GFRP moulding', (0.83, 0.84, 0.74), 0.0, 0.55, ru='стеклопластик'),
    web=lib.mat('DA40 GFRP shear web (foam sandwich)', (0.76, 0.80, 0.70), 0.0, 0.6,
                ru='сэндвич: стеклопластик и жёсткий пенопласт'),
    insert=lib.mat('DA40 solid GFRP insert', (0.55, 0.62, 0.48), 0.0, 0.5, ru='монолитная вставка из стеклопластика'),
    steel=lib.mat('DA40 stainless steel', (0.62, 0.63, 0.65), 1.0, 0.28, ru='нержавеющая сталь'),
    alu=lib.mat('DA40 aluminium', (0.80, 0.81, 0.83), 1.0, 0.32, ru='алюминиевый сплав'),
    rubber=lib.mat('DA40 rubber', (0.05, 0.05, 0.05), 0.0, 0.9, ru='резина'),
    paste=lib.mat('DA40 bonding paste', (0.72, 0.70, 0.60), 0.0, 0.8, ru='клеевая паста (смола с наполнителем)'),
)

ROOT_X = 1.205       # корневая нервюра
END_X = 5.523        # концевая нервюра
TANK_RIBS = [(1.385, 'inner 1'), (2.375, 'inner 2'), (2.62, 'outer 1'), (3.02, 'outer 2')]
CONTROL_RIBS = [(2.80, 'Flap control rib', 'Нервюра крепления качалки закрылка: изгиб с монолитной вставкой под качалку'),
                (3.25, 'Flap control rib 2 (push rod guide)', 'Вторая нервюра закрылка: направляющая тяги элерона с роликами'),
                (3.88, 'Aileron control rib', 'Нервюра крепления качалки элерона: изгиб с монолитной вставкой')]
OUTER_RIBS = [4.49, 5.09]
SIDE = {+1: ('LH', 'левого'), -1: ('RH', 'правого')}


def P(name, ru, m, doc='AMM 57-10'):
    return Part(name, ru, M[m], COL, True, doc)


def lin(x, x0, x1, a, b):
    t = min(1.0, max(0.0, (abs(x) - x0) / (x1 - x0)))
    return a + (b - a) * t


# ── Опорные линии, снятые с прежней модели и обшивки ───────────────────────

_rw = ref._bvh([bpy.data.objects['Rear web LH']])
for _o in list(bpy.data.collections[OLD].all_objects):
    _o.name = _o.name + ' (old)'


def front_web(X):
    """Центр стенки переднего лонжерона (прямой, чуть уходит назад к законцовке)."""
    return lin(X, 1.5, 3.9, 0.0666, 0.0692) - 0.009


def rear_web_spar(X):
    Xc = math.copysign(min(max(abs(X), 1.33), 5.45), X)
    lo, up = R.wing_section(Xc, 0.28)
    return R.spar_faces(Xc, (lo + up) / 2)[1] + 0.009


def rear_web_te(X):
    """Задняя стенка крыла (закрывает заднюю кромку перед закрылком/элероном)."""
    x = min(max(abs(X), 1.25), 5.38)
    lo, up = R.wing_section(x, 0.6)
    h = _rw.ray_cast(V((x, 0.45, (lo + up) / 2)), V((0, 1, 0)), 1)[0]
    if h is None:   # по краям стенки луч может проскочить — прямая по замерам
        return lin(x, 1.3, 5.4, 0.673, 0.520) + 0.004
    return h.y + 0.004


def le_y(X):
    """Самая передняя точка, где верх и низ ещё разнесены — носок профиля."""
    y = 0.0
    while y > -0.4:
        u, l = R.skin(X, y - 0.005, 'upper')[0], R.skin(X, y - 0.005, 'lower')[0]
        if u is None or l is None or u.z - l.z < 0.02:
            break
        y -= 0.005
    return y


# ── Лонжероны ─────────────────────────────────────────────────────────────

def spar(s, which):
    tag, gen = SIDE[s]
    yfun = front_web if which == 'front' else rear_web_spar
    xs = [ROOT_X + (END_X - ROOT_X) * i / 40 for i in range(41)]
    caps = {'top': [], 'bot': []}
    web = []
    for x in xs:
        X = s * x
        yc = yfun(X)
        w = lin(x, ROOT_X, END_X, 0.078, 0.042) / 2
        t = lin(x, ROOT_X, END_X, 0.012, 0.004)
        ys = (yc - w, yc, yc + w)
        top = [V((X, y, S.up_in(X, y))) for y in ys]
        bot = [V((X, y, S.lo_in(X, y))) for y in ys]
        caps['top'].append([top[0], top[1], top[2], top[2] - V((0, 0, t)), V((X, yc, top[1].z - t)), top[0] - V((0, 0, t))])
        caps['bot'].append([bot[0] + V((0, 0, t)), V((X, yc, bot[1].z + t)), bot[2] + V((0, 0, t)), bot[2], bot[1], bot[0]])
        hw = 0.007
        zt, zb = S.up_in(X, yc) - t, S.lo_in(X, yc) + t
        web.append([V((X, yc - hw, zb)), V((X, yc + hw, zb)), V((X, yc + hw, zt)), V((X, yc - hw, zt))])
    name = 'Front' if which == 'front' else 'Rear'
    ru = 'переднего' if which == 'front' else 'заднего'
    for k, key in (('top', 'верхний'), ('bot', 'нижний')):
        p = P(f'{name} spar {k} cap {tag}', f'{key.capitalize()} пояс {ru} лонжерона {gen} крыла: однонаправленный углепластик, слоёв меньше к законцовке',
              'cfrp', 'AMM 57-10 2.B')
        loft(p, caps[k], 0)
        p.done()
    p = P(f'{name} spar shear web {tag}', f'Стенка {ru} лонжерона {gen} крыла: стеклопластик с пенопластом, работает на сдвиг',
          'web', 'AMM 57-10 2.B, Корнеев рис. 2.5')
    loft(p, web, 0)
    p.done()


# ── Нервюры ───────────────────────────────────────────────────────────────

def rib_outline(X, y0, y1, n=64, rc=0.008):
    return S.ring(X, 0.0, n=n, rc=rc, y0=y0, y1=y1)


def flanges(p, X, y0, y1, side, mi, w=0.018, t=0.0025):
    """Отбортовки нервюры, приклеенные к верхней и нижней обшивке."""
    ys = [y0 + (y1 - y0) * i / 8 for i in range(9)]
    for surf in ('up', 'lo'):
        rings = []
        for y in ys:
            z = S.up_in(X, y) if surf == 'up' else S.lo_in(X, y)
            d = -1 if surf == 'up' else 1
            a = V((X, y, z))
            b = V((X + side * w, y, z))
            rings.append([a, b, b + V((0, 0, d * t)), a + V((0, 0, d * t))])
        loft(p, rings, mi, caps=True, smooth=False)


def tank_rib(s, x, label):
    tag, gen = SIDE[s]
    X = s * x
    y0, y1 = front_web(X) + 0.007, rear_web_spar(X) - 0.007
    outer = rib_outline(X, y0, y1)
    hole = S.ring(X, TANK_CLR - 0.0035, n=64)
    inner = 'inner' in label
    p = P(f'Fuel tank rib {label} {tag}',
          (f'Нервюра {"внутренней" if inner else "наружной"} камеры бака {gen} крыла: большой овальный вырез с плоской полкой, '
           + ('через неё проходит бак, между ними резиновая лента' if inner else
              'в стандартной конфигурации сквозь вырез проходит только труба горловины')),
          'gfrp', 'AMM 57-10 2.D, 28-10')
    plate_with_hole(p, outer, hole, (1, 0, 0), 0.004, 0)
    # плоская полка вдоль выреза
    side = 1 if x < 2.0 else -1
    ring2 = [q + V((s * side * 0.022, 0, 0)) for q in hole]
    thick = [S.ring(X, TANK_CLR - 0.0035 - 0.0025, n=64)]
    loft(p, [hole, ring2], 0, caps=False)
    loft(p, [[q + V((s * side * 0.022, 0, 0)) for q in thick[0]], thick[0]], 0, caps=False)
    flanges(p, X, y0, y1, s * side, 0)
    p.done()


def control_rib(s, x, name, ru):
    tag, gen = SIDE[s]
    X = s * x
    y0, y1 = rear_web_spar(X) + 0.007, rear_web_te(X) - 0.004
    outer = rib_outline(X, y0, y1, n=40, rc=0.006)
    c = sum(outer, V()) / len(outer)
    hole = ellipse(c, (y1 - y0) * 0.22, (max(q.z for q in outer) - min(q.z for q in outer)) * 0.22, 40)
    p = P(f'{name} {tag}', f'{ru} ({gen} крыло)', 'gfrp', 'AMM 57-10 2.E')
    plate_with_hole(p, resample_closed(outer, 40), hole, (1, 0, 0), 0.004, 0)
    # изгиб с монолитной вставкой под кронштейн качалки
    ins = V((X, (y0 + y1) / 2 + 0.01, c.z))
    box(p, ins + V((s * 0.012, 0, 0)), (0.024, (y1 - y0) * 0.55, (max(q.z for q in outer) - min(q.z for q in outer)) * 0.55),
        Matrix.Identity(3), p.m(M['insert']), bevel=0.003)
    flanges(p, X, y0, y1, s, 0)
    p.done()


def plain_rib(s, x, name, ru, y0=None, y1=None, hole=True):
    tag, gen = SIDE[s]
    X = s * x
    y0 = front_web(X) + 0.007 if y0 is None else y0
    y1 = rear_web_spar(X) - 0.007 if y1 is None else y1
    outer = rib_outline(X, y0, y1, n=56, rc=0.008)
    h = None
    if hole:
        c = sum(outer, V()) / len(outer)
        zs = [q.z for q in outer]
        h = ellipse(c, (y1 - y0) * 0.36, (max(zs) - min(zs)) * 0.3, 56)
    p = P(f'{name} {tag}', f'{ru} ({gen} крыло)', 'gfrp', 'AMM 57-10 2')
    plate_with_hole(p, outer, h, (1, 0, 0), 0.004, 0)
    flanges(p, X, y0, y1, -s, 0)
    p.done()
    return outer


def root_rib(s):
    tag, gen = SIDE[s]
    X = s * ROOT_X
    yf = front_web(X)
    yr = rear_web_spar(s * 1.33)
    yle = le_y(X) + 0.004
    yte = max(rear_web_te(X) + 0.03, 0.76)
    # передняя часть: от носка до переднего лонжерона, гнездо болта A
    p = P(f'Root rib front part {tag}', f'Передняя часть корневой нервюры {gen} крыла: гнездо болта A (передаёт подъёмную силу на центроплан); '
          'во втулках сквозь неё проходят жгут крыла' + (' и шланги ПВД, сигнализатора сваливания' if s > 0 else ''),
          'gfrp', 'AMM 57-10 2.C, 2.B(8), (9), Корнеев рис. 2.7')
    outer = S.ring(X, 0.0, n=48, rc=0.02, y0=yle, y1=yf - 0.007)
    passes = stub.passes('root', s)
    plate_with_holes(p, outer, [stub.circle(c, r + stub.GROMMET, 16) for c, r in passes], (1, 0, 0), 0.005, 0)
    a = V((X, -0.025, -0.065))
    cyl(p, a - V((s * 0.03, 0, 0)), a + V((s * 0.02, 0, 0)), 0.018, p.m(M['insert']), segs=20)
    p.done()
    g = P(f'Root rib grommets {tag}', f'Резиновые втулки трасс в передней части корневой нервюры {gen} крыла',
          'rubber', 'AMM 57-10 2.B(8), (9)')
    for c, r in passes:
        ring_tube(g, c, V((1, 0, 0)), r + stub.GROMMET + 0.003, r + 0.0018, 0.010, 0, segs=16)
    g.done()
    # средняя часть: люк для снятия бака, крышка на 11 шпильках
    p = P(f'Root rib middle part {tag}', f'Средняя часть корневой нервюры {gen} крыла: большой овальный люк — через него снимают бак',
          'gfrp', 'AMM 57-10 2.C, 28-10 2.A(3)')
    outer = S.ring(X, 0.0, n=64, rc=0.01, y0=yf + 0.007, y1=yr - 0.007)
    c = sum(outer, V()) / len(outer)
    zs = [q.z for q in outer]
    hz = (max(zs) - min(zs))
    hole = ellipse(c, (yr - yf) * 0.40, hz * 0.34, 64)
    plate_with_hole(p, outer, hole, (1, 0, 0), 0.005, 0)
    p.done()
    q = P(f'Root rib fuel tank access panel {tag}', f'Крышка люка корневой нервюры {gen} крыла: 11 гаек на шпильках',
          'alu', 'AMM 28-10 2.A(3)')
    pan = ellipse(c - V((s * 0.004, 0, 0)), (yr - yf) * 0.46, hz * 0.40, 64)
    plate_with_hole(q, pan, None, (1, 0, 0), 0.002, 0)
    for k in range(11):
        a = 2 * math.pi * (k + 0.5) / 11
        pos = V((X - s * 0.005, c.y + (yr - yf) * 0.43 * math.cos(a), c.z + hz * 0.37 * math.sin(a)))
        hexa(q, pos, pos - V((s * 0.004, 0, 0)), 0.007, q.m(M['steel']))
    q.done()
    # задняя часть: гнездо болта B, ролики тяг закрылка и элерона
    p = P(f'Root rib rear part {tag}', f'Задняя часть корневой нервюры {gen} крыла: гнездо болта B и направляющие ролики тяг закрылка и элерона',
          'gfrp', 'AMM 57-10 2.C')
    outer = S.ring(X, 0.0, n=40, rc=0.008, y0=yr + 0.009, y1=yte)
    plate_with_hole(p, outer, None, (1, 0, 0), 0.005, 0)
    b = V((X, 0.73, -0.125))
    cyl(p, b - V((s * 0.03, 0, 0)), b + V((s * 0.02, 0, 0)), 0.016, p.m(M['insert']), segs=20)
    for dz, yy in ((0.0, 0.60), (-0.03, 0.62)):
        rc = V((X + s * 0.012, yy, (S.up_in(X, yy) + S.lo_in(X, yy)) / 2 + dz))
        cyl(p, rc - V((0, 0, 0.009)), rc + V((0, 0, 0.009)), 0.009, p.m(M['alu']), segs=16)
    p.done()


def end_rib(s):
    tag, gen = SIDE[s]
    X = s * END_X
    yle = le_y(X) + 0.004
    yte = rear_web_te(X)
    p = P(f'End rib {tag}', f'Концевая нервюра {gen} крыла: 8 анкерных гаек крепления законцовки и узел швартовочного кольца',
          'gfrp', 'AMM 57-10 2.G')
    outer = S.ring(X, 0.0, n=64, rc=0.012, y0=yle, y1=yte)
    plate_with_hole(p, outer, None, (1, 0, 0), 0.005, 0)
    for k in range(8):
        q = outer[int(k * len(outer) / 8 + 3) % len(outer)]
        c = sum(outer, V()) / len(outer)
        pos = q + (c - q).normalized() * 0.012 + V((s * 0.004, 0, 0))
        hexa(p, pos, pos + V((s * 0.005, 0, 0)), 0.008, p.m(M['steel']))
    # узел швартовки (AMM 10-20 рис. 1): вставка на наружной стороне нервюры, резьбовая втулка — над кольцом
    # швартовки модели MSFS (x ±5,567, y 0,293); кольцо ввёрнуто снизу у стыка с законцовкой
    ring = V((s * 5.567, 0.293, 0.214))
    tp = V((ring.x, ring.y, S.lo_in(X, ring.y) + 0.02))
    box(p, V(((X + ring.x) / 2 + s * 0.006, ring.y, tp.z)), (abs(ring.x - X) + 0.024, 0.04, 0.04), Matrix.Identity(3), p.m(M['insert']), bevel=0.003)
    cyl(p, tp, ring + V((0, 0, 0.002)), 0.006, p.m(M['steel']), segs=12)
    p.done()


def rear_web(s):
    tag, gen = SIDE[s]
    xs = [ROOT_X + (5.40 - ROOT_X) * i / 30 for i in range(31)]
    rings = []
    for x in xs:
        X = s * x
        y = rear_web_te(X)
        zt, zb = S.up_in(X, y), S.lo_in(X, y)
        rings.append([V((X, y - 0.004, zb)), V((X, y + 0.004, zb)), V((X, y + 0.004, zt)), V((X, y - 0.004, zt))])
    p = P(f'Rear web {tag}', f'Задняя стенка {gen} крыла: закрывает заднюю кромку перед закрылком и элероном; в местах навесок — анкерные гайки',
          'gfrp', 'AMM 57-10 2.F')
    loft(p, rings, 0)
    p.done()


def copy_old(name, new_name, ru, doc):
    o = bpy.data.objects.get(name + ' (old)')
    if not o:
        print('нет в исходнике:', name)
        return
    me = o.data.copy()
    me.transform(o.matrix_world)
    ob = bpy.data.objects.new(new_name, me)
    COL.objects.link(ob)
    ob['ru'] = f'{ru} ({doc})'
    lib.LABELS[new_name] = ob['ru']


# ── Запорная трубка главных болтов (AMM 57-10 рис. 2) ──────────────────────

def _bolt_end(name, which):
    """Центр торца главного болта: 'aft' — задний, 'fwd' — передний."""
    o = bpy.data.objects[name + ' (old)']
    pts = [o.matrix_world @ v.co for v in o.data.vertices]
    if which == 'aft':
        y = max(q.y for q in pts)
        sel = [q for q in pts if q.y > y - 0.004]
    else:
        y = min(q.y for q in pts)
        sel = [q for q in pts if q.y < y + 0.004]
    c = sum(sel, V()) / len(sel)
    return V((c.x, y, c.z))


def main_bolt_lock(s):
    tag, gen = SIDE[s]
    f = _bolt_end(f'Front wing main bolt {tag}', 'aft')
    r = _bolt_end(f'Rear wing main bolt {tag}', 'fwd')
    d = (r - f).normalized()
    p = P(f'Main bolt long end-piece {tag}', f'Длинный наконечник в торце переднего главного болта {gen} крыла: на него надевается запорная трубка',
          'steel', 'AMM 57-10 рис. 2')
    cyl(p, f - d * 0.004, f + d * 0.070, 0.0075, 0, segs=16)
    hexa(p, f, f + d * 0.010, 0.022, 0)
    p.done()
    p = P(f'Main bolt short end-piece {tag}', f'Короткий наконечник в торце заднего главного болта {gen} крыла',
          'steel', 'AMM 57-10 рис. 2')
    cyl(p, r - d * 0.034, r + d * 0.004, 0.0075, 0, segs=16)
    hexa(p, r - d * 0.010, r, 0.022, 0)
    p.done()
    p = P(f'Main bolt locking tube {tag}', f'Запорная трубка главных болтов {gen} крыла: держит оба болта от выворачивания; '
          'снимают первой — сдвигают на длинный наконечник и вынимают короткий',
          'alu', 'AMM 57-10 рис. 2, 57-10 2.B(11)')
    a, b = f + d * 0.012, r - d * 0.012
    cyl(p, a, b, 0.0140, 0, segs=24)
    p.done()
    # запорный болт поперёк трубки у переднего конца, шайба и гайка
    p = P(f'Main bolt locking bolt {tag}', f'Болт запорной трубки {gen} крыла: проходит сквозь трубку и длинный наконечник, шайба и гайка',
          'steel', 'AMM 57-10 рис. 2')
    q = a + d * 0.020
    side = V((0, 0, 1)).cross(d).normalized()
    hexa(p, q + side * 0.0150, q + side * 0.0195, 0.010, 0)
    cyl(p, q + side * 0.0150, q - side * 0.0215, 0.0025, 0, segs=10)
    cyl(p, q - side * 0.0145, q - side * 0.0160, 0.0060, 0, segs=14)
    hexa(p, q - side * 0.0160, q - side * 0.0205, 0.008, 0)
    p.done()


# ── Кронштейны навески закрылка и элерона на задней стенке (AMM 57-10 рис. 4) ─

def _axis(bone):
    """Ось вращения поверхности: локальная Z объекта-кости из исходной модели."""
    m = bpy.data.objects[bone].matrix_world
    z = m.to_3x3() @ V((0, 0, 1))
    return m.translation.copy(), z.normalized()


def _on_axis(ax, X):
    p0, d = ax
    return p0 + d * ((X - p0.x) / d.x)


FLAP_HINGES = [1.33, 1.82, 2.32, 3.30, 3.80]        # пять навесок закрылка (57-50 2.E)
AIL_HINGES = [4.48, 4.95, 5.34]                     # три навески элерона (57-60 2.D)


def hinge_bracket(s, X, name, ru, ax, kind):
    """Кронштейн на задней стенке: стойка двумя болтами к стенке, ухо с втулкой на оси
    поверхности, на передней стороне стенки — анкерная пластина на заклёпках.
    kind: 'hinge' — обычная навеска; 'flap horn' — у кронштейна закрылка, с лапкой на
    нижнюю обшивку на трёх болтах; 'ail horn' — у кронштейна элерона, ось держит штифт."""
    h = _on_axis(ax, X)
    yw = rear_web_te(X)
    zlo, zup = S.lo_in(X, yw), S.up_in(X, yw)
    yb = yw + 0.004
    z0 = zlo + 0.004
    z1 = min(zlo + 0.048, zup - 0.004)
    zc = (z0 + z1) / 2
    p = P(name, ru, 'alu', 'AMM 57-10 рис. 4, 4.B')
    box(p, V((X, yb + 0.0015, zc)), (0.030, 0.003, z1 - z0), Matrix.Identity(3), 0, bevel=0.0008)
    # щека от стойки к уху
    root = V((X, yb + 0.003, min(max(h.z, z0 + 0.006), z1 - 0.006)))
    dv = h - root
    if dv.length > 0.004:
        box(p, (root + h) / 2, (0.005, 0.016, dv.length + 0.010), lib.basis(dv, up=V((1, 0, 0))), 0, bevel=0.0008)
    cyl(p, h - V((0.0055, 0, 0)), h + V((0.0055, 0, 0)), 0.0085, 0, segs=18)
    # втулка с буртиком и палец навески
    cyl(p, h - V((0.0070, 0, 0)), h + V((0.0070, 0, 0)), 0.0048, p.m(M['steel']), segs=14)
    ring_tube(p, h - V((s * 0.0065, 0, 0)), V((1, 0, 0)), 0.0075, 0.0045, 0.0012, p.m(M['steel']), segs=18)
    cyl(p, h - V((0.018, 0, 0)), h + V((0.018, 0, 0)), 0.0025, p.m(M['steel']), segs=10)
    # болты сквозь стойку и стенку: головки сзади, гайки спереди
    for dz in (-0.011, 0.011):
        q = V((X, yb + 0.003, zc + dz * min(1.0, (z1 - z0) / 0.034)))
        hexa(p, q, q + V((0, 0.004, 0)), 0.008, p.m(M['steel']))
        cyl(p, q, q - V((0, 0.020, 0)), 0.0024, p.m(M['steel']), segs=8)
    if kind == 'flap horn':
        # лапка на нижнюю обшивку: три болта снизу (большие шайбы и самоконтрящиеся гайки изнутри)
        fy = yw - 0.024
        fz = S.lo_in(X, fy) + 0.002
        box(p, V((X, fy, fz)), (0.030, 0.044, 0.003), Matrix.Identity(3), 0, bevel=0.0008)
        for dx, dy in ((-0.009, -0.012), (0.009, -0.012), (0.0, 0.010)):
            q = V((X + dx, fy + dy, fz + 0.0015))
            # головка болта снаружи под обшивкой, шайба и гайка на лапке внутри крыла
            cyl(p, q + V((0, 0, 0.006)), q - V((0, 0, 0.011)), 0.0024, p.m(M['steel']), segs=8)
            cyl(p, q - V((0, 0, 0.011)), q - V((0, 0, 0.013)), 0.0055, p.m(M['steel']), segs=12)
            cyl(p, q, q + V((0, 0, 0.001)), 0.0065, p.m(M['steel']), segs=14)
            hexa(p, q + V((0, 0, 0.001)), q + V((0, 0, 0.005)), 0.008, p.m(M['steel']))
    elif kind == 'ail horn':
        q = h + V((s * 0.012, 0, 0))
        cyl(p, q - V((0, 0, 0.007)), q + V((0, 0, 0.007)), 0.0012, p.m(M['steel']), segs=8)   # штифт пальца
    p.done()
    if kind == 'hinge':
        a = P(name + ' anchor-nut plate', 'Анкерная пластина на передней стороне задней стенки: две гайки под болты кронштейна, держится на заклёпках',
              'steel', 'AMM 57-10 2.F, рис. 4')
        ya = yw - 0.004 - 0.0012
        box(a, V((X, ya, zc)), (0.040, 0.0024, min(0.030, z1 - z0)), Matrix.Identity(3), 0)
        for dz in (-0.011, 0.011):
            q = V((X, ya - 0.0012, zc + dz * min(1.0, (z1 - z0) / 0.034)))
            cyl(a, q, q - V((0, 0.005, 0)), 0.0045, 0, segs=12)
        for dx in (-0.016, 0.016):
            screw(a, V((X + dx, ya - 0.0012, zc)), V((0, -1, 0)), 0.0035)
        a.done()


def hinges(s):
    tag, gen = SIDE[s]
    fl = _axis('Bone_l' if s > 0 else 'Bone_r')
    ai = _axis('Bone2_l' if s > 0 else 'Bone2_r')
    for k, x in enumerate(FLAP_HINGES):
        hinge_bracket(s, s * x, f'Flap hinge bracket {k + 1} {tag}',
                      f'Кронштейн навески {gen} закрылка № {k + 1} на задней стенке: два болта, ухо с втулкой и пальцем',
                      fl, 'hinge')
    hinge_bracket(s, s * 2.837, f'Flap control horn hinge bracket {tag}',
                  f'Кронштейн навески у кронштейна {gen} закрылка: стойка на задней стенке и лапка на нижней обшивке на трёх болтах; '
                  'гайки — через лючок качалки', fl, 'flap horn')
    hinge_bracket(s, s * 3.985, f'Aileron control horn hinge bracket {tag}',
                  f'Кронштейн навески у кронштейна {gen} элерона: палец фиксирует штифт', ai, 'ail horn')
    for k, x in enumerate(AIL_HINGES):
        nm = 'inner' if k == 0 else f'outer {k}'
        hinge_bracket(s, s * x, f'Aileron {nm} hinge bracket {tag}',
                      f'Кронштейн {"внутренней" if k == 0 else "наружной"} навески {gen} элерона на задней стенке: два болта, ухо с втулкой и пальцем',
                      ai, 'hinge')



def aileron_stops(s):
    """Нерегулируемые упоры элерона (AMM 27-10 2.): стеклопластиковый блок с резиновой накладкой,
    вклеенный изнутри в верхнюю обшивку перед передней кромкой элерона, над лопаткой балансира
    на наружном конце элерона. При полном отклонении элерона вниз лопатка поднимается и упирается в блок."""
    tag, gen = SIDE[s]
    X, y = s * 5.145, 0.445                    # середина лопатки: x 5,01…5,28, передняя кромка у y 0,42
    h = R.hit((X, y, 0.19), (0, 0, 1), 0.2)[0]
    zc = h.z if h is not None and h.z < 0.26 else 0.219
    p = P(f'Aileron stop block {tag}', f'Нерегулируемый упор {gen} элерона: стеклопластиковый блок с резиновой накладкой, вклеен '
          'изнутри в верхнюю обшивку перед передней кромкой элерона; в него упирается лопатка балансира при полном '
          'отклонении элерона вниз', 'insert', 'AMM 27-10 2.')
    box(p, V((X, y, zc - 0.009)), (0.07, 0.026, 0.018), Matrix.Identity(3), 0, bevel=0.002)
    box(p, V((X, y, zc - 0.019)), (0.066, 0.022, 0.003), Matrix.Identity(3), p.m(M['rubber']), bevel=0.001)
    p.done()

# ── Сборка ────────────────────────────────────────────────────────────────

for s in (+1, -1):
    tag, gen = SIDE[s]
    spar(s, 'front')
    spar(s, 'rear')
    root_rib(s)
    for x, label in TANK_RIBS:
        tank_rib(s, x, label)
    for x, name, ru in CONTROL_RIBS:
        control_rib(s, x, name, ru)
    for k, x in enumerate(OUTER_RIBS):
        plain_rib(s, x, f'Outer rib {k + 1}', f'Наружная нервюра {k + 1} между лонжеронами (не на всех серийных номерах)')
    end_rib(s)
    rear_web(s)
    for old, new, ru, doc in (
            (f'Front spar stub {tag}', f'Front spar stub {tag}', f'Комель переднего лонжерона {gen} крыла: коробка из стеклоткани вокруг поясов, выходит за корневую нервюру', 'AMM 57-10 2.B'),
            (f'Rear spar stub {tag}', f'Rear spar stub {tag}', f'Комель заднего лонжерона {gen} крыла', 'AMM 57-10 2.B'),
            (f'Front spar bush 1 {tag}', f'Front spar main bolt bush 1 {tag}', 'Большая втулка под главный болт, вклеена в комель переднего лонжерона', 'AMM 57-10 рис. 2'),
            (f'Front spar bush 2 {tag}', f'Front spar main bolt bush 2 {tag}', 'Большая втулка под главный болт, вклеена в комель переднего лонжерона', 'AMM 57-10 рис. 2'),
            (f'Rear spar bush 1 {tag}', f'Rear spar main bolt bush 1 {tag}', 'Большая втулка под главный болт, вклеена в комель заднего лонжерона', 'AMM 57-10 рис. 2'),
            (f'Rear spar bush 2 {tag}', f'Rear spar main bolt bush 2 {tag}', 'Большая втулка под главный болт, вклеена в комель заднего лонжерона', 'AMM 57-10 рис. 2'),
            (f'Front wing main bolt {tag}', f'Front wing main bolt {tag}', 'Передний главный болт: передаёт изгибающий момент крыла на центроплан', 'AMM 57-10 рис. 2'),
            (f'Rear wing main bolt {tag}', f'Rear wing main bolt {tag}', 'Задний главный болт', 'AMM 57-10 рис. 2'),
            (f'A-bolt (root rib) {tag}', f'A-bolt {tag}', 'Болт A в передней части корневой нервюры: передаёт подъёмную силу', 'AMM 57-10 2.C, рис. 3'),
            (f'B-bolt (root rib) {tag}', f'B-bolt {tag}', 'Болт B в задней части корневой нервюры: передаёт подъёмную силу', 'AMM 57-10 2.C, рис. 3')):
        copy_old(old, new, ru, doc)
    main_bolt_lock(s)
    hinges(s)
    aileron_stops(s)

ref.drop_collection(OLD)
dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'WING_OK {OUT} {size / 1e6:.2f} MB, parts {len(COL.all_objects) - 1}')
