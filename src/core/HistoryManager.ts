import { HistoryStack } from "./HistoryStack";
import type {
  HistoryDocument,
  HistoryEntry,
  HistoryEvents,
  HistoryManagerOptions,
  HistoryStatus,
  LayerSnapshot,
  Unsubscribe,
} from "./HistoryTypes";
import {
  cloneSnapshot,
  isLayerSnapshot,
  snapshotsEqual,
} from "../utils/immutableJson";

const DEFAULT_MAX_HISTORY = 100;

export class HistoryManager<TSnapshot extends LayerSnapshot> {
  private readonly stack: HistoryStack<HistoryEntry<TSnapshot>>;
  private readonly applySnapshot: HistoryManagerOptions<TSnapshot>["applySnapshot"];
  private readonly enableUndo: boolean;
  private readonly enableRedo: boolean;
  private readonly stackLimit: number;
  private destroyed = false;

  private readonly listeners = {
    historyChange: new Set<HistoryEvents<TSnapshot>["historyChange"]>(),
    undo: new Set<HistoryEvents<TSnapshot>["undo"]>(),
    redo: new Set<HistoryEvents<TSnapshot>["redo"]>(),
  };

  constructor(options: HistoryManagerOptions<TSnapshot>) {
    const maxHistory = options.maxHistory ?? DEFAULT_MAX_HISTORY;
    if (!Number.isInteger(maxHistory) || maxHistory < 1) {
      throw new RangeError("maxHistory must be a positive integer.");
    }

    this.stack = new HistoryStack(maxHistory);
    this.stackLimit = maxHistory;
    this.applySnapshot = options.applySnapshot;
    this.enableUndo = options.enableUndo ?? true;
    this.enableRedo = options.enableRedo ?? true;
  }

  canUndo(): boolean {
    return !this.destroyed && this.enableUndo && this.stack.canUndo;
  }

  canRedo(): boolean {
    return !this.destroyed && this.enableRedo && this.stack.canRedo;
  }

