"use client";

import { useMemo } from "react";
import * as THREE from "three/webgpu";
import {
    float,
    uv,
    vec3,
    smoothstep,
    uniform,
    length,
} from "three/tsl";

interface ContactShadowProps {
    opacity?: number;
    blur?: number;
    scale?: number;
    yOffset?: number;
}

const ContactShadow = ({
    opacity = 0.4,
    blur = 2.5,
    scale = 1.2,
    yOffset = 0.05,
}: ContactShadowProps) => {
    const material = useMemo(() => {
        const mat = new THREE.MeshBasicNodeMaterial();
        mat.transparent = true;
        mat.depthWrite = false;
        mat.depthTest = true;
        mat.side = THREE.DoubleSide;
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -1;
        mat.polygonOffsetUnits = -1;

        const uOpacity = uniform(opacity);
        const uBlur = uniform(blur);

        // UVs centered around origin
        const centeredUV = uv().sub(0.5).mul(2.0);

        // IMPORTANT: use functional length(), not .length()
        const dist = length(centeredUV);

        const innerRadius = float(0.0);
        const outerRadius = float(1.0);
        const blurAmount = uBlur.div(10.0);

        const alpha = smoothstep(
            outerRadius,
            innerRadius.add(blurAmount),
            dist
        ).mul(uOpacity);

        mat.colorNode = vec3(0.0, 0.0, 0.0);
        mat.opacityNode = alpha;

        return mat;
    }, [opacity, blur]);

    return (
        <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, yOffset, 0]}
            material={material}
            renderOrder={1}
        >
            <planeGeometry args={[scale, scale]} />
        </mesh>
    );
};

export default ContactShadow;
