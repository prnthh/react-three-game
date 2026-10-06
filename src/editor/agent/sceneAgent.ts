import type { AssetManifest } from '../../runtime/assets/assetManifest.js';
import { analyzeSceneAuthoring } from './sceneAuthoringAdvice.js';
import { Euler, Quaternion, Vector3 } from 'three';
import { sceneAgentHelp } from './sceneAgentHelp.js';
import { getComponent, resolveComponentProperties } from '../../core/ComponentRegistry.js';
import { describeSceneComponents } from '../../core/componentSchemas.js';
import { sceneCommandsSchema, sceneCommandFields } from '../../core/sceneCommandSchema.js';
import { evaluateSceneCommandState, sceneCommandHelp, type SceneCommand, type SceneCommandBatch } from '../../core/sceneCommands.js';
import { collectSubtreeIds, denormalizePrefab, type PrefabState } from '../../core/prefab.js';
import type { PrefabStoreApi } from "../../core/prefabStore.js";
import { findComponentEntry, type ComponentData, type Prefab } from '../../core/types.js';
import { composeTransform, computeParentWorldMatrix } from "../../core/transforms.js";
import { extractPrefab, packPrefabNode, unpackPrefabNode } from '../prefabPacking.js';

export interface SceneView { position: [number, number, number]; target: [number, number, number] }
export interface SceneCaptureOptions {
    mode?: 'default' | 'unlit' | 'wireframe';
    /** Hide editor-only guides without entering play mode or resetting the scene. */
    helpers?: boolean;
    fov?: number;
    position?: [number, number, number];
    target?: [number, number, number];
}

