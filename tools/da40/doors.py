"""Фонарь и задняя дверь DA 40 NG: навеска и замки — отдельный слой сайта.

    python3 tools/da40/doors.py [out.glb]

AMM 6.02.15 Rev. 3, 52-00, 52-10 (рис. 1, 2, 4); РЛЭ 7.8.

Фонарь (52-10 рис. 1–2). Рама фонаря спереди крепится к трубчатой стальной
раме навески двумя накладками на двух болтах каждая; рама навески — на двух
петлях на задней стороне противопожарной перегородки; газовый упор — от рамы
навески к низу перегородки. Ручка слева: внутренняя ручка с двойным рычагом,
наружная (красная) на штифтах, пружинный узел с переходом за мёртвую точку.
От заднего плеча рычага тяга идёт назад к левому засову, от переднего — тросик
в трубке по передней части рамы к правому засову. Засовы — в нижних задних углах
рамы, входят в полиэтиленовые (PTFE) колодки в обшивке фюзеляжа; второе
отверстие колодки — положение «щель для охлаждения» (РЛЭ 7.8.1). Засов,
уходя вперёд, нажимает микровыключатель сигнала DOOR OPEN в борту.

Задняя дверь (52-10 рис. 4). Две петли сверху у оси фюзеляжа (переднюю можно
снять изнутри — аварийный выход), газовый упор от кронштейна у заднего края
двери к фюзеляжу. Ручка слева: двойной рычаг, длинная тяга назад к заднему
засову, короткая — вперёд к переднему; передний засов нажимает
микровыключатель сигнала. Предохранитель от случайного открытия.

Геометрия рам — из исходной модели: нижняя кромка рамы фонаря и двери снимается
по вершинам рам, оси вращения — по пустышкам навески (Canopy, CanopyR).
"""
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Matrix, Vector as V  # noqa: E402

import lib  # noqa: E402
import ref  # noqa: E402
from lib import Part, basis, box, cyl, fillet, hexa, ring_tube, sweep  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-doors-raw.glb'

ref.open_source()
R = ref.Ref()
COL = lib.collection('DA40 Canopy and passenger door (AMM 52-10)')

M = dict(
    steel=lib.mat('DA40 canopy hinge frame (steel tube, painted)', (0.20, 0.21, 0.23), 0.5, 0.45, ru='стальная труба, окраска'),
    bolt=lib.mat('DA40 stainless steel', (0.62, 0.63, 0.65), 1.0, 0.28, ru='нержавеющая сталь'),
    alu=lib.mat('DA40 aluminium', (0.80, 0.81, 0.83), 1.0, 0.32, ru='алюминиевый сплав'),
    gas=lib.mat('DA40 gas spring (black)', (0.05, 0.05, 0.06), 0.6, 0.35, ru='газовый упор, стальной цилиндр'),
    rod=lib.mat('DA40 gas spring rod (chrome)', (0.85, 0.86, 0.88), 1.0, 0.12, ru='хромированный шток'),
    ptfe=lib.mat('DA40 PTFE block (white)', (0.94, 0.94, 0.92), 0.0, 0.5, ru='фторопласт (PTFE)'),
    red=lib.mat('DA40 red handle', (0.72, 0.06, 0.05), 0.1, 0.4, ru='красная окраска'),
    black=lib.mat('DA40 black anodised', (0.05, 0.05, 0.06), 0.6, 0.4, ru='алюминий, чёрное анодирование'),
    cable=lib.mat('DA40 teleflex cable (black sleeve)', (0.06, 0.06, 0.07), 0.0, 0.6, ru='трос в оплётке'),
    switch=lib.mat('DA40 micro-switch (grey)', (0.35, 0.36, 0.38), 0.2, 0.5, ru='микровыключатель'),
)


def P(name, ru, m, doc='AMM 52-10'):
    return Part(name, ru, M[m], COL, True, doc)


# ── Нижние кромки рам из исходной модели ─────────────────────────────────

def frame_meshes(empties):
    out = []
    for n in empties:
        o = bpy.data.objects.get(n)
        for c in o.children_recursive:
            if c.type == 'MESH' and len(c.data.vertices) > 400 and not any(m and 'Glass' in m.name for m in c.data.materials):
                out.append(c)
    return out


