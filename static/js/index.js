/* TODO
    - setup dual view comparision
        - 2 synced maps
        - comparision selection with overlay sidebar?
        - trackinfo below each map?
    - route metadata info ctrl
        - max speed
        - duration
    - fix stop/turn detection
    - track statistics?
    - height visualisation?
*/

$(document).ready(function() {
    var map = initMap('map');

    urlQuery = parseQuery();

    ajax(urlQuery.track || 'tracks.json', function(response, statusCode) {
        if (statusCode !== 200)
            return $('#error').text('could not get track data: ' + statusCode);

        var data = JSON.parse(response);
        addGeoJson(map, data[0]);
    });
});

function parseQuery() {
    if (window.location.search.indexOf('?') === -1)
        return {};
    var query = window.location.search.split('&');
    var result = {};
    query.forEach(function(elem, i, arr) {
        if (i == 0) elem = elem.slice(1);
        var props = elem.split('=');
        result[props[0]] = props[1];
    });
    return result;
}

function ajax(url, success, method, mimetype) {
    var oReq = new XMLHttpRequest();
    oReq.onload = function(res) { success(res.target.response, res.target.status); };
    oReq.open(method || 'get', url, true);
    oReq.overrideMimeType(mimetype || 'text/plain');
    oReq.send();
    return oReq;
}

function initMap(domID) {
    var map = L.map(domID, { maxZoom: 17 }).setView([51.96, 7.63], 13);
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
    map.layerCtrl.addOverlay(featureGroup, data.meta.tags.toString());

    map.map.fitBounds(featureGroup.getBounds(), { padding: [60, 60]});

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
