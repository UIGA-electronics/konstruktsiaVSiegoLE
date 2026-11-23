"""Фонарь и задняя дверь DA 40 NG: навеска и замки — отдельный слой сайта.

    python3 tools/da40/doors.py [out.glb]

AMM 6.02.15 Rev. 3, 52-00, 52-10 (рис. 1, 2, 4); РЛЭ 7.8.

Фонарь (52-10 рис. 1–2). Рама фонаря спереди крепится к трубчатой стальной
раме навески двумя накладками на двух болтах каждая; рама навески — на двух
петлях на задней стороне противопожарной перегородки; газовый упор — от рамы
навески к низу перегородки. Ручка слева: внутренняя ручка с двойным рычагом,
наружная (красная) на штифтах, пружинный узел с переходом за мёртвую точку.
От заднего плеча рычага тяга идёт назад к левому стопорному болту, от переднего — тросик
в трубке по передней части рамы к правому стопорному болту. Стопорные болты — в нижних задних углах
рамы, входят в полиэтиленовые (PTFE) колодки в обшивке фюзеляжа; второе
отверстие колодки — положение «щель для охлаждения» (РЛЭ 7.8.1). Стопорный болт,
уходя вперёд, нажимает микровыключатель сигнала DOOR OPEN в борту.

Задняя дверь (52-10 рис. 4). Две петли сверху у оси фюзеляжа (переднюю можно
снять изнутри — аварийный выход), газовый упор от кронштейна у заднего края
двери к фюзеляжу. Ручка слева: двойной рычаг, длинная тяга назад к заднему
стопорному болту, короткая — вперёд к переднему; передний стопорный болт нажимает
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
    """Стопорный болт: стальной стержень вдоль d с конической головкой и втулкой PTFE."""
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

PIVOT = bpy.data.objects['Canopy'].matrix_world.translation.copy()   # ось открытия фонаря в анимации MSFS (на сайте не анимируется)
FW_REAR = -1.181                                                     # задняя грань перегородки (стеклопластиковая панель, structure.py)
# Рама навески (рис. 1): поперечная труба на двух петлях задней грани перегородки; от её концов стойки поднимаются назад-вверх
# к передней кромке рамы фонаря, там на каждой стойке накладка — к раме фонаря она крепится двумя болтами снизу (52-10 2.C).
# Стойки — по гнутым полосам салона MSFS (ShellVI.001: накладка под рамой фонаря на y −0,95, z 0,57, полоса вниз-вперёд до
# z 0,42, y −1,08); полосы MSFS ничем не соединялись с перегородкой — здесь стойки продолжены вперёд до поперечной трубы.
ARM_X = 0.2615                                                       # плоскость стоек (середина полос MSFS: x 0,253…0,270)
HINGE_X = 0.215                                                      # петли — сразу внутри от стоек
AXIS_Y = FW_REAR + 0.024                                             # ось петель = ось поперечной трубы
AXIS_Z = 0.426                                                       # на высоте нижних концов полос MSFS; верх перегородки здесь ≈ 0,53
ARM_YZ = [(-0.947, 0.552), (-0.954, 0.515), (-0.961, 0.496), (-0.969, 0.479), (-0.981, 0.464), (-0.997, 0.451),
          (-1.019, 0.439), (-1.050, 0.430), (-1.085, 0.4265)]       # осевая линия полосы MSFS сверху вниз (y, z)
CANOPY_FRAME = ref._bvh([bpy.data.objects[n] for n in ('Cube.004_Cube.106.048', 'Cube.004_Cube.106.004')])   # рама фонаря (оболочка)
ATTACH = {}                                                          # накладки рамы фонаря: центр и нормаль к раме


def canopy():
    # петли на перегородке: пластина на четырёх болтах и проушина с втулкой — в ней поворачивается поперечная труба
    p = P('Canopy hinges (firewall)', 'Петли рамы навески фонаря на задней грани противопожарной перегородки: пластина на четырёх болтах '
          'и проушина с втулкой — в ней поворачивается поперечная труба рамы навески', 'alu', 'AMM 52-10 2.B, рис. 1')
    hinge = {}
    for s in (1, -1):
        c = V((s * HINGE_X, AXIS_Y, AXIS_Z))
        hinge[s] = c
        box(p, V((c.x, FW_REAR + 0.004, c.z)), (0.05, 0.008, 0.06), Matrix.Identity(3), 0, bevel=0.002)          # пластина на перегородке
        box(p, V((c.x, (FW_REAR + 0.008 + c.y - 0.012) / 2, c.z)), (0.020, c.y - 0.012 - FW_REAR - 0.008 + 0.004, 0.028),
            Matrix.Identity(3), 0, bevel=0.002)                                                                     # ребро к проушине
        ring_tube(p, c, V((1, 0, 0)), 0.019, 0.0102, 0.024, 0, segs=24)                                            # проушина с втулкой
        for dx, dz in ((-0.017, -0.022), (0.017, -0.022), (-0.017, 0.022), (0.017, 0.022)):
            q = V((c.x + dx, FW_REAR + 0.008, c.z + dz))
            hexa(p, q, q + V((0, 0.004, 0)), 0.007, p.m(M['bolt']))
    p.done()
    f = P('Canopy hinge frame', 'Рама навески фонаря: стальная трубчатая рама — поперечная труба поворачивается в петлях на задней грани '
          'перегородки, от её концов стойки поднимаются назад-вверх к передней кромке рамы фонаря; на каждой стойке накладка, к раме '
          'фонаря она крепится двумя болтами снизу. Фонарь открывается вверх-вперёд вместе с рамой навески',
          'steel', 'AMM 52-10 2.B, 2.C, рис. 1')
    # поперечная труба: справа загибается в правую стойку, слева выходит за левую стойку — там рычаг газового упора
    x_left = ARM_X + 0.075
    tube(f, [V((x_left, AXIS_Y, AXIS_Z)), V((-ARM_X, AXIS_Y, AXIS_Z))], 0.0095, bend=0.02)
    cyl(f, V((x_left, AXIS_Y, AXIS_Z)), V((x_left + 0.003, AXIS_Y, AXIS_Z)), 0.0095, 0, segs=16)              # заглушка
    for s in (1, -1):
        x = s * ARM_X
        pts = [V((x, AXIS_Y, AXIS_Z)), V((x, -1.110, AXIS_Z))] + [V((x, y, z)) for y, z in reversed(ARM_YZ)]
        # верх стойки — под рамой фонаря: луч вверх (задний край рамы — y ≈ −0,95, накладка — впереди него)
        hit = CANOPY_FRAME.ray_cast(V((x, -0.970, 0.50)), V((0, 0, 1)), 0.3)
        assert hit[0] is not None, ('canopy frame', x)
        nrm = hit[1] if hit[1].z > 0 else -hit[1]
        plate_c = hit[0] - nrm * 0.0035
        pts[-1] = plate_c - nrm * 0.012
        tube(f, pts, 0.0085, bend=0.03)
        # накладка: приварена к верху стойки, прилегает к раме фонаря снизу; два болта снизу с шайбами — головки под накладкой,
        # гайки внутри рамы фонаря (оболочка модели тонкая: гайки над ней торчали бы из рамы у основания стекла)
        Rm = basis(nrm, up=V((0, 1, 0)))
        box(f, plate_c, (0.034, 0.040, 0.006), Rm, f.m(M['alu']), bevel=0.0015)
        e_y = (Rm @ V((0, 1, 0))).normalized()
        for k in (-1, 1):
            q = plate_c + e_y * (k * 0.012)
            cyl(f, q - nrm * 0.003, q - nrm * 0.0042, 0.0062, f.m(M['bolt']), segs=12)                          # шайба
            hexa(f, q - nrm * 0.0042, q - nrm * 0.0092, 0.009, f.m(M['bolt']))                                  # головка снизу
            cyl(f, q - nrm * 0.003, q + nrm * 0.0028, 0.003, f.m(M['bolt']), segs=8)                            # стержень в раму
        ATTACH[s] = (plate_c, nrm)
    # рис. 1: газовый упор — на шпильке у левого конца поперечной трубы; рычаг вниз от оси, чтобы упор работал
    lev_a = V((x_left - 0.006, AXIS_Y, AXIS_Z))
    lev_b = lev_a + V((0.0, 0.006, -0.034))
    box(f, (lev_a + lev_b) / 2, (0.006, 0.020, (lev_b - lev_a).length + 0.016), basis(lev_b - lev_a, up=V((1, 0, 0))), 0, bevel=0.002)
    f.done()
    # газовый упор: от рычага на конце поперечной трубы рамы навески (рис. 1) к кронштейну внизу перегородки
    top = lev_b + V((0.010, 0.0, 0.0))
    bot = V((top.x, FW_REAR + 0.022, 0.06))
    d = (bot - top).normalized()
    g = P('Canopy gas spring strut', 'Газовый упор фонаря: держит фонарь открытым; верх — на шпильке рычага у левого конца поперечной '
          'трубы рамы навески, низ — на кронштейне внизу перегородки', 'gas', 'AMM 52-10 2.B, рис. 1')
    L = (bot - top).length
    cyl(g, top + d * 0.02, top + d * (L * 0.45), 0.004, g.m(M['rod']), segs=12)
    cyl(g, top + d * (L * 0.45), bot - d * 0.02, 0.0105, 0, segs=18)
    for q in (top, bot):
        lib.sphere(g, q, 0.007, g.m(M['bolt']), segs=10, rings=5)
    cyl(g, top - V((0.012, 0, 0)), top + V((0.004, 0, 0)), 0.0035, g.m(M['bolt']), segs=10)          # шпилька на рычаге
    hexa(g, top + V((0.004, 0, 0)), top + V((0.009, 0, 0)), 0.009, g.m(M['bolt']))                  # гайка с шайбой
    # кронштейн на перегородке: пластина на двух болтах и проушина под шаровую опору
    box(g, V((bot.x, FW_REAR + 0.004, bot.z - 0.004)), (0.032, 0.008, 0.040), Matrix.Identity(3), g.m(M['alu']), bevel=0.0015)
    box(g, V((bot.x, FW_REAR + 0.014, bot.z)), (0.016, 0.016, 0.010), Matrix.Identity(3), g.m(M['alu']), bevel=0.001)
    for dz in (-0.016, 0.010):
        q = V((bot.x - 0.010 if dz > 0 else bot.x + 0.010, FW_REAR + 0.008, bot.z + dz))
        hexa(g, q, q + V((0, 0.004, 0)), 0.007, g.m(M['bolt']))
    g.done()
    print('CANOPY hinge axis', (round(AXIS_Y, 3), AXIS_Z), 'attach', {k: tuple(round(c, 3) for c in v[0]) for k, v in ATTACH.items()},
          'strut', tuple(round(c, 3) for c in top), tuple(round(c, 3) for c in bot))

    # механизм замка: ручка слева, двойной рычаг, тяга к левому стопорному болту, тросик к правому
    eL = C_EDGE[1]
    hp = inside(min(eL, key=lambda q: abs(q.y + 0.37)), 1)            # ось ручки (y ≈ −0.37)
    k = P('Canopy handle double lever and spring box', 'Двойной рычаг внутренней ручки фонаря и пружинный узел: ручка держится закрытой переходом за мёртвую точку; сзади — тяга к левому стопорному болту, спереди — тросик к правому',
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
    # стопорные болты в нижних задних углах рамы
    bolt_pos = {}
    for s in (1, -1):
        e = C_EDGE[s]
        # стопорный болт чуть впереди заднего угла: за углом в борту проходит воздуховод к дуге (air.py)
        c = inside(e[-1], s, dx=0.018, dz=0.016) - V((0, 0.11, 0))
        bolt_pos[s] = c
        q = P(f'Canopy locking bolt {"LH" if s > 0 else "RH"}', f'Стопорный болт фонаря, {"левый" if s > 0 else "правый"}: в нижнем заднем углу рамы, в полиэтиленовой втулке; входит назад в колодку на борту, уходя вперёд — открывает',
              'bolt', 'AMM 52-10 2.D, рис. 2')
        bolt_y(q, c, V((0, 1, 0)), 0.075, 0.0055)
        q.done()
        blk = c + V((0, 0.06, 0))
        ptfe_block(f'Canopy locking bolt PTFE block {"LH" if s > 0 else "RH"}',
                   f'Колодка стопорного болта фонаря в обшивке фюзеляжа, {"левая" if s > 0 else "правая"}: два гнезда — закрыто и «щель для охлаждения»',
                   blk, V((0, 1, 0)), cooling_gap=True)
        micro_switch(f'Canopy unlocked warning micro-switch {"LH" if s > 0 else "RH"}',
                     f'Микровыключатель сигнала DOOR OPEN в {"левом" if s > 0 else "правом"} борту: срабатывает, когда стопорный болт уходит вперёд',
                     blk + V((-s * 0.006, -0.02, -0.032)))
    # тяга к левому стопорному болту
    r = P('Canopy locking connecting rod', 'Тяга от заднего плеча двойного рычага к левому стопорному болту фонаря', 'bolt', 'AMM 52-10 2.D, рис. 2')
    a = hp + V((0, 0.035, 0))
    pts = [a, bolt_pos[1] - V((0, 0.04, 0))]                 # тяга прямая
    tube(r, pts, 0.003, bend=0.02)
    for q in (pts[0], pts[-1]):
        lib.sphere(r, q, 0.005, 0, segs=10, rings=5)
    r.done()
    # тросик: вперёд по левому борту, поперёк передней части рамы, назад по правому
    t = P('Canopy teleflex cable to RH locking bolt', 'Тросик в оплётке от переднего плеча двойного рычага по передней части рамы фонаря к правому стопорному болту',
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


DOOR_PTS = [m.matrix_world @ v.co for m in DOOR for v in m.data.vertices]
DOOR_BVH = ref._bvh(DOOR)
TRIM_BVH = ref._bvh([o for o in bpy.data.collections['DA40 Interior'].all_objects
                     if o.type == 'MESH' and not o.hide_render and not any(m and 'Glass' in m.name for m in o.data.materials)])


def door_top_edge(y, band=0.012):
    """Верхняя (внутренняя у оси фюзеляжа) кромка рамы задней двери на станции y — по вершинам рамы MSFS."""
    pts = [q for q in DOOR_PTS if abs(q.y - y) < band and q.z > 0.6]
    return min(pts, key=lambda q: q.x)


def roof_point(x, y):
    """Точка и наружная нормаль обшивки (крыша или дверь) сверху над (x, y)."""
    loc, nor = R.hit((x, y, 2.0), (0, 0, -1))
    if nor.z < 0:
        nor = -nor
    return loc, nor


def leaf(p, a, b, n, d, width=0.042, t=0.003, mi=0, screws=2):
    """Лист петли от a к b по обшивке с нормалью n; ширина — вдоль оси петли d."""
    u = (b - a)
    u = (u - n * u.dot(n)).normalized()
    L = (b - a).length
    dd = (d - n * d.dot(n) - u * d.dot(u)).normalized()
    c = (a + b) / 2 + n * (t / 2 + 0.0004)
    box(p, c, (L, width, t), Matrix((u, dd, n)).transposed(), mi, bevel=0.0008)
    for k in range(screws):
        q = a + (b - a) * ((k + 1) / (screws + 1)) + n * (t + 0.0004)
        cyl(p, q, q + n * 0.0016, 0.0035, p.m(M['bolt']), segs=10)


def door():
    # петли (AMM 52-10 рис. 4–5): плоские, снаружи на верхней кромке двери; лист на крыше, лист на двери, шарнир по
    # линии зазора. Линия зазора идёт вдоль крыши и к хвосту опускается (у передней петли z 0,96, у задней 0,85) —
    # ось петель наклонная, а не горизонтальная, как была
    ys = (D_PIVOT.y - 0.18, D_PIVOT.y + 0.50)
    edges = [door_top_edge(y) for y in ys]
    axis = (edges[1] - edges[0]).normalized()
    p = P('Passenger door hinges', 'Петли задней двери: две плоские петли на верхней кромке двери у оси фюзеляжа — лист на крыше, '
          'лист на двери, шарнир по линии зазора; переднюю можно снять изнутри — тогда дверь выдавливают вверх как аварийный выход',
          'alu', 'AMM 52-10 3.A, рис. 4, 5')
    def surf_near(x, y, step):
        # прямо по линии зазора луч сверху проходит в щель и падает на днище — шагаем от зазора, пока не попадём в крышу/дверь
        for k in range(15):
            loc, nor = roof_point(x + step * k, y)
            if loc is not None and loc.z > 0.6:
                return loc, nor
        raise SystemExit(f'нет обшивки у петли x {x:.3f} y {y:.3f}')
    for e in edges:
        ka, na = surf_near(e.x - 0.006, e.y, -0.002)                                                      # край крыши
        kb, nb = surf_near(e.x + 0.006, e.y, 0.002)                                                       # край двери
        n0 = (na + nb).normalized()
        knuckle = (ka + kb) / 2 + n0 * 0.0045
        cyl(p, knuckle - axis * 0.024, knuckle + axis * 0.024, 0.0045, 0, segs=14)
        cyl(p, knuckle - axis * 0.027, knuckle + axis * 0.027, 0.0018, p.m(M['bolt']), segs=8)          # ось
        a_in, n_in = surf_near(ka.x - 0.040, e.y, -0.002)
        a_out, n_out = surf_near(kb.x + 0.042, e.y, 0.002)
        leaf(p, ka - (kb - ka) * 0.5, a_in, (na + n_in).normalized(), axis)                               # на крыше
        leaf(p, kb - (ka - kb) * 0.5, a_out, (nb + n_out).normalized(), axis)                             # на двери
        print('HINGE', tuple(round(c, 3) for c in ka), tuple(round(c, 3) for c in kb), tuple(round(c, 3) for c in a_in), tuple(round(c, 3) for c in a_out))
    p.done()
    # газовый упор (рис. 4–5): вдоль задней кромки двери — верх на кронштейне у крыши за задней петлей, низ на задней
    # раме двери; оба кронштейна прижаты к поверхностям (крыша и рама двери MSFS)
    # задняя рама двери — за стеклом (стекло до y 1,384, рама до 1,449): ищем станцию, где луч изнутри упирается в раму
    for ys_ in (1.415, 1.405, 1.425, 1.395):
        hd = DOOR_BVH.ray_cast(V((0.25, ys_, 0.615)), V((1, 0, 0)), 0.5)
        if hd[0] is not None:
            break
    e = door_top_edge(ys_)
    top0 = V((e.x - 0.040, ys_ - 0.01, 0.62))
    hits = [h for h in (TRIM_BVH.ray_cast(top0, V((0, 0, 1)), 0.5), R.shell.ray_cast(top0, V((0, 0, 1)), 0.5)) if h[0] is not None]
    hu = min(hits, key=lambda h: h[3])
    nu = hu[1] if hu[1].z < 0 else -hu[1]                                                                 # внутрь кабины
    nd = hd[1] if hd[1].x < 0 else -hd[1]
    fu = hu[0] + nu * 0.016
    dr = hd[0] + nd * 0.016
    d = (dr - fu).normalized()
    L = (dr - fu).length
    g = P('Passenger door gas spring strut', 'Газовый упор задней двери вдоль её задней кромки: верх — на кронштейне у крыши за задней петлей, '
          'низ — на задней раме двери; держит дверь открытой, при сильном ветре дверь надо придерживать (РЛЭ 7.8.2)',
          'gas', 'AMM 52-10 3.A, рис. 4, 5; РЛЭ 7.8.2')
    cyl(g, fu + d * 0.02, fu + d * (L * 0.5), 0.0105, 0, segs=18)
    cyl(g, fu + d * (L * 0.5), dr - d * 0.02, 0.004, g.m(M['rod']), segs=12)
    for q, base, nn in ((fu, hu[0], nu), (dr, hd[0], nd)):
        lib.sphere(g, q, 0.007, g.m(M['bolt']), segs=10, rings=5)
        cyl(g, base + nn * 0.002, q, 0.0032, g.m(M['bolt']), segs=10)                                     # шаровой палец
        side = nn.cross(V((0, 1, 0)))
        if side.length < 0.2:
            side = nn.cross(V((1, 0, 0)))
        box(g, base + nn * 0.002, (0.024, 0.034, 0.004), Matrix((side.normalized(), nn.cross(side).normalized(), nn)).transposed(),
            g.m(M['alu']), bevel=0.001)                                                                    # кронштейн-пластина
    g.done()
    print('DOOR hinges', [tuple(round(c, 3) for c in q) for q in edges], 'strut', tuple(round(c, 3) for c in fu), tuple(round(c, 3) for c in dr))
    # механизм замка
    hp = inside(min(D_EDGE, key=lambda q: abs(q.y - 0.47)), 1)
    k = P('Passenger door handle double lever', 'Двойной рычаг внутренней ручки задней двери: назад — длинная тяга к заднему стопорному болту, вперёд — короткая к переднему',
          'black', 'AMM 52-10 3.A, рис. 4')
    box(k, hp, (0.012, 0.07, 0.008), Matrix.Identity(3), 0, bevel=0.002)
    cyl(k, hp - V((0.012, 0, 0)), hp + V((0.012, 0, 0)), 0.004, k.m(M['bolt']), segs=10)
    sb = hp + V((-0.006, 0.0, -0.008))
    lib.torus(k, sb, (0, 0, 1), 0.006, 0.0015, k.m(M['bolt']), segs=14, rsegs=6)                    # пружина ручки
    k.done()
    o = P('Passenger door outer handle (red) and safety lock', 'Наружная красная ручка задней двери и предохранительный замок: изнутри его ручку поднимают, снаружи нажимают кнопку рядом с ручкой; замок под ключ',
          'red', 'AMM 52-10 3.A, рис. 4; РЛЭ 7.8.2')
    oh = hp + V((0.026, 0, -0.002))
    box(o, oh, (0.008, 0.065, 0.014), Matrix.Identity(3), 0, bevel=0.003)
    sl = hp + V((-0.004, 0.05, 0.016))
    box(o, sl, (0.012, 0.018, 0.016), Matrix.Identity(3), o.m(M['black']), bevel=0.002)             # предохранитель
    o.done()
    front_c = inside(D_EDGE[0], 1, dx=0.018, dz=0.016) + V((0, 0.02, 0))
    rear_c = inside(D_EDGE[-1], 1, dx=0.018, dz=0.016) - V((0, 0.02, 0))
    for nm, ru, c, dv in (('Passenger door front locking bolt', 'Передний стопорный болт задней двери: в нижнем переднем углу, входит вперёд в колодку на борту; уходя назад, нажимает микровыключатель сигнала', front_c, V((0, -1, 0))),
                          ('Passenger door rear locking bolt', 'Задний стопорный болт задней двери: в нижнем заднем углу, входит назад в колодку на борту', rear_c, V((0, 1, 0)))):
        q = P(nm, ru, 'bolt', 'AMM 52-10 3.A, рис. 4')
        bolt_y(q, c, dv, 0.065, 0.0055)
        q.done()
    ptfe_block('Passenger door front PTFE block', 'Колодка переднего стопорного болта задней двери в обшивке фюзеляжа', front_c + V((0, -0.055, 0)), V((0, -1, 0)))
    ptfe_block('Passenger door rear PTFE block', 'Колодка заднего стопорного болта задней двери в обшивке фюзеляжа', rear_c + V((-0.012, 0.055, 0)), V((0, 1, 0)))
    micro_switch('Passenger door unlocked warning micro-switch', 'Микровыключатель сигнала DOOR OPEN у переднего стопорного болта задней двери',
                 front_c + V((-0.006, -0.035, -0.030)))
    r = P('Passenger door long connecting rod', 'Длинная тяга задней двери: от двойного рычага к заднему стопорному болту', 'bolt', 'AMM 52-10 3.A, рис. 4')
    a = hp + V((0, 0.033, 0))
    pts = [a, rear_c - V((0, 0.035, 0))]                       # тяга прямая
    tube(r, pts, 0.003, bend=0.02)
    r.done()
    r = P('Passenger door short connecting rod', 'Короткая тяга задней двери: от двойного рычага к переднему стопорному болту', 'bolt', 'AMM 52-10 3.A, рис. 4')
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