def bottom_edge(meshes, side, y0, y1, step=0.05, xmin=0.3):
    """Нижняя кромка рамы на борту side: по шагу y — самая нижняя вершина у борта."""
    pts = [m.matrix_world @ v.co for m in meshes for v in m.data.vertices]
    pts = [p for p in pts if p.x * side > xmin and -1.5 < p.z < 1.5 and y0 - step < p.y < y1 + step]
    b = collections.defaultdict(list)
    for p in pts:
        b[round((p.y - y0) / step)].append(p)
    out = []
    for k in sorted(b):
        y = y0 + k * step
        if y < y0 - 1e-6 or y > y1 + 1e-6:
            continue
        q = min(b[k], key=lambda p: p.z)
        out.append(V((q.x, y, q.z)))
    # сглаживание: у рамы есть уступы и выемки, кромка по вершинам «дрожит»
    sm = []
    for i in range(len(out)):
        w = out[max(0, i - 2):i + 3]
        c = sum(w, V()) / len(w)
        sm.append(V((c.x, out[i].y, c.z)))
    return sm


def inside(p, side, dx=0.022, dz=0.022):
    """Точка внутри профиля рамы: от наружной нижней кромки внутрь и вверх."""
    return V((p.x - side * dx, p.y, p.z + dz))


CANOPY = frame_meshes(['Canopy', 'Canopy.001'])
DOOR = frame_meshes(['BONE_1', 'BONE_2.001'])
C_EDGE = {s: bottom_edge(CANOPY, s, -0.80, 0.15) for s in (1, -1)}     # борта рамы фонаря
D_EDGE = bottom_edge(DOOR, 1, 0.30, 1.35)                             # низ задней двери (левый борт)


def tube(p, pts, r, mi=0, bend=0.03):
    path = fillet(pts, bend)
    sweep(p, path, r, mi, segs=12)
    return path


def bolt_y(p, c, d, length, r, head=True):
    """Засов: стальной стержень вдоль d с конической головкой и втулкой PTFE."""
    a, b = c - d * (length / 2), c + d * (length / 2)
    cyl(p, a, b - d * 0.012, r, p.m(M['bolt']), segs=14)
    cyl(p, b - d * 0.012, b, r, p.m(M['bolt']), segs=14, r1=r * 0.45)
    ring_tube(p, a + d * (length * 0.35), d, r + 0.004, r, length * 0.4, p.m(M['ptfe']), segs=16)


def ptfe_block(name, ru, c, d, cooling_gap=False):
    p = P(name, ru, 'ptfe', 'AMM 52-10 рис. 2, РЛЭ 7.8.1')
    box(p, c, (0.024, 0.030, 0.044), basis(d), 0, bevel=0.003)
    ring_tube(p, c - d * 0.016, d, 0.0085, 0.0062, 0.003, p.m(M['bolt']), segs=14)
    if cooling_gap:
        # второе гнездо — фонарь фиксируется приоткрытым («щель для охлаждения»)
        ring_tube(p, c - d * 0.016 + V((0, 0, 0.019)), d, 0.0085, 0.0062, 0.003, p.m(M['bolt']), segs=14)
    for dz in (-0.016, 0.016):
        q = c + V((0, 0, dz))
        hexa(p, q + V((0.013 if c.x > 0 else -0.013, 0, 0)), q + V((0.017 if c.x > 0 else -0.017, 0, 0)), 0.007, p.m(M['bolt']))
    p.done()


def micro_switch(name, ru, c):
    p = P(name, ru, 'switch', 'AMM 52-10 2.D, рис. 2')
    box(p, c, (0.012, 0.028, 0.018), Matrix.Identity(3), 0, bevel=0.002)
    box(p, c + V((0, -0.016, 0.004)), (0.004, 0.012, 0.002), Matrix.Identity(3), p.m(M['bolt']))   # рычажок
    for dz in (-0.005, 0.005):
        cyl(p, c + V((0, 0.006, dz)), c + V((0, 0.006, dz)) + V((0.014 if c.x > 0 else -0.014, 0, 0)), 0.0016, p.m(M['bolt']), segs=8)
    p.done()


