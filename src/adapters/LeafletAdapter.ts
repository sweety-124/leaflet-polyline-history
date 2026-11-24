import * as L from "leaflet";
import { HistoryManager } from "../core/HistoryManager";
import type {
  HistoryDocument,
  HistoryEvents,
  HistoryStatus,
  JsonValue,
  LayerSnapshot,
  Unsubscribe,
} from "../core/HistoryTypes";
import { cloneSnapshot, isJsonValue } from "../utils/immutableJson";

type Coordinate = readonly [number, number] | readonly [number, number, number];
type LatLngTree = Coordinate | readonly LatLngTree[];
type PolylineOptionsSnapshot = { readonly [key: string]: JsonValue };
type LatLngExpressionTree = L.LatLngExpression | LatLngExpressionTree[];

export interface LeafletShapeLayer extends L.Layer {
  getLatLngs(): L.LatLng[] | L.LatLng[][] | L.LatLng[][][];
  setLatLngs(
    latlngs:
      L.LatLngExpression[] | L.LatLngExpression[][] | L.LatLngExpression[][][],
  ): this;
  setStyle(style: L.PathOptions): this;
  options: L.PolylineOptions;
}

export interface LeafletLayerSnapshot extends LayerSnapshot {
  readonly kind: "polyline" | "polygon";
  readonly latlngs: readonly LatLngTree[];
  readonly options: PolylineOptionsSnapshot;
}

export interface PolylineHistoryOptions {
  readonly maxHistory?: number;
  readonly enableUndo?: boolean;
  readonly enableRedo?: boolean;
  readonly trackPolylines?: boolean;
  readonly trackPolygons?: boolean;
  readonly getLayerId?: (layer: LeafletShapeLayer) => string;
}

const OPTION_KEYS = [
  "stroke",
  "color",
  "weight",
  "opacity",
  "lineCap",
  "lineJoin",
  "dashArray",
  "dashOffset",
  "fill",
  "fillColor",
  "fillOpacity",
  "fillRule",
  "bubblingMouseEvents",
  "className",
  "interactive",
  "pane",
  "attribution",
  "smoothFactor",
  "noClip",
] as const satisfies readonly (keyof L.PolylineOptions)[];
const BOOLEAN_OPTIONS = new Set([
  "stroke",
  "fill",
  "bubblingMouseEvents",
  "interactive",
  "noClip",
]);
const NUMBER_OPTIONS = new Set([
  "weight",
  "opacity",
  "fillOpacity",
  "smoothFactor",
]);
const STRING_OPTIONS = new Set([
  "color",
  "lineCap",
  "lineJoin",
  "dashOffset",
  "fillColor",
  "fillRule",
  "className",
  "pane",
  "attribution",
]);
const NULLABLE_OPTIONS = new Set([
  "dashArray",
  "dashOffset",
  "fillColor",
  "attribution",
]);

type LeafletLatLngNode = L.LatLng | readonly LeafletLatLngNode[];

function isLatLng(value: LeafletLatLngNode): value is L.LatLng {
  return !Array.isArray(value);
}

function serializeLatLngs(
  latlngs: readonly LeafletLatLngNode[],
): readonly LatLngTree[] {
  return latlngs.map((latlng) => {
    if (!isLatLng(latlng)) {
      return serializeLatLngs(latlng);
    }

    return latlng.alt === undefined
      ? [latlng.lat, latlng.lng]
      : [latlng.lat, latlng.lng, latlng.alt];
  });
}

function isCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    (value.length === 2 || value.length === 3) &&
    value.every(
      (coordinate) =>
        typeof coordinate === "number" && Number.isFinite(coordinate),
    )
  );
}

function isLatLngs(
  value: unknown,
  maxDepth: number,
  depth = 0,
): value is readonly LatLngTree[] {
  if (!Array.isArray(value)) {
    return false;
  }
  if (value.length === 0 || value.every(isCoordinate)) {
    return true;
  }
  if (depth >= maxDepth || value.some(isCoordinate)) {
    return false;
  }
  return value.every((child) => isLatLngs(child, maxDepth, depth + 1));
}

function isValidOptions(value: LayerSnapshot["options"]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  for (const [key, option] of Object.entries(value)) {
    if (!OPTION_KEYS.some((optionKey) => optionKey === key)) {
      return false;
    }
    if (option === null && NULLABLE_OPTIONS.has(key)) {
      continue;
    }
    if (BOOLEAN_OPTIONS.has(key) && typeof option !== "boolean") {
      return false;
    }
    if (
      NUMBER_OPTIONS.has(key) &&
      (typeof option !== "number" || !Number.isFinite(option))
    ) {
      return false;
    }
    if (STRING_OPTIONS.has(key) && typeof option !== "string") {
      return false;
    }
    if (
      key === "dashArray" &&
      typeof option !== "string" &&
      !(
        Array.isArray(option) &&
        option.every(
          (item) => typeof item === "number" && Number.isFinite(item),
        )
      )
    ) {
      return false;
    }
  }
  return true;
}

