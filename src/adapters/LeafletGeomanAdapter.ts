import * as L from "leaflet";
import { isLeafletShapeLayer, type LeafletAdapter } from "./LeafletAdapter";

export class LeafletGeomanAdapter {
  private destroyed = false;
  private readonly trackedLayers = new Set<L.Layer>();

  constructor(
    private readonly map: L.Map,
    private readonly history: Pick<LeafletAdapter, "checkpoint">,
  ) {
    this.map.eachLayer(this.attachLayer);
    this.map.on("layeradd", this.handleLayerAdd);
    this.map.on("layerremove", this.handleLayerRemove);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.map.off("layeradd", this.handleLayerAdd);
    this.map.off("layerremove", this.handleLayerRemove);
    for (const layer of this.trackedLayers) {
      layer.off("pm:update", this.handleLayerUpdate);
      layer.off("pm:dragend", this.handleLayerUpdate);
    }
    this.trackedLayers.clear();
    this.destroyed = true;
  }

  private readonly handleLayerAdd = (event: L.LayerEvent): void => {
    this.attachLayer(event.layer);
  };

  private readonly handleLayerRemove = (event: L.LayerEvent): void => {
    this.detachLayer(event.layer);
  };

  private readonly attachLayer = (layer: L.Layer): void => {
    if (!isLeafletShapeLayer(layer) || this.trackedLayers.has(layer)) {
      return;
    }
    layer.on("pm:update", this.handleLayerUpdate);
    layer.on("pm:dragend", this.handleLayerUpdate);
    this.trackedLayers.add(layer);
  };

  private readonly detachLayer = (layer: L.Layer): void => {
    if (!this.trackedLayers.delete(layer)) {
      return;
    }
    layer.off("pm:update", this.handleLayerUpdate);
    layer.off("pm:dragend", this.handleLayerUpdate);
  };

  private readonly handleLayerUpdate = (event: L.LeafletEvent): void => {
    const target: unknown = event.target;
    if (target instanceof L.Polyline && isLeafletShapeLayer(target)) {
      this.history.checkpoint(target);
    }
  };
}

export function attachLeafletGeomanHistory(
  map: L.Map,
  history: Pick<LeafletAdapter, "checkpoint">,
): LeafletGeomanAdapter {
  return new LeafletGeomanAdapter(map, history);
}
