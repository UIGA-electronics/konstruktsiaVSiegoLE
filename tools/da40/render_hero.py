"""Студийный рендер самолёта целиком для главной страницы сайта.

    W=2400 H=1250 SAMPLES=96 python3 tools/da40/render_hero.py out.png "cam" "look" lens

Прозрачный фон и тень на ловушке теней: картинка ложится на тёмный фон
страницы. Свет — как в фотостудии: большой софтбокс сверху спереди, холодный
контровой сзади, слабая заливка снизу. Системы скрыты, видны планер и салон.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import ref  # noqa: E402

out, camp, look, lens = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
ref.open_source()
R = ref.Ref()
for n in ref.REPLACED:
    o = bpy.data.objects.get(n)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)

sc = bpy.context.scene
vl = bpy.context.view_layer


def lci(lc):
    yield lc
    for c in lc.children:
        yield from lci(c)


for lc in lci(vl.layer_collection):
    if lc.name in ('DA40 Photo set', 'DA40 Service (hidden)', 'glTF_not_exported', 'Collection', 'DA40 Lights', 'DA40 Systems'):
        lc.exclude = True
for n in ('DA40 Haze', 'Apron'):
    o = bpy.data.objects.get(n)
    if o:
        o.hide_render = True
for o in bpy.data.objects:
    ad = o.animation_data
    if ad:
        for fc in list(ad.drivers):
            if fc.data_path.startswith('hide'):
                ad.drivers.remove(fc)
keep = set()
for cn in ('DA40 Exterior', 'DA40 Interior'):
    keep |= {o.name for o in bpy.data.collections[cn].all_objects}
for o in bpy.data.objects:
    if o.type in ('MESH', 'CURVE') and o.name not in keep:
        o.hide_render = True

# пол — ловушка теней
bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -R.lift))
floor = bpy.context.active_object
floor.is_shadow_catcher = True

# мир — тёмный: в белой обшивке отражается тёмная студия
w = bpy.data.worlds.new('W')
sc.world = w
w.use_nodes = True
bg = w.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.018, 0.02, 0.024, 1)
bg.inputs['Strength'].default_value = 1.0


def area(name, loc, target, size, energy, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.shape = 'RECTANGLE'
    ld.size, ld.size_y = size, size * 0.6
    ld.energy = energy
    ld.color = color
    ob = bpy.data.objects.new(name, ld)
    sc.collection.objects.link(ob)
    ob.location = Vector(loc)
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


c = Vector((0, 0.9, 0.0))
area('Key', (7, -7, 9), c, 9, 3600, (1.0, 0.97, 0.93))
area('Top', (0, 0.5, 11), c, 12, 2200)
area('Rim', (-6, 11, 4), c, 7, 4500, (0.75, 0.85, 1.0))
area('Fill', (-9, -7, 1.2), c, 6, 450, (0.9, 0.93, 1.0))

cd = bpy.data.cameras.new('C')
cam = bpy.data.objects.new('C', cd)
sc.collection.objects.link(cam)
sc.camera = cam
p, t = Vector(map(float, camp.split(','))), Vector(map(float, look.split(',')))
cam.location = p
cam.rotation_euler = (t - p).to_track_quat('-Z', 'Y').to_euler()
cd.lens = lens
cd.clip_start = 0.05

sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = int(os.environ.get('SAMPLES', 96))
sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.render.resolution_x = int(os.environ.get('W', 2400))
sc.render.resolution_y = int(os.environ.get('H', 1250))
sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
try:
    sc.view_settings.view_transform = 'Filmic'
    sc.view_settings.look = 'Medium High Contrast'
except TypeError:
    pass
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('HERO', out)
