import { Component } from "./ComponentRegistry";
import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { DirectionalLight, Object3D, Vector3 } from "three";
import { FieldRenderer, FieldDefinition, Input } from "./Input";

const smallLabel = { display: 'block', fontSize: '8px', color: 'rgba(34, 211, 238, 0.5)', marginBottom: 2 } as const;

const directionalLightFields: FieldDefinition[] = [
    { name: 'color', type: 'color', label: 'Color' },
    { name: 'intensity', type: 'number', label: 'Intensity', step: 0.1, min: 0 },
    { name: 'castShadow', type: 'boolean', label: 'Cast Shadow' },
    { name: 'shadowMapSize', type: 'number', label: 'Shadow Map Size', step: 256, min: 256 },
    {
        name: '_shadowCamera',
        type: 'custom',
        label: 'Shadow Camera',
        render: ({ values, onChangeMultiple }) => (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <div>
                    <label style={smallLabel}>Near</label>
                    <Input step={0.1} value={values.shadowCameraNear ?? 0.1} onChange={v => onChangeMultiple({ shadowCameraNear: v })} />
                </div>
                <div>
                    <label style={smallLabel}>Far</label>
                    <Input step={1} value={values.shadowCameraFar ?? 100} onChange={v => onChangeMultiple({ shadowCameraFar: v })} />
                </div>
                <div>
                    <label style={smallLabel}>Top</label>
                    <Input step={1} value={values.shadowCameraTop ?? 30} onChange={v => onChangeMultiple({ shadowCameraTop: v })} />
                </div>
                <div>
                    <label style={smallLabel}>Bottom</label>
                    <Input step={1} value={values.shadowCameraBottom ?? -30} onChange={v => onChangeMultiple({ shadowCameraBottom: v })} />
                </div>
                <div>
                    <label style={smallLabel}>Left</label>
                    <Input step={1} value={values.shadowCameraLeft ?? -30} onChange={v => onChangeMultiple({ shadowCameraLeft: v })} />
                </div>
                <div>
                    <label style={smallLabel}>Right</label>
                    <Input step={1} value={values.shadowCameraRight ?? 30} onChange={v => onChangeMultiple({ shadowCameraRight: v })} />
                </div>
            </div>
        ),
    },
    {
        name: 'targetOffset',
        type: 'custom',
        label: 'Target Offset',
        render: ({ value, onChange }) => {
            const offset = value ?? [0, -5, 0];
            return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                    <div>
                        <label style={smallLabel}>X</label>
                        <Input step={0.5} value={offset[0]} onChange={v => onChange([v, offset[1], offset[2]])} />
                    </div>
                    <div>
                        <label style={smallLabel}>Y</label>
                        <Input step={0.5} value={offset[1]} onChange={v => onChange([offset[0], v, offset[2]])} />
                    </div>
                    <div>
                        <label style={smallLabel}>Z</label>
                        <Input step={0.5} value={offset[2]} onChange={v => onChange([offset[0], offset[1], v])} />
                    </div>
                </div>
            );
        },
    },
];

function DirectionalLightComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    return (
        <FieldRenderer
            fields={directionalLightFields}
            values={component.properties}
            onChange={onUpdate}
        />
    );
}

function DirectionalLightView({ properties, editMode }: { properties: any; editMode?: boolean }) {
    const color = properties.color ?? '#ffffff';
    const intensity = properties.intensity ?? 1.0;
    const castShadow = properties.castShadow ?? true;
    const shadowMapSize = properties.shadowMapSize ?? 1024;
    const shadowCameraNear = properties.shadowCameraNear ?? 0.1;
    const shadowCameraFar = properties.shadowCameraFar ?? 100;
    const shadowCameraTop = properties.shadowCameraTop ?? 30;
    const shadowCameraBottom = properties.shadowCameraBottom ?? -30;
    const shadowCameraLeft = properties.shadowCameraLeft ?? -30;
    const shadowCameraRight = properties.shadowCameraRight ?? 30;
    const targetOffset = properties.targetOffset ?? [0, -5, 0];

    const directionalLightRef = useRef<DirectionalLight>(null);
    const targetRef = useRef<Object3D>(null);

    // Set up light target reference when both refs are ready
    useEffect(() => {
        if (directionalLightRef.current && targetRef.current) {
            directionalLightRef.current.target = targetRef.current;
        }
    }, []);

    // Update target world position based on light position + offset
    useFrame(() => {
        if (!directionalLightRef.current || !targetRef.current) return;

        const lightWorldPos = new Vector3();
        directionalLightRef.current.getWorldPosition(lightWorldPos);

        // Target is positioned relative to light's world position
        targetRef.current.position.set(
            lightWorldPos.x + targetOffset[0],
            lightWorldPos.y + targetOffset[1],
            lightWorldPos.z + targetOffset[2]
        );
    });

    return (
        <>
            <directionalLight
                ref={directionalLightRef}
                color={color}
                intensity={intensity}
                castShadow={castShadow}
                shadow-mapSize-width={shadowMapSize}
                shadow-mapSize-height={shadowMapSize}
                shadow-camera-near={shadowCameraNear}
                shadow-camera-far={shadowCameraFar}
                shadow-camera-top={shadowCameraTop}
                shadow-camera-bottom={shadowCameraBottom}
                shadow-camera-left={shadowCameraLeft}
                shadow-camera-right={shadowCameraRight}
                shadow-bias={-0.001}
                shadow-normalBias={0.02}
            />
            {/* Target object - rendered declaratively in scene graph */}
            <object3D ref={targetRef} />
            {editMode && (
                <>
                    {/* Light source indicator */}
                    <mesh>
                        <sphereGeometry args={[0.3, 8, 6]} />
                        <meshBasicMaterial color={color} wireframe />
                    </mesh>
                    {/* Target indicator */}
                    <mesh position={targetOffset as [number, number, number]}>
                        <sphereGeometry args={[0.2, 8, 6]} />
                        <meshBasicMaterial color={color} wireframe opacity={0.5} transparent />
                    </mesh>
                    {/* Direction line */}
                    <line>
                        <bufferGeometry
                            onUpdate={(geo) => {
                                const points = [
                                    new Vector3(0, 0, 0),
                                    new Vector3(targetOffset[0], targetOffset[1], targetOffset[2])
                                ];
                                geo.setFromPoints(points);
                            }}
                        />
                        <lineBasicMaterial color={color} opacity={0.6} transparent />
                    </line>
                </>
            )}
        </>
    );
}

const DirectionalLightComponent: Component = {
    name: 'DirectionalLight',
    Editor: DirectionalLightComponentEditor,
    View: DirectionalLightView,
    defaultProperties: {}
};

export default DirectionalLightComponent;
