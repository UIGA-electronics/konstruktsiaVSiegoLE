"""Местный обход трасс вокруг новой детали в готовых слоях сайта — без перенарезки слоёв.

    LAYERS=<раскодированные слои> blender -b --factory-startup --python run.py -- tools/da40/reroute.py OUTDIR

Для каждого кабеля из JOBS: ось восстанавливается по сетке опубликованного слоя (центры колец трубы, порядок —
по граням между кольцами), находится участок, где кабель задевает новые детали (здесь — секция управления
двигателем и ход рычага POWER, engine_controls.py), участок вырезается и прокладывается заново планировщиком
route.Router (cabin.setup: обшивка, все слои, отделка, точки обзора) между теми же точками с той же касательной.
Остальная сетка кабеля (наконечники, стяжки, концы) — без изменений. Результат — OUTDIR/<слой>-reroute-raw.glb
с новыми версиями кабелей под теми же именами и OUTDIR/reroute.json (что заменить в каком слое); влить в слой —
merge_addon.js. При полной перенарезке то же даёт сборщик слоя: новые детали стоят в своём слое и для него —
препятствие (cabin.setup), ход рычага — engine_controls.sweep_mesh.
"""
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector as V  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402
from mathutils.geometry import closest_point_on_tri  # noqa: E402

import cabin  # noqa: E402
import engine_controls  # noqa: E402
import lib  # noqa: E402
import ref  # noqa: E402
from route import Router  # noqa: E402

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '/tmp/reroute'
os.makedirs(OUTDIR, exist_ok=True)

# слой, имя, радиус, граней по окружности, радиус гиба, стяжки жгута; порядок — от толстых к тонким
JOBS = [
    ('electrical', 'Main wiring harness (relay junction box → circuit-breaker panel)', 0.010, 14, 0.060, True),
    ('radio', 'G1000 main harness (instrument panel → avionics rack)', 0.009, 14, 0.054, True),
    ('electrical', 'EECU harness: cockpit branch (→ cockpit connectors)', 0.006, 14, 0.036, True),
    ('electrical', 'ECU backup battery cable → ECU backup relay', 0.004, 14, 0.024, False),
    ('brakes', 'Parking brake Bowden cable', 0.0028, 8, 0.030, False),
    ('instruments', 'GTP 59 OAT probe cable → GDC 74A', 0.0025, 10, 0.015, False),
    ('electrical', 'Alternator regulator control wires (ENGINE MASTER)', 0.0025, 10, 0.020, False),
    ('radio', 'Coax: marker antenna → GMA 1347', 0.0025, 10, 0.015, False),
]
CONSOLE = (V((-0.0455, -0.80, -0.104)), V((0.0445, -0.37, 0.30)))   # полость пульта MSFS (стенки, пол, крышка у доски)
HARD = ('Plane.079', 'Plane.378', 'ENGINE_Lever_Throttle_1', 'FUEL_SELECTOR', 'FUEL_WIRE', 'LANDING_GEAR_Switch_ParkingBrake',
        'PASSENGER_Switch_Cabin_Heat', 'PRESSURIZATION_Switch_Bleed')   # крышка с юбкой прорези, пол и рычаги — не «мягкая» отделка
END_KEEP = 0.03                  # у концов кабеля (наконечники, разъёмы) окно не начинается

ref.open_source()
R = ref.Ref()
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'replaced.json')) as f:
    GONE = set(json.load(f))


def base(name):
    return re.sub(r'\.\d{3}$', '', name)


