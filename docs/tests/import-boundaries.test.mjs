import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencies } from '../../tests/support/import-graph.mjs';

for (const entry of ['docs/app/components/DemoApp.tsx']) {
    test(`${entry} has no transitive authoring imports`, () => {
        const forbidden = dependencies(entry).filter(file => /\/src\/editor(?:\/|\.ts$)/.test(file));
        assert.deepEqual(forbidden, []);
    });
}

