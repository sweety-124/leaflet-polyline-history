export class HistoryStack<T> {
  private undoEntries: T[] = [];
  private redoEntries: T[] = [];
  private readonly maxHistory: number;

  constructor(maxHistory: number) {
    if (!Number.isInteger(maxHistory) || maxHistory < 1) {
      throw new RangeError("maxHistory must be a positive integer.");
    }
    this.maxHistory = maxHistory;
  }

  get undoCount(): number {
    return this.undoEntries.length;
  }

  get redoCount(): number {
    return this.redoEntries.length;
  }

  get canUndo(): boolean {
    return this.undoEntries.length > 0;
  }

  get canRedo(): boolean {
    return this.redoEntries.length > 0;
  }

  getUndoEntries(): readonly T[] {
    return [...this.undoEntries];
  }

  getRedoEntries(): readonly T[] {
    return [...this.redoEntries];
  }

  peekUndo(): T | undefined {
    return this.undoEntries.at(-1);
  }

  peekRedo(): T | undefined {
    return this.redoEntries.at(-1);
  }

  record(entry: T): void {
    this.undoEntries.push(entry);
    if (this.undoEntries.length > this.maxHistory) {
      this.undoEntries.shift();
    }
    this.redoEntries = [];
  }

  moveUndoToRedo(): void {
    const entry = this.undoEntries.pop();
    if (entry !== undefined) {
      this.redoEntries.push(entry);
    }
  }

  moveRedoToUndo(): void {
    const entry = this.redoEntries.pop();
    if (entry !== undefined) {
      this.undoEntries.push(entry);
      if (this.undoEntries.length > this.maxHistory) {
        this.undoEntries.shift();
      }
    }
  }

  replace(undoEntries: readonly T[], redoEntries: readonly T[]): void {
    this.undoEntries = undoEntries.slice(-this.maxHistory);
    this.redoEntries = redoEntries.slice(-this.maxHistory);
  }

  clear(): boolean {
    const hadEntries =
      this.undoEntries.length > 0 || this.redoEntries.length > 0;
    this.undoEntries = [];
    this.redoEntries = [];
    return hadEntries;
  }
}
