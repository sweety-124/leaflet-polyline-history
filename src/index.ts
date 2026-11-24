export { HistoryManager } from "./core/HistoryManager";
export { HistoryStack } from "./core/HistoryStack";
export {
  LeafletAdapter,
  createPolylineHistory,
  isLeafletShapeLayer,
} from "./adapters/LeafletAdapter";
export {
  LeafletDrawAdapter,
  attachLeafletDrawHistory,
} from "./adapters/LeafletDrawAdapter";
export {
  LeafletGeomanAdapter,
  attachLeafletGeomanHistory,
} from "./adapters/LeafletGeomanAdapter";
export type {
  HistoryDocument,
  HistoryEntry,
  HistoryEvents,
  HistoryManagerOptions,
  HistoryStatus,
  JsonPrimitive,
  JsonValue,
  LayerSnapshot,
  Unsubscribe,
} from "./core/HistoryTypes";
export type {
  LeafletLayerSnapshot,
  LeafletShapeLayer,
  PolylineHistoryOptions,
} from "./adapters/LeafletAdapter";
