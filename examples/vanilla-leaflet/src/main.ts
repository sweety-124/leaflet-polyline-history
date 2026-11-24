import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createPolylineHistory } from "leaflet-polyline-history";
import "./style.css";

const map = L.map("map").setView([51.505, -0.09], 13);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const history = createPolylineHistory(map, { maxHistory: 50 });
let route: L.Polyline | undefined;
let revision = 0;

const addButton = document.querySelector<HTMLButtonElement>("#add");
const editButton = document.querySelector<HTMLButtonElement>("#edit");
const deleteButton = document.querySelector<HTMLButtonElement>("#delete");
const undoButton = document.querySelector<HTMLButtonElement>("#undo");
const redoButton = document.querySelector<HTMLButtonElement>("#redo");
const clearButton = document.querySelector<HTMLButtonElement>("#clear");
const status = document.querySelector<HTMLOutputElement>("#status");

function updateControls(): void {
  if (
    addButton === null ||
    editButton === null ||
    deleteButton === null ||
    undoButton === null ||
    redoButton === null ||
    clearButton === null ||
    status === null
  ) {
    throw new Error("Demo controls could not be found.");
  }

  addButton.disabled = route !== undefined && map.hasLayer(route);
  editButton.disabled = route === undefined || !map.hasLayer(route);
  deleteButton.disabled = route === undefined || !map.hasLayer(route);
  undoButton.disabled = !history.canUndo();
  redoButton.disabled = !history.canRedo();
  clearButton.disabled = !history.canUndo() && !history.canRedo();
  status.value = `Undo ${history.getStatus().undoCount} · Redo ${history.getStatus().redoCount}`;
}

addButton?.addEventListener("click", () => {
  revision = 0;
  route = L.polyline(
    [
      [51.505, -0.09],
      [51.51, -0.1],
      [51.515, -0.085],
    ],
    { color: "#2563eb", weight: 5 },
  );
  map.addLayer(route);
});

editButton?.addEventListener("click", () => {
  if (route === undefined) {
    return;
  }

  revision += 1;
  const delta = revision * 0.006;
  route.setLatLngs([
    [51.505 + delta, -0.09],
    [51.51, -0.1 - delta],
    [51.515 - delta, -0.085],
  ]);
  route.setStyle({ color: revision % 2 === 0 ? "#2563eb" : "#dc2626" });
  history.checkpoint(route);
});

deleteButton?.addEventListener("click", () => {
  if (route !== undefined) {
    map.removeLayer(route);
  }
});

undoButton?.addEventListener("click", () => history.undo());
redoButton?.addEventListener("click", () => history.redo());
clearButton?.addEventListener("click", () => history.clear());
history.on("historyChange", updateControls);
updateControls();
