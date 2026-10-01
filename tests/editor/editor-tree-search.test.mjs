import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAncestorIds, buildVisibleIds } from '../../src/editor/EditorTree.tsx';

test('tree search visits every sibling and preserves matching ancestors', () => {
    const state = {
        nodesById: {root:{id:'root'}, a:{id:'a',name:'Door A'}, branch:{id:'branch'}, b:{id:'b',name:'Door B'}, c:{id:'c',name:'Chair'}},
        childIdsById: {root:['a','branch','c'],branch:['b']},
    };
    assert.deepEqual(buildVisibleIds(state, 'root', 'door'), new Set(['a','b','branch','root']));
    assert.equal(buildVisibleIds(state, 'root', ''), null);
});

test('selection expansion contains only the selected node path', () => {
    const state = { parentIdById: { branch: 'root', leaf: 'branch', sibling: 'root' } };
    assert.deepEqual(buildAncestorIds(state, 'leaf'), new Set(['branch', 'root']));
    assert.deepEqual(buildAncestorIds(state, 'sibling'), new Set(['root']));
    assert.deepEqual(buildAncestorIds(state, null), new Set());
});
