# filter_signs.rb
require 'csv'
require 'time'
require_relative 'coordinate_converter'

INPUT           = File.expand_path('data/input/parking.csv', __dir__)
OUTPUT_BASENAME = "asp_90min_#{Time.now.strftime('%Y%m%d_%H%M%S')}.csv"
OUTPUT          = File.expand_path(File.join('data/output', OUTPUT_BASENAME), __dir__)

TIME_REGEX      = /([0-9]{1,2}(?::[0-9]{2})?(?:AM|PM))/
END_TIME_REGEX  = /-([0-9]{1,2}(?::[0-9]{2})?(?:AM|PM))/
TARGET_DURATION = 90.0

def parse_time(str)
  return nil if str.nil? || str.strip.empty?

  s = str.strip.upcase

  # Handle "8AM" and "7:30AM"
  begin
    Time.strptime(s, "%I:%M%p")
  rescue ArgumentError
    Time.strptime(s, "%I%p")
  end
end

def extract_time_strings(desc)
  return [nil, nil] if desc.nil? || desc.strip.empty?

  upcase_desc = desc.upcase
  start_match = upcase_desc[TIME_REGEX, 1]
  end_match   = upcase_desc[END_TIME_REGEX, 1]

  [start_match, end_match]
end

matched = 0

CSV.open(OUTPUT, 'w') do |out|
  first_row = true

  CSV.foreach(INPUT, headers: true) do |row|
    # 1) Filter on BROOM in the sign description (ASP indicator)
    desc = row['sign_description'] || row['Sign Description'] || ''
    next unless desc.upcase.include?('BROOM')

    # 2) Extract start/end times from the description itself
    start_str, end_str = extract_time_strings(desc)

    start_t = parse_time(start_str)
    end_t   = parse_time(end_str)

    range_minutes =
      if start_t && end_t
        ((end_t - start_t) / 60.0).round(2)
      else
        nil
      end

    # 3) Keep only rows that have a 90 minute ASP window
    next unless range_minutes && (range_minutes - TARGET_DURATION).abs < 0.01

    lon, lat = CoordinateConverter.state_plane_to_wgs84_lon_lat(row['sign_x_coord'], row['sign_y_coord'])
    next unless lon && lat

    # 4) On the first row, write headers + our new columns
    if first_row
      out << ['borough', 'on_street', 'from_street', 'to_street', 'sign_description', 'sign_x_coord_lat', 'sign_y_coord_lon']
      first_row = false
    end

    matched += 1

    # 5) Write the filtered row with the computed value (lat/lon flipped per column names requested)
    out << [
      row['borough'],
      row['on_street'],
      row['from_street'],
      row['to_street'],
      desc,
      lat,
      lon
    ]
  end
end

puts "Done. Wrote #{matched} ASP rows with 90-minute ranges to #{OUTPUT}"
