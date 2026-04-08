import { Component } from "./ComponentRegistry";
import { useRef, useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { CameraHelper, DirectionalLight, Object3D, OrthographicCamera, Vector3 } from "three";
import { FieldRenderer, FieldDefinition, NumberInput } from "./Input";

const smallLabel = { display: 'block', fontSize: '8px', color: 'rgba(34, 211, 238, 0.5)', marginBottom: 2 } as const;

const directionalLightDefaults = {
    color: '#ffffff',
    intensity: 1,
    castShadow: true,
    shadowMapSize: 1024,
    shadowCameraNear: 0.1,
    shadowCameraFar: 100,
    shadowCameraTop: 30,
    shadowCameraBottom: -30,
    shadowCameraLeft: -30,
    shadowCameraRight: 30,
    targetOffset: [0, -5, 0],
};

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
                    <NumberInput step={0.1} value={values.shadowCameraNear ?? 0.1} onChange={v => onChangeMultiple({ shadowCameraNear: v })} />
                </div>
                <div>
                    <label style={smallLabel}>Far</label>
                    <NumberInput step={1} value={values.shadowCameraFar ?? 100} onChange={v => onChangeMultiple({ shadowCameraFar: v })} />
                </div>
                <div>
                    <label style={smallLabel}>Top</label>
                    <NumberInput step={1} value={values.shadowCameraTop ?? 30} onChange={v => onChangeMultiple({ shadowCameraTop: v })} />
                </div>
                <div>
                    <label style={smallLabel}>Bottom</label>
                    <NumberInput step={1} value={values.shadowCameraBottom ?? -30} onChange={v => onChangeMultiple({ shadowCameraBottom: v })} />
                </div>
                <div>
                    <label style={smallLabel}>Left</label>
                    <NumberInput step={1} value={values.shadowCameraLeft ?? -30} onChange={v => onChangeMultiple({ shadowCameraLeft: v })} />
                </div>
                <div>
                    <label style={smallLabel}>Right</label>
                    <NumberInput step={1} value={values.shadowCameraRight ?? 30} onChange={v => onChangeMultiple({ shadowCameraRight: v })} />
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
                        <NumberInput step={0.5} value={offset[0]} onChange={v => onChange([v, offset[1], offset[2]])} />
                    </div>
                    <div>
                        <label style={smallLabel}>Y</label>
                        <NumberInput step={0.5} value={offset[1]} onChange={v => onChange([offset[0], v, offset[2]])} />
                    </div>
                    <div>
                        <label style={smallLabel}>Z</label>
                        <NumberInput step={0.5} value={offset[2]} onChange={v => onChange([offset[0], offset[1], v])} />
                    </div>
                </div>
            );
        },
    },
];

function DirectionalLightComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    const values = { ...directionalLightDefaults, ...component.properties };
    const fields = values.castShadow
        ? directionalLightFields
        : directionalLightFields.filter(field => field.name !== '_shadowCamera');

    return (
        <FieldRenderer
            fields={fields}
            values={values}
            onChange={onUpdate}
        />
    );
}

function DirectionalLightView({ properties, children, editMode, isSelected }: { properties: any; children?: React.ReactNode; editMode?: boolean; isSelected?: boolean }) {
    const merged = { ...directionalLightDefaults, ...properties };
    const color = merged.color;
    const intensity = merged.intensity;
    const castShadow = merged.castShadow;
    const shadowMapSize = merged.shadowMapSize;
    const shadowCameraNear = merged.shadowCameraNear;
    const shadowCameraFar = merged.shadowCameraFar;
    const shadowCameraTop = merged.shadowCameraTop;
    const shadowCameraBottom = merged.shadowCameraBottom;
    const shadowCameraLeft = merged.shadowCameraLeft;
    const shadowCameraRight = merged.shadowCameraRight;
    const targetOffset = merged.targetOffset;

    const directionalLightRef = useRef<DirectionalLight>(null);
    const targetRef = useRef<Object3D>(null);
    const [shadowCamera, setShadowCamera] = useState<OrthographicCamera | null>(null);
    const shadowCameraHelper = useMemo(
        () => shadowCamera ? new CameraHelper(shadowCamera) : null,
        [shadowCamera]
    );

    useEffect(() => {
        return () => {
            shadowCameraHelper?.dispose();
        };
    }, [shadowCameraHelper]);

    // Use a local target object so node transforms rotate the light direction naturally.
    useEffect(() => {
        if (directionalLightRef.current && targetRef.current) {
            directionalLightRef.current.target = targetRef.current;
            setShadowCamera(directionalLightRef.current.shadow.camera);
        }
    }, []);

    useFrame(() => {
        if (!directionalLightRef.current || !targetRef.current) return;

        directionalLightRef.current.target.updateMatrixWorld();

        if (shadowCamera && shadowCameraHelper && castShadow) {
            shadowCamera.updateProjectionMatrix();
            shadowCamera.updateMatrixWorld();
            shadowCameraHelper.update();
        }
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
            <object3D ref={targetRef} position={targetOffset as [number, number, number]} />
            {editMode && isSelected && castShadow && shadowCameraHelper && (
                <primitive object={shadowCameraHelper} />
            )}
            {editMode && isSelected && (
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
            {children}
        </>
    );
}

const DirectionalLightComponent: Component = {
    name: 'DirectionalLight',
    Editor: DirectionalLightComponentEditor,
    View: DirectionalLightView,
    defaultProperties: directionalLightDefaults
};

export default DirectionalLightComponent;
