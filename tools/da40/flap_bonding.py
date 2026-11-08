"""Перемычки металлизации трубы асимметрии закрылков (торсионной трубы) — AMM 51-80 п. 2.A.

    import flap_bonding; flap_bonding.build(col, braid, steel, cond_at)        (из bonding.py, слой bonding)
    python3 tools/da40/flap_bonding.py [out.glb]   (дополнение к готовому слою: проводник — по опубликованному слою)

В таблице измерений AMM 51-80 (рис. 1, «Поперечная трубка закрылков») — «Flap asymmetrical tube LH / RH, bond. strap
connection, 10 мОм»: каждая из двух частей торсионной трубы закрылков (AMM 27-50 2.C, рис. 1; controls.py,
flap_torsion_tube) соединена перемычкой из лужёной медной плетёнки с системой металлизации. Ближайший проводник —
продольная труба молниеотвода «кабина → хвостовая часть» (bonding.py): за задним главным шпангоутом она проходит
над средней частью торсионной трубы (у x ≈ 0,21, зазор 4 мм). Левая перемычка — от хомута на левой части трубы
(между трубой молниеотвода и кабелем стартера, x 0,335), правая — от болта муфты стыка (муфта — на правой части,
левая часть входит в неё). На трубе молниеотвода — хомуты с лепестками. Труба закрылков поворачивается вместе с
закрылками: плетёнка гибкая, с запасом длины.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector as V  # noqa: E402

import lib  # noqa: E402
import ref  # noqa: E402
from lib import Part, basis, box, fillet, hexa, ring_tube, sweep  # noqa: E402

# торсионная труба закрылков (controls.py): ось, средняя часть, радиус, болты муфты стыка
TT_Y, TT_CRANK_Z, TT_R = 0.7651, -0.204, 0.0125
COUPLING_BOLT_X, COUPLING_R = 0.022, TT_R + 0.0028
TUBE_R = 0.0095                        # труба молниеотвода (bonding.py)
BRAID_R = 0.0018
COND = 'Lightning conductor tube (cabin → rear fuselage)'


def along_y(path):
    """Точка и направление оси трубы молниеотвода на заданном y (участок, где y растёт монотонно)."""
    P = [V(q) for q in path]

    def at(y):
        for a, b in zip(P, P[1:]):
            if min(a.y, b.y) <= y <= max(a.y, b.y) and abs(b.y - a.y) > 1e-6:
                f = (y - a.y) / (b.y - a.y)
                return a.lerp(b, f), (b - a).normalized()
        raise ValueError(f'труба молниеотвода не проходит y = {y}')
    return at


def _cond_clamp(p, c, d, side, mi_steel):
    """Хомут на трубе молниеотвода с лепестком в сторону side; точка крепления наконечника плетёнки."""
    ring_tube(p, c, d, TUBE_R + 0.0036, TUBE_R + 0.0022, 0.010, mi_steel, segs=24)   # лента хомута (зазор — на огранку трубы)
    n = (side - d * side.dot(d)).normalized()
    t = d.cross(n).normalized()
    tab = c + n * (TUBE_R + 0.0084)
    box(p, tab, (0.0016, 0.010, 0.010), basis(n, up=t) if abs(n.z) < 0.9 else None, mi_steel)   # лепесток хомута
    return tab + n * 0.0008, n


def _lug(p, q, n, mi):
    """Кольцевой наконечник плетёнки на лепестке (ось — по нормали n лепестка)."""
    ring_tube(p, q + n * 0.0006, n, 0.0042, 0.0016, 0.0012, mi, segs=14)


def pick_y(cands, busy, gap=0.016):
    """Место хомута на трубе молниеотвода — в стороне от её хомутов крепления (busy — их y)."""
    return next((y for y in cands if all(abs(y - b) > gap for b in busy)), cands[0])


def build(col, braid, steel, cond_at, busy=(), doc='AMM 51-80 п. 2.A, рис. 1'):
    out = []
    y_lh = pick_y((0.800, 0.822, 0.780, 0.845), busy)
    y_rh = pick_y((0.735, 0.715, 0.755, 0.700), busy)
    # ── левая часть: хомут на средней части трубы, плетёнка к трубе молниеотвода сверху-сзади ──
    p = Part('Bonding jumper: flap asymmetrical tube LH', 'Перемычка металлизации из лужёной медной плетёнки: левая часть трубы '
             'асимметрии (торсионной трубы) закрылков — продольная труба молниеотвода над ней; на трубе закрылков и на трубе '
             'молниеотвода — хомуты с лепестками, плетёнка с запасом длины — труба поворачивается вместе с закрылками; '
             'сопротивление проверяют миллиомметром (AMM 51-80 п. 2.A: Flap asymmetrical tube LH, 10 мОм)', braid, col, True, None)
    ms = p.m(steel)
    x1 = 0.275
    c1 = V((x1, TT_Y, TT_CRANK_Z))
    ring_tube(p, c1, (1, 0, 0), TT_R + 0.0020, TT_R + 0.0006, 0.010, ms, segs=28)
    tab1 = c1 + V((0, 0.003, TT_R + 0.0051))
    box(p, tab1, (0.010, 0.012, 0.0016), None, ms)
    q1 = tab1 + V((0, 0, 0.0008))
    _lug(p, q1, V((0, 0, 1)), 0)
    c2, d2 = cond_at(y_lh)
    q2, n2 = _cond_clamp(p, c2, d2, V((1, 0, 0)), ms)
    _lug(p, q2, n2, 0)
    pts = [q1 + V((0, 0, 0.0018)), q1 + V((-0.004, 0.006, 0.010)), V((0.252, (TT_Y + y_lh) / 2 + 0.008, -0.170)),
           q2 + n2 * 0.010 + V((0, 0, 0.004)), q2 + n2 * 0.0018]
    sweep(p, fillet(pts, 0.008), BRAID_R, 0, segs=8)
    out.append(p.done())
    # ── правая часть: наконечник на болте муфты стыка, плетёнка над левой частью к трубе молниеотвода ──
    p = Part('Bonding jumper: flap asymmetrical tube RH', 'Перемычка металлизации из лужёной медной плетёнки: правая часть трубы '
             'асимметрии (торсионной трубы) закрылков — продольная труба молниеотвода; наконечник — на болте муфты стыка двух '
             'частей трубы (муфта — на правой части), на трубе молниеотвода — хомут с лепестком; сопротивление проверяют '
             'миллиомметром (AMM 51-80 п. 2.A: Flap asymmetrical tube RH, 10 мОм)', braid, col, True, None)
    ms = p.m(steel)
    top = V((COUPLING_BOLT_X, TT_Y, TT_CRANK_Z + 0.0215))                  # над гайкой болта муфты (верх гайки z −0,1845)
    ring_tube(p, top - V((0, 0, 0.0008)), (0, 0, 1), 0.0045, 0.0027, 0.0012, 0, segs=14)
    hexa(p, top - V((0, 0, 0.0002)), top + V((0, 0, 0.0030)), 0.008, ms)      # контргайка поверх наконечника
    c3, d3 = cond_at(y_rh)
    q3, n3 = _cond_clamp(p, c3, d3, V((-1, 0, 0)), ms)
    _lug(p, q3, n3, 0)
    a = top + V((0.0045, 0, -0.0008))
    pts = [a, a + V((0.008, -0.002, 0.004)), V((0.080, TT_Y - 0.010, -0.168)), V((0.170, (TT_Y + y_rh) / 2 - 0.010, -0.168)),
           q3 + n3 * 0.010 + V((0, 0, 0.004)), q3 + n3 * 0.0018]
    sweep(p, fillet(pts, 0.012), BRAID_R, 0, segs=8)
    out.append(p.done())
    print(f'FLAP_BONDING хомуты на трубе молниеотвода: y {y_lh} (LH), {y_rh} (RH); её хомуты крепления у y {[round(b, 3) for b in busy]}')
    return out


def conductor_from_layer(path):
    """Ось трубы молниеотвода по опубликованному слою: центры колец (вершины одного кольца — в одном сечении по y)."""
    R = ref.Ref()
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location.z -= R.lift
    bpy.context.view_layer.update()
    o = next(x for x in new if x.type == 'MESH' and x.name.startswith(COND))
    vs = [o.matrix_world @ v.co for v in o.data.vertices if 0.40 < (o.matrix_world @ v.co).y < 1.20]
    groups = {}
    for q in vs:
        groups.setdefault(round(q.y / 0.003), []).append(q)
    centers = []
    for k in sorted(groups):
        g = groups[k] + groups.get(k + 1, [])
        if len(g) >= 12:
            c = sum(g, V()) / len(g)
            if all(abs((q - c).length - TUBE_R) < 0.004 for q in g):
                centers.append(c)
    clean = []
    for c in centers:
        if not clean or (c - clean[-1]).length > 0.005:
            clean.append(c)
    # хомуты крепления трубы (bonding.tube: кольца r + 2,2 мм) — по вершинам на этом радиусе от оси
    at = along_y(clean)
    busy = []
    for q in vs:
        try:
            c, d = at(q.y)
        except ValueError:
            continue
        w = q - c
        rr = (w - d * w.dot(d)).length
        if abs(rr - (TUBE_R + 0.0022)) < 0.0005 and all(abs(q.y - b) > 0.01 for b in busy):
            busy.append(q.y)
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    return clean, busy


if __name__ == '__main__':
    OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-flap-bonding-raw.glb'
    ref.open_source()
    Rf = ref.Ref()
    COL = lib.collection('DA40 Flap tube bonding (AMM 51-80)')
    braid = lib.mat('DA40 tinned copper braid', (0.70, 0.71, 0.72), 1.0, 0.45, ru='лужёная медная плетёнка')
    steel = lib.mat('DA40 stainless steel', (0.62, 0.63, 0.65), 1.0, 0.28, ru='нержавеющая сталь')
    cond, busy = conductor_from_layer(os.path.join(os.environ['LAYERS'], 'da40-bonding-raw.glb'))
    print('COND', [tuple(round(c, 3) for c in q) for q in cond])
    build(COL, braid, steel, along_y(cond), busy)
    size = ref.export(COL, OUT, Rf.lift)
    with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as fh:
        json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, fh, ensure_ascii=False, indent=1)
    print(f'FLAP_BONDING_OK {OUT} {size / 1e6:.2f} MB, parts {len([o for o in COL.all_objects if o.type == "MESH"])}')
