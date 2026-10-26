// Pure data helpers shared by the map and the Node regression tests.
(function (root) {
  const CELL_SIZE = 0.01;

  function prepareBorough(payload) {
    const locations = new Map();
    const { strings, rows } = payload;
    for (const row of rows) {
      const [lat, lng, street, from, to, description, side] = row;
      const key = `${lat}|${lng}|${strings[street]}`;
      let location = locations.get(key);
      if (!location) {
        const sin = Math.sin(lat * Math.PI / 180);
        location = {
          key, lat, lng, street: strings[street], signs: [],
          x: (lng + 180) / 360,
          y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
        };
        locations.set(key, location);
      }
      const sign = {
        from: strings[from], to: strings[to],
        description: strings[description], side: strings[side] || '',
      };
      // Keep distinct regulations at the same point rather than silently dropping them.
      if (!location.signs.some((existing) =>
        existing.from === sign.from && existing.to === sign.to &&
        existing.description === sign.description && existing.side === sign.side)) {
        location.signs.push(sign);
      }
    }
    const cells = new Map();
    for (const location of locations.values()) {
      const cell = `${Math.floor(location.lat / CELL_SIZE)}:${Math.floor(location.lng / CELL_SIZE)}`;
      if (!cells.has(cell)) cells.set(cell, []);
      cells.get(cell).push(location);
    }
    return { cells, count: locations.size };
  }

  function queryViewport(index, bounds) {
    const points = [];
    for (let lat = Math.floor(bounds.south / CELL_SIZE); lat <= Math.floor(bounds.north / CELL_SIZE); lat++) {
      for (let lng = Math.floor(bounds.west / CELL_SIZE); lng <= Math.floor(bounds.east / CELL_SIZE); lng++) {
        for (const point of index.cells.get(`${lat}:${lng}`) || []) {
          if (point.lat >= bounds.south && point.lat <= bounds.north &&
              point.lng >= bounds.west && point.lng <= bounds.east) points.push(point);
        }
      }
    }
    return points;
  }

  function clusterPoints(points, zoom, cellPixels = 64) {
    const scale = 256 * 2 ** zoom;
    const cells = new Map();
    for (const point of points) {
      const key = `${Math.floor(point.x * scale / cellPixels)}:${Math.floor(point.y * scale / cellPixels)}`;
      let cell = cells.get(key);
      if (!cell) {
        cell = { key, count: 0, lat: 0, lng: 0, south: Infinity, north: -Infinity,
          west: Infinity, east: -Infinity, point };
        cells.set(key, cell);
      }
      cell.count++;
      cell.lat += point.lat;
      cell.lng += point.lng;
      cell.south = Math.min(cell.south, point.lat);
      cell.north = Math.max(cell.north, point.lat);
      cell.west = Math.min(cell.west, point.lng);
      cell.east = Math.max(cell.east, point.lng);
    }
    return Array.from(cells.values(), (cell) => ({
      ...cell, lat: cell.lat / cell.count, lng: cell.lng / cell.count,
    }));
  }

  function cleaningSchedule(description) {
    const days = (description.match(/\b(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\b/gi) || [])
      .map((day) => day.slice(0, 3).toLowerCase().replace(/^./, (letter) => letter.toUpperCase()));
    const times = description.match(/(\d{1,2}(?::\d{2})?\s*[AP]M)\s*-\s*(\d{1,2}(?::\d{2})?\s*[AP]M)/i);
    if (!days.length || !times) return null;
    const format = (time) => time.toLowerCase().replace(/\s+/g, '').replace(/([ap]m)$/, ' $1');
    return `${[...new Set(days)].join(' & ')} · ${format(times[1])}–${format(times[2])}`;
  }

  const api = { prepareBorough, queryViewport, clusterPoints, cleaningSchedule };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ParkingData = api;
})(typeof window !== 'undefined' ? window : globalThis);
