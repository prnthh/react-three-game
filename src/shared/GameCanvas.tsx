import { Canvas, extend, CanvasProps } from "@react-three/fiber";
import { WebGPURenderer, MeshBasicNodeMaterial, MeshStandardNodeMaterial, SpriteNodeMaterial, PCFShadowMap } from "three/webgpu";
import { WebGPURendererParameters } from "three/src/renderers/webgpu/WebGPURenderer.Nodes.js";
import { Loader } from "@react-three/drei";
import { installBVHRaycasting } from "./raycast";
import { AssetRuntimeProvider } from "../tools/prefabeditor/assetRuntime";
import { AudioRuntimeProvider } from "../tools/prefabeditor/AudioRuntime";

extend({
    MeshBasicNodeMaterial: MeshBasicNodeMaterial,
    MeshStandardNodeMaterial: MeshStandardNodeMaterial,
    SpriteNodeMaterial: SpriteNodeMaterial,
});

installBVHRaycasting();

export interface GameCanvasProps extends Omit<CanvasProps, 'children'> {
    loader?: boolean;
    children: React.ReactNode;
    glConfig?: WebGPURendererParameters;
}

export default function GameCanvas({ loader = false, children, glConfig, onCreated, raycaster, style, ...props }: GameCanvasProps) {
    return <>
        <Canvas
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
            raycaster={{ firstHitOnly: true, ...raycaster }}
            gl={async ({ canvas }) => {
                const renderer = new WebGPURenderer({
                    canvas: canvas as HTMLCanvasElement,
                    // @ts-expect-error futuristic
                    shadowMap: true,
                    antialias: true,
                    ...glConfig,
                });
                await renderer.init();
                return renderer;
            }}
            onCreated={onCreated}
            {...props}
        >
            <AssetRuntimeProvider>
                <AudioRuntimeProvider>
                    {children}
                </AudioRuntimeProvider>
            </AssetRuntimeProvider>

            {loader ? <Loader /> : null}
        </Canvas>
    </>;
}
