"""Силовой набор фюзеляжа и оперения DA 40 NG — отдельный слой сайта.

    python3 tools/da40/structure.py [out.glb]

AMM 6.02.15 Rev. 3: 53-10 (рис. 1–4) — перегородка, профиль-«шляпа» под полом,
центроплан (главные шпангоуты, нервюры, задняя стенка), дуга, рама багажника,
шпангоуты 1–3, стенки и нервюры киля; 55-10, 55-20, 55-40 — лонжероны, нервюры
и задние стенки стабилизатора, узлы навески руля высоты и руля направления.

Сечения фюзеляжа снимаются лучами по внутренней поверхности обшивки исходной
модели, поэтому шпангоуты повторяют её без подгонки. Места привязаны к уже
построенным слоям: главные болты и комли лонжеронов (wing.py), узлы шасси
(gear.py), направляющие тяги руля высоты на раме багажника и шпангоутах
(controls), сопла в дуге (air.py), ось руля направления и руля высоты —
пустышки исходной модели.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Matrix, Vector as V  # noqa: E402

import lib  # noqa: E402
import ref  # noqa: E402
from lib import Part, box, cyl, hexa, ring_tube  # noqa: E402
from sections import ellipse, loft, plate_with_hole  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-structure-raw.glb'

ref.open_source()
R = ref.Ref()
COL = lib.collection('DA40 Fuselage and empennage structure (AMM 53-10, 55)')

M = dict(
    gfrp=lib.mat('DA40 GFRP moulding', (0.83, 0.84, 0.74), 0.0, 0.55, ru='стеклопластик'),
    frame=lib.mat('DA40 GFRP frame (fuselage)', (0.78, 0.80, 0.70), 0.0, 0.6, ru='стеклопластик, формованная деталь'),
    cfrp=lib.mat('DA40 CFRP cap (carbon cloth)', (0.07, 0.07, 0.08), 0.25, 0.35, ru='углепластик (слои углеткани)'),
    insert=lib.mat('DA40 solid GFRP insert', (0.55, 0.62, 0.48), 0.0, 0.5, ru='монолитная вставка из стеклопластика'),
    steel=lib.mat('DA40 stainless steel', (0.62, 0.63, 0.65), 1.0, 0.28, ru='нержавеющая сталь'),
    alu=lib.mat('DA40 aluminium', (0.80, 0.81, 0.83), 1.0, 0.32, ru='алюминиевый сплав'),
    fw=lib.mat('DA40 firewall stainless', (0.70, 0.71, 0.72), 1.0, 0.35, ru='лист нержавеющей стали'),
    blanket=lib.mat('DA40 ceramic fire blanket', (0.90, 0.88, 0.82), 0.0, 0.95, ru='керамический огнестойкий мат'),
    bearing=lib.mat('DA40 spherical bearing (steel)', (0.45, 0.46, 0.48), 1.0, 0.3, ru='сферический подшипник'),
)

T_SH = 0.006          # обшивка фюзеляжа (GFRP) — внутренняя поверхность чуть глубже наружной


def P(name, ru, m, doc):
    return Part(name, ru, M[m], COL, True, doc)


# ── Сечения по обшивке ────────────────────────────────────────────────────

_last_bz = {}


def bottom_z(x, y):
    h = R.hit((x, y, -2.0), (0, 0, 1), 4)[0]
    if h is None:                                   # дыра в обшивке исходника — берём соседнее значение
        return _last_bz.get(round(x, 3), -0.2)
    _last_bz[round(x, 3)] = h.z
    return h.z


def section(y, zc, angles, reach=1.2, closed=False):
    """Точки внутренней поверхности обшивки в плоскости y = const; угол от +Z к +X.
    Промахи (остекление, проёмы) заполняются по соседям."""
    pts = []
    for a in angles:
        d = V((math.sin(a), 0, math.cos(a)))
        h = R.hit((0.0, y, zc), d, reach)[0]
        pts.append((d, h - d * T_SH if h else None))
    ok = [i for i, (_, q) in enumerate(pts) if q is not None]
    assert ok, f'нет обшивки на y={y}'
    out = []
    for i, (d, q) in enumerate(pts):
        if q is None:
            lo = max([k for k in ok if k < i], default=None)
            hi = min([k for k in ok if k > i], default=None)
            if lo is None or hi is None:
                q = pts[lo if hi is None else hi][1]
            else:
                t = (i - lo) / (hi - lo)
                r = (pts[lo][1] - V((0, y, zc))).length * (1 - t) + (pts[hi][1] - V((0, y, zc))).length * t
                q = V((0, y, zc)) + d * r
        out.append((d, q))
    if closed:
        out = despike(out, V((0, y, zc)))
    return out


def despike(sec, c, k=3, tol=0.10):
    """Выбросы радиуса (подфюзеляжный гребень, шов днища) заменяем по соседям."""
    n = len(sec)
    r = [(q - c).length for _, q in sec]
    bad = []
    for i in range(n):
        nb = sorted(r[(i + j) % n] for j in range(-k, k + 1) if j)
        med = nb[len(nb) // 2]
        if abs(r[i] - med) > tol * med:
            bad.append(i)
    good = [i for i in range(n) if i not in bad]
    out = list(sec)
    for i in bad:
        lo = max([g for g in good if g < i], default=good[-1] - n)
        hi = min([g for g in good if g > i], default=good[0] + n)
        t = (i - lo) / (hi - lo)
        rr = r[lo % n] * (1 - t) + r[hi % n] * t
        d = sec[i][0]
        out[i] = (d, c + d * rr)
    return out


def centre(y, z_in=None):
    if z_in is not None:                       # изнутри: вверх и вниз до первой обшивки
        up = R.hit((0.0, y, z_in), (0, 0, 1), 3)[0]
        dn = R.hit((0.0, y, z_in), (0, 0, -1), 3)[0]
        return (up.z + dn.z) / 2
    lo = bottom_z(0.0, y)
    top = R.hit((0.0, y, lo + 0.05), (0, 0, 1), 3)[0]
    return (lo + top.z) / 2 if top else lo + 0.3


def ring_frame(name, ru, y, depth, doc, flange=0.022, t=0.005, n=72, lower_web=None, holes=(), z_in=0.14):
    """Кольцевой шпангоут: стенка от обшивки внутрь на depth и отбортовка вдоль обшивки.
    lower_web — высота сплошной нижней части (z), holes — отверстия в ней [(x, z, r)]."""
    zc = centre(y, z_in)
    ang = [2 * math.pi * i / n for i in range(n)]
    sec = section(y, zc, ang, closed=True)
    sec2 = section(y + flange, zc, ang, closed=True)
    p = P(name, ru, 'frame', doc)
    outer = [q for _, q in sec]
    inner = []
    for d, q in sec:
        i = q - d * depth
        if lower_web is not None and q.z < lower_web:
            i = V((i.x, y, lower_web))          # сплошная нижняя часть до высоты lower_web
        inner.append(i)
    plate_with_hole(p, outer, inner, (0, 1, 0), t, 0)
    # отбортовка вдоль обшивки
    a0 = outer
    a1 = [q for _, q in sec2]
    a2 = [q - d * 0.003 for d, q in sec2]
    a3 = [q - d * 0.003 for d, q in sec]
    loft(p, [a0, a1, a2, a3, a0], 0, caps=False, smooth=False)
    p.done()
    if lower_web is not None and holes:
        # отверстия в сплошной части показываем латунными втулками-проходниками
        h = P(name + ' grommets', 'Проходные втулки в нижней части: тросы руля направления, трос триммера, тяга руля высоты', 'alu', doc)
        for x, z, r in holes:
            ring_tube(h, V((x, y, z)), (0, 1, 0), r + 0.004, r, t + 0.004, 0, segs=18)
        h.done()
    return zc, sec


# ── Перегородка, «шляпа», центроплан ─────────────────────────────────────

FIREWALL_Y = -1.200            # передняя грань стального листа
MOUNT_PTS = [V((0.24, FIREWALL_Y, 0.30)), V((-0.24, FIREWALL_Y, 0.30)),
             V((0.30, FIREWALL_Y, -0.095)), V((-0.30, FIREWALL_Y, -0.095)), V((0.0, FIREWALL_Y, -0.105))]


def hull2d(pts):
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p_ in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p_) <= 0:
            lo.pop()
        lo.append(p_)
    for p_ in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p_) <= 0:
            up.pop()
        up.append(p_)
    return lo[:-1] + up[:-1]


def firewall():
    """Перегородка тремя слоями по контуру перегородки исходной модели: стеклопластиковая панель,
    огнестойкий керамический мат и лист нержавеющей стали спереди."""
    src = bpy.data.objects.get('Firewall')
    xz = [(round((src.matrix_world @ v.co).x, 4), round((src.matrix_world @ v.co).z, 4)) for v in src.data.vertices]
    hull = hull2d(xz)
    from sections import resample_closed
    for nm, ru, m, y, t in (
            ('Firewall GFRP panel', 'Противопожарная перегородка: панель из стеклопластика — закрывает фюзеляж спереди, на ней узлы моторамы и проходы систем', 'gfrp', -1.186, 0.010),
            ('Firewall ceramic blanket', 'Огнестойкий керамический мат на передней стороне перегородки', 'blanket', -1.1945, 0.007),
            ('Firewall stainless steel sheet', 'Лист нержавеющей стали поверх мата; детали, проходящие сквозь перегородку, прижимают лист и мат к панели', 'fw', -1.199, 0.0016)):
        p = P(nm, ru, m, 'AMM 53-10 2.B')
        outline = resample_closed([V((x, y, z)) for x, z in hull], 64)
        plate_with_hole(p, outline, None, (0, 1, 0), t, 0)
        p.done()
    # узлы крепления моторамы — пять точек (AMM 71-00)
    p = P('Engine mount attachment fittings (firewall)', 'Узлы крепления моторамы на перегородке — пять точек: два вверху, два внизу по бортам, один внизу посередине',
          'steel', 'AMM 53-10 2.B, 71-00')
    for c in MOUNT_PTS:
        box(p, c + V((0, -0.004, 0)), (0.05, 0.008, 0.05), Matrix.Identity(3), 0, bevel=0.002)
        for dx, dz in ((-0.016, -0.016), (0.016, -0.016), (-0.016, 0.016), (0.016, 0.016)):
            hexa(p, c + V((dx, -0.008, dz)), c + V((dx, -0.013, dz)), 0.008, 0)
    p.done()


HAT_X = (-0.078, 0.154)       # стенки снаружи опорных пластин подшипников носовой стойки (gear.py)
HAT_TOP = -0.085
HAT_Y = (-1.17, 0.012)


def top_hat():
    p = P('Top hat profile', 'Профиль-«шляпа» на днище за перегородкой: продольная жёсткость носовой части, крепление носовой стойки, каналы топливных трубопроводов; сверху на него ложится пол',
          'frame', 'AMM 53-10 2.C, рис. 1')
    ys = [HAT_Y[0] + (HAT_Y[1] - HAT_Y[0]) * i / 24 for i in range(25)]
    t = 0.005
    for k, xw in enumerate(HAT_X):
        s = -1 if k == 0 else 1
        wall, flange = [], []
        for y in ys:
            zb = bottom_z(xw, y) + T_SH
            zf = bottom_z(xw + s * 0.03, y) + T_SH
            wall.append([V((xw, y, zb)), V((xw + s * t, y, zb)), V((xw + s * t, y, HAT_TOP)), V((xw, y, HAT_TOP))])
            flange.append([V((xw, y, zb)), V((xw + s * 0.03, y, zf)), V((xw + s * 0.03, y, zf + t)), V((xw, y, zb + t))])
        loft(p, wall, 0, smooth=False)
        loft(p, flange, 0, smooth=False)
    cap = [[V((HAT_X[0], y, HAT_TOP)), V((HAT_X[1] + 0.005, y, HAT_TOP)), V((HAT_X[1] + 0.005, y, HAT_TOP + t)),
            V((HAT_X[0] - 0.005, y, HAT_TOP + t))] for y in ys]
    loft(p, cap, 0, smooth=False)
    p.done()
    q = P('Top hat profile nose gear inserts', 'Монолитные вставки в стенках «шляпы» под опорные пластины подшипников носовой стойки',
          'insert', 'AMM 53-10 2.C, 32-20')
    for xw, s in ((HAT_X[0], -1), (HAT_X[1], 1)):
        box(q, V((xw + s * 0.008, -0.970, -0.130)), (0.006, 0.09, 0.085), Matrix.Identity(3), 0, bevel=0.002)
    q.done()


STUB_X = 1.19                 # торец центроплана у корневой нервюры крыла (1,205)
FUS_X = 0.62                  # борт фюзеляжа на уровне центроплана


def stub_top(x, y):
    lo, up = R.wing_section(max(abs(x), FUS_X) * (1 if x >= 0 else -1), y)
    return up - T_SH


def stub_bot(x, y):
    if abs(x) < FUS_X:
        return bottom_z(x, y) + T_SH
    lo, up = R.wing_section(x, y)
    return lo + T_SH


def main_bulkhead(tag, ru_name, y0, y1, bolt, doc_extra=''):
    """Коробчатый главный шпангоут центроплана: две стенки и углепластиковые полки сверху и снизу."""
    xs = [-STUB_X + 2 * STUB_X * i / 48 for i in range(49)]
    t, tc = 0.006, 0.006
    p = P(f'{tag} main bulkhead', f'{ru_name} главный шпангоут центроплана: коробка из стеклопластика от торца до торца центроплана; '
          'в неё входят комли лонжеронов крыла, сквозь стенки — главные болты' + doc_extra, 'frame', 'AMM 53-10 2.E, рис. 2')
    fr, rr = [], []
    for x in xs:
        zb, zt = stub_bot(x, (y0 + y1) / 2), stub_top(x, (y0 + y1) / 2)
        fr.append([V((x, y0, zb)), V((x, y0 + t, zb)), V((x, y0 + t, zt)), V((x, y0, zt))])
        rr.append([V((x, y1 - t, zb)), V((x, y1, zb)), V((x, y1, zt)), V((x, y1 - t, zt))])
    loft(p, fr, 0, smooth=False)
    loft(p, rr, 0, smooth=False)
    p.done()
    c = P(f'{tag} main bulkhead carbon caps', f'Верхняя и нижняя полки {ru_name.lower()[:-2]}ого главного шпангоута: слои углеткани дают прочность и жёсткость',
          'cfrp', 'AMM 53-10 2.E')
    top, bot = [], []
    for x in xs:
        zb, zt = stub_bot(x, (y0 + y1) / 2), stub_top(x, (y0 + y1) / 2)
        top.append([V((x, y0, zt - tc)), V((x, y1, zt - tc)), V((x, y1, zt)), V((x, y0, zt))])
        bot.append([V((x, y0, zb)), V((x, y1, zb)), V((x, y1, zb + tc)), V((x, y0, zb + tc))])
    loft(c, top, 0, smooth=False)
    loft(c, bot, 0, smooth=False)
    c.done()
    b = P(f'{tag} main bulkhead bushes', f'Втулки {ru_name.lower()[:-2]}ого главного шпангоута под главные болты крыла — по две на борт',
          'steel', 'AMM 57-10 рис. 2')
    for s in (1, -1):
        q = V((s * bolt.x, 0, bolt.z))
        for y in (y0 + t / 2, y1 - t / 2):
            ring_tube(b, V((q.x, y, q.z)), (0, 1, 0), 0.030, 0.022, 0.016, 0, segs=24)
    b.done()


def rib_plate(name, ru, x, y0, y1, doc, hole=None, n=24, m='frame'):
    """Нервюра центроплана в плоскости x = const между y0 и y1 по высоте профиля."""
    ys = [y0 + (y1 - y0) * i / n for i in range(n + 1)]
    bot = [V((x, y, stub_bot(x, y))) for y in ys]
    top = [V((x, y, stub_top(x, y))) for y in reversed(ys)]
    outer = bot + top
    p = P(name, ru, m, doc)
    inner = None
    if hole:
        c = sum(outer, V()) / len(outer)
        zs = [q.z for q in outer]
        # обход тот же, что у контура: от передней нижней точки назад по низу
        inner = ellipse(c, (y1 - y0) * hole, (max(zs) - min(zs)) * 0.30, len(outer), phase=1.25 * math.pi)
    plate_with_hole(p, outer, inner, (1, 0, 0), 0.005, 0)
    p.done()


FRONT_MB = (0.012, 0.118)      # передний главный шпангоут: комель переднего лонжерона 0,02…0,11 внутри
REAR_MB = (0.472, 0.578)       # задний: комель заднего лонжерона 0,48…0,57
REAR_WEB_Y = 0.685             # задняя стенка центроплана — на линии задней стенки крыла
REAR_CLOSING_X = 0.660         # задняя замыкающая нервюра (controls.py)


def centre_section():
    main_bulkhead('Front', 'Передний', *FRONT_MB, V((1.044, 0, -0.064)))
    main_bulkhead('Rear', 'Задний', *REAR_MB, V((1.044, 0, -0.098)),
                  '; на задней стенке посередине — кронштейн качалки элеронов')
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        gen = 'левого' if s > 0 else 'правого'
        X = s * STUB_X
        rib_plate(f'Front outer rib {tag}', f'Передняя наружная нервюра центроплана {gen} борта: торец носка центроплана перед передним шпангоутом',
                  X, -0.245, FRONT_MB[0], 'AMM 53-10 2.E')
        rib_plate(f'Middle outer rib {tag}', f'Средняя наружная нервюра центроплана {gen} борта между главными шпангоутами: большой вырез напротив люка корневой нервюры крыла — через него снимают бак',
                  X, FRONT_MB[1], REAR_MB[0], 'AMM 53-10 2.E, 28-10', hole=0.40)
        rib_plate(f'Rear outer rib {tag}', f'Задняя наружная нервюра центроплана {gen} борта: от заднего шпангоута до задней стенки',
                  X, REAR_MB[1], REAR_WEB_Y, 'AMM 53-10 2.E')
        rib_plate(f'Rear closing rib {tag}', f'Задняя замыкающая нервюра центроплана {gen} борта: от заднего шпангоута до задней стенки; на левой — привод закрылков',
                  s * REAR_CLOSING_X, REAR_MB[1], REAR_WEB_Y, 'AMM 53-10 2.E, 27-50')
        # задняя стенка центроплана между замыкающей и наружной нервюрами
        xs = [s * (REAR_CLOSING_X + (STUB_X - REAR_CLOSING_X) * i / 12) for i in range(13)]
        p = P(f'Centre section rear web {tag}', f'Задняя стенка центроплана {gen} борта: закрывает центроплан перед закрылком',
              'frame', 'AMM 53-10 2.E, рис. 2')
        rings = []
        for x in xs:
            zb, zt = stub_bot(x, REAR_WEB_Y), stub_top(x, REAR_WEB_Y)
            rings.append([V((x, REAR_WEB_Y - 0.003, zb)), V((x, REAR_WEB_Y + 0.003, zb)), V((x, REAR_WEB_Y + 0.003, zt)), V((x, REAR_WEB_Y - 0.003, zt))])
        loft(p, rings, 0, smooth=False)
        p.done()
    # кронштейн качалки элеронов на задней стенке заднего главного шпангоута, посередине
    p = P('Control bellcrank mounting bracket', 'Кронштейн качалки элеронов: приклеен к задней стенке заднего главного шпангоута посередине',
          'alu', 'AMM 53-10 2.E, 27-10')
    c = V((-0.045, REAR_MB[1] + 0.003, -0.10))
    box(p, c, (0.07, 0.006, 0.07), Matrix.Identity(3), 0, bevel=0.002)
    for dz in (-0.022, 0.022):
        box(p, c + V((0, 0.022, dz)), (0.04, 0.04, 0.005), Matrix.Identity(3), 0, bevel=0.0015)
    p.done()


# ── Дуга, рама багажника, шпангоуты ──────────────────────────────────────

ROLL_Y = 0.27                  # сопла задних пассажиров стоят в дуге (air.py: y 0,21…0,29)


def roll_bar():
    zc = centre(ROLL_Y)
    ang = [math.radians(-112 + 224 * i / 56) for i in range(57)]
    sec = section(ROLL_Y, zc, ang)
    dep, th = 0.075, 0.045
    p = P('Roll bar', 'Дуга безопасности за передними креслами: стеклопластик с углеродной лентой; приклеена к обшивке и обрамляет проёмы фонаря, окон и двери; в ней сопла задних пассажиров',
          'frame', 'AMM 53-10 2.F, рис. 3')
    rects = []
    for d, q in sec:
        if q.z < -0.02:
            continue
        a = q - V((0, dep / 2, 0))
        b = q + V((0, dep / 2, 0))
        rects.append([a, b, b - d * th, a - d * th])
    loft(p, rects, 0, smooth=True)
    p.done()
    c = P('Roll bar carbon tape', 'Углеродная лента по внутренней кромке дуги: прочность и жёсткость', 'cfrp', 'AMM 53-10 2.F')
    rects = []
    for d, q in sec:
        if q.z < -0.02:
            continue
        a = q - d * th - V((0, dep / 2 - 0.004, 0))
        b = q - d * th + V((0, dep / 2 - 0.004, 0))
        rects.append([a, b, b - d * 0.004, a - d * 0.004])
    loft(c, rects, 0, smooth=True)
    c.done()


BAGGAGE_Y = 2.262              # направляющая тяги руля высоты на раме багажника (controls: y 2,25…2,26)
RING_Y = [(3.150, 1), (4.020, 2), (4.250, 3)]   # шпангоуты 1 и 2 — по направляющим тяги, 3 — перед килем


def frames():
    zc, _ = ring_frame('Baggage compartment frame',
                       'Рама багажного отсека: замыкает кабину сзади и служит опорой заднего сиденья; внизу проходы тросов руля направления, триммера и направляющая тяги руля высоты',
                       BAGGAGE_Y, 0.075, 'AMM 53-10 2.G, рис. 3', flange=0.025, lower_web=-0.03, z_in=0.2,
                       holes=((0.06, -0.075, 0.012), (-0.06, -0.075, 0.012), (0.0, -0.09, 0.008)))
    for y, k in RING_Y:
        ru = {1: 'Шпангоут 1: сразу за рамой багажного отсека; отверстия для тросов руля направления и триммера, направляющая тяги руля высоты',
              2: 'Шпангоут 2: отверстия для тросов руля направления и триммера, направляющая тяги руля высоты',
              3: 'Шпангоут 3: перед килем; отверстия для тросов руля направления и триммера'}[k]
        ring_frame(f'Ring frame {k}', ru, y, 0.030, 'AMM 53-10 2.H–J, рис. 3')


# ── Киль ──────────────────────────────────────────────────────────────────

def fin_le(z):
    return 4.10 + 0.56 * z                    # по лучам: z 0,5 → 4,39; 1,1 → 4,73


RUDDER_P0 = None
RUDDER_D = None


def fin_half(y, z):
    a = R.hit((0.4, y, z), (-1, 0, 0), 1)[0]
    b = R.hit((-0.4, y, z), (1, 0, 0), 1)[0]
    if a is None or b is None:
        return None
    return (a.x - b.x) / 2 - T_SH, (a.x + b.x) / 2


def web_plate(p, pts_yz, t=0.006):
    """Стенка киля: по точкам (y, z) снизу вверх, ширина — между обшивками."""
    rings = []
    for y, z in pts_yz:
        hw = fin_half(y, z)
        if hw is None:
            continue
        h, xc = hw
        rings.append([V((xc - h, y - t / 2, z)), V((xc + h, y - t / 2, z)), V((xc + h, y + t / 2, z)), V((xc - h, y + t / 2, z))])
    loft(p, rings, 0, smooth=False)


FIN_LOW_Z = 0.36               # низ киля над хвостовой балкой
FIN_TOP_Z = 1.235              # под нижней обшивкой стабилизатора (1,245)
FW_BOT_Y, FW_TOP_Y = 4.560, 4.840
REAR_WEB_LOW_Z = 0.124         # над нижним кронштейном руля направления (верх 0,108) и тросом триммера


def fin():
    global RUDDER_P0, RUDDER_D
    arm = bpy.data.objects['Armature']                       # руль направления исходной модели
    RUDDER_P0 = arm.matrix_world.translation.copy()
    RUDDER_D = (arm.matrix_world.to_3x3() @ V((0, 0, 1))).normalized()

    def rud_y(z):
        return RUDDER_P0.y + RUDDER_D.y * (z - RUDDER_P0.z) / RUDDER_D.z

    zs = [FIN_LOW_Z - 0.32 + (FIN_TOP_Z - FIN_LOW_Z + 0.32) * i / 30 for i in range(31)]
    p = P('Vertical stabilizer front web', 'Передняя стенка киля: приклеена к обшивке и нижним нервюрам; верх — жёсткий швеллер со вставками, на нём кронштейны стабилизатора',
          'frame', 'AMM 53-10 2.M, рис. 4')
    pts = []
    for z in zs:
        t = max(0.0, (z - FIN_LOW_Z) / (FIN_TOP_Z - FIN_LOW_Z))
        pts.append((FW_BOT_Y + (FW_TOP_Y - FW_BOT_Y) * t, z))
    web_plate(p, pts)
    p.done()
    # швеллер наверху передней стенки — площадка под кронштейны стабилизатора
    c = P('Vertical stabilizer front web top channel', 'Швеллер наверху передней стенки киля с монолитными вставками: сюда на четырёх болтах каждый крепятся передний и задний кронштейны стабилизатора',
          'insert', 'AMM 53-10 2.M, 55-10')
    ch0, ch1 = FW_TOP_Y - 0.02, 5.20
    hw = 0.038
    box(c, V((0, (ch0 + ch1) / 2, FIN_TOP_Z - 0.003)), (2 * hw, ch1 - ch0, 0.006), Matrix.Identity(3), 0, bevel=0.001)
    for s in (1, -1):
        box(c, V((s * (hw - 0.003), (ch0 + ch1) / 2, FIN_TOP_Z - 0.025)), (0.006, ch1 - ch0, 0.045), Matrix.Identity(3), 0, bevel=0.001)
    c.done()
    p = P('Vertical stabilizer rear web', 'Задняя стенка киля: закрывает киль сзади; наверху — верхний узел навески руля направления, сзади приклеено усиливающее ребро',
          'frame', 'AMM 53-10 2.N, рис. 4')
    # снизу стенка кончается над нижним кронштейном руля (он ходит под ней вместе с рулём)
    web_plate(p, [(rud_y(z) - 0.035, z) for z in
                  [REAR_WEB_LOW_Z + (FIN_TOP_Z - REAR_WEB_LOW_Z) * i / 28 for i in range(29)]])
    p.done()
    r = P('Vertical stabilizer rear web reinforcing rib', 'Усиливающее ребро на задней стороне задней стенки киля под верхним узлом руля направления',
          'frame', 'AMM 53-10 2.N, рис. 4')
    for z0 in (FIN_TOP_Z - 0.20,):
        y = rud_y(z0) - 0.035 + 0.003
        box(r, V((0, y + 0.012, z0 + 0.08)), (0.005, 0.024, 0.16), Matrix.Identity(3), 0, bevel=0.001)
    r.done()
    # нижние нервюры киля
    for nm, ru, y0, y1, slot in (
            ('Vertical stabilizer front lower rib', 'Передняя нижняя нервюра киля: у основания киля, приклеена к обшивке и передней стенке; отверстие для гибкого троса триммера', fin_le(FIN_LOW_Z) + 0.04, FW_BOT_Y, False),
            ('Vertical stabilizer rear lower rib', 'Задняя нижняя нервюра киля между передней и задней стенками: большой паз для вертикальной тяги руля высоты', FW_BOT_Y, rud_y(FIN_LOW_Z) - 0.035, True)):
        p = P(nm, ru, 'frame', 'AMM 53-10 2.K–L, рис. 4')
        ys = [y0 + (y1 - y0) * i / 12 for i in range(13)]
        left, right = [], []
        for y in ys:
            hw = fin_half(y, FIN_LOW_Z)
            if hw is None:
                continue
            h, xc = hw
            left.append(V((xc + h, y, FIN_LOW_Z)))
            right.append(V((xc - h, y, FIN_LOW_Z)))
        outer = left + list(reversed(right))
        inner = None
        if slot:
            cy = (y0 + y1) / 2
            inner = [V((0.018 * math.cos(a), cy + 0.06 * math.sin(a), FIN_LOW_Z)) for a in
                     [-math.pi / 4 + 2 * math.pi * i / len(outer) for i in range(len(outer))]]
        plate_with_hole(p, outer, inner, (0, 0, 1), 0.005, 0)
        p.done()
    # верхняя опора руля: втулка с подшипником на задней стенке, снизу входит палец из передней кромки руля
    z = FIN_TOP_Z - 0.06
    q = V((0, rud_y(z), z))
    D = RUDDER_D
    p = P('Rudder upper hinge', 'Верхняя опора руля направления: втулка подшипника на задней стенке киля, подшипник, сверху проставка и '
          'стопорное кольцо; снизу в подшипник входит палец, вклеенный в переднюю кромку руля, на пальце — регулировочная втулка '
          '(зазор до подшипника 1,6–3,2 мм)', 'alu', 'AMM 55-40 2, рис. 2–3')
    box(p, q - V((0, 0.022, 0)), (0.034, 0.03, 0.03), Matrix.Identity(3), 0, bevel=0.002)
    cyl(p, q - D * 0.015, q + D * 0.015, 0.009, p.m(M['bearing']), segs=16)
    ring_tube(p, q + D * 0.0165, D, 0.0095, 0.004, 0.003, p.m(M['alu']), segs=18)       # проставка
    ring_tube(p, q + D * 0.0195, D, 0.0085, 0.0045, 0.0012, p.m(M['steel']), segs=18)   # стопорное кольцо
    cyl(p, q - D * 0.07, q + D * 0.012, 0.0035, p.m(M['steel']), segs=10)               # палец руля
    ring_tube(p, q - D * (0.015 + 0.0024 + 0.003), D, 0.008, 0.0035, 0.006, p.m(M['steel']), segs=18)
    p.done()
    rudder_lower()


# ── Нижняя опора руля направления (AMM 27-20 рис. 5, 55-40 рис. 3) ───────
# Хвостовая часть фюзеляжа кончается наклонным торцом перед нижней частью руля;
# на торце — опора (рама на четырёх болтах), к ней на вертикальном болте
# крепится нижний кронштейн руля. Кронштейн — швеллер поперёк: сзади его
# стенка прилегает к плоской площадке руля (два вклеенных в руль болта), по
# бокам — проушины тросов, спереди — болты-упоры с приваренными гайками.
# Кронштейн повторяет габарит детали исходной модели и лежит внутри него.

RL_Z = 0.076                    # высота тросов у кронштейна
RL_HY = 4.928                   # ось болта шарнира
RL_FACE = 4.980                 # плоская площадка руля (по лучам)


def end_face(x, z):
    """Торец хвостовой части: y и нормаль назад."""
    loc, nor = R.hit((x, 4.76, z), (0, 1, 0), 0.25)
    if loc is None:
        return 4.828 + 0.333 * z, V((0, 0.95, -0.316))
    n = nor if nor.y > 0 else -nor
    return loc.y, n.normalized()


def on_face(x, z, off):
    y, n = end_face(x, z)
    return V((x, y, z)) + n * off


def rudder_lower():
    # ── опора: рама на торце с окном под тросы и тягу руля высоты ──
    outer = [(0.044, 0.006), (0.056, 0.024), (0.060, 0.050), (0.060, 0.140)]
    inner = [(0.028, 0.020), (0.043, 0.036), (0.046, 0.050), (0.046, 0.128)]
    t = 0.005
    _, n0 = end_face(0.0, 0.07)
    ring_o = [on_face(x, z, 0.0008 + t / 2) for x, z in outer] + [on_face(-x, z, 0.0008 + t / 2) for x, z in reversed(outer)]
    ring_i = [on_face(x, z, 0.0008 + t / 2) for x, z in inner] + [on_face(-x, z, 0.0008 + t / 2) for x, z in reversed(inner)]
    p = P('Rudder pedestal', 'Опора руля направления: рама на торце хвостовой части фюзеляжа на четырёх болтах; через окно проходят '
          'тросы руля направления и тяга руля высоты; снизу — проушина болта нижнего кронштейна руля, на боковых стойках — '
          'площадки, в которые упираются болты-упоры', 'alu', 'AMM 27-20 рис. 1, 5; 55-40 рис. 3')
    plate_with_hole(p, ring_o, ring_i, n0, t, 0)
    for x, z in ((0.052, 0.034), (0.053, 0.134)):
        for s in (1, -1):
            a = on_face(s * x, z, 0.0008 + t)
            _, n = end_face(s * x, z)
            hexa(p, a, a + n * 0.0045, 0.008, p.m(M['steel']))
    # площадки упоров на стойках
    for s in (1, -1):
        a = on_face(s * 0.052, RL_Z, 0.0008 + t)
        box(p, V((s * 0.052, (a.y + 4.898) / 2, RL_Z)), (0.013, 4.898 - a.y, 0.020), None, 0, bevel=0.001)
    # проушина: лист по дну от рамы назад, стойка и горизонтальная проушина под кронштейном
    y0 = on_face(0.0, 0.010, 0.0008 + t).y
    box(p, V((0, (y0 + 4.912) / 2, 0.005)), (0.024, 4.912 - y0, 0.006), None, 0, bevel=0.001)
    box(p, V((0, 4.909, 0.0265)), (0.024, 0.006, 0.029), None, 0, bevel=0.001)
    box(p, V((0, (4.906 + RL_HY) / 2, 0.038)), (0.024, RL_HY - 4.906, 0.006), None, 0)
    cyl(p, V((0, RL_HY, 0.035)), V((0, RL_HY, 0.041)), 0.012, 0, segs=20)
    p.done()

    # ── нижний кронштейн руля (в нейтрали) ──
    W, YF, YB = 0.061, 4.941, RL_FACE - 0.001
    ZB0, ZB1, ZT0, ZT1 = 0.047, 0.052, 0.100, 0.106
    p = P('Rudder lower mounting bracket', 'Нижний кронштейн руля направления: стальной швеллер поперёк; стенка прилегает к плоской '
          'площадке у основания передней кромки руля и стягивается с ней двумя вклеенными в руль болтами (гайки с шайбами, 6,4 Н·м); '
          'по бокам — проушины тросов руля, спереди — шарнир на опоре и приваренные гайки болтов-упоров', 'steel',
          'AMM 27-20 2, рис. 5; 55-40 рис. 3')
    for z0, z1 in ((ZB0, ZB1), (ZT0, ZT1)):
        box(p, V((0, (YF + YB) / 2, (z0 + z1) / 2)), (2 * W, YB - YF, z1 - z0), None, 0, bevel=0.0008)
    box(p, V((0, YB - 0.0035, (ZB0 + ZT1) / 2)), (2 * W, 0.007, ZT1 - ZB0), None, 0, bevel=0.0008)
    # язычок нижней полки вперёд — шарнир на опоре, втулка над ним
    box(p, V((0, (RL_HY + YF) / 2 + 0.001, (ZB0 + ZB1) / 2)), (0.022, YF - RL_HY + 0.002, ZB1 - ZB0), None, 0)
    cyl(p, V((0, RL_HY, ZB0)), V((0, RL_HY, ZB1)), 0.011, 0, segs=20)
    cyl(p, V((0, RL_HY, ZB1)), V((0, RL_HY, ZB1 + 0.010)), 0.0085, p.m(M['bearing']), segs=18)
    # передние щёчки по краям: на них приварены гайки упоров
    for s in (1, -1):
        box(p, V((s * (W - 0.0085), YF - 0.0015, (ZB1 + ZT0) / 2)), (0.017, 0.003, ZT0 - ZB1), None, 0)
    # проушины тросов: болт между полками и наконечник троса на нём
    for s in (1, -1):
        q = V((s * 0.035, 4.952, RL_Z))
        cyl(p, V((q.x, q.y, ZB0 - 0.006)), V((q.x, q.y, ZT1 + 0.003)), 0.0026, 0, segs=10)
        hexa(p, V((q.x, q.y, ZT1)), V((q.x, q.y, ZT1 + 0.004)), 0.009, 0)
        hexa(p, V((q.x, q.y, ZB0 - 0.005)), V((q.x, q.y, ZB0)), 0.009, 0)
        ring_tube(p, q, (0, 0, 1), 0.006, 0.0027, 0.007, 0, segs=16)
    # болты руля: вклеены в площадку, выходят вперёд сквозь стенку, шайба и гайка
    for s in (1, -1):
        a = V((s * 0.022, RL_FACE, RL_Z))
        cyl(p, a, a - V((0, 0.020, 0)), 0.003, 0, segs=10)
        ring_tube(p, a - V((0, 0.008, 0)), (0, 1, 0), 0.0065, 0.003, 0.0016, 0, segs=16)
        hexa(p, a - V((0, 0.0088, 0)), a - V((0, 0.0145, 0)), 0.009, 0)
    p.done()

    # ── шарнир: болт снизу через проушину опоры, проставка, втулка кронштейна ──
    p = P('Rudder lower hinge bolt', 'Болт нижнего шарнира руля направления: снизу через проушину опоры, проставку и втулку '
          'нижнего кронштейна; сверху шайба и самоконтрящаяся гайка', 'steel', 'AMM 27-20 рис. 5')
    cyl(p, V((0, RL_HY, 0.029)), V((0, RL_HY, 0.068)), 0.0032, 0, segs=10)
    hexa(p, V((0, RL_HY, 0.029)), V((0, RL_HY, 0.035)), 0.010, 0)
    ring_tube(p, V((0, RL_HY, 0.044)), (0, 0, 1), 0.007, 0.0034, 0.006, p.m(M['alu']), segs=16)   # проставка
    ring_tube(p, V((0, RL_HY, 0.0628)), (0, 0, 1), 0.0075, 0.0034, 0.0016, 0, segs=16)
    hexa(p, V((0, RL_HY, 0.0636)), V((0, RL_HY, 0.0686)), 0.010, 0)
    p.done()

    # ── упоры: гайка приварена к кронштейну, болт, контргайка ──
    for s in (1, -1):
        side = 'left' if s > 0 else 'right'
        ru = 'влево' if s > 0 else 'вправо'
        p = P(f'Rudder stop bolt ({side})', f'Упор отклонения руля направления {ru}: гайка приварена к нижнему кронштейну руля, '
              'болт ввёрнут в неё и законтрен контргайкой; в крайнем положении головка болта упирается в площадку опоры. '
              'Ход руля регулируют этим болтом', 'steel', 'AMM 27-20 2.C, рис. 5')
        x = s * 0.052
        hexa(p, V((x, YF - 0.003, RL_Z)), V((x, YF - 0.0085, RL_Z)), 0.010, 0)          # приваренная гайка
        cyl(p, V((x, 4.947, RL_Z)), V((x, 4.912, RL_Z)), 0.003, 0, segs=10)
        hexa(p, V((x, 4.9285, RL_Z)), V((x, 4.9245, RL_Z)), 0.010, 0)                     # контргайка
        hexa(p, V((x, 4.912, RL_Z)), V((x, 4.906, RL_Z)), 0.010, 0)                       # головка
        p.done()


# ── Стабилизатор и навески руля высоты ───────────────────────────────────

def stab_le(x):
    return 4.721 + 0.219 * abs(x)


STAB_TIP = 1.47
FS_Y0 = 4.93                   # передний лонжерон посередине
RS_Y = 5.165                   # задний лонжерон почти до законцовки
TE_Y = 5.300                   # задние стенки — на них навески руля высоты (ось 5,331)
TE_END = 1.30                  # дальше стенка заворачивает «J» вокруг балансира руля
FS_JOIN = 0.80                 # концы переднего лонжерона заворачивают назад к заднему


def stab_skin(x, y):
    up = R.hit((x, y, 2.5), (0, 0, -1), 1.5)[0]
    lo = R.hit((x, y, up.z - 0.012), (0, 0, -1), 0.2)[0] if up else None
    if up is None or lo is None:
        return None
    return lo.z + 0.003, up.z - 0.003


def stab_web(p, path, t=0.005, h_extra=0.0):
    rings = []
    for k, (x, y) in enumerate(path):
        sk = stab_skin(x, y)
        if sk is None:
            continue
        zb, zt = sk
        if k + 1 < len(path):
            d = V((path[k + 1][0] - x, path[k + 1][1] - y, 0))
        else:
            d = V((x - path[k - 1][0], y - path[k - 1][1], 0))
        nrm = V((-d.y, d.x, 0)).normalized() * (t / 2)
        rings.append([V((x, y, zb)) - nrm, V((x, y, zb)) + nrm, V((x, y, zt)) + nrm, V((x, y, zt)) - nrm])
    loft(p, rings, 0, smooth=False)


def stabilizer():
    # передний лонжерон: посередине прямой, к FS_JOIN заворачивает к заднему
    path = []
    for i in range(41):
        x = -FS_JOIN + 2 * FS_JOIN * i / 40
        t = max(0.0, (abs(x) - 0.45) / (FS_JOIN - 0.45))
        path.append((x, FS_Y0 + (RS_Y - FS_Y0) * (t ** 1.6)))
    p = P('Horizontal stabilizer front spar', 'Передний лонжерон стабилизатора: стеклопластиковые стенки и полки; к середине размаха каждой половины концы заворачивают назад и соединяются с задним',
          'frame', 'AMM 55-10 2, рис. 1')
    stab_web(p, path)
    p.done()
    p = P('Horizontal stabilizer rear spar', 'Задний лонжерон стабилизатора: почти до законцовки; на нём, как и на переднем, кронштейн крепления к килю',
          'frame', 'AMM 55-10 2, рис. 1')
    stab_web(p, [(-STAB_TIP + 0.03 + 2 * (STAB_TIP - 0.03) * i / 50, RS_Y) for i in range(51)])
    p.done()
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        gen = 'левой' if s > 0 else 'правой'
        p = P(f'Horizontal stabilizer trailing edge web {tag}', f'Задняя стенка {gen} половины стабилизатора: закрывает заднюю кромку, на ней навески руля высоты; на конце изогнута «J» вокруг балансира руля',
              'frame', 'AMM 55-10 2, рис. 1')
        xs = [s * (0.055 + (TE_END - 0.055) * i / 30) for i in range(31)]
        stab_web(p, [(x, TE_Y) for x in xs])
        # «J» на конце: обходит спереди наружный балансир руля и уходит назад к законцовке
        stab_web(p, [(s * TE_END, TE_Y), (s * (TE_END + 0.02), TE_Y - 0.08), (s * (TE_END + 0.09), TE_Y - 0.10),
                     (s * (TE_END + 0.15), TE_Y - 0.06), (s * (TE_END + 0.165), TE_Y + 0.02)])
        p.done()
        for nm, ru, x, y0, y1 in (
                (f'Horizontal stabilizer front rib {tag}', f'Передняя нервюра {gen} половины стабилизатора у лючка', s * 0.095, stab_le(0.095) + 0.03, FS_Y0),
                (f'Horizontal stabilizer centre rib {tag}', f'Средняя нервюра {gen} половины стабилизатора между лонжеронами', s * 0.095, FS_Y0, RS_Y),
                (f"Horizontal stabilizer rear box rib {tag}", f'Задняя «коробчатая» нервюра {gen} половины: обрамляет большой вырез под кронштейн и балансир руля высоты; сзади три отверстия под кронштейн механизма триммера', s * 0.075, RS_Y, TE_Y),
                (f'Horizontal stabilizer rear rib {tag}', f'Короткая задняя нервюра {gen} половины на середине размаха между задним лонжероном и задней стенкой', s * 0.78, RS_Y, TE_Y)):
            p = P(nm, ru, 'frame', 'AMM 55-10 2, рис. 1')
            ys = [y0 + (y1 - y0) * i / 10 for i in range(11)]
            bot, top = [], []
            for y in ys:
                sk = stab_skin(x, y)
                if sk:
                    bot.append(V((x, y, sk[0])))
                    top.append(V((x, y, sk[1])))
            plate_with_hole(p, bot + list(reversed(top)), None, (1, 0, 0), 0.004, 0)
            p.done()
    # кронштейны крепления к килю: под передним и задним лонжеронами, по четыре болта вверх и вниз
    for nm, y, ru in (('Horizontal stabilizer front mounting bracket', FS_Y0, 'Передний кронштейн стабилизатора: четыре болта в передний лонжерон (доступ снизу), четыре — в швеллер передней стенки киля'),
                      ('Horizontal stabilizer rear mounting bracket', RS_Y, 'Задний кронштейн стабилизатора: четыре болта в задний лонжерон, четыре — в швеллер передней стенки киля')):
        p = P(nm, ru, 'alu', 'AMM 55-10 2, рис. 1')
        sk = stab_skin(0.0, y) or (1.25, 1.33)
        zt = sk[0] + 0.004
        zb = FIN_TOP_Z - 0.03
        box(p, V((0, y, (zt + zb) / 2)), (0.07, 0.006, zt - zb), Matrix.Identity(3), 0, bevel=0.001)
        for s in (1, -1):
            box(p, V((s * 0.032, y + 0.012, (zt + zb) / 2)), (0.005, 0.024, zt - zb), Matrix.Identity(3), 0, bevel=0.001)
        for dx in (-0.02, 0.02):
            for zz, d in ((zt - 0.006, 1), (zb + 0.012, -1)):
                q = V((dx, y - 0.003, zz))
                hexa(p, q, q - V((0, 0.006, 0)), 0.009, p.m(M['steel']))
        p.done()
    # пять опор руля высоты (55-20): кронштейн руля на оси посередине, две промежуточные навески, две концевые
    elev = bpy.data.objects['Armature.014']
    ez, ey = elev.matrix_world.translation.z, elev.matrix_world.translation.y
    p = P('Elevator horn bearing (centre)', 'Средняя опора руля высоты: подшипник скольжения в кронштейне руля, болт с распорной втулкой между задними стенками стабилизатора',
          'alu', 'AMM 55-20 2')
    q = V((0, ey, ez))
    for s in (1, -1):
        box(p, V((s * 0.05, (TE_Y + ey) / 2, ez)), (0.006, ey - TE_Y + 0.02, 0.03), Matrix.Identity(3), 0, bevel=0.001)
    cyl(p, q - V((0.056, 0, 0)), q + V((0.056, 0, 0)), 0.004, p.m(M['steel']), segs=10)
    cyl(p, q - V((0.04, 0, 0)), q + V((0.04, 0, 0)), 0.007, p.m(M['steel']), segs=14)
    hexa(p, q + V((0.056, 0, 0)), q + V((0.062, 0, 0)), 0.011, p.m(M['steel']))
    p.done()
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        gen = 'левая' if s > 0 else 'правая'
        x = s * 0.78
        q = V((x, ey, ez))
        p = P(f'Elevator hinge assembly {tag}', f'Промежуточная навеска руля высоты, {gen}: ушко со сферическим подшипником на нервюре руля, хвостовик входит во втулку задней стенки стабилизатора',
              'steel', 'AMM 55-20 2')
        cyl(p, V((x, TE_Y - 0.006, ez)), V((x, ey - 0.008, ez)), 0.004, 0, segs=10)
        ring_tube(p, q, (1, 0, 0), 0.011, 0.005, 0.008, 0, segs=18)
        sphere_r = 0.0055
        lib.sphere(p, q, sphere_r, p.m(M['bearing']), segs=12, rings=6)
        ring_tube(p, V((x, TE_Y, ez)), (0, 1, 0), 0.009, 0.004, 0.008, p.m(M['alu']), segs=16)
        p.done()
        x = s * TE_END
        q = V((x, ey, ez))
        p = P(f'Elevator outer end bearing {tag}', f'Концевая опора руля высоты, {gen}: вклеенные втулки в руле и в задней стенке стабилизатора, ось, стопорный штифт',
              'steel', 'AMM 55-20 2')
        cyl(p, q - V((0.025, 0, 0)), q + V((0.025, 0, 0)), 0.0035, 0, segs=10)
        for dx in (-0.012, 0.012):
            ring_tube(p, q + V((dx, 0, 0)), (1, 0, 0), 0.008, 0.0035, 0.008, p.m(M['alu']), segs=16)
        cyl(p, q + V((s * 0.02, 0, -0.008)), q + V((s * 0.02, 0, 0.008)), 0.0012, 0, segs=8)
        p.done()


# ── Сборка ────────────────────────────────────────────────────────────────

firewall()
top_hat()
centre_section()
roll_bar()
frames()
fin()
stabilizer()

dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'STRUCTURE_OK {OUT} {size / 1e6:.2f} MB, parts {len([o for o in COL.all_objects if o.type == "MESH"])}')