# ── Фонарь ────────────────────────────────────────────────────────────────

PIVOT = bpy.data.objects['Canopy'].matrix_world.translation.copy()   # ось открытия фонаря (исходная модель)
FW_REAR = -1.176                                                     # задняя грань перегородки
HINGE_X = 0.30
HINGE_Z = 0.41                                                       # выше блока EECU на перегородке
ATTACH = [V((s * 0.26, -1.064, 0.432)) for s in (1, -1)]             # передние приливы рамы фонаря


def canopy():
    # петли на перегородке и рама навески
    p = P('Canopy hinges (firewall)', 'Петли рамы навески фонаря на задней стороне противопожарной перегородки', 'alu', 'AMM 52-10 2.B, рис. 1')
    hinge = {}
    for s in (1, -1):
        c = V((s * HINGE_X, FW_REAR + 0.022, HINGE_Z))
        hinge[s] = c
        box(p, V((c.x, FW_REAR + 0.004, c.z)), (0.05, 0.008, 0.06), Matrix.Identity(3), 0, bevel=0.002)        # пластина на перегородке
        for dx in (-0.012, 0.012):
            box(p, V((c.x + dx, FW_REAR + 0.015, c.z)), (0.005, 0.022, 0.03), Matrix.Identity(3), 0, bevel=0.001)  # щёки
        cyl(p, c - V((0.02, 0, 0)), c + V((0.02, 0, 0)), 0.004, p.m(M['bolt']), segs=10)                    # ось
        for dx, dz in ((-0.017, -0.022), (0.017, -0.022), (-0.017, 0.022), (0.017, 0.022)):
            q = V((c.x + dx, FW_REAR + 0.008, c.z + dz))
            hexa(p, q, q + V((0, 0.004, 0)), 0.007, p.m(M['bolt']))
    p.done()
    f = P('Canopy hinge frame', 'Рама навески фонаря: стальная трубчатая рама; спереди к ней на двух накладках крепится рама фонаря, сзади она поворачивается на петлях перегородки — фонарь открывается вверх-вперёд',
          'steel', 'AMM 52-10 2.B, рис. 1')
    tube(f, [hinge[1], hinge[-1]], 0.009, bend=0.02)
    for s in (1, -1):
        a = ATTACH[0 if s > 0 else 1]
        h = hinge[s]
        tube(f, [h, h + V((-s * 0.01, 0.03, 0.03)), a + V((0, -0.02, -0.03)), a + V((0, 0.0, -0.008))], 0.009, bend=0.025)
        # накладка крепления рамы фонаря: два болта
        box(f, a + V((0, 0.0, 0.0)), (0.05, 0.03, 0.005), Matrix.Identity(3), f.m(M['alu']), bevel=0.001)
        for dx in (-0.014, 0.014):
            hexa(f, a + V((dx, 0, 0.0025)), a + V((dx, 0, 0.0075)), 0.008, f.m(M['bolt']))
            cyl(f, a + V((dx, 0, 0.0)), a + V((dx, 0, -0.016)), 0.0025, f.m(M['bolt']), segs=8)
    f.done()
    # газовый упор: от поперечины рамы навески к низу перегородки
    top = V((0.205, FW_REAR + 0.030, HINGE_Z - 0.004))
    bot = V((0.345, FW_REAR + 0.022, 0.06))
    d = (bot - top).normalized()
    g = P('Canopy gas spring strut', 'Газовый упор фонаря: держит фонарь открытым; верх — на раме навески, низ — на кронштейне внизу перегородки',
          'gas', 'AMM 52-10 2.B, рис. 1')
    L = (bot - top).length
    cyl(g, top + d * 0.02, top + d * (L * 0.45), 0.004, g.m(M['rod']), segs=12)
    cyl(g, top + d * (L * 0.45), bot - d * 0.02, 0.0105, 0, segs=18)
    for q in (top, bot):
        lib.sphere(g, q, 0.007, g.m(M['bolt']), segs=10, rings=5)
    box(g, bot + V((0, -0.012, -0.006)), (0.03, 0.008, 0.03), Matrix.Identity(3), g.m(M['alu']), bevel=0.001)
    g.done()

    # механизм замка: ручка слева, двойной рычаг, тяга к левому засову, тросик к правому
    eL = C_EDGE[1]
    hp = inside(min(eL, key=lambda q: abs(q.y + 0.37)), 1)            # ось ручки (y ≈ −0.37)
    k = P('Canopy handle double lever and spring box', 'Двойной рычаг внутренней ручки фонаря и пружинный узел: ручка держится закрытой переходом за мёртвую точку; сзади — тяга к левому засову, спереди — тросик к правому',
          'black', 'AMM 52-10 2.D, рис. 2')
    box(k, hp, (0.012, 0.075, 0.008), Matrix.Identity(3), 0, bevel=0.002)
    cyl(k, hp - V((0.012, 0, 0)), hp + V((0.012, 0, 0)), 0.004, k.m(M['bolt']), segs=10)
    sb = hp + V((-0.006, -0.05, -0.006))
    cyl(k, sb, sb + V((0, 0.05, 0.004)), 0.0065, k.m(M['bolt']), segs=12)                 # пружинный узел
    lib.torus(k, sb + V((0, 0.025, 0.002)), (0, 1, 0.08), 0.0065, 0.0015, k.m(M['bolt']), segs=16, rsegs=6)
    k.done()
    o = P('Canopy outer handle (red)', 'Наружная ручка фонаря (красная) на штифтах к внутренней; рядом — замок под ключ (РЛЭ 7.8.1: перед полётом на ключ не запирать)',
          'red', 'AMM 52-10 2.D, рис. 2; РЛЭ 7.8.1')
    oh = hp + V((0.026, 0.0, -0.002))
    box(o, oh, (0.008, 0.07, 0.014), Matrix.Identity(3), 0, bevel=0.003)
    cyl(o, oh + V((0, 0.05, 0)), oh + V((0.004, 0.05, 0)), 0.006, o.m(M['bolt']), segs=12)      # личинка замка
    o.done()
    # засовы в нижних задних углах рамы
    bolt_pos = {}
    for s in (1, -1):
        e = C_EDGE[s]
        # засов чуть впереди заднего угла: за углом в борту проходит воздуховод к дуге (air.py)
        c = inside(e[-1], s, dx=0.018, dz=0.016) - V((0, 0.11, 0))
        bolt_pos[s] = c
        q = P(f'Canopy locking bolt {"LH" if s > 0 else "RH"}', f'Засов фонаря, {"левый" if s > 0 else "правый"}: в нижнем заднем углу рамы, в полиэтиленовой втулке; входит назад в колодку на борту, уходя вперёд — открывает',
              'bolt', 'AMM 52-10 2.D, рис. 2')
        bolt_y(q, c, V((0, 1, 0)), 0.075, 0.0055)
        q.done()
        blk = c + V((0, 0.06, 0))
        ptfe_block(f'Canopy locking bolt PTFE block {"LH" if s > 0 else "RH"}',
                   f'Колодка засова фонаря в обшивке фюзеляжа, {"левая" if s > 0 else "правая"}: два гнезда — закрыто и «щель для охлаждения»',
                   blk, V((0, 1, 0)), cooling_gap=True)
        micro_switch(f'Canopy unlocked warning micro-switch {"LH" if s > 0 else "RH"}',
                     f'Микровыключатель сигнала DOOR OPEN в {"левом" if s > 0 else "правом"} борту: срабатывает, когда засов уходит вперёд',
                     blk + V((-s * 0.006, -0.02, -0.032)))
    # тяга к левому засову
    r = P('Canopy locking connecting rod', 'Тяга от заднего плеча двойного рычага к левому засову фонаря', 'bolt', 'AMM 52-10 2.D, рис. 2')
    a = hp + V((0, 0.035, 0))
    pts = [a, bolt_pos[1] - V((0, 0.04, 0))]                 # тяга прямая
    tube(r, pts, 0.003, bend=0.02)
    for q in (pts[0], pts[-1]):
        lib.sphere(r, q, 0.005, 0, segs=10, rings=5)
    r.done()
    # тросик: вперёд по левому борту, поперёк передней части рамы, назад по правому
    t = P('Canopy teleflex cable to RH locking bolt', 'Тросик в оплётке от переднего плеча двойного рычага по передней части рамы фонаря к правому засову',
          'cable', 'AMM 52-10 2.D, рис. 2')
    b = hp - V((0, 0.035, 0))
    left = [inside(q, 1) for q in reversed(eL[::2]) if q.y < b.y - 0.04]
    # передняя часть рамы — чуть ниже и позади нижней кромки остекления
    front = [V((0.45, -0.90, 0.505)), V((0.40, -0.925, 0.525)), V((0.22, -0.99, 0.576)), V((0.0, -1.008, 0.592)),
             V((-0.22, -0.99, 0.576)), V((-0.40, -0.925, 0.525)), V((-0.45, -0.90, 0.505))]
    right = [inside(q, -1) for q in C_EDGE[-1][::2] if q.y < bolt_pos[-1].y - 0.06]
    pts = [b] + left + front + right + [bolt_pos[-1] - V((0, 0.04, 0))]
    tube(t, pts, 0.0032, bend=0.05)
    t.done()


