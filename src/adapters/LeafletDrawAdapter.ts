import * as L from "leaflet";
import { isLeafletShapeLayer, type LeafletAdapter } from "./LeafletAdapter";

interface DrawEditedEvent extends L.LeafletEvent {
  readonly layers: L.LayerGroup;
}

function isDrawEditedEvent(event: L.LeafletEvent): event is DrawEditedEvent {
  return "layers" in event && event.layers instanceof L.LayerGroup;
}

export class LeafletDrawAdapter {
  private destroyed = false;

  constructor(
    private readonly map: L.Map,
    private readonly history: Pick<LeafletAdapter, "checkpoint">,
  ) {
    this.map.on("draw:edited", this.handleEdited);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.map.off("draw:edited", this.handleEdited);
    this.destroyed = true;
  }

  private readonly handleEdited = (event: L.LeafletEvent): void => {
    if (!isDrawEditedEvent(event)) {
      throw new TypeError(
        "Leaflet.Draw edit event does not contain a layer group.",
      );
    }

    event.layers.eachLayer((layer) => {
      if (isLeafletShapeLayer(layer)) {
        this.history.checkpoint(layer);
      }
    });
  };
}

export function attachLeafletDrawHistory(
  map: L.Map,
  history: Pick<LeafletAdapter, "checkpoint">,
): LeafletDrawAdapter {
  return new LeafletDrawAdapter(map, history);
}
