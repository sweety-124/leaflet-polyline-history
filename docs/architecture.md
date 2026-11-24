# Architecture and behavior

The package has three layers:

1. `HistoryManager` is Leaflet-independent. It stores JSON snapshots in bounded
   undo/redo stacks and runs a supplied restore callback.
2. `LeafletAdapter` tracks map layer lifecycle and serializes polylines and
   polygons. It restores only the changed layer and suppresses history capture
   while applying undo/redo.
3. Optional event adapters connect Leaflet.Draw and Leaflet-Geoman to the
   adapter's explicit `checkpoint` operation. The React hook lives at a
   separate package export and is not imported by the core entry point.

An entry is a transition from `before` to `after`; `null` means the shape is
absent. Undo applies `before` and then moves the entry to the redo stack. Redo
applies `after` before moving it back. If restoration throws, the entry remains
on its original stack. Recording after undo discards redo entries. The oldest
undo entry is removed when the configured history limit is exceeded.

Snapshots are cloned, deeply frozen JSON objects. This intentionally excludes
functions, Leaflet instances, cyclic values, and other non-serializable layer
options.

Leaflet has no universal geometry-edit event. Automatically added and removed
layers are tracked by the standard adapter. For edits made directly by
application code, call `checkpoint(layer)` after the edit. The Draw and Geoman
adapters call it when their edit-complete events fire.
