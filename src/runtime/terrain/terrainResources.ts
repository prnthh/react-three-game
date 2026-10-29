import { NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

// Sampler state belongs to the material, but identical sampler state can share
// one GPU texture across tiles. Source assets remain untouched and unowned.
const samplers = new WeakMap<Texture, Map<string, { texture: Texture; users: number }>>();
export function retainTerrainSampler(source: Texture, srgb: boolean) {
    let variants = samplers.get(source);
    if (!variants) samplers.set(source, variants = new Map());
    const key = `${source.version}:${srgb}`;
    let entry = variants.get(key);
    if (!entry) {
        const texture = source.clone();
        texture.wrapS = texture.wrapT = RepeatWrapping;
        texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
        texture.needsUpdate = true;
        entry = { texture, users: 0 };
        variants.set(key, entry);
    }
    entry.users++;
    const owned = entry;
    let released = false;
    return { texture: owned.texture, release() {
        if (released) return;
        released = true;
        if (--owned.users === 0) {
            owned.texture.dispose();
            if (variants!.get(key) === owned) variants!.delete(key);
        }
    } };
}
