"""Опорная геометрия DA 40 NG из исходного .blend: обшивка, лонжероны, пол.

Все системы строятся в мировых координатах исходника (X — влево, Y — назад,
Z — вверх, нос в −Y) и экспортируются с тем же подъёмом на колёса, что и
остальные файлы сайта, поэтому ложатся друг на друга без подгонки.
"""
import json
import os
import struct
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



def swept_bvh(objs, samples=9):
    """BVH деталей во всех положениях: неподвижные — как есть, анимированные (дорожки NLA, как их
    создаёт импорт glTF) — в нейтрали и в samples кадрах каждого клипа. Трассы соседних систем
    обходят не только нейтраль, но и весь ход ручек, тяг и качалок."""
    sc = bpy.context.scene
    f0 = sc.frame_current
    verts, polys = [], []

    def add(o):
        dg = bpy.context.evaluated_depsgraph_get()
        e = o.evaluated_get(dg)
        m = e.to_mesh()
        M = o.matrix_world
        base = len(verts)
        verts.extend(M @ v.co for v in m.vertices)
        polys.extend([base + i for i in p.vertices] for p in m.polygons)
        e.to_mesh_clear()

    for o in objs:
        add(o)
    anim = [o for o in objs if o.animation_data and o.animation_data.nla_tracks]
    # поза деталей до обхода клипов: после него свойства остаются такими, как в последнем кадре последнего клипа,
    # и экспорт записывал в узлы эту позу вместо нейтрали
    basis = {o: o.matrix_basis.copy() for o in anim}
    names = sorted({t.name.split('.')[0] for o in anim for t in o.animation_data.nla_tracks})
    for nm in names:
        acts, rng = {}, None
        for o in anim:
            for t in o.animation_data.nla_tracks:
                if t.name.split('.')[0] == nm and t.strips and t.strips[0].action:
                    a = t.strips[0].action
                    acts[o] = a
                    r = a.frame_range
                    rng = (min(rng[0], r[0]), max(rng[1], r[1])) if rng else (r[0], r[1])
        if not acts:
            continue
        keep = {o: o.animation_data.action for o in acts}
        for o, a in acts.items():
            o.animation_data.action = a
        for i in range(samples):
            sc.frame_set(int(round(rng[0] + (rng[1] - rng[0]) * i / (samples - 1))))
            bpy.context.view_layer.update()
            for o in acts:
                add(o)
        for o, a in keep.items():
            o.animation_data.action = a
    sc.frame_set(f0)
    for o, m in basis.items():
        o.matrix_basis = m
    bpy.context.view_layer.update()
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


def export(col, path, lift, anim=False, mode='ACTIONS'):
    """Экспорт одной коллекции в GLB в системе координат сайта.

    Всё вешается на пустышку «DA40 ROOT», поднятую на lift: так колёса
    стоят на нуле, как в остальных файлах, и слои совпадают. anim=True —
    с анимацией (ключи объектов; время = кадр / fps, как в клипах исходника); mode='NLA_TRACKS' —
    клип на каждое имя дорожки NLA (все детали с дорожкой этого имени в одном клипе)."""
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
    # нейтраль анимированных деталей — до экспорта: см. _rest_pose
    rest = {o.name: o.matrix_basis.decompose() for o in col.all_objects
            if o is not root and o.animation_data and (o.animation_data.nla_tracks or o.animation_data.action)} if anim else {}
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
              export_yup=True, export_materials='EXPORT', export_animations=anim,
              export_animation_mode=mode, export_force_sampling=True, export_frame_range=False,
              export_anim_slide_to_zero=False, export_optimize_animation_size=False,
              export_cameras=False, export_lights=False, export_extras=False)
    valid = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in valid})
    if rest:
        _rest_pose(path, rest)
    return os.path.getsize(path)


def _rest_pose(path, rest):
    """Вернуть анимированным узлам GLB нейтральную позу.

    Экспортёр glTF перебирает дорожки NLA и записывает в узел то положение, в котором деталь осталась после
    последнего кадра последнего клипа. Пока на сайте не запущен сценарий, деталь показывается в позе узла:
    проводка закрылков стояла выпущенной при убранных закрылках, проводка элеронов и ручки — в крайнем
    положении. Ключи клипов не меняются — правится только поза узла (translation / rotation / scale).
    rest — {имя: (смещение, кватернион, масштаб)} в координатах Blender до экспорта."""
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, _ = struct.unpack_from('<4sII', data, 0)
    jlen, jtype = struct.unpack_from('<I4s', data, 12)
    assert magic == b'glTF' and jtype == b'JSON', path
    js = json.loads(data[20:20 + jlen].decode('utf-8'))
    tail = data[20 + jlen:]
    done = 0
    for node in js.get('nodes', []):
        r = rest.get(node.get('name'))
        if r is None:
            continue
        loc, rot, scl = r
        node.pop('matrix', None)
        node['translation'] = [loc.x, loc.z, -loc.y]              # Blender (X, Y, Z) → glTF (X, Z, −Y)
        node['rotation'] = [rot.x, rot.z, -rot.y, rot.w]
        node['scale'] = [scl.x, scl.z, scl.y]
        done += 1
    out = json.dumps(js, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    out += b' ' * (-len(out) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', magic, ver, 20 + len(out) + len(tail)))
        f.write(struct.pack('<I4s', len(out), b'JSON'))
        f.write(out)
        f.write(tail)
    print(f'REST нейтральная поза записана в {done} узлов из {len(rest)}')


def drop_collection(name):
    """Убрать старую версию системы из исходника, чтобы имена не конфликтовали."""
    c = bpy.data.collections.get(name)
    if not c:
        return
    for o in list(c.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
