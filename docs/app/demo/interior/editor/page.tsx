'use client';
import { PrefabEditor, registerComponentEditor } from 'react-three-game/editor';
import { registerComponent } from 'react-three-game/viewer';
import InteriorMap from '../InteriorMapComponent';
import Inspector from '../InteriorMapComponent.editor';
import { createInteriorScene } from '../scene';
import { BASE_PATH } from '../../../basePath';
registerComponent(InteriorMap);
registerComponentEditor(InteriorMap, Inspector);
const prefab = createInteriorScene();
export default function InteriorEditor() {
    return <main className="h-screen"><PrefabEditor basePath={BASE_PATH} prefab={prefab} /></main>;
}
