import { createExtensionRegistry } from '../extensionRegistry.js';
import { createContext, useContext, useSyncExternalStore, type ComponentType, type RefObject } from 'react';
import type { Camera } from 'three';
import type { OrbitControls } from 'three-stdlib';
import type { GameObject } from '../../core/types.js';

export type EditorToolViewportProps = { camera: Camera; controlsRef: RefObject<OrbitControls | null> };
export type EditorToolPanelProps = { canUndo: boolean; canRedo: boolean };
export interface EditorToolDefinition<Settings extends object = object> {
    id: string;
    label: string;
    supports: (node: GameObject) => boolean;
    createSettings: () => Settings;
    Viewport: ComponentType<EditorToolViewportProps>;
    Panel: ComponentType<EditorToolPanelProps>;
}
const tools = createExtensionRegistry<EditorToolDefinition>();
/** Registration is reactive; cleanup cannot remove a newer registration. */
export function registerEditorTool<Settings extends object>(definition: EditorToolDefinition<Settings>) {
    return tools.register(definition);
}
export const getEditorTools = tools.getSnapshot;
export const getEditorTool = tools.get;
export const subscribeEditorTools = tools.subscribe;
export type EditorToolSession = { key: number; definition: EditorToolDefinition; nodeId: string; settings: object; error: string | null };

/** Per-editor live tool state. Neither session nor isolation flags enter the scene document. */
export function createEditorToolController(getNode: (id: string) => GameObject | null | undefined, isEnabled: () => boolean = () => true) {
    let session: EditorToolSession | null = null;
    let nextKey = 0;
    const listeners = new Set<() => void>();
    const cancellations = new Set<() => void>();
    const remembered = new WeakMap<EditorToolDefinition, object>();
    const notify = () => listeners.forEach(listener => listener());
    const cancelInteraction = () => { for (const cancel of [...cancellations]) cancel(); };
    const end = () => {
        cancelInteraction();
        cancellations.clear();
        if (!session) return;
        session = null;
        notify();
    };
    const validate = () => {
        if (!session) return;
        const node = getNode(session.nodeId);
        if (getEditorTool(session.definition.id) !== session.definition || !node || node.locked || !isEnabled() || !session.definition.supports(node)) end();
    };
    return {
        /** Subscribe for the editor lifetime; no global listener survives unmount. */
        connect() { const disconnect = subscribeEditorTools(validate); validate(); return disconnect; },
        getSnapshot: () => session,
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        activate(toolId: string, nodeId: string) {
            const definition = getEditorTool(toolId), node = getNode(nodeId);
            if (!definition || !node || node.locked || !isEnabled() || !definition.supports(node)) return false;
            if (session?.definition === definition && session.nodeId === nodeId) return true;
            end();
            session = { key: ++nextKey, definition, nodeId, settings: remembered.get(definition) ?? definition.createSettings(), error: null };
            notify();
            return true;
        },
        end,
        validate,
        setSettings(settings: object) {
            if (!session) return;
            remembered.set(session.definition, settings);
            session = { ...session, settings };
            notify();
        },
        setError(error: string | null) {
            if (!session || session.error === error) return;
            session = { ...session, error };
            notify();
        },
        cancelInteraction,
        registerCancellation(cancel: () => void, sessionKey = session?.key) {
            if (!session || session.key !== sessionKey) return () => {};
            cancellations.add(cancel);
            return () => { cancellations.delete(cancel); };
        },
    };
}
export type EditorToolController = ReturnType<typeof createEditorToolController>;
export const EditorToolsContext = createContext<EditorToolController | null>(null);
export function useEditorTools() {
    const controller = useContext(EditorToolsContext);
    if (!controller) throw new Error('Editor tools require PrefabEditorProvider');
    return controller;
}
/** Tool-specific code checks its identity before reading its typed settings. */
export function useEditorToolSession<Settings extends object>(toolId: string) {
    const controller = useEditorTools();
    const session = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    if (!session || session.definition.id !== toolId) throw new Error(`Editor tool ${toolId} is not active`);
    const ownsSession = () => controller.getSnapshot()?.key === session.key;
    return { ...session, settings: session.settings as Settings,
        setSettings: (settings: Settings) => { if (ownsSession()) controller.setSettings(settings); },
        setError: (error: string | null) => { if (ownsSession()) controller.setError(error); },
        end: () => { if (ownsSession()) controller.end(); },
        registerCancellation: (cancel: () => void) => controller.registerCancellation(cancel, session.key),
    };
}
