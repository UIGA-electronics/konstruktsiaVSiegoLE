"""Молниезащита и металлизация DA 40 NG — отдельный слой сайта.

    python3 tools/da40/bonding.py [out.glb]        # PROBE=1 — зазоры в опорных точках

AMM 6.02.15 Rev. 3, 51-80 (рис. 1), 23-60. Основа молниезащиты — алюминиевые
трубы и полосы. Продольная ветвь идёт от блока двигателя через мотораму,
противопожарную перегородку, кабину и хвостовую часть фюзеляжа к оперению и
рулю высоты; поперечная соединяет законцовки крыльев и связана с продольной на
полу кабины под передними креслами. Трубы одновременно служат кабелепроводами:
в крыле по носку перед передним лонжероном (лонжерон отделяет молниеотвод от
бака) в трубе идёт жгут огней. В киле — вертикальная труба к главному
кронштейну стабилизатора. Двигатель, моторама и перегородка соединены
перемычками из плетёнки.

Трассы в фюзеляже — планировщиком по свободному месту (cabin.Router) между
построенными системами, силовым набором, фонарём, дверью, креслами и отделкой; сквозь
раму багажника и шпангоуты 1–3 труба проходит, как кабели, через отверстия. Продольная
ветвь от перегородки идёт под полом слева от профиля-«шляпы» (в его канале путь
закрывают опоры подшипников носовой стойки); узел — у днища между главными
шпангоутами центроплана, где поперёк фюзеляжа ничего не проходит; сквозь стенки
шпангоутов трубы проходят через отверстия.
Труба в крыле — по тем же опорным точкам, что жгут огней (electrical.wing_run),
жгут оказывается внутри.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Matrix, Vector as V  # noqa: E402

import cabin  # noqa: E402
import lib  # noqa: E402
import ref  # noqa: E402
from lib import Part, cyl, fillet, hexa, ring_tube, sweep  # noqa: E402
from route import Router  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-bonding-raw.glb'

ref.open_source()
R = ref.Ref()
COL = lib.collection('DA40 Lightning protection and bonding (AMM 51-80)')
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'replaced.json')) as f:
    GONE = set(json.load(f))

M = dict(
    tube=lib.mat('DA40 lightning conductor tube (aluminium)', (0.78, 0.79, 0.81), 1.0, 0.34, ru='алюминиевая труба молниеотвода'),
    block=lib.mat('DA40 conductor junction block (aluminium)', (0.70, 0.71, 0.74), 1.0, 0.38, ru='алюминиевый сплав'),
    braid=lib.mat('DA40 tinned copper braid', (0.70, 0.71, 0.72), 1.0, 0.45, ru='лужёная медная плетёнка'),
    steel=lib.mat('DA40 stainless steel', (0.62, 0.63, 0.65), 1.0, 0.28, ru='нержавеющая сталь'),
)
TUBE_R = 0.0095                  # труба 19 мм: внутри — жгут огней (r 5 мм)


def P(name, ru, m, doc='AMM 51-80 рис. 1'):
    return Part(name, ru, M[m], COL, True, doc)


# ── Препятствия: построенные системы + силовой набор, фонарь, дверь, кресла ──

def layer_objs(names):
    got = []
    for g in names:
        f = os.path.join(cabin.LAYERS, f'da40-{g}-raw.glb')
        if not os.path.exists(f):
            print('NO LAYER', f)
            continue
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=f)
        new = [o for o in bpy.data.objects if o not in before]
        for o in new:
            if o.parent is None:
                o.location.z -= R.lift
        got += new
    bpy.context.view_layer.update()
    return got


PASS_THROUGH = ('Baggage compartment frame', 'Ring frame', 'Front outer rib')
extra = [o for o in layer_objs(['structure', 'doors', 'equipment'])
         if o.type == 'MESH' and not o.name.startswith(PASS_THROUGH)]
TRIM = cabin.trim_bvh()
SYS = ref._bvh([o for c in bpy.data.collections['DA40 Systems'].children if c.name in cabin.SOURCE_SYSTEMS
                for o in c.all_objects if o.type == 'MESH' and o.name not in GONE] + extra)
# корневая нервюра крыла: труба с жгутом огней проходит сквозь неё, как жгут
BUILT_BVH = cabin.systems_bvh(R, (), GONE, skip={'wing': lambda o: o.name.startswith('Root rib front part')})
# отделка — жёсткое препятствие: труба идёт под полом и в стенках, сквозь панели салона не проходит.
# Кроме плоскости пола MSFS: она проходит сквозь канал профиля-«шляпы» (его верх выше пола); пол
# остаётся экраном видимости
FLOOR = 'Plane.378'
TRIM_SOLID = ref._bvh([o for o in bpy.data.collections['DA40 Interior'].all_objects if o.type == 'MESH' and o.name != FLOOR
                       and not any(m and 'Glass' in m.name for m in o.data.materials)])
RT = Router([R.shell, BUILT_BVH, SYS, TRIM_SOLID], [R.shell, TRIM], cabin.EYES, step=0.015, hull=cabin.hull_bvh(R))
_CACHE_F = os.environ.get('ROUTE_CACHE')
_CACHE = json.load(open(_CACHE_F)) if _CACHE_F and os.path.exists(_CACHE_F) else {}


def route(a, b, r, lo, hi, step=0.015, relax=(), hidden=True, floor=False):
    """floor — пол MSFS тоже препятствие (там, где под ним нет канала «шляпы»)."""
    key = json.dumps([[round(c, 4) for c in v] for v in (a, b, lo, hi)] + [r, step, hidden,
                     [[round(c, 4) for c in q] + [rad] for q, rad in relax]] + ([True] if floor else []))
    if key in _CACHE:                      # ROUTE_CACHE — для отладки: трасса та же, пока не менялось окружение
        return [V(q) for q in _CACHE[key]]
    old = RT.step
    RT.step = step
    if floor:
        RT.set_extra(ref._bvh([o for o in COL.all_objects if o.type == 'MESH'] + [bpy.data.objects[FLOOR]]))
    try:
        pts = RT.route(V(a), V(b), r, lo, hi, hidden=hidden, relax=relax, max_nodes=1500000)
    finally:
        RT.step = old
        if floor:
            RT.set_extra(ref._bvh([o for o in COL.all_objects if o.type == 'MESH']))
    if not pts:
        raise SystemExit(f'нет трассы {tuple(round(v, 3) for v in a)} → {tuple(round(v, 3) for v in b)}')
    print('ROUTE', [tuple(round(c, 3) for c in q) for q in pts])
    if _CACHE_F:
        _CACHE[key] = [list(q) for q in pts]
        with open(_CACHE_F, 'w') as f:
            json.dump(_CACHE, f)
    return pts


def tube(name, ru, pts, r=TUBE_R, bend=0.06, doc='AMM 51-80 рис. 1', clamps=0.35):
    p = P(name, ru, 'tube', doc)
    path = fillet(pts, bend)
    sweep(p, path, r, 0, segs=14)
    L = lib.path_len(path)
    k = 1
    while clamps and k * clamps < L - 0.05:
        q, t = lib.along(path, k * clamps)
        ring_tube(p, q, t, r + 0.0022, r, 0.012, p.m(M['steel']), segs=16)      # хомуты крепления
        k += 1
    p.done()
    RT.set_extra(ref._bvh([o for o in COL.all_objects if o.type == 'MESH']))
    return path


def wing_points(s):
    """Опорные точки жгута огней в носке крыла (как electrical.wing_run), от корня до концевой нервюры."""
    pts = []
    for x in [0.75, 1.0, 1.3] + [1.6 + 0.4 * k for k in range(10)]:
        if x > 5.35:
            break
        lo, hi = R.wing_section(s * x, -0.005)
        if lo is None or hi is None:
            continue
        z = (lo + hi) / 2 + 0.01
        if abs(x - 1.0) < 1e-6:
            z = max(z, -0.03)             # над передним главным болтом, как жгут (electrical.wing_run)
        pts.append(V((s * x, -0.005, z)))
    return pts


# ── Опорные точки ──────────────────────────────────────────────────────────

J = V((0.20, 0.22, -0.23))                   # узел ветвей под полом кабины, под креслом пилота, между главными шпангоутами
# сквозь стенки главных шпангоутов центроплана — через отверстия (x, z прохода; стенки по y — structure.FRONT_MB / REAR_MB)
FRONT_MB, REAR_MB = (0.012, 0.118), (0.472, 0.578)


def mb_holes(mb, x, z):
    return tuple((V((x, y, z)), 0.02) for y in (mb[0] + 0.003, mb[1] - 0.003))
FW_IN = V((0.23, -1.13, -0.11))              # начало продольной трубы под полом за перегородкой, слева от «шляпы»
FW_BOLT = V((0.30, -1.188, -0.095))          # конец болта левой нижней опоры моторамы в кабине (перемычка к трубе)
BAG = V((0.10, 2.20, -0.06))                 # проход сквозь раму багажника у левого борта
FIN_BASE = V((-0.036, 4.596, 0.04))          # низ киля за нижним краем передней стенки: отсюда труба идёт вверх внутри киля
STAB_BRACKET = V((0.0, 4.905, 1.17))         # главный (передний) кронштейн стабилизатора, под передним лонжероном

if os.environ.get('CORRIDOR'):
    for y in (-0.35, -0.30, -0.25, -0.20, -0.15, -0.10, -0.06, -0.03):
        for z in (-0.23, -0.20, -0.17, -0.14, -0.11, -0.08, -0.05):
            fr = [RT.free(V((x / 100, y, z))) * 1000 for x in range(-55, 56, 5)]
            ok = ''.join('#' if f >= 13 else ('+' if f >= 10 else '.') for f in fr)
            print(f'COR y{y:+.2f} z{z:+.2f} {ok}')
    raise SystemExit(0)
if os.environ.get('PROBE'):
    extra_pts = [(f'P{k}', V(tuple(map(float, t.split(','))))) for k, t in enumerate(os.environ.get('PROBE_PTS', '').split(';')) if t]
    for name, q in [('J', J), ('FW_IN', FW_IN), ('BAG', BAG), ('FIN_BASE', FIN_BASE), ('STAB', STAB_BRACKET)] + extra_pts:
        print('PROBE', name, tuple(round(c, 3) for c in q), 'free', round(RT.free(q) * 1000, 1), 'mm',
              'hull', RT.inside(q) if hasattr(RT, 'inside') else '?')
    raise SystemExit(0)


def build():
    # поперечная ветвь: в крыле — по жгуту огней, у корня — к узлу под креслами
    for s in (1, -1):
        tag, gen = ('LH', 'левого') if s > 0 else ('RH', 'правого')
        wp = wing_points(s)
        tube(f'Lightning conductor tube (wing {tag})', f'Труба молниеотвода в носке {gen} крыла перед передним лонжероном: '
             'алюминиевая, от корня до законцовки; внутри — жгут огней. Лонжерон отделяет молниеотвод от топливного бака',
             wp[1:], bend=0.03, doc='AMM 51-80 2., рис. 1', clamps=0.6)
        # сквозь корень крыла (стенка обшивки MSFS закрывает носок) — вдоль жгута огней, дальше — планировщиком
        P1 = V((s * 0.70, -0.045, -0.135))         # сразу за внутренней замыкающей нервюрой наплыва
        manual = [wp[1], wp[0], P1]
        jj = J + V((0.035 if s > 0 else -0.035, 0, 0))
        # сквозь передний главный шпангоут и вдоль днища между шпангоутами — к узлу
        pts = route(P1, jj, TUBE_R, (-0.72, -0.40, -0.27), (0.72, 0.30, 0.10), relax=mb_holes(FRONT_MB, s * 0.40, -0.20))
        pts = manual + pts[1:]
        tube(f'Lightning conductor crossover ({tag} wing → cabin floor)', f'Поперечная ветвь молниеотвода от {gen} крыла сквозь носок '
             'центроплана и передний главный шпангоут к узлу под передними креслами', pts)
    # узел ветвей
    p = P('Lightning conductor junction (cabin floor)', 'Узел молниеотвода на полу кабины под передними креслами: здесь поперечная '
          'ветвь (законцовка — законцовка) соединяется с продольной', 'block')
    lib.box(p, J, (0.07, 0.044, 0.03), Matrix.Identity(3), 0, bevel=0.003)
    for dx in (-0.022, 0.022):
        hexa(p, J + V((dx, 0, 0.015)), J + V((dx, 0, 0.021)), 0.009, p.m(M['steel']))
    p.done()
    # продольная ветвь: перегородка → под полом слева от «шляпы» → сквозь передний главный шпангоут → узел
    # (в канале «шляпы» путь закрывают опорные пластины подшипников носовой стойки)
    pts = route(FW_IN, J + V((0, -0.022, 0)), TUBE_R, (0.0, -1.20, -0.27), (0.55, 0.30, 0.0),
                relax=mb_holes(FRONT_MB, 0.30, -0.20))
    tube('Lightning conductor tube (firewall → cabin floor)', 'Продольная ветвь молниеотвода: от противопожарной перегородки '
         'под полом кабины вдоль центральной консоли, сквозь передний главный шпангоут к узлу под передними креслами', pts)
    # узел → сквозь задний главный шпангоут → рама багажника → хвост → низ киля; здесь канала «шляпы» нет,
    # и пол — препятствие, как остальная отделка
    pts = route(J + V((0, 0.022, 0)), BAG, TUBE_R, (-0.55, 0.15, -0.27), (0.55, 2.30, 0.45), step=0.02,
                relax=mb_holes(REAR_MB, 0.25, -0.18), floor=True)
    pts2 = route(BAG, FIN_BASE, TUBE_R, (-0.30, 2.15, -0.25), (0.30, 4.60, 0.60), step=0.02, hidden=False)
    tube('Lightning conductor tube (cabin → rear fuselage)', 'Продольная ветвь молниеотвода: под полом кабины, сквозь раму '
         'багажника и шпангоуты хвостовой части к килю', pts + pts2[1:])
    # вертикальная труба в киле к главному кронштейну стабилизатора
    pts = route(FIN_BASE, STAB_BRACKET - V((0, 0, 0.02)), TUBE_R, (-0.12, 4.30, 0.0), (0.12, 4.98, 1.25), step=0.012, hidden=False)
    tube('Lightning conductor vertical tube (fin)', 'Вертикальная труба молниеотвода в киле: от хвостовой части к главному '
         'кронштейну стабилизатора; через кронштейн и полосу в стабилизаторе ток уходит на руль высоты', pts, clamps=0.25)
    # перемычка из плетёнки: болт нижней средней опоры моторамы сквозь перегородку — начало продольной трубы
    m = P('Lightning conductor firewall jumper', 'Перемычка из плетёнки: болт левой нижней опоры моторамы (сквозь '
          'противопожарную перегородку) — начало продольной трубы молниеотвода', 'braid')
    lib.bonding_strap(m, FW_BOLT, FW_IN + V((0, 0.006, TUBE_R)), 0)          # наконечник — на конце трубы
    m.done()
    # перемычки моторамы к перегородке (сверху с обеих сторон)
    m = P('Engine mount bonding jumpers', 'Перемычки металлизации из плетёнки: моторама — противопожарная перегородка у верхних '
          'точек крепления', 'braid', 'AMM 51-80 рис. 1')
    for s in (1, -1):
        a = V((s * 0.215, -1.235, 0.29))
        b = V((s * 0.175, -1.215, 0.26))
        lib.bonding_strap(m, a, b, 0)
    m.done()


build()
dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'BONDING_OK {OUT} {size / 1e6:.2f} MB, parts {len([o for o in COL.all_objects if o.type == "MESH"])}')
