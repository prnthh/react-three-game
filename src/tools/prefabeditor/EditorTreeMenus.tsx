import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Prefab } from './types';
import { menu } from './styles';
import { useEditorContext } from './PrefabEditor';
import { getComponentDef } from './components/ComponentRegistry';
import { loadJson, saveJson } from './utils';

export type TreeContextMenuState = { nodeId: string; x: number; y: number } | null;

function createEmptyPrefab(): Prefab {
    return {
        id: crypto.randomUUID(),
        name: 'New Prefab',
        root: {
            id: crypto.randomUUID(),
            name: 'Root',
            components: {
                transform: {
                    type: 'Transform',
                    properties: { ...getComponentDef('Transform')?.defaultProperties }
                }
            },
            children: []
        }
    };
}

function MenuPanel({
    children,
    style,
}: {
    children: React.ReactNode;
    style?: React.CSSProperties;
}) {
    return (
        <div style={{ ...menu.container, position: 'static', ...style }} onClick={(e) => e.stopPropagation()}>
            {children}
        </div>
    );
}

function MenuItemButton({
    children,
    onClick,
    danger = false,
    style,
}: {
    children: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
    style?: React.CSSProperties;
}) {
    return (
        <button
            style={danger ? { ...menu.item, ...menu.danger, ...style } : { ...menu.item, ...style }}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function MenuSubmenu({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div
            style={{ position: 'relative' }}
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
        >
            <MenuItemButton
                onClick={() => setIsOpen(open => !open)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
            >
                <span>{label}</span>
                <span aria-hidden="true">›</span>
            </MenuItemButton>
            {isOpen && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: '100%',
                        zIndex: 1,
                    }}
                >
                    <MenuPanel>{children}</MenuPanel>
                </div>
            )}
        </div>
    );
}

export function TreeNodeMenu({
    isRoot,
    nodeId,
    locked,
    onAddChild,
    onFocus,
    onToggleLock,
    onDuplicate,
    onDelete,
    onClose,
}: {
    isRoot: boolean;
    nodeId: string;
    locked?: boolean;
    onAddChild: (parentId: string) => void;
    onFocus: (nodeId: string) => void;
    onToggleLock?: (nodeId: string) => void;
    onDuplicate?: (nodeId: string) => void;
    onDelete?: (nodeId: string) => void;
    onClose: () => void;
}) {
    return (
        <MenuPanel>
            <MenuItemButton onClick={() => { onAddChild(nodeId); onClose(); }}>
                Add Child
            </MenuItemButton>
            <MenuItemButton onClick={() => { onFocus(nodeId); onClose(); }}>
                Focus Camera
            </MenuItemButton>
            {!isRoot && onToggleLock && (
                <MenuItemButton onClick={() => { onToggleLock(nodeId); onClose(); }}>
                    {locked ? 'Unlock' : 'Lock'}
                </MenuItemButton>
            )}
            {!isRoot && onDuplicate && (
                <MenuItemButton onClick={() => { onDuplicate(nodeId); onClose(); }}>
                    Duplicate
                </MenuItemButton>
            )}
            {!isRoot && onDelete && (
                <MenuItemButton danger onClick={() => { onDelete(nodeId); onClose(); }}>
                    Delete
                </MenuItemButton>
            )}
        </MenuPanel>
    );
}

export function TreeContextMenu({
    contextMenu,
    onClose,
    children,
}: {
    contextMenu: TreeContextMenuState;
    onClose: () => void;
    children: (nodeId: string, onClose: () => void) => React.ReactNode;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

    useEffect(() => {
        if (!contextMenu) return;

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (panelRef.current?.contains(target)) return;
            onClose();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [contextMenu, onClose]);

    useEffect(() => {
        if (!contextMenu) {
            setPosition(null);
            return;
        }
        if (!panelRef.current || typeof window === 'undefined') return;

        const panelRect = panelRef.current.getBoundingClientRect();
        const left = Math.max(8, Math.min(contextMenu.x, window.innerWidth - panelRect.width - 8));
        const top = Math.max(8, Math.min(contextMenu.y, window.innerHeight - panelRect.height - 8));
        setPosition({ left, top });
    }, [contextMenu]);

    if (!contextMenu || typeof document === 'undefined') return null;

    return createPortal(
        <div
            ref={panelRef}
            style={{
                position: 'fixed',
                left: position?.left ?? contextMenu.x,
                top: position?.top ?? contextMenu.y,
                zIndex: 1000,
            }}
            onMouseLeave={onClose}
            onContextMenu={(e) => e.preventDefault()}
        >
            {children(contextMenu.nodeId, onClose)}
        </div>,
        document.body
    );
}

export function FileMenu({
    getPrefab,
    onReplacePrefab,
    onImportPrefab,
    onClose
}: {
    getPrefab: () => Prefab;
    onReplacePrefab: (prefab: Prefab) => void;
    onImportPrefab: (prefab: Prefab) => void;
    onClose: () => void;
}) {
    const { onScreenshot, onExportGLB } = useEditorContext();

    const handleNew = () => {
        onReplacePrefab(createEmptyPrefab());
        onClose();
    };

    const handleOpen = async () => {
        const loaded = await loadJson();
        if (!loaded) return;
        onReplacePrefab(loaded);
        onClose();
    };

    const handleSave = () => {
        saveJson(getPrefab(), 'prefab');
        onClose();
    };

    const handleImport = async () => {
        const loaded = await loadJson();
        if (!loaded) return;

        onImportPrefab(loaded);
        onClose();
    };

    return (
        <MenuPanel style={{ overflow: 'visible' }}>
            <MenuSubmenu label="File">
                <MenuItemButton onClick={handleNew}>
                    New Prefab
                </MenuItemButton>
                <MenuItemButton onClick={handleOpen}>
                    Open Prefab
                </MenuItemButton>
                <MenuItemButton onClick={handleImport}>
                    Import Prefab
                </MenuItemButton>
                <MenuItemButton onClick={handleSave}>
                    Save Prefab
                </MenuItemButton>
            </MenuSubmenu>
            <MenuSubmenu label="Export">
                <MenuItemButton onClick={() => { onExportGLB?.(); onClose(); }}>
                    GLB
                </MenuItemButton>
                <MenuItemButton onClick={() => { onScreenshot?.(); onClose(); }}>
                    PNG
                </MenuItemButton>
            </MenuSubmenu>
        </MenuPanel>
    );
}