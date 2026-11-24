package link:https://www.npmjs.com/package/leaflet-polyline-history

# leaflet-polyline-history

Framework-independent undo/redo history for Leaflet polylines and polygons.
Track layer additions, removals, and geometry edits without coupling your map
code to React or a drawing plugin.

## Features

- Undo and redo additions, removals, and polyline/polygon edits.
- Track layers independently, including shapes inside Leaflet layer groups.
- Bounded history, redo-stack invalidation, and explicit history clearing.
- Versioned JSON history export and validated import.
- Typed history-change, undo, and redo events.
- Optional Leaflet.Draw, Leaflet-Geoman, and React integrations.
- ESM, CommonJS, TypeScript declarations, and source maps.

## Installation

```sh
npm install leaflet-polyline-history leaflet
```

For TypeScript, install Leaflet's community type definitions if your app does
not already have them. The type package is also declared as a peer dependency:

```sh
npm install -D @types/leaflet
```

React is optional and is only needed when using the `./react` entry point:

```sh
npm install react
```

## Quick start

```ts
import * as L from "leaflet";
import { createPolylineHistory } from "leaflet-polyline-history";

const map = L.map("map").setView([51.505, -0.09], 13);
const history = createPolylineHistory(map, {
  maxHistory: 50,
  enableUndo: true,
  enableRedo: true,
  trackPolylines: true,
  trackPolygons: true,
});

const line = L.polyline(
  [
    [51.505, -0.09],
    [51.51, -0.1],
  ],
  { color: "blue" },
).addTo(map);
const undoButton = document.querySelector<HTMLButtonElement>("#undo");
const redoButton = document.querySelector<HTMLButtonElement>("#redo");

history.undo();
history.redo();
history.canUndo();
history.canRedo();

history.on("historyChange", (status) => {
  if (undoButton !== null) undoButton.disabled = !status.canUndo;
  if (redoButton !== null) redoButton.disabled = !status.canRedo;
});

// Required for geometry edits made directly by application code.
line.setLatLngs([
  [51.51, -0.1],
  [51.515, -0.085],
]);
history.checkpoint(line);

const savedHistory = history.exportHistory();
history.importHistory(savedHistory);

history.clear();
history.destroy();
```

Adding and removing eligible layers from the map is captured automatically.
Leaflet has no universal geometry-edit event, so call `checkpoint(layer)` after
editing coordinates in application code, or attach a drawing-plugin adapter.

## API

### `createPolylineHistory(map, options?)`

Creates a history controller and starts tracking eligible layers already on the
map as the initial baseline. Those existing layers are not recorded as new
additions.

| Option           | Type                | Default    | Description                                                                                                         |
| ---------------- | ------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `maxHistory`     | `number`            | `100`      | Maximum undo and redo entries retained. Must be a positive integer.                                                 |
| `enableUndo`     | `boolean`           | `true`     | Enables `undo()` and `canUndo()`.                                                                                   |
| `enableRedo`     | `boolean`           | `true`     | Enables `redo()` and `canRedo()`.                                                                                   |
| `trackPolylines` | `boolean`           | `true`     | Tracks `L.Polyline` layers.                                                                                         |
| `trackPolygons`  | `boolean`           | `true`     | Tracks `L.Polygon` layers.                                                                                          |
| `getLayerId`     | `(layer) => string` | Leaflet ID | Supplies an application-stable ID, useful when importing history in a later session. IDs must be unique on the map. |

### Controller methods

- `undo(): boolean` / `redo(): boolean` — restore one change; return `false`
  when the stack is empty or that operation is disabled.
- `canUndo(): boolean` / `canRedo(): boolean` — report whether an operation is
  currently available.
- `getStatus(): HistoryStatus` — return availability and stack counts.
- `checkpoint(layer): boolean` — snapshot a tracked layer after a geometry or
  style edit. Returns `false` when the state did not change.
- `clear(): void` — empty both stacks without changing the map.
- `exportHistory()` — return a versioned, JSON-serializable history document.
- `importHistory(document): void` — validate and replace history; malformed
  documents throw without replacing the current stacks.
- `on(event, listener): unsubscribe` — subscribe to `historyChange`, `undo`,
  or `redo`.
- `destroy(): void` — detach map listeners and release retained layer
  references. Calling it more than once is safe.

`historyChange` listeners receive a `HistoryStatus`; `undo` and `redo` listeners
receive the affected immutable `HistoryEntry`.

### Add/remove records

