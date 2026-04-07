// Quake .map parser
// Converts Quake brush-based maps to react-three-game prefab format

import { Vector3 } from "three";

interface Point3D {
  points: [number, number, number][];
  texture: string;
  xOffset: number;
  yOffset: number;
  rotation: number;
  xScale: number;
  yScale: number;
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

interface PlayerSpawn {
  position: [number, number, number];
  rotation: [number, number, number];
  priority: number;
}

interface BrushFaceGeometry {
  vertices: [number, number, number][];
  uvs: [number, number][];
  texture: string;
  minFilter: string;
  magFilter: string;
  generateMipmaps: boolean;
}

const DEFAULT_TEXTURE_TILE_SIZE = 128;
const QUAKE_CAMERA_HEIGHT = 0.72;

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

  const trailingTokens = line
    .slice(line.lastIndexOf(")") + 1)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const texture = trailingTokens[0] ?? "default";
  const xOffset = Number(trailingTokens[1] ?? 0);
  const yOffset = Number(trailingTokens[2] ?? 0);
  const rotation = Number(trailingTokens[3] ?? 0);
  const xScale = Number(trailingTokens[4] ?? 1) || 1;
  const yScale = Number(trailingTokens[5] ?? 1) || 1;

  return {
    points,
    texture,
    xOffset,
    yOffset,
    rotation,
    xScale,
    yScale,
  };
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

function convertQuakePosition(
  origin: [number, number, number],
  scale: number,
): [number, number, number] {
  return [origin[0] * scale, origin[2] * scale, -origin[1] * scale];
}

function convertQuakeYawToThree(angle: number) {
  return ((angle - 90) * Math.PI) / 180;
}

function getTextureSampling(texturePath: string) {
  if (texturePath.includes("/textures/proto32/")) {
    return {
      minFilter: "NearestFilter",
      magFilter: "NearestFilter",
      generateMipmaps: false,
    };
  }

  return {
    minFilter: "LinearFilter",
    magFilter: "NearestFilter",
    generateMipmaps: true,
  };
}

type BrushPlaneDefinition = {
  normal: Vector3;
  constant: number;
  texturePath: string;
  axisU: Vector3;
  axisV: Vector3;
  offsetU: number;
  offsetV: number;
  scaleU: number;
  scaleV: number;
};

const BRUSH_EPSILON = 1e-4;

function vectorToTuple(vector: Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function intersectThreePlanes(
  planeA: BrushPlaneDefinition,
  planeB: BrushPlaneDefinition,
  planeC: BrushPlaneDefinition,
) {
  const crossBC = new Vector3().crossVectors(planeB.normal, planeC.normal);
  const denominator = planeA.normal.dot(crossBC);

  if (Math.abs(denominator) < BRUSH_EPSILON) {
    return null;
  }

  return crossBC
    .multiplyScalar(-planeA.constant)
    .add(
      new Vector3()
        .crossVectors(planeC.normal, planeA.normal)
        .multiplyScalar(-planeB.constant),
    )
    .add(
      new Vector3()
        .crossVectors(planeA.normal, planeB.normal)
        .multiplyScalar(-planeC.constant),
    )
    .divideScalar(denominator);
}

function isInsideBrush(point: Vector3, planes: BrushPlaneDefinition[]) {
  return planes.every(
    (plane) => plane.normal.dot(point) + plane.constant <= BRUSH_EPSILON,
  );
}

function dedupePoints(points: Vector3[]) {
  return points.filter(
    (point, index) =>
      points.findIndex((candidate) => candidate.distanceToSquared(point) < BRUSH_EPSILON) ===
      index,
  );
}

function buildBrushPlanes(
  brush: BrushPlane,
  brushCenter: Vector3,
  scale: number,
): BrushPlaneDefinition[] {
  return brush.planes.flatMap((plane) => {
    if (plane.points.length < 3) return [];

    const convertedPoints = plane.points.map((point) => {
      const converted = convertQuakePosition(point, scale);
      return new Vector3(converted[0], converted[1], converted[2]).sub(brushCenter);
    });

    const axisU = convertedPoints[1].clone().sub(convertedPoints[0]);
    const axisVSeed = convertedPoints[2].clone().sub(convertedPoints[0]);
    if (axisU.lengthSq() < BRUSH_EPSILON || axisVSeed.lengthSq() < BRUSH_EPSILON) {
      return [];
    }

    let normal = new Vector3().crossVectors(axisU, axisVSeed);
    if (normal.lengthSq() < BRUSH_EPSILON) {
      return [];
    }

    normal.normalize();
    let constant = -normal.dot(convertedPoints[0]);
    if (constant > 0) {
      normal.multiplyScalar(-1);
      constant *= -1;
    }

    const normalizedAxisU = axisU.normalize();
    const normalizedAxisV = new Vector3().crossVectors(normal, normalizedAxisU).normalize();
    const rotatedAxisU = normalizedAxisU.clone().applyAxisAngle(
      normal,
      (plane.rotation * Math.PI) / 180,
    );
    const rotatedAxisV = normalizedAxisV.clone().applyAxisAngle(
      normal,
      (plane.rotation * Math.PI) / 180,
    );

    return {
      normal,
      constant,
      texturePath: textureToPath(plane.texture),
      axisU: rotatedAxisU,
      axisV: rotatedAxisV,
      offsetU: plane.xOffset,
      offsetV: plane.yOffset,
      scaleU: plane.xScale,
      scaleV: plane.yScale,
    };
  });
}

function buildBrushFaces(
  brush: BrushPlane,
  bounds: Bounds,
  scale: number,
): BrushFaceGeometry[] {
  const convertedCenter = convertQuakePosition(bounds.center, scale);
  const brushCenter = new Vector3(
    convertedCenter[0],
    convertedCenter[1],
    convertedCenter[2],
  );
  const tileWorldSize = DEFAULT_TEXTURE_TILE_SIZE * scale;
  const planes = buildBrushPlanes(brush, brushCenter, scale);

  if (planes.length < 4) {
    return [];
  }

  const intersectionPoints = dedupePoints(
    planes.flatMap((planeA, planeAIndex) =>
      planes.flatMap((planeB, planeBIndex) => {
        if (planeBIndex <= planeAIndex) return [];

        return planes.flatMap((planeC, planeCIndex) => {
          if (planeCIndex <= planeBIndex) return [];

          const point = intersectThreePlanes(planeA, planeB, planeC);
          return point && isInsideBrush(point, planes) ? [point] : [];
        });
      }),
    ),
  );

  return planes.flatMap((plane) => {
    const facePoints = dedupePoints(
      intersectionPoints.filter(
        (point) =>
          Math.abs(plane.normal.dot(point) + plane.constant) <= BRUSH_EPSILON * 10,
      ),
    );

    if (facePoints.length < 3) {
      return [];
    }

    const faceCenter = facePoints
      .reduce((acc, point) => acc.add(point), new Vector3())
      .divideScalar(facePoints.length);

    const orderedPoints = [...facePoints].sort((pointA, pointB) => {
      const offsetA = pointA.clone().sub(faceCenter);
      const offsetB = pointB.clone().sub(faceCenter);
      const angleA = Math.atan2(offsetA.dot(plane.axisV), offsetA.dot(plane.axisU));
      const angleB = Math.atan2(offsetB.dot(plane.axisV), offsetB.dot(plane.axisU));
      return angleA - angleB;
    });

    const textureSampling = getTextureSampling(plane.texturePath);

    return {
      vertices: orderedPoints.map(vectorToTuple),
      uvs: orderedPoints.map((point) => [
        point.dot(plane.axisU) / (tileWorldSize * plane.scaleU) + plane.offsetU / DEFAULT_TEXTURE_TILE_SIZE,
        point.dot(plane.axisV) / (tileWorldSize * plane.scaleV) + plane.offsetV / DEFAULT_TEXTURE_TILE_SIZE,
      ] as [number, number]),
      texture: plane.texturePath,
      minFilter: textureSampling.minFilter,
      magFilter: textureSampling.magFilter,
      generateMipmaps: textureSampling.generateMipmaps,
    };
  });
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

// Convert texture name to texture path in docs/public/textures.
function textureToPath(textureName: string): string {
  const normalizedTextureName = textureName.toUpperCase();

  // Map Quake texture names to the current local texture set.
  const textureMap: Record<string, string> = {
    METAL1_3: "/textures/proto32/checkers_02.png",
    METAL2: "/textures/proto32/grey_dark.png",
    METAL1: "/textures/proto32/grey_dark.png",
    METAL: "/textures/proto32/grey.png",

    FLOOR: "/textures/floor/terrain/checkerboard.jpg",
    GROUND: "/textures/floor/terrain/dirt-512.jpg",
    ROCK: "/textures/floor/terrain/rock-512.jpg",
    STONE: "/textures/floor/terrain/rock-512.jpg",
    GRASS: "/textures/floor/terrain/grass-512.jpg",
    SAND: "/textures/floor/terrain/sand-512.jpg",
    SNOW: "/textures/floor/terrain/snow-512.jpg",

    WALL: "/textures/proto32/grey.png",
    BRICK: "/textures/proto32/red_carmine.png",

    DOOR: "/textures/proto32/orange.png",
    CEIL: "/textures/proto32/white.png",
    SKY: "/textures/skybox/skybox1.jpg",

    WATER: "/textures/water1.png",
    LAVA: "/textures/proto32/orange_ochre.png",
    SLIME: "/textures/proto32/green_lime.png",

    TRIGGER: "/textures/proto32/trigger.png",
  };

  for (const [key, path] of Object.entries(textureMap)) {
    if (normalizedTextureName.includes(key)) {
      return path;
    }
  }

  return "/textures/proto32/grey.png";
}

export function quakeMapToPrefab(entities: Entity[], scale = 0.03) {
  const children: any[] = [];
  let brushId = 0;
  let playerSpawn: PlayerSpawn | null = null;

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
        const faces = buildBrushFaces(brush, bounds, scale);
        if (faces.length === 0) return;

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
            quakebrush: {
              type: "QuakeBrush",
              properties: {
                faces,
                roughness: 0.8,
                side: "DoubleSide",
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
    } else if (
      entity.classname === "info_player_deathmatch" ||
      entity.classname === "info_player_start"
    ) {
      const priority = entity.classname === "info_player_deathmatch" ? 2 : 1;
      if (playerSpawn && playerSpawn.priority >= priority) return;

      const originValues = entity.properties.origin
        ?.split(" ")
        .map(Number) as [number, number, number] | undefined;
      const angle = Number(entity.properties.angle ?? 0);
      const spawnPosition = convertQuakePosition(originValues ?? [0, 0, 0], scale);

      playerSpawn = {
        position: [
          spawnPosition[0],
          spawnPosition[1] + QUAKE_CAMERA_HEIGHT,
          spawnPosition[2],
        ],
        rotation: [0, convertQuakeYawToThree(angle), 0],
        priority,
      };
    }
  });

  if (playerSpawn) {
    const spawn = playerSpawn as PlayerSpawn;

    children.push({
      id: "player-camera",
      components: {
        transform: {
          type: "Transform",
          properties: {
            position: spawn.position,
            rotation: spawn.rotation,
          },
        },
        camera: {
          type: "Camera",
          properties: {},
        },
      },
    });
  }

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
