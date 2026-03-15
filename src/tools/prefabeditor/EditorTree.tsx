import { Dispatch, SetStateAction, useState, MouseEvent } from 'react';
import { Prefab, GameObject } from "./types";
import { getComponent } from './components/ComponentRegistry';
import { base, colors, tree } from './styles';
import { findNode, findParent, deleteNode, cloneNode, updateNodeById } from './utils';
import { useEditorContext } from './EditorContext';
import { Dropdown } from './Dropdown';
import { FileMenu, MenuTriggerButton, TreeContextMenu, TreeContextMenuState, TreeNodeMenu } from './EditorTreeMenus';

type DropPosition = 'before' | 'inside';

function moveNode(root: GameObject, draggedId: string, targetId: string, position: DropPosition): GameObject {
    const draggedNode = findNode(root, draggedId);
    const oldParent = findParent(root, draggedId);

    if (!draggedNode || !oldParent || findNode(draggedNode, targetId)) {
        return root;
    }

    if (position === 'before') {
        const targetParent = findParent(root, targetId);
        if (!targetParent?.children) return root;

        if (targetParent.id === oldParent.id) {
            const siblings = targetParent.children.filter(child => child.id !== draggedId);
            const targetIndex = siblings.findIndex(child => child.id === targetId);
            if (targetIndex === -1) return root;

            siblings.splice(targetIndex, 0, draggedNode);
            return updateNodeById(root, targetParent.id, parent => ({ ...parent, children: siblings }));
        }

        const rootWithoutDragged = updateNodeById(root, oldParent.id, parent => ({
            ...parent,
            children: (parent.children ?? []).filter(child => child.id !== draggedId)
        }));

        return updateNodeById(rootWithoutDragged, targetParent.id, parent => {
            const children = [...(parent.children ?? [])];
            const targetIndex = children.findIndex(child => child.id === targetId);
            if (targetIndex === -1) return parent;

            children.splice(targetIndex, 0, draggedNode);
            return { ...parent, children };
        });
    }

    const rootWithoutDragged = updateNodeById(root, oldParent.id, parent => ({
        ...parent,
        children: (parent.children ?? []).filter(child => child.id !== draggedId)
    }));

    return updateNodeById(rootWithoutDragged, targetId, target => ({
        ...target,
        children: [...(target.children ?? []), draggedNode]
    }));
}

