// Global vars
var busses = {};
var map; // The map
var layergroup; // The layer with the route of selected bus

$(document).ready(function() {
  // initialize the map on the "map" div with a given center and zoom
  map = L.map('map', {
      center: [47.655, -122.308],
      zoom: 15
  });
  layergroup = L.layerGroup();

  // Loads openstreetmap tiles
  L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
      maxZoom: 18,
      opacity: 0.5, 
      detectRetina: true
  }).addTo(map);

  // Updates map every 15 seconds
  setInterval(function() {drawBusses();}, 15000);

  // Draws the busses on the map
  drawBusses();
});

function drawBusses() {
  $.getJSON('http://api.onebusaway.org/api/where/vehicles-for-agency/1.json?key=TEST&callback=?', function(data) {
      // Loading into active trips into hash table
      var trips_hash = {};
      for(var i = 0; i < data.data.references.trips.length; i++) {
        trips_hash[data.data.references.trips[i].id] = {routeId: data.data.references.trips[i].routeId, tripHeadsign: data.data.references.trips[i].tripHeadsign};
      }

      // Loading the routes into a hash table
      var routes_hash = {};
      for(var i = 0; i < data.data.references.routes.length; i++) {
        routes_hash[data.data.references.routes[i].id] = data.data.references.routes[i].shortName;
      }

      // Placing marker for each trips
      var date = new Date();
      for(var i = 0; i < data.data.list.length; i++) {
        // console.log(data.data.list[i]);
        if(data.data.list[i].tripStatus != null && date.getTime() - data.data.list[i].lastUpdateTime < 600000) {
          var marker;
          if (busses[data.data.list[i].vehicleId] != null) {

            marker = busses[data.data.list[i].vehicleId].gmarker;
            marker.setLatLng(new L.LatLng(data.data.list[i].location.lat, data.data.list[i].location.lon));
            marker.routeId = trips_hash[data.data.list[i].tripId].routeId;
            marker.tripId = data.data.list[i].tripId;
            marker.distance = data.data.list[i].tripStatus.scheduledDistanceAlongTrip;
            marker.totalDistance = data.data.list[i].tripStatus.totalDistanceAlongTrip;
            marker.curPoint = L.latLng(data.data.list[i].location.lat, data.data.list[i].location.lon);
            marker.lastUpdateTime = data.data.list[i].lastUpdateTime;
            marker.scheduleDeviation = data.data.list[i].tripStatus.scheduleDeviation;
            marker.getPopup().setContent('<p><b>' + routes_hash[trips_hash[data.data.list[i].tripId].routeId] + ': ' + trips_hash[data.data.list[i].tripId].tripHeadsign + '</b><br />Last Update: ' + toTimeString(data.data.list[i].lastUpdateTime) + '<br/>' + 'Schedule Deviation: ' + data.data.list[i].tripStatus.scheduleDeviation + '</p>');
            marker.getPopup().update();
          }
          else {
              var temp_date = new Date(data.data.list[i].lastUpdateTime);
              var cur_date = new Date();

              var marker = L.marker([data.data.list[i].location.lat, data.data.list[i].location.lon]).bindLabel(routes_hash[trips_hash[data.data.list[i].tripId].routeId], { noHide: true }).on('click', onClick);
              marker.routeId = trips_hash[data.data.list[i].tripId].routeId;
              marker.tripId = data.data.list[i].tripId;
              marker.distance = data.data.list[i].tripStatus.scheduledDistanceAlongTrip;
              marker.totalDistance = data.data.list[i].tripStatus.totalDistanceAlongTrip;
              marker.curPoint = L.latLng(data.data.list[i].location.lat, data.data.list[i].location.lon);
              marker.lastUpdateTime = data.data.list[i].lastUpdateTime;
              marker.scheduleDeviation = data.data.list[i].tripStatus.scheduleDeviation;
              marker.popupContent = '<p><b>' + routes_hash[trips_hash[data.data.list[i].tripId].routeId] + ': ' + trips_hash[data.data.list[i].tripId].tripHeadsign + '</b><br />Last Update: ' + toTimeString(data.data.list[i].lastUpdateTime) + '<br/>' + 'Schedule Deviation: ' + data.data.list[i].tripStatus.scheduleDeviation + '</p>';
              marker.bindPopup(marker.popupContent);

              function onClick(e) {drawLineOnRoute(this.tripId, this.lastUpdateTime, this.curPoint); console.log(this.routeId); console.log(this.tripId)}
              marker.addTo(map);

              var bus = {gmarker: marker, bus_id: data.data.list[i].vehicleId};
              busses[data.data.list[i].vehicleId] = bus;
          }
        } 
        // Removing whatever the server doesnt give back
        else if(busses[data.data.list[i].vehicleId] != null) {
          busses[data.data.list[i].vehicleId] = null;
        }
      }
  });
}

