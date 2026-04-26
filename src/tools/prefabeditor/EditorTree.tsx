import { memo, MouseEvent, useCallback, useState } from 'react';
import { Prefab } from "./types";
import { base, colors, tree } from './styles';
import { useEditorContext, useEditorRef } from './PrefabEditor';
import { Dropdown } from './Dropdown';
import { FileMenu, TreeContextMenu, TreeContextMenuState, TreeNodeMenu } from './EditorTreeMenus';
import { createEmptyNode } from './prefab';
import { PrefabStoreState, usePrefabChildIds, usePrefabNode, usePrefabRootId, usePrefabStore, usePrefabStoreApi } from './prefabStore';

type DropPosition = 'before' | 'inside';

export default function EditorTree({
    selectedId,
    setSelectedId,
    getPrefab,
    onReplacePrefab,
    onImportPrefab,
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
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
}) {
    const { onFocusNode } = useEditorContext();
    const editor = useEditorRef();
    const rootId = usePrefabRootId();
    const store = usePrefabStoreApi();
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
    const [collapsed, setCollapsed] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [contextMenu, setContextMenu] = useState<TreeContextMenuState>(null);

    const toggleCollapse = (e: MouseEvent, id: string) => {
        e.stopPropagation();
        setCollapsedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleAddChild = (parentId: string) => {
        const newNode = createEmptyNode();

        editor.add(newNode, parentId);
        setSelectedId(newNode.id);
    };

    const handleDuplicate = (nodeId: string) => {
        if (nodeId === rootId) return;
        const duplicatedId = editor.duplicate(nodeId);
        if (duplicatedId) setSelectedId(duplicatedId);
    };

    const handleDelete = (nodeId: string) => {
        if (nodeId === rootId) return;
        editor.remove(nodeId);
        if (selectedId === nodeId) setSelectedId(null);
    };

    const handleToggleDisabled = (nodeId: string) => {
        editor.update(nodeId, n => ({ ...n, disabled: !n.disabled }));
    };

    const handleToggleLocked = (nodeId: string) => {
        const willLock = !store.getState().nodesById[nodeId]?.locked;
        editor.update(nodeId, n => ({ ...n, locked: !n.locked }));
        if (willLock && selectedId === nodeId) setSelectedId(null);
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
            locked={store.getState().nodesById[nodeId]?.locked}
            onAddChild={handleAddChild}
            onFocus={handleFocus}
            onToggleLock={isRoot ? undefined : handleToggleLocked}
            onDuplicate={isRoot ? undefined : handleDuplicate}
            onDelete={isRoot ? undefined : handleDelete}
            onClose={onClose}
        />
    );

    const handleDragStart = (e: React.DragEvent, id: string) => {
        if (id === rootId) return e.preventDefault();
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
        editor.move(draggedId, targetId, getDropPosition(e, isRoot));
        setDraggedId(null);
        setDropTarget(null);
    };

    const visibleIds = usePrefabStore(useCallback(
        state => searchQuery ? buildVisibleIds(state, rootId, searchQuery) : null,
        [rootId, searchQuery]
    ));

    return (
        <>
            <div style={{ ...tree.panel, width: collapsed ? 'auto' : 224 }}>
                <div style={base.header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => setCollapsed(!collapsed)}>
                        <span>{collapsed ? '▶' : '▼'}</span>
                        <span>Prefab</span>
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
                                    <button
                                        ref={ref}
                                        title="Menu"
                                        style={{ ...base.btn, padding: '2px 6px', fontSize: 10 }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggle();
                                        }}
                                    >
                                        ⋮
                                    </button>
                                )}
                            >
                                {(close) => (
                                    <FileMenu
                                        getPrefab={getPrefab}
                                        onReplacePrefab={onReplacePrefab}
                                        onImportPrefab={onImportPrefab}
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
                        <div style={tree.scroll}>
                            <TreeNode
                                nodeId={rootId}
                                depth={0}
                                rootId={rootId}
                                visibleIds={visibleIds}
                                collapsedIds={collapsedIds}
                                dropTarget={dropTarget}
                                selectedNodeId={selectedId}
                                onToggleCollapse={toggleCollapse}
                                onOpenContextMenu={openContextMenu}
                                onDragStart={handleDragStart}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}
                                renderTreeNodeMenu={renderTreeNodeMenu}
                                onToggleDisabled={handleToggleDisabled}
                                setSelectedId={setSelectedId}
                            />
                        </div>
                    </>
                )}
            </div>
            <TreeContextMenu
                contextMenu={contextMenu}
                onClose={closeContextMenu}
            >
                {(nodeId, close) => renderTreeNodeMenu(nodeId, nodeId === rootId, close)}
            </TreeContextMenu>

        </>
    );
}

