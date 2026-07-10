import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import { AudioListener } from "three";
import { usePrefabStore } from "./prefabStore";

const AudioListenerContext = createContext<AudioListener | null>(null);

/** Owns exactly one listener for a canvas, shared by every authored Sound node. */
export function AudioRuntimeProvider({ children }: { children: ReactNode }) {
    const inherited = useContext(AudioListenerContext);
    if (inherited) return <>{children}</>;
    return <AudioRuntimeOwner>{children}</AudioRuntimeOwner>;
}

function AudioRuntimeOwner({ children }: { children: ReactNode }) {
    const camera = useThree(state => state.camera);
    const hasSounds = usePrefabStore(state => Object.keys(state.assetRefCounts).some(key => key.startsWith("sound:")));
    const listener = useMemo(() => hasSounds ? new AudioListener() : null, [hasSounds]);

    useEffect(() => {
        if (!listener) return;
        camera.add(listener);
        return () => {
            camera.remove(listener);
        };
    }, [camera, listener]);

    return (
        <AudioListenerContext.Provider value={listener}>
            {children}
        </AudioListenerContext.Provider>
    );
}

export function useAudioListener() {
    const listener = useContext(AudioListenerContext);
    if (!listener) throw new Error("Sound components must be rendered inside <PrefabRoot>");
    return listener;
}
