import { useContext, useEffect, useMemo, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import { AudioListener } from "three";

import { AudioListenerContext, AudioAssetsContext } from '../runtime/audio/AudioRuntime.js';
import { sound } from '../runtime/audio/SoundManager.js';

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
        const resume = () => { void listener.context.resume(); };
        window.addEventListener("pointerdown", resume);
        window.addEventListener("keydown", resume);
        return () => {
            window.removeEventListener("pointerdown", resume);
            window.removeEventListener("keydown", resume);
        };
    }, [listener]);

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

const audioAssets = {
    register: (path: string, buffer: AudioBuffer) => sound.setBuffer(path, buffer),
    remove: (path: string, buffer: AudioBuffer) => sound.removeBuffer(path, buffer),
};

/** Browser services for scenes hosted in an R3F canvas. GameCanvas includes this. */
export function BrowserRuntime({ children }: { children: ReactNode }) {
    return <AudioAssetsContext.Provider value={audioAssets}><AudioRuntimeProvider>{children}</AudioRuntimeProvider></AudioAssetsContext.Provider>;
}

/** Browser-only download adapter. Serialization belongs to the export layer. */
export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    try { downloadURL(url, filename); }
    finally {
        // Allow the browser to consume the URL before releasing it.
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }
}

/** Download an existing URL or data URL; ownership of that URL stays with the caller. */
export function downloadURL(url: string, filename: string) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
}

export function getTextureImageDataUrl(image: unknown) {
    if (
        !image
        || typeof image !== 'object'
        || !('width' in image) || !('height' in image)
        || typeof document === 'undefined'
        || typeof image.width !== 'number'
        || typeof image.height !== 'number'
        || image.width <= 0
        || image.height <= 0
    ) {
        return undefined;
    }

    try {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        if (!context) return undefined;

        context.drawImage(image as CanvasImageSource, 0, 0);
        return canvas.toDataURL('image/png');
    } catch {
        return undefined;
    }
}
