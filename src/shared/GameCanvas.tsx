import { Canvas, extend, CanvasProps } from "@react-three/fiber";
import { WebGPURenderer, MeshBasicNodeMaterial, MeshStandardNodeMaterial, SpriteNodeMaterial, PCFShadowMap } from "three/webgpu";
import { Suspense, useState } from "react";
import { WebGPURendererParameters } from "three/src/renderers/webgpu/WebGPURenderer.Nodes.js";
import { Loader } from "@react-three/drei";

// generic version
// extend(THREE as any)

extend({
    MeshBasicNodeMaterial: MeshBasicNodeMaterial,
    MeshStandardNodeMaterial: MeshStandardNodeMaterial,
    SpriteNodeMaterial: SpriteNodeMaterial,
});

interface GameCanvasProps extends Omit<CanvasProps, 'children'> {
    loader?: boolean;
    children: React.ReactNode;
    glConfig?: WebGPURendererParameters;
    canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export default function GameCanvas({ loader = false, children, glConfig, canvasRef, onCreated, ...props }: GameCanvasProps) {
    const [frameloop, setFrameloop] = useState<"never" | "always">("never");

    return <>
        <Canvas
            style={{ touchAction: 'none', userSelect: 'none' }}
            shadows={{ type: PCFShadowMap, }}
            frameloop={frameloop}
            gl={async ({ canvas }) => {
                const renderer = new WebGPURenderer({
                    canvas: canvas as HTMLCanvasElement,
                    // @ts-expect-error futuristic
                    shadowMap: true,
                    antialias: true,
                    ...glConfig,
                });
                await renderer.init().then(() => {
                    setFrameloop("always");
                });
                return renderer
            }}
            onCreated={(state) => {
                if (canvasRef) {
                    canvasRef.current = state.gl.domElement as HTMLCanvasElement;
                }
                onCreated?.(state);
            }}
            {...props}
        >
            <Suspense>
                {children}
            </Suspense>

            {loader ? <Loader /> : null}
        </Canvas>
    </>;
}
