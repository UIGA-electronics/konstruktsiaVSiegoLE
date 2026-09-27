"""Вентиляция и отопление кабины DA 40 NG — отдельный слой сайта.

    python3 tools/da40/air.py [out.glb]          # CHECK=1 — зазоры и видимость трасс

AMM 6.02.15 Rev. 3, гл. 21 (21-00-00 рис. 1–3); AFM 7.4.
Точки на обшивке и в кабине сняты с модели MSFS: NACA-заборники пилотов на
бортах у перегородки, пассажирский — под передней кромкой левого центроплана,
сопла — на приборной доске (vent_pilot.003/.005) и в дуге безопасности
(vent_pilot.004/.006).

Воздуховоды идут за отделкой: трассы ищет route.Router так, чтобы шланг не
задевал обшивку и соседние системы (cabin.py) и не был виден из кабины. На виду остаются только сопла и решётки.
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
from lib import Part, basis, box, cyl, fillet, ring_tube, sweep, worm_clamp  # noqa: E402
import cabin  # noqa: E402

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

DEFROST_Y = -0.975  # под порогом козырька у основания лобового стекла, перед корпусами PFD и MFD

PANEL_VENT = {1: V((0.433, -0.656, 0.476)), -1: V((-0.435, -0.651, 0.476))}
ROLLBAR_VENT = {1: V((0.501, 0.266, 0.317)), -1: V((-0.501, 0.266, 0.317))}
PILOT_NACA_Y, PILOT_NACA_Z = -1.0, 0.035
PAX_NACA = V((1.0, -0.20))          # под передней кромкой левого центроплана
INNER_RIB_X, OUTER_RIB_X = 0.745, 1.165
CS_FRONT_SPAR_Y = 0.02
HEAT_VALVE = V((-0.24, -1.225, 0.045))      # на перегородке со стороны двигателя
DISTRIBUTOR = V((-0.08, -1.155, -0.02))     # на перегородке со стороны кабины, за передней стенкой ниши для ног
DIST_SIZE = V((0.11, 0.05, 0.08))
PAX_OUTLET_Y = 0.30                         # решётки обогрева ног пассажиров на стенках тоннеля


GLARE, SYS, RT = cabin.setup(R, 'air')
ROUTES = []


def clearance(name, path, r):
    """Наименьший зазор трассы до обшивки, отделки и соседних систем."""
    L = lib.path_len(path)
    worst, where = 9.0, None
    for k in range(41):
        q, _ = lib.along(path, L * k / 40)
        for tag, bvh in (('shell', R.shell), ('trim', GLARE), ('sys', SYS)):
            hit = bvh.find_nearest(q, 1.0)
            if hit[0] is not None and hit[3] - r < worst:
                worst, where = hit[3] - r, (tag, k, tuple(round(v, 3) for v in q))
    print(f'CLEAR {name}: {worst * 1000:.1f} mm at {where}')
    return worst


def visibility(name, path, r, allow=0.0):
    """Сколько точек трассы видно из кабины; allow — сколько метров у конца могут быть на виду."""
    L = lib.path_len(path)
    n = max(8, int(L / 0.02))
    vis = []
    for k in range(n + 1):
        s = L * k / n
        if s > L - allow:
            break
        q, _ = lib.along(path, s)
        if RT.seen(q, r):
            vis.append(round(s, 2))
    print(f'VIS {name}: {len(vis)}/{n + 1} visible' + (f' at {vis[:6]}' if vis else ''))
    return vis


def P(name, ru, m, doc):
    return Part(name, ru, M[m], COL, True, doc)


def scat(name, ru, pts, r, bend, mat, doc, clamp_ends=True, allow=0.0):
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
    ROUTES.append((name, path, r, allow))
    RT.set_extra(ref._bvh([o for o in COL.all_objects if o.type == 'MESH']))   # следующие шланги обходят этот
    return path


def routed(a, da, b, db, r, lo, hi, stub=0.03, hidden=True, relax=()):
    """Опорные точки: выход из a вдоль da, трасса планировщика, вход в b вдоль db."""
    a, b, da, db = V(a), V(b), V(da).normalized(), V(db).normalized()
    a0, b0 = a + da * stub, b - db * stub
    for rr in (r, r * 0.85):
        mid = RT.route(a0, b0, rr, lo, hi, hidden=hidden, relax=relax)
        if mid:
            return [a] + mid + [b]
    raise SystemExit(f'нет трассы {tuple(round(v, 3) for v in a)} → {tuple(round(v, 3) for v in b)}')


def nozzle(name, ru, c, d, doc, r=0.03):
    """Поворотное сопло: корпус за панелью и шаровая насадка."""
    d = V(d).normalized()
    p = P(name, ru, 'plastic', doc)
    cyl(p, c - d * 0.05, c, r * 0.9, 0, segs=24)
    ring_tube(p, c, d, r * 1.25, r * 0.8, 0.006, 0, segs=24)
    lib.sphere(p, c + d * 0.004, r * 0.75, 0, segs=18, rings=9)
    p.done()
    return c - d * 0.05


def grille(name, ru, c, n, doc, w=0.08, h=0.035, depth=0.035):
    """Решётка выхода воздуха заподлицо с панелью; n — в кабину. Возвращает точку подвода сзади."""
    n = V(n).normalized()
    Rm = basis(n)
    p = P(name, ru, 'plastic', doc)
    box(p, c - n * (depth / 2), (w, h, depth), Rm, 0, bevel=0.003)
    for k in range(5):
        box(p, c + n * 0.001 + Rm @ V((-w * 0.4 + k * w * 0.2, 0, 0)), (0.004, h * 0.8, 0.004), Rm, 0)
    p.done()
    return c - n * depth


def wall_point(org, d):
    """Первая панель отделки по лучу из кабины: точка и нормаль в кабину."""
    hit = GLARE.ray_cast(V(org), V(d).normalized(), 2.0)
    assert hit[0] is not None, org
    nrm = hit[1] if hit[1].dot(V(d)) < 0 else -hit[1]
    return hit[0], nrm


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
    """AMM 21-00 рис. 2: от заборника шланг сразу поднимается у борта и сзади доски подходит к соплу."""
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        skin, n = R.hit((0, PILOT_NACA_Y, PILOT_NACA_Z), (s, 0, 0))
        n = n.normalized()
        inward = -n
        fl = (V((0, 1, 0)) - n * n.y).normalized()
        up = n.cross(fl).normalized()
        up = up if up.z > 0 else -up
        # плоский короб за заборником в зазоре между бортом и обшивкой ниши для ног; патрубок вверх на заднем конце
        p = P(f'Pilot NACA inlet duct {tag}', f'Короб NACA-заборника пилота на {"левом" if s > 0 else "правом"} борту носовой части',
              'gfrp', 'AMM 21-00 2.B(1)')
        Rm = Matrix((up, fl, inward)).transposed()
        c = skin + inward * 0.014
        box(p, c, (0.06, 0.14, 0.024), Rm, 0, bevel=0.004)
        base = c + fl * 0.045 + up * 0.028
        port = base + up * 0.03
        cyl(p, base - up * 0.006, port, 0.018, 0, segs=24)
        p.done()
        back = nozzle(f'Instrument panel air outlet {tag}', f'Поворотное сопло на приборной доске ({"пилот" if s > 0 else "второй пилот"}): наружный воздух от NACA-заборника',
                      PANEL_VENT[s], V((0, 1, 0)), 'AMM 21-00 2.B(1), AFM 7.4.1')
        lo, hi = (0.30, -1.18, 0.0), (0.56, -0.68, 0.56)
        if s < 0:
            lo, hi = (-hi[0], lo[1], lo[2]), (-lo[0], hi[1], hi[2])
        pts = routed(port, up, back, V((0, 1, 0)), 0.016, lo, hi)
        scat(f'Pilot air duct {tag}', 'Воздуховод от NACA-заборника к соплу на приборной доске: вверх у борта за обшивкой ниши для ног, дальше за доской',
             pts, 0.016, 0.05, 'cold', 'AMM 21-00 2.B(1)')


def passengers():
    # короб-коллектор: передний лонжерон центроплана и две замыкающие нервюры левого центроплана
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
    # NACA под передней кромкой левого центроплана
    skin, n = R.skin(PAX_NACA.x, PAX_NACA.y, 'lower')
    n = -n if n.z > 0 else n
    naca_adapter('Passenger NACA inlet duct (LH stub wing)', 'Короб NACA-заборника под передней кромкой левого центроплана: воздух для пассажиров',
                 skin, n, V((0, 1, 0.3)), 'AMM 21-00 2.B(2)')
    # поперечный шланг под полом от отверстия внутренней нервюры слева к правой
    a, b = V((INNER_RIB_X - 0.01, -0.07, -0.08)), V((-INNER_RIB_X + 0.01, -0.07, -0.08))
    pts = routed(a, (-1, 0, 0), b, (-1, 0, 0), 0.024, (-0.76, -0.45, -0.26), (0.76, 0.25, 0.05))
    scat('Passenger air crossover duct', 'Поперечный воздуховод: коллектор левого центроплана — передний отсек правого, под полом кабины',
         pts, 0.024, 0.08, 'cold', 'AMM 21-00 2.B(2)')
    # боковые каналы в стенке фюзеляжа к дуге безопасности и сопла
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        top = V((s * (INNER_RIB_X - 0.03), -0.05, 0.0))
        d = V((-s * 0.3, 1, 0)).normalized()
        back = nozzle(f'Roll bar air outlet {tag}', f'Поворотное сопло в дуге безопасности ({"слева" if s > 0 else "справа"}) — воздух для пассажиров',
                      ROLLBAR_VENT[s], d, 'AMM 21-00 2.B(2), AFM 7.4.1', r=0.024)
        lo, hi = (0.40, -0.20, -0.10), (0.73, 0.32, 0.40)
        if s < 0:
            lo, hi = (-hi[0], lo[1], lo[2]), (-lo[0], hi[1], hi[2])
        pts = routed(top, (-s, 0.3, 0.05), back, d, 0.015, lo, hi, relax=[(back, 0.06)])
        scat(f'Fuselage side air duct {tag}', 'Боковой канал в стенке фюзеляжа за панелью отделки: от верха внутренней замыкающей нервюры к дуге безопасности',
             pts, 0.015, 0.04, 'cold', 'AMM 21-00 2.B(2)', allow=0.06)
    # выход воздуха: прорези в раме багажника, дальше через хвост к щели у руля направления
    p = P('Cabin air exit slots (baggage frame)', 'Прорези в раме багажника: тёплый и холодный воздух уходит через хвост и щель у руля направления',
          'black', 'AMM 21-00 2.C')
    for k in range(5):
        box(p, V((-0.08 + k * 0.04, 2.265, 0.16)), (0.02, 0.004, 0.11), Matrix.Identity(3), 0, bevel=0.002)
    p.done()


def heating():
    # теплообменник на мотораме справа сзади; шланги охлаждающей жидкости — в слое охлаждения (powerplant.py)
    hx = V((-0.28, -1.315, 0.02))
    p = P('Cabin heat exchanger', 'Теплообменник отопления на мотораме: через соты идёт горячая охлаждающая жидкость, через них — наружный воздух',
          'core', 'AMM 21-00 2.A, 75-00')
    box(p, hx, (0.14, 0.06, 0.11), Matrix.Identity(3), 0, bevel=0.003)
    for sx in (-1, 1):
        box(p, hx + V((sx * 0.076, 0, 0)), (0.014, 0.066, 0.12), Matrix.Identity(3), p.m(M['alu']), bevel=0.002)
    for q in (hx + V((0.05, -0.03, 0.035)), hx + V((-0.05, -0.03, -0.03))):
        cyl(p, q, q - V((0, 0.02, 0)), 0.009, p.m(M['alu']), segs=12)      # штуцеры охлаждающей жидкости
    cyl(p, hx - V((0, 0.03, 0)), hx - V((0, 0.06, 0)), 0.026, p.m(M['alu']), segs=24)
    cyl(p, hx + V((0, 0.03, 0)), hx + V((0, 0.055, 0)), 0.026, p.m(M['alu']), segs=24)
    p.done()
    end = V((-0.33, -1.72, 0.40))
    scat('Heat exchanger air intake duct', 'Воздуховод к теплообменнику от правого канала верхнего капота',
         [hx - V((0, 0.06, 0)), hx - V((0, 0.105, -0.01)), V((-0.32, -1.52, 0.06)), V((-0.345, -1.62, 0.25)), end],
         0.026, 0.05, 'cold', 'AMM 21-00 2.A')
    p = P('Heat exchanger duct cowling seal', 'Уплотнение стыка воздуховода отопления с каналом верхнего капота', 'black', 'AMM 21-00 2.A')
    ring_tube(p, end, V((0.15, -1.0, 1.5)), 0.034, 0.024, 0.01, 0, segs=24)
    p.done()
    # заслонка на перегородке спереди
    hv = HEAT_VALVE
    p = P('Cabin heat valve (firewall)', 'Заслонка отопления на перегородке: OFF — тёплый воздух сбрасывается под капот, ON — через перегородку в кабину',
          'alu', 'AMM 21-00 2.A, рис. 3')
    box(p, hv, (0.08, 0.05, 0.08), Matrix.Identity(3), 0, bevel=0.004)
    cyl(p, hv - V((0, 0, 0.04)), hv - V((0, 0, 0.07)), 0.022, 0, segs=20)
    box(p, hv + V((0.045, 0, 0.02)), (0.004, 0.012, 0.04), Matrix.Identity(3), p.m(M['steel']))
    cyl(p, hv + V((0, 0.025, 0)), hv + V((0, 0.06, 0)), 0.03, p.m(M['alu']), segs=24)       # фланец прохода сквозь перегородку
    p.done()
    scat('Warm air duct heat exchanger to heat valve', 'Тёплый воздух: теплообменник — заслонка', [hx + V((0, 0.055, 0)), hx + V((0, 0.07, 0.01)),
         hv - V((0, 0.03, 0)), hv - V((0, 0.025, 0))], 0.025, 0.03, 'hot', 'AMM 21-00 рис. 1', clamp_ends=False)
    # распределитель на перегородке со стороны кабины, за передней стенкой ниши для ног
    dv, ds = DISTRIBUTOR, DIST_SIZE
    p = P('Air distributor valve (DEFROST / FLOOR)', 'Распределитель на перегородке со стороны кабины: DEFROST — на фонарь, FLOOR — к ногам',
          'alu', 'AMM 21-00 2.A, рис. 1')
    box(p, dv, tuple(ds), Matrix.Identity(3), 0, bevel=0.005)
    lever = dv + V((0.0, ds.y / 2 + 0.004, ds.z / 2 - 0.012))
    box(p, lever, (0.012, 0.004, 0.04), Matrix.Identity(3), p.m(M['steel']))
    p.done()
    inlet = dv - V((ds.x / 2, 0, 0))
    wall = V((hv.x, -1.165, hv.z))
    pts = [hv + V((0, 0.06, 0))] + routed(wall, (0, 1, 0), inlet, (1, 0, 0), 0.022,
                                         (-0.30, -1.18, -0.10), (0.0, -1.08, 0.12), stub=0.015)
    scat('Warm air duct heat valve to distributor', 'Тёплый воздух сквозь перегородку к распределителю', pts, 0.022, 0.03,
         'hot', 'AMM 21-00 рис. 1')
    # обдув фонаря: две трубы вверх за передней стенкой ниши и за доской к раструбам под щелями козырька
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        top = GLARE.ray_cast(V((s * 0.25, DEFROST_Y, 1.2)), V((0, 0, -1)), 2.0)[0]
        noz = V((s * 0.25, DEFROST_Y, top.z - 0.024))   # под щелями в крышке козырька
        p = P(f'Defrost nozzle {tag}', 'Раструб обдува фонаря под щелями в крышке приборной доски у лобового стекла', 'black', 'AMM 21-00 рис. 1')
        box(p, noz, (0.16, 0.035, 0.03), Matrix.Identity(3), 0, bevel=0.004)
        p.done()
        port = dv + V((-s * 0.027, 0, ds.z / 2))   # трубы расходятся крест-накрест: так они не перекручиваются у распределителя
        pts = routed(port, (0, 0, 1), noz - V((0, 0, 0.016)), (0, 0, 1), 0.018,
                     (-0.40, -1.18, -0.05), (0.40, -0.70, 0.60), relax=[(noz, 0.05)])
        scat(f'Defrost duct {tag}', 'Тёплый воздух на фонарь (DEFROST): вверх за передней стенкой ниши для ног и перед корпусами дисплеев',
             pts, 0.018, 0.05, 'hot', 'AMM 21-00 рис. 1', clamp_ends=False)
    # обогрев ног пилотов: решётки в передней стенке ниши для ног
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        c, nrm = wall_point((s * 0.20, -0.80, 0.03), (0, -1, 0))
        feed = grille(f'Pilot floor heat outlet {tag}', f'Решётка обогрева ног {"пилота" if s > 0 else "второго пилота"} в передней стенке ниши для ног',
                      c, nrm, 'AMM 21-00 рис. 1')
        port = dv + (V((ds.x / 2, 0, -0.01)) if s > 0 else V((-0.03, ds.y / 2, -0.02)))
        dport = V((1, 0, 0)) if s > 0 else V((0, 1, 0))
        pts = routed(port, dport, feed, -nrm, 0.016, (-0.45, -1.18, -0.12), (0.45, -0.70, 0.25),
                     stub=0.015, relax=[(feed, 0.03)])
        scat(f'Pilot floor heat duct {tag}', 'Тёплый воздух к ногам пилотов (FLOOR): за передней стенкой ниши к решётке',
             pts, 0.016, 0.04, 'hot', 'AMM 21-00 рис. 1', allow=0.03)
    # обогрев ног пассажиров: один шланг под полом до тоннеля за передними креслами, там тройник на две решётки
    y = PAX_OUTLET_Y
    walls = {s: wall_point((s * 0.25, y, -0.07), (-s, 0, 0)) for s in (1, -1)}
    tee_a, tee_b = walls[1][0] - V((0.03, 0, 0)), walls[-1][0] + V((0.03, 0, 0))
    p = P('Passenger floor heat tee', 'Тройник в тоннеле за передними креслами: тёплый воздух на две решётки к ногам пассажиров',
          'alu', 'AMM 21-00 рис. 1')
    cyl(p, tee_a, tee_b, 0.018, 0, segs=24)
    cyl(p, (tee_a + tee_b) / 2, (tee_a + tee_b) / 2 - V((0, 0.035, 0)), 0.017, 0, segs=24)
    p.done()
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        grille(f'Passenger floor heat outlet {tag}', f'Решётка обогрева ног пассажира {"слева" if s > 0 else "справа"} на стенке тоннеля',
               walls[s][0], walls[s][1], 'AMM 21-00 рис. 1', w=0.07, h=0.03, depth=0.03)
    port = dv + V((0.02, 0, -ds.z / 2))
    inlet = (tee_a + tee_b) / 2 - V((0, 0.035, 0))
    pts = routed(port, (0, 0, -1), inlet, (0, 1, 0), 0.016, (-0.45, -1.18, -0.26), (0.45, y + 0.05, 0.10),
                 stub=0.015, relax=[(inlet, 0.035)])
    scat('Passenger floor heat duct', 'Тёплый воздух к ногам пассажиров: под полом кабины к тоннелю за передними креслами',
         pts, 0.016, 0.06, 'hot', 'AMM 21-00 рис. 1', allow=0.03)
    # тросы от рычагов CABIN HEAT и DEFROST/FLOOR на центральной консоли
    lev = V((-0.025, -0.66, 0.205))
    for tgt, dx, name, ru in ((hv + V((0.045, 0, 0.04)), 0.0, 'Cabin heat Bowden cable', 'Трос рычага CABIN HEAT к заслонке отопления'),
                              (lever + V((0, 0, 0.02)), 0.02, 'Defrost/floor Bowden cable', 'Трос рычага DEFROST — FLOOR к распределителю')):
        a = lev + V((dx, 0, 0))
        if tgt.y < -1.18:           # к заслонке — сквозь перегородку
            wall = V((tgt.x, -1.17, tgt.z + 0.02))
            mid = routed(a, (0, -1, -0.3), wall, (0, -1, 0), 0.004, (-0.35, -1.18, -0.10), (0.10, -0.60, 0.40),
                         relax=[(a, 0.05)])
            pts = mid + [tgt + V((0, 0.02, 0.02)), tgt]
        else:
            pts = routed(a, (0, -1, -0.3), tgt, (0, 0, -1), 0.004, (-0.35, -1.18, -0.10), (0.10, -0.60, 0.40),
                         relax=[(a, 0.05)])
        c = P(name, ru, 'cable', 'AMM 21-00 2.A')
        sweep(c, fillet(pts, 0.04), 0.0028, 0, segs=8)
        c.done()
        ROUTES.append((name, fillet(pts, 0.04), 0.0028, 0.05))


pilots()
passengers()
heating()
if os.environ.get('CHECK'):
    for name, path, r, allow in ROUTES:
        clearance(name, path, r)
        visibility(name, path, r, allow)
dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'AIR_OK {OUT} {size / 1e6:.2f} MB, parts {len(COL.all_objects) - 1}')
