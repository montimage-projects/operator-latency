const config      = require("../../libs/config");
const constant    = require("../../libs/constant.js");
const dataAdaptor = require('../../libs/dataAdaptor');
const DBC         = require('../../libs/DataDB');


const reaction_mng = require('./reaction_manager');

const NIC_RAW = config.sla.nic;
//{ enp0s3: 'primary', enp0s9: 'secondary' }
const NIC = {}
for( let k in NIC_RAW){
	let v = NIC_RAW[k];
	NIC[v] = k;
}
/*
{
		primary  : process.env.PRIMARY_INTERFACE,
		secondary: process.env.SECONDARY_INTERFACE
}*/

const COL = dataAdaptor.StatsColumnId;
const LAT = dataAdaptor.LatencyColumnId;

var RELOAD_DB_INTERVAL_MILISECOND = 30 * 1000; // X second

//global variable for this module
var dbconnector = null;

const DATA = {
	has_sla: false,
	sla_conf: {},
	next_reload_db_ms: 0,
	report: {
		msg: {},
		type: 0,
		nic: ""
	}
}

function _createSecurityAlert(probe_id, source, timestamp, property_id, verdict, type, description, history) {
	const msg = [10, probe_id, source, timestamp, property_id, verdict, type, description, history];
	var obj = {};
	for (var i in msg)
		obj[i] = msg[i];

	dbconnector._updateDB("security", "insert", obj, function(err, data) {
		if (err)
			return console.error(err);
		//console.log( data );
	});
}

//type: violation | alert
// keep metric_id as legacy reason
function _raiseMessage(type, app_id, com_id, metric_id, threshold, value, priority, other) {
	if (!isNaN(value))
		value = Math.round(value * 100) / 100;
	else
		value = JSON.stringify(value);

	if (other)
		other = JSON.stringify(other)
	else
		other = '{}'
	const timestamp = (new Date()).getTime();
	const msg = [timestamp, app_id, com_id, metric_id, type, priority, threshold, value, other];
	var obj = {};
	for (var i in msg)
		obj[i] = msg[i];

	//console.log("new SLA alert", obj)
	reaction_mng.process( obj );
	dbconnector._updateDB("metrics_alerts", "insert", obj, function(err, data) {
		if (err)
			return console.error(err);
		//console.log( data );
	});
}

function convertToMicroSecond(value, unit) {
	value = parseFloat(value);
	switch (unit) {
		case "s":
			return value * 1000 * 1000;
		case "ms":
			return value * 1000;
		case "us":
			return value;
	}
	console.error("unkown unit " + unit);
	return value;
}

function _checkTargetLocation(metric, m, app, com) {
	//we are interested in only app report
	if( DATA.report.type != dataAdaptor.CsvFormat.NO_SESSION_STATS_FORMAT
	   && DATA.report.type != dataAdaptor.CsvFormat.SESSION_STATS_FORMAT)
		return;

	//the thresholds can be provided via SLA file
	const alert_loc = m.alert, violation_loc = m.violation;

	const row = DATA.report.msg;
	const ip_src = row[COL.IP_SRC];
	const ip_dst = row[COL.IP_DST];
	const dst_loc = row[COL.DST_LOCATION];

	// create a security alert to show it in "security" dashboard
	const val = [
		["ip.src", ip_src],
		["ip.dst", ip_dst],
		["loc.dst", dst_loc]
	];
	const other = { "ip": ip_src };

	//create a security alert only when the metric is violated
	if (dst_loc == violation_loc) {
		console.log("=>  detected: ", val);
		return _raiseMessage(constant.VIOLATION_STR, app.app_id, com.id, metric.name, m.violation, val, m.priority, other);
	} else if( dst_loc == alert_loc){
		console.log("=>  detected: ", val);
		return _raiseMessage(constant.ALERT_STR, app.app_id, com.id, metric.name, m.alert, val, m.priority, other);
	}
}


