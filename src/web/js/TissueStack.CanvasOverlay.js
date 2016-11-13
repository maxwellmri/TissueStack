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
TissueStack.CanvasOverlay = function(id, canvas, protocol, host, dataset_id, dataset_plane_id) {
	if (typeof(id) != 'number')
		throw new Error("CanvasOverlay: argument id is not a number!");

	if (typeof(canvas) == 'undefined')
		throw new Error("CanvasOverlay: argument canvas is undefined!");

	if (typeof(protocol) != 'string' && typeof(host) != 'string')
		throw new Error("CanvasOverlay: protocol and host have to be strings!");

	if (typeof(dataset_id) != 'number' && typeof(dataset_plane_id) != 'number')
		throw new Error("CanvasOverlay: ids have to be numeric!");

	this.pure_id = id;
	this.id = canvas.canvas_id + "_overlay_" + id;
	this.canvas = canvas;
	this.dataset_id = dataset_id;
	this.dataset_plane_id = dataset_plane_id;
	this.mappingsUrl = TissueStack.configuration['server_host'].value + "/" + TissueStack.configuration['server_proxy_path'].value
	+ "/overlays/id_mapping_for_slice/" + this.dataset_id + "/" + this.dataset_plane_id + "/" + this.type;
	this.overlayUrl =
		TissueStack.configuration['server_host'].value + "/" + TissueStack.configuration['server_proxy_path'].value + "/overlays/overlay/";

	// create canvas element
	this.createCanvasElement();

	// retrieve all overlays ids and their mapping to each slice
	this.queryOverlayMappingsForSlices();
};

TissueStack.CanvasOverlay.prototype = {
	pure_id: null,
	id: null,
	type: "CANVAS",
	canvas: null,
	mappingsUrl : null,
	overlayUrl : null,
	dataset_id : null,
	dataset_plane_id: null,
	slices: null,
	error: null,
	selected: false,
	getMyOwnCanvasElement: function() {
		return $('#' + this.id);
	},
	createCanvasElement : function() {
		var myOwnCanvasElement = this.getMyOwnCanvasElement();
		if (!myOwnCanvasElement || (myOwnCanvasElement && myOwnCanvasElement.length == 0)) {
			// get parent of canvas and append overlay to it
			$('#' + this.canvas.canvas_id).parent().append(
					'<canvas id="' + this.id + '" style="z-index: ' + (800 + this.pure_id) + '"'
					+ ' width="' + this.canvas.getCanvasElement().attr("width") + '" height="' + this.canvas.getCanvasElement().attr("height") + '"'
					+ ' class="overlay"></canvas>');
		}
	},
	queryOverlayMappingsForSlices : function() {
		(function(__this) {
			TissueStack.Utils.sendAjaxRequest(
				__this.mappingsUrl, 'GET',
				function(data, textStatus, jqXHR) {
					if (!data.response && !data.error) {
						__this.error = "Did not receive anyting, neither success nor error ....";
						return;
					}
					if (data.error) {
						var message = "Application Error: " + (data.error.description ? data.error.description : " no more info available. check logs.");
						__this.error = message;
						return;
					}
					if (data.response.noResults)
						return;

					__this.slices = data.response;
				},
				function(jqXHR, textStatus, errorThrown) {
					__this.error =  "Error connecting to backend: " + textStatus + " " + errorThrown;
				}
		);})(this);
	},
	fetchOverlayForSlice : function(slice, handler) {
		if (typeof(slice) != "number")
			return;

		var sliceMap = this.slices[''+slice];
		if (typeof(sliceMap) === 'undefined')
			return;

		// complete request url with overlay id
		var url = this.overlayUrl;
		url += sliceMap;
		url += ("/" + this.type + "/json");

		(function(__this) {
			TissueStack.Utils.sendAjaxRequest(
					url, 'GET',
					function(data, textStatus, jqXHR) {
						if (!data.response && !data.error) {
							// nothing we can do
							return;
						}
						if (data.error || data.response.noResults) {
							// nothing we can do
							return;
						}

						// execute success handler
						if (handler) handler(__this,data.response);
					},
					function(jqXHR, textStatus, errorThrown) {
						// nothing we can do
					}
		);})(this);
	},
	select : function() {
		this.selected = true;
		this.getMyOwnCanvasElement().show();
	},
	deselect : function() {
		this.selected = false;
		this.getMyOwnCanvasElement().hide();
	},
	clearCanvas : function() {
		if (this.getMyOwnCanvasElement() == null || this.getMyOwnCanvasElement().length == 0) return;

		var ctx = this.getMyOwnCanvasElement()[0].getContext("2d");
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, this.canvas.dim_x, this.canvas.dim_y);
		ctx.restore();
	},
	drawMe : function() {
		// only do work if we have been selected
		if (!this.selected)
			return;

		if (!this.slices && this.error) // retry if we had an error
			this.queryOverlayMappingsForSlices();

		this.clearCanvas();

		if (!this.slices)
			return;

		var handler = function(__this, response) {
			// draw me
			if (__this.getMyOwnCanvasElement() == null || __this.getMyOwnCanvasElement().length == 0) return;

			var context = __this.getMyOwnCanvasElement()[0].getContext("2d");
			eval(response.content);
		};
		this.fetchOverlayForSlice(this.canvas.data_extent.slice, handler);
	}
};
