TissueStack.Canvas = function(data_extent, canvas_id) {
	
	this.setDataExtent(data_extent);
	this.setCanvasElement(canvas_id);
	// set dimensions
	var tmpCanvasElement = this.getCanvasElement();
	this.setDimensions(tmpCanvasElement.width(), tmpCanvasElement.height());
	this.centerUpperLeftCorner();
	this.drawCoordinateCross(this.getCenter());
	this.registerMouseEvents();
	this.queue = new TissueStack.Queue(this);
};

TissueStack.Canvas.prototype = {
	data_extent: null,
	canvas_id: "canvas_" + this.plane, 
	image_format: 'png',
	mouse_down : false,
	isDragging : false,
	dim_x : 0,
	dim_y : 0,
	mouse_x : 0,
	mouse_y : 0,
	upper_left_x : 0,
	upper_left_y : 0,
	cross_x : 0,
	cross_y : 0,
	queue : null,
	sync_canvases : true,
	color_map : "grey",
	setDataExtent : function (data_extent) {
		if (typeof(data_extent) != "object") {
			throw new Error("we miss a data_extent");
		}
		this.data_extent = data_extent;
	},
	setCanvasElement : function(canvas_id) {
		if (canvas_id && (typeof(canvas_id) != "string" || canvas_id.length == 0)) {
			throw new Error("canvas_id has to be a non-empty string");
		}
		this.canvas_id = canvas_id;
		if (!$("#" + this.canvas_id)) {
			throw new Error("Canvas element with id " + this.canvas_id + " does not exist!");
		}
	},
	getCanvasElement : function() {
		return $("#" + this.canvas_id);
	},
	getCanvasContext : function() {
		return this.getCanvasElement()[0].getContext("2d");
	},
	getDataExtent : function() {
		return this.data_extent;
	},
	changeToZoomLevel : function(zoom_level) {
		if (typeof(zoom_level) != 'number') {
			return;
		}
		zoom_level = Math.floor(zoom_level);
		if (zoom_level < 0 || zoom_level >= this.getDataExtent().zoom_levels.length || zoom_level ==  this.getDataExtent().zoom_level) {
			return;
		}

		var centerAfterZoom = this.getNewUpperLeftCornerForPointZoom({x: this.cross_x, y: this.cross_y}, zoom_level);

		this.getDataExtent().changeToZoomLevel(zoom_level);

		this.setUpperLeftCorner(centerAfterZoom.x, centerAfterZoom.y);
		
		// update displayed info
		$('#canvas_' + this.getDataExtent().plane + '_extent').html("Data Extent: " + this.getDataExtent().x + " x " + this.getDataExtent().y + " [Zoom Level: " + this.getDataExtent().zoom_level + "] ");
	},
	getDataCoordinates : function(relative_mouse_coords) {
		var relDataX = -1;
		var relDataY = -1;
		if (this.upper_left_x < 0 && relative_mouse_coords.x <= (this.upper_left_x + this.getDataExtent().x)) {
			relDataX = Math.abs(this.upper_left_x) + relative_mouse_coords.x;
		} else if (this.upper_left_x >= 0 && relative_mouse_coords.x >= this.upper_left_x && relative_mouse_coords.x <= this.upper_left_x + this.getDataExtent().x) {
			relDataX = relative_mouse_coords.x - this.upper_left_x;
		}
		if (this.upper_left_y > 0 && this.upper_left_y - this.getDataExtent().y < this.dim_y && this.dim_y - relative_mouse_coords.y <= this.upper_left_y && this.dim_y - relative_mouse_coords.y >= this.upper_left_y - this.getDataExtent().y) {
			relDataY = this.upper_left_y - (this.dim_y - relative_mouse_coords.y);
		}
		
		return {x: relDataX, y: relDataY};
	},
	setDimensions : function(x,y) {
		if (typeof(x) == "string") {
			x = parseInt(x);
		}
		if (typeof(x) != "number" || Math.floor(x) < 0) {
			throw new Error("x has to be a non-negative integer");
		}
		this.dim_x = x;
		if (typeof(y) == "string") {
			y = parseInt(y);
		}
		if (typeof(y) != "number" || Math.floor(y) < 0) {
			throw new Error("y has to be a non-negative integer");
		}
		this.dim_y = y;
	},
	getCenter : function () {
		return TissueStack.Utils.getCenter(this.dim_x,this.dim_y);
	},
	getCoordinateCrossCanvas : function() {
		return $("#" + this.canvas_id + "_cross_overlay");
	},
	getRelativeCrossCoordinates : function() {
		var relCrossX = (this.cross_x > (this.upper_left_x + (this.getDataExtent().x - 1))) ? -(this.cross_x - (this.upper_left_x + (this.getDataExtent().x - 1))) : (this.getDataExtent().x -1) +  (this.upper_left_x - this.cross_x);
		var relCrossY = ((this.dim_y - this.cross_y) > this.upper_left_y) ? (this.upper_left_y - (this.dim_y - this.cross_y)) : ((this.getDataExtent().y - 1) + (this.upper_left_y - (this.getDataExtent().y - 1) - (this.dim_y - this.cross_y)));
		if (this.upper_left_x < 0 && this.cross_x <= (this.upper_left_x + (this.getDataExtent().x - 1))) {
			relCrossX = Math.abs(this.upper_left_x) + this.cross_x;
		} else if (this.upper_left_x >= 0 && this.cross_x >= this.upper_left_x && this.cross_x <= this.upper_left_x + (this.getDataExtent().x -1)) {
			relCrossX = this.cross_x - this.upper_left_x;
		}
		if (this.upper_left_y > 0 && this.upper_left_y - (this.getDataExtent().y-1) < this.dim_y && this.dim_y - this.cross_y <= this.upper_left_y && this.dim_y - this.cross_y >= this.upper_left_y - (this.getDataExtent().y -1)) {
			relCrossY = this.upper_left_y - (this.dim_y - this.cross_y);
		}
		
		return {x: relCrossX, y: relCrossY};
	},registerMouseEvents : function () {
		new TissueStack.Events(this);
	},drawCoordinateCross : function(coords) {
		var coordinateCrossCanvas = this.getCoordinateCrossCanvas();
		if (!coordinateCrossCanvas || !coordinateCrossCanvas[0]) {
			return;
		}
		
		// store cross coords
		this.cross_x = coords.x;
		this.cross_y = coords.y;
		
		var ctx = coordinateCrossCanvas[0].getContext("2d");
		// clear overlay
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0,0, this.dim_x, this.dim_y);
		ctx.restore();
		
		// draw bulls eye
		ctx.beginPath();
		ctx.strokeStyle="rgba(200,0,0,0.3)";
		ctx.lineWidth=1.0;

		ctx.moveTo(coords.x + 0.5, 0);
		ctx.lineTo(coords.x + 0.5, (coords.y - 10));
		ctx.moveTo(coords.x + 0.5, (coords.y + 10));
		ctx.lineTo(coords.x + 0.5, this.dim_y);
		ctx.stroke();

		ctx.moveTo(0, coords.y + 0.5);
		ctx.lineTo(coords.x - 10, coords.y + 0.5);
		ctx.moveTo(coords.x + 10, coords.y + 0.5);
		ctx.lineTo(this.dim_x, coords.y + 0.5);
		ctx.stroke();
		ctx.closePath();
	},
	setUpperLeftCorner : function(x,y) {
		this.upper_left_x = x;
		this.upper_left_y = y;
	},
	moveUpperLeftCorner : function(deltaX,deltaY) {
		this.upper_left_x += deltaX;
		this.upper_left_y += deltaY;
	},
	centerUpperLeftCorner : function() {
		var center = this.getCenteredUpperLeftCorner();
		this.setUpperLeftCorner(Math.floor(center.x), Math.floor(center.y));
	},
	getCenteredUpperLeftCorner : function() {
		return {x: (this.dim_x - this.getDataExtent().x) / 2,
				y: this.dim_y - ((this.dim_y - this.getDataExtent().y) / 2)
		};
	}, 
	getNewUpperLeftCornerForPointZoom : function(coords, zoom_level) {
		var newZoomLevelDims = this.getDataExtent().getZoomLevelDimensions(zoom_level);
		
		var deltaXBetweenCrossAndUpperLeftCorner = (this.upper_left_x < 0) ? (coords.x - this.upper_left_x) : Math.abs(coords.x - this.upper_left_x); 
		var deltaYBetweenCrossAndUpperLeftCorner = (this.upper_left_y < 0) ? ((this.dim_y - coords.y) - this.upper_left_y) : Math.abs((this.dim_y - coords.y) - this.upper_left_y);
		
		var zoomLevelCorrectionX = deltaXBetweenCrossAndUpperLeftCorner * (newZoomLevelDims.x / this.data_extent.x);
		var zoomLevelCorrectionY = deltaYBetweenCrossAndUpperLeftCorner * (newZoomLevelDims.y / this.data_extent.y);
		
		var newX = Math.floor((this.upper_left_x <= coords.x) ? (coords.x - zoomLevelCorrectionX) : (coords.x + zoomLevelCorrectionX));
		var newY = Math.floor((this.upper_left_y <= (this.dim_y - coords.y)) ? ((this.dim_y - coords.y) - zoomLevelCorrectionY) : ((this.dim_y - coords.y) + zoomLevelCorrectionY));

		return {x: newX, y: newY};
	},
	redrawWithCenterAndCrossAtGivenPixelCoordinates: function(coords) {
		// this stops any still running draw requests 
		var now = new Date().getTime(); 
		this.queue.latestDrawRequestTimestamp = now;

		this.eraseCanvasContent();
		
		// make sure crosshair is centered:
		this.drawCoordinateCross(this.getCenter());
		
		this.setUpperLeftCorner(
				Math.floor(this.dim_x / 2) - coords.x,
				Math.floor(this.dim_y / 2) + coords.y);
		this.queue.drawLowResolutionPreview(now);
		this.queue.drawRequestAfterLowResolutionPreview(null,now);

		// look for the cross overlay which will be the top layer
		var canvas = this.getCoordinateCrossCanvas();
		if (!canvas || !canvas[0]) {
			canvas = this.getCanvasElement();
		}
		
		// send message out to others that they need to redraw as well
		canvas.trigger("sync", [now,
								'POINT',
		                        this.getDataExtent().plane,
		                        this.getDataExtent().zoom_level,
		                        this.getDataExtent().slice,
		                        this.getRelativeCrossCoordinates(),
		                        {max_x: this.getDataExtent().x, max_y: this.getDataExtent().y},
								{x: this.upper_left_x, y: this.upper_left_y},
								{x: this.cross_x, y: this.cross_y},
								{x: this.dim_x, y: this.dim_y}
		                       ]);
	},
	eraseCanvasContent: function() {
    	var ctx = this.getCanvasContext();
    	
    	var myImageData = ctx.getImageData(0, 0, this.dim_x, this.dim_y);
    	for ( var x = 0; x < this.dim_x * this.dim_y * 4; x += 4) {
    		myImageData.data[x] = myImageData.data[x + 1] = myImageData.data[x + 2] = 255;
    		myImageData.data[x + 3] = 0;
    	}
    	ctx.putImageData(myImageData, 0, 0);
	},
	eraseCanvasPortion: function(x, y, w, h) {
		if (x<0 || y<0 || x>this.dim_x || y>this.dim_y || w <=0 || h<=0 || w>this.dim_x || h>this.dim_y) {
			return;
		}
		
    	var ctx = this.getCanvasContext();
    	
    	var myImageData = ctx.getImageData(x, y, w, h);
    	for ( var i = 0; i < w * h * 4; i += 4) {
    		myImageData.data[i] = myImageData.data[i + 1] = myImageData.data[i + 2] = 255;
    		myImageData.data[i + 3] = 0;
    	}
    	ctx.putImageData(myImageData, x, y);
	}, applyColorMapToCanvasContent: function() {
		if (!this.color_map || this.color_map == "grey") {
			return;
		}
		
    	var ctx = this.getCanvasContext();
    	var myImageData = ctx.getImageData(0, 0, this.dim_x, this.dim_y);

    	for ( var x = 0; x < this.dim_x * this.dim_y * 4; x += 4) {
    		var val = myImageData.data[x];
    		
			// set new red value
			myImageData.data[x] = TissueStack.indexed_color_maps[this.color_map][val][0];
			// set new green value
			myImageData.data[x + 1] = TissueStack.indexed_color_maps[this.color_map][val][1];			
			// set new blue value
			myImageData.data[x + 2] = TissueStack.indexed_color_maps[this.color_map][val][2];
    	}
    	
    	// put altered data back into canvas
    	ctx.putImageData(myImageData, 0, 0);  	
	}, drawMe : function(timestamp) {
		// preliminary check if we are within the slice range
		var slice = this.getDataExtent().slice;
		if (slice < 0 || slice > this.getDataExtent().max_slices) {
			return;
		}
		
		var ctx = this.getCanvasContext();

		// nothing to do if we are totally outside
		if (this.upper_left_x < 0 && (this.upper_left_x + this.getDataExtent().x) <=0
				|| this.upper_left_x > 0 && this.upper_left_x > this.dim_x
				|| this.upper_left_y <=0 || (this.upper_left_y - this.getDataExtent().y) >= this.dim_y) {
			return;
		} 

		var counter = 0;
		var startTileX = this.upper_left_x / this.getDataExtent().tile_size;
		var canvasX = 0;
		var deltaStartTileXAndUpperLeftCornerX = 0;
		if (startTileX < 0) {
			startTileX = Math.abs(Math.ceil(startTileX));
			deltaStartTileXAndUpperLeftCornerX =  this.getDataExtent().tile_size - Math.abs(this.upper_left_x + startTileX * this.getDataExtent().tile_size);
		} else {
			//startTileX = Math.floor(startTileX);
			startTileX = 0;
			canvasX = this.upper_left_x;
		}
		
		var startTileY = 0;
		var canvasY = 0;
		var deltaStartTileYAndUpperLeftCornerY = 0;
		if (this.upper_left_y <= this.dim_y) {
			//startTileY = Math.floor((this.dim_y - this.upper_left_y)  / this.getDataExtent().tile_size);
			canvasY = this.dim_y - this.upper_left_y;
		} else {
			startTileY = Math.floor((this.upper_left_y - this.dim_y)  / this.getDataExtent().tile_size);
			deltaStartTileYAndUpperLeftCornerY = this.getDataExtent().tile_size - (this.upper_left_y - startTileY * this.getDataExtent().tile_size - this.dim_y);
		}

		// for now set end at data extent, we cut off in the loop later once we hit the canvas bounds or data bounds which ever occurs first
		var endTileX = Math.floor(this.getDataExtent().x / this.getDataExtent().tile_size) + ((this.getDataExtent().x % this.getDataExtent().tile_size == 0) ? 0 : 1);
		var endTileY = Math.floor(this.getDataExtent().y / this.getDataExtent().tile_size) + ((this.getDataExtent().y % this.getDataExtent().tile_size == 0) ? 0 : 1);

		var copyOfCanvasY = canvasY;

		// loop over rows
		for (var tileX = startTileX  ; tileX < endTileX ; tileX++) {
			// prelim check
			if (this.data_extent.slice < 0 || this.data_extent.slice >= this.data_extent.x) {
				//break;
			}
			
			var tileOffsetX = startTileX * this.getDataExtent().tile_size;
			var imageOffsetX = 0;
			var width =  this.getDataExtent().tile_size;
			var rowIndex = tileX; 
			
			// reset to initial canvasX
			canvasY = copyOfCanvasY;
			
			// we are at the beginning, do we have a partial?
			if (canvasX == 0 && deltaStartTileXAndUpperLeftCornerX !=0) {
				width = deltaStartTileXAndUpperLeftCornerX;
				imageOffsetX =  this.getDataExtent().tile_size - width;
			}
			
			// we exceed canvas
			if (canvasX == this.dim_x) {
				tileX = endTileX; // this will make us stop in the next iteration 
				width =  this.dim_x - tileOffsetX;
			} else if (canvasX > this.dim_x) {
				break;
			}

			// walk through columns
			for (var tileY = startTileY ; tileY < endTileY ; tileY++) {
				var imageOffsetY = 0;
				var height =  this.getDataExtent().tile_size;
				var colIndex = tileY; 

				// we are at the beginning, do we have a partial?
				if (canvasY == 0 && deltaStartTileYAndUpperLeftCornerY !=0) {
					height = deltaStartTileYAndUpperLeftCornerY;
					imageOffsetY =  this.getDataExtent().tile_size - height;
				}

				if (canvasY  == this.dim_y) {
					tileY = endTileY; // this will make us stop in the next iteration 
					height = this.dim_y - canvasY;
				} else if (canvasY > this.dim_y) {
					break;
				}

				// create the image object that loads the tile we need
				var imageTile = new Image();
				imageTile.src = 
					TissueStack.tile_directory + this.getDataExtent().data_id + "/" + this.getDataExtent().zoom_level + "/" + this.getDataExtent().plane
					+ "/" + slice + "/" + rowIndex + '_' + colIndex + "." + this.image_format;
				counter++;
				
				(function(_this, imageOffsetX, imageOffsetY, canvasX, canvasY, width, height, deltaStartTileXAndUpperLeftCornerX, deltaStartTileYAndUpperLeftCornerY, tile_size) {
					imageTile.onload = function() {
						// check with actual image dimensions ...
						if (canvasX == 0 && width != tile_size && deltaStartTileXAndUpperLeftCornerX !=0) {
							imageOffsetX = (tile_size - deltaStartTileXAndUpperLeftCornerX);
							width = this.width - imageOffsetX;
						} else if (this.width < width) {
								width = this.width;
						}

						if (canvasY == 0 && height != tile_size && deltaStartTileYAndUpperLeftCornerY !=0) {
							imageOffsetY = (tile_size - deltaStartTileYAndUpperLeftCornerY);
							height = this.height - imageOffsetY;
						} else	if (this.height < height) {
								height = this.height;
						}

						// damn you async loads
						if (timestamp && timestamp < _this.queue.latestDrawRequestTimestamp) {
							return;
						}
						
						ctx.drawImage(this,
								imageOffsetX, imageOffsetY, width, height, // tile dimensions
								canvasX, canvasY, width, height); // canvas dimensions
						
						counter--;
						
						// TODO: make configurable with array/closure
						// apply to preview as well
						// display byte value on mouse over 
						// tree view on the left: which one is active
						// histogram and brightness\
						// add favicon
						// add apache rewrite for mobile
						if (counter == 0) {
							_this.applyColorMapToCanvasContent();
						}						
					};
				})(this, imageOffsetX, imageOffsetY, canvasX, canvasY, width, height, deltaStartTileXAndUpperLeftCornerX, deltaStartTileYAndUpperLeftCornerY, this.getDataExtent().tile_size);
				
				// increment canvasY
				canvasY += height;
			}
			
			// increment canvasX
			canvasX += width;
		};
	}
};
