import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
            const url = new URL(specifier, context.parentURL);
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