def load(g):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(cabin.LAYERS, f'da40-{g}-raw.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location.z -= R.lift
    bpy.context.view_layer.update()
    return new


def world_bm(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.transform(o.matrix_world)
    bm.normal_update()
    return bm


def bvh_bm(bms):
    verts, polys = [], []
    for bm in bms:
        b0 = len(verts)
        verts += [v.co.copy() for v in bm.verts]
        idx = {v: i for i, v in enumerate(bm.verts)}
        polys += [[b0 + idx[v] for v in f.verts] for f in bm.faces]
    return BVHTree.FromPolygons(verts, polys) if polys else None


# ── ось кабеля по сетке ──────────────────────────────────────────────────

def axis_of(bm0, r, segs):
    """Центры колец трубы по порядку, длина по оси до каждого кольца и материал трубы. Ось ищется на сваренной
    копии сетки: на острых рёбрах экспорт glTF раздваивает вершины, и связь колец по граням рвётся."""
    bm = bm0.copy()
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-5)
    bm.normal_update()
    try:
        return _axis(bm, r, segs)
    finally:
        bm.free()


def _axis(bm, r, segs):
    """Точки оси — вершины трубы, сдвинутые по нормали внутрь на r; порядок — самый длинный путь в минимальном
    остовном дереве по рёбрам сетки (связи — только по рёбрам трубы, так что перемычек между её разными
    участками не бывает). На острых углах нормали наклонены и точки отходят от оси на миллиметры — для окна
    замены и плоскостей разреза этого достаточно."""
    comp, best = {}, None                                # труба — самая большая связная часть сетки
    for v0 in bm.verts:
        if v0 in comp:
            continue
        part, st = [v0], [v0]
        comp[v0] = v0
        while st:
            x = st.pop()
            for e in x.link_edges:
                y = e.other_vert(x)
                if y not in comp:
                    comp[y] = v0
                    st.append(y)
                    part.append(y)
        if best is None or len(part) > len(best):
            best = part
    tube = set(best)
    c = {v: v.co - v.normal * r for v in tube}
    edges = sorted((((c[e.verts[0]] - c[e.verts[1]]).length, e.verts[0], e.verts[1]) for e in bm.edges
                   if e.verts[0] in tube and e.verts[1] in tube), key=lambda t: t[0])
    parent = {v: v for v in tube}

    def find(a):
        while parent[a] is not a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    tree = {v: [] for v in tube}
    for w, a, b in edges:
        ra, rb = find(a), find(b)
        if ra is not rb:
            parent[ra] = rb
            tree[a].append((b, w))
            tree[b].append((a, w))

    def far(src):
        dist, prev, st = {src: 0.0}, {src: None}, [src]
        while st:
            x = st.pop()
            for y, w in tree[x]:
                if y not in dist:
                    dist[y] = dist[x] + w
                    prev[y] = x
                    st.append(y)
        u = max(dist, key=dist.get)
        return u, prev
    u, _ = far(next(iter(tube)))
    v, prev = far(u)
    chain = []
    while v is not None:
        chain.append(c[v])
        v = prev[v]
    pts = [chain[0]]
    for q in chain[1:]:                                  # вершины одного кольца — в одну точку
        if (q - pts[-1]).length > 0.0015:
            pts.append(q)
    if len(pts) > 4:                                     # сгладить шум у острых углов
        sm = [pts[0]] + [(pts[i - 1] + pts[i] * 2 + pts[i + 1]) / 4 for i in range(1, len(pts) - 1)] + [pts[-1]]
        pts = sm
    cnt = {}
    for f in bm.faces:                                   # материал трубы
        if all(x in tube for x in f.verts):
            cnt[f.material_index] = cnt.get(f.material_index, 0) + 1
    return pts, (max(cnt, key=cnt.get) if cnt else 0)


def face_dist(f, q):
    """Расстояние от точки до грани (веер треугольников)."""
    vs = [v.co for v in f.verts]
    return min((closest_point_on_tri(q, vs[0], vs[i], vs[i + 1]) - q).length for i in range(1, len(vs) - 1))


def cum(path):
    s = [0.0]
    for a, b in zip(path, path[1:]):
        s.append(s[-1] + (b - a).length)
    return s


def at(path, S, s):
    for i in range(len(path) - 1):
        if S[i + 1] >= s:
            seg = path[i + 1] - path[i]
            f = 0.0 if seg.length < 1e-9 else (s - S[i]) / (S[i + 1] - S[i])
            return path[i] + seg * f, seg.normalized()
    return path[-1], (path[-1] - path[-2]).normalized()


def project(path, S, q):
    best = (9.0, 0.0)
    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]
        ab = b - a
        L2 = ab.length_squared
        t = 0.0 if L2 < 1e-12 else max(0.0, min(1.0, (q - a).dot(ab) / L2))
        d = (a + ab * t - q).length
        if d < best[0]:
            best = (d, S[i] + t * (S[i + 1] - S[i]))
    return best


