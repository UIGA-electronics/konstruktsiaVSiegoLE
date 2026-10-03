"""Тормозная система DA 40 NG — отдельный слой сайта.

    python3 tools/da40/brakes.py [out.glb]

AMM 6.02.15 Rev. 3, 32-40: рис. 2 (схема), 3 (цилиндры и бачки), 5 (тормоз
колеса при OÄM 40-334), 8 (клапан стояночного тормоза); AFM 7.5.
Две независимые системы — левая и правая. Цилиндры второго пилота (с бачками)
и пилота стоят последовательно: выход второго пилота — на вход пилота, выход
пилота — в клапан стояночного тормоза на нижней полке пультовой переборки,
оттуда шланги к суппортам. Снаружи шланг идёт по задней кромке рессоры —
по той же трассе, что у MSFS (Plane.069 / Plane.041, заменены).

Пультовая переборка (control bulkhead) в исходнике не смоделирована; её
место — по деталям управления, которые на ней стоят: передняя качалка
элеронов, коромысло и ролики руля направления (y ≈ −0,31…−0,37, низ ≈ −0,22).
Цилиндр стоит на педальном узле под тормозной площадкой (AMM 27-20 рис. 2):
нижний шарнир — на оси в каретке узла, верхний — в вилке площадки; цилиндры и
шланги MSFS на этом месте вырезаны (replaced.json). От штуцеров шланги идут
короткими выводами над полом вперёд, сквозь переднюю стенку ниши для ног;
дальше их прокладывает route.Router (cabin.setup): за стенкой, под полом и в
тоннеле, не задевая соседние системы и педальные узлы MSFS. Собирается после
вентиляции (air.py пропускает шланги тормозов).
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Matrix, Vector as V  # noqa: E402

import lib  # noqa: E402
import ref  # noqa: E402
from lib import Part, an_end, box, cyl, fillet, hexa, p_clamp, ring_tube, sweep  # noqa: E402
import cabin  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-brakes-raw.glb'

ref.open_source()
R = ref.Ref()
ref.drop_collection('Brakes (hydraulic)')
COL = lib.collection('DA40 Brakes (AMM 32-40)')
TRIM, SYS, RT = cabin.setup(R, 'brakes')


def pedal_parts():
    """Педальные узлы салона MSFS (салазки, каретки, оси, педали): шланги обходят их, а не проходят
    насквозь, как сквозь мягкую отделку."""
    out = []
    for o in bpy.data.collections['DA40 Interior'].all_objects:
        if o.type != 'MESH' or o.name in ref.REPLACED:
            continue
        ws = [o.matrix_world @ V(c) for c in o.bound_box]
        lo = V([min(w[i] for w in ws) for i in range(3)])
        hi = V([max(w[i] for w in ws) for i in range(3)])
        if 0.08 <= abs(lo.x + hi.x) / 2 <= 0.48 and hi.x - lo.x < 0.4 and lo.y >= -1.12 and hi.y <= -0.75 and lo.z >= -0.14 and hi.z <= 0.30:
            out.append(o)
    return out


RT.solids = list(RT.solids) + [ref._bvh(pedal_parts())]

M = dict(
    mc=lib.mat('DA40 brake master cylinder (black anodised)', (0.07, 0.07, 0.08), 0.6, 0.4, ru='алюминиевый сплав, чёрное анодирование'),
    alu=lib.mat('DA40 aluminium', (0.80, 0.81, 0.83), 1.0, 0.32, ru='алюминиевый сплав'),
    steel=lib.mat('DA40 stainless steel', (0.62, 0.63, 0.65), 1.0, 0.28, ru='нержавеющая сталь'),
    hose=lib.mat('DA40 brake hose (black)', (0.03, 0.03, 0.035), 0.0, 0.6, ru='тормозной шланг высокого давления'),
    an=lib.mat('DA40 AN fitting black anodised', (0.06, 0.06, 0.07), 0.8, 0.35, ru='штуцер AN, чёрное анодирование'),
    res=lib.mat('DA40 brake reservoir (translucent)', (0.90, 0.88, 0.80), 0.0, 0.2, alpha=0.55, ru='полупрозрачный бачок'),
    fluid=lib.mat('DA40 brake fluid MIL-H-5606 (red)', (0.72, 0.05, 0.05), 0.0, 0.1, alpha=0.8, ru='гидрожидкость MIL-PRF-5606, красная'),
    black=lib.mat('DA40 black anodised', (0.05, 0.05, 0.06), 0.6, 0.4, ru='алюминий, чёрное анодирование'),
    rubber=lib.mat('DA40 rubber', (0.05, 0.05, 0.05), 0.0, 0.9, ru='резина'),
    cable=lib.mat('DA40 Bowden cable sheath', (0.12, 0.12, 0.13), 0.1, 0.5, ru='оболочка боуденовского троса'),
    red=lib.mat('DA40 red marking', (0.78, 0.06, 0.05), 0.0, 0.4, ru='красная краска'),
)

# педали (MSFS HANDLING_RudderPedals): у пилота левая педаль снаружи, у второго пилота — внутри;
# x — по вилке тормозной площадки педали MSFS
PEDALS = {('pilot', 'L'): 0.305, ('pilot', 'R'): 0.2115, ('copilot', 'L'): -0.2105, ('copilot', 'R'): -0.3045}
# AMM 27-20 рис. 2: цилиндр стоит на педальном узле под тормозной площадкой, почти вертикально:
# нижний шарнир — на оси в каретке узла, верхний — в вилке под площадкой (оси узла MSFS:
# нижняя y −0,9525 z −0,081, вилка y −0,9375 z 0,1115). Цилиндры MSFS на этом месте
# вырезаны (replaced.json) — иначе их было бы по два на педаль.
MC_BOTTOM = (-0.9525, -0.081)              # нижний шарнир цилиндра (y, z)
MC_TOP = (-0.9375, 0.1115)                  # верхний шарнир в вилке тормозной площадки
VALVE = V((0.18, -0.325, -0.170))           # на нижней полке пультовой переборки, со стороны пилота (рис. 8)
PB_HANDLE = V((0.015, -0.68, 0.22))         # рычаг PARKING BRAKE в кабине (MSFS LANDING_GEAR_Switch_ParkingBrake)
SPRING_LINE = [V((0.85, 0.33, -0.182)), V((1.041, 0.317, -0.33)), V((1.166, 0.313, -0.416)),
               V((1.239, 0.311, -0.469)), V((1.327, 0.31, -0.528)), V((1.371, 0.306, -0.562)), V((1.39, 0.33, -0.60))]
SIDE_RU = {'L': 'левого', 'R': 'правого'}
WHO_RU = {'pilot': 'пилота', 'copilot': 'второго пилота'}


def P(name, ru, m, doc='AMM 32-40'):
    return Part(name, ru, M[m], COL, True, doc)


def hose(name, ru, pts, bend=0.03, clamps=(), r=0.0045, doc='AMM 32-40 рис. 2'):
    p = P(name, ru, 'hose', doc)
    path = fillet(pts, bend)
    Pp, T = sweep(p, path, r, 0, segs=12)
    for q, t in ((Pp[0], -T[0]), (Pp[-1], T[-1])):
        an_end(p, q, t, r, p.m(M['an']), p.m(M['alu']))
    for f, tab in clamps:
        q, t = lib.along(path, f * lib.path_len(path))
        p_clamp(p, q, t, r, tab, p.m(M['steel']), p.m(M['rubber']))
    p.done()
    return path


ASSY_X = {'pilot': 0.2575, 'copilot': -0.258}   # середина педального узла MSFS (верхняя салазка)
NICHE_Y = -1.135                               # за передней стенкой ниши для ног (стенка — y −1,10…−1,12)


def master_cylinder(who, side):
    x = PEDALS[(who, side)]
    off = 1 if x > ASSY_X[who] else -1         # штуцеры и выводы шлангов — в сторону от середины узла
    bot, top = V((x, *MC_BOTTOM)), V((x, *MC_TOP))
    ax = (top - bot).normalized()
    a, b = bot + ax * 0.012, bot + ax * 0.100          # корпус 88 мм, остальное — шток
    p = P(f'Brake master cylinder {who} {side}',
          f'Главный тормозной цилиндр {SIDE_RU[side]} тормоза на педальном узле {WHO_RU[who]}, под тормозной площадкой педали: давит жидкость, когда нажимают на верх педали',
          'mc', 'AMM 32-40 2.C, рис. 3')
    cyl(p, a, b, 0.0135, 0, segs=20)
    for q in (a, b):
        ring_tube(p, q, ax, 0.0155, 0.0135, 0.006, 0, segs=20)
    cyl(p, b, top, 0.0045, p.m(M['steel']), segs=12)
    cyl(p, b + ax * 0.004, b + ax * 0.03, 0.009, p.m(M['rubber']), segs=12)        # пыльник
    for q in (bot, top):
        cyl(p, q + V((0.009, 0, 0)), q - V((0.009, 0, 0)), 0.0055, p.m(M['steel']), segs=12)  # шарниры
        box(p, q, (0.004, 0.016, 0.016), lib.basis(ax), p.m(M['steel']))
    # штуцеры: вход сверху, выход снизу, оба вперёд, сдвинуты от середины узла — шланги идут
    # над полом вперёд и сквозь переднюю стенку ниши
    inlet = b - ax * 0.018 + V((off * 0.0075, -0.016, 0))
    outlet = a + ax * 0.02 + V((off * 0.0075, -0.016, 0))
    for q in (inlet, outlet):
        cyl(p, q + V((0, 0.004, 0)), q - V((0, 0.006, 0)), 0.005, p.m(M['black']), segs=10)
    p.done()
    tin, tout = inlet - V((0, 0.006, 0)), outlet - V((0, 0.006, 0))
    xi, xo = x + off * 0.024, x + off * 0.0075
    lead_in = [tin, tin - V((0, 0.018, 0)), V((xi, tin.y - 0.045, -0.062)), V((xi, NICHE_Y, -0.062))]
    lead_out = [tout, tout - V((0, 0.018, 0)), V((xo, tout.y - 0.055, -0.082)), V((xo, NICHE_Y, -0.082))]
    return {'in': tin, 'out': tout, 'lead_in': lead_in, 'lead_out': lead_out, 'off': off}


def reservoir(side, end):
    # AMM 32-40 2.C, рис. 3: бачок крепится к главному цилиндру на педали второго пилота; здесь — перед
    # верхом цилиндра, над входным штуцером: под тормозной площадкой места нет
    x = PEDALS[('copilot', side)]
    inlet = end['in']
    c = V((x + end['off'] * 0.006, inlet.y - 0.026, 0.047))
    p = P(f'Brake fluid reservoir {side}', f'Бачок тормозной жидкости {SIDE_RU[side]} системы на главном цилиндре педали второго пилота: уровень между 12 и 25 мм от верха',
          'res', 'AMM 32-40 2.C, рис. 2–3')
    cyl(p, c - V((0, 0, 0.024)), c + V((0, 0, 0.024)), 0.012, 0, segs=24)
    cyl(p, c + V((0, 0, 0.024)), c + V((0, 0, 0.029)), 0.009, p.m(M['black']), segs=20)
    hexa(p, c + V((0, 0, 0.029)), c + V((0, 0, 0.033)), 0.008, p.m(M['black']))
    box(p, V((x, (c.y + inlet.y) / 2 + 0.012, c.z + 0.012)), (0.010, abs(c.y - inlet.y) + 0.002, 0.012), Matrix.Identity(3), p.m(M['black']))   # кронштейн на цилиндре
    p.done()
    f = P(f'Brake fluid in reservoir {side}', 'Тормозная жидкость в бачке', 'fluid', 'AMM 32-40')
    cyl(f, c - V((0, 0, 0.022)), c + V((0, 0, 0.008)), 0.0108, 0, segs=24)
    f.done()
    a = c - V((0, 0, 0.026))
    pts = [a, a - V((0, 0, 0.010)), inlet - V((0, 0.012, -0.010)), inlet - V((0, 0.004, 0)), inlet]
    path = hose(f'Reservoir {side} to co-pilot master cylinder', 'Питание цилиндра второго пилота из бачка на этом же цилиндре', pts, 0.006, r=0.003)
    CHECKS.append((f'Reservoir {side} to co-pilot master cylinder', path, 0.003))
    RT.set_extra(ref._bvh([o for o in COL.all_objects if o.type == 'MESH']))


def parking_valve():
    p = P('Parking brake valve', 'Клапан стояночного тормоза на нижней полке пультовой переборки: два клапана запирают давление в суппортах; держит больше суток',
          'alu', 'AMM 32-40 2.C, рис. 8')
    box(p, VALVE, (0.07, 0.045, 0.034), Matrix.Identity(3), 0, bevel=0.003)
    # болт сверху вниз сквозь клапан и полку, снизу большая шайба и гайка
    hexa(p, VALVE + V((0, 0, 0.017)), VALVE + V((0, 0, 0.024)), 0.014, p.m(M['steel']))
    cyl(p, VALVE + V((0, 0, -0.017)), VALVE + V((0, 0, -0.034)), 0.004, p.m(M['steel']), segs=10)
    cyl(p, VALVE + V((0, 0, -0.023)), VALVE + V((0, 0, -0.025)), 0.013, p.m(M['steel']), segs=20)
    hexa(p, VALVE + V((0, 0, -0.025)), VALVE + V((0, 0, -0.031)), 0.012, p.m(M['steel']))
    ports = {}
    for side, sx in (('L', 0.022), ('R', -0.022)):
        for kind, dy in (('in', -1), ('out', 1)):
            q = VALVE + V((sx, dy * 0.0225, 0.0))
            d = V((0, dy, 0))
            cyl(p, q, q + d * 0.012, 0.006, p.m(M['alu']), segs=12)
            hexa(p, q + d * 0.008, q + d * 0.016, 0.014, p.m(M['an']))
            ports[(side, kind)] = (q + d * 0.016, d)
    # рычаг клапана на внутренней стороне, к нему трос спереди
    lever = VALVE + V((-0.039, 0, 0.004))
    box(p, lever, (0.004, 0.014, 0.05), Matrix.Identity(3), p.m(M['steel']), bevel=0.001)
    p.done()
    f = P('Control bulkhead bottom flange (valve mount)', 'Нижняя полка пультовой переборки под клапаном стояночного тормоза', 'black', 'AMM 32-40 рис. 8')
    box(f, VALVE + V((0, 0.0, -0.020)), (0.11, 0.07, 0.005), Matrix.Identity(3), 0, bevel=0.001)
    f.done()
    tip = lever + V((0, -0.012, 0.018))
    a = PB_HANDLE + V((0, 0, -0.03))
    pts = [PB_HANDLE] + route(a, (0, 0, -1), tip + V((0, -0.02, 0)), (0, 1, 0), 0.004,
                              (-0.10, -0.75, -0.23), (0.25, -0.28, 0.25), relax=[(PB_HANDLE, 0.05)]) + [tip]
    c = P('Parking brake Bowden cable', 'Боуденовский трос от рукоятки PARKING BRAKE к рычагу клапана; регулировочный наконечник', 'cable', 'AMM 32-40 рис. 8')
    path = fillet(pts, 0.03)
    sweep(c, path, 0.0028, 0, segs=8)
    hexa(c, tip + V((0, -0.02, 0)), tip + V((0, -0.035, 0)), 0.008, c.m(M['steel']))
    c.done()
    CHECKS.append(('Parking brake Bowden cable', path, 0.0028))
    return ports


def route(a, da, b, db, r, lo, hi, stub=0.02, relax=(), hidden=True):
    """Трасса планировщика между двумя штуцерами; если скрытой нет — хотя бы без пересечений."""
    a, b, da, db = V(a), V(b), V(da).normalized(), V(db).normalized()
    a0, b0 = a + da * stub, b - db * stub
    for hid in ((True, False) if hidden else (False,)):
        mid = RT.route(a0, b0, r, lo, hi, hidden=hid, relax=relax)
        if mid:
            if not hid:
                print(f'ROUTE visible {tuple(round(v, 3) for v in a)} → {tuple(round(v, 3) for v in b)}')
            return [a] + mid + [b]
    raise SystemExit(f'нет трассы {tuple(round(v, 3) for v in a)} → {tuple(round(v, 3) for v in b)}')


CHECKS = []


def build():
    ends = {}
    for who in ('copilot', 'pilot'):
        for side in 'LR':
            ends[(who, side)] = master_cylinder(who, side)
    for side in 'LR':
        reservoir(side, ends[('copilot', side)])
    ports = parking_valve()
    for side in 'LR':
        # второй пилот → пилот: за передней стенкой ниши поперёк кабины
        c_lead = ends[('copilot', side)]['lead_out']
        p_lead = ends[('pilot', side)]['lead_in']
        mid = route(c_lead[-1], (0, -1, 0), p_lead[-1], (0, 1, 0), 0.0045, (-0.45, -1.33, -0.23), (0.45, -1.00, 0.25),
                    relax=[(c_lead[-1], 0.03), (p_lead[-1], 0.03)])
        pts = c_lead[:-1] + mid + list(reversed(p_lead))[1:]
        path = hose(f'Brake hose {side} co-pilot to pilot master cylinder',
                    f'Шланг {SIDE_RU[side]} системы: выход цилиндра второго пилота — вход цилиндра пилота',
                    pts, 0.02, doc='AMM 32-40 2.C, рис. 2–3')
        CHECKS.append((f'Brake hose {side} co-pilot to pilot master cylinder', path, 0.0045))
        RT.set_extra(ref._bvh([o for o in COL.all_objects if o.type == 'MESH']))
        # пилот → клапан на пультовой переборке: за стенкой ниши вниз и под полом назад
        p_lead = ends[('pilot', side)]['lead_out']
        v_in, dv = ports[(side, 'in')]
        pts = p_lead[:-1] + route(p_lead[-1], (0, -1, 0), v_in, -dv, 0.0045, (-0.10, -1.20, -0.23), (0.45, -0.28, 0.0),
                                  relax=[(p_lead[-1], 0.03)])
        path = hose(f'Brake hose {side} pilot master cylinder to parking valve',
                    f'Шланг {SIDE_RU[side]} системы: выход цилиндра пилота — клапан стояночного тормоза на пультовой переборке',
                    pts, 0.02, doc='AMM 32-40 2.C, рис. 8')
        CHECKS.append((f'Brake hose {side} pilot master cylinder to parking valve', path, 0.0045))
        # клапан → суппорт: под полом к выходу рессоры из фюзеляжа, дальше по задней кромке рессоры
        s = 1 if side == 'L' else -1
        v_out, dvo = ports[(side, 'out')]
        line = [V((s * q.x, q.y, q.z)) for q in SPRING_LINE]
        exit_ = V((s * 0.80, 0.33, -0.168))           # над рессорой у уплотнительной панели (gear.py)
        lo, hi = (-0.82, -0.35, -0.23), (0.82, 0.36, 0.0)
        inside = route(v_out, dvo, exit_, (s, 0, 0), 0.0045, lo, hi)
        pts = inside + line
        L_in = lib.path_len(inside)
        L = lib.path_len(pts)
        clamps = [((L_in + k * (L - L_in) / 7) / L, V((0, -1, 0))) for k in range(1, 7)]
        path = hose(f'Brake hose {side} parking valve to caliper',
                    f'Шланг {SIDE_RU[side]} тормоза: клапан — под полом — по задней кромке рессоры к суппорту {SIDE_RU[side]} колеса',
                    pts, 0.05, clamps=clamps, doc='AMM 32-40 рис. 2, 32-10')
        CHECKS.append((f'Brake hose {side} parking valve to caliper (inside)', fillet(inside, 0.05), 0.0045))
        # переходник в суппорт и штуцер прокачки
        end = line[-1]
        p = P(f'Brake caliper {side} inlet fitting and bleeder', f'Штуцер суппорта {SIDE_RU[side]} колеса и клапан прокачки', 'steel', 'AMM 32-40 рис. 5')
        hexa(p, end, end - V((0, 0, 0.012)), 0.012, 0)
        cyl(p, V((s * 1.395, 0.36, -0.715)), V((s * 1.395, 0.36, -0.735)), 0.003, 0, segs=10)
        hexa(p, V((s * 1.395, 0.36, -0.712)), V((s * 1.395, 0.36, -0.720)), 0.009, 0)
        p.done()
        RT.set_extra(ref._bvh([o for o in COL.all_objects if o.type == 'MESH']))


def check():
    for name, path, r in CHECKS:
        L = lib.path_len(path)
        n = max(8, int(L / 0.02))
        vis, worst = [], (9.0, None)
        for k in range(n + 1):
            q, _ = lib.along(path, L * k / n)
            if RT.seen(q, r):
                vis.append(round(L * k / n, 2))
            for tag, bvh in (('shell', R.shell), ('trim', TRIM), ('sys', SYS)):
                h = bvh.find_nearest(q, 0.5)
                if h[0] is not None and h[3] - r < worst[0]:
                    worst = (h[3] - r, (tag, tuple(round(v, 3) for v in q)))
        print(f'CHECK {name}: {len(vis)}/{n + 1} visible {vis[:5]}; min gap {worst[0] * 1000:.1f} mm {worst[1]}')


build()
if os.environ.get('CHECK'):
    check()
dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'BRAKES_OK {OUT} {size / 1e6:.2f} MB, parts {len(COL.all_objects) - 1}')
