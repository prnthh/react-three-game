import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';
import { useFrame, useThree } from "@react-three/fiber";
import { useContext, useEffect, useLayoutEffect, useMemo } from "react";
import { disposeAfterPrefabCompilation, registerPrefabCompilationContext } from '../rendering/compileInSlices.js';
import { registerSceneCaptureRenderer, renderToScreen } from '../rendering/sceneCapture.js';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { getSceneComponentRegistry, PrefabEditorMode, RuntimeNodeIdPrefixContext, SceneContext } from '../scene/SceneContext.js';
import { scopedNodeId } from '../scene/gameObject.js';
import { DIRECTIONAL_LIGHT_COMPONENT } from './DirectionalLightComponent.js';
import { createSunShafts } from '../rendering/sunShafts.js';
import type { DepthTexture, Object3D } from 'three';
import { RenderPipeline, type Node, type WebGPURenderer } from "three/webgpu";
import { emissive, mrt, normalView, output, pass, vec3, vec4 } from "three/tsl";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { fxaa } from "three/addons/tsl/display/FXAANode.js";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { ContactAONode } from '../rendering/ContactAONode.js';
import { installChunkOcclusion } from '../rendering/chunkOcclusion.js';

export type PostProcessingProperties = {
    ambientOcclusion: boolean;
    ambientOcclusionMode?: 'gtao' | 'contact';
    chunkOcclusion?: boolean;
    sunShaftLight?: string;
    sunShaftDensity?: number;
    ambientOcclusionIntensity: number;
    ambientOcclusionRadius: number;
    ambientOcclusionResolutionScale: number;
    ambientOcclusionSamples: number;
    bloom: boolean;
    bloomStrength: number;
    bloomRadius: number;
    bloomThreshold: number;
};

function PostProcessing({
    ambientOcclusion,
    ambientOcclusionMode,
    chunkOcclusion,
    sunShaftLight,
    sunShaftDensity = 0.002,
    ambientOcclusionIntensity,
    ambientOcclusionRadius,
    ambientOcclusionResolutionScale,
    ambientOcclusionSamples,
    bloom: bloomEnabled,
    bloomStrength,
    bloomRadius,
    bloomThreshold,
}: PostProcessingProperties) {
    const renderer = useThree(state => state.gl) as unknown as WebGPURenderer;
    const scene = useThree(state => state.scene);
    const camera = useThree(state => state.camera);
    const prefix = useContext(RuntimeNodeIdPrefixContext);
    const source = sunShaftLight ? scopedNodeId(prefix, sunShaftLight) : '';
    const { render, scenePass, dispose } = useMemo(() => {
        const value = new RenderPipeline(renderer);
        // r186 GTAO uses textureGather, which cannot read multisampled depth.
        // https://github.com/mrdoob/three.js/issues/34598
        const lights = source ? getSceneComponentRegistry(scene) : null;
        const sampleDepth = ambientOcclusion || !!sunShaftLight;
        const scenePass = pass(scene, camera, sampleDepth ? { samples: 0 } : {});
        const owned: { dispose(): void }[] = [value, scenePass];
        if (ambientOcclusion || bloomEnabled) scenePass.setMRT(mrt({ output,
            ...(ambientOcclusion && { normal: normalView }), ...(bloomEnabled && { emissive }),
        }));
        let outputNode: Node<"vec4"> = scenePass.getTextureNode("output");
        if (ambientOcclusion) {
            const depth = scenePass.getTextureNode('depth'), normal = scenePass.getTextureNode('normal');
            const resolution = Math.max(0.1, Math.min(1, ambientOcclusionResolutionScale));
            const radius = Math.max(0.001, ambientOcclusionRadius);
            const samples = Math.max(1, Math.round(ambientOcclusionSamples));
            let aoTexture;
            if (ambientOcclusionMode === 'contact' && !renderer.reversedDepthBuffer && !renderer.logarithmicDepthBuffer) {
                const contact = new ContactAONode(depth, normal, camera, radius, resolution, samples);
                owned.push(contact);
                aoTexture = contact.texture;
            } else {
                const gtao = ao(depth, normal, camera);
                gtao.resolutionScale = resolution;
                gtao.radius.value = radius;
                gtao.samples.value = samples;
                owned.push(gtao);
                aoTexture = gtao.getTextureNode();
            }
            const intensity = Math.max(0, Math.min(1, ambientOcclusionIntensity));
            const factor = aoTexture.r.mul(intensity).add(1 - intensity);
            outputNode = outputNode.mul(vec4(vec3(factor), 1));
        }
        if (bloomEnabled) {
            const bloomPass = bloom(
                scenePass.getTextureNode("emissive"),
                Math.max(0, bloomStrength),
                Math.max(0, Math.min(1, bloomRadius)),
                Math.max(0, bloomThreshold),
            );
            owned.push(bloomPass);
            outputNode = outputNode.add(bloomPass);
        }
        let smoothing: ReturnType<typeof fxaa> | null = null;
        function setOutput(node: Node<'vec4'>) {
            // FXAA wraps a composed input in an owned full-resolution RTT.
            if (smoothing) {
                if ('isRTTNode' in smoothing.textureNode) smoothing.textureNode.dispose();
                smoothing.dispose();
            }
            smoothing = sampleDepth ? fxaa(node) : null;
            value.outputNode = smoothing ?? node;
            value.needsUpdate = true;
        }
        setOutput(outputNode);
        let boundMap: DepthTexture | null = null;
        let shafts: ReturnType<typeof createSunShafts> | null = null;
        function render() {
            if (lights) {
                const light = lights.get(source, DIRECTIONAL_LIGHT_COMPONENT)?.current;
                const csm = light?.shadow.shadowNode;
                const cascade = csm instanceof CSMShadowNode ? csm : null;
                const shadow = cascade ? cascade.lights[0]?.shadow : light?.shadow;
                let owner: Object3D | null = light ?? null;
                while (owner && owner !== scene && owner.visible) owner = owner.parent;
                const map = owner === scene && light?.castShadow && light.intensity > 0 && sunShaftDensity > 0 &&
                    camera.layers.test(light.layers) && renderer.shadowMap.enabled && !renderer.logarithmicDepthBuffer &&
                    !renderer.reversedDepthBuffer ? shadow?.map?.depthTexture : null;
                const ready = map?.compareFunction != null ? map : null;
                if (ready !== boundMap) {
                    shafts?.dispose();
                    boundMap = ready;
                    shafts = ready && shadow && light ? createSunShafts(scenePass.getTextureNode('depth'), camera, light, shadow, ready) : null;
                    setOutput(shafts ? shafts.composite(outputNode) : outputNode);
                }
                if (shafts && light) {
                    shafts.maxDistance.value = cascade ? Math.max(0.01, Math.min(camera.far, cascade.maxFar) * cascade.breaks[0]) : 40;
                    shafts.lightStrength.value = sunShaftDensity * light.intensity;
                }
            }
            value.render();
        }
        function dispose() {
            if (smoothing && 'isRTTNode' in smoothing.textureNode) smoothing.textureNode.dispose();
            smoothing?.dispose();
            shafts?.dispose();
            for (let i = owned.length - 1; i >= 0; i--) owned[i].dispose();
        }
        return { render, scenePass, dispose };
    }, [ambientOcclusion, ambientOcclusionMode, ambientOcclusionIntensity, ambientOcclusionRadius, ambientOcclusionResolutionScale, ambientOcclusionSamples, bloomEnabled, bloomRadius, bloomStrength, bloomThreshold, camera, renderer, scene, source, sunShaftLight, sunShaftDensity]);
    useEffect(() => () => disposeAfterPrefabCompilation(renderer, dispose), [renderer, dispose]);
    const renderFinalFrame = useMemo(() => () => renderToScreen(renderer, render), [renderer, render]);
    useLayoutEffect(() => registerSceneCaptureRenderer(renderer, renderFinalFrame), [renderer, renderFinalFrame]);
    useLayoutEffect(() => chunkOcclusion ? installChunkOcclusion(renderer, scene, camera, scenePass.renderTarget) : undefined,
        [chunkOcclusion, renderer, scene, camera, scenePass]);
    useLayoutEffect(() => registerPrefabCompilationContext(renderer, () => {
        const target = renderer.getRenderTarget(), targets = renderer.getMRT();
        renderer.setRenderTarget(scenePass.renderTarget);
        renderer.setMRT(scenePass.getMRT());
        return () => { renderer.setRenderTarget(target); renderer.setMRT(targets); };
    }), [renderer, scenePass]);
    useFrame(renderFinalFrame, 1);
    return null;
}

