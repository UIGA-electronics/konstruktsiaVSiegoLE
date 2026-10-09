"""Силовой набор фюзеляжа и оперения DA 40 NG — отдельный слой сайта.

    python3 tools/da40/structure.py [out.glb]

AMM 6.02.15 Rev. 3: 53-10 (рис. 1–4) — перегородка, прямоугольный профиль («шляпа») под полом,
центроплан (лонжероны центроплана — главные шпангоуты AMM, части внешней и бортовой нервюр,
задняя перегородка), дуга безопасности, шпангоут крепления багажного отсека, кольцевые
шпангоуты 1–3, стенки и нижняя нервюра киля; 55-10, 55-20, 55-40 — лонжероны, нервюры
и задние стенки стабилизатора, узлы навески руля высоты и руля направления.
Подписи — в терминах методички по конструкции DA 40 NG, в скобках — термин AMM.

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
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Matrix, Vector as V  # noqa: E402

import lib  # noqa: E402
import ref  # noqa: E402
from lib import Part, box, cyl, hexa, ring_tube  # noqa: E402
from sections import ellipse, loft, plate_with_hole, plate_with_holes  # noqa: E402
import stub  # noqa: E402

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
    rubber=lib.mat('DA40 rubber grommet', (0.03, 0.03, 0.035), 0.0, 0.7, ru='резиновая втулка'),
)

T_SH = 0.006          # обшивка фюзеляжа (GFRP) — внутренняя поверхность чуть глубже наружной


def P(name, ru, m, doc):
    return Part(name, ru, M[m], COL, True, doc)


# ── Сечения по обшивке ────────────────────────────────────────────────────

_last_bz = {}


# ── Проходы трасс сквозь стенки силового набора ──────────────────────────
# Шланги, жгуты и воздуховоды соседних слоёв проходят сквозь стенки «шляпы» и главных
# шпангоутов центроплана — в настоящем самолёте через вырезы с резиновой окантовкой. Вырезы
# ставятся там, где трасса пересекает плоскость стенки (по рёбрам её сетки), поэтому всегда
# совпадают с трассами; пересекающиеся вырезы сливаются в один.
LINE_LAYERS = ('fuel', 'brakes', 'pitot', 'air', 'electrical', 'instruments', 'radio', 'bonding')
LINE_RE = re.compile(r'hose|cable|harness|duct|wire|coax|tube|pipe|conductor|braid|jumper|fuel (supply|return|vent)|line', re.I)
NOT_LINE = re.compile(r'clamp|grommet|fitting|outlet|nozzle|grille|valve|connector|tee\b|trap|seal|bracket|lug|terminal|adapter|inlet duct', re.I)
_LINES = None


def lines():
    """[(имя, вершины, рёбра)] трасс соседних слоёв (из LAYERS) в координатах исходника."""
    global _LINES
    if _LINES is not None:
        return _LINES
    _LINES = []
    layers = os.environ.get('LAYERS', '/home/user/da40src/out2')
    for g in LINE_LAYERS:
        f = os.path.join(layers, f'da40-{g}-raw.glb')
        if not os.path.exists(f):
            continue
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=f)
        got = [o for o in bpy.data.objects if o not in before]
        for o in got:
            if o.parent is None:
                o.location.z -= R.lift
        bpy.context.view_layer.update()
        for o in got:
            if o.type == 'MESH' and LINE_RE.search(o.name) and not NOT_LINE.search(o.name):
                mw = o.matrix_world
                _LINES.append((o.name, [mw @ v.co for v in o.data.vertices], [tuple(e.vertices) for e in o.data.edges]))
        for o in got:
            bpy.data.objects.remove(o, do_unlink=True)
    # тяги и тросы управления из исходной модели: им тоже нужны вырезы (с запасом на ход — gap в wall_cuts)
    for c in bpy.data.collections['DA40 Systems'].children:
        if c.name != 'Flight controls':
            continue
        for o in c.all_objects:
            if o.type == 'MESH' and re.search(r'push rod|cable', o.name, re.I):
                mw = o.matrix_world
                _LINES.append((o.name, [mw @ v.co for v in o.data.vertices], [tuple(e.vertices) for e in o.data.edges]))
    print('LINES', len(_LINES))
    return _LINES


def wall_cuts(axis, pos, inside, room, gap=0.004):
    """Вырезы в стенке — плоскости {axis = pos}: [(центр, радиус выреза, имена трасс)];
    room(c) — сколько места от точки c до края стенки (вырез не выходит за контур)."""
    cuts = []
    for name, vs, es in lines():
        hits = []
        for a, b in es:
            da, db = vs[a][axis] - pos, vs[b][axis] - pos
            if (da < 0) != (db < 0):
                q = vs[a].lerp(vs[b], da / (da - db))
                if inside(q):
                    hits.append(q)
        groups = []                                  # сечения трассы: связные группы точек
        for q in hits:
            near = [g for g in groups if any((q - w).length < 0.02 for w in g)]
            for g in near[1:]:
                near[0].extend(g)
                groups.remove(g)
            (near[0] if near else (groups.append([]) or groups[-1])).append(q)
        for g in groups:
            if len(g) < 4:
                continue
            c = sum(g, V()) / len(g)
            r = max((q - c).length for q in g)
            if r > 0.05:
                print(f'CUT ALONG {name}: сечение {r * 2:.3f} м — трасса идёт вдоль стенки, выреза нет')
                continue
            cuts.append([c, r + (gap * 2 if re.search(r'push rod|cable', name, re.I) and 'Bowden' not in name else gap), [name]])
    merged = True
    while merged:
        merged = False
        for i in range(len(cuts)):
            for j in range(i + 1, len(cuts)):
                (ci, ri, ni), (cj, rj, nj) = cuts[i], cuts[j]
                d = (ci - cj).length
                if d < ri + rj + 0.004:
                    if d + rj <= ri:
                        new = [ci, ri, ni + nj]
                    elif d + ri <= rj:
                        new = [cj, rj, ni + nj]
                    else:
                        rr = (d + ri + rj) / 2
                        new = [ci + (cj - ci).normalized() * (rr - ri), rr, ni + nj]
                    cuts[i] = new
                    cuts.pop(j)
                    merged = True
                    break
            if merged:
                break
    for cut in cuts:
        c, r, names = cut
        lim = room(c) - 0.004
        if r > lim:
            print(f'CUT EDGE {"xyz"[axis]}={pos:+.3f} at ({c.x:+.3f},{c.y:+.3f},{c.z:+.3f}): нужно {r * 1000:.0f} мм, есть {lim * 1000:.0f} — {names[0][:40]}')
            cut[1] = r = max(0.004, lim)
        print(f'CUT {"xyz"[axis]}={pos:+.3f} at ({c.x:+.3f},{c.y:+.3f},{c.z:+.3f}) r {r * 1000:.0f} mm: {", ".join(n[:40] for n in names)}')
    return cuts


def cut_loop(c, r, axis, n=20):
    """Контур круглого выреза в плоскости, перпендикулярной оси axis."""
    u, w = [(1, 2), (0, 2), (0, 1)][axis]
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n
        q = c.copy()
        q[u] += r * math.cos(a)
        q[w] += r * math.sin(a)
        out.append(q)
    return out


def grommets(name, ru, cuts, axis, doc):
    """Резиновая окантовка вырезов."""
    if not cuts:
        return
    g = P(name, ru, 'rubber', doc)
    d = V([1 if i == axis else 0 for i in range(3)])
    for c, r, _ in cuts:
        ring_tube(g, c, d, r + 0.003, r - 0.0025, 0.010, 0, segs=20)
    g.done()


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
        h = P(name + ' grommets', 'Проходные втулки в нижней части шпангоута: тросы руля направления, трос триммера, тяга руля высоты', 'alu', doc)
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
    # контур перегородки исходника идёт по капоту; за перегородкой днище фюзеляжа выше (ниша носовой стойки),
    # и низ перегородки торчал из-под обшивки — обрезаем контур по наружной обшивке фюзеляжа за перегородкой
    ring = resample_closed([V((x, FW_CLIP_Y, z)) for x, z in hull], 96)
    c = V((0.0, 0.0, 0.12))
    lims = []
    for q in ring:
        d = V((q.x, 0.0, q.z)) - c
        L = d.length
        d.normalize()
        lim = L
        for y in (FW_CLIP_Y, -1.180, -1.188):        # по всей толщине панели, а не по одной плоскости
            o = c + V((0, y, 0))
            h = R.shell.ray_cast(o + d * 1.5, -d, 1.5)[0]
            if h is not None:
                lim = min(lim, (h - o).length - 0.006)
        lims.append(lim)
    n = len(lims)
    # скользящий минимум, затем среднее — край без зубцов и нигде не выходит наружу
    mins = [min(lims[(i + k) % n] for k in range(-2, 3)) for i in range(n)]
    rad = [(mins[i - 1] + mins[i] + mins[(i + 1) % n]) / 3 for i in range(n)]
    hull = []
    for q, r in zip(ring, rad):
        d = V((q.x, 0.0, q.z)) - c
        d.normalize()
        hull.append((c.x + d.x * r, c.z + d.z * r))
    for nm, ru, m, y, t in (
            ('Firewall GFRP panel', 'Противопожарная перегородка: жёсткая формованная панель из стеклопластика — замыкает фюзеляж спереди; на ней узлы крепления моторной рамы и отверстия для элементов систем, идущих к двигателю', 'gfrp', -1.186, 0.010),
            ('Firewall ceramic blanket', 'Огнестойкое керамическое покрытие: приклеено специальным клеем к передней поверхности перегородки', 'blanket', -1.1945, 0.007),
            ('Firewall stainless steel sheet', 'Лист из нержавеющей стали, приклеенный поверх керамического покрытия; элементы систем, проходящие сквозь перегородку, дополнительно прижимают лист и покрытие к панели', 'fw', -1.199, 0.0016)):
        p = P(nm, ru, m, 'AMM 53-10 2.B')
        outline = resample_closed([V((x, y, z)) for x, z in hull], 96)
        plate_with_hole(p, outline, None, (0, 1, 0), t, 0)
        p.done()
    # узлы крепления моторамы — пять точек (AMM 71-00)
    p = P('Engine mount attachment fittings (firewall)', 'Узлы крепления моторной рамы на перегородке — пять точек: два вверху, два внизу по бортам, один внизу посередине',
          'steel', 'AMM 53-10 2.B, 71-00')
    for c in MOUNT_PTS:
        box(p, c + V((0, -0.004, 0)), (0.05, 0.008, 0.05), Matrix.Identity(3), 0, bevel=0.002)
        for dx, dz in ((-0.016, -0.016), (0.016, -0.016), (-0.016, 0.016), (0.016, 0.016)):
            hexa(p, c + V((dx, -0.008, dz)), c + V((dx, -0.013, dz)), 0.008, 0)
    p.done()


FW_CLIP_Y = -1.172             # по обшивке за задней гранью перегородки
HAT_X = (-0.078, 0.154)       # стенки снаружи опорных пластин подшипников носовой стойки (gear.py)
HAT_Y = (-1.17, 0.012)
FLOOR = 'Plane.378'           # пол кабины в модели MSFS: z −0,094 у перегородки … −0,127 у переднего главного шпангоута
_floor_bvh = None


def hat_top(y):
    """Верх «шляпы» — на 3 мм ниже пола кабины (пол ложится на неё сверху)."""
    global _floor_bvh
    if _floor_bvh is None:
        _floor_bvh = ref._bvh([bpy.data.objects[FLOOR]])
    y = max(-1.10, min(1.10, y))                     # пол кончается у y ±1,11
    h = _floor_bvh.ray_cast(V((0.04, y, 0.5)), V((0, 0, -1)), 2.0)[0]
    return h.z - 0.003


def top_hat():
    p = P('Top hat profile', 'Прямоугольный профиль («шляпа», top hat profile): приклеен к внутреннему нижнему слою обшивки за противопожарной перегородкой; придаёт прочность и жёсткость носовой части, к нему крепится носовая опора шасси, в нём каналы топливопроводов; сверху на него ложится панель пола',
          'frame', 'AMM 53-10 2.C, рис. 1')
    ys = [HAT_Y[0] + (HAT_Y[1] - HAT_Y[0]) * i / 24 for i in range(25)]
    t = 0.005
    all_cuts = []
    for k, xw in enumerate(HAT_X):
        s = -1 if k == 0 else 1
        flange = []
        for y in ys:
            zb = bottom_z(xw, y) + T_SH
            zf = bottom_z(xw + s * 0.03, y) + T_SH
            flange.append([V((xw, y, zb)), V((xw + s * 0.03, y, zf)), V((xw + s * 0.03, y, zf + t)), V((xw, y, zb + t))])
        loft(p, flange, 0, smooth=False)
        # стенка — плоская плита x = const; вырезы под трассы, которые идут поперёк «шляпы»
        xm = xw + s * t / 2
        outline = [V((xm, y, bottom_z(xw, y) + T_SH)) for y in ys] + [V((xm, y, hat_top(y) - t)) for y in reversed(ys)]
        cuts = wall_cuts(0, xm, lambda q, xw=xw: HAT_Y[0] + 0.01 < q.y < HAT_Y[1] - 0.01 and
                         bottom_z(xw, q.y) + T_SH + 0.012 < q.z < hat_top(q.y) - t - 0.012,
                         lambda c, xw=xw: min(c.z - bottom_z(xw, c.y) - T_SH, hat_top(c.y) - t - c.z, c.y - HAT_Y[0], HAT_Y[1] - c.y))
        plate_with_holes(p, outline, [cut_loop(c, r, 0) for c, r, _ in cuts], (1, 0, 0), t, 0)
        all_cuts += cuts
    cap = [[V((HAT_X[0] - 0.005, y, hat_top(y) - t)), V((HAT_X[1] + 0.005, y, hat_top(y) - t)), V((HAT_X[1] + 0.005, y, hat_top(y))),
            V((HAT_X[0] - 0.005, y, hat_top(y)))] for y in ys]
    loft(p, cap, 0, smooth=False)
    p.done()
    grommets('Top hat profile grommets', 'Резиновая окантовка вырезов в стенках прямоугольного профиля: сквозь них поперёк профиля идут шланги, жгуты и воздуховод пассажиров',
             all_cuts, 0, 'AMM 53-10 2.C')
    q = P('Top hat profile nose gear inserts', 'Монолитные вставки из стеклопластика в стенках прямоугольного профиля под опорные пластины подшипников носовой опоры шасси',
          'insert', 'AMM 53-10 2.C, 32-20')
    for xw, s in ((HAT_X[0], -1), (HAT_X[1], 1)):
        box(q, V((xw + s * 0.008, -0.970, -0.134)), (0.006, 0.09, 0.060), Matrix.Identity(3), 0, bevel=0.002)   # ниже пола
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


def main_bulkhead(tag, ru_name, ru_gen, y0, y1, bolt, doc_extra=''):
    """Коробчатый главный шпангоут центроплана (в методичке — передний или задний лонжерон центроплана): две
    стенки и углепластиковые полки сверху и снизу. Высота каждой стенки — по сечению наплыва в её плоскости:
    по средней линии коробки задняя стенка заднего шпангоута выходила из верхней обшивки наплыва.
    Внутри фюзеляжа верх ровный, по средней линии (wall_top)."""
    xs = [-STUB_X + 2 * STUB_X * i / 48 for i in range(49)]
    t, tc = 0.006, 0.006
    ym = (y0 + y1) / 2

    def wall_top(x, yw):
        # в наплыве стенка доходит до верхней обшивки в своей плоскости; внутри фюзеляжа обшивки над коробкой
        # нет, и верх ровный, по средней линии: над задним шпангоутом проходит длинная тяга руля высоты,
        # на верх опираются рёбра крепления заднего сиденья (equipment.py)
        zt = stub_top(x, yw)
        k = min(1.0, max(0.0, (FUS_X - abs(x)) / 0.12))
        return zt + k * (stub_top(x, ym) - zt)

    p = P(f'{tag} main bulkhead', f'{ru_name} лонжерон центроплана ({ru_name.lower()} главный шпангоут, {tag.lower()} main bulkhead): жёсткая формованная деталь из '
          'стеклопластика коробчатого сечения от торца до торца центроплана; в неё входят комли лонжеронов крыла, сквозь стенки — главные болты'
          + doc_extra, 'frame', 'AMM 53-10 2.E, рис. 2')
    all_cuts = []
    for yw in (y0 + t / 2, y1 - t / 2):
        outline = [V((x, yw, stub_bot(x, yw))) for x in xs] + [V((x, yw, wall_top(x, yw))) for x in reversed(xs)]
        cuts = wall_cuts(1, yw, lambda q, yw=yw: abs(q.x) < STUB_X - 0.01 and stub_bot(q.x, yw) + 0.014 < q.z < wall_top(q.x, yw) - 0.014,
                         lambda c, yw=yw: min(c.z - stub_bot(c.x, yw), wall_top(c.x, yw) - c.z, STUB_X - abs(c.x)))
        plate_with_holes(p, outline, [cut_loop(c, r, 1) for c, r, _ in cuts], (0, 1, 0), t, 0)
        all_cuts += cuts
    p.done()
    grommets(f'{tag} main bulkhead grommets', f'Резиновая окантовка вырезов в стенках {ru_gen} лонжерона центроплана: сквозь них проходят тяги, шланги и жгуты',
             all_cuts, 1, 'AMM 53-10 2.E')
    c = P(f'{tag} main bulkhead carbon caps', f'Слои углеткани на верхней и нижней поверхностях {ru_gen} лонжерона центроплана: дополнительная прочность и жёсткость',
          'cfrp', 'AMM 53-10 2.E')
    top, bot = [], []
    for x in xs:
        zb0, zt0 = stub_bot(x, y0), wall_top(x, y0)
        zb1, zt1 = stub_bot(x, y1), wall_top(x, y1)
        top.append([V((x, y0, zt0 - tc)), V((x, y1, zt1 - tc)), V((x, y1, zt1)), V((x, y0, zt0))])
        bot.append([V((x, y0, zb0)), V((x, y1, zb1)), V((x, y1, zb1 + tc)), V((x, y0, zb0 + tc))])
    loft(c, top, 0, smooth=False)
    loft(c, bot, 0, smooth=False)
    c.done()
    b = P(f'{tag} main bulkhead bushes', f'Втулки {ru_gen} лонжерона центроплана под главные болты крыла — по две на борт',
          'steel', 'AMM 57-10 рис. 2')
    for s in (1, -1):
        q = V((s * bolt.x, 0, bolt.z))
        for y in (y0 + t / 2, y1 - t / 2):
            ring_tube(b, V((q.x, y, q.z)), (0, 1, 0), 0.030, 0.022, 0.016, 0, segs=24)
    b.done()


def rib_plate(name, ru, x, y0, y1, doc, hole=None, n=24, m='frame', passes=()):
    """Нервюра центроплана в плоскости x = const между y0 и y1 по высоте профиля;
    passes — [(центр, радиус трассы)]: круглые вырезы под резиновые втулки трасс."""
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
    if passes:
        cuts = ([inner] if inner else []) + [stub.circle(c, r + stub.GROMMET, 16) for c, r in passes]
        plate_with_holes(p, outer, cuts, (1, 0, 0), 0.005, 0)
    else:
        plate_with_hole(p, outer, inner, (1, 0, 0), 0.005, 0)
    p.done()
    if passes:
        g = P(name + ' grommets', 'Резиновые втулки трасс крыла в нервюре: жгут, провода и шланги проходят сквозь неё, не касаясь краёв выреза',
              'rubber', 'AMM 57-10 2.B(8), (9)')
        for c, r in passes:
            ring_tube(g, c, V((1, 0, 0)), r + stub.GROMMET + 0.003, r + 0.0018, 0.010, 0, segs=16)
        g.done()


FRONT_MB = (0.012, 0.118)      # передний главный шпангоут: комель переднего лонжерона 0,02…0,11 внутри
REAR_MB = (0.472, 0.578)       # задний: комель заднего лонжерона 0,48…0,57
REAR_WEB_Y = 0.685             # задняя стенка центроплана — на линии задней стенки крыла
REAR_CLOSING_X = 0.660         # задняя замыкающая нервюра (controls.py)


def centre_section():
    main_bulkhead('Front', 'Передний', 'переднего', *FRONT_MB, V((1.044, 0, -0.064)))
    main_bulkhead('Rear', 'Задний', 'заднего', *REAR_MB, V((1.044, 0, -0.098)),
                  '; к задней поверхности посередине приклеен монтажный кронштейн качалки управления')
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        gen = 'левого' if s > 0 else 'правого'
        X = s * STUB_X
        rib_plate(f'Front outer rib {tag}', f'Передняя часть внешней нервюры центроплана {gen} борта: внешняя поверхность корневой части крыла перед передним лонжероном центроплана'
                  + ('; она же внешняя стенка короба-коллектора воздуха пассажиров' if s > 0 else '')
                  + ('; во втулках сквозь неё проходят жгут крыла, провода обогрева ПВД, шланги полного и статического давления '
                     'и шланг сигнализатора сваливания' if s > 0 else '; во втулке сквозь неё проходят жгут крыла и кабель магнитометра GMU 44'),
                  X, -0.245, FRONT_MB[0], 'AMM 53-10 2.E, 21-00 2.B(2)', passes=stub.passes('outer', s))
        rib_plate(f'Middle outer rib {tag}', f'Средняя часть внешней нервюры центроплана {gen} борта между лонжеронами центроплана: большой вырез напротив люка корневой нервюры крыла — через него снимают топливный бак',
                  X, FRONT_MB[1], REAR_MB[0], 'AMM 53-10 2.E, 28-10', hole=0.40)
        rib_plate(f'Rear outer rib {tag}', f'Задняя часть внешней нервюры центроплана {gen} борта: от заднего лонжерона центроплана до задней перегородки',
                  X, REAR_MB[1], REAR_WEB_Y, 'AMM 53-10 2.E')
        rib_plate(f'Rear closing rib {tag}', f'Задняя замыкающая нервюра центроплана {gen} борта (rear closing rib): от заднего лонжерона центроплана до задней перегородки'
                  + ('; на ней кронштейн привода закрылков' if s > 0 else ''),
                  s * REAR_CLOSING_X, REAR_MB[1], REAR_WEB_Y, 'AMM 53-10 2.E, 27-50')
        # задняя стенка центроплана между замыкающей и наружной нервюрами
        xs = [s * (REAR_CLOSING_X + (STUB_X - REAR_CLOSING_X) * i / 12) for i in range(13)]
        p = P(f'Centre section rear web {tag}', f'Задняя перегородка центроплана {gen} борта (rear web): закрывает центроплан сзади, перед закрылком',
              'frame', 'AMM 53-10 2.E, рис. 2')
        rings = []
        for x in xs:
            zb, zt = stub_bot(x, REAR_WEB_Y), stub_top(x, REAR_WEB_Y)
            rings.append([V((x, REAR_WEB_Y - 0.003, zb)), V((x, REAR_WEB_Y + 0.003, zb)), V((x, REAR_WEB_Y + 0.003, zt)), V((x, REAR_WEB_Y - 0.003, zt))])
        loft(p, rings, 0, smooth=False)
        p.done()
    # кронштейн качалки элеронов на задней стенке заднего главного шпангоута, посередине
    p = P('Control bellcrank mounting bracket', 'Монтажный кронштейн качалки управления (элеронов): приклеен к задней поверхности заднего лонжерона центроплана посередине',
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
    p = P('Roll bar', 'Дуга безопасности за передними креслами: жёсткая формованная деталь из стеклопластика, укреплённая лентой из углеткани; приклеена к внутренней поверхности обшивки и по периметру к каркасу фонаря, остеклению и раме пассажирской двери; в ней сопла задних пассажиров',
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
    c = P('Roll bar carbon tape', 'Лента из углеткани по внутренней кромке дуги безопасности: дополнительная прочность и жёсткость', 'cfrp', 'AMM 53-10 2.F')
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
                       'Шпангоут крепления багажного отсека: замыкает кабину сзади и служит опорой чашки заднего кресла; приклеен к обшивке и нижней обшивке центроплана; внизу отверстия для тросов руля направления и триммера руля высоты, направляющая тяги руля высоты',
                       BAGGAGE_Y, 0.075, 'AMM 53-10 2.G, рис. 3', flange=0.025, lower_web=-0.03, z_in=0.2,
                       holes=((0.06, -0.075, 0.012), (-0.06, -0.075, 0.012), (0.0, -0.09, 0.008)))
    for y, k in RING_Y:
        ru = {1: 'Кольцевой шпангоут 1: сразу за шпангоутом крепления багажного отсека; отверстия для тросов руля направления и триммера, роликовая направляющая тяги руля высоты',
              2: 'Кольцевой шпангоут 2: отверстия для тросов руля направления и триммера, роликовая направляющая тяги руля высоты',
              3: 'Кольцевой шпангоут 3: непосредственно перед килем; отверстия для тросов руля направления и триммера'}[k]
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
    p = P('Vertical stabilizer front web', 'Передняя стенка киля: приклеена к обшивке, к передней и задней частям нижней нервюры киля и к верху задней стенки; верх — жёсткий швеллер со вставками из стеклопластика, на нём монтажные кронштейны стабилизатора',
          'frame', 'AMM 53-10 2.M, рис. 4')
    pts = []
    for z in zs:
        t = max(0.0, (z - FIN_LOW_Z) / (FIN_TOP_Z - FIN_LOW_Z))
        pts.append((FW_BOT_Y + (FW_TOP_Y - FW_BOT_Y) * t, z))
    web_plate(p, pts)
    p.done()
    # швеллер наверху передней стенки — площадка под кронштейны стабилизатора
    c = P('Vertical stabilizer front web top channel', 'Швеллер наверху передней стенки киля со вставками из стеклопластика: к нему четырьмя болтами каждый крепятся передний и задний монтажные кронштейны стабилизатора',
          'insert', 'AMM 53-10 2.M, 55-10')
    ch0, ch1 = FW_TOP_Y - 0.02, 5.20
    hw = 0.038
    box(c, V((0, (ch0 + ch1) / 2, FIN_TOP_Z - 0.003)), (2 * hw, ch1 - ch0, 0.006), Matrix.Identity(3), 0, bevel=0.001)
    for s in (1, -1):
        box(c, V((s * (hw - 0.003), (ch0 + ch1) / 2, FIN_TOP_Z - 0.025)), (0.006, ch1 - ch0, 0.045), Matrix.Identity(3), 0, bevel=0.001)
    c.done()
    p = P('Vertical stabilizer rear web', 'Задняя стенка киля: приклеена к обшивке и передней стенке, замыкает киль сзади; в верхней части — верхний узел навески руля направления, к задней поверхности приклеена усиливающая нервюра',
          'frame', 'AMM 53-10 2.N, рис. 4')
    # снизу стенка кончается над нижним кронштейном руля (он ходит под ней вместе с рулём)
    web_plate(p, [(rud_y(z) - 0.035, z) for z in
                  [REAR_WEB_LOW_Z + (FIN_TOP_Z - REAR_WEB_LOW_Z) * i / 28 for i in range(29)]])
    p.done()
    r = P('Vertical stabilizer rear web reinforcing rib', 'Усиливающая нервюра на задней поверхности задней стенки киля под верхним узлом навески руля направления',
          'frame', 'AMM 53-10 2.N, рис. 4')
    for z0 in (FIN_TOP_Z - 0.20,):
        y = rud_y(z0) - 0.035 + 0.003
        box(r, V((0, y + 0.012, z0 + 0.08)), (0.005, 0.024, 0.16), Matrix.Identity(3), 0, bevel=0.001)
    r.done()
    # нижние нервюры киля
    for nm, ru, y0, y1, slot in (
            ('Vertical stabilizer front lower rib', 'Передняя часть нижней нервюры киля: у основания киля, приклеена к обшивке и передней стенке киля; отверстие для гибкого троса триммера', fin_le(FIN_LOW_Z) + 0.04, FW_BOT_Y, False),
            ('Vertical stabilizer rear lower rib', 'Задняя часть нижней нервюры киля между передней и задней стенками: большой паз для тяги руля высоты', FW_BOT_Y, rud_y(FIN_LOW_Z) - 0.035, True)):
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
    p = P('Rudder upper hinge', 'Верхний узел навески руля направления: втулка подшипника на задней стенке киля, подшипник, сверху распорная шайба и '
          'стопорное кольцо; снизу в подшипник входит ось верхнего шарнира, вклеенная в переднюю кромку руля; на оси — регулировочная втулка '
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
    p = P('Rudder pedestal', 'Опорная стойка руля направления (rudder pedestal): рама на торце хвостовой части фюзеляжа на четырёх болтах; через окно проходят '
          'тросы руля направления и тяга руля высоты; снизу — проушина болта нижнего шарнира, на боковых стойках — '
          'площадки, в которые упираются болты-ограничители', 'alu', 'AMM 27-20 рис. 1, 5; 55-40 рис. 3')
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
    p = P('Rudder lower mounting bracket', 'Нижний монтажный кронштейн руля направления: стальной швеллер поперёк; стенка прилегает к плоской '
          'поверхности в нижней части передней кромки руля и стягивается с ней двумя вклеенными в руль нижними монтажными болтами (гайки с шайбами, 6,4 Н·м); '
          'по бокам — проушины тросов руля, спереди — нижний шарнир на опорной стойке и приваренные гайки болтов-ограничителей', 'steel',
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
    p = P('Rudder lower hinge bolt', 'Болт нижнего шарнира руля направления: снизу через проушину опорной стойки, проставку и втулку '
          'нижнего монтажного кронштейна; сверху шайба и самоконтрящаяся гайка', 'steel', 'AMM 27-20 рис. 5')
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
        p = P(f'Rudder stop bolt ({side})', f'Болт-ограничитель отклонения руля направления {ru}: гайка приварена к нижнему монтажному кронштейну руля, '
              'болт ввёрнут в неё и законтрен контргайкой; в крайнем положении головка болта упирается в площадку опорной стойки. '
              'Ход руля регулируют этим болтом', 'steel', 'AMM 27-20 2.C, рис. 5')
        x = s * 0.052
        hexa(p, V((x, YF - 0.003, RL_Z)), V((x, YF - 0.0085, RL_Z)), 0.010, 0)          # приваренная гайка
        cyl(p, V((x, 4.947, RL_Z)), V((x, 4.912, RL_Z)), 0.003, 0, segs=10)
        hexa(p, V((x, 4.9285, RL_Z)), V((x, 4.9245, RL_Z)), 0.010, 0)                     # контргайка
        hexa(p, V((x, 4.912, RL_Z)), V((x, 4.906, RL_Z)), 0.010, 0)                       # головка
        p.done()
    elevator_bellcrank_bracket()


def elevator_bellcrank_bracket():
    """Кронштейн оси качалки руля высоты в низу киля (AMM 27-30 рис. 2): две щеки по бокам качалки
    на основании, стоящем на листе опоры руля направления; болт оси поперёк."""
    piv = bpy.data.objects.get('Elevator bellcrank (bottom of the fin) pivot')
    c = piv.matrix_world.translation.copy() if piv else V((0.0, 4.893, 0.098))
    p = P('Elevator bellcrank bearing bracket', 'Кронштейн качалки руля высоты в нижней части киля: основание и две щеки по бокам качалки, '
          'болт оси поперёк с самоконтрящейся гайкой; рядом — отверстие под штырь фиксации нейтрали при регулировке',
          'alu', 'AMM 27-30 2., рис. 2')
    z0 = 0.008                                         # верх листа опоры руля направления
    box(p, V((0, c.y, z0 + 0.002)), (0.026, 0.026, 0.004), None, 0, bevel=0.0008)
    for s in (1, -1):
        xc = s * 0.0095
        box(p, V((xc, c.y, (z0 + 0.004 + c.z) / 2)), (0.004, 0.018, c.z - z0 - 0.004), None, 0)
        cyl(p, V((xc - 0.002, c.y, c.z)), V((xc + 0.002, c.y, c.z)), 0.0075, 0, segs=18)     # прилив под ось
    # справа над осью проходит трос триммера — с этой стороны только тонкая гайка
    cyl(p, V((-0.0165, c.y, c.z)), V((0.0135, c.y, c.z)), 0.0028, p.m(M['steel']), segs=10)
    hexa(p, V((-0.0115, c.y, c.z)), V((-0.0165, c.y, c.z)), 0.008, p.m(M['steel']))            # головка
    hexa(p, V((0.0115, c.y, c.z)), V((0.0135, c.y, c.z)), 0.008, p.m(M['steel']))              # гайка
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
    p = P('Horizontal stabilizer front spar', 'Передний лонжерон стабилизатора: обшивки из стеклопластика, жёсткие вставки в точках крепления, верхний и нижний пояса; концы отгибаются назад и в средней части каждой половины соединяются с задним лонжероном',
          'frame', 'AMM 55-10 2, рис. 1')
    stab_web(p, path)
    p.done()
    p = P('Horizontal stabilizer rear spar', 'Задний лонжерон стабилизатора: проходит почти до законцовки; на нём, как и на переднем, монтажный кронштейн крепления к килю',
          'frame', 'AMM 55-10 2, рис. 1')
    stab_web(p, [(-STAB_TIP + 0.03 + 2 * (STAB_TIP - 0.03) * i / 50, RS_Y) for i in range(51)])
    p.done()
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        gen = 'левой' if s > 0 else 'правой'
        p = P(f'Horizontal stabilizer trailing edge web {tag}', f'Задняя стенка {gen} половины стабилизатора: замыкает задние кромки обшивок, на ней узлы навески руля высоты; внешний конец в форме крюка огибает внешний балансировочный груз руля высоты',
              'frame', 'AMM 55-10 2, рис. 1')
        xs = [s * (0.055 + (TE_END - 0.055) * i / 30) for i in range(31)]
        stab_web(p, [(x, TE_Y) for x in xs])
        # «J» на конце: обходит спереди наружный балансир руля и уходит назад к законцовке
        stab_web(p, [(s * TE_END, TE_Y), (s * (TE_END + 0.02), TE_Y - 0.08), (s * (TE_END + 0.09), TE_Y - 0.10),
                     (s * (TE_END + 0.15), TE_Y - 0.06), (s * (TE_END + 0.165), TE_Y + 0.02)])
        p.done()
        for nm, ru, x, y0, y1 in (
                (f'Horizontal stabilizer front rib {tag}', f'Передняя нервюра {gen} половины стабилизатора у отверстия для доступа', s * 0.095, stab_le(0.095) + 0.03, FS_Y0),
                (f'Horizontal stabilizer centre rib {tag}', f'Центральная нервюра {gen} половины стабилизатора между лонжеронами', s * 0.095, FS_Y0, RS_Y),
                (f"Horizontal stabilizer rear box rib {tag}", f'Задняя коробчатая нервюра {gen} половины стабилизатора: образует каркас вокруг большого выреза в нижней обшивке под кабанчик и балансировочный груз руля высоты; сзади три отверстия под монтажный кронштейн исполнительного механизма триммера', s * 0.075, RS_Y, TE_Y),
                (f'Horizontal stabilizer rear rib {tag}', f'Короткая задняя нервюра {gen} половины стабилизатора в средней части: подкрепляет участок между задним лонжероном и задней стенкой', s * 0.78, RS_Y, TE_Y)):
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
    p = P('Elevator horn bearing (centre)', 'Средняя опора руля высоты: подшипник скольжения в кабанчике руля высоты, болт с распорной втулкой между задними стенками стабилизатора',
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
        p = P(f'Elevator hinge assembly {tag}', f'Узел навески руля высоты, {gen}: ушко со сферическим подшипником на силовой нервюре руля, хвостовик входит во втулку задней стенки стабилизатора',
              'steel', 'AMM 55-20 2')
        cyl(p, V((x, TE_Y - 0.006, ez)), V((x, ey - 0.008, ez)), 0.004, 0, segs=10)
        ring_tube(p, q, (1, 0, 0), 0.011, 0.005, 0.008, 0, segs=18)
        sphere_r = 0.0055
        lib.sphere(p, q, sphere_r, p.m(M['bearing']), segs=12, rings=6)
        ring_tube(p, V((x, TE_Y, ez)), (0, 1, 0), 0.009, 0.004, 0.008, p.m(M['alu']), segs=16)
        p.done()
        x = s * TE_END
        q = V((x, ey, ez))
        p = P(f'Elevator outer end bearing {tag}', f'Торцевая опора руля высоты, {gen}: вклеенные втулки в руле и в задней стенке стабилизатора, ось, стопорный штифт',
              'steel', 'AMM 55-20 2')
        cyl(p, q - V((0.025, 0, 0)), q + V((0.025, 0, 0)), 0.0035, 0, segs=10)
        for dx in (-0.012, 0.012):
            ring_tube(p, q + V((dx, 0, 0)), (1, 0, 0), 0.008, 0.0035, 0.008, p.m(M['alu']), segs=16)
        cyl(p, q + V((s * 0.02, 0, -0.008)), q + V((s * 0.02, 0, 0.008)), 0.0012, 0, segs=8)
        p.done()
    trim_bracket_and_stops(ez)


# ── Кронштейн механизма триммера и упоры руля высоты (AMM 55-10, 27-30, 27-38 рис. 2) ──
# Кронштейн стоит поперёк между задними коробчатыми нервюрами (по три болта с каждой
# стороны); на нём механизм триммера с фрикционным демпфером и поперечный болт с
# втулкой — упор хода руля вверх: на него ложится передний выступ кронштейна руля.
# Упор вниз — стеклопластиковый блок, вклеенный под верхнюю обшивку. Упоры не регулируются.

TB_Y0, TB_Y1 = 5.245, 5.285
TB_Z = 1.262                    # низ полки: на уровне нижней обшивки у нервюр


def trim_bracket_and_stops(ez):
    xr = 0.075 - 0.002 - 0.0015            # внутренняя грань коробчатой нервюры (толщина 0,004)
    p = P('Trim actuator mounting bracket', 'Монтажный кронштейн исполнительного механизма триммера: швеллер поперёк между задними коробчатыми нервюрами, '
          'по три болта в каждую; на нём механизм триммера с фрикционным демпфером и упор хода руля высоты вверх',
          'alu', 'AMM 55-10 2., 27-38 рис. 2')
    yc = (TB_Y0 + TB_Y1) / 2
    box(p, V((0, yc, TB_Z + 0.002)), (2 * xr, TB_Y1 - TB_Y0, 0.004), None, 0, bevel=0.0008)
    for s in (1, -1):
        box(p, V((s * (xr - 0.0015), yc, TB_Z + 0.016)), (0.003, TB_Y1 - TB_Y0, 0.028), None, 0, bevel=0.0006)
        for y in (TB_Y0 + 0.008, yc, TB_Y1 - 0.008):
            q = V((s * (0.075 + 0.002), y, TB_Z + 0.019))
            hexa(p, q, q + V((s * 0.004, 0, 0)), 0.007, p.m(M['steel']))              # болты в нервюру
    # проушины упора посередине
    for s in (1, -1):
        box(p, V((s * 0.016, yc, TB_Z + 0.011)), (0.003, 0.018, 0.014), None, 0, bevel=0.0006)
    p.done()
    p = P('Elevator up stop (bolt and bush)', 'Ограничитель отклонения руля высоты вверх: поперечный болт с втулкой в монтажном кронштейне исполнительного механизма триммера; '
          'при полном отклонении руля вверх в неё упирается передняя часть кабанчика руля высоты. Регулировать запрещается',
          'steel', 'AMM 27-30 2., 27-38 рис. 2')
    q = V((0, yc, TB_Z + 0.013))
    cyl(p, q - V((0.021, 0, 0)), q + V((0.021, 0, 0)), 0.0025, 0, segs=10)
    cyl(p, q - V((0.0145, 0, 0)), q + V((0.0145, 0, 0)), 0.0065, p.m(M['alu']), segs=16)
    hexa(p, q + V((0.0175, 0, 0)), q + V((0.022, 0, 0)), 0.007, 0)
    hexa(p, q - V((0.0175, 0, 0)), q - V((0.022, 0, 0)), 0.007, 0)
    p.done()
    sk = stab_skin(0.0, yc) or (1.264, 1.323)
    top = R.hit((0.0, yc, 2.5), (0, 0, -1), 1.5)[0]
    zt = (top.z - 0.003) if top else sk[1]
    p = P('Elevator down stop (GFRP block)', 'Ограничитель отклонения руля высоты вниз: колодка из стеклопластика, вклеенная изнутри в верхнюю '
          'обшивку стабилизатора; при полном отклонении руля вниз в неё упирается передняя часть кабанчика руля высоты. Регулировать запрещается',
          'insert', 'AMM 27-30 2.')
    box(p, V((0, yc, zt - 0.008)), (0.03, 0.03, 0.016), None, 0, bevel=0.002)
    p.done()


def jacking_plates():
    """Главные точки подъёма (AMM 07-10 2.B(2)): опорные пластины домкратов вклеены в нижнюю обшивку
    центроплана перед передним лонжероном центроплана; на левом борту — снаружи от NACA-заборника вентиляции.
    Хвостовая точка подъёма — площадка хвостового костыля нижней части киля (обшивка MSFS)."""
    for s in (1, -1):
        tag, gen = ('LH', 'левой') if s > 0 else ('RH', 'правой')
        q, n = R.skin(s * 1.08, -0.05, 'lower')
        if q is None:
            print('JACK нет обшивки', tag)
            continue
        n = -n.normalized()                     # внутрь фюзеляжа (вверх)
        p = P(f'Jacking plate {tag}', f'Опорная пластина домкрата под {gen} половиной центроплана: вклеена в нижнюю обшивку перед передним '
              'лонжероном центроплана (передним главным шпангоутом); при подъёме самолёта в её гнездо упирается головка домкрата', 'alu', 'AMM 07-10 2.B(2), рис. 1')
        cyl(p, q - n * 0.004, q + n * 0.0005, 0.035, 0, segs=28)                     # пластина на обшивке
        ring_tube(p, q - n * 0.0055, n, 0.015, 0.009, 0.004, 0, segs=24)             # буртик гнезда
        cyl(p, q - n * 0.006, q - n * 0.0035, 0.009, p.m(M['steel']), r1=0.004, segs=20)   # коническое гнездо
        p.done()


# ── Сборка ────────────────────────────────────────────────────────────────

firewall()
top_hat()
centre_section()
roll_bar()
frames()
fin()
stabilizer()
jacking_plates()

dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'STRUCTURE_OK {OUT} {size / 1e6:.2f} MB, parts {len([o for o in COL.all_objects if o.type == "MESH"])}')
