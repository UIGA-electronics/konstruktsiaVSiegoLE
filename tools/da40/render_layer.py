"""Рендер слоя поверх исходной модели для проверки глазами.

    python3 tools/da40/render_layer.py layer.glb out_prefix "name|cam|look|lens|mode" ...

mode: sys — только слой; ghost — слой и полупрозрачный планер; full — всё как есть.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import ref  # noqa: E402

glb, prefix = sys.argv[1], sys.argv[2]
jobs = [a.split('|') for a in sys.argv[3:]]
drop = os.environ.get('DROP', 'Fuel system,Wing structure').split(',')

ref.open_source()
R = ref.Ref()
for d in drop:
    ref.drop_collection(d)
for n in ref.REPLACED:
    o = bpy.data.objects.get(n)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)
before = set(bpy.data.objects)
for g in glb.split(','):
    bpy.ops.import_scene.gltf(filepath=g)
new = [o for o in bpy.data.objects if o not in before]
layer = bpy.data.collections.new('LAYER')
bpy.context.scene.collection.children.link(layer)
for o in new:
    for c in list(o.users_collection):
        c.objects.unlink(o)
    layer.objects.link(o)
    if o.parent is None:
        o.location.z -= R.lift
sc = bpy.context.scene
vl = bpy.context.view_layer


def lci(lc):
    yield lc
    for c in lc.children:
        yield from lci(c)


for lc in lci(vl.layer_collection):
    if lc.name in ('DA40 Photo set', 'DA40 Service (hidden)', 'glTF_not_exported', 'Collection', 'DA40 Lights'):
        lc.exclude = True
for n in ('DA40 Haze', 'Apron'):
    o = bpy.data.objects.get(n)
    if o:
        o.hide_render = True

ghost = bpy.data.materials.new('GHOST')
ghost.use_nodes = True
b = ghost.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (0.75, 0.8, 0.88, 1)
b.inputs['Alpha'].default_value = 0.12
b.inputs['Roughness'].default_value = 0.4
for o in bpy.data.objects:
    ad = o.animation_data
    if ad:
        for fc in list(ad.drivers):
            if fc.data_path.startswith('hide'):
                ad.drivers.remove(fc)
keep_cols = ('DA40 Exterior', 'DA40 Interior')
keep = set()
for cn in keep_cols:
    keep |= {o.name for o in bpy.data.collections[cn].all_objects}
lay = {x.name for x in layer.all_objects}
for o in bpy.data.objects:
    if o.name not in lay and o.name not in keep and o.type in ('MESH', 'CURVE'):
        o.hide_render = True
airframe = [o for o in bpy.data.objects if o.type == 'MESH' and o.name in keep]
orig = {o.name: [s.material for s in o.material_slots] for o in airframe}

cd = bpy.data.cameras.new('C')
cam = bpy.data.objects.new('C', cd)
sc.collection.objects.link(cam)
sc.camera = cam
cd.clip_start = 0.005
sun = bpy.data.objects.new('S', bpy.data.lights.new('S', 'SUN'))
sun.data.energy = 3.0
sc.collection.objects.link(sun)
fill = bpy.data.objects.new('F', bpy.data.lights.new('F', 'SUN'))
fill.data.energy = 1.2
sc.collection.objects.link(fill)
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = int(os.environ.get('SAMPLES', 28))
sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.render.resolution_x = int(os.environ.get('W', 1600))
sc.render.resolution_y = int(os.environ.get('H', 900))

sys_names = {o.name for o in layer.all_objects}
for name, camp, look, lens, mode in jobs:
    for o in airframe:
        o.hide_render = mode == 'sys'
        if mode == 'ghost':
            for s in o.material_slots:
                s.link = 'OBJECT'
                s.material = ghost
        else:
            for s, m in zip(o.material_slots, orig[o.name]):
                s.link = 'OBJECT'
                s.material = m
    p = Vector(map(float, camp.split(',')))
    t = Vector(map(float, look.split(',')))
    cam.location = p
    cam.rotation_euler = (t - p).to_track_quat('-Z', 'Y').to_euler()
    if lens.startswith('o'):
        cd.type = 'ORTHO'
        cd.ortho_scale = float(lens[1:])
    else:
        cd.type = 'PERSP'
        cd.lens = float(lens)
    d = (t - p).normalized()
    sun.rotation_euler = (d + Vector((0.3, 0.2, -0.8))).normalized().to_track_quat('-Z', 'Y').to_euler()
    fill.rotation_euler = (-(d) + Vector((0, 0, 0.6))).normalized().to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{prefix}_{name}.png'
    bpy.ops.render.render(write_still=True)
    print('RENDERED', sc.render.filepath)
