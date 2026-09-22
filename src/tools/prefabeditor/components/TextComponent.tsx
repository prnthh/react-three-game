import type { Component, ComponentViewProps } from "./ComponentRegistry";

import { usePrefab } from "../SceneContext";

import { Text } from 'three-text/three/react';

import { useRef, useState, useCallback } from 'react';

import { BufferGeometry, Color, Mesh } from "three";

import { withBasePath } from "../runtimeUtils";

export type TextProperties = {
    text?: string;
    color?: string;
    font?: string;
    size?: number;
    depth?: number;
    width?: number;
    align?: 'left' | 'center' | 'right';
};

function TextComponentView({ properties, children }: ComponentViewProps<TextProperties>) {
    const { basePath } = usePrefab();
    const { text = '', font = '/fonts/NotoSans-Regular.ttf', size, depth, width, align, color } = properties;
    const textContent = String(text || '');
    const resolvedFont = font ? withBasePath(basePath, font) : font;
    const fillColor = new Color(color ?? '#888888').toArray() as [number, number, number];
    const meshRef = useRef<Mesh>(null);
    const [offset, setOffset] = useState<[number, number, number]>([0, 0, 0]);

    Text.setHarfBuzzPath(withBasePath(basePath, '/fonts/hb.wasm'));

    const handleLoad = useCallback((_geometry: BufferGeometry, info: any) => {
        if (info?.planeBounds) {
            const bounds = info.planeBounds;
            // Calculate X offset based on alignment
            let centerX = 0;
            if (align === 'center') {
                centerX = -(bounds.min.x + bounds.max.x) / 2;
            } else if (align === 'right') {
                centerX = -bounds.max.x;
            } else {
                // left alignment
                centerX = -bounds.min.x;
            }
            const centerY = -(bounds.min.y + bounds.max.y) / 2;
            setOffset([centerX, centerY, 0]);
        }
    }, [align]);

    if (!textContent) return <>{children}</>;

    return (
        <group position={offset}>
            <Text
                ref={meshRef}
                font={resolvedFont}
                size={size}
                depth={depth}
                layout={{ align, width }}
                color={fillColor}
                onLoad={handleLoad}
            >
                {textContent}
            </Text>
            {children}
        </group>
    );
}

const TextComponent: Component<TextProperties> = {
    name: 'Text',
    slot: 'object',
    renderWhenDisabled: true,
    View: TextComponentView,
    properties: {
        text: { type: 'string', default: 'Hello World' },
        color: { type: 'color', default: '#888888' },
        font: { type: 'string', default: '/fonts/NotoSans-Regular.ttf' },
        size: { default: 0.5, min: 0.01, step: 0.1 },
        depth: { default: 0, min: 0, step: 0.1 },
        width: { default: 5, min: 0, step: 0.5 },
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
