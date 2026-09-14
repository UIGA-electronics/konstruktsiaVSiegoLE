"""Генератор QR-кодов на каждый экран пособия.

Запуск (после публикации сайта):

    pip install "qrcode[pil]"
    python tools/make_qr.py https://ВАШ-ЛОГИН.github.io/servo-lab/

Создаёт папку qr/ с отдельным PNG на каждый адрес: главная, каждая тема
и каждый экран готовой темы. Их можно вставлять в бумажную методичку
рядом с соответствующим разделом.
"""

import json
import os
import re
import sys

try:
    import qrcode
except ImportError:
    sys.exit('Не установлен qrcode. Выполните:  pip install "qrcode[pil]"')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'qr')


def slug(text):
    """Имя файла из русского заголовка: только латиница, цифры и дефисы."""
    text = re.sub(r'[^0-9A-Za-zА-Яа-яЁё]+', '-', text).strip('-').lower()
    return text[:60] or 'screen'


def targets(base):
    menu_path = os.path.join(ROOT, 'content', 'menu.json')
    with open(menu_path, encoding='utf-8') as f:
        menu = json.load(f)

    yield '00-home', base, 'Главная'
    for part in menu['parts']:
        for topic in part['topics']:
            num = str(topic['num']).zfill(2)
            yield (num + '-' + slug(topic['title']),
                   base + '#' + topic['id'],
                   topic['title'])
            for i, screen in enumerate(topic.get('screens', []), 1):
                yield (num + '-' + str(i) + '-' + slug(screen.get('short', screen['title'])),
                       base + '#' + screen['id'],
                       screen['title'])


def main():
    if len(sys.argv) < 2:
        sys.exit('Укажите базовый адрес сайта, например:\n'
                 '  python tools/make_qr.py https://user.github.io/servo-lab/')

    base = sys.argv[1]
    if not base.endswith('/'):
        base += '/'

    os.makedirs(OUT, exist_ok=True)
    count = 0

    for name, url, title in targets(base):
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=2,
        )
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color='#17202a', back_color='white')
        path = os.path.join(OUT, name + '.png')
        img.save(path)
        print('{:<46} {}'.format(os.path.basename(path), url))
        count += 1

    print('\nГотово: {} кодов в папке {}'.format(count, OUT))
    print('Проверьте хотя бы один телефоном перед печатью.')


if __name__ == '__main__':
    main()
