var arr = [
   {
      id: "sla-reaction",
      title: "Reactions",
      x: 0,
      y: 0,
      width: 12,
      height: 5,
      type: "warning",
      userData: {
         fn: "createReactionForm"
      },
   }
   ];

function getCompID (){
   const id = fProbe.selectedOption().id;
   return id;
}
//create reports

var ReportFactory = {
      createReactionForm: function( fPeriod ){

         //RENDER TABLE
         var renderTable = function ( obj, serverTime ){
            //this is used when use submit the form
            window._mmt = obj;

            const init_components = obj.components,
            reactions       = obj.selectedReaction;

            var table_rows = [{
               type    : "<thead>",
               children: [{
                  type     : "<tr>",
                  children : [{
                     type : "<th>",
                     attr : {
                        style : "text-align:right",
                        text  : "Conditions"
                     }
                  },{
                     type : "<th>",
                     attr : {
                        text : "Actions"
                     }
                  },{
                     type : "<th>",
                     attr : {
                        text : "Priority"
                     }
                  },{
                     type : "<th>",
                     attr : {
                        text : "#Triggers"
                     }
                  },{
                     type : "<th>",
                     attr : {
                        text : "Last Exec",
                        style: "width: 120px"
                     }
                  }]
               }]
            }];

            const _span = function( txt ){
               const react = this;
               if( react.comp_id != undefined )
                  return '<span class="badge" id="'+ txt + "-"+ react.comp_id + '">' + txt + '</span>';
               return '<span class="badge">' + txt + '</span>';
            }

            const _getActionDescription = function( name ){
               var val = MMTDrop.tools.getValue( MMTDrop, ["config", "others", "modules_config", "sla", "actions", name, "description"] );
               if ( val == undefined )
                  return "";
               return '<i class="fa fa-info-circle" data-toggle=tooltip title='+ JSON.stringify(val) +'/>';
            }

            for( var i=0; i<init_components.length; i++){
               var comp = init_components[ i ];
               //show only probe that is indicated in URL by probe_id
               if( URL_PARAM.probe_id != undefined && URL_PARAM.probe_id != comp.id )
                  continue;

               //each row for a metric
               for( var react_id in reactions ){
                  var reaction = reactions[ react_id ];

                  //show only reactions of this component
                  if( reaction.comp_id != comp.id || reaction.enable !== true )
                     continue;

                  //a row for description
                  table_rows.push({
                     type: "<tr>",
                     children: [{
                        type : "<td>",
                        attr : {
                           colspan: 6,
                           text   : reaction.note
                        }
                     }]
                  });

                  //a new row for the detail
                  var row = {
                        type    : "<tr>",
                        attr    : {
                           style: "height: 45px; width: 200px;",
                        },
                        children: []
                  };

                  var conditionList = [];
                  for( var cond in reaction.conditions )
                     conditionList.push('<p>' + _span( "C" + reaction.comp_id ) + _span( cond ) +' ('+ reaction.conditions[cond].map( _span, reaction ).join(' or ') +')</p>' )

                     //condition
                     row.children.push({
                        type  : "<td>",
                        attr  : {
                           align: "right",
                           //style: "border-right: none",
                           html : conditionList.join(" and <br/> ") //+ ' <span class="glyphicon glyphicon-arrow-right"></span>'
                        }
                     });

                  var actionList = [];
                  reaction.actions.forEach( function( val ){
                     actionList.push('<p><span style="font-weight:bold">'+ val +'</span> ' + _getActionDescription( val )) + '</p>';
                  });

                  //reaction
                  row.children.push({
                     type : "<td>",
                     attr : {
                        html : actionList.join(" and <br/>")
                     }
                  });
                  //priority
                  row.children.push({
                     type : "<td>",
                     attr :{
                        html : reaction.priority
                     }
                  });

                  //number of times this reaction was trigged
                  row.children.push({
                     type: "<td>",
                     attr: {
                        align: "right",
                     },
                     children: [{
                        type: "<span>",
                        attr: {
                           "class": "nb-triggered-actions",
                           "data-appid"     : "app-id",
                           "data-reactid"   : react_id,
                           "data-compid"    : reaction.comp_id,
                           "html": '<i class = "fa fa-refresh fa-spin fa-fw"/>'
                        }
                     }]
                  });

                  //add  dummy buttons when the reaction is performing/ignored
                  if( reaction.action == "ignore"
                     //ignored since last minute
                     && serverTime - reaction.action_time < INTERVAL_BETWEEN_2_IGNORES )
                     row.children.push({
                        type : "<td>",
                        attr : {
                           align: "right",
                           html : '<span class="text-danger" >Ignored</span>'
                        }
                     });
                  //reaction is performing
                  else if( reaction.action == "perform" ){
                     row.children.push({
                        type : "<td>",
                        attr : {
                           class: "reactions",
                           id   : "reaction-" + react_id,
                           "data-reaction"    : JSON.stringify( reaction ),
                           "data-reaction-id" : react_id,
                           html :
                              'Executing <i class="fa fa-spinner fa-pulse fa-fw"></i>'+
                              '<a class="btn btn-success pull-right" onclick="_finishReaction(\''+ react_id +'\', this)">Done</a>'
                        }
                     });
                  }else
                     row.children.push({
                        type : "<td>",
                        attr : {
                           align: "center",
                           class: "reactions",
                           id   : "reaction-" + react_id,
                           "data-reaction"    : JSON.stringify( reaction ),
                           "data-reaction-id" : react_id,
                           //html: (reaction.action == "finish"? "executed ..." : "checking ...")
                           "html": '<i class = "fa fa-refresh fa-spin fa-fw"/>'
                        },
                     });

                  table_rows.push( row );
               }
            }

            var form_config = {
                  type  : "<div>",
                  attr  : {
                     style  : "position: absolute; top: 10px; bottom: 10px; left: 10px; right: 10px"
                  },
                  children : [{
                     type     : "<div>",
                     attr     :{
                        style : "position: absolute; top: 35px; left: 0px; right: 0px; bottom: 0px; overflow: auto",
                        id    : "div-reactions"
                     },
                     children : [{
                        type     : "<table>",
                        attr     : {
                           class : "table table-striped table-bordered table-condensed dataTable no-footer",
                           id    : "tblData",
                        },
                        children : table_rows
                     }]
                  },{
                     type: "<div>",
                     attr: {
                        style: "position: absolute; top: 0px; right: 0px;"
                     },
                     children : [
                        {
                           type: "<a>",
                           attr: {
                              class   : "btn btn-primary pull-right",
                              text    : "Manage Reactions",
                              href    : '/chart/enforcement/manager' + MMTDrop.tools.getQueryString(["app_id","probe_id"])
                           }
                        }]
                  }]
            };

            $("#sla-reaction-content" ).append( MMTDrop.tools.createDOM( form_config ) ) ;


            //for each element of either alert or violation of a metric
            //update value to DOM element
            setTimeout( function(){
            $(".nb-triggered-actions").each(function (i, el) {
               const dataset = el.dataset;
               const comp_id = dataset.compid,
                     ract_id = dataset.reactid;

               const db = new MMTDrop.Database({ collection: "metrics_reactions", action: "aggregate", raw: true });
               const query = [
                  { $match: {"4": comp_id, "5": ract_id} },
                  { $group: {
                     _id    : {"comp_id": "$4" },
                     val    : {$sum: 1},
                     last_ts: {$last: "$3"}
                  }}
               ]

               db.reload({ query: query, period: status_db.time },
               //$(el).html( '<i class = "fa fa-refresh fa-spin fa-fw"/>' );
                  function (data) {
                     console.log("got", data);
                     const val = data.length? data[0].val : 0;
                     setTimeout(function (e) {
                        $(e).html('<span class="badge">' + val + '</span>');
                        //ensure this element is showing
                        //$("#div-alerts").scrollToChild( e, 100, 40 );
                     }, i * 100, el);
                     
                     var last_ts = "";
                     if(data.length)
                        last_ts =  MMTDrop.tools.formatDateTime(data[0].last_ts);
                     $("#reaction-" + ract_id).html( last_ts );
               });
            });
            }, 2000);

            window._btnClick = function ( type, react_id, cb ){
               cb = cb || function(){};
               MMTDrop.tools.ajax("/musa/sla/reaction/"+ type +"/" + react_id, {}, "POST", {
                  error  : function(){

                  },
                  success: cb
               });
            }

            //ignore a reaction
            window._ignoreReaction = function( react_id ){
               _btnClick( "ignore", react_id, function(){
                  $("#reaction-" + react_id)
                     .html( '<span class="text-danger">Ignored</span>' )
                     .attr( "align", "right" );
               });
            };

          //perform a reaction
            window._performReaction = function( react_id ){
               var hasError = false
               MMTDrop.tools.localStorage.set( react_id + "-time", (new Date()).getTime(), false );
               const actions = _getActions( react_id );
               var needToShowExecutingButton = true;

               actions.forEach( function( act_name ){
                  const action = MMTDrop.tools.getValue( MMTDrop, ["config", "others", "modules_config", "sla", "actions", act_name ] );
                  if( action.url ){
                     //MMTDrop.tools.openURLInNewFrame( action.url, action.description );
                     var ret = MMTDrop.tools.openURLInNewTab( action.url, action.description );
                     if( ret == undefined )
                        hasError = true;
                  }

                  //for 2factors authentification
                  if( act_name === "apply_two_factors_authentication" ){
                     //login
                     var data = {"name":"admin", "password":"12345", "tenant":"SYS"};
                     MMTDrop.tools.proxy("http://demo.37.48.247.117.xip.io/api/security/authentication/login&data=" + JSON.stringify(data), {
                        //data
                     }, "POST", {
                        error: function( err ){
                           MMTDrop.alert.error( "<b>" + err.statusText + "</b>:<br/>" + err.responseText );
                           //{"readyState":4,"responseText":"connect ECONNREFUSED 37.48.247.117:80","status":500,"statusText":"Internal Server Error"}
                        },
                        success: function( session ){
                           //switch to 2factors
                           MMTDrop.tools.proxy("http://demo.37.48.247.117.xip.io/api/security/v1/userManagement/identity/LH/dummy1/switchTwoFactor?enabled=true", {
                              //data
                           }, "PUT", {
                              error: function( err ){
                                 MMTDrop.alert.error( "<b>" + err.statusText + "</b>:<br/>" + err.responseText );
                                 //{"readyState":4,"responseText":"connect ECONNREFUSED 37.48.247.117:80","status":500,"statusText":"Internal Server Error"}
                              },
                              success: function( session ){
                                 MMTDrop.alert.success("Switched successfully to 2factors authentication", 5000 );
                                 //save to DB
                                 _btnClick( "perform", react_id, function(){
                                    _finishReaction( react_id  );
                                 });

                                 setTimeout( MMTDrop.tools.reloadPage, 6000 );
                              }
                           }, {
                             "Content-Type": "application/json"
                           });
                        }
                     });

                     needToShowExecutingButton = false;
                  }//end 2factors
               });

               if( hasError )
                  return;

               if( needToShowExecutingButton )
                  _btnClick( "perform", react_id, function(){
                     $("#reaction-" + react_id )
                        .html('<span class="text-success">Executing</span> <i class="fa fa-spinner fa-pulse fa-fw"></i><a class="btn btn-success pull-right" onclick="_finishReaction(\''+ react_id +'\', this)">Done</a>')
                        .attr("align", "left");
                  });
            }
         }//end rederTable function

         //LOAD METRIX FROM DATABASE
         MMTDrop.tools.ajax("/api/metrics/find?raw", [{$match: {app_id : getAppID()}}], "POST", {
            error  : function(){},
            success: function( data ){
               var obj = data.data[0];
               //does not exist ?
               if( obj == undefined )
                  MMTDrop.tools.gotoURL("/chart/sla/upload", {param:["app_id"], add:"probe_id=null"});
               else{
                  //IMPORTANT: this global variable is used by #_getMetricIDFromName
                  window.__sla = obj;
                  renderTable( obj, data.now );
               }
            }
         } );
         //end LOADING METRIX
      }
}

