import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { getComponents } from './components/ComponentRegistry';
import { findComponentEntry, type ComponentData, type GameObject, type Prefab, type PrefabMaterial } from './types';
import { composeTransform } from './runtimeUtils';
import { createPrefabStore } from './prefabStore';
import { createPrefabDocumentApi } from './prefabApi';
import { collectSubtreeIds, type PrefabState } from './prefab';

type Vec3 = [number, number, number];
export type SceneCommand =
    | { op: 'add'; parentId: string; node: GameObject }
    | { op: 'update'; id: string; patch: Partial<Pick<GameObject, 'name' | 'hidden' | 'disabled' | 'locked'>> }
    | { op: 'remove'; id: string }
    | { op: 'replaceNode'; id: string; node: GameObject }
    | { op: 'replace'; prefab: Prefab }
    | { op: 'move'; id: string; parentId: string }
    | { op: 'transform'; id: string; space?: 'local' | 'world'; position?: Vec3; rotation?: Vec3; scale?: Vec3 }
    | { op: 'component'; id: string; key: string; component: ComponentData | null }
    | { op: 'material'; id: string; material: PrefabMaterial }
    | { op: 'patchComponent'; id: string; key: string; properties: Record<string, unknown>; unset?: string[] }
    | { op: 'patchMaterial'; id: string; patch: Partial<PrefabMaterial> }
    | { op: 'duplicate'; id: string; newId: string; parentId?: string };
export interface SceneCommandBatch { commands: SceneCommand[] }
export interface SceneCommandResult { commandCount: number; changedIds: string[]; createdIds: string[]; removedIds: string[] }

