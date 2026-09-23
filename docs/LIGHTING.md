# Lighting

Use built-in `DirectionalLight`, `PointLight`, `SpotLight`, `HemisphereLight`, and `Environment` components in scene JSON. Their schemas provide editor controls.

## Shadows

Enable `castShadow` on a light and the relevant meshes. Use one primary shadow caster first; add more only when the scene needs them.

Set `shadowAutoUpdate: false` for static shadows. Refresh after changing lights, casters, or chunks:

```tsx
import { useInvalidateShadows } from 'react-three-game/viewer';

const invalidateShadows = useInvalidateShadows(); // inside a component
invalidateShadows();        // all registered lights in this game
invalidateShadows([light]); // selected Three light objects
```

Built-in lights register automatically. Custom lights use `useShadowUpdates(lightRef)`. The editor also has a refresh button. Cached shadows do not track moving objects.

For moving outdoor views, set `DirectionalLight.shadowCascades` to 2 or 3 and choose `shadowDistance`. Cascades follow the camera and update every frame. `shadowCascades: 1` uses an ordinary shadow map.

Custom R3F scenes can use `CascadedDirectionalLight` with `cascades`, `maxFar`, and ordinary light props. Keep the light and its target in the same coordinate space.

## Pavilion demo

`/demo/lights` uses `public/prefabs/light-lab.json`, one cached 1024px sun shadow, and optional three-cascade sunlight. Edit the prefab directly.

Colored lights use a demo-only budget based on range, brightness, camera distance, and viewing direction. They do not cast shadows and can illuminate through walls. Unselected lights do not illuminate the scene.

| Preset | Point / spot lights |
| --- | --- |
| Economy | 6 / 2 |
| Balanced | 12 / 4 |
| Rich | 24 / 4 |

Compare presets with the same camera, light count, animation state, and resolution. Allow shader warm-up after switching settings. CPU submit measures render submission; GPU timing measures render passes when timestamps are supported. Neither is total application latency.