function parseLayerSnapshot(value: LayerSnapshot): LeafletLayerSnapshot {
  const maxDepth = value.kind === "polygon" ? 2 : 1;
  if (
    (value.kind !== "polyline" && value.kind !== "polygon") ||
    !isLatLngs(value.latlngs, maxDepth) ||
    !isValidOptions(value.options)
  ) {
    throw new TypeError("Invalid Leaflet layer snapshot.");
  }

  return value as LeafletLayerSnapshot;
}

function toPolylineOptions(
  optionsSnapshot: PolylineOptionsSnapshot,
): L.PolylineOptions {
  const options: L.PolylineOptions = {};
  for (const key of OPTION_KEYS) {
    const value = optionsSnapshot[key];
    if (value !== undefined) {
      Object.assign(options, { [key]: value });
    }
  }
  return options;
}

function isPolygon(layer: LeafletShapeLayer): boolean {
  return layer instanceof L.Polygon;
}

export function isLeafletShapeLayer(
  layer: L.Layer,
): layer is LeafletShapeLayer {
  return layer instanceof L.Polyline;
}

function toLatLngExpressionTree(value: LatLngTree): LatLngExpressionTree {
  if (isCoordinate(value)) {
    return value.length === 2
      ? [value[0], value[1]]
      : [value[0], value[1], value[2]];
  }
  return value.map(toLatLngExpressionTree);
}

function toLatLngExpressions(
  latlngs: readonly LatLngTree[],
): LatLngExpressionTree[] {
  return latlngs.map(toLatLngExpressionTree);
}

export class LeafletAdapter {
  private readonly history: HistoryManager<LeafletLayerSnapshot>;
  private readonly layerIds = new WeakMap<LeafletShapeLayer, string>();
  private readonly layersById = new Map<string, LeafletShapeLayer>();
  private readonly lastSnapshots = new Map<string, LeafletLayerSnapshot>();
  private readonly trackPolylines: boolean;
  private readonly trackPolygons: boolean;
  private readonly getLayerId:
    ((layer: LeafletShapeLayer) => string) | undefined;
  private suppressionDepth = 0;
  private destroyed = false;

