"""Тросы кабины руля направления по AMM 27-20 рис. 2–3 — от перегородки до трёхплечей качалки.

    python3 tools/da40/rudder_cables.py [out.glb]       (отдельно: слой-дополнение для проверки)
    import rudder_cables; rudder_cables.build(col)       (из controls.py: в дополнение управления)

AMM 27-20 2.: четыре троса кабины идут от перегородки — у неё многодырчатый кронштейн для регулировки
(рис. 2: с натяжной пружиной) — в нижний конец S-образной трубки педали, выходят из верхнего конца и идут
к трёхплечей качалке; внешние — через тефлоновые трубки в задней стенке панели пола и ролики на шпангоуте
крепления ручек управления к переднему плечу качалки, внутренние — через такие же трубки к боковым плечам.
Нижний конец трубки — на оси педали, верхний — у подножки (рис. 2).

S-образные трубки — те, что в салоне MSFS: сетки BezierCurve.001 / .010 / .014 / .016 на ручках педалей,
сбоку от педалей, как на рис. 2–3. В слое управления MSFS были ещё упрощённые трубки посреди педалей
(Rudder S-tube …) с тросами, начинавшимися от их верхнего конца; они заменены (replaced.json), а тросы
проложены заново: передняя стенка ниши для ног → многодырчатый кронштейн → натяжная пружина → нижний
конец трубки; из верхнего конца — назад и вниз по месту упрощённой трубки (там же тефлоновая трубка сквозь
пол: этот объём соседние трассы уже обходят) и дальше прежней трассой MSFS под полом к ролику и качалке.
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

TUBES = {        # метка: (сетка трубки в салоне MSFS, трос MSFS, род. падеж для подписи)
    'pilot outboard': ('BezierCurve.001', 'Rudder cockpit cable (pilot outboard)', 'внешней (левой) педали пилота'),
    'pilot inboard': ('BezierCurve.010', 'Rudder cockpit cable (pilot inboard)', 'внутренней (правой) педали пилота'),
    'co-pilot outboard': ('BezierCurve.014', 'Rudder cockpit cable (co-pilot outboard)', 'внешней (правой) педали второго пилота'),
    'co-pilot inboard': ('BezierCurve.016', 'Rudder cockpit cable (co-pilot inboard)', 'внутренней (левой) педали второго пилота'),
}
REPLACED_MSFS = ['Rudder S-tube (pilot outboard)', 'Rudder S-tube (pilot inboard)', 'Rudder S-tube (co-pilot outboard)',
                 'Rudder S-tube (co-pilot inboard)'] + [t[1] for t in TUBES.values()]
CABLE_R = 0.0016

M = {}


def mats():
    if M:
        return M
    M.update(
        cable=lib.mat('DA40 control cable (stainless)', (0.55, 0.56, 0.58), 0.9, 0.35, ru='трос из нержавеющей стали'),
        steel=lib.mat('DA40 rudder fitting (cad-plated steel)', (0.70, 0.66, 0.50), 0.9, 0.35, ru='сталь, кадмированная'),
        spring=lib.mat('DA40 tension spring (spring steel)', (0.30, 0.31, 0.33), 0.9, 0.3, ru='пружинная сталь'),
        ptfe=lib.mat('DA40 PTFE guide tube (white)', (0.92, 0.92, 0.90), 0.0, 0.45, ru='фторопласт (тефлон)'),
    )
    return M


def bvh_except(names):
    objs = [o for o in bpy.data.collections['DA40 Interior'].all_objects
            if o.type == 'MESH' and not o.hide_render and o.name not in names
            and not o.name.startswith(('HANDLING_RudderPedals', 'BezierCurve.0'))
            and not any(m and 'Glass' in m.name for m in o.data.materials)]
    return ref._bvh(objs)


def tube_ends(o):
    """Концы S-образной трубки: нижний (передний конец нижнего плеча, на оси педали) и верхний (задний конец
    верхнего плеча, у подножки). Центр — среднее вершин торцевого кольца."""
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    zmin = min(q.z for q in vs)
    low = [q for q in vs if q.z < zmin + 0.012]
    y0 = min(q.y for q in low)
    L = sum((q for q in low if q.y < y0 + 0.005), V()) / len([q for q in low if q.y < y0 + 0.005])
    up = [q for q in vs if q.z > 0.0]
    y1 = max(q.y for q in up)
    sel = [q for q in up if q.y > y1 - 0.005]
    U = sum(sel, V()) / len(sel)
    return L, U


def floor_at(T, x, y, z_from):
    h = T.ray_cast(V((x, y, z_from)), V((0, 0, -1)), 0.5)[0]
    return h.z if h else -0.094 - 0.033 * (y + 1.10)


def msfs_tail(name, y_from):
    """Точки троса MSFS от y_from назад (ролик, плечо качалки)."""
    o = bpy.data.objects[name]
    pts = []
    for sp in o.data.splines:
        if len(sp.bezier_points):
            pts += [o.matrix_world @ b.co for b in sp.bezier_points]
        else:
            pts += [o.matrix_world @ p.co.xyz for p in sp.points]
    return [q for q in pts if q.y > y_from]


def build(col, doc='AMM 27-20 2., рис. 2, 3'):
    m = mats()
    LBL = {}

    def P(name, ru, mat):
        return Part(name, ru, m[mat], col, True, doc)

    T = bvh_except(set())
    for tag, (tube, msfs, gen) in TUBES.items():
        s = 1 if 'co-pilot' not in tag else -1
        L, U = tube_ends(bpy.data.objects[tube])
        x0 = L.x
        # ── передний участок: от передней стенки ниши для ног к нижнему концу трубки
        zf = L.z + 0.010                                   # у стенки трос чуть выше: пол поднимается к перегородке
        hit = T.ray_cast(V((x0, L.y - 0.06, zf)), V((0, -1, 0)), 0.5)[0]
        wall_y = hit.y if hit else -1.17
        hole = V((x0, wall_y + 0.030, zf))                 # отверстие кронштейна, за которое зацеплена пружина
        f = P(f'Rudder cable multi-hole fitting ({tag})',
              f'Многодырчатый кронштейн троса {gen} у противопожарной перегородки: пластина на двух болтах и ушко с рядом '
              f'отверстий — переставляя пружину, регулируют натяжение троса', 'steel')
        box(f, V((x0, wall_y + 0.003, zf + 0.004)), (0.034, 0.006, 0.028), Matrix.Identity(3), 0, bevel=0.0015)   # пластина
        for dx in (-0.011, 0.011):
            q = V((x0 + dx, wall_y + 0.006, zf + 0.012))
            hexa(f, q, q + V((0, 0.005, 0)), 0.008, 0)
        tab_c = V((x0, wall_y + 0.022, zf))
        box(f, tab_c, (0.003, 0.034, 0.014), Matrix.Identity(3), 0, bevel=0.001)                               # ушко
        for k in range(4):                                  # отверстия — тёмные втулки поперёк ушка
            q = V((x0, wall_y + 0.012 + k * 0.007, zf))
            cyl(f, q - V((0.0022, 0, 0)), q + V((0.0022, 0, 0)), 0.0018, f.m(m['spring']), segs=10)
        f.done()
        sp_a = V((x0, wall_y + 0.033, zf))
        sp_b = sp_a + V((0, 0.058, 0))
        sp = P(f'Rudder cable tension spring ({tag})',
               f'Натяжная пружина троса {gen}: между многодырчатым кронштейном у перегородки и концом троса, держит трос '
               f'натянутым', 'spring')
        n_t = 18
        pts = []
        for k in range(n_t * 12 + 1):
            t = k / 12
            a = 2 * math.pi * t
            pts.append(sp_a + V((0.0045 * math.cos(a), (sp_b.y - sp_a.y) * t / n_t, 0.0045 * math.sin(a))))
        lib.sweep(sp, pts, 0.0009, 0, segs=6)
        lib.torus(sp, sp_a - V((0, 0.002, 0)), V((1, 0, 0)), 0.003, 0.0009, 0, segs=12, rsegs=5)
        lib.torus(sp, sp_b + V((0, 0.002, 0)), V((1, 0, 0)), 0.003, 0.0009, 0, segs=12, rsegs=5)
        sp.done()
        # ── задний участок: из верхнего конца трубки назад и вниз — туда, где была упрощённая трубка MSFS
        # (её объём свободен от соседних трасс), сквозь пол в тефлоновой трубке и дальше прежней трассой MSFS
        old = msfs_tail(msfs, -2.0)                       # точки троса MSFS: верх упрощённой трубки … качалка
        top, bend = old[0], [q for q in old if q.y > -0.72][0]      # верх упрощённой трубки и её нижний конец
        under = [q for q in old if q.y >= bend.y - 1e-4]
        path_aft = [U + V((0, 0.003, 0)), U + V((0, 0.020, 0)),
                    V(((U.x + top.x) / 2, top.y - 0.004, (U.z + top.z) / 2)),
                    top] + [q for q in old if top.y < q.y < bend.y] + under
        cable = P(f'Rudder cockpit cable, firewall to yoke ({tag})',
                  f'Трос кабины {gen}: от пружины у перегородки в нижний конец S-образной трубки, из её верхнего конца — вниз '
                  f'за педалью, сквозь пол в тефлоновой трубке и под полом — '
                  + ('через ролик на шпангоуте крепления ручек к переднему плечу трёхплечей качалки' if 'outboard' in tag
                     else 'к боковому плечу трёхплечей качалки'), 'cable')
        front = lib.fillet([sp_b + V((0, 0.004, 0)), V((x0, L.y - 0.03, (zf + L.z) / 2)), L - V((0, 0.002, 0))], 0.02)
        lib.sweep(cable, front, CABLE_R, 0, segs=8)
        lib.torus(cable, sp_b + V((0, 0.0045, 0)), V((1, 0, 0)), 0.0026, 0.0008, 0, segs=10, rsegs=4)     # коуш
        lib.sweep(cable, lib.fillet(path_aft, 0.015), CABLE_R, 0, segs=8)
        cable.done()
        # тефлоновая направляющая трубка там, где трос уходит сквозь пол (по месту упрощённой трубки MSFS)
        seg = [q for q in old if top.y <= q.y <= bend.y]
        g = P(f'Rudder cable PTFE guide tube at pedals ({tag})',
              f'Тефлоновая направляющая трубка троса {gen} за педальным узлом: трос уходит в ней сквозь пол к трассе под полом',
              'ptfe')
        tube_pts = lib.fillet(seg[1:], 0.015)
        lib.sweep(g, tube_pts, 0.0042, 0, segs=14)
        g.done()
    return LBL


if __name__ == '__main__':
    OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-rudder-cables-raw.glb'
    ref.open_source()
    R = ref.Ref()
    COL = lib.collection('DA40 Rudder cockpit cables (AMM 27-20)')
    build(COL)
    size = ref.export(COL, OUT, R.lift)
    with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as fh:
        json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, fh, ensure_ascii=False, indent=1)
    print(f'RUDDER_OK {OUT} {size / 1e6:.2f} MB, parts {len([o for o in COL.all_objects if o.type == "MESH"])}')
