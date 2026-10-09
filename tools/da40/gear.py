"""Узлы крепления шасси DA 40 NG — отдельный слой сайта.

    python3 tools/da40/gear.py [out.glb]

AMM 6.02.15 Rev. 3, 32-00, 32-10 (рис. 1–2), 32-20 (рис. 1). В исходной модели
MSFS основная рессора видна только снаружи фюзеляжа, а носовая стойка — без
подшипников и без связи упругого пакета с моторамой. Этот слой достраивает:

Основная стойка (32-10 рис. 1). Рессора — стальная плоская полоса. Внутренний
узел: вертикальный внутренний болт сквозь монтажный блок на центральной
замыкающей нервюре центроплана; между верхней гранью рессоры и блоком —
тарельчатые пружинные шайбы, снизу — выпуклая и вогнутая шайбы и корончатая
гайка со шплинтом. Блок крепится к нервюре двумя стяжными болтами, перемычка
металлизации — от блока к рессоре. Наружный узел: верхняя часть (седло) с
полиамидной вставкой сверху рессоры и прижимная планка с гибкой вставкой
снизу, два болта к нервюрам основного шасси, вклеенным в центроплан. Там, где
рессора выходит из фюзеляжа, — уплотнительная панель с гибкой серединой.

Носовая стойка (32-20 рис. 1). Сварная трубчатая стойка MSFS оставлена;
добавлены опорные пластины подшипников поперечной трубы (по 4 болта с каждой
стороны) и стопорный болт, упругий пакет (центральная труба, резиновые
элементы с алюминиевыми проставками, регулировочная гайка, проушина сверху)
и упоры поворота вилки ±30°. Верхняя проушина пакета — к кронштейну на
нижней поперечине моторамы (powerplant.py).

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
from lib import Part, basis, box, cyl, fillet, hexa, ring_tube, sweep  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-gear-raw.glb'

ref.open_source()
R = ref.Ref()
COL = lib.collection('DA40 Landing gear mounts (AMM 32)')

M = dict(
    spring=lib.mat('DA40 main gear leaf spring (steel, painted)', (0.86, 0.86, 0.84), 0.3, 0.45, ru='рессорная сталь, окраска'),
    block=lib.mat('DA40 gear mounting block (aluminium)', (0.70, 0.71, 0.73), 0.9, 0.38, ru='алюминиевый сплав'),
    steel=lib.mat('DA40 gear bolts (cadmium plated steel)', (0.66, 0.66, 0.62), 1.0, 0.3, ru='сталь, кадмирование'),
    saddle=lib.mat('DA40 gear outer mount (aluminium)', (0.62, 0.63, 0.66), 0.85, 0.42, ru='алюминиевый сплав'),
    poly=lib.mat('DA40 polyamide insert', (0.90, 0.88, 0.80), 0.0, 0.5, ru='полиамид'),
    rubber=lib.mat('DA40 reinforced rubber insert', (0.06, 0.06, 0.06), 0.0, 0.85, ru='армированная резина'),
    gfrp=lib.mat('DA40 gear rib (GFRP)', (0.80, 0.80, 0.72), 0.0, 0.6, ru='стеклопластик'),
    elast=lib.mat('DA40 nose gear elastomer element', (0.10, 0.10, 0.11), 0.0, 0.8, ru='эластомер'),
    tube=lib.mat('DA40 nose gear tube (steel, painted)', (0.84, 0.84, 0.82), 0.3, 0.45, ru='стальная труба, окраска'),
    copper=lib.mat('DA40 bonding braid (tinned copper)', (0.70, 0.66, 0.58), 1.0, 0.45, ru='лужёная медная плетёнка'),
)


def P(name, ru, m, doc='AMM 32-10'):
    return Part(name, ru, M[m], COL, True, doc)


def bolt(p, top, down, length, d, mi_head, mi_nut=None, nut=True):
    """Болт сверху вниз: головка, стержень, шайба и гайка снизу."""
    down = V(down).normalized()
    hexa(p, top - down * 0.006, top, d * 1.7, mi_head)
    cyl(p, top, top + down * length, d / 2, mi_head, segs=10)
    if nut:
        e = top + down * (length - 0.004)
        cyl(p, e - down * 0.0015, e, d * 1.1, mi_head if mi_nut is None else mi_nut, segs=14)
        hexa(p, e, e + down * 0.006, d * 1.6, mi_head if mi_nut is None else mi_nut)


# ── Основная стойка ───────────────────────────────────────────────────────
SPRING_Y = 0.331            # середина рессоры по хорде (MSFS Plane.069: 0,303…0,359 у оси колеса)
SPRING_W, SPRING_T = 0.056, 0.018
X_INNER = 0.10              # ось внутреннего болта
X_RIB_C = 0.035             # центральная замыкающая нервюра (по борту блока)
OUTER = (0.50, 0.62)        # наружный узел по размаху
X_EXIT = 0.86               # выход из фюзеляжа (начало рессоры MSFS: x 0,849, z −0,196)


def z_spring(x):
    """Ось рессоры внутри: почти горизонтально под полом, у борта — к началу рессоры MSFS."""
    return -0.212 + (x - X_INNER) * 0.040


def leaf(p, s):
    """Внутренняя часть рессоры: полоса прямоугольного сечения от внутреннего болта
    до выхода из фюзеляжа, у борта плавно переходит в наклонную часть MSFS."""
    pts = [V((s * x, SPRING_Y, z_spring(x))) for x in (X_INNER - 0.03, 0.30, 0.55, 0.74)]
    pts += [V((s * 0.80, SPRING_Y, z_spring(0.80) - 0.002)), V((s * 0.849, SPRING_Y - 0.006, -0.199)),
            V((s * 0.90, SPRING_Y - 0.008, -0.236))]
    path = fillet(pts, 0.05)
    bm = p.bm
    rows = []
    for i, q in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        side = V((0, 1, 0))
        up = t.cross(side).normalized() * (1 if s > 0 else -1)
        if up.z < 0:
            up = -up
        rows.append([bm.verts.new(q + side * sy * SPRING_W / 2 + up * sz * SPRING_T / 2)
                     for sy, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    for a, b in zip(rows[:-1], rows[1:]):
        for k in range(4):
            f = bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
            f.material_index = 0
            f.smooth = False
    for ring, flip in ((rows[0], True), (rows[-1], False)):
        f = bm.faces.new(ring[::-1] if flip else ring)
        f.material_index = 0
    # скруглённый внутренний конец с отверстием под болт — шайба-накладка
    c = V((s * X_INNER, SPRING_Y, z_spring(X_INNER)))
    cyl(p, c - V((0, 0, SPRING_T / 2)), c + V((0, 0, SPRING_T / 2)), SPRING_W / 2, 0, segs=24)


def main_gear(s):
    tag = 'LH' if s > 0 else 'RH'
    side_ru = 'левой' if s > 0 else 'правой'
    p = P(f'Main gear leaf spring inboard part {tag}',
          f'Рессора {side_ru} основной стойки внутри фюзеляжа: стальная плоская полоса от внутреннего болта через наружный узел к выходу из фюзеляжа',
          'spring')
    leaf(p, s)
    p.done()

    # центральная замыкающая нервюра центроплана (участок под узлом)
    zc = z_spring(X_INNER)
    rb = P(f'Centre section centre closing rib (main gear inner mount) {tag}',
           'Средняя часть передней замыкающей (бортовой) нервюры центроплана: к ней крепится монтажный блок внутреннего '
           'узла крепления стойки основной опоры шасси', 'gfrp', 'AMM 32-10, 53-10 2.E')
    box(rb, V((s * (X_RIB_C - 0.004), SPRING_Y, -0.20)), (0.008, 0.16, 0.12), Matrix.Identity(3), 0, bevel=0.002)
    rb.done()

    # внутренний узел
    b = P(f'Main gear inner mount {tag}',
          'Внутренний узел рессоры: монтажный блок на центральной замыкающей нервюре, внутренний болт, тарельчатые шайбы, выпуклая и вогнутая шайбы, корончатая гайка со шплинтом',
          'block', 'AMM 32-10 рис. 1')
    top_s = zc + SPRING_T / 2
    z_blk0 = top_s + 0.012
    blk = V((s * (X_RIB_C + 0.05), SPRING_Y, z_blk0 + 0.022))
    box(b, blk, (0.10, 0.07, 0.044), Matrix.Identity(3), 0, bevel=0.004)
    for dy in (-0.022, 0.022):                                                    # стяжные болты в нервюру
        q = V((s * (X_RIB_C + 0.03), SPRING_Y + dy, blk.z + 0.008))
        cyl(b, q, q - V((s * 0.04, 0, 0)), 0.004, b.m(M['steel']), segs=10)
        hexa(b, q, q + V((s * 0.006, 0, 0)), 0.011, b.m(M['steel']))
        hexa(b, q - V((s * 0.046, 0, 0)), q - V((s * 0.052, 0, 0)), 0.011, b.m(M['steel']))
    axis = V((s * X_INNER, SPRING_Y, 0))
    for k in range(2):                                                            # тарельчатые пружинные шайбы
        z = top_s + 0.0005 + k * 0.006
        cyl(b, V((axis.x, axis.y, z)), V((axis.x, axis.y, z + 0.0055)), 0.022 - k * 0.002, b.m(M['steel']), segs=24)
    bot_s = zc - SPRING_T / 2
    cyl(b, V((axis.x, axis.y, bot_s - 0.005)), V((axis.x, axis.y, bot_s)), 0.020, b.m(M['steel']), segs=24)       # выпуклая
    cyl(b, V((axis.x, axis.y, bot_s - 0.010)), V((axis.x, axis.y, bot_s - 0.005)), 0.020, b.m(M['steel']), segs=24)  # вогнутая
    nut_top = bot_s - 0.010
    hexa(b, V((axis.x, axis.y, nut_top - 0.014)), V((axis.x, axis.y, nut_top)), 0.030, b.m(M['steel']))
    for k in range(6):                                                            # прорези корончатой гайки
        a = 2 * math.pi * k / 6
        box(b, V((axis.x + 0.012 * math.cos(a), axis.y + 0.012 * math.sin(a), nut_top - 0.017)),
            (0.006, 0.006, 0.006), Matrix.Rotation(a, 3, 'Z'), b.m(M['steel']))
    cyl(b, V((axis.x - 0.018, axis.y, nut_top - 0.017)), V((axis.x + 0.018, axis.y, nut_top - 0.017)), 0.0015, b.m(M['steel']), segs=6)  # шплинт
    head = V((axis.x, axis.y, blk.z + 0.022))
    hexa(b, head, head + V((0, 0, 0.008)), 0.030, b.m(M['steel']))               # головка внутреннего болта
    cyl(b, head, V((axis.x, axis.y, nut_top - 0.02)), 0.0095, b.m(M['steel']), segs=14)
    b.done()
    m = P(f'Main gear inner mount bonding strap {tag}', 'Перемычка металлизации: монтажный блок — рессора', 'copper', 'AMM 32-10 рис. 1')
    a0 = V((s * (X_RIB_C + 0.095), SPRING_Y - 0.036, blk.z - 0.012))
    a1 = V((s * (X_INNER + 0.06), SPRING_Y - 0.030, z_spring(X_INNER + 0.06) - 0.004))
    sweep(m, fillet([a0, a0 + V((0, -0.012, -0.012)), a1 + V((0, -0.008, 0)), a1], 0.01), 0.002, 0, segs=6)
    m.done()

    # нервюры основного шасси и наружный узел
    x0, x1 = OUTER
    xm = (x0 + x1) / 2
    zm = z_spring(xm)
    belly = R.hit(V((s * xm, SPRING_Y, zm)), V((0, 0, -1)), 0.5)[0]
    zb = belly.z + 0.004 if belly is not None else zm - 0.04
    rib = P(f'Main gear ribs {tag}', 'Нервюры крепления основной опоры шасси: вклеены в центроплан между лонжеронами; к ним двумя болтами '
              'крепится внешний узел крепления стойки', 'gfrp', 'AMM 32-10, 53-10 2.E')
    for dy in (-0.062, 0.062):
        box(rib, V((s * xm, SPRING_Y + dy, (zb + zm + 0.09) / 2)), (x1 - x0 + 0.10, 0.006, zm + 0.09 - zb), Matrix.Identity(3), 0, bevel=0.001)
    rib.done()
    o = P(f'Main gear outer mount {tag}',
          'Наружный узел рессоры: верхняя часть с полиамидной вставкой сверху рессоры, прижимная планка с гибкой резиновой вставкой снизу, два болта к нервюрам основного шасси',
          'saddle', 'AMM 32-10 рис. 1')
    top_s = zm + SPRING_T / 2
    bot_s = zm - SPRING_T / 2
    box(o, V((s * xm, SPRING_Y, top_s + 0.003)), (x1 - x0 - 0.01, SPRING_W, 0.006), Matrix.Identity(3), o.m(M['poly']))     # полиамид
    box(o, V((s * xm, SPRING_Y, top_s + 0.036)), (x1 - x0, 0.118, 0.054), Matrix.Identity(3), 0, bevel=0.006)              # седло
    for dy in (-1, 1):                                                                                                        # щёки седла до планки
        box(o, V((s * xm, SPRING_Y + dy * 0.047, zm + 0.004)), (x1 - x0, 0.024, SPRING_T + 0.012), Matrix.Identity(3), 0, bevel=0.003)
    box(o, V((s * xm, SPRING_Y, bot_s - 0.002)), (x1 - x0 - 0.01, SPRING_W, 0.004), Matrix.Identity(3), o.m(M['rubber']))   # гибкая вставка
    box(o, V((s * xm, SPRING_Y, bot_s - 0.010)), (x1 - x0, 0.118, 0.012), Matrix.Identity(3), o.m(M['saddle']), bevel=0.002)  # прижимная планка
    for dy in (-0.047, 0.047):
        bolt(o, V((s * xm, SPRING_Y + dy, top_s + 0.069)), (0, 0, -1), top_s + 0.069 - (bot_s - 0.020), 0.008, o.m(M['steel']))
    for dx in (-0.045, 0.045):                                                                                                # болты седла в нервюры
        q = V((s * (xm + dx), SPRING_Y - 0.068, top_s + 0.036))
        cyl(o, q, q + V((0, 0.136, 0)), 0.004, o.m(M['steel']), segs=10)
        hexa(o, q - V((0, 0.006, 0)), q, 0.012, o.m(M['steel']))
        hexa(o, q + V((0, 0.136, 0)), q + V((0, 0.142, 0)), 0.012, o.m(M['steel']))
    o.done()

    # уплотнительная панель там, где рессора проходит сквозь обшивку
    hit = R.hit(V((s * 0.70, SPRING_Y, -0.205)), V((s, 0, -0.35)).normalized(), 0.4)
    if hit[0] is not None:
        c, n = hit[0], hit[1].normalized()
        if n.dot(V((s, 0, 0))) < 0:
            n = -n
        sp = P(f'Main gear strut seal panel {tag}', 'Уплотнительная панель с гибкой серединой там, где рессора выходит из фюзеляжа', 'rubber', 'AMM 32-10')
        Rm = basis(n)
        box(sp, c - n * 0.003, (0.14, 0.11, 0.003), Rm, sp.m(M['saddle']), bevel=0.002)
        box(sp, c - n * 0.001, (0.09, 0.075, 0.003), Rm, 0, bevel=0.004)
        sp.done()


# ── Носовая стойка ────────────────────────────────────────────────────────
NG_X = 0.078                                # ось стойки (MSFS Cylinder.180)
JOURNAL = (V((-0.050, -0.970, -0.130)), V((0.126, -0.970, -0.130)))   # концы поперечной трубы
PACK_BOT, PACK_TOP = V((NG_X, -1.300, -0.385)), V((NG_X, -1.300, -0.150))
LUG = V((NG_X, -1.215, -0.1025))            # нижняя поперечина моторамы (powerplant.py: fw_lo — fw_c)
PIVOT = V((NG_X, -1.760, -0.505))           # верх оси вилки


def nose_gear():
    j = P('Nose gear journal bearings and bearing plates',
          'Подшипники поперечной трубы носовой стойки: стойка качается только вверх-вниз; опорные пластины слева и справа, по 4 болта; стопорный болт',
          'block', 'AMM 32-20 рис. 1')
    for e, s in ((JOURNAL[0], -1), (JOURNAL[1], 1)):
        cyl(j, e, e + V((s * 0.016, 0, 0)), 0.024, 0, segs=24)                     # корпус подшипника
        box(j, e + V((s * 0.019, 0, -0.003)), (0.006, 0.075, 0.056), Matrix.Identity(3), 0, bevel=0.004)   # опорная пластина (ниже пола)
        for dy in (-0.026, 0.026):
            for dz in (-0.020, 0.016):
                q = e + V((s * 0.022, dy, dz))
                hexa(j, q, q + V((s * 0.005, 0, 0)), 0.010, j.m(M['steel']))
    lb = (JOURNAL[0] + JOURNAL[1]) / 2 + V((0, -0.022, 0))
    cyl(j, lb, lb + V((0, -0.03, 0)), 0.005, j.m(M['steel']), segs=10)              # стопорный болт (вперёд, под полом)
    hexa(j, lb + V((0, -0.03, 0)), lb + V((0, -0.036, 0)), 0.013, j.m(M['steel']))
    j.done()

    k = P('Nose gear elastomer pack',
          'Упругий пакет носовой стойки: центральная труба, резиновые элементы с алюминиевыми проставками, регулировочная гайка; снизу — кронштейн стойки, сверху проушина к мотораме',
          'elast', 'AMM 32-20 рис. 1, 3–4')
    ax = (PACK_TOP - PACK_BOT).normalized()
    L = (PACK_TOP - PACK_BOT).length
    cyl(k, PACK_BOT, PACK_TOP + ax * 0.01, 0.008, k.m(M['steel']), segs=12)          # центральная труба
    n = 7
    seg = (L - 0.05) / n
    for i in range(n):
        c0 = PACK_BOT + ax * (0.03 + i * seg)
        cyl(k, c0, c0 + ax * (seg * 0.78), 0.021, 0, segs=22)                          # резиновый элемент
        cyl(k, c0 + ax * (seg * 0.78), c0 + ax * seg, 0.024, k.m(M['block']), segs=22)  # алюминиевая проставка
    hexa(k, PACK_BOT + ax * 0.012, PACK_BOT + ax * 0.026, 0.034, k.m(M['steel']))       # регулировочная гайка
    eye = PACK_TOP + ax * 0.022
    ring_tube(k, eye, V((1, 0, 0)), 0.014, 0.006, 0.012, k.m(M['steel']), segs=20)      # проушина
    cyl(k, PACK_TOP + ax * 0.006, eye - ax * 0.012, 0.007, k.m(M['steel']), segs=12)
    k.done()

    g = P('Nose gear elastomer pack attachment (engine mount lug)',
          'Крепление верхней проушины упругого пакета к кронштейну на нижней поперечине моторамы', 'steel', 'AMM 32-20')
    lug_a = LUG + V((0, -0.004, -0.008))
    d = eye - lug_a
    for dx in (-0.0105, 0.0105):                                                          # щёки вилки по обе стороны проушины
        box(g, (lug_a + eye) / 2 + V((dx, 0, 0)), (0.005, 0.026, d.length + 0.02), basis(d, up=V((0, 0, 1))), 0, bevel=0.001)
    cyl(g, eye - V((0.016, 0, 0)), eye + V((0.016, 0, 0)), 0.005, 0, segs=10)            # болт проушины
    hexa(g, eye + V((0.016, 0, 0)), eye + V((0.022, 0, 0)), 0.012, 0)
    g.done()

    c = P('Nose wheel fork castor stops', 'Упоры поворота вилки носового колеса: ±30°', 'steel', 'AMM 32-20 рис. 1')
    for a in (math.radians(30), math.radians(-30)):
        d = V((math.sin(a), -math.cos(a), 0))
        q = PIVOT + d * 0.040 + V((0, 0, 0.004))
        box(c, q, (0.010, 0.012, 0.014), basis(d), 0, bevel=0.0015)
    box(c, PIVOT + V((0, 0.028, 0.006)), (0.03, 0.012, 0.012), Matrix.Identity(3), 0, bevel=0.002)
    c.done()


for side in (1, -1):
    main_gear(side)
nose_gear()

dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'GEAR_OK {OUT} {size / 1e6:.2f} MB, parts {len([o for o in COL.all_objects if o.type == "MESH"])}')
