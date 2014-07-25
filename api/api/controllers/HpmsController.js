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
    // This controller method requests and returns data
    // for the specified state and an optional road type.
    geo: function(req, res) {

        // Search HPMS table by FIPS code.
      	Hpms.find().where({ state_fips :req.param('id')}).exec(function (err, result) {
            // retrieve table name from search result
        	var tableName = result[0].table_name;

            // create geoJSON feature collection object
        	var routesCollection = {};
        	routesCollection.type = "FeatureCollection";
        	routesCollection.features = [];

            // create SQL query string
        	var sql = 'SELECT ST_AsGeoJSON(the_geom) AS route_shape, state_code, aadt_vn, f_system_v FROM "'+tableName+'"';

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


      /**
       * Overrides for the settings in `config/controllers.js`
       * (specific to HpmsController)
       */
    _config: {}

  
};
