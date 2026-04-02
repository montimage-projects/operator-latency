const config      = require("../../libs/config");

const ROUTER_HOST = process.env.ROUTER_HOST;
const ROUTER_PORT = process.env.ROUTER_PORT;

const http = require("http");

function http_request(method, path, body, callback) {
	const payload = JSON.stringify(body);
	console.info(`${method} to http://${ROUTER_HOST}:${ROUTER_PORT}${path}\n ${payload}`)
	
	
	if(! ROUTER_HOST)
		return console.warn("No ROUTER_HOST. Ignore the request");
	
	callback = callback || function(){
		console.log(arguments);
	}
	
	try{
		const req = http.request(
			{
				host: ROUTER_HOST,
				port: ROUTER_PORT,
				path: path,
				method: method,
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(payload),
				},
			},
			function(res) {
				var chunks = [];
				res.on("data", function(chunk) { chunks.push(chunk); });
				res.on("end", function() {
					var raw = Buffer.concat(chunks).toString();
					var data;
					try {
						data = JSON.parse(raw);
					} catch (e) {
						return callback(new Error("Invalid JSON response: " + raw));
					}
					if (res.statusCode >= 200 && res.statusCode < 300) {
						callback(null, data.block);
					} else {
						callback(new Error("Failed : " + (data.error || res.statusMessage)));
					}
				});
			}
		);

		req.on("error", callback);
		req.write(payload);
		req.end();
	}catch( e ){
		callback(e)
	}
}

module.exports = {
	block_flow: function(flow_conf, callback){
		return http_request("POST", "/api/blocks", flow_conf, callback);
	},
	redirect_flow: function(flow_conf, callback){
		return http_request("POST", "/api/flows", flow_conf, callback);
	},
	set_gateway: function(nic, callback){
		return http_request("PUT", "/api/gateway", {"wan_interface": nic, description: `From MMT-Operator (${new Date()})`}, callback);
	}
}

