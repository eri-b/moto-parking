"""Build compact, independently loadable borough files from the map source CSV."""
import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOROUGHS = ('Manhattan', 'Brooklyn', 'Queens', 'Bronx')


def build(source, output, source_updated=None):
    output.mkdir(parents=True, exist_ok=True)
    with source.open(newline='') as handle:
        records = list(csv.DictReader(handle))
    manifest = {'sourceUpdated': source_updated, 'boroughs': {}}
    for borough in BOROUGHS:
        strings, indices, rows = [], {}, []

        def intern(value):
            value = (value or '').strip()
            if value not in indices:
                indices[value] = len(strings)
                strings.append(value)
            return indices[value]

        for record in records:
            if record['borough'].upper() != borough.upper():
                continue
            lat, lng = float(record['sign_x_coord_lat']), float(record['sign_y_coord_lon'])
            if not (40 <= lat <= 42 and -75 <= lng <= -72):
                raise ValueError(f'Invalid NYC coordinates: {lat}, {lng}')
            rows.append([round(lat, 6), round(lng, 6), *(
                intern(record.get(field)) for field in
                ('on_street', 'from_street', 'to_street', 'sign_description', 'side_of_street')
            )])
        filename = f'{borough.lower()}.json'
        payload = {'strings': strings, 'rows': rows}
        (output / filename).write_text(json.dumps(payload, separators=(',', ':')) + '\n')
        manifest['boroughs'][borough] = {'file': filename, 'signs': len(rows)}
        print(f'{borough}: {len(rows):,} signs, {(output / filename).stat().st_size:,} bytes')
    (output / 'manifest.json').write_text(json.dumps(manifest, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'app/data/source.csv')
    parser.add_argument('--output', type=Path, default=ROOT / 'app/data/map')
    parser.add_argument('--source-updated', help='Download date: YYYY-MM-DD, or YYYY-MM for an approximate month')
    args = parser.parse_args()
    build(args.source, args.output, args.source_updated)
