import { useState } from 'react';
import { GameObject as GameObjectType, Prefab, hasComponent } from "./types";
import EditorTree from './EditorTree';
import { getAllComponentDefs } from './components/ComponentRegistry';
import { createComponentData } from './prefab';
import { base, colors, inspector, componentCard } from './styles';
import { usePrefabStore } from './prefabStore';

function EditorUI({
    selectedId,
    setSelectedId,
    getPrefab,
    onReplacePrefab,
    onImportPrefab,
    basePath,
    onUndo,
    onRedo,
    canUndo,
    canRedo
}: {
    selectedId: string | null;
    setSelectedId: (id: string | null) => void;
    getPrefab: () => Prefab;
    onReplacePrefab: (prefab: Prefab) => void;
    onImportPrefab: (prefab: Prefab) => void;
    basePath?: string;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
}) {
    const [collapsed, setCollapsed] = useState(false);
    const rootId = usePrefabStore(state => state.rootId);
    const selectedNode = usePrefabStore(state => selectedId ? state.nodesById[selectedId] ?? null : null);
    const updateNode = usePrefabStore(state => state.updateNode);
    const deleteNode = usePrefabStore(state => state.deleteNode);

    const updateNodeHandler = (update: (n: GameObjectType) => GameObjectType) => {
        if (!selectedId) return;
        updateNode(selectedId, update);
    };

    const deleteNodeHandler = () => {
        if (!selectedId || selectedId === rootId) return;
        deleteNode(selectedId);
        setSelectedId(null);
    };

    return <>
        <div style={inspector.panel}>
            <div style={base.header} onClick={() => setCollapsed(!collapsed)}>
                <span>Inspector</span>
                <span>{collapsed ? '◀' : '▼'}</span>
            </div>
            {!collapsed && selectedNode && (
                <NodeInspector
                    node={selectedNode}
                    updateNode={updateNodeHandler}
                    deleteNode={deleteNodeHandler}
                    basePath={basePath}
                />
            )}
        </div>
        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 20 }}>
            <EditorTree
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                getPrefab={getPrefab}
                onReplacePrefab={onReplacePrefab}
                onImportPrefab={onImportPrefab}
                onUndo={onUndo}
                onRedo={onRedo}
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
    basePath
}: {
    node: GameObjectType;
    updateNode: (update: (n: GameObjectType) => GameObjectType) => void;
    deleteNode: () => void;
    basePath?: string;
}) {
    const ALL_COMPONENTS = getAllComponentDefs();
    const allKeys = Object.keys(ALL_COMPONENTS);
    const available = allKeys.filter(k => !hasComponent(node, k));
    const [preferredAddType, setAddType] = useState(available[0] || "");
    const addType = available.includes(preferredAddType) ? preferredAddType : (available[0] || "");

    return <div style={inspector.content}>
        {/* Node Name */}
        <div style={base.section}>
            <div style={{ display: "flex", marginBottom: 8, alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 10, color: colors.textDim, wordBreak: 'break-all', border: `1px solid ${colors.border}`, padding: '2px 6px', borderRadius: 3, flex: 1, fontFamily: 'monospace' }}>
                    {node.id}
                </div>
                <button style={{ ...base.btn, ...base.btnDanger }} title="Delete Node" onClick={deleteNode}>❌</button>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <div style={{ fontSize: 11, fontWeight: 500 }}>{key}</div>
                            <button
                                style={{ ...base.btn, padding: '2px 6px' }}
                                title="Remove Component"
                                onClick={() => updateNode(n => {
                                    const { [key]: _, ...rest } = n.components ?? {};
                                    return { ...n, components: rest };
                                })}
                            >
                                ✕
                            </button>
                        </div>
                        {def.Editor && (
                            <def.Editor
                                component={comp}
                                node={node}
                                onUpdate={(newProps: any) => updateNode(n => ({
                                    ...n,
                                    components: {
                                        ...n.components,
                                        [key]: { ...comp, properties: { ...comp.properties, ...newProps } }
                                    }
                                }))}
                                basePath={basePath}
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
                        style={{ ...base.input, flex: 1 }}
                        value={addType}
                        onChange={e => setAddType(e.target.value)}
                    >
                        {available.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                    <button
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
                                        [addType.toLowerCase()]: createComponentData(def.name)
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
