import { Dispatch, SetStateAction, useState, useEffect } from 'react';
import { Prefab, GameObject as GameObjectType } from "./types";
import EditorTree from './EditorTree';
import { getAllComponents } from './components/ComponentRegistry';
import { base, inspector } from './styles';
import { findNode, updateNode, deleteNode } from './utils';

function EditorUI({ prefabData, setPrefabData, selectedId, setSelectedId, transformMode, setTransformMode, basePath }: {
    prefabData?: Prefab;
    setPrefabData?: Dispatch<SetStateAction<Prefab>>;
    selectedId: string | null;
    setSelectedId: Dispatch<SetStateAction<string | null>>;
    transformMode: "translate" | "rotate" | "scale";
    setTransformMode: (m: "translate" | "rotate" | "scale") => void;
    basePath?: string;
}) {
    const [collapsed, setCollapsed] = useState(false);

    const updateNodeHandler = (updater: (n: GameObjectType) => GameObjectType) => {
        if (!prefabData || !setPrefabData || !selectedId) return;
        setPrefabData(prev => ({
            ...prev,
            root: updateNode(prev.root, selectedId, updater)
        }));
    };

    const deleteNodeHandler = () => {
        if (!prefabData || !setPrefabData || !selectedId || selectedId === prefabData.root.id) return;
        setPrefabData(prev => ({ ...prev, root: deleteNode(prev.root, selectedId)! }));
        setSelectedId(null);
    };

    const selectedNode = selectedId && prefabData ? findNode(prefabData.root, selectedId) : null;

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
                    transformMode={transformMode}
                    setTransformMode={setTransformMode}
                    basePath={basePath}
                />
            )}
        </div>
        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 20 }}>
            <EditorTree
                prefabData={prefabData}
                setPrefabData={setPrefabData}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
            />
        </div>
    </>;
}


function NodeInspector({ node, updateNode, deleteNode, transformMode, setTransformMode, basePath }: {
    node: GameObjectType;
    updateNode: (updater: (n: GameObjectType) => GameObjectType) => void;
    deleteNode: () => void;
    transformMode: "translate" | "rotate" | "scale";
    setTransformMode: (m: "translate" | "rotate" | "scale") => void;
    basePath?: string;
}) {
    const ALL_COMPONENTS = getAllComponents();
    const allKeys = Object.keys(ALL_COMPONENTS);
    const available = allKeys.filter(k => !node.components?.[k.toLowerCase()]);
    const [addType, setAddType] = useState(available[0] || "");

    useEffect(() => {
        const newAvailable = allKeys.filter(k => !node.components?.[k.toLowerCase()]);
        if (!newAvailable.includes(addType)) setAddType(newAvailable[0] || "");
    }, [Object.keys(node.components || {}).join(',')]);

    return <div style={inspector.content}>
        {/* Node ID */}
        <div style={base.section}>
            <div style={base.label}>Node ID</div>
            <input
                style={base.input}
                value={node.name ?? ""}
                onChange={e =>
                    updateNode(n => ({ ...n, name: e.target.value }))
                }
            />
        </div>

        {/* Components */}
        <div style={base.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={base.label}>Components</div>
                <button style={{ ...base.btn, ...base.btnDanger }} onClick={deleteNode}>Delete Node</button>
            </div>

            {node.components && Object.entries(node.components).map(([key, comp]: [string, any]) => {
                if (!comp) return null;
                const def = ALL_COMPONENTS[comp.type];
                if (!def) return <div key={key} style={{ color: '#ff8888', fontSize: 11 }}>
                    Unknown: {comp.type}
                </div>;

                return (
                    <div key={key} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <div style={{ fontSize: 11, fontWeight: 500 }}>{key}</div>
                            <button
                                style={{ ...base.btn, padding: '2px 6px' }}
                                onClick={() => updateNode(n => {
                                    const { [key]: _, ...rest } = n.components || {};
                                    return { ...n, components: rest };
                                })}
                            >
                                ✕
                            </button>
                        </div>
                        {def.Editor && (
                            <def.Editor
                                component={comp}
                                onUpdate={(newProps: any) => updateNode(n => ({
                                    ...n,
                                    components: {
                                        ...n.components,
                                        [key]: { ...comp, properties: { ...comp.properties, ...newProps } }
                                    }
                                }))}
                                basePath={basePath}
                                transformMode={transformMode}
                                setTransformMode={setTransformMode}
                            />
                        )}
                    </div>
                );
            })}
        </div>

        {/* Add Component */}
        {available.length > 0 && (
            <div>
                <div style={base.label}>Add Component</div>
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
                                        [addType.toLowerCase()]: { type: def.name, properties: def.defaultProperties }
                                    }
                                }));
                            }
                        }}
                    >
                        +
                    </button>
                </div>
            </div>
        )}
    </div>
}

export default EditorUI;
