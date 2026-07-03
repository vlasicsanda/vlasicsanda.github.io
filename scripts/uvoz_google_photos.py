# Uvoz fotografija iz dijeljenog Google Photos albuma.
# Pokreće ga GitHub Action kad admin zapiše zahtjev u data/import-request.json.
# Koristi samo standardnu biblioteku (bez instalacija).
import urllib.request
import re
import json
import os
import sys
import time
import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REQUEST = os.path.join(ROOT, 'data', 'import-request.json')
WORKS = os.path.join(ROOT, 'data', 'works.json')
IMAGES = os.path.join(ROOT, 'images')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}


def write_request(data):
    with open(REQUEST, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    with open(REQUEST, encoding='utf-8') as f:
        request = json.load(f)
    if request.get('status') != 'pending':
        print('Nema zahtjeva na čekanju — izlazim.')
        return

    url = request.get('url', '')
    if not re.match(r'^https://(photos\.app\.goo\.gl|photos\.google\.com)/', url):
        write_request({**request, 'status': 'error',
                       'error': 'Neispravan link na album.'})
        return

    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=60) as r:
            html = r.read().decode('utf-8', 'ignore')
        urls = sorted(set(re.findall(
            r'https://lh3\.googleusercontent\.com/pw/[A-Za-z0-9_-]+', html)))
        if not urls:
            write_request({**request, 'status': 'error',
                           'error': 'U albumu nisu pronađene fotografije. Provjeri da je link za dijeljenje ispravan.'})
            return

        with open(WORKS, encoding='utf-8') as f:
            works = json.load(f)
        known = {w.get('source') for w in works if w.get('source')}
        existing_ids = {w['id'] for w in works}
        fresh = [u for u in urls if u not in known]

        today = datetime.date.today().isoformat()
        stamp = time.strftime('%Y%m%d-%H%M%S')
        new_entries = []
        for n, u in enumerate(fresh, 1):
            dl = urllib.request.Request(u + '=w1600-h1600', headers=UA)
            with urllib.request.urlopen(dl, timeout=120) as r:
                data = r.read()
            fname = 'uvoz-%s-%02d.jpg' % (stamp, n)
            with open(os.path.join(IMAGES, fname), 'wb') as f:
                f.write(data)
            wid = 'uvoz-%s-%02d' % (stamp, n)
            k = 2
            while wid in existing_ids:
                wid = 'uvoz-%s-%02d-%d' % (stamp, n, k)
                k += 1
            existing_ids.add(wid)
            new_entries.append({
                'id': wid,
                'title': 'Nova slika %d' % n,
                'code': '', 'dimensions': '', 'technique': '', 'description': '',
                'price': '', 'priceMode': 'inquiry', 'status': 'dostupna',
                'collection': '', 'image': 'images/' + fname,
                'featured': False, 'created': today, 'source': u,
            })
            print('uvezeno:', fname)

        if new_entries:
            with open(WORKS, 'w', encoding='utf-8') as f:
                json.dump(new_entries + works, f, ensure_ascii=False, indent=2)

        write_request({
            'url': url, 'status': 'done',
            'imported': len(new_entries),
            'skipped': len(urls) - len(fresh),
            'finishedAt': datetime.datetime.now().isoformat(timespec='seconds'),
        })
        print('gotovo: uvezeno %d, preskočeno %d' % (len(new_entries), len(urls) - len(fresh)))
    except Exception as e:
        write_request({**request, 'status': 'error', 'error': str(e)[:300]})
        print('greška:', e, file=sys.stderr)


if __name__ == '__main__':
    main()
