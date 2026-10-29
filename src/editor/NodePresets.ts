import { createExtensionRegistry } from './extensionRegistry.js';
import type { GameObject } from '../core/types.js';

export interface EditorNodePreset {
    id: string;
    label: string;
    category: string;
    description?: string;
    /** Must return a fresh node tree with fresh IDs on every invocation. */
    create: () => GameObject;
}
const presets = createExtensionRegistry<EditorNodePreset>();
export const registerEditorNodePreset = presets.register;
export const getEditorNodePresets = presets.getSnapshot;
export const subscribeEditorNodePresets = presets.subscribe;
