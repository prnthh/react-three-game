import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildAncestorIds, buildVisibleIds } from '../../src/editor/EditorTree.tsx';
import { act, createElement as h, useContext } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { Group } from 'three';
import { createPrefabStore } from '../../src/core/prefabStore.ts';
import { registerComponent } from '../../src/core/ComponentRegistry.ts';
import { PrefabRoot } from '../../src/runtime/prefabs/PrefabRoot.tsx';
import { useNode, useGameObject } from '../../src/runtime/scene/SceneContext.tsx';
import { InstanceClickContext } from '../../src/runtime/rendering/MeshInstanceProvider.tsx';
import { EditorSelection } from '../../src/editor/selection.tsx';

test('editor owns click cycling, drag rejection and scoped selection across nested roots', async t => {
    extend({ Group });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const selected = new Map();
    const probe = { type: 'EditorSelectionProbe', properties: {} };
    registerComponent({ name: 'EditorSelectionProbe', properties: {}, View({ children }) {
        selected.set(useGameObject().id, useNode(node => node.isSelected));
        return children;
    } });
    registerComponent({ name: 'EditorNestedProbe', properties: {}, View() {
        return h(PrefabRoot, { id: 'placement', data: { root: {
            id: 'a', name: 'Nested A', components: { probe },
        } } });
    } });
    const store = createPrefabStore({ root: { id: 'root', children: [
        { id: 'a', name: 'A', components: { probe } },
        { id: 'b', name: 'B' },
        { id: 'placement', name: 'Placement', components: { nested: { type: 'EditorNestedProbe', properties: {} } } },
    ] } });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });
    let click, state;
    const picks = [];
    const onSelect = id => picks.push(id);
    function Capture() { click = useContext(InstanceClickContext); return null; }
    const render = async (enabled = true, selectedId = null) => act(async () => {
        state = root.render(h(EditorSelection, { store, selectedId, enabled, onSelect },
            h(Capture), h(PrefabRoot, { store, editMode: enabled })));
    });
    await render();
    const scene = state.getState().scene;
    const a = scene.getObjectByName('A'), b = scene.getObjectByName('B');
    let stopped = 0;
    const event = (objects, delta = 0, x = 10) => ({ delta,
        intersections: objects.map(object => ({ object })),
        nativeEvent: { clientX: x, clientY: 10 }, stopPropagation() { stopped++; },
    });
    click(event([a, b], 5));
    assert.equal(stopped, 0, 'dragging is not a selection click');
    click(event([a, b])); click(event([a, b])); click(event([a, b]));
    assert.deepEqual(picks, ['a', 'b', 'a']);
    click(event([a, b], 0, 30));
    assert.equal(picks.at(-1), 'a', 'a new pointer location restarts the cycle');
    await act(async () => store.getState().updateNode('a', node => ({ ...node, locked: true })));
    click(event([a, b]));
    assert.equal(picks.at(-1), 'root', 'locked nodes fall back to their selectable ancestor');
    click(event([a, b]));
    assert.equal(picks.at(-1), 'b', 'cycling still reaches the next hit');
    click(event([scene.getObjectByName('Nested A')]));
    assert.equal(picks.at(-1), 'placement', 'nested contents select their owning placement');
    await render(true, 'a');
    assert.equal(selected.get('a'), true);
    assert.equal(selected.get('placement/a'), false, 'nested local IDs do not inherit outer selection');
    const stableClick = click, count = picks.length, stopCount = stopped;
    await render(false);
    assert.equal(click, stableClick, 'instance callbacks stay stable across mode switches');
    click(event([b]));
    assert.equal(picks.length, count);
    assert.equal(stopped, stopCount, 'Play clicks remain available to gameplay');
    assert.equal(selected.get('a'), false);
});

describe('Tree search and expansion', () => {
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
});