function _createButtons( react_id ){
   return {
      type : "<div>",
      children: [{
         type : "<input>",
         attr : {
            type  : "button",
            id    : "btn-reaction-perform-" + react_id,
            class : "btn btn-danger btn-reaction-perform btn-reaction-" + react_id,
            title : "Perform the actions",
            value : "Execute",
            onclick: "_performReaction('" + react_id + "')",
         }
      },{
         type : "<input>",
         attr : {
            type  : "button",
            id    : "btn-reaction-ignore-" + react_id,
            style : "margin-left: 20px",
            class : "btn btn-default btn-reaction-ignore btn-reaction-" + react_id,
            value : "Ignore",
            onclick: "_ignoreReaction('"+ react_id +"')",
         }
      }]
   }
}

/**
 * Get metric id from its name.
 * This function uses a global variable defined in createReactionForm when using ajax to get data from server
 * @param name
 * @returns
 */
function _getMetricIDFromName( name, comp_id ){
   if( window.__sla == undefined ){
      console.error( "This must not happen" );
      return 0;
   }

   //find in general metric
   for( var i=0; i<window.__sla.metrics.length; i++ ){
      var m = window.__sla.metrics[ i ];
      if( m.name == name )
         return m.id;
   }
   //find in metric list of component
   for( var i=0; i<window.__sla.components.length; i++ ){
      var comp = window.__sla.components[ i ];
      if( comp.id == comp_id ){
         var metrics = comp.metrics;
         //for each metric in the list of matrics of this component
         for( var j=0; j<metrics.length; j++ )
            if( metrics[j].name == name )
               return metrics[j].id;
      }
   }
   console.error( "This must not happen" );
   return 0;
}

