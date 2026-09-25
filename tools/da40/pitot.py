"""ПВД, статика и сигнализатор сваливания DA 40 NG — отдельный слой сайта.

    python3 tools/da40/pitot.py [out.glb]

AMM 6.02.15 Rev. 3: 34-10 (рис. 1), 27-39 (рис. 1), 57-10 2.B(9); AFM 7.11, 7.12.
Наружные точки взяты с оболочки MSFS (её делали по реальному самолёту):
ПВД — объект PITOT; статические порты — кольца «STATIC PORT KEEP CLEAN»
на хвостовой части (y = 1,80 м); отверстие сигнализатора — единственное
отверстие в передней кромке, и только на левом крыле (x = 2,461 м).
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
from mathutils import Matrix, Vector as V  # noqa: E402

import lib  # noqa: E402
import ref  # noqa: E402
from lib import Part, basis, box, cyl, fillet, hexa, ring_tube, screw, sphere, sweep, torus  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-pitot-raw.glb'

ref.open_source()
R = ref.Ref(exclude={'PITOT'})
ref.drop_collection('Pitot-static & stall warning')
COL = lib.collection('DA40 Pitot-static and stall warning (AMM 34-10, 27-39)')

M = dict(
    green=lib.mat('DA40 Pitot hose (green, 8 mm)', (0.10, 0.52, 0.16), 0.0, 0.45, ru='зелёный шланг 8 мм — полное давление'),
    blue=lib.mat('DA40 static hose (blue)', (0.10, 0.26, 0.72), 0.0, 0.45,
                 ru='синий шланг — статическое давление (на рис. AMM 34-10 синий, в тексте — красный)'),
    clear=lib.mat('DA40 stall warning hose (10 mm transparent)', (0.86, 0.90, 0.92), 0.0, 0.1, alpha=0.5,
                  ru='прозрачный шланг 10 мм'),
    trap=lib.mat('DA40 water trap bowl (clear)', (0.82, 0.88, 0.92), 0.0, 0.1, alpha=0.45, ru='прозрачный стакан влагоотстойника'),
    plastic=lib.mat('DA40 push-fit connector (white nylon)', (0.92, 0.92, 0.90), 0.0, 0.5, ru='быстроразъёмный пластиковый соединитель'),
    alu=lib.mat('DA40 aluminium', (0.80, 0.81, 0.83), 1.0, 0.32, ru='алюминиевый сплав'),
    steel=lib.mat('DA40 stainless steel', (0.62, 0.63, 0.65), 1.0, 0.28, ru='нержавеющая сталь'),
    brass=lib.mat('DA40 brass', (0.78, 0.60, 0.28), 1.0, 0.35, ru='латунь'),
    black=lib.mat('DA40 black anodised', (0.05, 0.05, 0.06), 0.6, 0.4, ru='алюминий, чёрное анодирование'),
    red=lib.mat('DA40 red marking', (0.78, 0.06, 0.05), 0.0, 0.4, ru='красная краска'),
    wire_r=lib.mat('DA40 wire red (+)', (0.70, 0.08, 0.06), 0.0, 0.5, ru='провод питания'),
    wire_k=lib.mat('DA40 wire black (-)', (0.05, 0.05, 0.05), 0.0, 0.5, ru='провод массы'),
    relay=lib.mat('DA40 relay housing', (0.12, 0.12, 0.13), 0.1, 0.5, ru='корпус реле'),
)

PROBE_TOP = V((4.618, 0.1925))       # стойка ПВД у обшивки (объект PITOT MSFS)
STALL_HOLE = V((2.461, -0.228, 0.0312))
STATIC_Y, STATIC_Z = 1.80, 0.222
LH_SEAT_TRAPS = V((0.33, -0.08, -0.175))   # под креслом пилота: разъёмы и влагоотстойники (AMM 57-10 2.B(9))
GDC = V((0.30, -0.915, 0.21))              # GDC 74A на полке приборной доски
ASI = V((0.095, -0.74, 0.64))              # резервный указатель скорости
ALT = V((-0.105, -0.74, 0.64))             # резервный высотомер
ALT_STATIC = V((0.30, -0.70, 0.255))       # кран альтернативной статики
HORN = V((0.34, -0.70, 0.355))             # рупор сигнализатора в приборной доске


def P(name, ru, m, doc):
    return Part(name, ru, M[m], COL, True, doc)


def hose(name, ru, pts, r, bend, mat, doc, joints=(), clamps=()):
    """Шланг по трассе; joints — доли длины, где стоят пуш-фит соединители."""
    p = P(name, ru, mat, doc)
    path = fillet(pts, bend)
    sweep(p, path, r, 0, segs=12)
    L = lib.path_len(path)
    for f in joints:
        q, t = lib.along(path, f * L)
        cyl(p, q - t * 0.011, q + t * 0.011, r * 1.55, p.m(M['plastic']), segs=14)
        ring_tube(p, q, t, r * 1.8, r * 1.5, 0.003, p.m(M['plastic']), segs=14)
    for f, tab in clamps:
        q, t = lib.along(path, f * L)
        lib.p_clamp(p, q, t, r, tab, p.m(M['steel']), p.m(M['black']))
    p.done()
    return path


def tee(name, ru, c, d_run, d_branch, r, doc):
    p = P(name, ru, 'plastic', doc)
    d_run, d_branch = V(d_run).normalized(), V(d_branch).normalized()
    cyl(p, c - d_run * 0.014, c + d_run * 0.014, r * 1.5, 0, segs=14)
    cyl(p, c, c + d_branch * 0.013, r * 1.5, 0, segs=14)
    p.done()


def water_trap(name, ru, c, d, r, mat_hose, doc):
    """Влагоотстойник по AMM 34-10: верхняя ветка идёт прямо к приборам, нижняя
    уходит вниз и образует отстойник, потом снова сливается тройником."""
    d = V(d).normalized()
    a, b = c - d * 0.05, c + d * 0.05
    tee(name + ' inlet tee', 'Тройник влагоотстойника', a, d, V((0, 0, -1)), r, doc)
    tee(name + ' outlet tee', 'Тройник влагоотстойника', b, d, V((0, 0, -1)), r, doc)
    p = P(name, ru, 'trap', doc)
    lo = V((c.x, c.y, c.z - 0.055))
    cyl(p, lo - V((0, 0, 0.022)), lo + V((0, 0, 0.018)), 0.012, 0, segs=20)
    cyl(p, lo - V((0, 0, 0.022)), lo - V((0, 0, 0.028)), 0.008, p.m(M['alu']), segs=14)
    sweep(p, fillet([a - V((0, 0, 0.013)), V((a.x, a.y, lo.z + 0.016)), lo + V((0, 0, 0.018))], 0.012), r, p.m(M[mat_hose]), segs=10)
    sweep(p, fillet([b - V((0, 0, 0.013)), V((b.x, b.y, lo.z + 0.016)), lo + V((0, 0, 0.018))], 0.012), r, p.m(M[mat_hose]), segs=10)
    p.done()
    return a - d * 0.014, b + d * 0.014


# ── Сигнализатор сваливания ───────────────────────────────────────────────

def stall_warning():
    h = STALL_HOLE
    _, n = R.hit(h + V((0, -0.3, 0)), (0, 1, 0))
    n = n.normalized()
    if n.dot(V((0, -1, 0))) < 0:
        n = -n
    p = P('Stall warning orifice red ring (LH wing leading edge)',
          'Отверстие сигнализатора сваливания в передней кромке левого крыла, обведено красным кольцом: при подходе к критическому углу здесь растёт разрежение',
          'red', 'AFM 7.12, AMM 27-39')
    ring_tube(p, h + n * 0.0004, n, 0.014, 0.0062, 0.0006, 0, segs=32)
    p.done()
    p = P('Stall warning orifice fitting', 'Штуцер отверстия сигнализатора внутри носка крыла', 'alu', 'AMM 27-39')
    aft = V((0, 1, 0.12)).normalized()          # внутрь носка — назад по хорде, не по нормали
    inner = h - n * 0.004
    cyl(p, h - n * 0.001, inner + aft * 0.02, 0.0055, 0, segs=14)
    ring_tube(p, inner, aft, 0.011, 0.0055, 0.003, 0, segs=18)
    p.done()
    start = inner + aft * 0.02
    # в носке вдоль передней стенки лонжерона к корню, сквозь переднюю часть корневой нервюры
    pts = [start, start + aft * 0.03, V((2.36, -0.12, 0.03)), V((1.60, -0.09, -0.03)), V((1.26, -0.08, -0.06)),
           V((1.10, -0.10, -0.09)), V((0.62, -0.12, -0.13)), LH_SEAT_TRAPS + V((0.06, 0.02, 0.02)),
           V((0.40, -0.30, -0.15)), V((0.40, -0.62, 0.10)), HORN + V((0.0, -0.06, -0.02)), HORN + V((0, -0.035, 0))]
    hose('Stall warning hose (10 mm transparent)',
         'Шланг сигнализатора сваливания, прозрачный 10 мм: от отверстия в кромке левого крыла к рупору в приборной доске; разъём под креслом пилота',
         pts, 0.005, 0.05, 'clear', 'AMM 27-39, 57-10 2.B(9)', joints=(0.52,),
         clamps=((0.12, V((0, 1, 0))), (0.25, V((0, 1, 0))), (0.36, V((0, 1, 0))), (0.8, V((1, 0, 0)))))
    # рупор в приборной доске: корпус-раструб, фланец, шариковый клапан, шплинт
    d = V((0, 1, 0))
    p = P('Stall warning horn (instrument panel)',
          'Рупор сигнализатора сваливания в приборной доске: чем ближе к сваливанию, тем громче; шариковый клапан не пускает воду в кабину',
          'black', 'AMM 27-39 рис. 1, AFM 7.12')
    cyl(p, HORN - d * 0.035, HORN, 0.007, 0, segs=18, r1=0.022)
    box(p, HORN + d * 0.002, (0.05, 0.004, 0.05), Matrix.Identity(3), p.m(M['alu']), bevel=0.003)
    for sx in (-0.019, 0.019):
        for sz in (-0.019, 0.019):
            screw(p, HORN + d * 0.004 + V((sx, 0, sz)), d, 0.004, p.m(M['steel']))
    sphere(p, HORN - d * 0.05, 0.0045, p.m(M['steel']), segs=10, rings=6)
    cyl(p, HORN - d * 0.058 + V((-0.009, 0, 0)), HORN - d * 0.058 + V((0.009, 0, 0)), 0.0008, p.m(M['steel']), segs=6)
    ring_tube(p, HORN - d * 0.04, d, 0.0068, 0.0052, 0.003, p.m(M['plastic']), segs=12)
    p.done()


# ── ПВД и его проводка ────────────────────────────────────────────────────

def pitot():
    x, y = PROBE_TOP
    sk, n = R.skin(x, y, 'lower')
    n = -n if n.z > 0 else n          # наружу — вниз
    up = -n
    p = P('Pitot probe mounting plate', 'Круглая пластина крепления ПВД на нижней обшивке левого крыла, доступ через лючок «Pitot probe»',
          'alu', 'AMM 34-10 рис. 1, 52-40')
    c = sk + up * 0.004
    cyl(p, c - up * 0.002, c + up * 0.002, 0.042, 0, segs=36)
    Rm = basis(up)
    for k in range(6):
        a = 2 * math.pi * k / 6
        screw(p, c + up * 0.002 + Rm @ V((0.034 * math.cos(a), 0.034 * math.sin(a), 0)), up, 0.005, p.m(M['steel']))
    ports = {}
    for key, dy in (('pitot', -0.012), ('static', 0.012)):
        b = c + V((0, dy, 0)) + up * 0.002
        cyl(p, b, b + up * 0.014, 0.004, p.m(M['brass']), segs=12)
        ports[key] = b + up * 0.014
    box(p, c + V((0.024, 0, 0)) + up * 0.008, (0.014, 0.02, 0.012), Matrix.Identity(3), p.m(M['black']), bevel=0.001)
    p.done()
    # реле обогрева ПВД на кронштейне рядом
    rl = c + V((0.0, 0.07, 0.0)) + up * 0.02
    p = P('Pitot heat relay', 'Реле обогрева ПВД у пластины крепления', 'relay', 'AMM 34-10 рис. 1')
    box(p, rl, (0.028, 0.03, 0.024), Matrix.Identity(3), 0, bevel=0.002)
    box(p, rl - up * 0.014, (0.05, 0.04, 0.003), Matrix.Identity(3), p.m(M['alu']))
    p.done()
    # шланги: к передней стенке лонжерона, сквозь неё в носок и вдоль к корню
    def run(start, dz, mat, name, ru):
        pts = [start, start + up * 0.02, V((x - 0.02, 0.10, start.z + 0.03)), V((x - 0.08, 0.02 + dz, start.z + 0.02)),
               V((x - 0.2, -0.05 + dz, start.z - 0.005)), V((3.2, -0.07 + dz, 0.05)), V((2.2, -0.10 + dz, 0.00)),
               V((1.26, -0.09 + dz, -0.07)), V((0.62, -0.11 + dz, -0.12)), LH_SEAT_TRAPS + V((0.03, 0.04, 0.0 + dz))]
        return hose(name, ru, pts, 0.004, 0.05, mat, 'AMM 34-10, 57-10 2.B(9)', joints=(0.02, 0.9),
                    clamps=[(f, V((0, 1, 0))) for f in (0.2, 0.35, 0.5, 0.65)])
    run(ports['pitot'], 0.0, 'green', 'Pitot hose (green) probe to LH seat',
        'Шланг полного давления, зелёный 8 мм: ПВД — носок левого крыла — разъём под креслом пилота')
    run(ports['static'], 0.012, 'blue', 'Probe static hose (blue) to LH seat',
        'Статический шланг от ПВД (на схеме AMM — «not in use», штуцер заглушён у приборов)')
    # провода обогрева к жгуту крыла
    for mat, dz, key in (('wire_r', 0.02, '+'), ('wire_k', 0.026, '-')):
        p = P(f'Pitot heat wire {key}', f'Провод обогрева ПВД ({key}) к жгуту крыла, разъём P2400 под креслом пилота',
              mat, 'AMM 34-10, 57-10 2.B(8)')
        pts = [rl + V((0, 0.015, 0)), V((x - 0.05, 0.14, rl.z + 0.01)), V((x - 0.2, -0.03, rl.z + 0.0)), V((3.2, -0.05, 0.07 + dz)),
               V((1.26, -0.07, -0.05 + dz)), V((0.62, -0.09, -0.10 + dz)), V((0.36, -0.02, -0.12))]
        sweep(p, fillet(pts, 0.05), 0.0013, 0, segs=6)
        p.done()


# ── Статика ───────────────────────────────────────────────────────────────

def static():
    ends = {}
    top_t = V((0.0, STATIC_Y + 0.02, 0.63))
    for s, tag in ((1, 'LH'), (-1, 'RH')):
        h, n = R.hit((0, STATIC_Y, STATIC_Z), (s, 0, 0))
        n = n.normalized()
        p = P(f'Static port fitting {tag}', f'Штуцер статического порта {"левого" if s > 0 else "правого"} борта: вклеен в обшивку хвостовой части изнутри',
              'alu', 'AMM 34-10, AFM 7.11')
        inner = h - n * 0.006
        cyl(p, inner, inner - n * 0.004, 0.016, 0, segs=24)
        cyl(p, inner - n * 0.004, inner - n * 0.022, 0.004, p.m(M['brass']), segs=12)
        p.done()
        st = inner - n * 0.022
        pts = [st, st - n * 0.02, V((s * 0.36, STATIC_Y, 0.40)), V((s * 0.22, STATIC_Y + 0.01, 0.60)), top_t + V((s * 0.016, 0, 0))]
        hose(f'Static hose (blue) {tag} port to top loop', f'Статический шланг от {"левого" if s > 0 else "правого"} порта вверх — к высокой петле под верхом фюзеляжа',
             pts, 0.004, 0.04, 'blue', 'AMM 34-10 рис. 1', clamps=((0.5, V((s, 0, 0))),))
    tee('Static top loop tee', 'Тройник высокой петли статики: вода из портов не поднимется к приборам', top_t, V((1, 0, 0)), V((0, -1, 0)), 0.004,
        'AMM 34-10 рис. 1')
    # основная линия вперёд: по левому борту вниз, под пол к креслу пилота
    pts = [top_t + V((0, -0.014, 0)), V((0.05, STATIC_Y - 0.08, 0.60)), V((0.40, 1.62, 0.35)), V((0.46, 1.50, 0.0)),
           V((0.46, 1.30, -0.14)), V((0.44, 0.60, -0.16)), V((0.38, 0.10, -0.17)), LH_SEAT_TRAPS + V((-0.07, 0.10, 0.0))]
    hose('Static hose (blue) top loop to LH seat', 'Главная статическая линия: от петли вдоль левого борта под пол, к влагоотстойнику под креслом пилота',
         pts, 0.004, 0.06, 'blue', 'AMM 34-10 рис. 1',
         clamps=[(f, V((1, 0, 0))) for f in (0.3, 0.45, 0.6, 0.75)])
    return LH_SEAT_TRAPS + V((-0.07, 0.10, 0.0))


def cockpit(static_in):
    # влагоотстойники в нижней точке трасс под креслом пилота
    pt_in = LH_SEAT_TRAPS + V((0.03, 0.04, 0.0))
    a1, b1 = water_trap('Water trap Pitot line', 'Влагоотстойник линии полного давления под креслом пилота: нижняя ветка-отстойник',
                        pt_in + V((0, -0.07, 0.0)), (0, -1, 0), 0.004, 'green', 'AMM 34-10 2.A')
    hose('Pitot hose (green) seat connector to water trap', 'Полное давление: разъём под креслом — влагоотстойник',
         [pt_in, pt_in + V((0, -0.01, 0)), a1], 0.004, 0.02, 'green', 'AMM 34-10')
    a2, b2 = water_trap('Water trap static line', 'Влагоотстойник статической линии под креслом пилота',
                        static_in + V((0, -0.14, 0.0)), (0, -1, 0), 0.004, 'blue', 'AMM 34-10 2.A')
    hose('Static hose (blue) to water trap', 'Статика: к влагоотстойнику', [static_in, static_in + V((0, -0.02, 0)), a2],
         0.004, 0.02, 'blue', 'AMM 34-10')
    # вверх к полке приборной доски: GDC 74A и резервные приборы
    tee_p = V((0.30, -0.62, 0.12))
    tee_s = V((0.26, -0.64, 0.14))
    hose('Pitot hose (green) water trap to panel tee', 'Полное давление: влагоотстойник — тройник за приборной доской',
         [b1, b1 + V((0, -0.03, 0)), V((0.36, -0.34, -0.12)), V((0.34, -0.55, 0.02)), tee_p + V((0, 0.014, 0))],
         0.004, 0.05, 'green', 'AMM 34-10 рис. 1', clamps=((0.5, V((1, 0, 0))),))
    hose('Static hose (blue) water trap to panel tee', 'Статика: влагоотстойник — тройник за приборной доской',
         [b2, b2 + V((0, -0.03, 0)), V((0.29, -0.36, -0.13)), V((0.28, -0.56, 0.03)), tee_s + V((0, 0.014, 0))],
         0.004, 0.05, 'blue', 'AMM 34-10 рис. 1', clamps=((0.5, V((1, 0, 0))),))
    tee('Pitot panel tee', 'Тройник полного давления: к GDC 74A и к резервному указателю скорости', tee_p, (0, 1, 0), (-1, 0, 0), 0.004, 'AMM 34-10')
    tee('Static panel tee', 'Тройник статики: к GDC 74A, резервным приборам и крану альтернативной статики', tee_s, (0, 1, 0), (-1, 0, 0), 0.004, 'AMM 34-10')
    gp, gs = GDC + V((0.02, -0.095, -0.02)), GDC + V((-0.02, -0.095, -0.02))
    hose('Pitot hose (green) to GDC 74A', 'Полное давление в GDC 74A (вычислитель воздушных данных)',
         [tee_p - V((0, 0.014, 0)), V((0.31, -0.80, 0.14)), gp + V((0, -0.04, 0)), gp], 0.004, 0.04, 'green', 'AMM 31-40 G, 34-10')
    hose('Static hose (blue) to GDC 74A', 'Статика в GDC 74A', [tee_s - V((0, 0.014, 0)), V((0.27, -0.82, 0.15)), gs + V((0, -0.04, 0)), gs],
         0.004, 0.04, 'blue', 'AMM 31-40 G, 34-10')
    hose('Pitot hose (green) to standby airspeed indicator', 'Полное давление к резервному указателю скорости',
         [tee_p - V((0.014, 0, 0)), V((0.18, -0.64, 0.30)), ASI + V((0.0, -0.06, -0.03)), ASI + V((0, -0.035, 0))],
         0.004, 0.05, 'green', 'AMM 34-10 рис. 1')
    hose('Static hose (blue) to standby altimeter and ASI', 'Статика к резервному высотомеру и указателю скорости',
         [tee_s - V((0.014, 0, 0)), V((0.10, -0.66, 0.34)), V((0.0, -0.72, 0.55)), ALT + V((0.02, -0.06, -0.03)), ALT + V((0, -0.035, 0))],
         0.004, 0.05, 'blue', 'AMM 34-10 рис. 1')
    hose('Static hose (blue) to alternate static valve', 'Статика к крану альтернативной статики: открыт — давление берётся из кабины',
         [tee_s + V((0, 0, 0.013)), V((0.27, -0.66, 0.2)), ALT_STATIC + V((0, -0.04, -0.02)), ALT_STATIC + V((0, -0.02, 0))],
         0.004, 0.03, 'blue', 'AFM 7.11')
    p = P('Alternate static valve', 'Кран альтернативной статики на приборной доске', 'black', 'AFM 7.11, 3.x')
    cyl(p, ALT_STATIC + V((0, -0.02, 0)), ALT_STATIC + V((0, 0.01, 0)), 0.009, 0, segs=16)
    box(p, ALT_STATIC + V((0, 0.018, 0)), (0.012, 0.008, 0.03), Matrix.Identity(3), p.m(M['red']), bevel=0.002)
    p.done()


stall_warning()
pitot()
s_in = static()
cockpit(s_in)

dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'PITOT_OK {OUT} {size / 1e6:.2f} MB, parts {len(COL.all_objects) - 1}')
