import { useState } from 'react';
import { GameObject as GameObjectType } from "./types";
import EditorTree from './EditorTree';
import { canAddComponentToNode, getAllComponentDefs, getNextComponentKey, resolveComponentProperties } from './components/ComponentRegistry';
import type { Component } from './components/ComponentRegistry';
import { FieldRenderer, type FieldDefinition } from './components/Input';
import { createComponentData } from './prefab';
import { useEditorRef } from './EditorContext';
import { base, colors, inspector, componentCard, radii } from './styles';
import { usePrefabStore } from './prefabStore';

function humanizePropertyName(name: string) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/^./, character => character.toUpperCase());
}

function DefaultComponentEditor({
    component,
    properties,
    update,
}: {
    component: Component;
    properties: Record<string, unknown>;
    update: (patch: Record<string, unknown>) => void;
}) {
    const fields: FieldDefinition<Record<string, unknown>>[] = [];
    for (const [name, definition] of Object.entries(component.properties)) {
        const type = definition.type ?? 'number';
        if (type !== 'number' && type !== 'string' && type !== 'boolean' && type !== 'color' && type !== 'select' && type !== 'vector3') continue;
        fields.push({
            name,
            type,
            label: definition.label ?? humanizePropertyName(name),
            ...('min' in definition ? { min: definition.min } : null),
            ...('max' in definition ? { max: definition.max } : null),
            ...('step' in definition ? { step: definition.step } : null),
            ...('options' in definition ? { options: [...definition.options] } : null),
        } as FieldDefinition<Record<string, unknown>>);
    }
    return fields.length > 0
        ? <FieldRenderer fields={fields} values={properties} onChange={update} />
        : null;
}

function EditorUI({
    selectedId,
    setSelectedId,
    canUndo,
    canRedo
}: {
    selectedId: string | null;
    setSelectedId: (id: string | null) => void;
    canUndo: boolean;
    canRedo: boolean;
}) {
    const [collapsed, setCollapsed] = useState(false);
    const rootId = usePrefabStore(state => state.rootId);
    const selectedNode = usePrefabStore(state => selectedId ? state.nodesById[selectedId] ?? null : null);
    const editor = useEditorRef();

    const updateNodeHandler = (update: (n: GameObjectType) => GameObjectType) => {
        if (!selectedId) return;
        editor.update(selectedId, update);
    };

    const deleteNodeHandler = () => {
        if (!selectedId || selectedId === rootId) return;
        editor.remove(selectedId);
        setSelectedId(null);
    };

    return <>
        <div style={inspector.panel}>
            <button type="button" style={base.header} onClick={() => setCollapsed(!collapsed)}>
                <span>Inspector</span>
                <span>{collapsed ? '◀' : '▼'}</span>
            </button>
            {!collapsed && selectedNode && (
                <NodeInspector
                    node={selectedNode}
                    updateNode={updateNodeHandler}
                    deleteNode={deleteNodeHandler}
                />
            )}
        </div>

        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 20 }}>
            <EditorTree
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                canUndo={canUndo}
                canRedo={canRedo}
            />
        </div>
    </>;
}


function NodeInspector({
    node,
    updateNode,
    deleteNode,
}: {
    node: GameObjectType;
    updateNode: (update: (n: GameObjectType) => GameObjectType) => void;
    deleteNode: () => void;
}) {
    const ALL_COMPONENTS = getAllComponentDefs();
    const allKeys = Object.keys(ALL_COMPONENTS);
    const available = allKeys.filter(k => canAddComponentToNode(node, ALL_COMPONENTS[k], ALL_COMPONENTS));
    const [preferredAddType, setAddType] = useState(available[0] || "");
    const addType = available.includes(preferredAddType) ? preferredAddType : (available[0] || "");

    return <div style={inspector.content}>
        {/* Node Name */}
        <div style={base.section}>
            <div style={{ display: "flex", marginBottom: 6, alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 10, color: colors.textDim, wordBreak: 'break-all', background: colors.bgInput, padding: '5px 7px', flex: 1, fontFamily: 'monospace', minHeight: 26, boxSizing: 'border-box', borderRadius: radii.control, border: `1px solid ${colors.borderFaint}` }}>
                    {node.id}
                </div>
                <button style={{ ...base.btn, ...base.btnDanger, minWidth: 22, padding: '2px 4px' }}
                    type="button"
                    title="Delete Node" onClick={deleteNode}>
                    ✕
                </button>
            </div>

            <input
                style={base.input}
                value={node.name ?? ""}
                placeholder='Node name'
                onChange={e =>
                    updateNode(n => ({ ...n, name: e.target.value }))
                }
            />
        </div>

        {/* Components */}
        <div style={base.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={base.label}>Components</div>
            </div>

            {node.components && Object.entries(node.components).map(([key, comp]: [string, any]) => {
                if (!comp) return null;
                const def = ALL_COMPONENTS[comp.type];
                if (!def) return <div key={key} style={{ color: colors.danger, fontSize: 11 }}>
                    Unknown: {comp.type}
                </div>;

                return (
                    <div key={key} style={componentCard.container}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                            <div style={{ fontSize: 11, fontWeight: 650, color: colors.text }}>{key}</div>
                            <button
                                type="button"
                                style={{ ...base.btn, padding: '2px 4px', minWidth: 20 }}
                                title="Remove Component"
                                onClick={() => updateNode(n => {
                                    const { [key]: _, ...rest } = n.components ?? {};
                                    return { ...n, components: rest };
                                })}
                            >
                                ✕
                            </button>
                        </div>
                        {def.Editor ? (
                            <def.Editor
                                node={node}
								properties={resolveComponentProperties(def, comp.properties)}
                                update={(patch) => updateNode(n => ({
                                    ...n,
                                    components: {
                                        ...n.components,
                                        [key]: { ...comp, properties: { ...comp.properties, ...patch } }
                                    }
                                }))}
                            />
                        ) : (
                            <DefaultComponentEditor
                                component={def}
                                properties={resolveComponentProperties(def, comp.properties)}
                                update={(patch) => updateNode(n => ({
                                    ...n,
                                    components: {
                                        ...n.components,
                                        [key]: { ...comp, properties: { ...comp.properties, ...patch } }
                                    }
                                }))}
                            />
                        )}
                    </div>
                );
            })}
        </div>

        {/* Add Component */}
        {available.length > 0 && (
            <div>
                <div style={base.row}>
                    <select
                        style={{
                            ...base.input,
                            flex: 1,
                            background: colors.bgInput,
                            border: `1px solid ${colors.border}`,
                        }}
                        value={addType}
                        onChange={e => setAddType(e.target.value)}
                    >
                        {available.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                    <button
                        type="button"
                        style={base.btn}
                        disabled={!addType}
                        onClick={() => {
                            if (!addType) return;
                            const def = ALL_COMPONENTS[addType];
                            if (def) {
                                updateNode(n => ({
                                    ...n,
                                    components: {
                                        ...n.components,
                                        [getNextComponentKey(n, def.name)]: createComponentData(def.name)
                                    }
                                }));
                            }
                        }}
                        title="Add Component"
                    >
                        +
                    </button>
                </div>
            </div>
        )}
    </div>
}

export default EditorUI;