  getStatus(): HistoryStatus {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoCount: this.destroyed ? 0 : this.stack.undoCount,
      redoCount: this.destroyed ? 0 : this.stack.redoCount,
    };
  }

  record(
    layerId: string,
    before: TSnapshot | null,
    after: TSnapshot | null,
  ): boolean {
    this.ensureActive();
    if (layerId.trim().length === 0) {
      throw new TypeError("layerId must be a non-empty string.");
    }
    if (before === null && after === null) {
      throw new TypeError(
        "A history entry must contain a before or after snapshot.",
      );
    }

    const immutableBefore = before === null ? null : cloneSnapshot(before);
    const immutableAfter = after === null ? null : cloneSnapshot(after);
    if (
      immutableBefore !== null &&
      immutableAfter !== null &&
      snapshotsEqual(immutableBefore, immutableAfter)
    ) {
      return false;
    }

    this.stack.record(
      Object.freeze({
        layerId,
        before: immutableBefore,
        after: immutableAfter,
      }),
    );
    this.emitHistoryChange();
    return true;
  }

  undo(): boolean {
    this.ensureActive();
    if (!this.enableUndo) {
      return false;
    }

    const entry = this.stack.peekUndo();
    if (entry === undefined) {
      return false;
    }

    this.applySnapshot(
      entry.layerId,
      entry.before === null ? null : cloneSnapshot(entry.before),
    );
    this.stack.moveUndoToRedo();
    this.emit("undo", entry);
    this.emitHistoryChange();
    return true;
  }

  redo(): boolean {
    this.ensureActive();
    if (!this.enableRedo) {
      return false;
    }

    const entry = this.stack.peekRedo();
    if (entry === undefined) {
      return false;
    }

    this.applySnapshot(
      entry.layerId,
      entry.after === null ? null : cloneSnapshot(entry.after),
    );
    this.stack.moveRedoToUndo();
    this.emit("redo", entry);
    this.emitHistoryChange();
    return true;
  }

  clear(): void {
    this.ensureActive();
    if (this.stack.clear()) {
      this.emitHistoryChange();
    }
  }

  exportHistory(): HistoryDocument<TSnapshot> {
    this.ensureActive();
    const undo: HistoryEntry<TSnapshot>[] = [];
    const redo: HistoryEntry<TSnapshot>[] = [];
    const exported = {
      undo: this.stack.getUndoEntries(),
      redo: this.stack.getRedoEntries(),
    };
    for (const entry of exported.undo) {
      undo.push(this.cloneEntry(entry));
    }
    for (const entry of exported.redo) {
      redo.push(this.cloneEntry(entry));
    }

    return {
      version: 1,
      maxHistory: this.stackLimit,
      undo,
      redo,
    };
  }

  importHistory(document: unknown): void {
    this.ensureActive();
    const parsed = this.parseDocument(document);
    this.stack.replace(parsed.undo, parsed.redo);
    this.emitHistoryChange();
  }

  on<K extends keyof HistoryEvents<TSnapshot>>(
    event: K,
    listener: HistoryEvents<TSnapshot>[K],
  ): Unsubscribe {
    this.ensureActive();
    if (event === "historyChange") {
      this.listeners.historyChange.add(
        listener as HistoryEvents<TSnapshot>["historyChange"],
      );
      return () =>
        this.listeners.historyChange.delete(
          listener as HistoryEvents<TSnapshot>["historyChange"],
        );
    }
    if (event === "undo") {
      this.listeners.undo.add(listener as HistoryEvents<TSnapshot>["undo"]);
      return () =>
        this.listeners.undo.delete(
          listener as HistoryEvents<TSnapshot>["undo"],
        );
    }

    this.listeners.redo.add(listener as HistoryEvents<TSnapshot>["redo"]);
    return () =>
      this.listeners.redo.delete(listener as HistoryEvents<TSnapshot>["redo"]);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.stack.clear();
    this.listeners.historyChange.clear();
    this.listeners.undo.clear();
    this.listeners.redo.clear();
    this.destroyed = true;
  }

  private cloneEntry(entry: HistoryEntry<TSnapshot>): HistoryEntry<TSnapshot> {
    return {
      layerId: entry.layerId,
      before: entry.before === null ? null : cloneSnapshot(entry.before),
      after: entry.after === null ? null : cloneSnapshot(entry.after),
    };
  }

  private parseDocument(value: unknown): HistoryDocument<TSnapshot> {
    if (
      typeof value !== "object" ||
      value === null ||
      !("version" in value) ||
      !("maxHistory" in value) ||
      !("undo" in value) ||
      !("redo" in value)
    ) {
      throw new TypeError("Invalid history document.");
    }

    const candidate = value as Record<string, unknown>;
    if (
      candidate.version !== 1 ||
      !Number.isInteger(candidate.maxHistory) ||
      (candidate.maxHistory as number) < 1 ||
      !Array.isArray(candidate.undo) ||
      !Array.isArray(candidate.redo)
    ) {
      throw new TypeError("Invalid history document.");
    }

    const undo = candidate.undo.map((entry) => this.parseEntry(entry));
    const redo = candidate.redo.map((entry) => this.parseEntry(entry));
    if (
      undo.length > (candidate.maxHistory as number) ||
      redo.length > (candidate.maxHistory as number)
    ) {
      throw new TypeError("History document exceeds its declared limit.");
    }

    return {
      version: 1,
      maxHistory: candidate.maxHistory as number,
      undo,
      redo,
    };
  }

  private parseEntry(value: unknown): HistoryEntry<TSnapshot> {
    if (
      typeof value !== "object" ||
      value === null ||
      !("layerId" in value) ||
      !("before" in value) ||
      !("after" in value)
    ) {
      throw new TypeError("Invalid history entry.");
    }

    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.layerId !== "string" ||
      candidate.layerId.trim().length === 0
    ) {
      throw new TypeError("History entry layerId must be a non-empty string.");
    }
    const before = this.parseSnapshot(candidate.before);
    const after = this.parseSnapshot(candidate.after);
    if (before === null && after === null) {
      throw new TypeError(
        "A history entry must contain a before or after snapshot.",
      );
    }

    return Object.freeze({
      layerId: candidate.layerId,
      before,
      after,
    });
  }

  private parseSnapshot(value: unknown): TSnapshot | null {
    if (value === null) {
      return null;
    }
    if (!isLayerSnapshot(value)) {
      throw new TypeError("Invalid layer snapshot in history document.");
    }
    return cloneSnapshot(value) as TSnapshot;
  }

  private emitHistoryChange(): void {
    this.emit("historyChange", this.getStatus());
  }

  private emit<K extends keyof HistoryEvents<TSnapshot>>(
    event: K,
    payload: Parameters<HistoryEvents<TSnapshot>[K]>[0],
  ): void {
    if (event === "historyChange") {
      for (const listener of this.listeners.historyChange) {
        listener(payload as HistoryStatus);
      }
    } else if (event === "undo") {
      for (const listener of this.listeners.undo) {
        listener(payload as HistoryEntry<TSnapshot>);
      }
    } else {
      for (const listener of this.listeners.redo) {
        listener(payload as HistoryEntry<TSnapshot>);
      }
    }
  }

  private ensureActive(): void {
    if (this.destroyed) {
      throw new Error("HistoryManager has been destroyed.");
    }
  }
}
