import { useCallback, useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import {
  createPolylineHistory,
  type LeafletAdapter,
  type LeafletShapeLayer,
  type PolylineHistoryOptions,
} from "../adapters/LeafletAdapter";
import type { HistoryStatus } from "../core/HistoryTypes";

export interface UsePolylineHistoryResult {
  readonly undo: () => boolean;
  readonly redo: () => boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly clearHistory: () => void;
  readonly checkpoint: (layer: LeafletShapeLayer) => boolean;
}

const EMPTY_STATUS: HistoryStatus = {
  canUndo: false,
  canRedo: false,
  undoCount: 0,
  redoCount: 0,
};

export function usePolylineHistory(
  map: L.Map | null | undefined,
  options: PolylineHistoryOptions = {},
): UsePolylineHistoryResult {
  const historyRef = useRef<LeafletAdapter | null>(null);
  const [status, setStatus] = useState<HistoryStatus>(EMPTY_STATUS);
  const getLayerIdRef = useRef(options.getLayerId);
  getLayerIdRef.current = options.getLayerId;

  const maxHistory = options.maxHistory;
  const enableUndo = options.enableUndo;
  const enableRedo = options.enableRedo;
  const trackPolylines = options.trackPolylines;
  const trackPolygons = options.trackPolygons;
  const getLayerId = useCallback((layer: LeafletShapeLayer) => {
    const resolveId = getLayerIdRef.current;
    return resolveId === undefined
      ? `leaflet-${L.stamp(layer)}`
      : resolveId(layer);
  }, []);

  useEffect(() => {
    if (map === null || map === undefined) {
      historyRef.current = null;
      setStatus(EMPTY_STATUS);
      return;
    }

    const history = createPolylineHistory(map, {
      maxHistory,
      enableUndo,
      enableRedo,
      trackPolylines,
      trackPolygons,
      getLayerId,
    });
    historyRef.current = history;
    const unsubscribe = history.on("historyChange", (nextStatus) => {
      setStatus((current) =>
        current.canUndo === nextStatus.canUndo &&
        current.canRedo === nextStatus.canRedo &&
        current.undoCount === nextStatus.undoCount &&
        current.redoCount === nextStatus.redoCount
          ? current
          : nextStatus,
      );
    });
    setStatus(history.getStatus());

    return () => {
      unsubscribe();
      if (historyRef.current === history) {
        historyRef.current = null;
      }
      history.destroy();
    };
  }, [
    map,
    maxHistory,
    enableUndo,
    enableRedo,
    trackPolylines,
    trackPolygons,
    getLayerId,
  ]);

  const undo = useCallback(() => historyRef.current?.undo() ?? false, []);
  const redo = useCallback(() => historyRef.current?.redo() ?? false, []);
  const clearHistory = useCallback(() => {
    historyRef.current?.clear();
  }, []);
  const checkpoint = useCallback(
    (layer: LeafletShapeLayer) =>
      historyRef.current?.checkpoint(layer) ?? false,
    [],
  );

  return {
    undo,
    redo,
    canUndo: status.canUndo,
    canRedo: status.canRedo,
    clearHistory,
    checkpoint,
  };
}
