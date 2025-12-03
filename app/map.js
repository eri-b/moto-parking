// Center on Chinatown, Manhattan
const nycCenter = { lat: 40.7158, lng: -73.9970 };

const sampleLocations = [
  { title: "Times Square", position: { lat: 40.758, lng: -73.9855 } },
  { title: "Central Park", position: { lat: 40.7812, lng: -73.9665 } },
  { title: "Brooklyn Bridge Park", position: { lat: 40.7003, lng: -73.9967 } },
  { title: "Prospect Park", position: { lat: 40.6602, lng: -73.969 } },
  { title: "Battery Park", position: { lat: 40.7033, lng: -74.017 } },
  { title: "Yankee Stadium", position: { lat: 40.8296, lng: -73.9262 } },
  { title: "High Line", position: { lat: 40.7479, lng: -74.0049 } },
  { title: "Astoria Park", position: { lat: 40.7795, lng: -73.9228 } },
  { title: "Flushing Meadows Park", position: { lat: 40.7498, lng: -73.8408 } },
  { title: "Staten Island Ferry", position: { lat: 40.6437, lng: -74.073 } },
];

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

function renderSampleMarkers(map, infoWindow) {
  const yellowIcon = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 6,
    fillColor: "#e2da4aff",
    fillOpacity: 0.95,
    strokeColor: "#8a882cff",
    strokeWeight: 1,
  };

  sampleLocations.forEach((location) => {
    createMarker(map, infoWindow, {
      position: location.position,
      title: location.title,
      icon: yellowIcon,
      infoHtml: location.title,
    });
  });
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

window.initMap = async function initMap() {
  const map = new google.maps.Map(document.getElementById("map"), {
    center: nycCenter,
    zoom: 15,
  });

  const infoWindow = new google.maps.InfoWindow();

  renderSampleMarkers(map, infoWindow);

  try {
    aspRecords = await loadSourceData();
    renderAspMarkersInView(map, infoWindow);
    map.addListener("idle", () => renderAspMarkersInView(map, infoWindow));
  } catch (err) {
    console.error(err);
  }
};