function duplicateNodeBelow(root: GameObject, nodeId: string): { root: GameObject; duplicatedId: string } | null {
    const node = findNode(root, nodeId);
    const parent = findParent(root, nodeId);
    if (!node || !parent) return null;

    const duplicate = cloneNode(node);
    const nextRoot = updateNodeById(root, parent.id, currentParent => ({
        ...currentParent,
        children: (() => {
            const children = [...(currentParent.children ?? [])];
            const index = children.findIndex(child => child.id === nodeId);
            if (index === -1) return [...children, duplicate];
            children.splice(index + 1, 0, duplicate);
            return children;
        })()
    }));

    return { root: nextRoot, duplicatedId: duplicate.id };
}

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
    const { onFocusNode } = useEditorContext();
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
    const [collapsed, setCollapsed] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [contextMenu, setContextMenu] = useState<TreeContextMenuState>(null);

    if (!prefabData || !setPrefabData) return null;

    const toggleCollapse = (e: MouseEvent, id: string) => {
        e.stopPropagation();
        setCollapsedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleAddChild = (parentId: string) => {
        const newNode = {
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
        setSelectedId(newNode.id);
    };

    const handleDuplicate = (nodeId: string) => {
        if (nodeId === prefabData.root.id) return;
        setPrefabData(prev => {
            const result = duplicateNodeBelow(prev.root, nodeId);
            if (!result) return prev;

            setSelectedId(result.duplicatedId);

            return {
                ...prev,
                root: result.root
            };
        });
    };

    const handleDelete = (nodeId: string) => {
        if (nodeId === prefabData.root.id) return;
        setPrefabData(prev => ({ ...prev, root: deleteNode(prev.root, nodeId)! }));
        if (selectedId === nodeId) setSelectedId(null);
    };

    const handleToggleDisabled = (nodeId: string) => {
        setPrefabData(prev => ({
            ...prev,
            root: updateNodeById(prev.root, nodeId, node => ({
                ...node,
                disabled: !node.disabled
            }))
        }));
    };

    const closeContextMenu = () => setContextMenu(null);

    const openContextMenu = (nodeId: string, x: number, y: number) => {
        setSelectedId(nodeId);
        setContextMenu({ nodeId, x, y });
    };

    const handleFocus = (nodeId: string) => {
        setSelectedId(nodeId);
        onFocusNode?.(nodeId);
    };

    const renderTreeNodeMenu = (nodeId: string, isRoot: boolean, onClose: () => void) => (
        <TreeNodeMenu
            isRoot={isRoot}
            nodeId={nodeId}
            onAddChild={handleAddChild}
            onFocus={handleFocus}
            onDuplicate={isRoot ? undefined : handleDuplicate}
            onDelete={isRoot ? undefined : handleDelete}
            onClose={onClose}
        />
    );

    const handleDragStart = (e: React.DragEvent, id: string) => {
        if (id === prefabData.root.id) return e.preventDefault();
        e.dataTransfer.effectAllowed = "move";
        setDraggedId(id);
    };

    const getDropPosition = (e: React.DragEvent<HTMLDivElement>, isRoot: boolean): DropPosition => {
        if (isRoot) return 'inside';
        const rect = e.currentTarget.getBoundingClientRect();
        return e.clientY <= rect.top + rect.height * 0.35 ? 'before' : 'inside';
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, targetId: string, isRoot: boolean) => {
        if (!draggedId || draggedId === targetId) return;
        const draggedNode = findNode(prefabData.root, draggedId);
        if (draggedNode && findNode(draggedNode, targetId)) return;
        e.preventDefault();
        setDropTarget({ id: targetId, position: getDropPosition(e, isRoot) });
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
        const relatedTarget = e.relatedTarget;
        if (relatedTarget instanceof Node && e.currentTarget.contains(relatedTarget)) return;
        setDropTarget(current => current?.id === targetId ? null : current);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetId: string, isRoot: boolean) => {
        if (!draggedId || draggedId === targetId) return;
        e.preventDefault();
        const dropPosition = getDropPosition(e, isRoot);
        setPrefabData(prev => {
            const root = moveNode(prev.root, draggedId, targetId, dropPosition);
            return root === prev.root ? prev : { ...prev, root };
        });
        setDraggedId(null);
        setDropTarget(null);
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
        const isDropTarget = dropTarget?.id === node.id;
        const showDropBefore = isDropTarget && dropTarget?.position === 'before';
        const showDropInside = isDropTarget && dropTarget?.position === 'inside';

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
                        borderTop: showDropBefore ? `2px solid ${colors.accent}` : undefined,
                        boxShadow: showDropInside ? `inset 0 0 0 1px ${colors.accentBorder}` : undefined,
                    }}
                    draggable={!isRoot}
                    onClick={(e) => { e.stopPropagation(); setSelectedId(node.id); }}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openContextMenu(node.id, e.clientX, e.clientY);
                    }}
                    onDragStart={(e) => handleDragStart(e, node.id)}
                    onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}
                    onDragOver={(e) => handleDragOver(e, node.id, isRoot)}
                    onDragLeave={(e) => handleDragLeave(e, node.id)}
                    onDrop={(e) => handleDrop(e, node.id, isRoot)}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Dropdown
                                placement="bottom-end"
                                trigger={({ ref, toggle }) => (
                                    <MenuTriggerButton
                                        buttonRef={ref}
                                        onToggle={toggle}
                                        title="Node Actions"
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '0 4px',
                                            fontSize: 14,
                                            opacity: 0.7,
                                            color: 'inherit',
                                        }}
                                    >
                                        ⋯
                                    </MenuTriggerButton>
                                )}
                            >
                                {(close) => renderTreeNodeMenu(node.id, false, close)}
                            </Dropdown>
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
                        </div>
                    )}
                    {isRoot && (
                        <Dropdown
                            placement="bottom-end"
                            trigger={({ ref, toggle }) => (
                                <MenuTriggerButton
                                    buttonRef={ref}
                                    onToggle={toggle}
                                    title="Scene Actions"
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '0 4px',
                                        fontSize: 14,
                                        opacity: 0.7,
                                        color: 'inherit',
                                    }}
                                >
                                    ⋯
                                </MenuTriggerButton>
                            )}
                        >
                            {(close) => renderTreeNodeMenu(node.id, true, close)}
                        </Dropdown>
                    )}
                </div>
                {!isCollapsed && node.children && node.children.map(child => renderNode(child, depth + 1))}
            </div>
        );
    };

    return (
        <>
            <div style={{ ...tree.panel, width: collapsed ? 'auto' : 224 }}>
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
                            <Dropdown
                                placement="bottom-end"
                                trigger={({ ref, toggle }) => (
                                    <MenuTriggerButton
                                        buttonRef={ref}
                                        onToggle={toggle}
                                        title="Menu"
                                        style={{ ...base.btn, padding: '2px 6px', fontSize: 10 }}
                                    >
                                        ⋮
                                    </MenuTriggerButton>
                                )}
                            >
                                {(close) => (
                                    <FileMenu
                                        prefabData={prefabData}
                                        setPrefabData={setPrefabData}
                                        onClose={close}
                                    />
                                )}
                            </Dropdown>
                        </div>
                    )}
                </div>
                {!collapsed && (
                    <>
                        <div style={{ padding: '4px 4px', borderBottom: `1px solid ${colors.borderLight}` }}>
                            <input
                                type="text"
                                placeholder="Search nodes..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    ...base.input,
                                    padding: '4px 8px',
                                }}
                            />
                        </div>
                        <div className="tree-scroll" style={tree.scroll}>{renderNode(prefabData.root)}</div>
                    </>
                )}
            </div>
            <TreeContextMenu
                contextMenu={contextMenu}
                onClose={closeContextMenu}
            >
                {(nodeId, close) => renderTreeNodeMenu(nodeId, nodeId === prefabData.root.id, close)}
            </TreeContextMenu>

        </>
    );
}
