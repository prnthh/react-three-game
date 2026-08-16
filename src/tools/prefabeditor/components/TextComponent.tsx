import type { Component, ComponentEditorProps, ComponentViewProps } from "./ComponentRegistry";
import { usePrefab } from "../SceneContext";
import { ColorField, FieldGroup, NumberField, SelectField, StringField } from "./Input";
import { Text } from 'three-text/three/react';
import { useRef, useState, useCallback } from 'react';
import { BufferGeometry, Color, Mesh } from "three";
import { withBasePath } from "../utils";

type TextProperties = {
    text?: string;
    color?: string;
    font?: string;
    size?: number;
    depth?: number;
    width?: number;
    align?: 'left' | 'center' | 'right';
};

function TextComponentEditor({ properties, update }: ComponentEditorProps<TextProperties>) {
    return (
        <FieldGroup>
            <StringField
                name="text"
                label="Text"
                values={properties}
                onChange={update}
                placeholder="Enter text..."
            />
            <ColorField
                name="color"
                label="Color"
                values={properties}
                onChange={update}
            />
            <StringField
                name="font"
                label="Font"
                values={properties}
                onChange={update}
                placeholder="/fonts/NotoSans-Regular.ttf"
            />
            <NumberField
                name="size"
                label="Size"
                values={properties}
                onChange={update}
                min={0.01}
                step={0.1}
            />
            <NumberField
                name="depth"
                label="Depth"
                values={properties}
                onChange={update}
                min={0}
                step={0.1}
            />
            <NumberField
                name="width"
                label="Width"
                values={properties}
                onChange={update}
                min={0}
                step={0.5}
            />
            <SelectField
                name="align"
                label="Align"
                values={properties}
                onChange={update}
                options={[
                    { value: 'left', label: 'Left' },
                    { value: 'center', label: 'Center' },
                    { value: 'right', label: 'Right' },
                ]}
            />
        </FieldGroup>
    );
}

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
    Editor: TextComponentEditor,
    View: TextComponentView,
    defaultProperties: {
        text: 'Hello World',
        color: '#888888',
        font: '/fonts/NotoSans-Regular.ttf',
        size: 0.5,
        depth: 0,
        width: 5,
        align: 'center',
    }
};

export default TextComponent;
