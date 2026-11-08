"""Секция управления двигателем по AMM 31-10 рис. 2 и рычаг POWER по AMM 76-00 рис. 2.

    python3 tools/da40/engine_controls.py [out.glb]     (отдельно: слой-дополнение для проверки)
    import engine_controls; engine_controls.build(col)   (из avionics.py: в слой приборного оборудования)

AMM 31-10 п. 3: секция управления двигателем — каркас центрального пульта: две боковые пластины из алюминиевого
сплава и четыре кронштейна на заклёпках. Передний кронштейн — с отверстиями для упоров оболочек тросов стояночного
тормоза и обогрева; верхний — с двумя анкерными гайками, болтами секция крепится к полу; центральный — с двумя
анкерными гайками для крышек пульта; задний крепится к узлу штурвальчика триммера руля высоты. На секции —
рычаги обогрева и стояночного тормоза (впереди) и рычаг POWER. AMM 76-00 рис. 2: рычаг качается на болте-оси в
боковых пластинах, по обе стороны рычага — пакеты фрикционных шайб и распорные втулки; тяга передаёт положение рычага
двум датчикам Холла, от них сигнал идёт в EECU.

В модели MSFS от рычага есть только рукоятка над прорезью пульта (ENGINE_Lever_Throttle_1, ось качания — в её начале
координат, по оси X), тяга и блок датчиков (слой instruments). Секция — по месту в пульте MSFS: внутренние стенки
пульта x +0,0446 / −0,0458, юбка прорези рычага x +0,0013 / −0,0025 (y −0,562…−0,405), крышка z 0,29 у рычагов
обогрева и 0,145 у штурвальчика, пол z −0,11. Пластины — по обе стороны от рычагов обогрева и стояночного тормоза
(x −0,029…+0,030), от рычагов обогрева (y −0,712) до рамы штурвальчика (y −0,377). Низ пластин — над полом пульта:
внизу пульта проходят жгуты и кабели от приборной доски под пол (они обходят секцию и ход рычага, см. sweep_mesh).
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector as V  # noqa: E402
from mathutils.geometry import tessellate_polygon  # noqa: E402

import lib  # noqa: E402
import ref  # noqa: E402
from lib import Part, box, cyl, hexa  # noqa: E402

LEVER = 'ENGINE_Lever_Throttle_1'
XC = -0.0006                              # ось пульта и прорези рычага
HALF = 0.032                              # от оси пульта до срединной плоскости пластины
T_PL = 0.002                              # лист пластин и кронштейнов
Y_F, Y_R = -0.712, -0.386                 # передняя кромка (у рычагов обогрева), задняя (у рамы штурвальчика, y −0,377)
Z_B = -0.045                              # низ пластин: ниже — проход жгутов по полу пульта (пол z −0,11)
Z_TOP_F, Z_TOP_C, Z_TOP_R = 0.165, 0.085, 0.128     # верх передней части, понижения, задней стойки
# контур пластины (y, z): высокая передняя часть, понижение под центральный кронштейн, задняя стойка под задний
# кронштейн, задний нижний угол срезан (AMM 31-10 рис. 2)
OUTLINE = [(Y_F, Z_B), (-0.455, Z_B), (Y_R, 0.050), (Y_R, Z_TOP_R), (-0.470, Z_TOP_R), (-0.540, Z_TOP_C), (-0.590, Z_TOP_C),
           (-0.625, Z_TOP_F), (Y_F, Z_TOP_F)]
HOLES = [[(-0.692, 0.000), (-0.692, 0.140), (-0.638, 0.140), (-0.608, 0.075)],          # облегчающие вырезы
         [(-0.665, -0.028), (-0.592, -0.028), (-0.522, 0.055), (-0.595, 0.055)]]
LEVER_FWD, LEVER_AFT = math.radians(28.0), math.radians(26.5)      # ход рычага от вертикали: MAX вперёд, IDLE назад

M = {}


def mats():
    if M:
        return M
    M.update(
        alu=lib.mat('DA40 engine control assembly (aluminium)', (0.74, 0.75, 0.77), 0.85, 0.35, ru='алюминиевый сплав'),
        lever=lib.mat('DA40 power lever (black anodised)', (0.08, 0.08, 0.09), 0.6, 0.4, ru='алюминий, чёрное анодирование'),
        steel=lib.mat('DA40 stainless steel', (0.62, 0.63, 0.65), 1.0, 0.28, ru='нержавеющая сталь'),
        fric=lib.mat('DA40 friction washers (PTFE)', (0.86, 0.86, 0.82), 0.0, 0.5, ru='фрикционные шайбы, фторопласт'),
    )
    return M


def pivot():
    """Ось рычага POWER (точка на оси в плоскости пульта — начало координат рычага MSFS) и низ рукоятки."""
    lev = bpy.data.objects[LEVER]
    pv = lev.matrix_world.translation.copy()
    vs = [lev.matrix_world @ v.co for v in lev.data.vertices]
    low = min(vs, key=lambda q: q.z)
    return V((XC, pv.y, pv.z)), V((XC, low.y, low.z))


def _round(poly, r=0.006, n=4):
    """Замкнутый контур (y, z) со скруглёнными углами."""
    out = []
    k = len(poly)
    for i in range(k):
        a, b, c = V(poly[i - 1]), V(poly[i]), V(poly[(i + 1) % k])
        u, w = (a - b).normalized(), (c - b).normalized()
        ang = math.acos(max(-1.0, min(1.0, u.dot(w))))
        t = min(r / math.tan(ang / 2), (a - b).length * 0.45, (c - b).length * 0.45)
        p0, p1 = b + u * t, b + w * t
        for j in range(n + 1):                  # квадратичная кривая Безье вместо угла
            f = j / n
            q = p0 * (1 - f) ** 2 + b * 2 * f * (1 - f) + p1 * f * f
            out.append((q.x, q.y))
    return out


def plate(p, x, outline, holes, mi=0):
    """Лист толщиной T_PL в плоскости x = const: контур (y, z) с вырезами."""
    loops = [_round(outline, 0.004)] + [_round(h, 0.008) for h in holes]
    flat = [[V((0, y, z)) for y, z in lp] for lp in loops]
    tris = tessellate_polygon(flat)
    pts = [q for lp in flat for q in lp]
    bm = bmesh.new()
    lo = [bm.verts.new(V((x - T_PL / 2, q.y, q.z))) for q in pts]
    hi = [bm.verts.new(V((x + T_PL / 2, q.y, q.z))) for q in pts]
    for t in tris:
        for vs in ((lo[t[0]], lo[t[2]], lo[t[1]]), (hi[t[0]], hi[t[1]], hi[t[2]])):
            try:
                bm.faces.new(vs)
            except ValueError:
                pass
    base = 0
    for lp in flat:
        n = len(lp)
        for i in range(n):
            j = (i + 1) % n
            try:
                bm.faces.new((lo[base + i], lo[base + j], hi[base + j], hi[base + i]))
            except ValueError:
                pass
        base += n
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    lib._merge(p, bm, lambda co: co, mi, smooth=False)


def rivets(p, x, nx, pts, mi):
    for y, z in pts:
        lib.screw(p, V((x + nx * T_PL / 2, y, z)), (nx, 0, 0), 0.0045, mi)


def channel(p, c, size, open_dir, mi=0):
    """Швеллер из листа в габарите size = (x, y, z) с центром c: стенка напротив открытой стороны open_dir, полки по x."""
    sx, sy, sz = size
    d = V(open_dir)
    if abs(d.y) > 0.5:                                    # стенка поперёк y
        s = 1 if d.y > 0 else -1
        box(p, c - V((0, s * (sy / 2 - T_PL / 2), 0)), (sx, T_PL, sz), None, mi)
    else:                                                 # стенка горизонтальная
        s = 1 if d.z > 0 else -1
        box(p, c - V((0, 0, s * (sz / 2 - T_PL / 2))), (sx, sy, T_PL), None, mi)
    for k in (-1, 1):
        box(p, c + V((k * (sx / 2 - T_PL / 2), 0, 0)), (T_PL, sy, sz), None, mi)


def cap_channel(z_edge, y_c, sy):
    """Швеллер стенкой на кромке пластин, полками вниз по их наружным граням: центр и габарит."""
    sx, sz = 2 * HALF + 3 * T_PL + 0.0004, 0.020
    return V((XC, y_c, z_edge + T_PL - sz / 2)), (sx, sy, sz)


def flange_rivets(p, ys, z, mi):
    """Заклёпки полок швеллера — головками на наружных гранях полок."""
    xf = HALF + T_PL / 2 + T_PL + 0.0002
    for s in (1, -1):
        for y in ys:
            lib.screw(p, V((XC + s * xf, y, z)), (s, 0, 0), 0.0045, mi)


def build(col, doc='AMM 31-10 рис. 2'):
    m = mats()
    pv, knob = pivot()
    xl, xr = XC + HALF, XC - HALF                       # срединные плоскости левой (x > 0) и правой пластин
    inner = 2 * HALF - T_PL                             # между внутренними гранями пластин

    def P(name, ru, mat='alu', d=doc):
        return Part(name, ru, m[mat], col, True, d)

    out = []
    # ── боковые пластины ──
    for tag, x, nx, gen in (('left', xl, 1, 'Левая'), ('right', xr, -1, 'Правая')):
        p = P(f'Engine control assembly {tag} side plate', f'{gen} боковая пластина секции управления двигателем: лист из алюминиевого '
              'сплава с облегчающими вырезами; спереди на секции — рычаги обогрева и стояночного тормоза, сзади — ось рычага POWER')
        plate(p, x, OUTLINE, HOLES)
        rivets(p, x, nx, [(Y_F + 0.007, z) for z in (0.062, 0.083, 0.104)], p.m(m['steel']))     # полки переднего кронштейна
        out.append(p.done())
    # ── передний кронштейн: швеллер стенкой вперёд на передней кромке, упоры оболочек тросов ──
    p = P('Engine control assembly front bracket', 'Передний кронштейн секции управления двигателем: швеллер на передней кромке '
          'пластин, в стенке — отверстия для упоров оболочек тросов стояночного тормоза и обогрева', d='AMM 31-10 п. 3, рис. 2')
    channel(p, V((XC, Y_F + 0.012, 0.083)), (inner - 0.0004, 0.024, 0.060), (0, 1, 0))
    for dx in (-0.018, 0.0, 0.018):
        lib.ring_tube(p, V((XC + dx, Y_F + 0.0005, 0.098)), (0, 1, 0), 0.0055, 0.0028, 0.006, p.m(m['steel']), segs=16)
    out.append(p.done())
    # ── верхний кронштейн: на верху передней части, две анкерные гайки ──
    p = P('Engine control assembly top bracket', 'Верхний кронштейн секции управления двигателем: швеллер на верхней кромке пластин '
          'с двумя анкерными гайками — болтами в них секция крепится к полу', d='AMM 31-10 п. 3, рис. 2')
    c, size = cap_channel(Z_TOP_F, -0.646, 0.026)
    channel(p, c, size, (0, 0, -1))
    flange_rivets(p, (-0.654, -0.638), Z_TOP_F - 0.010, p.m(m['steel']))
    for dx in (-0.016, 0.016):
        q = V((XC + dx, -0.646, Z_TOP_F - 0.0005))
        hexa(p, q - V((0, 0, 0.005)), q, 0.009, p.m(m['steel']))                 # анкерная гайка под стенкой
    out.append(p.done())
    # ── центральный кронштейн: в понижении верхней кромки, впереди хода рычага ──
    p = P('Engine control assembly center bracket', 'Центральный кронштейн секции управления двигателем: в понижении верхней кромки '
          'пластин, впереди хода рычага POWER; две анкерные гайки для винтов крышек пульта', d='AMM 31-10 п. 3, рис. 2')
    c, size = cap_channel(Z_TOP_C, -0.566, 0.026)
    channel(p, c, size, (0, 0, -1))
    flange_rivets(p, (-0.574, -0.558), Z_TOP_C - 0.010, p.m(m['steel']))
    for dx in (-0.016, 0.016):
        q = V((XC + dx, -0.566, Z_TOP_C - 0.0005))
        hexa(p, q - V((0, 0, 0.005)), q, 0.009, p.m(m['steel']))
    out.append(p.done())
    # ── задний кронштейн: на задних стойках, задней полкой к раме штурвальчика триммера ──
    p = P('Engine control assembly rear bracket', 'Задний кронштейн секции управления двигателем: на задних стойках пластин, '
          'задней полкой на болтах крепится к раме узла штурвальчика триммера руля высоты', d='AMM 31-10 п. 3, рис. 2')
    y0, y1 = -0.402, -0.3795                            # от стоек до полки у рамы штурвальчика (её передняя кромка y −0,377)
    c, size = cap_channel(Z_TOP_R, (y0 + y1) / 2, y1 - y0)
    channel(p, c, size, (0, 0, -1))
    flange_rivets(p, (-0.398, -0.390), Z_TOP_R - 0.010, p.m(m['steel']))
    box(p, V((XC, y1 - T_PL / 2, Z_TOP_R + T_PL - 0.013)), (size[0], T_PL, 0.026), None, 0)          # задняя полка
    for dx in (-0.020, 0.020):
        q = V((XC + dx, y1 - T_PL, Z_TOP_R - 0.013))
        hexa(p, q, q - V((0, 0.004, 0)), 0.008, p.m(m['steel']))                # головки болтов к раме
    out.append(p.done())
    # ── ось рычага с фрикционом (AMM 76-00 рис. 2) ──
    p = P('Power lever pivot bolt and friction washers', 'Ось рычага POWER: болт сквозь боковые пластины, по обе стороны рычага — '
          'пакеты фрикционных шайб из фторопласта со стальными шайбами и распорные втулки; затяжкой самоконтрящейся гайки '
          'регулируют усилие, с которым фрикцион удерживает рычаг', 'steel', 'AMM 76-00 рис. 2')
    ax = lambda x: V((x, pv.y, pv.z))                     # noqa: E731
    cyl(p, ax(xr - 0.010), ax(xl + 0.0075), 0.0040, 0, segs=16)                      # болт
    hexa(p, ax(xl + T_PL / 2), ax(xl + T_PL / 2 + 0.0045), 0.011, 0)                # головка
    lib.ring_tube(p, ax(xr - T_PL / 2 - 0.0008), (1, 0, 0), 0.0085, 0.0041, 0.0016, 0, segs=18)   # шайба
    hexa(p, ax(xr - T_PL / 2 - 0.0016), ax(xr - T_PL / 2 - 0.0071), 0.011, 0)       # гайка
    for s in (1, -1):
        x = XC + s * 0.0045
        for k in range(5):                                # сталь — фторопласт — сталь — фторопласт — сталь
            w = 0.0016
            lib.ring_tube(p, ax(x + s * w / 2), (1, 0, 0), 0.0105 if k % 2 else 0.0095, 0.0041, w,
                          p.m(m['fric']) if k % 2 else 0, segs=22)
            x += s * w
        xout = (xl if s > 0 else xr) - s * T_PL / 2
        lib.ring_tube(p, ax((x + xout) / 2), (1, 0, 0), 0.0075, 0.0041, abs(xout - x) - 0.0002, 0, segs=18)   # распорная втулка
    out.append(p.done())
    # ── рычаг POWER: плечо от ступицы на оси до рукоятки MSFS ──
    p = P('Power lever arm (POWER)', 'Рычаг управления двигателем POWER: плоское плечо от ступицы на оси в боковых пластинах сквозь '
          'прорезь крышки пульта до рукоятки; у рукоятки к плечу крепится тяга к датчикам Холла. Вперёд — MAX, назад — IDLE',
          'lever', 'AMM 76-00 рис. 2')
    d = knob - pv
    Lr = d.length
    R = lib.basis(d.normalized(), up=V((1, 0, 0)))       # x' — ширина (в плоскости y-z), y' — толщина (по x)
    cyl(p, pv - V((0.0045, 0, 0)), pv + V((0.0045, 0, 0)), 0.010, 0, segs=24)       # ступица
    s1 = 0.58                                            # широкая часть — ниже юбки прорези (её низ z ≈ 0,09)
    box(p, pv + d * (s1 / 2), (0.014, 0.0055, Lr * s1), R, 0, bevel=0.0008)
    box(p, pv + d * ((s1 + 1.0) / 2), (0.007, 0.0030, Lr * (1 - s1)), R, 0, bevel=0.0004)   # в юбке прорези — 3 мм
    out.append(p.done())
    print(f'ENGINE_SECTION pivot {tuple(round(c, 4) for c in pv)} knob {tuple(round(c, 4) for c in knob)} '
          f'plates x {xl:+.4f} / {xr:+.4f}, y {Y_F}…{Y_R}, z {Z_B}…{Z_TOP_F}')
    return out


def sweep_mesh(col=None, name='Power lever travel (obstacle)', grow=0.002):
    """Объём, который заметает рычаг на всём ходе IDLE…MAX, — препятствие для трасс; не экспортируется."""
    pv, knob = pivot()
    Lr = (knob - pv).length + 0.006
    half = 0.010 + grow
    bm = bmesh.new()
    n = 24
    angs = [-LEVER_FWD + (LEVER_AFT + LEVER_FWD) * i / n for i in range(n + 1)]
    rings = []
    for x in (XC - half, XC + half):
        ring = [bm.verts.new(V((x, pv.y, pv.z - 0.012 - grow)))]
        ring += [bm.verts.new(V((x, pv.y + Lr * math.sin(a), pv.z + Lr * math.cos(a)))) for a in angs]
        rings.append(ring)
    a, b = rings
    bm.faces.new(list(reversed(a)))
    bm.faces.new(b)
    for i in range(len(a)):
        j = (i + 1) % len(a)
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    (col or bpy.context.scene.collection).objects.link(ob)
    return ob


ENVELOPE = [(Y_F, Z_B), (-0.455, Z_B), (Y_R, 0.050), (Y_R, Z_TOP_R), (-0.625, Z_TOP_F), (Y_F, Z_TOP_F)]
ENV_X = (XC - HALF - T_PL / 2, XC + HALF + T_PL / 2)


def in_envelope(q):
    """Точка внутри габарита секции (между наружными гранями пластин, в контуре пластин без понижения)."""
    if not (ENV_X[0] <= q.x <= ENV_X[1]):
        return False
    y, z = q.y, q.z
    inside = False
    for i in range(len(ENVELOPE)):                       # чётность пересечений луча вдоль +y с рёбрами контура
        (y1, z1), (y2, z2) = ENVELOPE[i - 1], ENVELOPE[i]
        if (z1 > z) != (z2 > z) and y < y1 + (z - z1) * (y2 - y1) / (z2 - z1):
            inside = not inside
    return inside


def envelope_mesh(col=None, name='Engine control assembly envelope (obstacle)'):
    """Габарит секции — препятствие для трасс: кабели обходят секцию, а не идут между её пластинами."""
    bm = bmesh.new()
    a = [bm.verts.new(V((ENV_X[0], y, z))) for y, z in ENVELOPE]
    b = [bm.verts.new(V((ENV_X[1], y, z))) for y, z in ENVELOPE]
    bm.faces.new(list(reversed(a)))
    bm.faces.new(b)
    for i in range(len(a)):
        j = (i + 1) % len(a)
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    (col or bpy.context.scene.collection).objects.link(ob)
    return ob


if __name__ == '__main__':
    OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-engine-controls-raw.glb'
    ref.open_source()
    Rf = ref.Ref()
    COL = lib.collection('DA40 Engine control assembly (AMM 31-10)')
    build(COL)
    size = ref.export(COL, OUT, Rf.lift)
    with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as fh:
        json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, fh, ensure_ascii=False, indent=1)
    print(f'ENGINE_OK {OUT} {size / 1e6:.2f} MB, parts {len([o for o in COL.all_objects if o.type == "MESH"])}')
