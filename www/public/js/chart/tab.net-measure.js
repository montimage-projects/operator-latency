var arr = [
    {
        id: "latency",
        title: "Raw RTT Latency",
        x: 0,
        y: 0,
        width: 12,
        height: 4,
        type: "success",
        userData: {
            fn: "createLatencyReport"
        },
    },{
        id: "jitter",
        title: "Jitter",
        x: 0,
        y: 5,
        width: 12,
        height: 3,
        type: "info",
        userData: {
            fn: "createJitterReport"
        },
    },{
        id: "pkt_loss",
        title: "Packet-loss",
        x: 0,
        y: 10,
        width: 12,
        height: 3,
        type: "warning",
        userData: {
            fn: "createPacketLossReport"
        },
    }
];

var availableReports = {
	//"createLatencyReport": "Latency"
}

function formatTime( date ){
   return moment( date.getTime() ).format( fPeriod.getTimeFormat() );
}


function inDetailMode() {
    return (fPeriod.selectedOption().id === MMTDrop.constants.period.MINUTE);
}

//create reports

var ReportFactory = {}

ReportFactory.createLatencyReport = function(fPeriod){
   const COL = MMTDrop.constants.LatencyColumn;
   const database = new MMTDrop.Database({
      collection: "data_latency",
      action: "aggregate",
      //no_override_when_reload: true, 
      raw: true,
   }, function( data ){
      return data;
   }, false);

   var fMetric = new MMTDrop.Filter({
               id      : "metric_filter_latency",
               label   : "Metric",
               options : [COL.LATENCY_MIN, COL.LATENCY_AVG, COL.LATENCY_MAX],
               useFullURI: false,
            }, function(){});
   fMetric.getUnit = function(){
               var val = fMetric.selectedOption().id;
               switch( val ){
               case MMTDrop.constants.StatsColumn.PAYLOAD_VOLUME:
               case MMTDrop.constants.StatsColumn.DATA_VOLUME:
                  return "B";

               case MMTDrop.constants.StatsColumn.PACKET_COUNT:
               case MMTDrop.constants.StatsColumn.ACTIVE_FLOWS:
                  return "";
               }
   },
           //redraw cLine when changing fMetric
   fMetric.onFilter(function () {
      cLine.redraw();
   });

   database.updateParameter = function( _old_param ){
      const $match = {};
      $match[ COL.PROBE_ID.id ]  = URL_PARAM.probe_id;
      $match[ COL.TIMESTAMP.id ] = {$gte: status_db.time.begin, $lte: status_db.time.end };

      const $group = { _id: {}};
      [ COL.PROBE_ID.id, COL.TIMESTAMP.id ].forEach( function( el ){
         $group["_id"][ el ] = "$" + el;
      });

      [ COL.LATENCY_AVG.id, COL.JITTER.id, COL.PKT_LOSS_PCT.id ]
      .forEach( function( el ){
          $group[ el ] = {"$avg" : "$" + el};
      });

      [ COL.LATENCY_MIN.id].forEach( function( el ){
          $group[ el ] = {"$min" : "$" + el};
      });
      [ COL.LATENCY_MAX.id].forEach( function( el ){
          $group[ el ] = {"$max" : "$" + el};
      });

      [ COL.TIMESTAMP.id, COL.SOURCE_ID.id, COL.PROBE_ID.id ].forEach( function( el ){
         $group[ el ] = {"$last" : "$"+ el};
      });

      return {query: [{$match: $match}, {$group : $group}, {$project: {_id: 0}}]};
   };


   var cLine = MMTDrop.chartFactory.createTimeline({
      //columns: [MMTDrop.constants.StatsColumn.APP_PATH]
      getData: {
         getDataFn: function (db) {
            const ylabel = "Round-trip time (microsecond)";
            var data = db.data();

            var obj = splitDataByNic(data, fMetric.selectedOption());

            var $widget = $("#" + cLine.elemID).getWidgetParent();
            $widget.find(".filter-bar").height(25);
            var height = $widget.find(".grid-stack-item-content").innerHeight();
            height -= $widget.find(".filter-bar").outerHeight(true) + 30;

            return {
               data   : obj.data,
               columns: obj.columns,
               ylabel : ylabel,
               height : height,
               addZeroPoints:{
                  time_id       : 3,
                  time          : status_db.time,
                  sample_period : 1000 * fPeriod.getDistanceBetweenToSamples(),
                  probeStatus   : status_db.probeStatus,
               },
            };
         },
      },
      chart: {
         data:{
            type: "line"
         },
         axis: {
            x: {
               tick: {
                  format: formatTime
               }
            }
         },
         grid: {
            x: {
               show: false
            }
         },
         tooltip:{
            format: {
               title:  formatTime,
               value: function( value ){
                  return value + "us";
               }
            }
         },
         zoom: {
            enabled: false,
            rescale: false
         },
      },
      afterEachRender: function (_chart) {
         var $widget = $("#" + _chart.elemID).getWidgetParent();
         //resize when changing window size
         $widget.on("widget-resized", null, _chart.chart, function (event, widget) {
            var chart = event.data;
            var height = $widget.find(".grid-stack-item-content").innerHeight();
            height -= $widget.find(".filter-bar").outerHeight(true) + 30;
            chart.resize({
               height: height
            });
         });

      }
   });

   var report = new MMTDrop.Report(
         // title
         "",

         // database
         database,

         // filers
         [fMetric],

         //charts
         [
            {
               charts: [cLine],
               width: 12
            },
            ],

            //order of data flux
            [{  object: cLine }]
   );
   return report;
};




