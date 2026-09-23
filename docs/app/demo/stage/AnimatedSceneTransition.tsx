import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { useGameObject } from "react-three-game/viewer";
import { AnimationMixer, LoopOnce, type AnimationClip, type Object3D } from "three";
import type { StageScene } from "./scenes";
import type { StagePoint } from "./stage";

export type TransitionAnimationRequest = { nodeId: string; animation: string; targetScene: StageScene; spawn: StagePoint };

export default function AnimatedSceneTransition({ request, onComplete }: {
    request: TransitionAnimationRequest | null;
    onComplete: (request: TransitionAnimationRequest) => void;
}) {
    const target = useGameObject(request?.nodeId ?? "");
    const mixer = useRef<AnimationMixer | null>(null);
    useEffect(() => {
        if (!request) return;
        let animation: { root: Object3D; clip: AnimationClip } | undefined;
        target.transform?.traverse(root => {
            const clip = root.animations.find(clip => clip.name === request.animation);
            if (!animation && clip) animation = { root, clip };
        });
        if (!animation) {
            onComplete(request);
            return;
        }
        const { root, clip } = animation;
        const current = new AnimationMixer(root);
        const action = current.clipAction(clip).setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
        current.addEventListener("finished", () => onComplete(request));
        action.play();
        mixer.current = current;
        return () => {
            mixer.current = null;
            current.stopAllAction();
            current.uncacheRoot(root);
        };
    }, [target, request, onComplete]);
    useFrame((_, delta) => mixer.current?.update(delta));
    return null;
}
