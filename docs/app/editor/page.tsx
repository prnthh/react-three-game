"use client";
import PrefabGridStreamerComponent from '../components/PrefabGridStreamerComponent';
import { DemoSceneTools } from '../components/agent/DemoSceneTools';
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PrefabEditorProvider, PrefabEditorScene, PrefabEditorPanel, getPrefabEditorView } from "react-three-game/editor";
import { GameCanvas, NodeMountBudget, registerComponent } from "react-three-game/viewer";
import type { Prefab } from "react-three-game/core";
import { BASE_PATH, withBasePath } from "../basePath";
import starterScene from "../../public/prefabs/starter-scene.json";
import { useThree } from '@react-three/fiber';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

registerComponent(PrefabGridStreamerComponent);

const createStarterScene = (): Prefab => structuredClone(starterScene) as Prefab;


const DEFAULT_CAMERA_POSITION: [number, number, number] = [0, 5, 15];
const STARTER_CAMERA_POSITION: [number, number, number] = [4, 3, 6];

function InitialEditorView({ target }: { target?: [number, number, number] }) {
  const controls = useThree(state => state.controls) as OrbitControls | null;
  useEffect(() => {
    if (!controls?.target || !target) return;
    controls.target.fromArray(target);
    controls.update();
  }, [controls, target]);
  return null;
}


type LoadedMap = {
  prefab: Prefab;
  source: string | null;
};

type MapLoadError = {
  message: string;
  source: string | null;
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

function EditorPage() {

  const searchParams = useSearchParams();
  const mapSource = searchParams.get("map")?.trim() || null;
  const cameraValue = searchParams.get("camera");
  const cameraPosition = useMemo(() => cameraValue === null && !mapSource
    ? STARTER_CAMERA_POSITION : parseCameraPosition(cameraValue), [cameraValue, mapSource]);
  const [loadedMap, setLoadedMap] = useState<LoadedMap | null>(null);
  const [mapLoadError, setMapLoadError] = useState<MapLoadError | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    if (!mapSource) {
      setLoadedMap({ prefab: createStarterScene(), source: null });
      setMapLoadError(null);
      return () => controller.abort();
    }

    const loadMap = async (): Promise<Prefab> => {
      if (mapSource.startsWith("game:")) {
        const { games } = await import("../demo/stage/games");
        const [gameId, sceneId] = mapSource.slice("game:".length).split("/");
        const game = games.find(game => game.id === gameId);
        if (!game) throw new Error(`Unknown game: ${gameId}`);
        const { loadGameJson } = await import("../demo/stage/scene");
        return loadGameJson<Prefab>(game.rootFolder, `scenes/${sceneId}.json`, controller.signal, BASE_PATH);
      }
      const response = await fetch(withBasePath(mapSource), { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to load ${mapSource} (${response.status})`);
      }

      return response.json() as Promise<Prefab>;
    };
    void loadMap().then((prefab) => {
        if (controller.signal.aborted) return;
        setMapLoadError(null);
        setLoadedMap({ prefab, source: mapSource });
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
  const authoredView = useMemo(() => cameraValue === null && selectedMap ? getPrefabEditorView(selectedMap.prefab) : undefined, [selectedMap, cameraValue]);
  const loadError = mapLoadError?.source === mapSource ? mapLoadError.message : null;

  return (
    <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
      {selectedMap && cameraPosition && (
        <PrefabEditorProvider
          key={selectedMap.source}
          basePath={BASE_PATH}
          prefab={selectedMap.prefab}
          createPrefab={createStarterScene}
        >
          <GameCanvas camera={authoredView ?? { position: cameraPosition }}>
            <NodeMountBudget><PrefabEditorScene /></NodeMountBudget>
            <InitialEditorView target={authoredView?.target} />
          </GameCanvas>
          <PrefabEditorPanel sceneToolsPanel={<DemoSceneTools guideUrl={withBasePath('/editor-scene-for-agents.md')} />} />
        </PrefabEditorProvider>
      )}

      {(loadError || queryError) && (
        <div role="alert" className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded bg-red-950/90 px-3 py-2 text-sm text-red-100 shadow-lg">
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
