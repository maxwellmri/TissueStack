/*
 * This file is part of TissueStack.
 *
 * TissueStack is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * TissueStack is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with TissueStack.  If not, see <http://www.gnu.org/licenses/>.
 */
TissueStack.Canvas = function(data_extent, canvas_id, dataset_id, include_cross_hair) {
	this.sessionId = TissueStack.Utils.generateSessionId();
	// assemble data set id
	this.dataset_id = typeof(dataset_id) != "string" ? "" : dataset_id;
	this.setDataExtent(data_extent);
	this.setCanvasElement(this.dataset_id == "" ? canvas_id : (this.dataset_id + "_" + canvas_id));
	// set dimensions
	var tmpCanvasElement = this.getCanvasElement()[0];
	this.setDimensions(tmpCanvasElement.width, tmpCanvasElement.height);
	this.centerUpperLeftCorner();
	this.drawCoordinateCross(this.getCenter());
	this.setIncludeCrossHair(include_cross_hair);
	this.events = new TissueStack.Events(this, this.include_cross_hair);
	this.queue = new TissueStack.Queue(this);
	this.contrast = null; // a shared instance of a contrast slider
	// make parent and ourselves visible
	this.getCanvasElement().parent().removeClass("hidden");
    this.measurements = TissueStack.desktop ?
        new TissueStack.Measurements(this) : null;
    this.preCanvas = null;
};

