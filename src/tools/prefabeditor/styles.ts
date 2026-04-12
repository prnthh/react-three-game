import type { CSSProperties } from 'react';

// Shared editor styles - single source of truth for all prefab editor UI

type Style = CSSProperties;

interface BaseStyles {
    panel: Style;
    header: Style;
    input: Style;
    btn: Style;
    btnDanger: Style;
    label: Style;
    row: Style;
    section: Style;
}

interface InspectorStyles {
    panel: Style;
    content: Style;
}

interface TreeStyles {
    panel: Style;
    scroll: Style;
    row: Style;
    selected: Style;
    iconButton: Style;
}

interface MenuStyles {
    container: Style;
    item: Style;
    danger: Style;
}

interface ToolbarStyles {
    panel: Style;
    divider: Style;
    disabled: Style;
}

interface ComponentCardStyles {
    container: Style;
}

export const colors = {
    bg: '#1e1e1e',
    bgSurface: '#252526',
    bgLight: '#2d2d2d',
    bgHover: '#2a2d2e',
    bgInput: '#1a1a1a',
    border: '#3c3c3c',
    borderLight: '#333333',
    borderFaint: '#2a2a2a',
    text: '#cccccc',
    textMuted: '#999999',
    textDim: '#666666',
    accent: '#4c9eff',
    accentBg: 'rgba(76, 158, 255, 0.12)',
    accentBorder: 'rgba(76, 158, 255, 0.4)',
    danger: '#f44747',
    dangerBg: 'rgba(244, 71, 71, 0.12)',
    dangerBorder: 'rgba(244, 71, 71, 0.35)',
};

export const fonts = {
    family: 'system-ui, -apple-system, sans-serif',
    size: 11,
    sizeSm: 10,
};

// Base component styles
export const base: BaseStyles = {
    panel: {
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        fontFamily: fonts.family,
        fontSize: fonts.size,
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    },

    header: {
        padding: '7px 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        background: colors.bgLight,
        borderBottom: `1px solid ${colors.borderLight}`,
        fontSize: fonts.size,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        color: colors.text,
    },

    input: {
        width: '100%',
        background: colors.bgInput,
        border: `1px solid ${colors.border}`,
        borderRadius: 3,
        padding: '5px 8px',
        color: colors.text,
        fontSize: fonts.size,
        outline: 'none',
    },

    btn: {
        background: colors.bgLight,
        border: `1px solid ${colors.border}`,
        borderRadius: 3,
        padding: '4px 8px',
        color: colors.text,
        fontSize: fonts.size,
        cursor: 'pointer',
        outline: 'none',
    },

    btnDanger: {
        background: colors.dangerBg,
        borderColor: colors.dangerBorder,
        color: colors.danger,
    },

    label: {
        fontSize: fonts.sizeSm,
        color: colors.textMuted,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontWeight: 500,
    },

    row: {
        display: 'flex',
        gap: 6,
    },

    section: {
        paddingBottom: 8,
        borderBottom: `1px solid ${colors.borderLight}`,
    },
};

// Specific panel styles
export const inspector: InspectorStyles = {
    panel: {
        ...base.panel,
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 20,
        width: 260,
    },
    content: {
        padding: 8,
        maxHeight: '80vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'thin',
        scrollbarColor: `${colors.bgLight} transparent`,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
};

export const tree: TreeStyles = {
    panel: {
        ...base.panel,
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
    },
    scroll: {
        overflowY: 'auto',
        padding: 4,
        scrollbarWidth: 'thin',
        scrollbarColor: `${colors.bgLight} transparent`,
    },
    row: {
        display: 'flex',
        alignItems: 'center',
        padding: '3px 6px',
        borderBottomWidth: 1,
        borderBottomStyle: 'solid',
        borderBottomColor: colors.borderFaint,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        borderRadius: 2,
    },
    selected: {
        background: colors.accentBg,
        borderBottomColor: colors.accentBorder,
    },
    iconButton: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '0 4px',
        fontSize: 14,
        opacity: 0.7,
        color: 'inherit',
    },
};

export const menu: MenuStyles = {
    container: {
        position: 'fixed',
        zIndex: 50,
        minWidth: 'auto',
        width: 'max-content',
        maxWidth: 'min(240px, calc(100vw - 16px))',
        background: colors.bgSurface,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
    },
    item: {
        width: '100%',
        textAlign: 'left',
        padding: '7px 12px',
        background: 'transparent',
        border: 'none',
        color: colors.text,
        fontSize: fonts.size,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        outline: 'none',
    },
    danger: {
        color: colors.danger,
    },
};

export const toolbar: ToolbarStyles = {
    panel: {
        position: 'absolute',
        top: 8,
        left: '240px',
        display: 'flex',
        gap: 6,
        padding: '4px 6px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        color: colors.text,
        fontFamily: fonts.family,
        fontSize: fonts.size,
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    },
    divider: {
        width: 1,
        background: colors.borderLight,
    },
    disabled: {
        opacity: 0.4,
        cursor: 'not-allowed',
    },
};

// Reusable component card style for inspector sections
export const componentCard: ComponentCardStyles = {
    container: {
        marginBottom: 8,
        backgroundColor: colors.bgSurface,
        padding: 8,
        borderRadius: 4,
        border: `1px solid ${colors.border}`,
    },
};
