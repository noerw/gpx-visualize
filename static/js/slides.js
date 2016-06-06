$(document).ready(function() {
  var map0 = initMap('map0'), map1 = initMap('map1');

  map0.map.sync(map1.map);
  map1.map.sync(map0.map);

  ajax('tracks.json', function(response, statusCode) {
    if (statusCode !== 200)
      return $('#error').text('could not get track data: ' + statusCode);

    var data = JSON.parse(response);

    data.forEach(function(track, i, arr) {
      if (track.meta.tags.indexOf('Rush-Hour') !== -1) {
        addGeoJson(map0, track);
        addMetadata('map0-meta', track.meta);
      }
      else if (track.meta.tags.indexOf('Nachtfahrt') !== -1) {
        addGeoJson(map1, track);
        addMetadata('map1-meta', track.meta);
      }
    });
  });
});

function ajax(url, success, method, mimetype) {
  var oReq = new XMLHttpRequest();
  oReq.onload = function(res) { success(res.target.response, res.target.status); };
  oReq.open(method || 'get', url, true);
  oReq.overrideMimeType(mimetype || 'text/plain');
  oReq.send();
  return oReq;
}

function addMetadata(tableID, meta) {
  $('#' + tableID + ' tr[titles]').append('<th>' + meta.tags.join(': ') + '</th>');
  $('#' + tableID + ' tr[date]').append('<td>' + new Date(meta.date).toLocaleString() + '</td>');
  $('#' + tableID + ' tr[length]').append('<td>' + roundFloat(meta.length) + ' km</td>');
  $('#' + tableID + ' tr[duration]').append('<td>' + roundFloat(meta.duration *60, 2) + ' min</td>');
  $('#' + tableID + ' tr[stops]').append('<td>' + meta.events.stops + '</td>');
  $('#' + tableID + ' tr[turns]').append('<td>' + meta.events.turns + '</td>');

  function roundFloat(val, decimals) {
    var digits = decimals === undefined ? 1e3 : Number('1e' + decimals);
    return Math.round(val * digits) / digits;
  }
}

function initMap(domID) {
  var map = L.map(domID, { maxZoom: 17, zoomControl: false }).setView([51.96, 7.63], 13);
  var layerCtrl = L.control.layers({}, {}).addTo(map);
  L.control.scale().addTo(map);
  L.tileLayer('http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>' + ' contributors, &copy; <a href="http://cartodb.com/attributions">CartoDB</a>'
  }).addTo(map);

  return {
    map: map,
    layerCtrl: layerCtrl
  };
}

function addGeoJson(map, data) {
  var track = L.geoJson(data.track, {
    onEachFeature: function(feature, layer) {
      _createPopup(feature.properties, layer);
      layer.setStyle(speed2Style(feature.properties.speed));
    }
  });
  var pois = L.geoJson(data.events, {
    onEachFeature: function(feature, layer) {
      _createPopup(feature.properties, layer);
    },
    pointToLayer: function(feature, latlng) {
      return L.marker(latlng, {
        icon: L.AwesomeMarkers.icon(event2Style(feature.properties.events))
      });
    }
  });

  var featureGroup = L.featureGroup().addTo(map.map);
  track.addTo(featureGroup);
  pois.addTo(featureGroup);
  map.layerCtrl.addOverlay(featureGroup, data.meta.tags.join(': '));
  map.map.fitBounds(featureGroup.getBounds(), { padding: [20, 20]});

  return featureGroup;

  /* parse the properties of a geojson layer & add them to a popup */
  function _createPopup(properties, layer) {
    var _htmlString = '';
    for (var prop in properties) {
      _htmlString += '<tr><th>' + prop + ':</th><td>' + properties[prop].toString() + '</td></tr>';
    }
    if (_htmlString !== '') layer.bindPopup(('<table>' + _htmlString + '</table>'));
  }

  function speed2Style(val) {
    var maxSpeed = 29;
    var percent = val / maxSpeed;
    var red = parseInt(255 - percent * 255).toString(16);
    var green = parseInt(percent  * 255).toString(16);
    if (red.length === 1) red = '0' + red;
    if (green.length === 1) green = '0' + green;
    return {
      color: '#' + red + green + '00',
      opacity: 0.3 + percent * 2 / 3,
      weight: 8 + parseInt((1 - percent) * 50)
    }
  }

  function event2Style(events) {
    if (events.indexOf('stop') != -1 && events.indexOf('turn') != -1)
      return { prefix: 'ion', icon: 'code-download', markerColor: 'red' };
    else if (events.indexOf('stop') != -1)
      return { prefix: 'ion', icon: 'arrow-down-c', markerColor: 'red' };
    else if (events.indexOf('turn') != -1)
      return { prefix: 'ion', icon: 'code-working', markerColor: 'gray' };
    return {};
  }
}
