"""Шасси DA 40 NG по AMM 32 — детали для разборки на сайте.

    blender -b --factory-startup --python run.py -- tools/da40/gear.py out-gear-raw.glb

Выход:
  out-gear-raw.glb (+ .labels.json) — слой da40-gear: крепления рессор (32-10 рис. 1), цапфы носовой стойки
      (32-20 рис. 1, 4), эластомерный пружинный пакет (32-20 рис. 2), упоры вилки;
  out-gear-raw.wheels.glb (+ .labels.json) — дополнение слоя da40-wheels (вливается merge_addon.js; в
      split-da40.js — ADDONS): полуоси с опорной пластиной тормоза и болтами (32-10 рис. 2, 4), тормоза
      (32-40 рис. 4, 5), барабаны колёс, камеры, подшипники (32-40 рис. 1), ось носового колеса (32-40 рис. 6, 7);
  out-gear-raw.explode.json — группы разборки для сайта (figures.js, opts.explode): для каждой детали — смещение
      в осях сайта (glTF: x влево, y вверх, z вперёд). Шины, вилка носового колеса и штуцер суппорта — детали других
      слоёв — входят в группы по имени.

Каждая деталь — отдельный объект, как на рисунках AMM, где узел показан разнесённым: внутренний болт, монтажный
блок, пружинные шайбы, выпуклая и вогнутая шайбы, корончатая гайка, шплинт (32-10 рис. 1) и т. д. Детали MSFS,
которые заменены построенными, — в replaced.json (полуоси, тормоза и втулки колёс в планере, барабаны в слое колёс).

Ось колеса основной опоры — по шине и тормозному диску MSFS (y 0,275, z −0,652, вдоль X); фланец рессоры MSFS —
x 1,399…1,409. От него наружу по AMM 32-10 рис. 2: опорная пластина тормоза, фланец полуоси, головки шести болтов;
гайки — с внутренней стороны рессоры. Суппорт — сзади внизу (как у MSFS), на рычаге опорной пластины.

Мировые координаты исходника: X — влево, Y — назад, Z — вверх, нос в −Y.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector as V  # noqa: E402

import lib  # noqa: E402
import ref  # noqa: E402
from lib import Part, basis, box, cyl, fillet, hexa, ring_tube, sweep, torus  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-gear-raw.glb'
OUT_W = os.path.splitext(OUT)[0] + '.wheels.glb'
OUT_X = os.path.splitext(OUT)[0] + '.explode.json'

ref.open_source()
R = ref.Ref()
COL = lib.collection('DA40 Landing gear mounts (AMM 32)')
COL_W = lib.collection('DA40 Wheels, axles and brakes (AMM 32-10, 32-40)')

M = dict(
    spring=lib.mat('DA40 main gear leaf spring (steel, painted)', (0.86, 0.86, 0.84), 0.3, 0.45, ru='рессорная сталь, окраска'),
    block=lib.mat('DA40 gear mounting block (aluminium)', (0.70, 0.71, 0.73), 0.9, 0.38, ru='алюминиевый сплав'),
    steel=lib.mat('DA40 gear bolts (cadmium plated steel)', (0.66, 0.66, 0.62), 1.0, 0.3, ru='сталь, кадмирование'),
    saddle=lib.mat('DA40 gear outer mount (aluminium)', (0.62, 0.63, 0.66), 0.85, 0.42, ru='алюминиевый сплав'),
    poly=lib.mat('DA40 polyamide insert', (0.90, 0.88, 0.80), 0.0, 0.5, ru='полиамид'),
    rubber=lib.mat('DA40 reinforced rubber insert', (0.06, 0.06, 0.06), 0.0, 0.85, ru='армированная резина'),
    gfrp=lib.mat('DA40 gear rib (GFRP)', (0.80, 0.80, 0.72), 0.0, 0.6, ru='стеклопластик'),
    elast=lib.mat('DA40 nose gear elastomer element', (0.10, 0.10, 0.11), 0.0, 0.8, ru='эластомер'),
    tube=lib.mat('DA40 nose gear tube (steel, painted)', (0.84, 0.84, 0.82), 0.3, 0.45, ru='стальная труба, окраска'),
    copper=lib.mat('DA40 bonding braid (tinned copper)', (0.70, 0.66, 0.58), 1.0, 0.45, ru='лужёная медная плетёнка'),
    disc=lib.mat('DA40 gear spring washer (spring steel)', (0.40, 0.41, 0.43), 1.0, 0.35, ru='пружинная сталь'),
    bush=lib.mat('DA40 gear bearing bush (bronze)', (0.72, 0.55, 0.32), 1.0, 0.35, ru='бронза'),
)
# Детали дополнения слоя колёс: на страницах сайта слой колёс — основа, а основа без обшивки показывает только
# материалы под shellKeep («^gear|…»). Поэтому имена материалов начинаются с «Gear».
W = dict(
    hub=lib.mat('Gear wheel hub half (aluminium)', (0.78, 0.79, 0.81), 0.9, 0.32, ru='алюминиевый сплав (колёса Tundra)'),
    hub_mg=lib.mat('Gear nose wheel hub half (magnesium, painted)', (0.70, 0.71, 0.72), 0.4, 0.45, ru='магниевый сплав, окраска'),
    bolt=lib.mat('Gear wheel and axle bolts (cadmium plated steel)', (0.66, 0.66, 0.62), 1.0, 0.3, ru='сталь, кадмирование'),
    disc=lib.mat('Gear brake disc (steel)', (0.46, 0.46, 0.47), 1.0, 0.42, ru='сталь'),
    tube=lib.mat('Gear inner tube (butyl rubber)', (0.09, 0.09, 0.10), 0.0, 0.75, ru='бутиловая резина'),
    valve=lib.mat('Gear tyre valve (brass)', (0.78, 0.62, 0.30), 1.0, 0.35, ru='латунь'),
    bearing=lib.mat('Gear tapered roller bearing (steel)', (0.62, 0.63, 0.65), 1.0, 0.22, ru='подшипниковая сталь'),
    seal=lib.mat('Gear grease seal (rubber)', (0.12, 0.10, 0.10), 0.0, 0.7, ru='маслостойкая резина'),
    ring=lib.mat('Gear snap ring (spring steel)', (0.36, 0.36, 0.38), 1.0, 0.3, ru='пружинная сталь'),
    axle=lib.mat('Gear axle (aluminium)', (0.74, 0.75, 0.77), 0.9, 0.3, ru='алюминиевый сплав'),
    plate=lib.mat('Gear brake torque plate (steel, plated)', (0.58, 0.58, 0.56), 1.0, 0.38, ru='сталь, покрытие'),
    cyl=lib.mat('Gear brake cylinder (aluminium)', (0.66, 0.66, 0.66), 0.85, 0.4, ru='алюминиевый сплав'),
    lining=lib.mat('Gear brake lining', (0.27, 0.25, 0.23), 0.0, 0.85, ru='фрикционная накладка'),
    pin=lib.mat('Gear split pin (steel)', (0.70, 0.70, 0.68), 1.0, 0.3, ru='сталь'),
    steel=lib.mat('Gear nose wheel axle (steel)', (0.62, 0.62, 0.60), 1.0, 0.3, ru='сталь'),
    spacer=lib.mat('Gear nose wheel spacer (aluminium)', (0.72, 0.73, 0.75), 0.9, 0.35, ru='алюминиевый сплав'),
    bush=lib.mat('Gear nose wheel flanged bush (bronze)', (0.72, 0.55, 0.32), 1.0, 0.35, ru='бронза'),
)

EXPLODE = {}
ZERO = V((0, 0, 0))


def group(gid, title, near=None, far=None):
    EXPLODE[gid] = {'title': title, 'parts': {}, 'near': near, 'far': far}


def ex(gid, name, *vecs):
    v = ZERO.copy()
    for q in vecs:
        v += V(q)
    EXPLODE[gid]['parts'][name] = v


def P(name, ru, m, doc='AMM 32-10', col=None):
    return Part(name, ru, (W if col is COL_W else M)[m], col or COL, True, doc)


def fin(p):
    bmesh.ops.recalc_face_normals(p.bm, faces=p.bm.faces[:])
    return p.done()


def revolve(p, c, axis, prof, mi=0, segs=40):
    """Замкнутый профиль [(t, r), …] (t — вдоль оси от c) вращается вокруг оси axis."""
    c, ax = V(c), V(axis).normalized()
    Rm = basis(ax)
    rings = [lib._ring(p.bm, c + ax * t, Rm, segs, r, mi) for t, r in prof]
    for i in range(len(rings)):
        lib._bridge(p.bm, rings[i], rings[(i + 1) % len(rings)], mi, True)


def sector(p, c, e1, e2, axis, r0, r1, a0, a1, t0, t1, mi=0, segs=10):
    """Сектор кольца в плоскости (e1, e2) вокруг точки c: радиусы r0…r1, углы a0…a1 от e1, по оси t0…t1."""
    c, e1, e2, ax = V(c), V(e1), V(e2), V(axis)
    cols = []
    for i in range(segs + 1):
        a = a0 + (a1 - a0) * i / segs
        d = e1 * math.cos(a) + e2 * math.sin(a)
        cols.append([p.bm.verts.new(c + d * r + ax * t) for r, t in ((r0, t0), (r1, t0), (r1, t1), (r0, t1))])
    for a, b in zip(cols[:-1], cols[1:]):
        for k in range(4):
            f = p.bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
            f.material_index = mi
    for ring in (cols[0], cols[-1]):
        f = p.bm.faces.new(ring)
        f.material_index = mi


def castle_nut(p, c, axis, af, h, mi):
    """Корончатая гайка: шестигранник и зубцы короны по оси axis от c."""
    ax = V(axis).normalized()
    hexa(p, c, c + ax * h, af, mi)
    Rm = basis(ax)
    for k in range(6):
        a = math.pi / 6 + 2 * math.pi * k / 6
        q = c + ax * (h + h * 0.22) + Rm @ V((af * 0.36 * math.cos(a), af * 0.36 * math.sin(a), 0))
        box(p, q, (af * 0.22, af * 0.22, h * 0.44), Rm @ Matrix.Rotation(a, 3, 'Z'), mi)


def bolt_head(p, c, axis, d, length, mi, af=None):
    """Болт с шестигранной головкой у c, стержень вдоль axis."""
    ax = V(axis).normalized()
    hexa(p, c - ax * d * 0.7, c, af or d * 1.6, mi)
    cyl(p, c, c + ax * length, d / 2, mi, segs=10)


def nut(p, c, axis, d, mi, washer=True):
    ax = V(axis).normalized()
    if washer:
        cyl(p, c, c + ax * d * 0.18, d * 1.05, mi, segs=16)
        c = c + ax * d * 0.18
    hexa(p, c, c + ax * d * 0.8, d * 1.6, mi)


# ── Основная стойка ───────────────────────────────────────────────────────
SPRING_Y = 0.331            # середина рессоры по хорде (MSFS Plane.069: 0,303…0,359 у оси колеса)
SPRING_W, SPRING_T = 0.056, 0.018
X_INNER = 0.10              # ось внутреннего болта
X_RIB_C = 0.035             # центральная замыкающая нервюра (по борту блока)
OUTER = (0.50, 0.62)        # наружный узел по размаху
X_EXIT = 0.86               # выход из фюзеляжа (начало рессоры MSFS: x 0,849, z −0,196)
AX_Y, AX_Z = 0.275, -0.652  # ось колеса основной опоры (шина и диск MSFS)
X_LEGF = 1.409              # наружная грань фланца рессоры MSFS (Plane.014 у оси: x 1,399…1,409)
X_TC = 1.535                # середина колеса (шина MSFS Tundra tyre L)
E1 = V((0, 0.856, -0.517))  # к суппорту: назад-вниз (суппорт MSFS Plane.067 — y 0,29…0,38, z −0,73…−0,64)
E2 = V((0, 0.517, 0.856))   # вдоль суппорта: назад-вверх


def z_spring(x):
    """Ось рессоры внутри: почти горизонтально под полом, у борта — к началу рессоры MSFS."""
    return -0.212 + (x - X_INNER) * 0.040


def leaf(p, s):
    """Внутренняя часть рессоры: полоса прямоугольного сечения от внутреннего болта
    до выхода из фюзеляжа, у борта плавно переходит в наклонную часть MSFS."""
    pts = [V((s * x, SPRING_Y, z_spring(x))) for x in (X_INNER - 0.03, 0.30, 0.55, 0.74)]
    pts += [V((s * 0.80, SPRING_Y, z_spring(0.80) - 0.002)), V((s * 0.849, SPRING_Y - 0.006, -0.199)),
            V((s * 0.90, SPRING_Y - 0.008, -0.236))]
    path = fillet(pts, 0.05)
    bm = p.bm
    rows = []
    for i, q in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        side = V((0, 1, 0))
        up = t.cross(side).normalized() * (1 if s > 0 else -1)
        if up.z < 0:
            up = -up
        rows.append([bm.verts.new(q + side * sy * SPRING_W / 2 + up * sz * SPRING_T / 2)
                     for sy, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    for a, b in zip(rows[:-1], rows[1:]):
        for k in range(4):
            f = bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
            f.material_index = 0
            f.smooth = False
    for ring, flip in ((rows[0], True), (rows[-1], False)):
        f = bm.faces.new(ring[::-1] if flip else ring)
        f.material_index = 0
    # скруглённый внутренний конец с отверстием под болт — проушина
    c = V((s * X_INNER, SPRING_Y, z_spring(X_INNER)))
    cyl(p, c - V((0, 0, SPRING_T / 2)), c + V((0, 0, SPRING_T / 2)), SPRING_W / 2, 0, segs=24)


def main_gear(s):
    tag = 'LH' if s > 0 else 'RH'
    side_ru = 'левой' if s > 0 else 'правой'
    side_ru2 = 'левого' if s > 0 else 'правого'
    X = V((s, 0, 0))
    gi, go, gw = f'main-{tag.lower()}-inner', f'main-{tag.lower()}-outer', f'main-{tag.lower()}-wheel'
    group(gi, f'Внутренний узел крепления {side_ru} рессоры (AMM 32-10 рис. 1)')
    group(go, f'Наружный узел крепления {side_ru} рессоры (AMM 32-10 рис. 1)')
    group(gw, f'Колесо, тормоз и полуось {side_ru} основной опоры (AMM 32-10 рис. 2, 4; 32-40 рис. 1, 4)', near=1.9, far=3.6)

    p = P(f'Main gear leaf spring inboard part {tag}',
          f'Рессора {side_ru} основной стойки внутри фюзеляжа: стальная плоская полоса от внутреннего болта через наружный узел к выходу из фюзеляжа',
          'spring')
    leaf(p, s)
    fin(p)

    # центральная замыкающая нервюра центроплана (участок под узлом)
    zc = z_spring(X_INNER)
    rb = P(f'Centre section centre closing rib (main gear inner mount) {tag}',
           'Средняя часть передней замыкающей (бортовой) нервюры центроплана: к ней крепится монтажный блок внутреннего '
           'узла крепления стойки основной опоры шасси', 'gfrp', 'AMM 32-10, 53-10 2.E')
    box(rb, V((s * (X_RIB_C - 0.004), SPRING_Y, -0.20)), (0.008, 0.16, 0.12), Matrix.Identity(3), 0, bevel=0.002)
    fin(rb)

    # ── внутренний узел (32-10 рис. 1): болт сверху сквозь блок, пружинные шайбы, проушину рессоры,
    #    выпуклую и вогнутую шайбы; снизу корончатая гайка со шплинтом
    top_s = zc + SPRING_T / 2
    bot_s = zc - SPRING_T / 2
    BLK_H = 0.024          # над блоком под полом центроплана — тросы руля направления (z −0,164…−0,156)
    z_blk0 = top_s + 0.012
    blk = V((s * (X_RIB_C + 0.05), SPRING_Y, z_blk0 + BLK_H / 2))
    axis = V((s * X_INNER, SPRING_Y, 0))
    up, dn = V((0, 0, 1)), V((0, 0, -1))

    b = P(f'Main gear inner mount block {tag}',
          f'Монтажный блок внутреннего узла крепления {side_ru} рессоры: крепится болтами к центральной замыкающей '
          'нервюре центроплана; сквозь него проходит внутренний болт', 'block', 'AMM 32-10 2., рис. 1')
    box(b, blk, (0.10, 0.07, BLK_H), Matrix.Identity(3), 0, bevel=0.003)
    fin(b)
    ex(gi, b.name, (0, 0, 0.075))

    bb = P(f'Main gear inner mount block bolts {tag}', 'Болты крепления монтажного блока к стенке нервюры', 'steel', 'AMM 32-10 рис. 1')
    bn = P(f'Main gear inner mount block nuts {tag}', 'Шайбы и гайки болтов крепления монтажного блока (с другой стороны стенки)',
           'steel', 'AMM 32-10 рис. 1')
    for dy in (-0.022, 0.022):
        head = V((s * (X_RIB_C + 0.10), SPRING_Y + dy, blk.z))
        bolt_head(bb, head + X * 0.006, -X, 0.006, 0.118, 0, af=0.010)
        nut(bn, V((s * (X_RIB_C - 0.008), SPRING_Y + dy, blk.z)), -X, 0.006, 0)
    fin(bb)
    fin(bn)
    ex(gi, bb.name, (0, 0, 0.075), X * 0.11)
    ex(gi, bn.name, -X * 0.06)

    ib = P(f'Main gear inner bolt {tag}',
           'Внутренний болт: вертикальный, сквозь монтажный блок, пружинные шайбы и проушину рессоры; снизу — '
           'корончатая гайка', 'steel', 'AMM 32-10 2., рис. 1')
    head = V((axis.x, axis.y, blk.z + BLK_H / 2))
    hexa(ib, head, head + up * 0.008, 0.030, 0)
    nut_top = bot_s - 0.010
    cyl(ib, head, V((axis.x, axis.y, nut_top - 0.02)), 0.0095, 0, segs=14)
    fin(ib)
    ex(gi, ib.name, (0, 0, 0.17))

    for k, (nm, ru) in enumerate((('lower', 'нижняя, на рессоре'), ('upper', 'верхняя, под блоком'))):
        w = P(f'Main gear inner mount spring washer {nm} {tag}',
              f'Пружинная (тарельчатая) шайба, {ru}: между верхней гранью рессоры и монтажным блоком; корончатая '
              'гайка поджимает пружинные шайбы', 'disc', 'AMM 32-10 2., рис. 1')
        z = top_s + 0.0005 + k * 0.006
        revolve(w, V((axis.x, axis.y, z)), up, [(0, 0.0105), (0, 0.022 - k * 0.002), (0.0018, 0.022 - k * 0.002),
                                                (0.0055, 0.0125), (0.0055, 0.0105)], 0, segs=32)
        fin(w)
        ex(gi, w.name, (0, 0, 0.032 + 0.022 * k))

    cw = P(f'Main gear inner mount convex washer {tag}', 'Выпуклая шайба под нижней гранью рессоры', 'steel', 'AMM 32-10 2., рис. 1')
    revolve(cw, V((axis.x, axis.y, bot_s)), dn, [(0, 0.0102), (0, 0.020), (0.003, 0.020), (0.005, 0.014), (0.005, 0.0102)], 0, segs=32)
    fin(cw)
    ex(gi, cw.name, (0, 0, -0.035))
    vw = P(f'Main gear inner mount concave washer {tag}', 'Вогнутая шайба между выпуклой шайбой и корончатой гайкой', 'steel',
           'AMM 32-10 2., рис. 1')
    revolve(vw, V((axis.x, axis.y, bot_s - 0.005)), dn, [(0, 0.0102), (0, 0.014), (0, 0.020), (0.005, 0.020), (0.005, 0.0102)], 0, segs=32)
    fin(vw)
    ex(gi, vw.name, (0, 0, -0.062))
    cn = P(f'Main gear inner mount castle nut {tag}', 'Корончатая гайка внутреннего болта: поджимает пружинные шайбы',
           'steel', 'AMM 32-10 2., рис. 1')
    castle_nut(cn, V((axis.x, axis.y, nut_top)), dn, 0.030, 0.012, 0)
    fin(cn)
    ex(gi, cn.name, (0, 0, -0.092))
    cp = P(f'Main gear inner mount cotter pin {tag}', 'Шплинт корончатой гайки', 'steel', 'AMM 32-10 рис. 1')
    zp = nut_top - 0.0165
    sweep(cp, fillet([V((axis.x - 0.020, axis.y + 0.002, zp)), V((axis.x + 0.016, axis.y + 0.002, zp)),
                      V((axis.x + 0.020, axis.y + 0.002, zp - 0.006))], 0.003), 0.0014, 0, segs=6)
    sweep(cp, [V((axis.x - 0.020, axis.y - 0.002, zp)), V((axis.x + 0.012, axis.y - 0.002, zp))], 0.0014, 0, segs=6)
    fin(cp)
    ex(gi, cp.name, (0, -0.035, -0.115))

    m = P(f'Main gear inner mount bonding strap {tag}', 'Перемычка металлизации: монтажный блок — рессора', 'copper', 'AMM 32-10 рис. 1')
    a0 = V((s * (X_RIB_C + 0.095), SPRING_Y - 0.036, blk.z - 0.012))
    a1 = V((s * (X_INNER + 0.06), SPRING_Y - 0.030, z_spring(X_INNER + 0.06) - 0.004))
    sweep(m, fillet([a0, a0 + V((0, -0.012, -0.012)), a1 + V((0, -0.008, 0)), a1], 0.01), 0.002, 0, segs=6)
    fin(m)
    ex(gi, m.name, (0, -0.04, 0.03))

    # ── нервюры основного шасси и наружный узел (32-10 рис. 1)
    x0, x1 = OUTER
    xm = (x0 + x1) / 2
    zm = z_spring(xm)
    belly = R.hit(V((s * xm, SPRING_Y, zm)), V((0, 0, -1)), 0.5)[0]
    zb = belly.z + 0.004 if belly is not None else zm - 0.04
    rib = P(f'Main gear ribs {tag}', 'Нервюры крепления основной опоры шасси: вклеены в центроплан между лонжеронами; к ним двумя болтами '
              'крепится внешний узел крепления стойки', 'gfrp', 'AMM 32-10, 53-10 2.E')
    for dy in (-0.062, 0.062):
        box(rib, V((s * xm, SPRING_Y + dy, (zb + zm + 0.09) / 2)), (x1 - x0 + 0.10, 0.006, zm + 0.09 - zb), Matrix.Identity(3), 0, bevel=0.001)
    fin(rib)
    top_s = zm + SPRING_T / 2
    bot_s = zm - SPRING_T / 2

    o = P(f'Main gear outer mount upper part {tag}',
          f'Наружный узел крепления {side_ru} рессоры, верхняя часть: ложится на рессору сверху, двумя болтами '
          'крепится к нервюрам основного шасси', 'saddle', 'AMM 32-10 2., рис. 1')
    box(o, V((s * xm, SPRING_Y, top_s + 0.036)), (x1 - x0, 0.118, 0.054), Matrix.Identity(3), 0, bevel=0.006)        # верх
    for dy in (-1, 1):                                                                                               # щёки до планки
        box(o, V((s * xm, SPRING_Y + dy * 0.047, zm + 0.004)), (x1 - x0, 0.024, SPRING_T + 0.012), Matrix.Identity(3), 0, bevel=0.003)
    fin(o)
    ex(go, o.name, (0, 0, 0.11))
    pi = P(f'Main gear outer mount polyamide insert {tag}', 'Полиамидный вкладыш между рессорой и верхней частью наружного узла',
           'poly', 'AMM 32-10 рис. 1')
    box(pi, V((s * xm, SPRING_Y, top_s + 0.003)), (x1 - x0 - 0.01, SPRING_W, 0.006), Matrix.Identity(3), 0)
    fin(pi)
    ex(go, pi.name, (0, 0, 0.055))
    fl = P(f'Main gear outer mount flexible insert {tag}',
           'Эластичный вкладыш из армированной резины между рессорой и фиксирующей планкой: защищает рессору от истирания '
           'и даёт ей поворачиваться в узле', 'rubber', 'AMM 32-10 2., рис. 1')
    box(fl, V((s * xm, SPRING_Y, bot_s - 0.002)), (x1 - x0 - 0.01, SPRING_W, 0.004), Matrix.Identity(3), 0)
    fin(fl)
    ex(go, fl.name, (0, 0, -0.045))
    rbar = P(f'Main gear outer mount retaining bar {tag}', 'Фиксирующая планка наружного узла под рессорой', 'saddle', 'AMM 32-10 2., рис. 1')
    box(rbar, V((s * xm, SPRING_Y, bot_s - 0.010)), (x1 - x0, 0.118, 0.012), Matrix.Identity(3), 0, bevel=0.002)
    fin(rbar)
    ex(go, rbar.name, (0, 0, -0.085))
    vb = P(f'Main gear outer mount bolts {tag}', 'Болты наружного узла с шайбами: стягивают верхнюю часть и фиксирующую планку',
           'steel', 'AMM 32-10 рис. 1')
    vn = P(f'Main gear outer mount nuts {tag}', 'Шайбы и гайки болтов наружного узла под фиксирующей планкой', 'steel', 'AMM 32-10 рис. 1')
    for dy in (-0.047, 0.047):
        h = V((s * xm, SPRING_Y + dy, top_s + 0.069))
        cyl(vb, h, h - dn * 0.0015, 0.0085, 0, segs=14)
        bolt_head(vb, h + up * 0.0075, dn, 0.008, (top_s + 0.069) - (bot_s - 0.024) + 0.0075, 0, af=0.013)
        nut(vn, V((s * xm, SPRING_Y + dy, bot_s - 0.016)), dn, 0.008, 0)
    fin(vb)
    fin(vn)
    ex(go, vb.name, (0, 0, 0.21))
    ex(go, vn.name, (0, 0, -0.13))
    rbo = P(f'Main gear outer mount rib bolts {tag}', 'Болты крепления наружного узла к нервюрам основного шасси (с гайками)',
            'steel', 'AMM 32-10 2.')
    for dx in (-0.045, 0.045):
        q = V((s * (xm + dx), SPRING_Y - 0.068, top_s + 0.036))
        cyl(rbo, q, q + V((0, 0.136, 0)), 0.004, 0, segs=10)
        hexa(rbo, q - V((0, 0.006, 0)), q, 0.012, 0)
        hexa(rbo, q + V((0, 0.136, 0)), q + V((0, 0.142, 0)), 0.012, 0)
    fin(rbo)
    ex(go, rbo.name, (0, -0.15, 0.11))

    # уплотнительная панель там, где рессора проходит сквозь обшивку
    hit = R.hit(V((s * 0.70, SPRING_Y, -0.205)), V((s, 0, -0.35)).normalized(), 0.4)
    if hit[0] is not None:
        c, n = hit[0], hit[1].normalized()
        if n.dot(V((s, 0, 0))) < 0:
            n = -n
        sp = P(f'Main gear strut seal panel {tag}', 'Уплотнительная панель с гибкой серединой там, где рессора выходит из фюзеляжа', 'rubber', 'AMM 32-10')
        Rm = basis(n)
        box(sp, c - n * 0.003, (0.14, 0.11, 0.003), Rm, sp.m(M['saddle']), bevel=0.002)
        box(sp, c - n * 0.001, (0.09, 0.075, 0.003), Rm, 0, bevel=0.004)
        fin(sp)

    # ── полуось, опорная пластина тормоза, болты (32-10 рис. 2, 4 — шасси Tundra): изнутри наружу
    A = V((0, AX_Y, AX_Z))
    def ax(x):
        return V((s * x, AX_Y, AX_Z))

    tp = P(f'Main gear brake torque plate {tag}',
           'Опорная пластина тормоза: зажата болтами полуоси между концом рессоры и фланцем полуоси, на её рычаге — тормоз',
           'plate', 'AMM 32-10 рис. 2, 4; 32-40 рис. 4, 5', COL_W)
    revolve(tp, ax(X_LEGF), X, [(0, 0.0195), (0.007, 0.0195), (0.007, 0.047), (0, 0.047)], 0, segs=36)
    sector(tp, ax(X_LEGF), E1, E2, X, 0.040, 0.104, -0.48, 0.48, 0, 0.007, 0, segs=12)
    fin(tp)
    xa0 = X_LEGF + 0.007
    al = P(f'Main gear axle {tag}',
           'Полуось из алюминиевого сплава с фланцем: шестью болтами крепится к концу рессоры вместе с опорной пластиной '
           'тормоза; на ней на конических подшипниках вращается колесо', 'axle', 'AMM 32-10 2., рис. 2, 4', COL_W)
    revolve(al, ax(xa0), X, [(0, 0.012), (0, 0.045), (0.010, 0.045), (0.012, 0.024), (0.012, 0.0185), (0.047, 0.0185),
                              (0.049, 0.0178), (0.172, 0.0178), (0.174, 0.016), (0.226, 0.016), (0.228, 0.014), (0.228, 0.012)], 0, segs=32)
    for k in range(10):                                                     # резьба под гайку полуоси
        t = 0.196 + k * 0.003
        revolve(al, ax(xa0 + t), X, [(0, 0.0158), (0.0012, 0.0168), (0.0024, 0.0158)], 0, segs=24)
    fin(al)
    abolt = P(f'Main gear axle bolts {tag}', 'Болты крепления полуоси (6) с шайбами: головки — у фланца полуоси', 'bolt',
              'AMM 32-10 рис. 2, 4', COL_W)
    anut = P(f'Main gear axle bolt nuts {tag}', 'Шайбы и гайки болтов полуоси с внутренней стороны рессоры', 'bolt',
             'AMM 32-10 рис. 2, 4', COL_W)
    for k in range(6):
        a = math.radians(30 + 60 * k)
        d = (E1 * math.cos(a) + E2 * math.sin(a)) * 0.032
        h = ax(xa0 + 0.010) + d
        cyl(abolt, h, h + X * 0.0015, 0.0062, 0, segs=12)
        bolt_head(abolt, h + X * 0.0060, -X, 0.006, 0.040, 0, af=0.010)
        nut(anut, ax(X_LEGF - 0.010) + d, -X, 0.006, 0)
    fin(abolt)
    fin(anut)
    xe = xa0 + 0.228                                                    # конец полуоси
    an = P(f'Main gear axle nut {tag}', 'Гайка полуоси с шайбой: держит колесо на полуоси', 'bolt', 'AMM 32-10 рис. 2, 4', COL_W)
    ring_tube(an, ax(xe - 0.0215), X, 0.024, 0.0165, 0.003, 0, segs=28)
    castle_nut(an, ax(xe - 0.020), X, 0.032, 0.011, 0)
    fin(an)
    spn = P(f'Main gear axle nut split pin {tag}', 'Шплинт гайки полуоси', 'pin', 'AMM 32-10 рис. 4 (шасси Tundra)', COL_W)
    xp = xe - 0.0065
    sweep(spn, fillet([ax(xp) + V((0, 0.003, 0.022)), ax(xp) + V((0, 0.003, -0.019)), ax(xp) + V((s * 0.004, 0.003, -0.024))], 0.003),
          0.0014, 0, segs=6)
    sweep(spn, [ax(xp) + V((0, -0.003, 0.022)), ax(xp) + V((0, -0.003, -0.016))], 0.0014, 0, segs=6)
    sweep(spn, fillet([ax(xp) + V((0, 0.003, 0.022)), ax(xp) + V((0, 0.0, 0.026)), ax(xp) + V((0, -0.003, 0.022))], 0.002), 0.0014, 0, segs=6)
    fin(spn)

    # ── тормоз (32-40 рис. 4, 5): цилиндр на рычаге опорной пластины, колодки по обе стороны диска
    X_DISC = (xa0 + 0.021, xa0 + 0.028)                                 # диск 7 мм
    rc = 0.077                                                          # середина колодок по радиусу
    body_c = ax((xa0 + X_DISC[0] - 0.0045) / 2) + E1 * rc
    cy = P(f'Main gear brake cylinder {tag}',
           'Тормозной цилиндр (корпус суппорта): поршень прижимает тормозную колодку к диску, реакция корпуса прижимает '
           'колодку с другой стороны', 'cyl', 'AMM 32-40 2.C, рис. 4', COL_W)
    bw = X_DISC[0] - 0.0045 - xa0
    box(cy, body_c, (bw, 0.044, 0.080), Matrix((V((s, 0, 0)), E1, E2)).transposed(), 0, bevel=0.004)
    for t in (-0.028, 0.028):                                           # приливы под болты колодки
        q = ax(xa0 + 0.0005) + E1 * rc + E2 * t
        cyl(cy, q, q + X * (bw - 0.001), 0.0085, 0, segs=16)
    fin(cy)
    pp = P(f'Main gear brake pressure plate {tag}', 'Тормозная колодка со стороны поршня: нажимная пластина с фрикционной накладкой',
           'plate', 'AMM 32-40 2.C, рис. 4, 5', COL_W)
    sector(pp, ax(0), E1, E2, X, 0.058, 0.096, -0.38, 0.38, X_DISC[0] - 0.0045, X_DISC[0] - 0.0025, 0, segs=10)
    sector(pp, ax(0), E1, E2, X, 0.060, 0.094, -0.36, 0.36, X_DISC[0] - 0.0025, X_DISC[0], pp.m(W['lining']), segs=10)
    fin(pp)
    bp = P(f'Main gear brake back plate {tag}', 'Колодка с другой стороны диска: опорная пластина с фрикционной накладкой',
           'plate', 'AMM 32-40 2.C, рис. 4, 5', COL_W)
    sector(bp, ax(0), E1, E2, X, 0.060, 0.094, -0.36, 0.36, X_DISC[1], X_DISC[1] + 0.0025, bp.m(W['lining']), segs=10)
    sector(bp, ax(0), E1, E2, X, 0.058, 0.096, -0.38, 0.38, X_DISC[1] + 0.0025, X_DISC[1] + 0.0045, 0, segs=10)
    fin(bp)
    bpb = P(f'Main gear brake back plate bolts {tag}', 'Болты крепления колодки с шайбами: сквозь колодку в корпус тормоза',
            'bolt', 'AMM 32-40 рис. 4, 5', COL_W)
    for t in (-0.028, 0.028):
        q = ax(X_DISC[1] + 0.0045) + E1 * rc + E2 * t
        cyl(bpb, q, q + X * 0.0015, 0.0075, 0, segs=14)
        bolt_head(bpb, q + X * 0.0060, -X, 0.0065, X_DISC[1] + 0.0045 - xa0 + 0.0015, 0, af=0.011)
    fin(bpb)

    # ── колесо (32-40 рис. 1): тормозной диск, дистанционная шайба, барабан из двух половин, камера, подшипники
    dk = P(f'Main wheel brake disc {tag}',
           'Тормозной диск: крепится к внутренней половине барабана теми же болтами, что стягивают половины', 'disc',
           'AMM 32-40 2.A, рис. 1', COL_W)
    revolve(dk, ax(X_DISC[0]), X, [(0, 0.050), (0.007, 0.050), (0.007, 0.090), (0, 0.090)], 0, segs=48)
    fin(dk)
    X_HUB0 = X_TC - 0.080                                              # внутренний край барабана
    dw = P(f'Main wheel distance washer {tag}',
           'Дистанционная шайба между тормозным диском и внутренней половиной барабана — у колёс Tundra (OÄM 40-334)',
           'disc', 'AMM 32-40 2.A, рис. 1', COL_W)
    revolve(dw, ax(X_DISC[1]), X, [(0, 0.047), (X_HUB0 - X_DISC[1], 0.047), (X_HUB0 - X_DISC[1], 0.064), (0, 0.064)], 0, segs=40)
    fin(dw)
    half = [(X_HUB0, 0.0265), (X_TC, 0.0265), (X_TC, 0.0762), (X_TC - 0.0635, 0.0762), (X_TC - 0.0635, 0.089),
            (X_TC - 0.0715, 0.089), (X_TC - 0.0715, 0.070), (X_TC - 0.065, 0.070), (X_TC - 0.065, 0.041), (X_HUB0, 0.041)]
    hi = P(f'Main wheel hub inner half {tag}',
           'Внутренняя половина барабана колеса (у колёс Tundra — алюминиевый сплав); в ней конический подшипник',
           'hub', 'AMM 32-40 2.A, рис. 1', COL_W)
    revolve(hi, ax(0), X, half, 0, segs=48)
    fin(hi)
    ho = P(f'Main wheel hub outer half {tag}',
           'Наружная половина барабана колеса с отверстием под вентиль камеры', 'hub', 'AMM 32-40 2.A, рис. 1', COL_W)
    revolve(ho, ax(0), X, [(2 * X_TC - t, r) for t, r in half][::-1], 0, segs=48)
    fin(ho)
    wb = P(f'Main wheel bolts {tag}', 'Болты барабана (6) у колёс Tundra: стягивают половины и держат тормозной диск', 'bolt',
           'AMM 32-40 2.A, рис. 1', COL_W)
    wn = P(f'Main wheel bolt nuts {tag}', 'Шайбы и гайки болтов барабана', 'bolt', 'AMM 32-40 рис. 1', COL_W)
    x_web_o = 2 * X_TC - (X_TC - 0.065)
    for k in range(6):
        a = math.radians(60 * k)
        d = (E1 * math.cos(a) + E2 * math.sin(a)) * 0.056
        h = ax(X_DISC[0]) + d
        bolt_head(wb, h, X, 0.007, x_web_o - X_DISC[0] + 0.006, 0, af=0.011)
        nut(wn, ax(x_web_o) + d, X, 0.007, 0)
    fin(wb)
    fin(wn)
    tb = P(f'Main wheel inner tube {tag}', 'Камера с вентилем: шина колеса камерная', 'tube', 'AMM 32-40 2.A, рис. 1', COL_W)
    torus(tb, ax(X_TC), X, 0.170, 0.078, 0, segs=48, rsegs=14)
    vq = ax(X_TC) + (E1 * math.cos(2.4) + E2 * math.sin(2.4)) * 0.093
    cyl(tb, vq, vq + X * 0.090, 0.0042, tb.m(W['valve']), segs=10)
    cyl(tb, vq + X * 0.090, vq + X * 0.102, 0.0055, tb.m(W['valve']), segs=10)
    fin(tb)
    for nm, ru, x_in, sgn in (('inner', 'внутренней', X_HUB0, 1), ('outer', 'наружной', 2 * X_TC - X_HUB0, -1)):
        br = P(f'Main wheel bearing {nm} {tag}', f'Конический роликовый подшипник в {ru} половине барабана', 'bearing',
               'AMM 32-40 2.A, рис. 1', COL_W)
        x_b = x_in + sgn * 0.009
        revolve(br, ax(x_b), X * sgn, [(0, 0.0185), (0.018, 0.0185), (0.018, 0.0265), (0.004, 0.0265), (0, 0.0230)], 0, segs=32)
        fin(br)
        sl = P(f'Main wheel grease seal {nm} {tag}', 'Уплотнение подшипника', 'seal', 'AMM 32-40 2.A, рис. 1', COL_W)
        ring_tube(sl, ax(x_in + sgn * 0.006), X, 0.0262, 0.0190, 0.005, 0, segs=28)
        fin(sl)
        sr = P(f'Main wheel snap ring {nm} {tag}', 'Пружинное кольцо: держит подшипник и уплотнение в барабане', 'ring',
               'AMM 32-40 2.A, рис. 1', COL_W)
        ring_tube(sr, ax(x_in + sgn * 0.0018), X, 0.0270, 0.0235, 0.0016, 0, segs=28)
        fin(sr)

    # ── смещения разборки: колесо целиком сходит наружу с полуоси, детали колеса расходятся вдоль оси,
    #    тормоз отходит в сторону от диска (32-10 рис. 2, 32-40 рис. 1, 4)
    Wv = X * 0.45
    tyre = f'Tundra tyre {"L" if s > 0 else "R"}'
    for nm in (tyre, tyre + ' lettering'):
        ex(gw, nm, Wv)
    ex(gw, tb.name, Wv, X * 0.24)
    ex(gw, hi.name, Wv, X * -0.19)
    ex(gw, ho.name, Wv, X * 0.37)
    ex(gw, wb.name, Wv, X * -0.30, (0, 0, 0.15))          # болты — над колесом, видно все шесть
    ex(gw, wn.name, Wv, X * 0.46)
    ex(gw, dk.name, Wv, X * -0.43)
    ex(gw, dw.name, Wv, X * -0.33)
    for nm, k in (('inner', (-0.29, -0.33, -0.36)), ('outer', (0.50, 0.535, 0.56))):
        ex(gw, f'Main wheel bearing {nm} {tag}', Wv, X * k[0])
        ex(gw, f'Main wheel grease seal {nm} {tag}', Wv, X * k[1])
        ex(gw, f'Main wheel snap ring {nm} {tag}', Wv, X * k[2])
    ex(gw, an.name, X * 1.04)
    ex(gw, spn.name, X * 1.10, (0, 0, 0.03))
    ex(gw, cy.name, E1 * 0.11, X * -0.01)
    ex(gw, f'Brake caliper {"L" if s > 0 else "R"} inlet fitting and bleeder', E1 * 0.11, X * -0.01)
    ex(gw, pp.name, E1 * 0.075, X * 0.01)
    ex(gw, bp.name, E1 * 0.075, X * 0.06)
    ex(gw, bpb.name, E1 * 0.075, X * 0.13)
    ex(gw, abolt.name, X * 0.06)
    ex(gw, anut.name, X * -0.05)
    return body_c


# ── Носовая стойка ────────────────────────────────────────────────────────
NG_X = 0.078                                # ось стойки (MSFS Cylinder.180)
JOURNAL = (V((-0.050, -0.970, -0.130)), V((0.126, -0.970, -0.130)))   # концы поперечной трубы
PACK_X, PACK_Y = NG_X, -1.300               # ось эластомерного пакета (вертикально)
LUG = V((NG_X, -1.215, -0.1025))            # нижняя поперечина моторамы (powerplant.py: fw_lo — fw_c)
PIVOT = V((NG_X, -1.760, -0.505))           # верх оси вилки
NW = V((0.078, -1.524, -0.713))             # ось носового колеса (шина MSFS Tundra tyre N), вдоль X
FORK_MSFS = ('Plane.039', 'Cylinder.037', 'Cylinder.027', 'Cylinder.053', 'Cylinder.033')   # щёки, траверса, болт, упор


def nose_gear():
    gj, gp, gn = 'nose-journal', 'nose-pack', 'nose-wheel'
    group(gj, 'Цапфы носовой стойки (AMM 32-20 рис. 1, 4)')
    group(gp, 'Эластомерный пружинный пакет носовой стойки (AMM 32-20 рис. 2)', near=1.0, far=2.2)
    group(gn, 'Колесо и вилка носовой опоры (AMM 32-20 рис. 1; 32-40 рис. 1, 7)', near=1.6, far=3.2)
    X = V((1, 0, 0))
    up = V((0, 0, 1))

    # ── цапфы: подшипники поперечной трубы, монтажные пластины, болты, стопорный болт
    for e, s, tag in ((JOURNAL[0], -1, 'RH'), (JOURNAL[1], 1, 'LH')):
        jb = P(f'Nose gear journal bearing {tag}',
               'Подшипник цапфы поперечной трубы носовой стойки: стойка качается только вверх-вниз', 'bush', 'AMM 32-20 2., рис. 1, 4')
        cyl(jb, e, e + V((s * 0.016, 0, 0)), 0.024, 0, segs=24)
        fin(jb)
        ex(gj, jb.name, V((s * 0.05, 0, 0)))
        jp = P(f'Nose gear journal mounting plate {tag}', 'Монтажная пластина подшипника цапфы с усиливающим листом', 'block',
               'AMM 32-20 рис. 2, 4')
        box(jp, e + V((s * 0.019, 0, -0.003)), (0.006, 0.075, 0.056), Matrix.Identity(3), 0, bevel=0.004)
        fin(jp)
        ex(gj, jp.name, V((s * 0.09, 0, 0)))
        jt = P(f'Nose gear journal bolts {tag}', 'Болты с шайбами крепления монтажной пластины', 'steel', 'AMM 32-20 рис. 2')
        for dy in (-0.026, 0.026):
            for dz in (-0.020, 0.016):
                q = e + V((s * 0.022, dy, dz))
                hexa(jt, q, q + V((s * 0.005, 0, 0)), 0.010, 0)
                cyl(jt, q, q - V((s * 0.012, 0, 0)), 0.003, 0, segs=8)
        fin(jt)
        ex(gj, jt.name, V((s * 0.14, 0, 0)))
    lb = P('Nose gear lock bolt', 'Стопорный болт поперечной трубы носовой стойки', 'steel', 'AMM 32-20 рис. 1')
    q = (JOURNAL[0] + JOURNAL[1]) / 2 + V((0, -0.022, 0))
    cyl(lb, q, q + V((0, -0.03, 0)), 0.005, 0, segs=10)
    hexa(lb, q + V((0, -0.03, 0)), q + V((0, -0.036, 0)), 0.013, 0)
    fin(lb)
    ex(gj, lb.name, (0, -0.07, 0))

    # ── эластомерный пружинный пакет (32-20 рис. 2), снизу вверх
    def at(z):
        return V((PACK_X, PACK_Y, z))

    parts = []                                                  # (имя, русская подпись, z0, z1, построение, смещение)

    def piece(name, ru, mat, build, dz, side=(0, 0, 0)):
        p = P(name, ru, mat, 'AMM 32-20 рис. 2')
        build(p)
        fin(p)
        ex(gp, p.name, (0, 0, dz), side)

    piece('Nose gear elastomer pack adjusting nut', 'Регулировочная гайка эластомерного пакета', 'steel',
          lambda p: hexa(p, at(-0.424), at(-0.413), 0.026, 0), -0.10)
    piece('Nose gear elastomer pack large washer', 'Большая шайба', 'steel',
          lambda p: ring_tube(p, at(-0.4115), up, 0.020, 0.0062, 0.003, 0, segs=24), -0.075)
    piece('Nose gear elastomer pack small element', 'Малый эластомерный элемент', 'elast',
          lambda p: revolve(p, at(-0.410), up, [(0, 0.0065), (0, 0.014), (0.007, 0.0158), (0.014, 0.014), (0.014, 0.0065)], 0, segs=24), -0.052)
    piece('Nose gear elastomer pack flanged washer', 'Большая шайба с буртиком', 'steel',
          lambda p: revolve(p, at(-0.396), up, [(0, 0.0065), (0, 0.021), (0.003, 0.021), (0.003, 0.012), (0.011, 0.012), (0.011, 0.0065)], 0, segs=24), -0.028)

    def trunnion(p):
        ring_tube(p, at(-0.381), up, 0.022, 0.0090, 0.018, 0, segs=28)
        cyl(p, at(-0.381) + X * 0.020, at(-0.381) + X * 0.034, 0.0065, 0, segs=12)
        cyl(p, at(-0.381) - X * 0.020, at(-0.381) - X * 0.034, 0.0065, 0, segs=12)
    piece('Nose gear elastomer pack trunnion ring', 'Цапфенное кольцо: низ пакета — в кронштейне стойки', 'steel', trunnion, 0.0)
    piece('Nose gear elastomer pack lower end cap', 'Нижняя торцевая крышка', 'block',
          lambda p: revolve(p, at(-0.372), up, [(0, 0.0090), (0, 0.030), (0.004, 0.030), (0.006, 0.024), (0.006, 0.0090)], 0, segs=32), 0.016)
    piece('Nose gear elastomer pack bearing', 'Подшипник', 'bush',
          lambda p: ring_tube(p, at(-0.363), up, 0.0135, 0.0088, 0.006, 0, segs=20), 0.032)
    piece('Nose gear elastomer pack lower stud', 'Резьбовая шпилька (нижняя)', 'steel',
          lambda p: cyl(p, at(-0.432), at(-0.360), 0.0055, 0, segs=10), 0.045, (0, -0.055, 0))
    z = -0.366
    for k in range(5):
        piece(f'Nose gear elastomer element {k + 1}', 'Эластомерный элемент: сжимается при росте нагрузки на стойку', 'elast',
              (lambda z0: lambda p: revolve(p, at(z0), up, [(0, 0.0092), (0, 0.022), (0.015, 0.0255), (0.030, 0.022), (0.030, 0.0092)],
                                            0, segs=32))(z), 0.055 + k * 0.030)
        piece(f'Nose gear elastomer pack separator plate {k + 1}', 'Разделительная пластина между эластомерными элементами', 'block',
              (lambda z0: lambda p: ring_tube(p, at(z0 + 0.03225), up, 0.0290, 0.0092, 0.0045, 0, segs=32))(z), 0.070 + k * 0.030)
        z += 0.0345
    piece('Nose gear elastomer pack tube', 'Трубка: центральная ось пакета', 'steel',
          lambda p: ring_tube(p, at((-0.372 + z) / 2), up, 0.0090, 0.0060, z + 0.372, 0, segs=16), 0.10, (0, -0.075, 0))
    piece('Nose gear elastomer pack upper end cap', 'Верхняя торцевая крышка', 'block',
          lambda p: revolve(p, at(z), up, [(0, 0.0060), (0, 0.024), (0.002, 0.030), (0.006, 0.030), (0.006, 0.0060)], 0, segs=32), 0.215)
    piece('Nose gear elastomer pack upper stud', 'Резьбовая шпилька (верхняя)', 'steel',
          lambda p: cyl(p, at(z - 0.020), at(-0.148), 0.0055, 0, segs=10), 0.22, (0, -0.060, 0))
    piece('Nose gear elastomer pack washer', 'Шайба', 'steel',
          lambda p: ring_tube(p, at(z + 0.0075), up, 0.014, 0.0058, 0.003, 0, segs=20), 0.235)

    def rod_end(p):
        cyl(p, at(z + 0.009), at(-0.140), 0.0075, 0, segs=14)
        ring_tube(p, at(-0.128), X, 0.014, 0.006, 0.012, 0, segs=24)
    piece('Nose gear elastomer pack rod end', 'Ушковый наконечник: верх пакета — к кронштейну на мотораме', 'steel', rod_end, 0.26)

    g = P('Nose gear elastomer pack attachment (engine mount lug)',
          'Крепление верхней проушины упругого пакета к кронштейну на нижней поперечине моторамы', 'steel', 'AMM 32-20')
    eye = at(-0.128)
    lug_a = LUG + V((0, -0.004, -0.008))
    d = eye - lug_a
    for dx in (-0.0105, 0.0105):
        box(g, (lug_a + eye) / 2 + V((dx, 0, 0)), (0.005, 0.026, d.length + 0.02), basis(d, up=V((0, 0, 1))), 0, bevel=0.001)
    cyl(g, eye - V((0.016, 0, 0)), eye + V((0.016, 0, 0)), 0.005, 0, segs=10)
    hexa(g, eye + V((0.016, 0, 0)), eye + V((0.022, 0, 0)), 0.012, 0)
    fin(g)

    c = P('Nose wheel fork castor stops', 'Упоры поворота вилки носового колеса: ±30°', 'steel', 'AMM 32-20 рис. 1')
    for a in (math.radians(30), math.radians(-30)):
        dd = V((math.sin(a), -math.cos(a), 0))
        q = PIVOT + dd * 0.040 + V((0, 0, 0.004))
        box(c, q, (0.010, 0.012, 0.014), basis(dd), 0, bevel=0.0015)
    box(c, PIVOT + V((0, 0.028, 0.006)), (0.03, 0.012, 0.012), Matrix.Identity(3), 0, bevel=0.002)
    fin(c)

    # ── колесо носовой опоры (32-40 рис. 1, 7): ось-трубка, болт, распорные втулки, втулки с буртиком в щеках вилки
    def nw(x):
        return V((x, NW.y, NW.z))
    E1n, E2n = V((0, 1, 0)), V((0, 0, 1))
    xa = P('Nose wheel axle', 'Ось колеса носовой опоры: трубка в подшипниках колеса', 'steel', 'AMM 32-40 рис. 6, 7', COL_W)
    ring_tube(xa, nw(0.080), X, 0.0125, 0.0068, 0.176, 0, segs=24)
    fin(xa)
    xb = P('Nose wheel axle bolt', 'Болт оси сквозь щёки вилки и ось колеса, с шайбой', 'bolt', 'AMM 32-40 рис. 6, 7', COL_W)
    cyl(xb, nw(-0.0455), nw(-0.0425), 0.010, 0, segs=16)
    bolt_head(xb, nw(-0.0455), X, 0.0125, 0.253, 0, af=0.019)
    fin(xb)
    xn = P('Nose wheel axle nut and washer', 'Гайка и шайба болта оси колеса', 'bolt', 'AMM 32-40 рис. 6, 7', COL_W)
    nut(xn, nw(0.195), X, 0.0125, 0)
    fin(xn)
    for tag, x0, x1, sgn in (('RH', -0.008, 0.026, -1), ('LH', 0.130, 0.168, 1)):
        sp = P(f'Nose wheel spacer {tag}', 'Распорная втулка между колесом и щекой вилки', 'spacer', 'AMM 32-40 рис. 6, 7', COL_W)
        ring_tube(sp, nw((x0 + x1) / 2), X, 0.0185, 0.0127, x1 - x0, 0, segs=24)
        fin(sp)
        fb = P(f'Nose wheel flanged bush {tag}', 'Втулка с буртиком в щеке вилки — у шасси Tundra (OÄM 40-334)', 'bush',
               'AMM 32-40 рис. 7', COL_W)
        xf = -0.020 if sgn < 0 else 0.180
        revolve(fb, nw(xf), X * sgn, [(0, 0.0128), (0, 0.0175), (0.0025, 0.0175), (0.0025, 0.0155), (0.022, 0.0155), (0.022, 0.0128)], 0, segs=24)
        fin(fb)
        ex(gn, sp.name, (0, 0, -0.08), X * (sgn * 0.035))
        ex(gn, fb.name, (0, 0, -0.08), X * (sgn * 0.11))
    ex(gn, xa.name, (0, 0, -0.08))
    ex(gn, xb.name, (0, 0, -0.08), X * -0.30)
    ex(gn, xn.name, (0, 0, -0.08), X * 0.30)
    for nm in FORK_MSFS:
        ex(gn, nm, (0, 0, -0.08))
    # барабан из двух магниевых половин на трёх болтах, камера, конические подшипники
    halfn = [(0.026, 0.0262), (NW.x, 0.0262), (NW.x, 0.0762), (NW.x - 0.0508, 0.0762), (NW.x - 0.0508, 0.087),
             (NW.x - 0.0578, 0.087), (NW.x - 0.0578, 0.070), (NW.x - 0.040, 0.070), (NW.x - 0.040, 0.036), (0.026, 0.036)]
    Wn = V((0, 0.34, -0.08))                                    # колесо вынимается из вилки назад
    for tag, prof, sgn in (('RH', halfn, -1), ('LH', [(2 * NW.x - t, r) for t, r in halfn][::-1], 1)):
        hh = P(f'Nose wheel hub half {tag}', 'Половина барабана носового колеса (магниевый сплав)' + (', с отверстием под вентиль' if sgn > 0 else ''),
               'hub_mg', 'AMM 32-40 2.B, рис. 1', COL_W)
        revolve(hh, V((0, NW.y, NW.z)), X, prof, 0, segs=44)
        fin(hh)
        ex(gn, hh.name, Wn, X * (sgn * (0.09 if sgn < 0 else 0.26)))
        br = P(f'Nose wheel bearing {tag}', 'Конический подшипник носового колеса', 'bearing', 'AMM 32-40 2.B, рис. 1', COL_W)
        xb0 = 0.030 if sgn < 0 else 2 * NW.x - 0.030
        revolve(br, nw(xb0), X * -sgn, [(0, 0.0128), (0.016, 0.0128), (0.016, 0.0258), (0.004, 0.0258), (0, 0.022)], 0, segs=28)
        fin(br)
        ex(gn, br.name, Wn, X * (sgn * (0.20 if sgn < 0 else 0.33)))
    nb = P('Nose wheel bolts', 'Болты (3), стягивающие половины барабана носового колеса', 'bolt', 'AMM 32-40 2.B, рис. 1', COL_W)
    nn = P('Nose wheel bolt nuts', 'Гайки болтов барабана носового колеса', 'bolt', 'AMM 32-40 рис. 1', COL_W)
    for k in range(3):
        a = math.radians(90 + 120 * k)
        d = (E1n * math.cos(a) + E2n * math.sin(a)) * 0.050
        bolt_head(nb, nw(NW.x - 0.040) + d, X, 0.006, 0.086, 0, af=0.010)
        nut(nn, nw(NW.x + 0.040) + d, X, 0.006, 0)
    fin(nb)
    fin(nn)
    ex(gn, nb.name, Wn, X * -0.27)
    ex(gn, nn.name, Wn, X * 0.38)
    tn = P('Nose wheel inner tube', 'Камера носового колеса с вентилем', 'tube', 'AMM 32-40 рис. 1', COL_W)
    torus(tn, NW, X, 0.141, 0.058, 0, segs=44, rsegs=12)
    vq = NW + (E1n * math.cos(2.2) + E2n * math.sin(2.2)) * 0.080
    cyl(tn, vq, vq + X * 0.072, 0.004, tn.m(W['valve']), segs=10)
    fin(tn)
    ex(gn, tn.name, Wn, X * 0.17)
    for nm in ('Tundra tyre N', 'Tundra tyre N lettering'):
        ex(gn, nm, Wn)


for side in (1, -1):
    main_gear(side)
nose_gear()

for col in (COL, COL_W):
    dup = [o.name for o in col.all_objects if '.0' in o.name[-4:]]
    assert not dup, dup


def labels_of(col):
    names = {o.name for o in col.all_objects}
    used = {s.material.name for o in col.all_objects if o.type == 'MESH' for s in o.material_slots if s.material}
    return {'labels': {k: v for k, v in lib.LABELS.items() if k in names},
            'materials': {k: v for k, v in lib.MAT_RU.items() if k in used}}


size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump(labels_of(COL), f, ensure_ascii=False, indent=1)
size_w = ref.export(COL_W, OUT_W, R.lift)
with open(os.path.splitext(OUT_W)[0] + '.labels.json', 'w') as f:
    json.dump(labels_of(COL_W), f, ensure_ascii=False, indent=1)


def gltf(v):
    return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]          # Blender (X, Y, Z) → сайт (x, z, −y)


groups = []
for gid, g in EXPLODE.items():
    d = {'id': gid, 'title': g['title'], 'parts': {k: gltf(v) for k, v in g['parts'].items()}}
    if g['near']:
        d['near'], d['far'] = g['near'], g['far']
    groups.append(d)
with open(OUT_X, 'w') as f:
    json.dump({'about': 'Разборка шасси на сайте (figures.js, opts.explode): смещение детали в осях сайта, м. tools/da40/gear.py',
               'groups': groups}, f, ensure_ascii=False, indent=1)
n_g = len([o for o in COL.all_objects if o.type == 'MESH'])
n_w = len([o for o in COL_W.all_objects if o.type == 'MESH'])
print(f'GEAR_OK {OUT} {size / 1e6:.2f} MB, parts {n_g}; wheels addon {size_w / 1e6:.2f} MB, parts {n_w}; '
      f'explode groups {len(groups)}, parts {sum(len(g["parts"]) for g in groups)}')