ReportFactory.createJitterReport = function(fPeriod){
   const COL = MMTDrop.constants.LatencyColumn;
   const database = new MMTDrop.Database({
      collection: "data_latency",
      action: "aggregate",
      //no_override_when_reload: true, 
      raw: true,
   }, function( data ){
      return data;
   }, false);

   database.updateParameter = function( _old_param ){
      const $match = {};
      $match[ COL.PROBE_ID.id ]  = URL_PARAM.probe_id;
      $match[ COL.TIMESTAMP.id ] = {$gte: status_db.time.begin, $lte: status_db.time.end };

      const $group = { _id: {}};
      [ COL.PROBE_ID.id, COL.TIMESTAMP.id ].forEach( function( el ){
         $group["_id"][ el ] = "$" + el;
      });

      [ COL.JITTER.id ]
      .forEach( function( el ){
          $group[ el ] = {"$avg" : "$" + el};
      });

      [ COL.TIMESTAMP.id, COL.SOURCE_ID.id, COL.PROBE_ID.id ].forEach( function( el ){
         $group[ el ] = {"$last" : "$"+ el};
      });

      return {query: [{$match: $match}, {$group : $group}, {$project: {_id: 0}}]};
   };


   var cLine = MMTDrop.chartFactory.createTimeline({
      //columns: [MMTDrop.constants.StatsColumn.APP_PATH]
      getData: {
         getDataFn: function (db) {
            const ylabel = "Jitter (microsecond)";
            var data = db.data();

            //first column is always timestamp
            var obj = splitDataByNic(data, COL.JITTER)
            

            var $widget = $("#" + cLine.elemID).getWidgetParent();
            $widget.find(".filter-bar").height(25);
            var height = $widget.find(".grid-stack-item-content").innerHeight();
            height -= $widget.find(".filter-bar").outerHeight(true) + 30;

            return {
               data   : obj.data,
               columns: obj.columns,
               ylabel : ylabel,
               height : height,
               addZeroPoints:{
                  time_id       : 3,
                  time          : status_db.time,
                  sample_period : 1000 * fPeriod.getDistanceBetweenToSamples(),
                  probeStatus   : status_db.probeStatus,
               },
            };
         },
      },
      chart: {
         data:{
            type: "line"
         },
         axis: {
            x: {
               tick: {
                  format: formatTime
               }
            }
         },
         grid: {
            x: {
               show: false
            }
         },
         tooltip:{
            format: {
               title:  formatTime,
               value: function( value ){
                  return value + "us";
               }
            }
         },
         zoom: {
            enabled: false,
            rescale: false
         },
      },
      afterEachRender: function (_chart) {
         var $widget = $("#" + _chart.elemID).getWidgetParent();
         //resize when changing window size
         $widget.on("widget-resized", null, _chart.chart, function (event, widget) {
            var chart = event.data;
            var height = $widget.find(".grid-stack-item-content").innerHeight();
            height -= $widget.find(".filter-bar").outerHeight(true) + 30;
            chart.resize({
               height: height
            });
         });

      }
   });

   var report = new MMTDrop.Report(
         // title
         "",
         // database
         database,
         // filers
         [],
         //charts
         [
            {
               charts: [cLine],
               width: 12
            },
            ],
            //order of data flux
            [{  object: cLine }]
   );
   return report;
};

