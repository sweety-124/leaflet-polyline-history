import { describe, expect, it, vi } from "vitest";
import { HistoryManager } from "../../src/core/HistoryManager";

type Snapshot = {
  readonly geometry: readonly number[];
  readonly style: { readonly color: string };
};

const snapshot = (x: number, color = "blue"): Snapshot => ({
  geometry: [x, x + 1],
  style: { color },
});

function createManager(maxHistory = 10) {
  const applied: Array<{ layerId: string; snapshot: Snapshot | null }> = [];
  const manager = new HistoryManager<Snapshot>({
    maxHistory,
    applySnapshot: (layerId, state) => {
      applied.push({ layerId, snapshot: state });
    },
  });

  return { manager, applied };
}

describe("HistoryManager", () => {
  it("undoes and redoes changes while keeping snapshots immutable", () => {
    const { manager, applied } = createManager();
    const before = snapshot(1);
    const after = snapshot(2);

    manager.record("layer-1", before, after);
    (before.geometry as number[])[0] = 99;

    expect(manager.undo()).toBe(true);
    expect(applied[0]).toEqual({ layerId: "layer-1", snapshot: snapshot(1) });
    expect(manager.redo()).toBe(true);
    expect(applied[1]).toEqual({ layerId: "layer-1", snapshot: snapshot(2) });
    expect(manager.getStatus()).toMatchObject({
      canUndo: true,
      canRedo: false,
      undoCount: 1,
      redoCount: 0,
    });
  });

  it("supports adding and removing layers as absent-to-present transitions", () => {
    const { manager, applied } = createManager();
    manager.record("new-layer", null, snapshot(1));
    manager.undo();
    manager.redo();
    manager.record("removed-layer", snapshot(2), null);
    manager.undo();

    expect(
      applied.map(({ layerId, snapshot: state }) => [layerId, state]),
    ).toEqual([
      ["new-layer", null],
      ["new-layer", snapshot(1)],
      ["removed-layer", snapshot(2)],
    ]);
  });

  it("tracks independent layer ids and clears redo after a new change", () => {
    const { manager } = createManager();
    manager.record("first", snapshot(1), snapshot(2));
    manager.record("second", snapshot(3), snapshot(4));
    manager.undo();
    expect(manager.canRedo()).toBe(true);

    manager.record("third", snapshot(5), snapshot(6));

    expect(manager.canRedo()).toBe(false);
    expect(manager.getStatus().undoCount).toBe(2);
  });

  it("enforces the history limit and ignores no-op changes", () => {
    const { manager } = createManager(2);
    manager.record("one", snapshot(0), snapshot(1));
    manager.record("two", snapshot(1), snapshot(2));
    manager.record("three", snapshot(2), snapshot(3));

    expect(manager.getStatus().undoCount).toBe(2);
    expect(manager.record("three", snapshot(3), snapshot(3))).toBe(false);
    expect(manager.getStatus().undoCount).toBe(2);
    expect(
      manager.record(
        "same",
        { geometry: [1, 2], style: { color: "blue" } },
        { style: { color: "blue" }, geometry: [1, 2] },
      ),
    ).toBe(false);
  });

  it("exports and imports history, validating before replacing current state", () => {
    const source = createManager().manager;
    source.record("layer", snapshot(1), snapshot(2));
    source.undo();
    const serialized = JSON.parse(
      JSON.stringify(source.exportHistory()),
    ) as unknown;
    const restored = createManager().manager;

    restored.importHistory(serialized);
    expect(restored.getStatus()).toMatchObject({
      canUndo: false,
      canRedo: true,
      undoCount: 0,
      redoCount: 1,
    });
    expect(restored.redo()).toBe(true);
    expect(() => restored.importHistory({ version: 99 })).toThrow(
      "Invalid history document.",
    );
    expect(restored.canUndo()).toBe(true);
  });

  it("emits history, undo, and redo events and supports unsubscribe", () => {
    const { manager } = createManager();
    const historyChange = vi.fn();
    const undo = vi.fn();
    const redo = vi.fn();
    const unsubscribe = manager.on("historyChange", historyChange);
    manager.on("undo", undo);
    manager.on("redo", redo);

    manager.record("layer", snapshot(1), snapshot(2));
    manager.undo();
    manager.redo();
    unsubscribe();
    manager.clear();
    manager.record("layer", snapshot(2), snapshot(3));

    expect(historyChange).toHaveBeenCalledTimes(3);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it("leaves stacks unchanged when restoring a snapshot fails", () => {
    const applySnapshot = vi.fn(() => {
      throw new Error("restore failed");
    });
    const manager = new HistoryManager<Snapshot>({ applySnapshot });
    manager.record("layer", snapshot(1), snapshot(2));

    expect(() => manager.undo()).toThrow("restore failed");
    expect(manager.getStatus()).toMatchObject({
      canUndo: true,
      canRedo: false,
    });
  });

  it("handles empty history, disabled operations, and destruction", () => {
    const { manager } = createManager();
    expect(manager.undo()).toBe(false);
    expect(manager.redo()).toBe(false);

    manager.record("layer", snapshot(1), snapshot(2));
    manager.destroy();
    manager.destroy();

    expect(manager.getStatus()).toMatchObject({
      canUndo: false,
      canRedo: false,
      undoCount: 0,
      redoCount: 0,
    });
    expect(() => manager.clear()).toThrow("HistoryManager has been destroyed.");
  });

  it("retains entries when undo and redo are disabled", () => {
    const manager = new HistoryManager<Snapshot>({
      applySnapshot: vi.fn(),
      enableUndo: false,
      enableRedo: false,
    });
    manager.record("layer", snapshot(1), snapshot(2));

    expect(manager.canUndo()).toBe(false);
    expect(manager.canRedo()).toBe(false);
    expect(manager.undo()).toBe(false);
    expect(manager.getStatus().undoCount).toBe(1);
  });

  it("rejects invalid limits and non-serializable snapshots", () => {
    expect(
      () =>
        new HistoryManager<Snapshot>({ maxHistory: 0, applySnapshot: vi.fn() }),
    ).toThrow("maxHistory must be a positive integer.");

    const { manager } = createManager();
    expect(() =>
      manager.record("layer", snapshot(1), {
        ...snapshot(2),
        extra: undefined,
      } as unknown as Snapshot),
    ).toThrow("History snapshots must be plain JSON objects.");
  });
});
