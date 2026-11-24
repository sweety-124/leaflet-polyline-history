import * as L from "leaflet";
import { describe, expect, it } from "vitest";
import { createPolylineHistory } from "../../src/adapters/LeafletAdapter";

class FakeMap extends L.Evented {
  private readonly layers = new Set<L.Layer>();

  addLayer(layer: L.Layer): this {
    if (!this.layers.has(layer)) {
      if (layer instanceof L.LayerGroup) {
        layer.eachLayer((child) => this.addLayer(child));
      }
      this.layers.add(layer);
      this.fire("layeradd", { layer });
    }
    return this;
  }

  removeLayer(layer: L.Layer): this {
    if (layer instanceof L.LayerGroup) {
      layer.eachLayer((child) => this.removeLayer(child));
    }
    if (this.layers.delete(layer)) {
      this.fire("layerremove", { layer });
    }
    return this;
  }

  hasLayer(layer: L.Layer): boolean {
    return this.layers.has(layer);
  }

  eachLayer(callback: (layer: L.Layer) => void): this {
    this.layers.forEach(callback);
    return this;
  }

  getLayers(): L.Layer[] {
    return [...this.layers];
  }
}

function asMap(fakeMap: FakeMap): L.Map {
  return fakeMap as unknown as L.Map;
}

describe("LeafletAdapter", () => {
  it("tracks additions and removals, restoring the same layer", () => {
    const fakeMap = new FakeMap();
    const history = createPolylineHistory(asMap(fakeMap));
    const line = L.polyline([
      [10, 20],
      [30, 40],
    ]);

    fakeMap.addLayer(line);
    expect(history.canUndo()).toBe(true);
    expect(history.undo()).toBe(true);
    expect(fakeMap.hasLayer(line)).toBe(false);
    expect(history.redo()).toBe(true);
    expect(fakeMap.hasLayer(line)).toBe(true);

    fakeMap.removeLayer(line);
    expect(history.undo()).toBe(true);
    expect(fakeMap.hasLayer(line)).toBe(true);
    history.destroy();
  });

  it("checkpoints programmatic edits and restores coordinates and style", () => {
    const fakeMap = new FakeMap();
    const line = L.polyline(
      [
        [1, 2],
        [3, 4],
      ],
      { color: "red", weight: 5 },
    );
    fakeMap.addLayer(line);
    const history = createPolylineHistory(asMap(fakeMap));

    line.setLatLngs([
      [5, 6],
      [7, 8],
    ]);
    line.setStyle({ color: "green", weight: 9 });
    expect(history.checkpoint(line)).toBe(true);

    history.undo();
    expect(line.getLatLngs()).toEqual([L.latLng(1, 2), L.latLng(3, 4)]);
    expect(line.options.color).toBe("red");
    expect(line.options.weight).toBe(5);

    history.redo();
    expect(line.getLatLngs()).toEqual([L.latLng(5, 6), L.latLng(7, 8)]);
    expect(line.options.color).toBe("green");
    history.destroy();
  });

  it("restores deleted polygons and keeps independent history per layer", () => {
    const fakeMap = new FakeMap();
    const polygon = L.polygon(
      [
        [0, 0],
        [0, 5],
        [5, 5],
      ],
      { fillColor: "orange" },
    );
    const line = L.polyline([
      [2, 2],
      [3, 3],
    ]);
    fakeMap.addLayer(polygon);
    fakeMap.addLayer(line);
    const history = createPolylineHistory(asMap(fakeMap));

    fakeMap.removeLayer(polygon);
    expect(history.undo()).toBe(true);
    expect(fakeMap.hasLayer(polygon)).toBe(true);
    expect(polygon.options.fillColor).toBe("orange");
    expect(history.undo()).toBe(false);

    fakeMap.removeLayer(line);
    expect(history.undo()).toBe(true);
    expect(fakeMap.hasLayer(line)).toBe(true);
    history.destroy();
  });

  it("undoes and redoes polygon vertex edits", () => {
    const fakeMap = new FakeMap();
    const polygon = L.polygon([
      [0, 0],
      [0, 5],
      [5, 5],
    ]);
    fakeMap.addLayer(polygon);
    const history = createPolylineHistory(asMap(fakeMap));
    const previous = polygon.getLatLngs();

    polygon.setLatLngs([
      [0, 0],
      [0, 8],
      [8, 8],
    ]);
    expect(history.checkpoint(polygon)).toBe(true);

    history.undo();
    expect(polygon.getLatLngs()).toEqual(previous);
    history.redo();
    expect(polygon.getLatLngs()).toEqual([
      [L.latLng(0, 0), L.latLng(0, 8), L.latLng(8, 8)],
    ]);
    history.destroy();
  });

  it("does not capture initial layers or tracked shapes disabled by options", () => {
    const fakeMap = new FakeMap();
    const polygon = L.polygon([
      [0, 0],
      [1, 1],
    ]);
    fakeMap.addLayer(polygon);
    const history = createPolylineHistory(asMap(fakeMap), {
      trackPolygons: false,
    });

    expect(history.canUndo()).toBe(false);
    fakeMap.removeLayer(polygon);
    expect(history.canUndo()).toBe(false);
    history.destroy();
  });

  it("tracks polyline members of a feature group independently", () => {
    const fakeMap = new FakeMap();
    const line = L.polyline([
      [0, 0],
      [1, 1],
    ]);
    const group = L.featureGroup([line]);
    fakeMap.addLayer(group);
    const history = createPolylineHistory(asMap(fakeMap));

    fakeMap.removeLayer(group);
    expect(history.canUndo()).toBe(true);
    expect(history.undo()).toBe(true);
    expect(fakeMap.hasLayer(line)).toBe(true);
    expect(fakeMap.hasLayer(group)).toBe(false);

    history.destroy();
  });

  it("supports deterministic application-provided layer ids and cleanup", () => {
    const fakeMap = new FakeMap();
    const history = createPolylineHistory(asMap(fakeMap), {
      getLayerId: () => "shape-main",
    });
    const line = L.polyline([
      [0, 0],
      [1, 1],
    ]);

    fakeMap.addLayer(line);
    expect(history.exportHistory().undo[0]?.layerId).toBe("shape-main");
    history.destroy();
    fakeMap.removeLayer(line);
    expect(history.canUndo()).toBe(false);
  });

  it("imports serialized history and reconstructs a deleted shape", () => {
    const sourceMap = new FakeMap();
    const sourceHistory = createPolylineHistory(asMap(sourceMap), {
      getLayerId: () => "saved-route",
    });
    const route = L.polyline(
      [
        [10, 20],
        [30, 40],
      ],
      { color: "purple", weight: 7 },
    );
    sourceMap.addLayer(route);
    sourceMap.removeLayer(route);
    const saved = JSON.parse(
      JSON.stringify(sourceHistory.exportHistory()),
    ) as unknown;

    const destinationMap = new FakeMap();
    const destinationHistory = createPolylineHistory(asMap(destinationMap), {
      getLayerId: () => "saved-route",
    });
    destinationHistory.importHistory(saved);
    expect(destinationHistory.undo()).toBe(true);

    const restored = destinationMap
      .getLayers()
      .find((layer): layer is L.Polyline => layer instanceof L.Polyline);
    expect(restored).toBeDefined();
    expect(restored?.options.color).toBe("purple");
    expect(restored?.options.weight).toBe(7);
    expect(restored?.getLatLngs()).toEqual([
      L.latLng(10, 20),
      L.latLng(30, 40),
    ]);

    sourceHistory.destroy();
    destinationHistory.destroy();
  });
});
