# Free Moto Parking NYC

This map shows where you can park your motorcycle/Vespa for free in NYC

[parkgratis.com](https://parkgratis.com)

[More info](https://unfoundedlabs.com/blog/nyc-moto-parking)

### Serving the Map

To run locally:
1. `cd app`
2. `ruby -run -e httpd . -p 4000`


### Data Parsing

1. Put input data into  `data_processing/data/input` and name it `parking.csv` ([full source](https://data.cityofnewyork.us/Transportation/Parking-Regulation-Locations-and-Signs/nfid-uabd/about_data))
2. Run `ruby data_processing/csv_parser.rb`
3. Outputs to `data_processing/data/output`.
4. Copy output file into `app/data` and rename `source.csv`
