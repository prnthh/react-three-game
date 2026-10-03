import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const directory = join(dirname(fileURLToPath(import.meta.url)), 'prefabs');
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(listPrefabPaths(directory), null, 2) + '\n');
}
