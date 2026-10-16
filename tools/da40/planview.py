"""План DA 40 NG (вид сверху) для схемы выбора систем на сайте: маски из Blender.

python3 tools/da40/planview.py OUT_DIR

Ортографическая камера сверху, нос вверх. Пишет в OUT_DIR:
  ids.png       — обшивка исходника: каждая деталь своим цветом (видимая сверху),
                  по границам цветов planview_svg.py рисует линии плана;
  ids.json      — цвет → имя детали;
  sys-<id>.png  — силуэт системы раздела (детали слоя без обшивки);
  frame.json    — масштаб: пиксель ↔ метры исходника.
Слои систем — сырые GLB (LAYERS, по умолчанию /home/user/da40src/out2).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Euler, Vector as V  # noqa: E402

import ref  # noqa: E402

OUT = sys.argv[-1]
LAYERS = os.environ.get('LAYERS', '/home/user/da40src/out2')
PX_PER_M = float(os.environ.get('PX_PER_M', 200))
X0, X1 = -5.95, 5.95                 # размах (x влево — на плане слева)
Y0, Y1 = -2.15, 5.80                 # от кока до законцовки руля высоты (нос в −y)

# разделы практикума → файлы и коллекции исходника, из которых состоит система
SYSTEMS = {
    'da40-fuselage': {'layers': ['structure'], 'colls': []},
    'da40-cabin': {'layers': ['doors', 'equipment'], 'colls': []},
    'da40-controls': {'layers': ['controls-addon'], 'colls': ['Flight controls']},
    'da40-wing': {'layers': ['wing'], 'colls': ['Wing structure']},
    'da40-fuel': {'layers': ['fuel'], 'colls': []},
    'da40-powerplant': {'layers': ['engine', 'induction', 'cooling', 'oil'], 'colls': []},
    'da40-electrical': {'layers': ['electrical', 'bonding'], 'colls': []},
    'da40-instruments': {'layers': ['instruments', 'pitot'], 'colls': []},
    'da40-radio': {'layers': ['radio'], 'colls': []},
    'da40-gear': {'layers': ['gear', 'brakes'], 'colls': []},
    'da40-air': {'layers': ['air'], 'colls': []},
}

ref.open_source()
R = ref.Ref()
REPLACED = set(ref.REPLACED)
sc = bpy.context.scene
os.makedirs(OUT, exist_ok=True)

# ── камера и рендер ──────────────────────────────────────────────────────
W = int(round((X1 - X0) * PX_PER_M))
H = int(round((Y1 - Y0) * PX_PER_M))
cam_data = bpy.data.cameras.new('plan')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = max(X1 - X0, Y1 - Y0)
cam = bpy.data.objects.new('plan', cam_data)
sc.collection.objects.link(cam)
cam.location = V(((X0 + X1) / 2, (Y0 + Y1) / 2, 20.0))
cam.rotation_euler = Euler((0, 0, 3.14159265), 'XYZ')       # нос (−y) вверх, левое крыло (+x) слева
cam_data.clip_start, cam_data.clip_end = 0.1, 60
sc.camera = cam
r = sc.render
r.engine = 'CYCLES'
sc.cycles.samples = 1
sc.cycles.use_denoising = False
sc.cycles.filter_width = 0.01
sc.cycles.max_bounces = 0
r.resolution_x, r.resolution_y, r.resolution_percentage = W, H, 100
r.film_transparent = False
r.image_settings.file_format = 'PNG'
r.image_settings.color_mode = 'RGB'
r.image_settings.color_depth = '8'
sc.view_settings.view_transform = 'Raw' if 'Raw' in [i.identifier for i in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Standard'
sc.view_settings.look = 'None'
world = bpy.data.worlds.new('plan')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0, 0, 0, 1)
sc.world = world


def emission(name, rgb):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs[0].default_value = (*rgb, 1)
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def only(objs):
    """В кадре только objs; пустышки-вставки коллекций (винт, двигатель) тоже прячем."""
    keep = set(objs)
    for o in bpy.data.objects:
        if o.type in ('CAMERA', 'LIGHT'):
            continue
        if o not in keep and o.animation_data:
            o.animation_data_clear()               # у капота видимость анимирована: ключи вернули бы его в кадр
        o.hide_render = o not in keep


def shoot(path):
    r.filepath = path
    bpy.ops.render.render(write_still=True)


def colour(i):
    """id → цвет: по 8 уровней в каждом канале (Raw — значения не искажаются)."""
    i += 1
    return ((i % 8) / 7, ((i // 8) % 8) / 7, ((i // 64) % 8) / 7)


ONLY_SYS = bool(os.environ.get('ONLY_SYS'))

# ── обшивка: каждая деталь своим цветом ──────────────────────────────────
ext = [o for o in bpy.data.collections['DA40 Exterior'].all_objects
       if o.type == 'MESH' and not o.hide_render and 'lamp' not in ','.join(m.name for m in o.data.materials if m).lower()]
ids = {}
for i, o in enumerate(ext):
    c = colour(i)
    m = emission(f'id{i}', c)
    if not o.material_slots:
        o.data.materials.append(m)
    for sl in o.material_slots:                     # общие меши у нескольких деталей: материал — на объекте
        sl.link = 'OBJECT'
        sl.material = m
    ids['%d,%d,%d' % tuple(round(v * 7) for v in c)] = o.name
only(ext)
if not ONLY_SYS:
    shoot(os.path.join(OUT, 'ids.png'))
with open(os.path.join(OUT, 'ids.json'), 'w') as f:
    json.dump(ids, f, ensure_ascii=False, indent=1)

# силуэт каждой заметной детали отдельно: чистый контур без «ряби» совпадающих граней;
# planview_svg.py оставляет от него только видимую сверху часть (по ids.png)
white = emission('white', (1, 1, 1))
sc.view_layers[0].material_override = white
sil = {}
for i, o in enumerate(ext):
    bb = [o.matrix_world @ V(v) for v in o.bound_box]
    if (max(v.x for v in bb) - min(v.x for v in bb)) * (max(v.y for v in bb) - min(v.y for v in bb)) < 0.004:
        continue
    sil[i] = o.name
    if ONLY_SYS:
        continue
    only([o])
    shoot(os.path.join(OUT, f'sil-{i:03d}.png'))
with open(os.path.join(OUT, 'sil.json'), 'w') as f:
    json.dump({'%d,%d,%d' % tuple(round(v * 7) for v in colour(i)): f'sil-{i:03d}.png' for i in sil}, f, indent=1)
print('SIL', len(sil))
if os.environ.get('ONLY_IDS'):
    sys.exit(0)

# ── системы: силуэт деталей раздела ──────────────────────────────────────
loaded = {}


def layer(g):
    if g in loaded:
        return loaded[g]
    f = os.path.join(LAYERS, f'da40-{g}-raw.glb')
    before = set(bpy.data.objects)
    if os.path.exists(f):
        bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location.z -= R.lift
    bpy.context.view_layer.update()
    loaded[g] = [o for o in new if o.type == 'MESH']
    print(f'LAYER {g}: {len(loaded[g])} деталей')
    return loaded[g]


for sid, d in SYSTEMS.items():
    objs = []
    for g in d['layers']:
        objs += layer(g)
    for cn in d['colls']:
        objs += [o for o in bpy.data.collections[cn].all_objects if o.type == 'MESH' and o.name not in REPLACED]
    only(objs)
    shoot(os.path.join(OUT, f'sys-{sid}.png'))
    print(f'SYS {sid}: {len(objs)} деталей')

with open(os.path.join(OUT, 'frame.json'), 'w') as f:
    json.dump({'x0': X0, 'x1': X1, 'y0': Y0, 'y1': Y1, 'w': W, 'h': H, 'px_per_m': PX_PER_M,
               'note': 'пиксель (0,0) — левый верхний угол: x = X1 − px/k (левое крыло слева), y = Y0 + py/k'}, f, indent=1)
print('PLAN_OK', W, H)
