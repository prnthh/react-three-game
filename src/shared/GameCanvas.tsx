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

export interface GameCanvasProps extends Omit<CanvasProps, 'children'> {
    loader?: boolean;
    children: React.ReactNode;
    glConfig?: WebGPURendererParameters;
    rendererConfig?: {
        outputColorSpace?: ColorSpace;
        toneMapping?: ToneMapping;
        toneMappingExposure?: number;
        shadowMapType?: ShadowMapType;
    };
}

export default function GameCanvas({ loader = false, children, glConfig, rendererConfig, onCreated, raycaster, style, ...props }: GameCanvasProps) {
    registerBuiltInComponents(builtInComponents);

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
            const renderer = new WebGPURenderer({
                canvas: canvas as HTMLCanvasElement,
                // @ts-expect-error futuristic
                shadowMap: true,
                antialias: true,
                ...glConfig,
            });
            if (rendererConfig?.outputColorSpace !== undefined) renderer.outputColorSpace = rendererConfig.outputColorSpace;
            if (rendererConfig?.toneMapping !== undefined) renderer.toneMapping = rendererConfig.toneMapping;
            if (rendererConfig?.toneMappingExposure !== undefined) renderer.toneMappingExposure = Math.max(0, rendererConfig.toneMappingExposure);
            if (rendererConfig?.shadowMapType !== undefined) renderer.shadowMap.type = rendererConfig.shadowMapType;
            await renderer.init();
            return renderer;
        }}
        onCreated={onCreated}
        {...props}
    >
        {children}

        {loader ? <Loader /> : null}
    </Canvas>;
}
