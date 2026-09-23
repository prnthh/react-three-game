import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGameEvents, GameEventsProvider, useGameEvents } from '../src/tools/prefabeditor/GameEvents.ts';
import { createPrefabStore } from '../src/tools/prefabeditor/prefabStore.ts';
import { createPrefabApi } from '../src/tools/prefabeditor/prefabApi.ts';
import { createGameObjectHandle } from '../src/tools/prefabeditor/gameObject.ts';
import { createNodeComponentRegistry, createPrefabRegistry } from '../src/tools/prefabeditor/SceneContext.tsx';

test('nested event providers reuse the outer bus; separate games are isolated', () => {
    const buses = [];
    function Probe() { buses.push(useGameEvents()); return null; }
    const nested = createElement(GameEventsProvider, null, createElement(Probe),
        createElement(GameEventsProvider, null, createElement(Probe)));
    renderToStaticMarkup(nested);
    renderToStaticMarkup(createElement(GameEventsProvider, null, createElement(Probe)));
    assert.equal(buses[0], buses[1]);
    assert.notEqual(buses[0], buses[2]);
    let count = 0;
    const off = buses[0].on('hit', () => count++);
    buses[2].emit('hit', {});
    assert.equal(count, 0);
    buses[1].emit('hit', {});
    assert.equal(count, 1);
    off();
});

test('repeated documents keep local edits and object lookups but use distinct event IDs', () => {
    const document = { root: { id: 'npc' } };
    const a = createPrefabApi(createPrefabStore(document), createPrefabRegistry(), () => null, '');
    const b = createPrefabApi(createPrefabStore(document), createPrefabRegistry(), () => null, '');
    a.update('npc', node => ({ ...node, name: 'edited' }));
    assert.equal(b.get('npc').name, undefined);
    a.registerObject('npc', { name: 'a object' });
    assert.equal(b.getObject('npc'), null);
    const components = createNodeComponentRegistry();
    const objectA = createGameObjectHandle('npc', 'a', a, components);
    const objectB = createGameObjectHandle('npc', 'b', b, components);
    const events = createGameEvents();
    let hits = 0;
    events.on('hit', ({ sourceNodeId }) => { if (sourceNodeId === objectB.id) hits++; });
    events.emit('hit', { sourceNodeId: objectA.id });
    assert.equal(hits, 0);
    events.emit('hit', { sourceNodeId: objectB.id });
    assert.equal(hits, 1);
});
