"""Силовая установка DA 40 NG: двигатель Austro Engine E4-A (AE300) и его системы.

    python3 tools/da40/powerplant.py [out_dir]

Четыре слоя сайта из одной сборки, чтобы узлы разных систем сходились:
da40-engine (двигатель, редуктор, навесные агрегаты, моторама),
da40-induction (заборник, фильтр, турбокомпрессор, интеркулер, выпуск),
da40-cooling (радиатор, термостат, расширительный бачок, шланги),
da40-oil (маслоохладитель, щуп, сапун, смазка турбины).

Замена фотоскана MSFS (чужой двигатель, дырявая сетка). Компоновка — по AMM
6.02.15 Rev. 3: 71-00-00 рис. 1 (двигатель на мотораме в капотах), 72-00-00
рис. 1 (редуктор, фильтр, заливные и сливные пробки), 72-00-00 п. 2 (рядная
четвёрка DOHC, common rail, турбокомпрессор, редуктор с демпфером крутильных
колебаний); AFM 7.9.5–7.9.7: интеркулер сверху слева сзади, расширительный
бачок сверху рядом с термостатом, радиатор под моторамой; AMM 71-00:
моторама крепится к перегородке в пяти точках, двигатель — на четырёх
маслонаполненных амортизаторах. Ось винта — по коку исходной модели,
габарит — по капотам (проверяется в конце сборки).

Мировые координаты исходника: X — влево, Y — назад, Z — вверх, нос в −Y.
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
from lib import Part, basis, box, cyl, fillet, hexa, ring_tube, sweep, torus  # noqa: E402

OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else '/tmp'

ref.open_source()
R = ref.Ref()
COL = lib.collection('DA40 Engine AE300 (AMM 71, 72)')
COL_IND = lib.collection('DA40 Induction and exhaust (AMM 78, 81)')
COL_COOL = lib.collection('DA40 Liquid cooling (AMM 75)')
COL_OIL = lib.collection('DA40 Oil systems (AMM 79)')
for _old in ('Cooling system', 'Induction & exhaust', 'Oil systems'):
    ref.drop_collection(_old)

M = dict(
    iron=lib.mat('AE300 cast iron (block)', (0.22, 0.23, 0.24), 0.6, 0.55, ru='серый чугун'),
    alu=lib.mat('AE300 cast aluminium', (0.64, 0.65, 0.66), 0.8, 0.45, ru='литой алюминиевый сплав'),
    gbx=lib.mat('AE300 gearbox housing (cast aluminium)', (0.72, 0.73, 0.74), 0.75, 0.5, ru='литой алюминиевый сплав'),
    cover=lib.mat('AE300 cylinder head cover (black)', (0.045, 0.045, 0.05), 0.2, 0.35, ru='магниевый сплав, чёрное покрытие'),
    plate=lib.mat('AE300 cover plate (silver)', (0.78, 0.79, 0.80), 0.9, 0.3, ru='алюминий'),
    steel=lib.mat('AE300 steel', (0.60, 0.61, 0.63), 1.0, 0.3, ru='сталь'),
    exh=lib.mat('AE300 exhaust (heat-tinted steel)', (0.36, 0.31, 0.28), 0.9, 0.5, ru='жаростойкая сталь'),
    turb=lib.mat('AE300 turbine housing (cast iron)', (0.30, 0.27, 0.25), 0.7, 0.6, ru='жаропрочный чугун'),
    rubber=lib.mat('AE300 rubber', (0.03, 0.03, 0.035), 0.0, 0.7, ru='резина'),
    belt=lib.mat('AE300 poly-V belt', (0.04, 0.04, 0.045), 0.0, 0.8, ru='поликлиновой ремень'),
    mount=lib.mat('AE300 engine mount (steel tube, painted)', (0.42, 0.44, 0.47), 0.4, 0.5, ru='стальная труба, окраска'),
    elec=lib.mat('AE300 starter / alternator body', (0.50, 0.51, 0.53), 0.7, 0.45, ru='алюминиевый корпус'),
    red=lib.mat('AE300 filler cap (red)', (0.62, 0.08, 0.06), 0.1, 0.4, ru='пластик'),
    glass=lib.mat('AE300 sight glass', (0.55, 0.62, 0.66), 0.0, 0.05, alpha=0.5, ru='стекло'),
    hose=lib.mat('AE300 coolant hose (black rubber)', (0.035, 0.035, 0.04), 0.0, 0.6, ru='резиновый шланг'),
    oilhose=lib.mat('AE300 oil hose (braided steel)', (0.52, 0.53, 0.55), 0.8, 0.45, ru='шланг в стальной оплётке'),
    core=lib.mat('AE300 heat exchanger core (aluminium fins)', (0.60, 0.61, 0.64), 0.9, 0.55, ru='алюминиевые соты'),
    tank=lib.mat('AE300 expansion tank (translucent)', (0.86, 0.86, 0.80), 0.0, 0.4, alpha=0.75, ru='полупрозрачный пластик'),
    coolant=lib.mat('AE300 coolant', (0.20, 0.62, 0.35), 0.0, 0.3, ru='охлаждающая жидкость'),
    gfrp=lib.mat('AE300 GFRP duct', (0.80, 0.81, 0.72), 0.0, 0.55, ru='стеклопластик'),
    yellow=lib.mat('AE300 dipstick handle (yellow)', (0.85, 0.66, 0.10), 0.0, 0.4, ru='пластик'),
    filt=lib.mat('AE300 air filter element (pleated paper)', (0.86, 0.78, 0.55), 0.0, 0.8, ru='гофрированная бумага'),
    loom=lib.mat('AE300 wiring loom (corrugated sleeve)', (0.028, 0.028, 0.03), 0.0, 0.75, ru='гофрированная защитная трубка жгута'),
    conn=lib.mat('AE300 connector housing (plastic)', (0.16, 0.16, 0.17), 0.0, 0.5, ru='пластмассовый корпус разъёма'),
    shield=lib.mat('AE300 heat shield (stainless steel)', (0.74, 0.72, 0.68), 1.0, 0.38, ru='нержавеющая сталь, тепловой экран'),
    sensor=lib.mat('AE300 sensor body', (0.30, 0.31, 0.33), 0.6, 0.45, ru='корпус датчика'),
)

# ── Базовые размеры ───────────────────────────────────────────────────────
PROP = V((0.0, -1.965, 0.385))     # фланец винта: ось кока исходной модели
ZC = 0.14                          # ось коленчатого вала
Y_FRONT, Y_REAR = -1.785, -1.400   # блок цилиндров
CYL_Y = [-1.735, -1.645, -1.555, -1.465]
Z_PAN, Z_DECK, Z_HEAD, Z_COVER = ZC - 0.10, 0.375, 0.475, 0.540
GB_FRONT, GB_REAR = -1.915, -1.790  # корпус редуктора
Y_BELT = -1.352                     # плоскость ремённого привода (задний торец)
FIREWALL_Y = -1.21
TC = V((-0.235, -1.450, 0.260))    # ось ротора турбокомпрессора (вдоль Y)
IC = V((0.215, -1.365, 0.470))     # центр сердцевины интеркулера (сверху слева сзади)
HX = V((-0.280, -1.315, 0.020))   # теплообменник отопления кабины (слой вентиляции, air.py)
THERMO = V((0.115, -1.470, 0.490))     # AFM 7.9.5: рядом с расширительным бачком
EXP_TANK = V((0.190, -1.470, 0.490))   # AMM 12-10: на левой стороне двигателя
PUMP = V((0.100, Y_BELT, 0.300))
ALT = V((0.165, Y_BELT, -0.005))       # AMM 24-00: снизу слева сзади
STARTER = V((0.170, 0.0, 0.268))       # AMM 80-00: слева спереди (ось вдоль Y)
GLOW_Z = 0.455                          # свечи накаливания — выше выпускных фланцев
HARNESS_END = V((-0.125, -1.36, 0.42))  # разъём жгута двигателя за головкой справа; к нему — жгут из слоя электрики
FUEL_IN = V((0.137, -1.720, 0.175))     # штуцеры подачи и обратки на левом борту блока — к ним шланги слоя топлива
FUEL_RET = V((0.137, -1.680, 0.205))


def P(name, ru, m, doc, col=None):
    return Part(name, ru, M[m], col or COL, True, doc)


# ── Вспомогательная геометрия ─────────────────────────────────────────────

def hull2d(pts):
    pts = sorted(set((round(x, 6), round(y, 6)) for x, y in pts))
    if len(pts) < 3:
        return pts
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


def circles_hull(circles, n=40):
    pts = []
    for (cx, cz, r) in circles:
        for i in range(n):
            a = 2 * math.pi * i / n
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return hull2d(pts)


def rrect(w, h, r, cx=0.0, cz=0.0, n=6):
    """Скруглённый прямоугольник w×h, радиус r (контур против часовой)."""
    out = []
    for (sx, sz, a0) in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ccx, ccz = cx + sx * (w / 2 - r), cz + sz * (h / 2 - r)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            out.append((ccx + r * math.cos(a), ccz + r * math.sin(a)))
    return out


def prism_y(p, outline, y0, y1, mi=0):
    """Тело по контуру в плоскости XZ, вытянутое вдоль Y от y0 до y1."""
    bm = p.bm
    a = [bm.verts.new(V((x, y0, z))) for x, z in outline]
    b = [bm.verts.new(V((x, y1, z))) for x, z in outline]
    n = len(outline)
    for i in range(n):
        f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
        f.material_index = mi
        f.smooth = True
    for ring, flip in ((a, y1 > y0), (b, y1 < y0)):
        f = bm.faces.new(ring[::-1] if flip else ring)
        f.material_index = mi
        f.smooth = False


def prism_x(p, outline_yz, x0, x1, mi=0):
    bm = p.bm
    a = [bm.verts.new(V((x0, y, z))) for y, z in outline_yz]
    b = [bm.verts.new(V((x1, y, z))) for y, z in outline_yz]
    n = len(outline_yz)
    for i in range(n):
        f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
        f.material_index = mi
        f.smooth = True
    for ring, flip in ((a, x1 < x0), (b, x1 > x0)):
        f = bm.faces.new(ring[::-1] if flip else ring)
        f.material_index = mi
        f.smooth = False


def loft_y(p, out_a, ya, out_b, yb, mi=0):
    """Переход между двумя контурами с одинаковым числом точек (боковина без торцов)."""
    bm = p.bm
    a = [bm.verts.new(V((x, ya, z))) for x, z in out_a]
    b = [bm.verts.new(V((x, yb, z))) for x, z in out_b]
    n = len(a)
    for i in range(n):
        f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]) if yb < ya else
                         (b[i], b[(i + 1) % n], a[(i + 1) % n], a[i]))
        f.material_index = mi
        f.smooth = True


def squash(outline, k):
    """Поджать нижнюю часть контура к оси винта (скос низа редуктора к носу капота)."""
    return [(x, PROP.z + (z - PROP.z) * k if z < PROP.z else z) for x, z in outline]


def bolt(p, c, d, mi, af=0.010, h=0.007):
    d = V(d).normalized()
    hexa(p, c, c + d * h, af, mi)


# ── Втулка винта и кок (AMM 61-10 2, рис. 1) ─────────────────────────────

BLADE_DEG = (90.0, 210.0, 330.0)     # лопасти исходной модели: вверх, вниз вправо, вниз влево


def propeller_hub():
    """Втулка MTV-6 на шести шпильках фланца редуктора; к ней сзади на шести болтах — задний
    диск кока, спереди на шести винтах — передняя опорная пластина (оба с контровкой проволокой),
    на диске — балансировочные грузики. Обтекатель кока — из исходной модели."""
    y0 = PROP.y - 0.004                      # задний торец втулки на фланце
    y1 = PROP.y - 0.122                      # передний торец
    yb = PROP.y - 0.062                      # плоскость лопастей
    h = P('Propeller hub (MTV-6)', 'Втулка воздушного винта MTV-6: шесть шпилек на заднем торце, крепится к фланцу редуктора шестью гайками; внутри — поршень механизма изменения шага, масло подводится через полый вал',
          'alu', 'AMM 61-10 2, рис. 1')
    cyl(h, V((0, y0, PROP.z)), V((0, y1 + 0.02, PROP.z)), 0.074, 0, segs=40)
    cyl(h, V((0, y1 + 0.02, PROP.z)), V((0, y1, PROP.z)), 0.074, 0, segs=40, r1=0.055)
    for deg in BLADE_DEG:
        a = math.radians(deg)
        d = V((math.cos(a), 0, math.sin(a)))
        cyl(h, V((0, yb, PROP.z)) + d * 0.06, V((0, yb, PROP.z)) + d * 0.112, 0.036, 0, segs=24)        # гнездо лопасти
        ring_tube(h, V((0, yb, PROP.z)) + d * 0.122, d, 0.034, 0.024, 0.022, h.m(M['steel']), segs=24)  # обжимное кольцо (ферула)
    # упор малого шага — на корпусе втулки между лопастями
    a = math.radians(150.0)
    box(h, V((0, yb + 0.02, PROP.z)) + V((math.cos(a), 0, math.sin(a))) * 0.074, (0.022, 0.02, 0.016),
        basis(V((math.cos(a), 0, math.sin(a)))), h.m(M['steel']), bevel=0.002)
    h.done()
    b = P('Spinner bulkhead', 'Задний диск кока: крепится к заднему торцу втулки шестью болтами, болты законтрены проволокой; на диске — балансировочные грузики, к нему винтами крепится обтекатель кока',
          'alu', 'AMM 61-10 2, рис. 1')
    yd = PROP.y - 0.008
    cyl(b, V((0, yd + 0.0015, PROP.z)), V((0, yd - 0.0015, PROP.z)), 0.168, 0, segs=56)
    ring_tube(b, V((0, yd - 0.006, PROP.z)), (0, 1, 0), 0.168, 0.162, 0.012, 0, segs=56)                  # отбортовка под обтекатель
    for i in range(6):
        a = 2 * math.pi * (i + 0.5) / 6
        q = V((0.098 * math.cos(a), yd - 0.0015, PROP.z + 0.098 * math.sin(a)))
        hexa(b, q, q - V((0, 0.006, 0)), 0.010, b.m(M['steel']))
    # контровка проволокой: попарно между головками болтов
    for i in range(0, 6, 2):
        a0, a1 = 2 * math.pi * (i + 0.5) / 6, 2 * math.pi * (i + 1.5) / 6
        q0 = V((0.098 * math.cos(a0), yd - 0.006, PROP.z + 0.098 * math.sin(a0)))
        q1 = V((0.098 * math.cos(a1), yd - 0.006, PROP.z + 0.098 * math.sin(a1)))
        cc = V((0, yd - 0.006, PROP.z))
        sweep(b, fillet([q0, cc + ((q0 + q1) / 2 - cc) * 0.90, q1], 0.01), 0.0007, b.m(M['steel']), segs=6)
    for deg in (40.0, 280.0):                                                                               # грузики
        a = math.radians(deg)
        q = V((0.135 * math.cos(a), yd - 0.006, PROP.z + 0.135 * math.sin(a)))
        box(b, q, (0.02, 0.008, 0.012), basis(V((math.cos(a), 0, math.sin(a)))), b.m(M['steel']), bevel=0.001)
    b.done()
    f = P('Spinner front support plate', 'Передняя опорная пластина кока: на переднем торце втулки на шести винтах с контровкой; к ней крепится передняя часть обтекателя',
          'alu', 'AMM 61-10 2, рис. 1')
    yf = y1 - 0.004
    cyl(f, V((0, yf + 0.002, PROP.z)), V((0, yf - 0.002, PROP.z)), 0.062, 0, segs=36)
    for i in range(6):
        a = 2 * math.pi * i / 6
        q = V((0.044 * math.cos(a), yf - 0.002, PROP.z + 0.044 * math.sin(a)))
        cyl(f, q, q - V((0, 0.004, 0)), 0.0045, f.m(M['steel']), segs=10)
    f.done()


# ── Редуктор ──────────────────────────────────────────────────────────────

def gearbox():
    p = P('AE300 propeller speed reduction gearbox', 'Редуктор винта 1 : 1,69 с интегрированным демпфером крутильных колебаний; вал винта выше оси коленвала',
          'gbx', 'AMM 72-00 п. 2, рис. 1')
    shape = circles_hull([(0.0, PROP.z, 0.135), (0.0, ZC, 0.122)])
    y_mid = GB_FRONT + 0.06
    prism_y(p, shape, GB_REAR, y_mid)
    front = squash(shape, 0.80)                            # низ передней части скошен под капот
    loft_y(p, shape, y_mid, front, GB_FRONT + 0.012)
    bm = p.bm
    inner = squash(circles_hull([(0.0, PROP.z, 0.123), (0.0, ZC, 0.110)]), 0.80)
    prism_y(p, inner, GB_FRONT + 0.012, GB_FRONT)          # передняя крышка
    ring = [bm.verts.new(V((x, GB_FRONT + 0.012, z))) for x, z in front]
    f = bm.faces.new(ring[::-1])
    f.smooth = False
    flange = circles_hull([(0.0, PROP.z, 0.145), (0.0, ZC, 0.132)])
    prism_y(p, flange, GB_REAR + 0.016, GB_REAR)           # фланец разъёма по блоку
    # болты по фланцу разъёма и по передней крышке
    for k, (x, z) in enumerate(flange[::3]):
        c = V((x * 0.955, GB_REAR + 0.016, ZC + (z - ZC) * 0.955 if z < PROP.z else PROP.z + (z - PROP.z) * 0.955))
        bolt(p, c, (0, -1, 0), p.m(M['steel']))
    for k, (x, z) in enumerate(inner[::4]):
        cz = PROP.z if z > (PROP.z + ZC) / 2 else PROP.z + (ZC - PROP.z) * 0.8
        c = V((x * 0.92, GB_FRONT, cz + (z - cz) * 0.92))
        bolt(p, c, (0, -1, 0), p.m(M['steel']), af=0.009, h=0.006)
    # ступица вала винта и фланец
    cyl(p, V((0, GB_FRONT, PROP.z)), V((0, PROP.y + 0.02, PROP.z)), 0.062, 0, segs=36)
    cyl(p, V((0, PROP.y + 0.02, PROP.z)), PROP, 0.080, p.m(M['steel']), segs=40)
    for i in range(6):
        a = 2 * math.pi * i / 6
        c = PROP + V((0.058 * math.cos(a), 0, 0.058 * math.sin(a)))
        cyl(p, c, c - V((0, 0.018, 0)), 0.0065, p.m(M['steel']), segs=10)   # шпильки винта
    ring_tube(p, PROP - V((0, 0.002, 0)), (0, 1, 0), 0.030, 0.021, 0.006, p.m(M['steel']), segs=28)
    # сливная пробка внизу, заливная пробка сверху слева
    bolt(p, V((0, GB_REAR - 0.07, ZC - 0.122)), (0, 0, -1), p.m(M['steel']), af=0.014, h=0.01)
    bolt(p, V((0.105, GB_REAR - 0.05, PROP.z + 0.075)), (0.8, 0, 0.6), p.m(M['steel']), af=0.016, h=0.01)
    p.done()

    w = P('Gearbox oil level inspection window', 'Смотровое окно уровня масла редуктора', 'glass', 'AMM 72-00 рис. 1')
    box(w, V((0.126, GB_REAR - 0.03, 0.205)), (0.006, 0.03, 0.022), Matrix.Identity(3), 0, bevel=0.003)
    box(w, V((0.124, GB_REAR - 0.03, 0.205)), (0.006, 0.042, 0.034), Matrix.Identity(3), w.m(M['alu']), bevel=0.003)
    w.done()

    g = P('Propeller governor', 'Регулятор оборотов винта P-853-16 сверху сзади на редукторе: работает на масле редуктора, обороты задаёт EECU',
          'alu', 'AFM 7.9.3, AMM 61')
    c = V((0.045, GB_REAR - 0.035, PROP.z + 0.128))
    box(g, c, (0.07, 0.06, 0.02), Matrix.Identity(3), 0, bevel=0.004)             # фланец на корпусе
    cyl(g, c, c + V((0, 0, 0.045)), 0.028, 0, segs=24)
    cyl(g, c + V((0, 0, 0.045)), c + V((0, 0, 0.052)), 0.022, g.m(M['steel']), segs=20)
    box(g, c + V((0.04, 0.0, 0.028)), (0.03, 0.035, 0.03), Matrix.Identity(3), g.m(M['elec']), bevel=0.004)  # электропривод
    g.done()


# ── Блок, головка, поддон ─────────────────────────────────────────────────

def block():
    p = P('AE300 cylinder block', 'Блок цилиндров рядного четырёхцилиндрового дизеля (рабочий объём 1991 см³)',
          'iron', 'AMM 72-00 п. 2')
    crank = [(0.116, Z_PAN), (0.116, ZC + 0.07), (0.100, ZC + 0.11), (0.100, Z_DECK), (-0.100, Z_DECK),
             (-0.100, ZC + 0.11), (-0.116, ZC + 0.07), (-0.116, Z_PAN)]
    prism_y(p, crank, Y_REAR, Y_FRONT)
    # рубашка охлаждения: выпуклости по цилиндрам с обеих сторон
    for y in CYL_Y:
        for s in (1, -1):
            cyl(p, V((s * 0.094, y, ZC + 0.12)), V((s * 0.094, y, Z_DECK - 0.01)), 0.038, 0, segs=18)
    # рёбра жёсткости картера
    for y in (Y_FRONT + 0.03, (CYL_Y[1] + CYL_Y[2]) / 2, Y_REAR - 0.03):
        for s in (1, -1):
            box(p, V((s * 0.118, y, ZC + 0.0)), (0.008, 0.012, 0.13), Matrix.Identity(3), 0)
    p.done()

    t = P('AE300 timing chain cover', 'Крышка привода газораспределения на заднем торце двигателя', 'alu', 'AMM 72-00')
    prism_y(t, rrect(0.21, Z_HEAD - Z_PAN + 0.01, 0.03, 0, (Z_HEAD + Z_PAN) / 2), Y_REAR, Y_REAR + 0.028)
    t.done()

    h = P('AE300 cylinder head', 'Головка блока цилиндров: два распределительных вала (DOHC), 16 клапанов', 'alu', 'AMM 72-00 п. 2')
    prism_y(h, rrect(0.212, Z_HEAD - Z_DECK, 0.012, 0, (Z_HEAD + Z_DECK) / 2), Y_REAR + 0.01, Y_FRONT + 0.005)
    for y in CYL_Y:                                          # свечи накаливания, правый борт над выпускными окнами
        cyl(h, V((-0.100, y + 0.03, GLOW_Z)), V((-0.124, y + 0.03, GLOW_Z + 0.004)), 0.006, h.m(M['steel']), segs=10)
        hexa(h, V((-0.110, y + 0.03, GLOW_Z + 0.002)), V((-0.117, y + 0.03, GLOW_Z + 0.003)), 0.012, h.m(M['steel']))
    h.done()

    c = P('AE300 cylinder head cover', 'Крышка головки блока с колодцами форсунок', 'cover', 'AMM 72-00')
    prism_y(c, rrect(0.18, Z_COVER - Z_HEAD, 0.028, 0, (Z_COVER + Z_HEAD) / 2), Y_REAR + 0.02, Y_FRONT + 0.012)
    for y in CYL_Y:                                          # колодцы форсунок — овальные накладки
        pts = [(0.024 * math.cos(2 * math.pi * i / 20), 0.034 * math.sin(2 * math.pi * i / 20)) for i in range(20)]
        bm = c.bm
        ring = [bm.verts.new(V((x, y + z, Z_COVER + 0.002))) for x, z in pts]
        f = bm.faces.new(ring)
        f.material_index = c.m(M['plate'])
    box(c, V((0.0, (Y_REAR + Y_FRONT) / 2, Z_COVER - 0.004)), (0.10, 0.012, 0.012), Matrix.Identity(3), c.m(M['plate']), bevel=0.003)
    for y in (Y_REAR + 0.03, Y_FRONT + 0.03):
        for s in (1, -1):
            bolt(c, V((s * 0.078, y, Z_COVER - 0.006)), (0, 0, 1), c.m(M['steel']), af=0.008, h=0.005)
    c.done()

    s = P('AE300 oil sump', 'Масляный поддон двигателя (мокрый картер) со сливной пробкой', 'alu', 'AMM 72-00 рис. 1')
    pan = [(Y_FRONT + 0.01, Z_PAN), (Y_REAR - 0.005, Z_PAN), (Y_REAR - 0.02, -0.105), (Y_REAR - 0.18, -0.112),
           (Y_FRONT + 0.14, -0.085), (Y_FRONT + 0.03, -0.05)]
    prism_x(s, pan, -0.112, 0.112)
    bolt(s, V((0.07, Y_REAR - 0.05, -0.108)), (0, 0, -1), s.m(M['steel']), af=0.014, h=0.01)   # сливная пробка сзади слева
    s.done()


# ── Впуск, common rail, масляный фильтр ───────────────────────────────────

def intake_fuel_oil():
    m = P('AE300 intake manifold', 'Впускной коллектор (левый борт): наддувочный воздух после интеркулера', 'alu', 'AMM 72-00')
    cyl(m, V((0.160, Y_FRONT + 0.012, 0.405)), V((0.160, -1.445, 0.405)), 0.034, 0, segs=24)
    for y in CYL_Y:
        cyl(m, V((0.160, y, 0.405)), V((0.100, y, 0.415)), 0.019, 0, segs=16)
    sweep(m, fillet([V((0.160, -1.46, 0.405)), V((0.160, -1.445, 0.405)), V((0.200, -1.435, 0.40))], 0.02), 0.030, 0, segs=20)
    box(m, V((0.16, -1.70, 0.442)), (0.03, 0.03, 0.012), Matrix.Identity(3), m.m(M['elec']), bevel=0.003)   # датчик давления и температуры наддува
    m.done()

    r = P('Common rail (fuel accumulator)', 'Топливная рампа common rail: общий аккумулятор топлива высокого давления для четырёх форсунок',
          'steel', 'AMM 73, 72-00 п. 2')
    cyl(r, V((-0.070, Y_FRONT + 0.03, Z_COVER + 0.022)), V((-0.070, Y_REAR + 0.04, Z_COVER + 0.022)), 0.012, 0, segs=18)
    for y in CYL_Y:
        pth = fillet([V((-0.070, y + 0.012, Z_COVER + 0.022)), V((-0.050, y + 0.012, Z_COVER + 0.03)),
                      V((-0.012, y + 0.012, Z_COVER + 0.03)), V((0.0, y, Z_COVER + 0.01))], 0.012)
        sweep(r, pth, 0.0035, 0, segs=8)
        cyl(r, V((0.0, y, Z_COVER + 0.018)), V((0.0, y, Z_COVER - 0.01)), 0.011, r.m(M['plate']), segs=14)  # форсунка
    r.done()

    hp = P('High-pressure fuel pump', 'Топливный насос высокого давления (привод от ГРМ); подкачка — электронасосами бака',
           'alu', 'AMM 73')
    c = V((0.142, Y_FRONT + 0.005, 0.482))
    cyl(hp, c, c + V((0, 0.07, 0)), 0.036, 0, segs=24)
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.5
        q = c + V((0.042 * math.cos(a), 0, 0.042 * math.sin(a)))
        cyl(hp, q, q + V((0, 0.012, 0)), 0.011, 0, segs=12)
        bolt(hp, q, (0, -1, 0), hp.m(M['steel']), af=0.008, h=0.004)
    pth = fillet([c + V((0, 0.07, 0.015)), c + V((0, 0.09, 0.035)), V((0.02, Y_FRONT + 0.03, Z_COVER + 0.03)),
                  V((-0.07, Y_FRONT + 0.03, Z_COVER + 0.022))], 0.02)
    sweep(hp, pth, 0.0045, hp.m(M['steel']), segs=8)
    hp.done()

    f = P('Engine oil filter housing', 'Корпус масляного фильтра сверху слева на двигателе, у головки блока', 'alu', 'AMM 72-00 п. 3, рис. 1')
    c = V((0.235, -1.520, 0.300))
    cyl(f, c, c + V((0, 0, 0.13)), 0.033, 0, segs=24)
    cyl(f, c + V((0, 0, 0.13)), c + V((0, 0, 0.148)), 0.028, 0, segs=24)
    hexa(f, c + V((0, 0, 0.148)), c + V((0, 0, 0.162)), 0.030, f.m(M['steel']))
    box(f, c + V((-0.075, 0, 0.0)), (0.11, 0.05, 0.04), Matrix.Identity(3), 0, bevel=0.004)
    f.done()

    w = P('Coolant pump', 'Насос охлаждающей жидкости сзади на двигателе, привод от поликлинового ремня', 'alu', 'AMM 75-00')
    c = PUMP
    cyl(w, c + V((0, -0.048, 0)), c + V((0, -0.005, 0)), 0.042, 0, segs=24)
    cyl(w, c - V((0, 0.005, 0)), c + V((0, 0.010, 0)), 0.050, w.m(M['steel']), segs=28)   # шкив
    cyl(w, c + V((0.02, -0.035, 0.0)), c + V((0.065, -0.035, 0.0)), 0.017, 0, segs=14)     # вход от радиатора
    w.done()


# ── Ремённый привод, генератор, стартер ───────────────────────────────────

def accessories():
    pulleys = [((0.0, ZC), 0.075), ((ALT.x, ALT.z), 0.040), ((PUMP.x, PUMP.z), 0.050), ((-0.075, 0.300), 0.034)]
    d = P('Crankshaft pulley with vibration damper', 'Шкив коленчатого вала с гасителем колебаний (задний торец)', 'steel', 'AMM 72-00')
    c = V((0.0, Y_BELT, ZC))
    cyl(d, c - V((0, 0.012, 0)), c + V((0, 0.012, 0)), 0.075, 0, segs=36)
    cyl(d, c - V((0, 0.03, 0)), c - V((0, 0.012, 0)), 0.04, 0, segs=24)
    d.done()

    a = P('Alternator', 'Генератор 28 В снизу слева сзади на двигателе, привод поликлиновым ремнём с автоматическим натяжителем', 'elec', 'AMM 24-00, AFM 7.10.1')
    c = ALT
    cyl(a, c - V((0, 0.14, 0)), c - V((0, 0.02, 0)), 0.055, 0, segs=28)
    for k in range(10):
        ang = 2 * math.pi * k / 10
        q = c - V((0, 0.08, 0)) + V((0.056 * math.cos(ang), 0, 0.056 * math.sin(ang)))
        box(a, q, (0.006, 0.10, 0.006), basis(V((math.cos(ang), 0, math.sin(ang))), up=V((0, 1, 0))), 0)
    cyl(a, c - V((0, 0.02, 0)), c + V((0, 0.012, 0)), 0.040, a.m(M['steel']), segs=24)   # шкив
    cyl(a, c - V((0, 0.14, 0)), c - V((0, 0.155, 0)), 0.03, a.m(M['rubber']), segs=16)   # задняя крышка с клеммой
    box(a, c + V((-0.05, -0.08, 0.03)), (0.03, 0.02, 0.012), Matrix.Identity(3), a.m(M['steel']))    # кронштейн
    a.done()

    i = P('Belt tensioner idler', 'Автоматический натяжитель ремня', 'steel', 'AMM 24-00')
    c = V((-0.075, Y_BELT, 0.300))
    cyl(i, c - V((0, 0.012, 0)), c + V((0, 0.012, 0)), 0.034, 0, segs=24)
    box(i, c + V((0.03, -0.02, -0.03)), (0.06, 0.012, 0.018), basis(V((0.7, 0, -0.7)), up=V((0, 1, 0))), i.m(M['alu']))
    i.done()

    # ремень: огибающая шкивов
    pts2 = circles_hull([(x, z, r + 0.003) for (x, z), r in pulleys], n=48)
    b = P('Poly-V accessory belt', 'Поликлиновой ремень привода генератора и насоса охлаждающей жидкости', 'belt', 'AMM 72-00')
    loop = [V((x, Y_BELT, z)) for x, z in pts2]
    loop.append(loop[0])
    for k in range(len(loop) - 1):
        q0, q1 = loop[k], loop[k + 1]
        dd = q1 - q0
        if dd.length < 1e-5:
            continue
        box(b, (q0 + q1) / 2, (0.004, 0.022, dd.length + 0.0015), basis(dd, up=V((0, 1, 0))), 0)
    b.done()

    # AMM 80-00: стартер слева спереди. Ниже — блок штуцеров топлива и шланги к ТНВД,
    # сзади — маслозаливная труба, поэтому он короткий и стоит над блоком штуцеров
    s = P('Starter motor', 'Электростартер с тяговым реле слева спереди на двигателе; шестерня входит в зубчатый венец маховика у редуктора',
          'elec', 'AMM 80-00')
    c0, c1 = V((STARTER.x, Y_FRONT + 0.005, STARTER.z)), V((STARTER.x, Y_FRONT + 0.093, STARTER.z))
    cyl(s, c0, c1, 0.046, 0, segs=28)
    cyl(s, c1, c1 + V((0, 0.008, 0)), 0.038, s.m(M['rubber']), segs=20)
    rl = STARTER + V((0.042, 0, 0.042))
    cyl(s, V((rl.x, Y_FRONT + 0.02, rl.z)), V((rl.x, Y_FRONT + 0.085, rl.z)), 0.022, s.m(M['steel']), segs=20)   # тяговое реле
    cyl(s, V((rl.x, Y_FRONT + 0.085, rl.z)), V((rl.x, Y_FRONT + 0.098, rl.z)), 0.01, s.m(M['red']), segs=10)
    s.done()


# ── Турбокомпрессор и выпуск ──────────────────────────────────────────────

def turbo_exhaust():
    tc = TC
    t = P('Turbocharger', 'Турбокомпрессор: турбина на выхлопных газах вращает компрессор наддува; давление регулирует перепускная заслонка',
          'turb', 'AMM 81', COL_IND)
    torus(t, tc + V((0, 0.035, 0)), (0, 1, 0), 0.042, 0.030, 0, segs=28, rsegs=12)          # улитка турбины
    cyl(t, tc + V((0, 0.035, 0)), tc + V((0, 0.07, 0)), 0.036, 0, segs=24)
    cyl(t, tc - V((0, 0.005, 0)), tc + V((0, 0.012, 0)), 0.026, t.m(M['steel']), segs=20)   # корпус подшипников
    torus(t, tc - V((0, 0.035, 0)), (0, 1, 0), 0.046, 0.028, t.m(M['alu']), segs=28, rsegs=12)   # улитка компрессора
    cyl(t, tc - V((0, 0.035, 0)), tc - V((0, 0.075, 0)), 0.034, t.m(M['alu']), segs=24)    # вход компрессора
    ring_tube(t, tc - V((0, 0.075, 0)), (0, 1, 0), 0.040, 0.030, 0.008, t.m(M['steel']), segs=24)
    cyl(t, tc + V((0, -0.035, 0.07)), tc + V((0, -0.035, 0.10)), 0.022, t.m(M['alu']), segs=18)   # выход наддува вверх
    t.done()

    e = P('Exhaust manifold', 'Выпускной коллектор (правый борт) к турбине', 'exh', 'AMM 78', COL_IND)
    log = [V((-0.160, CYL_Y[0], 0.405)), V((-0.160, CYL_Y[-1] - 0.02, 0.405)), V((-0.20, -1.418, 0.36)),
           tc + V((0, 0.035, 0.075))]
    sweep(e, fillet(log, 0.04), 0.024, 0, segs=18)
    for y in CYL_Y:
        cyl(e, V((-0.100, y, 0.415)), V((-0.160, y, 0.405)), 0.017, 0, segs=14)
        box(e, V((-0.108, y, 0.415)), (0.010, 0.055, 0.04), Matrix.Identity(3), 0, bevel=0.003)
    e.done()

    d = P('Exhaust down pipe', 'Выпускная труба от турбины к вырезу в нижнем капоте: цельная, на четырёх болтах, две опоры на мотораме', 'exh', 'AMM 78-00', COL_IND)
    dp = [tc + V((0, 0.07, 0)), tc + V((-0.02, 0.09, -0.05)), V((-0.17, -1.33, 0.05)), V((-0.12, -1.26, -0.17)), V((-0.10, -1.24, -0.245))]
    sweep(d, fillet(dp, 0.05), 0.030, 0, segs=20)
    d.done()

    w = P('Waste gate', 'Перепускная заслонка турбины (вестгейт) с исполнительным механизмом, управляет EECU', 'turb', 'AMM 81-00', COL_IND)
    c = tc + V((-0.055, 0.075, -0.02))
    cyl(w, c, c + V((-0.04, 0.0, 0.0)), 0.016, 0, segs=16)
    cyl(w, c + V((-0.04, -0.03, 0.0)), c + V((-0.04, -0.09, 0.0)), 0.022, w.m(M['alu']), segs=18)
    cyl(w, c + V((-0.04, -0.03, 0)), c + V((-0.03, 0.0, 0)), 0.003, w.m(M['steel']), segs=8)
    w.done()


# ── Моторама и опоры ──────────────────────────────────────────────────────

def mount():
    # люлька под двигателем: опоры на нижних бортах блока и редуктора
    rear = {s: V((s * 0.160, Y_REAR - 0.03, 0.170)) for s in (1, -1)}
    front = {s: V((s * 0.170, GB_REAR - 0.04, 0.10)) for s in (1, -1)}
    fw_up = {s: V((s * 0.24, FIREWALL_Y, 0.30)) for s in (1, -1)}
    fw_lo = {s: V((s * 0.30, FIREWALL_Y, -0.095)) for s in (1, -1)}

    fw_c = V((0.0, FIREWALL_Y, -0.105))
    iso = P('Engine vibration isolators', 'Маслонаполненные резиновые амортизаторы подвески двигателя (4 шт.)', 'rubber', 'AMM 71-00')
    for s in (1, -1):
        for c in (rear[s], front[s]):
            cyl(iso, c - V((0, 0.02, 0)), c + V((0, 0.02, 0)), 0.028, 0, segs=20)
            cyl(iso, c - V((0, 0.024, 0)), c - V((0, 0.02, 0)), 0.034, iso.m(M['steel']), segs=20)
            cyl(iso, c + V((0, 0.02, 0)), c + V((0, 0.024, 0)), 0.034, iso.m(M['steel']), segs=20)
            box(iso, c + V((-s * 0.035, 0, 0)), (0.04, 0.03, 0.04), Matrix.Identity(3), iso.m(M['alu']), bevel=0.004)  # лапа на двигателе
    iso.done()
    # AMM 71-20: на каждой опоре — страховочный стальной трос между лапой двигателя и площадкой моторамы;
    # держит двигатель, если резина амортизатора разрушится. Трос идёт под амортизатором, на концах — коуши
    sr = P('Engine mount safety wire ropes', 'Страховочные тросы опор двигателя (4 шт.): стальной трос под амортизатором от лапы '
           'двигателя к площадке моторамы, на концах петли с обжимными втулками', 'steel', 'AMM 71-20 1.')
    for s in (1, -1):
        for c in (rear[s], front[s]):
            a = c + V((-s * 0.035, 0.0, -0.026))
            b = c + V((s * 0.024, 0.0, -0.030))
            run = [a, a - V((0, 0, 0.012)), V((c.x - s * 0.02, c.y, c.z - 0.044)), V((c.x + s * 0.024, c.y, c.z - 0.044)), b]
            sweep(sr, fillet(run, 0.008), 0.0016, 0, segs=8)
            for q, d in ((a, V((0, 0, 1))), (b, V((0, 0, 1)))):
                lib.torus(sr, q + d * 0.005, (0, 1, 0), 0.005, 0.0016, 0, segs=14, rsegs=6)      # петля
                cyl(sr, q - d * 0.003, q - d * 0.011, 0.0034, 0, segs=10)                        # обжимная втулка
    sr.done()

    f = P('Engine mounting frame', 'Моторама: сварная рама из стальных труб, крепится к противопожарной перегородке в пяти точках',
          'mount', 'AMM 71-00 рис. 1')
    tubes = []
    for s in (1, -1):
        tubes += [(fw_up[s], rear[s]), (rear[s], front[s]), (fw_lo[s], front[s]), (fw_up[s], fw_lo[s])]
    tubes += [(fw_lo[1], fw_c), (fw_c, fw_lo[-1]), (fw_up[1], fw_up[-1])]
    for a, b in tubes:
        cyl(f, a, b, 0.0105, 0, segs=12)
    for c in (fw_up[1], fw_lo[1], fw_up[-1], fw_lo[-1], fw_c):
        box(f, c + V((0, 0.006, 0)), (0.05, 0.012, 0.05), Matrix.Identity(3), f.m(M['steel']), bevel=0.003)
        bolt(f, c, (0, -1, 0), f.m(M['steel']), af=0.012, h=0.008)
    f.done()


# ── Наддув: заборник, фильтр, интеркулер ──────────────────────────────────

def hose(name, ru, pts, r, bend, mat, doc, col, clamps=True):
    p = P(name, ru, mat, doc, col)
    path = fillet(pts, bend)
    Pp, T = sweep(p, path, r, 0, segs=16)
    if clamps:
        for q, t in ((Pp[0], T[0]), (Pp[-1], T[-1])):
            lib.worm_clamp(p, q + t * (0.012 if q is Pp[0] else -0.012), t, r + 0.002, 0.008, p.m(M['steel']))
    p.done()
    return path


def induction():
    # NACA-заборник в правой боковине нижнего капота
    skin, n = R.hit(V((-0.2, -1.625, 0.16)), V((-1, 0, 0)))
    n = n.normalized()
    if n.x > 0:
        n = -n
    a = P('Engine air NACA inlet (bottom cowling, RH)', 'NACA-заборник воздуха двигателя в правой боковине нижнего капота',
          'rubber', 'AFM 7.9.6', COL_IND)
    box(a, skin - n * 0.004, (0.13, 0.05, 0.006), basis(n), 0, bevel=0.002)
    a.done()
    hose('Air inlet duct NACA to air filter', 'Воздуховод от NACA-заборника к воздушному фильтру',
         [skin - n * 0.01, skin - n * 0.04, V((-0.32, -1.645, 0.13)), V((-0.30, -1.65, 0.125))], 0.028, 0.04, 'hose', 'AFM 7.9.6', COL_IND)

    f = P('Engine air filter', 'Воздушный фильтр двигателя: корпус и сменный бумажный элемент', 'alu', 'AFM 7.9.6', COL_IND)
    F = V((-0.255, -1.66, 0.125))
    box(f, F, (0.09, 0.13, 0.07), Matrix.Identity(3), 0, bevel=0.008)
    box(f, F + V((0, 0, 0.036)), (0.075, 0.11, 0.004), Matrix.Identity(3), f.m(M['filt']))
    for dy in (-0.045, 0.045):
        box(f, F + V((-0.046, dy, 0.02)), (0.004, 0.014, 0.03), Matrix.Identity(3), f.m(M['steel']))   # защёлки крышки
    f.done()

    v = P('Alternate air valve', 'Клапан альтернативного воздуха за фильтром: поворотная корзина берёт воздух через фильтр или, без фильтра, из моторного отсека',
          'alu', 'AFM 7.9.2 (f), 7.9.6', COL_IND)
    c = V((-0.235, -1.60, 0.16))
    cyl(v, c, c + V((0, 0, 0.06)), 0.031, 0, segs=24)
    for k in range(6):                                           # прорези корзины
        ang = 2 * math.pi * k / 6
        q = c + V((0.032 * math.cos(ang), 0.032 * math.sin(ang), 0.03))
        box(v, q, (0.004, 0.012, 0.03), basis(V((math.cos(ang), math.sin(ang), 0)), up=V((0, 0, 1))), v.m(M['rubber']))
    box(v, c + V((0.0, 0.04, 0.03)), (0.012, 0.04, 0.006), Matrix.Identity(3), v.m(M['steel']))           # рычаг
    v.done()
    cab = P('Alternate air Bowden cable', 'Трос рычага ALTERNATE AIR (под приборной доской слева от консоли) к клапану альтернативного воздуха',
            'rubber', 'AFM 7.9.2 (f)', COL_IND)
    sweep(cab, fillet([c + V((0.0, 0.06, 0.03)), c + V((0.0, 0.08, 0.03)), V((-0.30, -1.50, 0.15)), V((-0.30, -1.35, 0.15)),
                       V((-0.34, -1.26, 0.25)), V((-0.22, FIREWALL_Y - 0.005, 0.38))], 0.04), 0.003, 0, segs=8)
    cab.done()
    hose('Compressor inlet duct', 'Воздуховод от клапана альтернативного воздуха ко входу компрессора',
         [c + V((0, 0, 0.06)), c + V((0, 0, 0.08)), TC + V((0, -0.11, 0)), TC + V((0, -0.08, 0))], 0.029, 0.03, 'hose', 'AFM 7.9.6', COL_IND)

    # наддувочный воздух: компрессор → через задний торец → интеркулер
    hose('Charge air pipe compressor to intercooler', 'Наддувочный воздух от компрессора к интеркулеру: над задним торцом двигателя',
         [TC + V((0, -0.035, 0.095)), TC + V((0, -0.035, 0.21)), V((-0.17, -1.40, 0.52)), V((-0.10, -1.318, 0.535)),
          V((0.07, -1.318, 0.55)), V((IC.x - 0.0775, -1.34, 0.558)), V((IC.x - 0.0775, -1.365, 0.535))], 0.027, 0.05, 'alu', 'AFM 7.9.6', COL_IND)
    ic = P('Intercooler', 'Интеркулер сверху слева сзади на двигателе: охлаждает наддувочный воздух потоком из левого канала верхнего капота',
           'core', 'AFM 7.9.6', COL_IND)
    box(ic, IC, (0.13, 0.07, 0.12), Matrix.Identity(3), 0, bevel=0.003)
    for k in range(11):                                          # пластины сот
        box(ic, IC + V((-0.06 + k * 0.012, -0.036, 0)), (0.002, 0.004, 0.118), Matrix.Identity(3), ic.m(M['alu']))
    for sx in (-1, 1):
        box(ic, IC + V((sx * 0.0775, 0, 0)), (0.025, 0.075, 0.13), Matrix.Identity(3), ic.m(M['alu']), bevel=0.006)   # бачки
    sl = [IC + V((0, -0.037, 0))]
    ring_tube(ic, sl[0] - V((0, 0.004, 0)), (0, 1, 0), 0.092, 0.074, 0.008, ic.m(M['rubber']), segs=4)   # уплотнение канала капота
    ic.done()
    hose('Charge air hose intercooler to intake manifold', 'Охлаждённый воздух от интеркулера во впускной коллектор',
         [IC + V((0.0775, 0, -0.066)), IC + V((0.0775, -0.01, -0.09)), V((0.235, -1.43, 0.40)), V((0.200, -1.435, 0.40))], 0.026, 0.02, 'hose', 'AFM 7.9.6', COL_IND)


# ── Жидкостное охлаждение ─────────────────────────────────────────────────

def cooling():
    rot = Matrix.Rotation(math.radians(-14.5), 3, 'X')
    rc = V((0.0, -1.64, -0.110))
    r = P('Coolant radiator', 'Радиатор охлаждающей жидкости под моторамой, обдувается воздухом из заборника в нижнем капоте',
          'core', 'AFM 7.9.5, AMM 75-00', COL_COOL)
    box(r, rc, (0.25, 0.20, 0.034), rot, 0, bevel=0.002)
    for k in range(16):
        box(r, rc + rot @ V((0, -0.093 + k * 0.0124, -0.019)), (0.25, 0.002, 0.004), rot, r.m(M['alu']))
    for sx in (-1, 1):
        box(r, rc + rot @ V((sx * 0.14, 0, 0)), (0.03, 0.205, 0.05), rot, r.m(M['alu']), bevel=0.005)
    r.done()
    d = P('Radiator air duct', 'Воздуховод радиатора от заборника в нижнем капоте', 'gfrp', 'AMM 75-00', COL_COOL)
    fr = [(0.12, 0.012), (-0.12, 0.012), (-0.12, -0.028), (0.12, -0.028)]
    rr = [(0.13, -0.066), (-0.13, -0.066), (-0.13, -0.104), (0.13, -0.104)]
    loft_y(d, fr, -1.83, rr, -1.745)
    d.done()

    t = P('Thermostat housing', 'Корпус термостата на головке: до 80 °C жидкость идёт малым кругом, к 95 °C большой круг через радиатор открыт полностью',
          'alu', 'AMM 75-00', COL_COOL)
    box(t, THERMO, (0.04, 0.04, 0.04), Matrix.Identity(3), 0, bevel=0.006)
    cyl(t, THERMO + V((0, -0.02, 0)), THERMO + V((0, -0.045, 0.005)), 0.017, 0, segs=16)
    t.done()
    e = P('Coolant expansion tank', 'Расширительный бачок — высшая точка системы, рядом с термостатом; в бачке датчик уровня (COOL LVL)',
          'tank', 'AMM 75-00, AFM 7.9.5', COL_COOL)
    cyl(e, EXP_TANK - V((0, 0, 0.04)), EXP_TANK + V((0, 0, 0.04)), 0.045, 0, segs=28)
    cyl(e, EXP_TANK - V((0, 0, 0.037)), EXP_TANK + V((0, 0, 0.01)), 0.042, e.m(M['coolant']), segs=28)
    cyl(e, EXP_TANK + V((0, 0, 0.04)), EXP_TANK + V((0, 0, 0.052)), 0.022, e.m(M['alu']), segs=20)       # горловина
    cyl(e, EXP_TANK + V((0, 0, 0.052)), EXP_TANK + V((0, 0, 0.066)), 0.026, e.m(M['rubber']), segs=20)  # крышка с клапаном
    cyl(e, EXP_TANK + V((0.044, 0, -0.02)), EXP_TANK + V((0.06, 0, -0.02)), 0.008, e.m(M['elec']), segs=12)  # датчик уровня
    e.done()

    hose('Coolant hose thermostat to radiator', 'Большой круг: от термостата к радиатору', [THERMO + V((0, -0.045, 0.005)),
         V((0.20, -1.545, 0.52)), V((0.30, -1.56, 0.46)), V((0.30, -1.58, 0.10)), V((0.20, -1.72, -0.04)),
         rc + rot @ V((0.14, -0.08, 0.03))], 0.016, 0.04, 'hose', 'AMM 75-00', COL_COOL)
    hose('Coolant hose radiator to pump', 'Большой круг: от радиатора к насосу', [rc + rot @ V((0.14, 0.08, 0.02)),
         V((0.25, -1.50, -0.08)), V((0.25, -1.42, 0.02)), V((0.25, -1.40, 0.25)), PUMP + V((0.065, -0.035, 0.0))],
         0.016, 0.04, 'hose', 'AMM 75-00', COL_COOL)
    hose('Coolant line tank to thermostat', 'Линия расширительного бачка к корпусу термостата', [EXP_TANK + V((-0.044, 0, -0.02)),
         THERMO + V((0.02, 0, -0.01))], 0.006, 0.01, 'hose', 'AMM 75-00', COL_COOL, clamps=False)
    hose('Radiator vent line', 'Дренажная линия из верхней точки радиатора в расширительный бачок',
         [rc + rot @ V((0.14, -0.09, 0.028)), V((0.34, -1.70, 0.05)), V((0.34, -1.56, 0.40)), EXP_TANK + V((0.044, 0.02, 0.0))],
         0.006, 0.03, 'hose', 'AMM 75-00', COL_COOL, clamps=False)
    # байпас через теплообменник отопления (он в слое вентиляции)
    p1, p2 = HX + V((0.05, -0.035, 0.035)), HX + V((-0.05, -0.035, -0.03))
    hose('Coolant hose engine to cabin heat exchanger', 'Байпасный контур: от двигателя к теплообменнику отопления кабины',
         [V((-0.117, -1.425, 0.10)), V((-0.16, -1.44, 0.09)), V((-0.23, -1.40, 0.04)), p1 - V((0, 0.03, 0)), p1],
         0.011, 0.03, 'hose', 'AMM 75-00, 21-00', COL_COOL)
    hose('Coolant hose cabin heat exchanger to pump', 'Байпасный контур: от теплообменника отопления под поддоном к патрубку насоса',
         [p2, p2 - V((0, 0.04, 0)), V((-0.29, -1.43, -0.10)), V((-0.10, -1.47, -0.15)), V((0.12, -1.47, -0.13)),
          V((0.235, -1.51, -0.085))], 0.011, 0.04, 'hose', 'AMM 75-00, 21-00', COL_COOL)
    n = P('Coolant nipple (bypass outlet)', 'Отбор охлаждающей жидкости на отопление с правого борта блока', 'alu', 'AMM 75-00', COL_COOL)
    cyl(n, V((-0.105, -1.425, 0.10)), V((-0.125, -1.425, 0.10)), 0.013, 0, segs=14)
    n.done()


# ── Масляные системы ──────────────────────────────────────────────────────

def oil():
    c = P('Engine oil cooler', 'Маслоохладитель под корпусом масляного фильтра: масло отдаёт тепло охлаждающей жидкости',
          'core', 'AMM 79-00, AFM 7.9.7', COL_OIL)
    OC = V((0.235, -1.520, 0.275))
    box(c, OC, (0.075, 0.075, 0.045), Matrix.Identity(3), 0, bevel=0.004)
    for k in range(6):
        box(c, OC + V((0, 0, -0.018 + k * 0.0072)), (0.078, 0.078, 0.002), Matrix.Identity(3), c.m(M['alu']))
    c.done()
    for dy, name in ((0.02, 'Coolant hose to oil cooler'), (-0.02, 'Coolant hose from oil cooler')):
        hose(name, 'Охлаждающая жидкость через маслоохладитель', [OC + V((-0.038, dy, -0.01)), OC + V((-0.05, dy, -0.03)),
             V((0.13, -1.52 + dy * 2, 0.20)), V((0.116, -1.52 + dy * 2, 0.20))], 0.008, 0.02, 'hose', 'AMM 79-00', COL_OIL, clamps=False)

    t = P('Engine oil filler with dipstick', 'Маслозаливная горловина на поддоне слева, в крышке — щуп; доступ через лючок в левой части верхнего капота',
          'alu', 'AMM 12-10, 72-00 п. 3', COL_OIL)
    pth = fillet([V((0.118, -1.55, 0.04)), V((0.15, -1.62, 0.20)), V((0.215, -1.70, 0.40)), V((0.235, -1.72, 0.48))], 0.08)
    sweep(t, pth, 0.012, 0, segs=14)
    cyl(t, V((0.235, -1.72, 0.48)), V((0.235, -1.72, 0.50)), 0.018, t.m(M['red']), segs=18)
    lib.torus(t, V((0.235, -1.72, 0.518)), (0, 1, 0), 0.014, 0.004, t.m(M['yellow']), segs=20, rsegs=8)
    t.done()

    B = V((-0.085, -1.58, 0.51))       # маслоотделитель — под крышкой форсунок (AMM 72-00 п. 3)
    # AMM 71-70: шланг 1 — от верхнего выхода маслоотделителя к переходнику дренажа (дополнительный выход
    # сапуна, на случай обмерзания), шланг 2 — от переходника к сборнику дренажей внизу перегородки
    AD = V((-0.37, -1.40, 0.095))
    hose('Crankcase breather hose', 'Шланг сапуна 1: от верхнего выхода маслоотделителя под крышкой форсунок к переходнику дренажа, '
         'на концах червячные хомуты', [B, B + V((-0.05, 0, 0.0)), V((-0.25, -1.58, 0.47)), V((-0.335, -1.55, 0.30)),
                                        V((-0.37, -1.45, 0.14)), AD + V((0, 0, 0.022))], 0.010, 0.05, 'hose', 'AMM 71-70 рис. 1', COL_OIL)
    bv = P('Breather bypass valve', 'Переходник дренажа сапуна: дополнительный выход сапуна — если выход шланга обмёрзнет, газы '
           'картера выходят через него', 'alu', 'AMM 71-70 2., 79-00', COL_OIL)
    cyl(bv, AD - V((0, 0, 0.02)), AD + V((0, 0, 0.02)), 0.016, 0, segs=16)
    cyl(bv, AD + V((0, 0.0, -0.004)), AD + V((0, 0.024, -0.004)), 0.0105, 0, segs=12)     # выход на шланг 2
    cyl(bv, AD + V((-0.014, 0, -0.006)), AD + V((-0.028, 0, -0.006)), 0.006, 0, segs=12)  # дополнительный выход
    bv.done()
    # сборник дренажей приклёпан к низу перегородки; из него — трубка вниз сквозь нижний капот
    DC = V((-0.19, -1.2185, -0.18))                   # полка вплотную к листу перегородки
    dc = P('Engine drain collector', 'Сборник дренажей моторного отсека: приклёпан внизу противопожарной перегородки, в него сходятся '
           'шланги сапуна; трубка выпуска — вниз сквозь нижний капот', 'steel', 'AMM 71-70 рис. 1', COL_OIL)
    box(dc, DC - V((0, 0.004, 0)), (0.05, 0.038, 0.042), Matrix.Identity(3), 0, bevel=0.004)
    box(dc, DC + V((0, 0.0165, 0)), (0.07, 0.003, 0.05), Matrix.Identity(3), 0)                 # полка к перегородке
    for dx in (-0.03, 0.03):
        for dz in (-0.018, 0.018):
            cyl(dc, DC + V((dx, 0.0135, dz)), DC + V((dx, 0.0155, dz)), 0.0028, 0, segs=8)       # заклёпки
    cyl(dc, DC - V((0, 0, 0.021)), DC - V((0, 0, 0.065)), 0.007, 0, segs=12)                     # выпуск вниз
    cyl(dc, DC + V((-0.012, -0.016, 0.021)), DC + V((-0.012, -0.016, 0.033)), 0.0105, 0, segs=12)  # приёмный штуцер
    dc.done()
    h2 = hose('Crankcase breather hose to drain collector', 'Шланг сапуна 2: от переходника дренажа вниз вдоль моторамы к сборнику '
              'дренажей на перегородке; к моторраме — резиновым хомутом-петлёй', [AD + V((0, 0.018, 0)), AD + V((-0.006, 0.05, 0.004)),
                                                                                 V((-0.378, -1.31, 0.118)), V((-0.33, -1.236, 0.11)),
                                                                                 V((-0.33, -1.236, -0.055)), V((-0.24, -1.238, -0.065)),
                                                                                 DC + V((-0.012, -0.016, 0.075)), DC + V((-0.012, -0.016, 0.036))],
              0.010, 0.05, 'hose', 'AMM 71-70 рис. 1', COL_OIL)
    # хомут-петля к нижней трубе моторамы: ближайшая к ней точка шланга
    segs_mf = [(V((-0.30, FIREWALL_Y, -0.095)), V((-0.170, GB_REAR - 0.04, 0.10))),     # нижняя труба к передней опоре
               (V((-0.24, FIREWALL_Y, 0.30)), V((-0.30, FIREWALL_Y, -0.095)))]           # труба вдоль перегородки
    def seg_near(q):
        best = None
        for a, b in segs_mf:
            t = max(0.0, min(1.0, (q - a).dot(b - a) / (b - a).length_squared))
            c = a + (b - a) * t
            if best is None or (q - c).length < (q - best).length:
                best = c
        return best
    k = min(range(2, len(h2) - 2), key=lambda i: (h2[i] - seg_near(h2[i])).length)
    q = h2[k]
    tng = (h2[k + 1] - h2[k - 1]).normalized()
    pc = P('Breather hose P-clamp (engine mount)', 'Хомут-петля с резиновой подушкой: держит шланг сапуна на нижней трубе моторамы',
           'steel', 'AMM 71-70 рис. 1', COL_OIL)
    lib.p_clamp(pc, q, tng, 0.010, seg_near(q) - q, 0, pc.m(M['rubber']))
    pc.done()

    hose('Turbocharger oil feed line', 'Подача масла к подшипникам турбокомпрессора', [V((-0.117, -1.53, 0.30)), V((-0.17, -1.50, 0.33)),
         TC + V((0, 0.0, 0.05)), TC + V((0, 0.0, 0.027))], 0.005, 0.02, 'oilhose', 'AMM 81, 79-00', COL_OIL, clamps=False)
    hose('Turbocharger oil return line', 'Слив масла из турбокомпрессора в картер', [TC - V((0, 0, 0.026)), TC - V((0, 0.005, 0.07)),
         V((-0.16, -1.47, 0.10)), V((-0.117, -1.48, 0.08))], 0.008, 0.02, 'oilhose', 'AMM 81, 79-00', COL_OIL, clamps=False)


# ── Проводка, датчики, экраны, мелочи ─────────────────────────────────────
# Всё, что видно при снятом капоте и чего не хватало в первой сборке:
# разводка жгута двигателя (сам жгут до перегородки — в слое электрики),
# свечи накаливания и форсунки с разъёмами, датчики EECU (AFM 7.10.2),
# тепловые экраны выпуска и турбины, рым-болты, болты крышки и поддона,
# колодка топливных штуцеров под шланги слоя топлива.

def arc_shell(p, c, r, y0, y1, a0, a1, t, mi, segs=18):
    """Изогнутый лист вокруг оси Y: радиус r, толщина t, дуга a0…a1 (рад, от +X к +Z)."""
    bm = p.bm
    rows = []
    for k in range(segs + 1):
        a = a0 + (a1 - a0) * k / segs
        d = V((math.cos(a), 0, math.sin(a)))
        rows.append([bm.verts.new(c + d * rr + V((0, y, 0))) for rr in (r, r + t) for y in (y0, y1)])
    for k in range(segs):
        A, B = rows[k], rows[k + 1]
        for i, j in ((0, 1), (3, 2), (1, 3), (2, 0)):        # внутр., наружн., торцы по Y
            f = bm.faces.new((A[i], A[j], B[j], B[i]))
            f.material_index = mi
            f.smooth = True
    for R_, flip in ((rows[0], True), (rows[-1], False)):
        f = bm.faces.new((R_[0], R_[1], R_[3], R_[2]) if not flip else (R_[2], R_[3], R_[1], R_[0]))
        f.material_index = mi


def wire(p, pts, r, bend, mi):
    sweep(p, fillet([V(q) for q in pts], bend), r, mi, segs=8)


def details():
    # колодка жгута на двигателе — ответная часть разъёма жгута из слоя электрики
    k = P('Engine harness connector (engine side)', 'Разъём жгута двигателя за головкой блока справа: отсюда провода расходятся к форсункам, свечам накаливания и датчикам EECU',
          'conn', 'AMM 76-00, AFM 7.10.2')
    H0 = HARNESS_END
    box(k, H0, (0.03, 0.036, 0.026), Matrix.Identity(3), 0, bevel=0.003)
    box(k, H0 + V((-0.018, 0, 0)), (0.008, 0.028, 0.02), Matrix.Identity(3), k.m(M['steel']), bevel=0.002)   # защёлка
    k.done()

    # свечи накаливания: жгут по правому борту головки, отводы к каждой свече
    g = P('Glow plug harness', 'Провода свечей накаливания: общий жгут по правому борту головки, отвод к каждой свече; свечами управляет EECU',
          'loom', 'AFM 7.10.2, AMM 76-00')
    GL = [V((-0.142, CYL_Y[0] - 0.02, 0.472)), V((-0.142, CYL_Y[-1] + 0.02, 0.472))]
    wire(g, [H0 + V((-0.006, -0.018, 0.004)), H0 + V((-0.012, -0.035, 0.03)), V((-0.142, CYL_Y[-1] + 0.03, 0.472)), GL[0]], 0.0065, 0.03, 0)
    for y in CYL_Y:
        tip = V((-0.126, y + 0.03, GLOW_Z + 0.004))
        wire(g, [V((-0.142, y + 0.03, 0.472)), V((-0.136, y + 0.03, 0.466)), tip], 0.0022, 0.006, 0)
        cyl(g, tip, tip + V((-0.008, 0, 0.0)), 0.004, g.m(M['conn']), segs=10)            # наконечник
    g.done()

    # форсунки: разъём на каждой, жгут по левому краю крышки головки
    j = P('Injector harness', 'Провода форсунок: жгут обходит головку сзади и идёт по крышке головки левее форсунок, у каждой форсунки — разъём',
          'loom', 'AFM 7.10.2, AMM 73-00')
    # к рампе справа не подойти (над ней капот), поэтому жгут обходит головку сзади
    X_IJ = 0.048
    Y_X = Y_REAR + 0.042                     # за крышкой привода ГРМ
    wire(j, [H0 + V((0.012, 0.004, 0.012)), V((-0.10, Y_X, 0.465)), V((0.03, Y_X, 0.465)), V((X_IJ, Y_X - 0.004, 0.475)),
             V((X_IJ, Y_REAR + 0.01, 0.548)), V((X_IJ, CYL_Y[0] + 0.012, 0.548))], 0.006, 0.02, 0)
    for y in CYL_Y:
        c = V((0.017, y, Z_COVER + 0.013))
        box(j, c, (0.014, 0.02, 0.014), Matrix.Identity(3), j.m(M['conn']), bevel=0.002)
        wire(j, [c + V((0.007, 0, 0)), c + V((0.016, 0.004, 0.0)), V((X_IJ - 0.004, max(y, CYL_Y[0] + 0.012), 0.548))], 0.0022, 0.006, 0)
    for y in (CYL_Y[0] + 0.045, CYL_Y[2] + 0.045):                                       # держатели жгута на крышке
        box(j, V((X_IJ, y, 0.54)), (0.018, 0.01, 0.006), Matrix.Identity(3), j.m(M['conn']))
    j.done()

    # датчики EECU и их провода
    d = P('Rail pressure sensor', 'Датчик давления в топливной рампе на переднем торце рампы (вход EECU)', 'sensor', 'AFM 7.10.2')
    c = V((-0.070, Y_FRONT + 0.03, Z_COVER + 0.022))
    cyl(d, c, c - V((0, 0.02, 0)), 0.009, 0, segs=14)
    hexa(d, c - V((0, 0.004, 0)), c - V((0, 0.010, 0)), 0.018, d.m(M['steel']))
    cyl(d, c - V((0, 0.02, 0)), c - V((0, 0.032, 0)), 0.008, d.m(M['conn']), segs=12)
    d.done()
    w = P('Rail pressure sensor wire', 'Провод датчика давления в рампе к жгуту свечей', 'loom', 'AFM 7.10.2')
    wire(w, [c - V((0, 0.032, 0)), c - V((0, 0.036, 0.012)), V((-0.115, CYL_Y[0] - 0.035, 0.50)), GL[0]], 0.0025, 0.012, 0)
    w.done()

    d = P('Camshaft position sensors', 'Два датчика положения распределительного вала на заднем торце головки (для ECU A и ECU B)', 'sensor', 'AFM 7.10.2')
    cams = [V((-0.060, Y_REAR + 0.028, 0.425)), V((-0.035, Y_REAR + 0.028, 0.425))]
    for q in cams:
        cyl(d, q, q + V((0, 0.02, 0)), 0.008, 0, segs=12)
        box(d, q + V((0, 0.004, 0)), (0.024, 0.004, 0.012), Matrix.Identity(3), d.m(M['alu']))
        cyl(d, q + V((0, 0.02, 0)), q + V((0, 0.03, 0)), 0.007, d.m(M['conn']), segs=12)
    d.done()
    d = P('Crankshaft position sensors', 'Два датчика оборотов коленчатого вала у заднего торца, справа внизу', 'sensor', 'AFM 7.10.2')
    cranks = [V((-0.085, Y_REAR + 0.028, 0.060)), V((-0.065, Y_REAR + 0.028, 0.045))]
    for q in cranks:
        cyl(d, q, q + V((0, 0.012, 0)), 0.007, 0, segs=12)
        cyl(d, q + V((0, 0.012, 0)), q + V((0, 0.02, 0)), 0.006, d.m(M['conn']), segs=12)
    d.done()
    w = P('Timing sensor wires', 'Провода датчиков распредвала и коленвала по заднему торцу к жгуту свечей', 'loom', 'AFM 7.10.2')
    for q in cams:
        wire(w, [q + V((0, 0.03, 0)), q + V((-0.008, 0.036, 0.0)), H0 + V((0.015, 0.0, 0.0))], 0.0022, 0.01, 0)
    for q in cranks:
        wire(w, [q + V((0, 0.02, 0)), q + V((-0.015, 0.03, 0.015)), V((-0.116, Y_REAR + 0.065, 0.12)), V((-0.116, Y_REAR + 0.065, 0.37)),
                 H0 + V((0.004, 0.0, -0.013))], 0.0022, 0.012, 0)
    w.done()

    d = P('Coolant temperature sensor', 'Датчик температуры охлаждающей жидкости в корпусе термостата (вход EECU)', 'sensor', 'AFM 7.10.2, AMM 75-00')
    q = THERMO + V((-0.008, 0.008, 0.02))
    hexa(d, q, q + V((0, 0, 0.006)), 0.016, d.m(M['steel']))
    cyl(d, q + V((0, 0, 0.006)), q + V((0, 0, 0.022)), 0.007, d.m(M['conn']), segs=12)
    wire(d, [q + V((0, 0, 0.022)), q + V((0, 0, 0.03)), V((X_IJ, THERMO.y + 0.01, 0.548))], 0.0022, 0.01, d.m(M['loom']))
    d.done()
    d = P('Oil pressure and temperature sensor', 'Датчик давления и температуры масла на приливе корпуса масляного фильтра (вход EECU)', 'sensor', 'AFM 7.10.2')
    q = V((0.14, -1.52, 0.32))                       # на приливе корпуса фильтра
    hexa(d, q, q + V((0, 0, 0.006)), 0.016, d.m(M['steel']))
    cyl(d, q + V((0, 0, 0.006)), q + V((0, 0, 0.026)), 0.008, 0, segs=12)
    cyl(d, q + V((0, 0, 0.026)), q + V((0, 0, 0.036)), 0.0075, d.m(M['conn']), segs=12)
    d.done()

    # тепловые экраны
    e = P('Exhaust manifold heat shield', 'Тепловой экран выпускного коллектора: закрывает коллектор сверху и снаружи', 'shield', 'AMM 78-00')
    y0, y1 = CYL_Y[0] - 0.035, CYL_Y[-1] + 0.02
    box(e, V((-0.160, (y0 + y1) / 2, 0.447)), (0.070, y1 - y0, 0.002), Matrix.Identity(3), 0)
    y2 = CYL_Y[-1] - 0.01                                                        # сзади коллектор уходит наружу к турбине
    box(e, V((-0.196, (y0 + y2) / 2, 0.410)), (0.002, y2 - y0, 0.074), Matrix.Identity(3), 0)
    for y in CYL_Y:                                                                  # выштамповки жёсткости
        box(e, V((-0.160, y, 0.4485)), (0.05, 0.008, 0.002), Matrix.Identity(3), 0)
    for y in (y0 + 0.02, y1 - 0.02):
        bolt(e, V((-0.160, y, 0.448)), (0, 0, 1), e.m(M['steel']), af=0.008, h=0.004)
    e.done()
    t = P('Turbocharger heat shield', 'Тепловой экран над корпусом турбины', 'shield', 'AMM 81-00')
    arc_shell(t, TC, 0.084, 0.012, 0.070, math.radians(115), math.radians(168), 0.002, 0)   # снаружи сверху: коллектор входит сверху
    for a in (math.radians(128), math.radians(158)):
        q = TC + V((math.cos(a) * 0.087, 0.041, math.sin(a) * 0.087))
        bolt(t, q, (math.cos(a), 0, math.sin(a)), t.m(M['steel']), af=0.008, h=0.004)
    t.done()

    # рым-болты для подъёма двигателя
    r = P('Engine lifting eyes', 'Рым-болты на головке: за них двигатель поднимают при снятии и установке', 'steel', 'AMM 71-00')
    for q, sx in ((V((0.098, Y_FRONT + 0.035, 0.49)), 1), (V((-0.098, Y_REAR - 0.06, 0.49)), -1)):
        box(r, q, (0.004, 0.034, 0.05), Matrix.Identity(3), 0, bevel=0.001)
        torus(r, q + V((0, 0, 0.03)), (1, 0, 0), 0.012, 0.0035, 0, segs=18, rsegs=8)
        bolt(r, q + V((sx * 0.002, 0, -0.012)), (sx, 0, 0), 0, af=0.010, h=0.005)
    r.done()

    # болты по краям крышки головки и по фланцу поддона
    b = P('Cylinder head cover and oil sump bolts', 'Болты крышки головки блока и фланца масляного поддона', 'steel', 'AMM 72-00')
    for y in [CYL_Y[0] - 0.03] + [(CYL_Y[i] + CYL_Y[i + 1]) / 2 for i in range(3)] + [CYL_Y[-1] + 0.03]:
        for sx in (1, -1):
            bolt(b, V((sx * 0.0895, y, Z_HEAD + 0.012)), (sx, 0, 0), 0, af=0.008, h=0.004)
    for k in range(9):
        y = Y_FRONT + 0.03 + k * (Y_REAR - Y_FRONT - 0.06) / 8
        for sx in (1, -1):
            bolt(b, V((sx * 0.112, y, Z_PAN - 0.006)), (0, 0, -1), 0, af=0.008, h=0.004)
    b.done()

    # табличка двигателя
    n = P('Engine data plate', 'Табличка двигателя на левом борту блока: тип E4-A, серийный номер', 'plate', 'AMM 72-00')
    box(n, V((0.118, -1.615, 0.175)), (0.002, 0.07, 0.034), Matrix.Identity(3), 0, bevel=0.0005)
    box(n, V((0.1192, -1.615, 0.187)), (0.0008, 0.066, 0.006), Matrix.Identity(3), n.m(M['red']))
    n.done()

    # колодка штуцеров низкого давления: сюда приходят шланги подачи и обратки из слоя топлива
    f = P('Low-pressure fuel connection block', 'Колодка штуцеров топлива на левом борту блока: вход подачи к ТНВД и выход обратки',
          'alu', 'AFM 7.9.4, AMM 73-00')
    fc = (FUEL_IN + FUEL_RET) / 2
    box(f, V((0.121, fc.y, fc.z)), (0.012, 0.064, 0.056), Matrix.Identity(3), 0, bevel=0.003)
    for q in (FUEL_IN, FUEL_RET):
        hexa(f, V((0.127, q.y, q.z)), V((0.137, q.y, q.z)), 0.014, f.m(M['steel']))
    f.done()

    # металлизация: блок — моторама
    m = P('Engine bonding strap', 'Перемычка металлизации двигатель — моторама', 'steel', 'AMM 71-00, 24-00')
    lib.bonding_strap(m, V((0.117, Y_REAR - 0.06, 0.12)), V((0.150, Y_REAR - 0.03, 0.150)), 0)
    m.done()


gearbox()
propeller_hub()
block()
intake_fuel_oil()
accessories()
turbo_exhaust()
mount()
induction()
cooling()
oil()
details()

# противопожарная перегородка — в слое силового набора фюзеляжа (structure.py, AMM 53-10 2.B);
# на страницах систем она подключается контекстом

# проверка: детали не выходят за капоты
LAYERS = [(COL, 'da40-engine-raw.glb'), (COL_IND, 'da40-induction-raw.glb'), (COL_COOL, 'da40-cooling-raw.glb'), (COL_OIL, 'da40-oil-raw.glb')]
worst = []
for col, _ in LAYERS:
    for o in col.all_objects:
        if o.type != 'MESH' or o.name == 'Firewall':
            continue
        pen, at = 0.0, None
        for v in o.data.vertices:
            q = o.matrix_world @ v.co
            if q.y < -1.935:          # фланец и ступица винта — внутри кока, перед капотом
                continue
            hit = R.shell.find_nearest(q, 0.5)
            if hit[0] is not None and (q - hit[0]).dot(hit[1]) > 0:
                loc = R.hit(q, (q - V((0, q.y, 0.15))).normalized(), 2.0)[0]
                if loc is None and hit[3] > pen:
                    pen, at = hit[3], tuple(round(c, 3) for c in q)
        if pen > 0.004:
            worst.append((round(pen * 1000), o.name, at))
print('COWL', sorted(worst, reverse=True)[:12])

if os.environ.get('CHECK'):
    # пересечения деталей между собой (для отладки компоновки)
    from mathutils.bvhtree import BVHTree
    objs = [o for col, _ in LAYERS for o in col.all_objects if o.type == 'MESH']
    objs += [bpy.data.objects[n] for n in ('Cabin heat exchanger',) if n in bpy.data.objects]
    trees = {o.name: ref._bvh([o]) for o in objs}
    names = list(trees)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            n = len(trees[a].overlap(trees[b]))
            if n > 6:
                print(f'OVERLAP {n:4d}  {a}  ×  {b}')

for col, fn in LAYERS:
    dup = [o.name for o in col.all_objects if '.0' in o.name[-4:]]
    assert not dup, dup
    out = os.path.join(OUT_DIR, fn)
    size = ref.export(col, out, R.lift)
    with open(os.path.splitext(out)[0] + '.labels.json', 'w') as fh:
        json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, fh, ensure_ascii=False, indent=1)
    print(f'LAYER_OK {out} {size / 1e6:.2f} MB, parts {len([o for o in col.all_objects if o.type == "MESH"])}')
