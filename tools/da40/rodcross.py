"""Где тяги слоя управления (controls-addon) пересекают нервюры крыла — во всех клипах.

blender -b --python tools/da40/rodcross.py -- [controls.glb]

Пишет tools/da40/wing-rod-holes.json: для каждой нервюры (x) — вырезы [y, z, r] под тяги,
охватывающие сечение тяги во всех кадрах всех клипов; wing.py вырезает их в нервюрах.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Vector as V  # noqa: E402

import ref  # noqa: E402

RIBS = [1.205, 2.80, 3.25, 3.88]                    # корневая нервюра и нервюры управления (wing.py)
GAP = 0.004                                         # зазор вокруг сечения тяги

ref.open_source()
R = ref.Ref()
src = sys.argv[-1] if sys.argv[-1].endswith('.glb') else '/home/user/da40src/out4/da40-controls-addon-raw.glb'
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=src)
new = [o for o in bpy.data.objects if o not in before]
for o in new:
    if o.parent is None:
        o.location.z -= R.lift
rods = [o for o in new if o.type == 'MESH' and 'push rod' in o.name and 'guide' not in o.name]
clips = sorted({t.name.split('.')[0] for o in new if o.animation_data for t in o.animation_data.nla_tracks})
sc = bpy.context.scene


def sections():
    """Точки сечения каждой тяги плоскостями нервюр в текущей позе."""
    out = []
    for o in rods:
        mw = o.matrix_world
        vs = [mw @ v.co for v in o.data.vertices]
        for x0 in RIBS:
            for s in (1, -1):
                X = s * x0
                pts = []
                for e in o.data.edges:
                    a, b = vs[e.vertices[0]], vs[e.vertices[1]]
                    da, db = a.x - X, b.x - X
                    if (da < 0) != (db < 0):
                        pts.append(a.lerp(b, da / (da - db)))
                if len(pts) >= 4:
                    out.append((o.name, X, pts))
    return out


acc = {}
poses = [('rest', None)]
for nm in clips:
    poses += [(nm, k) for k in range(5)]
for nm, k in poses:
    for o in new:
        if o.animation_data:
            o.animation_data.action = None
    if nm != 'rest':
        rng = None
        for o in new:
            if not o.animation_data:
                continue
            for t in o.animation_data.nla_tracks:
                if t.name.split('.')[0] == nm and t.strips:
                    a = t.strips[0].action
                    o.animation_data.action = a
                    r = a.frame_range
                    rng = (min(rng[0], r[0]), max(rng[1], r[1])) if rng else (r[0], r[1])
        sc.frame_set(int(round(rng[0] + (rng[1] - rng[0]) * k / 4)))
    else:
        sc.frame_set(1)
    bpy.context.view_layer.update()
    for name, X, pts in sections():
        acc.setdefault((name, X), []).extend(pts)

holes = {}
for (name, X), pts in sorted(acc.items()):
    c = sum(pts, V()) / len(pts)
    r = max((q - c).length for q in pts) + GAP
    holes.setdefault(f'{X:+.3f}', []).append({'rod': name, 'y': round(c.y, 4), 'z': round(c.z, 4), 'r': round(r, 4)})
    print(f'ROD {name} x {X:+.3f}: y {c.y:.4f} z {c.z:.4f} r {r * 1000:.1f} мм')
with open(os.path.join(HERE, 'wing-rod-holes.json'), 'w') as f:
    json.dump(holes, f, ensure_ascii=False, indent=1)
    f.write('\n')
print('RODCROSS_OK', sum(len(v) for v in holes.values()))
