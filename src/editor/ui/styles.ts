import type { CSSProperties } from 'react';

// Shared editor theme. These are inline styles so the editor ships fully styled
// from the npm package without requiring consumers to import a stylesheet.

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

interface PopupStyles {
    modal: Style;
}

export const editorTheme = {
    colors: {
        bg: 'rgba(13, 19, 30, 0.64)',
        bgSurface: 'rgba(25, 35, 51, 0.82)',
        bgLight: 'rgba(32, 43, 61, 0.9)',
        bgHover: 'rgba(48, 64, 87, 0.94)',
        bgInput: 'rgba(9, 15, 25, 0.9)',
        border: '#36445a',
        borderLight: '#2c394d',
        borderFaint: '#263247',
        text: '#edf2f8',
        textMuted: '#a9b5c6',
        textDim: '#748198',
        accent: '#8da2ff',
        accentBg: '#273764',
        accentBorder: '#6279dc',
        danger: '#ff9b9b',
        dangerBg: '#46272d',
        dangerBorder: '#7d424a',
    },
    fonts: {
        family: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
        size: 12,
        sizeSm: 10,
    },
    radii: {
        panel: 5,
        control: 3,
        card: 4,
    },
} as const;

export const colors = editorTheme.colors;
export const fonts = editorTheme.fonts;
export const radii = editorTheme.radii;

const panelFrame: Style = {
    background: colors.bg,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.panel,
    fontFamily: fonts.family,
    fontSize: fonts.size,
    lineHeight: 1.35,
    colorScheme: 'dark',
    overflow: 'hidden',
};

const controlFrame: Style = {
    border: `1px solid ${colors.border}`,
    borderRadius: radii.control,
    color: colors.text,
    fontFamily: fonts.family,
    fontSize: fonts.size,
    minHeight: 28,
    outline: 'none',
    boxSizing: 'border-box',
};

const verticalScroll: Style = {
    overflowY: 'auto',
    scrollbarWidth: 'thin',
    scrollbarColor: `${colors.border} transparent`,
};

const nestedSurface: Style = {
    background: colors.bgSurface,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.card,
    boxSizing: 'border-box',
};

// Base component styles
export const base: BaseStyles = {
    panel: panelFrame,

    header: {
        padding: '8px 10px',
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        background: colors.bgSurface,
        borderBottom: `1px solid ${colors.border}`,
        fontSize: fonts.size,
        fontWeight: 650,
        letterSpacing: '0.01em',
        color: colors.text,
        minHeight: 34,
        boxSizing: 'border-box',
        fontFamily: fonts.family,
        borderRadius: 0,
    },

    input: {
        ...controlFrame,
        width: '100%',
        background: colors.bgInput,
        padding: '5px 8px',
    },

    btn: {
        ...controlFrame,
        background: colors.bgLight,
        padding: '5px 9px',
        cursor: 'pointer',
        fontWeight: 550,
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
        fontWeight: 650,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
    },

    row: {
        display: 'flex',
        gap: 6,
    },

    section: {
        paddingBottom: 8,
    },
};

// Specific panel styles
export const inspector: InspectorStyles = {
    panel: {
        ...base.panel,
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 20,
        width: 320,
    },
    content: {
        ...verticalScroll,
        padding: 10,
        maxHeight: 'calc(100vh - 70px)',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
};

export const tree: TreeStyles = {
    panel: {
        ...base.panel,
        maxHeight: 'calc(100vh - 24px)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
    },
    scroll: {
        ...verticalScroll,
        flex: 1,
        minHeight: 0,
        padding: 5,
    },
    row: {
        display: 'flex',
        alignItems: 'center',
        padding: '5px 7px',
        borderBottomWidth: 1,
        borderBottomStyle: 'solid',
        borderBottomColor: 'transparent',
        borderRadius: radii.control,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
    },
    selected: {
        background: colors.accentBg,
        borderBottomColor: 'transparent',
        color: '#ffffff',
        outline: `1px solid ${colors.accentBorder}`,
        outlineOffset: -1,
    },
    iconButton: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '1px 4px',
        fontSize: 14,
        opacity: 0.8,
        color: 'inherit',
        borderRadius: radii.control,
    },
};

export const menu: MenuStyles = {
    container: {
        ...panelFrame,
        position: 'fixed',
        zIndex: 50,
        minWidth: 'auto',
        width: 'max-content',
        maxWidth: 'min(240px, calc(100vw - 16px))',
        background: 'rgba(13, 19, 30, 0.94)',
        borderRadius: radii.card,
        padding: 4,
    },
    item: {
        width: '100%',
        textAlign: 'left',
        padding: '7px 10px',
        background: 'transparent',
        border: 'none',
        color: colors.text,
        fontSize: fonts.size,
        fontFamily: fonts.family,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        outline: 'none',
        borderRadius: radii.control,
    },
    danger: {
        color: colors.danger,
    },
};

export const toolbar: ToolbarStyles = {
    panel: {
        ...panelFrame,
        position: 'absolute',
        top: 12,
        left: '232px',
        display: 'flex',
        gap: 4,
        padding: 4,
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
        ...nestedSurface,
        marginBottom: 4,
        background: 'rgba(25, 35, 51, 0.9)',
        padding: 8,
        borderColor: colors.borderLight,
    },
};

export const ui: UtilityStyles = {
    secondaryPanel: {
        ...nestedSurface,
        padding: 6,
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
        fontFamily: fonts.mono,
    },
};

export const popup: PopupStyles = {
    modal: {
        ...base.panel,
        position: 'absolute',
        top: '50vh',
        left: '50vw',
        transform: 'translate(-50%, -50%)',
        zIndex: 30,
    },
};
