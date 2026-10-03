"""Оборудование кабины DA 40 NG: ремни, энергопоглощающие элементы, крепление
заднего сиденья, багажная сетка — отдельный слой сайта.

    python3 tools/da40/equipment.py [out.glb]

AMM 6.02.15 Rev. 3, 25-10 (2.B–D); РЛЭ 7.6, 7.7.

Ремни (25-10 2.D). У каждого кресла поясной ремень из двух лямок — наружная с
регулятором и язычком, внутренняя постоянной длины с замком — и плечевой ремень
с инерционной катушкой. Катушка пилота — на борту за креслом, ремень идёт вверх
через направляющую на дуге над плечом и вниз к язычку; катушка заднего
пассажира — на потолке над ним и сзади. Лямки поясного ремня — на болтах с
шайбами к чаше кресла.

Энергопоглощающие элементы (25-10 2.C): слоистый углепластик с жёстким
пенопластом; заднюю часть каждого переднего кресла держат два элемента снаружи
от узлов ремня, заднее сиденье — два элемента под анкерными плитами.

Заднее сиденье (25-10 2.B): спереди два болта с шайбами в рёбра на верху заднего
главного шпангоута; сзади под каждой половиной — металлическая пластина на
заклёпках, в ней болты лямок; по бокам — три болта в анкерные плиты на силовом
наборе.

Положение ремней — по поверхностям кресел из исходной модели (лучи по салону),
направляющие — по внутренней грани дуги (structure.py).
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
from lib import Part, box, cyl, hexa  # noqa: E402
from sections import loft  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-equipment-raw.glb'

ref.open_source()
R = ref.Ref()
COL = lib.collection('DA40 Cabin equipment (AMM 25-10)')
INTERIOR = [o for o in bpy.data.collections['DA40 Interior'].all_objects
            if o.type == 'MESH' and not o.hide_render and not any(m and 'Glass' in m.name for m in o.data.materials)]
T = ref._bvh(INTERIOR)

M = dict(
    web=lib.mat('DA40 seat belt webbing (grey)', (0.24, 0.25, 0.27), 0.0, 0.85, ru='лента ремня (полиэстер)'),
    reel=lib.mat('DA40 inertia reel housing (black)', (0.05, 0.05, 0.06), 0.2, 0.5, ru='корпус катушки, пластмасса'),
    steel=lib.mat('DA40 stainless steel', (0.62, 0.63, 0.65), 1.0, 0.28, ru='нержавеющая сталь'),
    buckle=lib.mat('DA40 belt buckle (polished)', (0.78, 0.79, 0.80), 1.0, 0.18, ru='сталь, полировка'),
    crash=lib.mat('DA40 crash element (CFRP + rigid foam)', (0.16, 0.17, 0.18), 0.1, 0.6, ru='углепластик с жёстким пенопластом'),
    plate=lib.mat('DA40 seat anchor plate (aluminium)', (0.72, 0.73, 0.75), 0.9, 0.35, ru='алюминиевый сплав'),
    net=lib.mat('DA40 baggage net (black)', (0.04, 0.04, 0.05), 0.0, 0.8, ru='сетка, синтетическая лента'),
)


def P(name, ru, m, doc='AMM 25-10'):
    return Part(name, ru, M[m], COL, True, doc)


# ── Поверхности салона ───────────────────────────────────────────────────

def on_back(x, z, y_from, off=0.006):
    """Точка на передней поверхности спинки: луч вперёд-назад (+Y)."""
    h = T.ray_cast(V((x, y_from, z)), V((0, 1, 0)), 1.2)
    if h[0] is None:
        return None
    n = h[1] if h[1].y < 0 else -h[1]
    return h[0] + n.normalized() * off


def on_seat(x, y, z_from=0.6, off=0.005):
    h = T.ray_cast(V((x, y, z_from)), V((0, 0, -1)), 1.5)
    return None if h[0] is None else h[0] + V((0, 0, off))


def strap(p, pts, nrm, w, t=0.0025):
    """Лента вдоль ломаной pts; nrm(i) — нормаль поверхности, на которой лежит лента."""
    pts = [q for q in pts if q is not None]
    rings = []
    for i, q in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        tg = (b - a).normalized()
        n = V(nrm(i)).normalized()
        n = (n - tg * n.dot(tg)).normalized()
        bw = tg.cross(n).normalized() * (w / 2)
        h = n * (t / 2)
        rings.append([q - bw - h, q + bw - h, q + bw + h, q - bw + h])
    loft(p, rings, 0, smooth=False)


# ── Направляющая на дуге: внутренняя грань дуги (как в structure.py) ──────

ROLL_Y = 0.27
ROLL_DEP, ROLL_TH, T_SH = 0.075, 0.045, 0.006


def roll_bar_inner(z_target, side):
    """Точка на внутренней грани дуги у борта side на высоте около z_target."""
    lo = R.hit((0.0, ROLL_Y, -2.0), (0, 0, 1), 4)[0].z
    top = R.hit((0.0, ROLL_Y, lo + 0.05), (0, 0, 1), 3)[0].z
    zc = (lo + top) / 2
    best = None
    for k in range(0, 91):
        a = math.radians(k)
        d = V((side * math.sin(a), 0, math.cos(a)))
        h = R.hit((0.0, ROLL_Y, zc), d, 1.2)[0]
        if h is None:
            continue
        q = h - d * (T_SH + ROLL_TH)
        if best is None or abs(q.z - z_target) < abs(best[0].z - z_target):
            best = (q, d)
    return best


# ── Передние кресла ──────────────────────────────────────────────────────

def front_seat(s):
    tag, who = ('LH', 'пилота') if s > 0 else ('RH', 'второго пилота')
    xi, xo, xc = s * 0.11, s * 0.44, s * 0.27
    # узлы лямок на чаше кресла сзади
    anc = {k: on_seat(x, -0.01) + V((0, 0, 0.004)) for k, x in (('in', xi), ('out', xo))}
    p = P(f'Front seat lap belt anchors {tag}', f'Узлы поясного ремня кресла {who}: болты с шайбами и самоконтрящимися гайками сквозь чашу кресла сзади',
          'steel', 'AMM 25-10 2.D')
    for q in anc.values():
        box(p, q, (0.03, 0.02, 0.004), Matrix.Identity(3), p.m(M['plate']), bevel=0.001)
        hexa(p, q + V((0, 0, 0.002)), q + V((0, 0, 0.007)), 0.011, 0)
    p.done()
    bk = on_seat(s * 0.22, -0.19)            # замок на внутренней лямке
    tg = on_seat(s * 0.30, -0.19)            # язычок на наружной
    p = P(f'Front seat lap belt {tag}', f'Поясной ремень кресла {who}: наружная лямка с регулятором и язычком, внутренняя постоянной длины с замком',
          'web', 'AMM 25-10 2.D; РЛЭ 7.6')
    up = lambda i: (0, 0, 1)  # noqa: E731
    strap(p, [anc['in'], on_seat(s * 0.15, -0.08), on_seat(s * 0.19, -0.15), bk - V((s * 0.03, 0, 0))], up, 0.045)
    strap(p, [anc['out'], on_seat(s * 0.42, -0.08), on_seat(s * 0.37, -0.15), tg + V((s * 0.02, 0, 0))], up, 0.045)
    box(p, on_seat(s * 0.42, -0.06) + V((0, 0, 0.004)), (0.05, 0.03, 0.008), Matrix.Identity(3), p.m(M['buckle']), bevel=0.002)   # регулятор
    p.done()
    p = P(f'Front seat belt buckle and tongue {tag}', f'Замок и язычок ремня кресла {who}: язычок вставляют в торец замка, кнопка на наружном торце замка его освобождает; на язычке — шпилька для конца плечевого ремня',
          'buckle', 'AMM 25-10 2.D')
    box(p, bk + V((0, 0, 0.006)), (0.06, 0.045, 0.014), Matrix.Identity(3), 0, bevel=0.004)
    box(p, bk + V((s * 0.033, 0, 0.006)), (0.008, 0.03, 0.010), Matrix.Identity(3), p.m(M['reel']), bevel=0.002)    # кнопка
    box(p, tg + V((0, 0, 0.004)), (0.04, 0.035, 0.004), Matrix.Identity(3), 0, bevel=0.002)
    cyl(p, tg + V((s * 0.01, 0, 0.006)), tg + V((s * 0.01, 0, 0.016)), 0.004, 0, segs=10)             # шпилька
    p.done()
    # катушка на борту за креслом и направляющая на дуге
    reel = V((s * 0.520, 0.37, 0.06))
    p = P(f'Front seat inertia reel {tag}', f'Инерционная катушка плечевого ремня {who} на борту за креслом: при рывке или резком ускорении защёлка не даёт вытянуть ремень',
          'reel', 'AMM 25-10 2.D')
    box(p, reel, (0.04, 0.07, 0.09), Matrix.Identity(3), 0, bevel=0.006)
    cyl(p, reel + V((-s * 0.021, 0, 0.0)), reel + V((-s * 0.021, 0, 0.0)) + V((-s * 0.004, 0, 0)), 0.03, p.m(M['steel']), segs=20)
    for dz in (-0.03, 0.03):
        hexa(p, reel + V((s * 0.02, 0, dz)), reel + V((s * 0.026, 0, dz)), 0.009, p.m(M['steel']))
    p.done()
    gi, gd = roll_bar_inner(0.66, s)
    g = gi + V((0, -ROLL_DEP / 2 - 0.004, 0)) - gd * 0.012
    p = P(f'Shoulder strap guide (roll bar) {tag}', f'Направляющая плечевого ремня {who} на дуге над плечом', 'reel', 'AMM 25-10 2.D')
    box(p, g, (0.055, 0.012, 0.018), Matrix.Identity(3), 0, bevel=0.004)
    for dx in (-0.02, 0.02):
        hexa(p, g + V((dx, 0.006, 0)), g + V((dx, 0.012, 0)), 0.007, p.m(M['steel']))
    p.done()
    # плечевой ремень: от катушки вверх за дугой к направляющей, вниз по спинке к язычку
    p = P(f'Front seat shoulder strap {tag}', f'Плечевой ремень кресла {who}: от катушки через направляющую на дуге, по спинке к шпильке язычка',
          'web', 'AMM 25-10 2.D; РЛЭ 7.6')
    behind = [reel + V((-s * 0.005, -0.01, 0.05)), V((reel.x - s * 0.01, ROLL_Y + ROLL_DEP / 2 + 0.008, 0.35)),
              V((g.x, ROLL_Y + ROLL_DEP / 2 + 0.008, g.z + 0.02)), g + V((0, 0.0, 0.012))]
    strap(p, behind, lambda i: (s, 0, 0), 0.04)
    down = [g + V((0, -0.008, 0.0))]
    for z, x in ((0.58, s * 0.38), (0.46, s * 0.34), (0.33, s * 0.31), (0.20, s * 0.30)):
        down.append(on_back(x, z, -0.30))
    down.append(tg + V((s * 0.01, 0.0, 0.018)))
    strap(p, down, lambda i: (0, -0.9, 0.4), 0.04)
    p.done()
    # энергопоглощающие элементы под задней частью кресла — снаружи от узлов ремня
    p = P(f'Front seat crash elements {tag}', f'Энергопоглощающие элементы под задней частью кресла {who}: слоистый углепластик с жёстким пенопластом, при аварийной посадке сминаются',
          'crash', 'AMM 25-10 2.C; РЛЭ 7.6')
    for x in (xi + s * 0.04, xo + s * 0.025):
        box(p, V((x, -0.045, -0.155)), (0.045, 0.06, 0.04), Matrix.Identity(3), 0, bevel=0.004)
        for k in range(3):
            box(p, V((x, -0.045, -0.170 + k * 0.012)), (0.047, 0.062, 0.002), Matrix.Identity(3), p.m(M['web']))   # слои
    p.done()


# ── Заднее сиденье ───────────────────────────────────────────────────────

REAR_Y = 0.835                      # задний край чаши под спинкой (по поверхности сиденья)


def rear_seats():
    # крепление чаши спереди: рёбра на верху заднего главного шпангоута
    p = P('Passenger seat pan front attachment', 'Передний край чаши заднего сиденья: два болта с шайбами в рёбра на верху заднего главного шпангоута',
          'steel', 'AMM 25-10 2.B')
    for x in (-0.20, 0.20):
        q = V((x, 0.525, -0.012))
        box(p, q, (0.05, 0.04, 0.004), Matrix.Identity(3), p.m(M['plate']), bevel=0.001)
        hexa(p, q + V((0, 0, 0.002)), q + V((0, 0, 0.008)), 0.012, 0)
        box(p, q - V((0, 0, 0.018)), (0.012, 0.05, 0.03), Matrix.Identity(3), p.m(M['plate']), bevel=0.001)   # ребро
    p.done()
    for s in (1, -1):
        tag, gen = ('LH', 'левого') if s > 0 else ('RH', 'правого')
        xi, xo = s * 0.06, s * 0.42
        # пластина под половиной чаши, анкерная плита сбоку, энергопоглощающий элемент под ней
        p = P(f'Passenger seat anchor plate {tag}', f'Анкерная плита {gen} борта под задним сиденьем: три болта с шайбами сквозь чашу и пластину в её анкерные гайки; плита — на силовом наборе',
              'plate', 'AMM 25-10 2.B')
        ap = V((s * 0.45, REAR_Y, -0.035))
        box(p, ap, (0.07, 0.11, 0.008), Matrix.Identity(3), 0, bevel=0.002)
        for dy in (-0.035, 0.0, 0.035):
            hexa(p, ap + V((0, dy, 0.004)), ap + V((0, dy, 0.010)), 0.011, p.m(M['steel']))
        p.done()
        c = P(f'Passenger seat crash element {tag}', f'Энергопоглощающий элемент заднего сиденья под анкерной плитой {gen} борта', 'crash', 'AMM 25-10 2.C')
        box(c, ap - V((0, 0, 0.034)), (0.06, 0.09, 0.06), Matrix.Identity(3), 0, bevel=0.005)
        for k in range(4):
            box(c, ap - V((0, 0, 0.058 - k * 0.014)), (0.062, 0.092, 0.002), Matrix.Identity(3), c.m(M['web']))
        c.done()
        anc = {k: on_seat(x, REAR_Y - 0.01) + V((0, 0, 0.004)) for k, x in (('in', xi), ('out', xo))}
        p = P(f'Passenger lap belt anchors {tag}', f'Болты лямок поясного ремня {gen} заднего места: сквозь чашу и металлическую пластину под ней',
              'steel', 'AMM 25-10 2.B, 2.D')
        for q in anc.values():
            box(p, q, (0.03, 0.02, 0.004), Matrix.Identity(3), p.m(M['plate']), bevel=0.001)
            hexa(p, q + V((0, 0, 0.002)), q + V((0, 0, 0.007)), 0.011, 0)
        p.done()
        bk = on_seat(s * 0.18, 0.62)
        tg = on_seat(s * 0.26, 0.62)
        p = P(f'Passenger lap belt {tag}', f'Поясной ремень {gen} заднего места: две лямки, замок и язычок', 'web', 'AMM 25-10 2.D')
        up = lambda i: (0, 0, 1)  # noqa: E731
        strap(p, [anc['in'], on_seat(s * 0.10, 0.74), on_seat(s * 0.14, 0.67), bk - V((s * 0.03, 0, 0))], up, 0.045)
        strap(p, [anc['out'], on_seat(s * 0.39, 0.74), on_seat(s * 0.33, 0.67), tg + V((s * 0.02, 0, 0))], up, 0.045)
        p.done()
        p = P(f'Passenger belt buckle and tongue {tag}', f'Замок и язычок ремня {gen} заднего места', 'buckle', 'AMM 25-10 2.D')
        box(p, bk + V((0, 0, 0.006)), (0.06, 0.045, 0.014), Matrix.Identity(3), 0, bevel=0.004)
        box(p, tg + V((0, 0, 0.004)), (0.04, 0.035, 0.004), Matrix.Identity(3), 0, bevel=0.002)
        cyl(p, tg + V((s * 0.01, 0, 0.006)), tg + V((s * 0.01, 0, 0.016)), 0.004, 0, segs=10)
        p.done()
        # катушка на потолке над пассажиром и сзади
        roof = T.ray_cast(V((s * 0.20, 1.20, 0.5)), V((0, 0, 1)), 1.0)[0]
        reel = roof - V((0, 0, 0.032))
        p = P(f'Passenger inertia reel {tag}', f'Инерционная катушка плечевого ремня {gen} заднего места на потолке над пассажиром и сзади',
              'reel', 'AMM 25-10 2.D')
        box(p, reel, (0.07, 0.09, 0.04), Matrix.Identity(3), 0, bevel=0.006)
        cyl(p, reel - V((0.0, 0.0, 0.021)), reel - V((0.0, 0.0, 0.025)), 0.028, p.m(M['steel']), segs=20)
        p.done()
        p = P(f'Passenger shoulder strap {tag}', f'Плечевой ремень {gen} заднего места: от катушки на потолке по спинке к шпильке язычка', 'web', 'AMM 25-10 2.D')
        top = on_back(s * 0.30, 0.69, 0.5)
        pts = [reel - V((0, 0.04, 0.02)), (reel + top) / 2 + V((0, 0, 0.03)), top]
        strap(p, pts, lambda i: (0, -0.7, -0.7), 0.04)
        down = [top]
        for z, x in ((0.55, s * 0.27), (0.40, s * 0.24), (0.25, s * 0.22)):
            down.append(on_back(x, z, 0.5))
        down.append(tg + V((s * 0.01, 0.0, 0.018)))
        strap(p, down, lambda i: (0, -0.9, 0.4), 0.04)
        p.done()


# ── Багажная сетка (РЛЭ 7.7: без сетки багаж не грузить) ─────────────────

def baggage_net():
    p = P('Baggage net', 'Багажная сетка: без неё багаж грузить нельзя (РЛЭ 7.7); натягивается над багажом и крепится к полу багажного отсека',
          'net', 'РЛЭ 7.7')
    xs = [-0.34 + 0.68 * i / 6 for i in range(7)]
    ys = [1.16 + 0.48 * j / 5 for j in range(6)]
    def floor(x, y):
        # лучи сверху от уровня ниже подголовников; выше 0,4 — это уже спинки, берём пол
        q = on_seat(x, y, 0.42, off=0.012)
        return q if q is not None and q.z < 0.40 else V((x, y, 0.30))
    grid = [[floor(x, y) for x in xs] for y in ys]
    for row in grid:
        strap(p, row, lambda i: (0, 0, 1), 0.012, t=0.003)
    for i in range(len(xs)):
        strap(p, [row[i] for row in grid], lambda k: (0, 0, 1), 0.012, t=0.003)
    for q in (grid[0][0], grid[0][-1], grid[-1][0], grid[-1][-1]):
        cyl(p, q, q + V((0, 0, 0.012)), 0.008, p.m(M['steel']), segs=12)        # точки крепления
    p.done()


front_seat(1)
front_seat(-1)
rear_seats()
baggage_net()

dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'EQUIPMENT_OK {OUT} {size / 1e6:.2f} MB, parts {len([o for o in COL.all_objects if o.type == "MESH"])}')
