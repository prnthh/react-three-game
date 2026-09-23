import { SceneRuntime } from "../runtime/SceneRuntime";
import { Canvas, extend, CanvasProps } from "@react-three/fiber";
import { WebGPURenderer, MeshBasicNodeMaterial, MeshStandardNodeMaterial, SpriteNodeMaterial, PCFShadowMap } from "three/webgpu";
import { WebGPURendererParameters } from "three/src/renderers/webgpu/WebGPURenderer.Nodes.js";
import type { ColorSpace, ShadowMapType, ToneMapping } from "three";
import { Loader } from "@react-three/drei";
import { registerBuiltInComponents } from "../tools/prefabeditor/components/ComponentRegistry";
import { builtInComponents } from "../tools/prefabeditor/components";

extend({
    MeshBasicNodeMaterial: MeshBasicNodeMaterial,
    MeshStandardNodeMaterial: MeshStandardNodeMaterial,
    SpriteNodeMaterial: SpriteNodeMaterial,
});

registerBuiltInComponents(builtInComponents);

export interface GameCanvasProps extends Omit<CanvasProps, 'children'> {
    loader?: boolean;
    children: React.ReactNode;
    glConfig?: Omit<WebGPURendererParameters, 'forceWebGL' | 'getFallback'>;
    rendererConfig?: {
        outputColorSpace?: ColorSpace;
        toneMapping?: ToneMapping;
        toneMappingExposure?: number;
        shadowMapType?: ShadowMapType;
    };
}

export default function GameCanvas({ loader = false, children, glConfig, rendererConfig, onCreated, raycaster, style, ...props }: GameCanvasProps) {

    return <Canvas
        style={{
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
            WebkitTapHighlightColor: 'transparent',
            ...style,
        }}
        shadows={{ type: PCFShadowMap }}
        dpr={[1, 1.5]}
        raycaster={raycaster}
        gl={async ({ canvas }) => {
            if (!('gpu' in navigator)) throw new Error('react-three-game requires WebGPU.');
            const renderer = new WebGPURenderer({
                canvas: canvas as HTMLCanvasElement,
                antialias: true,
                ...glConfig,
            });
            if (rendererConfig?.outputColorSpace !== undefined) renderer.outputColorSpace = rendererConfig.outputColorSpace;
            if (rendererConfig?.toneMapping !== undefined) renderer.toneMapping = rendererConfig.toneMapping;
            if (rendererConfig?.toneMappingExposure !== undefined) renderer.toneMappingExposure = Math.max(0, rendererConfig.toneMappingExposure);
            if (rendererConfig?.shadowMapType !== undefined) renderer.shadowMap.type = rendererConfig.shadowMapType;
            await renderer.init();
            if (!('isWebGPUBackend' in renderer.backend) || !renderer.backend.isWebGPUBackend) {
                renderer.dispose();
                throw new Error('react-three-game requires a working WebGPU adapter.');
            }
            return renderer;
        }}
        onCreated={onCreated}
        {...props}
    >
        <SceneRuntime>{children}</SceneRuntime>

        {loader ? <Loader /> : null}
    </Canvas>;
}
