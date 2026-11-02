import { sceneAgentKnowledge, sceneApiOperations, type SceneApiOperation } from './sceneAgentKnowledge.js';
import type { JsonSchema } from '../../core/componentSchemas.js';
import { sceneCommandsSchema } from '../../core/sceneCommandSchema.js';
import type { SceneAgent } from './sceneAgent.js';

export type SceneToolResult = {
    content: ({ type: 'text'; text: string } | { type: 'image'; mimeType: string; data: string })[];
    isError?: boolean;
};
export interface SceneTool {
    name: string;
    title: string;
    description: string;
    inputSchema: JsonSchema;
    annotations: { readOnlyHint: boolean; untrustedContentHint: boolean; consequentialHint: boolean; debugging: boolean };
    execute(input: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<SceneToolResult>;
}
const object = (properties: Record<string, JsonSchema> = {}, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false });
const string: JsonSchema = { type: 'string', minLength: 1 };
const boolean: JsonSchema = { type: 'boolean' };
const vector: JsonSchema = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const ids: JsonSchema = { type: 'array', items: string, minItems: 1, maxItems: 200 };
const pagination = { offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 200 } };
const revision = { expectedRevision: { ...string, description: 'Revision from scene_info. A conflict rejects the edit without changes; required when listed in the tool’s required fields.' } };
type ToolDefinition = {
    name: string; title: string; description: string; methods: readonly SceneApiOperation[];
    schema: JsonSchema; readOnly: boolean;
    run: (scene: SceneAgent, args: any, options: { signal?: AbortSignal }) => unknown;
};
function define(name: string, { title, methods, usage }: Pick<ToolDefinition, 'title' | 'methods'> & { usage?: string },
    schema: JsonSchema, readOnly: boolean, run: ToolDefinition['run']): ToolDefinition {
    return { name: 'scene_' + name, title, methods, schema, readOnly, run,
        description: [...methods.map(method => sceneApiOperations[method].description), usage].filter(Boolean).join(' ') };
}

// Execution, discovery and workflow routes all use these definitions.
const definitions: ToolDefinition[] = [
    define('info', { title: "Inspect scene", methods: ["info"], usage: "includeGuide:true returns editor concepts, tool routing and tool-call examples." }, object({ includeGuide: boolean }), true,
        (scene, args) => args.includeGuide ? ({ ...scene.info(), guide: createSceneToolGuide() }) : scene.info()),
    define('search', { title: "Find objects", methods: ["search"] },
        object({ query: { type: 'string', description: 'Part of an object name or ID.' }, component: string, parentId: string,
            recursive: boolean, groupsOnly: boolean, ...pagination }), true, (scene, args) => scene.search(args)),
    define('get', { title: "Read objects", methods: ["getMany"] },
        object({ ids, depth: { type: 'integer', minimum: 0, maximum: 5 }, resolved: boolean, limit: pagination.limit }, ['ids']), true, (scene, args) => scene.getMany(args)),
    define('components', { title: "Browse components", methods: ["components"] },
        object({ names: { type: 'array', items: string, maxItems: 100 }, properties: { type: 'object', description: 'Optional properties keyed by component type for dynamic defaults.' } }), true, (scene, args) => scene.components(args)),
    define('assets', { title: "Browse assets", methods: ["assets"] },
        object({ type: { type: 'string', enum: ['model', 'texture', 'sound', 'prefab'] }, query: { type: 'string' }, ...pagination }), true, (scene, args) => scene.assets(args)),
    define('materials', { title: "Read materials", methods: ["materials"] },
        object({ ids, ...pagination }), true, (scene, args) => scene.materials(args)),
    define('update', { title: "Update object", methods: ["update"] },
        object({ id: string, patch: object({ name: { type: 'string' }, hidden: boolean, disabled: boolean, locked: boolean, packed: boolean }),
            transform: object({ space: { type: 'string', enum: ['local', 'world'] }, position: vector, rotation: vector, scale: vector }),
            components: { type: 'object', description: 'Keyed entries: {type,properties} replaces, {properties,unset?} patches, null removes.' }, ...revision }, ['id']), false, (scene, args) => scene.update(args)),
    define('load', { title: "Load scene URL", methods: ["load"], usage: "url and expectedRevision are required." },
        object({ url: { ...string, description: 'Scene JSON URL, resolved against the host basePath. Reads fresh data rather than the prefab cache.' }, ...revision }, ['url', 'expectedRevision']), false,
        (scene, args, options) => scene.load(args, options)),
    define('batch', { title: "Apply scene commands", methods: ["validate","batch"], usage: "expectedRevision is required. validateOnly:true validates without applying; otherwise apply the commands." },
        object({ commands: structuredClone(sceneCommandsSchema), expectedRevision: string, validateOnly: boolean }, ['commands', 'expectedRevision']), false,
        (scene, { validateOnly, ...args }) => validateOnly ? scene.validate(args) : scene.batch(args)),
    define('mode', { title: "Switch edit / play", methods: ["setMode"] },
        object({ mode: { type: 'string', enum: ['edit', 'play'] } }, ['mode']), false, (scene, args) => scene.setMode(args)),
    define('view', { title: "Navigate view", methods: ["getCamera","look","setCamera","select"], usage: "action: get reads the camera, focus frames id, set uses position and target, select selects id, clearSelection clears selection." },
        object({ action: { type: 'string', enum: ['get', 'focus', 'set', 'select', 'clearSelection'] }, id: string, position: vector, target: vector }, ['action']), false,
        (scene, args) => args.action === 'get' ? scene.getCamera() : args.action === 'focus' ? scene.look({ id: args.id })
            : args.action === 'select' ? scene.select({ id: args.id }) : args.action === 'clearSelection' ? scene.select({ id: null })
                : scene.setCamera({ position: args.position, target: args.target })),
    define('capture', { title: "Capture view", methods: ["capture"] },
        object({ mode: { type: 'string', enum: ['default', 'unlit', 'wireframe'] }, helpers: boolean,
            fov: { type: 'number', minimum: 1, maximum: 179 }, position: vector, target: vector }), true, (scene, args) => scene.capture(args)),
    define('history', { title: "Undo / redo", methods: ["undo","redo"], usage: "Choose action: undo or redo." },
        object({ action: { type: 'string', enum: ['undo', 'redo'] }, ...revision }, ['action']), false,
        (scene, { action, ...args }) => action === 'undo' ? scene.undo(args) : scene.redo(args)),
    define('prefab', { title: "Manage prefab", methods: ["pack","unpack","exportPrefab"], usage: "Choose action: pack, unpack or export; id is the assembly node." },
        object({ action: { type: 'string', enum: ['pack', 'unpack', 'export'] }, id: string, ...revision }, ['action', 'id']), false,
        (scene, { action, ...args }) => action === 'pack' ? scene.pack(args) : action === 'unpack' ? scene.unpack(args) : scene.exportPrefab({ id: args.id })),
    define('save', { title: "Export / save scene", methods: ["export","save"], usage: "action: export returns JSON; save invokes configured host persistence." },
        object({ action: { type: 'string', enum: ['export', 'save'] }, ...revision }, ['action']), false,
        (scene, { action, ...args }) => action === 'export' ? scene.export() : scene.save(args)),
];

