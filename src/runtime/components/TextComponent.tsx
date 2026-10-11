import { lazy } from "react";
import type { Component } from "../../core/ComponentRegistry.js";

export type TextProperties = {
    text?: string;
    color?: string;
    font?: string;
    size?: number;
    depth?: number;
    width?: number;
    align?: 'left' | 'center' | 'right';
};

const TextComponentView = lazy(() => import("./TextComponentView.js"));

const TextComponent: Component<TextProperties> = {
    name: 'Text',
    renderWhenDisabled: true,
    description: "Render text at this node. Set text, font and size; use Transform to place and orient it. Size and width are in scene units.",
    slot: 'object',
    View: TextComponentView,
    properties: {
        text: { type: 'string', default: 'Hello World' },
        color: { type: 'color', default: '#888888' },
        font: { description: "Font asset path relative to basePath, or an absolute URL.", type: 'string', default: '/fonts/NotoSans-Regular.ttf' },
        size: { description: "Font size in scene units.", default: 0.5, min: 0.01, step: 0.1 },
        depth: { description: "Extrusion depth in scene units; 0 is flat text.", default: 0, min: 0, step: 0.1 },
        width: { description: "Text layout width in scene units.", default: 5, min: 0, step: 0.5 },
        align: {
            type: 'select',
            default: 'center',
            options: [
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' },
            ],
        },
    }
};

export default TextComponent;
