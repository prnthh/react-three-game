"use client";
import { PrefabEditor } from "react-three-game/editor";
import { BASE_PATH } from "../../../basePath";
import mapPrefab from "../map.json" with { type: "json" };
import { registerComponent } from "react-three-game/viewer";
import { SpawnPointComponent } from "../components/SpawnPointComponent";

registerComponent(SpawnPointComponent);

/** Edit just the map document, keeping gameplay managers out of map exports. */
export default function FPSMapEditor() {
  return <div style={{ position: "fixed", inset: 0 }}>
    <PrefabEditor prefab={mapPrefab} basePath={BASE_PATH} canvasProps={{
      camera: { position: [12, 16, -34], fov: 55, near: 0.1, far: 150 },
    }} />
  </div>;
}