# ── Задняя дверь ──────────────────────────────────────────────────────────

D_PIVOT = bpy.data.objects['CanopyR'].matrix_world.translation.copy()   # ось петель двери (исходная модель)


def door():
    p = P('Passenger door hinges', 'Петли задней двери сверху у оси фюзеляжа; переднюю можно снять изнутри — тогда дверь выдавливают вверх как аварийный выход',
          'alu', 'AMM 52-10 3.A, рис. 4')
    for y in (D_PIVOT.y - 0.18, D_PIVOT.y + 0.50):
        c = V((D_PIVOT.x, y, D_PIVOT.z - 0.012))
        box(p, c + V((-0.02, 0, 0.004)), (0.04, 0.04, 0.006), Matrix.Identity(3), 0, bevel=0.002)       # лист на фюзеляже
        box(p, c + V((0.03, 0, -0.004)), (0.05, 0.03, 0.005), Matrix.Identity(3), 0, bevel=0.002)       # лист на двери
        cyl(p, c - V((0, 0.025, 0)), c + V((0, 0.025, 0)), 0.005, p.m(M['bolt']), segs=12)                 # ось
        for dx in (-0.03, 0.04):
            hexa(p, c + V((dx, 0, 0.005)), c + V((dx, 0, 0.010)), 0.007, p.m(M['bolt']))
    p.done()
    # газовый упор: кронштейн у заднего края двери — фюзеляж
    fu = V((0.17, D_PIVOT.y + 0.70, D_PIVOT.z - 0.05))
    dr = V((0.44, D_PIVOT.y + 0.68, 0.62))
    d = (dr - fu).normalized()
    L = (dr - fu).length
    g = P('Passenger door gas spring strut', 'Газовый упор задней двери: от кронштейна у заднего края двери к фюзеляжу; держит дверь открытой, при сильном ветре дверь надо придерживать (РЛЭ 7.8.2)',
          'gas', 'AMM 52-10 3.A, рис. 4; РЛЭ 7.8.2')
    cyl(g, fu + d * 0.02, fu + d * (L * 0.5), 0.0105, 0, segs=18)
    cyl(g, fu + d * (L * 0.5), dr - d * 0.02, 0.004, g.m(M['rod']), segs=12)
    for q in (fu, dr):
        lib.sphere(g, q, 0.007, g.m(M['bolt']), segs=10, rings=5)
        box(g, q + V((0, 0.012, 0)), (0.02, 0.008, 0.024), Matrix.Identity(3), g.m(M['alu']), bevel=0.001)
    g.done()
    # механизм замка
    hp = inside(min(D_EDGE, key=lambda q: abs(q.y - 0.47)), 1)
    k = P('Passenger door handle double lever', 'Двойной рычаг внутренней ручки задней двери: назад — длинная тяга к заднему засову, вперёд — короткая к переднему',
          'black', 'AMM 52-10 3.A, рис. 4')
    box(k, hp, (0.012, 0.07, 0.008), Matrix.Identity(3), 0, bevel=0.002)
    cyl(k, hp - V((0.012, 0, 0)), hp + V((0.012, 0, 0)), 0.004, k.m(M['bolt']), segs=10)
    sb = hp + V((-0.006, 0.0, -0.008))
    lib.torus(k, sb, (0, 0, 1), 0.006, 0.0015, k.m(M['bolt']), segs=14, rsegs=6)                    # пружина ручки
    k.done()
    o = P('Passenger door outer handle (red) and safety lock', 'Наружная красная ручка задней двери и предохранитель: изнутри предохранитель поднимают, снаружи нажимают кнопку рядом с ручкой; замок под ключ',
          'red', 'AMM 52-10 3.A, рис. 4; РЛЭ 7.8.2')
    oh = hp + V((0.026, 0, -0.002))
    box(o, oh, (0.008, 0.065, 0.014), Matrix.Identity(3), 0, bevel=0.003)
    sl = hp + V((-0.004, 0.05, 0.016))
    box(o, sl, (0.012, 0.018, 0.016), Matrix.Identity(3), o.m(M['black']), bevel=0.002)             # предохранитель
    o.done()
    front_c = inside(D_EDGE[0], 1, dx=0.018, dz=0.016) + V((0, 0.02, 0))
    rear_c = inside(D_EDGE[-1], 1, dx=0.018, dz=0.016) - V((0, 0.02, 0))
    for nm, ru, c, dv in (('Passenger door front locking bolt', 'Передний засов задней двери: в нижнем переднем углу, входит вперёд в колодку на борту; уходя назад, нажимает микровыключатель сигнала', front_c, V((0, -1, 0))),
                          ('Passenger door rear locking bolt', 'Задний засов задней двери: в нижнем заднем углу, входит назад в колодку на борту', rear_c, V((0, 1, 0)))):
        q = P(nm, ru, 'bolt', 'AMM 52-10 3.A, рис. 4')
        bolt_y(q, c, dv, 0.065, 0.0055)
        q.done()
    ptfe_block('Passenger door front PTFE block', 'Колодка переднего засова задней двери в обшивке фюзеляжа', front_c + V((0, -0.055, 0)), V((0, -1, 0)))
    ptfe_block('Passenger door rear PTFE block', 'Колодка заднего засова задней двери в обшивке фюзеляжа', rear_c + V((-0.012, 0.055, 0)), V((0, 1, 0)))
    micro_switch('Passenger door unlocked warning micro-switch', 'Микровыключатель сигнала DOOR OPEN у переднего засова задней двери',
                 front_c + V((-0.006, -0.035, -0.030)))
    r = P('Passenger door long connecting rod', 'Длинная тяга задней двери: от двойного рычага к заднему засову', 'bolt', 'AMM 52-10 3.A, рис. 4')
    a = hp + V((0, 0.033, 0))
    pts = [a, rear_c - V((0, 0.035, 0))]                       # тяга прямая
    tube(r, pts, 0.003, bend=0.02)
    r.done()
    r = P('Passenger door short connecting rod', 'Короткая тяга задней двери: от двойного рычага к переднему засову', 'bolt', 'AMM 52-10 3.A, рис. 4')
    a = hp - V((0, 0.033, 0))
    tube(r, [a, front_c + V((0, 0.035, 0))], 0.003, bend=0.02)
    r.done()


canopy()
door()

dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'DOORS_OK {OUT} {size / 1e6:.2f} MB, parts {len([o for o in COL.all_objects if o.type == "MESH"])}')
print('C_EDGE L', [tuple(round(c, 3) for c in q) for q in C_EDGE[1]][:3], '…', tuple(round(c, 3) for c in C_EDGE[1][-1]))
print('D_EDGE', [tuple(round(c, 3) for c in q) for q in D_EDGE][:2], '…', tuple(round(c, 3) for c in D_EDGE[-1]))
print('PIVOTS', tuple(round(c, 3) for c in PIVOT), tuple(round(c, 3) for c in D_PIVOT))