/** Bind the tool definitions to one editor's validated API and shared undo history. */
export function createSceneTools(scene: SceneAgent): readonly SceneTool[] {
    return definitions.map<SceneTool>(({ name, title, description, schema, readOnly, run }) => ({
        name, title, description, inputSchema: structuredClone(schema),
        annotations: { readOnlyHint: readOnly, untrustedContentHint: true, consequentialHint: false, debugging: true },
        async execute(input = {}, options = {}) {
            options.signal?.throwIfAborted();
            try {
                if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Tool arguments must be an object.');
                const fields = schema.properties as Record<string, JsonSchema>;
                for (const key of Object.keys(input)) if (!Object.hasOwn(fields, key)) throw Error(`Unknown argument "${key}".`);
                for (const key of schema.required as string[]) if (input[key] === undefined) throw Error(`Missing argument "${key}".`);
                for (const [key, value] of Object.entries(input)) {
                    const field = fields[key];
                    if (field.enum && !(field.enum as unknown[]).includes(value)) throw Error(`Invalid ${key}. Use ${(field.enum as string[]).join(', ')}.`);
                    if (field.type === 'string' && (typeof value !== 'string' || (field.minLength && !value.length))) throw Error(`${key} must be a nonempty string.`);
                    if (field.type === 'boolean' && typeof value !== 'boolean') throw Error(`${key} must be boolean.`);
                    if ((field.type === 'number' || field.type === 'integer') && (typeof value !== 'number' || !Number.isFinite(value) || (field.type === 'integer' && !Number.isInteger(value)))) throw Error(`${key} must be ${field.type}.`);
                    if (field.type === 'array' && !Array.isArray(value)) throw Error(`${key} must be an array.`);
                    if (field.type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) throw Error(`${key} must be an object.`);
                }
                const result = await run(scene, input, options);
                if (readOnly) options.signal?.throwIfAborted();
                // Captures stay native image results, rather than a huge JSON data URL.
                if (result && typeof result === 'object' && 'dataUrl' in result && 'mimeType' in result) {
                    const { dataUrl, mimeType, ...metadata } = result as { dataUrl: string; mimeType: string; [key: string]: unknown };
                    const prefix = `data:${mimeType};base64,`;
                    if (!dataUrl.startsWith(prefix)) throw Error('Scene capture did not return a base64 image.');
                    return { content: [{ type: 'text', text: JSON.stringify(metadata) }, { type: 'image', mimeType, data: dataUrl.slice(prefix.length) }] };
                }
                return { content: [{ type: 'text', text: JSON.stringify(result ?? null) }] };
            } catch (error) {
                if (options.signal?.aborted) throw error;
                return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] };
            }
        },
    }));
}

/** The same knowledge as scene.help(), with callable tool names rather than JS snippets. */
export function createSceneToolGuide() {
    return structuredClone({
        ...sceneAgentKnowledge,
        workflow: sceneAgentKnowledge.workflow.map(step => ({ intent: step.intent,
            tools: definitions.filter(entry => entry.methods.some(method => step.methods.includes(method))).map(entry => entry.name) })),
        tools: Object.fromEntries(definitions.map(({ name, title, description }) => [name, { title, description }])),
        examples: [
            { intent: 'Inspect the current document', tool: 'scene_info', arguments: {} },
            { intent: 'Discover component names', tool: 'scene_components', arguments: {} },
            { intent: 'Read fields for known component types', tool: 'scene_components', arguments: { names: ['Geometry', 'Material'] } },
            { intent: 'Find existing objects', tool: 'scene_search', arguments: { query: 'wall', limit: 20 } },
            { intent: 'Move a known object; replace the placeholder with an ID from search', tool: 'scene_update', arguments: { id: '<node ID>', transform: { position: [4, 2, 0] } } },
            { intent: 'Frame a known object', tool: 'scene_view', arguments: { action: 'focus', id: '<node ID>' } },
            { intent: 'Capture without editor helpers', tool: 'scene_capture', arguments: { helpers: false } },
        ],
        discovery: 'The supplied tool input schemas define exact arguments. Component names, fields and defaults come from scene_components; batch command schemas are in scene_batch. The guide does not replace these schemas.',
    });
}
