"""Проверка готового слоя на месте: зазоры и видимость каждой детали.

    python3 tools/da40/audit.py /path/da40-brakes-raw.glb [--skip Brakes]

Слой ставится в исходник (с пересобранными слоями из LAYERS вместо старых
систем) и для каждой детали печатается: наименьший зазор до обшивки,
отделки кабины и соседних систем, доля вершин, видимых из кабины (те же
точки обзора, что у планировщика трасс), и габарит.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector as V  # noqa: E402

import ref  # noqa: E402
from route import Router  # noqa: E402

glb = sys.argv[1]
LAYERS = os.environ.get('LAYERS', '/home/user/da40src/out2')
EYES = [V(e) for e in ((0, 0.25, 0.78), (0.28, 0.15, 0.78), (-0.28, 0.15, 0.78), (0.3, 0.0, 0.5), (-0.3, 0.0, 0.5),
                       (0, 0.6, 0.85), (0.15, -0.2, 0.55), (-0.15, -0.2, 0.55),
                       (0.22, -0.52, 0.2), (-0.22, -0.52, 0.2), (0, -0.45, 0.4))]

ref.open_source()
R = ref.Ref()
trim = [o for o in bpy.data.collections['DA40 Interior'].all_objects if o.type == 'MESH' and
        not any(m and 'Glass' in m.name for m in o.data.materials)]
T = ref._bvh(trim)
own = os.path.basename(glb).split('-')[1]


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location.z -= R.lift
    bpy.context.view_layer.update()
    return [o for o in new if o.type == 'MESH']


keep = ('Flight controls', 'Electrical system', 'Avionics & antennas')
others = [o for c in bpy.data.collections['DA40 Systems'].children if c.name in keep for o in c.all_objects if o.type == 'MESH']
for g in ('fuel', 'brakes', 'pitot', 'engine', 'cooling', 'induction', 'oil', 'air'):
    f = os.path.join(LAYERS, f'da40-{g}-raw.glb')
    if g != own and os.path.exists(f):
        others += load(f)
S = ref._bvh(others)
mine = load(glb)
rt = Router([R.shell, S], [R.shell, T], EYES)
print(f'AUDIT {glb}: {len(mine)} деталей')
for o in sorted(mine, key=lambda o: o.name):
    M = o.matrix_world
    vs = [M @ v.co for v in o.data.vertices]
    step = max(1, len(vs) // 150)
    sample = vs[::step]
    worst = {'shell': 9, 'trim': 9, 'sys': 9}
    for q in sample:
        for tag, b in (('shell', R.shell), ('trim', T), ('sys', S)):
            h = b.find_nearest(q, 0.1)
            if h[0] is not None and h[3] < worst[tag]:
                worst[tag] = h[3]
    vis = sum(1 for q in sample if rt.seen(q, 0.0))
    lo = [min(v[i] for v in vs) for i in range(3)]
    hi = [max(v[i] for v in vs) for i in range(3)]
    print(f'{o.name[:58]:58s} vis {vis:3d}/{len(sample):3d}  shell {worst["shell"]*1000:5.0f}  trim {worst["trim"]*1000:5.0f}  '
          f'sys {worst["sys"]*1000:5.0f} mm  box {[round(v, 2) for v in lo]}..{[round(v, 2) for v in hi]}')
