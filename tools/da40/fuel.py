"""Топливная система DA 40 NG, стандартные баки — отдельный слой сайта.

    python3 tools/da40/fuel.py [out.glb]

Источники: AMM 6.02.15 Rev. 3 гл. 28 (28-00 рис. 1, 28-10 рис. 1 и 3,
28-20 рис. 1 и 2, 28-40 рис. 1–2), AFM 6.01.15-E Rev. 4 разд. 7.9.4 и 4A.5.1,
Корнеев 2012 разд. 5. Бак меряется по готовой геометрии: объём внутренней
поверхности должен дать 56,8 л (AFM 2.14.4: 15,0 US gal полного топлива).
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402  (bmesh и mathutils появляются только после bpy)
import bmesh  # noqa: E402,F401
from mathutils import Matrix, Vector as V  # noqa: E402

import lib  # noqa: E402
import ref  # noqa: E402
from lib import (Part, an_end, an_union, basis, box, cyl, fillet, hexa, p_clamp,  # noqa: E402
                 ring_tube, screw, sphere, sweep, torus, worm_clamp)

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-fuel-raw.glb'

ref.open_source()
R = ref.Ref()
ref.drop_collection('Fuel system')
COL = lib.collection('DA40 Fuel system (AMM 28)')

M = dict(
    tank=lib.mat('DA40 fuel tank aluminium (welded)', (0.74, 0.76, 0.78), 0.8, 0.4, alpha=0.42, ru='сварной алюминиевый сплав'),
    fuel=lib.mat('DA40 Jet A-1 fuel', (0.86, 0.63, 0.20), 0.0, 0.08, alpha=0.38, ru='топливо Jet A-1 / ТС-1'),
    alu=lib.mat('DA40 aluminium', (0.80, 0.81, 0.83), 1.0, 0.32, ru='алюминиевый сплав'),
    an=lib.mat('DA40 AN fitting blue anodised', (0.08, 0.24, 0.72), 0.9, 0.3, ru='штуцер AN, анодированный алюминий'),
    hose=lib.mat('DA40 fuel hose (synthetic)', (0.035, 0.035, 0.035), 0.0, 0.65, ru='топливный шланг (синтетический)'),
    fire=lib.mat('DA40 fire sleeve (silicone)', (0.80, 0.22, 0.06), 0.0, 0.85, ru='шланг в огнезащитном рукаве (силикон)'),
    rubber=lib.mat('DA40 rubber', (0.05, 0.05, 0.05), 0.0, 0.9, ru='резина'),
    steel=lib.mat('DA40 stainless steel', (0.62, 0.63, 0.65), 1.0, 0.28, ru='нержавеющая сталь'),
    brass=lib.mat('DA40 brass', (0.78, 0.60, 0.28), 1.0, 0.35, ru='латунь'),
    black=lib.mat('DA40 black anodised', (0.05, 0.05, 0.06), 0.6, 0.4, ru='алюминий, чёрное анодирование'),
    plastic=lib.mat('DA40 connector plastic', (0.07, 0.07, 0.07), 0.0, 0.6, ru='пластик разъёма'),
    wire=lib.mat('DA40 wire (white)', (0.85, 0.85, 0.82), 0.0, 0.6, ru='провод'),
    pump=lib.mat('DA40 fuel pump body', (0.55, 0.57, 0.60), 0.8, 0.4, ru='корпус насоса'),
    red=lib.mat('DA40 red anodised', (0.70, 0.08, 0.06), 0.8, 0.35, ru='алюминий, красное анодирование'),
    paint=lib.mat('DA40 white paint', (0.93, 0.93, 0.93), 0.0, 0.35, ru='окрашенная деталь'),
    lockwire=lib.mat('DA40 lock wire', (0.70, 0.70, 0.72), 1.0, 0.3, ru='контровочная проволока'),
    cooler=lib.mat('DA40 heat exchanger (aluminium fins)', (0.60, 0.62, 0.64), 0.9, 0.5, ru='алюминиевый теплообменник'),
)

SIDE = {+1: ('MAIN', 'LH', 'левого', 'левом'), -1: ('AUX', 'RH', 'правого', 'правом')}
T_SKIN = 0.010      # сэндвич обшивки: углепластик, пенопласт, стеклопластик (AMM 57-10)
WALL = 0.0016       # стенка сварного алюминиевого бака
X_IN, X_OUT = 1.30, 2.47
Y_F = 0.112         # за полкой переднего лонжерона
TARGET_L = 56.8     # AFM 2.14.4, стандартный бак, полное количество
FILLER = (2.79, 0.225)   # центр горловины: вырез в верхней обшивке (MSFS)
VENT_PANEL = (3.875, 0.175)  # наружный лючок бака: ~2 м от законцовки (AFM 7.9.4)
RC = 0.024          # радиус скругления рёбер бака
DRAIN = (1.378, 0.189)   # сливной клапан: там же, где у MSFS (Cylinder.160/174)


def P(name, ru, m, doc=None, smooth=True):
    return Part(name, ru, M[m] if isinstance(m, str) else m, COL, smooth, doc)


# ── Бак: сечение между лонжеронами по обводу крыла ─────────────────────────

def rear_y(X):
    X = math.copysign(max(abs(X), 1.33), X)
    lo, up = R.wing_section(X, 0.28)
    return R.spar_faces(X, (lo + up) / 2)[1] - 0.034


def raw_section(X, off, K=9):
    yr = rear_y(X)
    ys = [Y_F + (yr - Y_F) * i / (K - 1) for i in range(K)]
    bot = [V((X, y, R.skin(X, y, 'lower')[0].z + T_SKIN + off)) for y in ys]
    top = [V((X, y, R.skin(X, y, 'upper')[0].z - T_SKIN - off)) for y in reversed(ys)]
    return bot, top


def section(X, off, n=56, rc=RC):
    bot, top = raw_section(X, off)
    poly = bot + top
    k = len(bot) // 2
    loop = poly[k:] + poly[:k + 1]           # старт с середины днища, не на углу
    f = fillet(loop + [loop[1]], rc)[:-1]
    # равномерно по длине обвода, чтобы соседние сечения совпадали по вершинам
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


def shrink(ring, d):
    c = sum(ring, V()) / len(ring)
    return [c + (p - c) * max(0.0, 1 - d / max(1e-6, (p - c).length)) for p in ring]


def loft(p, rings, mi, caps=True):
    bm = p.bm
    vs = [[bm.verts.new(q) for q in r] for r in rings]
    n = len(rings[0])
    for a, b in zip(vs, vs[1:]):
        for i in range(n):
            f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
            f.material_index = mi
            f.smooth = True
    if caps:
        for r, vr, flip in ((rings[0], vs[0], True), (rings[-1], vs[-1], False)):
            c = bm.verts.new(sum(r, V()) / len(r))
            for i in range(n):
                tri = (c, vr[i], vr[(i + 1) % n]) if not flip else (c, vr[(i + 1) % n], vr[i])
                f = bm.faces.new(tri)
                f.material_index = mi
                f.smooth = False


def tank_rings(s, off, x0=X_IN, x1=X_OUT, bead=0.010):
    xs = [x0, x0 + bead]
    n = max(6, int((x1 - x0) / 0.06))
    xs += [x0 + bead + (x1 - x0 - 2 * bead) * i / n for i in range(1, n)]
    xs += [x1 - bead, x1]
    rings = []
    for i, x in enumerate(xs):
        r = section(s * x, off)
        if i in (0, len(xs) - 1):
            r = shrink(r, bead * 0.9)
        rings.append(r)
    return rings


def tank_volume(off):
    p = Part('_probe', None, M['tank'], COL)
    loft(p, tank_rings(+1, off + WALL), 0)
    v = p.bm.calc_volume(signed=False)
    p.bm.free()
    return v * 1000


lo_c, hi_c = 0.0, 0.05
for _ in range(22):
    mid = (lo_c + hi_c) / 2
    if tank_volume(mid) > TARGET_L:
        lo_c = mid
    else:
        hi_c = mid
CLR = (lo_c + hi_c) / 2
VOL = tank_volume(CLR)
print(f'FUEL tank clearance {CLR*1000:.1f} mm -> inner volume {VOL:.2f} l (target {TARGET_L})')
assert abs(VOL - TARGET_L) < 0.3, VOL


def zb(X, y):
    return R.skin(X, y, 'lower')[0].z + T_SKIN + CLR


def zt(X, y):
    return R.skin(X, y, 'upper')[0].z - T_SKIN - CLR


def clip_level(ring, zl):
    out = []
    n = len(ring)
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        ia, ib = a.z <= zl, b.z <= zl
        if ia:
            out.append(a)
        if ia != ib:
            t = (zl - a.z) / (b.z - a.z)
            out.append(a.lerp(b, t))
    return out


def resample(poly, n):
    pts = poly + [poly[0]]
    L = [0.0]
    for i in range(1, len(pts)):
        L.append(L[-1] + (pts[i] - pts[i - 1]).length)
    out, j = [], 0
    for i in range(n):
        s = L[-1] * i / n
        while j < len(L) - 2 and L[j + 1] < s:
            j += 1
        t = 0 if L[j + 1] == L[j] else (s - L[j]) / (L[j + 1] - L[j])
        out.append(pts[j].lerp(pts[j + 1], t))
    return out


# ── Бак, топливо, перегородки, резина ─────────────────────────────────────

def build_tank(s):
    tag, lr, gen, prep = SIDE[s]
    t = P(f'Fuel tank {tag} ({lr} wing) - welded aluminium',
          f'Топливный бак {tag} в {prep} крыле: сварной алюминий, 56,8 л полного, 53 л расходуемого топлива',
          'tank', 'AMM 28-10, AFM 7.9.4')
    rings = tank_rings(s, CLR)
    loft(t, rings, 0)
    t.done()

    seam = P(f'Fuel tank {tag} weld seams', f'Сварные швы бака {tag}: торцы и перегородки', 'alu', 'AMM 28-10')
    L = X_OUT - X_IN
    for x in (X_IN + 0.012, X_IN + L / 3, X_IN + 2 * L / 3, X_OUT - 0.012):
        a = section(s * (x - 0.003), CLR - 0.0012)
        b = section(s * (x + 0.003), CLR - 0.0012)
        loft(seam, [a, b], 0, caps=False)
    seam.done()

    for k, x in enumerate((X_IN + L / 3, X_IN + 2 * L / 3)):
        b = P(f'Fuel tank {tag} baffle {k + 1}',
              f'Перегородка {k + 1} в баке {tag}: гасит переливание топлива вдоль бака',
              'alu', 'AMM 28-10')
        r = section(s * x, CLR + WALL + 0.001)
        loft(b, [[q - V((0.0008 * s, 0, 0)) for q in r], [q + V((0.0008 * s, 0, 0)) for q in r]], 0)
        c = sum(r, V()) / len(r)
        # окно перетекания у днища и проход для датчика количества
        ring_tube(b, c + V((0, 0.05, -0.03)), V((1, 0, 0)), 0.021, 0.018, 0.004, 0)
        b.done()

    # топливо: горизонтальный уровень — из-за поперечного V оно собирается к корню
    level = zb(s * X_IN, 0.3) + 0.11
    fr = []
    xs = [X_IN + 0.004 + (X_OUT - X_IN - 0.008) * i / 24 for i in range(25)]
    for x in xs:
        r = clip_level(section(s * x, CLR + WALL + 0.0015, n=72), level)
        if len(r) < 6:
            break
        area = 0.0
        for i in range(len(r)):
            a, b2 = r[i], r[(i + 1) % len(r)]
            area += a.y * b2.z - b2.y * a.z
        if abs(area) / 2 < 2e-4:
            break
        fr.append(resample(r, 48))
    if len(fr) >= 2:
        f = P(f'Fuel Jet A-1 in {tag} tank', f'Топливо в баке {tag}: из-за поперечного V крыла собирается у корня, к отстойнику',
              'fuel', 'AFM 7.9.4')
        loft(f, fr, 0)
        f.done()

    # резиновые ленты на опорах бака в нервюрах
    for x, where in ((X_IN + 0.085, 'inboard'), (X_OUT - 0.095, 'outboard')):
        pr = P(f'Fuel tank {tag} {where} mounting rubber',
               f'Резиновая лента опоры бака {tag} ({"внутренняя" if where == "inboard" else "наружная"}): защита от истирания в нервюре',
               'rubber', 'AMM 28-10 рис. 1')
        a = section(s * (x - 0.018), CLR - 0.0025, n=56)
        b = section(s * (x + 0.018), CLR - 0.0025, n=56)
        loft(pr, [a, b], 0, caps=False)
        pr.done()


# ── Торец бака у корня: датчики, выход, обратка ───────────────────────────

def face_pt(s, y, z):
    return V((s * (X_IN - 0.0005), y, z))


def boss(p, s, pos, d_out, r, length, mi_boss, mi_hex=None):
    """Приварная бобышка на торце и шестигранник вкрученной детали."""
    n = V((-s, 0, 0))
    cyl(p, pos + n * 0.0, pos + n * 0.006, r * 1.45, mi_boss, segs=18)
    hexa(p, pos + n * 0.006, pos + n * (0.006 + length), r * 2.2, mi_boss if mi_hex is None else mi_hex)


def connector(p, pos, d, mi_body, mi_wire, cable_to=None):
    d = V(d).normalized()
    box(p, pos + d * 0.018, (0.016, 0.022, 0.014), basis(d), mi_body, bevel=0.0015)
    if cable_to is not None:
        end = V(cable_to)
        path = fillet([pos + d * 0.026, pos + d * 0.045, V((end.x + d.x * -0.03, end.y, end.z)), end], 0.02)
        sweep(p, path, 0.0024, mi_wire, segs=8)


def harness_plug(s):
    """Разъём проводки датчиков бака на корневой нервюре: дальше — электросистема."""
    c = V((s * 1.222, 0.25, -0.05))
    p = P(f'{SIDE[s][0]} tank sensors connector (root rib)', f'Разъём проводов датчиков бака {SIDE[s][0]} на корневой нервюре',
          'plastic', 'AMM 28-40')
    box(p, c, (0.018, 0.05, 0.026), Matrix.Identity(3), 0, bevel=0.002)
    box(p, c + V((s * 0.012, 0, 0)), (0.006, 0.07, 0.034), Matrix.Identity(3), p.m(M['alu']), bevel=0.001)
    cyl(p, c - V((s * 0.009, 0, 0)), c - V((s * 0.03, 0, 0)), 0.009, p.m(M['wire']), segs=12)
    p.done()
    return c + V((s * 0.009, 0, 0))


def build_inboard_face(s):
    tag, lr, gen, prep = SIDE[s]
    X = s * X_IN
    n = V((-s, 0, 0))
    b_ = lambda y, dz: zb(X, y) + dz  # noqa: E731
    t_ = lambda y, dz: zt(X, y) - dz  # noqa: E731
    fittings = {}

    # выход с пальчиковым фильтром — к шлангу подачи
    pos = face_pt(s, 0.33, b_(0.33, 0.024))
    p = P(f'{tag} tank outlet with finger filter', f'Выход бака {tag} с пальчиковым (гребенчатым) фильтром', 'alu', 'AMM 28-10 рис. 1')
    boss(p, s, pos, n, 0.007, 0.012, p.m(M['alu']))
    cyl(p, pos + n * 0.018, pos + n * 0.03, 0.0065, p.m(M['alu']), segs=14)
    # сам фильтр внутри бака — сетчатая трубка
    cyl(p, pos - n * 0.002, pos - n * 0.11, 0.0055, p.m(M['brass']), segs=14)
    for k in range(9):
        ring_tube(p, pos - n * (0.012 + k * 0.011), n, 0.0062, 0.0052, 0.0022, p.m(M['brass']), segs=14)
    p.done()
    elbow_in = pos + n * 0.03
    fittings['outlet'] = (elbow_in, n)

    # датчик количества: фланец на 4 винтах и зонд по диагонали бака
    pos = face_pt(s, 0.235, b_(0.235, 0.032))
    p = P(f'{tag} fuel quantity probe', f'Ёмкостный датчик количества топлива бака {tag}: от нижнего внутреннего угла к верхнему наружному',
          'alu', 'AMM 28-40 рис. 1')
    box(p, pos + n * 0.004, (0.008, 0.034, 0.034), Matrix.Identity(3), p.m(M['alu']), bevel=0.003)
    for dy in (-0.012, 0.012):
        for dz in (-0.012, 0.012):
            screw(p, pos + n * 0.008 + V((0, dy, dz)), n, 0.0045, p.m(M['steel']))
    cyl(p, pos + n * 0.008, pos + n * 0.02, 0.009, p.m(M['alu']), segs=16)
    end = V((s * (X_OUT - 0.035), 0.30, zt(s * (X_OUT - 0.035), 0.30) - 0.018))
    cyl(p, pos, end, 0.0085, p.m(M['alu']), segs=14, caps=True)
    cyl(p, pos - n * 0.01, pos - n * 0.07, 0.011, p.m(M['alu']), segs=16)
    connector(p, pos + n * 0.02, n, p.m(M['plastic']), p.m(M['wire']), PLUG[s] + V((0, -0.012, -0.004)))
    p.done()

    # сигнализатор низкого уровня (LOW FUEL у левого; у правого — выключает перекачку)
    pos = face_pt(s, 0.17, b_(0.17, 0.02))
    ru = ('Датчик низкого уровня топлива: сигнал LOW FUEL при остатке 3 US gal (+2/−1)' if s > 0
          else 'Датчик низкого уровня топлива: выключает насос перекачки, когда бак AUX пуст')
    p = P(f'{tag} low fuel sensor', ru, 'steel', 'AMM 28-00, 28-40')
    boss(p, s, pos, n, 0.006, 0.01, p.m(M['alu']), p.m(M['steel']))
    cyl(p, pos, pos - n * 0.035, 0.0055, p.m(M['steel']), segs=12)
    connector(p, pos + n * 0.016, n, p.m(M['plastic']), p.m(M['wire']), PLUG[s] + V((0, -0.004, -0.008)))
    p.done()

    # датчик температуры топлива
    pos = face_pt(s, 0.415, b_(0.415, 0.03))
    p = P(f'{tag} fuel temperature sensor', f'Датчик температуры топлива бака {tag}: показания L/R FUEL TEMP на MFD',
          'steel', 'AMM 28-10 рис. 1, 28-40')
    boss(p, s, pos, n, 0.005, 0.008, p.m(M['alu']), p.m(M['brass']))
    cyl(p, pos, pos - n * 0.025, 0.003, p.m(M['steel']), segs=10)
    connector(p, pos + n * 0.014, n, p.m(M['plastic']), p.m(M['wire']), PLUG[s] + V((0, 0.012, -0.004)))
    p.done()

    if s > 0:
        # обратка: вход возвратного топлива в бак MAIN
        pos = face_pt(s, 0.20, t_(0.20, 0.03))
        p = P('MAIN tank fuel return adapter', 'Штуцер обратной магистрали бака MAIN: сюда приходит горячее топливо из петли правого бака через радиатор',
              'alu', 'AMM 28-10 рис. 1, 28-20')
        boss(p, s, pos, n, 0.006, 0.01, p.m(M['alu']))
        cyl(p, pos + n * 0.016, pos + n * 0.026, 0.005, p.m(M['alu']), segs=12)
        p.done()
        fittings['return'] = (pos + n * 0.026, n)
    else:
        # петля охлаждения: вход сверху спереди, выход снизу сзади
        pin = face_pt(s, 0.17, t_(0.17, 0.034))
        pout = face_pt(s, 0.40, b_(0.40, 0.034))
        p = P('AUX tank cooling loop', 'Петля охлаждения в баке AUX: теплообменник, горячая обратка от двигателя отдаёт тепло топливу',
              'alu', 'AMM 28-00, 28-10 рис. 3')
        for q in (pin, pout):
            boss(p, s, q, n, 0.006, 0.01, p.m(M['alu']))
            cyl(p, q + n * 0.016, q + n * 0.026, 0.005, p.m(M['alu']), segs=12)
        xe = s * (X_OUT - 0.07)
        pts = [pin, V((xe, 0.17, zt(xe, 0.17) - 0.034)), V((xe, 0.29, (zt(xe, 0.29) + zb(xe, 0.29)) / 2)),
               V((xe, 0.40, zb(xe, 0.40) + 0.034)), pout]
        lib.pipe(p, pts, 0.0048, 0.04, p.m(M['alu']), segs=12)
        for k in range(1, 4):
            x = s * (X_IN + (X_OUT - X_IN) * k / 4)
            for y, z in ((0.17, zt(x, 0.17) - 0.034), (0.40, zb(x, 0.40) + 0.034)):
                box(p, V((x, y, z)), (0.004, 0.02, 0.02), Matrix.Identity(3), p.m(M['alu']))
        p.done()
        fittings['loop_in'] = (pin + n * 0.026, n)
        fittings['loop_out'] = (pout + n * 0.026, n)

    # перемычка металлизации бака на корневую нервюру
    p = P(f'{tag} tank bonding strap (inboard)', f'Перемычка металлизации бака {tag} на корневой нервюре', 'steel', 'AMM 28-10')
    a = face_pt(s, 0.13, t_(0.13, 0.02))
    lib.bonding_strap(p, a + n * 0.004, V((s * 1.215, 0.14, a.z - 0.01)), 0)
    p.done()
    return fittings


# ── Сливной клапан бака ───────────────────────────────────────────────────

def build_drain(s):
    tag, lr, gen, prep = SIDE[s]
    x, y = s * DRAIN[0], DRAIN[1]
    tank_bot = zb(x, y)
    sk, nor = R.skin(x, y, 'lower')
    p = P(f'{tag} tank drain valve', f'Сливной клапан бака {tag}: нажать снизу вверх — сливается отстой; пружина закрывает сама',
          'brass', 'AMM 28-00 3.F, AFM 4A.5.1')
    cyl(p, V((x, y, tank_bot + 0.002)), V((x, y, tank_bot - 0.004)), 0.014, p.m(M['alu']), segs=20)   # бобышка
    hexa(p, V((x, y, tank_bot - 0.004)), V((x, y, tank_bot - 0.014)), 0.019, 0)
    cyl(p, V((x, y, tank_bot - 0.014)), V((x, y, sk.z - 0.012)), 0.0065, 0, segs=16)
    cyl(p, V((x, y, sk.z - 0.012)), V((x, y, sk.z - 0.018)), 0.0045, p.m(M['steel']), segs=14)
    sphere(p, V((x, y, sk.z - 0.018)), 0.0045, p.m(M['steel']), segs=12, rings=6, zscale=0.6)
    # контровка на бобышку
    lw = fillet([V((x + 0.009, y, tank_bot - 0.009)), V((x + 0.02, y + 0.012, tank_bot - 0.004)),
                 V((x + 0.016, y + 0.02, tank_bot + 0.001))], 0.006)
    sweep(p, lw, 0.0006, p.m(M['lockwire']), segs=5)
    p.done()
    # лючок доступа к сливному клапану — видно снаружи
    q = P(f'{tag} tank drain access panel', f'Лючок сливного клапана бака {tag} в нижней обшивке', 'paint', 'AMM 28-10 2.A(3)')
    c = sk + nor * 0.0006
    ring_tube(q, c, nor, 0.032, 0.0085, 0.0012, 0, segs=36)
    Rn = basis(nor)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        screw(q, c + Rn @ V((0.025 * math.cos(a), 0.025 * math.sin(a), 0)), nor, 0.005, q.m(M['steel']))
    q.done()


# ── Горловина, крышка, дренаж ─────────────────────────────────────────────

def build_filler(s):
    tag, lr, gen, prep = SIDE[s]
    X = s * X_OUT
    n_out = V((s, 0, 0))
    ycap = FILLER[1]
    cap_pt, cap_n = R.skin(s * FILLER[0], ycap, 'upper')
    if cap_n.z < 0:
        cap_n = -cap_n
    zc = zt(X, 0.24) - 0.048
    a0 = V((X, 0.24, zc))

    # патрубок на наружном торце бака
    p = P(f'{tag} tank filler adapter', f'Патрубок горловины на наружном торце бака {tag}', 'alu', 'AMM 28-10')
    cyl(p, a0 - n_out * 0.004, a0 + n_out * 0.03, 0.0375, 0, segs=32)
    ring_tube(p, a0 + n_out * 0.001, n_out, 0.045, 0.0375, 0.004, 0, segs=32)
    p.done()

    # гибкая муфта и 4 червячных хомута
    a1 = a0 + n_out * 0.03
    a2 = a1 + n_out * 0.055
    p = P(f'{tag} filler flexible coupling', f'Гибкая муфта между баком {tag} и горловиной', 'rubber', 'AMM 28-10 рис. 1')
    cyl(p, a1 - n_out * 0.012, a2 + n_out * 0.012, 0.0425, 0, segs=32)
    p.done()
    for k, x in enumerate((a1.x - s * 0.004, a1.x + s * 0.012, a2.x - s * 0.012, a2.x + s * 0.004)):
        c = P(f'{tag} filler worm-drive clamp {k + 1}', f'Червячный хомут муфты горловины {tag}', 'steel', 'AMM 28-10 рис. 1')
        worm_clamp(c, V((x, a1.y, a1.z)), n_out, 0.0425, 0.009, 0, screw_dir=V((0, -0.3, 1)))
        c.done()

    # труба горловины: по размаху с подъёмом и изгиб к вырезу в обшивке
    top_in = cap_pt - cap_n * 0.006
    bend_at = V((cap_pt.x, cap_pt.y, top_in.z - 0.07))
    path = fillet([a2 - n_out * 0.004, a2 + n_out * 0.05, bend_at, top_in], 0.055)
    p = P(f'{tag} fuel filler tube', f'Труба горловины бака {tag}: сварная алюминиевая, Ø75 мм', 'alu', 'AMM 28-10 разд. 3')
    sweep(p, path, 0.0375, 0, segs=32)
    # фланец под обшивкой
    ring_tube(p, top_in - cap_n * 0.002, cap_n, 0.058, 0.0375, 0.004, 0, segs=40)
    # четыре штуцера дренажа под фланцем: 2 внутрь (от бака), 2 наружу (на выход)
    vent = {}
    Rt = basis(cap_n)
    zv = top_in - cap_n * 0.022
    for key, ang in (('in_f', 200), ('in_r', 160), ('out_f', -20), ('out_r', 20)):
        a = math.radians(ang)
        d = V((math.cos(a) * s, math.sin(a), 0)).normalized()
        base = zv + d * 0.036
        tip = base + d * 0.02
        cyl(p, base, tip, 0.004, p.m(M['alu']), segs=10)
        ring_tube(p, tip - d * 0.004, d, 0.0052, 0.004, 0.0035, p.m(M['alu']), segs=10)
        vent[key] = (tip, d)
    p.done()

    # металлизация бак — горловина
    p = P(f'{tag} filler bonding strap', f'Перемычка металлизации бак — горловина {tag}', 'steel', 'AMM 28-10 рис. 1')
    lib.bonding_strap(p, a0 + V((0, 0, -0.04)) + n_out * 0.01, a2 + V((0, 0, -0.04)) + n_out * 0.03, 0)
    p.done()

    # снаружи: кольцо фланца, 8 винтов, крышка с запорным рычажком
    c0 = cap_pt + cap_n * 0.0004
    p = P(f'{tag} fuel filler cap', f'Крышка заливной горловины бака {tag}: поднять рычажок и повернуть против часовой',
          'alu', 'AMM 28-10 разд. 3, Корнеев рис. 5.2')
    ring_tube(p, c0 + cap_n * 0.0008, cap_n, 0.057, 0.043, 0.0016, 0, segs=48)
    for k in range(8):
        a = 2 * math.pi * k / 8 + math.pi / 8
        screw(p, c0 + cap_n * 0.0016 + Rt @ V((0.050 * math.cos(a), 0.050 * math.sin(a), 0)), cap_n, 0.0052, p.m(M['steel']))
    cyl(p, c0 - cap_n * 0.004, c0 + cap_n * 0.0045, 0.042, 0, segs=48, r1=0.0395)
    ring_tube(p, c0 + cap_n * 0.0048, cap_n, 0.0395, 0.034, 0.0008, p.m(M['black']), segs=40)
    # рычажок: шарнир и лопатка заподлицо
    lever_dir = Rt @ V((0, 1, 0))
    hinge = c0 + cap_n * 0.0052 - lever_dir * 0.012
    side = cap_n.cross(lever_dir).normalized()
    cyl(p, hinge - side * 0.008, hinge + side * 0.008, 0.0022, p.m(M['steel']), segs=10)
    box(p, hinge + lever_dir * 0.022 + cap_n * 0.0006, (0.017, 0.042, 0.0028), Matrix((side, lever_dir, cap_n)).transposed(),
        p.m(M['alu']), bevel=0.0012)
    p.done()

    # надпись у горловины — табличка топлива по AMM 11-20
    p = P(f'{tag} fuel placard', f'Табличка у горловины {tag}: JET-A1, 53,0 л расходуемого, 56,8 л всего', 'paint', 'AMM 11-20 рис. 1')
    off = Rt @ V((0.0, -0.085, 0))
    box(p, cap_pt + off + cap_n * 0.0003, (0.055, 0.034, 0.0004), Matrix((Rt.col[0], Rt.col[1], cap_n)).transposed(), 0)
    box(p, cap_pt + off + cap_n * 0.0006 + Rt @ V((0, 0.009, 0)), (0.045, 0.006, 0.0003),
        Matrix((Rt.col[0], Rt.col[1], cap_n)).transposed(), p.m(M['red']))
    p.done()
    return vent, a0


def hose(name, ru, pts, r, bend, doc=None, mat='hose', ends=True, clamps=(), fire=False, nut='an'):
    p = P(name, ru, mat if not fire else 'fire', doc)
    path = fillet(pts, bend)
    P_, T_ = sweep(p, path, r if not fire else r + 0.004, 0, segs=16)
    if ends:
        for q, t in ((P_[0], -T_[0]), (P_[-1], T_[-1])):
            an_end(p, q, t, r, p.m(M[nut]), p.m(M['alu']))
    for s_, tab in clamps:
        q, t = lib.along(path, s_ * lib.path_len(path))
        p_clamp(p, q, t, r if not fire else r + 0.004, tab, p.m(M['steel']), p.m(M['rubber']))
    p.done()
    return path


def build_vents(s, vent, a0):
    tag, lr, gen, prep = SIDE[s]
    X = s * (X_OUT - 0.03)
    # штуцеры на верху наружного торца бака
    tops = []
    p = P(f'{tag} tank vent adapters', f'Штуцеры дренажа на верху наружного торца бака {tag}', 'alu', 'AMM 28-10 разд. 2.A')
    for y in (0.15, rear_y(X) - 0.03):
        base = V((X, y, zt(X, y)))
        cyl(p, base - V((0, 0, 0.004)), base + V((0, 0, 0.018)), 0.004, 0, segs=10)
        ring_tube(p, base + V((0, 0, 0.004)), V((0, 0, 1)), 0.007, 0.004, 0.003, 0, segs=12)
        tops.append(base + V((0, 0, 0.018)))
    p.done()
    # два шланга от бака к горловине (под крышкой)
    for k, (t0, key) in enumerate(zip(tops, ('in_f', 'in_r'))):
        tip, d = vent[key]
        pts = [t0, t0 + V((0, 0, 0.012)), tip + d * 0.03 + V((0, 0, -0.004)), tip]
        hose(f'{tag} vent hose {k + 1} (tank to filler)', f'Дренажный шланг {k + 1}: верхний угол бака {tag} — горловина под крышкой',
             pts, 0.004, 0.02, 'AMM 28-10 разд. 3', ends=False)

    # выходы: обратный клапан (бленд) на горловине и шланг с предохранительным клапаном/капилляром
    px, py = s * VENT_PANEL[0], VENT_PANEL[1]
    sk, nor = R.skin(px, py, 'lower')
    outs = []
    for k, dy in enumerate((-0.022, 0.022)):
        q, nq = R.skin(px, py + dy, 'lower')
        outs.append((q, nq))
    for k, key in enumerate(('out_f', 'out_r')):
        tip, d = vent[key]
        if k == 0:
            cv = P(f'{tag} vent check valve (bleed type)',
                   'Обратный клапан дренажа (с капилляром): впускает воздух в бак при снижении, топливо наружу не выпускает',
                   'brass', 'AMM 28-10 разд. 3, AFM 7.9.4')
            hexa(cv, tip, tip + d * 0.01, 0.014, 0)
            cyl(cv, tip + d * 0.01, tip + d * 0.034, 0.0075, 0, segs=14)
            cyl(cv, tip + d * 0.034, tip + d * 0.042, 0.0042, 0, segs=10)
            cv.done()
            start = tip + d * 0.042
        else:
            start = tip
        q, nq = outs[k]
        inner = q - nq * (0.0125)
        mid_x = s * (abs(start.x) + abs(q.x)) / 2
        zmid = (zb(mid_x, q.y) + zt(mid_x, q.y)) / 2 if abs(mid_x) < X_OUT else (R.wing_section(mid_x, q.y)[0] + R.wing_section(mid_x, q.y)[1]) / 2
        pts = [start, start + d * 0.03, V((mid_x, q.y, zmid)), V((q.x - s * 0.06, q.y, inner.z + 0.03)), inner - nq * 0.02, inner]
        if k == 1:
            name = f'{tag} vent hose with pressure relief valve' if s > 0 else f'{tag} vent hose with restrictor (capillary)'
            ru = ('Дренажный шланг с предохранительным клапаном 150 мбар: при переполнении бака MAIN при перекачке выпускает топливо и воздух'
                  if s > 0 else 'Дренажный шланг с капилляром: выравнивает давление в баке AUX при наборе высоты')
        else:
            name, ru = f'{tag} vent hose (check valve to outlet)', f'Дренажный шланг от обратного клапана к выходу под крылом {tag}'
        path = hose(name, ru, pts, 0.0045, 0.035, 'AMM 28-10 разд. 3, AFM 7.9.4', ends=False,
                    clamps=((0.35, V((0, -1, 0))), (0.7, V((0, -1, 0)))))
        if k == 1:
            m, t = lib.along(path, lib.path_len(path) * 0.5)
            v = P(f'{tag} ' + ('vent pressure relief valve 150 mbar' if s > 0 else 'vent restrictor'),
                  'Предохранительный клапан дренажа, 150 мбар (2 psi)' if s > 0 else 'Капилляр (дроссель) в дренажном шланге',
                  'brass', 'AFM 7.9.4')
            cyl(v, m - t * 0.022, m + t * 0.022, 0.0085 if s > 0 else 0.0062, 0, segs=16)
            hexa(v, m - t * 0.03, m - t * 0.02, 0.014, 0)
            hexa(v, m + t * 0.02, m + t * 0.03, 0.014, 0)
            v.done()
    # переборочные штуцеры в лючке и трубки наружу
    p = P(f'{tag} tank vent outlets', f'Выходы дренажа бака {tag} под крылом, ≈2 м от законцовки: проверить, не забиты ли',
          'alu', 'AFM 7.9.4, 4A.5.1')
    for q, nq in outs:
        inner = q - nq * 0.0125
        hexa(p, inner - nq * 0.002, inner + nq * 0.006, 0.013, p.m(M['alu']))
        ring_tube(p, q - nq * 0.001, nq, 0.009, 0.0035, 0.002, p.m(M['alu']), segs=14)
        tip = q + nq * 0.018
        cyl(p, inner, tip, 0.0035, 0, segs=12)
        ring_tube(p, tip, nq, 0.0035, 0.0026, 0.0015, 0, segs=12)
    p.done()


# ── Шланги, агрегаты под полом и в центроплане ─────────────────────────────

def body_pump(name, ru, c, axis, doc, r=0.022, L=0.11):
    axis = V(axis).normalized()
    p = P(name, ru, 'pump', doc)
    a, b = c - axis * L / 2, c + axis * L / 2
    cyl(p, a, b, r, 0, segs=24)
    for q, sgn in ((a, -1), (b, 1)):
        cyl(p, q, q + axis * 0.008 * sgn, r * 0.78, p.m(M['black']), segs=24)
        cyl(p, q + axis * 0.008 * sgn, q + axis * 0.02 * sgn, 0.006, p.m(M['alu']), segs=12)
    # разъём питания
    up = basis(axis).col[1]
    box(p, c + up * (r + 0.006), (0.018, 0.014, 0.012), basis(axis), p.m(M['plastic']), bevel=0.001)
    # хомуты крепления
    for q in (c - axis * L * 0.3, c + axis * L * 0.3):
        ring_tube(p, q, axis, r + 0.002, r, 0.008, p.m(M['steel']), segs=24)
    p.done()
    return a - axis * 0.02, b + axis * 0.02


def build_fuselage():
    pts = {}
    # ── Топливный кран под полом, вал к рукоятке на консоли
    vb = V((0.0, -0.345, -0.13))
    p = P('Fuel valve (NORMAL / EMERGENCY / OFF)',
          'Топливный кран, трёхходовой: NORMAL — бак MAIN, EMERGENCY — бак AUX, OFF — перекрыт', 'alu', 'AMM 28-20 2.B, AFM 7.9.4')
    cyl(p, vb - V((0, 0, 0.028)), vb + V((0, 0, 0.022)), 0.028, 0, segs=32)
    box(p, vb + V((0, 0, 0.026)), (0.075, 0.075, 0.006), Matrix.Identity(3), p.m(M['alu']), bevel=0.002)
    for sx in (-1, 1):
        for sy in (-1, 1):
            screw(p, vb + V((0.03 * sx, 0.03 * sy, 0.029)), V((0, 0, 1)), 0.005, p.m(M['steel']))
    ports = {'normal': V((1, 0, 0)), 'emerg': V((-1, 0, 0)), 'out': V((0, -1, 0))}
    for k, d in ports.items():
        base = vb + d * 0.026 - V((0, 0, 0.006))
        cyl(p, base, base + d * 0.016, 0.009, 0, segs=16)
        hexa(p, base + d * 0.012, base + d * 0.022, 0.016, p.m(M['an']))
        pts['valve_' + k] = (base + d * 0.022, d)
    # вал к рукоятке FUEL_SELECTOR на центральной консоли
    cyl(p, vb + V((0, 0, 0.022)), V((0.0, -0.345, 0.135)), 0.005, p.m(M['steel']), segs=12)
    ring_tube(p, V((0, -0.345, 0.07)), V((0, 0, 1)), 0.009, 0.005, 0.01, p.m(M['black']), segs=16)
    p.done()

    # ── Отстойник: к крану, слив выходит под фюзеляж
    out_pos, out_d = pts['valve_out']
    gh = out_pos + out_d * 0.03 + V((0, 0, 0.0))
    belly, bn = R.skin(gh.x, gh.y, 'lower')
    p = P('Gascolator', 'Отстойник (гасколятор) с фильтром: самая нижняя точка топливной системы, отделяет воду',
          'alu', 'AMM 28-20 2.C, AFM 7.9.4')
    cyl(p, out_pos - out_d * 0.004, gh - out_d * 0.022, 0.007, p.m(M['alu']), segs=14)
    hexa(p, out_pos, out_pos + out_d * 0.01, 0.016, p.m(M['an']))
    box(p, gh + V((0, 0, 0.0)), (0.048, 0.044, 0.03), Matrix.Identity(3), 0, bevel=0.003)
    cyl(p, gh - V((0, 0, 0.015)), V((gh.x, gh.y, belly.z + 0.024)), 0.022, p.m(M['alu']), segs=28)
    ring_tube(p, gh - V((0, 0, 0.018)), V((0, 0, 1)), 0.0245, 0.022, 0.006, p.m(M['steel']), segs=28)
    cyl(p, V((gh.x, gh.y, belly.z + 0.024)), V((gh.x, gh.y, belly.z + 0.012)), 0.022, p.m(M['alu']), segs=28, r1=0.012)
    p.done()
    p = P('Gascolator drain valve (pull to drain)', 'Сливной кран отстойника под фюзеляжем: потянуть вниз, чтобы слить отстой',
          'brass', 'AMM 28-00 3.F, AFM 4A.5.1 п. 9')
    cyl(p, V((gh.x, gh.y, belly.z + 0.012)), V((gh.x, gh.y, belly.z - 0.004)), 0.006, 0, segs=14)
    cyl(p, V((gh.x, gh.y, belly.z - 0.004)), V((gh.x, gh.y, belly.z - 0.016)), 0.0035, p.m(M['steel']), segs=12)
    torus(p, V((gh.x, gh.y, belly.z - 0.02)), V((1, 0, 0)), 0.006, 0.0014, p.m(M['steel']), segs=16, rsegs=6)
    ring_tube(p, belly - bn * 0.0005, bn, 0.016, 0.0065, 0.0012, p.m(M['paint']), segs=24)
    p.done()
    g_out = gh + V((0.024, -0.012, 0.0))
    pts['gasc_out'] = (g_out + V((0.012, 0, 0)), V((1, 0, 0)))
    pgo = P('Gascolator outlet fitting', 'Выход отстойника к насосам', 'an')
    an_union(pgo, g_out + V((0.006, 0, 0)), V((1, 0, 0)), 0.006, 0)
    pgo.done()

    # ── Два электрических насоса параллельно, перепускной клапан
    plate_c = V((0.0, -0.64, -0.195))
    p = P('Fuel pumps mounting plate', 'Плита крепления топливных насосов под полом кабины', 'alu', 'AMM 28-20 2.F')
    box(p, plate_c, (0.15, 0.20, 0.004), Matrix.Identity(3), 0, bevel=0.0015)
    for sx in (-1, 1):
        for sy in (-1, 1):
            screw(p, plate_c + V((0.065 * sx, 0.09 * sy, 0.002)), V((0, 0, 1)), 0.005, p.m(M['steel']))
    for sx in (-0.035, 0.035):
        for sy in (-0.035, 0.035):
            box(p, plate_c + V((sx, sy, 0.012)), (0.03, 0.006, 0.02), Matrix.Identity(3), p.m(M['alu']), bevel=0.001)
    p.done()
    ends = {}
    for k, sx in (('A', 0.035), ('B', -0.035)):
        a, b = body_pump(f'Electric fuel pump {k}',
                         f'Электрический топливный насос {k} (низкого давления): {"ECU A" if k == "A" else "ECU B"}, автомат защиты 7,5 А',
                         V((sx, -0.64, -0.162)), V((0, -1, 0)), 'AMM 28-20 2.F, AFM 7.9.4 (a)')
        ends[k] = (a, b)
    # тройники на входе (сзади) и выходе (спереди)
    tin = V((0.0, -0.545, -0.162))
    tout = V((0.0, -0.735, -0.162))
    p = P('Fuel pumps inlet and outlet tees', 'Тройники на входе и выходе насосов: насосы стоят параллельно', 'an', 'AMM 28-20 рис. 1')
    for t in (tin, tout):
        box(p, t, (0.022, 0.016, 0.016), Matrix.Identity(3), 0, bevel=0.002)
    for k in 'AB':
        a, b = ends[k]
        cyl(p, V((a.x, a.y, a.z)), V((a.x, tin.y, tin.z)), 0.005, p.m(M['alu']), segs=10)
        cyl(p, V((a.x, tin.y, tin.z)), tin, 0.005, p.m(M['alu']), segs=10)
        cyl(p, V((b.x, b.y, b.z)), V((b.x, tout.y, tout.z)), 0.005, p.m(M['alu']), segs=10)
        cyl(p, V((b.x, tout.y, tout.z)), tout, 0.005, p.m(M['alu']), segs=10)
    p.done()
    # перепускной клапан и петля
    bv = V((-0.095, -0.64, -0.162))
    p = P('Fuel bypass valve', 'Перепускной клапан: держит постоянное давление на входе насоса высокого давления, когда включены оба насоса',
          'alu', 'AMM 28-20 2.F, рис. 1')
    cyl(p, bv - V((0, 0.025, 0)), bv + V((0, 0.025, 0)), 0.011, 0, segs=18)
    hexa(p, bv - V((0, 0.03, 0)), bv - V((0, 0.024, 0)), 0.018, p.m(M['an']))
    hexa(p, bv + V((0, 0.024, 0)), bv + V((0, 0.03, 0)), 0.018, p.m(M['an']))
    cyl(p, bv + V((0, 0, 0.011)), bv + V((0, 0, 0.022)), 0.006, p.m(M['alu']), segs=12)
    p.done()
    hose('Fuel bypass line (outlet tee to bypass valve)', 'Перепускная линия: выход насосов — перепускной клапан',
         [tout - V((0.011, 0, 0)), V((-0.06, tout.y, tout.z)), V((bv.x, tout.y + 0.03, bv.z)), bv - V((0, 0.03, 0))], 0.005, 0.02,
         'AMM 28-20 рис. 1', ends=False)
    hose('Fuel bypass line (bypass valve to inlet tee)', 'Перепускная линия: перепускной клапан — вход насосов',
         [bv + V((0, 0.03, 0)), V((bv.x, tin.y - 0.03, bv.z)), V((-0.06, tin.y, tin.z)), tin - V((0.011, 0, 0))], 0.005, 0.02,
         'AMM 28-20 рис. 1', ends=False)
    pts['pumps_in'] = (tin + V((0, 0.008, 0)), V((0, 1, 0)))
    pts['pumps_out'] = (tout - V((0, 0.008, 0)), V((0, -1, 0)))
    return pts


def firewall_fitting(name, ru, x, z):
    c = V((x, -1.195, z))
    p = P(name, ru, 'steel', 'AMM 28-20 рис. 1')
    cyl(p, c + V((0, 0.03, 0)), c - V((0, 0.045, 0)), 0.0055, 0, segs=14)
    hexa(p, c + V((0, 0.012, 0)), c + V((0, 0.02, 0)), 0.02, 0)
    hexa(p, c - V((0, 0.02, 0)), c - V((0, 0.03, 0)), 0.02, 0)
    ring_tube(p, c, V((0, 1, 0)), 0.018, 0.0055, 0.003, 0, segs=20)
    p.done()
    return c + V((0, 0.03, 0)), c - V((0, 0.045, 0))


def build_lines(fit, fus):
    L_ = fit[+1]
    R_ = fit[-1]
    # ── Подача из бака MAIN к крану (NORMAL)
    o, n = L_['outlet']
    v, dv = fus['valve_normal']
    hose('Fuel supply MAIN tank to fuel valve', 'Шланг подачи: бак MAIN (левый) — топливный кран, вход NORMAL',
         [o, o + n * 0.05, V((1.12, 0.30, -0.125)), V((0.92, 0.15, -0.135)), V((0.52, 0.135, -0.15)),
          V((0.16, 0.12, -0.16)), V((0.08, -0.12, -0.15)), v + dv * 0.07, v], 0.0078, 0.07,
         'AMM 28-20 рис. 1', clamps=((0.3, V((0, -1, 0))), (0.5, V((0, -1, 0))), (0.68, V((0, 0, -1)))))

    # ── Бак AUX: шланг молниезащиты у корня, тройник, аварийная подача и перекачка
    o, n = R_['outlet']
    tee = V((-0.66, 0.16, -0.14))
    hose('Lightning protection hose (AUX tank outlet)', 'Шланг с молниезащитной шиной: выход бака AUX — тройник в правом центроплане',
         [o, o + n * 0.05, V((-1.10, 0.30, -0.125)), V((-0.92, 0.17, -0.135)), tee + V((-0.02, 0, 0))], 0.0078, 0.07,
         'AMM 28-00 рис. 1, AFM 7.9.4', clamps=((0.55, V((0, -1, 0))),))
    p = P('Lightning protection hose bonding braid', 'Медная плетёнка молниезащиты вдоль шланга бака AUX', 'brass', 'AMM 28-00 рис. 1')
    path = fillet([o + n * 0.05 + V((0, 0, 0.012)), V((-1.10, 0.30, -0.113)), V((-0.92, 0.17, -0.123)), tee + V((-0.03, 0, 0.012))], 0.07)
    sweep(p, path, 0.0022, 0, segs=6)
    p.done()
    p = P('AUX supply tee', 'Тройник: бак AUX — к крану (EMERGENCY) и к насосу перекачки', 'an', 'AMM 28-20 рис. 1')
    box(p, tee, (0.024, 0.018, 0.018), Matrix.Identity(3), 0, bevel=0.002)
    p.done()
    v, dv = fus['valve_emerg']
    hose('Fuel supply AUX tank to fuel valve (EMERGENCY)', 'Шланг аварийной подачи: тройник бака AUX — топливный кран, вход EMERGENCY',
         [tee + V((0.012, 0, 0)), V((-0.40, 0.14, -0.155)), V((-0.16, 0.10, -0.165)), V((-0.08, -0.14, -0.15)), v + dv * 0.07, v],
         0.0078, 0.07, 'AMM 28-20 2, рис. 1', clamps=((0.3, V((0, -1, 0))), (0.6, V((0, 0, -1)))))

    # к насосу перекачки: через обратный клапан в левый центроплан
    cv = V((-0.30, 0.20, -0.125))
    hose('Transfer line AUX tee to check valve', 'Линия перекачки: тройник бака AUX — обратный клапан',
         [tee + V((0, 0.009, 0)), tee + V((0, 0.04, 0.0)), cv + V((-0.03, 0, 0))], 0.0065, 0.04, 'AMM 28-20 2')
    p = P('Transfer line check valve', 'Обратный клапан на входе насоса перекачки', 'brass', 'AMM 28-00 рис. 1, 28-20 2')
    cyl(p, cv - V((0.03, 0, 0)), cv + V((0.03, 0, 0)), 0.009, 0, segs=16)
    hexa(p, cv - V((0.03, 0, 0)), cv - V((0.022, 0, 0)), 0.016, p.m(M['an']))
    hexa(p, cv + V((0.022, 0, 0)), cv + V((0.03, 0, 0)), 0.016, p.m(M['an']))
    box(p, cv + V((0.0, 0.0, 0.004)), (0.012, 0.004, 0.006), Matrix.Identity(3), p.m(M['red']))
    p.done()
    tp = V((0.80, 0.27, -0.09))
    a, b = body_pump('Electric fuel transfer pump', 'Электрический насос перекачки AUX → MAIN в левом центроплане между лонжеронами; выключатель FUEL XFER, автомат 5 А',
                     tp, V((1, 0, 0)), 'AMM 28-20 2.E, AFM 7.9.4', r=0.026, L=0.12)
    p = P('Transfer pump bracket', 'Кронштейн насоса перекачки на заднем лонжероне центроплана', 'alu', 'AMM 28-20 2.E')
    box(p, tp + V((0, 0.045, 0)), (0.13, 0.004, 0.06), Matrix.Identity(3), 0, bevel=0.001)
    for sx in (-0.05, 0.05):
        screw(p, tp + V((sx, 0.047, 0.02)), V((0, 1, 0)), 0.005, p.m(M['steel']))
    p.done()
    hose('Transfer line check valve to transfer pump', 'Линия перекачки: обратный клапан — насос перекачки',
         [cv + V((0.03, 0, 0)), V((0.0, 0.21, -0.125)), V((0.45, 0.24, -0.11)), a - V((0.05, 0, 0)), a], 0.0065, 0.06,
         'AMM 28-20 2', clamps=((0.35, V((0, -1, 0))), (0.7, V((0, -1, 0)))))

    # ── Обратка: перегородка → правый центроплан → обратный клапан → петля AUX
    fw_ret_in, fw_ret_out = firewall_fitting('Firewall fitting - fuel return', 'Проходной штуцер обратки в противопожарной перегородке', -0.05, -0.03)
    fw_sup_in, fw_sup_out = firewall_fitting('Firewall fitting - fuel supply', 'Проходной штуцер подачи в противопожарной перегородке', 0.05, -0.03)
    rcv = V((-0.84, 0.16, -0.075))
    hose('Fuel return firewall to check valve', 'Обратная магистраль от двигателя: перегородка — обратный клапан в правом центроплане',
         [fw_ret_in, fw_ret_in + V((0, 0.06, 0)), V((-0.10, -0.95, -0.14)), V((-0.13, -0.55, -0.17)), V((-0.16, -0.05, -0.17)),
          V((-0.30, 0.13, -0.12)), V((-0.60, 0.15, -0.09)), rcv + V((0.03, 0, 0))], 0.007, 0.07, 'AMM 28-20 2, рис. 1',
         clamps=((0.15, V((0, 0, -1))), (0.3, V((0, 0, -1))), (0.45, V((0, 0, -1))), (0.62, V((0, -1, 0))), (0.8, V((0, -1, 0)))))
    p = P('Fuel return check valve (RH wing stub)', 'Обратный клапан обратной магистрали в правом центроплане, перед петлёй бака AUX',
          'brass', 'AMM 28-20 2.G')
    cyl(p, rcv - V((0.03, 0, 0)), rcv + V((0.03, 0, 0)), 0.009, 0, segs=16)
    hexa(p, rcv - V((0.03, 0, 0)), rcv - V((0.022, 0, 0)), 0.016, p.m(M['an']))
    hexa(p, rcv + V((0.022, 0, 0)), rcv + V((0.03, 0, 0)), 0.016, p.m(M['an']))
    box(p, rcv + V((0.0, 0.0, 0.004)), (0.012, 0.004, 0.006), Matrix.Identity(3), p.m(M['red']))
    p.done()
    li, ln = R_['loop_in']
    hose('Fuel return check valve to AUX cooling loop', 'Обратка: обратный клапан — вход петли охлаждения в баке AUX',
         [rcv - V((0.03, 0, 0)), V((-1.02, 0.17, -0.05)), li + ln * 0.05, li], 0.007, 0.05, 'AMM 28-20 2')

    # ── Петля AUX → радиатор топлива → через фюзеляж → тройник → бак MAIN
    lo, lon = R_['loop_out']
    fc = V((-0.86, 0.37, -0.135))
    hose('AUX cooling loop to fuel cooler', 'Обратка: выход петли бака AUX — радиатор топлива',
         [lo, lo + lon * 0.05, V((-1.08, 0.40, -0.13)), fc + V((-0.085, 0, 0))], 0.007, 0.05, 'AMM 28-20 2')
    p = P('Fuel cooler', 'Радиатор топлива в правом центроплане: охлаждает обратку набегающим воздухом; доступ через крышку правой стойки шасси',
          'cooler', 'AMM 28-20 2.G, AFM 7.9.4')
    box(p, fc, (0.15, 0.11, 0.032), Matrix.Identity(3), 0, bevel=0.002)
    for k in range(13):
        box(p, fc + V((-0.066 + k * 0.011, 0, -0.0165)), (0.0012, 0.108, 0.004), Matrix.Identity(3), 0)
    for sx in (-1, 1):
        box(p, fc + V((0.078 * sx, 0, 0)), (0.012, 0.115, 0.036), Matrix.Identity(3), p.m(M['alu']), bevel=0.002)
        cyl(p, fc + V((0.084 * sx, -0.03 * sx, 0.0)), fc + V((0.095 * sx, -0.03 * sx, 0.0)), 0.006, p.m(M['alu']), segs=12)
    p.done()
    # воздухозаборник радиатора в крышке правой стойки
    sk, nor = R.skin(fc.x, fc.y - 0.02, 'lower')
    p = P('Fuel cooler air inlet', 'Воздухозаборник радиатора топлива в нижней обшивке правого центроплана (зимой — заглушка по AFM)',
          'paint', 'AFM 4A.5.1 п. 2 w–x, AMM 28-20 2.G')
    box(p, sk + nor * 0.007 + V((0, -0.03, 0)), (0.07, 0.05, 0.012), Matrix.Identity(3), 0, bevel=0.004)
    box(p, sk + nor * 0.009 + V((0, -0.057, 0)), (0.058, 0.004, 0.008), Matrix.Identity(3), p.m(M['black']))
    p.done()
    rt = V((0.97, 0.42, -0.115))
    hose('Fuel return fuel cooler to MAIN tank tee', 'Обратка: радиатор топлива — через фюзеляж вдоль заднего лонжерона — тройник в левом центроплане',
         [fc + V((0.095, -0.03, 0)), V((-0.66, 0.40, -0.14)), V((-0.30, 0.44, -0.16)), V((0.30, 0.44, -0.16)),
          V((0.62, 0.43, -0.14)), V((0.86, 0.42, -0.12)), rt - V((0.012, 0, 0))], 0.007, 0.07, 'AMM 28-20 2',
         clamps=((0.2, V((0, 1, 0))), (0.4, V((0, 1, 0))), (0.6, V((0, 1, 0))), (0.8, V((0, 1, 0)))))
    p = P('Fuel return tee (transfer pump joins)', 'Тройник обратки: сюда же приходит топливо от насоса перекачки', 'an', 'AMM 28-20 2')
    box(p, rt, (0.024, 0.018, 0.018), Matrix.Identity(3), 0, bevel=0.002)
    p.done()
    hose('Transfer pump to return tee', 'Линия перекачки: насос — тройник обратки бака MAIN',
         [b, b + V((0.03, 0, 0)), V((rt.x, 0.33, -0.10)), rt + V((0, -0.035, 0.0)), rt + V((0, -0.009, 0))], 0.0065, 0.03, 'AMM 28-20 2')
    ri, rn = L_['return']
    hose('Fuel return tee to MAIN tank', 'Обратка: тройник — штуцер обратной магистрали бака MAIN',
         [rt + V((0.012, 0, 0)), V((1.06, 0.40, -0.09)), V((1.16, 0.22, -0.03)), ri + rn * 0.05, ri], 0.007, 0.05, 'AMM 28-20 2')

    # ── Кран → отстойник (штуцер) → насосы → перегородка
    g, gd = fus['gasc_out']
    pi, pd = fus['pumps_in']
    hose('Gascolator to fuel pumps', 'Шланг: отстойник — вход электрических насосов',
         [g, g + gd * 0.04, V((0.03, -0.50, -0.14)), pi + pd * 0.04, pi], 0.0078, 0.03, 'AMM 28-20 2')
    po, pdd = fus['pumps_out']
    hose('Fuel supply pumps to firewall', 'Шланг подачи: выход насосов — проходной штуцер перегородки',
         [po, po + pdd * 0.04, V((0.04, -0.95, -0.14)), fw_sup_in + V((0, 0.06, 0)), fw_sup_in], 0.0078, 0.07,
         'AMM 28-20 2', clamps=((0.35, V((0, 0, -1))), (0.65, V((0, 0, -1)))))
    return fw_sup_out, fw_ret_out


def build_firewall_forward(fw_sup, fw_ret):
    # тонкий фильтр на кронштейне моторамы, демпфер пульсаций, к ТНВД
    flt = V((0.19, -1.34, -0.07))
    p = P('Fine fuel filter', 'Тонкий топливный фильтр перед двигателем: на кронштейне моторамы, пробка слива законтрена',
          'alu', 'AMM 28-20 2.D, рис. 2')
    cyl(p, flt - V((0, 0, 0.06)), flt + V((0, 0, 0.03)), 0.028, 0, segs=28)
    cyl(p, flt + V((0, 0, 0.03)), flt + V((0, 0, 0.045)), 0.031, p.m(M['alu']), segs=28)
    for k in range(6):
        a = 2 * math.pi * k / 6
        screw(p, flt + V((0.024 * math.cos(a), 0.024 * math.sin(a), 0.045)), V((0, 0, 1)), 0.005, p.m(M['steel']))
    hexa(p, flt - V((0, 0, 0.06)), flt - V((0, 0, 0.07)), 0.012, p.m(M['steel']))
    worm_clamp(p, flt - V((0, 0, 0.01)), V((0, 0, 1)), 0.028, 0.01, p.m(M['steel']), screw_dir=V((1, 0, 0)))
    box(p, flt + V((0.04, 0, -0.01)), (0.03, 0.05, 0.004), Matrix.Rotation(math.pi / 2, 3, 'Y'), p.m(M['alu']))
    for q in (V((-0.034, 0, 0.038)), V((0, -0.034, 0.038))):
        cyl(p, flt + q * 0.8, flt + q, 0.006, p.m(M['alu']), segs=12)
    p.done()
    f_in = flt + V((-0.034, 0, 0.038))
    f_out = flt + V((0, -0.034, 0.038))
    hose('Fire-sleeved hose firewall to fine filter', 'Шланг в огнезащитном рукаве: перегородка — тонкий фильтр',
         [fw_sup, fw_sup - V((0, 0.04, 0)), V((0.12, -1.29, -0.02)), f_in - V((0.03, 0, 0)), f_in], 0.0078, 0.05,
         'AMM 28-20 2.A', fire=True)
    dmp = V((0.16, -1.47, 0.03))
    p = P('Fuel pressure pulsation damper', 'Демпфер пульсаций давления топлива между тонким фильтром и ТНВД', 'alu', 'AMM 28-20 2.H, рис. 2 (MÄM 40-468)')
    cyl(p, dmp - V((0, 0.035, 0)), dmp + V((0, 0.035, 0)), 0.022, 0, segs=24)
    for sgn in (-1, 1):
        cyl(p, dmp + V((0, 0.035 * sgn, 0)), dmp + V((0, 0.046 * sgn, 0)), 0.016, 0, segs=24)
        hexa(p, dmp + V((0, 0.046 * sgn, 0)), dmp + V((0, 0.054 * sgn, 0)), 0.016, p.m(M['an']))
    p.done()
    hose('Fire-sleeved hose fine filter to pulsation damper', 'Шланг в огнезащитном рукаве: фильтр — демпфер пульсаций',
         [f_out, f_out + V((0, 0, 0.03)), V((0.17, -1.40, 0.02)), dmp + V((0, 0.054, 0))], 0.0078, 0.04, 'AMM 28-20 рис. 2', fire=True)
    hp = V((0.13, -1.60, 0.12))
    hose('Fire-sleeved hose damper to high pressure pump', 'Шланг в огнезащитном рукаве: демпфер — ТНВД на двигателе',
         [dmp - V((0, 0.054, 0)), V((0.16, -1.55, 0.06)), hp], 0.0078, 0.04, 'AMM 28-20 рис. 2', fire=True)
    hr = V((0.08, -1.58, 0.14))
    hose('Fire-sleeved hose engine return to firewall', 'Шланг обратки в огнезащитном рукаве: двигатель — перегородка',
         [hr, V((0.02, -1.45, 0.10)), V((-0.05, -1.30, 0.02)), fw_ret - V((0, 0.04, 0)), fw_ret], 0.0068, 0.05,
         'AMM 28-20 2', fire=True, clamps=((0.5, V((1, 0, 0))),))


# ── Сборка ────────────────────────────────────────────────────────────────

fit = {}
PLUG = {s: harness_plug(s) for s in (+1, -1)}
for s in (+1, -1):
    build_tank(s)
    fit[s] = build_inboard_face(s)
    build_drain(s)
    vent, a0 = build_filler(s)
    build_vents(s, vent, a0)
fus = build_fuselage()
fw_sup, fw_ret = build_lines(fit, fus)
build_firewall_forward(fw_sup, fw_ret)

dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU, 'tank_litres': round(VOL, 2), 'clearance_mm': round(CLR * 1000, 1),
               'replaced': ref.REPLACED}, f, ensure_ascii=False, indent=1)
print(f'FUEL_OK {OUT} {size / 1e6:.2f} MB, parts {len(lib.LABELS)}')
