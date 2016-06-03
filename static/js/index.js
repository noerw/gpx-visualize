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

var map,
    statsData = [], // contains data & bounds of all vector features for statistics (track segments)
    layerCtrl,
    layers = {};

$(document).ready(function() {
    map = L.map('map', { maxZoom: 17 }).setView([51.96, 7.63], 13);
    layerCtrl = L.control.groupedLayers({}, layers).addTo(map);
    L.control.scale().addTo(map);
    L.tileLayer('http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>' + ' contributors, &copy; <a href="http://cartodb.com/attributions">CartoDB</a>'
    }).addTo(map);

    ajax('tracks.json', function(response, statusCode) {
        if (statusCode !== 200)
            return $('#error').text('could not get track data: ' + statusCode);

        var data = JSON.parse(response);
        for (var i = 0; i < data.length; i++) addGeoJson(data[i]);
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

function addGeoJson(data) {
    var track = L.geoJson(data['Track'], {
        onEachFeature: function(feature, layer) {
            _createPopup(feature.properties, layer);
            layer.setStyle(speed2Style(feature.properties.speed));
        }
    });
    var pois = L.geoJson(data['POIs'], {
        onEachFeature: function(feature, layer) {
            _createPopup({ event: feature.properties.type }, layer);
        },
        filter: function(feature) { return (feature.properties.type !== ''); },
        pointToLayer: function(feature, latlng) {
            return L.marker(latlng, {
                icon: L.AwesomeMarkers.icon(type2Style(feature.properties.type))
            });
        }
    });

    var featureGroup = L.featureGroup().addTo(map);
    track.addTo(featureGroup);
    pois.addTo(featureGroup);
    layerCtrl.addOverlay(featureGroup, data['Track'].properties.group, data['Track'].properties.name);
    featureGroup.properties = data['Track'].properties;
    featureGroup.properties.trackLayerID = track._leaflet_id;
    featureGroup.on('mouseover', function(e) { setSelectedLayer(e.target); })

    map.fitBounds(featureGroup.getBounds(), { padding: [60, 60]});

    /* parse the properties of a geojson layer & add them to a popup */
    function _createPopup(properties, layer) {
        var _htmlString = '';
        for (var prop in properties) {
            _htmlString += '<tr><th>' + prop + ':</th><td>' + properties[prop] + '</td></tr>';
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

    function type2Style(type) {
        if (type === 'stop')
            return { prefix: 'ion', icon: 'arrow-down-c', markerColor: 'red' };
        else if (type === 'stop & turn')
            return { prefix: 'ion', icon: 'code-download', markerColor: 'red' };
        else if (type === 'turn')
            return { prefix: 'ion', icon: 'code-working', markerColor: 'gray' };
        return {};
    }
}

function setSelectedLayer(layer) {
    // update track info
    var infoHtml = '<h4>' + layer.properties.name  +' (' + layer.properties.group + ')</h4><table>';

    for (var prop in layer.properties) {
        if (['name', 'group', 'trackLayerID'].indexOf(prop) != -1) continue;
        infoHtml += '<tr><th>' + prop + ':</th><td>' + layer.properties[prop] + '</td></tr>'
    }
    infoHtml += '</table>';
    //$('#error').html(infoHtml);

    // update statistics source data
    statsData = [];
    // add all track-lines to the statistics object
    for (var prop in layer._layers[layer.properties.trackLayerID]._layers) {
        var line = layer._layers[layer.properties.trackLayerID]._layers[prop];
        statsData.push({
            properties: line.feature.properties,
            bounds: line.getBounds()
        });
    }
}

/**
 * @desc  adds an control to the map, which contains statistics
 *        to calculate & view the statistics, call .update(data)
 *        data has to have the format { measure1: [values], measure2: [values], ... }
 * @param map the map object to add the control to
 */
function MapStatistics(map) {
    var _statsview;

    /* takes an data object like { measure1: [values], measure2: [values], ... }
       & calculates statistics on them */
    this.update = function(data) {
        var statistics = {};
        var histograms = [];
        for (var prop in data) {
            statistics[prop] = stats(data[prop]);
            histograms[histograms.length] = prepareHisto(data[prop]);
        }
        _statsview.update(statistics, histograms);
        return this;
    };

    function _initialize(map) {
        _statsview = L.control();

        _statsview.onAdd = function(map) {
            this._div = L.DomUtil.create('div', 'statsview');
            this.update();
            return this._div;
        };

        _statsview.update = function (statistics, histogramData) {
            var htmlStrings = {
                head: '<tr><th></th>',
                mean: '<tr><th>mean</th>',
                min : '<tr><th>min</th>',
                max : '<tr><th>max</th>',
                variance: '<tr><th>variance</th>',
                stdDev: '<tr><th>stdDev</th>',
                qnt1: '<tr><th>.25quant</th>',
                qnt2: '<tr><th>.50quant</th>',
                qnt3: '<tr><th>.75quant</th>'
            };

            for (var prop in statistics) {
                htmlStrings.head += ('<th>' + prop + '</th>');
                htmlStrings.mean += ('<td>' + statistics[prop].mean + '</td>');
                htmlStrings.min  += ('<td>' + statistics[prop].min + '</td>');
                htmlStrings.max  += ('<td>' + statistics[prop].max + '</td>');
                htmlStrings.variance += ('<td>' + statistics[prop].variance + '</td>');
                htmlStrings.stdDev += ('<td>' + statistics[prop].standardDev + '</td>');
                htmlStrings.qnt1 += ('<td>' + statistics[prop].quantiles.quarter + '</td>');
                htmlStrings.qnt2 += ('<td>' + statistics[prop].quantiles.half + '</td>');
                htmlStrings.qnt3 += ('<td>' + statistics[prop].quantiles.threequarter + '</td>');
            }

            var fullHtmlString = '<h4>Statistics</h4><table>';
            for (var str in htmlStrings) {
                fullHtmlString += (htmlStrings[str] + '</tr>');
            }

            fullHtmlString += '</table><br><h4>Histogram</h4>' +
                '<div id="histogram" style="height: 100px; width: 100%;"></div>';

            this._div.innerHTML = fullHtmlString;

            // initialize a new flot graph with histogram data.
            // timeout needed to wait for dom element creation :^(
            setTimeout(function() {
                $.plot('#histogram', histogramData, {
                    legend: { show: false },
                    grid: { hoverable: true, borderWidth: 0.5 },
                    series: {
                        lines: { show: false },
                        bars: { show: true, barWidth: 0.5, lineWidth: 1 },
                        stack: 0
                    },
                    colors: ['#0000ff']
                });
            }, 25);
        };

        _statsview.addTo(map);
    }

    _initialize(map);
    return this;
}
