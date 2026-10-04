import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
registerHooks({
    resolve(specifier, context, nextResolve) {
        // Docs components import the workspace package; test its source without a build.
        const entry = { 'react-three-game': 'index', 'react-three-game/core': 'core',
            'react-three-game/viewer': 'viewer', 'react-three-game/editor': 'editor', 'react-three-game/headless': 'headless', 'react-three-game/browser': 'browser', 'react-three-game/node': 'node',
            'react-three-game/plugins/crashcat': 'plugins/crashcat/index' }[specifier];
        if (entry) {
            const base = new URL(`../../src/${entry}`, import.meta.url);
            const suffix = ['.ts', '.tsx'].find(suffix => existsSync(fileURLToPath(base) + suffix));
            if (suffix) return { url: base.href + suffix, shortCircuit: true };
        }
        if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
            const url = new URL(specifier.endsWith('.js') ? specifier.slice(0, -3) : specifier, context.parentURL);
            for (const suffix of ['', '.ts', '.tsx', '/index.ts']) {
                if (existsSync(fileURLToPath(url) + suffix) && /\.(ts|tsx)$/.test(url.pathname + suffix)) {
                    return { url: url.href + suffix, shortCircuit: true };
                }
            }
        }
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (/\.(ts|tsx)$/.test(url)) {
            const { outputText } = ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
                fileName: fileURLToPath(url),
                compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
            });
            return { format: 'module', source: outputText, shortCircuit: true };
        }
        return nextLoad(url, context);
    },
});