// Last Updated Time, Last Stop Time, Current Time
function drawLineOnRoute(tripId, lastUpdateTime, curpoint) {
      layergroup.clearLayers();
      var poly = L.Polyline();
      $.getJSON('http://api.onebusaway.org/api/where/trip-details/' + tripId + '.json?key=TEST&version=2&callback=?', function(data) {
          var shapeId = data.data.references.trips[0].shapeId;
          var lastStopTime = data.data.entry.schedule.stopTimes[data.data.entry.schedule.stopTimes.length - 1].arrivalTime * 1000 + data.data.entry.serviceDate + parseInt(data.data.entry.status.scheduleDeviation);
          var totalDistance = data.data.entry.status.totalDistanceAlongTrip;
          var date = new Date();
          var currTime = date.getTime();
          $.getJSON('http://api.onebusaway.org/api/where/shape/' + shapeId + '.json?key=TEST&callback=?', function(data) {
              var polyline = L.Polyline.fromEncoded(data.data.entry.points, {color: 'red'}).addTo(map);

            layergroup.addLayer(polyline);
            var progressPolylines = getProgressPolyline2(polyline, curpoint);
            layergroup.addLayer(progressPolylines[0]);

            var polylineToSplit = progressPolylines[1];
            var pointToSplitOn = L.GeometryUtil.interpolateOnLine(map, polylineToSplit, (currTime - lastUpdateTime) / (lastStopTime - lastUpdateTime));
            var line1 = L.polyline(L.GeometryUtil.extract(map, polylineToSplit, 0, (currTime - lastUpdateTime) / (lastStopTime - lastUpdateTime)));
            var line2 = L.polyline(L.GeometryUtil.extract(map, polylineToSplit, (currTime - lastUpdateTime) / (lastStopTime - lastUpdateTime), 1));

            var estimatedPercentageOfTripCompleted = L.GeometryUtil.locateOnLine(map, polyline, curpoint);
            var percentageOfLUTtoLSTCompleted = (currTime - lastUpdateTime) / (lastStopTime - lastUpdateTime);

            var myIcon = L.icon({
              iconUrl: 'bus.png',
              iconAnchor: [20, 10]
            });

            var animatedMarker = L.animatedMarker(line2.getLatLngs(), {
              icon: myIcon,
              distance: 0.01 * totalDistance * (1 - estimatedPercentageOfTripCompleted) * (1 - percentageOfLUTtoLSTCompleted),  // meters
              interval: 0.01 * (lastStopTime - currTime), // milliseconds
            });

            layergroup.addLayer(animatedMarker);
            layergroup.addLayer(progressPolylines[0]);

            layergroup.addTo(map);
          });
      });
  }

function toTimeString(time) {
  var date = new Date(time);
  var hours = date.getHours();
  if(hours < 10) hours = "0" + hours;
  var minutes = date.getMinutes();
  if(minutes < 10) minutes = "0" + minutes;
  return hours + ":" + minutes;
}

function getProgressPolyline2(polyline, point) {
  var x1 = L.polyline(L.GeometryUtil.extract(map, polyline, 0, L.GeometryUtil.locateOnLine(map, polyline, point)));
  var x2 = L.polyline(L.GeometryUtil.extract(map, polyline, L.GeometryUtil.locateOnLine(map, polyline, point), 1));
  return [x1, x2];
}

function removeLines() {
  for(var i = 0; i < layergroup.getLayers().length; i++) {
    map.removeLayer(layergroup.getLayesr()[i]);
  }
}

