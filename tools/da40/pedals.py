"""Педальные узлы руля направления — деталями слоя управления (AMM 27-20 2., рис. 2; РЛЭ 7.3.6).

    python3 tools/da40/pedals.py [out-raw.glb]
    node tools/da40/merge_addon.js models/da40/da40-controls.glb models/da40/da40-controls.glb \
        '["Rudder pedal adjuster handles", "Rudder pedal adjuster cables"]' out-raw.glb
    node tools/da40/merge_addon.js --labels content/da40-labels.json out-raw.glb

Педали с S-образными трубками, салазки, каретки и опоры узлов были только в салоне MSFS (HANDLING_RudderPedals…),
поэтому без салона тросы кабины, натяжные пружины, задвижки и опорные пластины слоя управления висели в воздухе.
Здесь сетки салона копируются в слой управления: педальные узлы становятся деталями системы — подсвечиваются и
выбираются вместе с рулём направления. На страницах, где виден и салон, его педали скрыты (opts.extras[].skip).

Ручка регулировки — по рис. 2 и РЛЭ 7.3.6 (a): чёрная Т-образная ручка за задней опорой узла, её тянут прямо назад;
стержень идёт над верхней салазкой от каретки, сквозь направляющую на задней опоре; от его переднего конца — тросик
вниз по задней пластине каретки к задвижке на нижней салазке. Раньше ручка торчала из середины каретки рычагом вверх.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector as V  # noqa: E402

import lib  # noqa: E402
import ref  # noqa: E402
from lib import Part, box, cyl, hexa  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-pedals-raw.glb'
DOC = 'AMM 27-20 2., рис. 2'

ref.open_source()
R = ref.Ref()
COL = lib.collection('DA40 Rudder pedal assemblies (AMM 27-20)')

M = dict(
    pedal=lib.mat('DA40 rudder pedal (black anodised aluminium)', (0.06, 0.06, 0.07), 0.6, 0.45, ru='алюминиевый сплав, чёрное анодирование'),
    tube=lib.mat('DA40 pedal S-tube and sledge tube (steel, painted)', (0.16, 0.17, 0.18), 0.6, 0.4, ru='стальная труба, окраска'),
    black=lib.mat('DA40 black anodised', (0.05, 0.05, 0.06), 0.6, 0.4, ru='алюминий, чёрное анодирование'),
    grip=lib.mat('DA40 T-grip (black plastic)', (0.03, 0.03, 0.035), 0.0, 0.6, ru='чёрный пластик'),
    steel=lib.mat('DA40 stainless steel', (0.62, 0.63, 0.65), 1.0, 0.28, ru='нержавеющая сталь'),
)

# узлы: (метка, ru, группы педалей MSFS, передние узлы педалей, салазки/каретка/опоры)
SIDES = {
    1: ('pilot', 'пилота', ('HANDLING_RudderPedals_1_1', 'HANDLING_RudderPedals_1_2'), ('Empty.050', 'Empty.047'),
        ('Cylinder.121', 'Cube.068', 'Cube.069', 'Cube.002', 'Plane.143', 'Plane.144')),
    -1: ('co-pilot', 'второго пилота', ('HANDLING_RudderPedals_1_1.001', 'HANDLING_RudderPedals_1_2.001'), ('Empty.002', 'Empty.005'),
         ('Cylinder.119', 'Cube.026', 'Cube.024', 'Cube.037', 'Plane.032', 'Plane.033')),
}
STUBS = {'BezierCurve.011', 'BezierCurve.012', 'BezierCurve.017', 'BezierCurve.018'}   # обрубки тросов MSFS — тросы строит rudder_cables.py
PEDAL_X = {1: 0.2575, -1: -0.258}       # ось верхней салазки узла (Cylinder.121 / .119), как в controls.py


def copy_into(p, objs, mi):
    for o in objs:
        bm = bmesh.new()
        dg = bpy.context.evaluated_depsgraph_get()
        e = o.evaluated_get(dg)
        me = e.to_mesh()
        bm.from_mesh(me)
        e.to_mesh_clear()
        bm.transform(o.matrix_world)
        lib._merge(p, bm, lambda co: co, mi)


def meshes(names, recursive=True):
    out = []
    for n in names:
        o = bpy.data.objects[n]
        for c in ([o] + (list(o.children_recursive) if recursive else [])):
            if c.type == 'MESH' and c.name not in STUBS:
                out.append(c)
    return out


def build():
    for s, (tag, gen, groups, fronts, rails) in SIDES.items():
        allp = meshes(groups) + meshes(fronts)
        stubes = [o for o in allp if o.name.startswith('BezierCurve')]
        pedals = [o for o in allp if not o.name.startswith('BezierCurve')]
        p = P(f'Rudder pedals ({tag})', f'Педали {gen}: левая и правая педали руля направления, сверху — тормозные гашетки (к главным '
              f'тормозным цилиндрам); нижние оси педалей — на каретке, которая при регулировке ходит по салазкам', 'pedal',
              'AMM 27-20 2., рис. 2; 32-40')
        copy_into(p, pedals, 0)
        p.done()
        t = P(f'Rudder pedal S-tubes ({tag})', f'S-образные трубки сбоку от педалей {gen}: тросы кабины руля направления входят в нижний '
              f'конец и выходят из верхнего; педаль вперёд — трубка тянет свой трос. При регулировке педалей тросы скользят в '
              f'трубках, натяжение не меняется', 'tube', 'AMM 27-20 2., 2.A, рис. 2')
        copy_into(t, stubes, 0)
        t.done()
        r = P(f'Rudder pedal sledge tubes and attachments ({tag})', f'Салазки педального узла {gen}: верхняя и нижняя направляющие '
              f'трубки с передней и задней опорами на полу и каретка с педалями; задвижка каретки входит в отверстия нижней трубки',
              'tube', DOC)
        copy_into(r, meshes(rails, recursive=False), 0)
        r.done()
        adjuster(s, tag, gen)


def P(name, ru, m, doc=DOC):
    return Part(name, ru, M[m], COL, True, doc)


def adjuster(s, tag, gen):
    """Т-ручка за задней опорой (РЛЭ 7.3.6: тянуть прямо назад) и тросик к задвижке на нижней салазке."""
    xc = PEDAL_X[s]
    z = 0.030                              # над верхней салазкой (верх трубки z 0,013) и над задней опорой (верх 0,020)
    y_car, y_grip = -0.878, -0.738         # задняя пластина каретки — за задней опорой (её задний край y −0,763)
    h = P(f'Rudder pedal adjuster handle ({tag})', f'Ручка регулировки педалей {gen}: чёрная Т-образная ручка за задней опорой узла. '
          f'Потянуть прямо назад — задвижка выходит из отверстия нижней салазки, узел двигается к креслу; отпустить и нажать на '
          f'обе педали — задвижка входит в отверстие (педали регулируют только на земле)', 'grip', 'AMM 27-20 2.A, рис. 2; РЛЭ 7.3.6')
    cyl(h, V((xc, y_car, z)), V((xc, y_grip, z)), 0.0035, h.m(M['steel']), segs=12)                  # стержень
    box(h, V((xc, -0.783, z)), (0.016, 0.012, 0.014), Matrix.Identity(3), h.m(M['black']), bevel=0.002)   # направляющая на опоре
    box(h, V((xc, -0.783, (z + 0.020) / 2 - 0.002)), (0.010, 0.010, z - 0.020 + 0.006), Matrix.Identity(3), h.m(M['black']))
    cyl(h, V((xc, y_grip - 0.002, z - 0.028)), V((xc, y_grip - 0.002, z + 0.028)), 0.0105, 0, segs=18)   # Т-рукоятка (вертикальная)
    for dz in (-0.028, 0.028):
        lib.sphere(h, V((xc, y_grip - 0.002, z + dz)), 0.0105, 0, segs=14, rings=6, zscale=0.5)
    cyl(h, V((xc, y_grip + 0.006, z)), V((xc, y_grip - 0.002, z)), 0.007, 0, segs=14)                    # ступица
    cyl(h, V((xc, y_car + 0.004, z)), V((xc, y_car - 0.006, z)), 0.007, h.m(M['black']), segs=14)       # упор на каретке
    h.done()
    c = P(f'Rudder pedal adjuster cable ({tag})', f'Тросик от ручки регулировки педалей {gen} к задвижке каретки на нижней салазке',
          'black', 'AMM 27-20 рис. 2')
    q0 = V((xc + s * 0.010, y_car + 0.006, z))
    path = lib.fillet([q0, q0 + V((s * 0.012, 0.0, -0.004)), V((xc + s * 0.026, -0.876, -0.010)), V((xc + s * 0.026, -0.874, -0.040)),
                       V((xc + s * 0.026, -0.900, -0.052)), V((xc + s * 0.015, -0.915, -0.052))], 0.008)
    lib.sweep(c, path, 0.0022, 0, segs=8)
    c.done()


build()
dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'PEDALS_OK {OUT} {size / 1e6:.2f} MB, parts {len([o for o in COL.all_objects if o.type == "MESH"])}')
