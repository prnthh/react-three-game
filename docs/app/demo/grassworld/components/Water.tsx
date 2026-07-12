import { useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Color, RepeatWrapping, Vector2, Vector3, type CubeTexture, type Mesh, type Texture } from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
    cameraPosition,
    cameraProjectionMatrix,
    cubeTexture,
    dot,
    exp,
    float,
    int,
    max,
    mix,
    normalize,
    positionView,
    positionWorld,
    pow,
    reflect,
    screenUV,
    smoothstep,
    step,
    texture,
    uniform,
    uv,
    vec3,
    viewportDepthTexture,
    viewportTexture,
} from "three/tsl";

import { withBasePath } from "../../../basePath";
import { gameTime } from "./GrassWorldRuntime";

class WaterMaterial extends MeshBasicNodeMaterial {
    readonly waterUniforms;

    constructor(normVeinWater: Texture, environment: CubeTexture) {
        super();
        this.waterUniforms = {
            uUvScale: uniform(2.7),
            uNormalScale: uniform(0.05),
            uRefractionStrength: uniform(0.1),
            uFresnelScale: uniform(0.5),
            uSpeed: uniform(0.1),
            uNoiseScrollDir: uniform(new Vector2(0.1, 0)),
            uShininess: uniform(500),
            uMinDist: uniform(0),
            uMaxDist: uniform(0),
            uSunDir: uniform(new Vector3(-1, -1, -1).normalize()),
            uSunColor: uniform(new Color(1, 0.82, 0.58)),
            uTworld: uniform(new Vector3(1, 0, 0)),
            uBworld: uniform(new Vector3(0, 0, -1)),
            uNworld: uniform(new Vector3(0, 1, 0)),
            uHighlightsGlow: uniform(4),
            uHighlightFresnelInfluence: uniform(0.35),
            uDepthDistance: uniform(20),
            uAbsorptionRGB: uniform(new Vector3(0.35, 0.1, 0.08)),
            uInscatterTint: uniform(new Color(0.0, 0.09, 0.09)),
            uInscatterStrength: uniform(0.85),
            uAbsorptionScale: uniform(15),
            uMinOpacity: uniform(0.5),
            uIsWebGPU: uniform(1),
            uHighlightsSpread: uniform(0.35),
            uDepthOpacityScale: uniform(0.1),
            uHighlightsDepthOpacityScale: uniform(0.05),
        };
        this.precision = "lowp";
        this.fog = false;

        const u = this.waterUniforms;
        const speed = gameTime.mul(u.uSpeed);
        const frequency = u.uNoiseScrollDir.mul(speed);
        const nUV1 = uv().add(frequency).mul(u.uUvScale.mul(1.37)).fract();
        const tex1 = texture(normVeinWater, nUV1);
        const tsn1 = tex1.rgb.mul(2).sub(1).normalize();
        const nUV2 = uv().sub(frequency).mul(u.uUvScale.mul(0.73)).fract();
        const tex2 = texture(normVeinWater, nUV2);
        const tsn2 = tex2.rgb.mul(2).sub(1).normalize();
        const blendedTsn = vec3(
            tsn1.z.mul(tsn2.x).add(tsn1.x.mul(tsn2.z)),
            tsn1.z.mul(tsn2.y).add(tsn1.y.mul(tsn2.z)),
            tsn1.z.mul(tsn2.z).sub(tsn1.x.mul(tsn2.x).add(tsn1.y.mul(tsn2.y))),
        ).normalize();
        const tsn = vec3(blendedTsn.xy.mul(u.uNormalScale), blendedTsn.z).normalize();
        const normal = tsn.x.mul(u.uTworld).add(tsn.y.mul(u.uBworld)).add(tsn.z.mul(u.uNworld)).normalize();

        const zNdc = viewportDepthTexture(screenUV).r;
        const isWebGL = float(1).sub(u.uIsWebGPU);
        const zNdcCompatible = zNdc.mul(2).sub(1).mul(isWebGL).add(zNdc.mul(u.uIsWebGPU));
        // three@0.184 type definitions lose the scalar proxy type through matrix.element().
        const p3z = float(cameraProjectionMatrix.element(int(3)).element(int(2)) as never);
        const p2z = float(cameraProjectionMatrix.element(int(2)).element(int(2)) as never);
        const zLinear = p3z.div(zNdcCompatible.add(p2z));
        const fragLinear = positionView.z.negate();
        const isUnderWater = step(fragLinear, zLinear);
        const waterDepth = zLinear.sub(fragLinear).div(u.uDepthDistance).clamp();

        const distortionStrength = mix(u.uRefractionStrength, u.uRefractionStrength.mul(1.5), waterDepth);
        const refractedScreenUv = screenUV.add(tsn.xy.mul(distortionStrength).mul(isUnderWater));
        const zNdcRefr = viewportDepthTexture(refractedScreenUv).r;
        const zNdcCompatibleRefr = zNdcRefr.mul(2).sub(1).mul(isWebGL).add(zNdcRefr.mul(u.uIsWebGPU));
        const zLinearRefr = p3z.div(zNdcCompatibleRefr.add(p2z));
        const isSafe = step(fragLinear, zLinearRefr);
        const waterDepthRefr = zLinearRefr.sub(fragLinear).div(u.uDepthDistance).clamp();
        const safeScreenUv = mix(screenUV, refractedScreenUv, isSafe).clamp();
        const screenColor = viewportTexture(safeScreenUv).rgb;

        const viewDir = normalize(cameraPosition.sub(positionWorld));
        const reflectVector = reflect(viewDir.negate(), normal);
        const reflectedColor = cubeTexture(environment, reflectVector);
        const cosTheta = dot(normal, viewDir).clamp();
        const f0 = float(0.02);
        const grazingAngle = float(1).sub(cosTheta);
        const grazingAnglePow5 = grazingAngle.mul(grazingAngle).mul(grazingAngle).mul(grazingAngle).mul(grazingAngle);
        const fresnelSchlick = f0.add(float(1).sub(f0).mul(grazingAnglePow5));
        const fresnelWeight = fresnelSchlick.mul(u.uFresnelScale).clamp();

        const sigma = u.uAbsorptionRGB.mul(u.uAbsorptionScale);
        const waterThickness = mix(waterDepth, waterDepthRefr, isSafe);
        const transmittance = exp(sigma.negate().mul(waterThickness) as never);
        const tintColor = u.uInscatterTint.mul(u.uInscatterStrength);
        const throughWater = mix(tintColor, screenColor, transmittance);

        const tsnHighlights = vec3(blendedTsn.xy.mul(u.uHighlightsSpread), blendedTsn.z).normalize();
        const normalHighlights = tsnHighlights.x.mul(u.uTworld).add(tsnHighlights.y.mul(u.uBworld)).add(tsnHighlights.z.mul(u.uNworld)).normalize();
        const reflectedLight = reflect(u.uSunDir, normalHighlights);
        const align = max(dot(reflectedLight, viewDir), 0);
        const spec = pow(align, u.uShininess);
        const fresnelSpecBoost = mix(1, fresnelSchlick, u.uHighlightFresnelInfluence);
        const highlightsDepthOpacity = smoothstep(0, u.uHighlightsDepthOpacityScale, waterThickness);
        const sunGlint = u.uSunColor.mul(spec.mul(u.uHighlightsGlow).mul(fresnelSpecBoost)).mul(highlightsDepthOpacity);

        const distanceXZSquared = dot(positionWorld.xz.sub(cameraPosition.xz), positionWorld.xz.sub(cameraPosition.xz));
        const distOpacity = smoothstep(u.uMinDist.mul(u.uMinDist), u.uMaxDist.mul(u.uMaxDist), distanceXZSquared).add(u.uMinOpacity).clamp();
        const depthOpacity = smoothstep(0, u.uDepthOpacityScale, waterThickness);
        const opacity = distOpacity.mul(depthOpacity).clamp();
        const shadedWater = mix(throughWater, reflectedColor, fresnelWeight);
        this.colorNode = mix(screenColor, shadedWater, opacity).add(sunGlint);
    }
}

