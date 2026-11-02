'use client';

import { registerComponent, PrefabEditorMode, type Prefab } from 'react-three-game/viewer';
import { PrefabEditor } from 'react-three-game/editor';
import { BASE_PATH } from '../../basePath';
import ParkourHUD from './components/ParkourHUD';
import course from '../../../public/prefabs/parkour-course.json';
import { CharacterComponent } from './components/CharacterComponent';
import { CharacterPartComponent, CharacterVisualsComponent } from './components/CharacterVisuals';
import { CollisionSurfaceComponent } from './components/CollisionSurfaceComponent';
import { ConcreteSurfaceComponent } from './components/ConcreteSurfaceComponent';
import WeatheredGeometryComponent from './components/WeatheredGeometryComponent';

registerComponent(CharacterComponent);
registerComponent(CharacterVisualsComponent);
registerComponent(CharacterPartComponent);
registerComponent(CollisionSurfaceComponent);
registerComponent(ConcreteSurfaceComponent);
registerComponent(WeatheredGeometryComponent);

export default function ParkourPage() {
    return <main style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#18180f', color: '#ddd7bd' }}>
        <div id="parkour-canvas" style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <ParkourHUD>
                <PrefabEditor prefab={course as Prefab} mode={PrefabEditorMode.Play} basePath={BASE_PATH} />
            </ParkourHUD>
        </div>
    </main>;
}
