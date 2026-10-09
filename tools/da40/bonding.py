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
import stub  # noqa: E402
import lib  # noqa: E402
import ref  # noqa: E402
from lib import Part, basis, cyl, fillet, hexa, ring_tube, sweep  # noqa: E402
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
        if not pts and hidden:
            pts = RT.route(V(a), V(b), r, lo, hi, hidden=False, relax=relax, max_nodes=1500000)
            if pts:
                print(f'ROUTE visible {tuple(round(v, 3) for v in a)} → {tuple(round(v, 3) for v in b)}')
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


TUBES = []                       # осевые линии труб молниеотвода — к ним идут перемычки


def tube(name, ru, pts, r=TUBE_R, bend=0.06, doc='AMM 51-80 рис. 1', clamps=0.35):
    p = P(name, ru, 'tube', doc)
    path = fillet(pts, bend)
    TUBES.append((name, path))
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
    """Опорные точки трубы от внутренней замыкающей нервюры центроплана до концевой нервюры крыла:
    сквозь нервюры центроплана и корневую — в своих втулках (stub.py, над головкой переднего главного
    болта), дальше в носке крыла по жгуту огней (как electrical.wing_run). Первые 7 точек — проходы."""
    pts = stub.run('bonding', s) + [V((s * 1.30, -0.006, -0.035))]
    for x in [1.6 + 0.4 * k for k in range(10)]:
        if x > 5.35:
            break
        lo, hi = R.wing_section(s * x, -0.005)
        if lo is None or hi is None:
            continue
        z = (lo + hi) / 2 + 0.01
        pts.append(V((s * x, -0.005, z)))
    return pts


# ── Опорные точки ──────────────────────────────────────────────────────────

J = V((0.20, 0.22, -0.23))                   # узел ветвей под полом кабины, под креслом пилота, между главными шпангоутами
# сквозь стенки главных шпангоутов центроплана — через отверстия (x, z прохода; стенки по y — structure.FRONT_MB / REAR_MB)
FRONT_MB, REAR_MB = (0.012, 0.118), (0.472, 0.578)


def mb_holes(mb, x, z):
    return tuple((V((x, y, z)), 0.02) for y in (mb[0] + 0.003, mb[1] - 0.003))
FW_IN = V((0.30, -1.13, -0.13))              # начало продольной трубы под полом за перегородкой, слева от «шляпы» и от кабеля стартера (x 0,20…0,24)
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
             wp[6:], bend=0.03, doc='AMM 51-80 2., рис. 1', clamps=0.6)
        # от корневой нервюры (крыло съёмное — здесь труба крыла стыкуется с трубой центроплана) сквозь
        # нервюры центроплана во втулках, за внутренней замыкающей нервюрой вниз — дальше планировщиком
        P1 = V((s * 0.70, -0.045, -0.135))         # сразу за внутренней замыкающей нервюрой наплыва
        manual = list(reversed(wp[:7])) + [P1]
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
    # перед передним шпангоутом — над поперечным воздуховодом пассажиров (y −0,105, верх z −0,181) и под
    # нижним краем подступёнка кресла (y −0,03, z −0,145), между энергопоглощающими элементами кресла пилота:
    # здесь полоса шириной в сантиметр, сетке планировщика её не найти — точки заданы
    A, B, C = V((0.30, -0.20, -0.158)), V((0.30, -0.05, -0.162)), V((0.30, 0.03, -0.18))
    pts = route(FW_IN, A, TUBE_R, (0.0, -1.20, -0.27), (0.55, -0.12, 0.0)) + [B] + \
        route(C, J + V((0, -0.022, 0)), TUBE_R, (0.0, -0.10, -0.27), (0.55, 0.30, 0.0), relax=mb_holes(FRONT_MB, 0.30, -0.18))
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


# ── Перемычки металлизации (AMM 51-80 рис. 1 и таблица измерений, п. 2.A) ──────────────
# Каждая — плетёнка от точки агрегата, ближайшей к проводнику, до самого проводника: трубы
# молниеотвода в фюзеляже или моторама (продольная ветвь начинается от блока двигателя через мотораму).

