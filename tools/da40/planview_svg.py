"""План DA 40 NG: маски planview.py → SVG для схемы выбора систем (assets/img/da40-plan.svg).

PYTHONPATH=<каталог с contourpy и shapely> python3 tools/da40/planview_svg.py MASK_DIR [OUT.svg]

Линии планера — границы деталей обшивки, видимых сверху (ids.png): закрылки, элероны,
руль высоты, фонарь, капот получаются сами — каждая деталь исходника своим цветом.
Системы — заливки силуэтов (sys-*.png) с id «sys-<раздел>», их подсвечивает сайт.
Нужны numpy, Pillow, contourpy, shapely (pip install contourpy shapely).
"""
import json
import os
import sys

import contourpy
import numpy as np
from PIL import Image, ImageFilter
from shapely.geometry import Polygon
from shapely.ops import unary_union

SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'img', 'da40-plan.svg')
K = 0.5                                   # масштаб SVG: пикселей маски → единиц viewBox
with open(os.path.join(SRC, 'frame.json')) as f:
    FR = json.load(f)
W, H = FR['w'], FR['h']


def polys(mask, close=0.0, simplify=0.8, min_area=40.0):
    """Многоугольники маски (с дырами), сглаженные: close — «закрыть» щели шириной до close px."""
    z = np.pad(mask.astype(np.float64), 1)
    gen = contourpy.contour_generator(z=z, fill_type=contourpy.FillType.OuterOffset)
    pts, offs = gen.filled(0.5, 1.5)
    out = []
    for p, o in zip(pts, offs):
        rings = [p[o[i]:o[i + 1]] - 1 for i in range(len(o) - 1)]
        if len(rings[0]) < 4:
            continue
        g = Polygon(rings[0], [r for r in rings[1:] if len(r) >= 4])
        if not g.is_valid:
            g = g.buffer(0)
        out.append(g)
    g = unary_union(out) if out else Polygon()
    if close:
        g = g.buffer(close, join_style=1).buffer(-close, join_style=1)
    g = g.simplify(simplify, preserve_topology=True)
    geoms = getattr(g, 'geoms', [g])
    return [q for q in geoms if not q.is_empty and q.area >= min_area]


def ring_d(coords):
    c = np.asarray(coords) * K
    pts = []
    for x, y in np.rint(c[:-1]).astype(int):
        if not pts or pts[-1] != (x, y):
            pts.append((x, y))
    return 'M' + 'L'.join(f'{x} {y}' for x, y in pts) + 'Z' if len(pts) > 2 else ''


def poly_d(p):
    return ring_d(p.exterior.coords) + ''.join(ring_d(r.coords) for r in p.interiors)


# ── планер ───────────────────────────────────────────────────────────────
img = np.asarray(Image.open(os.path.join(SRC, 'ids.png')).convert('RGB')).astype(np.int32)
# 8 уровней на канал: преобразование цвета при записи PNG нелинейно, поэтому уровни находим
# по самим значениям (красный канал перебирает все 8: id % 8) — кластеры по разрывам
vals = np.unique(img[..., 0])
centres, grp = [], [vals[0]]
for v in vals[1:]:
    if v - grp[-1] > 6:
        centres.append(np.mean(grp))
        grp = []
    grp.append(v)
centres.append(np.mean(grp))
centres = np.array(centres)
assert len(centres) == 8, centres
q = np.abs(img[..., None] - centres[None, None, None, :]).argmin(-1).astype(np.int32)
code = q[..., 0] + q[..., 1] * 8 + q[..., 2] * 64              # 0 — фон
# совпадающие грани соседних деталей (законцовки, закрылки) дают «рябь» цветов: мода по окну 5×5
uniq = np.unique(code)
idx = np.searchsorted(uniq, code).astype(np.uint8)
idx = np.asarray(Image.fromarray(idx, 'L').filter(ImageFilter.ModeFilter(5)))
code = uniq[idx]
with open(os.path.join(SRC, 'ids.json')) as f:
    names = {int(k.split(',')[0]) + int(k.split(',')[1]) * 8 + int(k.split(',')[2]) * 64: v for k, v in json.load(f).items()}

outline = polys(code > 0, close=1.5, simplify=0.6, min_area=200)
# линии деталей: чистый контур силуэта детали (sil-*.png), но только там, где деталь видна сверху
# (её область в ids.png, расширенная на 3 px) — без скрытых линий и без «ряби» совпадающих граней
with open(os.path.join(SRC, 'sil.json')) as f:
    sil = {int(k.split(',')[0]) + int(k.split(',')[1]) * 8 + int(k.split(',')[2]) * 64: v for k, v in json.load(f).items()}
lines = []
for cid, fn in sorted(sil.items()):
    full = polys(np.asarray(Image.open(os.path.join(SRC, fn)).convert('L')) > 127, close=1.0, simplify=0.6, min_area=60)
    vis = polys(code == cid, close=3.0, simplify=1.0, min_area=30)
    fa, va = sum(p.area for p in full), sum(p.area for p in vis)
    if not full or va < 0.2 * fa:
        continue                                                # почти вся деталь под другими — её не рисуем
    keep = unary_union(vis).buffer(3.0)
    for p in full:
        edge = p.boundary.intersection(keep)
        for ln in getattr(edge, 'geoms', [edge]):
            if ln.is_empty or ln.length < 6 or ln.geom_type not in ('LineString', 'LinearRing'):
                continue
            c = np.rint(np.asarray(ln.simplify(0.6).coords) * K).astype(int)
            pts = [tuple(c[0])] + [tuple(v) for a_, v in zip(c, c[1:]) if tuple(v) != tuple(a_)]
            if len(pts) > 1:
                lines.append('M' + 'L'.join(f'{x} {y}' for x, y in pts))

# ── системы ──────────────────────────────────────────────────────────────
systems = {}
for fn in sorted(os.listdir(SRC)):
    if not (fn.startswith('sys-') and fn.endswith('.png')):
        continue
    sid = fn[4:-4]
    m = np.asarray(Image.open(os.path.join(SRC, fn)).convert('L')) > 127
    ps = polys(m, close=2.5, simplify=1.2, min_area=16)
    systems[sid] = ''.join(poly_d(p) for p in ps)
    print(f'SYS {sid}: {len(ps)} контуров, {int(m.sum())} px')

vw, vh = W * K, H * K
k = FR['px_per_m'] * K                                          # единиц viewBox на метр
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw:.0f} {vh:.0f}" data-m="{k:.2f}">',
       f'<g class="pl-outline"><path d="{"".join(poly_d(p) for p in outline)}"/></g>',
       '<g class="pl-lines">' + ''.join(f'<path d="{d}"/>' for d in lines) + '</g>',
       '<g class="pl-sys">' + ''.join(f'<path id="sys-{sid}" data-sys="{sid}" d="{d}"/>' for sid, d in systems.items()) + '</g>',
       '</svg>']
with open(OUT, 'w') as f:
    f.write('\n'.join(svg) + '\n')
print('PLAN_SVG_OK', OUT, os.path.getsize(OUT) // 1024, 'KB', len(lines), 'линий')
