"""Вентиляция и отопление кабины DA 40 NG — отдельный слой сайта.

    python3 tools/da40/air.py [out.glb]

AMM 6.02.15 Rev. 3, гл. 21 (21-00-00 рис. 1–3); AFM 7.4.
Точки на обшивке и в кабине сняты с модели MSFS: NACA-заборники пилотов на
бортах у перегородки, пассажирский — под передней кромкой левого центроплана,
сопла — на приборной доске (vent_pilot.003/.005) и в дуге безопасности
(vent_pilot.004/.006).
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
from lib import Part, basis, box, cyl, fillet, hexa, ring_tube, screw, sweep, worm_clamp  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-air-raw.glb'

ref.open_source()
R = ref.Ref()
ref.drop_collection('Cabin ventilation & heating')
COL = lib.collection('DA40 Heating and ventilation (AMM 21)')

M = dict(
    cold=lib.mat('DA40 SCAT duct (grey, cold air)', (0.55, 0.57, 0.60), 0.0, 0.7, ru='гофрированный воздуховод SCAT — наружный воздух'),
    hot=lib.mat('DA40 SCAT air duct (red silicone) [air_warm]', (0.72, 0.16, 0.08), 0.0, 0.7, ru='силиконовый воздуховод SCAT — тёплый воздух'),
    wire=lib.mat('DA40 SCAT helix wire', (0.35, 0.36, 0.38), 0.8, 0.4, ru='проволочная спираль воздуховода'),
    gfrp=lib.mat('DA40 GFRP moulding', (0.83, 0.84, 0.74), 0.0, 0.55, ru='стеклопластик'),
    alu=lib.mat('DA40 aluminium', (0.80, 0.81, 0.83), 1.0, 0.32, ru='алюминиевый сплав'),
    steel=lib.mat('DA40 stainless steel', (0.62, 0.63, 0.65), 1.0, 0.28, ru='нержавеющая сталь'),
    black=lib.mat('DA40 black anodised', (0.05, 0.05, 0.06), 0.6, 0.4, ru='алюминий, чёрное анодирование'),
    plastic=lib.mat('DA40 vent nozzle (black plastic)', (0.06, 0.06, 0.07), 0.0, 0.5, ru='пластик'),
    cable=lib.mat('DA40 Bowden cable sheath', (0.12, 0.12, 0.13), 0.1, 0.5, ru='оболочка боуденовского троса'),
    core=lib.mat('DA40 heat exchanger core (aluminium fins)', (0.62, 0.63, 0.66), 0.9, 0.55, ru='алюминиевые соты теплообменника'),
    coolant=lib.mat('DA40 coolant hose (black rubber)', (0.04, 0.04, 0.045), 0.0, 0.6, ru='шланг охлаждающей жидкости'),
)

PANEL_VENT = {1: V((0.433, -0.656, 0.476)), -1: V((-0.435, -0.651, 0.476))}
ROLLBAR_VENT = {1: V((0.501, 0.266, 0.317)), -1: V((-0.501, 0.266, 0.317))}
PILOT_NACA_Y, PILOT_NACA_Z = -1.0, 0.035
PAX_NACA = V((1.0, -0.20))          # под передней кромкой левого центроплана
INNER_RIB_X, OUTER_RIB_X = 0.745, 1.165
CS_FRONT_SPAR_Y = 0.02


def P(name, ru, m, doc):
    return Part(name, ru, M[m], COL, True, doc)


def scat(name, ru, pts, r, bend, mat, doc, clamp_ends=True):
    """Гофрированный воздуховод: рукав и проволочная спираль (кольцами через 3 см)."""
    p = P(name, ru, mat, doc)
    path = fillet(pts, bend)
    Pp, T = sweep(p, path, r, 0, segs=18)
    L = lib.path_len(path)
    n = int(L / 0.03)
    for k in range(1, n):
        q, t = lib.along(path, L * k / n)
        ring_tube(p, q, t, r + 0.0018, r - 0.001, 0.004, p.m(M['wire']), segs=18)
    if clamp_ends:
        for q, t in ((Pp[0], T[0]), (Pp[-1], T[-1])):
            worm_clamp(p, q + t * (0.012 if q is Pp[0] else -0.012), t, r + 0.002, 0.008, p.m(M['steel']))
    p.done()
    return path


def nozzle(name, ru, c, d, doc, r=0.03):
    """Поворотное сопло: корпус за панелью и шаровая насадка."""
    d = V(d).normalized()
    p = P(name, ru, 'plastic', doc)
    cyl(p, c - d * 0.05, c, r * 0.9, 0, segs=24)
    ring_tube(p, c, d, r * 1.25, r * 0.8, 0.006, 0, segs=24)
    lib.sphere(p, c + d * 0.004, r * 0.75, 0, segs=18, rings=9)
    p.done()
    return c - d * 0.05


def naca_adapter(name, ru, skin, n, flow, doc, w=0.07, L=0.16):
    """Внутренний короб за NACA-заборником: пандус и патрубок под воздуховод."""
    n, flow = V(n).normalized(), V(flow).normalized()
    side = n.cross(flow).normalized()
    inward = -n
    p = P(name, ru, 'gfrp', doc)
    fl = (flow - n * flow.dot(n)).normalized()          # вдоль обшивки
    Rm = Matrix((side, fl, inward)).transposed()
    box(p, skin + inward * 0.018, (w, L, 0.03), Rm, 0, bevel=0.004)
    out = skin + inward * 0.03 + fl * (L * 0.5)
    cyl(p, out - fl * 0.02, out + fl * 0.03, 0.026, 0, segs=24)
    p.done()
    return out + fl * 0.03, fl


def pilots():
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        skin, n = R.hit((0, PILOT_NACA_Y, PILOT_NACA_Z), (s, 0, 0))
        n = n.normalized()
        start, d = naca_adapter(f'Pilot NACA inlet duct {tag}', f'Короб NACA-заборника пилота на {"левом" if s > 0 else "правом"} борту носовой части',
                                skin, n, V((0, 1, 0.25)), 'AMM 21-00 2.B(1)')
        back = nozzle(f'Instrument panel air outlet {tag}', f'Поворотное сопло на приборной доске ({"пилот" if s > 0 else "второй пилот"}): наружный воздух от NACA-заборника',
                      PANEL_VENT[s], V((0, 1, 0)), 'AMM 21-00 2.B(1), AFM 7.4.1')
        pts = [start, start + d * 0.05, V((s * 0.44, -0.86, 0.22)), V((s * 0.435, -0.78, 0.43)), back - V((0, 0.04, 0)), back]
        scat(f'Pilot air duct {tag}', 'Воздуховод от NACA-заборника к соплу на приборной доске', pts, 0.024, 0.06, 'cold', 'AMM 21-00 2.B(1)')


def passengers():
    # короб-коллектор: передний лонжерон центроплана и две замыкающие нервюры левого центроплана
    ribs = {}
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        for xr, kind in ((INNER_RIB_X, 'inner'), (OUTER_RIB_X, 'outer')):
            X = s * xr
            yle = -0.27 if kind == 'outer' else -0.17
            ys = [yle + (CS_FRONT_SPAR_Y - yle) * i / 10 for i in range(11)]
            outline = [V((X, y, R.wing_section(X, y)[0] + 0.008)) for y in ys] + \
                      [V((X, y, (R.wing_section(X, y)[1] or 0.02) - 0.008)) for y in reversed(ys)]
            p = P(f'Stub wing {kind} closing rib {tag}',
                  f'{"Внутренняя" if kind == "inner" else "Наружная"} замыкающая нервюра {"левого" if s > 0 else "правого"} центроплана: '
                  + ('вместе с передним лонжероном образует короб-коллектор воздуха' if s > 0 else 'передний отсек правого центроплана'),
                  'gfrp', 'AMM 21-00 2.B(2)')
            from sections import plate_with_hole
            hole = None
            if kind == 'inner':
                c = V((X, -0.07, -0.08))
                hole = [V((X, c.y + 0.032 * math.cos(a), c.z + 0.032 * math.sin(a))) for a in
                        [2 * math.pi * i / len(outline) - math.pi / 2 for i in range(len(outline))]]
            plate_with_hole(p, outline, hole, (1, 0, 0), 0.004, 0)
            p.done()
            ribs[(s, kind)] = X
    # NACA под передней кромкой левого центроплана
    skin, n = R.skin(PAX_NACA.x, PAX_NACA.y, 'lower')
    n = -n if n.z > 0 else n
    naca_adapter('Passenger NACA inlet duct (LH stub wing)', 'Короб NACA-заборника под передней кромкой левого центроплана: воздух для пассажиров',
                 skin, n, V((0, 1, 0.3)), 'AMM 21-00 2.B(2)')
    # поперечный шланг от передней части внутренней нервюры слева к правой
    a, b = V((INNER_RIB_X - 0.01, -0.07, -0.08)), V((-INNER_RIB_X + 0.01, -0.07, -0.08))
    scat('Passenger air crossover duct', 'Поперечный воздуховод: коллектор левого центроплана — передний отсек правого, под полом перед лонжероном',
         [a, a - V((0.06, 0, 0.03)), V((0.3, -0.10, -0.15)), V((-0.3, -0.10, -0.15)), b + V((0.06, 0, -0.03)), b], 0.024, 0.08,
         'cold', 'AMM 21-00 2.B(2)')
    # боковые каналы в стенке фюзеляжа к дуге безопасности и сопла
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        top = V((s * (INNER_RIB_X - 0.03), -0.05, 0.0))
        back = nozzle(f'Roll bar air outlet {tag}', f'Поворотное сопло в дуге безопасности ({"слева" if s > 0 else "справа"}) — воздух для пассажиров',
                      ROLLBAR_VENT[s], V((-s * 0.3, 1, 0)), 'AMM 21-00 2.B(2), AFM 7.4.1', r=0.024)
        pts = [top, top + V((0, 0, 0.05)), V((s * 0.60, 0.02, 0.12)), V((s * 0.56, 0.18, 0.24)), back - V((0, 0.03, 0)), back]
        scat(f'Fuselage side air duct {tag}', 'Боковой канал в стенке фюзеляжа: от верха внутренней замыкающей нервюры к дуге безопасности',
             pts, 0.022, 0.06, 'cold', 'AMM 21-00 2.B(2)')
    # выход воздуха: прорези в раме багажника, дальше через хвост к щели у руля направления
    p = P('Cabin air exit slots (baggage frame)', 'Прорези в раме багажника: тёплый и холодный воздух уходит через хвост и щель у руля направления',
          'black', 'AMM 21-00 2.C')
    for k in range(5):
        box(p, V((-0.08 + k * 0.04, 2.265, 0.16)), (0.02, 0.004, 0.11), Matrix.Identity(3), 0, bevel=0.002)
    p.done()


def heating():
    hx = V((-0.24, -1.315, 0.02))
    p = P('Cabin heat exchanger', 'Теплообменник отопления на мотораме: через соты идёт горячая охлаждающая жидкость, через них — наружный воздух',
          'core', 'AMM 21-00 2.A, 75-00')
    box(p, hx, (0.16, 0.06, 0.13), Matrix.Identity(3), 0, bevel=0.003)
    for sx in (-1, 1):
        box(p, hx + V((sx * 0.086, 0, 0)), (0.014, 0.066, 0.14), Matrix.Identity(3), p.m(M['alu']), bevel=0.002)
    for dz in (-0.045, 0.045):
        q = hx + V((0.093, 0, dz))
        cyl(p, q, q + V((0.02, 0, 0)), 0.009, p.m(M['alu']), segs=12)
    cyl(p, hx - V((0, 0.03, 0)), hx - V((0, 0.06, 0)), 0.028, p.m(M['alu']), segs=24)
    cyl(p, hx + V((0, 0.03, 0)), hx + V((0, 0.055, 0)), 0.028, p.m(M['alu']), segs=24)
    p.done()
    for dz, name, ru in ((0.045, 'Coolant hose to cabin heat exchanger', 'Горячая охлаждающая жидкость от двигателя к теплообменнику'),
                         (-0.045, 'Coolant hose from cabin heat exchanger', 'Охлаждающая жидкость от теплообменника обратно в двигатель')):
        q = hx + V((0.113, 0, dz))
        c = P(name, ru, 'coolant', 'AMM 21-00 2.A, 75-00')
        sweep(c, fillet([q, q + V((0.03, 0, 0)), V((-0.08, -1.40, dz + 0.05)), V((-0.02, -1.52, dz + 0.08))], 0.03), 0.009, 0, segs=12)
        c.done()
    scat('Heat exchanger air intake duct', 'Воздуховод от воздухозаборника в капоте к теплообменнику',
         [hx - V((0, 0.06, 0)), hx - V((0, 0.10, 0)), V((-0.30, -1.48, -0.06)), V((-0.33, -1.60, -0.10))], 0.026, 0.05, 'cold', 'AMM 21-00 2.A')
    # заслонка на перегородке спереди, распределитель на задней стороне
    hv = V((-0.24, -1.225, 0.045))
    p = P('Cabin heat valve (firewall)', 'Заслонка отопления на перегородке: OFF — тёплый воздух сбрасывается под капот, ON — через перегородку в кабину',
          'alu', 'AMM 21-00 2.A, рис. 3')
    box(p, hv, (0.08, 0.05, 0.08), Matrix.Identity(3), 0, bevel=0.004)
    cyl(p, hv - V((0, 0, 0.04)), hv - V((0, 0, 0.07)), 0.022, 0, segs=20)
    box(p, hv + V((0.045, 0, 0.02)), (0.004, 0.012, 0.04), Matrix.Identity(3), p.m(M['steel']))
    p.done()
    scat('Warm air duct heat exchanger to heat valve', 'Тёплый воздух: теплообменник — заслонка', [hx + V((0, 0.055, 0)), hx + V((0, 0.07, 0.01)), hv - V((0, 0.03, -0.0)) + V((0, 0, 0)),
         hv - V((0, 0.025, 0))], 0.025, 0.03, 'hot', 'AMM 21-00 рис. 1', clamp_ends=False)
    dv = V((-0.12, -1.135, 0.12))
    p = P('Air distributor valve (DEFROST / FLOOR)', 'Распределитель на задней стороне перегородки: DEFROST — на фонарь, FLOOR — к ногам',
          'alu', 'AMM 21-00 2.A, рис. 1')
    box(p, dv, (0.12, 0.07, 0.09), Matrix.Identity(3), 0, bevel=0.005)
    box(p, dv + V((0.065, 0, 0.02)), (0.004, 0.012, 0.04), Matrix.Identity(3), p.m(M['steel']))
    p.done()
    scat('Warm air duct heat valve to distributor', 'Тёплый воздух сквозь перегородку к распределителю', [hv + V((0, 0.025, 0)), hv + V((0, 0.06, 0.02)),
         dv + V((-0.04, -0.05, 0)), dv + V((-0.04, -0.035, 0))], 0.024, 0.04, 'hot', 'AMM 21-00 рис. 1')
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        noz = V((s * 0.25, -0.72, 0.672))
        p = P(f'Defrost nozzle {tag}', 'Щелевое сопло обдува фонаря на козырьке приборной доски', 'black', 'AMM 21-00 рис. 1')
        box(p, noz, (0.16, 0.02, 0.012), Matrix.Identity(3), 0, bevel=0.003)
        p.done()
        scat(f'Defrost duct {tag}', 'Тёплый воздух на фонарь (DEFROST)', [dv + V((s * 0.03, 0.035, 0.04)), dv + V((s * 0.05, 0.05, 0.12)),
             V((s * 0.20, -0.85, 0.50)), noz - V((0, 0.03, 0.03)), noz - V((0, 0.0, 0.006))], 0.02, 0.06, 'hot', 'AMM 21-00 рис. 1', clamp_ends=False)
        fl = V((s * 0.20, -0.96, -0.06))
        scat(f'Pilot floor heat duct {tag}', 'Тёплый воздух к ногам пилотов (FLOOR)', [dv + V((s * 0.03, 0.035, -0.04)), dv + V((s * 0.04, 0.06, -0.10)),
             V((s * 0.16, -1.02, 0.02)), fl], 0.02, 0.05, 'hot', 'AMM 21-00 рис. 1')
        rear = V((s * 0.14, 0.42, -0.10))
        scat(f'Passenger floor heat duct {tag}', 'Тёплый воздух к ногам пассажиров: вдоль тоннеля под передними креслами',
             [dv + V((s * 0.05, 0.035, -0.03)), V((s * 0.09, -0.95, -0.12)), V((s * 0.10, -0.40, -0.14)), V((s * 0.12, 0.20, -0.14)), rear],
             0.02, 0.07, 'hot', 'AMM 21-00 рис. 1')
    # тросы от рычагов CABIN HEAT и DEFROST/FLOOR на центральной консоли
    lev = V((-0.025, -0.66, 0.205))
    for tgt, dx, name, ru in ((hv + V((0.045, 0, 0.04)), 0.0, 'Cabin heat Bowden cable', 'Трос рычага CABIN HEAT к заслонке отопления'),
                              (dv + V((0.065, 0, 0.04)), 0.02, 'Defrost/floor Bowden cable', 'Трос рычага DEFROST — FLOOR к распределителю')):
        c = P(name, ru, 'cable', 'AMM 21-00 2.A')
        sweep(c, fillet([lev + V((dx, 0, 0)), lev + V((dx, -0.08, -0.02)), V((dx - 0.1, -1.0, 0.15)), tgt + V((0, 0.05, 0.02)), tgt], 0.05), 0.0028, 0, segs=8)
        c.done()


pilots()
passengers()
heating()
dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'AIR_OK {OUT} {size / 1e6:.2f} MB, parts {len(COL.all_objects) - 1}')
