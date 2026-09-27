"""Общее для слоёв, которые прокладывают шланги и провода через кабину.

Отделка кабины, соседние системы и планировщик трасс (route.Router) с одними
и теми же точками обзора. Соседние системы: управление, электрика и авионика
— из исходника, пересобранные слои — из их GLB в LAYERS (свой слой не берётся).
"""
import os

import bpy
from mathutils import Vector as V

import ref
from route import Router

LAYERS = os.environ.get('LAYERS', '/home/user/da40src/out2')
BUILT = ('fuel', 'brakes', 'pitot', 'engine', 'cooling', 'induction', 'oil', 'air', 'wing', 'controls-addon', 'electrical')
SOURCE_SYSTEMS = ('Flight controls', 'Electrical system', 'Avionics & antennas')

# глаза пилотов, камера сзади по центру, низко у колен — как заглядывают в нишу для ног на сайте
EYES = [V(e) for e in ((0, 0.25, 0.78), (0.28, 0.15, 0.78), (-0.28, 0.15, 0.78), (0.3, 0.0, 0.5), (-0.3, 0.0, 0.5),
                       (0, 0.6, 0.85), (0.15, -0.2, 0.55), (-0.15, -0.2, 0.55),
                       (0.22, -0.52, 0.2), (-0.22, -0.52, 0.2), (0, -0.45, 0.4))]


def trim_bvh():
    objs = [o for o in bpy.data.collections['DA40 Interior'].all_objects if o.type == 'MESH' and
            not any(m and 'Glass' in m.name for m in o.data.materials)]
    return ref._bvh(objs)


def systems_bvh(R, own, extra=()):
    """BVH соседних систем; own — имя своего слоя из BUILT (его GLB не грузится);
    extra — имена объектов исходника, которых на сайте уже нет (заменены)."""
    objs = [o for c in bpy.data.collections['DA40 Systems'].children if c.name in SOURCE_SYSTEMS
            for o in c.all_objects if o.type == 'MESH' and o.name not in extra]
    before = set(bpy.data.objects)
    for g in BUILT:
        f = os.path.join(LAYERS, f'da40-{g}-raw.glb')
        if g == own:
            continue
        if os.path.exists(f):
            bpy.ops.import_scene.gltf(filepath=f)
        else:
            print('NO LAYER', f)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location.z -= R.lift
    bpy.context.view_layer.update()
    bvh = ref._bvh(objs + [o for o in new if o.type == 'MESH'])
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    return bvh


def setup(R, own, step=0.010, extra=()):
    """(отделка, соседние системы, планировщик) для слоя own."""
    trim = trim_bvh()
    sys_ = systems_bvh(R, own, extra)
    return trim, sys_, Router([R.shell, sys_], [R.shell, trim], EYES, soft=[trim], step=step)
