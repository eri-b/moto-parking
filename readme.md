# Free Moto Parking NYC

This map shows where you can park your motorcycle/Vespa for free in NYC

[parkgratis.com](https://parkgratis.com)

[More info](https://unfoundedlabs.com/blog/nyc-moto-parking)

### Serving the Map

To run locally, run this command from the repository root:

```sh
ruby -run -e httpd app -p 4000
```

Then open [localhost:4000](http://localhost:4000).


### Data Parsing

1. Put input data into  `data_processing/data/input` and name it `parking.csv` ([full source](https://data.cityofnewyork.us/Transportation/Parking-Regulation-Locations-and-Signs/nfid-uabd/about_data))
2. Run `ruby data_processing/csv_parser.rb`
3. Outputs to `data_processing/data/output`.
4. Copy output file into `app/data` and rename `source.csv`.
5. Run `python3 data_processing/build_map_data.py` to regenerate the compact borough files served by the app. Python 3 is required only for this data preparation step.
   Pass `--source-updated YYYY-MM-DD` for a known download date, or `--source-updated YYYY-MM` for an approximate month. The current snapshot was downloaded around August 2026 (`--source-updated 2026-08`).

All four supported boroughs are always shown. Each borough loads once, and its locations are indexed for viewport queries. Nearby locations appear as slightly larger, unnumbered dots; zooming in reveals individual sign locations. All distinct sign details at a location are retained. Street side is included for new imports when supplied by DOT; the existing snapshot does not contain it.

### Checks

Run `node --test tests/*.test.cjs` and `python3 -m unittest discover -s tests -p 'test_*.py'`.
