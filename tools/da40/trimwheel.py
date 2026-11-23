"""Штурвальчик триммера руля высоты — деталью слоя управления (AMM 27-38 1., 2.A, рис. 1).

    python3 tools/da40/trimwheel.py [out-raw.glb]
    node tools/da40/merge_addon.js models/da40/da40-controls.glb models/da40/da40-controls.glb '[]' out-raw.glb
    node tools/da40/merge_addon.js --labels content/da40-labels.json out-raw.glb

Колесо было только в салоне MSFS (HANDLING_Wheel_ElevatorTrim_Pitch), а рама узла, болт с фрикционным пакетом, шестерня,
зубчатый сектор и трос — в слое управления (controls.py, trim_handwheel). Без салона — на страницах управления и фюзеляжа —
узел стоял без колеса, и было не понять, что это. Здесь сетка колеса копируется в слой управления; на страницах, где виден
и салон, его колесо скрыто (opts.extras[].skip).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402

import lib  # noqa: E402
import ref  # noqa: E402
from lib import Part  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-trimwheel-raw.glb'
SRC = 'HANDLING_Wheel_ElevatorTrim_Pitch'

ref.open_source()
R = ref.Ref()
COL = lib.collection('DA40 Elevator trim handwheel (AMM 27-38)')
WHEEL = lib.mat('DA40 trim handwheel (black plastic)', (0.035, 0.035, 0.04), 0.0, 0.55, ru='чёрный пластик')

p = Part('Elevator trim handwheel', 'Штурвальчик триммера руля высоты на центральном пульте между креслами: сидит на длинном болте '
         'рамы узла. Повернули колесо — малая шестерня на нём поворачивает зубчатый сектор, а сектор тянет или толкает трос '
         'к механизму триммера на руле высоты; верхняя грань сектора с белой чертой видна в прорези накладки рядом с колесом — '
         'это указатель положения триммера', WHEEL, COL, True, 'AMM 27-38 1., 2.A, рис. 1')
o = bpy.data.objects[SRC]
bm = bmesh.new()
dg = bpy.context.evaluated_depsgraph_get()
e = o.evaluated_get(dg)
me = e.to_mesh()
bm.from_mesh(me)
e.to_mesh_clear()
bm.transform(o.matrix_world)
lib._merge(p, bm, lambda co: co, 0)
p.done()

dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'TRIMWHEEL_OK {OUT} {size / 1e6:.3f} MB, parts {len([o for o in COL.all_objects if o.type == "MESH"])}')
