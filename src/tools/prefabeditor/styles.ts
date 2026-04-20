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

interface UtilityStyles {
    secondaryPanel: Style;
    compactActionButton: Style;
    monoTextInput: Style;
}

export const colors = {
    bg: '#f3f3f3',
    bgSurface: '#d7d7d7',
    bgLight: '#fafafa',
    bgHover: '#e6e6e6',
    bgInput: '#f5f5f5',
    border: '#6f6f6f',
    borderLight: '#9a9a9a',
    borderFaint: '#b8b8b8',
    text: '#2f2f2f',
    textMuted: '#5f5f5f',
    textDim: '#7f7f7f',
    accent: '#1e6f89',
    accentBg: '#a9dded',
    accentBorder: '#5e5e5e',
    danger: '#9c3232',
    dangerBg: '#efcaca',
    dangerBorder: '#6f6f6f',
};

export const fonts = {
    family: 'Tahoma, Verdana, sans-serif',
    size: 11,
    sizeSm: 10,
};

// Base component styles
export const base: BaseStyles = {
    panel: {
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        fontFamily: fonts.family,
        fontSize: fonts.size,
        borderRadius: 0,
        boxShadow: 'none',
    },

    header: {
        padding: '3px 6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        background: colors.bgLight,
        borderBottom: `1px solid ${colors.border}`,
        fontSize: fonts.size,
        fontWeight: 400,
        color: colors.text,
        minHeight: 22,
        boxSizing: 'border-box',
    },

    input: {
        width: '100%',
        background: colors.bgInput,
        border: `1px solid ${colors.border}`,
        borderRadius: 0,
        padding: '2px 4px',
        color: colors.text,
        fontSize: fonts.size,
        outline: 'none',
        minHeight: 22,
        boxSizing: 'border-box',
    },

    btn: {
        background: colors.bgSurface,
        border: `1px solid ${colors.border}`,
        borderRadius: 0,
        padding: '2px 6px',
        color: colors.text,
        fontSize: fonts.size,
        cursor: 'pointer',
        outline: 'none',
        minHeight: 22,
        boxSizing: 'border-box',
    },

    btnDanger: {
        background: colors.dangerBg,
        borderColor: colors.dangerBorder,
        color: colors.danger,
    },

    label: {
        fontSize: fonts.sizeSm,
        color: colors.textMuted,
        marginBottom: 2,
        fontWeight: 400,
    },

    row: {
        display: 'flex',
        gap: 4,
    },

    section: {
        paddingBottom: 4,
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
        width: 300,
    },
    content: {
        padding: 6,
        maxHeight: '80vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'thin',
        scrollbarColor: `${colors.bgLight} transparent`,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
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
        padding: 2,
        scrollbarWidth: 'thin',
        scrollbarColor: `${colors.bgLight} transparent`,
    },
    row: {
        display: 'flex',
        alignItems: 'center',
        padding: '2px 4px',
        borderBottomWidth: 1,
        borderBottomStyle: 'solid',
        borderBottomColor: colors.borderFaint,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
    },
    selected: {
        background: colors.accentBg,
        borderBottomColor: colors.accentBorder,
        boxShadow: 'none',
    },
    iconButton: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '0 2px',
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
        border: 'none',
        overflow: 'hidden',
        borderRadius: 0,
        boxShadow: 'none',
    },
    item: {
        width: '100%',
        textAlign: 'left',
        padding: '4px 8px',
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
        left: '232px',
        display: 'flex',
        gap: 4,
        padding: '2px 4px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.text,
        fontFamily: fonts.family,
        fontSize: fonts.size,
        borderRadius: 0,
        boxShadow: 'none',
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
        marginBottom: 4,
        backgroundColor: colors.bg,
        padding: 4,
        border: `1px solid ${colors.border}`,
        borderRadius: 0,
        boxShadow: 'none',
    },
};

export const ui: UtilityStyles = {
    secondaryPanel: {
        background: colors.bgSurface,
        border: `1px solid ${colors.border}`,
        borderRadius: 0,
        padding: 4,
        boxSizing: 'border-box',
    },
    compactActionButton: {
        ...base.btn,
        width: 28,
        minWidth: 28,
        padding: 0,
        flexShrink: 0,
    },
    monoTextInput: {
        ...base.input,
        fontFamily: 'monospace',
    },
};
