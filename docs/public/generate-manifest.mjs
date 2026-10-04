import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function listPrefabPaths(directory) {
    const paths = [];
    function visit(folder) {
        for (const entry of readdirSync(folder, { withFileTypes: true })) {
            const path = join(folder, entry.name);
            if (entry.isDirectory()) visit(path);
            else if (entry.name.endsWith('.json') && entry.name !== 'manifest.json') {
                const document = JSON.parse(readFileSync(path, 'utf8'));
                // Project configuration and dialogue libraries are not loadable prefabs.
                if (document?.root && typeof document.root === 'object' && typeof document.root.id === 'string') {
                    paths.push(`/prefabs/${relative(directory, path).split('\\').join('/')}`);
                }
            }
        }
    }
    visit(directory);
    return paths.sort();
}

export function generateAssetManifest(publicDirectory) {
    const extensions = {
        models: new Set(['.glb', '.gltf', '.fbx']),
        textures: new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg']),
        sound: new Set(['.mp3', '.wav', '.ogg', '.m4a']),
    };
    const manifest = { models: [], textures: [], sound: [], prefabs: [] };
    for (const [kind, supported] of Object.entries(extensions)) {
        function visit(folder) {
            if (!existsSync(folder)) return;
            for (const entry of readdirSync(folder, { withFileTypes: true })) {
                const path = join(folder, entry.name);
                if (entry.isDirectory()) visit(path);
                else if (supported.has(extname(entry.name).toLowerCase())) {
                    manifest[kind].push('/' + relative(publicDirectory, path).split('\\').join('/'));
                }
            }
        }
        visit(join(publicDirectory, kind));
        manifest[kind].sort();
    }
    const prefabDirectory = join(publicDirectory, 'prefabs');
    if (existsSync(prefabDirectory)) manifest.prefabs = listPrefabPaths(prefabDirectory);
    return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const directory = dirname(fileURLToPath(import.meta.url));
    const manifest = generateAssetManifest(directory);
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Generated manifest.json: ${Object.entries(manifest).map(([kind, paths]) => `${paths.length} ${kind}`).join(', ')}`);
}
