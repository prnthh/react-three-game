"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Prefab } from "react-three-game/viewer";
import type { StagePoint } from "../game";
import { loadGameJson } from "../scene";

type GameDriverValue = {
    rootFolder: string;
    basePath: string;
    scene: Prefab | null;
    spawn?: StagePoint;
    sceneKey: number;
    loading: boolean;
    error: string | null;
    changeScene(id: string, spawn?: StagePoint): Promise<void>;
};
const GameContext = createContext<GameDriverValue | null>(null);
export const useGameDriver = () => useContext(GameContext);

/** Owns game loading and navigation. Entity state lives in the scene's components. */
export default function GameDriver({ rootFolder, basePath = "", children }: { rootFolder: string; basePath?: string; children: ReactNode }) {
    const [scene, setScene] = useState<Prefab | null>(null);
    const [spawn, setSpawn] = useState<StagePoint>();
    const [sceneKey, setSceneKey] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const request = useRef<AbortController | null>(null);

    const changeScene = useCallback(async (id: string, spawn?: StagePoint) => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setLoading(true);
        setError(null);
        try {
            const next = await loadGameJson<Prefab>(rootFolder, id, controller.signal, basePath);
            if (!controller.signal.aborted) { setSpawn(spawn); setScene(next); setSceneKey(key => key + 1); }
        } catch (reason) {
            if (!controller.signal.aborted) setError(String(reason));
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [rootFolder, basePath]);

    useEffect(() => {
        setScene(null);
        const name = rootFolder.replace(/\/+$/, "").split("/").pop();
        void changeScene(`${name}.json`);
        return () => request.current?.abort();
    }, [rootFolder, changeScene]);

    const value = useMemo(() => ({ rootFolder, basePath, spawn, scene, sceneKey, loading, error, changeScene }), [rootFolder, basePath, spawn, scene, sceneKey, loading, error, changeScene]);
    return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
