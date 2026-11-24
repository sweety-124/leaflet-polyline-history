import type { JsonValue, LayerSnapshot } from "../core/HistoryTypes";

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isJsonValue(
  value: unknown,
  ancestors: Set<object> = new Set(),
): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "object" || ancestors.has(value)) {
    return false;
  }

  ancestors.add(value);
  let valid: boolean;

  if (Array.isArray(value)) {
    valid = value.every((item) => isJsonValue(item, ancestors));
  } else if (isPlainObject(value)) {
    valid = Reflect.ownKeys(value).every(
      (key) => typeof key === "string" && isJsonValue(value[key], ancestors),
    );
  } else {
    valid = false;
  }

  ancestors.delete(value);
  return valid;
}

function deepFreeze(value: JsonValue): JsonValue {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function isJsonObjectValue(
  value: JsonValue,
): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isLayerSnapshot(value: unknown): value is LayerSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    isPlainObject(value) &&
    isJsonValue(value)
  );
}

function equalJsonValue(left: JsonValue, right: JsonValue): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null || typeof left !== typeof right) {
    return false;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => equalJsonValue(value, right[index]))
    );
  }
  if (isJsonObjectValue(left) && isJsonObjectValue(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.hasOwn(right, key) && equalJsonValue(left[key], right[key]),
      )
    );
  }
  return false;
}

export function snapshotsEqual(
  left: LayerSnapshot,
  right: LayerSnapshot,
): boolean {
  return equalJsonValue(left, right);
}

export function cloneSnapshot<TSnapshot extends LayerSnapshot>(
  snapshot: TSnapshot,
): TSnapshot {
  if (!isLayerSnapshot(snapshot)) {
    throw new TypeError("History snapshots must be plain JSON objects.");
  }

  const serialized = JSON.stringify(snapshot);
  if (serialized === undefined) {
    throw new TypeError("History snapshot could not be serialized.");
  }

  const clone: unknown = JSON.parse(serialized);
  if (!isLayerSnapshot(clone)) {
    throw new TypeError("History snapshot could not be cloned.");
  }

  return deepFreeze(clone) as TSnapshot;
}
