const nycCenter = { lat: 40.7128, lng: -74.006 }; // Manhattan

const locations = [
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

window.initMap = function initMap() {
  const map = new google.maps.Map(document.getElementById("map"), {
    center: nycCenter,
    zoom: 12,
  });

  const infoWindow = new google.maps.InfoWindow();

  locations.forEach((location) => {
    const marker = new google.maps.Marker({
      map,
      position: location.position,
      title: location.title,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: "#e2da4aff",
        fillOpacity: 0.95,
        strokeColor: "#8a882cff",
        strokeWeight: 1,
      },
    });

    marker.addListener("click", () => {
      infoWindow.setContent(location.title);
      infoWindow.open({
        map,
        anchor: marker,
      });
    });
  });
};
