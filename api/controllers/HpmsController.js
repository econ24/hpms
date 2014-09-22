/**
 * HpmsController
 *
 * @module      :: Controller
 * @description	:: A set of functions called `actions`.
 *
 *                 Actions contain code telling Sails how to respond to a certain type of request.
 *                 (i.e. do stuff, then send some JSON, show an HTML page, or redirect to another URL)
 *
 *                 You can configure the blueprint URLs which trigger these actions (`config/controllers.js`)
 *                 and/or override them with custom routes (`config/routes.js`)
 *
 *                 NOTE: The code you write here supports both HTTP and Socket.io automatically.
 *
 * @docs        :: http://sailsjs.org/#!documentation/controllers
 */

module.exports = {
    // This controller method requests and returns geographic and general data
    // for the specified state and an optional road type.
    geo: function(req, res) {
        var state = req.param('id');
        
        if (!state) {
            res.json({ error: 'You must supply a state FIPS', status: 500 }, 500);
            return;
        }

        // Search HPMS table by FIPS code.
      	Hpms.find().where({ state_fips: state }).exec(function (err, result) {
            // retrieve table name from search result
        	var tableName = result[0].table_name;

            // create geoJSON feature collection object
        	var routesCollection = {};
        	routesCollection.type = "FeatureCollection";
        	routesCollection.features = [];

            // create SQL query string
        	var sql = 'SELECT ST_AsGeoJSON(the_geom) AS route_shape, '+
                       'state_code, aadt_vn, f_system_v '+
                       'FROM "'+tableName+'"';

            // check for a specific road type
            var roadType = +req.param("roadType");
            if (roadType >= 1 && roadType <= 7) {
                sql += " WHERE f_system_v = " + roadType;
            }

            // query the DB
        	Hpms.query(sql,{},function(err, resultSet) {
        		if (err) {
                    res.send('{status:"error",message:"'+err+'"}',500);
                    return console.log(err);
                }
                // for each result in the result set, generate a new geoJSON feature object
                resultSet.rows.forEach(function(route){
        			var routeFeature = {};
        			routeFeature.type="Feature";
                    // retrieve geometry data
        			routeFeature.geometry = JSON.parse(route.route_shape);
                    // retrieve properties
        			routeFeature.properties = {};
                    routeFeature.properties.state = route.state_code;
                    routeFeature.properties.aadt = route.aadt_vn;
                    routeFeature.properties.roadType = route.f_system_v;
        			routesCollection.features.push(routeFeature);
        		});

                // convert the geoJSON into a simplified topoJSON object to reduce size
                var topojson = require("topojson"),
      		 	    topology = topojson.topology({geo: routesCollection},
                                                 {"property-transform": preserveProperties, "quantization": 1e6});
                topology = topojson.simplify(topology, {"minimum-area": 5e-6, "coordinate-system": "cartesian"});

                // append topoJSON to response object
    			res.send(topology);

                // This method is used by the above opoJSON conversion in order to preserve the geoJSON properties
                function preserveProperties(p, k, v) {
                    p[k] = v;
                    return true;
                }
        	}); // end Hpms.query function

        }) // end Hpms.find function

    }, // end geo function

    aadt: function(req, res) {
        var states = req.param('states'),
            types = req.param('types');
        
        if (!(states && types)) {
            res.json({ error: 'You must post an array of table names and a road type', status: 500 }, 500);
            return;
        }

        var sql = '';
        states.forEach(function(d) {
            sql += '(SELECT aadt_vn from ' + d + ' WHERE f_system_v <= ' + types + ') UNION ALL '
        });
        sql = sql.replace(/( UNION ALL $)/, '');

        Hpms.query(sql, {}, function(error, data) {
            var response = [];

            data.rows.forEach(function(d) {
                response.push(d.aadt_vn);
            })

            res.send(response, 200);
        })
    },

    getInterstateData: function(req, res) {
        var route = req.param('route');

        var sql = 'SELECT sum(aadt_vn) AS aadt, count(aadt_vn) AS segments, state_code as state '+
                    'FROM "2012_NHS" '+
                    'WHERE route_numb = ' + route + ' ' +
                    'AND f_system_v = 1 ' +
                    'GROUP BY state';

        Hpms.query(sql, {}, function(error, data) {

            var response = {
                route: route,
                states: [],
                type: 1,
                segments: 0,
                aadt: 0
            };

            data.rows.forEach(function(row) {
                if (response.states.indexOf(+row.state) === -1) {
                    response.states.push(+row.state);
                }
                response.segments += +row.segments;
                response.aadt += +row.aadt;
            })

            response.aadt = Math.round(response.aadt / response.segments);

            res.send(response);
        })
    },

    getIntrastateData: function(req, res) {
        var route = req.param('route'),
            type = req.param('type'),
            state = req.param('state');

        var sql = 'SELECT sum(aadt_vn) AS aadt, count(aadt_vn) AS segments '+
                    'FROM "2012_NHS" '+
                    'WHERE route_numb = ' + route + ' ' +
                    'AND f_system_v = ' + type + ' ' +
                    'AND state_code = ' + state + ';'

        Hpms.query(sql, {}, function(error, data) {

            var response = {
                route: route,
                states: [state],
                type: type,
                segments: 0,
                aadt: 0
            };

            data.rows.forEach(function(row) {
                response.segments += +row.segments;
                response.aadt += +row.aadt;
            })

            response.aadt = Math.round(response.aadt / response.segments);

            res.send(response);
        })
    },

    getInterstateGeo: function(req, res) {
        var route = req.param('route');

        var sql = 'SELECT aadt_vn AS aadt, f_system_v AS type, route_numb as route, '+
                    'state_code AS state, ST_AsGeoJSON(the_geom) AS json '+
                    'FROM "2012_NHS" '+
                    'WHERE route_numb = ' + route + ' ' +
                    'AND f_system_v = 1';

        Hpms.query(sql, {}, function(error, data) {
            if (error) {
                res.send({status:500,message:error},500);
                return;
            }
            var collection = {
                type: 'FeatureCollection',
                features: []
            }
            // for each result in the result set, generate a new geoJSON feature object
            data.rows.forEach(function(route){
                var routeFeature = { type: "Feature" };
                // retrieve geometry data
                routeFeature.geometry = JSON.parse(route.json);
                // retrieve properties
                routeFeature.properties = {};
                routeFeature.properties.state = route.state;
                routeFeature.properties.aadt = route.aadt;
                routeFeature.properties.type = route.type;
                routeFeature.properties.route = route.route;

                collection.features.push(routeFeature);
            });

            // convert the geoJSON into a simplified topoJSON object to reduce size
            var topojson = require("topojson"),
                topology = topojson.topology({geo: collection},
                                             {"property-transform": preserveProperties, "quantization": 1e6});
            topology = topojson.simplify(topology, {"minimum-area": 5e-6, "coordinate-system": "cartesian"});

            // append topoJSON to response object
            res.send(topology);

            // This method is used by the above opoJSON conversion in order to preserve the geoJSON properties
            function preserveProperties(obj, key, val) {
                obj[key] = val;
                return true;
            }
        }); // end Hpms.query function
    },

    getInterstates: function(req, res) {
        var sql = 'SELECT route_numb AS route, '+
            'sum(aadt_vn) AS aadt, count(aadt_vn) AS count '+
            'FROM "2012_NHS" ' +
            'WHERE route_numb IN '+makeINlist()+' '+
            'AND f_system_v = 1 '+
            'GROUP BY route_numb';

        Hpms.query(sql, {}, function(error, data) {
            if (error) {
                res.send({status:500, message:error},500);
                return console.log(error);
            }

            var response = [];

            // for each result in the result set, generate a new geoJSON feature object
            data.rows.forEach(function(route){
                var obj ={};

                obj.route = route.route;
                obj.aadt = +route.aadt / +route.count;
                obj.segments = +route.count;
                obj.type = route.type;

                response.push(obj);
            });

            res.send(response);
        })

        function makeINlist() {
            var list = '(';

            for (var i = 5; i < 100; i+=5) {
                list += "'"+i+"', ";
            }
            list = list.replace(/(, $)/, ') ');

            return list;
        }
    },

    interstatesByState: function(req, res) {
        var sql = 'SELECT sum(aadt_vn) as aadt, count(*) as segments, state_code AS state '+
                    'FROM "2012_NHS" '+
                    'WHERE f_system_v = 1 '+
                    'AND route_numb IN '+makeINlist()+' '+
                    'GROUP BY state_code';

        Hpms.query(sql, {}, function(error, data) {
            if (error) {
                res.send({status:500, message:error},500);
                return console.log(error);
            }

            var response = {};

            // for each result in the result set, generate a new geoJSON feature object
            data.rows.forEach(function(route){
                response[route.state] = +route.aadt / +route.segments;
            });

            res.send(response);
        })

        function makeINlist() {
            var list = '(';

            for (var i = 5; i < 100; i+=5) {
                list += "'"+i+"', ";
            }
            list = list.replace(/(, $)/, ') ');

            return list;
        }
    },

      /**
       * Overrides for the settings in `config/controllers.js`
       * (specific to HpmsController)
       */
    _config: {}

  
};
