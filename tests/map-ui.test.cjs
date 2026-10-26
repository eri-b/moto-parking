const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ParkingData = require('../app/map-data.js');

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.hidden = false; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
  addEventListener(event, callback) { this.listeners[event] = callback; }
}

function harness({ failBorough = null, failManifest = false, sourceUpdated = null, data = null } = {}) {
  const elements = Object.fromEntries(['map-status', 'retry-load', 'data-freshness', 'map']
    .map((id) => [id, new Element('div')]));
  const requests = [];
  const timers = new Map();
  let timerId = 0;
  const markers = [];
  let currentMap;
  let popup;
  let reloads = 0;
  const errors = new Set(failBorough ? [failBorough] : []);
  const payload = data || { strings: ['<MAIN STREET>', 'FIRST', 'SECOND', 'NO PARKING MONDAY 9AM-10:30AM', ''],
    rows: [[40.7158, -73.997, 0, 1, 2, 3, 4], [40.71581, -73.99701, 0, 1, 2, 3, 4]] };
  class FakeMap {
    constructor() { currentMap = this; this.zoom = 15; this.listeners = {}; }
    addListener(name, callback) { this.listeners[name] = callback; }
    getBounds() { return { getNorthEast: () => ({ lat: () => 40.73, lng: () => -73.98 }),
      getSouthWest: () => ({ lat: () => 40.7, lng: () => -74.01 }) }; }
    getZoom() { return this.zoom; }
    setZoom(zoom) { this.zoom = zoom; }
    fitBounds(bounds) { this.fitted = bounds; }
  }
  class Marker {
    constructor(options) { Object.assign(this, options); this.listeners = {}; markers.push(this); }
    addListener(name, callback) { this.listeners[name] = callback; }
    setMap(map) { this.map = map; }
  }
  class InfoWindow {
    constructor() { popup = this; }
    close() { this.opened = false; }
    setContent(content) { this.content = content; }
    open() { this.opened = true; }
  }
  const context = {
    ParkingData, console: { error() {} }, AbortController,
    document: { getElementById: (id) => elements[id], createElement: (tag) => new Element(tag) },
    requestAnimationFrame: (callback) => callback(),
    setTimeout: (callback, delay) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    google: { maps: { Map: FakeMap, Marker, InfoWindow, SymbolPath: { CIRCLE: 'circle' },
      LatLngBounds: class { constructor(sw, ne) { this.sw = sw; this.ne = ne; } },
      event: { clearInstanceListeners(marker) { marker.listeners = {}; } } } },
    fetch: async (url) => {
      requests.push(url);
      if ((failManifest && url.endsWith('manifest.json')) || [...errors].some((name) => url.endsWith(`${name}.json`))) {
        return { ok: false, status: 503 };
      }
      const data = url.endsWith('manifest.json') ? { sourceUpdated, boroughs: Object.fromEntries(
        ['Manhattan', 'Brooklyn', 'Queens', 'Bronx'].map((name) => [name, { file: `${name.toLowerCase()}.json` }])) } : (url.endsWith('manhattan.json') ? payload : { strings: [], rows: [] });
      return { ok: true, json: async () => data };
    },
  };
  context.window = context;
  context.location = { reload: () => reloads++ };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../app/map.js'), 'utf8'), context);
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const pan = () => {
    currentMap.listeners.idle();
    for (const [id, timer] of timers) {
      if (timer.delay === 100) {
        timers.delete(id);
        timer.callback();
      }
    }
  };
  const panAway = () => {
    currentMap.getBounds = () => ({ getNorthEast: () => ({ lat: () => 41.5, lng: () => -72.5 }),
      getSouthWest: () => ({ lat: () => 41.4, lng: () => -72.6 }) });
    pan();
  };
  return { context, elements, requests, markers, errors, flush, pan, panAway,
    map: () => currentMap, popup: () => popup, reloads: () => reloads };
}

