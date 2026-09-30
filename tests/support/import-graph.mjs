import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));

export function dependencies(entry) {
    const visited = new Set();
    function visit(file) {
        file = path.resolve(root, file);
        if (visited.has(file)) return;
        visited.add(file);
        const code = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
        const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
        for (const statement of sf.statements) {
            const specifier = statement.moduleSpecifier?.text;
            if (!specifier) continue;
            let target;
            if (specifier.startsWith('.')) target = path.resolve(path.dirname(file), specifier);
            else if (specifier === 'react-three-game') target = path.resolve(root, 'src/index');
            else if (specifier === 'react-three-game/viewer') target = path.resolve(root, 'src/viewer');
            else if (specifier === 'react-three-game/core') target = path.resolve(root, 'src/core');
            else if (specifier === 'react-three-game/editor') target = path.resolve(root, 'src/editor');
            else continue;
            const resolved = ['', '.ts', '.tsx', '/index.ts'].map(suffix => target + suffix).find(candidate => /\.tsx?$/.test(candidate) && existsSync(candidate));
            if (resolved) visit(resolved);
        }
    }
    visit(entry);
    return [...visited];
}
