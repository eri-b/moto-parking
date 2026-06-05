// Center on Chinatown, Manhattan
const nycCenter = { lat: 40.7158, lng: -73.9970 };

const BOROUGH_OPTIONS = ["Manhattan", "Brooklyn", "Queens", "Bronx"];
const MARKER_ZOOM_THRESHOLD = 16;
const IDLE_DEBOUNCE_MS = 200;

function preventIosPinchZoom() {
  const handler = (event) => event.preventDefault();
  document.addEventListener("gesturestart", handler, { passive: false });
  document.addEventListener("gesturechange", handler, { passive: false });
  document.addEventListener("gestureend", handler, { passive: false });
  document.addEventListener(
    "touchmove",
    (event) => {
      if (typeof event.scale === "number" && event.scale !== 1) {
        event.preventDefault();
      }
    },
    { passive: false }
  );
}

let selectedBoroughs = new Set(["MANHATTAN"]);
let heatmapLayer = null;
let HeatmapOverlay = null;
let idleTimer = null;
const markerCache = new Map();
const activeMarkerKeys = new Set();
let cachedRedIcon = null;

preventIosPinchZoom();

function createMarker(map, infoWindow, { position, title, icon, infoHtml }) {
  const marker = new google.maps.Marker({
    map,
    position,
    title,
    icon,
  });

  marker.addListener("click", () => {
    infoWindow.setContent(infoHtml || title);
    infoWindow.open({
      map,
      anchor: marker,
    });
  });

  return marker;
}

function getRedIcon() {
  if (cachedRedIcon) return cachedRedIcon;
  cachedRedIcon = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 6,
    fillColor: "#e53935",
    fillOpacity: 0.95,
    strokeColor: "#b71c1c",
    strokeWeight: 1,
  };
  return cachedRedIcon;
}

function getRecordKey(rec) {
  const lat = rec.sign_x_coord_lat || "";
  const lng = rec.sign_y_coord_lon || "";
  const street = (rec.on_street || "").toUpperCase();
  const borough = (rec.borough || "").toUpperCase();
  return `${lat}|${lng}|${street}|${borough}`;
}

function getHeatmapOverlayClass() {
  if (HeatmapOverlay) return HeatmapOverlay;

  HeatmapOverlay = class extends google.maps.OverlayView {
    constructor({ radius = 24 } = {}) {
      super();
      this.radius = radius;
      this.data = [];
      this.canvas = null;
      this.map = null;
    }

    setData(data) {
      this.data = data;
      this.draw();
    }

    setMap(map) {
      this.map = map;
      super.setMap(map);
    }

    onAdd() {
      this.canvas = document.createElement("canvas");
      this.canvas.style.position = "absolute";
      this.canvas.style.pointerEvents = "none";
      this.getPanes().overlayLayer.appendChild(this.canvas);
    }

    onRemove() {
      if (this.canvas && this.canvas.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas);
      }
      this.canvas = null;
    }

    draw() {
      if (!this.canvas || !this.map) return;

      const projection = this.getProjection();
      const bounds = this.map.getBounds();
      if (!projection || !bounds) return;

      const northEast = projection.fromLatLngToDivPixel(bounds.getNorthEast());
      const southWest = projection.fromLatLngToDivPixel(bounds.getSouthWest());
      const left = southWest.x;
      const top = northEast.y;
      const width = Math.max(1, northEast.x - southWest.x);
      const height = Math.max(1, southWest.y - northEast.y);
      const dpr = window.devicePixelRatio || 1;

      this.canvas.style.left = `${left}px`;
      this.canvas.style.top = `${top}px`;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.canvas.width = Math.ceil(width * dpr);
      this.canvas.height = Math.ceil(height * dpr);

      const context = this.canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      this.data.forEach((point) => {
        const pixel = projection.fromLatLngToDivPixel(point);
        if (!pixel) return;

        const x = pixel.x - left;
        const y = pixel.y - top;
        const gradient = context.createRadialGradient(x, y, 0, x, y, this.radius);
        gradient.addColorStop(0, "rgba(229, 57, 53, 0.55)");
        gradient.addColorStop(0.45, "rgba(255, 152, 0, 0.28)");
        gradient.addColorStop(1, "rgba(255, 235, 59, 0)");

        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, this.radius, 0, Math.PI * 2);
        context.fill();
      });
    }
  };

  return HeatmapOverlay;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((h) => h.replace(/^"|"$/g, ""));

  return lines.slice(1).map((line) => {
    const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, ""));
    const record = {};
    headers.forEach((h, i) => {
      record[h] = cols[i];
    });
    return record;
  });
}

