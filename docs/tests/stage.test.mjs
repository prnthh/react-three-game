import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadGameJson, gameAssetUrl, dialoguePages } from '../app/demo/stage/scene.ts';
import { speakDialogue } from '../app/demo/stage/components/speech.ts';

describe('Scenes and dialogue', () => {
    const publicRoot = new URL('../public/', import.meta.url);
    const read = path => JSON.parse(readFileSync(new URL(path.replace(/^\//, ''), publicRoot)));
    const root = '/prefabs/detective-oni';
    const project = read(`${root}/detective-oni.json`);
    const dialog = read(`${root}/dialogue.json`);

    function mockFiles(t) {
        const requested = [];
        t.mock.method(globalThis, 'fetch', async (url, options) => {
            options?.signal?.throwIfAborted();
            requested.push(url);
            try { const data = read(url); return { ok: true, json: async () => data }; }
            catch { return { ok: false, status: 404 }; }
        });
        return requested;
    }

    function nodesOf(prefab) {
        const nodes = new Map();
        const visit = node => {
            assert.ok(!nodes.has(node.id), `duplicate ${node.id}`);
            nodes.set(node.id, node);
            node.children?.forEach(visit);
        };
        visit(prefab.root);
        return nodes;
    }

    test('entry and scene files use normal prefab components, with lazy character references', async t => {
        const requested = mockFiles(t);
        const entry = await loadGameJson(root, 'detective-oni.json');
        assert.equal(entry.root.components.redirect.type, 'SceneRedirect');
        const scenePath = entry.root.components.redirect.properties.scene;
        const scene = await loadGameJson(root, scenePath);
        assert.deepEqual(requested, [`${root}/detective-oni.json`, `${root}/scenes/office.json`]);
        assert.equal(scene.root.children.find(node => node.id === 'player').components.prefab.type, 'PrefabRef');
        assert.equal(project.scenes, undefined);
    });

    test('character references, dialogue IDs, and direct scene links resolve', async t => {
        mockFiles(t);
        for (const path of ['scenes/office.json', 'scenes/junkyard.json']) {
            const scene = await loadGameJson(root, path);
            const documents = [scene];
            for (const node of nodesOf(scene).values()) {
                for (const component of Object.values(node.components ?? {})) {
                    if (component.type === 'PrefabRef') documents.push(read(component.properties.url));
                }
            }
            assert.ok(documents.some(doc => doc.root.components?.characterDriver?.properties.role === 'player'));
            assert.ok([...nodesOf(scene).values()].some(node => Object.values(node.components ?? {}).some(c => c.type === 'Walkable')));
            for (const doc of documents) for (const node of nodesOf(doc).values()) for (const component of Object.values(node.components ?? {})) {
                const p = component.properties;
                if (!['CharacterDriver', 'InteractionDriver'].includes(component.type)) continue;
                if (p.role === 'player') {
                    assert.ok(nodesOf(doc).has(p.modelNodeId));
                } else if (p.action === 'scene') {
                    const destination = await loadGameJson(root, p.targetScene);
                    assert.ok(destination.root);
                    assert.equal(p.spawn.length, 3);
                } else {
                    assert.ok(dialoguePages(dialog, p.id, p.action).length > 0);
                    if (p.activationNodeId) assert.ok(nodesOf(doc).has(p.activationNodeId));
                    assert.equal(p.pages, undefined);
                }
            }
        }
    });

    test('dialogue IDs select separate talk, examine, and interact lines without changing the library', () => {
        const library = { partner: { talk: ['Hello'], examine: ['A detective.'], interact: ['  ', 'Handshake'] } };
        assert.deepEqual(dialoguePages(library, 'partner', 'talk'), ['Hello']);
        assert.deepEqual(dialoguePages(library, 'partner', 'examine'), ['A detective.']);
        assert.deepEqual(dialoguePages(library, 'partner', 'interact'), ['Handshake']);
        assert.equal(library.partner.interact.length, 2);
        assert.throws(() => dialoguePages(library, 'missing', 'talk'), /Missing talk/);
    });

    test('loading supports deployment base paths, cancellation, and useful missing-file errors', async t => {
        mockFiles(t);
        assert.equal(gameAssetUrl('/prefabs/detective-oni/', 'dialogue.json', '/react-three-game'), '/react-three-game/prefabs/detective-oni/dialogue.json');
        await assert.rejects(loadGameJson(root, 'missing.json'), /404/);
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(loadGameJson(root, 'scenes/office.json', controller.signal), { name: 'AbortError' });
    });

    test('The Cave remains an empty prefab with no redirect', async t => {
        const requested = mockFiles(t);
        const cave = await loadGameJson('/prefabs/the-cave', 'the-cave.json');
        assert.deepEqual(cave.root.children, []);
        assert.deepEqual(cave.root.components, {});
        assert.deepEqual(requested, ['/prefabs/the-cave/the-cave.json']);
    });
});

describe('Speech', () => {
    test('speech remains optional on the server and unsupported browsers', () => {
        assert.equal(speakDialogue('Hello'), undefined);
        globalThis.window = {};
        try { assert.equal(speakDialogue('Hello'), undefined); }
        finally { delete globalThis.window; }
    });

    test('new dialogue replaces speech and disposal cancels the active line', () => {
        const calls = [];
        globalThis.window = {
            SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
            speechSynthesis: {
                cancel: () => calls.push('cancel'),
                speak: utterance => calls.push([utterance.text, utterance.lang]),
            },
        };
        try {
            const stop = speakDialogue('First page');
            stop(); // Effect cleanup on advance, mute or unmount.
            const stopNext = speakDialogue('Next page');
            stopNext();
            assert.deepEqual(calls, ['cancel', ['First page', 'en-US'], 'cancel', 'cancel', ['Next page', 'en-US'], 'cancel']);
            assert.equal(speakDialogue('  '), undefined);
            window.speechSynthesis.speak = () => { throw new Error('No speech service'); };
            assert.doesNotThrow(() => speakDialogue('Still readable')());
        } finally { delete globalThis.window; }
    });
});
