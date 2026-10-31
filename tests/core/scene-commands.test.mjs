import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSceneCommandState } from '../../src/core/sceneCommands.ts';
import { registerComponent } from '../../src/core/ComponentRegistry.ts';
import Transform from '../../src/runtime/components/TransformComponent.tsx';
import MaterialComponent from '../../src/runtime/components/MaterialComponent.tsx';
import { denormalizePrefab, normalizePrefab } from '../../src/core/prefab.ts';
registerComponent(Transform);
registerComponent(MaterialComponent);
const transform = (position, rotation = [0, 0, 0], scale = [1, 1, 1]) => ({ type: 'Transform', properties: { position, rotation, scale } });
const scene = () => ({ root: { id: 'root', children: [
    { id: 'parent', components: { transform: transform([3, 0, 0], [0, Math.PI / 2, 0], [2, 2, 2]) }, children: [{ id: 'child' }] },
    { id: 'material-user', components: { material: { type: 'Material', properties: { name: 'red' } } } },
] } });
const run = (prefab, ...commands) => {
    const { state, result } = evaluateSceneCommandState(normalizePrefab(prefab), { commands });
    return { prefab: denormalizePrefab(state), result };
};

test('built-in constraints protect node ownership without treating visual roles as exclusive', async () => {
    const { registerBuiltInComponents } = await import('../../src/viewer/index.ts');
    registerBuiltInComponents();
    const types = ['Environment', 'Environment', 'Fog', 'Fog', 'Model', 'Model',
        'Camera', 'Text', 'Sprite', 'SkinnedMesh', 'SkinnedMesh', 'Terrain', 'Terrain'];
    const edited = run({ root: { id: 'root' } }, ...types.map((type, index) => ({
        op: 'component', id: 'root', key: `component-${index}`, component: { type, properties: {} },
    })));
    assert.equal(Object.keys(edited.prefab.root.components).length, types.length);
    for (const type of ['Transform', 'Geometry', 'Material', 'BoneAttachment']) {
        assert.throws(() => run({ root: { id: 'root' } }, ...['a', 'b'].map(key => ({
            op: 'component', id: 'root', key, component: { type, properties: {} },
        }))), /exclusive group/, `${type} owns a single node-local resource`);
    }
});

test('validation stages sequential commands without mutating scene or input', () => {
    const original = scene();
    const snapshot = structuredClone(original);
    const node = { id: 'new' };
    const evaluated = run(original,
        { op: 'add', parentId: 'root', node },
        { op: 'transform', id: 'new', position: [2, 3, 4] },
        { op: 'update', id: 'new', patch: { name: 'Box', hidden: true } },
        { op: 'move', id: 'new', parentId: 'parent' },
        { op: 'patchComponent', id: 'material-user', key: 'material', properties: { color: '#ff0000' } });
    assert.deepEqual(original, snapshot);
    assert.deepEqual(node, { id: 'new' });
    assert.equal(evaluated.prefab.root.children[0].children[1].name, 'Box');
    assert.equal(evaluated.result.commandCount, 5);
    assert.deepEqual(evaluated.result.changedIds, ['new', 'material-user']);
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
        { op: 'patchComponent', id: 'material-user', key: 'material', properties: { opacity: 'bad' } },
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
    assert.deepEqual(result.prefab.root.children, [scene().root.children[1]], 'removing a subtree preserves unrelated siblings');
});

test('equivalent component properties in a different key order preserve the staged node', () => {
    const initial = normalizePrefab(scene());
    const { state } = evaluateSceneCommandState(initial, { commands: [{
        op: 'component', id: 'parent', key: 'transform', component: {
            properties: { scale: [2, 2, 2], rotation: [0, Math.PI / 2, 0], position: [3, 0, 0] },
            type: 'Transform',
        },
    }] });
    assert.equal(state.nodesById.parent, initial.nodesById.parent);
});


test('explicit component constraints are enforced by document edits while data components coexist', async () => {
    const { default: Data } = await import('../../src/runtime/components/DataComponent.tsx');
    registerComponent(Data);
    registerComponent({ name: 'ConstraintOwner', exclusive: 'test-constraint', properties: {} });
    registerComponent({ name: 'ConstraintCompetitor', slot: 'object', exclusive: 'test-constraint', properties: {} });
    const original = { root: { id: 'root', components: {
        owner: { type: 'ConstraintOwner', properties: {} },
        data: { type: 'Data', properties: { data: { health: 10 } } },
    } } };
    const data = { type: 'Data', properties: { data: { team: 'blue' } } };
    const edited = run(original, { op: 'component', id: 'root', key: 'team', component: data });
    assert.deepEqual(edited.prefab.root.components.team, data);
    assert.equal(Object.keys(edited.prefab.root.components).length, 3);
    assert.throws(() => run(original,
        { op: 'component', id: 'root', key: 'team', component: data },
        { op: 'component', id: 'root', key: 'competitor', component: { type: 'ConstraintCompetitor', properties: {} } }), /exclusive group/);
    assert.equal(original.root.components.team, undefined, 'failed batches do not partially publish');
    assert.throws(() => run({ root: { id: 'root' } }, { op: 'add', parentId: 'root', node: {
        id: 'conflict', components: { a: { type: 'ConstraintOwner', properties: {} }, b: { type: 'ConstraintCompetitor', properties: {} } },
    } }), /exclusive group/);
});
