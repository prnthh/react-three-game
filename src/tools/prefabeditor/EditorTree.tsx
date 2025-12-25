import { Dispatch, SetStateAction, useState, MouseEvent } from 'react';
import { Prefab, GameObject } from "./types";
import { getComponent } from './components/ComponentRegistry';
import { base, tree, menu } from './styles';
import { findNode, findParent, deleteNode, cloneNode } from './utils';

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
            components: {
                transform: {
                    type: "Transform",
                    properties: { ...getComponent('Transform')?.defaultProperties }
                }
            }
        };

        setPrefabData(prev => {
            const newRoot = JSON.parse(JSON.stringify(prev.root));
            const parent = findNode(newRoot, parentId);
            if (parent) {
                parent.children = parent.children || [];
                parent.children.push(newNode);
            }
            return { ...prev, root: newRoot };
        });
        setContextMenu(null);
    };

    const handleDuplicate = (nodeId: string) => {
        if (nodeId === prefabData.root.id) return;

        setPrefabData(prev => {
            const newRoot = JSON.parse(JSON.stringify(prev.root));
            const parent = findParent(newRoot, nodeId);
            const node = findNode(newRoot, nodeId);

            if (parent && node) {
                const clone = cloneNode(node);
                parent.children = parent.children || [];
                parent.children.push(clone);
            }
            return { ...prev, root: newRoot };
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
            const newRoot = JSON.parse(JSON.stringify(prev.root));
            const draggedNode = findNode(newRoot, draggedId);
            if (draggedNode && findNode(draggedNode, targetId)) return prev;

            const parent = findParent(newRoot, draggedId);
            if (!parent) return prev;

            const nodeToMove = parent.children?.find(c => c.id === draggedId);
            if (!nodeToMove) return prev;

            parent.children = parent.children!.filter(c => c.id !== draggedId);

            const target = findNode(newRoot, targetId);
            if (target) {
                target.children = target.children || [];
                target.children.push(nodeToMove);
            }

            return { ...prev, root: newRoot };
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
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.id}</span>
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