async function loadSourceData() {
  const response = await fetch("data/source.csv");
  if (!response.ok) throw new Error(`Failed to load source.csv: ${response.status}`);
  const text = await response.text();
  return parseCsv(text);
}

let aspRecords = [];

function hideActiveMarkers() {
  const toRemove = Array.from(activeMarkerKeys);
  toRemove.forEach((key) => {
    const marker = markerCache.get(key);
    if (marker) marker.setMap(null);
    activeMarkerKeys.delete(key);
  });
}

function updateVisualization(map, infoWindow) {
  if (!aspRecords.length) return;
  const bounds = map.getBounds();
  if (!bounds) return;

  const useHeatmap = map.getZoom() < MARKER_ZOOM_THRESHOLD;
  const nextActiveKeys = new Set();
  const heatmapPoints = [];

  aspRecords.forEach((rec) => {
    const borough = (rec.borough || "").toUpperCase();
    if (!selectedBoroughs.has(borough)) return;

    const lat = parseFloat(rec.sign_x_coord_lat);
    const lng = parseFloat(rec.sign_y_coord_lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    const position = { lat, lng };

    if (useHeatmap) {
      if (bounds.contains(position)) {
        heatmapPoints.push(new google.maps.LatLng(lat, lng));
      }
      return;
    }

    if (!bounds.contains(position)) return;

    const key = getRecordKey(rec);
    let marker = markerCache.get(key);
    if (!marker) {
      const title = `${rec.on_street || ""} (${rec.borough || ""})`;
      const infoHtml = `
        <div style="max-width: 260px; font-size: 13px;">
          <div style="font-weight: 600; margin-bottom: 4px;">${rec.on_street || ""} (${rec.borough || ""})</div>
          <div><strong>From:</strong> ${rec.from_street || ""}</div>
          <div><strong>To:</strong> ${rec.to_street || ""}</div>
          <div style="margin-top: 6px;">${rec.sign_description || ""}</div>
          <div style="margin-top: 8px;"><a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" rel="noopener">Open Street View</a></div>
        </div>
      `;

      marker = createMarker(map, infoWindow, {
        position,
        title,
        icon: getRedIcon(),
        infoHtml,
      });
      markerCache.set(key, marker);
    } else if (!marker.getMap()) {
      marker.setMap(map);
    }

    nextActiveKeys.add(key);
  });

  if (useHeatmap) {
    hideActiveMarkers();
    if (!heatmapLayer) {
      const Heatmap = getHeatmapOverlayClass();
      heatmapLayer = new Heatmap({ radius: 24 });
    }
    heatmapLayer.setData(heatmapPoints);
    heatmapLayer.setMap(heatmapPoints.length ? map : null);
    return;
  }

  if (heatmapLayer) {
    heatmapLayer.setMap(null);
  }

  const toRemove = Array.from(activeMarkerKeys).filter((key) => !nextActiveKeys.has(key));
  toRemove.forEach((key) => {
    const marker = markerCache.get(key);
    if (marker) marker.setMap(null);
    activeMarkerKeys.delete(key);
  });

  nextActiveKeys.forEach((key) => activeMarkerKeys.add(key));
}

function setupBoroughFilters(onChange) {
  const container = document.getElementById("borough-filters");
  if (!container) return;

  BOROUGH_OPTIONS.forEach((name) => {
    const id = `borough-${name.toLowerCase()}`;
    const label = document.createElement("label");
    label.style.marginRight = "14px";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = id;
    checkbox.name = id;
    checkbox.checked = selectedBoroughs.has(name.toUpperCase());
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedBoroughs.add(name.toUpperCase());
      } else {
        selectedBoroughs.delete(name.toUpperCase());
      }
      onChange();
    });

    const text = document.createElement("span");
    text.textContent = name;
    text.style.marginLeft = "4px";

    label.appendChild(checkbox);
    label.appendChild(text);
    container.appendChild(label);
  });
}

window.initMap = async function initMap() {
  const map = new google.maps.Map(document.getElementById("map"), {
    center: nycCenter,
    zoom: 15,
  });

  const infoWindow = new google.maps.InfoWindow();
  setupBoroughFilters(() => updateVisualization(map, infoWindow));

  try {
    aspRecords = await loadSourceData();
    updateVisualization(map, infoWindow);
    map.addListener("idle", () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => updateVisualization(map, infoWindow), IDLE_DEBOUNCE_MS);
    });
  } catch (err) {
    console.error(err);
  }
};