export interface SceneAgentHost {
    loadAssetManifest?(): Promise<AssetManifest>;
    loadPrefab?(url: string): Promise<Prefab>;
    getBounds?(id: string): { min: number[]; max: number[]; size: number[]; center: number[] } | null;
    setMode?(mode: 'edit' | 'play'): void | Promise<void>;
    resetScene?(): void | Promise<void>;
    setSelection?(id: string | null): void;
    getView?(): SceneView;
    setView?(view: SceneView): void;
    mode(): string;
    selectedId(): string | null;
    transaction(action: () => void): void;
    beforeCommit(): void;
    undo(): void;
    redo(): void;
    history(): { canUndo: boolean; canRedo: boolean };
    captureView(options?: SceneCaptureOptions): Promise<{ mimeType: 'image/png'; dataUrl: string; width: number; height: number }>;
    exportGLB?(filename: string): Promise<void>;
    screenshot?(filename: string): Promise<void>;
    focusNode(id: string): void;
    canSave(): boolean;
    save(prefab: Prefab): Promise<void>;
}
export interface SceneSearchOptions { query?: string; component?: string; parentId?: string; offset?: number; limit?: number; recursive?: boolean; groupsOnly?: boolean }
export interface SceneGetManyOptions { ids: string[]; depth?: number; limit?: number; resolved?: boolean }
export interface SceneBatch extends SceneCommandBatch { expectedRevision: string }
type SceneAgentCommandInput<Op extends SceneCommand['op']> = Omit<Extract<SceneCommand, { op: Op }>, 'op'> & { expectedRevision?: string };
export interface UpdateSceneNode {
    id: string;
    expectedRevision?: string;
    patch?: Extract<SceneCommand, { op: 'update' }>['patch'];
    transform?: Omit<Extract<SceneCommand, { op: 'transform' }>, 'op' | 'id'>;
    components?: Record<string, ComponentData | null | { properties: Record<string, unknown>; unset?: string[] }>;
}

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
function vector(value: unknown, name: string): asserts value is [number, number, number] {
    if (!Array.isArray(value) || value.length !== 3 || !value.every(n => typeof n === 'number' && Number.isFinite(n))) {
        throw new Error(`${name} must contain three finite numbers.`);
    }
}
function documentChanged(a: PrefabState, b: PrefabState) {
    return a.nodesById !== b.nodesById || a.materials !== b.materials || a.childIdsById !== b.childIdsById || a.parentIdById !== b.parentIdById || a.rootId !== b.rootId || a.prefabId !== b.prefabId || a.prefabName !== b.prefabName;
}
function nodeTransform(state: PrefabState, id: string) {
    const local = findComponentEntry(state.nodesById[id], 'Transform')?.[1].properties;
    const world = computeParentWorldMatrix(state, id).multiply(composeTransform(local?.position, local?.rotation, local?.scale));
    const position = new Vector3(), quaternion = new Quaternion(), scale = new Vector3();
    world.decompose(position, quaternion, scale);
    const rotation = new Euler().setFromQuaternion(quaternion);
    const clean = (values: number[]) => values.map(value => Math.abs(value) < 1e-12 ? 0 : value);
    return {
        local: {
            position: [...(local?.position ?? [0, 0, 0])], rotation: [...(local?.rotation ?? [0, 0, 0])], scale: [...(local?.scale ?? [1, 1, 1])],
        },
        world: { position: clean(position.toArray()), rotation: clean([rotation.x, rotation.y, rotation.z]), scale: clean(scale.toArray()) },
    };
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
    const evaluate = (input: SceneBatch) => {
        options(input, ['commands', 'expectedRevision']);
        const current = checkRevision(input.expectedRevision);
        return { ...evaluateSceneCommandState(current.state, { commands: input.commands }), before: current.state, revision: current.revision };
    };
    const download = async (kind: 'exportGLB' | 'screenshot', input: { filename?: string }) => {
        options(input, ['filename']);
        const { revision } = snapshot();
        const filename = input.filename ?? (kind === 'exportGLB' ? 'scene.glb' : 'screenshot.png');
        if (typeof filename !== 'string' || !filename.trim() || /[\\/\x00-\x1f]/.test(filename) || filename === '.' || filename === '..') {
            throw new Error('filename must be a nonempty file name without a directory path.');
        }
        const host = getHost();
        const action = host[kind];
        if (!action) throw new Error(`${kind} download is not configured for this editor.`);
        await action.call(host, filename);
        return { downloadRequested: true, filename,
            mimeType: kind === 'exportGLB' ? 'model/gltf-binary' : 'image/png',
            revision, currentRevision: snapshot().revision };
    };
    const applyOne = <Op extends SceneCommand['op']>(op: Op, input: SceneAgentCommandInput<Op>) => {
        options(input, ['expectedRevision', ...sceneCommandFields[op]]);
        const { expectedRevision, ...fields } = input;
        return scene.batch({
            expectedRevision: expectedRevision ?? snapshot().revision,
            commands: [{ op, ...fields } as unknown as SceneCommand],
        });
    };
    const scene = {
        help() {
            snapshot();
            return structuredClone(sceneAgentHelp);
        },
        analyze() {
            const { state, revision } = snapshot();
            return { revision, ...analyzeSceneAuthoring(state) };
        },
        info() {
            const { state, revision } = snapshot();
            return { revision, rootId: state.rootId, name: state.prefabName, mode: getHost().mode(), selectedId: getHost().selectedId(), nodeCount: Object.keys(state.nodesById).length, ...getHost().history(), saveMethod: getHost().canSave() ? 'save' as const : 'exportJSON' as const };
        },
        commands() {
            snapshot();
            return { instructions: sceneCommandHelp, schema: structuredClone(sceneCommandsSchema) };
        },
        components(input: Parameters<typeof describeSceneComponents>[0] = {}) {
            snapshot();
            options(input, ['names', 'properties']);
            return describeSceneComponents(input);
        },
        search(input: SceneSearchOptions = {}) {
            options(input, ['query', 'component', 'parentId', 'offset', 'limit', 'recursive', 'groupsOnly']);
            const { state, revision } = snapshot();
            const offset = integer(input.offset, 0, 0, Number.MAX_SAFE_INTEGER), limit = integer(input.limit, 50, 1, 200);
            for (const key of ['query', 'component', 'parentId'] as const) if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(`${key} must be a string.`);
            if (input.parentId !== undefined) lookup(state, input.parentId);
            for (const key of ['recursive', 'groupsOnly'] as const) if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new Error(`${key} must be boolean.`);
            const candidates = input.parentId === undefined ? Object.keys(state.nodesById) : input.recursive ? collectSubtreeIds(input.parentId, state.childIdsById).slice(1) : state.childIdsById[input.parentId];
            const matches = candidates.filter(id => {
                const node = state.nodesById[id];
                return (!input.groupsOnly || state.childIdsById[id].length > 0) && (!input.query || `${node.name ?? ''}\n${id}`.toLowerCase().includes(input.query.toLowerCase()))
                    && (!input.component || Object.values(node.components ?? {}).some(component => component?.type === input.component));
            });
            return {
                revision, total: matches.length, nextOffset: offset + limit < matches.length ? offset + limit : null,
                nodes: matches.slice(offset, offset + limit).map(id => {
                    const node = state.nodesById[id];
                    return { id, name: node.name, parentId: state.parentIdById[id], childCount: state.childIdsById[id].length,
                        hidden: node.hidden ?? false, disabled: node.disabled ?? false, locked: node.locked ?? false,
                        ...nodeTransform(state, id), components: Object.entries(node.components ?? {}).filter(([, value]) => value).map(([key, value]) => ({ key, type: value!.type })) };
                }),
            };
        },
        find(input: Omit<SceneSearchOptions, 'offset' | 'limit'>) {
            options(input, ['query', 'component', 'parentId', 'recursive', 'groupsOnly']);
            const result = scene.search({ ...input, limit: 2 });
            if (result.total === 0) throw new Error('No nodes matched. Use search to broaden the query.');
            if (result.total !== 1) throw new Error(`${result.total} nodes matched. Use search and choose an ID.`);
            return { revision: result.revision, node: result.nodes[0] };
        },
        get(input: { id: string; depth?: number; resolved?: boolean }) {
            options(input, ['id', 'depth', 'resolved']);
            if (typeof input.id !== 'string' || !input.id) throw new Error('id must be a nonempty string.');
            const result = scene.getMany({ ids: [input.id], depth: input.depth, resolved: input.resolved });
            return { revision: result.revision, node: result.nodes[0], descendants: result.nodes.slice(1), truncated: result.truncated };
        },
        getMany(input: SceneGetManyOptions) {
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
        exportPrefab(input: { id: string }) {
            options(input, ['id']);
            const { state, revision } = snapshot();
            lookup(state, input.id);
            return { revision, prefab: extractPrefab(state, input.id) };
        },
        pack(input: { id: string; expectedRevision?: string }) {
            options(input, ['id', 'expectedRevision']); requireEdit();
            const { state, revision } = input.expectedRevision === undefined ? snapshot() : checkRevision(input.expectedRevision);
            lookup(state, input.id);
            const { node } = packPrefabNode(state, input.id);
            return scene.batch({ expectedRevision: revision, commands: [{ op: 'replaceNode', id: input.id, node }] });
        },
        packMany(input: { ids: string[]; reuse?: boolean; expectedRevision?: string }) {
            options(input, ['ids', 'reuse', 'expectedRevision']); requireEdit(); ids(input.ids);
            if (input.reuse !== undefined && typeof input.reuse !== 'boolean') throw new Error('reuse must be boolean.');
            const { state, revision } = input.expectedRevision === undefined ? snapshot() : checkRevision(input.expectedRevision);
            const selected = new Set(input.ids);
            if (selected.size !== input.ids.length) throw new Error('ids must be unique.');
            for (const id of input.ids) {
                lookup(state, id);
                for (let parent = state.parentIdById[id]; parent; parent = state.parentIdById[parent]) {
                    if (selected.has(parent)) throw new Error('Pack either an ancestor or its descendants in one batch, not both.');
                }
            }
            const definitions = new Map<string, { url: string; id: string }>();
            const reused: { id: string; sourceId: string }[] = [];
            // Ignore display names and document identities only. Custom component property values remain exact.
            const shape = (node: import('../../core/types.js').GameObject): unknown => ({
                components: node.components ?? {}, hidden: node.hidden ?? false, disabled: node.disabled ?? false, locked: node.locked ?? false,
                children: (node.children ?? []).map(shape),
            });
            const commands = input.ids.map((id): SceneCommand => {
                const { node, prefab } = packPrefabNode(state, id);
                const ref = findComponentEntry(node, 'PrefabRef')![1];
                const signature = JSON.stringify(shape(prefab.root));
                const previous = definitions.get(signature);
                if (input.reuse && previous) {
                    ref.properties.url = previous.url;
                    reused.push({ id, sourceId: previous.id });
                } else definitions.set(signature, { id, url: ref.properties.url });
                return { op: 'replaceNode', id, node };
            });
            return { ...scene.batch({ expectedRevision: revision, commands }), reused };
        },
        async unpack(input: { id: string; expectedRevision?: string }) {
            options(input, ['id', 'expectedRevision']); requireEdit();
            const { state, revision } = input.expectedRevision === undefined ? snapshot() : checkRevision(input.expectedRevision);
            const original = lookup(state, input.id);
            const url = findComponentEntry(original, 'PrefabRef')?.[1].properties.url;
            if (typeof url !== 'string' || !url) throw new Error('Node has no populated PrefabRef URL.');
            const load = getHost().loadPrefab;
            if (!load) throw new Error('Prefab loading is not configured for this editor.');
            const prefab = await load(url);
            // Reject intervening edits after asynchronous loading; never overwrite a newer document.
            checkRevision(revision);
            const placement = denormalizePrefab({ ...state, rootId: input.id }).root;
            const { node } = unpackPrefabNode(placement, prefab, `${input.id}:${crypto.randomUUID()}`);
            return scene.batch({ expectedRevision: revision, commands: [
                { op: 'replaceNode', id: input.id, node },
            ] });
        },
        bounds(input: { id: string }) {
            options(input, ['id']);
            const { state, revision } = snapshot();
            lookup(state, input.id);
            const measure = getHost().getBounds;
            if (!measure) throw new Error('Live bounds are not configured for this editor.');
            return { revision, space: 'world' as const, source: 'live-render' as const, bounds: measure(input.id) };
        },
        async assets(input: { type?: 'model' | 'texture' | 'sound' | 'prefab'; query?: string; offset?: number; limit?: number } = {}) {
            options(input, ['type', 'query', 'offset', 'limit']);
            snapshot();
            const groups = { model: 'models', texture: 'textures', sound: 'sound', prefab: 'prefabs' } as const;
            if (input.type !== undefined && !Object.hasOwn(groups, input.type)) throw new Error('Unknown asset type. Use model, texture, sound, or prefab.');
            if (input.query !== undefined && typeof input.query !== 'string') throw new Error('Asset query must be a string.');
            const offset = integer(input.offset, 0, 0, Number.MAX_SAFE_INTEGER);
            const limit = integer(input.limit, 50, 1, 200);
            const load = getHost().loadAssetManifest;
            if (!load) throw new Error('Asset discovery is not configured for this editor.');
            const manifest = await load();
            snapshot();
            const query = input.query?.trim().toLowerCase() ?? '';
            const assets = (Object.keys(groups) as (keyof typeof groups)[])
                .filter(type => !input.type || type === input.type)
                .flatMap(type => manifest[groups[type]].filter(path => path.toLowerCase().includes(query)).map(path => ({ type, path })));
            return { assets: assets.slice(offset, offset + limit), total: assets.length,
                nextOffset: offset + limit < assets.length ? offset + limit : null };
        },
        materials(input: { ids?: string[]; offset?: number; limit?: number } = {}) {
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
            return { revision, materials: names.slice(offset, offset + limit).map(id => ({ id, name: id })), nextOffset: offset + limit < names.length ? offset + limit : null };
        },
        validate(input: SceneBatch) {
            const evaluated = evaluate(input);
            return { ...evaluated.result, advisories: analyzeSceneAuthoring(evaluated.state).advisories, revision: evaluated.revision, changed: documentChanged(evaluated.before, evaluated.state) };
        },
        batch(input: SceneBatch) {
            requireEdit();
            const evaluated = evaluate(input);
            const changed = documentChanged(evaluated.before, evaluated.state);
            if (changed) {
                getHost().beforeCommit();
                getHost().transaction(() => store.getState().restoreState(evaluated.state));
            }
            return { ...evaluated.result, advisories: analyzeSceneAuthoring(evaluated.state).advisories, changed, revision: snapshot().revision };
        },
        create(input: SceneAgentCommandInput<'add'>) { return applyOne('add', input); },
        update(input: UpdateSceneNode) {
            options(input, ['id', 'expectedRevision', 'patch', 'transform', 'components']);
            if (typeof input.id !== 'string' || !input.id) throw new Error('id must be a nonempty string.');
            const commands: SceneCommand[] = [];
            if (input.patch !== undefined) commands.push({ op: 'update', id: input.id, patch: input.patch });
            if (input.transform !== undefined) commands.push({ op: 'transform', id: input.id, ...input.transform });
            if (input.components !== undefined) {
                if (!input.components || typeof input.components !== 'object' || Array.isArray(input.components)) throw new Error('components must be an object keyed by component instance key.');
                for (const [key, value] of Object.entries(input.components)) {
                    if (value === null || Object.hasOwn(value, 'type')) commands.push({ op: 'component', id: input.id, key, component: value as ComponentData | null });
                    else commands.push({ op: 'patchComponent', id: input.id, key, ...value });
                }
            }
            if (!commands.length) throw new Error('Provide patch, transform or components.');
            return scene.batch({ expectedRevision: input.expectedRevision ?? snapshot().revision, commands });
        },
        remove(input: SceneAgentCommandInput<'remove'>) { return applyOne('remove', input); },
        replace(input: SceneAgentCommandInput<'replaceNode'>) { return applyOne('replaceNode', input); },
        replaceAll(input: SceneAgentCommandInput<'replace'>) { return applyOne('replace', input); },
        move(input: SceneAgentCommandInput<'move'>) { return applyOne('move', input); },
        transform(input: SceneAgentCommandInput<'transform'>) { return applyOne('transform', input); },
        setComponent(input: SceneAgentCommandInput<'component'>) { return applyOne('component', input); },
        patchComponent(input: SceneAgentCommandInput<'patchComponent'>) { return applyOne('patchComponent', input); },
        duplicate(input: SceneAgentCommandInput<'duplicate'>) { return applyOne('duplicate', input); },
        async setMode(input: { mode: 'edit' | 'play' }) {
            options(input, ['mode']); snapshot();
            if (input.mode !== 'edit' && input.mode !== 'play') throw new Error('mode must be edit or play.');
            const host = getHost();
            if (!host.setMode) throw new Error('Mode control is not configured.');
            await host.setMode(input.mode);
            return { mode: getHost().mode() };
        },
        async reset() {
            snapshot();
            const host = getHost();
            if (!host.resetScene) throw new Error('Scene reset is not configured.');
            await host.resetScene();
            return { resetRequested: true, revision: snapshot().revision };
        },
        select(input: { id: string | null }) {
            options(input, ['id']); requireEdit();
            if (input.id !== null) {
                const node = lookup(snapshot().state, input.id);
                if (node.locked) throw new Error('Cannot select a locked node.');
            }
            const host = getHost();
            if (!host.setSelection) throw new Error('Selection control is not configured.');
            host.setSelection(input.id);
            return { selectedId: input.id };
        },
        getCamera() {
            snapshot();
            const host = getHost();
            if (!host.getView) throw new Error('Camera control is not configured.');
            return structuredClone(host.getView());
        },
        setCamera(input: SceneView) {
            options(input, ['position', 'target']); requireEdit();
            for (const value of [input.position, input.target]) {
                if (!Array.isArray(value) || value.length !== 3 || !value.every(n => typeof n === 'number' && Number.isFinite(n))) throw new Error('View vectors must contain three finite numbers.');
            }
            if (input.position.every((n, i) => n === input.target[i])) throw new Error('View position and target must differ.');
            const host = getHost();
            if (!host.setView) throw new Error('Camera control is not configured.');
            host.setView(structuredClone(input));
            return scene.getCamera();
        },
        undo(input: { expectedRevision?: string } = {}) {
            options(input, ['expectedRevision']); requireEdit(); if (input.expectedRevision !== undefined) checkRevision(input.expectedRevision); getHost().undo();
            return scene.info();
        },
        redo(input: { expectedRevision?: string } = {}) {
            options(input, ['expectedRevision']); requireEdit(); if (input.expectedRevision !== undefined) checkRevision(input.expectedRevision); getHost().redo();
            return scene.info();
        },
        look(input: { id: string }) {
            options(input, ['id']); requireEdit(); lookup(snapshot().state, input.id); getHost().focusNode(input.id);
            return { nodeId: input.id };
        },
        async capture(input: SceneCaptureOptions = {}) {
            options(input, ['mode', 'fov', 'position', 'target', 'helpers']);
            if (input.helpers !== undefined && typeof input.helpers !== 'boolean') throw new Error('helpers must be boolean.');
            const mode = input.mode ?? 'default';
            if (!['default', 'unlit', 'wireframe'].includes(mode)) throw new Error('mode must be default, unlit or wireframe.');
            if (input.fov !== undefined && (!Number.isFinite(input.fov) || input.fov < 1 || input.fov > 179)) throw new Error('fov must be between 1 and 179.');
            if (input.position !== undefined) vector(input.position, 'position');
            if (input.target !== undefined) vector(input.target, 'target');
            if (input.position && input.target && input.position.every((n, i) => n === input.target![i])) throw new Error('Capture position and target must differ.');
            const { revision } = snapshot();
            const capture = structuredClone({ ...input, mode });
            const image = await getHost().captureView(capture);
            return { ...image, capture, revision, currentRevision: snapshot().revision };
        },
        downloadGLB(input: { filename?: string } = {}) {
            return download('exportGLB', input);
        },
        downloadScreenshot(input: { filename?: string } = {}) {
            return download('screenshot', input);
        },
        export() {
            const { state, revision } = snapshot();
            return { revision, prefab: denormalizePrefab(state) };
        },
        exportJSON() {
            const { state } = snapshot();
            return JSON.stringify(denormalizePrefab(state), null, 2);
        },
        async save(input: { expectedRevision?: string } = {}) {
            options(input, ['expectedRevision']); requireEdit();
            const { state, revision } = input.expectedRevision === undefined ? snapshot() : checkRevision(input.expectedRevision);
            if (!getHost().canSave()) throw new Error('No host save callback is configured. Use exportJSON() and replace the source scene file.');
            await getHost().save(denormalizePrefab(state));
            return { savedRevision: revision, currentRevision: snapshot().revision };
        },
    };
    return { scene, activate() { active = true; }, dispose() { active = false; } };
}
export type SceneAgent = ReturnType<typeof createSceneAgent>['scene'];
