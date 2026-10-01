import type { Object3D } from 'three';

declare module 'three' {
    interface Object3DEventMap {
        objectchange: {};
    }
}

/** Call after external mutations. Descendants inherit transforms; ancestors may own compound geometry. */
export function notifyObjectChanged(object: Object3D, change: 'transform' | 'geometry' = 'transform') {
    const dispatch = (target: Object3D) => target.dispatchEvent({ type: 'objectchange' });
    if (change === 'transform') object.traverse(dispatch);
    else dispatch(object);
    for (let parent = object.parent; parent; parent = parent.parent) dispatch(parent);
}
