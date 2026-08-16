import { createContext, useCallback, useContext, useImperativeHandle, useMemo, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Object3D, Texture } from "three";
import type { LoadedModels, LoadedSounds, LoadedTextures } from "../dragdrop";
import { sound as soundManager } from "../../helpers/SoundManager";

export interface AssetRuntime {
    registerModel: (path: string, model: Object3D) => void;
    registerTexture: (path: string, texture: Texture) => void;
    registerSound: (path: string, sound: AudioBuffer) => void;
    getModel: (path: string) => Object3D | null;
    getTexture: (path: string) => Texture | null;
    getSound: (path: string) => AudioBuffer | null;
    getAssetRevision: () => number;
}

export interface AssetRuntimeProviderProps {
    children: ReactNode;
    runtimeRef?: React.MutableRefObject<AssetRuntime | null>;
}

export const AssetRuntimeContext = createContext<AssetRuntime | null>(null);

/**
 * Reactive backing store for loaded assets. Components subscribe to the single
 * asset slot they care about via the selector hooks below, so loading one asset
 * only re-renders the handful of nodes that reference it — not every consumer of
 * the runtime. `version` is a monotonic counter for the rare consumer that needs
 * a coarse "something loaded" signal (e.g. baked environment maps).
 */
interface AssetStoreState {
    models: LoadedModels;
    textures: LoadedTextures;
    sounds: LoadedSounds;
    soundVersions: Record<string, number>;
    visualVersion: number;
    version: number;
}

type AssetStoreApi = StoreApi<AssetStoreState>;

function createAssetStore(): AssetStoreApi {
    return createStore<AssetStoreState>(() => ({ models: {}, textures: {}, sounds: {}, soundVersions: {}, visualVersion: 0, version: 0 }));
}

const AssetStoreContext = createContext<AssetStoreApi | null>(null);

function useAssetStore(): AssetStoreApi {
    const store = useContext(AssetStoreContext);
    if (!store) throw new Error("Asset hooks must be used inside <PrefabRoot>");
    return store;
}

/** Subscribe to a single loaded model; re-renders only when that model changes. */
export function useModelAsset(path?: string | null): Object3D | null {
    return useStore(useAssetStore(), s => (path ? s.models[path] ?? null : null));
}

/** Subscribe to a single loaded texture; re-renders only when that texture changes. */
export function useTextureAsset(path?: string | null): Texture | null {
    return useStore(useAssetStore(), s => (path ? s.textures[path] ?? null : null));
}

/** Reacts only when one of the requested sound buffers is replaced or loaded. */
export function useSoundAssetRevision(paths: string[]): string {
    return useStore(useAssetStore(), state => (
        paths.map(path => state.soundVersions[path] ?? 0).join('|')
    ));
}

/** Coarse visual-only signal for systems that rebake when scene imagery changes. */
export function useVisualAssetRevision(): number {
    return useStore(useAssetStore(), s => s.visualVersion);
}

export function useAssetRuntime(): AssetRuntime {
    const ctx = useContext(AssetRuntimeContext);
    if (!ctx) throw new Error("useAssetRuntime must be used inside <PrefabRoot>");
    return ctx;
}

/**
 * Ensures one shared asset runtime for a viewer tree. Nested viewers reuse the
 * outermost model, texture, and sound stores.
 */
export function AssetRuntimeProvider({ children, runtimeRef }: AssetRuntimeProviderProps) {
    const inherited = useContext(AssetRuntimeContext);
    useImperativeHandle(inherited ? runtimeRef : undefined, () => inherited!, [inherited]);

    if (inherited) return children;
    return <AssetRuntimeOwner runtimeRef={runtimeRef}>{children}</AssetRuntimeOwner>;
}

function AssetRuntimeOwner({ children, runtimeRef }: AssetRuntimeProviderProps) {
    const [assetStore] = useState(createAssetStore);

    const registerModel = useCallback((path: string, model: Object3D) => {
        if (assetStore.getState().models[path] === model) return;
        assetStore.setState(s => ({ models: { ...s.models, [path]: model }, visualVersion: s.visualVersion + 1, version: s.version + 1 }));
    }, [assetStore]);
    const registerTexture = useCallback((path: string, texture: Texture) => {
        if (assetStore.getState().textures[path] === texture) return;
        assetStore.setState(s => ({ textures: { ...s.textures, [path]: texture }, visualVersion: s.visualVersion + 1, version: s.version + 1 }));
    }, [assetStore]);
    const registerSound = useCallback((path: string, sound: AudioBuffer) => {
        if (assetStore.getState().sounds[path] === sound) return;
        soundManager.setBuffer(path, sound);
        assetStore.setState(s => ({
            sounds: { ...s.sounds, [path]: sound },
            soundVersions: { ...s.soundVersions, [path]: (s.soundVersions[path] ?? 0) + 1 },
            version: s.version + 1,
        }));
    }, [assetStore]);

    const getModel = useCallback((path: string) => assetStore.getState().models[path] ?? null, [assetStore]);
    const getTexture = useCallback((path: string) => assetStore.getState().textures[path] ?? null, [assetStore]);
    const getSound = useCallback((path: string) => assetStore.getState().sounds[path] ?? null, [assetStore]);
    const getAssetRevision = useCallback(() => assetStore.getState().version, [assetStore]);

    // Stable runtime: imperative readers do not re-render on asset loads.
    // Reactive consumers use the per-asset selector hooks.
    const runtime = useMemo<AssetRuntime>(() => ({
        registerModel, registerTexture, registerSound,
        getModel, getTexture, getSound,
        getAssetRevision,
    }), [registerModel, registerTexture, registerSound, getModel, getTexture, getSound, getAssetRevision]);

    useImperativeHandle(runtimeRef, () => runtime, [runtime]);

    return (
        <AssetStoreContext.Provider value={assetStore}>
            <AssetRuntimeContext.Provider value={runtime}>
                {children}
            </AssetRuntimeContext.Provider>
        </AssetStoreContext.Provider>
    );
}
