import { Component } from "./ComponentRegistry";
import { FieldRenderer, FieldDefinition } from "./Input";
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
    const fields: FieldDefinition[] = [
        {
            name: 'text',
            type: 'string',
            label: 'Text',
            placeholder: 'Enter text...',
        },
        {
            name: 'color',
            type: 'color',
            label: 'Color',
        },
        {
            name: 'font',
            type: 'string',
            label: 'Font',
            placeholder: '/fonts/NotoSans-Regular.ttf',
        },
        {
            name: 'size',
            type: 'number',
            label: 'Size',
            min: 0.01,
            step: 0.1,
        },
        {
            name: 'depth',
            type: 'number',
            label: 'Depth',
            min: 0,
            step: 0.1,
        },
        {
            name: 'width',
            type: 'number',
            label: 'Width',
            min: 0,
            step: 0.5,
        },
        {
            name: 'align',
            type: 'select',
            label: 'Align',
            options: [
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' },
            ],
        },
    ];

    return (
        <FieldRenderer
            fields={fields}
            values={component.properties}
            onChange={onUpdate}
        />
    );
}

function TextComponentView({ properties }: { properties: any }) {
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
        </group>
    );
}

const TextComponent: Component = {
    name: 'Text',
    Editor: TextComponentEditor,
    View: TextComponentView,
    nonComposable: true,
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
