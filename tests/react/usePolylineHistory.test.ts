import * as L from "leaflet";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePolylineHistory } from "../../src/react/usePolylineHistory";

class EventMap extends L.Evented {
  private readonly layers = new Set<L.Layer>();

  addLayer(layer: L.Layer): this {
    if (!this.layers.has(layer)) {
      this.layers.add(layer);
      this.fire("layeradd", { layer });
    }
    return this;
  }

  removeLayer(layer: L.Layer): this {
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
}

function asMap(fakeMap: EventMap): L.Map {
  return fakeMap as unknown as L.Map;
}

describe("usePolylineHistory", () => {
  it("waits for a map, synchronizes actions, and cleans up on unmount", () => {
    const map = new EventMap();
    const { result, rerender, unmount } = renderHook(
      ({ currentMap }: { currentMap: L.Map | null }) =>
        usePolylineHistory(currentMap),
      { initialProps: { currentMap: null as L.Map | null } },
    );

    expect(result.current.canUndo).toBe(false);
    rerender({ currentMap: asMap(map) });

    const line = L.polyline([
      [0, 0],
      [1, 1],
    ]);
    act(() => {
      map.addLayer(line);
    });
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.redo();
      result.current.clearHistory();
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    unmount();
    expect(() =>
      map.addLayer(
        L.polyline([
          [2, 2],
          [3, 3],
        ]),
      ),
    ).not.toThrow();
  });

  it("does not reset history when an inline layer-id callback changes", () => {
    const map = new EventMap();
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        usePolylineHistory(asMap(map), { getLayerId: () => id }),
      { initialProps: { id: "route-one" } },
    );
    const line = L.polyline([
      [0, 0],
      [1, 1],
    ]);

    act(() => {
      map.addLayer(line);
    });
    expect(result.current.canUndo).toBe(true);

    rerender({ id: "route-two" });
    expect(result.current.canUndo).toBe(true);
  });
});
