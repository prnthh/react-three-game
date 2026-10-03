// TypeScript's bundler resolution leaves relative imports extensionless. Add their
// emitted .js paths so the same published modules also load directly in Node.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';

const root = resolve('dist');
for (const file of await readdir(root, { recursive: true })) {
    if (!file.endsWith('.js')) continue;
    const filename = resolve(root, file);
    let text = await readFile(filename, 'utf8');
    const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const edits = [];
    function visit(node) {
        const specifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
            ? node.moduleSpecifier
            : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
                ? node.arguments[0] : null;
        if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
            const path = resolve(dirname(filename), specifier.text);
            if (!specifier.text.endsWith('.js')) {
                const suffix = ['.js', '/index.js'].find(suffix => existsSync(path + suffix));
                if (!suffix) throw new Error(`Unresolved emitted import ${specifier.text} in ${file}`);
                edits.push({ start: specifier.getStart(source) + 1, end: specifier.getEnd() - 1, value: specifier.text + suffix });
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
        text = text.slice(0, edit.start) + edit.value + text.slice(edit.end);
    }
    if (edits.length) await writeFile(filename, text);
}
