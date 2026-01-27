// Quake .map parser
// Converts Quake brush-based maps to react-three-game prefab format

interface Point3D {
  points: [number, number, number][];
  texture: string;
}

interface BrushPlane {
  planes: Point3D[];
}

interface Entity {
  classname: string;
  brushes: BrushPlane[];
  properties: Record<string, string>;
}

interface Bounds {
  center: [number, number, number];
  size: [number, number, number];
}

/**
 * Parse a Quake .map file
 * Format: Each brush is a convex polyhedron defined by planes
 * ( x1 y1 z1 ) ( x2 y2 z2 ) ( x3 y3 z3 ) TEXTURE xoffset yoffset rotation xscale yscale
 */
function parsePlane(line: string): Point3D {
  // Extract three points that define the plane
  const pointRegex = /\(\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\)/g;
  const points: [number, number, number][] = [];
  let match;

  while ((match = pointRegex.exec(line)) !== null) {
    points.push([
      parseFloat(match[1]),
      parseFloat(match[2]),
      parseFloat(match[3]),
    ]);
  }

  // Extract texture name
  const textureMatch = line.match(/\)\s+(\w+)/);
  const texture = textureMatch ? textureMatch[1] : "default";

  return { points, texture };
}

function calculateBrushBounds(planes: Point3D[]): Bounds {
  // Find AABB (axis-aligned bounding box) from plane points
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  planes.forEach((plane) => {
    plane.points.forEach(([x, y, z]) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    });
  });

  return {
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    size: [maxX - minX, maxY - minY, maxZ - minZ],
  };
}

export function parseQuakeMap(mapText: string): Entity[] {
  const lines = mapText.split("\n");
  const entities: Entity[] = [];
  let currentEntity: Entity | null = null;
  let currentBrush: BrushPlane | null = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line || line.startsWith("//")) continue;

    if (line === "{") {
      braceDepth++;
      if (braceDepth === 1) {
        // Start of entity
        currentEntity = {
          classname: "unknown",
          brushes: [],
          properties: {},
        };
      } else if (braceDepth === 2) {
        // Start of brush
        currentBrush = { planes: [] };
      }
    } else if (line === "}") {
      braceDepth--;
      if (braceDepth === 1 && currentBrush && currentEntity) {
        // End of brush
        currentEntity.brushes.push(currentBrush);
        currentBrush = null;
      } else if (braceDepth === 0 && currentEntity) {
        // End of entity
        entities.push(currentEntity);
        currentEntity = null;
      }
    } else if (line.startsWith("(")) {
      // Plane definition
      if (currentBrush) {
        currentBrush.planes.push(parsePlane(line));
      }
    } else if (line.startsWith('"')) {
      // Property definition
      const propMatch = line.match(/"([^"]+)"\s+"([^"]*)"/);
      if (propMatch && currentEntity) {
        const [, key, value] = propMatch;
        if (key === "classname") {
          currentEntity.classname = value;
        } else {
          currentEntity.properties[key] = value;
        }
      }
    }
  }

  return entities;
}

