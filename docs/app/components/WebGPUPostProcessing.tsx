import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { RenderPipeline, type Node, type WebGPURenderer } from "three/webgpu";
import { emissive, mrt, normalView, output, pass, vec3, vec4 } from "three/tsl";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { bloom } from "three/addons/tsl/display/BloomNode.js";

type WebGPUPostProcessingProps = {
    ambientOcclusion?: boolean;
    ambientOcclusionIntensity?: number;
    ambientOcclusionRadius?: number;
    ambientOcclusionResolutionScale?: number;
    ambientOcclusionSamples?: number;
    bloom?: boolean;
    bloomStrength?: number;
    bloomRadius?: number;
    bloomThreshold?: number;
};

export default function WebGPUPostProcessing({
    ambientOcclusion = true,
    ambientOcclusionIntensity = 0.65,
    ambientOcclusionRadius = 0.25,
    ambientOcclusionResolutionScale = 0.5,
    ambientOcclusionSamples = 8,
    bloom: bloomEnabled = false,
    bloomStrength = 0.25,
    bloomRadius = 0.35,
    bloomThreshold = 0.9,
}: WebGPUPostProcessingProps) {
    const renderer = useThree(state => state.gl) as unknown as WebGPURenderer;
    const scene = useThree(state => state.scene);
    const camera = useThree(state => state.camera);
    const pipeline = useMemo(() => {
        const value = new RenderPipeline(renderer);
        const scenePass = pass(scene, camera);
        scenePass.setMRT(mrt({ output, normal: normalView, emissive }));
        let outputNode: Node<"vec4"> = scenePass.getTextureNode("output");
        if (ambientOcclusion) {
            const aoPass = ao(scenePass.getTextureNode("depth"), scenePass.getTextureNode("normal"), camera);
            aoPass.resolutionScale = Math.max(0.1, Math.min(1, ambientOcclusionResolutionScale));
            aoPass.radius.value = Math.max(0.001, ambientOcclusionRadius);
            aoPass.samples.value = Math.max(1, Math.round(ambientOcclusionSamples));
            const intensity = Math.max(0, Math.min(1, ambientOcclusionIntensity));
            const factor = aoPass.getTextureNode().r.mul(intensity).add(1 - intensity);
            outputNode = outputNode.mul(vec4(vec3(factor), 1));
        }
        if (bloomEnabled) {
            outputNode = outputNode.add(bloom(
                scenePass.getTextureNode("emissive"),
                Math.max(0, bloomStrength),
                Math.max(0, Math.min(1, bloomRadius)),
                Math.max(0, bloomThreshold),
            ));
        }
        value.outputNode = outputNode;
        return value;
    }, [ambientOcclusion, ambientOcclusionIntensity, ambientOcclusionRadius, ambientOcclusionResolutionScale, ambientOcclusionSamples, bloomEnabled, bloomRadius, bloomStrength, bloomThreshold, camera, renderer, scene]);
    useEffect(() => () => pipeline.dispose(), [pipeline]);
    useFrame(() => pipeline.render(), 1);
    return null;
}
