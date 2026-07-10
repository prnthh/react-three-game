import { Canvas, extend, CanvasProps } from "@react-three/fiber";
import { WebGPURenderer, MeshBasicNodeMaterial, MeshStandardNodeMaterial, SpriteNodeMaterial, PCFShadowMap } from "three/webgpu";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { WebGPURendererParameters } from "three/src/renderers/webgpu/WebGPURenderer.Nodes.js";
import { Loader } from "@react-three/drei";

extend({
    MeshBasicNodeMaterial: MeshBasicNodeMaterial,
    MeshStandardNodeMaterial: MeshStandardNodeMaterial,
    SpriteNodeMaterial: SpriteNodeMaterial,
});

export interface GameCanvasProps extends Omit<CanvasProps, 'children'> {
    loader?: boolean;
    children: React.ReactNode;
    glConfig?: WebGPURendererParameters;
}

export default function GameCanvas({ loader = false, children, glConfig, onCreated, style, ...props }: GameCanvasProps) {
    const [frameloop, setFrameloop] = useState<"never" | "always">("never");
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const createRenderer = useCallback(async ({ canvas }: Parameters<Extract<CanvasProps['gl'], (...args: any[]) => any>>[0]) => {
        const renderer = new WebGPURenderer({
            canvas: canvas as HTMLCanvasElement,
            // @ts-expect-error futuristic
            shadowMap: true,
            antialias: true,
            ...glConfig,
        });
        await renderer.init();
        if (mountedRef.current) setFrameloop("always");
        return renderer;
    }, [glConfig]);

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
            frameloop={frameloop}
            gl={createRenderer}
            onCreated={(state) => {
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
