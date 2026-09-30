import type { JsonSchema } from './componentSchemas';

const objectSchema = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false });
const string = { type: 'string', minLength: 1 };
const vector = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const properties = { type: 'object', description: 'Discover field names, types and defaults with describeComponents. Nested values and arrays replace the entire field.' };
const component = objectSchema({ type: string, properties }, ['type', 'properties']);
const nodeFields = { name: { type: 'string' }, hidden: { type: 'boolean' }, disabled: { type: 'boolean' }, locked: { type: 'boolean' } };
const operation = (op: string, fields: Record<string, JsonSchema>, required: string[]) => objectSchema({ op: { const: op }, ...fields }, ['op', ...required]);

export const sceneCommandsSchema: JsonSchema = {
    type: 'array', minItems: 1, maxItems: 1000,
    items: { oneOf: [
        operation('add', { parentId: string, node: { type: 'object', description: 'Prefab node: unique id, optional name/hidden/disabled/locked, components keyed by instance key ({type,properties}), and children array of nodes.', properties: { id: string, ...nodeFields, components: { type: 'object', additionalProperties: component }, children: { type: 'array', items: { type: 'object' } } }, required: ['id'], additionalProperties: false } }, ['parentId', 'node']),
        operation('update', { id: string, patch: objectSchema(nodeFields) }, ['id', 'patch']),
        operation('replaceNode', { id: string, node: { type: 'object', description: 'Complete replacement subtree, using the same node fields as add.' } }, ['id', 'node']),
        operation('replace', { prefab: { type: 'object', description: 'Complete prefab document: root, optional id, name and materials.' } }, ['prefab']),
        operation('remove', { id: string }, ['id']),
        operation('move', { id: string, parentId: string }, ['id', 'parentId']),
        operation('duplicate', { id: string, newId: string, parentId: string }, ['id', 'newId']),
        operation('transform', { id: string, space: { enum: ['local', 'world'], default: 'local' }, position: vector, rotation: vector, scale: vector }, ['id']),
        operation('component', { id: string, key: string, component: { anyOf: [component, { type: 'null' }] } }, ['id', 'key', 'component']),
        operation('patchComponent', { id: string, key: string, properties, unset: { type: 'array', items: string } }, ['id', 'key', 'properties']),
        operation('material', { id: string, material: { type: 'object', description: 'PrefabMaterial definition; replaces the named shared material.' } }, ['id', 'material']),
        operation('patchMaterial', { id: string, patch: { type: 'object', description: 'Shallow patch of an existing shared PrefabMaterial.' } }, ['id', 'patch']),
    ] },
};
