import { Component } from "./ComponentRegistry";
import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { DirectionalLight, Object3D, Vector3 } from "three";
import { Input, Label } from "./Input";

function DirectionalLightComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    const props = {
        color: component.properties.color ?? '#ffffff',
        intensity: component.properties.intensity ?? 1.0,
        castShadow: component.properties.castShadow ?? true,
        shadowMapSize: component.properties.shadowMapSize ?? 1024,
        shadowCameraNear: component.properties.shadowCameraNear ?? 0.1,
        shadowCameraFar: component.properties.shadowCameraFar ?? 100,
        shadowCameraTop: component.properties.shadowCameraTop ?? 30,
        shadowCameraBottom: component.properties.shadowCameraBottom ?? -30,
        shadowCameraLeft: component.properties.shadowCameraLeft ?? -30,
        shadowCameraRight: component.properties.shadowCameraRight ?? 30,
        targetOffset: component.properties.targetOffset ?? [0, -5, 0]
    };

    const textInputStyle = {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(34, 211, 238, 0.3)',
        padding: '2px 4px',
        fontSize: '10px',
        color: 'rgba(165, 243, 252, 1)',
        fontFamily: 'monospace',
        outline: 'none',
    };

    const smallLabel = { display: 'block', fontSize: '8px', color: 'rgba(34, 211, 238, 0.5)', marginBottom: 2 };

    return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
            <Label>Color</Label>
            <div style={{ display: 'flex', gap: 2 }}>
                <input
                    type="color"
                    style={{ height: 20, width: 20, backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
                    value={props.color}
                    onChange={e => onUpdate({ ...component.properties, color: e.target.value })}
                />
                <input type="text" style={textInputStyle} value={props.color} onChange={e => onUpdate({ ...component.properties, color: e.target.value })} />
            </div>
        </div>
        <div>
            <Label>Intensity</Label>
            <Input step="0.1" value={props.intensity} onChange={value => onUpdate({ ...component.properties, intensity: value })} />
        </div>
        <div>
            <Label>Cast Shadow</Label>
            <input
                type="checkbox"
                style={{ height: 16, width: 16, backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(34, 211, 238, 0.3)', cursor: 'pointer' }}
                checked={props.castShadow}
                onChange={e => onUpdate({ ...component.properties, castShadow: e.target.checked })}
            />
        </div>
        <div>
            <Label>Shadow Map Size</Label>
            <Input step="256" value={props.shadowMapSize} onChange={value => onUpdate({ ...component.properties, shadowMapSize: value })} />
        </div>
        <div style={{ borderTop: '1px solid rgba(34, 211, 238, 0.2)', paddingTop: 8, marginTop: 8 }}>
            <label style={{ display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Shadow Camera</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <div><label style={smallLabel}>Near</label><Input step="0.1" value={props.shadowCameraNear} onChange={value => onUpdate({ ...component.properties, shadowCameraNear: value })} /></div>
                <div><label style={smallLabel}>Far</label><Input step="1" value={props.shadowCameraFar} onChange={value => onUpdate({ ...component.properties, shadowCameraFar: value })} /></div>
                <div><label style={smallLabel}>Top</label><Input step="1" value={props.shadowCameraTop} onChange={value => onUpdate({ ...component.properties, shadowCameraTop: value })} /></div>
                <div><label style={smallLabel}>Bottom</label><Input step="1" value={props.shadowCameraBottom} onChange={value => onUpdate({ ...component.properties, shadowCameraBottom: value })} /></div>
                <div><label style={smallLabel}>Left</label><Input step="1" value={props.shadowCameraLeft} onChange={value => onUpdate({ ...component.properties, shadowCameraLeft: value })} /></div>
                <div><label style={smallLabel}>Right</label><Input step="1" value={props.shadowCameraRight} onChange={value => onUpdate({ ...component.properties, shadowCameraRight: value })} /></div>
            </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(34, 211, 238, 0.2)', paddingTop: 8, marginTop: 8 }}>
            <label style={{ display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Target Offset</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                <div><label style={smallLabel}>X</label><Input step="0.5" value={props.targetOffset[0]} onChange={value => onUpdate({ ...component.properties, targetOffset: [value, props.targetOffset[1], props.targetOffset[2]] })} /></div>
                <div><label style={smallLabel}>Y</label><Input step="0.5" value={props.targetOffset[1]} onChange={value => onUpdate({ ...component.properties, targetOffset: [props.targetOffset[0], value, props.targetOffset[2]] })} /></div>
                <div><label style={smallLabel}>Z</label><Input step="0.5" value={props.targetOffset[2]} onChange={value => onUpdate({ ...component.properties, targetOffset: [props.targetOffset[0], props.targetOffset[1], value] })} /></div>
            </div>
        </div>
    </div>;
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