function _checkPacketProtocol(metric, m, app, com) {
	//we are interested in only app report
	if( DATA.report.type != dataAdaptor.CsvFormat.NO_SESSION_STATS_FORMAT
	   && DATA.report.type != dataAdaptor.CsvFormat.SESSION_STATS_FORMAT)
		return;
		
	const alert_val = m.alert;
	const violation_val = m.violation;
	const row = DATA.report.msg;
	const app_id = row[COL.APP_ID];
	const app_name = dataAdaptor.getProtocolNameFromID( app_id );
	const ip_src = row[COL.IP_SRC];
	const ip_dst = row[COL.IP_DST];

	// create a security alert to show it in "security" dashboard
	const val = [
		["ip.src", ip_src],
		["ip.dst", ip_dst],
		["app",    app_name]
	];
	const other = { "ip": ip_src };

	//create a security alert only when the metric is violated
	if (app_name == violation_val) {
		console.log("=>  detected: ", val);
		return _raiseMessage(constant.VIOLATION_STR, app.app_id, com.id, metric.name, m.violation, val, m.priority, other);
	} else if( app_name == alert_val) {
		console.log("=>  detected: ", val);
		return _raiseMessage(constant.ALERT_STR, app.app_id, com.id, metric.name, m.alert, val, m.priority, other);
	}
}


function _checkHigherMeasureMetric(nic, col_id, label, metric, m, app, com) {
	//we are interested in only latency report
	if( DATA.report.type != dataAdaptor.CsvFormat.LATENCY_PROBE_FORMAT)
		return;

	if( DATA.report.nic != nic )
		return;
		
	const unit = m.unit;
	//the thresholds can be provided via SLA file
	const alert_val = convertToMicroSecond(m.alert, unit);
	const violation_val = convertToMicroSecond(m.violation, unit);
	const row = DATA.report.msg;
	const ret = row[col_id];
	
	//not satisfy
	if( ret < Math.min(alert_val, violation_val) )
		return;

	// create a security alert to show it in "security" dashboard
	const val = [
		[label, ret],
		["channel", row[COL.SOURCE_ID]],
		["unit", "microsecond"],
	];
	console.log("=>  detected: ", val);
	const other = {};

	//create a security alert only when the metric is violated
	if (ret >= violation_val) {
		return _raiseMessage(constant.VIOLATION_STR, app.app_id, com.id, metric.name, m.violation, val, m.priority, other);
	} else
		return _raiseMessage(constant.ALERT_STR, app.app_id, com.id, metric.name, m.alert, val, m.priority, other);
}


function _checkLowerMeasureMetric(nic, col_id, label, metric, m, app, com) {
	//we are interested in only latency report
	if( DATA.report.type != dataAdaptor.CsvFormat.LATENCY_PROBE_FORMAT)
		return;
		
	if( DATA.report.nic != nic)
		return;
		
	const unit = m.unit;
	//the thresholds can be provided via SLA file
	const alert_val = convertToMicroSecond(m.alert, unit);
	const violation_val = convertToMicroSecond(m.violation, unit);
	const row = DATA.report.msg;
	const ret = row[col_id];
	
	
	
	//not satisfy
	if( ret > Math.min(alert_val, violation_val) )
		return;

	const val = [
		[label, ret],
		["channel", row[COL.SOURCE_ID]],
		["unit", "microsecond"],
	];
	//console.log("=>  detected: ", val);
	const other = {};

	//create a security alert only when the metric is violated
	if (ret <= violation_val) {
		return _raiseMessage(constant.VIOLATION_STR, app.app_id, com.id, metric.name, m.violation, val, m.priority, other);
	} else
		return _raiseMessage(constant.ALERT_STR, app.app_id, com.id, metric.name, m.alert, val, m.priority, other);
}

function now_ms() {
	return (new Date()).getTime();
}