TissueStack.Canvas.prototype = {
	id: null, // db plane id
	underlying_canvas: null, // if this is not null we are an overlay
	overlay_canvas: null,	// if this is not null we are under something
	/*
	 *  these overlays are the 'true' overlays
	 *  whereas the 2 properties above are used to display 2 data sets on the same level on top of each other !
	 *  Differences:
	 *    -) contrary to the 2 objects above the overlay does usually not exist independently
	 *    -) Tightly coupled with the above fact, these overlays have to have a matching reference system with their base layers
	 *    -) They can come in 'non base dataset' formats such as svg or be an internal format for canvas drawing instructions
	 */
	overlays: null,
	is_main_view: false,
	data_extent: null,
	dataset_id: "",
	canvas_id: this.dataset_id + "canvas_" + this.plane,
	include_cross_hair: true,
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
	color_map : "grey",
	is_color_map_tiled : null,
	has_been_synced: false,
	value_range_min: 0,
	value_range_max: 255,
	sessionId : 0,
    is_2D : false,
    measurements : null,
    preCanvas : null,
    flag2D : function() {
        this.is_2D = true;
    }, is2D : function() {
        return this.is_2D;
    }, updateScaleBar : function() {
		// update scale bar if main view
		if (this.is_main_view) this.getDataExtent().adjustScaleBar(100);
	}, setIncludeCrossHair : function(include_cross_hair) {
		// include cross hair canvas or not
		if (typeof(include_cross_hair) != 'boolean' || include_cross_hair == true) {
			this.include_cross_hair = true;
		} else {
			this.include_cross_hair = false;
		}
	},
	setDataExtent : function (data_extent) {
		if (typeof(data_extent) != "object") {
			throw new Error("we miss a data_extent");
		}
		this.data_extent = data_extent;
		// store reference back
		this.data_extent.canvas = this;
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
	hideCanvas : function() {
		if (this.getCanvasElement() == null)
			return;
		if (this.getCanvasElement().parent() == null)
			return;

		this.getCanvasElement().parent().hide();
	},
	showCanvas : function() {
		if (this.getCanvasElement() == null)
			return;
		if (this.getCanvasElement().parent() == null)
			return;

		this.getCanvasElement().parent().show();
	},
	getCanvasContext : function() {
		return this.getCanvasElement()[0].getContext("2d");
	},
	getDataExtent : function() {
		return this.data_extent;
	},
	setValueRange : function(min, max) {
		if (typeof(min) != 'number' || typeof(max) != 'number') return;
		if (min > max) return;

		this.value_range_min = min;
		this.value_range_max = max;
	},
	getCanvasPixelValue : function(coords) {
		if (!this.getCanvasElement() || this.getCanvasElement().length == 0 || !coords) return;

		var ctx = this.getCanvasContext();
		if (TissueStack.overlay_datasets && this.underlying_canvas)
			ctx = this.preCanvas.getContext("2d");

		var dataForPixel = ctx.getImageData(coords.x, coords.y, 1, 1);
		if (!dataForPixel || !dataForPixel.data) return;

		// set rgb values and transparency
		return {red: dataForPixel.data[0], green: dataForPixel.data[1], blue: dataForPixel.data[2], t: dataForPixel.data[3], label: null};
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

		if (centerAfterZoom) this.setUpperLeftCorner(centerAfterZoom.x, centerAfterZoom.y);

		// update displayed info
		if (TissueStack.phone || this.is_main_view)
			this.updateExtentInfo(this.getDataExtent().getExtentCoordinates());

		if (this.is_main_view)
			this.events.updateCoordinateDisplay();
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
	resizeCanvas : function(time) {
		var tmpCanvasElement = this.getCanvasElement()[0];
		this.setDimensions(tmpCanvasElement.width, tmpCanvasElement.height);
		this.centerUpperLeftCorner();
		this.drawCoordinateCross(this.getCenter());
		this.drawMe(typeof(time) === 'number' ? time : new Date().getTime());
	},
	getCenter : function () {
		return TissueStack.Utils.getCenter(this.dim_x,this.dim_y);
	},
	getCoordinateCrossCanvas : function() {
		return $("#" + this.canvas_id + "_cross_overlay");
	},
	getRelativeCrossCoordinates : function(ignoreIsotropy) {
        if (typeof(ignoreIsotropy) != 'boolean' || !ignoreIsotropy)
            ignoreIsotropy = false;

        var data_extent_x = this.getDataExtent().x;
        var data_extent_y = this.getDataExtent().y;

        if (this.getDataExtent().one_to_one_x != this.getDataExtent().origX)
            data_extent_x /= (this.getDataExtent().origX / this.getDataExtent().one_to_one_x);
        if (this.getDataExtent().one_to_one_y != this.getDataExtent().origY)
            data_extent_y /= (this.getDataExtent().origY / this.getDataExtent().one_to_one_y);

		var relCrossX = (this.cross_x > this.upper_left_x + data_extent_x) ? -(this.cross_x - (this.upper_left_x + data_extent_x)) : data_extent_x +  (this.upper_left_x - this.cross_x);
		var relCrossY = ((this.dim_y - this.cross_y) > this.upper_left_y) ? (this.upper_left_y - (this.dim_y - this.cross_y)) : (data_extent_y + (this.upper_left_y - data_extent_y - (this.dim_y - this.cross_y)));
		if (this.upper_left_x < 0 && this.cross_x <= (this.upper_left_x + data_extent_x)) {
			relCrossX = Math.abs(this.upper_left_x) + this.cross_x;
		} else if (this.upper_left_x >= 0 && this.cross_x >= this.upper_left_x && this.cross_x <= this.upper_left_x + data_extent_x) {
			relCrossX = this.cross_x - this.upper_left_x;
		}
		if (this.upper_left_y > 0 && this.upper_left_y - data_extent_y < this.dim_y && this.dim_y - this.cross_y <= this.upper_left_y && this.dim_y - this.cross_y >= this.upper_left_y - data_extent_y) {
			relCrossY = this.upper_left_y - (this.dim_y - this.cross_y);
		}

		return {x: relCrossX, y: relCrossY};
	},drawCoordinateCross : function(coords) {
		// store cross coords
		this.cross_x = coords.x;
		this.cross_y = coords.y;

		var coordinateCrossCanvas = this.getCoordinateCrossCanvas();
		if (!coordinateCrossCanvas || !coordinateCrossCanvas[0]) {
			return;
		}

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
		this.upper_left_x = Math.round(x);
		this.upper_left_y = Math.round(y);
	},
	moveUpperLeftCorner : function(deltaX,deltaY) {
		this.upper_left_x +=  Math.round(deltaX);
		this.upper_left_y +=  Math.round(deltaY);
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
	redrawWithCenterAndCrossAtGivenPixelCoordinates: function(coords, sync, timestamp, center) {
		// this stops any still running draw requests
		var now = typeof(timestamp) == 'number' ? timestamp : new Date().getTime();

		if (typeof(center) != 'boolean')
			center = false;

		var crossHairPosition = this.getCenter();
		if (!center && TissueStack.overlay_datasets && this.underlying_canvas)
			crossHairPosition = {x: this.underlying_canvas.cross_x, y: this.underlying_canvas.cross_y};
		else if (!center && TissueStack.overlay_datasets && this.overlay_canvas)
			crossHairPosition = {x: this.overlay_canvas.cross_x, y: this.overlay_canvas.cross_y};

		// make sure crosshair is centered:
		this.drawCoordinateCross(crossHairPosition);

		this.setUpperLeftCorner(
				crossHairPosition.x - coords.x,
				(this.dim_y - crossHairPosition.y) + coords.y
		);

		if (coords.z) {
			this.data_extent.slice = coords.z;
		}

		// look for the cross overlay which will be the top layer
		var canvas = this.getCoordinateCrossCanvas();
		if (!canvas || !canvas[0]) {
			canvas = this.getCanvasElement();
		}

		if (typeof(sync) == 'boolean' && !sync) return;

        var aniso_factor_x = 1;
        var aniso_factor_y = 1;

        if (this.data_extent.one_to_one_x != this.data_extent.origX)
            aniso_factor_x = (this.data_extent.one_to_one_x / this.data_extent.origX);
        if (this.data_extent.one_to_one_y != this.data_extent.origY)
            aniso_factor_y = (this.data_extent.one_to_one_y / this.data_extent.origY);

		// send message out to others that they need to redraw as well
		canvas.trigger("sync", [this.data_extent.data_id,
		                        this.dataset_id,
		                        now,
								'POINT',
		                        this.getDataExtent().plane,
		                        this.getDataExtent().zoom_level,
		                        this.getDataExtent().slice,
		                        coords,
		                        {max_x: this.getDataExtent().x, max_y: this.getDataExtent().y,
                                 aniso_factor_x : aniso_factor_x, aniso_factor_y: aniso_factor_y,
                                 step: this.getDataExtent().step},
								{x: this.upper_left_x, y: this.upper_left_y},
								{x: this.cross_x, y: this.cross_y},
								{x: this.dim_x, y: this.dim_y}
		                       ]);
	},
	eraseCanvasContent: function() {
    	var ctx = this.getCanvasContext();
    	var myImageData = ctx.getImageData(0, 0, this.dim_x, this.dim_y);
    	for ( var x = 0; x < this.dim_x * this.dim_y * 4; x += 4) {
    		myImageData.data[x] = myImageData.data[x + 1] = myImageData.data[x + 2] = 0;
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
    		myImageData.data[i] = myImageData.data[i + 1] = myImageData.data[i + 2] = 0;
   			myImageData.data[i + 3] = 0;
    	}
    	ctx.putImageData(myImageData, x, y);
	}, applyContrastAndColorMapToCanvasContent: function(tempCtx) {
	  	if (this.upper_left_x > this.dim_x || this.upper_left_x + this.data_extent.x < 0 || this.upper_left_y < 0 || this.upper_left_y - this.data_extent.y > this.dim_y) {
    		return;
    	}

    	var ctx = typeof(tempCtx) === 'object' ? tempCtx :  this.getCanvasContext();
    	var xStart = this.upper_left_x < 0 ? 0 : this.upper_left_x;
    	var yStart = this.upper_left_y > this.dim_y ? 0 : this.dim_y - this.upper_left_y;
    	var width = xStart + this.data_extent.x;
    	var height = (this.dim_y - yStart - this.data_extent.y) > 0 ? this.data_extent.y : this.dim_y - yStart;
    	if (width > this.dim_x) {
    		width = this.dim_x - xStart;
    	}

    	// apply color map and contrast
    	var myImageData = this.applyContrastAndColorMapToImageData(
            ctx.getImageData(xStart, yStart, width, height));

    	// put altered data back into canvas
    	if (typeof(tempCtx) === 'object') {
    		// let's copy from the temporary canvas
    		this.getCanvasContext().putImageData(myImageData, xStart, yStart);
    		tempCtx = null;
    	} 	else ctx.putImageData(myImageData, xStart, yStart);
	}, applyContrastAndColorMapToImageData : function(myImageData) {
    	if (!this.getDataExtent().getIsTiled() ||
            !this.hasColorMapOrContrastSetting()) return myImageData;

    	for ( var x = 0; x < myImageData.data.length; x += 4) {
    		var val = myImageData.data[x];

			// apply contrast settings first
			if (this.isContrastUsed()) {
				var channelIndex = 0;
				var channels = 1;
				// for pre-tiled color we need to go through all 3 channels
				if (this.isColorMapOn()
					&& this.is_color_map_tiled != null
					&& this.is_color_map_tiled) {
					channels = 3;
				}
				while (channelIndex < channels) {
					// adjust value to be the right channel
					val = myImageData.data[x+channelIndex];
		    		if (val <= this.contrast.getMinimum()) {
		    			val = this.contrast.dataset_min;
		    		} else if (val >= this.contrast.getMaximum()) {
		    			val = this.contrast.dataset_max;
		    		} else {
		    			val = Math.round(((val - this.contrast.getMinimum()) / (this.contrast.getMaximum() - this.contrast.getMinimum())) *
		    					(this.contrast.dataset_max - this.contrast.dataset_min));
		    		}
		    		if (channels == 1)	myImageData.data[x] = myImageData.data[x+1] = myImageData.data[x+2] = val;
		    		else myImageData.data[x+channelIndex] = val;
		    		channelIndex++;
				}
			}
            if (this.isColorMapOn() && this.is_color_map_tiled != null
                    && !this.is_color_map_tiled) {
                    // set new red value
                    myImageData.data[x] = TissueStack.indexed_color_maps[this.color_map][val][0];
                    // set new green value
                    myImageData.data[x + 1] = TissueStack.indexed_color_maps[this.color_map][val][1];
                    // set new blue value
                    myImageData.data[x + 2] = TissueStack.indexed_color_maps[this.color_map][val][2];
            }
        }

    	return myImageData;
	}, hasColorMapOrContrastSetting : function() {
		if (!this.isColorMapOn() && !this.isContrastUsed()) {
			return false;
		}

		return true;
	}, isColorMapOn : function() {
		if (!this.color_map || this.color_map == "grey") return false;

		return true;
    }, isContrastUsed : function() {
        if (!this.contrast ||
            (this.contrast.getMinimum() == this.contrast.dataset_min &&
             this.contrast.getMaximum() == this.contrast.dataset_max))
                return false;

        return true;
	}, drawMe : function(timestamp) {
		// damn you async loads
		if (this.queue.latestDrawRequestTimestamp < 0 ||
				(timestamp && timestamp < this.queue.latestDrawRequestTimestamp)) {
                    this.syncDataSetCoordinates(this, timestamp, true);
			return;
		}

		// preliminary check if we are within the slice range
		var slice = this.getDataExtent().slice;
		if (slice < 0 || slice > this.getDataExtent().max_slices) {
            this.eraseCanvasContent();
			this.syncDataSetCoordinates(this, timestamp, true);
            this.queue.displayLoadingProgress(true);
			return;
		}

		// nothing to do if we are totally outside
		if (this.upper_left_x + this.getDataExtent().x <=0
				|| this.upper_left_x > this.dim_x
				|| this.upper_left_y <=0
                || (this.upper_left_y - this.getDataExtent().y) >= this.dim_y) {
            this.eraseCanvasContent();
			this.syncDataSetCoordinates(this, timestamp, false);
			this.queue.displayLoadingProgress(true);
			return;
		}

		var dataSet = TissueStack.dataSetStore.getDataSetById(this.data_extent.data_id);
		if (!dataSet) return;

        if (TissueStack.desktop) this.queue.prefetchTiles()

        this.queue.is_partial_render = false;
        this.preCanvas = document.createElement("canvas");
        this.preCanvas.width = this.dim_x;
        this.preCanvas.height = this.dim_y;

        if (TissueStack.overlay_datasets && this.underlying_canvas) {
            this.underlying_canvas.getCanvasElement().hide();
            this.getCanvasContext().globalAlpha = TissueStack.transparency;
            this.preCanvas.getContext('2d').globalAlpha = TissueStack.transparency;
        }

		var startTileX = this.upper_left_x < 0 ?
            Math.floor(-this.upper_left_x / this.getDataExtent().tile_size) : 0;
		var canvasX = this.upper_left_x < 0 ? 0 : this.upper_left_x;
		var deltaStartTileXAndUpperLeftCornerX =
            this.upper_left_x < 0 ?
            this.getDataExtent().tile_size +
                (startTileX * this.getDataExtent().tile_size + this.upper_left_x) : 0;

		var startTileY =
            this.upper_left_y > this.dim_y ?
                Math.floor((this.upper_left_y - this.dim_y) / this.getDataExtent().tile_size) : 0;
		var canvasY = this.upper_left_y > this.dim_y ? 0 : this.dim_y - this.upper_left_y;
		var deltaStartTileYAndUpperLeftCornerY =
            this.upper_left_y > this.dim_y ?
            Math.abs(this.upper_left_y - (startTileY+1) * this.getDataExtent().tile_size - this.dim_y): 0;

        var modX =
            this.upper_left_x + this.getDataExtent().x < this.dim_x ?
                this.getDataExtent().x %
                    this.getDataExtent().tile_size :
                (this.dim_x - this.upper_left_x) %
                    this.getDataExtent().tile_size;
        var endTileX =
            this.upper_left_x + this.getDataExtent().x < this.dim_x ?
                Math.floor(this.getDataExtent().x /
                    this.getDataExtent().tile_size) :
                Math.floor((this.dim_x - this.upper_left_x) /
                    this.getDataExtent().tile_size);
        if (modX === 0) endTileX--;

        var modY =
            this.upper_left_y - this.getDataExtent().y >= 0 ?
                this.getDataExtent().y % this.getDataExtent().tile_size :
                this.upper_left_y % this.getDataExtent().tile_size;
        var endTileY =
            this.upper_left_y - this.getDataExtent().y >= 0 ?
                Math.floor(this.getDataExtent().y / this.getDataExtent().tile_size) :
                Math.floor(this.upper_left_y / this.getDataExtent().tile_size);
        if (modY=== 0) endTileY--;

        var copyOfCanvasY = canvasY;

        var tileRangeX = endTileX-startTileX+1;
        var tileRangeY = endTileY-startTileY+1;
        this.queue.setTotalNumberOfTiles(tileRangeX * tileRangeY);

		// loop over rows
		for (var tileX = startTileX  ; tileX <= endTileX ; tileX++) {
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

			// walk through columns
			for (var tileY = startTileY ; tileY <= endTileY ; tileY++) {
				var imageOffsetY = 0;
				var height =  this.getDataExtent().tile_size;
				var colIndex = tileY;

				// we are at the beginning, do we have a partial?
				if (canvasY == 0 && deltaStartTileYAndUpperLeftCornerY !=0) {
					height = deltaStartTileYAndUpperLeftCornerY;
					imageOffsetY =  this.getDataExtent().tile_size - height;
				}

				// did we check whether we have existing color map tiles?
				var colorMap = this.color_map; // default
				if (this.getDataExtent().getIsTiled()
						&& this.is_color_map_tiled != null
						&& !this.is_color_map_tiled) {
					colorMap = 'grey'; // fall back onto grey
				}

				var req =
					TissueStack.Utils.assembleTissueStackImageRequest(
						dataSet, this, false, colorMap, rowIndex, colIndex);

                if (this.getDataExtent().getIsTiled() &&
                        colorMap != 'grey' &&
                        this.is_color_map_tiled == null &&
                        !this.checkIfWeAreColorMapTiled(req.url))
                            req.url = req.url.replace("_" + colorMap, "");

				// damn you async loads
				if (this.queue.latestDrawRequestTimestamp < 0 ||
						(timestamp && timestamp < this.queue.latestDrawRequestTimestamp)) {
					return;
				}

                // create the image object that loads the tile we need
                if (this.queue.isImageCached(req.cache_key)) {
                    var args = {
                        image: this.queue.getCachedImage(req.cache_key),
                        timestamp: timestamp,
                        imageOffset : [imageOffsetX, imageOffsetY],
                        canvas: [canvasX, canvasY],
                        dims: [width, height],
                        delta: [deltaStartTileXAndUpperLeftCornerX,
                                deltaStartTileYAndUpperLeftCornerY],
                        };
                    this.renderTile(args);
                } else {
                    var imageTile = new Image();

                    imageTile.crossOrigin = '';
                    var appendix =
                        !this.getDataExtent().getIsTiled() ?
                        ("&id=" + this.sessionId + "&timestamp=" + timestamp) :
                        "";
                    imageTile.src = req.url + appendix;

                    (function(_this, timestamp, imageOffsetX, imageOffsetY,
                        canvasX, canvasY, width, height,
                        deltaStartTileXAndUpperLeftCornerX,
                        deltaStartTileYAndUpperLeftCornerY, cache_key) {

                        var args = {
                            timestamp: timestamp,
                            imageOffset : [imageOffsetX, imageOffsetY],
                            canvas: [canvasX, canvasY],
                            dims: [width, height],
                            delta: [deltaStartTileXAndUpperLeftCornerX,
                                    deltaStartTileYAndUpperLeftCornerY]};

    					imageTile.onerror = function() {
                            if (_this.queue) {
                                if (_this.queue.latestDrawRequestTimestamp < 0 ||
                                    (timestamp && timestamp < _this.queue.latestDrawRequestTimestamp)) return;
                                _this.queue.is_partial_render = true;
                            }
                            args.image = this;
                            _this.renderTile(args, true);
    					};
    					imageTile.onload = function() {
                            if (_this.queue &&
                                !_this.queue.isImageCached(cache_key))
                                _this.queue.addImageToCache(cache_key, this);
                            args.image = this;
                            _this.renderTile(args);
    					};
    				})(this, timestamp, imageOffsetX, imageOffsetY,
                         canvasX, canvasY, width, height,
                         deltaStartTileXAndUpperLeftCornerX,
                         deltaStartTileYAndUpperLeftCornerY, req.cache_key);
                }

				// increment canvasY
				canvasY += height;
			}

			// increment canvasX
			canvasX += width;
		};
	},
    renderTile : function(args, erroneousTile) {
        if (!this.queue) return;

        if (typeof erroneousTile !== 'boolean')
            erroneousTile = false;

        var tile_size = this.getDataExtent().tile_size;
        var width = args.dims[0];
        var height = args.dims[1];
        var image = args.image;
        var canvas = args.canvas;
        var delta = args.delta;
        var imageOffset = args.imageOffset;
        var timestamp = args.timestamp;
        var preContext = this.preCanvas.getContext("2d");

        // check with actual image dimensions ...
        if (canvas[0] == 0 && width != tile_size && delta[0] !=0) {
            imageOffset[0] = (tile_size - delta[0]);
            width = image.width - imageOffset[0];
        } else if (image.width < width) {
                width = image.width;
        }

        if (canvas[1] == 0 && height != tile_size && delta[1] !=0) {
            imageOffset[1] = (tile_size - delta[1]);
            height = image.height - imageOffset[1];
        } else	if (image.height < height) {
                height = image.height;
        }

        // damn you async loads
        if (this.queue.latestDrawRequestTimestamp < 0 ||
                (timestamp && timestamp < this.queue.latestDrawRequestTimestamp)) {
            return;
        }

        if (!erroneousTile)
            preContext.drawImage(image,
                imageOffset[0], imageOffset[1], width, height, // tile dimensions
                canvas[0], canvas[1], width, height); // canvas dimensions
        if (!this.queue.is_partial_render)
            this.queue.incrementTileCount();
        else this.queue.displayLoadingProgress(true, true);

        if (this.queue.hasFinishedTiling() || this.queue.is_partial_render) {
            if (typeof TissueStack.dataSetNavigation === 'object' && this.overlays)
                for (var z=0;z<this.overlays.length;z++)
                    this.overlays[z].drawMe();

            var imageData =
                this.applyContrastAndColorMapToImageData(
                    preContext.getImageData(0,0, this.dim_x, this.dim_y));

            this.getCanvasContext().putImageData(imageData, 0,0);
            this.syncDataSetCoordinates(this, timestamp, false);

            if (TissueStack.overlay_datasets && this.overlay_canvas)
                this.getCanvasElement().show();

            if (this.is_main_view && this.measurements &&
                 this.measurements.checkMeasurements(
                {x: 0, y: 0, z: this.data_extent.slice}))
                    this.measurements.drawMeasuring();
        };
    },
	syncDataSetCoordinates : function(_this, timestamp, eraseCanvas) {
		if ((!TissueStack.sync_datasets && !TissueStack.overlay_datasets)
				&& !(TissueStack.overlay_datasets && (_this.overlay_canvas || _this.underlying_canvas)))
			return;

		if (TissueStack.overlay_datasets && !_this.underlying_canvas)
			return;

		if (typeof(eraseCanvase) != 'boolean') eraseCanvase = false;
		TissueStack.dataSetNavigation.syncDataSetCoordinates(_this, timestamp, eraseCanvas);
		_this.has_been_synced = false; // reset flag to accept syncing forwards again
		_this.queue.last_sync_timestamp = -1; // reset last sync timestamp
	},
	updateExtentInfo : function(realWorldCoords) {
		var log = (TissueStack.desktop || TissueStack.tablet) ? $('#canvas_extent') : $('#canvas_' + this.getDataExtent().plane + '_extent');

		if (!realWorldCoords) {
			log.html('<br/><br/>');
			return;
		}

		if(TissueStack.phone)
			log.html("Zoom Level: " + this.getDataExtent().zoom_level);
		else {
			var text = "Zoom Level: " + this.getDataExtent().zoom_level
					+ "<br/><hr />X: " + Math.round(realWorldCoords.min_x *1000) / 1000 + " to " + Math.round(realWorldCoords.max_x *1000) / 1000 + "<br/>Y: "
					+ Math.round(realWorldCoords.min_y *1000) / 1000 + " to " + Math.round(realWorldCoords.max_y *1000) / 1000 + "<br/>";
			if (this.data_extent.max_slices > 1) {
				text += ("Z: "+ Math.round(realWorldCoords.min_z *1000) / 1000 + " to " + Math.round(realWorldCoords.max_z *1000) / 1000 + "<br />");
			}
			log.html(text);
		}
	},
	updateCoordinateInfo : function(pixelCoords, worldCoords) {
    console.log(pixelCoords, worldCoords);
		var oneToOnePixelCoords = {
				x : pixelCoords.x,
				y : pixelCoords.y,
				z : pixelCoords.z
		};
		pixelCoords = this.getXYCoordinatesWithRespectToZoomLevel(pixelCoords);
		// outside of extent check
		if (!oneToOnePixelCoords || oneToOnePixelCoords.x < 0 || oneToOnePixelCoords.x > this.data_extent.x -1
				||  oneToOnePixelCoords.y < 0 || oneToOnePixelCoords.y > this.data_extent.y -1
				|| oneToOnePixelCoords.z < 0 || oneToOnePixelCoords.z > this.data_extent.max_slices) {
			$("#canvas_point_x").val("");
			$("#canvas_point_y").val("");
			$("#canvas_point_z").val("");
			$("#canvas_point_value").val("");

            var ontTree = $("#ontology_tree");
            if (ontTree && ontTree.length > 0 && ontTree.empty) {
                ontTree.empty();
            }

			return;
		}

		// phone
		if (TissueStack.phone) {
			var log;

			if (worldCoords) {
				log = $('.coords');
				log.html("World > X: " +  Math.round(worldCoords.x * 1000) / 1000 + ", Y: " +  Math.round(worldCoords.y * 1000) / 1000);
			} else {
				log = $('.coords');
				log.html("Pixels > X: " + oneToOnePixelCoords.x + ", Y: " + oneToOnePixelCoords.y);
			}
			return;
		}

		// for desktop and tablet
		var x = worldCoords ? worldCoords.x : pixelCoords.x;
		var y = worldCoords ? worldCoords.y : pixelCoords.y;
		var z = worldCoords ? worldCoords.z : pixelCoords.z;

		$("#canvas_point_x").val(Math.round(x *1000) / 1000);
		$("#canvas_point_y").val(Math.round(y *1000) / 1000);
		$("#canvas_point_z").val(Math.round(z *1000) / 1000);

		// get at pixel value
		var dataSet = TissueStack.dataSetStore.getDataSetById(this.getDataExtent().data_id);
		TissueStack.Utils.queryVoxelValue(dataSet, this, pixelCoords);

		// update url link info
		this.getUrlLinkString(dataSet.realWorldCoords[this.data_extent.plane]);
	}, displayPixelValue : function(dataSet, pixelValues) {
		if (typeof(pixelValues) != 'object' || !pixelValues
			|| typeof(dataSet) != 'object' || !dataSet) {
			$("#canvas_point_value").val("");
			return;
		}

		var ontologies = [];
		var children = [];

		var dataSetPixelValues = pixelValues[dataSet.filename];
        if (!dataSetPixelValues) return;

		var info = "";

		// we have a label info for the data set
		if (dataSetPixelValues && dataSetPixelValues.label) {
			// first display info for the actual data set
			info = "Label: " + dataSetPixelValues.label;
			if (TissueStack.desktop && dataSet.lookupValues && dataSet.associatedAtlas) {
				info += (" (" + dataSet.associatedAtlas.prefix + ")");
				$("#canvas_point_value").hide();
				// TODO: add us to the tree only if there is an associated hierarchy present...
				ontologies[0] =	{
					title: (dataSet.associatedAtlas.description ? dataSet.associatedAtlas.description : dataSet.associatedAtlas.prefix),
					key: dataSet.associatedAtlas.id,
					tooltip: (dataSet.associatedAtlas.description ? dataSet.associatedAtlas.description : dataSet.associatedAtlas.prefix),
					select: false,
					isFolder: true,
					expand: true,
					icon: "ontology.png"
				};
				children[0] = 	{
					title: dataSetPixelValues.label,
					key: dataSet.associatedAtlas.id + "_" + dataSetPixelValues.label,
					tooltip: dataSetPixelValues.label,
					select: false,
					isFolder: false,
					expand: false,
					icon: "ontology_part.png"
				};
				ontologies[0].children = children;
				children = [];
			}
		} else {// display r/g/b triples or gray
            dataSetPixelValues =
                this.getCanvasPixelValue({x: this.cross_x, y: this.cross_y});
            if (this.isColorMapOn() ||
                (dataSetPixelValues.green !== dataSetPixelValues.red &&
                dataSetPixelValues.red !== dataSetPixelValues.blue))
                info += ("R: " + dataSetPixelValues.red + ", G: "
					+ dataSetPixelValues.green + ", B: "
					+ dataSetPixelValues.blue);
            else info += dataSetPixelValues.red;
        }
		$("#canvas_point_value").val(info);

		// loop over associated data sets if they exist and integrate them in the tree structure
		if (TissueStack.desktop && dataSet.associatedDataSets && dataSet.associatedDataSets.length > 0)
			for (i=0; i<dataSet.associatedDataSets.length;i++) {
				var assocDs = dataSet.associatedDataSets[i];
				if (!assocDs) continue;
				assocDs = assocDs.associatedDataSet;
				// we might not have a label
				if (!pixelValues[assocDs.filename]) continue;
				var assocLabel = pixelValues[assocDs.filename].label;
				if (typeof(assocLabel) == 'undefined' || !assocLabel) continue;
				// append label info
				info += "\n"
				if (assocDs.lookupValues && assocDs.lookupValues.associatedAtlas)
					info += assocDs.lookupValues.associatedAtlas.prefix;
				else info += assocDs.description;
				info += ": " + assocLabel;
			}

		// construct tree if we have associated ontologies...
		if (ontologies && ontologies.length > 0) {
			 $("#ontology_tree").dynatree({
			       checkbox: false,
			       children: ontologies
			 });
			 $("#canvas_point_value").hide();
			 $("#ontology_tree").dynatree("getTree").reload();
			 $("#ontology_tree").show();

		} else {
			$("#canvas_point_value").show();
			$("#ontology_tree").hide();
		}
		//TissueStack.Utils.adjustCollapsibleSectionsHeight('ontology_tree', 150);
		TissueStack.Utils.adjustCollapsibleSectionsHeight('treedataset');
	}, getXYCoordinatesWithRespectToZoomLevel : function(coords) {
		return this.data_extent.getXYCoordinatesWithRespectToZoomLevel(coords);
	}, getUrlLinkString : function (realWorldCoords) {
		var url_link_message = "";
		var ds, x_link, y_link, z_link, zoom;

		ds = this.data_extent.data_id;
		x_link = $('#canvas_point_x').val();
		y_link = $('#canvas_point_y').val();
		z_link = $('#canvas_point_z').val();
		zoom = this.getDataExtent().zoom_level;

		//need to fix localhost or image server link later
		if(ds.search("localhost_") != -1){
			ds = ds.replace("localhost_", "");
		}
		else if (ds.length == 0){
			url_link_message = "No Dataset Selected";
			$('#'+this.dataset_id +'_link_message').html(url_link_message);
			return;
		}

		// Show Url Link info (solve the problem (used split ?) when user entering website by query string link)
		if(x_link != "" || y_link != "" || z_link != ""){
			var hostPart = document.location.href.split('?')[0];
			var potentialHash = hostPart.indexOf('#');
			if (potentialHash > 0) hostPart = hostPart.substring(0,potentialHash);
			url_link_message =
				hostPart + "?ds=" + ds + "&plane=" + this.data_extent.plane
					+ "&x=" + x_link + "&y=" + y_link + "&z=" + z_link + "&zoom=" + zoom;
		}
		if (typeof(this.color_map) == 'string' && this.color_map != 'grey') {
			url_link_message += ("&color=" + this.color_map);
		}
		if (this.contrast && this.contrast.isMinOrMaxDifferentFromDataSetMinOrMax()) {
			url_link_message += ("&min=" + this.contrast.getMinimum() + "&max=" + this.contrast.getMaximum());
		}

		$('#'+this.dataset_id +'_link_message').html('<a href="' + url_link_message + '" target="_blank">' + url_link_message + '</a>');
	}, checkIfWeAreColorMapTiled : function(url) {
		if (this.is_color_map_tiled == null && !(this.color_map == 'grey' || this.color_map == 'gray')) {
			this.is_color_map_tiled = TissueStack.Utils.testHttpFileExistence(url);
		}
		return this.is_color_map_tiled;
    },dispose : function() {
        if (this.underlying_canvas) this.underlying_canvas = null;
        if (this.overlay_canvas) this.overlay_canvas = null;
        this.queue.dispose();
        this.queue = null;
        if (this.measurements) {
            this.measurements.dispose();
            this.measurements = null;
        }

        if (this.is_main_view) {
            this.displayPixelValue();
            this.events.updateCoordinateDisplay(true, true);
            this.updateExtentInfo();
        }
        this.events.unbindAllEvents();
        if (this.contrast) this.contrast.unregisterListeners();
        this.overlays = null;
    }
};
