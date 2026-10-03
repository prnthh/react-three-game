import type { Object3D } from 'three';
import { GLTFExporter, type GLTFExporterOptions } from 'three/examples/jsm/exporters/GLTFExporter.js';

/** Serialize objects; hosts own file saving, downloads, and platform image support. */
export async function exportGLBData(sceneRoot: Object3D, options: Omit<GLTFExporterOptions, 'binary'> = {}): Promise<ArrayBuffer> {
    sceneRoot.updateMatrixWorld(true);
    return new GLTFExporter().parseAsync(sceneRoot, { ...options, binary: true }) as Promise<ArrayBuffer>;
}
