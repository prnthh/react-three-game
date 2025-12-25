// Shared editor styles - single source of truth for all prefab editor UI

export const colors = {
    bg: 'rgba(0,0,0,0.6)',
    bgLight: 'rgba(255,255,255,0.06)',
    bgHover: 'rgba(255,255,255,0.1)',
    border: 'rgba(255,255,255,0.15)',
    borderLight: 'rgba(255,255,255,0.1)',
    borderFaint: 'rgba(255,255,255,0.05)',
    text: '#fff',
    textMuted: 'rgba(255,255,255,0.7)',
    danger: '#ffaaaa',
    dangerBg: 'rgba(255,80,80,0.2)',
    dangerBorder: 'rgba(255,80,80,0.4)',
};

export const fonts = {
    family: 'system-ui, sans-serif',
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
        overflow: 'hidden',
        backdropFilter: 'blur(8px)',
        fontFamily: fonts.family,
        fontSize: fonts.size,
    } as React.CSSProperties,

    header: {
        padding: '6px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        background: colors.bgLight,
        borderBottom: `1px solid ${colors.borderLight}`,
        fontSize: fonts.size,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    } as React.CSSProperties,

    input: {
        width: '100%',
        background: colors.bgHover,
        border: `1px solid ${colors.border}`,
        borderRadius: 3,
        padding: '4px 6px',
        color: colors.text,
        fontSize: fonts.size,
        outline: 'none',
    } as React.CSSProperties,

    btn: {
        background: colors.bgHover,
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
        opacity: 0.7,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
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
    },
    row: {
        display: 'flex',
        alignItems: 'center',
        padding: '3px 6px',
        borderBottom: `1px solid ${colors.borderFaint}`,
        cursor: 'pointer',
        whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
    selected: {
        background: 'rgba(255,255,255,0.12)',
    },
};

export const menu = {
    container: {
        position: 'fixed' as const,
        zIndex: 50,
        minWidth: 120,
        background: 'rgba(0,0,0,0.85)',
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
    },
    item: {
        width: '100%',
        textAlign: 'left' as const,
        padding: '6px 8px',
        background: 'transparent',
        border: 'none',
        color: colors.text,
        fontSize: fonts.size,
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
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 6,
        padding: '4px 6px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        color: colors.text,
        fontFamily: fonts.family,
        fontSize: fonts.size,
        backdropFilter: 'blur(8px)',
    },
    divider: {
        width: 1,
        background: 'rgba(255,255,255,0.2)',
    },
    disabled: {
        opacity: 0.4,
        cursor: 'not-allowed',
    },
};
