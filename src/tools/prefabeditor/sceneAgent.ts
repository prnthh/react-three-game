import { analyzeSceneAuthoring } from './sceneAuthoringAdvice';
import { sceneAgentHelp } from './sceneAgentHelp';
import { getComponent, resolveComponentProperties } from './components/ComponentRegistry';
import { describeSceneComponents } from './componentSchemas';
import { sceneCommandsSchema } from './sceneCommandSchema';
import { evaluateSceneCommandState, sceneCommandHelp, type SceneCommandBatch } from './sceneCommands';
import { denormalizePrefab, type PrefabState } from './prefab';
import type { PrefabStoreApi } from './prefabStore';
import type { Prefab } from './types';

export interface SceneAgentHost {
    mode(): string;
    selectedId(): string | null;
    transaction(action: () => void): void;
    beforeCommit(): void;
    undo(): void;
    redo(): void;
    history(): { canUndo: boolean; canRedo: boolean };
    captureView(): Promise<{ mimeType: 'image/png'; dataUrl: string; width: number; height: number }>;
    focusNode(id: string): void;
    canSave(): boolean;
    save(prefab: Prefab): Promise<void>;
}
export interface FindSceneNodes { name?: string; component?: string; parentId?: string; offset?: number; limit?: number }
export interface GetSceneNodes { ids: string[]; depth?: number; limit?: number; resolved?: boolean }
export interface SceneAgentBatch extends SceneCommandBatch { expectedRevision: string }

