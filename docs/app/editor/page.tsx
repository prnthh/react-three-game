"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PrefabEditor } from "react-three-game/editor";
import type { Prefab } from "react-three-game/core";

import { BASE_PATH, withBasePath } from "../basePath";
import PrefabSelector from "../components/PrefabSelector";

const DEFAULT_MAP = "/prefabs/game-level.json";
const DEFAULT_CAMERA_POSITION: [number, number, number] = [0, 5, 15];

type LoadedMap = {
  prefab: Prefab;
  name: string;
  source: string;
};

type MapLoadError = {
  message: string;
  source: string;
};

function parseCameraPosition(value: string | null): [number, number, number] | null {
  if (value === null) return DEFAULT_CAMERA_POSITION;

  const parts = value.split(",");
  if (parts.length !== 3) return null;

  const x = Number(parts[0]);
  const y = Number(parts[1]);
  const z = Number(parts[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;

  return [x, y, z];
}

function getMapName(source: string) {
  const path = source.split(/[?#]/, 1)[0];
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  return fileName.replace(/\.json$/i, "") || "map";
}

function EditorPage() {
  const searchParams = useSearchParams();
  const mapSource = searchParams.get("map")?.trim() || DEFAULT_MAP;
  const cameraValue = searchParams.get("camera");
  const cameraPosition = useMemo(() => parseCameraPosition(cameraValue), [cameraValue]);
  const [loadedMap, setLoadedMap] = useState<LoadedMap | null>(null);
  const [mapLoadError, setMapLoadError] = useState<MapLoadError | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const mapName = getMapName(mapSource);

    void fetch(withBasePath(mapSource), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${mapSource} (${response.status})`);
        }

        return response.json() as Promise<Prefab>;
      })
      .then((prefab) => {
        setMapLoadError(null);
        setLoadedMap({ prefab, name: mapName, source: mapSource });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setMapLoadError({
          message: error instanceof Error ? error.message : `Failed to load ${mapSource}`,
          source: mapSource,
        });
      });

    return () => controller.abort();
  }, [mapSource]);

  const queryError = cameraPosition === null
    ? 'Invalid camera query. Use "camera=x,y,z".'
    : null;
  const selectedMap = loadedMap?.source === mapSource ? loadedMap : null;
  const loadError = mapLoadError?.source === mapSource ? mapLoadError.message : null;

  return (
    <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
      {selectedMap && cameraPosition && (
        <PrefabEditor
          key={`${selectedMap.source}:${cameraPosition[0]},${cameraPosition[1]},${cameraPosition[2]}`}
          basePath={BASE_PATH}
          prefab={selectedMap.prefab}
          canvasProps={{ camera: { position: cameraPosition } }}
        />
      )}

      {(loadError || queryError) && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded bg-red-950/90 px-3 py-2 text-sm text-red-100 shadow-lg">
          {loadError ?? queryError}
        </div>
      )}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<main className="h-screen w-screen bg-white dark:bg-black" />}>
      <EditorPage />
    </Suspense>
  );
}
