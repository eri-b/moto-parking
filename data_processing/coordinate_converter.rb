begin
  require 'rgeo/proj4'
rescue LoadError => e
  warn 'Missing rgeo/rgeo-proj4. Install with: gem install rgeo rgeo-proj4 (requires proj).'
  raise e
end

# Coordinate conversion utilities for EPSG:2263 (NAD83 / New York Long Island ftUS)
module CoordinateConverter
  PROJ4_2263 = '+proj=lcc +lat_1=41.03333333333333 +lat_2=40.66666666666666 +lat_0=40.16666666666666 +lon_0=-74 +x_0=984250 +y_0=0 +datum=NAD83 +to_meter=0.3048006096012192 +no_defs'.freeze

  module_function

  def projected_factory
    @projected_factory ||= RGeo::Geographic.projected_factory(
      projection_srid: 2263,
      projection_proj4: PROJ4_2263,
      geographic_srid: 4326
    )
  end

  # Returns [lon, lat] in WGS84
  def state_plane_to_wgs84_lon_lat(x_ft, y_ft)
    return [nil, nil] if x_ft.nil? || y_ft.nil?

    proj_point = projected_factory.projection_factory.point(x_ft.to_f, y_ft.to_f)
    geo_point = proj_point.transform(projected_factory)

    lon = geo_point.respond_to?(:longitude) ? geo_point.longitude : geo_point.x
    lat = geo_point.respond_to?(:latitude) ? geo_point.latitude : geo_point.y

    [lon, lat]
  rescue StandardError => e
    warn "Coordinate conversion failed for (#{x_ft}, #{y_ft}): #{e.message}"
    [nil, nil]
  end
end