History entries represent a transition from `before` to `after`; `null` means a
shape is absent. Adding a layer records `null → snapshot`; removing it records
`snapshot → null`. Recording a new change after undo discards the redo stack.
Failed layer restoration leaves the entry on its original stack.

History snapshots contain geometry and supported JSON-compatible Leaflet path
options. They are cloned and frozen internally, so mutating an input object
cannot change old history states.

## Leaflet.Draw integration

Install and initialize [Leaflet.Draw](https://github.com/Leaflet/Leaflet.draw)
and, for TypeScript, its type definitions separately. The adapter listens for
completed edit events; layer additions and removals are already observed by
the standard adapter.

```ts
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import {
  attachLeafletDrawHistory,
  createPolylineHistory,
} from "leaflet-polyline-history";

const history = createPolylineHistory(map);
const drawHistory = attachLeafletDrawHistory(map, history);
const editableLayers = L.featureGroup().addTo(map);
map.addControl(new L.Control.Draw({ edit: { featureGroup: editableLayers } }));

// Configure Leaflet.Draw controls and its editable FeatureGroup as usual.
// On teardown:
drawHistory.destroy();
history.destroy();
```

## Leaflet-Geoman integration

Install and initialize
[Leaflet-Geoman](https://github.com/geoman-io/leaflet-geoman) separately. The
adapter checkpoints `pm:update` and `pm:dragend` events. Include Geoman's CSS
as shown by its installation guide.

```ts
import {
  attachLeafletGeomanHistory,
  createPolylineHistory,
} from "leaflet-polyline-history";

const history = createPolylineHistory(map);
const geomanHistory = attachLeafletGeomanHistory(map, history);
map.pm.addControls();

// On teardown:
geomanHistory.destroy();
history.destroy();
```

## React Leaflet

React is an optional peer dependency. The hook accepts a Leaflet map (for
example, from React Leaflet's `useMap`) and returns booleans for button states.
It creates and destroys the adapter as the map reference changes.

```tsx
import { useMap } from "react-leaflet";
import { usePolylineHistory } from "leaflet-polyline-history/react";

function HistoryButtons() {
  const map = useMap();
  const { undo, redo, canUndo, canRedo, clearHistory } =
    usePolylineHistory(map);

  return (
    <>
      <button onClick={undo} disabled={!canUndo}>
        Undo
      </button>
      <button onClick={redo} disabled={!canRedo}>
        Redo
      </button>
      <button onClick={clearHistory}>Clear</button>
    </>
  );
}
```

For programmatic geometry edits in React, call the returned `checkpoint(layer)`
after applying the change.

## Examples

The runnable vanilla and React Leaflet demos are in [`examples/`](./examples/).
From the project root:

```sh
npm install
npm run build
npm run demo:vanilla
# or, in another terminal
npm run demo:react
```

The demos load OpenStreetMap tiles and need an internet connection.

## TypeScript

The package ships declaration files for the core and React entry points.
Snapshots use readonly JSON-compatible data:

```ts
import type {
  HistoryDocument,
  LeafletLayerSnapshot,
  PolylineHistoryOptions,
} from "leaflet-polyline-history";

const options: PolylineHistoryOptions = { maxHistory: 25 };
type SavedHistory = HistoryDocument<LeafletLayerSnapshot>;
```

## Limitations

- Geometry changes made outside Leaflet.Draw or Leaflet-Geoman must be followed
  by `checkpoint(layer)`.
- Snapshots preserve coordinates and supported JSON path options. Custom
  functions, renderers, event handlers, and non-JSON options are not serialized.
- Layers within groups are tracked as individual shapes; changing group
  membership is not represented as one atomic history operation.
- The default layer ID is Leaflet's runtime ID. Use `getLayerId` with a stable
  application ID when importing history across page reloads.
- `importHistory` restores the history stacks, not the current map state.
  Ensure the corresponding layers/IDs are present, or use undo/redo to restore
  snapshots from absent-layer entries.
- Only `L.Polyline` and `L.Polygon` are tracked.

## Development and contribution

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

Contributions should include focused tests for behavior changes, pass all
validation commands, and avoid adding required runtime dependencies without a
clear need. Open an issue before making large API or architecture changes.

## Manual publishing

The repository does not publish automatically. After reviewing the changelog,
running CI, and verifying package contents:

```sh
npm pack --dry-run
npm login
npm publish --access public
```

Only package files under `dist/` plus the README, license, and changelog are
included in the published tarball.

## License

MIT. See [LICENSE](./LICENSE).
