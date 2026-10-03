"""Общее для слоёв, которые прокладывают шланги и провода через кабину.

Отделка кабины, соседние системы и планировщик трасс (route.Router) с одними
и теми же точками обзора. Двигатель AE300 (powerplant.py) — тоже препятствие:
по нему прокладываются шланги топлива и кабели в моторном отсеке. Соседние системы: управление — из исходника,
пересобранные слои — из их GLB в LAYERS (свой слой не берётся). Электрика и
авионика исходника заменены слоями electrical, instruments и radio.
"""
import os

import bpy
from mathutils import Vector as V

import ref
from route import Router

LAYERS = os.environ.get('LAYERS', '/home/user/da40src/out2')
BUILT = ('fuel', 'brakes', 'gear', 'pitot', 'engine', 'cooling', 'induction', 'oil', 'air', 'wing', 'controls-addon', 'electrical',
         'instruments', 'radio')
SOURCE_SYSTEMS = ('Flight controls',)

# глаза пилотов, камера сзади по центру, низко у колен — как заглядывают в нишу для ног на сайте
EYES = [V(e) for e in ((0, 0.25, 0.78), (0.28, 0.15, 0.78), (-0.28, 0.15, 0.78), (0.3, 0.0, 0.5), (-0.3, 0.0, 0.5),
                       (0, 0.6, 0.85), (0.15, -0.2, 0.55), (-0.15, -0.2, 0.55),
                       (0.22, -0.52, 0.2), (-0.22, -0.52, 0.2), (0, -0.45, 0.4))]


def trim_bvh():
    """Отделка салона; детали MSFS, заменённые построенными (replaced.json), не мешают."""
    objs = [o for o in bpy.data.collections['DA40 Interior'].all_objects if o.type == 'MESH' and o.name not in ref.REPLACED and
            not any(m and 'Glass' in m.name for m in o.data.materials)]
    return ref._bvh(objs)


def systems_bvh(R, own, extra=(), skip=None):
    """BVH соседних систем; own — имя своего слоя из BUILT или кортеж имён (их GLB не
    грузятся); extra — имена объектов исходника, которых на сайте уже нет (заменены);
    skip — {слой: функция(объект) → True}, детали соседних слоёв, которые будут
    пересобраны после этого слоя (их трассы уступят место)."""
    own = (own,) if isinstance(own, str) else tuple(own or ())
    objs = [o for c in bpy.data.collections['DA40 Systems'].children if c.name in SOURCE_SYSTEMS
            for o in c.all_objects if o.type == 'MESH' and o.name not in extra]
    new, keep = [], []
    for g in BUILT:
        f = os.path.join(LAYERS, f'da40-{g}-raw.glb')
        if g in own:
            continue
        if not os.path.exists(f):
            print('NO LAYER', f)
            continue
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=f)
        got = [o for o in bpy.data.objects if o not in before]
        new += got
        drop = (skip or {}).get(g)
        keep += [o for o in got if o.type == 'MESH' and not (drop and drop(o))]
    for o in new:
        if o.parent is None:
            o.location.z -= R.lift
    bpy.context.view_layer.update()
    bvh = ref._bvh(objs + keep)
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    return bvh


def hull_bvh(R):
    """Обшивка и остекление: по ним Router проверяет, что трасса внутри планера."""
    glass = [o for c in ('DA40 Exterior', 'DA40 Interior') for o in bpy.data.collections[c].all_objects
             if o.type == 'MESH' and any(m and 'Glass' in m.name for m in o.data.materials)]
    shell = [o for o in bpy.data.collections['DA40 Exterior'].all_objects if o.name in R.shell_names]
    return ref._bvh(shell + glass)


def setup(R, own, step=0.010, extra=(), skip=None):
    """(отделка, соседние системы, планировщик) для слоя own."""
    trim = trim_bvh()
    sys_ = systems_bvh(R, own, extra, skip)
    return trim, sys_, Router([R.shell, sys_], [R.shell, trim], EYES, soft=[trim], step=step, hull=hull_bvh(R))
