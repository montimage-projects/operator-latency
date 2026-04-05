const CONSTANT = require("../../libs/constant.js");

const config = require("../../libs/config");
const constant = require("../../libs/constant.js");
const dataAdaptor = require('../../libs/dataAdaptor');

//const NIC = require('./wan_interfaces');
const NIC = {};

const restful_action = require("./post_reaction");
//const METRIC_COL  = dataAdaptor.StatsColumnId;

//interval allowing to select the alerts to be checked
let CHECK_AVG_INTERVAL_MILISECOND = 60 * 1000; //1 minute


//col id of element in metric_alert collection
const METRIC_COL = {
	TIMESTAMP: 0,
	APP_ID: 1,
	COM_ID: 2,
	METRIC_NAME: 3,
	TYPE: 4,
	PRIORITY: 5,
	THRESHOLD: 6,
	VALUE: 7,
	OTHER_INFO: 8
}

//global variable for this module
var dbconnector = {};
const DATA = {
	alerts: []
};
const REACTORS = {};

const LAST = {}

function check_time(key) {
	if (!LAST[key]) {
		LAST[key] = (new Date()).getTime();
		return true;
	}
	const now = (new Date()).getTime();
	if (now - LAST[key] < 60 * 1000)
		return false;

	LAST[key] = now;
	return true;
}

function execute_restfull_action(action_name, msg, metric_alert_or_violation) {
	try {
		const values = JSON.parse(metric_alert_or_violation[METRIC_COL.VALUE]);
		/*
		val = [
						["ip.src", ip_src], 
						["ip.dst", ip_dst],
						["loc.dst", dst_loc]
				];
		*/
		let src_ip = undefined, dst_ip = undefined;
		values.forEach(function(v) {
			switch (v[0]) {
				case "ip.src":
					src_ip = v[1];
					break;
				case "ip.dst":
					dst_ip = v[1];
					break;
			}
		});

		//if(! check_time(`${action_name}-${src_ip}-${dst_ip}`) ){
		//	console.log(" ==> skip this action ");
		//	return;
		//}

		//action_name in config.sla.actions
		switch (action_name) {
			case "drop_traffic":
				restful_action.block_flow({
					//src_ip: src_ip, 
					dst_ip: dst_ip
				});
				break;
			case "use_primary_chan":

				console.log(`NIC: ${NIC.primary}`);

				if (src_ip && dst_ip)
					restful_action.redirect_flow({
						//src_ip: src_ip, 
						dst_ip: dst_ip,
						wan_interface: NIC.primary,
						description: `${action_name} (${new Date()})`
					});
				else
					restful_action.set_gateway(NIC.secondary);

				break;
			case "use_chan_2":

				console.log(`NIC: ${NIC.secondary}`);

				if (src_ip && dst_ip)
					restful_action.redirect_flow({
						//src_ip: src_ip, 
						dst_ip: dst_ip,
						wan_interface: NIC.secondary,
						description: `${action_name} (${new Date()})`
					});
				else
					restful_action.set_gateway(NIC.secondary);

				break;
			case "share_channels":
				//dst_ip = "10.45.0.1"; //fixed
				restful_action.redirect_flow({
						dst_port: 9001,
						protocol: 'tcp',
						wan_interface: NIC.secondary,
						description: `${action_name} (${new Date()})`
					});
				restful_action.redirect_flow({
						dst_port: 9000,
						protocol: 'tcp',
						wan_interface: NIC.primary,
						description: `${action_name} (${new Date()})`
					});
				break;
		}
	} catch (e) {
		console.error(e.message);
	}
}

//raise message on a special channel of pub-sub
// + save message to DB
function _raiseMessage(action_name, msg, metric_alert_or_violation) {
	const action = REACTORS[action_name];
	if (action == undefined)
		return console.error("Reaction [" + action_name + "] is not supported");

	execute_restfull_action(action_name, msg, metric_alert_or_violation);

	const obj = {};
	for (const i in msg)
		obj[i] = msg[i];

	//add reaction at the end of message
	obj[msg.length] = JSON.stringify(metric_alert_or_violation);

	console.log(JSON.stringify(obj))

	dbconnector._updateDB("metrics_reactions", "insert", obj, function(err, data) {
		if (err)
			return console.error(err);
		//console.log( data );
	});
}


