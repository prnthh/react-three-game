import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import { AudioListener } from "three";

const AudioListenerContext = createContext<AudioListener | undefined>(undefined);

/** Owns exactly one listener for a canvas, shared by every authored Sound node. */
export function AudioRuntimeProvider({ children }: { children: ReactNode }) {
    const inherited = useContext(AudioListenerContext);
    if (inherited) return children;
    return <AudioRuntimeOwner>{children}</AudioRuntimeOwner>;
}

function AudioRuntimeOwner({ children }: { children: ReactNode }) {
    const camera = useThree(state => state.camera);
    const listener = useMemo(() => new AudioListener(), []);

    useEffect(() => {
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
