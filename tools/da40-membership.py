"""Какой объект .blend в какой коллекции лежит — для нарезки модели на системы.

  blender -b DA40NG_Tundra.blend --python tools/da40-membership.py -- membership.json

или без окна Blender, через модуль bpy из pip:

  python tools/da40-membership.py -- membership.json

В GLB коллекций нет, остаются только узлы с именами объектов. Поэтому деление
на системы берём из самого .blend: там каждая система — отдельная коллекция
в «DA40 Systems», и это деление сделано по AMM, а не угадано по названиям.
Файл .blend при этом не сохраняется.
"""
import json, sys

import bpy

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out_path = args[-1] if args else 'membership.json'
blend = args[0] if len(args) > 1 else None
if blend:
    bpy.ops.wm.open_mainfile(filepath=blend, load_ui=False)

objects = {}


def walk(col, path):
    here = path + [col.name]
    for o in col.objects:
        objects.setdefault(o.name, {'type': o.type, 'cols': []})['cols'].append('/'.join(here))
    for ch in col.children:
        walk(ch, here)


for c in bpy.context.scene.collection.children:
    walk(c, [])

# Пояснение к системе живёт свойством коллекции — пригодится для текста страниц.
notes = {c.name: c['пояснение'] for c in bpy.data.collections if 'пояснение' in c.keys()}

with open(out_path, 'w', encoding='utf-8') as f:
    json.dump({'objects': objects, 'notes': notes}, f, ensure_ascii=False)
print('objects:', len(objects), 'notes:', len(notes), '->', out_path)
