const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx'];
const boroughData = new Map();
const pendingLoads = new Map();
const loadErrors = new Set();
const activeMarkers = new Map();
let map;
let infoWindow;
let openMarker = null;
let manifest;
let manifestRequest;
let idleTimer;
let renderQueued = false;
let mapUnavailable = false;

const status = document.getElementById('map-status');
const retryButton = document.getElementById('retry-load');
const freshness = document.getElementById('data-freshness');

function showStatus(message, retry = false) {
  status.textContent = message;
  retryButton.hidden = !retry;
}

async function fetchJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(path, { signal: controller.signal });
    if (!response.ok) throw new Error(`Unable to load ${path}: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function loadManifest() {
  if (!manifestRequest) {
    manifestRequest = fetchJson('data/map/manifest.json').then((data) => {
      manifest = data;
      // A build date is not evidence of a fresh DOT source snapshot.
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(data.sourceUpdated || '')) {
        const month = new Date(`${data.sourceUpdated}-01T00:00:00Z`).toLocaleDateString('en-US', {
          month: 'short', year: 'numeric', timeZone: 'UTC',
        });
        freshness.textContent = `Data from ${month}`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(data.sourceUpdated || '')) {
        freshness.textContent = `Data from ${data.sourceUpdated}`;
      }
      return data;
    }).catch((error) => {
      manifestRequest = null;
      throw error;
    });
  }
  return manifestRequest;
}

function loadBorough(name) {
  if (boroughData.has(name)) return Promise.resolve();
  if (pendingLoads.has(name)) return pendingLoads.get(name);
  loadErrors.delete(name);
  const request = loadManifest().then(async () => {
    const payload = await fetchJson(`data/map/${manifest.boroughs[name].file}`);
    boroughData.set(name, ParkingData.prepareBorough(payload));
  }).catch((error) => {
    console.error(error);
    loadErrors.add(name);
  }).finally(() => {
    pendingLoads.delete(name);
    scheduleRender();
  });
  pendingLoads.set(name, request);
  return request;
}

function loadBoroughs() {
  for (const name of BOROUGHS) loadBorough(name);
  scheduleRender();
}

function scheduleRender() {
  if (renderQueued || !map) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    updateVisualization();
  });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function spotDetails(point) {
  const card = element('article', 'spot-card');
  card.append(element('h2', '', point.street));
  card.append(element('p', 'spot-borough', point.borough));
  const sides = { N: 'North', S: 'South', E: 'East', W: 'West' };
  for (const sign of point.signs) {
    const section = element('section', 'spot-sign');
    section.append(element('p', 'spot-block', `${sign.from} to ${sign.to}`));
    section.append(element('p', 'spot-side', sign.side
      ? `${sides[sign.side.toUpperCase()] || sign.side} side of street`
      : 'Street side not supplied in this snapshot'));
    const schedule = ParkingData.cleaningSchedule(sign.description);
    if (schedule) {
      section.append(element('p', 'spot-label', 'Street cleaning'));
      section.append(element('p', 'spot-schedule', schedule));
    }
    const disclosure = element('details', 'sign-description');
    disclosure.append(element('summary', '', 'Original sign text'));
    disclosure.append(element('p', '', sign.description));
    section.append(disclosure);
    card.append(section);
  }
  const links = element('div', 'spot-actions');
  const coords = `${point.lat},${point.lng}`;
  for (const [label, href] of [
    ['Directions', `https://www.google.com/maps/dir/?api=1&destination=${coords}`],
    ['Street View', `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coords}`],
  ]) {
    const link = element('a', '', label);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener';
    links.append(link);
  }
  card.append(links);
  card.append(element('p', 'spot-note', 'Check the signs on this block for current restrictions.'));
  return card;
}