function splitDataByNic(data, col){
	const COL = MMTDrop.constants.LatencyColumn;
	const ts_id    = COL.TIMESTAMP.id;
	const nic_id   = COL.SOURCE_ID.id;
	
	const labels = {}
	const obj = {}
	for( var i in data ){
		var msg = data[i];
		var ts  = msg[ts_id];
		var nic = msg[ nic_id ]
		
		//remember set of NICs
		labels[nic] = true;
		
		//init new row
		if( obj[ts] == undefined )
			obj[ts] = {};
		var o = obj[ts];
		o[ ts_id ] = ts;
		o[ nic ]   = msg[col.id]
	}
	
	//first column is always timestamp
	const columns = [ COL.TIMESTAMP ];
	for( var l in labels )
		columns.push({id: l, label: l})
	
	return {
		data  : obj,
		columns: columns
	}
}

ReportFactory.createPacketLossReport = function(fPeriod){
   const COL = MMTDrop.constants.LatencyColumn;
   const database = new MMTDrop.Database({
      collection: "data_latency",
      action: "aggregate",
      //no_override_when_reload: true, 
      raw: true,
   }, function( data ){
      return data;
   }, false);

   database.updateParameter = function( _old_param ){
      const $match = {};
      $match[ COL.PROBE_ID.id ]  = URL_PARAM.probe_id;
      $match[ COL.TIMESTAMP.id ] = {$gte: status_db.time.begin, $lte: status_db.time.end };

      const $group = { _id: {}};
      [ COL.PROBE_ID.id, COL.TIMESTAMP.id ].forEach( function( el ){
         $group["_id"][ el ] = "$" + el;
      });

      [ COL.PKT_LOSS_PCT.id ]
      .forEach( function( el ){
          $group[ el ] = {"$avg" : "$" + el};
      });

      [ COL.TIMESTAMP.id, COL.SOURCE_ID.id, COL.PROBE_ID.id ].forEach( function( el ){
         $group[ el ] = {"$last" : "$"+ el};
      });

      return {query: [{$match: $match}, {$group : $group}, {$project: {_id: 0}}]};
   };


   var cLine = MMTDrop.chartFactory.createTimeline({
      //columns: [MMTDrop.constants.StatsColumn.APP_PATH]
      getData: {
         getDataFn: function (db) {
            const ylabel = "Packet loss (%)";
            var data = db.data();

            var obj = splitDataByNic(data, COL.PKT_LOSS_PCT)

            var $widget = $("#" + cLine.elemID).getWidgetParent();
            $widget.find(".filter-bar").height(25);
            var height = $widget.find(".grid-stack-item-content").innerHeight();
            height -= $widget.find(".filter-bar").outerHeight(true) + 15;


            return {
               data   : obj.data,
               columns: obj.columns,
               ylabel : ylabel,
               height : height,
               addZeroPoints:{
                  time_id       : 3,
                  time          : status_db.time,
                  sample_period : 1000 * fPeriod.getDistanceBetweenToSamples(),
                  probeStatus   : status_db.probeStatus,
               },
            };
         },
      },
      chart: {
         data:{
            type: "line"
         },
         axis: {
            x: {
               tick: {
                  format: formatTime
               }
            }
         },
         grid: {
            x: {
               show: false
            }
         },
         tooltip:{
            format: {
               title:  formatTime,
               value: function( value ){
                  return value + "%";
               }
            }
         },
         zoom: {
            enabled: false,
            rescale: false
         },
      },
      afterEachRender: function (_chart) {
         var $widget = $("#" + _chart.elemID).getWidgetParent();
         //resize when changing window size
         $widget.on("widget-resized", null, _chart.chart, function (event, widget) {
            var chart = event.data;
            var height = $widget.find(".grid-stack-item-content").innerHeight();
            height -= $widget.find(".filter-bar").outerHeight(true) + 15;
            chart.resize({
               height: height
            });
         });

      }
   });

   var report = new MMTDrop.Report(
         // title
         "",
         // database
         database,
         // filers
         [],
         //charts
         [
            {
               charts: [cLine],
               width: 12
            },
            ],
            //order of data flux
            [{  object: cLine }]
   );
   return report;
};

