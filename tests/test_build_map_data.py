import csv
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('builder', Path(__file__).resolve().parents[1] / 'data_processing/build_map_data.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class BuildMapDataTests(unittest.TestCase):
    def test_csv_round_trip_preserves_quotes_newlines_and_optional_side(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source.csv'
            fields = ['borough', 'on_street', 'from_street', 'to_street', 'sign_description', 'sign_x_coord_lat', 'sign_y_coord_lon', 'side_of_street']
            values = ['Manhattan', 'A, B STREET', 'FIRST', 'SECOND', 'SIGN "TEXT"\nMONDAY 9AM-10:30AM', '40.71581234', '-73.99701234', 'N']
            with source.open('w', newline='') as handle:
                writer = csv.writer(handle)
                writer.writerow(fields)
                writer.writerow(values)
            output = Path(directory) / 'output'
            builder.build(source, output, '2026-10-26')
            data = json.loads((output / 'manhattan.json').read_text())
            row = data['rows'][0]
            self.assertEqual(row[:2], [40.715812, -73.997012])
            self.assertEqual([data['strings'][i] for i in row[2:]], values[1:5] + ['N'])
            manifest = json.loads((output / 'manifest.json').read_text())
            self.assertEqual(manifest['sourceUpdated'], '2026-10-26')
            self.assertEqual(manifest['boroughs']['Queens']['signs'], 0)

    def test_shipped_files_preserve_every_source_row(self):
        root = Path(__file__).resolve().parents[1] / 'app/data'
        with (root / 'source.csv').open(newline='') as handle:
            source = list(csv.DictReader(handle))
        for borough in builder.BOROUGHS:
            data = json.loads((root / 'map' / f'{borough.lower()}.json').read_text())
            original = [row for row in source if row['borough'].upper() == borough.upper()]
            self.assertEqual(len(data['rows']), len(original))
            for encoded, row in zip(data['rows'], original):
                self.assertEqual(encoded[:2], [round(float(row['sign_x_coord_lat']), 6), round(float(row['sign_y_coord_lon']), 6)])
                self.assertEqual([data['strings'][i] for i in encoded[2:]], [row.get(field, '').strip() for field in ('on_street', 'from_street', 'to_street', 'sign_description', 'side_of_street')])


if __name__ == '__main__':
    unittest.main()
