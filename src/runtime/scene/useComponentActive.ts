import { useNode } from './SceneContext.js';

/** Opt into Play-mode changes only where behavior needs them. Visual mounting is independent. */
export function useComponentActive(enabled: boolean): boolean {
    const editMode = useNode(node => node.editMode);
    return enabled && !editMode;
}
