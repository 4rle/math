"""Rebuild the bundled catalog from the two user-provided UTF-8 CSV files."""
import argparse
import csv
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
rows = []
seen = set()
for book, filename in [('1A', 'focusgold-1a.csv'), ('2B', 'focusgold-2bc.csv')]:
    with (root / 'data' / filename).open(encoding='utf-8-sig', newline='') as file:
        for row in csv.DictReader(file):
            number = row['問題番号']
            assert re.fullmatch(r'[1-9]\d*|[BC][1-9]\d*\.[1-9]\d*', number), row
            assert row['難易度'] in ['1', '2', '3', '4'], row
            key = (book, number)
            assert key not in seen, key
            seen.add(key)
            rows.append(dict(book=book, number=int(number) if number.isdigit() else number,
                             stars=int(row['難易度']), title=row['タイトル'], page=row['ページ']))
content = json.dumps(rows, ensure_ascii=False, indent=2) + '\n'
target = root / 'src' / 'data' / 'focusgold.json'
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
if parser.parse_args().check:
    assert target.read_text() == content, 'Bundled catalog differs from source CSV; rebuild it.'
else:
    target.write_text(content)
print(f'{len(rows)} problems verified (1A: 303, 2BC: 411).')
