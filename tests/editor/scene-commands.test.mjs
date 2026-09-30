import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSceneCommandState } from '../../src/tools/prefabeditor/sceneCommands.ts';
import { registerComponent } from '../../src/tools/prefabeditor/components/ComponentRegistry.ts';
import Transform from '../../src/tools/prefabeditor/components/TransformComponent.tsx';
import { denormalizePrefab, normalizePrefab } from '../../src/tools/prefabeditor/prefab.ts';
registerComponent(Transform);
const transform = (position, rotation = [0, 0, 0], scale = [1, 1, 1]) => ({ type: 'Transform', properties: { position, rotation, scale } });
const scene = () => ({ root: { id: 'root', children: [{ id: 'parent', components: { transform: transform([3, 0, 0], [0, Math.PI / 2, 0], [2, 2, 2]) }, children: [{ id: 'child' }] }] } });
const run = (prefab, ...commands) => {
    const { state, result } = evaluateSceneCommandState(normalizePrefab(prefab), { commands });
    return { prefab: denormalizePrefab(state), result };
};

test('validation stages sequential commands without mutating scene or input', () => {
    const original = scene();
    const snapshot = structuredClone(original);
    const node = { id: 'new' };
    const evaluated = run(original,
        { op: 'add', parentId: 'root', node },
        { op: 'transform', id: 'new', position: [2, 3, 4] },
        { op: 'update', id: 'new', patch: { name: 'Box', hidden: true } },
        { op: 'move', id: 'new', parentId: 'parent' },
        { op: 'material', id: 'red', material: { color: '#ff0000' } });
    assert.deepEqual(original, snapshot);
    assert.deepEqual(node, { id: 'new' });
    assert.equal(evaluated.prefab.root.children[0].children[1].name, 'Box');
    assert.equal(evaluated.result.commandCount, 5);
    assert.deepEqual(evaluated.result.changedIds, ['new', 'red']);
});

test('a late failure never partially edits the source', () => {
    const original = scene();
    const snapshot = structuredClone(original);
    assert.throws(() => run(original, { op: 'remove', id: 'child' }, { op: 'update', id: 'missing', patch: { name: 'bad' } }), /Command 2.*does not exist/);
    assert.deepEqual(original, snapshot);
});

test('hierarchy and malformed command validation reject unsafe mutations', () => {
    for (const command of [
        { op: 'remove', id: 'root' },
        { op: 'move', id: 'parent', parentId: 'child' },
        { op: 'add', parentId: 'root', node: { id: 'child' } },
        { op: 'add', parentId: 'root', node: { id: '__proto__' } },
        { op: 'update', id: 'child', patch: { id: 'other' } },
        { op: 'update', id: 'child', patch: { hidden: 'yes' } },
        { op: 'transform', id: 'child', position: [1, 2] },
        { op: 'transform', id: 'child', position: [1, Infinity, 3] },
        { op: 'transform', id: 'child', space: 'world', position: [0, 0, 0] },
        { op: 'component', id: 'child', key: 't', component: { type: 'Transform', properties: { position: 'bad' } } },
        { op: 'component', id: 'parent', key: 'second', component: transform([0, 0, 0]) },
        { op: 'material', id: 'red', material: { opacity: 'bad' } },
        { op: 'typo', id: 'child' },
        { op: 'remove', id: 'child', typo: true },
    ]) assert.throws(() => run(scene(), command), undefined, JSON.stringify(command));
    assert.throws(() => evaluateSceneCommandState(normalizePrefab(scene()), JSON.parse('{"commands":[],"__proto__":{}}')), /Reserved/);
});

test('world transform includes rotated/scaled parents and earlier batch edits', () => {
    const evaluated = run(scene(),
        { op: 'transform', id: 'parent', position: [5, 0, 0] },
        { op: 'transform', id: 'child', space: 'world', position: [5, 0, -4], rotation: [0, Math.PI / 2, 0], scale: [2, 2, 2] });
    const props = evaluated.prefab.root.children[0].children[0].components.transform.properties;
    assert.ok(Math.abs(props.position[0] - 2) < 1e-8);
    assert.ok(Math.abs(props.position[2]) < 1e-8);
    assert.ok((props.rotation ?? [0, 0, 0]).every(n => Math.abs(n) < 1e-8));
    assert.deepEqual(props.scale ?? [1, 1, 1], [1, 1, 1]);
});

test('world transforms reject singular parents and unrepresentable shear', () => {
    assert.throws(() => run(scene(),
        { op: 'transform', id: 'child', space: 'world', position: [0, 0, 0], rotation: [0, 0, 0], scale: [0, 0, 0] }), /degenerate/);
    assert.throws(() => run(scene(),
        { op: 'transform', id: 'parent', scale: [0, 1, 1] },
        { op: 'transform', id: 'child', space: 'world', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }), /not invertible/);
    assert.throws(() => run(scene(),
        { op: 'transform', id: 'parent', scale: [2, 1, 1] },
        { op: 'transform', id: 'child', space: 'world', position: [0, 0, 0], rotation: [0, Math.PI / 4, 0], scale: [1, 1, 1] }), /shear/);
});

test('component replacement/removal and subtree removal', () => {
    const result = run(scene(),
        { op: 'component', id: 'child', key: 'pose', component: transform([1, 2, 3]) },
        { op: 'component', id: 'child', key: 'pose', component: null },
        { op: 'remove', id: 'parent' });
    assert.deepEqual(result.prefab.root.children ?? [], []);
});
