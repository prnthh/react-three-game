import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Group } from 'three';
import { createGameObjectHandle } from '../src/tools/prefabeditor/gameObject.ts';
import {
    createPrefabRegistry, createNodeComponentRegistry, createNodeComponentType,
    PrefabContext, NodeComponentContext, NodeScope, RuntimeNodeIdScope, useGameObject,
} from '../src/tools/prefabeditor/SceneContext.tsx';

const ANIMATOR = createNodeComponentType('test animator');

test('one object handle follows late mounting, component replacement and unloading', () => {
    const objects = createPrefabRegistry();
    const components = createNodeComponentRegistry();
    const player = createGameObjectHandle('player', 'level/npc', objects, components);
    assert.equal(player.transform, null);
    assert.equal(player.getComponent(ANIMATOR), null);
    const transform = new Group();
    const animator = { play: () => 'walk' };
    objects.registerObject('player', transform);
    components.register(player.id, ANIMATOR, animator);
    assert.equal(player.transform, transform);
    assert.equal(player.getComponent(ANIMATOR).play(), 'walk');
    const replacement = { play: () => 'run' };
    components.register(player.id, ANIMATOR, replacement);
    assert.equal(player.getComponent(ANIMATOR), replacement);
    components.register(player.id, ANIMATOR, null);
    objects.registerObject('player', null);
    assert.equal(player.transform, null);
    assert.equal(player.getComponent(ANIMATOR), null);
});

test('the hook resolves current and named objects in the same nested prefab scope', () => {
    const objects = createPrefabRegistry();
    const components = createNodeComponentRegistry();
    const transform = new Group();
    objects.registerObject('player', transform);
    components.register('world/placement/player', ANIMATOR, { name: 'local' });
    components.register('world/other/player', ANIMATOR, { name: 'other instance' });
    function Probe() {
        const self = useGameObject();
        const player = useGameObject('player');
        assert.equal(self.id, player.id);
        assert.equal(self.id, 'world/placement/player');
        assert.equal(player.transform, transform);
        assert.equal(player.getComponent(ANIMATOR).name, 'local');
        return null;
    }
    renderToStaticMarkup(createElement(PrefabContext.Provider, { value: objects },
        createElement(NodeComponentContext.Provider, { value: components },
            createElement(RuntimeNodeIdScope, { prefix: 'world' },
                createElement(RuntimeNodeIdScope, { prefix: 'placement' },
                    createElement(NodeScope, { nodeId: 'player' }, createElement(Probe)))))));
});