def _mesh_pts(o):
    mw = o.matrix_world
    return [mw @ v.co for v in o.data.vertices]


def _tube_pts(step=0.01):
    out = []
    for _, path in TUBES:
        L = lib.path_len(path)
        for k in range(int(L / step) + 1):
            out.append(lib.along(path, k * step)[0])
    return out


def _clear(a, b, end=0.03):
    """Перемычка не проходит сквозь соседние детали, обшивку и отделку (кроме концов)."""
    L = (b - a).length
    n = max(2, int(L / 0.006))
    for k in range(n + 1):
        q = a.lerp(b, k / n)
        if min((q - a).length, (q - b).length) < end:
            continue
        if RT.free(q) < 0.0025:
            return False
    return True


def _blocked(a, b, end=0.03):
    L = (b - a).length
    n = max(2, int(L / 0.006))
    return sum(1 for k in range(n + 1) if min((a.lerp(b, k / n) - a).length, (a.lerp(b, k / n) - b).length) >= end
               and RT.free(a.lerp(b, k / n)) < 0.0025)


def _nearest(src, dst):
    """Ближайшая пара «точка детали — точка проводника», у которой путь свободен."""
    cand = []
    for a in src[::max(1, len(src) // 400)]:
        b = min(dst, key=lambda q: (a - q).length)
        cand.append(((a - b).length, a, b))
    cand.sort(key=lambda c: c[0])
    for d, a, b in cand:
        if _clear(a, b):
            return d, a, b
    # свободного пути нет: пара, у которой перемычка меньше всего проходит сквозь детали
    best = min(cand[:120], key=lambda c: (_blocked(c[1], c[2]), c[0]), default=None)
    if best is None:
        return 9.0, None, None
    print(f'JUMPER свободного пути нет — наименее занятый путь: {_blocked(best[1], best[2])} точек')
    return best


def jumpers():
    targets = layer_objs(['air', 'oil', 'cooling', 'induction', 'gear', 'radio', 'fuel', 'engine'])
    import re
    byname = {re.sub(r'\.\d{3}$', '', o.name): o for o in targets if o.type == 'MESH'}   # имена могут совпасть с исходником
    src = {o.name: o for c in bpy.data.collections['DA40 Systems'].children if c.name in cabin.SOURCE_SYSTEMS
           for o in c.all_objects if o.type == 'MESH'}
    frame = _mesh_pts(byname['Engine mounting frame'])
    tubes = _tube_pts()
    jobs = [
        # моторный отсек — к мотораме (п. 2.A: heating cooler, oil cooler, water cooler, inter cooler — case)
        ('Cabin heat exchanger', frame, 'теплообменника отопления', 'heating cooler'),
        ('Engine oil cooler', frame, 'маслоохладителя', 'oil cooler'),
        ('Coolant radiator', frame, 'радиатора охлаждающей жидкости', 'water cooler'),
        ('Intercooler', frame, 'интеркулера', 'inter cooler'),
        # фюзеляж — к трубам
        ('Main gear leaf spring inboard part LH', tubes, 'левой рессоры основной опоры', 'main LDG gear LH'),
        ('Main gear leaf spring inboard part RH', tubes, 'правой рессоры основной опоры', 'main LDG gear RH'),
        ('Electric fuel transfer pump', tubes, 'насоса перекачки топлива', 'fuel transfer pump'),
        ('Transponder antenna', tubes, 'пластины антенны ответчика', 'XPDR antenna'),
        ('DME antenna', tubes, 'пластины антенны DME', 'DME antenna'),
        ('Marker beacon antenna', tubes, 'пластины антенны маркерного приёмника', 'marker antenna'),
        ('ADF antenna AN 3500', tubes, 'антенны АРК', 'ADF antenna'),
        ('COM 2 antenna', tubes, 'пластины нижней антенны COM 2', 'COM #2 antenna'),
        ('Aileron rear bellcrank (rear main bulkhead) (aluminium)', tubes, 'качалки элеронов на заднем главном шпангоуте', 'aileron lever'),
    ]
    for name, dst, ru, amm in jobs:
        o = byname.get(name) or src.get(name)
        if o is None:
            print('JUMPER нет детали', name)
            continue
        d, a, b = _nearest(_mesh_pts(o), dst)
        if a is None:
            continue
        if dst is tubes:
            b = b + (a - b).normalized() * TUBE_R            # на поверхность трубы
        if (a - b).length < 0.012:
            b = a + (b - a).normalized() * 0.012 if (b - a).length > 1e-6 else a + V((0, 0, 0.012))
        print(f'JUMPER {name[:40]}: {(a - b).length * 1000:.0f} mm ({amm})')
        to = 'к мотораме' if dst is frame else 'к трубе молниеотвода'
        p = P(f'Bonding jumper: {amm}', f'Перемычка металлизации из плетёнки от {ru} {to}; сопротивление проверяют '
              'миллиомметром (AMM 51-80 п. 2)', 'braid', 'AMM 51-80 рис. 1, п. 2')
        lib.bonding_strap(p, a, b, 0)
        p.done()
    nose_gear_ground(frame)


def nose_gear_ground(frame):
    """Точка заземления на носовой стойке (рис. 1: Nose Gear Grounding Point): шпилька на левой стороне
    стойки ниже капота — к ней подключают провод заземления (перед заправкой самолёт заземляют, AMM 12-10
    3.A(4)); сама стойка соединена с моторамой перемычкой."""
    leg = bpy.data.objects.get('Cylinder.180')                       # сварная носовая стойка MSFS (gear.py: NG_X)
    if leg is None:
        print('JUMPER нет носовой стойки')
        return
    d, a, b = _nearest(_mesh_pts(leg), frame)
    if a is not None:
        print(f'JUMPER nose gear: {d * 1000:.0f} mm')
        p = P('Bonding jumper: nose gear', 'Перемычка металлизации из плетёнки от носовой стойки к мотораме: через неё '
              'заземляется точка заземления на стойке', 'braid', 'AMM 51-80 рис. 1, п. 2')
        lib.bonding_strap(p, a, b, 0)
        p.done()
    bvh = ref._bvh([leg])
    hit = None
    for z in (-0.40, -0.42, -0.44, -0.38, -0.46):
        h = bvh.ray_cast(V((0.40, -1.58, z)), V((-1, 0, 0)), 0.5)
        if h[0] is not None:
            hit = (h[0], h[1].normalized())
            break
    if hit is None:
        print('JUMPER точка заземления: стойка не найдена')
        return
    q, n = hit
    if n.x < 0:
        n = -n
    p = P('Nose gear grounding point', 'Точка заземления на носовой стойке: шпилька с шаровой головкой слева на стойке, ниже капота; '
          'к ней подключают провод заземления — перед заправкой самолёт заземляют', 'steel', 'AMM 51-80 рис. 1; 12-10 3.A')
    hexa(p, q - n * 0.002, q + n * 0.006, 0.016, 0)                  # приварная бобышка
    cyl(p, q + n * 0.006, q + n * 0.020, 0.0035, 0, segs=12)          # шпилька
    lib.sphere(p, q + n * 0.024, 0.0055, 0, segs=14, rings=8)          # шаровая головка под зажим
    p.done()


def flat(p, pts, w, t, mi, up=(0, 0, 1)):
    """Полоса шириной w и толщиной t по ломаной pts (кусками-брусками)."""
    for a, b in zip(pts, pts[1:]):
        d = b - a
        if d.length < 1e-4:
            continue
        lib.box(p, (a + b) / 2, (w, t, d.length + 0.002), basis(d, up=V(up)), mi)


def stab_strip_z(x, y):
    """Над внутренней поверхностью нижней обшивки стабилизатора (как structure.stab_skin: сверху вниз — верхняя
    обшивка, под ней нижняя; снизу у киля нижней обшивки в модели MSFS нет)."""
    up = R.hit((x, y, 2.5), (0, 0, -1), 1.5)[0]
    lo = R.hit((x, y, up.z - 0.012), (0, 0, -1), 0.2)[0] if up else None
    return (lo.z if lo is not None else 1.24) + 0.005


# стабилизатор и киль (structure.py): передний и задний кронштейны стабилизатора — x ±0,035, y 4,921…4,954 и
# 5,156…5,189, верх z 1,254; кронштейн механизма триммера — y 5,245…5,285, полка z 1,262…1,266; задние коробчатые
# нервюры — x ±0,075; опора руля направления — рама на торце хвостовой части (y ≈ 4,835), окно x ±0,03…0,046;
# нижний кронштейн руля — x ±0,061, y 4,917…4,98, z 0,041…0,11
STRIP_X = -0.058                             # справа: слева на кронштейне стоит механизм триммера
TB_Y0, TB_Y1, TB_TOP = 5.245, 5.285, 1.266
RUDDER_BRACKET = V((-0.040, 4.919, 0.046))   # передний край нижней полки нижнего кронштейна руля
TAIL_END = V((-0.036, 4.815, 0.032))         # конец продольной трубы перед рамой опоры руля
SKID_Y = (4.765, 4.895)                      # площадка под хвостовую пяту на нижней кромке подфюзеляжного гребня (обшивка MSFS)
FIN_STRIP_Y = 4.852                          # полоса в гребне — впереди отверстия для швартовки (y 4,89…4,92)


def tail():
    """Молниезащита оперения (AMM 51-80 2., рис. 1): полоса в стабилизаторе от главного кронштейна к кронштейну
    механизма триммера и разряднику у кронштейна руля высоты; продольная труба — до опоры руля направления,
    перемычка к нижнему кронштейну руля; алюминиевая полоса на нижней кромке хвостовой пяты (подфюзеляжного
    гребня) с полосой внутри гребня и перемычкой к трубе."""
    vt = next(path for name, path in TUBES if name.startswith('Lightning conductor vertical tube'))
    top = vt[-1]
    p = P('Bonding jumper: horizontal stabilizer main bracket', 'Перемычка из плетёнки: верх вертикальной трубы молниеотвода в '
          'киле — главный (передний) кронштейн стабилизатора, сквозь полку швеллера передней стенки киля', 'braid', 'AMM 51-80 рис. 1')
    lib.bonding_strap(p, top + V((0, 0, TUBE_R)), V((0.0, 4.937, 1.205)), 0)
    p.done()
    # полоса в стабилизаторе: с верхней полки главного кронштейна, по нижней обшивке рядом с задней коробчатой
    # нервюрой (между ними — вырез под кронштейн и балансир руля высоты), под задним лонжероном — к полке
    # кронштейна механизма триммера
    pts = [V((-0.030, 4.946, 1.255)), V((STRIP_X, 4.962, stab_strip_z(STRIP_X, 4.962)))]
    y = 4.98
    while y < 5.175:                             # до заднего лонжерона; за ним в нижней обшивке вырез — прямо к полке кронштейна
        pts.append(V((STRIP_X, y, stab_strip_z(STRIP_X, y))))
        y += 0.02
    pts += [V((STRIP_X, 5.192, TB_TOP + 0.001)), V((STRIP_X, TB_Y0 + 0.004, TB_TOP + 0.001)), V((STRIP_X, TB_Y1 - 0.004, TB_TOP + 0.001))]
    p = P('Lightning conductor strip (horizontal stabilizer)', 'Полоса молниеотвода, встроенная в стабилизатор: алюминиевая, '
          'по нижней обшивке от главного кронштейна к кронштейну механизма триммера; через разрядник ток уходит на руль высоты',
          'tube', 'AMM 51-80 2., рис. 1')
    flat(p, pts, 0.020, 0.002, 0)
    for q in (pts[0], pts[-1]):
        hexa(p, q + V((0, 0, 0.001)), q + V((0, 0, 0.005)), 0.009, p.m(M['steel']))           # болт к кронштейну
    p.done()
    p = P('Horizontal stabilizer lightning electrode', 'Разрядник стабилизатора: алюминиевое остриё на задней полке кронштейна '
          'механизма триммера, направлено к кронштейну руля высоты — через этот промежуток ток молнии переходит на руль',
          'block', 'AMM 51-80 рис. 1')
    a = V((STRIP_X, TB_Y1 - 0.006, TB_TOP + 0.003))
    lib.box(p, a, (0.012, 0.012, 0.003), None, 0, bevel=0.0005)
    cyl(p, a + V((0, 0.006, 0.001)), a + V((0.002, 0.016, 0.006)), 0.0025, 0, r1=0.0004, segs=10)
    p.done()
    # продольная труба — дальше назад, к раме опоры руля направления; перемычка сквозь окно рамы к кронштейну руля
    pts = route(FIN_BASE, TAIL_END, TUBE_R, (-0.08, 4.55, -0.03), (0.08, 4.83, 0.14), step=0.008, hidden=False)
    tube('Lightning conductor tube (fin base → rudder pedestal)', 'Продольная ветвь молниеотвода от низа киля до опоры руля '
         'направления: отсюда перемычки к нижнему кронштейну руля и к полосе хвостовой пяты', pts, clamps=0.15)
    p = P('Bonding jumper: rudder', 'Перемычка из плетёнки: конец продольной трубы — нижний кронштейн руля направления (сквозь окно '
          'опоры руля); гибкая — руль отклоняется', 'braid', 'AMM 51-80 рис. 1 (Bracket Rudder)')
    a = TAIL_END + V((0, 0.004, TUBE_R * 0.5))
    path = fillet([a, V((-0.037, 4.86, 0.040)), V((-0.040, 4.905, 0.042)), RUDDER_BRACKET], 0.012)
    sweep(p, path, 0.0018, 0, segs=6)
    for q in (path[0], path[-1]):
        cyl(p, q + V((0, 0, 0.001)), q - V((0, 0, 0.001)), 0.004, 0, segs=10)
    p.done()
    # хвостовая пята: алюминиевая полоса по нижней кромке гребня, полоса внутри гребня вверх к его корню
    bar = []
    for k in range(8):
        y = SKID_Y[0] + (SKID_Y[1] - SKID_Y[0]) * k / 7
        h = R.hit((0.0, y, -1.0), (0, 0, 1), 1.0)[0]
        bar.append(V((0.0, y, (h.z if h is not None else -0.186) + 0.0005)))
    p = P('Lightning electrode (tail skid bar)', 'Алюминиевая полоса на нижней кромке хвостовой пяты (подфюзеляжного гребня): '
          'электрод киля, через неё уходит ток молнии; соединена полосой в гребне с трубой молниеотвода', 'block',
          'AMM 51-80 2., рис. 1 (Lightning Electrode Fin)')
    flat(p, bar, 0.010, 0.004, 0)
    for q in (bar[1], bar[4], bar[6]):
        lib.screw(p, q - V((0, 0, 0.002)), (0, 0, -1), 0.005, p.m(M['steel']))
    p.done()
    h = R.hit((0.0, FIN_STRIP_Y, -1.0), (0, 0, 1), 1.0)[0]
    zb = (h.z if h is not None else -0.185) + 0.004
    root = V((0.0, FIN_STRIP_Y, -0.014))
    p = P('Lightning conductor strip (lower fin)', 'Полоса молниеотвода внутри подфюзеляжного гребня: от полосы хвостовой пяты '
          'вверх к корню гребня', 'tube', 'AMM 51-80 рис. 1')
    flat(p, [V((0.0, FIN_STRIP_Y, zb)), root], 0.012, 0.002, 0, up=(0, 1, 0))
    p.done()
    p = P('Bonding jumper: lower fin', 'Перемычка из плетёнки: полоса подфюзеляжного гребня — конец продольной трубы молниеотвода; '
          'гребень съёмный, перемычку отсоединяют при его снятии', 'braid', 'AMM 51-80 рис. 1')
    lib.bonding_strap(p, root, TAIL_END + V((0, 0.006, -TUBE_R)), 0)
    p.done()


build()
tail()
jumpers()
dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'BONDING_OK {OUT} {size / 1e6:.2f} MB, parts {len([o for o in COL.all_objects if o.type == "MESH"])}')