function reload_sla_from_database() {
	const now_ts = now_ms();
	if( now_ts < DATA.next_reload_db_ms)
		return;
	
	DATA.next_reload_db_ms = now_ts + RELOAD_DB_INTERVAL_MILISECOND;
	
	console.log("Checking SLA violation ...");
	//get a list of applications defined in metrics collections
	dbconnector._queryDB("metrics", "find", [], function(err, apps) {
		if (err)
			return console.error(err);
		console.log(`  ==> got ${apps.length} app to check SLA`);
		DATA.sla_conf = apps
	}, false);
}

function perform_check() {
	const apps = DATA.sla_conf;
	//for each application
	for (var i in apps) {
		var app = apps[i];
		if (app == null)
			continue;

		if (app.selectedMetric == undefined)
			continue;

		//for each component in the app
		for (var j in app.components) {
			var com = app.components[j];

			var selectedMetrics = app.selectedMetric[com.id];

			//no metric
			if (selectedMetrics == undefined)
				continue;

			var metrics = com.metrics

			if (metrics == undefined || metrics.length === 0)
				metrics = app.metrics; //common metrics being used by any app
			else
				metrics = metrics.concat(app.metrics);

			//no metrics
			if (metrics == undefined || metrics.length === 0)
				continue;


			//for each selected metric of a component
			for (var k in metrics) {
				//original definition of metric
				var metric = metrics[k];

				//prameter of the metric is set by user
				var m = selectedMetrics[metric.id];
				if (m == undefined)
					continue;

				//metric is disable
				if (!m.enable)
					continue;

				//no alerts nor violation conditions
				if (m.alert == "" && m.violation == "")
					continue;

				//metric: original metric
				//m: metric's values that have been updated by user via GUI
				switch (metric.name) {

					case "mon.PacketTargetLocation":
						_checkTargetLocation(metric, m, app, com);
						break;
					case "mon.PacketProtocol":
						_checkPacketProtocol(metric, m, app, com);
						break;

					case "measure.HigherLatencyPrimary":
						_checkHigherMeasureMetric(NIC.primary, LAT.LATENCY_AVG, "latency", metric, m, app, com);
						break;
					case "measure.HigherJitterPrimary":
						_checkHigherMeasureMetric(NIC.primary, LAT.JITTER, "jitter", metric, m, app, com);
						break;

					case "measure.LowerLatencyPrimary":
						_checkLowerMeasureMetric(NIC.primary, LAT.LATENCY_AVG, "latency", metric, m, app, com);
						break;
					case "measure.LowerJitterPrimary":
						_checkLowerMeasureMetric(NIC.primary, LAT.JITTER, "jitter", metric, m, app, com);
						break;

					case "measure.HigherLatencySecondary":
						_checkHigherMeasureMetric(NIC.secondary, LAT.LATENCY_AVG, "latency", metric, m, app, com);
						break;
					case "measure.HigherJitterSecondary":
						_checkHigherMeasureMetric(NIC.secondary, LAT.JITTER, "jitter", metric, m, app, com);
						break;

					case "measure.LowerLatencySecondary":
						_checkLowerMeasureMetric(NIC.secondary, LAT.LATENCY_AVG, "latency", metric, m, app, com);
						break;
					case "measure.LowerJitterSecondary":
						_checkLowerMeasureMetric(NIC.secondary, LAT.JITTER, "jitter", metric, m, app, com);
						break;
					
				}
			}
		}
	}

}



function start(){
	if( ! config.sla )
		return console.log("Not found SLA in config");

	
	dbconnector = new DBC();
	//when db is ready
	dbconnector.onReady( function(){
		console.log("Start SLA violation checking engine");
		DATA.has_sla = true
	});

	reaction_mng.start( dbconnector, NIC )
}


function process_msg( report ) {
	if( !DATA.has_sla)
		return
	reload_sla_from_database();
	DATA.report = {
		msg: report,
		type: report[ COL.FORMAT_ID ],
		nic: report[ COL.SOURCE_ID ]
	}
	perform_check();
}

module.exports = {
	start: start,
	process: process_msg,
};