function options(value: unknown, allowed: string[]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an options object.');
    for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown option "${key}".`);
}
function integer(value: number | undefined, fallback: number, min: number, max: number) {
    const result = value ?? fallback;
    if (!Number.isInteger(result) || result < min || result > max) throw new Error(`Expected an integer between ${min} and ${max}.`);
    return result;
}
function ids(value: unknown): asserts value is string[] {
    if (!Array.isArray(value) || !value.length || value.length > 200 || !value.every(id => typeof id === 'string' && id.length > 0)) throw new Error('ids must contain 1–200 nonempty strings.');
}
function documentChanged(a: PrefabState, b: PrefabState) {
    return a.nodesById !== b.nodesById || a.materials !== b.materials || a.childIdsById !== b.childIdsById || a.parentIdById !== b.parentIdById || a.rootId !== b.rootId || a.prefabId !== b.prefabId || a.prefabName !== b.prefabName;
}

/** Transport-independent, scoped to one mounted editor. Returned data never aliases store data. */
export function createSceneAgent(store: PrefabStoreApi, getHost: () => SceneAgentHost) {
    const session = crypto.randomUUID();
    let sequence = 0;
    let previous = store.getState();
    let active = true;
    const snapshot = () => {
        if (!active) throw new Error('This editor is no longer mounted. Discover the current editor again.');
        const state = store.getState();
        if (documentChanged(previous, state)) { sequence++; previous = state; }
        return { state, revision: `${session}:${sequence}` };
    };
    const checkRevision = (expected: string) => {
        const current = snapshot();
        if (typeof expected !== 'string' || expected !== current.revision) throw new Error(`Scene revision conflict. Read the affected nodes again. Current revision: ${current.revision}`);
        return current;
    };
    const requireEdit = () => {
        snapshot();
        if (getHost().mode() !== 'edit') throw new Error('Scene edits require edit mode.');
    };
    const lookup = (state: PrefabState, id: string) => {
        if (typeof id !== 'string' || !Object.hasOwn(state.nodesById, id)) throw new Error(`Node "${id}" does not exist.`);
        return state.nodesById[id];
    };
    const evaluate = (input: SceneAgentBatch) => {
        options(input, ['commands', 'expectedRevision']);
        const current = checkRevision(input.expectedRevision);
        return { ...evaluateSceneCommandState(current.state, { commands: input.commands }), before: current.state, revision: current.revision };
    };
    const api = {
        help() {
            snapshot();
            return structuredClone(sceneAgentHelp);
        },
        analyzeScene() {
            const { state, revision } = snapshot();
            return { revision, ...analyzeSceneAuthoring(state) };
        },
        getSceneInfo() {
            const { state, revision } = snapshot();
            return { revision, rootId: state.rootId, name: state.prefabName, mode: getHost().mode(), selectedId: getHost().selectedId(), nodeCount: Object.keys(state.nodesById).length, ...getHost().history(), canSave: getHost().canSave() };
        },
        describeCommands() {
            snapshot();
            return { instructions: sceneCommandHelp, schema: structuredClone(sceneCommandsSchema) };
        },
        describeComponents(input: Parameters<typeof describeSceneComponents>[0] = {}) {
            snapshot();
            options(input, ['names', 'properties']);
            return describeSceneComponents(input);
        },
        findNodes(input: FindSceneNodes = {}) {
            options(input, ['name', 'component', 'parentId', 'offset', 'limit']);
            const { state, revision } = snapshot();
            const offset = integer(input.offset, 0, 0, Number.MAX_SAFE_INTEGER), limit = integer(input.limit, 50, 1, 200);
            for (const key of ['name', 'component', 'parentId'] as const) if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(`${key} must be a string.`);
            if (input.parentId !== undefined) lookup(state, input.parentId);
            const candidates = input.parentId === undefined ? Object.keys(state.nodesById) : state.childIdsById[input.parentId];
            const matches = candidates.filter(id => {
                const node = state.nodesById[id];
                return (!input.name || `${node.name ?? ''}\n${id}`.toLowerCase().includes(input.name.toLowerCase()))
                    && (!input.component || Object.values(node.components ?? {}).some(component => component?.type === input.component));
            });
            return {
                revision, total: matches.length, nextOffset: offset + limit < matches.length ? offset + limit : null,
                nodes: matches.slice(offset, offset + limit).map(id => {
                    const node = state.nodesById[id];
                    return { id, name: node.name, parentId: state.parentIdById[id], childCount: state.childIdsById[id].length, components: Object.entries(node.components ?? {}).filter(([, value]) => value).map(([key, value]) => ({ key, type: value!.type })) };
                }),
            };
        },
        getNodes(input: GetSceneNodes) {
            options(input, ['ids', 'depth', 'limit', 'resolved']);
            ids(input.ids);
            if (input.resolved !== undefined && typeof input.resolved !== 'boolean') throw new Error('resolved must be boolean.');
            const { state, revision } = snapshot();
            input.ids.forEach(id => lookup(state, id));
            const depth = integer(input.depth, 0, 0, 5), limit = integer(input.limit, 100, 1, 200);
            const queue = input.ids.map(id => ({ id, depth: 0 }));
            const visited = new Set<string>();
            const nodes = [];
            let index = 0;
            while (index < queue.length && nodes.length < limit) {
                const item = queue[index++];
                if (visited.has(item.id)) continue;
                visited.add(item.id);
                const node = state.nodesById[item.id];
                const childIds = state.childIdsById[item.id];
                nodes.push({ ...node, parentId: state.parentIdById[item.id], childCount: childIds.length, childIds: childIds.slice(0, 200), childIdsTruncated: childIds.length > 200,
                    ...(input.resolved ? { resolvedComponents: Object.fromEntries(Object.entries(node.components ?? {}).filter(([, component]) => component).map(([key, component]) => [key, { type: component!.type, properties: resolveComponentProperties(getComponent(component!.type), component!.properties) }])) } : {}),
                });
                if (item.depth < depth) childIds.forEach(id => queue.push({ id, depth: item.depth + 1 }));
            }
            return structuredClone({ revision, nodes, truncated: index < queue.length });
        },
        getMaterials(input: { ids?: string[]; offset?: number; limit?: number } = {}) {
            options(input, ['ids', 'offset', 'limit']);
            const { state, revision } = snapshot();
            if (input.ids !== undefined) {
                ids(input.ids);
                const materials = input.ids.map(id => {
                    if (!Object.hasOwn(state.materials, id)) throw new Error(`Material "${id}" does not exist.`);
                    return { id, ...state.materials[id] };
                });
                return structuredClone({ revision, materials, nextOffset: null });
            }
            const offset = integer(input.offset, 0, 0, Number.MAX_SAFE_INTEGER), limit = integer(input.limit, 50, 1, 200);
            const names = Object.keys(state.materials);
            return { revision, materials: names.slice(offset, offset + limit).map(id => ({ id, name: state.materials[id].name })), nextOffset: offset + limit < names.length ? offset + limit : null };
        },
        validateBatch(input: SceneAgentBatch) {
            const evaluated = evaluate(input);
            return { ...evaluated.result, advisories: analyzeSceneAuthoring(evaluated.state).advisories, revision: evaluated.revision, changed: documentChanged(evaluated.before, evaluated.state) };
        },
        applyBatch(input: SceneAgentBatch) {
            requireEdit();
            const evaluated = evaluate(input);
            const changed = documentChanged(evaluated.before, evaluated.state);
            if (changed) {
                getHost().beforeCommit();
                getHost().transaction(() => store.getState().restoreState(evaluated.state));
            }
            return { ...evaluated.result, advisories: analyzeSceneAuthoring(evaluated.state).advisories, changed, revision: snapshot().revision };
        },
        undo(input: { expectedRevision: string }) {
            options(input, ['expectedRevision']); requireEdit(); checkRevision(input.expectedRevision); getHost().undo();
            return api.getSceneInfo();
        },
        redo(input: { expectedRevision: string }) {
            options(input, ['expectedRevision']); requireEdit(); checkRevision(input.expectedRevision); getHost().redo();
            return api.getSceneInfo();
        },
        focusNode(input: { id: string }) {
            options(input, ['id']); requireEdit(); lookup(snapshot().state, input.id); getHost().focusNode(input.id);
            return { focusedId: input.id };
        },
        async captureView() {
            const { revision } = snapshot();
            const image = await getHost().captureView();
            return { ...image, revision, currentRevision: snapshot().revision };
        },
        exportScene() {
            const { state, revision } = snapshot();
            return { revision, prefab: denormalizePrefab(state) };
        },
        async saveScene(input: { expectedRevision: string }) {
            options(input, ['expectedRevision']); requireEdit();
            const { state, revision } = checkRevision(input.expectedRevision);
            if (!getHost().canSave()) throw new Error('No host save callback is configured. Use exportScene to retrieve JSON, or the existing editor Save action.');
            await getHost().save(denormalizePrefab(state));
            return { savedRevision: revision, currentRevision: snapshot().revision };
        },
    };
    return { api, activate() { active = true; }, dispose() { active = false; } };
}
export type SceneAgentApi = ReturnType<typeof createSceneAgent>['api'];
