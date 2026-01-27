import { Dispatch, SetStateAction, useState, MouseEvent } from 'react';
import { Prefab, GameObject } from "./types";
import { getComponent } from './components/ComponentRegistry';
import { base, tree, menu } from './styles';
import { findNode, findParent, deleteNode, cloneNode, updateNodeById, loadJson, saveJson, regenerateIds } from './utils';
import { useEditorContext } from './EditorContext';

export default function EditorTree({
    prefabData,
    setPrefabData,
    selectedId,
    setSelectedId,
    onUndo,
    onRedo,
    canUndo,
    canRedo
}: {
    prefabData?: Prefab;
    setPrefabData?: Dispatch<SetStateAction<Prefab>>;
    selectedId: string | null;
    setSelectedId: Dispatch<SetStateAction<string | null>>;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
}) {
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeId: string } | null>(null);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
    const [collapsed, setCollapsed] = useState(false);
    const [fileMenuOpen, setFileMenuOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    if (!prefabData || !setPrefabData) return null;

    const handleContextMenu = (e: MouseEvent, nodeId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
    };

    const toggleCollapse = (e: MouseEvent, id: string) => {
        e.stopPropagation();
        setCollapsedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleAddChild = (parentId: string) => {
        setPrefabData(prev => ({
            ...prev,
            root: updateNodeById(prev.root, parentId, parent => ({
                ...parent,
                children: [...(parent.children ?? []), {
                    id: crypto.randomUUID(),
                    name: "New Node",
                    components: {
                        transform: {
                            type: "Transform",
                            properties: { ...getComponent('Transform')?.defaultProperties }
                        }
                    }
                }]
            }))
        }));
        setContextMenu(null);
    };

    const handleDuplicate = (nodeId: string) => {
        if (nodeId === prefabData.root.id) return;
        setPrefabData(prev => {
            const node = findNode(prev.root, nodeId);
            const parent = findParent(prev.root, nodeId);
            if (!node || !parent) return prev;
            return {
                ...prev,
                root: updateNodeById(prev.root, parent.id, p => ({
                    ...p,
                    children: [...(p.children ?? []), cloneNode(node)]
                }))
            };
        });
        setContextMenu(null);
    };

    const handleDelete = (nodeId: string) => {
        if (nodeId === prefabData.root.id) return;
        setPrefabData(prev => ({ ...prev, root: deleteNode(prev.root, nodeId)! }));
        if (selectedId === nodeId) setSelectedId(null);
        setContextMenu(null);
    };

    const handleToggleDisabled = (nodeId: string) => {
        setPrefabData(prev => ({
            ...prev,
            root: updateNodeById(prev.root, nodeId, node => ({
                ...node,
                disabled: !node.disabled
            }))
        }));
        setContextMenu(null);
    };

    const handleDragStart = (e: React.DragEvent, id: string) => {
        if (id === prefabData.root.id) return e.preventDefault();
        e.dataTransfer.effectAllowed = "move";
        setDraggedId(id);
    };

    const handleDragOver = (e: React.DragEvent, targetId: string) => {
        if (!draggedId || draggedId === targetId) return;
        const draggedNode = findNode(prefabData.root, draggedId);
        if (draggedNode && findNode(draggedNode, targetId)) return;
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        if (!draggedId || draggedId === targetId) return;
        e.preventDefault();
        setPrefabData(prev => {
            const draggedNode = findNode(prev.root, draggedId);
            const oldParent = findParent(prev.root, draggedId);
            if (!draggedNode || !oldParent || findNode(draggedNode, targetId)) return prev;

            let root = updateNodeById(prev.root, oldParent.id, p => ({
                ...p,
                children: p.children!.filter(c => c.id !== draggedId)
            }));

            root = updateNodeById(root, targetId, t => ({
                ...t,
                children: [...(t.children ?? []), draggedNode]
            }));

            return { ...prev, root };
        });
        setDraggedId(null);
    };


    const matchesSearch = (node: GameObject, query: string): boolean => {
        if (!query) return true;
        const lowerQuery = query.toLowerCase();
        const nodeName = (node.name ?? node.id).toLowerCase();
        if (nodeName.includes(lowerQuery)) return true;
        return node.children?.some(child => matchesSearch(child, query)) ?? false;
    };

    const renderNode = (node: GameObject, depth = 0): React.ReactNode => {
        if (!node) return null;
        if (!matchesSearch(node, searchQuery)) return null;

        const isSelected = node.id === selectedId;
        const isCollapsed = collapsedIds.has(node.id);
        const hasChildren = node.children && node.children.length > 0;
        const isRoot = node.id === prefabData.root.id;

        return (
            <div key={node.id}>
                <div
                    style={{
                        ...tree.row,
                        ...(isSelected ? tree.selected : {}),
                        paddingLeft: `${depth * 12 + 6}px`,
                        opacity: node.disabled ? 0.4 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                    draggable={!isRoot}
                    onClick={(e) => { e.stopPropagation(); setSelectedId(node.id); }}
                    onContextMenu={(e) => handleContextMenu(e, node.id)}
                    onDragStart={(e) => handleDragStart(e, node.id)}
                    onDragEnd={() => setDraggedId(null)}
                    onDragOver={(e) => handleDragOver(e, node.id)}
                    onDrop={(e) => handleDrop(e, node.id)}
                >
                    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                        <span
                            style={{
                                width: 12,
                                opacity: 0.6,
                                marginRight: 4,
                                cursor: 'pointer',
                                visibility: hasChildren ? 'visible' : 'hidden'
                            }}
                            onClick={(e) => hasChildren && toggleCollapse(e, node.id)}
                        >
                            {isCollapsed ? '▶' : '▼'}
                        </span>
                        {!isRoot && <span style={{ marginRight: 4, opacity: 0.4 }}>⋮⋮</span>}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {node.name ?? node.id}
                        </span>
                    </div>
                    {!isRoot && (
                        <button
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '0 4px',
                                fontSize: 14,
                                opacity: node.disabled ? 0.5 : 0.7,
                                color: 'inherit',
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleToggleDisabled(node.id);
                            }}
                            title={node.disabled ? 'Enable' : 'Disable'}
                        >
                            {node.disabled ? '◎' : '◉'}
                        </button>
                    )}
                </div>
                {!isCollapsed && node.children && node.children.map(child => renderNode(child, depth + 1))}
            </div>
        );
    };

    return (
        <>
            <style>{`
.tree-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.tree-scroll::-webkit-scrollbar-track { background: transparent; }
.tree-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 8px; }
            `}</style>
            <div style={{ ...tree.panel, width: collapsed ? 'auto' : 224 }} onClick={() => { setContextMenu(null); setFileMenuOpen(false); }}>
                <div style={base.header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => setCollapsed(!collapsed)}>
                        <span>{collapsed ? '▶' : '▼'}</span>
                        <span>Scene</span>
                    </div>
                    {!collapsed && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button
                                style={{ ...base.btn, padding: '2px 6px', fontSize: 10, opacity: canUndo ? 1 : 0.4 }}
                                onClick={(e) => { e.stopPropagation(); onUndo?.(); }}
                                disabled={!canUndo}
                                title="Undo"
                            >
                                ↶
                            </button>
                            <button
                                style={{ ...base.btn, padding: '2px 6px', fontSize: 10, opacity: canRedo ? 1 : 0.4 }}
                                onClick={(e) => { e.stopPropagation(); onRedo?.(); }}
                                disabled={!canRedo}
                                title="Redo"
                            >
                                ↷
                            </button>
                            <div style={{ position: 'relative' }}>
                                <button
                                    style={{ ...base.btn, padding: '2px 6px', fontSize: 10 }}
                                    onClick={(e) => { e.stopPropagation(); setFileMenuOpen(!fileMenuOpen); }}
                                    title="File"
                                >
                                    ⋮
                                </button>
                                {fileMenuOpen && (
                                    <FileMenu
                                        prefabData={prefabData}
                                        setPrefabData={setPrefabData}
                                        onClose={() => setFileMenuOpen(false)}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                </div>
                {!collapsed && (
                    <>
                        <div style={{ padding: '4px 4px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <input
                                type="text"
                                placeholder="Search nodes..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    width: '100%',
                                    padding: '4px 8px',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 3,
                                    color: 'inherit',
                                    fontSize: 11,
                                    outline: 'none',
                                }}
                            />
                        </div>
                        <div className="tree-scroll" style={tree.scroll}>{renderNode(prefabData.root)}</div>
                    </>
                )}
            </div>

            {contextMenu && (
                <div
                    style={{ ...menu.container, top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                    onPointerLeave={() => setContextMenu(null)}
                >
                    <button style={menu.item} onClick={() => handleAddChild(contextMenu.nodeId)}>
                        Add Child
                    </button>
                    {contextMenu.nodeId !== prefabData.root.id && (
                        <>
                            <button style={menu.item} onClick={() => handleDuplicate(contextMenu.nodeId)}>
                                Duplicate
                            </button>
                            <button style={{ ...menu.item, ...menu.danger }} onClick={() => handleDelete(contextMenu.nodeId)}>
                                Delete
                            </button>
                        </>
                    )}
                </div>
            )}
        </>
    );
}

function FileMenu({
    prefabData,
    setPrefabData,
    onClose
}: {
    prefabData: Prefab;
    setPrefabData: Dispatch<SetStateAction<Prefab>>;
    onClose: () => void;
}) {
    const { onScreenshot, onExportGLB } = useEditorContext();

    const handleLoad = async () => {
        const loadedPrefab = await loadJson();
        if (!loadedPrefab) return;
        setPrefabData(loadedPrefab);
        onClose();
    };

    const handleSave = () => {
        saveJson(prefabData, "prefab");
        onClose();
    };

    const handleLoadIntoScene = async () => {
        const loadedPrefab = await loadJson();
        if (!loadedPrefab) return;

        setPrefabData(prev => ({
            ...prev,
            root: updateNodeById(prev.root, prev.root.id, root => ({
                ...root,
                children: [...(root.children ?? []), regenerateIds(loadedPrefab.root)]
            }))
        }));
        onClose();
    };

    return (
        <div
            style={{ ...menu.container, top: 28, right: 0 }}
            onClick={(e) => e.stopPropagation()}
        >
            <button
                style={menu.item}
                onClick={handleLoad}
            >
                📥 Load Prefab JSON
            </button>
            <button
                style={menu.item}
                onClick={handleSave}
            >
                💾 Save Prefab JSON
            </button>
            <button
                style={menu.item}
                onClick={handleLoadIntoScene}
            >
                📂 Load into Scene
            </button>
            <button
                style={menu.item}
                onClick={() => { onScreenshot?.(); onClose(); }}
            >
                📸 Screenshot
            </button>
            <button
                style={menu.item}
                onClick={() => { onExportGLB?.(); onClose(); }}
            >
                📦 Export GLB
            </button>
        </div>
    );
}