//get an array of actions of a reaction
function _getActions( reaction_id ){
   if( window.__sla == undefined ){
      console.error( "This must not happen" );
      return [];
   }
   const actions = window.__sla.selectedReaction[ reaction_id ].actions;
   if( !Array.isArray( actions ) )
      return [];
   return actions;
}

//reaction: {"comp_id": "30",
//              "conditions": { "availability": [  "violation" ], "incident": [  "alert" ]},
//              "actions": [ "filtre_port", "restart_apache"],"priority": "MEDIUM","note": "note","enable": true}
//data    : [{"alert":0,"violation":63,"app_id":"__app","comp_id":1,"me_id":"1"},
//             {"alert":0,"violation":63,"app_id":"__app","comp_id":30,"me_id":"1"}
//            ]
function _verifyCondition( reaction, data ){
   const conditions = reaction.conditions;
   const comp_id    = reaction.comp_id;
   const arr = [];

   for( var metric_name in conditions ){
      const metric_id = _getMetricIDFromName( metric_name, comp_id );
      var valid  = false;
      var cond = conditions[ metric_name ]; //cond is an array

      if( cond.length == 0 )
         continue;

      for( var i=0; i<data.length; i++ ){
         var o = data[i];
         if( o.comp_id == comp_id       //same component
               && o.me_id == metric_id  //same metric
               && (
                     //one cond
                     ( cond.length == 1 && o[ cond[0] ] > 0 )
                     ||
                     //having either "alert" or "violation"
                     ( cond.length == 2 && ( o[ cond[0] ] > 0 || o[ cond[1] ] > 0) )
                  )
         ){
            if( cond.length == 1  ){
               arr.push( {"one" : o[ cond[0] ] } );
            }else
               arr.push( o );

            //found one msg that satisfies the condition
            valid = true;
            break;
         }
      }

      //donot find any element in data that satisfies this condition
      if( !valid )
         return false;
   }

   const str = JSON.stringify( arr );
   //old value:
   const oldStr = MMTDrop.tools.localStorage.get( reaction.id, false );
   //no new alerts/violations being noticed
   if( oldStr == str )
      return false;

   //save to temps
   if( reaction.action == "perform")
      MMTDrop.tools.localStorage.set( reaction.id, str, false );
   else
      MMTDrop.tools.localStorage.set( "tmp_"+ reaction.id, str, false );


   return true;
}

