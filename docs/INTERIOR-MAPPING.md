# Interior mapping example

Open `/demo/interior` to orbit six flat windows, change room depth, and compare ordinary and instanced rendering. `/demo/interior/editor` registers the same runtime component and its inspector in a dedicated prefab editor. The city, general viewer, and general editor do not import this example.

The component lives in `app/demo/interior/InteriorMapComponent.tsx`. Register it before mounting a prefab:

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
