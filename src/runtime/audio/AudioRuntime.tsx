import { createContext, useContext } from 'react';
import type { AudioListener } from 'three';

/** Hosts supply audio explicitly; scene construction never creates an AudioContext. */
export const AudioListenerContext = createContext<AudioListener | undefined>(undefined);

export function useAudioListener() {
    return useContext(AudioListenerContext);
}

/** Optional host integration for imperative audio playback. */
export const AudioAssetsContext = createContext<{
    register(path: string, buffer: AudioBuffer): void;
    remove(path: string, buffer: AudioBuffer): void;
} | null>(null);
