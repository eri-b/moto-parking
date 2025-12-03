// Center on Chinatown, Manhattan
const nycCenter = { lat: 40.7158, lng: -73.9970 };

const BOROUGH_OPTIONS = ["Manhattan", "Brooklyn", "Queens", "Bronx"];
let selectedBoroughs = new Set(["MANHATTAN"]);

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
let aspMarkers = [];

function clearAspMarkers() {
  aspMarkers.forEach((m) => m.setMap(null));
  aspMarkers = [];
}

function renderAspMarkersInView(map, infoWindow) {
  if (!aspRecords.length) return;
  const bounds = map.getBounds();
  if (!bounds) return;

  clearAspMarkers();

  const redIcon = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 6,
    fillColor: "#e53935",
    fillOpacity: 0.95,
    strokeColor: "#b71c1c",
    strokeWeight: 1,
  };

  aspRecords.forEach((rec) => {
    const borough = (rec.borough || "").toUpperCase();
    if (!selectedBoroughs.has(borough)) return;

    const lat = parseFloat(rec.sign_x_coord_lat);
    const lng = parseFloat(rec.sign_y_coord_lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    if (!bounds.contains({ lat, lng })) return;

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

    const marker = createMarker(map, infoWindow, {
      position: { lat, lng },
      title,
      icon: redIcon,
      infoHtml,
    });

    aspMarkers.push(marker);
  });
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
  setupBoroughFilters(() => renderAspMarkersInView(map, infoWindow));

  try {
    aspRecords = await loadSourceData();
    renderAspMarkersInView(map, infoWindow);
    map.addListener("idle", () => renderAspMarkersInView(map, infoWindow));
  } catch (err) {
    console.error(err);
  }
};
