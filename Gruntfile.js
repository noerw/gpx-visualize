var gpx2geojson = require('idris-gpx'),
  async = require('async'),
  turf = require('turf'),
  turfMeta = require('turf-meta');

module.exports = function(grunt) {

  grunt.initConfig({
    parseGPX: {
      src: 'data/Rush-Hour_Nebenstrecke.gpx',
      dest: 'tracks.json',
      pretty: true
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
        files: ['<%= parseGPX.src %>'],
        tasks: ['parseGPX'],
        options: { livereload: true }
      },
      static: {
        files: ['static/**',  'index.html', '<%= parseGPX.dest %>'],
        options: { livereload: true }
      }
    }
  });

  grunt.loadNpmTasks('grunt-ftp-push');
  grunt.loadNpmTasks('grunt-contrib-connect');
  grunt.loadNpmTasks('grunt-contrib-watch');

  grunt.registerTask('parseGPX', function() {
    grunt.config.requires('parseGPX.src');
    grunt.config.requires('parseGPX.dest');

    var done = this.async();
    var paths = grunt.file.expand({ filter: 'isFile' }, grunt.config('parseGPX.src'));

    async.map(paths, function(path, callback) {
      var basename = path.split('/').pop().split('.');

      if (basename[basename.length-1] !== 'gpx') return callback('unknown file format');

      gpx2geojson.points(path, function(json) {
        processGeoJSON(json, basename[0].split('_'), callback);
      });
    },
    function allParsed(err, result) {
      if (err) return done(err);
      grunt.file.write(grunt.config('parseGPX.dest'),
        JSON.stringify(result, null, grunt.config('parseGPX.pretty') ? 2 : 0));
      done();
    });
  });

  grunt.registerTask('publish', ['parseGPX', 'ftp_push']);
  grunt.registerTask('default', ['parseGPX', 'connect', 'watch']);
};

//////////////////////////////////////////////////////////////////////

function processGeoJSON(geojson, tags, done) {
  // create a clone of the data & convert strings to numbers where possible
  var data = JSON.parse(JSON.stringify(geojson), function(key, val) {
    return !isNaN(parseFloat(val)) && isFinite(val) ? parseFloat(val) : val;
  });

  var prevPoint = null, prevLine = null, lines = [], eventPoints = [], result = {
    meta: {
      tags: tags || [],
      length: 0,   // kilometers
      duration: 0, // hours
      date: data.features[0].properties.date,
      events: {}
    },
    events: {},
    track: turf.featureCollection(lines)
  };

  turfMeta.featureEach(data, function(point) {
    // create a line from the waypoints
    if (prevPoint !== null) {
      var linestring = turf.lineString([
        prevPoint.geometry.coordinates, point.geometry.coordinates
      ]);
      var duration = new Date(point.properties.time) - new Date(prevPoint.properties.time);
      duration /= 1000 * 60 * 60; // convert millisec to hours
      linestring.properties.length = turf.distance(prevPoint, point, 'kilometers');
      linestring.properties.speed = linestring.properties.length / duration;
      linestring.properties.bearing = turf.bearing(prevPoint, point);
      linestring.properties.elevation = point.properties.ele - prevPoint.properties.ele;

      // update global metadata
      result.meta.duration += duration;
      result.meta.length += linestring.properties.length;
      lines.push(linestring);
    }

    prevPoint = point;
  });

  // detect events
  var events = {
    'stop': {
      fn: function isStop(line, prevLine) {
        var speedThresh = 10;  // km/h
        return (line.properties.speed <= speedThresh);
      },
      coordIndex: 1
    },
    'turn': {
      fn: function isTurn(line, prevLine) {
        var bearingThresh = 66; // degrees
        var distanceThresh = 0.005; // km
        var angle = line.properties.bearing - prevLine.properties.bearing;
        if (angle > 180)       angle -= 360;
        else if (angle < -180) angle += 360;

        if (prevLine.properties.length > distanceThresh && Math.abs(angle) >= bearingThresh)
          return true;
        return false;
      },
      coordIndex: 0
    }
  };

  // init eventcounters
  for (var type in events) result.meta.events[type + 's'] = 0;

  // add a point to result, if at least one event occured on the current line
  turfMeta.featureEach(result.track, function(line) {
    if (prevLine !== null) {
      var point = turf.point(line.geometry.coordinates[1], { events: [] });

      for (var type in events) {
        if (events[type].fn(line, prevLine)) {
          if (events[type].coordIndex === 1) point.properties.events.push(type);
          else prevPoint.properties.events.push(type);
          result.meta.events[type + 's']++;
        }
      }
      eventPoints.push(point);
    }
    prevLine = line;
    prevPoint = point;
  });

  result.events = eventPoints.filter(function(val, i, arr) {
    return (val.properties.events.length > 0) ? true : false;
  })

  done(null, result);
}
