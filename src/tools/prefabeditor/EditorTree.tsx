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

    const styles: Record<string, React.CSSProperties> = {
        panel: {
            background: "rgba(0,0,0,0.55)",
            color: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6,
            overflow: "hidden",
            maxHeight: "85vh",
            display: "flex",
            flexDirection: "column",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            fontSize: 11,
            lineHeight: 1.2,
            userSelect: "none",
            WebkitUserSelect: "none",
        },
        panelHeader: {
            padding: "4px 6px",
            borderBottom: "1px solid rgba(255,255,255,0.10)",
            display: "flex",
            gap: 8,
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            background: "rgba(255,255,255,0.05)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontSize: 10,
            color: "rgba(255,255,255,0.7)",
        },
        scroll: {
            overflowY: "auto",
        },
        row: {
            display: "flex",
            alignItems: "center",
            padding: "2px 6px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            cursor: "pointer",
            whiteSpace: "nowrap",
        },
        rowSelected: {
            background: "rgba(255,255,255,0.10)",
        },
        chevron: {
            width: 12,
            textAlign: "center",
            opacity: 0.55,
            fontSize: 10,
            marginRight: 4,
            cursor: "pointer",
        },
        idText: {
            fontSize: 11,
            overflow: "hidden",
            textOverflow: "ellipsis",
        },
        dragHandle: {
            width: 14,
            height: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 4,
            opacity: 0.4,
            cursor: "grab",
            fontSize: 10,
        },
        contextMenu: {
            position: "fixed",
            zIndex: 50,
            minWidth: 120,
            background: "rgba(0,0,0,0.82)",
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: 6,
            overflow: "hidden",
            boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
        },
        menuItem: {
            width: "100%",
            textAlign: "left",
            padding: "6px 8px",
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.9)",
            font: "inherit",
            cursor: "pointer",
        },
        menuItemDanger: {
            color: "rgba(255,120,120,0.95)",
        },
        menuDivider: {
            borderTop: "1px solid rgba(255,255,255,0.10)",
        }
    };

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
        if (id === prefabData.root.id) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
        setDraggedId(id);
    };

    const handleDragEnd = () => {
        setDraggedId(null);
    };

    const handleDragOver = (e: React.DragEvent, targetId: string) => {
        if (!draggedId || draggedId === targetId) return;
        const draggedNode = findNode(prefabData.root, draggedId);
        if (draggedNode && findNode(draggedNode, targetId)) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
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

    const renderNode = (node: GameObject, depth: number = 0) => {
        if (!node) return null;

        const isSelected = node.id === selectedId;
        const isCollapsed = collapsedIds.has(node.id);
        const hasChildren = node.children && node.children.length > 0;

        return (
            <div key={node.id}>
                <div
                    style={{
                        ...styles.row,
                        ...(isSelected ? styles.rowSelected : null),
                        paddingLeft: `${depth * 10 + 6}px`,
                        cursor: node.id !== prefabData.root.id ? "grab" : "pointer",
                    }}
                    draggable={node.id !== prefabData.root.id}
                    onClick={(e) => { e.stopPropagation(); setSelectedId(node.id); }}
                    onContextMenu={(e) => handleContextMenu(e, node.id)}
                    onDragStart={(e) => handleDragStart(e, node.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, node.id)}
                    onDrop={(e) => handleDrop(e, node.id)}
                    onPointerEnter={(e) => {
                        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.06)";
                    }}
                    onPointerLeave={(e) => {
                        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                    }}
                >
                    <span
                        style={{
                            ...styles.chevron,
                            visibility: hasChildren ? 'visible' : 'hidden',
                        }}
                        onClick={(e) => hasChildren && toggleCollapse(e, node.id)}
                        onPointerEnter={(e) => {
                            (e.currentTarget as HTMLSpanElement).style.opacity = "0.9";
                        }}
                        onPointerLeave={(e) => {
                            (e.currentTarget as HTMLSpanElement).style.opacity = "0.55";
                        }}
                    >
                        {isCollapsed ? '▶' : '▼'}
                    </span>
                    {node.id !== prefabData.root.id && (
                        <span
                            style={styles.dragHandle}
                            onPointerEnter={(e) => {
                                (e.currentTarget as HTMLSpanElement).style.opacity = "0.9";
                            }}
                            onPointerLeave={(e) => {
                                (e.currentTarget as HTMLSpanElement).style.opacity = "0.4";
                            }}
                        >
                            ⋮⋮
                        </span>
                    )}
                    <span style={styles.idText}>
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
            <div
                style={{
                    ...styles.panel,
                    width: isTreeCollapsed ? 'auto' : '14rem',
                }}
                onClick={closeContextMenu}
            >
                <div
                    style={styles.panelHeader}
                    onClick={(e) => { e.stopPropagation(); setIsTreeCollapsed(!isTreeCollapsed); }}
                    onPointerEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.08)";
                    }}
                    onPointerLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.05)";
                    }}
                >
                    <span>Prefab Graph</span>
                    <span style={{ fontSize: 10, opacity: 0.8 }}>{isTreeCollapsed ? '▶' : '◀'}</span>
                </div>
                {!isTreeCollapsed && (
                    <div style={{ ...styles.scroll, padding: 2 }}>
                        {renderNode(prefabData.root)}
                    </div>
                )}
            </div>

            {contextMenu && (
                <div
                    style={{
                        ...styles.contextMenu,
                        top: contextMenu.y,
                        left: contextMenu.x,
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onPointerLeave={closeContextMenu}
                >
                    <button
                        style={{ ...styles.menuItem, ...styles.menuDivider }}
                        onClick={() => handleAddChild(contextMenu.nodeId)}
                        onPointerEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
                        }}
                        onPointerLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                        }}
                    >
                        Add Child
                    </button>
                    {contextMenu.nodeId !== prefabData.root.id && (
                        <>
                            <button
                                style={{ ...styles.menuItem, ...styles.menuDivider }}
                                onClick={() => handleDuplicate(contextMenu.nodeId)}
                                onPointerEnter={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
                                }}
                                onPointerLeave={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                                }}
                            >
                                Duplicate
                            </button>
                            <button
                                style={{ ...styles.menuItem, ...styles.menuItemDanger }}
                                onClick={() => handleDelete(contextMenu.nodeId)}
                                onPointerEnter={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
                                }}
                                onPointerLeave={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                                }}
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
