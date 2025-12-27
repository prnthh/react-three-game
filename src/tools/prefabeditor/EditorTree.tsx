import { Dispatch, SetStateAction, useState, MouseEvent } from 'react';
import { Prefab, GameObject } from "./types";
import { getComponent } from './components/ComponentRegistry';
import { base, tree, menu } from './styles';
import { findNode, findParent, deleteNode, cloneNode, updateNodeById } from './utils';

export default function EditorTree({ prefabData, setPrefabData, selectedId, setSelectedId }: {
    prefabData?: Prefab;
    setPrefabData?: Dispatch<SetStateAction<Prefab>>;
    selectedId: string | null;
    setSelectedId: Dispatch<SetStateAction<string | null>>;
}) {
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeId: string } | null>(null);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
    const [collapsed, setCollapsed] = useState(false);

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

    // Actions
    const handleAddChild = (parentId: string) => {
        const newNode: GameObject = {
            id: crypto.randomUUID(),
            name: "New Node",
            components: {
                transform: {
                    type: "Transform",
                    properties: { ...getComponent('Transform')?.defaultProperties }
                }
            }
        };

        setPrefabData(prev => ({
            ...prev,
            root: updateNodeById(prev.root, parentId, parent => ({
                ...parent,
                children: [...(parent.children ?? []), newNode]
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

            const clone = cloneNode(node);

            return {
                ...prev,
                root: updateNodeById(prev.root, parent.id, p => ({
                    ...p,
                    children: [...(p.children ?? []), clone]
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

    // Drag and Drop
    const handleDragStart = (e: React.DragEvent, id: string) => {
        if (id === prefabData.root.id) {
            e.preventDefault();
            return;
        }
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
            if (!draggedNode || !oldParent) return prev;

            // Prevent dropping into own subtree
            if (findNode(draggedNode, targetId)) return prev;

            // 1. Remove from old parent
            let root = updateNodeById(prev.root, oldParent.id, p => ({
                ...p,
                children: p.children!.filter(c => c.id !== draggedId)
            }));

            // 2. Add to new parent
            root = updateNodeById(root, targetId, t => ({
                ...t,
                children: [...(t.children ?? []), draggedNode]
            }));

            return { ...prev, root };
        });

        setDraggedId(null);
    };


    const renderNode = (node: GameObject, depth = 0): React.ReactNode => {
        if (!node) return null;

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
                    }}
                    draggable={!isRoot}
                    onClick={(e) => { e.stopPropagation(); setSelectedId(node.id); }}
                    onContextMenu={(e) => handleContextMenu(e, node.id)}
                    onDragStart={(e) => handleDragStart(e, node.id)}
                    onDragEnd={() => setDraggedId(null)}
                    onDragOver={(e) => handleDragOver(e, node.id)}
                    onDrop={(e) => handleDrop(e, node.id)}
                >
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
                {!isCollapsed && node.children && node.children.map(child => renderNode(child, depth + 1))}
            </div>
        );
    };

    return (
        <>
            <div style={{ ...tree.panel, width: collapsed ? 'auto' : 224 }} onClick={() => setContextMenu(null)}>
                <div style={base.header} onClick={() => setCollapsed(!collapsed)}>
                    <span>Scene</span>
                    <span>{collapsed ? '▶' : '◀'}</span>
                </div>
                {!collapsed && <div style={tree.scroll}>{renderNode(prefabData.root)}</div>}
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
