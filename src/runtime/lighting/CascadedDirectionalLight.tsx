import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeElements } from '@react-three/fiber';
import { DirectionalLight, Matrix4 } from 'three';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';

export type CascadedDirectionalLightProps = Omit<ThreeElements['directionalLight'], 'ref' | 'args'> & {
    cascades?: number;
    maxFar?: number;
    lightMargin?: number;
};

/** WebGPU directional light with camera-following shadows and owned cascade resources. */
export const CascadedDirectionalLight = forwardRef<DirectionalLight, CascadedDirectionalLightProps>(
    function CascadedDirectionalLight({ cascades = 3, maxFar = 100, lightMargin = 25, ...props }, ref) {
        const camera = useThree(state => state.camera);
        // Three keys lighting pipelines by light identity. Reconfiguration needs a new light.
        const light = useMemo(() => new DirectionalLight(), [camera, cascades, maxFar, lightMargin]);
        const node = useRef<CSMShadowNode | null>(null);
        const projection = useRef(new Matrix4());
        useImperativeHandle(ref, () => light, [light]);
        useLayoutEffect(() => {
            const csm = new CSMShadowNode(light, { cascades, maxFar, lightMargin, mode: 'practical' });
            csm.fade = true;
            light.shadow.shadowNode = csm;
            node.current = csm;
            projection.current.copy(camera.projectionMatrix);
            return () => {
                // Three's CSM dispose detaches its cascade lights but doesn't free their maps.
                csm.lights.forEach(cascade => cascade.shadow?.dispose());
                csm.dispose();
                light.dispose();
                node.current = null;
            };
        }, [light, camera, cascades, maxFar, lightMargin]);
        useFrame(() => {
            const csm = node.current;
            if (!csm?.camera) return; // Initialized by Three during shader setup.
            if (!projection.current.equals(camera.projectionMatrix)) {
                projection.current.copy(camera.projectionMatrix);
                csm.updateFrustums();
            }
            csm.lights.forEach((cascade, index) => {
                const shadow = cascade.shadow;
                if (!shadow) return;
                shadow.autoUpdate = true; // Cascade transforms follow the camera.
                shadow.bias = light.shadow.bias * (index + 1);
                shadow.normalBias = light.shadow.normalBias;
                shadow.intensity = light.shadow.intensity;
                shadow.radius = light.shadow.radius;
                shadow.mapSize.copy(light.shadow.mapSize);
            });
        });
        return <primitive object={light} {...props} castShadow shadow-autoUpdate />;
    },
);
