import * as L from "leaflet";
import { describe, expect, it } from "vitest";
import { attachLeafletDrawHistory } from "../../src/adapters/LeafletDrawAdapter";
import { attachLeafletGeomanHistory } from "../../src/adapters/LeafletGeomanAdapter";
import { createPolylineHistory } from "../../src/adapters/LeafletAdapter";

class EventMap extends L.Evented {
  private readonly layers = new Set<L.Layer>();

  addLayer(layer: L.Layer): this {
    this.layers.add(layer);
    this.fire("layeradd", { layer });
    return this;
  }

  hasLayer(layer: L.Layer): boolean {
    return this.layers.has(layer);
  }

  eachLayer(callback: (layer: L.Layer) => void): this {
    this.layers.forEach(callback);
    return this;
  }
}

function asMap(fakeMap: EventMap): L.Map {
  return fakeMap as unknown as L.Map;
}

describe("drawing plugin adapters", () => {
  it("records completed Leaflet.Draw edits and detaches cleanly", () => {
    const map = new EventMap();
    const line = L.polyline([
      [0, 0],
      [1, 1],
    ]);
    map.addLayer(line);
    const history = createPolylineHistory(asMap(map));
    const draw = attachLeafletDrawHistory(asMap(map), history);

    line.setLatLngs([
      [2, 2],
      [3, 3],
    ]);
    map.fire("draw:edited", { layers: L.featureGroup([line]) });
    expect(history.canUndo()).toBe(true);

    draw.destroy();
    line.setLatLngs([
      [4, 4],
      [5, 5],
    ]);
    map.fire("draw:edited", { layers: L.featureGroup([line]) });
    expect(history.canUndo()).toBe(true);
    expect(history.undo()).toBe(true);
    expect(line.getLatLngs()).toEqual([L.latLng(0, 0), L.latLng(1, 1)]);
    history.destroy();
  });

  it("records Geoman edits and shape drags through completion events", () => {
    const map = new EventMap();
    const line = L.polyline([
      [0, 0],
      [1, 1],
    ]);
    map.addLayer(line);
    const history = createPolylineHistory(asMap(map));
    const geoman = attachLeafletGeomanHistory(asMap(map), history);

    line.setLatLngs([
      [5, 5],
      [6, 6],
    ]);
    line.fire("pm:update");
    expect(history.canUndo()).toBe(true);
    expect(history.undo()).toBe(true);
    expect(line.getLatLngs()).toEqual([L.latLng(0, 0), L.latLng(1, 1)]);

    geoman.destroy();
    history.destroy();
  });

  it("ignores shape types disabled in the shared history controller", () => {
    const map = new EventMap();
    const polygon = L.polygon([
      [0, 0],
      [1, 1],
    ]);
    map.addLayer(polygon);
    const history = createPolylineHistory(asMap(map), {
      trackPolygons: false,
    });
    const draw = attachLeafletDrawHistory(asMap(map), history);

    polygon.setLatLngs([
      [0, 0],
      [2, 2],
    ]);
    expect(() =>
      map.fire("draw:edited", { layers: L.featureGroup([polygon]) }),
    ).not.toThrow();
    expect(history.canUndo()).toBe(false);

    draw.destroy();
    history.destroy();
  });
});
