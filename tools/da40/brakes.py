"""Тормозная система DA 40 NG — отдельный слой сайта.

    python3 tools/da40/brakes.py [out.glb]

AMM 6.02.15 Rev. 3, 32-40: рис. 2 (схема), 3 (цилиндры и бачки), 5 (тормоз
колеса при ОÄМ 40-334), 8 (клапан стояночного тормоза); AFM 7.5.
Две независимые системы — левая и правая. Цилиндры второго пилота (с бачками)
и пилота стоят последовательно: выход второго пилота — на вход пилота, выход
пилота — в клапан стояночного тормоза на нижней полке пультовой переборки,
оттуда шланги к суппортам. Снаружи шланг идёт по задней кромке рессоры —
по той же трассе, что у MSFS (Plane.069 / Plane.041, заменены).
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
from lib import Part, an_end, basis, box, cyl, fillet, hexa, p_clamp, ring_tube, screw, sweep  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-brakes-raw.glb'

ref.open_source()
R = ref.Ref()
ref.drop_collection('Brakes (hydraulic)')
COL = lib.collection('DA40 Brakes (AMM 32-40)')

M = dict(
    mc=lib.mat('DA40 brake master cylinder (anodised)', (0.72, 0.73, 0.75), 0.9, 0.35, ru='алюминиевый сплав'),
    alu=lib.mat('DA40 aluminium', (0.80, 0.81, 0.83), 1.0, 0.32, ru='алюминиевый сплав'),
    steel=lib.mat('DA40 stainless steel', (0.62, 0.63, 0.65), 1.0, 0.28, ru='нержавеющая сталь'),
    hose=lib.mat('DA40 brake hose (black)', (0.03, 0.03, 0.035), 0.0, 0.6, ru='тормозной шланг высокого давления'),
    an=lib.mat('DA40 AN fitting blue anodised', (0.08, 0.24, 0.72), 0.9, 0.3, ru='штуцер AN, анодированный алюминий'),
    res=lib.mat('DA40 brake reservoir (translucent)', (0.90, 0.88, 0.80), 0.0, 0.2, alpha=0.55, ru='полупрозрачный бачок'),
    fluid=lib.mat('DA40 brake fluid MIL-H-5606 (red)', (0.72, 0.05, 0.05), 0.0, 0.1, alpha=0.8, ru='гидрожидкость MIL-PRF-5606, красная'),
    black=lib.mat('DA40 black anodised', (0.05, 0.05, 0.06), 0.6, 0.4, ru='алюминий, чёрное анодирование'),
    rubber=lib.mat('DA40 rubber', (0.05, 0.05, 0.05), 0.0, 0.9, ru='резина'),
    cable=lib.mat('DA40 Bowden cable sheath', (0.12, 0.12, 0.13), 0.1, 0.5, ru='оболочка боуденовского троса'),
    red=lib.mat('DA40 red marking', (0.78, 0.06, 0.05), 0.0, 0.4, ru='красная краска'),
)

# педали (MSFS HANDLING_RudderPedals): у пилота левая педаль снаружи, у второго пилота — внутри
PEDALS = {('pilot', 'L'): 0.315, ('pilot', 'R'): 0.200, ('copilot', 'L'): -0.205, ('copilot', 'R'): -0.315}
MC_Y, MC_Z0, MC_Z1 = -0.790, -0.135, -0.020
VALVE = V((0.0, -0.685, -0.108))            # нижняя полка пультовой переборки (AMM 32-40 рис. 8)
PB_HANDLE = V((0.015, -0.68, 0.22))         # рычаг PARKING BRAKE в кабине (MSFS LANDING_GEAR_Switch_ParkingBrake)
SPRING_LINE = [V((0.85, 0.323, -0.196)), V((1.041, 0.317, -0.33)), V((1.166, 0.313, -0.416)),
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


def master_cylinder(who, side):
    x = PEDALS[(who, side)]
    a, b = V((x, MC_Y, MC_Z0)), V((x, MC_Y - 0.03, MC_Z1))
    ax = (b - a).normalized()
    p = P(f'Brake master cylinder {who} {side}',
          f'Главный тормозной цилиндр {SIDE_RU[side]} тормоза под педалью {WHO_RU[who]}: давит жидкость, когда нажимают на верх педали',
          'mc', 'AMM 32-40 2.C, рис. 3')
    cyl(p, a, b, 0.0135, 0, segs=20)
    for q in (a, b):
        ring_tube(p, q, ax, 0.0155, 0.0135, 0.006, 0, segs=20)
    rod_top = b + ax * 0.05
    cyl(p, b, rod_top, 0.0045, p.m(M['steel']), segs=12)
    cyl(p, b + ax * 0.004, b + ax * 0.03, 0.009, p.m(M['rubber']), segs=12)        # пыльник
    for q in (a - ax * 0.012, rod_top):
        cyl(p, q + V((0.009, 0, 0)), q - V((0.009, 0, 0)), 0.0055, p.m(M['steel']), segs=12)  # шарниры
        box(p, q, (0.004, 0.016, 0.016), Matrix.Identity(3), p.m(M['steel']))
    # штуцеры: вход сверху сбоку, выход снизу
    inlet = b - ax * 0.018 + V((0, 0.016, 0))
    outlet = a + ax * 0.02 + V((0, 0.016, 0))
    for q in (inlet, outlet):
        cyl(p, q - V((0, 0.004, 0)), q + V((0, 0.006, 0)), 0.005, p.m(M['alu']), segs=10)
    p.done()
    return inlet + V((0, 0.006, 0)), outlet + V((0, 0.006, 0))


def reservoir(side, inlet):
    x = PEDALS[('copilot', side)] - 0.035
    c = V((x, MC_Y + 0.005, -0.035))
    p = P(f'Brake fluid reservoir {side}', f'Бачок тормозной жидкости {SIDE_RU[side]} системы на цилиндре второго пилота: уровень между 12 и 25 мм от верха',
          'res', 'AMM 32-40 2.C, рис. 2–3')
    cyl(p, c - V((0, 0, 0.035)), c + V((0, 0, 0.035)), 0.016, 0, segs=24)
    cyl(p, c + V((0, 0, 0.035)), c + V((0, 0, 0.041)), 0.012, p.m(M['black']), segs=20)
    hexa(p, c + V((0, 0, 0.041)), c + V((0, 0, 0.046)), 0.01, p.m(M['black']))
    p.done()
    f = P(f'Brake fluid in reservoir {side}', 'Тормозная жидкость в бачке', 'fluid', 'AMM 32-40')
    cyl(f, c - V((0, 0, 0.033)), c + V((0, 0, 0.012)), 0.0145, 0, segs=24)
    f.done()
    hose(f'Reservoir {side} to co-pilot master cylinder', 'Питание цилиндра из бачка', [c - V((0, 0, 0.035)), c - V((0, 0, 0.05)),
         inlet + V((-0.02, 0.01, 0)), inlet], 0.015, r=0.0035)


def parking_valve():
    p = P('Parking brake valve', 'Клапан стояночного тормоза на нижней полке пультовой переборки: два клапана запирают давление в суппортах; держит больше суток',
          'alu', 'AMM 32-40 2.C, рис. 8')
    box(p, VALVE, (0.07, 0.045, 0.034), Matrix.Identity(3), 0, bevel=0.003)
    box(p, VALVE + V((0, 0, 0.022)), (0.08, 0.055, 0.006), Matrix.Identity(3), p.m(M['black']), bevel=0.001)   # полка переборки
    hexa(p, VALVE + V((0, 0, 0.026)), VALVE + V((0, 0, 0.034)), 0.016, p.m(M['steel']))
    ports = {}
    for side, sx in (('L', 0.022), ('R', -0.022)):
        for kind, dy in (('in', -1), ('out', 1)):
            q = VALVE + V((sx, dy * 0.0225, 0.0))
            d = V((0, dy, 0))
            cyl(p, q, q + d * 0.012, 0.006, p.m(M['alu']), segs=12)
            hexa(p, q + d * 0.008, q + d * 0.016, 0.014, p.m(M['an']))
            ports[(side, kind)] = (q + d * 0.016, d)
    # рычаг клапана и трос к рукоятке PARKING BRAKE
    lever = VALVE + V((-0.04, 0, 0.0))
    box(p, lever + V((0, 0, -0.01)), (0.004, 0.012, 0.05), Matrix.Identity(3), p.m(M['steel']), bevel=0.001)
    p.done()
    c = P('Parking brake Bowden cable', 'Боуденовский трос от рукоятки PARKING BRAKE к рычагу клапана; регулировочный наконечник', 'cable', 'AMM 32-40 рис. 8')
    path = fillet([lever + V((0, 0, -0.03)), lever + V((-0.02, 0, -0.04)), V((-0.06, -0.66, 0.02)), V((0.0, -0.66, 0.15)), PB_HANDLE], 0.03)
    sweep(c, path, 0.0028, 0, segs=8)
    hexa(c, lever + V((0, 0, -0.03)), lever + V((-0.012, 0, -0.036)), 0.008, c.m(M['steel']))
    c.done()
    return ports


def build():
    ends = {}
    for who in ('copilot', 'pilot'):
        for side in 'LR':
            ends[(who, side)] = master_cylinder(who, side)
    for side in 'LR':
        reservoir(side, ends[('copilot', side)][0])
    ports = parking_valve()
    for side in 'LR':
        c_out = ends[('copilot', side)][1]
        p_in = ends[('pilot', side)][0]
        mid_y = MC_Y + 0.07 if side == 'L' else MC_Y + 0.05
        hose(f'Brake hose {side} co-pilot to pilot master cylinder',
             f'Шланг {SIDE_RU[side]} системы: выход цилиндра второго пилота — вход цилиндра пилота',
             [c_out, c_out + V((0, 0.03, 0)), V((c_out.x, mid_y, -0.155)), V((p_in.x, mid_y, -0.155)), p_in + V((0, 0.04, -0.02)), p_in],
             0.03, doc='AMM 32-40 2.C, рис. 2–3')
        p_out = ends[('pilot', side)][1]
        v_in, dv = ports[(side, 'in')]
        hose(f'Brake hose {side} pilot master cylinder to parking valve',
             f'Шланг {SIDE_RU[side]} системы: выход цилиндра пилота — клапан стояночного тормоза',
             [p_out, p_out + V((0, 0.03, 0)), V((p_out.x * 0.6, -0.74, -0.14)), v_in + dv * 0.04, v_in], 0.03, doc='AMM 32-40 2.C')
        # к рессоре: под полом назад, к выходу рессоры из фюзеляжа, по задней кромке рессоры к суппорту
        s = 1 if side == 'L' else -1
        v_out, dvo = ports[(side, 'out')]
        line = [V((s * q.x, q.y, q.z)) for q in SPRING_LINE]
        pts = [v_out, v_out + dvo * 0.04, V((s * 0.10, -0.40, -0.19)), V((s * 0.20, 0.10, -0.205)),
               V((s * 0.55, 0.30, -0.195)), V((s * 0.78, 0.323, -0.19))] + line
        path = hose(f'Brake hose {side} parking valve to caliper',
                    f'Шланг {SIDE_RU[side]} тормоза: клапан — под полом — по задней кромке рессоры к суппорту {SIDE_RU[side]} колеса',
                    pts, 0.05, clamps=[(f, V((0, -1, 0))) for f in (0.22, 0.4, 0.55, 0.68, 0.78, 0.87, 0.94)],
                    doc='AMM 32-40 рис. 2, 32-10')
        # переходник в суппорт и штуцер прокачки
        end = line[-1]
        p = P(f'Brake caliper {side} inlet fitting and bleeder', f'Штуцер суппорта {SIDE_RU[side]} колеса и клапан прокачки', 'steel', 'AMM 32-40 рис. 5')
        hexa(p, end, end - V((0, 0, 0.012)), 0.012, 0)
        cyl(p, V((s * 1.395, 0.36, -0.715)), V((s * 1.395, 0.36, -0.735)), 0.003, 0, segs=10)
        hexa(p, V((s * 1.395, 0.36, -0.712)), V((s * 1.395, 0.36, -0.720)), 0.009, 0)
        p.done()


build()
dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'BRAKES_OK {OUT} {size / 1e6:.2f} MB, parts {len(COL.all_objects) - 1}')
