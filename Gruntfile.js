var fs = require('fs'),
  csv = require('csv'),
  async = require('async');

module.exports = function(grunt) {

  grunt.initConfig({
    parseCSV: {
      src: 'data/**/*.csv',
      dest: 'tracks.json',
      pretty: false
    },
    ftp_push: {
      nroo: {
        options: {
          host: '88.79.198.170',
          dest: '/httpdocs/gps-traffic/',
          username: 'yvbfqhoh',
          password: 'uk7Xx%74'
        },
        files: [{
          expand: true,
          cwd: '.',
          src: [
            '*.html',
            '*.json',
            'static/**'
          ]
        }]
      }
    },
    connect: {
      server: {
        options: {
          open: true,
          livereload: true,
          debug: true,
          hostname: 'localhost'
        }
      }
    },
    watch: {
      sources: {
        files: ['<%= parseCSV.src %>'],
        tasks: ['parseCSV'],
        options: { livereload: true }
      },
      static: {
        files: ['static/**',  'index.html', '<%= parseCSV.dest %>'],
        options: { livereload: true }
      }
    }
  });

  grunt.loadNpmTasks('grunt-ftp-push');
  grunt.loadNpmTasks('grunt-contrib-connect');
  grunt.loadNpmTasks('grunt-contrib-watch');

  grunt.registerTask('parseCSV', function() {
    grunt.config.requires('parseCSV.src');
    grunt.config.requires('parseCSV.dest');

    var done = this.async();
    var paths = grunt.file.expand({ filter: 'isFile' }, grunt.config('parseCSV.src'));

    async.map(paths, function(path, done) {
      var group = path.split('/');
      csv2geojson(grunt.file.read(path), {
        group: group[group.length-2],
        name: path.split('/').pop().split('.')[0]
      }, done);
    },
    function allParsed(err, result) {
      if (err) return done(err);

      grunt.file.write(grunt.config('parseCSV.dest'),
        JSON.stringify(result, null, grunt.config('parseCSV.pretty') ? 2 : 0));
      done();
    });
  });

  grunt.registerTask('publish', ['parseCSV', 'ftp_push']);
  grunt.registerTask('default', ['parseCSV', 'connect', 'watch']);
};

//////////////////////////////////////////////////////////////////////

// parses easylogger csv files to geojson
function csv2geojson(csvData, properties, callback) {
  var csvParseOpts = { columns: true, auto_parse: true };
  csv.parse(csvData, csvParseOpts, function(err, data) {
    if (err) return callback(err);

    var geojson = {
      'Track': {
        type: 'FeatureCollection',
        features: [],
        properties: {}
      },
      'POIs': {
        type: 'FeatureCollection',
        features: [],
        properties: {}
      }
    };

    geojson['Track'].properties = properties;
    geojson['Track'].properties.date = data[0]['Date Created'];
    //geojson['Track'].properties.duration =
    //geojson['Track'].properties.maxSpeed =
    //geojson['Track'].properties.heightDelta =
    geojson['Track'].properties.length = data[data.length - 1]['Distance from Start'];
    geojson['Track'].properties['number of stops'] = 0;
    geojson['Track'].properties['number of turns'] = 0;
    geojson['Track'].properties['number of turns with stop'] = 0;

    // required to parse the track / linestring
    var prevCoords = [data[0]['Longitude'], data[0]['Latitude'], data[0]['Elevation']];

    for (var i = 1; i < data.length; i++) {
      var coords = [data[i]['Longitude'], data[i]['Latitude'], data[i]['Elevation']];

      // detect stops etc
      var stopFlag = isStop(data[i]);
      var turnFlag = isTurn(data[i], data[i-1]);

      var point = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: coords
        },
        properties: {
          type: '',
          speed: data[i]['Speed'],
          distance: data[i]['Distance from Last']
        }
      };

      if (stopFlag && turnFlag) {
        geojson['Track'].properties['number of turns with stop']++;
        point.properties.type = 'stop & turn';
        geojson['POIs'].features.push(point);
      } else if (!stopFlag && turnFlag) {
        geojson['Track'].properties['number of turns']++;
        point.properties.type = 'turn';
        geojson['POIs'].features.push(point);
      } else if (stopFlag) {
        geojson['Track'].properties['number of stops']++;
        point.properties.type = 'stop';
        geojson['POIs'].features.push(point);
      } else {
        geojson['POIs'].features.push(point);
      }

      // lines
      geojson['Track'].features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [coords, prevCoords]
        },
        properties: {
          speed: data[i]['Speed'],
          bearing: data[i]['Bearing']
        }
      });

      prevCoords = coords;
    }

    geojson['Track'].properties['number of turns'] += geojson['Track'].properties['number of turns with stop'];

    callback(null, geojson);
  });

  function isStop(point, prevPoint) {
    var speedThresh = 9.5;  // km/h
    return point['Speed'] <= speedThresh;
  };

  function isTurn(point, prevPoint) {
    var bearingThresh = 80; // degree
    var distanceThresh = 0.005; // km
    if (point['Distance from Last'] > distanceThresh
        && Math.abs(point['Bearing'] - prevPoint['Bearing']) >= bearingThresh)
      return true;
    return false;
  };
}