const TreeNode = memo(function TreeNode({
    nodeId,
    depth,
    rootId,
    visibleIds,
    collapsedIds,
    dropTarget,
    selectedNodeId,
    onToggleCollapse,
    onOpenContextMenu,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
    renderTreeNodeMenu,
    onToggleDisabled,
    setSelectedId,
}: {
    nodeId: string;
    depth: number;
    rootId: string;
    visibleIds: Set<string> | null;
    collapsedIds: Set<string>;
    dropTarget: { id: string; position: DropPosition } | null;
    selectedNodeId: string | null;
    onToggleCollapse: (e: MouseEvent, id: string) => void;
    onOpenContextMenu: (nodeId: string, x: number, y: number) => void;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onDragOver: (e: React.DragEvent<HTMLDivElement>, targetId: string, isRoot: boolean) => void;
    onDragLeave: (e: React.DragEvent<HTMLDivElement>, targetId: string) => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>, targetId: string, isRoot: boolean) => void;
    onDragEnd: () => void;
    renderTreeNodeMenu: (nodeId: string, isRoot: boolean, onClose: () => void) => React.ReactNode;
    onToggleDisabled: (nodeId: string) => void;
    setSelectedId: (id: string | null) => void;
}) {
    const node = usePrefabNode(nodeId);
    const childIds = usePrefabChildIds(nodeId);
    const isSelected = selectedNodeId === nodeId;

    if (!node || (visibleIds && !visibleIds.has(nodeId))) return null;

    const isCollapsed = collapsedIds.has(nodeId);
    const hasChildren = childIds.length > 0;
    const isRoot = nodeId === rootId;
    const isDropTarget = dropTarget?.id === nodeId;
    const showDropBefore = isDropTarget && dropTarget?.position === 'before';
    const showDropInside = isDropTarget && dropTarget?.position === 'inside';

    return (
        <div>
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
                onClick={(e) => { e.stopPropagation(); setSelectedId(nodeId); }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenContextMenu(nodeId, e.clientX, e.clientY);
                }}
                onDragStart={(e) => onDragStart(e, nodeId)}
                onDragEnd={onDragEnd}
                onDragOver={(e) => onDragOver(e, nodeId, isRoot)}
                onDragLeave={(e) => onDragLeave(e, nodeId)}
                onDrop={(e) => onDrop(e, nodeId, isRoot)}
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
                        onClick={(e) => hasChildren && onToggleCollapse(e, nodeId)}
                    >
                        {isCollapsed ? '▶' : '▼'}
                    </span>
                    {!isRoot && <span style={{ marginRight: 4, opacity: 0.4 }}>⋮⋮</span>}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {node.name ?? node.id}
                    </span>
                    {node.locked && <span style={{ marginLeft: 6, opacity: 0.6 }}>🔒</span>}
                </div>
                {!isRoot && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Dropdown
                            placement="bottom-end"
                            trigger={({ ref, toggle }) => (
                                <button
                                    ref={ref}
                                    title="Node Actions"
                                    style={tree.iconButton}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggle();
                                    }}
                                >
                                    ⋯
                                </button>
                            )}
                        >
                            {(close) => renderTreeNodeMenu(nodeId, false, close)}
                        </Dropdown>
                        <button
                            style={{ ...tree.iconButton, opacity: node.disabled ? 0.5 : 0.7 }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleDisabled(nodeId);
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
                            <button
                                ref={ref}
                                title="Prefab Actions"
                                style={tree.iconButton}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggle();
                                }}
                            >
                                ⋯
                            </button>
                        )}
                    >
                        {(close) => renderTreeNodeMenu(nodeId, true, close)}
                    </Dropdown>
                )}
            </div>
            {!isCollapsed && childIds.map(childId => (
                <TreeNode
                    key={childId}
                    nodeId={childId}
                    depth={depth + 1}
                    rootId={rootId}
                    visibleIds={visibleIds}
                    collapsedIds={collapsedIds}
                    dropTarget={dropTarget}
                    selectedNodeId={selectedNodeId}
                    onToggleCollapse={onToggleCollapse}
                    onOpenContextMenu={onOpenContextMenu}
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                    renderTreeNodeMenu={renderTreeNodeMenu}
                    onToggleDisabled={onToggleDisabled}
                    setSelectedId={setSelectedId}
                />
            ))}
        </div>
    );
});

function buildVisibleIds(state: Pick<PrefabStoreState, 'nodesById' | 'childIdsById'>, rootId: string, query: string) {
    if (!query) return null;

    const visibleIds = new Set<string>();
    const lowerQuery = query.toLowerCase();

    const visit = (nodeId: string): boolean => {
        const node = state.nodesById[nodeId];
        if (!node) return false;

        const selfMatches = (node.name ?? node.id).toLowerCase().includes(lowerQuery);
        const childMatches = (state.childIdsById[nodeId] ?? []).some(visit);

        if (selfMatches || childMatches) {
            visibleIds.add(nodeId);
            return true;
        }

        return false;
    };

    visit(rootId);
    return visibleIds;
}
