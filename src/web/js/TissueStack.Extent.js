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
TissueStack.Extent = function (
		data_id, is_tiled, zoom_level, plane, max_slices, x, y, origX, origY, step,
		zoom_levels, worldCoordinatesTransformationMatrix, res_mm) {
	this.setDataId(data_id);
	this.setIsTiled(is_tiled);
	this.setZoomLevel(zoom_level);
	this.setPlane(plane);
	this.max_slices = max_slices;
	this.setSlice(Math.floor(max_slices / 2));
	this.setDimensions(x, y);
	this.rememberOneToOneZoomLevel(this.x, this.y, origX, origY, this.zoom_level);
	this.step = step;
	this.setZoomLevels(zoom_levels);
	this.worldCoordinatesTransformationMatrix = worldCoordinatesTransformationMatrix;
	if (typeof(res_mm) == 'number')  this.resolution_mm = res_mm;
};

TissueStack.Extent.prototype = {
	canvas : null,
	is_tiled : false,
	tile_size : 256,
	x : 0,
	origX : 0,
	y : 0,
	origY : 0,
	one_to_one_x : 0,
    one_to_one_y : 0,
	data_id: "",
	one_to_one_zoom_level : 0,
	zoom_level : 0,
	zoom_level_factor : 1,
	zoom_levels : [],
	plane: 'z',
	max_slices : 0,
	slice: 0,
	step: 1,
	worldCoordinatesTransformationMatrix: null,
	resolution_mm: 0,
	setDataId : function(data_id) {
		if (typeof(data_id) != "string" || data_id.length == 0) {
			throw new Error("data_id has to be a non-empty string");
		}
		this.data_id = data_id;
	}, setZoomLevel : function(zoom_level) {
		if (typeof(zoom_level) != "number" || Math.floor(zoom_level) < 0) {
			throw new Error("zoom_level has to be a non-negative integer");
		}
		this.zoom_level = Math.floor(zoom_level);
	}, setIsTiled : function(is_tiled) {
			if (typeof(is_tiled) != "boolean") {
				this.is_tiled = false;
			}
			this.is_tiled = is_tiled;
	}, getIsTiled : function() {
		return this.is_tiled;
	}, setZoomLevels : function(zoom_levels) {
		if (typeof(zoom_levels) != "object" || zoom_levels.length == 0) {
			throw new Error("zoom_levels are missing");
		}
		this.zoom_levels = zoom_levels;
	}, setPlane : function(plane) {
		if (typeof(plane) != "string" || !(plane == 'x' || plane == 'y' || plane == 'z')) {
			throw new Error("plane has to be one of the following: 'z', 'y' or 'z'");
		}
		this.plane = plane;
		this.originalPlane = plane;
	}, getOriginalPlane : function() {
		if (typeof(this.originalPlane) != "string") {
			return this.plane;
		}
		return this.originalPlane;
	}, setSlice : function(slice) {
		if (typeof(slice) != "number" || Math.floor(slice) < 0) {
			throw new Error("slice has to be a non-negative integer");
		}
		this.slice = slice;
	}, setDimensions : function(x,y) {
		if (typeof(x) == "string") {
			x = parseInt(x);
		}
		if (typeof(x) != "number" || Math.floor(x) < 0) {
			throw new Error("x has to be a non-negative integer");
		}
		this.x = Math.floor(x);
		if (typeof(y) == "string") {
			y = parseInt(y);
		}
		if (typeof(y) != "number" || Math.floor(y) < 0) {
			throw new Error("y has to be a non-negative integer");
		}
		this.y = Math.floor(y);
	}, rememberOneToOneZoomLevel : function(x, y, origX, origY, zoom_level) {
		if (typeof(x) != "number" || Math.floor(x) < 0 || typeof(y) != "number" || Math.floor(y) < 0 || typeof(zoom_level) != "number" || Math.floor(zoom_level) < 0) {
			return;
		}
		this.one_to_one_zoom_level = zoom_level;
		this.one_to_one_x = x;
		this.one_to_one_y = y;

		// 'original' x/y without anisotropy
		if (typeof(origX) == "string") {
			origX = parseInt(origX);
		}

		if (typeof(origX) != "number" || Math.floor(origX) < 0) {
			origX = this.one_to_one_x;
		}
		this.origX = Math.floor(origX);
		if (typeof(origY) == "string") {
			origY = parseInt(origY);
		}
		if (typeof(origY) != "number" || Math.floor(origY) < 0) {
			origY = this.one_to_one_y;
		}
		this.origY = Math.floor(origY);
	}, changeToZoomLevel : function(zoom_level) {
		var zoom_level_factor = this.getZoomLevelFactorForZoomLevel(zoom_level);

		if (zoom_level_factor == -1) {
			return;
		}

		// calculate bounds for extent (relative to 1:1 bounds given) if they haven't already been calculated once before
		// we floor the values by default
		this.zoom_level_factor = zoom_level_factor;
		this.setZoomLevel(zoom_level);
		var zoom_level_dim = this.getZoomLevelDimensions(zoom_level);
		if (!zoom_level_dim) {
			return;
		}
		this.setDimensions(zoom_level_dim.x, zoom_level_dim.y);

		// update scale bar if main view
		this.canvas.updateScaleBar();
	}, getZoomLevelFactorForZoomLevel : function(zoom_level) {
		if (typeof(zoom_level) != "number" || Math.floor(zoom_level) < 0 || Math.floor(zoom_level) >= this.zoom_levels.length) {
			return -1;
		}
		return this.zoom_levels[Math.floor(zoom_level)];
	}, getZoomLevelDelta : function(zoom_level1, zoom_level2) {
		if (typeof(zoom_level1) != "number" || typeof(zoom_level2) != "number") {
			return 0;
		}
		zoom_level1 = Math.floor(zoom_level1);
		zoom_level2 = Math.floor(zoom_level2);

		if (zoom_level1 == zoom_level2) {
			return 0;
		}

		var dimZoomLevel1 =  this.getZoomLevelDimensions(zoom_level1);
		var dimZoomLevel2 =  this.getZoomLevelDimensions(zoom_level2);

		if (!dimZoomLevel1 || !dimZoomLevel2) {
			return null;
		}

		return {x: dimZoomLevel1.x - dimZoomLevel2.x, y: dimZoomLevel1.y - dimZoomLevel2.y};
	}, getZoomLevelDimensions : function(zoom_level) {
		var zoomLevelFactor = this.getZoomLevelFactorForZoomLevel(zoom_level);

		if (zoomLevelFactor == -1) {
			return null;
		}

        var dims = {x: Math.floor(this.one_to_one_x * zoomLevelFactor), y: Math.floor(this.one_to_one_y * zoomLevelFactor)};

        // correction for cases where we would have 0 pixels length due to scaling
        if (dims.x < 1)
            dims.x = 1;
        if (dims.y < 1)
            dims.y = 1;

		return dims;
	}, setSliceWithRespectToZoomLevel : function(slice) {
		this.slice = Math.round(slice / this.zoom_level_factor);

		var canvasSlider = $("#" + (this.canvas.dataset_id == "" ? "canvas_" : this.canvas.dataset_id + "_canvas_") + "main_slider");
		if (canvasSlider.length == 0) {
			return;
		}

		var mainCanvas = this.plane;

		if(!TissueStack.phone){
			var planeId =
				TissueStack.Utils.returnFirstOccurranceOfPatternInStringArray(canvasSlider.attr("class").split(" "), "^canvas_");
			if (planeId) {
				var startPos = "canvas_".length;
				mainCanvas = planeId.substring(startPos, startPos + 1);
			}

			if (mainCanvas == this.plane && canvasSlider && canvasSlider.length > 0) {
				slice = this.slice < 0 ? this.max_slices : (this.slice > this.max_slices ? 0 : this.slice);

                if (slice == canvasSlider.val())
                    return;

				try {
					canvasSlider.val(slice).slider("refresh");
                } catch(ignored) {}
			}
		}
	}, getCenter : function () {
		return TissueStack.Utils.getCenter(this.x,this.y);
	}, getWorldCoordinatesForPixel : function(pixelCoords) {
		var worldCoords = {
			x : pixelCoords.x,
			y : pixelCoords.y,
			z : pixelCoords.z,
		};

		// now we'll have to correct x and y according to their zoom level to get the 1:1 pixel Coordinates which can then be transformed
		worldCoords.x = worldCoords.x * (this.one_to_one_x / this.x);
        if (this.one_to_one_x != this.origX)
            worldCoords.x *= (this.origX / this.one_to_one_x);
		worldCoords.y = this.one_to_one_y - (worldCoords.y * (this.one_to_one_y / this.y));
        if (this.one_to_one_y != this.origY)
            worldCoords.y *= ( this.origY / this.one_to_one_y);

		worldCoords = TissueStack.Utils.transformPixelCoordinatesToWorldCoordinates(
				[worldCoords.x, worldCoords.y, worldCoords.z, 1],
				this.worldCoordinatesTransformationMatrix);
		if (!worldCoords) return null;

		// return world coordinates
		return {x: worldCoords[0], y: worldCoords[1], z: worldCoords[2]};
	},
	getWorldCoordinatesForPixelWithBoundsCheck : function(pixelCoords) {
		var worldCoords = this.getWorldCoordinatesForPixel(pixelCoords);
		if (!worldCoords) return null;

		// clamp to min/max
		var bounds = this.getExtentCoordinates();
		if (worldCoords.x < bounds.min_x) worldCoords.x = bounds.min_x;
		if (worldCoords.y < bounds.min_y) worldCoords.y = bounds.min_y;
		if (worldCoords.z < bounds.min_z) worldCoords.z = bounds.min_z;

		if (worldCoords.x > bounds.max_x) worldCoords.x = bounds.max_x;
		if (worldCoords.y > bounds.max_y) worldCoords.y = bounds.max_y;
		if (worldCoords.z > bounds.max_z) worldCoords.z = bounds.max_z;

		return worldCoords;
	},
	getPixelForWorldCoordinates : function(worldCoords) {
		if (worldCoords == null) {
			return null;
		}

		var pixelCoords = TissueStack.Utils.transformWorldCoordinatesToPixelCoordinates(
				[worldCoords.x, worldCoords.y, worldCoords.z, 1],
				this.worldCoordinatesTransformationMatrix);
		if (pixelCoords == null) {
			return null;
		}

		pixelCoords = {x: pixelCoords[0], y: pixelCoords[1], z: pixelCoords[2]};

        if (this.one_to_one_x != this.origX)
            pixelCoords.x *= (this.one_to_one_x / this.origX);
        if (this.one_to_one_y != this.origY)
            pixelCoords.y *= (this.one_to_one_y / this.origY);

		// now we have to correct x and y according to their zoom level
		pixelCoords.z = pixelCoords.z;
		pixelCoords.x = pixelCoords.x * (this.x / this.one_to_one_x);
		pixelCoords.y = this.y - pixelCoords.y * (this.y / this.one_to_one_y);

		return pixelCoords;
	},
	getExtentCoordinates : function() {
		// if world coords translation matrix is missing => use the pixel coords as a fallback
		var realWorldCoords = {min_x: 0, max_x: this.x - 1, min_y: 0, max_y: this.y - 1, min_z: 0, max_z: this.max_slices};

		if (this.worldCoordinatesTransformationMatrix) {
			var tmpTranslatedCoords = this.getWorldCoordinatesForPixel({x:0, y:0, z:0});
            if (!tmpTranslatedCoords)
                return realWorldCoords;

			realWorldCoords.min_x = tmpTranslatedCoords.x;
			realWorldCoords.max_y = tmpTranslatedCoords.y;
			realWorldCoords.min_z = tmpTranslatedCoords.z;

			tmpTranslatedCoords = this.getWorldCoordinatesForPixel({x:this.x -1, y:this.y -1, z:this.max_slices});
            if (!tmpTranslatedCoords)
                return realWorldCoords;

            realWorldCoords.max_x = tmpTranslatedCoords.x;
			realWorldCoords.min_y = tmpTranslatedCoords.y;
			realWorldCoords.max_z = tmpTranslatedCoords.z;
		}

		return realWorldCoords;
	}, getXYCoordinatesWithRespectToZoomLevel : function(coords) {
		if (!coords) {
			return;
		}

		// correct x and y according to their zoom level to get the 1:1 pixel Coordinates which can then be transformed
		coords.x = coords.x * (this.one_to_one_x / this.x);
		coords.y = coords.y * (this.one_to_one_y / this.y);

		return coords;
	}, adjustScaleBar :function (length) {
		var scaleMiddle = $('#'+this.canvas.dataset_id+'_scale_middle, .scalecontrol_image');
		if (!scaleMiddle || scaleMiddle.length == 0) return;

		scaleMiddle.css({"width" : length + 3});
		$('#'+this.canvas.dataset_id+'_scale_center_right').css({"left" : length + 3});
		$('#'+this.canvas.dataset_id+'_scale_up').css({"left" : length});
		$('#'+this.canvas.dataset_id+'_scale_text_up').html(
				TissueStack.Utils.getResolutionString(this.resolution_mm * length/ this.zoom_level_factor));
	}
};
