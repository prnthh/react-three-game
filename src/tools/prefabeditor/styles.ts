// Shared editor styles - single source of truth for all prefab editor UI

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
export const base = {
    panel: {
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        fontFamily: fonts.family,
        fontSize: fonts.size,
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    } as React.CSSProperties,

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
    } as React.CSSProperties,

    input: {
        width: '100%',
        background: colors.bgInput,
        border: `1px solid ${colors.border}`,
        borderRadius: 3,
        padding: '5px 8px',
        color: colors.text,
        fontSize: fonts.size,
        outline: 'none',
    } as React.CSSProperties,

    btn: {
        background: colors.bgLight,
        border: `1px solid ${colors.border}`,
        borderRadius: 3,
        padding: '4px 8px',
        color: colors.text,
        fontSize: fonts.size,
        cursor: 'pointer',
        outline: 'none',
    } as React.CSSProperties,

    btnDanger: {
        background: colors.dangerBg,
        borderColor: colors.dangerBorder,
        color: colors.danger,
    } as React.CSSProperties,

    label: {
        fontSize: fonts.sizeSm,
        color: colors.textMuted,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontWeight: 500,
    } as React.CSSProperties,

    row: {
        display: 'flex',
        gap: 6,
    } as React.CSSProperties,

    section: {
        paddingBottom: 8,
        borderBottom: `1px solid ${colors.borderLight}`,
    } as React.CSSProperties,
};

// Specific panel styles
export const inspector = {
    panel: {
        ...base.panel,
        position: 'absolute' as const,
        top: 8,
        right: 8,
        zIndex: 20,
        width: 260,
    },
    content: {
        padding: 8,
        maxHeight: '80vh',
        overflowY: 'auto' as const,
        overflowX: 'hidden' as const,
        boxSizing: 'border-box' as const,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 8,
    },
};

export const tree = {
    panel: {
        ...base.panel,
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column' as const,
        userSelect: 'none' as const,
    },
    scroll: {
        overflowY: 'auto' as const,
        padding: 4,
        scrollbarWidth: 'thin' as const,
        scrollbarColor: `${colors.bgLight} transparent`,
    } as React.CSSProperties,
    row: {
        display: 'flex',
        alignItems: 'center',
        padding: '3px 6px',
        borderBottomWidth: 1,
        borderBottomStyle: 'solid',
        borderBottomColor: colors.borderFaint,
        cursor: 'pointer',
        whiteSpace: 'nowrap' as const,
        borderRadius: 2,
    } as React.CSSProperties,
    selected: {
        background: colors.accentBg,
        borderBottomColor: colors.accentBorder,
    },
};

export const menu = {
    container: {
        position: 'fixed' as const,
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
        textAlign: 'left' as const,
        padding: '7px 12px',
        background: 'transparent',
        border: 'none',
        color: colors.text,
        fontSize: fonts.size,
        whiteSpace: 'nowrap' as const,
        cursor: 'pointer',
        outline: 'none',
    } as React.CSSProperties,
    danger: {
        color: colors.danger,
    },
};

export const toolbar = {
    panel: {
        position: 'absolute' as const,
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

// Shared scrollbar CSS (inject via <style> tag since CSS can't be bundled)
export const scrollbarCSS = `
.prefab-scroll::-webkit-scrollbar,
.tree-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.prefab-scroll::-webkit-scrollbar-track,
.tree-scroll::-webkit-scrollbar-track { background: transparent; }
.prefab-scroll::-webkit-scrollbar-thumb,
.tree-scroll::-webkit-scrollbar-thumb { background: ${colors.border}; border-radius: 3px; }
.prefab-scroll::-webkit-scrollbar-thumb:hover,
.tree-scroll::-webkit-scrollbar-thumb:hover { background: #555; }
.prefab-scroll { scrollbar-width: thin; scrollbar-color: ${colors.border} transparent; }
`;

// Reusable component card style for inspector sections
export const componentCard = {
    container: {
        marginBottom: 8,
        backgroundColor: colors.bgSurface,
        padding: 8,
        borderRadius: 4,
        border: `1px solid ${colors.border}`,
    } as React.CSSProperties,
};
