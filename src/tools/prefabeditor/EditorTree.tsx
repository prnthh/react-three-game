import { Dispatch, SetStateAction, useState, MouseEvent } from 'react';
import { Prefab, GameObject } from "./types";
import { getComponent } from './components/ComponentRegistry';

interface EditorTreeProps {
    prefabData?: Prefab;
    setPrefabData?: Dispatch<SetStateAction<Prefab>>;
    selectedId: string | null;
    setSelectedId: Dispatch<SetStateAction<string | null>>;
}

export default function EditorTree({ prefabData, setPrefabData, selectedId, setSelectedId }: EditorTreeProps) {
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeId: string } | null>(null);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
    const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);

    if (!prefabData || !setPrefabData) return null;

    const handleContextMenu = (e: MouseEvent, nodeId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
    };

    const closeContextMenu = () => setContextMenu(null);

    const toggleCollapse = (e: MouseEvent, id: string) => {
        e.stopPropagation();
        setCollapsedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Actions
    const handleAddChild = (parentId: string) => {
        const newNode: GameObject = {
            id: crypto.randomUUID(),
            enabled: true,
            visible: true,
            components: {
                transform: {
                    type: "Transform",
                    properties: { ...getComponent('Transform')?.defaultProperties }
                }
            }
        };

        setPrefabData(prev => {
            const newRoot = JSON.parse(JSON.stringify(prev.root)); // Deep clone for safety
            const parent = findNode(newRoot, parentId);
            if (parent) {
                parent.children = parent.children || [];
                parent.children.push(newNode);
            }
            return { ...prev, root: newRoot };
        });
        closeContextMenu();
    };

    const handleDuplicate = (nodeId: string) => {
        if (nodeId === prefabData.root.id) return; // Cannot duplicate root

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
        closeContextMenu();
    };

    const handleDelete = (nodeId: string) => {
        if (nodeId === prefabData.root.id) return; // Cannot delete root

        setPrefabData(prev => {
            const newRoot = deleteNodeFromTree(JSON.parse(JSON.stringify(prev.root)), nodeId);
            return { ...prev, root: newRoot! };
        });
        if (selectedId === nodeId) setSelectedId(null);
        closeContextMenu();
    };

    // Drag and Drop
    const handleDragStart = (e: React.DragEvent, id: string) => {
        e.stopPropagation();
        if (id === prefabData.root.id) {
            e.preventDefault(); // Cannot drag root
            return;
        }
        setDraggedId(id);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedId || draggedId === targetId) return;

        // Check for cycles: target cannot be a descendant of dragged node
        const draggedNode = findNode(prefabData.root, draggedId);
        if (draggedNode && findNode(draggedNode, targetId)) return;

        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedId || draggedId === targetId) return;

        setPrefabData(prev => {
            const newRoot = JSON.parse(JSON.stringify(prev.root));

            // Check cycle again on the fresh tree
            const draggedNodeRef = findNode(newRoot, draggedId);
            if (draggedNodeRef && findNode(draggedNodeRef, targetId)) return prev;

            // Remove from old parent
            const parent = findParent(newRoot, draggedId);
            if (!parent) return prev;

            const nodeToMove = parent.children?.find(c => c.id === draggedId);
            if (!nodeToMove) return prev;

            parent.children = parent.children!.filter(c => c.id !== draggedId);

            // Add to new parent
            const target = findNode(newRoot, targetId);
            if (target) {
                target.children = target.children || [];
                target.children.push(nodeToMove);
            }

            return { ...prev, root: newRoot };
        });
        setDraggedId(null);
    };

    const renderNode = (node: GameObject, depth: number = 0) => {
        const isSelected = node.id === selectedId;
        const isCollapsed = collapsedIds.has(node.id);
        const hasChildren = node.children && node.children.length > 0;

        return (
            <div key={node.id} className="select-none">
                <div
                    className={`flex items-center py-0.5 px-1 cursor-pointer border-b border-cyan-500/10 ${isSelected ? 'bg-cyan-500/30 hover:bg-cyan-500/40 border-cyan-400/30' : 'hover:bg-cyan-500/10'}`}
                    style={{ paddingLeft: `${depth * 8 + 4}px` }}
                    onClick={(e) => { e.stopPropagation(); setSelectedId(node.id); }}
                    onContextMenu={(e) => handleContextMenu(e, node.id)}
                    draggable={node.id !== prefabData.root.id}
                    onDragStart={(e) => handleDragStart(e, node.id)}
                    onDragOver={(e) => handleDragOver(e, node.id)}
                    onDrop={(e) => handleDrop(e, node.id)}
                >
                    <span
                        className={`mr-0.5 w-3 text-center text-cyan-400/50 hover:text-cyan-400 cursor-pointer text-[8px] ${hasChildren ? '' : 'invisible'}`}
                        onClick={(e) => hasChildren && toggleCollapse(e, node.id)}
                    >
                        {isCollapsed ? '▶' : '▼'}
                    </span>
                    <span className="text-[10px] truncate font-mono text-cyan-300">
                        {node.id}
                    </span>
                </div>
                {!isCollapsed && node.children && (
                    <div>
                        {node.children.map(child => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            <div className="bg-black/70 backdrop-blur-sm text-white border border-cyan-500/30 max-h-[85vh] overflow-y-auto flex flex-col" style={{ width: isTreeCollapsed ? 'auto' : '14rem' }} onClick={closeContextMenu}>
                <div
                    className="px-1.5 py-1 font-mono text-[10px] bg-cyan-500/10 border-b border-cyan-500/30 sticky top-0 uppercase tracking-wider text-cyan-400/80 cursor-pointer hover:bg-cyan-500/20 flex items-center justify-between"
                    onClick={(e) => { e.stopPropagation(); setIsTreeCollapsed(!isTreeCollapsed); }}
                >
                    <span>Prefab Graph</span>
                    <span className="text-[8px]">{isTreeCollapsed ? '▶' : '◀'}</span>
                </div>
                {!isTreeCollapsed && (
                    <div className="flex-1 py-0.5">
                        {renderNode(prefabData.root)}
                    </div>
                )}
            </div>

            {contextMenu && (
                <div
                    className="fixed bg-black/90 backdrop-blur-sm border border-cyan-500/40 z-50 min-w-[100px]"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        className="w-full text-left px-2 py-1 hover:bg-cyan-500/20 text-[10px] text-cyan-300 font-mono border-b border-cyan-500/20"
                        onClick={() => handleAddChild(contextMenu.nodeId)}
                    >
                        Add Child
                    </button>
                    {contextMenu.nodeId !== prefabData.root.id && (
                        <>
                            <button
                                className="w-full text-left px-2 py-1 hover:bg-cyan-500/20 text-[10px] text-cyan-300 font-mono border-b border-cyan-500/20"
                                onClick={() => handleDuplicate(contextMenu.nodeId)}
                            >
                                Duplicate
                            </button>
                            <button
                                className="w-full text-left px-2 py-1 hover:bg-red-500/20 text-[10px] text-red-400 font-mono"
                                onClick={() => handleDelete(contextMenu.nodeId)}
                            >
                                Delete
                            </button>
                        </>
                    )}
                </div>
            )}
        </>
    );
}

// --- Helpers ---

function findNode(root: GameObject, id: string): GameObject | null {
    if (root.id === id) return root;
    if (root.children) {
        for (const child of root.children) {
            const found = findNode(child, id);
            if (found) return found;
        }
    }
    return null;
}

function findParent(root: GameObject, id: string): GameObject | null {
    if (!root.children) return null;
    for (const child of root.children) {
        if (child.id === id) return root;
        const found = findParent(child, id);
        if (found) return found;
    }
    return null;
}

function deleteNodeFromTree(root: GameObject, id: string): GameObject | null {
    if (root.id === id) return null;
    if (root.children) {
        root.children = root.children
            .map(child => deleteNodeFromTree(child, id))
            .filter((child): child is GameObject => child !== null);
    }
    return root;
}

function cloneNode(node: GameObject): GameObject {
    const newNode = { ...node, id: crypto.randomUUID() };
    if (newNode.children) {
        newNode.children = newNode.children.map(child => cloneNode(child));
    }
    return newNode;
}