const fields: Record<SceneCommand['op'], string[]> = {
    replaceNode: ['id', 'node'], replace: ['prefab'],
    add: ['parentId', 'node'], update: ['id', 'patch'], remove: ['id'], move: ['id', 'parentId'],
    transform: ['id', 'space', 'position', 'rotation', 'scale'], component: ['id', 'key', 'component'], material: ['id', 'material'],
    patchComponent: ['id', 'key', 'properties', 'unset'], patchMaterial: ['id', 'patch'], duplicate: ['id', 'newId', 'parentId'],
};
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);
function record(value: unknown, label: string): Record<string, any> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    return value;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
    for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown field "${key}".`);
}
function id(value: unknown): asserts value is string {
    if (typeof value !== 'string' || !value.trim() || (unsafeKeys.has(value) || Object.hasOwn(Object.prototype, value))) throw new Error('IDs and component keys must be nonempty, nonreserved strings.');
}
function vector(value: unknown, label: string, length = 3) {
    if (!Array.isArray(value) || value.length !== length || !value.every(n => typeof n === 'number' && Number.isFinite(n))) {
        throw new Error(`${label} must contain ${length} finite numbers.`);
    }
}
function nodePatch(value: unknown) {
    const patch = record(value, 'patch');
    keys(patch, ['name', 'hidden', 'disabled', 'locked']);
    for (const [key, value] of Object.entries(patch)) {
        if (typeof value !== (key === 'name' ? 'string' : 'boolean')) throw new Error(`Invalid ${key}.`);
    }
}
function component(value: unknown) {
    const data = record(value, 'component');
    keys(data, ['type', 'properties']);
    id(data.type);
    const definition = getComponents()[data.type];
    if (!definition) throw new Error(`Unknown component type "${data.type}". Use describeComponents for available types.`);
    const props = record(data.properties, 'properties');
    for (const [key, value] of Object.entries(props)) {
        const schema = definition.properties[key];
        if (!schema) throw new Error(`Unknown ${data.type} property "${key}".`);
        const type = schema.type ?? 'number';
        if (type === 'vector2' || type === 'vector3') vector(value, key, type === 'vector2' ? 2 : 3);
        else if (type === 'select') {
            if (!('options' in schema) || !schema.options.some(option => option.value === value)) throw new Error(`Invalid ${key} option.`);
        } else if (type === 'object') record(value, key);
        else if (type === 'array' || type.endsWith('[]')) {
            if (!Array.isArray(value) || (type !== 'array' && !value.every(item => typeof item === type.slice(0, -2)))) throw new Error(`Invalid ${key} array.`);
        } else if (typeof value !== (type === 'color' ? 'string' : type)) throw new Error(`Invalid ${key}: expected ${type}.`);
    }
}
function validateNode(node: GameObject, ids: Set<string>, existing?: PrefabState["nodesById"]) {
    record(node, 'node');
    keys(node as unknown as Record<string, unknown>, ['id', 'name', 'hidden', 'disabled', 'locked', 'components', 'children']);
    id(node.id);
    if (ids.has(node.id) || existing && Object.hasOwn(existing, node.id)) throw new Error(`Duplicate node ID "${node.id}".`);
    ids.add(node.id);
    const { id: _, components, children, ...patch } = node;
    nodePatch(patch);
    if (components !== undefined) {
        record(components, 'components');
        const slots = new Set<string>();
        for (const [key, value] of Object.entries(components)) {
            id(key);
            component(value);
            const slot = getComponents()[value!.type].slot;
            if (slot && slots.has(slot)) throw new Error(`Node "${node.id}" has multiple components in slot "${slot}".`);
            if (slot) slots.add(slot);
        }
    }
    if (children !== undefined) {
        if (!Array.isArray(children)) throw new Error('children must be an array.');
        children.forEach(child => validateNode(child, ids, existing));
    }
}
function material(value: unknown) {
    const data = record(value, 'material');
    const strings = ['name', 'color', 'texture', 'minFilter', 'magFilter', 'normalMapTexture'];
    const numbers = ['opacity', 'alphaTest', 'metalness', 'roughness', 'transmission', 'thickness', 'ior', 'rotation'];
    const booleans = ['toneMapped', 'wireframe', 'transparent', 'depthTest', 'depthWrite', 'sizeAttenuation', 'repeat', 'generateMipmaps'];
    keys(data, [...strings, ...numbers, ...booleans, 'materialType', 'side', 'offset', 'repeatCount', 'normalScale']);
    for (const [key, value] of Object.entries(data)) {
        if (strings.includes(key) && typeof value !== 'string' || numbers.includes(key) && typeof value !== 'number' || booleans.includes(key) && typeof value !== 'boolean') throw new Error(`Invalid material ${key}.`);
        if (['offset', 'repeatCount', 'normalScale'].includes(key)) vector(value, key, 2);
        if (key === 'materialType' && !['standard', 'basic', 'sprite'].includes(value as string)) throw new Error('Invalid materialType.');
        if (key === 'side' && !['FrontSide', 'BackSide', 'DoubleSide'].includes(value as string)) throw new Error('Invalid material side.');
    }
}
/** Stages immutable store edits, sharing untouched nodes. Never mutates the live store. */
export function evaluateSceneCommandState(initial: PrefabState, input: unknown): { state: PrefabState; result: SceneCommandResult } {
    const batch = JSON.parse(JSON.stringify(input, (key, value) => {
        if (unsafeKeys.has(key)) throw new Error(`Reserved key "${key}".`);
        if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Numbers must be finite.');
        return value;
    }));
    record(batch, 'batch');
    keys(batch, ['commands']);
    if (!Array.isArray(batch.commands) || !batch.commands.length || batch.commands.length > 1000) throw new Error('commands must contain 1–1000 commands.');
    const staging = createPrefabStore(initial);
    const document = createPrefabDocumentApi(staging);
    const changed = new Set<string>();
    const created: string[] = [], removed: string[] = [];
    document.batch(() => batch.commands.forEach((raw: unknown, index: number) => {
        try {
            const command = record(raw, 'command');
            if (!Object.hasOwn(fields, command.op)) throw new Error(`Unknown operation "${command.op}".`);
            keys(command, ['op', ...fields[command.op as SceneCommand['op']]]);
            const state = staging.getState();
            const lookup = (value: unknown) => {
                id(value);
                if (!Object.hasOwn(state.nodesById, value)) throw new Error(`Node "${value}" does not exist.`);
                return state.nodesById[value];
            };
            const update = (node: GameObject) => {
                if (JSON.stringify(state.nodesById[node.id]) !== JSON.stringify(node)) document.update(node.id, () => node);
            };
            if (command.op === 'replace') {
                const prefab = record(command.prefab, 'prefab');
                keys(prefab, ['id', 'name', 'root', 'materials']);
                if (prefab.id !== undefined) id(prefab.id);
                if (prefab.name !== undefined && typeof prefab.name !== 'string') throw new Error('Invalid prefab name.');
                validateNode(prefab.root, new Set());
                if (prefab.materials !== undefined) {
                    for (const [key, value] of Object.entries(record(prefab.materials, 'materials'))) { id(key); material(value); }
                }
                removed.push(...Object.keys(state.nodesById));
                document.replace(prefab as unknown as Prefab);
                created.push(...Object.keys(staging.getState().nodesById));
                changed.add(staging.getState().rootId);
                return;
            }
            if (command.op === 'add') {
                lookup(command.parentId);
                validateNode(command.node, new Set(), state.nodesById);
                document.add(command.node, command.parentId);
                created.push(...collectSubtreeIds(command.node.id, staging.getState().childIdsById));
                changed.add(command.node.id);
                return;
            }
            if (command.op === 'material' || command.op === 'patchMaterial') {
                id(command.id);
                if (command.op === 'patchMaterial' && !Object.hasOwn(state.materials, command.id)) throw new Error(`Material "${command.id}" does not exist.`);
                const next = command.op === 'material' ? command.material : { ...state.materials[command.id], ...record(command.patch, 'patch') };
                material(next);
                if (JSON.stringify(next) !== JSON.stringify(state.materials[command.id])) document.setMaterial(command.id, next);
                changed.add(command.id);
                return;
            }
            const node = lookup(command.id);
            const parentId = state.parentIdById[node.id];
            switch (command.op) {
                case 'replaceNode': {
                    const replaced = new Set(collectSubtreeIds(node.id, state.childIdsById));
                    const replacementIds = new Set<string>();
                    validateNode(command.node, replacementIds);
                    for (const replacementId of replacementIds) {
                        if (!replaced.has(replacementId) && Object.hasOwn(state.nodesById, replacementId)) {
                            throw new Error(`Duplicate node ID "${replacementId}".`);
                        }
                    }
                    document.replaceNode(node.id, command.node);
                    removed.push(...replaced);
                    created.push(...replacementIds);
                    changed.add(command.node.id);
                    break;
                }
                case 'update': nodePatch(command.patch); update({ ...node, ...command.patch }); break;
                case 'remove':
                    if (!parentId) throw new Error('Cannot remove the scene root.');
                    removed.push(...collectSubtreeIds(node.id, state.childIdsById));
                    document.remove(node.id);
                    break;
                case 'duplicate': {
                    id(command.newId);
                    const destination = command.parentId ?? parentId;
                    lookup(destination);
                    const copy = (sourceId: string): GameObject => ({
                        ...structuredClone(state.nodesById[sourceId]),
                        id: sourceId === node.id ? command.newId : `${command.newId}/${sourceId}`,
                        children: state.childIdsById[sourceId].map(copy),
                    });
                    const duplicated = copy(node.id);
                    validateNode(duplicated, new Set(), state.nodesById);
                    document.add(duplicated, destination);
                    created.push(...collectSubtreeIds(duplicated.id, staging.getState().childIdsById));
                    changed.add(duplicated.id);
                    return;
                }
                case 'move': {
                    if (!parentId) throw new Error('Cannot move the scene root.');
                    lookup(command.parentId);
                    let ancestor: string | null = command.parentId;
                    while (ancestor) {
                        if (ancestor === node.id) throw new Error('Cannot move a node into its own subtree.');
                        ancestor = state.parentIdById[ancestor];
                    }
                    if (parentId !== command.parentId) document.move(node.id, command.parentId, 'inside');
                    break;
                }
                case 'patchComponent':
                case 'component': {
                    id(command.key);
                    const components = { ...node.components };
                    if (command.op === 'patchComponent') {
                        const current = components[command.key];
                        if (!current) throw new Error(`Component "${command.key}" does not exist.`);
                        const properties = { ...current.properties, ...record(command.properties, 'properties') };
                        if (command.unset !== undefined) {
                            if (!Array.isArray(command.unset)) throw new Error('unset must be an array of property names.');
                            command.unset.forEach((key: unknown) => {
                                id(key);
                                if (Object.hasOwn(command.properties, key)) throw new Error(`Cannot patch and unset "${key}" together.`);
                                if (!Object.hasOwn(getComponents()[current.type]?.properties ?? {}, key)) throw new Error(`Unknown property "${key}".`);
                                delete properties[key];
                            });
                        }
                        components[command.key] = { ...current, properties };
                    } else if (command.component === null) {
                        if (!Object.hasOwn(components, command.key)) throw new Error(`Component "${command.key}" does not exist.`);
                        delete components[command.key];
                    } else {
                        component(command.component);
                        components[command.key] = command.component;
                    }
                    validateNode({ ...node, components }, new Set());
                    update({ ...node, components });
                    break;
                }
                case 'transform': {
                    if (command.space !== undefined && command.space !== 'local' && command.space !== 'world') throw new Error('space must be local or world.');
                    const properties: Record<string, Vec3> = {};
                    for (const key of ['position', 'rotation', 'scale']) {
                        if (command[key] !== undefined) { vector(command[key], key); properties[key] = command[key]; }
                        else if (command.space === 'world') throw new Error('World transforms require position, rotation and scale.');
                    }
                    if (!Object.keys(properties).length) throw new Error('Provide position, rotation or scale.');
                    if (command.space === 'world') {
                        const chain: GameObject[] = [];
                        let ancestor = parentId ? state.nodesById[parentId] : null;
                        while (ancestor) { chain.unshift(ancestor); ancestor = state.parentIdById[ancestor.id] ? state.nodesById[state.parentIdById[ancestor.id]!] : null; }
                        const parentWorld = new Matrix4();
                        for (const item of chain) {
                            const props = findComponentEntry(item, 'Transform')?.[1].properties;
                            parentWorld.multiply(composeTransform(props?.position, props?.rotation, props?.scale));
                        }
                        if (Math.abs(parentWorld.determinant()) < 1e-12) throw new Error('Parent world transform is not invertible.');
                        const local = parentWorld.invert().multiply(composeTransform(properties.position, properties.rotation, properties.scale));
                        const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
                        local.decompose(position, rotation, scale);
                        const reconstructed = new Matrix4().compose(position, rotation, scale);
                        if (local.elements.some((n, i) => !Number.isFinite(n) || !Number.isFinite(reconstructed.elements[i]) || Math.abs(n - reconstructed.elements[i]) > 1e-6 * Math.max(1, Math.abs(n)))) throw new Error('World transform introduces shear or a degenerate transform; use local space.');
                        const euler = new Euler().setFromQuaternion(rotation);
                        properties.position = position.toArray();
                        properties.rotation = [euler.x, euler.y, euler.z];
                        properties.scale = scale.toArray();
                    }
                    const entry = findComponentEntry(node, 'Transform');
                    const key = entry?.[0] ?? 'transform';
                    if (!entry && node.components?.[key]) throw new Error('The transform component key is already in use.');
                    update({ ...node, components: { ...node.components, [key]: { type: 'Transform', properties: { ...entry?.[1].properties, ...properties } } } });
                    break;
                }
            }
            changed.add(node.id);
        } catch (error) {
            throw new Error(`Command ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }));
    return { state: staging.getState(), result: { commandCount: batch.commands.length, changedIds: [...changed], createdIds: created, removedIds: removed } };
}

export const sceneCommandHelp = `Commands execute in order, atomically, as one undo step. Y up; XYZ Euler rotations in radians.
Local transforms are relative to parentId. World means prefab document space including its root, not external host transforms.
Use describeComponents to discover registered property contracts, findNodes to search, and getNodes for targeted reads.
component and material replace their named entry; null component removes it. patchComponent shallow-merges properties; unset restores defaults. patchMaterial shallow-merges fields. Arrays and nested objects are replaced, not deep-merged.
move keeps local transforms. duplicate uses newId for the root and newId/originalId for descendants; component reference strings are preserved, not remapped.
World transforms require position, rotation and scale; singular parents and shear are rejected.
Applying changes the live scene. Persistence requires a host-provided save callback. Use the latest scene revision as expectedRevision.`;