//Check on reaction on DB
function _checkReaction(reaction) {
	console.log("checking SLA reaction: " + JSON.stringify(reaction));
	/*
	reaction = {
				"app_id": "xxx",
				"comp_id":"30",
				"conditions":{"incident":["alert","violation"]},
				"actions":["down_5min"],
				"priority":"MEDIUM",
				"note":"Recommendation: when having incident (alert or violation) then perform \"down_5min\" action",
				"enable":true,
				"id":"0886f1dd-6424-4f52-8ad1-ff4547c5a301"
			}
	*/
	const alerts = [];
	for( var i=0; i<DATA.alerts.length; i++ ){
		var alert = DATA.alerts[i];
	
		if (reaction.app_id && alert[METRIC_COL.APP_ID] != reaction.app_id)
			continue;
		if (reaction.comp_id && alert[METRIC_COL.COM_ID] != reaction.comp_id)
			continue;

		alerts.push( alert );
	}
	
	if( alerts.length == 0 )
		return;

	
	var result = undefined
	for (var cond in reaction.conditions) {
		
		//check whether there exist an alert that satisfies the condition
		result = alerts.find (function(alert){
			if( alert[METRIC_COL.METRIC_NAME] != cond )
				return false;
			// either in alert or violation
			if( ! reaction.conditions[cond].includes(alert[METRIC_COL.TYPE]) )
				return false;
			return true;
		})
		
		// we require all conditions are satisify (AND-condition)
		if( !result )
			return console.log("not found");
	}
	
	for (var i = 0; i < reaction.actions.length; i++)
		_raiseMessage(reaction.actions[i],
			[
				1002,                   //0. format id
				reaction.app_id || 1,   //1. probe id
				"iOper",                //2. src
				(new Date()).getTime(), //3. timestamp
				"" + reaction.comp_id,  //4. component ID
				"" + reaction.id,       //5. reaction ID
				reaction.actions[i],    //6. action name
				reaction.note],         //7. reaction note
			result);

	console.log( result );
}

function perform_check() {
	if (DATA.alerts.length == 0)
		return;
	//get a list of applications defined in metrics collections
	dbconnector._queryDB("metrics", "find", [], function(err, apps) {
		if (err) {
			DATA.alerts = [];
			return console.error(err);
		}
		var checked = {};

		console.log('Number of alerts: ' + DATA.alerts.length);
		//for each application
		for (var i in apps) {
			var app = apps[i];
			if (app == null)
				continue;

			//for each component in the app
			for (var react_id in app.selectedReaction) {
				var reaction = app.selectedReaction[react_id];

				//this reaction is disabled
				if (reaction.enable !== true)
					continue;

				//this reaction has been checked
				if (checked[react_id])
					continue;

				//mark its as checked
				checked[react_id] = true;

				//check each reaction
				reaction.id = react_id;
				reaction.app_id = app.id;
				_checkReaction(reaction);

			}
		}
		DATA.alerts = []; //reset list of alerts
	}, false);
}

function start(_dbconnector, nic) {
	for( var i in nic )
		NIC[i] = nic[i]

	if (!config.sla)
		return console.log("Not found SLA in config");

	if (config.sla.reaction_check_period < 2) {
		console.log("Set reaction_check_period = 2 seconds");
		config.sla.reaction_check_period = 2
	}

	for (const react in config.sla.actions)
		REACTORS[react] = config.sla.actions[react];

	//when db is ready
	_dbconnector.onReady(function() {
		console.log("Start SLA reaction checking engine");
		dbconnector = _dbconnector;

		CHECK_AVG_INTERVAL_MILISECOND = config.sla.reaction_check_period * 1000; //each X seconds
		console.log("start SLA reaction checking each " + config.sla.reaction_check_period + " seconds");
		setInterval(perform_check, CHECK_AVG_INTERVAL_MILISECOND);
	});
}

function process(alert) {
	if (DATA.alerts.length > 1000) {
		//remove the first element
		DATA.alerts.shift();
	}
	DATA.alerts.push(alert);
}

var obj = {
	start: start,
	process: process,
};

module.exports = obj;