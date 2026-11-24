export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type LayerSnapshot = { readonly [key: string]: JsonValue };

export interface HistoryEntry<TSnapshot extends LayerSnapshot> {
  readonly layerId: string;
  readonly before: TSnapshot | null;
  readonly after: TSnapshot | null;
}

export interface HistoryDocument<TSnapshot extends LayerSnapshot> {
  readonly version: 1;
  readonly maxHistory: number;
  readonly undo: readonly HistoryEntry<TSnapshot>[];
  readonly redo: readonly HistoryEntry<TSnapshot>[];
}

export interface HistoryStatus {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoCount: number;
  readonly redoCount: number;
}

export interface HistoryEvents<TSnapshot extends LayerSnapshot> {
  readonly historyChange: (status: HistoryStatus) => void;
  readonly undo: (entry: HistoryEntry<TSnapshot>) => void;
  readonly redo: (entry: HistoryEntry<TSnapshot>) => void;
}

export interface HistoryManagerOptions<TSnapshot extends LayerSnapshot> {
  readonly applySnapshot: (layerId: string, snapshot: TSnapshot | null) => void;
  readonly maxHistory?: number;
  readonly enableUndo?: boolean;
  readonly enableRedo?: boolean;
}

export type Unsubscribe = () => void;
