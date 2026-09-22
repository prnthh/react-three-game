import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function dependencies(entry) {
    const visited = new Set();
    function visit(file) {
        file = path.resolve(file);
        if (visited.has(file)) return;
        visited.add(file);
        const code = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
        const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
        for (const statement of sf.statements) {
            const specifier = statement.moduleSpecifier?.text;
            if (!specifier) continue;
            let target;
            if (specifier.startsWith('.')) target = path.resolve(path.dirname(file), specifier);
            else if (specifier === 'react-three-game') target = path.resolve('src/index');
            else if (specifier === 'react-three-game/viewer') target = path.resolve('src/viewer');
            else if (specifier === 'react-three-game/core') target = path.resolve('src/core');
            else if (specifier === 'react-three-game/editor') target = path.resolve('src/editor');
            else continue;
            const resolved = ['', '.ts', '.tsx', '/index.ts'].map(suffix => target + suffix).find(candidate => /\.tsx?$/.test(candidate) && existsSync(candidate));
            if (resolved) visit(resolved);
        }
    }
    visit(entry);
    return [...visited];
}

for (const entry of ['src/viewer.ts', 'docs/app/components/DemoApp.tsx']) {
    test(`${entry} has no transitive inspector or editor UI imports`, () => {
        const forbidden = dependencies(entry).filter(file => /(?:\.editor\.tsx?$|\/Input\.tsx$|\/EditorUI\.tsx$|\/PrefabEditor\.tsx$|\/assetviewer\/|\/editor\.ts$|\/ComponentEditors\.ts$)/.test(file));
        assert.deepEqual(forbidden, []);
    });
}