  constructor(
    private readonly map: L.Map,
    options: PolylineHistoryOptions = {},
  ) {
    this.trackPolylines = options.trackPolylines ?? true;
    this.trackPolygons = options.trackPolygons ?? true;
    this.getLayerId = options.getLayerId;
    this.history = new HistoryManager<LeafletLayerSnapshot>({
      applySnapshot: (layerId, snapshot) =>
        this.applySnapshot(layerId, snapshot),
      maxHistory: options.maxHistory,
      enableUndo: options.enableUndo,
      enableRedo: options.enableRedo,
    });

    this.map.eachLayer((layer) => {
      if (this.isTracked(layer)) {
        this.registerInitialLayer(layer);
      }
    });
    this.map.on("layeradd", this.handleLayerAdd);
    this.map.on("layerremove", this.handleLayerRemove);
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  getStatus(): HistoryStatus {
    return this.history.getStatus();
  }

  undo(): boolean {
    return this.history.undo();
  }

  redo(): boolean {
    return this.history.redo();
  }

  clear(): void {
    this.history.clear();
  }

  checkpoint(layer: LeafletShapeLayer): boolean {
    this.ensureActive();
    if (!this.isTracked(layer)) {
      return false;
    }
    if (!this.map.hasLayer(layer)) {
      throw new TypeError(
        "checkpoint requires a tracked polyline on this map.",
      );
    }

    const layerId = this.getOrCreateLayerId(layer);
    const previous = this.lastSnapshots.get(layerId);
    const current = this.capture(layer);
    if (previous === undefined) {
      this.lastSnapshots.set(layerId, current);
      return false;
    }

    this.lastSnapshots.set(layerId, current);
    return this.history.record(layerId, previous, current);
  }

  exportHistory(): HistoryDocument<LeafletLayerSnapshot> {
    return this.history.exportHistory();
  }

  importHistory(document: unknown): void {
    this.history.importHistory(document);
  }

  on<K extends keyof HistoryEvents<LeafletLayerSnapshot>>(
    event: K,
    listener: HistoryEvents<LeafletLayerSnapshot>[K],
  ): Unsubscribe {
    return this.history.on(event, listener);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.map.off("layeradd", this.handleLayerAdd);
    this.map.off("layerremove", this.handleLayerRemove);
    this.history.destroy();
    this.lastSnapshots.clear();
    this.layersById.clear();
    this.destroyed = true;
  }

  private readonly handleLayerAdd = (event: L.LayerEvent): void => {
    if (this.suppressionDepth > 0 || !this.isTracked(event.layer)) {
      return;
    }

    const layerId = this.getOrCreateLayerId(event.layer);
    const before = this.lastSnapshots.get(layerId) ?? null;
    const after = this.capture(event.layer);
    this.lastSnapshots.set(layerId, after);
    this.history.record(layerId, before, after);
  };

  private readonly handleLayerRemove = (event: L.LayerEvent): void => {
    if (this.suppressionDepth > 0 || !this.isTracked(event.layer)) {
      return;
    }

    const layerId = this.getOrCreateLayerId(event.layer);
    const before = this.lastSnapshots.get(layerId) ?? this.capture(event.layer);
    this.lastSnapshots.delete(layerId);
    this.history.record(layerId, before, null);
  };

  private isTracked(layer: L.Layer): layer is LeafletShapeLayer {
    return (
      layer instanceof L.Polyline &&
      (isPolygon(layer) ? this.trackPolygons : this.trackPolylines)
    );
  }

  private registerInitialLayer(layer: LeafletShapeLayer): void {
    const layerId = this.getOrCreateLayerId(layer);
    this.lastSnapshots.set(layerId, this.capture(layer));
  }

  private getOrCreateLayerId(layer: LeafletShapeLayer): string {
    const existingId = this.layerIds.get(layer);
    if (existingId !== undefined) {
      return existingId;
    }

    const layerId = this.getLayerId?.(layer) ?? `leaflet-${L.stamp(layer)}`;
    if (layerId.trim().length === 0) {
      throw new TypeError("getLayerId must return a non-empty string.");
    }
    const existingLayer = this.layersById.get(layerId);
    if (existingLayer !== undefined && existingLayer !== layer) {
      throw new Error(`Duplicate Leaflet history layer id: ${layerId}`);
    }

    this.layerIds.set(layer, layerId);
    this.layersById.set(layerId, layer);
    return layerId;
  }

  private capture(layer: LeafletShapeLayer): LeafletLayerSnapshot {
    const latlngs = serializeLatLngs(
      layer.getLatLngs() as readonly LeafletLatLngNode[],
    );
    const options: Record<string, JsonValue> = {};
    for (const key of OPTION_KEYS) {
      const value: unknown = layer.options[key];
      if (isJsonValue(value)) {
        options[key] = value;
      }
    }

    return parseLayerSnapshot(
      cloneSnapshot({
        kind: isPolygon(layer) ? "polygon" : "polyline",
        latlngs,
        options,
      }),
    );
  }

  private applySnapshot(
    layerId: string,
    rawSnapshot: LeafletLayerSnapshot | null,
  ): void {
    this.suppressionDepth += 1;
    try {
      if (rawSnapshot === null) {
        const layer = this.layersById.get(layerId);
        if (layer !== undefined && this.map.hasLayer(layer)) {
          this.map.removeLayer(layer);
        }
        this.lastSnapshots.delete(layerId);
        return;
      }

      const snapshot = parseLayerSnapshot(rawSnapshot);
      const options = toPolylineOptions(snapshot.options);
      const latlngs = toLatLngExpressions(snapshot.latlngs);
      let layer: LeafletShapeLayer | undefined = this.layersById.get(layerId);

      if (layer === undefined) {
        if (snapshot.kind === "polygon") {
          layer = new L.Polygon(
            latlngs as
              | L.LatLngExpression[]
              | L.LatLngExpression[][]
              | L.LatLngExpression[][][],
            options,
          );
        } else {
          layer = new L.Polyline(
            latlngs as L.LatLngExpression[] | L.LatLngExpression[][],
            options,
          );
        }
        this.layerIds.set(layer, layerId);
        this.layersById.set(layerId, layer);
      } else {
        if ((isPolygon(layer) ? "polygon" : "polyline") !== snapshot.kind) {
          throw new TypeError(
            "History snapshot shape type does not match its layer.",
          );
        }
        layer.setLatLngs(
          latlngs as
            | L.LatLngExpression[]
            | L.LatLngExpression[][]
            | L.LatLngExpression[][][],
        );
        layer.setStyle(options);
        layer.options.smoothFactor = options.smoothFactor;
        layer.options.noClip = options.noClip;
      }

      this.lastSnapshots.set(layerId, snapshot);
      if (!this.map.hasLayer(layer)) {
        this.map.addLayer(layer);
      }
    } finally {
      this.suppressionDepth -= 1;
    }
  }

  private ensureActive(): void {
    if (this.destroyed) {
      throw new Error("LeafletAdapter has been destroyed.");
    }
  }
}

export function createPolylineHistory(
  map: L.Map,
  options?: PolylineHistoryOptions,
): LeafletAdapter {
  return new LeafletAdapter(map, options);
}
