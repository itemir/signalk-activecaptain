/*
 * Copyright 2022 Ilker Temir <ilker@ilkertemir.com>
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const request = require('request');
const poiKey = 'pointsOfInterest.activeCaptain';
userAgent = 'Signal K ActiveCaptain Plugin';
const checkEveryNMinutes = 15;

module.exports = function(app) {
  var plugin = {};
  var pois = {};

  plugin.id = "activecaptain";
  plugin.name = "ActiveCaptain";
  plugin.description = "Publishes ActiveCaptain Points of Interest";

  plugin.start = function(options) {
    // Position data is not immediately available, delay it
    setTimeout( function() {
      checkAndPublishPois();
    }, 5000);

    setInterval( function() {
      checkAndPublishPois();
    }, checkEveryNMinutes * 60 * 1000);
  }

  plugin.stop =  function() {
  };

  plugin.schema = {
    type: 'object',
    required: [],
    properties: {
    }
  }

  function checkAndPublishPois() {
    let position = app.getSelfPath('navigation.position');
    if (!position) {
      app.debug(JSON.stringify(position));
      return;
    }
    let lat = position.value.latitude;
    let lng = position.value.longitude;
    retrievePois(lat,lng);
  }

  function emitSignalKMessage(poi) {
    let values = [
      {
         path: `${poiKey}.${poi.id}.name`,
         value: poi.name
      },
      {
         path: `${poiKey}.${poi.id}.position`,
         value: poi.position
       },
       {
         path: `${poiKey}.${poi.id}.type`,
         value: poi.type
       },
       {
         path: `${poiKey}.${poi.id}.notes`,
         value: poi.notes
       },
       {
         path: `${poiKey}.${poi.id}.url`,
         value: poi.url
       },
     ]
     app.handleMessage(plugin.id, {
       updates: [
         {
           values: values
         }
       ]
     });
   }

   function retrievePoiDetails(poi) {
    if (poi.id in pois) {
      app.debug(`POI details for ID ${poi.id} already known, used cached values`);
      emitSignalKMessage(pois[poi.id]);
      return;
    }
    app.debug(`Retrieving POI details for ID ${poi.id} and will cache`);
    let url=`https://activecaptain.garmin.com/community/api/v1/points-of-interest/${poi.id}/summary`;
    request.get({
      url: url,
      json: true,
      headers: {
        'User-Agent': userAgent,
      }
    }, function(error, response, data) {
      if (!error && response.statusCode == 200) {
        if (!data.pointOfInterest) {
          app.debug(`Cannot decode response for POI ${poi.id}: ${JSON.stringify(data)}`);
          retturn;
        }
        let notes;
        if ((data.pointOfInterest.notes) && (data.pointOfInterest.notes[0])) {
          notes = data.pointOfInterest.notes[0].value;
        } else {
          notes = 'Unknown';
        }
        pois[poi.id] = {
          id: poi.id,
          name: data.pointOfInterest.name,
          position: data.pointOfInterest.mapLocation,
          type: data.pointOfInterest.poiType,
          notes: notes,
          url: `https://activecaptain.garmin.com/en-US/pois/${poi.id}`
        }
        emitSignalKMessage(pois[poi.id]);
        app.debug(`Published details for POI ${poi.id}`);
      } else {
        app.debug(`Error retrieving ${url}: ${JSON.stringify(response)}`);
      }
    });
  }

  function retrievePois(lat, lng) {
    let url=`https://activecaptain.garmin.com/community/api/v1/points-of-interest/bbox`;
    request.post({
      url: url,
      json: true,
      headers: {
        'User-Agent': userAgent,
      },
      json: {
        // This is a super crude way of calculating "distance" but will do for now unless people go to the poles
        'north': lat+0.5,
        'south': lat-0.5,
        'east': lng+0.5,
        'west': lng-0.4,
        'zoomLevel': 17 // Get granular
      }
    }, function(error, response, data) {
      if (!error && response.statusCode == 200) {
        app.debug(`POIs received ${JSON.stringify(data)}`);
        if (!data.pointsOfInterest) {
          return;
        }
        data.pointsOfInterest.map( poiSummary => {
          retrievePoiDetails(poiSummary); 
        });
      } else {
        app.debug(`Error retrieving stations ${JSON.stringify(response)}`);
      }
    });
  }
  return plugin;
}
