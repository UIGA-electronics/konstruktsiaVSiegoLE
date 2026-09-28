"""Приборное и радиооборудование DA 40 NG — два слоя сайта вместо «Авионики».

    python3 tools/da40/avionics.py [out_dir]      # CHECK=1 — зазоры и видимость

Слои: da40-instruments-raw.glb (приборное оборудование: G1000 без радиоблоков,
автопилот GFC 700) и da40-radio-raw.glb (радиостанции, навигационные приёмники,
ответчик, дальномер, АРК, грозопеленгатор, аварийный маяк, антенны).

AMM 6.02.15 Rev. 3: 22-10 (GFC 700: рулевые машины), 23-10 (связь, рис. 1 —
антенны), 23-50 (аудиопанель), 25-60 (ELT ME406), 31-40 (G1000: где стоят блоки,
рис. 5–10), 34-10 (датчик температуры), 34-41 (грозопеленгатор WX-500),
34-50 (антенны ответчика, DME, GPS, маркера, АРК; кабели RG 142 и RG 400),
51-80 (металлизация: схема с антеннами).

Где что (и чем отличалось в исходнике):
- дисплеи GDU 1040 — корпус 300 × 196 × 96 мм за доской (в исходнике 262 мм
  в глубину); аудиопанель GMA 1347 между ними;
- на полке приборной доски — GDC 74A на своей стойке (к нему подведены ПВД и
  статика слоя pitot) и GEA 71, который опускается в стойку сверху;
- стойка авионики за рамой багажного отсека: короб с разъёмами, на нём в ряд
  по полёту GTX 33 и два GIA 63W стоймя (в исходнике лежали на полке);
  рядом — GRS 77 на кронштейне из стеклопластика;
- рулевые машины GSA 81: крена — за задним главным шпангоутом справа, трос
  на тяге элерона; тангажа — за рамой багажного отсека, трос на тяге руля
  высоты; триммера — под креслом второго пилота, цепь и карданный вал к
  штурвальчику триммера (в исходнике их не было);
- аварийный маяк — под задним багажным отсеком, антенна на кронштейне над
  ним внутри фюзеляжа (в исходнике штырь торчал снаружи на хвосте);
- DME и АРК с антеннами, WX-500 с антенной NY-163 на стабилизаторе, второй
  GPS — добавлены; антенны COM 1, COM 2, GPS и ответчика MSFS заменены
  построенными на тех же местах (replaced.json).
Кабели прокладывает route.Router (cabin.setup).
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector as V  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

import lib  # noqa: E402
import ref  # noqa: E402
import cabin  # noqa: E402
from lib import Part, basis, box, cyl, fillet, sweep, ring_tube  # noqa: E402

OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
I3 = Matrix.Identity(3)

ref.open_source()
R = ref.Ref()
KEEP = ('Engine power lever sensor (ECU reads the POWER lever)', 'POWER lever → power lever sensor (push rod)',
        'Power lever sensor → EECU (through the firewall)')
COL_I = lib.collection('DA40 Instrument equipment (AMM 22, 31-40, 34)')
COL_R = lib.collection('DA40 Radio equipment (AMM 23, 25-60, 34-50)')
for n in KEEP:                                    # датчик РУД — остаётся, переезжает в приборный слой
    o = bpy.data.objects.get(n)
    if o:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        COL_I.objects.link(o)
ref.drop_collection('Avionics & antennas')
ref.drop_collection('Electrical system')
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'replaced.json')) as f:
    GONE = set(json.load(f))


def _miny(o):
    return min((o.matrix_world @ V(c)).y for c in o.bound_box)


# что пересобирается после этого слоя и уступает место: шланги ПВД и статики (новые штуцеры GDC 74A
# на торце, рупор сигнализатора ниже PFD) и кабели электрики (реле резервной батареи EECU — на полку)
ELEC_CABLES = ('Battery (', 'External power cable', 'Starter cable', 'Main wiring harness', 'Alternator output', 'Alternator cable',
               'Alternator field', 'Alternator regulator control', 'ECU backup battery cable', 'ECU backup battery ground',
               'ECU backup relay', 'Engine harness', 'Cabin light feed', 'Wing lighting harness', 'Light feed')
LATER = {'pitot': lambda o: 'hose' in o.name.lower() or o.name.startswith(('Stall warning horn', 'GDC 74A pneumatic port')),
         'electrical': lambda o: o.name.startswith(ELEC_CABLES)}
TRIM, SYS, RT = cabin.setup(R, ('instruments', 'radio'), step=0.015, extra=GONE, skip=LATER)
CHECKS = []

M = dict(
    lru=lib.mat('DA40 Garmin LRU housing (black)', (0.055, 0.056, 0.06), 0.25, 0.45, ru='корпус блока, чёрная окраска'),
    label=lib.mat('DA40 unit label plate', (0.78, 0.79, 0.77), 0.0, 0.5, ru='табличка блока'),
    alu=lib.mat('DA40 aluminium', (0.80, 0.81, 0.83), 1.0, 0.32, ru='алюминиевый сплав'),
    steel=lib.mat('DA40 stainless steel', (0.62, 0.63, 0.65), 1.0, 0.28, ru='нержавеющая сталь'),
    black=lib.mat('DA40 black anodised', (0.05, 0.05, 0.06), 0.6, 0.4, ru='алюминий, чёрное анодирование'),
    dsub=lib.mat('DA40 D-sub connector backshell', (0.56, 0.57, 0.59), 0.9, 0.35, ru='разъём, металлический кожух'),
    conn=lib.mat('DA40 circular connector', (0.55, 0.52, 0.30), 0.8, 0.4, ru='круглый разъём'),
    bnc=lib.mat('DA40 coaxial connector (nickel)', (0.74, 0.74, 0.76), 1.0, 0.25, ru='коаксиальный разъём, никель'),
    rg400=lib.mat('DA40 coaxial cable RG 400 (white)', (0.90, 0.90, 0.87), 0.0, 0.45, ru='коаксиальный кабель RG 400'),
    rg142=lib.mat('DA40 coaxial cable RG 142 (brown)', (0.55, 0.38, 0.24), 0.0, 0.45, ru='коаксиальный кабель RG 142'),
    harness=lib.mat('DA40 wiring harness (white, laced)', (0.86, 0.86, 0.83), 0.0, 0.7, ru='жгут проводов в оплётке'),
    thin=lib.mat('DA40 signal wire (white)', (0.90, 0.90, 0.88), 0.0, 0.6, ru='провод'),
    shield=lib.mat('DA40 shielded data cable (grey)', (0.35, 0.36, 0.38), 0.0, 0.55, ru='экранированный кабель данных'),
    white=lib.mat('DA40 antenna (white paint)', (0.93, 0.93, 0.91), 0.0, 0.35, ru='антенна, белая окраска'),
    whip=lib.mat('DA40 antenna whip (black)', (0.035, 0.035, 0.04), 0.0, 0.45, ru='штырь антенны, стеклопластик'),
    gfrp=lib.mat('DA40 GFRP bracket', (0.70, 0.69, 0.60), 0.0, 0.6, ru='стеклопластик'),
    fan=lib.mat('DA40 cooling fan (black plastic)', (0.04, 0.04, 0.045), 0.0, 0.55, ru='вентилятор'),
    yellow=lib.mat('DA40 ELT label (yellow)', (0.95, 0.72, 0.05), 0.0, 0.45, ru='табличка ELT'),
    strap=lib.mat('DA40 hook-and-loop strap', (0.12, 0.12, 0.13), 0.0, 0.85, ru='лента-липучка'),
    red=lib.mat('DA40 red cover', (0.72, 0.07, 0.06), 0.0, 0.5, ru='красный колпачок'),
    duct=lib.mat('DA40 flexible cooling duct (black)', (0.07, 0.07, 0.075), 0.0, 0.75, ru='гибкий воздуховод'),
    grey=lib.mat('DA40 radio unit housing (dark grey)', (0.20, 0.21, 0.22), 0.4, 0.45, ru='корпус блока, серая окраска'),
)


# ── общие детали ──────────────────────────────────────────────────────────

def P(name, ru, m, doc=None, col=None):
    return Part(name, ru, M[m], col or COL_I, True, doc)


def Rm(x, y, z):
    """Поворот по трём осям-столбцам (x, y, z — единичные векторы)."""
    return Matrix((V(x).normalized(), V(y).normalized(), V(z).normalized())).transposed()


def slab(p, pts, z0, z1, mi=0):
    """Плоская деталь по контуру в плане (x, y), от z0 до z1."""
    bm = p.bm
    lo = [bm.verts.new(V((x, y, z0))) for x, y in pts]
    hi = [bm.verts.new(V((x, y, z1))) for x, y in pts]
    n = len(pts)
    for f in (bm.faces.new(lo[::-1]), bm.faces.new(hi)):
        f.material_index = mi
    for i in range(n):
        f = bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]))
        f.material_index = mi


def rivets(p, a, b, n, nrm, mi, d=0.004):
    for k in range(n):
        lib.screw(p, a + (b - a) * (k / max(1, n - 1)), nrm, d, mi)


def dsub(p, c, face, width, mi=None):
    """Разъём D-sub с кожухом на грани блока (face — наружная нормаль)."""
    face = V(face).normalized()
    up = V((0, 0, 1)) if abs(face.z) < 0.9 else V((0, 1, 0))
    s = face.cross(up).normalized()
    Rr = Rm(s, up, face)
    mi = p.m(M['dsub']) if mi is None else mi
    box(p, c + face * 0.006, (width, 0.016, 0.012), Rr, mi, bevel=0.002)
    box(p, c + face * 0.016, (width * 0.7, 0.012, 0.010), Rr, mi, bevel=0.002)
    for sg in (-1, 1):
        lib.cyl(p, c + s * sg * (width / 2 + 0.004), c + s * sg * (width / 2 + 0.004) + face * 0.014, 0.002, mi, segs=8)
    return c + face * 0.022


def bnc(p, c, d, mi=None):
    d = V(d).normalized()
    mi = p.m(M['bnc']) if mi is None else mi
    lib.cyl(p, c, c + d * 0.012, 0.0055, mi, segs=12)
    lib.hexa(p, c + d * 0.004, c + d * 0.009, 0.013, mi)
    return c + d * 0.012


def lru(name, ru, c, size, R_=I3, doc=None, col=None, mat='lru', labels=1, top=(0, 0, 1)):
    """Корпус блока: скруглённая коробка, окантовка граней, таблички."""
    p = P(name, ru, mat, doc, col)
    sx, sy, sz = size
    box(p, c, size, R_, 0, bevel=0.003)
    t = R_ @ V(top)
    # таблички на «верхней» грани (у блоков в стойке это лицевая сторона)
    ax = [R_ @ V(e) for e in ((1, 0, 0), (0, 1, 0), (0, 0, 1))]
    k = max(range(3), key=lambda i: abs(ax[i].dot(t)))
    half = (sx, sy, sz)[k] / 2
    others = [i for i in range(3) if i != k]
    a, b = others
    la, lb = (sx, sy, sz)[a], (sx, sy, sz)[b]
    for j in range(labels):
        off = ax[b] * (lb * (j + 0.5) / labels - lb / 2)
        q = c + t * (half + 0.0005) + off
        Rl = Rm(ax[a], ax[b], t)
        box(p, q, (la * 0.62, lb / labels * 0.55, 0.001), Rl, p.m(M['label']))
    return p


def cable(name, ru, pts, r, mat, doc=None, col=None, bend=None, ends=None):
    p = P(name, ru, mat, doc, col)
    path = fillet(pts, bend or max(0.015, r * 6))
    Pp, T = sweep(p, path, r, 0, segs=10 if r < 0.004 else 14)
    if ends:
        for q, t in ((Pp[0], -T[0]), (Pp[-1], T[-1])):
            if ends == 'bnc':
                bnc(p, q - t * 0.012, t)
            else:
                lib.cyl(p, q - t * 0.004, q + t * 0.012, r * 1.9, p.m(M[ends]), segs=12)
    if mat == 'harness':
        L = lib.path_len(path)
        for k in range(1, int(L / 0.08)):
            q, t = lib.along(path, k * 0.08)
            ring_tube(p, q, t, r + 0.0012, r - 0.0005, 0.003, p.m(M['black']), segs=12)
    p.done()
    CHECKS.append((name, path, r))
    refresh()
    return path


RESERVED = lib.collection('reserved (not exported)')


def refresh():
    RT.set_extra(ref._bvh([o for c in (COL_I, COL_R, RESERVED) for o in c.all_objects if o.type == 'MESH']))


_CACHE_F = os.environ.get('ROUTE_CACHE')
_CACHE = json.load(open(_CACHE_F)) if _CACHE_F and os.path.exists(_CACHE_F) else {}


def route(a, da, b, db, r, lo, hi, stub=0.02, relax=(), step=None, hidden=True):
    a, b, da, db = V(a), V(b), V(da).normalized(), V(db).normalized()
    key = json.dumps([[round(c, 4) for c in v] for v in (a, da, b, db, lo, hi)] + [r, stub, step, hidden])
    if key in _CACHE:                      # ROUTE_CACHE — для отладки: трасса та же, пока не менялось окружение
        return [V(q) for q in _CACHE[key]]
    pts = _route(a, da, b, db, r, lo, hi, stub, relax, step, hidden)
    if _CACHE_F:
        _CACHE[key] = [list(q) for q in pts]
        json.dump(_CACHE, open(_CACHE_F, 'w'))
    return pts


def _route(a, da, b, db, r, lo, hi, stub, relax, step, hidden):
    a0, b0 = a + da * stub, b - db * stub
    old = RT.step
    RT.step = step or old
    try:
        for hid in ((True, False) if hidden else (False,)):
            mid = RT.route(a0, b0, r, lo, hi, hidden=hid, relax=list(relax) + [(a, stub + 0.03), (b, stub + 0.03)],
                           max_nodes=900000)
            if mid:
                if hidden and not hid:
                    print(f'ROUTE visible {tuple(round(v, 3) for v in a)} → {tuple(round(v, 3) for v in b)}')
                return [a] + mid + [b]
    finally:
        RT.step = old
    raise SystemExit(f'нет трассы {tuple(round(v, 3) for v in a)} → {tuple(round(v, 3) for v in b)}')


# ── поиск места под блок ──────────────────────────────────────────────────

def _box_bvh(c, size, R_, grow):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    vs = [V(c) + R_ @ V((v.co.x * (size[0] + 2 * grow), v.co.y * (size[1] + 2 * grow), v.co.z * (size[2] + 2 * grow)))
          for v in bm.verts]
    polys = [[v.index for v in f.verts] for f in bm.faces]
    bm.free()
    return BVHTree.FromPolygons(vs, polys)


def clear(c, size, R_=I3, margin=0.006, hidden=True):
    """Свободен ли объём под блок: не пересекает обшивку, отделку, соседние системы и уже
    поставленные детали; внутри нет чужих деталей; не виден из кабины."""
    c = V(c)
    bb = _box_bvh(c, size, R_, margin)
    obst = [R.shell, TRIM, SYS] + ([RT.extra] if RT.extra else [])
    if any(bb.overlap(o) for o in obst):
        return False
    n = 3
    for i in range(n):
        for j in range(n):
            for k in range(n):
                loc = V(((i + 0.5) / n - 0.5, (j + 0.5) / n - 0.5, (k + 0.5) / n - 0.5))
                q = c + R_ @ V((loc.x * size[0], loc.y * size[1], loc.z * size[2]))
                db = min(size[0] / 2 - abs(loc.x * size[0]), size[1] / 2 - abs(loc.y * size[1]), size[2] / 2 - abs(loc.z * size[2]))
                for o in obst:
                    h = o.find_nearest(q, db + margin)
                    if h[0] is not None:
                        return False
    if hidden:
        for sx in (-0.5, 0.5):
            for sy in (-0.5, 0.5):
                for sz in (-0.5, 0.5):
                    if RT.seen(c + R_ @ V((sx * size[0], sy * size[1], sz * size[2])), 0.0):
                        return False
    return True


def place(tag, want, size, lo, hi, R_=I3, step=0.01, margin=0.006, hidden=True):
    """Ближайшее к want свободное место в коробке lo..hi (сетка step)."""
    want = V(want)
    if clear(want, size, R_, margin, hidden):
        print(f'PLACE {tag}: as wanted {tuple(round(v, 3) for v in want)}')
        return want
    lo, hi = V(lo), V(hi)
    cand = []
    nx, ny, nz = (max(1, int((hi[i] - lo[i]) / step) + 1) for i in range(3))
    for i in range(nx):
        for j in range(ny):
            for k in range(nz):
                q = V((lo.x + i * step, lo.y + j * step, lo.z + k * step))
                cand.append(((q - want).length, q))
    cand.sort(key=lambda t: t[0])
    for d, q in cand:
        if clear(q, size, R_, margin, hidden):
            print(f'PLACE {tag}: {tuple(round(v, 3) for v in q)} (moved {d * 1000:.0f} mm)')
            return q
    raise SystemExit(f'нет места для {tag}')


# ════════════════════════════════════════════════════════════════════════
# ПРИБОРНОЕ ОБОРУДОВАНИЕ
# ════════════════════════════════════════════════════════════════════════

PANEL_Y = -0.712                     # за лицевой панелью доски (надписи MSFS до y −0,706; экраны на −0,68)
DISP = {'PFD': 0.2315, 'MFD': -0.1335}
DISP_Z = 0.466
GDU = (0.300, 0.096, 0.196)          # GDU 104X: 11,80 × 7,70 × 3,77 дюйма
GMA_X, GMA, GMA_Y = 0.049, (0.044, 0.170, 0.190), -0.748   # за рамкой аудиопанели (она до y −0,745)
SHELF_Z = 0.296                      # полка — над нижней панелью доски, перед корпусами дисплеев
SHELF_Y = -0.895
GDC = (0.245, 0.079, 0.082)          # GDC 74A: 9,64 × 3,10 × 3,23 дюйма, поперёк полки
GDC_C = V((0.2175, -0.8725, SHELF_Z + 0.004 + GDC[2] / 2))
GDC_PORT = V((GDC_C.x + GDC[0] / 2, GDC_C.y, 0.335))  # штуцеры ПВД и статики на левом торце (pitot.py)
GEA = (0.205, 0.048, 0.170)
GEA_C = V((-0.1675, SHELF_Y, SHELF_Z + 0.006 + GEA[2] / 2))
FRAME_Y = 2.265                      # рама багажного отсека (направляющая тяги руля высоты)
ECU_RELAY = V((0.0, -0.848, SHELF_Z + 0.020))   # реле резервной батареи EECU на полке (electrical.py)
HANDWHEEL = V((0.0, -0.2005, 0.153)) # ось штурвальчика триммера (MSFS HANDLING_Wheel_ElevatorTrim_Pitch)


def displays():
    ports = {}
    for tag, x in DISP.items():
        c = V((x, PANEL_Y - GDU[1] / 2, DISP_Z))
        ru = ('Основной пилотажный дисплей PFD' if tag == 'PFD' else 'Многофункциональный дисплей MFD') + \
            ' GDU 1040: корпус за приборной доской, крепится к ней четырьмя поворотными замками'
        p = P(f'GDU 1040 {tag} housing', ru, 'lru', 'AMM 31-40 рис. 5')
        box(p, c, GDU, I3, 0, bevel=0.004)
        back = c.y - GDU[1] / 2
        # рёбра охлаждения и патрубок подвода воздуха на задней стенке
        for k in range(7):
            box(p, V((x - 0.10 + k * 0.022, back - 0.003, DISP_Z + 0.03)), (0.004, 0.006, 0.10), I3, 0)
        conns = [dsub(p, V((x + dx, back, DISP_Z - 0.06)), (0, -1, 0), 0.045) for dx in (-0.05, 0.02)]
        p.done()
        # вентилятор охлаждения на задней стенке, со стороны ручек NAV (к краю доски)
        fc = V((x + (0.09 if tag == 'PFD' else -0.09), back - 0.014, DISP_Z + 0.05))
        f = P(f'{tag} cooling fan', f'Вентилятор охлаждения {tag} на задней стенке корпуса дисплея', 'fan', 'AMM 92 (Equipment Cooling)')
        box(f, fc, (0.060, 0.026, 0.060), I3, 0, bevel=0.004)
        ring_tube(f, fc - V((0, 0.014, 0)), V((0, 1, 0)), 0.027, 0.024, 0.003, f.m(M['black']), segs=24)
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            box(f, fc - V((0, 0.015, 0)) + V((math.cos(a), 0, math.sin(a))) * 0.012, (0.024, 0.002, 0.003),
                Rm((math.cos(a), 0, math.sin(a)), (0, 1, 0), (-math.sin(a), 0, math.cos(a))), f.m(M['black']))
        f.done()
        ports[tag] = dict(conns=conns)
    # аудиопанель — в радиослое
    c = V((GMA_X, GMA_Y - GMA[1] / 2, DISP_Z))
    p = P('GMA 1347 audio panel housing', 'Аудиопанель GMA 1347 между дисплеями: переговорное устройство, выбор радиостанций и навигационных приёмников на прослушивание, приёмник маркерных маяков, переключатель резервного режима дисплеев',
          'lru', 'AMM 23-50', COL_R)
    box(p, c, GMA, I3, 0, bevel=0.003)
    gma_conn = dsub(p, V((GMA_X, c.y - GMA[1] / 2, DISP_Z - 0.03)), (0, -1, 0), 0.030)
    gma_mkr = bnc(p, V((GMA_X, c.y - GMA[1] / 2, DISP_Z + 0.05)), (0, -1, 0))
    p.done()
    ports['GMA'] = dict(conns=[gma_conn], mkr=gma_mkr)
    return ports


def shelf_units():
    # полка приборной доски: над нижней панелью, перед корпусами дисплеев
    p = P('Instrument panel avionics shelf', 'Полка за приборной доской: на ней GDC 74A, GEA 71 и реле резервной батареи EECU', 'alu', 'AMM 31-40')
    slab(p, [(-0.24, -0.93), (0.30, -0.93), (0.37, -0.86), (0.37, -0.83), (-0.28, -0.83), (-0.28, -0.89)], SHELF_Z - 0.006, SHELF_Z)
    box(p, V((0.03, -0.928, SHELF_Z + 0.014)), (0.52, 0.004, 0.028), I3, 0)       # отбортовка вдоль передней кромки
    p.done()
    r = Part('ECU backup relay (reserved)', None, M['black'], RESERVED)          # место реле — его ставит electrical.py
    box(r, ECU_RELAY, (0.056, 0.046, 0.044), I3, 0)
    r.done()
    # GDC 74A на стойке, поперёк полки; штуцеры на левом торце
    c = GDC_C
    p = P('GDC 74A air data computer', 'Вычислитель воздушных сигналов GDC 74A на полке приборной доски: по полному и статическому давлению и датчику температуры считает высоту, скорость, вертикальную скорость и температуру наружного воздуха',
          'lru', 'AMM 31-40 2.G, 34-10')
    box(p, c, GDC, I3, 0, bevel=0.003)
    box(p, c + V((0, 0, GDC[2] / 2 + 0.0005)), (GDC[0] * 0.5, GDC[1] * 0.6, 0.001), I3, p.m(M['label']))
    gdc_conn = dsub(p, V((c.x - GDC[0] / 2, c.y, c.z)), (-1, 0, 0), 0.040)
    p.done()
    p = P('GDC 74A mounting rack', 'Стойка GDC 74A: лоток и два винта крепления', 'alu', 'AMM 31-40 6.')
    box(p, V((c.x, c.y, SHELF_Z + 0.002)), (GDC[0] + 0.01, GDC[1] + 0.012, 0.004), I3, 0, bevel=0.001)
    for sy in (-1, 1):
        box(p, V((c.x, c.y + sy * (GDC[1] / 2 + 0.004), SHELF_Z + 0.018)), (GDC[0] * 0.8, 0.003, 0.028), I3, 0)
        lib.screw(p, V((c.x + GDC[0] / 2 + 0.004, c.y + sy * 0.03, SHELF_Z + 0.004)), (0, 0, 1), 0.006, p.m(M['steel']))
    p.done()
    # GEA 71 — стоймя в стойке, опускается сверху, держится прижимом с винтом
    gs, gc = GEA, GEA_C
    p = lru('GEA 71 engine / airframe unit', 'Блок сигналов двигателя и планера GEA 71: принимает сигналы датчиков двигателя (через EECU), топливомеров, закрылков, напряжения и тока и передаёт их в G1000',
            gc, gs, doc='AMM 31-40 2.H, рис. 10', top=(0, 0, 1))
    gea_conn = dsub(p, V((gc.x + gs[0] / 2, gc.y, gc.z - 0.03)), (1, 0, 0), 0.050)
    p.done()
    p = P('GEA 71 mounting rack', 'Стойка GEA 71 на полке: рама, прижим и винт прижима', 'alu', 'AMM 31-40 рис. 10')
    rz = SHELF_Z + 0.003
    box(p, V((gc.x, gc.y, rz)), (gs[0] + 0.01, gs[1] + 0.014, 0.006), I3, 0, bevel=0.001)
    for sx in (-1, 1):
        box(p, V((gc.x + sx * (gs[0] / 2 + 0.004), gc.y, rz + 0.06)), (0.004, gs[1] + 0.014, 0.12), I3, 0)
    box(p, V((gc.x - gs[0] / 2 + 0.02, gc.y, gc.z + gs[2] / 2 + 0.003)), (0.03, gs[1] + 0.01, 0.004), I3, 0)   # прижим
    q = V((gc.x - gs[0] / 2 + 0.02, gc.y, gc.z + gs[2] / 2 + 0.005))
    lib.cyl(p, q, q + V((0, 0, 0.007)), 0.004, p.m(M['steel']), segs=10)
    p.done()
    return gdc_conn, gea_conn


def oat_probe():
    """GTP 59 — правый борт за подножкой второго пилота (AMM 34-10 2.B), под задней кромкой корня крыла."""
    y, z = 1.02, -0.13
    h, n = R.hit((0, y, z), (-1, 0, 0))
    n = V(n).normalized()
    if n.x > 0:
        n = -n
    p = P('GTP 59 OAT probe', 'Датчик температуры наружного воздуха GTP 59 на правом борту за подножкой второго пилота; сигнал — в GDC 74A', 'steel', 'AMM 34-10 2.B')
    tip = h + n * 0.055 + V((0, 0.02, -0.01))
    lib.cyl(p, h - n * 0.003, h + n * 0.004, 0.012, p.m(M['black']), segs=16)           # гайка
    lib.cyl(p, h + n * 0.004, tip, 0.0035, 0, segs=10, r1=0.0025)
    lib.cyl(p, h - n * 0.004, h - n * 0.03, 0.006, p.m(M['black']), segs=12)            # хвостовик с проводом
    p.done()
    return h - n * 0.03, -n


def gmu44():
    """GMU 44 — правая консоль, лючок в нижней обшивке (AMM 31-40 2.I)."""
    x, y = -3.95, 0.20
    lo, hi = R.wing_section(x, y)
    base = V((x, y, lo + 0.022))
    p = P('GMU 44 magnetometer', 'Магнитометр GMU 44 в правой консоли крыла: измеряет магнитное поле для курса, данные — в GRS 77; доступ через лючок в нижней обшивке',
          'lru', 'AMM 31-40 2.I')
    box(p, base + V((0, 0, 0.004)), (0.092, 0.082, 0.008), I3, p.m(M['alu']), bevel=0.001)
    box(p, base + V((0, 0, 0.030)), (0.070, 0.058, 0.044), I3, 0, bevel=0.012, segs=4)
    for a in (0, 2.094, 4.189):
        lib.screw(p, base + V((math.cos(a) * 0.040, math.sin(a) * 0.034, 0.0085)), (0, 0, 1), 0.006, p.m(M['steel']))
    conn = base + V((0.035, 0, 0.02))
    lib.cyl(p, conn, conn + V((0.02, 0, 0)), 0.006, p.m(M['conn']), segs=12)
    p.done()
    p = P('GMU 44 mount and access panel', 'Опора магнитометра на нижней обшивке и лючок доступа', 'gfrp', 'AMM 31-40 2.I')
    box(p, V((x, y, lo + 0.009)), (0.12, 0.11, 0.012), I3, 0, bevel=0.002)
    p.done()
    return conn + V((0.02, 0, 0))


def grs77():
    size = (0.092, 0.250, 0.084)          # GRS 77: 3,62 × 9,84 × 3,32 дюйма
    # рядом со стойкой: за ней, над рулевой машиной тангажа (у рамы слева — релейная коробка и кабели батареи)
    want = V((-0.02, 2.62 + size[1] / 2, 0.16 + size[2] / 2))
    c = place('GRS 77', want, (size[0] + 0.03, size[1] + 0.03, size[2] + 0.03), (-0.12, 2.60, 0.14), (0.10, 2.95, 0.30), step=0.01, hidden=False)
    p = P('GRS 77 AHRS', 'Курсовертикаль GRS 77 (AHRS) рядом со стойкой авионики: пространственное положение и курс по гироскопам, акселерометрам, магнитометру GMU 44 и данным GDC и GPS; ось блока — строго по оси самолёта',
          'lru', 'AMM 31-40 2.F, рис. 8')
    box(p, c + V((0, 0, -size[2] / 2 + 0.006)), (size[0] + 0.014, size[1], 0.012), I3, p.m(M['black']), bevel=0.002)   # основание с лапками
    box(p, c + V((0, 0.004, 0.006)), (size[0], size[1] - 0.008, size[2] - 0.012), I3, 0, bevel=0.018, segs=4)             # колпак
    box(p, c + V((0, 0.03, size[2] / 2 - 0.0005)), (0.05, 0.10, 0.001), I3, p.m(M['label']))
    for sx in (-1, 1):
        for sy in (-1, 1):
            lib.screw(p, c + V((sx * (size[0] / 2 + 0.004), sy * (size[1] / 2 - 0.015), -size[2] / 2 + 0.012)), (0, 0, 1), 0.006, p.m(M['steel']))
    conn = dsub(p, V((c.x, c.y - size[1] / 2, c.z - 0.015)), (0, -1, 0), 0.040)
    p.done()
    p = P('GRS 77 mounting bracket', 'Кронштейн GRS 77 из стеклопластика: площадка на двух поперечных балках, вклеенных в борта', 'gfrp', 'AMM 31-40 рис. 8')
    top = c.z - size[2] / 2
    box(p, V((c.x, c.y, top - 0.005)), (size[0] + 0.03, size[1] + 0.02, 0.010), I3, 0, bevel=0.002)
    for sy in (-1, 1):
        q = V((c.x, c.y + sy * 0.09, top - 0.02))
        a, _ = R.hit(q, (1, 0, 0))
        b, _ = R.hit(q, (-1, 0, 0))
        if a is not None and b is not None:
            box(p, V(((a.x + b.x) / 2, q.y, q.z)), (a.x - b.x - 0.004, 0.025, 0.02), I3, 0)
    p.done()
    return conn


def servo(name, ru, doc, cap_c, cap_axis, rod_dir, rod_p, body_dir, col=None):
    """Рулевая машина GSA 81 на опоре GSM 85: капстан, трос-уздечка на тяге, два хомута, кожух.
    cap_c — центр капстана, cap_axis — его ось, rod_dir/rod_p — ось тяги, body_dir — куда от
    опоры стоит сам привод (по оси капстана)."""
    cap_c, ax, rd, bd = V(cap_c), V(cap_axis).normalized(), V(rod_dir).normalized(), V(body_dir).normalized()
    rod_p = V(rod_p)
    t = (rod_p + rd * (cap_c - rod_p).dot(rd))            # проекция капстана на тягу
    down = (t - cap_c).normalized()                        # к тяге
    rc = 0.020
    p = P(name, ru, 'lru', doc, col)
    # опора GSM 85: плита и редуктор
    plate_c = cap_c + ax * 0.022 * (1 if bd.dot(ax) > 0 else -1)
    s = ax.cross(down).normalized()
    Rp = Rm(s, down, ax)
    box(p, plate_c, (0.11, 0.10, 0.004), Rp, p.m(M['alu']), bevel=0.001)
    gb = plate_c + bd * 0.022
    box(p, gb, (0.07, 0.07, 0.036), Rp, p.m(M['black']), bevel=0.004)
    # привод GSA 81: двигатель с редуктором
    mc = gb + bd * 0.018 + s * 0.0
    lib.cyl(p, mc, mc + bd * 0.105, 0.033, 0, segs=24)
    lib.cyl(p, mc + bd * 0.105, mc + bd * 0.112, 0.028, 0, segs=24)
    conn = mc + bd * 0.06 - down * 0.033
    lib.cyl(p, conn, conn - down * 0.014, 0.008, p.m(M['conn']), segs=14)
    for sx in (-1, 1):
        for sy in (-1, 1):
            lib.screw(p, plate_c + s * sx * 0.045 + down * sy * 0.04 - ax * 0.003 * (1 if bd.dot(ax) > 0 else -1), -bd, 0.006, p.m(M['steel']))
    # капстан с канавкой
    lib.cyl(p, cap_c - ax * 0.009, cap_c + ax * 0.009, rc, p.m(M['steel']), segs=28)
    lib.torus(p, cap_c, ax, rc, 0.0025, p.m(M['steel']), segs=28, rsegs=6)
    p.done()
    # трос-уздечка: полтора витка на капстане, концы — к тяге
    p = P(name + ' bridle cable and clamps', 'Трос рулевой машины: полтора витка на капстане, концы зажаты хомутами на тяге', 'steel', doc, col)
    span = 0.08
    c1, c2 = t - rd * span, t + rd * span
    tan1 = cap_c + (down.cross(ax) * (1 if down.cross(ax).dot(rd) < 0 else -1)).normalized() * rc
    tan2 = cap_c + (cap_c - tan1)
    tan1, tan2 = (tan1, tan2) if (tan1 - c1).length < (tan2 - c1).length else (tan2, tan1)
    for a, b in ((c1, tan1), (c2, tan2)):
        lib.cyl(p, a - down * 0.0125, b, 0.0011, 0, segs=6)       # от верха хомута к капстану
    lib.torus(p, cap_c + ax * 0.004, ax, rc + 0.0012, 0.0011, 0, segs=24, rsegs=4)
    lib.torus(p, cap_c - ax * 0.004, ax, rc + 0.0012, 0.0011, 0, segs=24, rsegs=4)
    for q in (c1, c2):
        ring_tube(p, q, rd, 0.0150, 0.0108, 0.012, p.m(M['alu']), segs=18)
        box(p, q - down * 0.017, (0.012, 0.012, 0.008), Rm(rd, down.cross(rd), -down), p.m(M['alu']))
    p.done()
    p = P(name + ' cable guard', 'Кожух капстана: не даёт тросу соскочить', 'alu', doc, col)
    for k in range(9):
        a0, a1 = math.pi * k / 9, math.pi * (k + 1) / 9
        q0 = cap_c + (-down * math.sin(a0) + s * math.cos(a0)) * (rc + 0.008)
        q1 = cap_c + (-down * math.sin(a1) + s * math.cos(a1)) * (rc + 0.008)
        box(p, (q0 + q1) / 2, ((q1 - q0).length + 0.001, 0.0015, 0.024), Rm(q1 - q0, ((q0 + q1) / 2 - cap_c), ax), 0)
    p.done()
    return conn


def servos():
    out = {}
    # крен: за задним главным шпангоутом справа, трос на тяге правого элерона в центроплане
    A, B = V((0.0, 0.574, -0.104)), V((-1.2, 0.600, -0.068))       # оси наконечников тяги (исходник)
    rd = (B - A).normalized()
    x = -0.34
    rp = A + rd * ((x - A.x) / rd.x)
    cap = rp + V((0, 0, 0.038))
    out['roll'] = servo('GSA 81 roll servo', 'Рулевая машина крена GSA 81 автопилота GFC 700 за задним главным шпангоутом справа; трос-уздечка на тяге правого элерона',
                        'AMM 22-10 2.B, рис. 2', cap, (0, 1, 0), rd, rp, (0, 1, 0))
    # тангаж: за рамой багажного отсека, трос на длинной тяге руля высоты
    A, B = V((0.1, 0.059, -0.0405)), V((0.0, 4.812, 0.0605))
    rd = (B - A).normalized()
    y = 2.665
    rp = A + rd * ((y - A.y) / rd.y)
    cap = rp + V((0, 0, 0.038))
    out['pitch'] = servo('GSA 81 pitch servo', 'Рулевая машина тангажа GSA 81 за рамой багажного отсека; трос-уздечка на тяге руля высоты',
                         'AMM 22-10 2.C, рис. 3', cap, (1, 0, 0), rd, rp, (-1, 0, 0))
    out['trim'] = trim_servo()
    return out


def trim_servo():
    """Триммер: GSA 81 под креслом второго пилота, звёздочка с цепью, карданный вал, звёздочка
    с цепью у штурвальчика справа (AMM 22-10 2.D)."""
    size = (0.13, 0.12, 0.09)
    c = place('trim servo', V((-0.20, -0.12, -0.07)), size, (-0.40, -0.36, -0.12), (-0.10, 0.0, 0.0), step=0.01, hidden=True)
    p = P('GSA 81 pitch trim servo', 'Рулевая машина триммера GSA 81 под креслом второго пилота на плите из алюминия и кронштейне из стеклопластика',
          'lru', 'AMM 22-10 2.D, рис. 4')
    box(p, c + V((0, 0, -size[2] / 2 + 0.004)), (size[0], size[1], 0.008), I3, p.m(M['alu']), bevel=0.001)
    lib.cyl(p, c + V((-0.055, 0.0, 0.0)), c + V((0.03, 0.0, 0.0)), 0.033, 0, segs=24)             # привод вдоль X
    box(p, c + V((0.045, 0, 0.0)), (0.03, 0.07, 0.07), I3, p.m(M['black']), bevel=0.004)          # опора GSM 85
    conn = c + V((-0.02, -0.033, 0.0))
    lib.cyl(p, conn, conn + V((0, -0.014, 0)), 0.008, p.m(M['conn']), segs=14)
    p.done()
    s_serv = c + V((0.068, 0.0, 0.0))            # звёздочка на выходном валу, ось X
    s_low = s_serv + V((0, -0.06, 0))             # звёздочка нижнего конца карданного вала
    p = P('Pitch trim servo chain gear', 'Звёздочка и цепь на рулевой машине триммера', 'steel', 'AMM 22-10 2.D', COL_I)
    for q, r in ((s_serv, 0.016), (s_low, 0.012)):
        lib.cyl(p, q - V((0.003, 0, 0)), q + V((0.003, 0, 0)), r, 0, segs=18)
    for sg in (-1, 1):
        lib.cyl(p, s_serv + V((0, 0, sg * 0.016)), s_low + V((0, 0, sg * 0.012)), 0.0025, p.m(M['black']), segs=6)
    p.done()
    # звёздочка у штурвальчика (справа) и нижний вал
    s_up = HANDWHEEL + V((-0.014, 0, 0))
    s_mid = V((-0.03, HANDWHEEL.y, s_low.z))
    p = P('Pitch trim chain gear at the handwheel', 'Звёздочка и цепь справа от штурвальчика триммера: от карданного вала к штурвальчику', 'steel', 'AMM 22-10 2.D', COL_I)
    for q, r in ((s_up, 0.020), (s_mid, 0.012)):
        lib.cyl(p, q - V((0.003, 0, 0)), q + V((0.003, 0, 0)), r, 0, segs=18)
    for sg in (-1, 1):
        a = s_up + V((0, sg * 0.020, 0))
        b = s_mid + V((0, sg * 0.012, 0))
        lib.cyl(p, a, b, 0.0025, p.m(M['black']), segs=6)
    p.done()
    # карданный вал: от нижней звёздочки у штурвальчика до звёздочки на машине
    a, b = s_mid - V((0.02, 0, 0)), s_low + V((0.02, 0, 0))
    p = P('Pitch trim cardan shaft', 'Карданный вал триммера с двумя шарнирами; верхний шарнир крепится к детали, рассчитанной на разрушение при аварийной посадке', 'steel', 'AMM 22-10 7.', COL_I)
    j1, j2 = a + (b - a) * 0.08, a + (b - a) * 0.92
    lib.cyl(p, a, j1, 0.005, 0, segs=12)
    lib.cyl(p, j1, j2, 0.006, 0, segs=12)
    lib.cyl(p, j2, b, 0.005, 0, segs=12)
    for q in (j1, j2):
        lib.sphere(p, q, 0.009, p.m(M['black']), segs=12, rings=6)
    p.done()
    return conn


# ════════════════════════════════════════════════════════════════════════
# РАДИООБОРУДОВАНИЕ
# ════════════════════════════════════════════════════════════════════════

ENC_Y0 = FRAME_Y + 0.020
RACK_X = -0.045


def avionics_rack():
    """Короб авионики за рамой багажного отсека; на нём в ряд по полёту GTX 33, GIA 63W № 2, № 1
    стоймя (AMM 31-40 рис. 6, 7): блоки опускаются в стойки сверху, прижим с винтом."""
    plate_z = 0.092
    units = [('GTX 33 transponder', 'Ответчик GTX 33: режимы A, C и S; управляется с PFD, связан с обоими GIA 63W',
              (0.160, 0.045, 0.281), 'AMM 31-40 2.E, рис. 7'),
             ('GIA 63W No 2', 'Комплексный блок авионики GIA 63W № 2: УКВ-радиостанция COM 2, навигационный приёмник NAV 2 (VOR, LOC, глиссада), приёмник GPS/WAAS № 2',
              (0.184, 0.097, 0.259), 'AMM 31-40 2.D, рис. 6'),
             ('GIA 63W No 1', 'Комплексный блок авионики GIA 63W № 1: УКВ-радиостанция COM 1, навигационный приёмник NAV 1 (VOR, LOC, глиссада), приёмник GPS/WAAS № 1',
              (0.184, 0.097, 0.259), 'AMM 31-40 2.D, рис. 6')]
    y = ENC_Y0 + 0.012
    slots = {}
    for name, ru, (w, d, h), doc in units:
        c = V((RACK_X, y + d / 2 + 0.004, plate_z + 0.012 + h / 2))
        p = lru(name, ru, c, (w, d, h), doc=doc, col=COL_R, labels=2)
        # окантовка больших граней
        for sy in (-1, 1):
            q = c + V((0, sy * (d / 2 + 0.0006), 0.01))
            for dz in (-h / 2 + 0.012, h / 2 - 0.012):
                box(p, q + V((0, 0, dz)), (w - 0.012, 0.0012, 0.004), I3, 0)
            for dx in (-w / 2 + 0.006, w / 2 - 0.006):
                box(p, q + V((dx, 0, 0)), (0.004, 0.0012, h - 0.02), I3, 0)
        p.done()
        slots[name] = (c, (w, d, h))
        # стойка: коробка нижней части, окно, разъёмы внизу
        p = P(name + ' mounting rack', 'Стойка блока: направляющие, прижим с винтом, разъёмы внизу', 'alu', doc, COL_R)
        rh = 0.085
        rc = V((c.x, c.y, plate_z + rh / 2 - 0.02))
        for sx in (-1, 1):
            box(p, rc + V((sx * (w / 2 + 0.003), 0, 0)), (0.002, d + 0.006, rh), I3, 0)
        for sy in (-1, 1):
            box(p, rc + V((0, sy * (d / 2 + 0.003), 0)), (w + 0.008, 0.002, rh), I3, 0)
        box(p, rc + V((-w / 2 - 0.0045, 0, 0.005)), (0.001, d * 0.6, rh * 0.5), I3, p.m(M['black']))      # окно
        top = c.z + h / 2
        box(p, V((c.x + w / 2 - 0.02, c.y, top + 0.003)), (0.03, d + 0.006, 0.004), I3, 0)                  # прижим
        lib.cyl(p, V((c.x + w / 2 - 0.02, c.y, top + 0.005)), V((c.x + w / 2 - 0.02, c.y, top + 0.013)), 0.005, p.m(M['steel']), segs=12)
        box(p, V((c.x + w / 2 + 0.003, c.y, (top + plate_z) / 2 + 0.03)), (0.003, 0.014, top - plate_z - 0.05), I3, 0)   # стяжка прижима
        for dx in (-w / 4, w / 4):
            box(p, V((c.x + dx, c.y, plate_z - 0.03)), (w * 0.35, d * 0.5, 0.02), I3, p.m(M['dsub']), bevel=0.002)
        p.done()
        y += d + 0.012
    y_end = y
    # короб с фланцем
    x0, x1 = RACK_X - 0.115, RACK_X + 0.095
    ec = V(((x0 + x1) / 2, (ENC_Y0 + y_end) / 2, plate_z - 0.030))
    esz = (x1 - x0, y_end - ENC_Y0, 0.060)
    p = P('Avionics enclosure', 'Короб авионики за рамой багажного отсека: на фланце — стойки GIA 63W и GTX 33, внутри разъёмы и жгуты; доступ через нижнюю панель заднего багажного отсека',
          'alu', 'AMM 31-40 рис. 6, 7', COL_R)
    box(p, ec, esz, I3, 0, bevel=0.002)
    box(p, V((ec.x, ec.y, plate_z - 0.001)), (esz[0] + 0.02, esz[1] + 0.02, 0.002), I3, 0)
    for sy in (-1, 1):
        rivets(p, V((x0 - 0.005, ec.y + sy * (esz[1] / 2 + 0.005), plate_z)), V((x1 + 0.005, ec.y + sy * (esz[1] / 2 + 0.005), plate_z)), 9, (0, 0, 1), p.m(M['steel']), 0.003)
    p.done()
    # вентилятор охлаждения на правой стенке короба
    fc = V((x0 - 0.012, y_end - 0.035, ec.z))
    p = P('Avionics rack cooling fan', 'Вентилятор охлаждения стойки авионики: продувает короб и блоки снизу вверх', 'fan', 'AMM 92 (Equipment Cooling)', COL_R)
    box(p, fc, (0.024, 0.056, 0.056), I3, 0, bevel=0.004)
    ring_tube(p, fc - V((0.013, 0, 0)), V((1, 0, 0)), 0.026, 0.023, 0.004, p.m(M['black']), segs=24)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        d = V((0, math.cos(a), math.sin(a)))
        box(p, fc - V((0.014, 0, 0)) + d * 0.012, (0.002, 0.024, 0.003), Rm((1, 0, 0), d, d.cross(V((1, 0, 0)))), p.m(M['black']))
    p.done()
    # разветвитель NAV на левой стенке, в хвостовой части
    sc = V((x1 + 0.012, y_end - 0.04, ec.z))
    p = P('NAV antenna splitter', 'Разветвитель сигнала антенны NAV: VOR, LOC и глиссада на оба GIA 63W', 'grey', 'AMM 23-10, 34-50', COL_R)
    box(p, sc, (0.02, 0.06, 0.040), I3, 0, bevel=0.002)
    ins = bnc(p, sc + V((0.01, 0.018, 0.01)), (1, 0, 0))
    for dy in (-0.018, 0.0):
        bnc(p, sc + V((0.01, dy, -0.01)), (1, 0, 0))
    p.done()
    # точки ввода кабелей в короб
    ports = dict(fwd=[V((ec.x + dx, ENC_Y0 - 0.002, ec.z + dz)) for dx, dz in ((0, 0), (-0.05, -0.01), (0.05, 0.0), (0.025, -0.015))],
                 rh=[V((x0 - 0.002, ENC_Y0 + 0.018 + k * 0.026, ec.z + (-0.014 if k % 2 else 0.006))) for k in range(8)],
                 aft=[V((ec.x + dx, y_end + 0.002, ec.z)) for dx in (-0.07, -0.04, -0.01)], nav=ins, top=plate_z, x0=x0, x1=x1, y1=y_end)
    return slots, ports


def rear_units():
    out = {}
    # ELT ME406 — под задним багажным отсеком (слева от тяги руля высоты), антенна над ним
    es = (0.094, 0.167, 0.073)
    c = place('ELT', V((0.10, 2.05, 0.0)), (es[0] + 0.02, es[1] + 0.02, es[2] + 0.02), (0.0, 1.80, -0.10), (0.20, 2.24, 0.15), step=0.01, hidden=False)
    p = P('ELT Artex ME406', 'Аварийный радиомаяк Artex ME406 (121,5 и 406 МГц) под задним багажным отсеком; включается сам от перегрузки при ударе, выключатель ON / ARM на торце',
          'black', 'AMM 25-60 2.A', COL_R)
    box(p, c, es, I3, 0, bevel=0.006)
    box(p, c + V((0, 0, es[2] / 2 + 0.0005)), (es[0] * 0.8, es[1] * 0.7, 0.001), I3, p.m(M['yellow']))
    endc = c + V((0, -es[1] / 2, 0))
    box(p, endc - V((0, 0.006, 0)), (es[0] - 0.006, 0.012, es[2] - 0.006), I3, p.m(M['lru']), bevel=0.003)
    lib.cyl(p, endc + V((-0.02, -0.012, 0.01)), endc + V((-0.02, -0.024, 0.01)), 0.003, p.m(M['steel']), segs=8)     # тумблер
    ant = bnc(p, endc + V((0.022, -0.012, 0.012)), (0, -1, 0))
    rcs = dsub(p, endc + V((0.012, -0.012, -0.016)), (0, -1, 0), 0.03)
    p.done()
    p = P('ELT mounting tray and strap', 'Кронштейн аварийного маяка с лентой-липучкой', 'alu', 'AMM 25-60 рис. 2', COL_R)
    box(p, c - V((0, 0, es[2] / 2 + 0.003)), (es[0] + 0.014, es[1] + 0.01, 0.004), I3, 0, bevel=0.001)
    for sy in (-0.04, 0.04):
        for q0, q1 in ((V((-es[0] / 2 - 0.003, sy, -es[2] / 2)), V((-es[0] / 2 - 0.003, sy, es[2] / 2 + 0.003))),
                       (V((-es[0] / 2 - 0.003, sy, es[2] / 2 + 0.003)), V((es[0] / 2 + 0.003, sy, es[2] / 2 + 0.003))),
                       (V((es[0] / 2 + 0.003, sy, es[2] / 2 + 0.003)), V((es[0] / 2 + 0.003, sy, -es[2] / 2)))):
            box(p, c + (q0 + q1) / 2, (max(abs(q1.x - q0.x), 0.003), 0.03, max(abs(q1.z - q0.z), 0.003)), I3, p.m(M['strap']))
    p.done()
    out['elt'] = dict(ant=ant, rcs=rcs, c=c, size=es)
    # внутренняя антенна ELT на кронштейне над маяком
    base = V((c.x, c.y + 0.02, c.z + es[2] / 2 + 0.07))
    h, n = R.hit(base, (1, 0, 0))
    wall = h - V((0.006, 0, 0)) if h is not None else base + V((0.05, 0, 0))
    p = P('ELT antenna (inside the rear fuselage)', 'Антенна аварийного маяка на кронштейне в хвостовой части над маяком; обшивка из композита радиопрозрачна', 'whip', 'AMM 25-60 2.A', COL_R)
    tip = base + V((-0.02, 0.03, 0.26))           # штырь вверх, перед рамой багажного отсека
    lib.cyl(p, base, tip, 0.0045, 0, segs=10, r1=0.0025)
    lib.cyl(p, base - V((0, 0.02, 0)), base + V((0, 0.01, 0)), 0.009, p.m(M['bnc']), segs=14)
    p.done()
    p = P('ELT antenna bracket', 'Кронштейн антенны аварийного маяка', 'alu', 'AMM 25-60 2.A', COL_R)
    box(p, (base + wall) / 2, ((wall - base).length + 0.004, 0.03, 0.003), I3, 0)
    p.done()
    out['elt_ant'] = base - V((0, 0.02, 0))
    # DME KN 63 и приёмник АРК RA 3502 — на двухъярусном лотке справа в хвостовой части
    ra = (0.146, 0.245, 0.0475)
    c = place('RA 3502', V((-0.075, 2.87, 0.045)), (ra[0] + 0.02, ra[1] + 0.02, ra[2] + 0.02), (-0.14, 2.72, 0.02), (0.0, 3.05, 0.14), step=0.01, hidden=False)
    p = lru('ADF receiver Becker RA 3502', 'Приёмник автоматического радиокомпаса (АРК, ADF) Becker RA 3502: пеленг приводной радиостанции (NDB) — на PFD',
            c, ra, col=COL_R, mat='grey')
    adf_in = bnc(p, V((c.x - 0.03, c.y - ra[1] / 2, c.z)), (0, -1, 0))
    adf_data = dsub(p, V((c.x + 0.03, c.y - ra[1] / 2, c.z)), (0, -1, 0), 0.03)
    p.done()
    out['adf'] = dict(rf=adf_in, data=adf_data, c=c)
    kn = (0.165, 0.293, 0.030)
    c2 = place('KN 63', V((c.x, c.y, c.z + ra[2] / 2 + 0.03)), (kn[0] + 0.02, kn[1] + 0.02, kn[2] + 0.012), (-0.14, 2.72, c.z + 0.04), (0.0, 3.05, 0.22), step=0.01, hidden=False)
    p = lru('DME KN 63', 'Выносной блок дальномера KN 63 (DME): наклонная дальность до маяка DME, скорость и время — на PFD', c2, kn, col=COL_R)
    dme_in = bnc(p, V((c2.x - 0.05, c2.y - kn[1] / 2, c2.z)), (0, -1, 0))
    dme_data = dsub(p, V((c2.x + 0.03, c2.y - kn[1] / 2, c2.z)), (0, -1, 0), 0.03)
    p.done()
    out['dme'] = dict(rf=dme_in, data=dme_data, c=c2)
    p = P('DME / ADF mounting shelf', 'Двухъярусный лоток DME и приёмника АРК на правом борту хвостовой части', 'alu', None, COL_R)
    for q, sz in ((c, ra), (c2, kn)):
        box(p, q - V((0, 0, sz[2] / 2 + 0.003)), (sz[0] + 0.012, sz[1] + 0.012, 0.004), I3, 0, bevel=0.001)
    xw = min(c.x, c2.x) - max(ra[0], kn[0]) / 2 - 0.006
    h, n = R.hit((xw, c.y, (c.z + c2.z) / 2), (-1, 0, 0))
    if h is not None and xw - h.x > 0.004:
        box(p, V(((xw + h.x) / 2, c.y, (c.z + c2.z) / 2)), (xw - h.x + 0.004, 0.10, c2.z - c.z + 0.04), I3, 0)
    p.done()
    return out


def wx500():
    """WX-500 — на лотке под сиденьем пассажиров (AMM 34-41 2.A)."""
    size = (0.305, 0.142, 0.089)            # лёжа: длина поперёк, ширина по полёту
    c = place('WX-500', V((0.0, 0.62, -0.08)), (size[0] + 0.02, size[1] + 0.02, size[2] + 0.015), (-0.30, 0.43, -0.14),
              (0.30, 1.05, 0.02), step=0.01, hidden=True)
    p = lru('WX-500 stormscope processor', 'Процессор грозопеленгатора WX-500 на лотке под сиденьем пассажиров: по сигналам антенны NY-163 находит грозовые разряды в радиусе 200 миль, данные — на MFD',
            c, size, col=COL_R, labels=1, top=(0, 0, 1))
    conn = dsub(p, V((c.x + size[0] / 2, c.y - 0.03, c.z)), (1, 0, 0), 0.04)      # самолётный разъём
    ant_in = dsub(p, V((c.x + size[0] / 2, c.y + 0.03, c.z)), (1, 0, 0), 0.03)    # антенна NY-163
    lib.cyl(p, V((c.x - size[0] / 2, c.y, c.z)), V((c.x - size[0] / 2 - 0.012, c.y, c.z)), 0.006, p.m(M['steel']), segs=12)   # винт крепления
    p.done()
    p = P('WX-500 mounting tray', 'Лоток процессора WX-500', 'alu', 'AMM 34-41 2.', COL_R)
    box(p, c - V((0, 0, size[2] / 2 + 0.003)), (size[0] + 0.02, size[1] + 0.01, 0.004), I3, 0, bevel=0.001)
    p.done()
    return conn, ant_in


# ── антенны ───────────────────────────────────────────────────────────────

def skin(x, y, side):
    loc, n = R.skin(x, y, side)
    if loc is None:
        raise SystemExit(f'нет обшивки {x, y, side}')
    return loc, n.normalized()


def base_plate(p, c, n, fwd, L, W, mi, t=0.006):
    s = n.cross(fwd).normalized()
    f = s.cross(n).normalized()
    box(p, c + n * t / 2, (W, L, t), Rm(s, f, n), mi, bevel=min(W, L) * 0.3, segs=4)
    return s, f


def antennas():
    out = {}
    # COM 1 — сверху за кабиной, штырь с наклоном назад (MSFS Cylinder.009)
    c, n = skin(0.0, 2.205, 'upper')
    p = P('COM 1 antenna', 'Антенна COM 1 сверху фюзеляжа за кабиной; крепится тремя гайками, доступ из заднего багажного отсека',
          'whip', 'AMM 23-10 2., рис. 1', COL_R)
    s, f = base_plate(p, c, n, V((0, 1, 0)), 0.15, 0.05, p.m(M['white']))
    lib.cyl(p, c + n * 0.006 + f * 0.03, V((0.0, 2.52, 0.80)), 0.009, 0, segs=12, r1=0.006)
    lib.cyl(p, V((0.0, 2.52, 0.80)), V((0.0, 2.71, 0.99)), 0.006, 0, segs=10, r1=0.003)
    p.done()
    out['com1'] = c - n * 0.01
    # COM 2 — снизу за кабиной, изогнутый штырь (MSFS Cylinder.001)
    c, n = skin(0.0, 1.705, 'lower')
    p = P('COM 2 antenna', 'Антенна COM 2 снизу фюзеляжа за кабиной, изогнутый штырь; доступ из заднего багажного отсека',
          'whip', 'AMM 23-10 2., рис. 1', COL_R)
    base_plate(p, c, n, V((0, 1, 0)), 0.12, 0.045, p.m(M['white']))
    pth = fillet([c + n * 0.005, V((0, 1.72, -0.34)), V((0, 1.80, -0.372)), V((0, 2.23, -0.372))], 0.06)
    sweep(p, pth, 0.006, 0, segs=10)
    p.done()
    out['com2'] = c - n * 0.01
    # GPS № 1 и № 2 — на крыше кабины над плафонами (MSFS Cube.018_Cube.011)
    for k, x in ((1, 0.066), (2, -0.070)):
        c, n = skin(x, 0.32, 'upper')
        p = P(f'GPS/WAAS antenna No {k}', f'Антенна GPS/WAAS № {k} на крыше кабины; снимается через плафон освещения, четыре винта и прижимная пластина',
              'white', 'AMM 34-50 2.B', COL_R)
        s, f = base_plate(p, c, n, V((0, 1, 0)), 0.115, 0.085, 0, t=0.004)
        box(p, c + n * 0.014 + f * 0.005, (0.070, 0.090, 0.020), Rm(s, f, n), 0, bevel=0.009, segs=4)
        for sx in (-1, 1):
            for sy in (-1, 1):
                lib.screw(p, c + n * 0.004 + s * sx * 0.035 + f * sy * 0.048, n, 0.005, p.m(M['steel']))
        p.done()
        out[f'gps{k}'] = c - n * 0.012
    # ответчик — под креслом пилота (MSFS Plane.134_Plane.097), DME — под креслом второго пилота
    for key, x, ru, doc in (('xpdr', 0.274, 'Антенна ответчика под фюзеляжем, под креслом пилота; две гайки, кабель RG 142', 'AMM 34-50 2.A'),
                            ('dme', -0.274, 'Антенна дальномера DME под фюзеляжем, под креслом второго пилота; две гайки, кабель RG 142', 'AMM 34-50 2.A')):
        c, n = skin(x, -0.085, 'lower')
        p = P('Transponder antenna' if key == 'xpdr' else 'DME antenna', ru, 'white', doc, COL_R)
        s, f = base_plate(p, c, n, V((0, 1, 0)), 0.115, 0.032, 0, t=0.005)
        tip = c + n * 0.09 + f * 0.035
        bm = p.bm
        # лезвие со стреловидной передней кромкой, толщина 8 мм
        pts = [c + n * 0.005 - f * 0.052, c + n * 0.005 + f * 0.052, tip + f * 0.01, tip - f * 0.018]
        vs = [bm.verts.new(q + s * sg * 0.004) for sg in (-1, 1) for q in pts]
        for fi in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
            bm.faces.new([vs[i] for i in fi])
        p.done()
        out[key] = c - n * 0.012
    # маркер и АРК — под задними сиденьями (AMM 34-50 2.C)
    c, n = skin(0.16, 0.76, 'lower')
    p = P('Marker beacon antenna', 'Антенна маркерного приёмника под задними сиденьями; три винта, кабель RG 400', 'white', 'AMM 34-50 2.C', COL_R)
    s, f = base_plate(p, c, n, V((0, 1, 0)), 0.20, 0.055, 0, t=0.004)
    box(p, c + n * 0.016, (0.036, 0.17, 0.024), Rm(s, f, n), 0, bevel=0.010, segs=4)
    p.done()
    out['mkr'] = c - n * 0.012
    c, n = skin(-0.03, 0.97, 'lower')
    p = P('ADF antenna AN 3500', 'Антенна АРК Becker AN 3500 под задними сиденьями: рамочная и ненаправленная антенны в одном плоском корпусе, ось — строго по оси самолёта',
          'white', 'AMM 34-50 2.C, 5.', COL_R)
    s, f = base_plate(p, c, n, V((0, 1, 0)), 0.34, 0.175, 0, t=0.030)
    p.done()
    out['adf'] = c - n * 0.012
    # VOR/LOC/GS — вибратор внутри стабилизатора
    p = P('VHF NAV antenna (inside the horizontal stabiliser)', 'Антенна VOR/LOC/GS — V-образный вибратор внутри горизонтального оперения; заменить нельзя, входит в конструкцию стабилизатора',
          'alu', 'AMM 34-50 2., 23-10 рис. 1', COL_R)
    apex = V((0.0, 5.13, 1.29))
    for sx in (1, -1):
        lo, hi = R.wing_section(sx * 0.42, 5.02)
        end = V((sx * 0.42, 5.02, (lo + hi) / 2 if lo and hi else 1.29))
        lib.cyl(p, apex + V((sx * 0.02, 0, 0)), end, 0.004, 0, segs=8)
        box(p, apex + V((sx * 0.012, 0, 0)), (0.018, 0.02, 0.012), I3, p.m(M['gfrp']))
    p.done()
    out['nav'] = apex + V((0, 0.02, -0.01))
    # NY-163 — на стабилизаторе, стрелка по полёту
    x, y = 0.42, 5.12
    c, n = skin(x, y, 'upper')
    p = P('Stormscope antenna NY-163', 'Антенна грозопеленгатора NY-163 на горизонтальном оперении: скрещённые рамки и ненаправленная антенна, стрелка на корпусе — по полёту',
          'white', 'AMM 34-41 2.B', COL_R)
    s, f = base_plate(p, c, n, V((0, 1, 0)), 0.19, 0.10, 0, t=0.004)
    box(p, c + n * 0.016, (0.085, 0.17, 0.026), Rm(s, f, n), 0, bevel=0.012, segs=4)
    box(p, c + n * 0.0295 - f * 0.03, (0.012, 0.05, 0.001), Rm(s, f, n), p.m(M['black']))
    p.done()
    out['ny163'] = c - n * 0.012
    return out


def rcs_switch():
    """ELT RCS — справа на приборной доске (AMM 25-60 2.A): корпус за доской."""
    c = V((-0.46, PANEL_Y - 0.03, 0.34))
    c = place('ELT RCS', c, (0.04, 0.06, 0.04), (-0.50, -0.78, 0.26), (-0.36, -0.70, 0.40), step=0.01, hidden=False)
    p = P('ELT remote control switch (RCS)', 'Пульт дистанционного управления ELT справа на приборной доске: ON — проверка, ARM — готовность; красный светодиод — маяк работает',
          'black', 'AMM 25-60 2.B', COL_R)
    box(p, c, (0.03, 0.05, 0.03), I3, 0, bevel=0.003)
    q = dsub(p, V((c.x, c.y - 0.025, c.z)), (0, -1, 0), 0.02)
    p.done()
    return q


# ════════════════════════════════════════════════════════════════════════

def build():
    CAB = ((-0.60, -1.12, -0.27), (0.60, 2.62, 0.62))      # от доски до хвоста, под полом и по бортам
    TAIL = ((-0.30, 2.20, -0.14), (0.30, 5.50, 1.40))
    PANEL = ((-0.40, -1.00, 0.28), (0.43, -0.71, 0.62))

    # приборное оборудование
    dp = displays()
    gdc_conn, gea_conn = shelf_units()
    refresh()
    slots, ports = avionics_rack()          # стойка — раньше: GRS 77, рулевая машина и ELT встают вокруг неё
    refresh()
    sv = servos()
    refresh()
    grs_conn = grs77()
    refresh()
    oat_c, oat_d = oat_probe()
    gmu_c = gmu44()
    refresh()
    # радиооборудование
    rear = rear_units()
    refresh()
    wx_conn, wx_ant = wx500()
    refresh()
    ant = antennas()
    refresh()
    rcs = rcs_switch()
    refresh()
    if os.environ.get('PLACE_ONLY'):          # только блоки и антенны — для подбора мест
        return

    # ── жгуты G1000 ──
    J = V((0.050, -0.905, 0.345))                  # сборка жгута за доской над полкой, между GDC и реле
    for tag, q in (('PFD', dp['PFD']['conns'][0]), ('MFD', dp['MFD']['conns'][0]), ('GMA', dp['GMA']['conns'][0])):
        pts = route(q, (0, -1, 0), J, (0, -1, 0), 0.004, *PANEL, step=0.01, hidden=False)
        cable(f'Display harness {tag}', f'Жгут {tag}: питание, HSDB (Ethernet), ARINC 429 и RS-232 к общему жгуту G1000', pts, 0.004, 'shield', col=COL_R if tag == 'GMA' else COL_I)
    pts = route(gdc_conn, (-1, 0, 0), J, (0, -1, 0), 0.004, *PANEL, step=0.01, hidden=False)
    cable('GDC 74A harness', 'Жгут GDC 74A: ARINC 429 к GIA 63W, дисплеям и GRS 77, RS-232 — загрузка конфигурации', pts, 0.004, 'shield')
    pts = route(gea_conn, (1, 0, 0), J, (0, -1, 0), 0.004, *PANEL, step=0.01, hidden=False)
    cable('GEA 71 harness', 'Жгут GEA 71: RS-485 к обоим GIA 63W', pts, 0.004, 'shield')
    # общий жгут: за доской → под полом → короб авионики
    pts = route(J, (0, -1, 0), ports['fwd'][0], (0, 1, 0), 0.009, *CAB, step=0.02)
    cable('G1000 main harness (instrument panel → avionics rack)', 'Общий жгут G1000 от приборной доски к стойке авионики: питание от шины авионики, HSDB, ARINC 429, RS-232 и RS-485',
          pts, 0.009, 'harness', col=COL_R)
    # GRS 77 — к GIA (короткий), GMU 44 — к GRS 77
    pts = route(grs_conn, (0, -1, 0), ports['aft'][2], (0, -1, 0), 0.004, (-0.2, 2.40, -0.05), (0.2, 2.9, 0.4), step=0.01)
    cable('GRS 77 harness', 'Жгут GRS 77: ARINC 429 к GIA 63W и дисплеям, питание магнитометра', pts, 0.004, 'shield')
    wing = [gmu_c]
    for x in (-3.6, -3.0, -2.4, -1.8, -1.3, -0.9):
        lo, hi = R.wing_section(x, 0.20)
        wing.append(V((x, 0.20, (lo + hi) / 2)))
    root = V((-0.60, 0.20, wing[-1].z))
    pts = route(root, (1, 0, 0), grs_conn + V((0.0, 0.0, -0.03)), (0, 1, 0), 0.003, (-0.62, -0.1, -0.26), (0.30, 2.6, 0.45), step=0.02)
    cable('GMU 44 cable (RS-485) → GRS 77', 'Кабель магнитометра GMU 44: по правой консоли между лонжеронами, под полом — к GRS 77', wing + pts, 0.003, 'shield')
    # рулевые машины — к стойке авионики
    for key, ru in (('roll', 'крена'), ('pitch', 'тангажа'), ('trim', 'триммера')):
        q = sv[key]
        box_ = ((-0.30, 2.20, -0.12), (0.30, 2.90, 0.45)) if key == 'pitch' else CAB
        pts = route(q, (0, 0, 1) if key != 'trim' else (0, -1, 0), ports['rh'][{'roll': 4, 'pitch': 7, 'trim': 5}[key]], (1, 0, 0), 0.003, *box_,
                    step=0.01 if key == 'pitch' else 0.02)
        cable(f'Servo cable: {key}', f'Кабель рулевой машины {ru} к GIA 63W', pts, 0.003, 'shield')
    # датчик температуры → GDC
    pts = route(oat_c, oat_d, gdc_conn + V((0.0, 0.02, -0.02)), (1, 0, 0), 0.0025, *CAB, step=0.02)
    cable('GTP 59 OAT probe cable → GDC 74A', 'Кабель датчика температуры наружного воздуха к GDC 74A', pts, 0.0025, 'shield')
    # EECU → GEA 71 (данные двигателя)
    eecu = V((-0.22, -1.10, 0.19))          # свободный разъём EECU (electrical.py: 1-й и 3-й заняты)
    pts = route(eecu, (0, 1, 0), gea_conn + V((0, 0.012, 0.0)), (-1, 0, 0), 0.003, (-0.40, -1.12, 0.12), (0.30, -0.70, 0.50), step=0.01, hidden=False)
    cable('EECU → GEA 71 engine data', 'Кабель данных двигателя: EECU — GEA 71', pts, 0.003, 'shield')

    # ── коаксиальные кабели ──
    rh = ports['rh']
    coax = [('com1', rh[0], 'rg400', 'COM 1 antenna → GIA 63W No 1', 'антенна COM 1 — GIA 63W № 1'),
            ('com2', rh[1], 'rg400', 'COM 2 antenna → GIA 63W No 2', 'антенна COM 2 — GIA 63W № 2'),
            ('gps1', rh[2], 'rg400', 'GPS antenna No 1 → GIA 63W No 1', 'антенна GPS № 1 — GIA 63W № 1'),
            ('gps2', rh[3], 'rg400', 'GPS antenna No 2 → GIA 63W No 2', 'антенна GPS № 2 — GIA 63W № 2'),
            ('xpdr', ports['fwd'][1], 'rg142', 'Transponder antenna → GTX 33', 'антенна ответчика — GTX 33')]
    for key, dst, mat, name, ru in coax:
        a = ant[key]
        d = (dst - a).normalized()
        n_in = V((0, 0, -1)) if key in ('com1', 'gps1', 'gps2') else V((0, 0, 1))
        dd = V((1, 0, 0)) if dst in rh else V((0, 1, 0))
        pts = route(a, n_in, dst, dd, 0.0025, *CAB, step=0.02)
        cable(f'Coax: {name}', f'Коаксиальный кабель: {ru}', pts, 0.0025, mat, col=COL_R, ends='bnc')
    pts = route(ant['dme'], (0, 0, 1), rear['dme']['rf'], (0, 1, 0), 0.0025, (-0.52, -1.12, -0.26), (0.52, 3.10, 0.62), step=0.02)
    cable('Coax: DME antenna → KN 63', 'Коаксиальный кабель: антенна DME — KN 63', pts, 0.0025, 'rg142', col=COL_R, ends='bnc')
    pts = route(ant['adf'], (0, 0, 1), rear['adf']['rf'], (0, 1, 0), 0.0025, (-0.52, -1.12, -0.26), (0.52, 3.10, 0.62), step=0.02)
    cable('Coax: ADF antenna → RA 3502', 'Кабель антенны АРК к приёмнику RA 3502', pts, 0.0025, 'rg142', col=COL_R, ends='bnc')
    pts = route(ant['mkr'], (0, 0, 1), dp['GMA']['mkr'], (0, 1, 0), 0.0025, *CAB, step=0.02)
    cable('Coax: marker antenna → GMA 1347', 'Коаксиальный кабель: антенна маркера — приёмник маркерных маяков в GMA 1347', pts, 0.0025, 'rg400', col=COL_R, ends='bnc')
    pts = route(ant['nav'], (0, -1, 0), ports['nav'], (-1, 0, 0), 0.0025, *TAIL, step=0.02, hidden=False)
    cable('Coax: NAV antenna → splitter', 'Коаксиальный кабель: антенна VOR/LOC/GS — по килю и хвостовой балке к разветвителю', pts, 0.0025, 'rg400', col=COL_R, ends='bnc')
    way = V((0.05, 2.30, 0.38))                  # над стойкой авионики: из хвоста — в кабину под пол
    pts = route(ant['ny163'], (0, 0, -1), way, (0, -1, 0), 0.003, (-0.50, 2.20, -0.14), (0.50, 5.50, 1.40), step=0.02, hidden=False)
    pts2 = route(way, (0, -1, 0), wx_ant, (-1, 0, 0), 0.003, (-0.52, 0.40, -0.26), (0.52, 2.60, 0.62), step=0.02)
    cable('Stormscope antenna cable → WX-500', 'Кабель антенны NY-163 к процессору WX-500: по килю, хвостовой балке и под полом', pts + pts2[1:], 0.003, 'shield', col=COL_R)
    pts = route(rear['elt']['ant'], (0, -1, 0), rear['elt_ant'], (0, 1, 0), 0.0025, (-0.05, 1.80, -0.10), (0.25, 2.25, 0.50), step=0.01, hidden=False)
    cable('Coax: ELT antenna → ELT', 'Коаксиальный кабель антенны аварийного маяка', pts, 0.0025, 'rg400', col=COL_R, ends='bnc')
    pts = route(rear['elt']['rcs'], (0, -1, 0), rcs, (0, 1, 0), 0.0025, *CAB, step=0.02)
    cable('ELT remote switch cable', 'Кабель пульта ELT: маяк — пульт на приборной доске', pts, 0.0025, 'thin', col=COL_R)
    for key, ru in (('dme', 'KN 63'), ('adf', 'RA 3502')):
        pts = route(rear[key]['data'], (0, -1, 0), ports['aft'][0 if key == 'dme' else 1], (0, -1, 0), 0.003, (-0.25, 2.4, -0.05), (0.2, 3.1, 0.4), step=0.01)
        cable(f'{ru} data cable → GIA 63W', f'Кабель данных {ru} — GIA 63W', pts, 0.003, 'shield', col=COL_R)
    pts = route(wx_conn, (1, 0, 0), ports['fwd'][3], (0, 1, 0), 0.003, *CAB, step=0.02)
    cable('WX-500 data cable → GIA 63W', 'Кабель данных WX-500 — GIA 63W (RS-232), питание от шины авионики', pts, 0.003, 'shield', col=COL_R)


def check():
    for name, path, r in CHECKS:
        L = lib.path_len(path)
        n = max(8, int(L / 0.03))
        vis, worst = [], (9.0, None)
        for k in range(n + 1):
            q, _ = lib.along(path, L * k / n)
            if RT.seen(q, r):
                vis.append(round(L * k / n, 2))
            for tag, bvh in (('shell', R.shell), ('trim', TRIM), ('sys', SYS)):
                h = bvh.find_nearest(q, 0.5)
                if h[0] is not None and h[3] - r < worst[0]:
                    worst = (h[3] - r, (tag, tuple(round(v, 3) for v in q)))
        print(f'CHECK {name[:60]}: {len(vis)}/{n + 1} visible {vis[:5]}; min gap {worst[0] * 1000:.1f} mm {worst[1]}')
    for col in (COL_I, COL_R):
        for o in col.all_objects:
            if o.type != 'MESH' or any(o.name == c[0] for c in CHECKS):
                continue
            vs = [o.matrix_world @ v.co for v in o.data.vertices][::2]
            worst = (9.0, None)
            for tag, bvh in (('shell', R.shell), ('trim', TRIM), ('sys', SYS)):
                for q in vs:
                    h = bvh.find_nearest(q, 0.1)
                    if h[0] is not None and h[3] < worst[0]:
                        worst = (h[3], tag)
            vis = sum(1 for q in vs[::4] if RT.seen(q, 0.0))
            print(f'PART {o.name[:60]}: min gap {worst[0] * 1000:.1f} mm ({worst[1]}), visible verts {vis}/{len(vs[::4])}')


build()
if os.environ.get('CHECK'):
    check()
for col, fn in ((COL_I, 'da40-instruments-raw.glb'), (COL_R, 'da40-radio-raw.glb')):
    dup = [o.name for o in col.all_objects if '.0' in o.name[-4:]]
    assert not dup, dup
    out = os.path.join(OUT_DIR, fn)
    size = ref.export(col, out, R.lift)
    with open(os.path.splitext(out)[0] + '.labels.json', 'w') as fh:
        json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, fh, ensure_ascii=False, indent=1)
    print(f'LAYER_OK {out} {size / 1e6:.2f} MB, parts {len([o for o in col.all_objects if o.type in ("MESH", "CURVE")])}')