function createMarker(item) {
  const isCluster = item.count > 1;
  const point = item.point;
  const marker = new google.maps.Marker({
    map,
    position: { lat: item.lat, lng: item.lng },
    title: isCluster ? `${item.count} sign locations. Zoom in to explore.` : `${point.street}, ${point.borough}`,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: isCluster ? 9 : 6,
      fillColor: '#7c3aed', fillOpacity: 1,
      strokeColor: '#ffffff', strokeWeight: 1.5,
    },
    zIndex: isCluster ? 2 : 1,
  });
  marker.addListener('click', () => {
    infoWindow.close();
    if (isCluster) {
      const bounds = new google.maps.LatLngBounds(
        { lat: item.south, lng: item.west }, { lat: item.north, lng: item.east });
      const previousZoom = map.getZoom();
      map.fitBounds(bounds, 64);
      map.setZoom(Math.min(20, Math.max(previousZoom + 1, Math.min(map.getZoom(), previousZoom + 3))));
    } else {
      infoWindow.setContent(spotDetails(point));
      infoWindow.open({ map, anchor: marker });
      openMarker = marker;
    }
  });
  return marker;
}

function updateVisualization() {
  if (mapUnavailable) return;
  const visibleBounds = map.getBounds();
  if (!visibleBounds) return;
  const ne = visibleBounds.getNorthEast();
  const sw = visibleBounds.getSouthWest();
  // Restrict queries to the data's NYC extent even if the map is panned far away.
  const bounds = { south: Math.max(40, sw.lat()), north: Math.min(42, ne.lat()),
    west: Math.max(-75, sw.lng()), east: Math.min(-72, ne.lng()) };
  const points = [];
  for (const name of BOROUGHS) {
    const index = boroughData.get(name);
    if (!index) continue;
    for (const point of ParkingData.queryViewport(index, bounds)) {
      point.borough = name;
      points.push(point);
    }
  }
  const zoom = Math.floor(map.getZoom());
  let items;
  if (zoom < 17 || points.length > 400) {
    let cellPixels = 64;
    do {
      items = ParkingData.clusterPoints(points, zoom, cellPixels);
      cellPixels *= 2;
    } while (items.length > 400);
  } else {
    items = points.map((point) => ({ count: 1, point, lat: point.lat, lng: point.lng }));
  }
  const nextKeys = new Set();
  for (const item of items) {
    // Coordinates and count keep click handlers in sync when viewport clusters change.
    const key = item.count > 1 ? `cluster:${zoom}:${item.key}:${item.count}:${item.lat}:${item.lng}`
      : `spot:${item.point.borough}:${item.point.key}`;
    nextKeys.add(key);
    if (!activeMarkers.has(key)) activeMarkers.set(key, createMarker(item));
  }
  for (const [key, marker] of activeMarkers) {
    if (!nextKeys.has(key)) {
      if (openMarker === marker) {
        infoWindow.close();
        openMarker = null;
      }
      google.maps.event.clearInstanceListeners(marker);
      marker.setMap(null);
      activeMarkers.delete(key);
    }
  }
  const loading = BOROUGHS.filter((name) => pendingLoads.has(name));
  const failed = BOROUGHS.filter((name) => loadErrors.has(name));
  if (loading.length) showStatus(`Loading ${loading.join(', ')}…`);
  else if (failed.length) showStatus(`Couldn’t load ${failed.join(', ')}. Check your connection and retry.`, true);
  else if (!points.length) showStatus('No sign locations here. Move the map to explore nearby streets.');
  else showStatus(`${points.length.toLocaleString()} sign locations in view. ${items.some((item) => item.count > 1)
    ? 'Tap a larger dot to zoom in.' : 'Tap a dot for sign details.'}`);
}

function mapLoadFailed() {
  mapUnavailable = true;
  clearTimeout(mapLoadTimer);
  showStatus('The map couldn’t load. Check your connection and retry.', true);
}

window.gm_authFailure = mapLoadFailed;
window.mapLoadFailed = mapLoadFailed;
const mapLoadTimer = setTimeout(mapLoadFailed, 20000);
retryButton.addEventListener('click', () => {
  if (!map || mapUnavailable) window.location.reload();
  else loadBoroughs();
});

window.initMap = function initMap() {
  clearTimeout(mapLoadTimer);
  try {
    map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: 40.7158, lng: -73.9970 }, zoom: 15, minZoom: 10, maxZoom: 20,
      mapTypeControl: false, streetViewControl: false,
      styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
    });
    mapUnavailable = false;
    infoWindow = new google.maps.InfoWindow({ maxWidth: 320 });
    map.addListener('idle', () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(scheduleRender, 100);
    });
    loadBoroughs();
  } catch (error) {
    console.error(error);
    map = null;
    mapLoadFailed();
  }
};