test('all boroughs load once and panning reuses data', async () => {
  const h = harness();
  h.context.initMap();
  await h.flush();
  assert.deepEqual(h.requests, ['data/map/manifest.json', 'data/map/manhattan.json',
    'data/map/brooklyn.json', 'data/map/queens.json', 'data/map/bronx.json']);
  assert.match(h.elements['map-status'].textContent, /2 sign locations/);
  assert.equal(h.markers.filter((marker) => marker.map).length, 1);
  h.pan();
  h.pan();
  await h.flush();
  assert.equal(h.requests.filter((url) => url.endsWith('brooklyn.json')).length, 1);
  h.panAway();
  assert.match(h.elements['map-status'].textContent, /No sign locations here/);
  assert.equal(h.requests.length, 5);
  assert.equal(h.markers.filter((marker) => marker.map).length, 0);
});

test('a failed borough shows retry and recovers without refetching good boroughs', async () => {
  const h = harness({ failBorough: 'brooklyn' });
  h.context.initMap();
  await h.flush();
  assert.match(h.elements['map-status'].textContent, /Couldn’t load Brooklyn/);
  assert.equal(h.elements['retry-load'].hidden, false);
  h.errors.clear();
  h.elements['retry-load'].listeners.click();
  await h.flush();
  assert.equal(h.elements['retry-load'].hidden, true);
  assert.equal(h.requests.filter((url) => url.endsWith('manhattan.json')).length, 1);
  assert.equal(h.requests.filter((url) => url.endsWith('brooklyn.json')).length, 2);
});

test('a manifest failure is visible and retryable', async () => {
  const h = harness({ failManifest: true });
  h.context.initMap();
  await h.flush();
  assert.match(h.elements['map-status'].textContent, /Couldn’t load Manhattan/);
  assert.equal(h.elements['retry-load'].hidden, false);
  h.elements['retry-load'].listeners.click();
  await h.flush();
  assert.equal(h.requests.length, 2);
});

test('cluster clicks zoom, individual clicks create safe detail content, panning away closes it', async () => {
  const h = harness();
  h.context.initMap();
  await h.flush();
  h.markers.find((marker) => marker.map).listeners.click();
  assert.ok(h.map().fitted);
  assert.ok(h.map().zoom > 15);
  h.map().zoom = 18;
  h.pan();
  const markers = h.markers.filter((marker) => marker.map);
  assert.equal(markers.length, 2);
  markers[0].listeners.click();
  assert.equal(h.popup().content.children[0].textContent, '<MAIN STREET>');
  assert.equal(h.popup().opened, true);
  h.panAway();
  assert.equal(h.popup().opened, false);
  assert.equal(Object.keys(markers[0].listeners).length, 0);
});

test('map authentication failure stays visible and retry reloads the map', async () => {
  const h = harness();
  h.context.initMap();
  h.context.gm_authFailure();
  await h.flush();
  assert.match(h.elements['map-status'].textContent, /map couldn’t load/);
  h.elements['retry-load'].listeners.click();
  assert.equal(h.reloads(), 1);
});


test('dense views keep marker count bounded and release markers after panning away', async () => {
  const rows = Array.from({ length: 1000 }, (_, i) =>
    [40.701 + (i % 40) * .0006, -74.009 + Math.floor(i / 40) * .001, 0, 1, 2, 3, 4]);
  const h = harness({ data: { strings: ['MAIN', 'FIRST', 'SECOND', 'MONDAY 9AM-10:30AM', ''], rows } });
  h.context.initMap();
  await h.flush();
  h.map().zoom = 18;
  h.pan();
  const active = h.markers.filter((marker) => marker.map);
  assert.ok(active.length > 0 && active.length <= 400);
  h.panAway();
  assert.equal(h.markers.filter((marker) => marker.map).length, 0);
  assert.match(h.elements['map-status'].textContent, /No sign locations here/);
});


test('a month-only download date uses a compact month label', async () => {
  const h = harness({ sourceUpdated: '2026-08' });
  h.context.initMap();
  await h.flush();
  assert.equal(h.elements['data-freshness'].textContent, 'Data from Aug 2026');
});
