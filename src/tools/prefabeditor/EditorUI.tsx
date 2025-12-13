import { Dispatch, SetStateAction, useState, useEffect } from 'react';
import { Prefab, GameObject as GameObjectType } from "./types";
import EditorTree from './EditorTree';
import { getAllComponents } from './components/ComponentRegistry';


function EditorUI({ prefabData, setPrefabData, selectedId, setSelectedId, transformMode, setTransformMode, basePath }: {
    prefabData?: Prefab;
    setPrefabData?: Dispatch<SetStateAction<Prefab>>;
    selectedId: string | null;
    setSelectedId: Dispatch<SetStateAction<string | null>>;
    transformMode: "translate" | "rotate" | "scale";
    setTransformMode: (m: "translate" | "rotate" | "scale") => void;
    basePath?: string;
}) {
    const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);

    const ui: Record<string, React.CSSProperties> = {
        panel: {
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 20,
            width: 260,
            background: 'rgba(0,0,0,0.55)',
            color: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            overflow: 'hidden',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            fontSize: 11,
            lineHeight: 1.2,
        },
        header: {
            padding: '4px 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            background: 'rgba(255,255,255,0.05)',
            borderBottom: '1px solid rgba(255,255,255,0.10)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontSize: 10,
            color: 'rgba(255,255,255,0.7)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
        },
        left: {
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 20,
        },
    };

    const updateNode = (updater: (n: GameObjectType) => GameObjectType) => {
        if (!prefabData || !setPrefabData || !selectedId) return;
        setPrefabData(prev => ({
            ...prev,
            root: updatePrefabNode(prev.root, selectedId, updater)
        }));
    };

    const deleteNode = () => {
        if (!prefabData || !setPrefabData || !selectedId) return;
        if (selectedId === prefabData.root.id) {
            alert("Cannot delete root node");
            return;
        }
        setPrefabData(prev => {
            const newRoot = deletePrefabNode(prev.root, selectedId);
            return { ...prev, root: newRoot! };
        });
        setSelectedId(null);
    };

    const selectedNode = selectedId && prefabData ? findNode(prefabData.root, selectedId) : null;

    // if (!selectedNode) return null;
    return <>
        <div style={ui.panel}>
            <div
                style={ui.header}
                onClick={() => setIsInspectorCollapsed(!isInspectorCollapsed)}
                onPointerEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.08)';
                }}
                onPointerLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)';
                }}
            >
                <span>Inspector</span>
                <span style={{ fontSize: 10, opacity: 0.8 }}>{isInspectorCollapsed ? '◀' : '▶'}</span>
            </div>
            {!isInspectorCollapsed && selectedNode && (
                <NodeInspector
                    node={selectedNode}
                    updateNode={updateNode}
                    deleteNode={deleteNode}
                    transformMode={transformMode}
                    setTransformMode={setTransformMode}
                    basePath={basePath}
                />
            )}
        </div>
        <div style={ui.left}>
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
    const allComponentKeys = Object.keys(ALL_COMPONENTS);
    const [addComponentType, setAddComponentType] = useState(allComponentKeys[0]);

    const s: Record<string, React.CSSProperties> = {
        root: {
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 6,
            maxHeight: '80vh',
            overflowY: 'auto',
        },
        section: {
            paddingBottom: 6,
            borderBottom: '1px solid rgba(255,255,255,0.10)',
        },
        label: {
            display: 'block',
            fontSize: 10,
            opacity: 0.7,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 4,
        },
        input: {
            width: '100%',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 4,
            padding: '4px 6px',
            color: 'rgba(255,255,255,0.92)',
            font: 'inherit',
            outline: 'none',
        },
        row: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
        },
        button: {
            padding: '2px 6px',
            background: 'transparent',
            color: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 4,
            cursor: 'pointer',
            font: 'inherit',
        },
        buttonActive: {
            background: 'rgba(255,255,255,0.10)',
        },
        smallDanger: {
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(255,120,120,0.95)',
            font: 'inherit',
            padding: '2px 4px',
        },
        componentHeader: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 0',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            marginBottom: 4,
        },
        componentTitle: {
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            opacity: 0.8,
        },
        select: {
            flex: 1,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 4,
            padding: '4px 6px',
            color: 'rgba(255,255,255,0.92)',
            font: 'inherit',
            outline: 'none',
        },
        addButton: {
            width: 28,
            padding: '4px 0',
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.92)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 4,
            cursor: 'pointer',
            font: 'inherit',
        },
        disabled: {
            opacity: 0.35,
            cursor: 'not-allowed',
        },
    };

    const componentKeys = Object.keys(node.components || {}).join(',');
    useEffect(() => {
        // Components stored on nodes use lowercase keys (e.g. 'geometry'),
        // while the registry keys are the component names (e.g. 'Geometry').
        const available = allComponentKeys.filter(k => !node.components?.[k.toLowerCase()]);
        if (!available.includes(addComponentType)) {
            setAddComponentType(available[0] || "");
        }
    }, [componentKeys, addComponentType, node.components, allComponentKeys]);

    return <div style={s.root}>
        <div style={s.section}>
            <input
                style={s.input}
                value={node.id}
                onChange={e => updateNode(n => ({ ...n, id: e.target.value }))}
            />
        </div>

        <div style={{ ...s.row, ...s.section, paddingBottom: 6 }}>
            <label style={{ ...s.label, marginBottom: 0 }}>Components</label>
            <button
                onClick={deleteNode}
                style={s.smallDanger}
                title="Delete node"
            >
                ✕
            </button>
        </div>

        <div style={s.section}>
            <label style={s.label}>Mode</label>
            <div style={{ display: 'flex', gap: 6 }}>
                {["translate", "rotate", "scale"].map(mode => (
                    <button
                        key={mode}
                        onClick={() => setTransformMode(mode as any)}
                        style={{
                            ...s.button,
                            flex: 1,
                            ...(transformMode === mode ? s.buttonActive : null),
                        }}
                        onPointerEnter={(e) => {
                            if (transformMode !== mode) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
                        }}
                        onPointerLeave={(e) => {
                            if (transformMode !== mode) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                        }}
                    >
                        {mode[0].toUpperCase()}
                    </button>
                ))}
            </div>
        </div>

        {/* Components (legacy renderer removed) */}

        {node.components && Object.entries(node.components).map(([key, comp]: [string, any]) => {
            if (!comp) return null;
            const componentDef = ALL_COMPONENTS[comp.type];
            if (!componentDef) return <div key={key} style={{ padding: '4px 0', color: 'rgba(255,120,120,0.95)', fontSize: 11 }}>
                Unknown component type: {comp.type}
                <textarea defaultValue={JSON.stringify(comp)} />
            </div>;

            const EditorComp = componentDef.Editor;
            return (
                <div key={key} style={{ padding: '0 2px' }}>
                    <div style={s.componentHeader}>
                        <span style={s.componentTitle}>{key}</span>
                        <button
                            onClick={() => updateNode(n => {
                                const components = { ...n.components };
                                delete components[key as keyof typeof components];
                                return { ...n, components };
                            })}
                            style={s.smallDanger}
                            title="Remove component"
                        >
                            ✕
                        </button>
                    </div>
                    {EditorComp ? (
                        <EditorComp
                            component={comp}
                            onUpdate={(newProps: any) => updateNode(n => ({
                                ...n,
                                components: {
                                    ...n.components,
                                    [key]: {
                                        ...comp,
                                        properties: { ...comp.properties, ...newProps }
                                    }
                                }
                            }))}
                            basePath={basePath}
                        />
                    ) : null}
                </div>
            );
        })}

        {/* Add Component */}
        <div style={{ ...s.section, borderBottom: 'none', paddingBottom: 0 }}>
            <label style={s.label}>Add Component</label>
            <div style={{ display: 'flex', gap: 6 }}>
                <select
                    style={s.select}
                    value={addComponentType}
                    onChange={e => setAddComponentType(e.target.value)}
                >
                    {allComponentKeys.filter(k => !node.components?.[k.toLowerCase()]).map(k => (
                        <option key={k} value={k}>{k}</option>
                    ))}
                </select>
                <button
                    style={{
                        ...s.addButton,
                        ...(!addComponentType ? s.disabled : null),
                    }}
                    disabled={!addComponentType}
                    onClick={() => {
                        if (!addComponentType) return;
                        const def = ALL_COMPONENTS[addComponentType];
                        if (def && !node.components?.[addComponentType.toLowerCase()]) {
                            const key = addComponentType.toLowerCase();
                            updateNode(n => ({
                                ...n,
                                components: {
                                    ...n.components,
                                    [key]: { type: def.name, properties: def.defaultProperties }
                                }
                            }));
                        }
                    }}
                    onPointerEnter={(e) => {
                        if (!addComponentType) return;
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)';
                    }}
                    onPointerLeave={(e) => {
                        if (!addComponentType) return;
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
                    }}
                >
                    +
                </button>
            </div>
        </div>


    </div>
}

function findNode(root: GameObjectType, id: string): GameObjectType | null {
    if (root.id === id) return root;
    if (root.children) {
        for (const child of root.children) {
            const found = findNode(child, id);
            if (found) return found;
        }
    }
    return null;
}

function updatePrefabNode(root: GameObjectType, id: string, update: (node: GameObjectType) => GameObjectType): GameObjectType {
    if (root.id === id) {
        return update(root);
    }
    if (root.children) {
        return {
            ...root,
            children: root.children.map(child => updatePrefabNode(child, id, update))
        };
    }
    return root;
}

function deletePrefabNode(root: GameObjectType, id: string): GameObjectType | null {
    if (root.id === id) return null;

    if (root.children) {
        return {
            ...root,
            children: root.children
                .map(child => deletePrefabNode(child, id))
                .filter((child): child is GameObjectType => child !== null)
        };
    }
    return root;
}

export default EditorUI;