//verify the metric_alerts data againts the reactions
function _updateReactions( data ){
   //for each reaction
   $(".reactions").each( function( index, el ){
      const reactID  = $(el).attr("data-reaction-id");
      const reaction = JSON.parse( $(el).attr("data-reaction") );
      reaction.id = reactID;
      const isValid  = _verifyCondition( reaction, data );

      //show "Perform" and "Ignore" buttons
      //$(el).html( MMTDrop.tools.createDOM( _createButtons( reactID ) ) );
      //ani
      /*
         $(el)
            .delay( 1000 * index )
            .html( MMTDrop.tools.createDOM( _createButtons( reactID ) ));
       */
      if( reaction.action != "perform" )
         setTimeout( function( e, text ){
            $(e).html( text );
            $("#div-reactions").scrollToChild( e, 0, 40 );
         }, 1000*index, el,
            (isValid) ? MMTDrop.tools.createDOM( _createButtons( reactID ) ) : "" );
      else{
         const now_ts  = (new Date()).getTime();
         const exec_ts = parseInt( MMTDrop.tools.localStorage.get( reactID + "-time", false ));
         //not found any more violation since 60 seconds
         // is performing => done
         if( !isValid && now_ts - exec_ts >= 60*1000  ){
            _btnClick( "finish", reactID, function(){
               el.innerHTML = 'Executed';
            });
         }
      }
   });
}

function _finishReaction( react_id, el ){
   //move temps to a real
   const oldStr = MMTDrop.tools.localStorage.get( "tmp_" + react_id, false );
   MMTDrop.tools.localStorage.set( react_id, oldStr, false );

   _btnClick( "finish", react_id, function(){
      if( el )
         el.parentNode.innerHTML = 'Executed';
   });
}
