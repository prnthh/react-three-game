import { Component } from "./ComponentRegistry";
import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CameraHelper, DirectionalLight, Object3D, Vector3 } from "three";

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

    return <div className="flex flex-col gap-2">
        <div>
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Color</label>
            <div className="flex gap-0.5">
                <input
                    type="color"
                    className="h-5 w-5 bg-transparent border-none cursor-pointer"
                    value={props.color}
                    onChange={e => onUpdate({ ...component.properties, 'color': e.target.value })}
                />
                <input
                    type="text"
                    className="flex-1 bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                    value={props.color}
                    onChange={e => onUpdate({ ...component.properties, 'color': e.target.value })}
                />
            </div>
        </div>
        <div>
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Intensity</label>
            <input
                type="number"
                step="0.1"
                className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                value={props.intensity}
                onChange={e => onUpdate({ ...component.properties, 'intensity': parseFloat(e.target.value) })}
            />
        </div>
        <div>
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Cast Shadow</label>
            <input
                type="checkbox"
                className="h-4 w-4 bg-black/40 border border-cyan-500/30 cursor-pointer"
                checked={props.castShadow}
                onChange={e => onUpdate({ ...component.properties, 'castShadow': e.target.checked })}
            />
        </div>
        <div>
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Shadow Map Size</label>
            <input
                type="number"
                step="256"
                className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                value={props.shadowMapSize}
                onChange={e => onUpdate({ ...component.properties, 'shadowMapSize': parseFloat(e.target.value) })}
            />
        </div>
        <div className="border-t border-cyan-500/20 pt-2 mt-2">
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-1">Shadow Camera</label>
            <div className="grid grid-cols-2 gap-1">
                <div>
                    <label className="block text-[8px] text-cyan-400/50 mb-0.5">Near</label>
                    <input
                        type="number"
                        step="0.1"
                        className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                        value={props.shadowCameraNear}
                        onChange={e => onUpdate({ ...component.properties, 'shadowCameraNear': parseFloat(e.target.value) })}
                    />
                </div>
                <div>
                    <label className="block text-[8px] text-cyan-400/50 mb-0.5">Far</label>
                    <input
                        type="number"
                        step="1"
                        className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                        value={props.shadowCameraFar}
                        onChange={e => onUpdate({ ...component.properties, 'shadowCameraFar': parseFloat(e.target.value) })}
                    />
                </div>
                <div>
                    <label className="block text-[8px] text-cyan-400/50 mb-0.5">Top</label>
                    <input
                        type="number"
                        step="1"
                        className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                        value={props.shadowCameraTop}
                        onChange={e => onUpdate({ ...component.properties, 'shadowCameraTop': parseFloat(e.target.value) })}
                    />
                </div>
                <div>
                    <label className="block text-[8px] text-cyan-400/50 mb-0.5">Bottom</label>
                    <input
                        type="number"
                        step="1"
                        className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                        value={props.shadowCameraBottom}
                        onChange={e => onUpdate({ ...component.properties, 'shadowCameraBottom': parseFloat(e.target.value) })}
                    />
                </div>
                <div>
                    <label className="block text-[8px] text-cyan-400/50 mb-0.5">Left</label>
                    <input
                        type="number"
                        step="1"
                        className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                        value={props.shadowCameraLeft}
                        onChange={e => onUpdate({ ...component.properties, 'shadowCameraLeft': parseFloat(e.target.value) })}
                    />
                </div>
                <div>
                    <label className="block text-[8px] text-cyan-400/50 mb-0.5">Right</label>
                    <input
                        type="number"
                        step="1"
                        className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                        value={props.shadowCameraRight}
                        onChange={e => onUpdate({ ...component.properties, 'shadowCameraRight': parseFloat(e.target.value) })}
                    />
                </div>
            </div>
        </div>
        <div className="border-t border-cyan-500/20 pt-2 mt-2">
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-1">Target Offset</label>
            <div className="grid grid-cols-3 gap-1">
                <div>
                    <label className="block text-[8px] text-cyan-400/50 mb-0.5">X</label>
                    <input
                        type="number"
                        step="0.5"
                        className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                        value={props.targetOffset[0]}
                        onChange={e => onUpdate({
                            ...component.properties,
                            'targetOffset': [parseFloat(e.target.value), props.targetOffset[1], props.targetOffset[2]]
                        })}
                    />
                </div>
                <div>
                    <label className="block text-[8px] text-cyan-400/50 mb-0.5">Y</label>
                    <input
                        type="number"
                        step="0.5"
                        className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                        value={props.targetOffset[1]}
                        onChange={e => onUpdate({
                            ...component.properties,
                            'targetOffset': [props.targetOffset[0], parseFloat(e.target.value), props.targetOffset[2]]
                        })}
                    />
                </div>
                <div>
                    <label className="block text-[8px] text-cyan-400/50 mb-0.5">Z</label>
                    <input
                        type="number"
                        step="0.5"
                        className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                        value={props.targetOffset[2]}
                        onChange={e => onUpdate({
                            ...component.properties,
                            'targetOffset': [props.targetOffset[0], props.targetOffset[1], parseFloat(e.target.value)]
                        })}
                    />
                </div>
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

    const { scene } = useThree();
    const directionalLightRef = useRef<DirectionalLight>(null);
    const targetRef = useRef<Object3D>(new Object3D());
    const cameraHelperRef = useRef<CameraHelper | null>(null);

    // Add target to scene once
    useEffect(() => {
        const target = targetRef.current;
        scene.add(target);
        return () => {
            scene.remove(target);
        };
    }, [scene]);

    // Set up light target reference once
    useEffect(() => {
        if (directionalLightRef.current) {
            directionalLightRef.current.target = targetRef.current;
        }
    }, []);

    // Update target position and mark shadow for update when light moves or offset changes
    useFrame(() => {
        if (!directionalLightRef.current) return;

        const lightWorldPos = new Vector3();
        directionalLightRef.current.getWorldPosition(lightWorldPos);

        const newTargetPos = new Vector3(
            lightWorldPos.x + targetOffset[0],
            lightWorldPos.y + targetOffset[1],
            lightWorldPos.z + targetOffset[2]
        );

        // Only update if position actually changed
        if (!targetRef.current.position.equals(newTargetPos)) {
            targetRef.current.position.copy(newTargetPos);
            if (directionalLightRef.current.shadow) {
                directionalLightRef.current.shadow.needsUpdate = true;
            }
        }

        // Update camera helper in edit mode
        if (editMode && cameraHelperRef.current) {
            cameraHelperRef.current.update();
        }
    });

    // Create/destroy camera helper for edit mode
    useEffect(() => {
        if (editMode && directionalLightRef.current?.shadow.camera) {
            const helper = new CameraHelper(directionalLightRef.current.shadow.camera);
            cameraHelperRef.current = helper;
            scene.add(helper);

            return () => {
                if (cameraHelperRef.current) {
                    scene.remove(cameraHelperRef.current);
                    cameraHelperRef.current.dispose();
                    cameraHelperRef.current = null;
                }
            };
        }
    }, [editMode, scene]);

    return (
        <>
            <directionalLight
                ref={directionalLightRef}
                color={color}
                intensity={intensity}
                castShadow={castShadow}
                shadow-mapSize={[shadowMapSize, shadowMapSize]}
                shadow-bias={-0.001}
                shadow-normalBias={0.02}
            >
                <orthographicCamera
                    attach="shadow-camera"
                    near={shadowCameraNear}
                    far={shadowCameraFar}
                    top={shadowCameraTop}
                    bottom={shadowCameraBottom}
                    left={shadowCameraLeft}
                    right={shadowCameraRight}
                />
            </directionalLight>
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