function PostProcessingView({ properties }: ComponentViewProps<PostProcessingProperties>) {
    if (useContext(SceneContext)?.mode === PrefabEditorMode.Edit) return null;
    return properties.ambientOcclusion || properties.bloom || properties.chunkOcclusion || properties.sunShaftLight ? <PostProcessing {...properties} /> : null;
}
const PostProcessingComponent: Component<PostProcessingProperties> = {
    name: 'PostProcessing', slot: 'leaf', scope: 'scene', exclusive: 'postprocessing', category: 'lighting', View: PostProcessingView,
    description: 'Scene-root ambient occlusion, emissive bloom and directional sun shafts. Enabled effects run in the viewer and in editor Play mode.',
    properties: {
        ambientOcclusion: { type: 'boolean', default: false },
        ambientOcclusionMode: { type: 'select', default: 'gtao', options: [{ value: 'gtao', label: 'GTAO' }, { value: 'contact', label: 'Contact AO' }] },
        sunShaftLight: { type: 'string', default: '', description: 'Node ID of the shadow-casting directional light. Empty disables sun shafts. Cascaded lights use their nearest shadow map.' },
        sunShaftDensity: { default: 0.002, min: 0, max: 0.1, step: 0.0001, description: 'Scattering per world unit at unit sun intensity.' },
        chunkOcclusion: { type: 'boolean', default: false, description: 'Test streamed chunks against a conservative depth pre-pass of opaque boxes.' },
        ambientOcclusionIntensity: { default: 0.65, min: 0, max: 1, step: 0.05 },
        ambientOcclusionRadius: { default: 0.25, min: 0.001, step: 0.1 },
        ambientOcclusionResolutionScale: { default: 0.5, min: 0.1, max: 1, step: 0.1 },
        ambientOcclusionSamples: { default: 8, min: 1, max: 64, step: 1 },
        bloom: { type: 'boolean', default: false },
        bloomStrength: { default: 0.25, min: 0, max: 5, step: 0.05 },
        bloomRadius: { default: 0.35, min: 0, max: 1, step: 0.05 },
        bloomThreshold: { default: 0.9, min: 0, step: 0.1 },
    },
};
export default PostProcessingComponent;