export default function Water({ level, size }: { level: number; size: number }) {
    const surface = useRef<Mesh>(null);
    const camera = useThree((state) => state.camera);
    const scene = useThree((state) => state.scene);
    const normalTexture = useTexture(withBasePath("/grassworld/textures/water-normal.png"));
    const [environment, setEnvironment] = useState<CubeTexture | null>(null);
    useMemo(() => {
        normalTexture.wrapS = normalTexture.wrapT = RepeatWrapping;
    }, [normalTexture]);
    const material = useMemo(
        () => environment ? new WaterMaterial(normalTexture, environment) : null,
        [environment, normalTexture],
    );
    useEffect(() => () => {
        material?.dispose();
    }, [material]);
    useFrame(() => {
        const capturedEnvironment = scene.environment as CubeTexture | null;
        if (capturedEnvironment && capturedEnvironment !== environment) setEnvironment(capturedEnvironment);
        if (!surface.current) return;
        // Revo's material samples the current viewport/depth buffers. When the
        // camera intersects or passes below the single-sided surface those reads
        // become self-referential on WebGPU. Keep the shader unchanged and guard
        // the invalid camera/surface configuration at the adapter boundary.
        surface.current.visible = camera.position.y > level + 0.25;
    }, -3);
    if (!material) return null;
    return (
        <mesh ref={surface} position={[0, level, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={100}>
            <planeGeometry args={[size, size, 1, 1]} />
            <primitive object={material} attach="material" />
        </mesh>
    );
}
