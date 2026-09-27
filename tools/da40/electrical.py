"""Электросистема DA 40 NG — отдельный слой сайта, заново по AMM 24.

    python3 tools/da40/electrical.py [out.glb]      # CHECK=1 — зазоры и видимость

AMM 6.02.15 Rev. 3: 24-00 (схема рис. 1, описание), 24-30 (генерация),
24-31 (батареи, рис. 1), 24-40 (наземное питание), 24-60 (распределение).

Что стоит где (и чем отличалось в исходнике):
- основная батарея 24 В 13,6 А·ч — в хвостовой части слева, за рамой
  багажного отсека, на поддоне с прижимной лентой (24-00, 24-31); в исходнике
  стояла по оси и пересекала блок AHRS;
- релейная коробка (реле батареи, реле внешнего питания, шина) — на раме
  багажного отсека рядом с батареей; разъём наземного питания — на левом
  борту у коробки (24-40); в исходнике коробка была справа;
- резервная батарея EECU — два блока 12 В 7,2 А·ч последовательно на поддоне
  за первым шпангоутом (24-31); в исходнике — один блок поперёк трассы тяги
  руля высоты;
- регулятор генератора — под креслом пилота (24-30 E); в исходнике — в
  моторном отсеке;
- реле резервной батареи — на полке приборной доски; предохранитель 100 А —
  в моторном отсеке между генератором и шиной EECU (24-30 D);
- автоматы защиты и шины — справа на приборной доске (24-60): шины — полосы
  за панелью автоматов.
Кабели и жгуты прокладывает route.Router (cabin.setup): под полом, в зазоре
у борта, за доской, в носке крыла — не задевая соседние системы и не видны
из кабины.
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
import cabin  # noqa: E402
from lib import Part, basis, box, cyl, fillet, hexa, ring_tube, sweep  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/da40-electrical-raw.glb'

ref.open_source()
R = ref.Ref()
ref.drop_collection('Electrical system')
COL = lib.collection('DA40 Electrical power (AMM 24)')
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'replaced.json')) as f:
    GONE = set(json.load(f))
TRIM, SYS, RT = cabin.setup(R, 'electrical', step=0.012, extra=GONE)
CHECKS = []

M = dict(
    batt=lib.mat('DA40 sealed battery case (black)', (0.07, 0.07, 0.08), 0.0, 0.6, ru='корпус герметичной батареи'),
    lid=lib.mat('DA40 battery lid (grey)', (0.35, 0.36, 0.38), 0.0, 0.5, ru='крышка батареи'),
    alu=lib.mat('DA40 aluminium', (0.80, 0.81, 0.83), 1.0, 0.32, ru='алюминиевый сплав'),
    steel=lib.mat('DA40 stainless steel', (0.62, 0.63, 0.65), 1.0, 0.28, ru='нержавеющая сталь'),
    black=lib.mat('DA40 black anodised', (0.05, 0.05, 0.06), 0.6, 0.4, ru='алюминий, чёрное анодирование'),
    box=lib.mat('DA40 relay box (grey powder coat)', (0.42, 0.43, 0.45), 0.2, 0.55, ru='корпус, порошковая окраска'),
    strap=lib.mat('DA40 battery hold-down strap', (0.10, 0.10, 0.11), 0.0, 0.8, ru='прижимная лента'),
    red=lib.mat('DA40 terminal boot (red rubber)', (0.72, 0.07, 0.06), 0.0, 0.6, ru='защитный колпачок (+)'),
    blk=lib.mat('DA40 terminal boot (black rubber)', (0.04, 0.04, 0.045), 0.0, 0.6, ru='защитный колпачок (−)'),
    copper=lib.mat('DA40 copper bus bar', (0.78, 0.46, 0.28), 1.0, 0.35, ru='медная шина'),
    power=lib.mat('DA40 power cable (red sleeve)', (0.60, 0.08, 0.06), 0.0, 0.55, ru='силовой кабель, красная оболочка'),
    ground=lib.mat('DA40 ground cable (black)', (0.05, 0.05, 0.055), 0.0, 0.6, ru='кабель массы'),
    harness=lib.mat('DA40 wiring harness (white, laced)', (0.86, 0.86, 0.83), 0.0, 0.7, ru='жгут проводов в оплётке'),
    thin=lib.mat('DA40 signal wire (white)', (0.90, 0.90, 0.88), 0.0, 0.6, ru='провод'),
    braid=lib.mat('DA40 tinned copper braid', (0.70, 0.71, 0.72), 1.0, 0.45, ru='лужёная медная плетёнка'),
    ecu=lib.mat('DA40 EECU housing', (0.18, 0.19, 0.20), 0.3, 0.5, ru='корпус блока EECU'),
    conn=lib.mat('DA40 circular connector', (0.55, 0.52, 0.30), 0.8, 0.4, ru='круглый разъём'),
)

# места — по AMM и по свободному месту (см. docstring)
BATT, BATT_SIZE = V((0.132, 2.358, 0.047)), V((0.122, 0.162, 0.150))   # под полкой стойки авионики (z 0,14)
RELAY, RELAY_SIZE = V((0.225, 2.300, 0.215)), V((0.12, 0.055, 0.11))
EXT_POWER = V((0.262, 2.335, 0.095))            # разъём наземного питания на левом борту (MSFS)
ECU_BATT = V((0.0, 3.25, 0.15))                 # два блока 12 В рядом, поперёк
REGULATOR = V((0.31, -0.09, -0.02))             # под креслом пилота
ECU_RELAY = V((-0.075, -0.91, 0.17))            # на полке приборной доски
EECU = (V((-0.35, -1.18, 0.15)), V((-0.09, -1.13, 0.33)))
FUSE100 = V((0.20, -1.245, 0.08))               # предохранитель 100 А и датчик тока — моторный отсек, слева на перегородке
GROMMET = {1: V((0.20, -1.195, -0.05)), -1: V((-0.16, -1.195, -0.07))}   # проходы жгутов сквозь перегородку
ALT_TERM = V((0.165, -1.507, -0.005))           # клемма B+ генератора (powerplant.py: ALT)
STARTER_TERM = V((-0.210, -1.635, 0.262))       # клемма тягового реле стартера
ENGINE_HARNESS_END = V((-0.10, -1.50, 0.36))    # жгут датчиков и форсунок: к рампе на двигателе
CB_BACK = V((-0.385, -0.735, 0.455))            # за панелью автоматов защиты
CB_PANEL = (V((-0.47, -0.70, 0.373)), V((-0.30, -0.70, 0.544)))
CABIN_LIGHT = V((-0.525, -0.79, 0.253))         # разъём освещения кабины у петли фонаря (MSFS)
LIGHTS = {'LDG': V((4.73, -0.07, 0.195)), 'TAXI': V((4.90, -0.08, 0.208)),
          'NAV_L': V((5.78, 0.34, 0.289)), 'NAV_R': V((-5.78, 0.34, 0.289))}


def P(name, ru, m, doc):
    return Part(name, ru, M[m], COL, True, doc)


def cable(name, ru, pts, r, mat, doc, lugs=True, bend=None):
    p = P(name, ru, mat, doc)
    path = fillet(pts, bend or max(0.02, r * 6))
    Pp, T = sweep(p, path, r, 0, segs=10 if r < 0.004 else 14)
    if lugs:
        for q, t in ((Pp[0], -T[0]), (Pp[-1], T[-1])):
            cyl(p, q, q + t * 0.018, r * 1.25, p.m(M['copper']), segs=10)                 # опрессованный наконечник
    if mat == 'harness':
        L = lib.path_len(path)
        for k in range(1, int(L / 0.08)):
            q, t = lib.along(path, k * 0.08)
            ring_tube(p, q, t, r + 0.0012, r - 0.0005, 0.003, p.m(M['black']), segs=12)  # стяжки
    p.done()
    CHECKS.append((name, path, r))
    RT.set_extra(ref._bvh([o for o in COL.all_objects if o.type == 'MESH']))
    return path


def route(a, da, b, db, r, lo, hi, stub=0.02, relax=(), step=None, hidden=True):
    a, b, da, db = V(a), V(b), V(da).normalized(), V(db).normalized()
    a0, b0 = a + da * stub, b - db * stub
    old = RT.step
    RT.step = step or old
    try:
        for hid in ((True, False) if hidden else (False,)):
            mid = RT.route(a0, b0, r, lo, hi, hidden=hid, relax=relax, max_nodes=900000)
            if mid:
                if hidden and not hid:
                    print(f'ROUTE visible {tuple(round(v, 3) for v in a)} → {tuple(round(v, 3) for v in b)}')
                return [a] + mid + [b]
    finally:
        RT.step = old
    raise SystemExit(f'нет трассы {tuple(round(v, 3) for v in a)} → {tuple(round(v, 3) for v in b)}')


def batteries():
    c, s = BATT, BATT_SIZE
    p = P('Main battery 24 V 13.6 Ah', 'Основная батарея 24 В, 13,6 А·ч, герметичная: в хвостовой части слева, за рамой багажного отсека',
          'batt', 'AMM 24-00 2.A, 24-31, рис. 1')
    box(p, c, tuple(s), Matrix.Identity(3), 0, bevel=0.004)
    box(p, c + V((0, 0, s.z / 2 + 0.004)), (s.x - 0.01, s.y - 0.01, 0.008), Matrix.Identity(3), p.m(M['lid']), bevel=0.002)
    cyl(p, c + V((0, -s.y / 2 + 0.02, s.z / 2 + 0.008)), c + V((0, s.y / 2 - 0.02, s.z / 2 + 0.008)), 0.004, p.m(M['black']), segs=8)  # ручка
    p.done()
    term = {}
    for sg, key, mat in ((1, '+', 'red'), (-1, '-', 'blk')):
        q = c + V((sg * (s.x / 2 - 0.022), -s.y / 2 + 0.025, s.z / 2 + 0.008))   # у передней кромки: над задней — полка
        t = P(f'Main battery terminal {key}', f'Клемма {key} основной батареи под резиновым колпачком', mat, 'AMM 24-31 2.')
        cyl(t, q, q + V((0, 0, 0.022)), 0.011, 0, segs=16)
        t.done()
        term[key] = q + V((0, 0, 0.022))
    p = P('Main battery tray and hold-down strap', 'Поддон основной батареи и прижимная лента с болтами', 'strap', 'AMM 24-31 рис. 1')
    box(p, c - V((0, 0, s.z / 2 + 0.004)), (s.x + 0.016, s.y + 0.016, 0.006), Matrix.Identity(3), p.m(M['alu']), bevel=0.002)
    for sy in (-0.035, 0.035):
        pts = [c + V((-s.x / 2 - 0.004, sy, -s.z / 2)), c + V((-s.x / 2 - 0.004, sy, s.z / 2 + 0.012)),
               c + V((s.x / 2 + 0.004, sy, s.z / 2 + 0.012)), c + V((s.x / 2 + 0.004, sy, -s.z / 2))]
        for q0, q1 in zip(pts, pts[1:]):
            box(p, (q0 + q1) / 2, (max(abs(q1.x - q0.x), 0.004), 0.025, max(abs(q1.z - q0.z), 0.003)), Matrix.Identity(3), 0)
    p.done()
    # резервная батарея EECU: два блока 12 В 7,2 А·ч последовательно
    e = ECU_BATT
    p = P('ECU backup battery (2 × 12 V 7.2 Ah)', 'Резервная батарея EECU: два блока 12 В 7,2 А·ч последовательно, за первым шпангоутом; питает ECU B и её топливный насос, возбуждает генератор',
          'batt', 'AMM 24-31 3., 24-00 2.A(3)')
    for sx in (-0.036, 0.036):
        box(p, e + V((sx, 0, 0)), (0.065, 0.151, 0.094), Matrix.Identity(3), 0, bevel=0.003)
    box(p, e - V((0, 0, 0.050)), (0.16, 0.165, 0.006), Matrix.Identity(3), p.m(M['alu']), bevel=0.002)
    box(p, e + V((0, 0, 0.049)), (0.16, 0.025, 0.004), Matrix.Identity(3), p.m(M['strap']))
    cyl(p, e + V((-0.05, 0.06, 0.047)), e + V((0.05, 0.06, 0.047)), 0.004, p.m(M['power']), segs=8)   # перемычка между блоками
    p.done()
    return term, e + V((0.05, -0.06, 0.052)), e + V((-0.05, -0.06, 0.052))


def relay_box():
    c, s = RELAY, RELAY_SIZE
    p = P('Relay junction box (battery relay, external power relay, bus bar)', 'Релейная коробка на раме багажного отсека: реле батареи, реле внешнего питания, шина; питание шины батареи, стартера и наземного питания',
          'box', 'AMM 24-00 2.B(4), 24-40')
    box(p, c, tuple(s), Matrix.Identity(3), 0, bevel=0.004)
    box(p, c - V((0, s.y / 2 + 0.003, 0)), (s.x + 0.02, 0.004, s.z + 0.02), Matrix.Identity(3), p.m(M['black']), bevel=0.001)   # фланец на раме
    ports = {}
    for k, (dx, dz) in enumerate(((-0.035, -0.035), (0.0, -0.035), (0.035, -0.035), (-0.035, 0.035), (0.035, 0.035))):
        q = c + V((dx, s.y / 2, dz))
        cyl(p, q, q + V((0, 0.012, 0)), 0.006, p.m(M['steel']), segs=10)
        ports[k] = q + V((0, 0.012, 0))
    p.done()
    # разъём наземного питания
    h, n = R.hit((0, EXT_POWER.y, EXT_POWER.z), (1, 0, 0))
    n = n.normalized()
    p = P('External power receptacle', 'Разъём наземного питания на левом борту у релейной коробки: +, − и управляющий штырь', 'black', 'AMM 24-40')
    cyl(p, h - n * 0.004, h - n * 0.05, 0.024, 0, segs=24)
    for dz in (-0.009, 0.0, 0.009):
        cyl(p, h - n * 0.01 + V((0, 0, dz)), h - n * 0.03 + V((0, 0, dz)), 0.003, p.m(M['copper']), segs=8)
    p.done()
    return ports, h - n * 0.05, -n


def regulator_and_relays():
    p = P('Alternator regulator', 'Регулятор генератора под креслом пилота: широтно-импульсно управляет током возбуждения', 'black', 'AMM 24-30 2.E')
    box(p, REGULATOR, (0.10, 0.08, 0.04), Matrix.Identity(3), 0, bevel=0.004)
    for k in range(6):
        box(p, REGULATOR + V((-0.04 + k * 0.016, 0, 0.022)), (0.004, 0.07, 0.006), Matrix.Identity(3), 0)   # рёбра радиатора
    p.done()
    p = P('ECU backup relay (instrument panel shelf)', 'Реле резервной батареи EECU на полке приборной доски; цепь защищена предохранителем 32 А', 'black', 'AMM 24-31 3.')
    box(p, ECU_RELAY, (0.05, 0.04, 0.04), Matrix.Identity(3), 0, bevel=0.003)
    p.done()
    p = P('Alternator 100 A fuse and current sensor', 'Предохранитель 100 А и датчик тока генератора между клеммой генератора и шиной EECU', 'black', 'AMM 24-30 2.C, 2.D')
    box(p, FUSE100, (0.07, 0.03, 0.045), Matrix.Identity(3), 0, bevel=0.003)
    cyl(p, FUSE100 + V((0.045, 0, 0)), FUSE100 + V((0.065, 0, 0)), 0.013, p.m(M['alu']), segs=16)
    p.done()
    lo, hi = EECU
    c = (lo + hi) / 2
    p = P('EECU (ECU A + ECU B, VOTER)', 'Электронный блок управления двигателем EECU: два канала ECU A и ECU B и схема выбора', 'ecu', 'AMM 76-00, 24-00')
    box(p, c, tuple(hi - lo), Matrix.Identity(3), 0, bevel=0.005)
    conns = []
    for k, x in enumerate((-0.30, -0.22, -0.14)):
        q = V((x, hi.y, 0.19))
        cyl(p, q, q + V((0, 0.03, 0)), 0.018, p.m(M['conn']), segs=20)
        conns.append(q + V((0, 0.03, 0)))
    p.done()
    for s in (1, -1):
        g = GROMMET[s]
        p = P(f'Firewall grommet (cables) {"LH" if s > 0 else "RH"}', 'Огнестойкий проход кабелей сквозь противопожарную перегородку', 'steel', 'AMM 24-00, 71-00')
        cyl(p, g - V((0, 0.02, 0)), g + V((0, 0.02, 0)), 0.018, 0, segs=20)
        ring_tube(p, g + V((0, 0.012, 0)), V((0, 1, 0)), 0.026, 0.014, 0.004, 0, segs=20)
        p.done()
    return conns


def cb_panel():
    lo, hi = CB_PANEL
    p = P('Circuit-breaker bus bars (rear of the instrument panel)', 'Шины за панелью автоматов защиты справа на приборной доске: металлические полосы, соединяющие ряды автоматов',
          'copper', 'AMM 24-60')
    for z in (0.395, 0.435, 0.475, 0.515):
        box(p, V(((lo.x + hi.x) / 2, lo.y - 0.012, z)), (hi.x - lo.x - 0.01, 0.002, 0.010), Matrix.Identity(3), 0)
    box(p, V(((lo.x + hi.x) / 2, lo.y - 0.004, (lo.z + hi.z) / 2)), (hi.x - lo.x, 0.004, hi.z - lo.z), Matrix.Identity(3), p.m(M['black']))
    p.done()


def build():
    term, ecu_p, ecu_n = batteries()
    ports, ext_in, ext_d = relay_box()
    conns = regulator_and_relays()
    cb_panel()
    rear = ((-0.30, 1.9, -0.12), (0.30, 2.40, 0.30))
    # короткие силовые кабели у батареи
    pts = route(term['+'], (0, 0, 1), ports[0], (0, -1, 0), 0.006, *rear, stub=0.015, relax=[(term['+'], 0.03), (ports[0], 0.03)], step=0.008)
    cable('Battery (+) cable to battery relay', 'Кабель + основной батареи к реле батареи в релейной коробке', pts, 0.006, 'power', 'AMM 24-00 2.A(1)')
    stud = V((0.05, 2.278, -0.06))
    pts = route(term['-'], (0, 0, 1), stud, (0, -1, 0), 0.005, *rear, stub=0.015, relax=[(term['-'], 0.03), (stud, 0.03)], step=0.008)
    cable('Battery (−) ground strap', 'Перемычка − основной батареи на точку массы у рамы багажного отсека', pts, 0.005, 'braid', 'AMM 24-00 2.A(1)', lugs=True)
    pts = route(ext_in, ext_d, ports[1], (0, -1, 0), 0.005, *rear, stub=0.015, relax=[(ext_in, 0.03), (ports[1], 0.03)], step=0.008)
    cable('External power cable to external power relay', 'Кабель от разъёма наземного питания к реле внешнего питания', pts, 0.005, 'power', 'AMM 24-40')
    # к двигателю: стартер
    fwd = ((-0.50, -1.19, -0.27), (0.50, 2.40, 0.70))
    g = GROMMET[-1]
    pts = route(ports[2], (0, 1, 0), g + V((0, 0.03, 0)), (0, -1, 0), 0.007, *fwd, step=0.02, relax=[(ports[2], 0.03)])
    eng = ((-0.45, -1.80, -0.25), (0.45, -1.20, 0.60))
    pts2 = route(g - V((0, 0.03, 0)), (0, -1, 0), STARTER_TERM, (0, -1, 0), 0.007, *eng, step=0.012, hidden=False,
                 relax=[(STARTER_TERM, 0.03)])
    cable('Starter cable (relay junction box → starter relay)', 'Кабель стартера: шина релейной коробки — под полом — проход в перегородке — тяговое реле стартера',
          pts + pts2, 0.007, 'power', 'AMM 24-00 2.B(4), 80-10')
    # основной жгут: релейная коробка → шина батареи за панелью автоматов
    pts = route(ports[3], (0, 1, 0), CB_BACK, (0, 1, 0), 0.010, *fwd, step=0.02, relax=[(ports[3], 0.04), (CB_BACK, 0.04)])
    cable('Main wiring harness (relay junction box → circuit-breaker panel)', 'Основной жгут: релейная коробка — шина батареи и автоматы защиты справа на приборной доске',
          pts, 0.010, 'harness', 'AMM 24-60')
    # генератор → предохранитель 100 А → проход → шина EECU
    gL = GROMMET[1]
    pts = route(ALT_TERM, (0, -1, 0), FUSE100 + V((-0.045, 0, 0)), (1, 0, 0), 0.005, *eng, step=0.012, hidden=False,
                relax=[(ALT_TERM, 0.03), (FUSE100, 0.06)])
    cable('Alternator output cable → 100 A fuse', 'Кабель генератора к предохранителю 100 А', pts, 0.005, 'power', 'AMM 24-30')
    pts = route(FUSE100 + V((0.065, 0, 0)), (1, 0, 0), gL - V((0, 0.03, 0)), (0, 1, 0), 0.005, *eng, step=0.012, hidden=False,
                relax=[(FUSE100, 0.07), (gL, 0.04)])
    pts2 = route(gL + V((0, 0.03, 0)), (0, 1, 0), CB_BACK + V((0.02, 0, -0.02)), (0, 1, 0), 0.005, *fwd, step=0.015,
                 relax=[(CB_BACK, 0.05)])
    cable('Alternator cable → ECU bus (instrument panel)', 'Кабель от предохранителя 100 А сквозь перегородку к шине EECU за панелью автоматов', pts + pts2, 0.005, 'power', 'AMM 24-00, 24-30')
    # регулятор: возбуждение генератора и управление
    pts = route(REGULATOR + V((0, -0.04, 0)), (0, -1, 0), gL + V((0.012, 0.03, 0.01)), (0, -1, 0), 0.0025, *fwd, step=0.015,
                relax=[(REGULATOR, 0.06), (gL, 0.04)])
    pts2 = route(gL - V((-0.012, 0.03, -0.01)), (0, -1, 0), ALT_TERM + V((0, 0.0, 0.04)), (0, -1, 0), 0.0025, *eng, step=0.012, hidden=False,
                 relax=[(ALT_TERM, 0.05)])
    cable('Alternator field and sense wires (regulator)', 'Провода регулятора: возбуждение генератора и контроль напряжения, через проход в перегородке', pts + pts2, 0.0025, 'thin', 'AMM 24-30 2.E', lugs=False)
    pts = route(REGULATOR + V((0.05, 0, 0)), (1, 0, 0), CB_BACK + V((0.04, 0, 0.02)), (0, 1, 0), 0.0025, *fwd, step=0.015,
                relax=[(REGULATOR, 0.06), (CB_BACK, 0.05)])
    cable('Alternator regulator control wires (ENGINE MASTER)', 'Провода регулятора к выключателю ENGINE MASTER и предохранителю 10 А', pts, 0.0025, 'thin', 'AMM 24-30, 24-31 3.', lugs=False)
    # резервная батарея EECU → реле на полке доски → EECU
    pts = route(ecu_p, (0, 0, 1), ECU_RELAY + V((0, 0.02, 0)), (0, -1, 0), 0.004, (-0.45, -1.19, -0.27), (0.45, 3.40, 0.70), step=0.02,
                relax=[(ecu_p, 0.04), (ECU_RELAY, 0.05)])
    cable('ECU backup battery cable → ECU backup relay', 'Кабель резервной батареи EECU к реле на полке приборной доски', pts, 0.004, 'power', 'AMM 24-31 3.')
    pts = route(ecu_n, (0, 0, 1), V((-0.02, 3.13, 0.20)), (0, -1, 0), 0.004, (-0.2, 3.0, -0.05), (0.2, 3.4, 0.3), step=0.008,
                relax=[(ecu_n, 0.04)])
    cable('ECU backup battery ground', 'Масса резервной батареи EECU на шпангоут', pts, 0.004, 'ground', 'AMM 24-31 3.')
    pts = route(ECU_RELAY + V((-0.03, 0, 0)), (-1, 0, 0), conns[2], (0, -1, 0), 0.004, (-0.45, -1.19, 0.0), (0.1, -0.70, 0.45), step=0.01,
                relax=[(ECU_RELAY, 0.05), (conns[2], 0.04)])
    cable('ECU backup relay → EECU (ECU B)', 'Питание ECU B от реле резервной батареи', pts, 0.004, 'power', 'AMM 24-31 3.')
    # жгут двигателя: EECU → проход → датчики и форсунки
    pts = route(conns[0], (0, 1, 0), GROMMET[-1] + V((0.012, 0.03, 0.012)), (0, -1, 0), 0.008, (-0.45, -1.19, -0.20), (0.1, -1.0, 0.40), step=0.01,
                relax=[(conns[0], 0.05), (GROMMET[-1], 0.04)])
    pts2 = route(GROMMET[-1] + V((0.012, -0.03, 0.012)), (0, -1, 0), ENGINE_HARNESS_END, (0, -1, 0.3), 0.008, *eng, step=0.012, hidden=False,
                 relax=[(ENGINE_HARNESS_END, 0.04)])
    cable('Engine harness (EECU → firewall → sensors and injectors)', 'Жгут двигателя: EECU — проход в перегородке — датчики, форсунки, клапаны', pts + pts2, 0.008, 'harness', 'AMM 76-00, 73-00')
    # освещение кабины
    pts = route(CB_BACK + V((-0.06, 0, 0.04)), (0, -1, 0), CABIN_LIGHT, (-1, 0, 0), 0.003, (-0.56, -1.0, 0.2), (-0.2, -0.70, 0.6), step=0.008,
                relax=[(CB_BACK, 0.07), (CABIN_LIGHT, 0.03)])
    cable('Cabin light feed (circuit-breaker panel → canopy hinge connector)', 'Питание освещения кабины: панель автоматов — разъём у петли фонаря', pts, 0.003, 'thin', 'AMM 33-10', lugs=False)
    p = P('Cabin light connector (canopy hinge)', 'Разъём освещения кабины у петли фонаря', 'black', 'AMM 33-10')
    box(p, CABIN_LIGHT, (0.02, 0.02, 0.016), Matrix.Identity(3), 0, bevel=0.002)
    p.done()
    # жгуты огней в крыльях: от шин за доской в носок центроплана и по носку крыла
    for s in (1, -1):
        tag = 'LH' if s > 0 else 'RH'
        root = V((s * 0.60, -0.26, -0.03))
        lo, hi = (min(s * 0.05, s * 0.62), -1.0, -0.25), (max(s * 0.05, s * 0.62), -0.10, 0.60)
        pts = route(CB_BACK + V((0, 0, -0.03)), (0, 1, 0), root, (s, 0, 0), 0.005, lo, hi, step=0.015, relax=[(CB_BACK, 0.07)])
        nav = LIGHTS['NAV_L' if s > 0 else 'NAV_R']
        wlo, whi = (min(s * 0.55, s * 5.9), -0.40, -0.20), (max(s * 0.55, s * 5.9), 0.45, 0.40)
        pts2 = route(root, (s, 0, 0), nav - V((s * 0.04, 0, 0)), (s, 0, 0), 0.005, wlo, whi, step=0.025, hidden=False)
        cable(f'Wing lighting harness {tag}', f'Жгут огней {"левого" if s > 0 else "правого"} крыла: за доской — носок центроплана — носок крыла — АНО и строб на законцовке',
              pts + pts2[1:], 0.005, 'harness', 'AMM 33-40, 24-60')
        if s > 0:
            for key, ru in (('LDG', 'посадочной фары'), ('TAXI', 'рулёжной фары')):
                q = LIGHTS[key] + V((0, 0.05, 0))
                best = min(range(len(pts2)), key=lambda i: (pts2[i] - q).length)
                pl = route(pts2[best], (0, 1, 0), q, (0, -1, 0), 0.0025, (4.3, -0.25, 0.0), (5.2, 0.2, 0.35), step=0.01, hidden=False,
                           relax=[(pts2[best], 0.03), (q, 0.03)])
                cable(f'Light feed → {key}', f'Отвод жгута к {ru} в носке левого крыла', pl, 0.0025, 'thin', 'AMM 33-40', lugs=False)


def check():
    for name, path, r in CHECKS:
        L = lib.path_len(path)
        n = max(8, int(L / 0.03))
        vis, worst = [], (9.0, None)
        for k in range(n + 1):
            q, _ = lib.along(path, L * k / n)
            if RT.seen(q, r):
                vis.append(round(L * k / n, 2))
            for tag, bvh in (('shell', R.shell), ('trim', TRIM), ('sys', SYS)):
                h = bvh.find_nearest(q, 0.5)
                if h[0] is not None and h[3] - r < worst[0]:
                    worst = (h[3] - r, (tag, tuple(round(v, 3) for v in q)))
        print(f'CHECK {name[:60]}: {len(vis)}/{n + 1} visible {vis[:5]}; min gap {worst[0] * 1000:.1f} mm {worst[1]}')
    for o in COL.all_objects:
        if o.type != 'MESH' or any(o.name == c[0] for c in CHECKS):
            continue
        vs = [o.matrix_world @ v.co for v in o.data.vertices][::2]
        worst = (9.0, None)
        for tag, bvh in (('shell', R.shell), ('trim', TRIM), ('sys', SYS)):
            for q in vs:
                h = bvh.find_nearest(q, 0.1)
                if h[0] is not None and h[3] < worst[0]:
                    worst = (h[3], tag)
        vis = sum(1 for q in vs[::4] if RT.seen(q, 0.0))
        print(f'PART {o.name[:60]}: min gap {worst[0] * 1000:.1f} mm ({worst[1]}), visible verts {vis}/{len(vs[::4])}')


build()
if os.environ.get('CHECK'):
    check()
dup = [o.name for o in COL.all_objects if '.0' in o.name[-4:]]
assert not dup, dup
size = ref.export(COL, OUT, R.lift)
with open(os.path.splitext(OUT)[0] + '.labels.json', 'w') as f:
    json.dump({'labels': lib.LABELS, 'materials': lib.MAT_RU}, f, ensure_ascii=False, indent=1)
print(f'ELECTRICAL_OK {OUT} {size / 1e6:.2f} MB, parts {len(COL.all_objects) - 1}')
