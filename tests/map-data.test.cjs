const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepareBorough, queryViewport, clusterPoints, cleaningSchedule } = require('../app/map-data.js');

const payload = {
  strings: ['MAIN STREET', 'FIRST STREET', 'SECOND STREET',
    'NO PARKING MONDAY THURSDAY 9AM-10:30AM', 'N',
    'NO PARKING TUESDAY 11:30AM-1PM', 'S'],
  rows: [
    [40.7158, -73.997, 0, 1, 2, 3, 4],
    [40.7158, -73.997, 0, 1, 2, 5, 6],
    [40.7158, -73.997, 0, 1, 2, 3, 4],
    [40.7258, -73.987, 0, 1, 2, 3, 4],
  ],
};

test('group co-located signs without dropping distinct restrictions or sides', () => {
  const index = prepareBorough(payload);
  const points = queryViewport(index, { south: 40.71, north: 40.72, west: -74, east: -73.99 });
  assert.equal(index.count, 2);
  assert.equal(points.length, 1);
  assert.equal(points[0].signs.length, 2);
  assert.equal(points[0].signs[1].side, 'S');
});

test('indexed viewport queries match a full scan, including grid boundaries', () => {
  const rows = [];
  for (let i = 0; i < 500; i++) rows.push([40.7 + (i % 50) * .001, -74 + Math.floor(i / 50) * .001, 0, 1, 2, 3, 4]);
  const index = prepareBorough({ ...payload, rows });
  for (let i = 0; i < 20; i++) {
    const bounds = { south: 40.7 + i * .001, north: 40.71 + i * .001, west: -74, east: -73.995 };
    const expected = rows.filter(([lat, lng]) => lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east);
    assert.equal(queryViewport(index, bounds).length, expected.length);
  }
});

test('clusters preserve every location and contain their members', () => {
  const index = prepareBorough(payload);
  const points = queryViewport(index, { south: 40, north: 42, west: -75, east: -72 });
  const clusters = clusterPoints(points, 10);
  assert.equal(clusters.reduce((count, item) => count + item.count, 0), points.length);
  for (const cluster of clusters) {
    assert.ok(cluster.lat >= cluster.south && cluster.lat <= cluster.north);
    assert.ok(cluster.lng >= cluster.west && cluster.lng <= cluster.east);
  }
  assert.equal(clusterPoints([], 15).length, 0);
});

test('cleaning times handle noon, minutes, multiple days, and unknown formats', () => {
  assert.equal(cleaningSchedule(payload.strings[3]), 'Mon & Thu · 9 am–10:30 am');
  assert.equal(cleaningSchedule(payload.strings[5]), 'Tue · 11:30 am–1 pm');
  assert.equal(cleaningSchedule('CHECK POSTED SIGNS'), null);
});

test('all shipped borough files decode and match manifest counts', () => {
  const dir = path.join(__dirname, '../app/data/map');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json')));
  let total = 0;
  for (const entry of Object.values(manifest.boroughs)) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, entry.file)));
    assert.equal(data.rows.length, entry.signs);
    assert.ok(prepareBorough(data).count > 0);
    for (const row of data.rows) {
      assert.ok(Number.isFinite(row[0]) && Number.isFinite(row[1]));
      for (const index of row.slice(2)) assert.equal(typeof data.strings[index], 'string');
    }
    total += entry.signs;
  }
  assert.equal(total, 57586);
});
