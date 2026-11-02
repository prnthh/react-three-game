import { SceneRuntime } from "./SceneRuntime.js";
import { BrowserRuntime } from '../browser/index.js';
import { Canvas, extend, CanvasProps } from "@react-three/fiber";
import { WebGPURenderer, MeshBasicNodeMaterial, MeshStandardNodeMaterial, SpriteNodeMaterial } from "three/webgpu";
import { WebGPURendererParameters } from "three/src/renderers/webgpu/WebGPURenderer.Nodes.js";
import { Loader } from "@react-three/drei";
import { registerBuiltInComponents } from "./components/index.js";

extend({
    MeshBasicNodeMaterial: MeshBasicNodeMaterial,
    MeshStandardNodeMaterial: MeshStandardNodeMaterial,
    SpriteNodeMaterial: SpriteNodeMaterial,
});

registerBuiltInComponents();

export interface GameCanvasProps extends Omit<CanvasProps, 'children'> {
    loader?: boolean;
    children: React.ReactNode;
    glConfig?: Omit<WebGPURendererParameters, 'forceWebGL' | 'getFallback'>;
}

export default function GameCanvas({ loader = false, children, glConfig, onCreated, raycaster, style, ...props }: GameCanvasProps) {

    return <Canvas
        style={{
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
            WebkitTapHighlightColor: 'transparent',
            ...style,
        }}
        raycaster={raycaster}
        gl={async ({ canvas }) => {
            if (!('gpu' in navigator)) throw new Error('react-three-game requires WebGPU.');
            const renderer = new WebGPURenderer({
                canvas: canvas as HTMLCanvasElement,
                ...glConfig,
            });
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
        <BrowserRuntime><SceneRuntime>{children}</SceneRuntime></BrowserRuntime>

        {loader ? <Loader /> : null}
    </Canvas>;
}
