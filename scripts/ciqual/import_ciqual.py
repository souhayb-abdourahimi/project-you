#!/usr/bin/env python3
"""
Extracts the foods used by Project You from the official Ciqual table (ANSES).

The source file is read-only: values are copied verbatim (raw text kept next to the parsed
number), nothing is rounded, guessed or filled in. The script fails loudly when the file does
not have the expected structure.

    python3 -m pip install openpyxl
    python3 scripts/ciqual/import_ciqual.py           # writes src/domain/meals/ciqual/foods.generated.json
    python3 scripts/ciqual/import_ciqual.py --check   # fails if the committed JSON differs (CI)

Docs: docs/DATA_SOURCES.md, docs/DECISIONS.md D-020.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'data/ciqual/Table_Ciqual_2025_FR_2025_11_03.xlsx'
SOURCE_SHA256 = '5555c572fa3735991298d832d0427788fa69a11b4fd20a5d580d58942369fbb0'
MAPPING = ROOT / 'src/domain/meals/ciqual/mapping.json'
OUTPUT = ROOT / 'src/domain/meals/ciqual/foods.generated.json'

DATA_SHEET = 'composition nutritionnelle'
CODES_SHEET = 'codes INFOODS'
IDENTITY_COLUMNS = ['alim_grp_nom_fr', 'alim_ssgrp_nom_fr', 'alim_code', 'alim_nom_fr']

# Our field -> exact Ciqual component label (sheet "codes INFOODS", column const_nom_fr).
COMPONENTS = {
    'energyKcal': 'Energie, Règlement UE N° 1169/2011 (kcal/100 g)',
    'proteinG': 'Protéines, N x facteur de Jones (g/100 g)',
    'carbsG': 'Glucides (g/100 g)',
    'fatG': 'Lipides (g/100 g)',
    'fibreG': 'Fibres alimentaires (g/100 g)',
    'polyolsG': 'Polyols totaux (g/100 g)',
    'alcoholG': 'Alcool (éthanol) (g/100 g)',
    'organicAcidsG': 'Acides organiques (g/100 g)',
}
EXPECTED_ROWS = 3484

NUMBER = re.compile(r'^\d+(,\d+)?$')
BELOW = re.compile(r'^<\s*\d+(,\d+)?$')


def fail(message):
    sys.exit(f'Ciqual import refused: {message}')


def header_key(text):
    """Column headers wrap the component label on several lines and drop the '/'."""
    return ' '.join(str(text).replace('/', ' ').split())


def parse(raw):
    """Ciqual conventions: decimal comma, '-' = missing, 'traces', '< x' = below the limit."""
    if raw is None:
        return {'raw': None, 'value': None, 'status': 'missing'}
    text = str(raw).strip()
    if text == '-' or text == '':
        return {'raw': raw, 'value': None, 'status': 'missing'}
    if text == 'traces':
        return {'raw': raw, 'value': 0, 'status': 'traces'}
    if BELOW.match(text):
        return {'raw': raw, 'value': 0, 'status': 'below_limit'}
    if NUMBER.match(text):
        return {'raw': raw, 'value': float(text.replace(',', '.')), 'status': 'value'}
    fail(f'unexpected value format {raw!r}')


def main():
    check = '--check' in sys.argv
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if digest != SOURCE_SHA256:
        fail(f'source file changed (sha256 {digest}); review it and update SOURCE_SHA256 knowingly')

    book = openpyxl.load_workbook(SOURCE, read_only=True)
    if book.sheetnames != [DATA_SHEET, CODES_SHEET]:
        fail(f'unexpected sheets {book.sheetnames}')

    labels = {row[2] for row in book[CODES_SHEET].iter_rows(min_row=2, values_only=True) if row[2]}
    for label in COMPONENTS.values():
        if label not in labels:
            fail(f'component {label!r} is not listed in {CODES_SHEET!r}')

    rows = list(book[DATA_SHEET].iter_rows(values_only=True))
    header = [header_key(h) for h in rows[0]]
    columns = {}
    for name in IDENTITY_COLUMNS:
        if name not in header:
            fail(f'missing column {name}')
        columns[name] = header.index(name)
    for field, label in COMPONENTS.items():
        key = header_key(label)
        if header.count(key) != 1:
            fail(f'column for {label!r} found {header.count(key)} times')
        columns[field] = header.index(key)

    data = rows[1:]
    if len(data) != EXPECTED_ROWS:
        fail(f'{len(data)} food rows, expected {EXPECTED_ROWS}')
    by_code = {}
    for row in data:
        code = row[columns['alim_code']]
        if not isinstance(code, str) or not code.isdigit():
            fail(f'invalid alim_code {code!r}')
        if code in by_code:
            fail(f'duplicate alim_code {code}')
        by_code[code] = row

    mapping = json.loads(MAPPING.read_text())
    foods = {}
    for food_id, code in sorted(mapping.items(), key=lambda kv: int(kv[1])):
        row = by_code.get(code)
        if row is None:
            fail(f'{food_id}: alim_code {code} not in the table')
        foods[code] = {
            'code': code,
            'name': row[columns['alim_nom_fr']],
            'group': row[columns['alim_grp_nom_fr']],
            'subgroup': row[columns['alim_ssgrp_nom_fr']],
            'values': {field: parse(row[columns[field]]) for field in COMPONENTS},
        }

    output = {
        'source': {
            'publisher': 'ANSES',
            'dataset': 'Table de composition nutritionnelle des aliments Ciqual 2025',
            'file': SOURCE.name,
            'sha256': SOURCE_SHA256,
            'publishedOn': '2025-11-03',
            'url': 'https://ciqual.anses.fr/',
            'licence': 'Licence Ouverte / Open Licence (Etalab)',
            'rows': len(data),
            'components': COMPONENTS,
        },
        'foods': foods,
    }
    text = json.dumps(output, ensure_ascii=False, indent=2) + '\n'
    if check:
        if OUTPUT.read_text() != text:
            fail(f'{OUTPUT.relative_to(ROOT)} is out of date: run the script without --check')
        print(f'OK: {len(foods)} foods match {SOURCE.name}')
        return
    OUTPUT.write_text(text)
    missing = [(c, f) for c, food in foods.items() for f, v in food['values'].items() if v['status'] == 'missing']
    print(f'Wrote {len(foods)} foods to {OUTPUT.relative_to(ROOT)}; missing values: {missing or "none"}')


if __name__ == '__main__':
    main()
