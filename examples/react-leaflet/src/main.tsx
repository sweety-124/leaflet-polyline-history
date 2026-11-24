import { useState } from "react";
import { createRoot } from "react-dom/client";
import * as L from "leaflet";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { usePolylineHistory } from "leaflet-polyline-history/react";
import "leaflet/dist/leaflet.css";
import "./style.css";

function HistoryControls() {
  const map = useMap();
  const history = usePolylineHistory(map, { maxHistory: 50 });
  const [route, setRoute] = useState<L.Polyline | null>(null);
  const [revision, setRevision] = useState(0);

  function addRoute(): void {
    const shape = L.polyline(
      [
        [51.505, -0.09],
        [51.51, -0.1],
        [51.515, -0.085],
      ],
      { color: "#2563eb", weight: 5 },
    );
    map.addLayer(shape);
    setRoute(shape);
    setRevision(0);
  }

  function editRoute(): void {
    if (route === null) {
      return;
    }
    const nextRevision = revision + 1;
    const delta = nextRevision * 0.006;
    route.setLatLngs([
      [51.505 + delta, -0.09],
      [51.51, -0.1 - delta],
      [51.515 - delta, -0.085],
    ]);
    route.setStyle({ color: nextRevision % 2 === 0 ? "#2563eb" : "#dc2626" });
    history.checkpoint(route);
    setRevision(nextRevision);
  }

  return (
    <div className="controls">
      <button
        onClick={addRoute}
        disabled={route !== null && map.hasLayer(route)}
      >
        Add route
      </button>
      <button
        onClick={editRoute}
        disabled={route === null || !map.hasLayer(route)}
      >
        Edit route
      </button>
      <button
        onClick={() => route !== null && map.removeLayer(route)}
        disabled={route === null || !map.hasLayer(route)}
      >
        Delete route
      </button>
      <button onClick={history.undo} disabled={!history.canUndo}>
        Undo
      </button>
      <button onClick={history.redo} disabled={!history.canRedo}>
        Redo
      </button>
      <button onClick={history.clearHistory}>Clear history</button>
    </div>
  );
}

function App() {
  return (
    <MapContainer center={[51.505, -0.09]} zoom={13}>
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <HistoryControls />
    </MapContainer>
  );
}

const rootElement = document.querySelector("#root");
if (rootElement === null) {
  throw new Error("React demo root element could not be found.");
}
createRoot(rootElement).render(<App />);
