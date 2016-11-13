TissueStack.Annotation = function(id, plane_id, div, plane) {
  var canvasId = "#" + div + "_" + plane_id + "_annotation";
  var canvas = $(canvasId).sketch((events) => {
    var extent = plane.getDataExtent();
    // Loop through each event.

    var points = [];
    for(var i = 0; i < events.length; i++) {

      var coords = {
        x : events[i][0],
        y : events[i][1],
      };

      var point =
          {x: coords.x - plane.upper_left_x,
           y: coords.y - plane.dim_y + plane.upper_left_y,
           z: extent.slice};

      if (point.x < 0 || point.y < 0 || point.z < 0) {
        continue;
      }
      points.push([Math.round(point.x), Math.round(point.y), Math.round(point.z), 255]);
    }

    var x = points.map((p) => {
      return p[0];
    }).join(',');

    var y = points.map((p) => {
      return p[1];
    }).join(',');

    var z = points.map((p) => {
      return p[2];
    }).join(',');


    var values = points.map((p) => {
      return p[3];
    }).join(',');

    $.ajax({
      url : TissueStack.configuration['server_host'].value + "/" + TissueStack.configuration['server_proxy_path'].value + "/?service=drawing&x=" + x + "&z=" + z + "&y=" + y + "&value=" + values + "&dataset=" + id,
      type : 'GET',
      cache : false,
      timeout : 60000,
      success: (d, status) => {
        console.log(d, status);
      },
      error: (x, status, error) => {
        console.log(status, error)
      },
    });

  });
};