// Convert texture name to texture path (relative to public folder or full URL)
function textureToPath(textureName: string): string {
  // Map Quake texture names to available textures
  // Using full URLs since we're loading from external server
  const textureMap: Record<string, string> = {
    // Metal textures
    METAL: "https://prnth.com/textures/GreyboxTextures/greybox_grey_solid.png",
    METAL1: "https://prnth.com/textures/GreyboxTextures/greybox_dark_solid.png",
    METAL1_3: "https://prnth.com/textures/GreyboxTextures/greybox_grey_grid.png",
    METAL2: "https://prnth.com/textures/GreyboxTextures/greybox_dark_grid.png",

    // Floor textures
    FLOOR: "https://prnth.com/textures/floor/rocks/gray_rocks_diff_1k.jpg",
    GROUND: "https://prnth.com/textures/floor/terrain/dirt-512.jpg",
    ROCK: "https://prnth.com/textures/floor/rocks2/aerial_rocks_04_diff_1k.jpg",
    STONE: "https://prnth.com/textures/floor/rocks/gray_rocks_diff_1k.jpg",

    // Wall textures
    WALL: "https://prnth.com/textures/GreyboxTextures/greybox_grey_solid_2.png",
    BRICK: "https://prnth.com/textures/prototyping_textures_32x32px/Prototype_red_32x32px.png",

    // Door/ceiling
    DOOR: "https://prnth.com/textures/GreyboxTextures/greybox_orange_solid.png",
    CEIL: "https://prnth.com/textures/GreyboxTextures/greybox_light_solid.png",
    SKY: "https://prnth.com/textures/skybox/skybox1.jpg",

    // Water/liquid
    WATER: "https://prnth.com/textures/water/water1.png",
    LAVA: "https://prnth.com/textures/prototyping_textures_32x32px/Prototype_orange_ochre_32x32px.png",
    SLIME: "https://prnth.com/textures/prototyping_textures_32x32px/Prototype_green_lime_32x32px.png",

    // Special
    TRIGGER: "https://prnth.com/textures/prototyping_textures_32x32px/Prototype_trigger_32x32px.png",
  };

  // Try to match texture name
  for (const [key, path] of Object.entries(textureMap)) {
    if (textureName.toUpperCase().includes(key)) {
      return path;
    }
  }

  // Default texture
  return "https://prnth.com/textures/GreyboxTextures/greybox_grey_solid.png";
}

export function quakeMapToPrefab(entities: Entity[], scale = 0.03) {
  const children: any[] = [];
  let brushId = 0;

  entities.forEach((entity) => {
    if (entity.classname === "worldspawn") {
      // Convert each brush to a box geometry
      entity.brushes.forEach((brush) => {
        if (brush.planes.length < 4) return; // Skip invalid brushes

        const bounds = calculateBrushBounds(brush.planes);

        // Skip very small or invalid brushes
        if (bounds.size[0] < 1 || bounds.size[1] < 1 || bounds.size[2] < 1)
          return;

        // Get primary texture from first plane
        const texture = brush.planes[0]?.texture || "default";
        const texturePath = textureToPath(texture);

        children.push({
          id: `brush-${brushId++}`,
          components: {
            transform: {
              type: "Transform",
              properties: {
                position: [
                  bounds.center[0] * scale,
                  bounds.center[2] * scale, // Swap Y and Z for Quake to Three.js
                  -bounds.center[1] * scale,
                ],
              },
            },
            geometry: {
              type: "Geometry",
              properties: {
                geometryType: "box",
                args: [
                  bounds.size[0] * scale,
                  bounds.size[2] * scale, // Swap Y and Z
                  bounds.size[1] * scale,
                ],
              },
            },
            material: {
              type: "Material",
              properties: {
                texture: texturePath,
                roughness: 0.8,
              },
            },
            physics: {
              type: "Physics",
              properties: {
                type: "fixed",
              },
            },
          },
        });
      });
    } else if (entity.classname === "info_player_start") {
      // Player spawn point - we'll use this later
      const origin =
        entity.properties.origin?.split(" ").map(parseFloat) || [0, 0, 0];
      console.log("Player spawn:", origin);
    }
  });

  // Add lighting
  children.push({
    id: "ambient-light",
    components: {
      ambientlight: {
        type: "AmbientLight",
        properties: {
          color: "#443322",
          intensity: 0.5,
        },
      },
    },
  });

  children.push({
    id: "directional-light",
    components: {
      transform: {
        type: "Transform",
        properties: { position: [10, 20, 10] },
      },
      directionallight: {
        type: "DirectionalLight",
        properties: {
          color: "#ffeecc",
          intensity: 1,
          castShadow: true,
        },
      },
    },
  });

  return {
    root: {
      id: "quake-dm1",
      children,
    },
  };
}
