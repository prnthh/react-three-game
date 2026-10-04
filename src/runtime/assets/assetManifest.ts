import { withBasePath } from './assetPaths.js';

export interface AssetManifest {
    models: string[];
    textures: string[];
    sound: string[];
    prefabs: string[];
}

/** Read the project manifest of available assets, independent of the active scene. */
export async function loadAssetManifest(basePath = ''): Promise<AssetManifest> {
    const url = withBasePath(basePath, '/manifest.json');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load asset manifest (${response.status}): ${url}`);
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Asset manifest must be an object.');
    const manifest: AssetManifest = { models: [], textures: [], sound: [], prefabs: [] };
    for (const key of Object.keys(manifest) as (keyof AssetManifest)[]) {
        const entries = (data as Record<string, unknown>)[key] ?? [];
        if (!Array.isArray(entries) || entries.some(entry => typeof entry !== 'string' || !entry.trim())) {
            throw new Error(`Asset manifest "${key}" must be an array of paths.`);
        }
        manifest[key] = [...new Set(entries as string[])].sort();
    }
    return manifest;
}
