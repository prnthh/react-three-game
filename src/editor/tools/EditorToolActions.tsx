import { useSyncExternalStore } from 'react';
import type { GameObject } from '../../core/types.js';
import { base } from '../ui/styles.js';
import { getEditorTools, subscribeEditorTools, useEditorTools } from './EditorTools.js';

/** Every registered tool gets an inspector entry without a component-specific button. */
export function EditorToolActions({ node }: { node: GameObject }) {
    const controller = useEditorTools();
    const definitions = useSyncExternalStore(subscribeEditorTools, getEditorTools, getEditorTools);
    const tools = definitions.filter(tool => tool.supports(node));
    if (!tools.length) return null;
    return <div role="group" aria-label="Object tools" style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
        {tools.map(tool => <button type="button" key={tool.id} style={{ ...base.btn, minHeight: 44 }} disabled={!!node.locked}
            onClick={() => controller.activate(tool.id, node.id)}>{tool.label}</button>)}
    </div>;
}
