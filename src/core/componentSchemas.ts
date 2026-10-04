import { getComponents, getComponentDefaultProperties, getComponentRegistryVersion } from './ComponentRegistry.js';

export type JsonSchema = Record<string, unknown>;

/** Uses the runtime registry, including custom components; never serializes functions. */
export function describeSceneComponents({ names, properties = {} }: { names?: string[]; properties?: Record<string, Record<string, unknown>> } = {}) {
    const registry = getComponents();
    if (names !== undefined && (!Array.isArray(names) || names.length > 100 || !names.every(name => typeof name === 'string'))) throw new Error('names must contain at most 100 component names.');
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw new Error('properties must be an object keyed by component type.');
    const components = (names ?? Object.keys(registry)).map(name => {
        if (!Object.hasOwn(registry, name)) throw new Error(`Unknown component type "${name}".`);
        const component = registry[name];
        const summary = { name, description: component.description, slot: component.slot, ...(component.modifyGeometry ? { modifies: 'Geometry' } : {}) };
        if (!names) return summary;
        const supplied = properties[name] ?? {};
        if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new Error(`Invalid properties for ${name}.`);
        const defaults = getComponentDefaultProperties(component, supplied);
        const resolved = { ...defaults, ...supplied };
        const fields = Object.fromEntries(Object.entries(component.properties).map(([key, field]) => {
            const type = field.type ?? 'number';
            let schema: JsonSchema;
            if (type === 'select') schema = { type: 'string', enum: 'options' in field ? field.options.map(option => option.value) : [] };
            else if (type === 'vector2' || type === 'vector3') schema = { type: 'array', items: { type: 'number' }, minItems: type === 'vector2' ? 2 : 3, maxItems: type === 'vector2' ? 2 : 3 };
            else if (type.endsWith('[]')) schema = { type: 'array', items: { type: type.slice(0, -2) } };
            else schema = { type: type === 'color' ? 'string' : type };
            if ('min' in field) schema.minimum = field.min;
            if ('max' in field) schema.maximum = field.max;
            return [key, {
                ...schema,
                ...(typeof field.schema === 'function' ? field.schema(resolved) : field.schema),
                title: field.label ?? key,
                ...(field.description ? { description: field.description } : {}),
                default: defaults[key],
                ...(typeof field.default === 'function' ? { 'x-dynamicDefault': true } : {}),
            }];
        }));
        return { ...summary, schema: { type: 'object', properties: fields, additionalProperties: false }, defaults };
    });
    return JSON.parse(JSON.stringify({ registryRevision: getComponentRegistryVersion(), components })) as {
        registryRevision: number;
        components: { name: string; description?: string; slot?: string; modifies?: string; schema?: JsonSchema; defaults?: Record<string, unknown> }[];
    };
}
