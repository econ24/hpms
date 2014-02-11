var topojson = require("topojson");
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

  geo: function(req, res) {
    // search for table by FIPS code
  	Hpms.find().where({ stateFIPS :req.param('id')}).exec(function (err, hpms) {

    	var tableName = hpms[0].tableName;

      // create geoJSON objects
    	var routesCollection = {};
    	routesCollection.type = "FeatureCollection";
    	routesCollection.features = [];
    	var sql = 'select ST_AsGeoJSON(the_geom) as route_shape from "'+tableName+'"';
    	Hpms.query(sql,{},function(err,data){
    		if (err) {
         res.send('{status:"error",message:"'+err+'"}',500);
         return console.log(err);
        }
        data.rows.forEach(function(route){
    			var routeFeature = {};
    			routeFeature.type="Feature";
    			routeFeature.geometry = JSON.parse(route.route_shape);
    			routeFeature.properties = {};
    			// routeFeature.properties.route_id = route.route_id;
    			// routeFeature.properties.route_short_name = route.route_short_name;
    			// routeFeature.properties.route_long_name = route.route_long_name;
    			// routeFeature.properties.route_color = route.route_color;
    			routesCollection.features.push(routeFeature);
    		});

    		if(req.param('format') == 'geo'){
    			//JSON.stringify();
    			res.send(routesCollection);	
    		}
    		else{
  		 	var topology = topojson.topology({geo: routesCollection});//,{"property-transform":preserveProperties});
    			res.send(JSON.stringify(topology));
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
