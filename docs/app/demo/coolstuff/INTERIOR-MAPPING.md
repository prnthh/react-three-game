# Interior mapping example

Open `/demo/coolstuff` and select the Interior mapping subtree. Its windows share the InteriorMap component and custom inspector with the other exhibits in one editor scene.

The component lives in `app/demo/coolstuff/components/InteriorMapComponent.tsx`. Register it before mounting a prefab:

```tsx
registerComponent(InteriorMapComponent);
```

A window node composes these components:

```json
{
  "mesh": { "type": "Mesh", "properties": { "castShadow": false } },
  "geometry": { "type": "Geometry", "properties": { "geometryType": "plane", "args": [2.4, 2.2] } },
  "interior": { "type": "InteriorMap", "properties": {
    "texture": "/textures/interiors/room-atlas.webp",
    "roomSize": [2.4, 2.2, 3],
    "color": "#ffffff"
  } }
}
```

The plane faces local +Z and the virtual room extends toward -Z. Keep room width/height equal to plane width/height. The shader intersects the view ray with the virtual room, then samples an atlas; no room geometry is created. The supplied material treats the atlas as already lit. It does not create interior shadows, collision, or volumetric furniture.

The atlas has three columns (X, Y, Z) and two rows (positive faces at the top of the image, negative faces at the bottom). The +Z tile is unused when viewing from outside. `room-atlas.svg` is the editable original; `room-atlas.webp` is the runtime texture. Regenerate it with:

```sh
node --input-type=module -e "import sharp from 'sharp'; await sharp('docs/public/textures/interiors/room-atlas.svg').webp({quality:95}).toFile('docs/public/textures/interiors/room-atlas.webp')"
```

The component supports both ordinary and instanced meshes.

Its `useSharedMaterialResource(key, create, { createInstanced })` callback creates
an instance-aware shader variant using the supplied inverse instance matrix.
Return a new material without mutating the shared source; the renderer disposes
variants when their batches unmount. Include shader inputs in the resource key.
The hook handles regrouping automatically—no `userData` marker or manual batch
invalidation is needed. Ordinary custom materials can omit this option.