# ── новые детали: секция и ход рычага ─────────────────────────────────────
NEWCOL = lib.collection('new parts (obstacle)')
engine_controls.build(NEWCOL)
engine_controls.sweep_mesh(NEWCOL)
NEW_BVH = ref._bvh([o for o in NEWCOL.all_objects if o.type == 'MESH'])
ENV_BVH = ref._bvh([engine_controls.envelope_mesh(NEWCOL)])


def clearance(q, r):
    """Зазор от поверхности кабеля радиуса r с осью в q до новых деталей и габарита секции (внутри габарита — 0)."""
    if engine_controls.in_envelope(q):
        return -r
    d = min((b.find_nearest(q, 0.2)[3] or 0.2) if b.find_nearest(q, 0.2)[0] is not None else 0.2 for b in (NEW_BVH, ENV_BVH))
    return d - r

# ── кабели: окно замены ───────────────────────────────────────────────────
layers = {}
for g in sorted({j[0] for j in JOBS}):
    layers[g] = load(g)
# соседи в слоях кабелей (тяги, датчики, другие кабели): у концов окна прямой участок не должен их задевать
NEAR = ref._bvh([o for objs in layers.values() for o in objs if o.type == 'MESH' and base(o.name) not in {j[1] for j in JOBS}])
work = []
for g, name, r, segs, bend, ties in JOBS:
    o = next(x for x in layers[g] if x.type == 'MESH' and base(x.name) == name)
    bm = world_bm(o)
    path, tube_mi = axis_of(bm, r, segs)
    S = cum(path)
    L = S[-1]
    # зазор до новых деталей по оси (шаг 4 мм)
    ss = [k * 0.004 for k in range(int(L / 0.004) + 1)]
    gap = [clearance(at(path, S, s)[0], r) for s in ss]
    hit = [s for s, d in zip(ss, gap) if d < 0.004]
    if not hit:
        print(f'REROUTE {name}: новые детали не задевает — без изменений')
        bm.free()
        continue
    lo_s, hi_s = min(hit), max(hit)
    # концы окна — там, где до новых деталей не меньше 15 мм, и не ближе 4 см к задетому участку
    stub = max(0.012, 2.5 * r)

    def bad_end(s, inward):
        """Конец окна у новых деталей или прямой участок от него (по касательной внутрь окна) задевает соседей."""
        if min(d for s2, d in zip(ss, gap) if abs(s2 - s) < 0.012) < 0.015:
            return True
        q, t = at(path, S, s)
        for k in range(5):
            p_ = q + t * (inward * stub * k / 4)
            h = NEAR.find_nearest(p_, 0.05)
            if (h[0] is not None and h[3] - r < 0.0035) or clearance(p_, r) < 0.0035:
                return True
        return False
    sA = max(END_KEEP, lo_s - 0.04)
    while sA > END_KEEP and bad_end(sA, 1):
        sA -= 0.01
    sB = min(L - END_KEEP, hi_s + 0.04)
    while sB < L - END_KEEP and bad_end(sB, -1):
        sB += 0.01
    sA, sB = max(sA, END_KEEP), min(sB, L - END_KEEP)
    A, tA = at(path, S, sA)
    B, tB = at(path, S, sB)
    print(f'REROUTE {name}: длина {L:.2f}, задето s {lo_s:.3f}…{hi_s:.3f}, окно {sA:.3f}…{sB:.3f}, '
          f'A {tuple(round(c, 3) for c in A)} B {tuple(round(c, 3) for c in B)}')
    # разрез по плоскостям в A и B, удаление участка между ними
    for P0, T0 in ((A, tA), (B, tB)):
        geom = [f for f in bm.faces if face_dist(f, P0) < 3 * r + 0.01]   # и длинные грани прямых участков
        es = list({e for f in geom for e in f.edges})
        vs = list({v for f in geom for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=geom + es + vs, plane_co=P0, plane_no=T0, dist=1e-6)
    kill = []
    win = [q for q, s in zip(path, S) if sA - 0.05 <= s <= sB + 0.05] + [A, B]
    blo = V([min(q[i] for q in win) - r - 0.01 for i in range(3)])
    bhi = V([max(q[i] for q in win) + r + 0.01 for i in range(3)])
    for f in bm.faces:
        c = f.calc_center_median()
        if any(c[i] < blo[i] or c[i] > bhi[i] for i in range(3)):
            continue
        d, s = project(path, S, c)
        if d > r + 0.006:
            continue
        if abs(s - sA) < 2 * r + 0.004:
            inside = (c - A).dot(tA) > 0
        elif abs(s - sB) < 2 * r + 0.004:
            inside = (c - B).dot(tB) < 0
        else:
            inside = sA < s < sB
        if inside:
            kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    # материал трубы — у граней колец; стяжки — чёрный материал объекта
    mats = list(o.data.materials)
    black_mi =next((i for i, m in enumerate(mats) if m and 'black' in m.name.lower()), None)
    work.append(dict(g=g, name=name, r=r, segs=segs, bend=bend, ties=ties, obj=o, bm=bm, path=path, S=S,
                     A=A, tA=tA, B=B, tB=tB, mats=mats, tube_mi=tube_mi, black_mi=black_mi, sA=sA, sB=sB))

if os.environ.get('DRY'):                            # только окна замены — для проверки
    raise SystemExit(0)

# ── планировщик: всё, кроме заменяемых участков ──────────────────────────
names = {w['name'] for w in work}
skip = {g: (lambda o, g=g: base(o.name) in names) for g in cabin.BUILT}
TRIM = ref._bvh([o for o in bpy.data.collections['DA40 Interior'].all_objects if o.type == 'MESH' and o.name not in ref.REPLACED
                 and o.name not in HARD and not any(m and 'Glass' in m.name for m in o.data.materials)])
HARD_BVH = ref._bvh([bpy.data.objects[n] for n in HARD if n in bpy.data.objects])
# прочие кабели и детали слоёв, заходящие в габарит секции (для сведения: их здесь не перекладывают)
for g, objs in layers.items():
    for o in objs:
        if o.type == 'MESH' and base(o.name) not in {j[1] for j in JOBS}:
            vs = [o.matrix_world @ v.co for v in o.data.vertices]
            k = sum(1 for q in vs[::3] if engine_controls.in_envelope(q))
            if k:
                print(f'ENVELOPE заходит {g}: {o.name} ({k} вершин)')
for g, objs in layers.items():                       # свои копии слоёв уже не нужны — systems_bvh грузит заново
    for o in objs:
        if o.name in bpy.data.objects and all(o is not w['obj'] for w in work):
            bpy.data.objects.remove(o, do_unlink=True)
SYS = cabin.systems_bvh(R, (), GONE, skip=skip)
bond = [o for o in load('bonding') if o.type == 'MESH']
BOND = ref._bvh(bond)
RT = Router([R.shell, SYS, NEW_BVH, ENV_BVH, HARD_BVH, BOND], [R.shell, TRIM, HARD_BVH], cabin.EYES, soft=[TRIM], step=0.008,
            hull=cabin.hull_bvh(R))
done_bms = []


def refresh():
    RT.set_extra(bvh_bm([w['bm'] for w in work] + done_bms))


for w in work:                                       # прямые участки у концов окна — сразу препятствие для всех
    w['stub'] = stub = max(0.012, 2.5 * w['r'])
    st = lib.Part('stub', None, w['mats'][0], NEWCOL)
    for P0, Q0 in ((w['A'], w['A'] + w['tA'] * stub), (w['B'] - w['tB'] * stub, w['B'])):
        lib.cyl(st, P0, Q0, w['r'], 0, segs=10)
    w['stub_bm'] = st.bm


def refresh(skip=None):
    RT.set_extra(bvh_bm([w['bm'] for w in work] + done_bms + [w['stub_bm'] for w in work if w is not skip and 'seg' not in w]))


refresh()
out_objs = {}
for w in work:
    r, A, B, tA, tB = w['r'], w['A'], w['B'], w['tA'], w['tB']
    stub = w['stub']
    a0, b0 = A + tA * stub, B - tB * stub
    refresh(skip=w)
    old = [q for q, s in zip(w['path'], w['S']) if w['sA'] <= s <= w['sB']]
    lo = V([min([q[i] for q in old + [A, B]] + [CONSOLE[0][i]]) - 0.01 for i in range(3)])
    hi = V([max([q[i] for q in old + [A, B]] + [CONSOLE[1][i]]) + 0.01 for i in range(3)])
    lo.z = max(lo.z, CONSOLE[0].z) if min(A.z, B.z) > CONSOLE[0].z else lo.z
    rr = max(r, 0.003)
    pts = None
    for hid in (True, False):
        pts = RT.route(a0, b0, rr, lo, hi, hidden=hid, relax=(), max_nodes=1500000, end_relax=0.0)
        if pts:
            if not hid:
                print(f'ROUTE visible: {w["name"]}')
            break
    if not pts:
        raise SystemExit(f'нет трассы для {w["name"]}')
    new = [A] + pts + [B]
    print(f'ROUTE {w["name"]}: ' + ' '.join(str(tuple(round(c, 3) for c in q)) for q in new))
    # скругление гибов срезает углы ломаной планировщика — радиус гиба уменьшается, пока ось не станет свободной
    RT.set_extra(bvh_bm([x['bm'] for x in work if x is not w] + done_bms +
                        [x['stub_bm'] for x in work if x is not w and 'seg' not in x]))
    for bend in (w['bend'], w['bend'] * 0.6, w['bend'] * 0.35, 0.008):
        path = lib.fillet(new, bend)
        Ln = lib.path_len(path)
        worst = min((RT.free(lib.along(path, Ln * k / 300)[0]) - r, round(Ln * k / 300, 3)) for k in range(301))
        if worst[0] >= 0.0008:
            break
    print(f'CHECK {w["name"][:50]}: гиб {bend * 1000:.0f} мм, наименьший зазор {worst[0] * 1000:.1f} мм (s {worst[1]})')
    seg = lib.Part('tmp', None, w['mats'][0], NEWCOL)
    lib.sweep(seg, path, r, 0, segs=w['segs'], caps=False)
    if w['ties'] and w['black_mi'] is not None:
        Ln = lib.path_len(path)
        for k in range(1, int(Ln / 0.08) + 1):
            if k * 0.08 > Ln - 0.02:
                break
            q, t = lib.along(path, k * 0.08)
            lib.ring_tube(seg, q, t, r + 0.0012, r - 0.0005, 0.003, 1, segs=12)
    done_bms.append(seg.bm)
    w['seg'] = seg.bm
    w['new_path'] = path
    refresh()

# ── сборка новых версий кабелей и экспорт по слоям ────────────────────────
report = {}
for w in work:
    bm = w['bm']
    seg = w['seg']
    remap = {0: w['tube_mi'], 1: w['black_mi'] if w['black_mi'] is not None else w['tube_mi']}
    vmap = {}
    for v in seg.verts:
        vmap[v] = bm.verts.new(v.co)
    for f in seg.faces:
        nf = bm.faces.new([vmap[v] for v in f.verts])
        nf.material_index = remap.get(f.material_index, w['tube_mi'])
        nf.smooth = True
    me = bpy.data.meshes.new(w['name'])
    bm.to_mesh(me)
    for m in w['mats']:
        me.materials.append(m)
    old = bpy.data.objects.get(w['name'])
    if old is not None:
        old.name = w['name'] + ' (old)'
    if w['obj'].name == w['name']:
        w['obj'].name = w['name'] + ' (old)'
    col = lib.collection(f'reroute {w["g"]}')
    ob = bpy.data.objects.new(w['name'], me)
    col.objects.link(ob)
    if 'ru' in w['obj']:
        ob['ru'] = w['obj']['ru']
    assert ob.name == w['name'], ob.name
    report.setdefault(w['g'], []).append(w['name'])
    out_objs.setdefault(w['g'], []).append(ob)
for g, objs in out_objs.items():
    col = lib.collection(f'reroute {g}')
    path = os.path.join(OUTDIR, f'{g}-reroute-raw.glb')
    size = ref.export(col, path, R.lift)
    print(f'REROUTE_OUT {path} {size / 1e6:.2f} MB, кабелей {len(objs)}')
with open(os.path.join(OUTDIR, 'reroute.json'), 'w', encoding='utf-8') as f:
    json.dump(report, f, ensure_ascii=False, indent=1)
print('REROUTE_OK', json.dumps(report, ensure_ascii=False))
