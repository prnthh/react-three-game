import { Component } from "./ComponentRegistry";
import { ColorField, FieldGroup, NumberField, SelectField, StringField } from "./Input";
import { Text } from 'three-text/three/react';
import { useRef, useState, useCallback } from 'react';
import { BufferGeometry, Mesh } from "three";

// Initialize HarfBuzz path for font shaping
Text.setHarfBuzzPath('/fonts/hb.wasm');

function TextComponentEditor({
    component,
    onUpdate,
}: {
    component: any;
    onUpdate: (newProps: any) => void;
}) {
    return (
        <FieldGroup>
            <StringField
                name="text"
                label="Text"
                values={component.properties}
                onChange={onUpdate}
                placeholder="Enter text..."
            />
            <ColorField
                name="color"
                label="Color"
                values={component.properties}
                onChange={onUpdate}
            />
            <StringField
                name="font"
                label="Font"
                values={component.properties}
                onChange={onUpdate}
                placeholder="/fonts/NotoSans-Regular.ttf"
            />
            <NumberField
                name="size"
                label="Size"
                values={component.properties}
                onChange={onUpdate}
                min={0.01}
                step={0.1}
            />
            <NumberField
                name="depth"
                label="Depth"
                values={component.properties}
                onChange={onUpdate}
                min={0}
                step={0.1}
            />
            <NumberField
                name="width"
                label="Width"
                values={component.properties}
                onChange={onUpdate}
                min={0}
                step={0.5}
            />
            <SelectField
                name="align"
                label="Align"
                values={component.properties}
                onChange={onUpdate}
                options={[
                    { value: 'left', label: 'Left' },
                    { value: 'center', label: 'Center' },
                    { value: 'right', label: 'Right' },
                ]}
            />
        </FieldGroup>
    );
}

function TextComponentView({ properties, children }: { properties: any; children?: React.ReactNode }) {
    const { text = '', font, size, depth, width, align, color } = properties;
    const textContent = String(text || '');
    const meshRef = useRef<Mesh>(null);
    const [offset, setOffset] = useState<[number, number, number]>([0, 0, 0]);

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

    if (!textContent) return null;

    return (
        <group position={offset}>
            <Text
                ref={meshRef}
                font={font}
                size={size}
                depth={depth}
                layout={{ align, width }}
                color={color}
                onLoad={handleLoad}
            >
                {textContent}
            </Text>
            {children}
        </group>
    );
}

const TextComponent: Component = {
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
