# Output schema

The files produced here are filtered and reshaped versions of the input CSVs in `data/input/`.

- **Input schema (example: `sample_parking_signs.csv`)**: raw DOT export with many fields such as `order_number`, `record_type`, `order_type`, `borough`, `on_street`, `from_street`, `to_street`, `side_of_street`, `sign_description`, `sign_x_coord`, `sign_y_coord`, and other administrative columns.
- **Output schema (example: `asp_90min_YYYYMMDD_HHMMSS.csv`)**: minimal, map-ready columns after filtering for ASP broom signs with a 90-minute window and converting coordinates from State Plane (EPSG:2263, feet) to WGS84 lat/lon:
  - `borough`
  - `on_street`
  - `from_street`
  - `to_street`
  - `sign_description`
  - `sign_x_coord_lat` (latitude)
  - `sign_y_coord_lon` (longitude)
  - `side_of_street` (when supplied by the source; older exports omit this column)

Other raw columns are dropped; coordinate fields are renamed and converted to geographic degrees for mapping.

After copying an export to `app/data/source.csv`, run `python3 data_processing/build_map_data.py` from the repository root. It produces dictionary-encoded JSON per borough and a manifest in `app/data/map/`. The optional `--source-updated YYYY-MM-DD` records the download date; use `YYYY-MM` for an approximate month. The current snapshot uses `2026-08` (around August 2026).
