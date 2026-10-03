"use client";

import SceneRedirect from "../demo/stage/components/SceneRedirect";
import Walkable from "../demo/stage/components/Walkable";

import PrefabGridStreamerComponent from "../components/PrefabGridStreamerComponent";
import ConstantVelocityComponent from "../components/ConstantVelocityComponent";
import CameraShadowFollowerComponent from "../demo/grassworld/components/CameraShadowFollowerComponent";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PrefabEditorProvider, PrefabEditorScene, PrefabEditorPanel, usePrefabStoreApi } from "react-three-game/editor";
import { GameCanvas } from "react-three-game/viewer";
import type { Prefab } from "react-three-game/core";
import { denormalizePrefab, registerComponent } from "react-three-game/core";
import { BASE_PATH, withBasePath } from "../basePath";
import AgentApiHint from "../components/AgentApiHint";
import { createPrefabPersistence, readSavedPrefab } from "./persistence";
import { CrashcatPhysicsComponent, CrashcatRuntime } from "react-three-game/plugins/crashcat";
import ActivationCollider from "../demo/stage/components/ActivationColliderComponent";
import InteractionDriver from "../demo/stage/components/InteractionDriver";
import InteractionCollider from "../demo/stage/components/InteractionCollider";
import CharacterDriver from "../demo/stage/components/CharacterDriver";
import StageCameraFollow from "../demo/stage/components/StageCameraFollow";
import starterScene from "../../public/prefabs/starter-scene.json";

const createStarterScene = (): Prefab => structuredClone(starterScene) as Prefab;


const DEFAULT_CAMERA_POSITION: [number, number, number] = [0, 5, 15];
const STARTER_CAMERA_POSITION: [number, number, number] = [4, 3, 6];


function Autosave({ writer }: { writer: ReturnType<typeof createPrefabPersistence> }) {
  const store = usePrefabStoreApi();
  useEffect(() => {
    const unsubscribe = store.subscribe(() => writer.schedule(() => denormalizePrefab(store.getState())));
    const flushWhenHidden = () => { if (document.visibilityState === 'hidden') writer.flush(); };
    window.addEventListener('pagehide', writer.flush);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', writer.flush);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      writer.dispose();
    };
  }, [store, writer]);
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
  const writer = useMemo(() => createPrefabPersistence({
    setItem: (key, value) => window.localStorage.setItem(key, value),
  }, message => console.warn(message)), []);
  const [mapLoadError, setMapLoadError] = useState<MapLoadError | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    if (!mapSource) {
      let prefab = createStarterScene();
      try {
        prefab = readSavedPrefab(window.localStorage) ?? prefab;
      } catch {
        console.warn('Could not restore the saved prefab; loading the starter template.');
      }
      setLoadedMap({ prefab, source: null });
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
      const response = await fetch(withBasePath(mapSource), { signal: controller.signal });
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
  const loadError = mapLoadError?.source === mapSource ? mapLoadError.message : null;

  return (
    <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
      {selectedMap && cameraPosition && (
        <PrefabEditorProvider
          key={selectedMap.source}
          basePath={BASE_PATH}
          prefab={selectedMap.prefab}
          onSaveScene={writer.save}
          createPrefab={createStarterScene}
        >
          <Autosave writer={writer} />
          <GameCanvas camera={{ position: cameraPosition }}>
            <PrefabEditorScene><CrashcatRuntime /></PrefabEditorScene>
          </GameCanvas>
          <PrefabEditorPanel />
        </PrefabEditorProvider>
      )}

      {selectedMap && cameraPosition && <AgentApiHint />}

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

registerComponent(PrefabGridStreamerComponent);
registerComponent(ConstantVelocityComponent);
registerComponent(CameraShadowFollowerComponent);

registerComponent(CrashcatPhysicsComponent);
registerComponent(ActivationCollider);
registerComponent(InteractionDriver);
registerComponent(SceneRedirect);
registerComponent(Walkable);
registerComponent(InteractionCollider);
registerComponent(CharacterDriver);
registerComponent(StageCameraFollow);
