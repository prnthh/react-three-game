import type { ComponentViewProps } from "../../core/ComponentRegistry.js";

import { usePrefab } from "../scene/SceneContext.js";

import { Text } from 'three-text/three/react';

import { useRef, useState, useCallback } from 'react';

import { BufferGeometry, Color, Mesh } from "three";

import { withBasePath } from "../assets/assetPaths.js";

import type { TextProperties } from "./TextComponent.js";

export default function TextComponentView({ properties, children }: ComponentViewProps<TextProperties>) {
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

