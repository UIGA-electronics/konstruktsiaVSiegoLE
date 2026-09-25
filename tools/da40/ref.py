"""Опорная геометрия DA 40 NG из исходного .blend: обшивка, лонжероны, пол.

Все системы строятся в мировых координатах исходника (X — влево, Y — назад,
Z — вверх, нос в −Y) и экспортируются с тем же подъёмом на колёса, что и
остальные файлы сайта, поэтому ложатся друг на друга без подгонки.
"""
import json
import os
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

SRC = os.environ.get('DA40_BLEND', '/home/user/da40src/DA40NG_handover/model/DA40NG_Tundra.blend')
TEX = os.path.join(os.path.dirname(SRC), 'textures')

SHELL_MATS = {'Fuselage', 'Fuselage2', 'Wings'}


def open_source():
    bpy.ops.wm.open_mainfile(filepath=SRC)
    if os.path.isdir(TEX):
        bpy.ops.file.find_missing_files(directory=TEX)


def _bvh(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    verts, polys = [], []
    for o in objs:
        e = o.evaluated_get(dg)
        m = e.to_mesh()
        M = o.matrix_world
        base = len(verts)
        verts.extend(M @ v.co for v in m.vertices)
        polys.extend([base + i for i in p.vertices] for p in m.polygons)
        e.to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys)


# Детали MSFS, которые заменены построенными по документам: из планера они
# вырезаются при нарезке (tools/split-da40.js), обшивку под ними берём без них.
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'replaced.json')) as _f:
    REPLACED = json.load(_f)


class Ref:
    def __init__(self, exclude=()):
        ext = bpy.data.collections['DA40 Exterior']
        skip = set(REPLACED) | set(exclude)
        shell = [o for o in ext.all_objects if o.type == 'MESH' and o.name not in skip and
                 any(m and m.name in SHELL_MATS for m in o.data.materials)]
        self.shell_names = [o.name for o in shell]
        self.shell = _bvh(shell)
        ws = bpy.data.collections.get('Wing structure')
        self.spars = _bvh([o for o in ws.all_objects if o.type == 'MESH' and 'spar shear web' in o.name]) if ws else None
        self.lift = self._lift()

    def _lift(self):
        low = []
        for n in ('Tundra tyre L', 'Tundra tyre R', 'Tundra tyre N', 'Cylinder.016'):
            o = bpy.data.objects.get(n)
            if o and o.type == 'MESH':
                low.append(min((o.matrix_world @ Vector(v)).z for v in o.bound_box))
        return -min(low)

    def hit(self, origin, direction, dist=10.0):
        loc, nor, idx, d = self.shell.ray_cast(Vector(origin), Vector(direction).normalized(), dist)
        return (loc, nor) if loc is not None else (None, None)

    def skin(self, x, y, side):
        """Точка и наружная нормаль обшивки крыла/фюзеляжа над или под (x, y)."""
        if side == 'upper':
            loc, nor = self.hit((x, y, 3.0), (0, 0, -1))
        else:
            loc, nor = self.hit((x, y, -3.0), (0, 0, 1))
        if loc is None:
            return None, None
        if (side == 'upper' and nor.z < 0) or (side == 'lower' and nor.z > 0):
            nor = -nor
        return loc, nor

    def wing_section(self, x, y):
        up, _ = self.skin(x, y, 'upper')
        lo, _ = self.skin(x, y, 'lower')
        return (lo.z if lo else None), (up.z if up else None)

    def spar_faces(self, x, z):
        """Задняя грань переднего и передняя грань заднего лонжерона на размахе x."""
        f = self.spars.ray_cast(Vector((x, 0.25, z)), Vector((0, -1, 0)), 1.0)[0]
        r = self.spars.ray_cast(Vector((x, 0.25, z)), Vector((0, 1, 0)), 1.0)[0]
        return (f.y if f else None), (r.y if r else None)


def export(col, path, lift):
    """Экспорт одной коллекции в GLB в системе координат сайта.

    Всё вешается на пустышку «DA40 ROOT», поднятую на lift: так колёса
    стоят на нуле, как в остальных файлах, и слои совпадают."""
    root = bpy.data.objects.new('DA40 ROOT', None)
    col.objects.link(root)
    root.location = (0, 0, lift)
    bpy.context.view_layer.update()
    for o in col.all_objects:
        if o is not root and o.parent is None:
            o.parent = root
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in col.all_objects:
        o.hide_set(False)
        o.select_set(True)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
              export_yup=True, export_materials='EXPORT', export_animations=False,
              export_cameras=False, export_lights=False, export_extras=False)
    valid = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in valid})
    return os.path.getsize(path)


def drop_collection(name):
    """Убрать старую версию системы из исходника, чтобы имена не конфликтовали."""
    c = bpy.data.collections.get(name)
    if not c:
        return
    for o in list(c.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
