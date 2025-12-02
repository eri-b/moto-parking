# filter_signs.rb
require 'csv'
require 'time'

INPUT  = 'signs_raw.csv'               # downloaded from Google Sheets
OUTPUT = 'signs_broom_with_range.csv'  # new smaller file

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

CSV.open(OUTPUT, 'w') do |out|
  first_row = true

  CSV.foreach(INPUT, headers: true) do |row|
    # 1) Filter on BROOM in the sign description (or whatever column you want)
    desc = row['sign_description'] || row['Sign Description'] || ''
    next unless desc.upcase.include?('BROOM')

    # 2) Compute range in minutes if you have start/end columns
    start_str = row['start (string)'] || row['start'] || ''
    end_str   = row['end (string)']   || row['end']   || ''

    start_t = parse_time(start_str)
    end_t   = parse_time(end_str)

    range_minutes =
      if start_t && end_t
        ((end_t - start_t) / 60.0).round(2)
      else
        nil
      end

    # 3) On the first row, write headers + our new column
    if first_row
      out << row.headers + ['range_minutes']
      first_row = false
    end

    # 4) Write the filtered row with the computed value
    out << row.fields + [range_minutes]
  end
end

puts "Done. Wrote filtered data to #{OUTPUT}"
